import { isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { DEFAULT_EXTENSION_SETTINGS, LEGACY_SETTING_MIGRATIONS, normalizeExtensionSettings } from "../settings/extension-settings";
import { createExtensionStorage, migrateLocalStorageKey } from "../storage/extension-storage";
import { collectBatchSnapshots } from "./batch-export";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { downloadExportFiles } from "./export-downloads";
import { exportBatchSnapshots, exportSnapshot, type SnapshotExportFormat } from "../exporters/snapshot-export";
import { filterConversationNodes, getNextSearchIndex, renderNodeList, scrollNodeIntoView } from "../ui/controls/node-list";
import { openBatchExportModal, openExportModal } from "../ui/modals/export-modal";
import { attachPanelDrag } from "../ui/panel/drag";
import { createPanel, setPanelStatus } from "../ui/panel/panel";
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

async function mountPanel(): Promise<void> {
  if (!adapter || document.getElementById("ai-chat-helper-panel")) return;

  const settings = await loadSettings();
  applyPlatformSettings(settings);
  const canBatchExport = Boolean(adapter.fetchConversationList && adapter.fetchConversationDetail);
  const panel = createPanel({
    platformId: adapter.id,
    platformName: adapter.name,
    canBatchExport,
    visibleLimit: settings.visibleLimit,
    batchLimit: settings.batchLimit,
    readingLineOffset: settings.readingLineOffset,
    dotGap: settings.dotGap,
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
  const visibleLimitInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-visible-limit]");
  const batchLimitInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit]");
  const readingLineInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
  const dotGapInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-dot-gap]");
  const removeQwenAdsInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]");
  const hideDeepSeekNativeNavInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");
  let currentNodes: ConversationNode[] = [];
  let currentSearchResults: ConversationNode[] = [];
  let currentSearchIndex = -1;
  let visibleLimit = settings.visibleLimit;
  let batchLimit = settings.batchLimit;
  let readingLineOffset = settings.readingLineOffset;
  let dotGap = settings.dotGap;

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
  searchInput?.addEventListener("input", () => {
    currentSearchIndex = 0;
    renderCurrentNodes();
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
  readingLineInput?.addEventListener("change", () => {
    const nextSettings = normalizeExtensionSettings({ readingLineOffset: readingLineInput.value });
    readingLineOffset = nextSettings.readingLineOffset;
    readingLineInput.value = String(readingLineOffset);
    readingLine.style.top = `${readingLineOffset}px`;
    renderCurrentNodes();
    void settingsStorage.set("readingLineOffset", readingLineOffset).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
  });
  dotGapInput?.addEventListener("change", () => {
    const nextSettings = normalizeExtensionSettings({ dotGap: dotGapInput.value });
    dotGap = nextSettings.dotGap;
    dotGapInput.value = String(dotGap);
    renderCurrentNodes();
    void settingsStorage.set("dotGap", dotGap).catch((error) => {
      console.error("[AI Chat Helper] settings save failed", error);
      setPanelStatus(panel, `Settings save failed: ${getErrorMessage(error)}`);
    });
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

  function jumpToSearchResult(direction: 1 | -1): void {
    currentSearchIndex = getNextSearchIndex(currentSearchIndex, currentSearchResults.length, direction);
    updateSearchStatus(searchStatus, currentSearchIndex, currentSearchResults.length);
    const node = currentSearchIndex >= 0 ? currentSearchResults[currentSearchIndex] : null;
    if (node) scrollNodeIntoView(node, readingLineOffset);
  }
}

function updateSearchStatus(status: HTMLElement | null, index: number, count: number): void {
  if (!status) return;
  status.textContent = count > 0 && index >= 0 ? `${index + 1}/${count}` : "0/0";
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
