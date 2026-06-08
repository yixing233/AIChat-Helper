import { isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { DEFAULT_EXTENSION_SETTINGS, LEGACY_SETTING_MIGRATIONS, normalizeExtensionSettings } from "../settings/extension-settings";
import { createExtensionStorage, migrateLocalStorageKey } from "../storage/extension-storage";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { exportBatchSnapshots, exportSnapshot, type SnapshotExportFormat } from "../exporters/snapshot-export";
import { filterConversationNodes, getNextSearchIndex, renderNodeList, scrollNodeIntoView } from "../ui/controls/node-list";
import { openExportModal } from "../ui/modals/export-modal";
import { createPanel, setPanelStatus } from "../ui/panel/panel";
import type { ConversationNode } from "../shared/types";

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
    readingLineOffset: settings.readingLineOffset,
    dotGap: settings.dotGap,
    removeQwenAds: settings.removeQwenAds,
    hideDeepSeekNativeNav: settings.hideDeepSeekNativeNav
  });
  document.body.appendChild(panel);
  const readingLine = createReadingLine(settings.readingLineOffset);
  document.body.appendChild(readingLine);

  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  const searchInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-search]");
  const searchStatus = panel.querySelector<HTMLElement>("[data-ai-chat-helper-search-status]");
  const searchPrevButton = panel.querySelector<HTMLButtonElement>("[data-ai-chat-helper-search-prev]");
  const searchNextButton = panel.querySelector<HTMLButtonElement>("[data-ai-chat-helper-search-next]");
  const visibleLimitInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-visible-limit]");
  const readingLineInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
  const dotGapInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-dot-gap]");
  const removeQwenAdsInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]");
  const hideDeepSeekNativeNavInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");
  let currentNodes: ConversationNode[] = [];
  let currentSearchResults: ConversationNode[] = [];
  let currentSearchIndex = -1;
  let visibleLimit = settings.visibleLimit;
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
    openExportModal((format) => {
      void exportRecentConversations(format, panel);
    });
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

    for (const file of files) {
      await sendBackgroundRequest({
        type: "download-file",
        payload: {
          ...file,
          fileName: file.path
        }
      });
    }

    setPanelStatus(panel, "Current conversation export started.");
  } catch (error) {
    console.error("[AI Chat Helper] current export failed", error);
    setPanelStatus(panel, `Current export failed: ${getErrorMessage(error)}`);
  }
}

async function exportRecentConversations(format: SnapshotExportFormat, panel: HTMLElement): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  setPanelStatus(panel, "Fetching recent conversations...");

  try {
    const summaries = await adapter.fetchConversationList({ limit: 20 });
    const snapshots = [];

    for (const [index, summary] of summaries.entries()) {
      setPanelStatus(panel, `Exporting ${index + 1}/${summaries.length}: ${summary.title || summary.conversationId}`);
      snapshots.push(await adapter.fetchConversationDetail(summary.conversationId));
    }

    const files = await exportBatchSnapshots(snapshots, format);
    for (const file of files) {
      await sendBackgroundRequest({
        type: "download-file",
        payload: {
          ...file,
          fileName: file.path
        }
      });
    }

    setPanelStatus(panel, `Batch export started for ${snapshots.length} conversations.`);
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
