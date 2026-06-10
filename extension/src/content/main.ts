import { isContentCommandRequest, isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { createBackupStore, createConversationBackupRecord, type BackupSaveResult } from "../backup/backup-store";
import { getPlatformAdapter } from "../platforms";
import { DEFAULT_EXTENSION_SETTINGS, LEGACY_SETTING_MIGRATIONS, normalizeExtensionSettings, type ExtensionSettings } from "../settings/extension-settings";
import { createExtensionStorage, migrateLocalStorageKey } from "../storage/extension-storage";
import { createAutoBackupRunner } from "./auto-backup";
import { collectBatchSnapshots } from "./batch-export";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { downloadExportFiles } from "./export-downloads";
import { installNodeAutoRefresh } from "./node-auto-refresh";
import {
  getUpdateLogEntriesBetweenVersions,
  parseScriptVersionFromSource,
  summarizeVersionCheck,
  type ChangelogEntry
} from "./version-check";
import { exportBatchSnapshots, exportSnapshot, type SnapshotExportFormat } from "../exporters/snapshot-export";
import { IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE, type ContentCommand, type ImmediateBackupProgressPayload } from "../messaging/protocol";
import { renderNodeList, scrollNodeIntoView } from "../ui/controls/node-list";
import { openBatchExportModal, openExportModal } from "../ui/modals/export-modal";
import { openVersionUpdateModal } from "../ui/modals/version-update-modal";
import { attachPanelDrag } from "../ui/panel/drag";
import { createPanel, setPanelVersionUpdateBadge } from "../ui/panel/panel";
import { showToast } from "../ui/toast/toast";
import type { BatchConversationSelection, ConversationNode, ConversationSnapshot } from "../shared/types";
import type { ConversationSummary } from "../shared/types";

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
const backupStore = createBackupStore(createExtensionStorage("backups"));
const SCRIPT_UPDATE_URL = "https://raw.githubusercontent.com/yixing233/AIChat-Helper/master/AIChat-Helper.user.js";
const SCRIPT_CHANGELOG_URL = "https://raw.githubusercontent.com/yixing233/AIChat-Helper/master/update.json";
const SCRIPT_DOWNLOAD_URL = "https://github.com/yixing233/AIChat-Helper/raw/master/AIChat-Helper.user.js";
const immediateBackupListLimit = 10000;

interface MountedPanelContext {
  panel: HTMLElement;
  batchLimit: number;
  extensionVersion: string;
}

let mountedPanelContext: MountedPanelContext | null = null;
let mountPanelPromise: Promise<MountedPanelContext> | null = null;
let popupCommandListenerBound = false;
let immediateBackupInProgress = false;

async function mountPanel(): Promise<MountedPanelContext> {
  if (!adapter) throw new Error("当前页面不支持 AI Chat Helper");

  const existingPanel = document.getElementById("ai-chat-helper-panel");
  if (mountedPanelContext && existingPanel === mountedPanelContext.panel) return mountedPanelContext;
  if (existingPanel) {
    const settings = await loadSettings();
    applyPlatformSettings(settings);
    const existingContext: MountedPanelContext = {
      panel: existingPanel,
      batchLimit: settings.batchLimit,
      extensionVersion: await getExtensionVersion()
    };
    mountedPanelContext = existingContext;
    return existingContext;
  }

  const platformAdapter = adapter;

  const settings = await loadSettings();
  applyPlatformSettings(settings);
  const extensionVersion = await getExtensionVersion();
  const canBatchExport = Boolean(platformAdapter.fetchConversationList && platformAdapter.fetchConversationDetail);
  const panel = createPanel({
    platformId: platformAdapter.id,
    platformName: platformAdapter.name,
    platformIconUrl: getPlatformIconUrl(platformAdapter.id),
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
        showToast(`面板位置保存失败：${getErrorMessage(error)}`, {
          id: "panel-settings",
          title: "提示",
          tone: "warn"
        });
      });
    });
  }
  const readingLine = createReadingLine(settings.readingLineOffset);
  document.body.appendChild(readingLine);

  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  let currentNodes: ConversationNode[] = [];
  let activeNodeId = "";
  let currentSettings = settings;
  let visibleLimit = settings.visibleLimit;
  let batchLimit = settings.batchLimit;
  let readingLineOffset = settings.readingLineOffset;
  let dotGap = settings.dotGap;
  let autoUpdateCheckStarted = false;
  let currentNodeSignature = "";
  let currentConversationId = platformAdapter.getConversationId();
  let snapshotNodeCache: ConversationNode[] = [];
  let snapshotNodeCacheAt = 0;
  let snapshotNodeFetchPromise: Promise<ConversationNode[]> | null = null;
  const context: MountedPanelContext = {
    panel,
    batchLimit,
    extensionVersion
  };
  const autoBackupRunner = createAutoBackupRunner({
    getSettings: () => currentSettings,
    createSnapshot: () => createConversationSnapshot(platformAdapter, capturedEvents.snapshot(), document),
    exportSnapshot,
    saveRecord: (record) => backupStore.save(record),
    onStart: () => {
      showToast("自动备份中，请勿退出当前页面，图片缓存完成后会自动保存。", {
        id: "auto-backup",
        title: "自动备份",
        loading: true,
        duration: 30000
      });
    }
  });

  const renderCurrentNodes = () => {
    if (!nodesContainer) return;
    const visibleNodes = currentNodes.slice(0, visibleLimit);
    renderNodeList(nodesContainer, visibleNodes, {
      readingLineOffset,
      dotGap,
      activeNodeId,
      onNodeClick: jumpToNode
    });
  };

  const refreshNodes = (options: { force?: boolean } = {}) => {
    void refreshNodesNow(options).catch((error) => {
      console.warn("[AI Chat Helper] node refresh failed", error);
    });
  };

  const refreshNodesNow = async (options: { force?: boolean } = {}) => {
    const nextConversationId = platformAdapter.getConversationId();
    if (nextConversationId && nextConversationId !== currentConversationId) {
      currentConversationId = nextConversationId;
      currentNodes = [];
      currentNodeSignature = "";
      snapshotNodeCache = [];
      snapshotNodeCacheAt = 0;
      snapshotNodeFetchPromise = null;
    }

    const domNodes = platformAdapter.scanDomNodes(document);
    const snapshotNodes = shouldUseSnapshotNodeSource(platformAdapter.id)
      ? await getSnapshotNodeSource(options.force)
      : [];
    const hasSnapshotNodes = snapshotNodes.length > 0;
    const nextNodes = hasSnapshotNodes
      ? bindSnapshotNodesToDom(snapshotNodes, domNodes)
      : domNodes;
    const nextSignature = getNodeSignature(nextNodes);
    if (!options.force && nextSignature === currentNodeSignature) return;
    currentNodes = shouldUseSnapshotNodeSource(platformAdapter.id) && hasSnapshotNodes
      ? reindexConversationNodes(nextNodes)
      : mergeConversationNodes(currentNodes, nextNodes);
    currentNodeSignature = nextSignature;
    renderCurrentNodes();
    updateActiveNodeFromViewport();
  };

  async function getSnapshotNodeSource(force = false): Promise<ConversationNode[]> {
    const now = Date.now();
    if (snapshotNodeCache.length && !force && now - snapshotNodeCacheAt < 3500) {
      return snapshotNodeCache;
    }
    if (snapshotNodeFetchPromise) return snapshotNodeFetchPromise;

    snapshotNodeFetchPromise = (async () => {
      const snapshot = await fetchCurrentConversationSnapshotForNodes();
      const nodes = snapshot ? buildSnapshotConversationNodes(snapshot) : [];
      if (nodes.length) {
        snapshotNodeCache = nodes;
        snapshotNodeCacheAt = Date.now();
      }
      return snapshotNodeCache;
    })().finally(() => {
      snapshotNodeFetchPromise = null;
    });

    return snapshotNodeFetchPromise;
  }

  async function fetchCurrentConversationSnapshotForNodes(): Promise<ConversationSnapshot | null> {
    const events = capturedEvents.snapshot();
    if (platformAdapter.hydrateFromCapturedApi) {
      try {
        const snapshot = await platformAdapter.hydrateFromCapturedApi(events);
        if (isSnapshotForCurrentConversation(snapshot, platformAdapter.getConversationId())) return snapshot;
      } catch {
        // The userscript treats captured/API node state as best-effort and falls back while it warms up.
      }
    }

    if (platformAdapter.fetchConversationDetail) {
      try {
        const conversationId = platformAdapter.getConversationId();
        const snapshot = await platformAdapter.fetchConversationDetail(conversationId, undefined, events);
        return isSnapshotForCurrentConversation(snapshot, conversationId) ? snapshot : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  refreshNodes({ force: true });
  installNodeAutoRefresh({
    root: document.body,
    refresh: () => refreshNodes()
  });
  panel.querySelector("[data-ai-chat-helper-refresh]")?.addEventListener("click", () => refreshNodes({ force: true }));
  window.addEventListener("scroll", updateActiveNodeFromViewport, { passive: true });
  document.addEventListener("scroll", updateActiveNodeFromViewport, { passive: true, capture: true });
  let readingLinePreviewTimer = 0;
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
  bindSettingsStorageSync();
  if (settings.autoUpdateCheck) scheduleSilentUpdateCheck();
  startAutoBackupScheduler();
  panel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  mountedPanelContext = context;
  return context;

  function bindSettingsStorageSync(): void {
    chrome.storage?.onChanged?.addListener((_changes, areaName) => {
      if (areaName !== "local") return;
      void loadSettings()
        .then((nextSettings) => {
          applySettings(nextSettings);
        })
        .catch((error) => {
          console.error("[AI Chat Helper] settings sync failed", error);
          showToast(`设置同步失败：${getErrorMessage(error)}`, {
            id: "panel-settings",
            title: "提示",
            tone: "warn"
          });
        });
    });
  }

  function applySettings(nextSettings: ExtensionSettings): void {
    const normalized = normalizeExtensionSettings(nextSettings);
    const readingLineChanged = readingLineOffset !== normalized.readingLineOffset;
    const nodeLayoutChanged = visibleLimit !== normalized.visibleLimit
      || dotGap !== normalized.dotGap
      || readingLineChanged;
    const previousAutoBackupEnabled = currentSettings.autoBackupEnabled;
    const previousAutoBackupInterval = currentSettings.autoBackupIntervalMinutes;

    currentSettings = normalized;
    visibleLimit = normalized.visibleLimit;
    batchLimit = normalized.batchLimit;
    context.batchLimit = batchLimit;
    readingLineOffset = normalized.readingLineOffset;
    dotGap = normalized.dotGap;
    readingLine.style.top = `${readingLineOffset}px`;
    applyPlatformSettings(currentSettings);

    if (readingLineChanged) {
      showReadingLinePreview();
      hideReadingLinePreviewSoon();
    }
    if (nodeLayoutChanged) renderCurrentNodes();
    if (currentSettings.autoUpdateCheck) scheduleSilentUpdateCheck();
    if (
      currentSettings.autoBackupEnabled
      && (!previousAutoBackupEnabled || previousAutoBackupInterval !== currentSettings.autoBackupIntervalMinutes)
    ) {
      runAutoBackupTick(true);
    }
  }

  function scheduleSilentUpdateCheck(): void {
    if (autoUpdateCheckStarted) return;
    autoUpdateCheckStarted = true;
    window.setTimeout(() => {
      void checkForExtensionUpdate(panel, extensionVersion, { silent: true });
    }, 1800);
  }

  function startAutoBackupScheduler(): void {
    window.setInterval(() => runAutoBackupTick(), 60 * 1000);
    if (currentSettings.autoBackupEnabled) {
      window.setTimeout(() => runAutoBackupTick(true), 2500);
    }
  }

  function runAutoBackupTick(force = false): void {
    void autoBackupRunner.tick(force)
      .then((result) => {
        if (result.status !== "created") return;
        showToast(`已自动备份：${result.record.title}`, {
          id: "auto-backup",
          title: "自动备份",
          tone: "success",
          duration: 1800
        });
      })
      .catch((error) => {
        console.warn("[AI Chat Helper] automatic backup failed", error);
        showToast(`自动备份失败：${getErrorMessage(error)}`, {
          id: "auto-backup",
          title: "自动备份",
          tone: "warn"
        });
      });
  }

  function jumpToNode(node: ConversationNode): void {
    const previousActiveNodeId = activeNodeId;
    activeNodeId = node.id;
    renderCurrentNodes();

    if (platformAdapter.jumpToNode) {
      void Promise.resolve(platformAdapter.jumpToNode(node, {
        readingLineOffset,
        nodes: currentNodes,
        activeNodeId: previousActiveNodeId || null,
        root: document
      }))
        .then((handled) => {
          if (handled !== true) scrollNodeIntoView(node, readingLineOffset);
          updateActiveNodeFromViewport();
        })
        .catch((error) => {
          console.warn("[AI Chat Helper] platform node jump failed", error);
          scrollNodeIntoView(node, readingLineOffset);
          updateActiveNodeFromViewport();
        });
      return;
    }

    scrollNodeIntoView(node, readingLineOffset);
  }

  function updateActiveNodeFromViewport(): void {
    const nextActiveId = getActiveNodeIdFromViewport();
    if (!nextActiveId || nextActiveId === activeNodeId) return;
    activeNodeId = nextActiveId;
    renderCurrentNodes();
  }

  function getActiveNodeIdFromViewport(): string {
    const scrollContainer = getPrimaryScrollContainer();
    if (platformAdapter.getActiveNode) {
      const platformNode = platformAdapter.getActiveNode({
        readingLineOffset,
        nodes: currentNodes,
        activeNodeId,
        root: document,
        scrollContainer
      });
      if (platformNode?.id) return platformNode.id;
      if (currentNodes.length === 1) return currentNodes[0]?.id || "";
    }

    if (isScrollContainerNearBottom(scrollContainer, 50)) {
      return currentNodes[currentNodes.length - 1]?.id || "";
    }

    let bestNode: ConversationNode | null = null;
    let bestDistance = Infinity;
    const readingY = Math.max(10, Math.min(500, Number(readingLineOffset) || 150));
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    for (const node of currentNodes) {
      if (!node.elementSelector) continue;
      const element = queryNodeElement(node.elementSelector);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || (viewportHeight > 0 && rect.top >= viewportHeight)) continue;
      const distance = Math.abs(rect.top - readingY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = node;
      }
    }

    return bestNode?.id || "";
  }

  function getPrimaryScrollContainer(): HTMLElement | null {
    const platformScrollContainer = platformAdapter.getScrollContainer?.(document);
    if (platformScrollContainer?.isConnected) return platformScrollContainer;

    for (const node of currentNodes) {
      if (!node.elementSelector) continue;
      const element = queryNodeElement(node.elementSelector);
      if (!element) continue;
      const scrollable = findNearestScrollableAncestor(element);
      if (scrollable) return scrollable;
    }

    return document.scrollingElement instanceof HTMLElement
      ? document.scrollingElement
      : document.documentElement;
  }

}

function bindPopupCommandMessages(): void {
  if (popupCommandListenerBound) return;
  popupCommandListenerBound = true;

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (!isContentCommandRequest(message)) return false;

    void handlePopupCommand(message.command)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: getErrorMessage(error) });
      });
    return true;
  });
}

async function handlePopupCommand(command: ContentCommand): Promise<void> {
  const context = await ensureMountedPanel();
  if (command === "export-current") {
    await openCurrentConversationExportModal(context.panel);
    return;
  }
  if (command === "export-batch") {
    await openRecentConversationPicker(context.panel, context.batchLimit);
    return;
  }
  if (command === "backup-platform-now") {
    void backupCurrentPlatformConversations().catch((error) => {
      console.error("[AI Chat Helper] immediate backup failed", error);
      const platformName = adapter?.name || adapter?.id || "当前平台";
      sendImmediateBackupProgress({
        status: "error",
        platformName,
        current: 0,
        total: 0,
        created: 0,
        unchanged: 0,
        failed: 0,
        error: getErrorMessage(error)
      });
      showToast(`立即备份失败：${getErrorMessage(error)}`, {
        id: "backup-platform-now",
        title: "立即备份",
        tone: "error"
      });
    });
    return;
  }
  if (command === "backup-current-now") {
    void backupCurrentConversation().catch((error) => {
      console.error("[AI Chat Helper] current conversation backup failed", error);
      const platformName = adapter?.name || adapter?.id || "当前平台";
      sendImmediateBackupProgress({
        status: "error",
        platformName,
        current: 0,
        total: 1,
        created: 0,
        unchanged: 0,
        failed: 1,
        error: getErrorMessage(error)
      });
      showToast(`备份当前失败：${getErrorMessage(error)}`, {
        id: "backup-current-now",
        title: "备份当前",
        tone: "error"
      });
    });
    return;
  }
  await checkForExtensionUpdate(context.panel, context.extensionVersion);
}

function ensureMountedPanel(): Promise<MountedPanelContext> {
  if (mountedPanelContext) return Promise.resolve(mountedPanelContext);
  if (!adapter) return Promise.reject(new Error("当前页面不支持 AI Chat Helper"));
  if (!mountPanelPromise) {
    mountPanelPromise = waitForDocumentReady()
      .then(() => mountPanel())
      .catch((error) => {
        mountPanelPromise = null;
        throw error;
      });
  }
  return mountPanelPromise;
}

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
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
  if (!options.silent) {
    showToast("正在检查更新", {
      id: "update-check",
      title: "检查更新",
      loading: true,
      duration: 10000
    });
  }

  try {
    const latestSource = await requestRemoteText(`${SCRIPT_UPDATE_URL}?t=${Date.now()}`);
    const latestVersion = parseScriptVersionFromSource(latestSource);
    const summary = summarizeVersionCheck(currentVersion, latestVersion);

    if (!summary.hasUpdate) {
      setPanelVersionUpdateBadge(panel, "");
      if (!options.silent) {
        showToast(`已是最新版本 v${summary.currentVersion}`, {
          id: "update-check",
          title: "检查更新",
          tone: "success"
        });
      }
      return;
    }

    setPanelVersionUpdateBadge(panel, summary.latestVersion);
    if (options.silent) return;

    showToast(`发现新版本 v${summary.latestVersion}`, {
      id: "update-check",
      title: "检查更新",
      tone: "success",
      duration: 4000
    });
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
    if (!options.silent) {
      showToast(`检查更新失败：${getErrorMessage(error)}`, {
        id: "update-check",
        title: "检查更新",
        tone: "warn"
      });
    }
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

function queryNodeElement(selector: string): HTMLElement | null {
  try {
    const element = document.querySelector<HTMLElement>(selector);
    return element && element.isConnected ? element : null;
  } catch {
    return null;
  }
}

function findNearestScrollableAncestor(element: Element): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableContainerElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isScrollableContainerElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = String(style.overflowY || "").toLowerCase();
  const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  return canScroll && getScrollableDistance(element) > 16;
}

function getScrollableDistance(element: HTMLElement): number {
  return Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0));
}

function isScrollContainerNearBottom(element: HTMLElement | null, threshold: number): boolean {
  if (!element || getScrollableDistance(element) <= 16) return false;
  const remaining = Number(element.scrollHeight || 0)
    - Math.max(0, Number(element.scrollTop || 0))
    - Number(element.clientHeight || 0);
  return remaining < threshold;
}

function shouldUseSnapshotNodeSource(platformId: string): boolean {
  return platformId === "chatgpt"
    || platformId === "qwen"
    || platformId === "doubao"
    || platformId === "deepseek"
    || platformId === "claude";
}

function isSnapshotForCurrentConversation(snapshot: ConversationSnapshot, currentConversationId: string): boolean {
  const currentId = String(currentConversationId || "").trim();
  const snapshotId = String(snapshot.conversationId || "").trim();
  if (!currentId || currentId === "current" || !snapshotId || snapshotId === "current") return true;
  return currentId === snapshotId;
}

function buildSnapshotConversationNodes(snapshot: ConversationSnapshot): ConversationNode[] {
  return snapshot.messages
    .filter((message) => message.role === "user" && normalizeNodeText(message.text))
    .map((message, index) => {
      const text = normalizeNodeText(message.text);
      const sourceMessageId = String(message.sourceMessageId || message.id || "").trim();
      const id = sourceMessageId || `${snapshot.platformId}-user-${index + 1}`;
      const attachments = message.attachments?.length
        ? message.attachments.map((attachment) => ({ ...attachment }))
        : undefined;
      return {
        id,
        sourceMessageId,
        index,
        sessionIndex: index,
        role: "user",
        title: text.slice(0, 80) || `Message ${index + 1}`,
        text,
        ...(attachments ? { attachments } : {})
      };
    });
}

function bindSnapshotNodesToDom(snapshotNodes: ConversationNode[], domNodes: ConversationNode[]): ConversationNode[] {
  if (!snapshotNodes.length || !domNodes.length) return snapshotNodes.map((node) => ({ ...node }));

  const usedDomIndexes = new Set<number>();
  return snapshotNodes.map((node) => {
    let bestIndex = -1;
    let bestScore = -Infinity;

    domNodes.forEach((domNode, index) => {
      if (usedDomIndexes.has(index)) return;
      const score = scoreNodeMatch(node, domNode);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex < 0 || bestScore < 16) return { ...node };
    usedDomIndexes.add(bestIndex);
    const domNode = domNodes[bestIndex];
    return {
      ...node,
      elementSelector: domNode.elementSelector,
      text: node.text || domNode.text,
      title: node.title || domNode.title
    };
  });
}

function scoreNodeMatch(a: ConversationNode, b: ConversationNode): number {
  let score = 0;
  const aIds = getNodeIdentityParts(a);
  const bIds = getNodeIdentityParts(b);

  if (aIds.some((id) => bIds.includes(id))) score += 80;
  else if (aIds.some((left) => bIds.some((right) => left && right && (left.includes(right) || right.includes(left))))) score += 32;

  const aText = normalizeNodeText(a.text || a.title);
  const bText = normalizeNodeText(b.text || b.title);
  if (aText && bText) {
    if (aText === bText) score += 60;
    else if (aText.includes(bText.slice(0, Math.min(48, bText.length)))) score += 24;
    else if (bText.includes(aText.slice(0, Math.min(48, aText.length)))) score += 24;
  }

  return score;
}

function getNodeIdentityParts(node: ConversationNode): string[] {
  const out = new Set<string>();
  [node.sourceMessageId, node.id].forEach((value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized) out.add(normalized);
  });
  return Array.from(out);
}

function normalizeNodeText(value: unknown): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeSignature(nodes: ConversationNode[]): string {
  return nodes
    .map((node) => [
      node.id,
      node.index,
      node.title,
      node.role || "",
      node.elementSelector || ""
    ].join("\u0001"))
    .join("\u0002");
}

function mergeConversationNodes(previousNodes: ConversationNode[], scannedNodes: ConversationNode[]): ConversationNode[] {
  if (!previousNodes.length) return reindexConversationNodes(scannedNodes);
  if (!scannedNodes.length) return reindexConversationNodes(previousNodes);

  const merged = previousNodes.map((node) => ({ ...node }));
  const indexById = new Map(merged.map((node, index) => [String(node.id), index]));

  scannedNodes.forEach((node) => {
    const id = String(node.id || "").trim();
    if (!id) return;
    const existingIndex = indexById.get(id);
    if (existingIndex == null) {
      indexById.set(id, merged.length);
      merged.push({ ...node });
      return;
    }

    merged[existingIndex] = {
      ...merged[existingIndex],
      ...node,
      sessionIndex: merged[existingIndex].sessionIndex ?? node.sessionIndex
    };
  });

  return reindexConversationNodes(merged);
}

function reindexConversationNodes(nodes: ConversationNode[]): ConversationNode[] {
  return nodes.map((node, index) => ({
    ...node,
    index,
    sessionIndex: node.sessionIndex ?? index
  }));
}

async function openCurrentConversationExportModal(panel: HTMLElement): Promise<void> {
  if (!adapter) return;
  showToast("正在准备导出当前对话", {
    id: "export-current",
    title: "导出对话",
    loading: true,
    duration: 10000
  });

  try {
    const snapshot = await createConversationSnapshot(adapter, capturedEvents.snapshot(), document);
    openExportModal(snapshot, (format, selectedSnapshot) => {
      return exportCurrentConversation(format, panel, selectedSnapshot);
    });
    showToast("导出对话已准备就绪", {
      id: "export-current",
      title: "导出对话",
      tone: "success",
      duration: 1800
    });
  } catch (error) {
    console.error("[AI Chat Helper] current export dialog failed", error);
    showToast(`导出对话准备失败：${getErrorMessage(error)}`, {
      id: "export-current",
      title: "导出对话",
      tone: "error"
    });
  }
}

async function exportCurrentConversation(
  format: SnapshotExportFormat,
  panel: HTMLElement,
  snapshot: ConversationSnapshot
): Promise<void> {
  showToast("正在导出当前对话", {
    id: "export-current-file",
    title: "导出对话",
    loading: true,
    duration: 10000
  });

  try {
    const files = await exportSnapshot(snapshot, format);
    await downloadExportFiles(files, sendBackgroundRequest);

    showToast("当前对话导出已开始下载", {
      id: "export-current-file",
      title: "导出对话",
      tone: "success"
    });
  } catch (error) {
    console.error("[AI Chat Helper] current export failed", error);
    showToast(`当前对话导出失败：${getErrorMessage(error)}`, {
      id: "export-current-file",
      title: "导出对话",
      tone: "error"
    });
  }
}

async function openRecentConversationPicker(panel: HTMLElement, limit: number): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  showToast("正在获取近期对话", {
    id: "export-batch-list",
    title: "批量导出",
    loading: true,
    duration: 10000
  });

  try {
    const summaries = await adapter.fetchConversationList({ limit, capturedEvents: capturedEvents.snapshot() });
    if (!summaries.length) {
      showToast("暂无可导出的近期对话", {
        id: "export-batch-list",
        title: "批量导出",
        tone: "warn"
      });
      return;
    }
    openBatchExportModal(summaries, {
      loadSnapshot: (summary) => adapter.fetchConversationDetail!(summary.conversationId, summary, capturedEvents.snapshot()),
      onExport: (format, selections) => {
        return exportRecentConversations(format, panel, selections);
      },
      onPreviewError(summary, error) {
        console.warn("[AI Chat Helper] batch preview failed", summary.conversationId, error);
        showToast(`预览加载失败：${getErrorMessage(error)}`, {
          id: "export-batch-preview",
          title: "批量导出",
          tone: "warn"
        });
      }
    });
    showToast(`已加载 ${summaries.length} 个近期对话`, {
      id: "export-batch-list",
      title: "批量导出",
      tone: "success"
    });
  } catch (error) {
    console.error("[AI Chat Helper] batch list failed", error);
    showToast(`近期对话获取失败：${getErrorMessage(error)}`, {
      id: "export-batch-list",
      title: "批量导出",
      tone: "error"
    });
  }
}

async function exportRecentConversations(format: SnapshotExportFormat, panel: HTMLElement, selections: BatchConversationSelection[]): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  if (!selections.length) return;
  showToast("正在导出所选对话", {
    id: "export-batch",
    title: "批量导出",
    loading: true,
    duration: 10000
  });

  try {
    const result = await collectBatchSnapshots(
      selections,
      (conversationId, summary) => adapter.fetchConversationDetail!(conversationId, summary, capturedEvents.snapshot()),
      {
        onProgress(summary, index, total) {
          showToast(`正在导出 ${index + 1}/${total}: ${summary.title || summary.conversationId}`, {
            id: "export-batch",
            title: "批量导出",
            loading: true,
            duration: 10000
          });
        },
        onFailure(summary, error) {
          console.warn("[AI Chat Helper] batch conversation export failed", summary.conversationId, error);
        }
      }
    );
    if (!result.snapshots.length) {
      showToast(`批量导出失败：${result.failures.length} 个对话导出失败`, {
        id: "export-batch",
        title: "批量导出",
        tone: "error"
      });
      return;
    }

    const files = await exportBatchSnapshots(result.snapshots, format);
    await downloadExportFiles(files, sendBackgroundRequest);

    const failedText = result.failures.length ? ` (${result.failures.length} failed).` : ".";
    showToast(`批量导出已开始下载：${result.snapshots.length} 个对话${failedText}`, {
      id: "export-batch",
      title: "批量导出",
      tone: result.failures.length ? "warn" : "success"
    });
  } catch (error) {
    console.error("[AI Chat Helper] batch export failed", error);
    showToast(`批量导出失败：${getErrorMessage(error)}`, {
      id: "export-batch",
      title: "批量导出",
      tone: "error"
    });
  }
}

async function backupCurrentPlatformConversations(): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) {
    throw new Error("当前平台不支持全量备份");
  }
  if (immediateBackupInProgress) {
    showToast("立即备份正在进行中", {
      id: "backup-platform-now",
      title: "立即备份",
      loading: true,
      duration: 3500
    });
    return;
  }

  immediateBackupInProgress = true;
  const platformName = adapter.name || adapter.id;
  try {
    showToast("正在准备立即备份", {
      id: "backup-platform-now",
      title: "立即备份",
      loading: true,
      duration: 10000
    });
    sendImmediateBackupProgress({
      status: "starting",
      platformName,
      current: 0,
      total: 0,
      created: 0,
      unchanged: 0,
      failed: 0
    });

    const summaries = await adapter.fetchConversationList({
      limit: immediateBackupListLimit,
      capturedEvents: capturedEvents.snapshot()
    });

    if (!summaries.length) {
      sendImmediateBackupProgress({
        status: "done",
        platformName,
        current: 0,
        total: 0,
        created: 0,
        unchanged: 0,
        failed: 0,
        title: "暂无可备份会话"
      });
      showToast("暂无可备份会话", {
        id: "backup-platform-now",
        title: "立即备份",
        tone: "warn"
      });
      return;
    }

    let covered = 0;
    let unchanged = 0;
    let failed = 0;
    const total = summaries.length;

    for (const [index, summary] of summaries.entries()) {
      showToast(`正在备份 ${index + 1}/${total}: ${summary.title || summary.conversationId}`, {
        id: "backup-platform-now",
        title: "立即备份",
        loading: true,
        duration: 10000
      });
      try {
        const result = await backupConversationSummary(summary);
        if (result.created) covered += 1;
        else unchanged += 1;
      } catch (error) {
        failed += 1;
        console.warn("[AI Chat Helper] immediate backup conversation failed", summary.conversationId, error);
      }
      sendImmediateBackupProgress({
        status: "running",
        platformName,
        current: index + 1,
        total,
        created: covered,
        unchanged,
        failed,
        title: summary.title || summary.conversationId
      });
    }

    sendImmediateBackupProgress({
      status: failed === total ? "error" : "done",
      platformName,
      current: total,
      total,
      created: covered,
      unchanged,
      failed,
      error: failed === total ? "所有会话备份失败" : undefined
    });
    showToast(`立即备份完成：覆盖 ${covered}，未变化 ${unchanged}，失败 ${failed}`, {
      id: "backup-platform-now",
      title: "立即备份",
      tone: failed ? "warn" : "success"
    });
  } finally {
    immediateBackupInProgress = false;
  }
}

async function backupCurrentConversation(): Promise<void> {
  if (!adapter) throw new Error("当前页面不支持备份");
  if (immediateBackupInProgress) {
    showToast("立即备份正在进行中", {
      id: "backup-current-now",
      title: "备份当前",
      loading: true,
      duration: 3500
    });
    return;
  }

  immediateBackupInProgress = true;
  const platformName = adapter.name || adapter.id;
  try {
    showToast("正在备份当前对话", {
      id: "backup-current-now",
      title: "备份当前",
      loading: true,
      duration: 10000
    });
    sendImmediateBackupProgress({
      status: "starting",
      platformName,
      current: 0,
      total: 1,
      created: 0,
      unchanged: 0,
      failed: 0,
      title: "当前对话"
    });

    const snapshot = await createConversationSnapshot(adapter, capturedEvents.snapshot(), document);
    const files = await exportSnapshot(snapshot, "zip");
    const result = await backupStore.save(await createConversationBackupRecord(snapshot, "zip", files, {
      createdAt: new Date().toISOString(),
      source: "manual"
    }));
    const covered = result.created ? 1 : 0;
    const unchanged = result.created ? 0 : 1;

    sendImmediateBackupProgress({
      status: "done",
      platformName,
      current: 1,
      total: 1,
      created: covered,
      unchanged,
      failed: 0,
      title: snapshot.title || "当前对话"
    });
    showToast(`备份当前完成：${result.created ? "覆盖 1" : "未变化 1"}`, {
      id: "backup-current-now",
      title: "备份当前",
      tone: "success"
    });
  } finally {
    immediateBackupInProgress = false;
  }
}

async function backupConversationSummary(summary: ConversationSummary): Promise<BackupSaveResult> {
  if (!adapter?.fetchConversationDetail) throw new Error("当前平台不支持备份详情");
  const snapshot = await adapter.fetchConversationDetail(summary.conversationId, summary, capturedEvents.snapshot());
  const normalizedSnapshot = applyBackupSummaryMetadata(snapshot, summary);
  const files = await exportSnapshot(normalizedSnapshot, "zip");
  return backupStore.save(await createConversationBackupRecord(normalizedSnapshot, "zip", files, {
    createdAt: new Date().toISOString(),
    source: "manual"
  }));
}

function applyBackupSummaryMetadata(snapshot: ConversationSnapshot, summary: ConversationSummary): ConversationSnapshot {
  return {
    ...snapshot,
    platformId: summary.platformId || snapshot.platformId,
    conversationId: summary.conversationId || snapshot.conversationId,
    title: summary.title || snapshot.title,
    updatedAt: summary.updatedAt || snapshot.updatedAt,
    updatedAtText: summary.updatedAtText || snapshot.updatedAtText,
    createdAt: summary.createdAt || snapshot.createdAt,
    createdAtText: summary.createdAtText || snapshot.createdAtText,
    messageCount: snapshot.messages.length
  };
}

function sendImmediateBackupProgress(payload: ImmediateBackupProgressPayload): void {
  chrome.runtime?.sendMessage?.({
    type: IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE,
    payload
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (adapter) {
  bindPopupCommandMessages();
  injectPageHooks();
  document.documentElement.dataset.aiChatHelperPlatform = adapter.id;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isInjectedMessage(event.data)) return;
    if (event.data.type === "captured-network-event") {
      capturedEvents.push(event.data.payload);
    }
    console.debug("[AI Chat Helper] injected message", event.data.type);
  });

  void ensureMountedPanel().catch((error) => {
    console.error("[AI Chat Helper] panel mount failed", error);
  });
}
