import { getPlatformName, groupBackupRecordsByConversation, type ConversationBackupEntry, type ConversationBackupRecord } from "../backup/backup-store";
import { renderMessageMarkdown } from "../exporters/html";
import type { ConversationMessage, ExportAttachment, PlatformId } from "../shared/types";
import { bindTextTooltipHandlers, hideNodeTooltip, showNodeTooltip } from "../ui/controls/node-tooltip";
import { escapeHtml } from "../ui/shared/escape-html";

export interface BackupLibraryHandlers {
  onBack: () => void;
  onDownload: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export interface BackupLibraryOptions {
  showBack?: boolean;
}

type BackupPlatformFilter = PlatformId;

interface BackupLibraryState {
  platform: BackupPlatformFilter;
  searchQuery: string;
  selectedEntryId: string;
  selectedVersionId: string;
  versionDropdownOpen: boolean;
  versionDropdownClosing: boolean;
  versionManagerOpen: boolean;
  versionManagerSelection: string[];
  deletingBackupIds: string[];
  loadingDownloadId: string;
  loadingDeleteId: string;
  status: string;
  error: string;
}

interface SearchFocusSnapshot {
  selectionStart: number | null;
  selectionEnd: number | null;
}

const platformOrder: PlatformId[] = ["chatgpt", "qwen", "doubao", "deepseek", "claude"];
const platformIconPaths: Record<PlatformId, string> = {
  chatgpt: "icons/platforms/chatgpt.svg",
  qwen: "icons/platforms/qwen.svg",
  doubao: "icons/platforms/doubao.svg",
  deepseek: "icons/platforms/deepseek.svg",
  claude: "icons/platforms/claude.svg"
};
const extensionIconPath = "icons/icon32.png";

const backIcon = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6"></path>
  </svg>
`;

const downloadIcon = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <path d="m7 10 5 5 5-5"></path>
    <path d="M12 15V3"></path>
  </svg>
`;

const deleteIcon = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4h8v2"></path>
    <path d="M19 6l-1 14H6L5 6"></path>
  </svg>
`;

const closeIcon = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  </svg>
`;

export function createBackupLibraryPopup(records: ConversationBackupRecord[], options: BackupLibraryOptions = {}): HTMLElement {
  const root = document.createElement("main");
  root.className = "ai-chat-helper-backup-workbench";
  const state = createInitialState(records);
  root.innerHTML = renderBackupWorkbench(records, state, options);
  return root;
}

export function bindBackupLibraryPopup(root: HTMLElement, records: ConversationBackupRecord[], handlers: BackupLibraryHandlers): void {
  const options: BackupLibraryOptions = {
    showBack: Boolean(root.querySelector("[data-ai-chat-helper-backup-back]"))
  };
  bindTextTooltipHandlers(root);
  let localRecords = [...records];
  const state = createInitialState(records);
  const render = () => {
    hideNodeTooltip();
    root.innerHTML = renderBackupWorkbench(localRecords, state, options);
  };
  const closeVersionDropdown = (animate = false) => {
    if (!state.versionDropdownOpen && !state.versionDropdownClosing) return;
    if (animate) {
      state.versionDropdownOpen = false;
      state.versionDropdownClosing = true;
      render();
      window.setTimeout(() => {
        state.versionDropdownClosing = false;
        render();
      }, 150);
      return;
    }
    state.versionDropdownOpen = false;
    state.versionDropdownClosing = false;
  };

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-ai-chat-helper-backup-back]")) {
      handlers.onBack();
      return;
    }

    const platformButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-platform]");
    if (platformButton) {
      state.platform = normalizePlatformFilter(platformButton.dataset.aiChatHelperBackupPlatform);
      const entry = getDefaultSelectedEntry(localRecords, state.platform);
      state.selectedEntryId = entry?.id || "";
      state.selectedVersionId = entry?.latest.id || "";
      state.versionManagerOpen = false;
      state.versionManagerSelection = [];
      closeVersionDropdown(false);
      state.status = "";
      state.error = "";
      render();
      return;
    }

    const recordButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-record]");
    if (recordButton) {
      const entry = getConversationEntries(localRecords).find((item) => item.id === recordButton.dataset.backupEntryId);
      state.selectedEntryId = entry?.id || "";
      state.selectedVersionId = entry?.latest.id || "";
      state.versionManagerOpen = false;
      state.versionManagerSelection = [];
      closeVersionDropdown(false);
      state.status = "";
      state.error = "";
      render();
      return;
    }

    const versionToggle = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]");
    if (versionToggle) {
      if (state.versionDropdownOpen) {
        versionToggle.setAttribute("aria-expanded", "false");
        closeVersionDropdown(true);
      } else {
        state.versionDropdownOpen = true;
        state.versionDropdownClosing = false;
        versionToggle.setAttribute("aria-expanded", "true");
        renderVersionDropdownInPlace(root, localRecords, state);
      }
      return;
    }

    const versionButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version]");
    if (versionButton) {
      if (target.closest("[data-ai-chat-helper-backup-version-delete]")) {
        return;
      }
      state.selectedVersionId = versionButton.dataset.backupId || "";
      state.versionManagerOpen = false;
      state.versionManagerSelection = [];
      closeVersionDropdown(false);
      state.status = "";
      state.error = "";
      render();
      return;
    }

    const versionManageButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manage]");
    if (versionManageButton) {
      state.versionManagerOpen = true;
      state.versionManagerSelection = [];
      closeVersionDropdown(false);
      render();
      return;
    }

    if (target.closest("[data-ai-chat-helper-backup-version-manager-close]")) {
      state.versionManagerOpen = false;
      state.versionManagerSelection = [];
      render();
      return;
    }

    const versionManagerToggle = target.closest<HTMLElement>("[data-ai-chat-helper-backup-version-manager-toggle]");
    if (versionManagerToggle) {
      const backupId = versionManagerToggle.dataset.backupId || "";
      if (!backupId) return;
      state.versionManagerSelection = toggleVersionManagerSelection(state.versionManagerSelection, backupId);
      syncVersionManagerSelectionUI(root, localRecords, state);
      return;
    }

    if (target.closest("[data-ai-chat-helper-backup-version-manager-select-all]")) {
      const entry = getCurrentSelectedEntry(localRecords, state);
      if (!entry) return;
      const selectableIds = entry.versions.map((version) => version.id);
      state.versionManagerSelection = state.versionManagerSelection.length === selectableIds.length ? [] : selectableIds;
      syncVersionManagerSelectionUI(root, localRecords, state);
      return;
    }

    const bulkDeleteButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]");
    if (bulkDeleteButton) {
      const selectedRecords = getSelectedVersionManagerRecords(localRecords, state);
      if (selectedRecords.length) renderDeleteConfirmDialog(root, selectedRecords);
      return;
    }

    const imageButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-image]");
    if (imageButton) {
      renderImageViewer(root, imageButton.dataset.imageSrc || "", imageButton.dataset.imageTitle || "图片");
      return;
    }

    const messageNode = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    if (messageNode) {
      focusBackupPreviewMessage(root, messageNode.dataset.messageIndex || "");
      return;
    }

    if (target.closest("[data-ai-chat-helper-backup-image-viewer-close]")) {
      root.querySelector("[data-ai-chat-helper-backup-image-viewer]")?.remove();
      return;
    }

    const imageViewer = target.closest("[data-ai-chat-helper-backup-image-viewer]");
    if (imageViewer && target === imageViewer) {
      imageViewer.remove();
      return;
    }

    const downloadButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-download]");
    if (downloadButton) {
      void runRecordAction(downloadButton, "正在准备文件", "已开始下载", state, () => handlers.onDownload(downloadButton.dataset.backupId || ""));
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]");
    if (deleteButton) {
      const record = getBackupRecordById(localRecords, deleteButton.dataset.backupId || "");
      if (record) renderDeleteConfirmDialog(root, [record]);
      return;
    }

    const versionDeleteButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    if (versionDeleteButton) {
      const record = getBackupRecordById(localRecords, versionDeleteButton.dataset.backupId || "");
      if (record) renderDeleteConfirmDialog(root, [record]);
      return;
    }

    if (target.closest("[data-ai-chat-helper-backup-delete-cancel]")) {
      root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
      return;
    }

    const deleteConfirmAction = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]");
    if (deleteConfirmAction) {
      const backupIds = parseBackupIds(deleteConfirmAction.dataset.backupIds || deleteConfirmAction.dataset.backupId || "");
      root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
      if (!backupIds.length) return;
      const versionDeleteSource = root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-version-delete][data-backup-id="${escapeAttributeValue(backupIds[0])}"]`);
      if (backupIds.length === 1 && versionDeleteSource && state.versionDropdownOpen) {
        void runVersionDeleteAction(root, state, localRecords, handlers, backupIds[0]).then((nextRecords) => {
          localRecords = nextRecords;
        });
        return;
      }
      const deleteActionButton = root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-delete][data-backup-id="${escapeAttributeValue(backupIds[0])}"]`)
        || root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]")
        || root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-version-delete][data-backup-id="${escapeAttributeValue(backupIds[0])}"]`);
      if (!deleteActionButton) return;
      if (!state.loadingDeleteId && backupIds.length === 1) {
        state.loadingDeleteId = backupIds[0];
        render();
      }
      const activeDeleteActionButton = root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-delete][data-backup-id="${escapeAttributeValue(backupIds[0])}"]`)
        || root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]")
        || root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-version-delete][data-backup-id="${escapeAttributeValue(backupIds[0])}"]`);
      if (!activeDeleteActionButton) return;
      void runRecordAction(activeDeleteActionButton, "正在删除备份", "已删除备份", state, async () => {
        for (const backupId of backupIds) {
          await handlers.onDelete(backupId);
        }
        localRecords = localRecords.filter((record) => !backupIds.includes(record.id));
        syncSelectionAfterDelete(localRecords, state);
        state.versionManagerOpen = false;
        state.versionManagerSelection = [];
      }, "delete").then(() => {
        render();
      });
      return;
    }

    const deleteConfirmLayer = target.closest("[data-ai-chat-helper-backup-delete-confirm]");
    if (deleteConfirmLayer && target === deleteConfirmLayer) {
      deleteConfirmLayer.remove();
      return;
    }

    const versionManagerLayer = target.closest("[data-ai-chat-helper-backup-version-manager]");
    if (versionManagerLayer && target === versionManagerLayer) {
      state.versionManagerOpen = false;
      state.versionManagerSelection = [];
      render();
      return;
    }

    if (state.versionDropdownOpen && !target.closest("[data-ai-chat-helper-backup-version-picker]")) {
      closeVersionDropdown(true);
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-ai-chat-helper-backup-search]")) return;
    const searchFocus = captureSearchFocus(target);
    state.searchQuery = target.value;
    const filteredEntries = filterEntries(getConversationEntries(localRecords), state.platform, state.searchQuery);
    const selectedEntry = getSelectedEntry(getConversationEntries(localRecords), filteredEntries, state.selectedEntryId);
    state.selectedEntryId = selectedEntry?.id || "";
    state.selectedVersionId = selectedEntry?.latest.id || "";
    state.versionManagerOpen = false;
    state.versionManagerSelection = [];
    state.status = "";
    state.error = "";
    closeVersionDropdown(false);
    render();
    restoreSearchFocus(root, searchFocus);
  });

  root.addEventListener("scroll", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-ai-chat-helper-backup-message-list]")) return;
    syncBackupPreviewNodeToMessagePosition(root, target);
  }, true);

  root.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    if (!nodeButton) return;
    const related = event.relatedTarget;
    if (related instanceof Node && nodeButton.contains(related)) return;
    const nodeModel = getBackupPreviewTooltipNode(localRecords, state, nodeButton.dataset.messageIndex || "");
    if (!nodeModel) return;
    showNodeTooltip(nodeButton, nodeModel);
  });

  root.addEventListener("mouseout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    if (!nodeButton) return;
    const related = event.relatedTarget;
    if (related instanceof Node && nodeButton.contains(related)) return;
    hideNodeTooltip(nodeButton);
  });

  root.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    if (!nodeButton) return;
    const nodeModel = getBackupPreviewTooltipNode(localRecords, state, nodeButton.dataset.messageIndex || "");
    if (!nodeModel) return;
    showNodeTooltip(nodeButton, nodeModel);
  });

  root.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    if (!nodeButton) return;
    hideNodeTooltip(nodeButton);
  });
}

function createInitialState(records: ConversationBackupRecord[]): BackupLibraryState {
  const initialPlatform = getInitialPlatform(records);
  const selected = getDefaultSelectedEntry(records, initialPlatform);
  return {
    platform: initialPlatform,
    searchQuery: "",
    selectedEntryId: selected?.id || "",
    selectedVersionId: selected?.latest.id || "",
    versionDropdownOpen: false,
    versionDropdownClosing: false,
    versionManagerOpen: false,
    versionManagerSelection: [],
    deletingBackupIds: [],
    loadingDownloadId: "",
    loadingDeleteId: "",
    status: "",
    error: ""
  };
}

function renderBackupWorkbench(records: ConversationBackupRecord[], state: BackupLibraryState, options: BackupLibraryOptions): string {
  const sortedRecords = sortBackupsNewestFirst(records);
  const entries = groupBackupRecordsByConversation(sortedRecords);
  const filteredEntries = filterEntries(entries, state.platform, state.searchQuery);
  const selectedEntry = getSelectedEntry(entries, filteredEntries, state.selectedEntryId);
  const selectedRecord = getSelectedVersion(selectedEntry, state.selectedVersionId);
  const showBack = options.showBack !== false;

  return `
    <header class="ai-chat-helper-backup-workbench__header">
      <div class="ai-chat-helper-backup-workbench__title">
        ${showBack ? `<button type="button" class="ai-chat-helper-backup-workbench__back" aria-label="返回设置" data-ai-chat-helper-tooltip="返回设置" data-ai-chat-helper-backup-back>${backIcon}</button>` : ""}
        <span class="ai-chat-helper-backup-workbench__brand" aria-hidden="true"><img src="${escapeText(getExtensionAssetUrl(extensionIconPath))}" alt="" loading="lazy" decoding="async"></span>
        <div>
          <h1>备份库</h1>
        </div>
      </div>
      ${renderSummary(sortedRecords, state)}
    </header>
    <section class="ai-chat-helper-backup-workbench__body">
      ${renderPlatformNav(entries, state.platform)}
      <section class="ai-chat-helper-backup-workbench__list-panel" aria-label="备份列表">
        <div class="ai-chat-helper-backup-workbench__panel-head">
          <strong>${escapeText(getFilterTitle(state.platform))}</strong>
          <span>${filteredEntries.length} 个会话</span>
        </div>
        <div class="ai-chat-helper-backup-workbench__records" data-ai-chat-helper-backup-list>
          ${filteredEntries.length ? filteredEntries.map((entry) => renderRecordRow(
            entry,
            selectedEntry?.id === entry.id,
            state.loadingDownloadId === entry.latest.id,
            state.loadingDeleteId === entry.latest.id
          )).join("") : renderPlatformEmpty(state.platform, sortedRecords.length === 0)}
        </div>
      </section>
      ${renderDetailPanel(selectedEntry, selectedRecord, state, sortedRecords.length === 0)}
    </section>
  `;
}

function renderSummary(records: ConversationBackupRecord[], state: BackupLibraryState): string {
  const size = records.reduce((sum, record) => sum + estimateRecordSize(record), 0);
  return `
    <div class="ai-chat-helper-backup-workbench__summary-bar">
      <dl class="ai-chat-helper-backup-workbench__summary" data-ai-chat-helper-backup-summary>
        <div>
          <dt>占用</dt>
          <dd>${escapeText(formatBytes(size))}</dd>
        </div>
      </dl>
      <div class="ai-chat-helper-backup-workbench__summary-tools">
        <label class="ai-chat-helper-backup-workbench__search">
          <span class="ai-chat-helper-backup-workbench__search-label">搜索</span>
          <input
            type="search"
            value="${escapeAttributeValue(state.searchQuery)}"
            placeholder="搜索标题、平台或对话内容"
            aria-label="搜索备份会话"
            autocomplete="off"
            spellcheck="false"
            data-ai-chat-helper-backup-search
          >
        </label>
      </div>
    </div>
  `;
}

function renderPlatformNav(entries: ConversationBackupEntry[], selectedPlatform: BackupPlatformFilter): string {
  return `
    <nav class="ai-chat-helper-backup-workbench__platforms" aria-label="备份平台" data-ai-chat-helper-backup-platform-nav>
      ${platformOrder.map((platformId) => {
        const platformEntries = entries.filter((entry) => entry.platformId === platformId);
        return renderPlatformButton(platformId, getPlatformName(platformId), platformEntries.length, platformEntries[0]?.latest.createdAt || "", selectedPlatform === platformId);
      }).join("")}
    </nav>
  `;
}

function renderPlatformButton(
  platform: BackupPlatformFilter,
  label: string,
  count: number,
  latest: string,
  selected: boolean
): string {
  const icon = renderPlatformNavIcon(platform, label);
  return `
    <button type="button" class="ai-chat-helper-backup-platform${selected ? " is-active" : ""}" data-ai-chat-helper-backup-platform="${escapeText(platform)}" aria-pressed="${selected}">
      <span class="ai-chat-helper-backup-platform__label">
        ${icon}
        <span>${escapeText(label)}</span>
      </span>
      <strong>${count}</strong>
      <small>${escapeText(latest ? formatCompactDate(latest) : "暂无备份")}</small>
    </button>
  `;
}

function renderPlatformNavIcon(platform: BackupPlatformFilter, label: string): string {
  const src = getExtensionAssetUrl(platformIconPaths[platform]);
  return `<span class="ai-chat-helper-backup-platform__icon" data-ai-chat-helper-backup-platform-icon="${escapeText(platform)}" aria-hidden="true"><img src="${escapeText(src)}" alt="${escapeText(label)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`;
}

function getExtensionAssetUrl(path: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return `chrome-extension://test/${path.replace(/^\/+/, "")}`;
}

function renderRecordRow(entry: ConversationBackupEntry, selected: boolean, isDownloadLoading: boolean, isDeleteLoading: boolean): string {
  const record = entry.latest;
  const status = getAssetStatusLabel(record);
  return `
    <article class="ai-chat-helper-backup-record${selected ? " is-selected" : ""}" data-backup-row="${escapeText(entry.id)}">
      <button type="button" class="ai-chat-helper-backup-record__main" data-ai-chat-helper-backup-record data-backup-entry-id="${escapeText(entry.id)}" aria-pressed="${selected}">
        <strong>${escapeText(entry.title || entry.conversationId)}</strong>
        <span>${escapeText(entry.platformName)} · ${entry.versionCount} 个版本 · ${escapeText(formatBackupMeta(record))}</span>
        <small>${escapeText(status)}</small>
      </button>
      <div class="ai-chat-helper-backup-record__actions">
        ${renderActionIconButton("下载备份", "data-ai-chat-helper-backup-download", record.id, downloadIcon, isDownloadLoading)}
        ${renderActionIconButton("删除备份", "data-ai-chat-helper-backup-delete", record.id, deleteIcon, isDeleteLoading)}
      </div>
    </article>
  `;
}

function renderDetailPanel(
  entry: ConversationBackupEntry | null,
  record: ConversationBackupRecord | null,
  state: BackupLibraryState,
  showWorkbenchEmpty = false
): string {
  if (!entry || !record) {
    return `
      <aside class="ai-chat-helper-backup-detail" data-ai-chat-helper-backup-detail>
        ${showWorkbenchEmpty ? renderDetailEmptyState() : '<div class="ai-chat-helper-backup-detail__empty">请选择一个备份查看预览。</div>'}
      </aside>
    `;
  }

  const previewSnapshot = record.previewSnapshot || record.snapshot;
  const isLegacyPreview = !record.previewSnapshot;
  const conversationTurnCount = countConversationTurns(previewSnapshot.messages);
  return `
    <aside class="ai-chat-helper-backup-detail" data-ai-chat-helper-backup-detail>
      <header class="ai-chat-helper-backup-detail__head">
        <div>
          <span>${escapeText(record.platformName)}</span>
          <h2>${escapeText(record.title || record.conversationId)}</h2>
          <p>${escapeText(formatFullDate(record.createdAt))} · ${conversationTurnCount} 轮对话 · ${escapeText(formatBytes(estimateRecordSize(record)))}</p>
        </div>
        <div class="ai-chat-helper-backup-detail__actions">
          <button type="button" aria-label="版本管理" data-ai-chat-helper-tooltip="版本管理" data-ai-chat-helper-backup-version-manage>${renderVersionManageIcon()}</button>
          ${renderActionIconButton("下载备份", "data-ai-chat-helper-backup-download", record.id, downloadIcon, state.loadingDownloadId === record.id)}
          ${renderActionIconButton("删除备份", "data-ai-chat-helper-backup-delete", record.id, deleteIcon, state.loadingDeleteId === record.id)}
        </div>
      </header>
      ${renderVersionHistory(entry, state)}
      ${isLegacyPreview ? `<p class="ai-chat-helper-backup-detail__notice">旧备份，图片可能依赖原始链接。</p>` : ""}
      <div class="ai-chat-helper-backup-detail__messages">
        ${renderPreviewMessages(previewSnapshot.messages, previewSnapshot.platformId)}
      </div>
      ${state.versionManagerOpen ? renderVersionManagerDialog(entry, state) : ""}
    </aside>
  `;
}

function renderActionIconButton(
  label: string,
  dataAttr: string,
  backupId: string,
  icon: string,
  isLoading: boolean
): string {
  return `<button type="button" aria-label="${escapeText(label)}" data-ai-chat-helper-tooltip="${escapeText(label)}" data-backup-id="${escapeText(backupId)}" ${dataAttr} ${isLoading ? "disabled aria-busy=\"true\"" : ""}>${isLoading ? '<span class="ai-chat-helper-backup-action-spinner" aria-hidden="true"></span>' : icon}</button>`;
}

function renderVersionHistory(entry: ConversationBackupEntry, state: BackupLibraryState): string {
  const selectedVersionId = state.selectedVersionId || entry.latest.id;
  const selectedIndex = Math.max(0, entry.versions.findIndex((version) => version.id === selectedVersionId));
  const selectedVersion = entry.versions[selectedIndex] || entry.latest;
  const selectedLabel = getVersionLabel(entry, selectedIndex);
  const listVisible = state.versionDropdownOpen || state.versionDropdownClosing;
  const listClass = `ai-chat-helper-backup-detail__version-list${state.versionDropdownOpen ? " is-open" : ""}${state.versionDropdownClosing ? " is-closing" : ""}`;
  return `
    <section class="ai-chat-helper-backup-detail__versions" aria-label="版本历史">
      <div class="ai-chat-helper-backup-detail__versions-head">
        <strong>版本历史</strong>
        <span>${entry.versionCount} 个版本</span>
      </div>
      <div class="ai-chat-helper-backup-detail__version-picker" data-ai-chat-helper-backup-version-picker>
        <button
          type="button"
          class="ai-chat-helper-backup-version-toggle"
          data-ai-chat-helper-backup-version-toggle
          aria-haspopup="listbox"
          aria-expanded="${state.versionDropdownOpen ? "true" : "false"}"
        >
          <span>
            <b>${escapeText(selectedLabel)}</b>
            <strong>${escapeText(formatCompactDate(selectedVersion.createdAt))}</strong>
          </span>
          <small>${escapeText(formatVersionMeta(selectedVersion, true))}</small>
          <i aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"></path>
            </svg>
          </i>
        </button>
        ${listVisible ? `
          <div class="${listClass}" data-ai-chat-helper-backup-version-list role="listbox" aria-label="选择备份版本">
            ${entry.versions.map((version, index) => `
              <div class="ai-chat-helper-backup-version-row${state.deletingBackupIds.includes(version.id) ? " is-deleting" : ""}">
                <button
                  type="button"
                  role="option"
                  class="ai-chat-helper-backup-version${version.id === selectedVersion.id ? " is-active" : ""}"
                  data-ai-chat-helper-backup-version
                  data-backup-id="${escapeText(version.id)}"
                  aria-selected="${version.id === selectedVersion.id}"
                  ${state.deletingBackupIds.includes(version.id) ? "disabled" : ""}
                >
                  <span>${escapeText(getVersionLabel(entry, index))}</span>
                  <strong>${escapeText(formatCompactDate(version.createdAt))}</strong>
                  <small>${escapeText(state.deletingBackupIds.includes(version.id) ? "正在删除…" : formatVersionMeta(version, false))}</small>
                </button>
                <button type="button" class="ai-chat-helper-backup-version-delete" aria-label="删除该版本" data-ai-chat-helper-tooltip="删除该版本" data-ai-chat-helper-backup-version-delete data-backup-id="${escapeText(version.id)}" ${state.deletingBackupIds.includes(version.id) ? "disabled aria-busy=\"true\"" : ""}>${state.deletingBackupIds.includes(version.id) ? '<span class="ai-chat-helper-backup-version-delete-spinner" aria-hidden="true"></span>' : deleteIcon}</button>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function getVersionLabel(entry: ConversationBackupEntry, index: number): string {
  return index === 0 ? "最新" : `版本 ${entry.versionCount - index}`;
}

function formatVersionMeta(record: ConversationBackupRecord, fullSourceLabel: boolean): string {
  const source = record.source === "manual"
    ? (fullSourceLabel ? "手动备份" : "手动")
    : (fullSourceLabel ? "自动备份" : "自动");
  return `${source} · ${countRecordConversationTurns(record)} 轮对话 · ${getAssetStatusLabel(record)} · ${formatBytes(estimateRecordSize(record))}`;
}

function renderVersionDropdownInPlace(root: HTMLElement, records: ConversationBackupRecord[], state: BackupLibraryState): void {
  const entry = getConversationEntries(records).find((item) => item.id === state.selectedEntryId)
    || getDefaultSelectedEntry(records, state.platform);
  const picker = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-picker]");
  if (!entry || !picker) return;
  picker.querySelector("[data-ai-chat-helper-backup-version-list]")?.remove();
  const selectedVersionId = state.selectedVersionId || entry.latest.id;
  const selectedVersion = entry.versions.find((version) => version.id === selectedVersionId) || entry.latest;
  const list = document.createElement("div");
  list.className = "ai-chat-helper-backup-detail__version-list is-open";
  list.dataset.aiChatHelperBackupVersionList = "true";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "选择备份版本");
  list.innerHTML = entry.versions.map((version, index) => `
    <div class="ai-chat-helper-backup-version-row${state.deletingBackupIds.includes(version.id) ? " is-deleting" : ""}">
      <button
        type="button"
        role="option"
        class="ai-chat-helper-backup-version${version.id === selectedVersion.id ? " is-active" : ""}"
        data-ai-chat-helper-backup-version
        data-backup-id="${escapeText(version.id)}"
        aria-selected="${version.id === selectedVersion.id}"
        ${state.deletingBackupIds.includes(version.id) ? "disabled" : ""}
      >
        <span>${escapeText(getVersionLabel(entry, index))}</span>
        <strong>${escapeText(formatCompactDate(version.createdAt))}</strong>
        <small>${escapeText(state.deletingBackupIds.includes(version.id) ? "正在删除…" : formatVersionMeta(version, false))}</small>
      </button>
      <button type="button" class="ai-chat-helper-backup-version-delete" aria-label="删除该版本" data-ai-chat-helper-tooltip="删除该版本" data-ai-chat-helper-backup-version-delete data-backup-id="${escapeText(version.id)}" ${state.deletingBackupIds.includes(version.id) ? "disabled aria-busy=\"true\"" : ""}>${state.deletingBackupIds.includes(version.id) ? '<span class="ai-chat-helper-backup-version-delete-spinner" aria-hidden="true"></span>' : deleteIcon}</button>
    </div>
  `).join("");
  picker.appendChild(list);
}

function renderVersionManagerDialog(entry: ConversationBackupEntry, state: BackupLibraryState): string {
  const selectedIds = new Set(state.versionManagerSelection);
  const allSelected = entry.versions.length > 0 && state.versionManagerSelection.length === entry.versions.length;
  return `
    <section class="ai-chat-helper-backup-version-manager" data-ai-chat-helper-backup-version-manager>
      <div class="ai-chat-helper-backup-version-manager__box" role="dialog" aria-modal="true" aria-label="历史版本列表">
        <header class="ai-chat-helper-backup-version-manager__head">
          <div>
            <strong>历史版本</strong>
            <p>${entry.versionCount} 个版本 · 勾选后可批量删除</p>
          </div>
          <button type="button" class="ai-chat-helper-backup-version-manager__close" aria-label="关闭版本管理" data-ai-chat-helper-tooltip="关闭" data-ai-chat-helper-backup-version-manager-close>${closeIcon}</button>
        </header>
        <div class="ai-chat-helper-backup-version-manager__toolbar">
          <button type="button" class="ai-chat-helper-backup-version-manager__ghost" data-ai-chat-helper-backup-version-manager-select-all>${allSelected ? "取消全选" : "全选"}</button>
          <button type="button" class="ai-chat-helper-backup-version-manager__danger" data-ai-chat-helper-backup-version-manager-delete ${state.versionManagerSelection.length ? "" : "disabled"}>批量删除（${state.versionManagerSelection.length}）</button>
        </div>
        <div class="ai-chat-helper-backup-version-manager__list">
          ${entry.versions.map((version, index) => {
            const checked = selectedIds.has(version.id);
            const previewSnapshot = version.previewSnapshot || version.snapshot;
            const previewText = getVersionManagerPreviewText(previewSnapshot.messages);
            return `
              <button type="button" class="ai-chat-helper-backup-version-manager__row" data-ai-chat-helper-backup-version-manager-toggle data-backup-id="${escapeText(version.id)}" aria-pressed="${checked}">
                <input type="checkbox" class="ai-chat-helper-backup-version-manager__checkbox" data-ai-chat-helper-backup-version-manager-checkbox tabindex="-1" aria-hidden="true" ${checked ? "checked" : ""}>
                <span class="ai-chat-helper-backup-version-manager__check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <div class="ai-chat-helper-backup-version-manager__meta" data-ai-chat-helper-backup-version-manager-item>
                  <div class="ai-chat-helper-backup-version-manager__meta-top">
                    <strong>${escapeText(getVersionLabel(entry, index))}</strong>
                    <span>${escapeText(formatCompactDate(version.createdAt))}</span>
                  </div>
                  <small>${escapeText(formatVersionMeta(version, true))}</small>
                  <p>${escapeText(previewText)}</p>
                </div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPreviewMessages(messages: ConversationMessage[], platformId: PlatformId): string {
  if (!messages.length) return `<p class="ai-chat-helper-backup-detail__empty">该备份没有可预览消息。</p>`;
  const nodeModels = buildPreviewMessageNodes(messages);
  return `
    <div class="ai-chat-helper-backup-detail__messages-inner">
      <nav class="ai-chat-helper-backup-message-rail" aria-label="消息节点" data-ai-chat-helper-backup-message-rail>
        <span class="ai-chat-helper-backup-message-rail__line" aria-hidden="true"></span>
        <span class="ai-chat-helper-backup-message-node-indicator" aria-hidden="true" data-ai-chat-helper-backup-message-node-indicator></span>
        ${nodeModels.map(renderPreviewMessageNode).join("")}
      </nav>
      <div class="ai-chat-helper-backup-detail__message-list" data-ai-chat-helper-backup-message-list>
        ${messages.map((message, index) => renderPreviewMessage(message, index, platformId)).join("")}
      </div>
    </div>
  `;
}

interface PreviewMessageNode {
  role: string;
  messageIndex: number;
  threadIndex: number;
  label: string;
}

function buildPreviewMessageNodes(messages: ConversationMessage[]): PreviewMessageNode[] {
  let threadIndex = 0;
  return messages.map((message, messageIndex) => {
    if (message.role === "user") threadIndex += 1;
    const normalizedThreadIndex = threadIndex || 1;
    return {
      role: message.role,
      messageIndex,
      threadIndex: normalizedThreadIndex,
      label: message.role === "user" ? String(normalizedThreadIndex) : ""
    };
  });
}

function countConversationTurns(messages: ConversationMessage[]): number {
  return messages.filter((message) => message.role === "user").length;
}

function renderPreviewMessageNode(node: PreviewMessageNode): string {
  const roleLabel = getRoleLabel(node.role);
  return `
    <button
      type="button"
      class="ai-chat-helper-backup-message-node ai-chat-helper-backup-message-node--${escapeText(node.role)}"
      data-ai-chat-helper-backup-message-node
      data-message-index="${node.messageIndex}"
      data-thread-index="${node.threadIndex}"
      aria-label="定位到第 ${node.threadIndex} 轮 ${escapeText(roleLabel)}"
      data-ai-chat-helper-tooltip="定位到第 ${node.threadIndex} 轮 ${escapeText(roleLabel)}"
    >
      <span>${escapeText(node.label)}</span>
    </button>
  `;
}

function renderPreviewMessage(message: ConversationMessage, index: number, platformId: PlatformId): string {
  const attachments = getPreviewAttachments(message, platformId);
  return `
    <article class="ai-chat-helper-backup-message ai-chat-helper-backup-message--${escapeText(message.role)}" data-ai-chat-helper-backup-message data-message-index="${index}">
      <div class="ai-chat-helper-backup-message__text">
        ${renderMessageText(message.text || "(空消息)", platformId)}
      </div>
      ${attachments.length ? `<div class="ai-chat-helper-backup-message__attachments">${attachments.map(renderAttachmentPreview).join("")}</div>` : ""}
    </article>
  `;
}

function getBackupPreviewTooltipNode(
  records: ConversationBackupRecord[],
  state: BackupLibraryState,
  messageIndex: string
): ConversationMessage | null {
  const entries = getConversationEntries(records);
  const filteredEntries = filterEntries(entries, state.platform);
  const selectedEntry = getSelectedEntry(entries, filteredEntries, state.selectedEntryId);
  const selectedRecord = getSelectedVersion(selectedEntry, state.selectedVersionId);
  if (!selectedRecord) return null;

  const previewSnapshot = selectedRecord.previewSnapshot || selectedRecord.snapshot;
  const index = Number.parseInt(String(messageIndex || ""), 10);
  if (!Number.isFinite(index) || index < 0) return null;
  return previewSnapshot.messages[index] || null;
}

function getPreviewAttachments(message: ConversationMessage, platformId: PlatformId): ExportAttachment[] {
  const attachments = message.attachments || [];
  if (!attachments.length) return attachments;
  const normalizedText = String(message.text || "");
  if (!normalizedText) return attachments;

  const seenImageUrls = collectImageUrlsFromPreviewText(normalizedText);
  if (!seenImageUrls.size) return attachments;

  return attachments.filter((attachment) => {
    if (!isImageAttachment(attachment)) return true;
    const url = String(attachment.url || "").trim();
    return !url || !seenImageUrls.has(url);
  });
}

function collectImageUrlsFromPreviewText(text: string): Set<string> {
  const urls = new Set<string>();
  const push = (value: string) => {
    const url = String(value || "").trim();
    if (url) urls.add(url);
  };

  String(text || "").replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)/gi, (_match, url: string) => {
    push(url);
    return "";
  });
  String(text || "").replace(/\[图片[^\]]*]\s+(data:image\/\S+|https?:\/\/\S+)/gi, (_match, url: string) => {
    push(url);
    return "";
  });

  return urls;
}

function renderMessageText(text: string, platformId?: PlatformId): string {
  const pattern = /!\[([^\]]*)]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)|\[图片([^\]]*)]\s+(data:image\/\S+|https?:\/\/\S+)/gi;
  const imageTokens: Array<{ key: string; html: string }> = [];
  const tokenized = String(text || "(空消息)").replace(pattern, (_match, markdownTitle, markdownUrl, plainTitle, plainUrl) => {
    const title = markdownTitle || plainTitle || "图片";
    const url = markdownUrl || plainUrl || "";
    const key = `AI_CHAT_HELPER_BACKUP_IMAGE_${imageTokens.length}`;
    imageTokens.push({ key, html: renderImagePreview(url, title) });
    return key;
  });
  let html = renderMessageMarkdown(tokenized, platformId).trim();
  imageTokens.forEach((token) => {
    html = html
      .replace(new RegExp(`<p>\\s*${token.key}\\s*</p>`, "g"), token.html)
      .split(token.key)
      .join(token.html);
  });
  return html || `<p>${escapeText(text || "(空消息)")}</p>`;
}

function renderAttachmentPreview(attachment: ExportAttachment): string {
  if (!isImageAttachment(attachment)) {
    return `
      <div class="ai-chat-helper-backup-attachment">
        <strong>${escapeText(attachment.fileName || attachment.id || "附件")}</strong>
        <span>${escapeText(attachment.mimeType || "附件")}</span>
      </div>
    `;
  }
  return renderImagePreview(attachment.url || "", attachment.fileName || attachment.id || "图片");
}

function renderImagePreview(url: string, title: string): string {
  if (isDataImageUrl(url)) {
    return `
      <button type="button" class="ai-chat-helper-backup-image" data-ai-chat-helper-backup-image data-image-src="${escapeText(url)}" data-image-title="${escapeText(title)}" aria-label="查看图片 ${escapeText(title)}" data-ai-chat-helper-tooltip="查看图片">
        <img src="${escapeText(url)}" alt="${escapeText(title)}" loading="lazy" />
      </button>
    `;
  }
  if (isHttpUrl(url)) {
    return `
      <div class="ai-chat-helper-backup-image-missing">
        <strong>远程图片未缓存</strong>
        <a href="${escapeText(url)}" target="_blank" rel="noreferrer">${escapeText(title || url)}</a>
      </div>
    `;
  }
  return `
    <div class="ai-chat-helper-backup-image-missing">
      <strong>图片不可预览</strong>
      <span>${escapeText(title || "无图片地址")}</span>
    </div>
  `;
}

function renderPlatformEmpty(platform: BackupPlatformFilter, showWorkbenchEmpty = false): string {
  return `
    <div class="ai-chat-helper-backup-workbench__empty-inline">
      <strong>${escapeText(showWorkbenchEmpty ? "暂无会话" : `${getFilterTitle(platform)}暂无备份`)}</strong>
      <p>${escapeText(showWorkbenchEmpty ? "当前还没有任何备份记录，生成后会按平台出现在这里。" : "切换到其他平台，或等待自动备份生成新的记录。")}</p>
    </div>
  `;
}

function renderDetailEmptyState(): string {
  return `
    <div class="ai-chat-helper-backup-workbench__empty">
      <h2>暂无备份</h2>
      <p>开启自动备份后，当前对话会按平台保存到这里，并保留可预览的图片消息。</p>
    </div>
  `;
}

async function runRecordAction(
  button: HTMLButtonElement,
  loadingText: string,
  successText: string,
  state: BackupLibraryState,
  action: () => void | Promise<void>,
  actionType: "download" | "delete" = "download"
): Promise<void> {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  const backupId = button.dataset.backupId || "";
  if (actionType === "delete") state.loadingDeleteId = backupId;
  else state.loadingDownloadId = backupId;
  state.status = loadingText;
  state.error = "";
  setLiveStatus(button, loadingText);
  try {
    await action();
    state.status = successText;
    setLiveStatus(button, successText);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    setLiveStatus(button, state.error);
  } finally {
    if (actionType === "delete") state.loadingDeleteId = "";
    else state.loadingDownloadId = "";
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function setLiveStatus(button: HTMLButtonElement, value: string): void {
  const root = button.closest<HTMLElement>(".ai-chat-helper-backup-workbench");
  const status = root?.querySelector<HTMLElement>(".ai-chat-helper-backup-workbench__status strong");
  if (status) status.textContent = value;
}

function focusBackupPreviewMessage(root: HTMLElement, index: string): void {
  const message = root.querySelector<HTMLElement>(`[data-ai-chat-helper-backup-message][data-message-index="${escapeAttributeValue(index)}"]`);
  const messageList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-list]");
  if (!message || !messageList) return;
  root.querySelectorAll("[data-ai-chat-helper-backup-message].is-focused").forEach((item) => item.classList.remove("is-focused"));
  root.querySelectorAll("[data-ai-chat-helper-backup-message-node].is-active").forEach((item) => item.classList.remove("is-active"));
  message.classList.add("is-focused");
  const activeNode = root.querySelector<HTMLElement>(`[data-ai-chat-helper-backup-message-node][data-message-index="${escapeAttributeValue(index)}"]`);
  activeNode?.classList.add("is-active");
  moveBackupPreviewNodeIndicator(root, activeNode, index);
  const listTop = messageList.getBoundingClientRect().top;
  const messageTop = message.getBoundingClientRect().top;
  messageList.scrollTo({
    top: messageList.scrollTop + messageTop - listTop,
    behavior: "smooth"
  });
}

function syncBackupPreviewNodeToMessagePosition(root: HTMLElement, messageList: HTMLElement): void {
  const messages = Array.from(root.querySelectorAll<HTMLElement>("[data-ai-chat-helper-backup-message]"));
  const listTop = messageList.getBoundingClientRect().top;
  const scoredMessages = messages
    .map((message) => ({
      message,
      distance: Math.abs(message.getBoundingClientRect().top - listTop)
    }))
    .sort((left, right) => left.distance - right.distance);
  const activeNodeIndex = Number(root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-node].is-active")?.dataset.messageIndex || -1);
  const hasUsableGeometry = scoredMessages.some((item) => item.distance > 0);
  const activeMessage = hasUsableGeometry
    ? scoredMessages[0]?.message
    : messages[Math.min(messages.length - 1, Math.max(0, activeNodeIndex + 1))];
  const index = activeMessage?.dataset.messageIndex || "";
  if (!index) return;
  root.querySelectorAll("[data-ai-chat-helper-backup-message-node].is-active").forEach((item) => item.classList.remove("is-active"));
  const activeNode = root.querySelector<HTMLElement>(`[data-ai-chat-helper-backup-message-node][data-message-index="${escapeAttributeValue(index)}"]`);
  activeNode?.classList.add("is-active");
  moveBackupPreviewNodeIndicator(root, activeNode, index);
}

function moveBackupPreviewNodeIndicator(root: HTMLElement, activeNode: HTMLElement | null, index: string): void {
  if (!activeNode) return;
  const indicator = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-node-indicator]");
  if (!indicator) return;
  const nodeHeight = activeNode.offsetHeight || 18;
  const indicatorHeight = indicator.offsetHeight || 22;
  const centeredTop = activeNode.offsetTop + (nodeHeight - indicatorHeight) / 2;
  indicator.style.setProperty("--ai-chat-helper-backup-node-indicator-y", `${centeredTop}px`);
  indicator.dataset.activeMessageIndex = index;
}

function renderImageViewer(root: HTMLElement, src: string, title: string): void {
  if (!src) return;
  root.querySelector("[data-ai-chat-helper-backup-image-viewer]")?.remove();
  const layer = document.createElement("section");
  layer.className = "ai-chat-helper-backup-image-viewer";
  layer.dataset.aiChatHelperBackupImageViewer = "true";
  layer.innerHTML = `
    <div class="ai-chat-helper-backup-image-viewer__box" role="dialog" aria-modal="true" aria-label="查看图片">
      <header>
        <strong>${escapeText(title || "图片")}</strong>
        <button type="button" aria-label="关闭图片预览" data-ai-chat-helper-tooltip="关闭" data-ai-chat-helper-backup-image-viewer-close>${closeIcon}</button>
      </header>
      <img src="${escapeText(src)}" alt="${escapeText(title || "图片")}" />
    </div>
  `;
  root.appendChild(layer);
}

function renderDeleteConfirmDialog(root: HTMLElement, records: ConversationBackupRecord[]): void {
  root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
  const record = records[0];
  const multiple = records.length > 1;
  const backupIds = records.map((item) => item.id).join(",");
  const layer = document.createElement("section");
  layer.className = "ai-chat-helper-backup-delete-confirm";
  layer.dataset.aiChatHelperBackupDeleteConfirm = "true";
  layer.innerHTML = `
    <div class="ai-chat-helper-backup-delete-confirm__box" role="dialog" aria-modal="true" aria-label="${multiple ? "删除多个备份版本" : "删除备份"}">
      <header>
        <span class="ai-chat-helper-backup-delete-confirm__mark" aria-hidden="true">${deleteIcon}</span>
        <div>
          <strong>${multiple ? `删除 ${records.length} 个备份版本` : "删除备份"}</strong>
          <p>${multiple ? "此操作会同时移除所选版本，当前会话将自动切换到剩余最新版本。" : "此操作会移除这一个备份版本，已下载到本地的导出文件不会受到影响。"}</p>
        </div>
      </header>
      <dl class="ai-chat-helper-backup-delete-confirm__meta">
        <div>
          <dt>会话</dt>
          <dd>${escapeText(record.title || record.conversationId)}</dd>
        </div>
        <div>
          <dt>平台</dt>
          <dd>${escapeText(record.platformName || getPlatformName(record.platformId))}</dd>
        </div>
        <div>
          <dt>${multiple ? "数量" : "版本"}</dt>
          <dd>${multiple ? `${records.length} 个版本` : escapeText(formatFullDate(record.createdAt))}</dd>
        </div>
      </dl>
      <footer>
        <button type="button" class="ai-chat-helper-backup-delete-confirm__cancel" data-ai-chat-helper-backup-delete-cancel>取消</button>
        <button type="button" class="ai-chat-helper-backup-delete-confirm__danger" data-backup-ids="${escapeText(backupIds)}" data-ai-chat-helper-backup-delete-confirm-action>确认删除</button>
      </footer>
    </div>
  `;
  root.appendChild(layer);
  layer.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-cancel]")?.focus();
}

function getCurrentSelectedEntry(records: ConversationBackupRecord[], state: BackupLibraryState): ConversationBackupEntry | null {
  const entries = getConversationEntries(records);
  const filteredEntries = filterEntries(entries, state.platform, state.searchQuery);
  return getSelectedEntry(entries, filteredEntries, state.selectedEntryId);
}

function toggleVersionManagerSelection(selection: string[], backupId: string): string[] {
  return selection.includes(backupId)
    ? selection.filter((id) => id !== backupId)
    : [...selection, backupId];
}

function getSelectedVersionManagerRecords(records: ConversationBackupRecord[], state: BackupLibraryState): ConversationBackupRecord[] {
  const selectedIds = new Set(state.versionManagerSelection);
  const entry = getCurrentSelectedEntry(records, state);
  return entry?.versions.filter((version) => selectedIds.has(version.id)) || [];
}

function parseBackupIds(value: string): string[] {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function getVersionManagerPreviewText(messages: ConversationMessage[]): string {
  const assistantMessage = messages.find((message) => message.role === "assistant" && String(message.text || "").trim());
  if (assistantMessage?.text) return assistantMessage.text;
  const firstTextMessage = messages.find((message) => String(message.text || "").trim());
  return firstTextMessage?.text || "该版本没有可预览文本";
}

function syncVersionManagerSelectionUI(root: HTMLElement, records: ConversationBackupRecord[], state: BackupLibraryState): void {
  const manager = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-manager]");
  if (!manager) return;
  const entry = getCurrentSelectedEntry(records, state);
  if (!entry) return;

  const selectedIds = new Set(state.versionManagerSelection);
  const total = entry.versions.length;
  const allSelected = total > 0 && selectedIds.size === total;

  manager.querySelectorAll<HTMLElement>("[data-ai-chat-helper-backup-version-manager-toggle]").forEach((toggle) => {
    const backupId = toggle.dataset.backupId || "";
    const checked = selectedIds.has(backupId);
    toggle.setAttribute("aria-pressed", checked ? "true" : "false");
    const checkbox = toggle.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-version-manager-checkbox]");
    if (checkbox) checkbox.checked = checked;
  });

  const selectAllButton = manager.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-select-all]");
  if (selectAllButton) selectAllButton.textContent = allSelected ? "取消全选" : "全选";

  const bulkDeleteButton = manager.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]");
  if (bulkDeleteButton) {
    bulkDeleteButton.disabled = selectedIds.size === 0;
    bulkDeleteButton.textContent = `批量删除（${selectedIds.size}）`;
  }
}

async function runVersionDeleteAction(
  root: HTMLElement,
  state: BackupLibraryState,
  records: ConversationBackupRecord[],
  handlers: BackupLibraryHandlers,
  backupId: string
): Promise<ConversationBackupRecord[]> {
  if (!backupId) return records;
  if (!state.deletingBackupIds.includes(backupId)) {
    state.deletingBackupIds = [...state.deletingBackupIds, backupId];
  }
  state.status = "正在删除备份";
  state.error = "";
  renderVersionDropdownInPlace(root, records, state);

  try {
    await handlers.onDelete(backupId);
    const nextRecords = records.filter((record) => record.id !== backupId);
    state.deletingBackupIds = state.deletingBackupIds.filter((id) => id !== backupId);
    syncSelectionAfterDelete(nextRecords, state, {
      preserveVersionDropdown: true,
      preferredEntryId: state.selectedEntryId
    });
    state.status = "已删除备份";
    state.error = "";
    root.innerHTML = renderBackupWorkbench(nextRecords, state, {
      showBack: Boolean(root.querySelector("[data-ai-chat-helper-backup-back]"))
    });
    return nextRecords;
  } catch (error) {
    state.deletingBackupIds = state.deletingBackupIds.filter((id) => id !== backupId);
    state.error = error instanceof Error ? error.message : String(error);
    renderVersionDropdownInPlace(root, records, state);
    return records;
  }
}

function syncSelectionAfterDelete(
  records: ConversationBackupRecord[],
  state: BackupLibraryState,
  options: { preserveVersionDropdown?: boolean; preferredEntryId?: string } = {}
): void {
  const entries = getConversationEntries(records);
  const filteredEntries = filterEntries(entries, state.platform, state.searchQuery);
  const preferredEntryId = options.preferredEntryId || state.selectedEntryId;
  const currentEntry = filteredEntries.find((entry) => entry.id === preferredEntryId)
    || entries.find((entry) => entry.id === preferredEntryId && entry.platformId === state.platform)
    || filteredEntries[0]
    || null;
  state.selectedEntryId = currentEntry?.id || "";
  if (!currentEntry) {
    state.selectedVersionId = "";
    state.versionDropdownOpen = false;
    state.versionDropdownClosing = false;
    return;
  }
  state.selectedVersionId = currentEntry.versions.some((version) => version.id === state.selectedVersionId)
    ? state.selectedVersionId
    : currentEntry.latest.id;
  state.versionDropdownOpen = Boolean(options.preserveVersionDropdown && currentEntry.versions.length > 0);
  state.versionDropdownClosing = false;
}

function renderVersionManageIcon(): string {
  return `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M5.07868 5.06891C8.87402 1.27893 15.0437 1.31923 18.8622 5.13778C22.6824 8.95797 22.7211 15.1313 18.9262 18.9262C15.1312 22.7211 8.95793 22.6824 5.13774 18.8622C2.87389 16.5984 1.93904 13.5099 2.34047 10.5812C2.39672 10.1708 2.775 9.88377 3.18537 9.94002C3.59575 9.99627 3.88282 10.3745 3.82658 10.7849C3.4866 13.2652 4.27782 15.881 6.1984 17.8016C9.44288 21.0461 14.6664 21.0646 17.8655 17.8655C21.0646 14.6664 21.046 9.44292 17.8015 6.19844C14.5587 2.95561 9.33889 2.93539 6.13935 6.12957L6.88705 6.13333C7.30126 6.13541 7.63535 6.47288 7.63327 6.88709C7.63119 7.3013 7.29372 7.63539 6.87951 7.63331L4.33396 7.62052C3.92269 7.61845 3.58981 7.28556 3.58774 6.8743L3.57495 4.32874C3.57286 3.91454 3.90696 3.57707 4.32117 3.57498C4.73538 3.5729 5.07285 3.907 5.07493 4.32121L5.07868 5.06891ZM11.9999 7.24992C12.4141 7.24992 12.7499 7.58571 12.7499 7.99992V11.6893L15.0302 13.9696C15.3231 14.2625 15.3231 14.7374 15.0302 15.0302C14.7373 15.3231 14.2624 15.3231 13.9696 15.0302L11.2499 12.3106V7.99992C11.2499 7.58571 11.5857 7.24992 11.9999 7.24992Z" fill="currentColor"></path>
    </svg>
  `;
}

function getConversationEntries(records: ConversationBackupRecord[]): ConversationBackupEntry[] {
  return groupBackupRecordsByConversation(sortBackupsNewestFirst(records));
}

function getSelectedEntry(
  allEntries: ConversationBackupEntry[],
  filteredEntries: ConversationBackupEntry[],
  selectedId: string
): ConversationBackupEntry | null {
  if (filteredEntries.length === 0) {
    return null;
  }
  return filteredEntries.find((entry) => entry.id === selectedId)
    || filteredEntries[0]
    || allEntries.find((entry) => entry.id === selectedId)
    || allEntries[0]
    || null;
}

function getSelectedVersion(entry: ConversationBackupEntry | null, selectedVersionId: string): ConversationBackupRecord | null {
  if (!entry) return null;
  return entry.versions.find((record) => record.id === selectedVersionId) || entry.latest;
}

function getBackupRecordById(records: ConversationBackupRecord[], id: string): ConversationBackupRecord | null {
  return records.find((record) => record.id === id) || null;
}

function getDefaultSelectedEntry(records: ConversationBackupRecord[], platform: BackupPlatformFilter): ConversationBackupEntry | null {
  return filterEntries(getConversationEntries(records), platform)[0] || null;
}

function filterEntries(entries: ConversationBackupEntry[], platform: BackupPlatformFilter, searchQuery = ""): ConversationBackupEntry[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return entries.filter((entry) => {
    if (entry.platformId !== platform) return false;
    if (!normalizedQuery) return true;
    return getSearchableEntryText(entry).includes(normalizedQuery);
  });
}

function getSearchableEntryText(entry: ConversationBackupEntry): string {
  const latestPreview = entry.latest.previewSnapshot;
  const messageText = latestPreview?.messages.map((message) => message.text || "").join("\n") || "";
  return [
    entry.title,
    entry.platformName,
    entry.latest.platformName,
    messageText
  ].join("\n").toLowerCase();
}

function captureSearchFocus(input: HTMLInputElement): SearchFocusSnapshot {
  return {
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd
  };
}

function restoreSearchFocus(root: HTMLElement, snapshot: SearchFocusSnapshot): void {
  const input = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-search]");
  if (!input) return;
  input.focus();
  if (snapshot.selectionStart === null || snapshot.selectionEnd === null) return;
  input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
}

function sortBackupsNewestFirst(records: ConversationBackupRecord[]): ConversationBackupRecord[] {
  return [...records].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function normalizePlatformFilter(value: string | undefined): BackupPlatformFilter {
  if (value === "chatgpt" || value === "claude" || value === "qwen" || value === "doubao" || value === "deepseek") {
    return value;
  }
  return platformOrder[0];
}

function getFilterTitle(platform: BackupPlatformFilter): string {
  return getPlatformName(platform);
}

function getInitialPlatform(records: ConversationBackupRecord[]): BackupPlatformFilter {
  const entry = getConversationEntries(records)[0];
  return entry?.platformId || platformOrder[0];
}

function getAssetStatusLabel(record: ConversationBackupRecord): string {
  const status = record.assetStatus;
  if (!status) return "旧备份";
  if (status.totalImages === 0) return "无图片";
  if (status.failedImages > 0) return `${status.totalImages} 张图片，${status.cachedImages} 张已缓存，${status.failedImages} 张未缓存`;
  if (status.cachedImages === 0) return `${status.totalImages} 张图片，暂未缓存`;
  if (status.cachedImages < status.totalImages) return `${status.totalImages} 张图片，${status.cachedImages} 张已缓存`;
  return `${status.totalImages} 张图片已缓存`;
}

function formatBackupMeta(record: ConversationBackupRecord): string {
  const source = record.source === "manual" ? "手动" : "自动";
  return `${source} · ${countRecordConversationTurns(record)} 轮对话 · ${formatCompactDate(record.createdAt)}`;
}

function countRecordConversationTurns(record: ConversationBackupRecord): number {
  return countConversationTurns((record.previewSnapshot || record.snapshot).messages);
}

function formatCompactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function estimateRecordSize(record: ConversationBackupRecord): number {
  const filesSize = record.files.reduce((sum, file) => {
    if (typeof file.content === "string") return sum + file.content.length;
    if (Array.isArray(file.content)) return sum + file.content.length;
    return sum;
  }, 0);
  return filesSize + JSON.stringify(record.previewSnapshot || record.snapshot).length;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:$|[?#])/i.test(attachment.fileName || attachment.url || "");
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\//i.test(String(value || "").trim());
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function getRoleLabel(role: string): string {
  if (role === "user") return "用户";
  if (role === "assistant") return "AI 回答";
  if (role === "system") return "系统";
  return "工具";
}

function escapeText(value: string | number): string {
  return escapeHtml(String(value));
}

function escapeAttributeValue(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
