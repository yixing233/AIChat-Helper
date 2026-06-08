import { isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { DEFAULT_EXTENSION_SETTINGS, LEGACY_SETTING_MIGRATIONS, normalizeExtensionSettings } from "../settings/extension-settings";
import { createExtensionStorage, migrateLocalStorageKey } from "../storage/extension-storage";
import { collectBatchSnapshots } from "./batch-export";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { downloadExportFiles } from "./export-downloads";
import {
  getUpdateLogEntriesBetweenVersions,
  parseScriptVersionFromSource,
  summarizeVersionCheck,
  type ChangelogEntry
} from "./version-check";
import { exportBatchSnapshots, exportSnapshot, type SnapshotExportFormat } from "../exporters/snapshot-export";
import { filterConversationNodes, getNextSearchIndex, renderNodeList, scrollNodeIntoView } from "../ui/controls/node-list";
import { openBatchExportModal, openExportModal } from "../ui/modals/export-modal";
import { openVersionUpdateModal } from "../ui/modals/version-update-modal";
import { attachPanelDrag } from "../ui/panel/drag";
import { createPanel, setPanelStatus, setPanelVersionUpdateBadge } from "../ui/panel/panel";
import type { ConversationNode, ConversationSummary } from "../shared/types";

function injectPageHooks(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/page-hooks.js");
  script.async = false;
  script.dataset.aiChatHelper = "page-hooks";
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

const adapter = getPlatformAdapter(new URL(window.location.href));
const capturedEvents = createCapturedEventBuffer();
const settingsStorage = createExtensionStorage("settings");
const PROJECT_REPO_URL = "https://github.com/yixing233/AIChat-Helper";
const SCRIPT_UPDATE_URL = "https://raw.githubusercontent.com/yixing233/AIChat-Helper/master/AIChat-Helper.user.js";
const SCRIPT_CHANGELOG_URL = "https://raw.githubusercontent.com/yixing233/AIChat-Helper/master/update.json";
const SCRIPT_DOWNLOAD_URL = "https://github.com/yixing233/AIChat-Helper/raw/master/AIChat-Helper.user.js";

async function mountPanel(): Promise<void> {
  if (!adapter || document.getElementById("ai-chat-helper-panel")) return;

  const settings = await loadSettings();
  applyPlatformSettings(settings);
  const extensionVersion = await getExtensionVersion();
  const canBatchExport = Boolean(adapter.fetchConversationList && adapter.fetchConversationDetail);
  const panel = createPanel({
    platformId: adapter.id,
    platformName: adapter.name,
    platformIconUrl: getPlatformIconUrl(adapter.id),
    extensionVersion,
    canBatchExport,
    visibleLimit: settings.visibleLimit,
    batchLimit: settings.batchLimit,
    readingLineOffset: settings.readingLineOffset,
    dotGap: settings.dotGap,
    autoUpdateCheck: settings.autoUpdateCheck,
    removeQwenAds: settings.removeQwenAds,
    hideDeepSeekNativeNav: settings.hideDeepSeekNativeNav,
    panelPosition: settings.panelPosition
  });
  document.body.appendChild(panel);
  const dragHandle = panel.querySelector<HTMLElement>("[data-ai-chat-helper-drag-handle]");
  if (dragHandle) {
    attachPanelDrag(panel, dragHandle, (panelPosition) => {
      void settingsStorage.set("panelPosition", panelPosition).catch((error) => {
        console.error("[AI Chat Helper] panel position save failed", error);
        setPanelStatus(panel, `Panel position save failed: ${getErrorMessage(error)}`);
      });
    });
  }
  const readingLine = createReadingLine(settings.readingLineOffset);
  document.body.appendChild(readingLine);

  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  const searchInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-search]");
  const searchStatus = panel.querySelector<HTMLElement>("[data-ai-chat-helper-search-status]");
  const searchPrevButton = panel.querySelector<HTMLButtonElement>("[data-ai-chat-helper-search-prev]");
  const searchNextButton = panel.querySelector<HTMLButtonElement>("[data-ai-chat-helper-search-next]");
  const searchConfirmButton = panel.querySelector<HTMLButtonElement>("[data-ai-chat-helper-search-confirm]");
  const visibleLimitInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-visible-limit]");
  const batchLimitInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit]");
  const readingLineInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
  const dotGapInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-dot-gap]");
  const autoUpdateCheckInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-update-check]");
  const removeQwenAdsInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]");
  const hideDeepSeekNativeNavInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");
  const nodeSettingsSummary = panel.querySelector<HTMLElement>("[data-ai-chat-helper-node-settings-summary]");
  const readingLineSummary = panel.querySelector<HTMLElement>("[data-ai-chat-helper-reading-line-summary]");
  const readingLineDisplay = panel.querySelector<HTMLElement>("[data-ai-chat-helper-reading-line-display]");
  const searchTrigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-search-trigger]");
  const settingsTrigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-settings-trigger]");
  const nodeSettingsTrigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-node-settings-trigger]");
  const readingLineTrigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-reading-line-trigger]");
  const searchPopover = panel.querySelector<HTMLElement>("[data-ai-chat-helper-search-popover]");
  const searchResultsPopover = panel.querySelector<HTMLElement>("[data-ai-chat-helper-search-results-popover]");
  const settingsPopover = panel.querySelector<HTMLElement>("[data-ai-chat-helper-settings-popover]");
  const nodeSettingsPopover = panel.querySelector<HTMLElement>("[data-ai-chat-helper-node-settings-popover]");
  const readingLinePopover = panel.querySelector<HTMLElement>("[data-ai-chat-helper-reading-line-popover]");
  let currentNodes: ConversationNode[] = [];
  let currentSearchResults: ConversationNode[] = [];
  let currentSearchIndex = -1;
  let visibleLimit = settings.visibleLimit;
  let batchLimit = settings.batchLimit;
  let readingLineOffset = settings.readingLineOffset;
  let dotGap = settings.dotGap;
  let autoUpdateCheckStarted = false;

  const renderCurrentNodes = () => {
    if (!nodesContainer) return;
    currentSearchResults = filterConversationNodes(currentNodes, searchInput?.value || "");
    if (currentSearchResults.length === 0) currentSearchIndex = -1;
    else if (currentSearchIndex < 0 || currentSearchIndex >= currentSearchResults.length) currentSearchIndex = 0;
    updateSearchStatus(searchStatus, currentSearchIndex, currentSearchResults.length);
    const filteredNodes = currentSearchResults.slice(0, visibleLimit);
    const activeNodeId = currentSearchIndex >= 0 ? currentSearchResults[currentSearchIndex]?.id : undefined;
    renderNodeList(nodesContainer, filteredNodes, {
      readingLineOffset,
      dotGap,
      highlightedNodeIds: new Set(currentSearchResults.map((node) => node.id)),
      activeNodeId
    });
  };

  const refreshNodes = () => {
    currentNodes = adapter.scanDomNodes(document);
    renderCurrentNodes();
  };

  refreshNodes();
  panel.querySelector("[data-ai-chat-helper-refresh]")?.addEventListener("click", refreshNodes);
  setupPopoverInteractions();
  searchInput?.addEventListener("input", () => {
    currentSearchIndex = 0;
    renderCurrentNodes();
    if (searchResultsPopover) setPopoverOpen(searchResultsPopover, false, true);
  });
  searchConfirmButton?.addEventListener("click", () => {
    currentSearchIndex = 0;
    renderCurrentNodes();
    jumpToCurrentSearchResult();
    if (searchResultsPopover && searchConfirmButton) {
      positionPopover(searchResultsPopover, searchConfirmButton);
      setPopoverOpen(searchResultsPopover, true);
    }
  });
  searchPrevButton?.addEventListener("click", () => {
    jumpToSearchResult(-1);
  });
  searchNextButton?.addEventListener("click", () => {
    jumpToSearchResult(1);
  });
  visibleLimitInput?.addEventListener("change", () => {
    const nextSettings = normalizeExtensionSettings({ visibleLimit: visibleLimitInput.value });
    visibleLimit = nextSettings.visibleLimit;
    visibleLimitInput.value = String(visibleLimit);
    updateNodeSettingsSummary();
    renderCurrentNodes();
    void settingsStorage.set("visibleLimit", visibleLimit).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  batchLimitInput?.addEventListener("change", () => {
    const nextSettings = normalizeExtensionSettings({ batchLimit: batchLimitInput.value });
    batchLimit = nextSettings.batchLimit;
    batchLimitInput.value = String(batchLimit);
    void settingsStorage.set("batchLimit", batchLimit).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  let readingLinePreviewTimer = 0;
  const applyReadingLineInput = () => {
    if (!readingLineInput) return;
    const nextSettings = normalizeExtensionSettings({ readingLineOffset: readingLineInput.value });
    readingLineOffset = nextSettings.readingLineOffset;
    readingLineInput.value = String(readingLineOffset);
    updateReadingLineSummary();
    readingLine.style.top = `${readingLineOffset}px`;
    renderCurrentNodes();
  };
  const showReadingLinePreview = () => {
    readingLine.classList.add("is-adjusting");
    if (readingLinePreviewTimer) window.clearTimeout(readingLinePreviewTimer);
  };
  const hideReadingLinePreviewSoon = () => {
    if (readingLinePreviewTimer) window.clearTimeout(readingLinePreviewTimer);
    readingLinePreviewTimer = window.setTimeout(() => {
      readingLine.classList.remove("is-adjusting");
      readingLinePreviewTimer = 0;
    }, 700);
  };
  readingLineInput?.addEventListener("input", () => {
    showReadingLinePreview();
    applyReadingLineInput();
  });
  readingLineInput?.addEventListener("pointerdown", showReadingLinePreview);
  readingLineInput?.addEventListener("focus", showReadingLinePreview);
  readingLineInput?.addEventListener("pointerup", hideReadingLinePreviewSoon);
  readingLineInput?.addEventListener("blur", hideReadingLinePreviewSoon);
  readingLineInput?.addEventListener("change", () => {
    applyReadingLineInput();
    hideReadingLinePreviewSoon();
    void settingsStorage.set("readingLineOffset", readingLineOffset).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  dotGapInput?.addEventListener("change", () => {
    const nextSettings = normalizeExtensionSettings({ dotGap: dotGapInput.value });
    dotGap = nextSettings.dotGap;
    dotGapInput.value = String(dotGap);
    updateNodeSettingsSummary();
    renderCurrentNodes();
    void settingsStorage.set("dotGap", dotGap).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  autoUpdateCheckInput?.addEventListener("change", () => {
    const autoUpdateCheck = autoUpdateCheckInput.checked;
    void settingsStorage.set("autoUpdateCheck", autoUpdateCheck).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
    if (autoUpdateCheck) scheduleSilentUpdateCheck();
  });
  removeQwenAdsInput?.addEventListener("change", () => {
    const removeQwenAds = removeQwenAdsInput.checked;
    applyPlatformSettings({ ...settings, removeQwenAds });
    void settingsStorage.set("removeQwenAds", removeQwenAds).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  hideDeepSeekNativeNavInput?.addEventListener("change", () => {
    const hideDeepSeekNativeNav = hideDeepSeekNativeNavInput.checked;
    applyPlatformSettings({ ...settings, hideDeepSeekNativeNav });
    void settingsStorage.set("hideDeepSeekNativeNav", hideDeepSeekNativeNav).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  panel.querySelector("[data-ai-chat-helper-export]")?.addEventListener("click", () => {
    openExportModal((format) => {
      void exportCurrentConversation(format, panel);
    });
  });
  panel.querySelector("[data-ai-chat-helper-batch-export]")?.addEventListener("click", () => {
    void openRecentConversationPicker(panel, batchLimit);
  });
  panel.querySelector("[data-ai-chat-helper-version]")?.addEventListener("click", () => {
    void checkForExtensionUpdate(panel, extensionVersion);
  });
  panel.querySelector("[data-ai-chat-helper-github]")?.addEventListener("click", () => {
    window.open(PROJECT_REPO_URL, "_blank", "noopener,noreferrer");
  });
  if (settings.autoUpdateCheck) scheduleSilentUpdateCheck();

  function scheduleSilentUpdateCheck(): void {
    if (autoUpdateCheckStarted) return;
    autoUpdateCheckStarted = true;
    window.setTimeout(() => {
      void checkForExtensionUpdate(panel, extensionVersion, { silent: true });
    }, 1800);
  }

  function jumpToSearchResult(direction: 1 | -1): void {
    currentSearchIndex = getNextSearchIndex(currentSearchIndex, currentSearchResults.length, direction);
    updateSearchStatus(searchStatus, currentSearchIndex, currentSearchResults.length);
    jumpToCurrentSearchResult();
  }

  function jumpToCurrentSearchResult(): void {
    const node = currentSearchIndex >= 0 ? currentSearchResults[currentSearchIndex] : null;
    if (node) scrollNodeIntoView(node, readingLineOffset);
  }

  function updateNodeSettingsSummary(): void {
    if (nodeSettingsSummary) nodeSettingsSummary.textContent = `${dotGap} px | ${visibleLimit}`;
  }

  function updateReadingLineSummary(): void {
    if (readingLineSummary) readingLineSummary.textContent = `${readingLineOffset} px`;
    if (readingLineDisplay) readingLineDisplay.textContent = `${readingLineOffset}px`;
  }

  function setupPopoverInteractions(): void {
    const popovers = [searchPopover, searchResultsPopover, settingsPopover, nodeSettingsPopover, readingLinePopover].filter(Boolean) as HTMLElement[];

    const closePopovers = (keep: HTMLElement[] = [], immediate = false) => {
      const keepSet = new Set(keep);
      popovers.forEach((popover) => {
        if (keepSet.has(popover)) return;
        setPopoverOpen(popover, false, immediate);
      });
    };

    const togglePopover = (popover: HTMLElement | null, trigger: HTMLElement | null, keep: HTMLElement[] = []) => {
      if (!popover || !trigger) return;
      const willOpen = !popover.classList.contains("is-open");
      closePopovers(willOpen ? keep : [], willOpen);
      if (!willOpen) {
        setPopoverOpen(popover, false);
        return;
      }
      positionPopover(popover, trigger);
      setPopoverOpen(popover, true);
      if (popover === searchPopover) searchInput?.focus();
    };

    settingsTrigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePopover(settingsPopover, settingsTrigger);
    });
    searchTrigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePopover(searchPopover, searchTrigger);
    });
    nodeSettingsTrigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePopover(nodeSettingsPopover, nodeSettingsTrigger, settingsPopover ? [settingsPopover] : []);
    });
    readingLineTrigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePopover(readingLinePopover, readingLineTrigger, settingsPopover ? [settingsPopover] : []);
    });
    panel.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    window.addEventListener("pointerdown", () => {
      closePopovers();
    });
    window.addEventListener("resize", () => {
      closePopovers();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePopovers();
    });
  }
}

function updateSearchStatus(status: HTMLElement | null, index: number, count: number): void {
  if (!status) return;
  status.textContent = count > 0 && index >= 0 ? `${index + 1}/${count}` : "0/0";
}

function setPopoverOpen(popover: HTMLElement, open: boolean, immediate = false): void {
  if (!open && immediate) {
    popover.style.transition = "none";
  }
  popover.classList.toggle("is-open", open);
  popover.setAttribute("aria-hidden", open ? "false" : "true");
  if (!open && immediate) {
    void popover.offsetHeight;
    popover.style.transition = "";
  }
}

function positionPopover(popover: HTMLElement, trigger: HTMLElement): void {
  const triggerRect = trigger.getBoundingClientRect();
  const gap = 10;
  const viewportPadding = 12;
  const width = Math.max(popover.offsetWidth || 220, 180);
  const height = Math.max(popover.offsetHeight || 40, 32);
  const leftSide = triggerRect.left - width - gap;
  const rightSide = triggerRect.right + gap;
  const opensLeft = leftSide >= viewportPadding || rightSide + width > window.innerWidth - viewportPadding;
  const left = opensLeft
    ? Math.max(viewportPadding, leftSide)
    : Math.min(window.innerWidth - width - viewportPadding, rightSide);
  const centeredTop = triggerRect.top + triggerRect.height / 2 - height / 2;
  const top = Math.max(viewportPadding, Math.min(window.innerHeight - height - viewportPadding, centeredTop));

  popover.style.right = "auto";
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.transformOrigin = opensLeft ? "center right" : "center left";
}

async function loadSettings() {
  try {
    for (const [legacyKey, targetKey] of LEGACY_SETTING_MIGRATIONS) {
      await migrateLocalStorageKey(settingsStorage, legacyKey, targetKey);
    }

    const values = await Promise.all(
      Object.entries(DEFAULT_EXTENSION_SETTINGS).map(async ([key, defaultValue]) => [
        key,
        await settingsStorage.get(key, defaultValue)
      ])
    );
    return normalizeExtensionSettings(Object.fromEntries(values));
  } catch (error) {
    console.error("[AI Chat Helper] settings load failed", error);
    return DEFAULT_EXTENSION_SETTINGS;
  }
}

async function getExtensionVersion(): Promise<string> {
  const response = await sendBackgroundRequest<string>({ type: "get-version" });
  if (response.ok && response.value) return response.value;

  try {
    return chrome.runtime.getManifest().version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function checkForExtensionUpdate(
  panel: HTMLElement,
  currentVersion: string,
  options: { silent?: boolean } = {}
): Promise<void> {
  if (!options.silent) setPanelStatus(panel, "Checking for updates...");

  try {
    const latestSource = await requestRemoteText(`${SCRIPT_UPDATE_URL}?t=${Date.now()}`);
    const latestVersion = parseScriptVersionFromSource(latestSource);
    const summary = summarizeVersionCheck(currentVersion, latestVersion);

    if (!summary.hasUpdate) {
      setPanelVersionUpdateBadge(panel, "");
      if (!options.silent) setPanelStatus(panel, `Already latest version v${summary.currentVersion}.`);
      return;
    }

    setPanelVersionUpdateBadge(panel, summary.latestVersion);
    if (options.silent) return;

    setPanelStatus(panel, `New version v${summary.latestVersion} available.`);
    openVersionUpdateModal({
      currentVersion: summary.currentVersion,
      latestVersion: summary.latestVersion,
      changelogEntries: await fetchUpdateChangelog(summary.currentVersion, summary.latestVersion),
      onUpdate: () => {
        window.open(SCRIPT_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
      }
    });
  } catch (error) {
    console.warn("[AI Chat Helper] update check failed", error);
    if (!options.silent) setPanelStatus(panel, `Update check failed: ${getErrorMessage(error)}`);
  }
}

async function fetchUpdateChangelog(currentVersion: string, latestVersion: string): Promise<ChangelogEntry[]> {
  try {
    const text = await requestRemoteText(`${SCRIPT_CHANGELOG_URL}?t=${Date.now()}`);
    return getUpdateLogEntriesBetweenVersions(JSON.parse(text), currentVersion, latestVersion);
  } catch (error) {
    console.warn("[AI Chat Helper] update changelog fetch failed", error);
    return [];
  }
}

async function requestRemoteText(url: string): Promise<string> {
  const response = await sendBackgroundRequest<{
    status: number;
    statusText: string;
    text: string;
  }>({
    type: "http-request",
    payload: {
      url,
      method: "GET"
    }
  });

  if (!response.ok) throw new Error(response.error);
  if (response.value.status < 200 || response.value.status >= 300) {
    throw new Error(`HTTP ${response.value.status || "ERR"}`);
  }
  return response.value.text;
}

function applyPlatformSettings(settings: ReturnType<typeof normalizeExtensionSettings>): void {
  document.body.classList.toggle(
    "ai-chat-helper-hide-qwen-ads",
    Boolean(adapter?.id === "qwen" && settings.removeQwenAds)
  );
  document.body.classList.toggle(
    "ai-chat-helper-hide-deepseek-native-nav",
    Boolean(adapter?.id === "deepseek" && settings.hideDeepSeekNativeNav)
  );
}

function getPlatformIconUrl(platformId: string): string {
  const iconEl = document.querySelector<HTMLLinkElement>(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel*='icon']"
  );
  const href = iconEl?.href || iconEl?.getAttribute("href") || "";
  if (href) {
    try {
      return new URL(href, window.location.origin).href;
    } catch {
      // Fall back to known platform favicons below.
    }
  }

  const fallbackIcons: Record<string, string> = {
    chatgpt: "https://chatgpt.com/favicon.ico",
    qwen: "https://www.qianwen.com/favicon.ico",
    doubao: "https://www.doubao.com/favicon.ico",
    deepseek: "https://chat.deepseek.com/favicon.ico",
    claude: "https://claude.ai/favicon.ico"
  };

  return fallbackIcons[platformId] || `${window.location.origin}/favicon.ico`;
}

function createReadingLine(offset: number): HTMLElement {
  document.getElementById("ai-chat-helper-reading-line")?.remove();
  const line = document.createElement("div");
  line.id = "ai-chat-helper-reading-line";
  line.className = "ai-chat-helper-reading-line";
  line.style.top = `${offset}px`;
  line.setAttribute("aria-hidden", "true");
  return line;
}

async function exportCurrentConversation(format: SnapshotExportFormat, panel: HTMLElement): Promise<void> {
  if (!adapter) return;
  setPanelStatus(panel, "Exporting current conversation...");

  try {
    const snapshot = await createConversationSnapshot(adapter, capturedEvents.snapshot(), document);
    const files = await exportSnapshot(snapshot, format);
    await downloadExportFiles(files, sendBackgroundRequest);

    setPanelStatus(panel, "Current conversation export started.");
  } catch (error) {
    console.error("[AI Chat Helper] current export failed", error);
    setPanelStatus(panel, `Current export failed: ${getErrorMessage(error)}`);
  }
}

async function openRecentConversationPicker(panel: HTMLElement, limit: number): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  setPanelStatus(panel, "Fetching recent conversations...");

  try {
    const summaries = await adapter.fetchConversationList({ limit });
    if (!summaries.length) {
      setPanelStatus(panel, "No recent conversations found.");
      return;
    }
    openBatchExportModal(summaries, (format, selectedSummaries) => {
      void exportRecentConversations(format, panel, selectedSummaries);
    });
    setPanelStatus(panel, `Loaded ${summaries.length} recent conversations.`);
  } catch (error) {
    console.error("[AI Chat Helper] batch list failed", error);
    setPanelStatus(panel, `Batch list failed: ${getErrorMessage(error)}`);
  }
}

async function exportRecentConversations(format: SnapshotExportFormat, panel: HTMLElement, summaries: ConversationSummary[]): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  if (!summaries.length) return;
  setPanelStatus(panel, "Exporting selected conversations...");

  try {
    const result = await collectBatchSnapshots(
      summaries,
      (conversationId) => adapter.fetchConversationDetail!(conversationId),
      {
        onProgress(summary, index, total) {
          setPanelStatus(panel, `Exporting ${index + 1}/${total}: ${summary.title || summary.conversationId}`);
        },
        onFailure(summary, error) {
          console.warn("[AI Chat Helper] batch conversation export failed", summary.conversationId, error);
        }
      }
    );
    if (!result.snapshots.length) {
      setPanelStatus(panel, `Batch export failed: no selected conversations could be exported (${result.failures.length} failed).`);
      return;
    }

    const files = await exportBatchSnapshots(result.snapshots, format);
    await downloadExportFiles(files, sendBackgroundRequest);

    const failedText = result.failures.length ? ` (${result.failures.length} failed).` : ".";
    setPanelStatus(panel, `Batch export started for ${result.snapshots.length} conversations${failedText}`);
  } catch (error) {
    console.error("[AI Chat Helper] batch export failed", error);
    setPanelStatus(panel, `Batch export failed: ${getErrorMessage(error)}`);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (adapter) {
  injectPageHooks();
  document.documentElement.dataset.aiChatHelperPlatform = adapter.id;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isInjectedMessage(event.data)) return;
    if (event.data.type === "captured-network-event") {
      capturedEvents.push(event.data.payload);
    }
    console.debug("[AI Chat Helper] injected message", event.data.type);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void mountPanel();
    }, { once: true });
  } else {
    void mountPanel();
  }
}
