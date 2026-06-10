import type { SnapshotExportFormat } from "../../exporters/snapshot-export";
import { renderMessageMarkdown } from "../../exporters/html";
import { getChatGPTImagePreviewModel } from "../../exporters/shared";
import type { BatchConversationSelection, ConversationSnapshot, ConversationSummary } from "../../shared/types";
import { escapeHtml } from "../shared/escape-html";

type ExportHandlerResult = void | Promise<void>;
type CurrentExportHandler = (format: SnapshotExportFormat, selectedSnapshot: ConversationSnapshot) => ExportHandlerResult;
type BatchExportHandler = (format: SnapshotExportFormat, selections: BatchConversationSelection[]) => ExportHandlerResult;
type BatchPreviewLoader = (summary: ConversationSummary) => Promise<ConversationSnapshot>;

interface BatchExportModalOptions {
  onExport?: BatchExportHandler;
  loadSnapshot?: BatchPreviewLoader;
  onPreviewError?: (summary: ConversationSummary, error: Error) => void;
}

const closeIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
`;

const chevronIcon = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
`;

const previewIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

type VisibleExportFormat = Exclude<SnapshotExportFormat, "zip">;

const exportFormats: Array<{ format: VisibleExportFormat; label: string }> = [
  { format: "markdown", label: "Markdown" },
  { format: "html", label: "HTML" },
  { format: "txt", label: "TXT" }
];

const modalDismissStack: Array<{ layer: HTMLElement; close: () => void }> = [];
let modalDismissKeydownBound = false;

export function createExportModal(
  snapshot: ConversationSnapshot,
  onExport?: CurrentExportHandler
): HTMLElement {
  const modal = document.createElement("div");
  const textWithoutThoughtMessageIds = new Set<string>();

  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box ai-chat-helper-export-modal__box--current" role="dialog" aria-modal="true" aria-label="导出当前对话">
      ${renderHeader("导出当前对话", `${snapshot.title || snapshot.conversationId} · ${snapshot.messages.length} 条消息`)}
      <div class="ai-chat-helper-export-modal__current-toolbar">
        <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--danger" data-ai-chat-helper-current-toggle>全不选</button>
        <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--answer" data-ai-chat-helper-only-assistant>仅选回答</button>
        ${shouldRenderExcludeThoughtButton(snapshot) ? '<button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--thought" data-ai-chat-helper-exclude-thought>排除思考过程</button>' : ""}
        <span class="ai-chat-helper-export-modal__spacer"></span>
        <span class="ai-chat-helper-export-modal__count" data-ai-chat-helper-current-selection-status>已选 0 条</span>
        ${renderExportMenuTrigger()}
      </div>
      <div class="ai-chat-helper-export-modal__message-list">
        ${snapshot.messages.length ? snapshot.messages.map((message, index) => `
          ${renderSelectablePreviewMessageRow(snapshot, message, index, {
            checked: true,
            inputAttribute: "data-ai-chat-helper-message-item",
            viewAttribute: "data-ai-chat-helper-message-view",
            textAttribute: "data-ai-chat-helper-message-text",
            strippedMessageIds: textWithoutThoughtMessageIds
          })}
        `).join("") : `
          <div class="ai-chat-helper-export-modal__empty">未检测到可导出的内容</div>
        `}
      </div>
    </div>
  `;

  const itemInputs = Array.from(modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-message-item]"));
  const formatButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>("[data-format]"));
  const selectionStatus = modal.querySelector<HTMLElement>("[data-ai-chat-helper-current-selection-status]");
  const toggleButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-current-toggle]");
  const assistantButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-only-assistant]");
  const thoughtButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-exclude-thought]");
  const exportTrigger = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]");
  const closeModal = registerDismissLayer(modal, () => modal.remove());

  const updateSelectionState = () => {
    const selectedCount = itemInputs.filter((input) => input.checked).length;
    const hasSelection = selectedCount > 0;
    if (selectionStatus) selectionStatus.textContent = `已选 ${selectedCount} 条`;
    if (toggleButton) {
      const allSelected = itemInputs.length > 0 && selectedCount === itemInputs.length;
      toggleButton.disabled = itemInputs.length === 0;
      toggleButton.textContent = allSelected ? "全不选" : "全选";
      toggleButton.classList.toggle("ai-chat-helper-export-modal__button--danger", allSelected);
      toggleButton.classList.toggle("ai-chat-helper-export-modal__button--primary-soft", !allSelected);
    }
    if (assistantButton) assistantButton.disabled = itemInputs.length === 0;
    if (thoughtButton) thoughtButton.disabled = itemInputs.length === 0;
    if (exportTrigger) exportTrigger.disabled = !hasSelection;
    formatButtons.forEach((button) => {
      button.disabled = !hasSelection;
    });
  };

  itemInputs.forEach((input) => input.addEventListener("change", updateSelectionState));
  toggleButton?.addEventListener("click", () => {
    const allSelected = itemInputs.length > 0 && itemInputs.every((input) => input.checked);
    itemInputs.forEach((input) => {
      input.checked = !allSelected;
    });
    updateSelectionState();
  });
  assistantButton?.addEventListener("click", () => {
    itemInputs.forEach((input) => {
      const message = snapshot.messages[Number(input.dataset.index)];
      input.checked = message?.role === "assistant";
    });
    updateSelectionState();
  });
  thoughtButton?.addEventListener("click", () => {
    itemInputs.forEach((input) => {
      const message = snapshot.messages[Number(input.dataset.index)];
      if (message && isThoughtMessage(message)) input.checked = false;
      if (message && hasTextWithoutThought(message)) {
        textWithoutThoughtMessageIds.add(message.id);
        const textEl = modal.querySelector<HTMLElement>(`[data-ai-chat-helper-message-text][data-index="${input.dataset.index}"]`);
        if (textEl) {
          textEl.innerHTML = renderMessageMarkdown(message.textWithoutThought || "(空消息)", snapshot.platformId);
          textEl.classList.remove("ai-chat-helper-export-modal__message-text--media");
        }
      }
    });
    updateSelectionState();
  });
  bindMessageFullPreviewButtons(modal, snapshot, textWithoutThoughtMessageIds, "[data-ai-chat-helper-message-view]");
  formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isExporting(modal)) return;
      const selectedMessages = itemInputs
        .filter((input) => input.checked)
        .map((input) => snapshot.messages[Number(input.dataset.index)])
        .filter((message): message is ConversationSnapshot["messages"][number] => Boolean(message));
      if (!selectedMessages.length) return;
      const format = button.dataset.format as SnapshotExportFormat;
      void runExportWithLoading(modal, format, async () => {
        await onExport?.(format, {
          ...snapshot,
          messages: selectedMessages.map((message) => applyTextWithoutThought(message, textWithoutThoughtMessageIds))
        });
      }, closeModal);
    });
  });
  bindExportMenu(modal);
  bindClose(modal, closeModal);
  updateSelectionState();
  return modal;
}

export function openExportModal(snapshot: ConversationSnapshot, onExport?: CurrentExportHandler): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();
  const modal = createExportModal(snapshot, onExport);
  document.body.appendChild(modal);
}

export function createBatchExportModal(
  summaries: ConversationSummary[],
  optionsOrHandler?: BatchExportHandler | BatchExportModalOptions
): HTMLElement {
  const options = normalizeBatchExportOptions(optionsOrHandler);
  const modal = document.createElement("div");
  const messageSelectionByConversation = new Map<string, number[]>();
  const textWithoutThoughtMessageIdsByConversation = new Map<string, string[]>();
  const snapshotCache = new Map<string, ConversationSnapshot>();

  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box ai-chat-helper-export-modal__box--batch" role="dialog" aria-modal="true" aria-label="批量导出对话">
      ${renderHeader("批量导出对话", `${summaries.length} 个对话`)}
      <div class="ai-chat-helper-export-modal__batch-body">
        <div class="ai-chat-helper-export-modal__batch-card">
          <div class="ai-chat-helper-export-modal__batch-toolbar">
            <div>
              <strong>历史会话</strong>
              <span data-ai-chat-helper-batch-selection-status>已选 0 条</span>
            </div>
            <div class="ai-chat-helper-export-modal__batch-actions">
              <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--primary-soft" data-ai-chat-helper-batch-toggle>全选</button>
              ${renderExportMenuTrigger()}
            </div>
          </div>
          <div class="ai-chat-helper-export-modal__batch-list">
            ${summaries.length ? summaries.map((summary, index) => renderBatchSummary(summary, index, Boolean(options.loadSnapshot))).join("") : `
              <div class="ai-chat-helper-export-modal__empty">暂无可导出的历史会话。</div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  const itemInputs = Array.from(modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-item]"));
  const formatButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>("[data-format]"));
  const selectionStatus = modal.querySelector<HTMLElement>("[data-ai-chat-helper-batch-selection-status]");
  const toggleButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-toggle]");
  const exportTrigger = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]");
  const previewButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]"));
  const closeModal = registerDismissLayer(modal, () => modal.remove());
  const updateSelectionState = () => {
    const selectedCount = itemInputs.filter((input) => input.checked).length;
    const hasSelection = selectedCount > 0;
    formatButtons.forEach((button) => {
      button.disabled = !hasSelection;
    });
    if (exportTrigger) exportTrigger.disabled = !hasSelection;
    if (selectionStatus) selectionStatus.textContent = `已选 ${selectedCount} 条`;
    if (toggleButton) {
      toggleButton.disabled = itemInputs.length === 0;
      const allSelected = selectedCount === itemInputs.length && itemInputs.length > 0;
      toggleButton.textContent = allSelected ? "全不选" : "全选";
      toggleButton.classList.toggle("ai-chat-helper-export-modal__button--danger", allSelected);
      toggleButton.classList.toggle("ai-chat-helper-export-modal__button--primary-soft", !allSelected);
    }
  };

  itemInputs.forEach((input) => input.addEventListener("change", updateSelectionState));
  toggleButton?.addEventListener("click", () => {
    const allSelected = itemInputs.length > 0 && itemInputs.every((input) => input.checked);
    itemInputs.forEach((input) => {
      input.checked = !allSelected;
    });
    updateSelectionState();
  });
  previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const summary = summaries[Number(button.dataset.index)];
      if (!summary) return;
      void openBatchPreview(summary);
    });
  });
  formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isExporting(modal)) return;
      const selections = itemInputs
        .filter((input) => input.checked)
        .map((input): BatchConversationSelection | null => {
          const summary = summaries[Number(input.dataset.index)];
          if (!summary) return null;
          const textWithoutThoughtMessageIds = getStoredTextWithoutThoughtMessageIds(summary);
          return {
            summary,
            selectedMessageIndices: getStoredSelection(summary),
            ...(textWithoutThoughtMessageIds.length ? { textWithoutThoughtMessageIds } : {})
          };
        })
        .filter((selection): selection is BatchConversationSelection => selection !== null);
      if (!selections.length) return;
      const format = button.dataset.format as SnapshotExportFormat;
      void runExportWithLoading(modal, format, async () => {
        await options.onExport?.(format, selections);
      }, closeModal);
    });
  });
  bindExportMenu(modal);
  bindClose(modal, closeModal);
  updateSelectionState();
  return modal;

  async function openBatchPreview(summary: ConversationSummary): Promise<void> {
    if (!options.loadSnapshot) return;

    const key = getConversationSelectionKey(summary);
    renderBatchPreviewShell(summary, "loading");

    try {
      const snapshot = snapshotCache.get(key) || await options.loadSnapshot(summary);
      snapshotCache.set(key, snapshot);
      renderBatchPreviewMessages(summary, snapshot);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      options.onPreviewError?.(summary, normalizedError);
      renderBatchPreviewShell(summary, "error", normalizedError.message);
    }
  }

  function renderBatchPreviewShell(
    summary: ConversationSummary,
    state: "loading" | "error",
    errorMessage = ""
  ): void {
    removeBatchPreview(modal);
    const preview = document.createElement("div");
    preview.className = "ai-chat-helper-export-modal__preview";
    preview.dataset.aiChatHelperBatchPreviewPanel = "true";
    preview.innerHTML = `
      <div class="ai-chat-helper-export-modal__preview-box" role="dialog" aria-modal="true" aria-label="查看对话消息">
        ${renderPreviewHeader(summary)}
        <div class="ai-chat-helper-export-modal__preview-state">
          ${state === "loading" ? `
            <div class="ai-chat-helper-export-modal__spinner" aria-hidden="true"></div>
            <strong>正在加载对话消息...</strong>
            <span>请稍候，预览和导出列表即将就绪</span>
          ` : `
            <strong>加载失败</strong>
            <span>${escapeHtml(errorMessage || "无法加载该会话消息")}</span>
          `}
        </div>
      </div>
    `;
    modal.appendChild(preview);
    const closePreview = registerDismissLayer(preview, () => preview.remove());
    bindBatchPreviewClose(preview, closePreview);
  }

  function renderBatchPreviewMessages(summary: ConversationSummary, snapshot: ConversationSnapshot): void {
    removeBatchPreview(modal);
    const preview = document.createElement("div");
    const storedSelection = normalizeMessageSelectionIndices(
      getStoredSelection(summary),
      snapshot.messages.length
    ) || buildDefaultMessageSelection(snapshot.messages.length);
    const selectedIndexSet = new Set(storedSelection);
    const textWithoutThoughtMessageIds = new Set(getStoredTextWithoutThoughtMessageIds(summary));

    preview.className = "ai-chat-helper-export-modal__preview";
    preview.dataset.aiChatHelperBatchPreviewPanel = "true";
    preview.innerHTML = `
      <div class="ai-chat-helper-export-modal__preview-box" role="dialog" aria-modal="true" aria-label="查看对话消息">
        ${renderPreviewHeader(summary)}
        <div class="ai-chat-helper-export-modal__current-toolbar">
          <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--danger" data-ai-chat-helper-batch-preview-toggle>全不选</button>
          <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--answer" data-ai-chat-helper-batch-preview-only-assistant>仅选回答</button>
          ${shouldRenderExcludeThoughtButton(snapshot) ? '<button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--thought" data-ai-chat-helper-batch-preview-exclude-thought>排除思考过程</button>' : ""}
          <span class="ai-chat-helper-export-modal__spacer"></span>
          <span class="ai-chat-helper-export-modal__count" data-ai-chat-helper-batch-preview-selection-status>已选 0 条</span>
          <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--primary-soft" data-ai-chat-helper-batch-preview-close>完成</button>
        </div>
        <div class="ai-chat-helper-export-modal__message-list">
          ${snapshot.messages.length ? snapshot.messages.map((message, index) => `
            ${renderSelectablePreviewMessageRow(snapshot, message, index, {
              checked: selectedIndexSet.has(index),
              inputAttribute: "data-ai-chat-helper-batch-message-item",
              viewAttribute: "data-ai-chat-helper-batch-message-view",
              textAttribute: "data-ai-chat-helper-batch-message-text",
              strippedMessageIds: textWithoutThoughtMessageIds
            })}
          `).join("") : `
            <div class="ai-chat-helper-export-modal__empty">该会话暂无可预览的消息内容。</div>
          `}
        </div>
      </div>
    `;
    modal.appendChild(preview);
    const closePreview = registerDismissLayer(preview, () => preview.remove());
    bindBatchPreviewClose(preview, closePreview);

    const messageInputs = Array.from(preview.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-message-item]"));
    const status = preview.querySelector<HTMLElement>("[data-ai-chat-helper-batch-preview-selection-status]");
    const toggle = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-toggle]");
    const assistantButton = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-only-assistant]");
    const thoughtButton = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-exclude-thought]");
    bindMessageFullPreviewButtons(preview, snapshot, textWithoutThoughtMessageIds, "[data-ai-chat-helper-batch-message-view]");

    const persistSelection = () => {
      messageSelectionByConversation.set(
        getConversationSelectionKey(summary),
        messageInputs
          .filter((input) => input.checked)
          .map((input) => Number(input.dataset.index))
      );
    };
    const persistTextWithoutThoughtMessageIds = () => {
      textWithoutThoughtMessageIdsByConversation.set(
        getConversationSelectionKey(summary),
        Array.from(textWithoutThoughtMessageIds)
      );
    };

    const updatePreviewSelectionState = () => {
      const selectedCount = messageInputs.filter((input) => input.checked).length;
      if (status) status.textContent = `已选 ${selectedCount} 条`;
      if (toggle) {
        const allSelected = messageInputs.length > 0 && selectedCount === messageInputs.length;
        toggle.disabled = messageInputs.length === 0;
        toggle.textContent = allSelected ? "全不选" : "全选";
        toggle.classList.toggle("ai-chat-helper-export-modal__button--danger", allSelected);
        toggle.classList.toggle("ai-chat-helper-export-modal__button--primary-soft", !allSelected);
      }
      if (assistantButton) assistantButton.disabled = messageInputs.length === 0;
      if (thoughtButton) thoughtButton.disabled = messageInputs.length === 0;
      persistSelection();
    };

    messageInputs.forEach((input) => input.addEventListener("change", updatePreviewSelectionState));
    toggle?.addEventListener("click", () => {
      const allSelected = messageInputs.length > 0 && messageInputs.every((input) => input.checked);
      messageInputs.forEach((input) => {
        input.checked = !allSelected;
      });
      updatePreviewSelectionState();
    });
    assistantButton?.addEventListener("click", () => {
      messageInputs.forEach((input) => {
        const message = snapshot.messages[Number(input.dataset.index)];
        input.checked = message?.role === "assistant";
      });
      updatePreviewSelectionState();
    });
    thoughtButton?.addEventListener("click", () => {
      messageInputs.forEach((input) => {
        const message = snapshot.messages[Number(input.dataset.index)];
        if (message && isThoughtMessage(message)) input.checked = false;
        if (message && hasTextWithoutThought(message)) {
          textWithoutThoughtMessageIds.add(message.id);
          const textEl = preview.querySelector<HTMLElement>(`[data-ai-chat-helper-batch-message-text][data-index="${input.dataset.index}"]`);
          if (textEl) {
            textEl.innerHTML = renderMessageMarkdown(message.textWithoutThought || "(空消息)", snapshot.platformId);
            textEl.classList.remove("ai-chat-helper-export-modal__message-text--media");
          }
        }
      });
      persistTextWithoutThoughtMessageIds();
      updatePreviewSelectionState();
    });
    updatePreviewSelectionState();
  }

  function getStoredSelection(summary: ConversationSummary): number[] | undefined {
    return messageSelectionByConversation.get(getConversationSelectionKey(summary));
  }

  function getStoredTextWithoutThoughtMessageIds(summary: ConversationSummary): string[] {
    return textWithoutThoughtMessageIdsByConversation.get(getConversationSelectionKey(summary)) || [];
  }
}

export function openBatchExportModal(
  summaries: ConversationSummary[],
  optionsOrHandler?: BatchExportHandler | BatchExportModalOptions
): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();
  const modal = createBatchExportModal(summaries, optionsOrHandler);
  document.body.appendChild(modal);
}

async function runExportWithLoading(
  modal: HTMLElement,
  format: SnapshotExportFormat,
  action: () => Promise<void>,
  closeModal: () => void
): Promise<void> {
  setExporting(modal, true);
  renderExportLoading(modal, format);
  try {
    await action();
    closeModal();
  } catch (error) {
    console.error("[AI Chat Helper] export action failed", error);
    renderExportLoading(modal, format, error instanceof Error ? error.message : String(error || "导出失败"));
  }
}

function isExporting(modal: HTMLElement): boolean {
  return modal.dataset.aiChatHelperExporting === "true";
}

function setExporting(modal: HTMLElement, exporting: boolean): void {
  modal.dataset.aiChatHelperExporting = exporting ? "true" : "false";
  modal.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.hasAttribute("data-ai-chat-helper-export-loading-close")) return;
    button.disabled = exporting;
  });
  modal.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.disabled = exporting;
  });
}

function renderExportLoading(modal: HTMLElement, format: SnapshotExportFormat, errorMessage = ""): void {
  modal.querySelector("[data-ai-chat-helper-export-loading]")?.remove();
  const layer = document.createElement("div");
  layer.className = "ai-chat-helper-export-modal__export-loading";
  layer.dataset.aiChatHelperExportLoading = "true";
  if (errorMessage) {
    setExporting(modal, false);
    layer.innerHTML = `
      <div class="ai-chat-helper-export-modal__export-loading-box" role="alert">
        <strong>导出失败</strong>
        <span>${escapeHtml(errorMessage)}</span>
        <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--primary-soft" data-ai-chat-helper-export-loading-close>返回</button>
      </div>
    `;
    layer.querySelector("[data-ai-chat-helper-export-loading-close]")?.addEventListener("click", () => layer.remove());
  } else {
    layer.innerHTML = `
      <div class="ai-chat-helper-export-modal__export-loading-box" role="status" aria-live="polite">
        <div class="ai-chat-helper-export-modal__spinner" aria-hidden="true"></div>
        <strong>正在导出文件...</strong>
        <span>${escapeHtml(formatExportName(format))} 文件正在生成，请稍候</span>
      </div>
    `;
  }
  modal.appendChild(layer);
}

function formatExportName(format: SnapshotExportFormat): string {
  if (format === "markdown") return "Markdown";
  if (format === "html") return "HTML";
  if (format === "txt") return "TXT";
  return "ZIP";
}

function renderBatchSummary(summary: ConversationSummary, index: number, canPreview: boolean): string {
  const id = `<span>会话ID: ${escapeHtml(summary.conversationId || "-")}</span>`;
  const count = `<span>消息数: ${typeof summary.messageCount === "number" ? `${summary.messageCount} 条消息` : "-"}</span>`;
  const updatedAtText = summary.updatedAtText || (summary.updatedAt ? formatDate(summary.updatedAt) : "");
  const createdAtText = summary.createdAtText || (summary.createdAt ? formatDate(summary.createdAt) : "");
  const updatedAt = `<span>更新时间: ${escapeHtml(updatedAtText || "-")}</span>`;
  const createdAt = `<span>创建时间: ${escapeHtml(createdAtText || "-")}</span>`;
  const meta = [id, count, updatedAt, createdAt].join("");

  return `
    <div class="ai-chat-helper-export-modal__batch-item">
      <label class="ai-chat-helper-export-modal__batch-select">
        <input type="checkbox" checked data-index="${index}" data-ai-chat-helper-batch-item />
        <span>
          <strong>${escapeHtml(summary.title || summary.conversationId)}</strong>
          <small>${meta || escapeHtml(summary.conversationId)}</small>
        </span>
      </label>
      ${canPreview ? `
        <button type="button" class="ai-chat-helper-export-modal__batch-preview-button" data-index="${index}" data-ai-chat-helper-batch-preview aria-label="查看该对话消息" title="查看该对话消息">${previewIcon}</button>
      ` : ""}
    </div>
  `;
}

function normalizeBatchExportOptions(
  optionsOrHandler: BatchExportHandler | BatchExportModalOptions | undefined
): BatchExportModalOptions {
  if (typeof optionsOrHandler === "function") return { onExport: optionsOrHandler };
  return optionsOrHandler || {};
}

function renderPreviewHeader(summary: ConversationSummary): string {
  return `
    <div class="ai-chat-helper-export-modal__header">
      <div>
        <strong>查看对话消息</strong>
        <span>${escapeHtml(summary.platformId)} · ${escapeHtml(summary.title || summary.conversationId)}</span>
      </div>
      <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-batch-preview-close aria-label="关闭" title="关闭">${closeIcon}</button>
    </div>
  `;
}

function bindBatchPreviewClose(preview: HTMLElement, close: () => void): void {
  preview.querySelectorAll("[data-ai-chat-helper-batch-preview-close]").forEach((button) => {
    button.addEventListener("click", close);
  });
}

function removeBatchPreview(modal: HTMLElement): void {
  const preview = modal.querySelector<HTMLElement>("[data-ai-chat-helper-batch-preview-panel]");
  if (!preview) return;
  if (!closeDismissLayerForElement(preview)) preview.remove();
}

function getConversationSelectionKey(summary: ConversationSummary): string {
  return `${summary.platformId}:${summary.conversationId}`;
}

function normalizeMessageSelectionIndices(indices: number[] | undefined, totalCount: number): number[] | null {
  if (!Array.isArray(indices)) return null;
  return Array.from(new Set(indices))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < totalCount)
    .sort((a, b) => a - b);
}

function buildDefaultMessageSelection(totalCount: number): number[] {
  return Array.from({ length: Math.max(0, totalCount) }, (_, index) => index);
}

function renderHeader(title: string, meta: string): string {
  return `
    <div class="ai-chat-helper-export-modal__header">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
      <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-close-export aria-label="关闭" title="关闭">${closeIcon}</button>
    </div>
  `;
}

function renderExportMenuTrigger(): string {
  return `
    <div class="ai-chat-helper-export-modal__menu-wrap">
      <button type="button" class="ai-chat-helper-export-modal__button ai-chat-helper-export-modal__button--export" aria-expanded="false" data-ai-chat-helper-export-menu-trigger>
        <span>导出</span>
        <span class="ai-chat-helper-export-modal__menu-icon">${chevronIcon}</span>
      </button>
      <div class="ai-chat-helper-export-modal__menu" aria-hidden="true" data-ai-chat-helper-export-menu>
        ${exportFormats.map((item) => `
          <button type="button" class="ai-chat-helper-export-modal__menu-item" data-format="${item.format}">${item.label}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function bindExportMenu(modal: HTMLElement): void {
  const trigger = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]");
  const menu = modal.querySelector<HTMLElement>("[data-ai-chat-helper-export-menu]");
  const icon = modal.querySelector<HTMLElement>(".ai-chat-helper-export-modal__menu-icon");
  if (!trigger || !menu) return;

  const setOpen = (open: boolean) => {
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", open ? "false" : "true");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (icon) icon.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (trigger.disabled) return;
    setOpen(!menu.classList.contains("is-open"));
  });
  modal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (menu.contains(target) || trigger.contains(target)) return;
    setOpen(false);
  });
}

function bindClose(modal: HTMLElement, close: () => void): void {
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", close);
}

function registerDismissLayer(layer: HTMLElement, remove: () => void): () => void {
  ensureModalDismissKeydown();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    remove();
    removeDismissLayer(close);
  };
  modalDismissStack.push({ layer, close });
  layer.addEventListener("click", (event) => {
    if (event.target === layer) close();
  });
  return close;
}

function ensureModalDismissKeydown(): void {
  if (modalDismissKeydownBound) return;
  modalDismissKeydownBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    pruneDismissStack();
    const top = modalDismissStack[modalDismissStack.length - 1];
    if (!top) return;
    event.preventDefault();
    top.close();
  }, true);
}

function removeDismissLayer(close: () => void): void {
  const index = modalDismissStack.findIndex((entry) => entry.close === close);
  if (index >= 0) modalDismissStack.splice(index, 1);
  pruneDismissStack();
}

function closeDismissLayerForElement(layer: HTMLElement): boolean {
  pruneDismissStack();
  const entry = modalDismissStack.find((item) => item.layer === layer);
  if (!entry) return false;
  entry.close();
  return true;
}

function pruneDismissStack(): void {
  for (let index = modalDismissStack.length - 1; index >= 0; index -= 1) {
    if (modalDismissStack[index].layer.isConnected) continue;
    modalDismissStack.splice(index, 1);
  }
}

function getMessageRoleLabel(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number]
): string {
  const role = message.role;
  if (role === "user") return "用户问题";
  if (snapshot.platformId === "doubao" && message.isArtifact) return "豆包 代码编辑器内容";
  if (snapshot.platformId === "deepseek") {
    if (message.isThought) return "DeepSeek 思考过程";
    if (message.isSearch || String(message.fragmentType || "").toUpperCase() === "SEARCH") return "DeepSeek 智能搜索";
    if (String(message.fragmentType || "").toUpperCase() === "RESPONSE") return "DeepSeek AI回答";
  }
  if (role === "assistant") return "AI回答";
  if (role === "system") return "系统消息";
  return "工具消息";
}

function hasThoughtMessages(messages: ConversationSnapshot["messages"]): boolean {
  return messages.some(isThoughtMessage);
}

function shouldRenderExcludeThoughtButton(snapshot: ConversationSnapshot): boolean {
  return snapshot.platformId === "deepseek";
}

function isThoughtMessage(message: ConversationSnapshot["messages"][number]): boolean {
  return Boolean(message.isThought || String(message.fragmentType || "").toUpperCase() === "THINK");
}

function hasTextWithoutThought(message: ConversationSnapshot["messages"][number]): boolean {
  return Boolean(message.hasThought && String(message.textWithoutThought || "").trim());
}

function applyTextWithoutThought(
  message: ConversationSnapshot["messages"][number],
  strippedMessageIds: Set<string>
): ConversationSnapshot["messages"][number] {
  if (!strippedMessageIds.has(message.id) || !hasTextWithoutThought(message)) return message;
  return {
    ...message,
    text: String(message.textWithoutThought || "").trim()
  };
}

function getPreviewMessageText(
  message: ConversationSnapshot["messages"][number],
  strippedMessageIds: Set<string>
): string {
  if (strippedMessageIds.has(message.id) && hasTextWithoutThought(message)) {
    return message.textWithoutThought || "(空消息)";
  }
  return message.text || "(空消息)";
}

function renderMessageViewButton(index: number, dataAttribute: "data-ai-chat-helper-message-view" | "data-ai-chat-helper-batch-message-view"): string {
  return `<button type="button" class="ai-chat-helper-export-modal__message-view" data-index="${index}" ${dataAttribute}>查看全文</button>`;
}

function renderSelectablePreviewMessageRow(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number],
  index: number,
  options: {
    checked: boolean;
    inputAttribute: "data-ai-chat-helper-message-item" | "data-ai-chat-helper-batch-message-item";
    viewAttribute: "data-ai-chat-helper-message-view" | "data-ai-chat-helper-batch-message-view";
    textAttribute: "data-ai-chat-helper-message-text" | "data-ai-chat-helper-batch-message-text";
    strippedMessageIds: Set<string>;
  }
): string {
  const viewButton = renderMessageViewButton(index, options.viewAttribute);
  const bubble = `
    <div class="ai-chat-helper-export-modal__message-bubble ai-chat-helper-export-modal__message-bubble--${escapeHtml(message.role)}">
      <small>${escapeHtml(getMessageRoleLabel(snapshot, message))}</small>
      ${renderPreviewMessageTextElement(snapshot, message, index, options.textAttribute, options.strippedMessageIds)}
    </div>
  `;
  const isUser = message.role === "user";

  return `
    <label class="ai-chat-helper-export-modal__message-item">
      <input type="checkbox" ${options.checked ? "checked" : ""} data-index="${index}" ${options.inputAttribute} />
      ${isUser ? viewButton : ""}
      ${bubble}
      ${isUser ? "" : viewButton}
    </label>
  `;
}

function bindMessageFullPreviewButtons(
  root: HTMLElement,
  snapshot: ConversationSnapshot,
  strippedMessageIds: Set<string>,
  selector: string
): void {
  root.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const message = snapshot.messages[Number(button.dataset.index)];
      if (!message) return;
      openFullMessagePreview(
        `${getMessageRoleLabel(snapshot, message)}全文`,
        renderFullPreviewMessageHtml(snapshot, message, strippedMessageIds)
      );
    });
  });
}

function openFullMessagePreview(title: string, bodyHtml: string): void {
  const overlay = document.createElement("div");
  overlay.className = "ai-chat-helper-export-modal__full-preview";
  overlay.dataset.aiChatHelperFullPreview = "true";
  overlay.innerHTML = `
    <div class="ai-chat-helper-export-modal__full-preview-box" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="ai-chat-helper-export-modal__header">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>完整消息内容</span>
        </div>
        <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-full-preview-close aria-label="关闭" title="关闭">${closeIcon}</button>
      </div>
      <div class="ai-chat-helper-export-modal__full-preview-body">${bodyHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = registerDismissLayer(overlay, () => overlay.remove());
  overlay.querySelector("[data-ai-chat-helper-full-preview-close]")?.addEventListener("click", close);
}

function renderFullPreviewMessageHtml(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number],
  strippedMessageIds: Set<string>
): string {
  const imagePreview = getPreviewMessageImage(snapshot, message, strippedMessageIds);
  if (imagePreview) return renderChatGPTPreviewImageHtml(imagePreview, message.role);
  const text = renderMessageMarkdown(getPreviewMessageText(message, strippedMessageIds), snapshot.platformId);
  return text || "(空消息)";
}

function renderPreviewMessageTextElement(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number],
  index: number,
  dataAttribute: "data-ai-chat-helper-message-text" | "data-ai-chat-helper-batch-message-text",
  strippedMessageIds: Set<string>
): string {
  const preview = getPreviewMessageImage(snapshot, message, strippedMessageIds);
  const className = preview
    ? "ai-chat-helper-export-modal__message-text ai-chat-helper-export-modal__message-text--media"
    : "ai-chat-helper-export-modal__message-text";
  const html = preview
    ? renderChatGPTPreviewImageHtml(preview, message.role)
    : renderMessageMarkdown(getPreviewMessageText(message, strippedMessageIds), snapshot.platformId);
  return `<div class="${className}" data-index="${index}" ${dataAttribute}>${html}</div>`;
}

function getPreviewMessageImage(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number],
  strippedMessageIds: Set<string>
) {
  if (snapshot.platformId !== "chatgpt") return null;
  if (strippedMessageIds.has(message.id) && hasTextWithoutThought(message)) return null;
  return getChatGPTImagePreviewModel(message);
}

function renderChatGPTPreviewImageHtml(
  preview: NonNullable<ReturnType<typeof getChatGPTImagePreviewModel>>,
  role: ConversationSnapshot["messages"][number]["role"]
): string {
  const text = role === "user" && preview.text
    ? `<span class="ai-chat-helper-export-modal__message-media-text">${escapeHtml(preview.text)}</span>`
    : "";
  return `<span class="ai-chat-helper-export-modal__message-media"><img src="${escapeHtml(preview.url)}" alt="${escapeHtml(preview.alt)}" loading="lazy">${text}</span>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
