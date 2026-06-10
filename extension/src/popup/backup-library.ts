import { getPlatformName, groupBackupRecordsByConversation, type ConversationBackupEntry, type ConversationBackupRecord } from "../backup/backup-store";
import { renderMessageMarkdown } from "../exporters/html";
import type { ConversationMessage, ExportAttachment, PlatformId } from "../shared/types";
import { escapeHtml } from "../ui/shared/escape-html";

export interface BackupLibraryHandlers {
  onBack: () => void;
  onDownload: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export interface BackupLibraryOptions {
  showBack?: boolean;
}

type BackupPlatformFilter = PlatformId | "all";

interface BackupLibraryState {
  platform: BackupPlatformFilter;
  selectedEntryId: string;
  selectedVersionId: string;
  versionDropdownOpen: boolean;
  versionDropdownClosing: boolean;
  loadingDownloadId: string;
  status: string;
  error: string;
}

const platformOrder: PlatformId[] = ["chatgpt", "qwen", "doubao", "deepseek", "claude"];

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
  const state = createInitialState(records);
  const render = () => {
    root.innerHTML = renderBackupWorkbench(records, state, options);
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
      const entry = getDefaultSelectedEntry(records, state.platform);
      state.selectedEntryId = entry?.id || "";
      state.selectedVersionId = entry?.latest.id || "";
      closeVersionDropdown(false);
      state.status = "";
      state.error = "";
      render();
      return;
    }

    const recordButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-record]");
    if (recordButton) {
      const entry = getConversationEntries(records).find((item) => item.id === recordButton.dataset.backupEntryId);
      state.selectedEntryId = entry?.id || "";
      state.selectedVersionId = entry?.latest.id || "";
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
        renderVersionDropdownInPlace(root, records, state);
      }
      return;
    }

    const versionButton = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-version]");
    if (versionButton) {
      state.selectedVersionId = versionButton.dataset.backupId || "";
      closeVersionDropdown(false);
      state.status = "";
      state.error = "";
      render();
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
      const record = getBackupRecordById(records, deleteButton.dataset.backupId || "");
      if (record) renderDeleteConfirmDialog(root, record);
      return;
    }

    if (target.closest("[data-ai-chat-helper-backup-delete-cancel]")) {
      root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
      return;
    }

    const deleteConfirmAction = target.closest<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]");
    if (deleteConfirmAction) {
      const backupId = deleteConfirmAction.dataset.backupId || "";
      const deleteActionButton = root.querySelector<HTMLButtonElement>(`[data-ai-chat-helper-backup-delete][data-backup-id="${escapeAttributeValue(backupId)}"]`);
      root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
      if (deleteActionButton) {
        void runRecordAction(deleteActionButton, "正在删除备份", "已删除备份", state, () => handlers.onDelete(backupId));
      }
      return;
    }

    const deleteConfirmLayer = target.closest("[data-ai-chat-helper-backup-delete-confirm]");
    if (deleteConfirmLayer && target === deleteConfirmLayer) {
      deleteConfirmLayer.remove();
      return;
    }

    if (state.versionDropdownOpen && !target.closest("[data-ai-chat-helper-backup-version-picker]")) {
      closeVersionDropdown(true);
    }
  });

  root.addEventListener("scroll", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-ai-chat-helper-backup-message-list]")) return;
    syncBackupPreviewNodeToMessagePosition(root, target);
  }, true);
}

function createInitialState(records: ConversationBackupRecord[]): BackupLibraryState {
  const selected = getDefaultSelectedEntry(records, "all");
  return {
    platform: "all",
    selectedEntryId: selected?.id || "",
    selectedVersionId: selected?.latest.id || "",
    versionDropdownOpen: false,
    versionDropdownClosing: false,
    loadingDownloadId: "",
    status: "",
    error: ""
  };
}

function renderBackupWorkbench(records: ConversationBackupRecord[], state: BackupLibraryState, options: BackupLibraryOptions): string {
  const sortedRecords = sortBackupsNewestFirst(records);
  const entries = groupBackupRecordsByConversation(sortedRecords);
  const filteredEntries = filterEntries(entries, state.platform);
  const selectedEntry = getSelectedEntry(entries, filteredEntries, state.selectedEntryId);
  const selectedRecord = getSelectedVersion(selectedEntry, state.selectedVersionId);
  const showBack = options.showBack !== false;

  return `
    <header class="ai-chat-helper-backup-workbench__header">
      <div class="ai-chat-helper-backup-workbench__title">
        ${showBack ? `<button type="button" class="ai-chat-helper-backup-workbench__back" title="返回设置" aria-label="返回设置" data-ai-chat-helper-backup-back>${backIcon}</button>` : ""}
        <div>
          <h1>备份库</h1>
          <p>按平台查看自动备份，预览已留存的对话与图片消息。</p>
        </div>
      </div>
      ${renderSummary(sortedRecords, state)}
    </header>
    ${sortedRecords.length ? `
      <section class="ai-chat-helper-backup-workbench__body">
        ${renderPlatformNav(entries, state.platform)}
        <section class="ai-chat-helper-backup-workbench__list-panel" aria-label="备份列表">
          <div class="ai-chat-helper-backup-workbench__panel-head">
            <strong>${escapeText(getFilterTitle(state.platform))}</strong>
            <span>${filteredEntries.length} 个会话</span>
          </div>
          <div class="ai-chat-helper-backup-workbench__records" data-ai-chat-helper-backup-list>
            ${filteredEntries.length ? filteredEntries.map((entry) => renderRecordRow(entry, selectedEntry?.id === entry.id, state.loadingDownloadId === entry.latest.id)).join("") : renderPlatformEmpty(state.platform)}
          </div>
        </section>
        ${renderDetailPanel(selectedEntry, selectedRecord, state)}
      </section>
    ` : renderEmptyState()}
  `;
}

function renderSummary(records: ConversationBackupRecord[], state: BackupLibraryState): string {
  const entries = groupBackupRecordsByConversation(records);
  const platformCount = new Set(records.map((record) => record.platformId)).size;
  const latest = records[0];
  const size = records.reduce((sum, record) => sum + estimateRecordSize(record), 0);
  return `
    <dl class="ai-chat-helper-backup-workbench__summary" data-ai-chat-helper-backup-summary>
      <div>
        <dt>会话</dt>
        <dd>${entries.length} 个会话</dd>
      </div>
      <div>
        <dt>版本</dt>
        <dd>${records.length} 个版本</dd>
      </div>
      <div>
        <dt>平台</dt>
        <dd>${platformCount || 0} 个平台</dd>
      </div>
      <div>
        <dt>最新</dt>
        <dd>${escapeText(latest ? formatFullDate(latest.createdAt) : "-")}</dd>
      </div>
      <div>
        <dt>占用</dt>
        <dd>${escapeText(formatBytes(size))}</dd>
      </div>
      <div class="ai-chat-helper-backup-workbench__status" aria-live="polite">
        <dt>状态</dt>
        <dd>${escapeText(state.error || state.status || "就绪")}</dd>
      </div>
    </dl>
  `;
}

function renderPlatformNav(entries: ConversationBackupEntry[], selectedPlatform: BackupPlatformFilter): string {
  const allLatest = entries[0]?.latest.createdAt || "";
  return `
    <nav class="ai-chat-helper-backup-workbench__platforms" aria-label="备份平台" data-ai-chat-helper-backup-platform-nav>
      ${renderPlatformButton("all", "全部", entries.length, allLatest, selectedPlatform === "all")}
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
  return `
    <button type="button" class="ai-chat-helper-backup-platform${selected ? " is-active" : ""}" data-ai-chat-helper-backup-platform="${escapeText(platform)}" aria-pressed="${selected}">
      <span>${escapeText(label)}</span>
      <strong>${count}</strong>
      <small>${escapeText(latest ? formatCompactDate(latest) : "暂无备份")}</small>
    </button>
  `;
}

function renderRecordRow(entry: ConversationBackupEntry, selected: boolean, isLoading: boolean): string {
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
        <button type="button" title="下载备份" aria-label="下载备份" data-backup-id="${escapeText(record.id)}" data-ai-chat-helper-backup-download ${isLoading ? "disabled aria-busy=\"true\"" : ""}>
          ${downloadIcon}
        </button>
        <button type="button" title="删除备份" aria-label="删除备份" data-backup-id="${escapeText(record.id)}" data-ai-chat-helper-backup-delete>
          ${deleteIcon}
        </button>
      </div>
    </article>
  `;
}

function renderDetailPanel(entry: ConversationBackupEntry | null, record: ConversationBackupRecord | null, state: BackupLibraryState): string {
  if (!entry || !record) {
    return `
      <aside class="ai-chat-helper-backup-detail" data-ai-chat-helper-backup-detail>
        <div class="ai-chat-helper-backup-detail__empty">请选择一个备份查看预览。</div>
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
          <button type="button" title="下载备份" aria-label="下载备份" data-backup-id="${escapeText(record.id)}" data-ai-chat-helper-backup-download ${state.loadingDownloadId === record.id ? "disabled aria-busy=\"true\"" : ""}>${downloadIcon}</button>
          <button type="button" title="删除备份" aria-label="删除备份" data-backup-id="${escapeText(record.id)}" data-ai-chat-helper-backup-delete>${deleteIcon}</button>
        </div>
      </header>
      ${renderVersionHistory(entry, state)}
      ${isLegacyPreview ? `<p class="ai-chat-helper-backup-detail__notice">旧备份，图片可能依赖原始链接。</p>` : ""}
      <div class="ai-chat-helper-backup-detail__messages">
        ${renderPreviewMessages(previewSnapshot.messages, previewSnapshot.platformId)}
      </div>
    </aside>
  `;
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
              <button
                type="button"
                role="option"
                class="ai-chat-helper-backup-version${version.id === selectedVersion.id ? " is-active" : ""}"
                data-ai-chat-helper-backup-version
                data-backup-id="${escapeText(version.id)}"
                aria-selected="${version.id === selectedVersion.id}"
              >
                <span>${escapeText(getVersionLabel(entry, index))}</span>
                <strong>${escapeText(formatCompactDate(version.createdAt))}</strong>
                <small>${escapeText(formatVersionMeta(version, false))}</small>
              </button>
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
    <button
      type="button"
      role="option"
      class="ai-chat-helper-backup-version${version.id === selectedVersion.id ? " is-active" : ""}"
      data-ai-chat-helper-backup-version
      data-backup-id="${escapeText(version.id)}"
      aria-selected="${version.id === selectedVersion.id}"
    >
      <span>${escapeText(getVersionLabel(entry, index))}</span>
      <strong>${escapeText(formatCompactDate(version.createdAt))}</strong>
      <small>${escapeText(formatVersionMeta(version, false))}</small>
    </button>
  `).join("");
  picker.appendChild(list);
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
      title="定位到第 ${node.threadIndex} 轮 ${escapeText(roleLabel)}"
      aria-label="定位到第 ${node.threadIndex} 轮 ${escapeText(roleLabel)}"
    >
      <span>${escapeText(node.label)}</span>
    </button>
  `;
}

function renderPreviewMessage(message: ConversationMessage, index: number, platformId: PlatformId): string {
  const attachments = message.attachments || [];
  return `
    <article class="ai-chat-helper-backup-message ai-chat-helper-backup-message--${escapeText(message.role)}" data-ai-chat-helper-backup-message data-message-index="${index}">
      <div class="ai-chat-helper-backup-message__text">
        ${renderMessageText(message.text || "(空消息)", platformId)}
      </div>
      ${attachments.length ? `<div class="ai-chat-helper-backup-message__attachments">${attachments.map(renderAttachmentPreview).join("")}</div>` : ""}
    </article>
  `;
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
      <button type="button" class="ai-chat-helper-backup-image" data-ai-chat-helper-backup-image data-image-src="${escapeText(url)}" data-image-title="${escapeText(title)}" title="查看图片" aria-label="查看图片 ${escapeText(title)}">
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

function renderPlatformEmpty(platform: BackupPlatformFilter): string {
  return `
    <div class="ai-chat-helper-backup-workbench__empty-inline">
      <strong>${escapeText(getFilterTitle(platform))}暂无备份</strong>
      <p>切换到其他平台，或等待自动备份生成新的记录。</p>
    </div>
  `;
}

function renderEmptyState(): string {
  return `
    <section class="ai-chat-helper-backup-workbench__empty">
      <h2>暂无备份</h2>
      <p>开启自动备份后，当前对话会按平台保存到这里，并保留可预览的图片消息。</p>
    </section>
  `;
}

async function runRecordAction(
  button: HTMLButtonElement,
  loadingText: string,
  successText: string,
  state: BackupLibraryState,
  action: () => void | Promise<void>
): Promise<void> {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  state.loadingDownloadId = button.dataset.backupId || "";
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
    state.loadingDownloadId = "";
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function setLiveStatus(button: HTMLButtonElement, value: string): void {
  const root = button.closest<HTMLElement>(".ai-chat-helper-backup-workbench");
  const status = root?.querySelector<HTMLElement>(".ai-chat-helper-backup-workbench__status dd");
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
        <button type="button" title="关闭" aria-label="关闭图片预览" data-ai-chat-helper-backup-image-viewer-close>${closeIcon}</button>
      </header>
      <img src="${escapeText(src)}" alt="${escapeText(title || "图片")}" />
    </div>
  `;
  root.appendChild(layer);
}

function renderDeleteConfirmDialog(root: HTMLElement, record: ConversationBackupRecord): void {
  root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")?.remove();
  const layer = document.createElement("section");
  layer.className = "ai-chat-helper-backup-delete-confirm";
  layer.dataset.aiChatHelperBackupDeleteConfirm = "true";
  layer.innerHTML = `
    <div class="ai-chat-helper-backup-delete-confirm__box" role="dialog" aria-modal="true" aria-label="删除备份">
      <header>
        <span class="ai-chat-helper-backup-delete-confirm__mark" aria-hidden="true">${deleteIcon}</span>
        <div>
          <strong>删除备份</strong>
          <p>此操作会移除这一个备份版本，已下载到本地的导出文件不会受到影响。</p>
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
          <dt>版本</dt>
          <dd>${escapeText(formatFullDate(record.createdAt))}</dd>
        </div>
      </dl>
      <footer>
        <button type="button" class="ai-chat-helper-backup-delete-confirm__cancel" data-ai-chat-helper-backup-delete-cancel>取消</button>
        <button type="button" class="ai-chat-helper-backup-delete-confirm__danger" data-backup-id="${escapeText(record.id)}" data-ai-chat-helper-backup-delete-confirm-action>确认删除</button>
      </footer>
    </div>
  `;
  root.appendChild(layer);
  layer.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-cancel]")?.focus();
}

function getConversationEntries(records: ConversationBackupRecord[]): ConversationBackupEntry[] {
  return groupBackupRecordsByConversation(sortBackupsNewestFirst(records));
}

function getSelectedEntry(
  allEntries: ConversationBackupEntry[],
  filteredEntries: ConversationBackupEntry[],
  selectedId: string
): ConversationBackupEntry | null {
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

function filterEntries(entries: ConversationBackupEntry[], platform: BackupPlatformFilter): ConversationBackupEntry[] {
  if (platform === "all") return entries;
  return entries.filter((entry) => entry.platformId === platform);
}

function sortBackupsNewestFirst(records: ConversationBackupRecord[]): ConversationBackupRecord[] {
  return [...records].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function normalizePlatformFilter(value: string | undefined): BackupPlatformFilter {
  if (value === "chatgpt" || value === "claude" || value === "qwen" || value === "doubao" || value === "deepseek") {
    return value;
  }
  return "all";
}

function getFilterTitle(platform: BackupPlatformFilter): string {
  return platform === "all" ? "全部备份" : getPlatformName(platform);
}

function getAssetStatusLabel(record: ConversationBackupRecord): string {
  const status = record.assetStatus;
  if (!status) return "旧备份";
  if (status.cachedImages === 0 && status.failedImages === 0) return "无图片缓存";
  if (status.failedImages > 0) return `${status.cachedImages} 张已缓存，${status.failedImages} 张未缓存`;
  return `${status.cachedImages} 张图片已缓存`;
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
