import type { SnapshotExportFormat } from "../../exporters/snapshot-export";
import { renderMessageMarkdown } from "../../exporters/html";
import { getChatGPTImagePreviewModel } from "../../exporters/shared";
import type { BatchConversationSelection, ConversationSnapshot, ConversationSummary } from "../../shared/types";
import { bindTextTooltipHandlers } from "../controls/node-tooltip";
import { escapeHtml } from "../shared/escape-html";

export interface ExportLoadingState {
  title: string;
  detail: string;
  progressPercent?: number;
  currentLabel?: string;
}

export type ExportHandlerResult = void | Promise<void>;
export type CurrentExportHandler = (format: SnapshotExportFormat, selectedSnapshot: ConversationSnapshot) => ExportHandlerResult;
export type BatchExportHandler = (
  format: SnapshotExportFormat,
  selections: BatchConversationSelection[],
  updateLoadingState?: (state: ExportLoadingState) => void
) => ExportHandlerResult;
type BatchPreviewLoader = (summary: ConversationSummary) => Promise<ConversationSnapshot>;

export interface BatchExportModalOptions {
  onExport?: BatchExportHandler;
  loadSnapshot?: BatchPreviewLoader;
  onPreviewError?: (summary: ConversationSummary, error: Error) => void;
  batchLimit?: number;
  onLimitChange?: (newLimit: number) => Promise<ConversationSummary[]>;
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
  bindAttachmentPreviewButtons(modal, snapshot, "[data-ai-chat-helper-attachment-preview]");
  bindTextTooltipHandlers(modal);
  formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isExporting(modal)) return;
      const selectedMessages = itemInputs
        .filter((input) => input.checked)
        .map((input) => snapshot.messages[Number(input.dataset.index)])
        .filter((message): message is ConversationSnapshot["messages"][number] => Boolean(message));
      if (!selectedMessages.length) return;
      const format = button.dataset.format as SnapshotExportFormat;
      void runExportWithLoading(modal, format, async (updateLoadingState) => {
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
      void runExportWithLoading(modal, format, async (updateLoadingState) => {
        await options.onExport?.(format, selections, updateLoadingState);
      }, closeModal);
    });
  });
  bindExportMenu(modal);
  bindTextTooltipHandlers(modal);
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
    const body = modal.querySelector(".ai-chat-helper-export-modal__batch-body");
    const box = modal.querySelector(".ai-chat-helper-export-modal__box--batch");
    modal.appendChild(preview);
    body?.classList.add("has-preview");
    box?.classList.add("has-preview");
    preview.getBoundingClientRect();
    preview.classList.add("is-active");
    const closePreview = registerDismissLayer(preview, () => {
      preview.remove();
      body?.classList.remove("has-preview");
      box?.classList.remove("has-preview");
    });
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
    const body = modal.querySelector(".ai-chat-helper-export-modal__batch-body");
    const box = modal.querySelector(".ai-chat-helper-export-modal__box--batch");
    modal.appendChild(preview);
    body?.classList.add("has-preview");
    box?.classList.add("has-preview");
    preview.getBoundingClientRect();
    preview.classList.add("is-active");
    const closePreview = registerDismissLayer(preview, () => {
      preview.remove();
      body?.classList.remove("has-preview");
      box?.classList.remove("has-preview");
    });
    bindBatchPreviewClose(preview, closePreview);

    const messageInputs = Array.from(preview.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-message-item]"));
    const status = preview.querySelector<HTMLElement>("[data-ai-chat-helper-batch-preview-selection-status]");
    const toggle = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-toggle]");
    const assistantButton = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-only-assistant]");
    const thoughtButton = preview.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-exclude-thought]");
    bindMessageFullPreviewButtons(preview, snapshot, textWithoutThoughtMessageIds, "[data-ai-chat-helper-batch-message-view]");
    bindAttachmentPreviewButtons(preview, snapshot, "[data-ai-chat-helper-attachment-preview]");
    bindPreviewImageSkeletons(preview);

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
            textEl.outerHTML = renderPreviewMessageTextElement(snapshot, message, Number(input.dataset.index), "data-ai-chat-helper-batch-message-text", textWithoutThoughtMessageIds);
            const nextTextEl = preview.querySelector<HTMLElement>(`[data-ai-chat-helper-batch-message-text][data-index="${input.dataset.index}"]`);
            if (nextTextEl) bindPreviewImageSkeletons(nextTextEl);
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
  action: (updateLoadingState: (state: ExportLoadingState) => void) => Promise<void>,
  closeModal: () => void
): Promise<void> {
  setExporting(modal, true);
  renderExportLoading(modal, format);
  const updateLoadingState = (state: ExportLoadingState) => {
    renderExportLoading(modal, format, "", state);
  };
  try {
    await action(updateLoadingState);
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

function renderExportLoading(
  modal: HTMLElement,
  format: SnapshotExportFormat,
  errorMessage = "",
  state?: ExportLoadingState
): void {
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
    const progressPercent = Math.max(0, Math.min(100, Math.round(state?.progressPercent ?? 8)));
    const title = state?.title || "正在导出文件...";
    const detail = state?.detail || `${escapeHtml(formatExportName(format))} 文件正在生成，请稍候`;
    const currentLabel = state?.currentLabel
      ? `<span class="ai-chat-helper-export-modal__export-loading-current">${escapeHtml(state.currentLabel)}</span>`
      : "";
    layer.innerHTML = `
      <div class="ai-chat-helper-export-modal__export-loading-box" role="status" aria-live="polite">
        <div class="ai-chat-helper-export-modal__export-loading-orbit" aria-hidden="true">
          <div class="ai-chat-helper-export-modal__export-loading-orbit-ring"></div>
          <div class="ai-chat-helper-export-modal__export-loading-orbit-core"></div>
        </div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
        ${currentLabel}
        <div class="ai-chat-helper-export-modal__export-loading-progress" aria-hidden="true">
          <div class="ai-chat-helper-export-modal__export-loading-progress-bar" style="width: ${progressPercent}%"></div>
        </div>
        <span class="ai-chat-helper-export-modal__export-loading-percent">${progressPercent}%</span>
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
  const count = `<span>对话轮数: ${typeof summary.messageCount === "number" ? `${summary.messageCount} 轮` : "-"}</span>`;
  const updatedAtText = summary.updatedAtText || (summary.updatedAt ? formatDate(summary.updatedAt) : "");
  const createdAtText = summary.createdAtText || (summary.createdAt ? formatDate(summary.createdAt) : "");
  const updatedAt = `<span>更新时间: ${escapeHtml(updatedAtText || "-")}</span>`;
  const createdAt = `<span>创建时间: ${escapeHtml(createdAtText || "-")}</span>`;
  const meta = [id, count, updatedAt, createdAt].join("");

  return `
    <div class="ai-chat-helper-export-modal__batch-item" style="--i: ${index}">
      <label class="ai-chat-helper-export-modal__batch-select">
        <input type="checkbox" checked data-index="${index}" data-ai-chat-helper-batch-item />
        <span class="ai-chat-helper-export-modal__checkbox-box">
          <svg viewBox="0 0 448 512" style="width: 10px; height: 10px; fill: currentColor; display: block;" class="svg-inline--fa fa-check" aria-hidden="true">
            <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
          </svg>
        </span>
        <span>
          <strong>${escapeHtml(summary.title || summary.conversationId)}</strong>
          <small>${meta || escapeHtml(summary.conversationId)}</small>
        </span>
      </label>
      ${canPreview ? `
        <button type="button" class="ai-chat-helper-export-modal__batch-preview-button" data-index="${index}" data-ai-chat-helper-batch-preview aria-label="查看该对话消息" data-ai-chat-helper-tooltip="查看该对话消息">${previewIcon}</button>
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
      <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-batch-preview-close aria-label="关闭" data-ai-chat-helper-tooltip="关闭">${closeIcon}</button>
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
  if (!closeDismissLayerForElement(preview)) {
    preview.remove();
  }
  const body = modal.querySelector(".ai-chat-helper-export-modal__batch-body");
  const box = modal.querySelector(".ai-chat-helper-export-modal__box--batch");
  body?.classList.remove("has-preview");
  box?.classList.remove("has-preview");
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
      <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-close-export aria-label="关闭" data-ai-chat-helper-tooltip="关闭">${closeIcon}</button>
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
        <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-full-preview-close aria-label="关闭" data-ai-chat-helper-tooltip="关闭">${closeIcon}</button>
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
  const attachmentPreview = renderInlineAttachmentPreviewList(message);
  let rawText = getPreviewMessageText(message, strippedMessageIds);
  if (imagePreview) {
    rawText = rawText.replace(/\[附件\d+:[^\]]+]/g, "").trim();
  }
  let text = renderPreviewMessageText(rawText, snapshot.platformId);
  if (imagePreview && !text.includes(imagePreview.url)) {
    text = `${renderChatGPTPreviewImageHtml(imagePreview, message.role)}${text}`;
  }
  return `${text || "(空消息)"}${attachmentPreview}`;
}

function renderPreviewMessageTextElement(
  snapshot: ConversationSnapshot,
  message: ConversationSnapshot["messages"][number],
  index: number,
  dataAttribute: "data-ai-chat-helper-message-text" | "data-ai-chat-helper-batch-message-text",
  strippedMessageIds: Set<string>
): string {
  const preview = getPreviewMessageImage(snapshot, message, strippedMessageIds);
  let rawText = getPreviewMessageText(message, strippedMessageIds);
  if (preview) {
    rawText = rawText.replace(/\[附件\d+:[^\]]+]/g, "").trim();
  }
  const hasInlineImage = /!\[([^\]]*)]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)|\[图片([^\]]*)]\s+(data:image\/\S+|https?:\/\/\S+)/gi.test(rawText);
  const className = (preview || hasInlineImage)
    ? "ai-chat-helper-export-modal__message-text ai-chat-helper-export-modal__message-text--media"
    : "ai-chat-helper-export-modal__message-text";
  let html = renderPreviewMessageText(rawText, snapshot.platformId);
  if (preview && !html.includes(preview.url)) {
    html = `${renderChatGPTPreviewImageHtml(preview, message.role)}${html}`;
  }
  return `<div class="${className}" data-index="${index}" ${dataAttribute}>${html}${renderInlineAttachmentPreviewList(message)}</div>`;
}

function renderPreviewMessageText(text: string, platformId?: PlatformId): string {
  const pattern = /!\[([^\]]*)]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)|\[图片([^\]]*)]\s+(data:image\/\S+|https?:\/\/\S+)/gi;
  const imageTokens: Array<{ key: string; html: string }> = [];
  const tokenized = String(text || "(空消息)").replace(pattern, (_match, markdownTitle, markdownUrl, plainTitle, plainUrl) => {
    const title = markdownTitle || plainTitle || "图片";
    const url = markdownUrl || plainUrl || "";
    const key = `AI_CHAT_HELPER_EXPORT_IMAGE_${imageTokens.length}`;
    imageTokens.push({ key, html: renderExportInlineImageHtml(url, title) });
    return key;
  });
  let html = renderMessageMarkdown(tokenized, platformId).trim();
  imageTokens.forEach((token) => {
    html = html
      .replace(new RegExp(`<p>\\s*${token.key}\\s*</p>`, "g"), token.html)
      .split(token.key)
      .join(token.html);
  });
  return html || `<p>${escapeHtml(text || "(空消息)")}</p>`;
}

function renderExportInlineImageHtml(url: string, title: string): string {
  return `<span class="ai-chat-helper-export-modal__message-media" data-image-loading="true"><span class="ai-chat-helper-export-modal__message-media-skeleton" aria-hidden="true"></span><img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" /></span>`;
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
  return `<span class="ai-chat-helper-export-modal__message-media" data-image-loading="true"><span class="ai-chat-helper-export-modal__message-media-skeleton" aria-hidden="true"></span><img src="${escapeHtml(preview.url)}" alt="${escapeHtml(preview.alt)}" loading="lazy">${text}</span>`;
}

function bindPreviewImageSkeletons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".ai-chat-helper-export-modal__message-media").forEach((media) => {
    const image = media.querySelector<HTMLImageElement>("img");
    if (!image) return;
    const setLoaded = (loaded: boolean) => {
      media.dataset.imageLoading = loaded ? "false" : "true";
    };
    if (image.complete && image.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    image.addEventListener("load", () => setLoaded(true), { once: true });
    image.addEventListener("error", () => setLoaded(true), { once: true });
  });
}

function renderInlineAttachmentPreviewList(message: ConversationSnapshot["messages"][number]): string {
  const attachments = (message.attachments || []).filter(isPreviewableTextAttachment);
  if (!attachments.length) return "";
  return `
    <div class="ai-chat-helper-export-modal__attachment-list">
      ${attachments.map((attachment, index) => `
        <button
          type="button"
          class="ai-chat-helper-export-modal__attachment-preview"
          data-ai-chat-helper-attachment-preview
          data-attachment-index="${index}"
        >
          <strong>${escapeHtml(attachment.fileName || attachment.id || "附件")}</strong>
          <span>${escapeHtml(attachment.mimeType || "text/plain")}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function isPreviewableTextAttachment(attachment: NonNullable<ConversationSnapshot["messages"][number]["attachments"]>[number]): boolean {
  return /^text\/plain/i.test(String(attachment.mimeType || "").trim()) && typeof attachment.content === "string" && attachment.content.trim().length > 0;
}

function bindAttachmentPreviewButtons(root: HTMLElement, snapshot: ConversationSnapshot, selector: string): void {
  root.querySelectorAll<HTMLElement>(".ai-chat-helper-export-modal__message-item").forEach((row) => {
    const messageIndex = Number(row.querySelector<HTMLInputElement>("input[data-index]")?.dataset.index);
    const message = snapshot.messages[messageIndex];
    if (!message) return;
    const attachments = (message.attachments || []).filter(isPreviewableTextAttachment);
    if (!attachments.length) return;

    row.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const attachment = attachments[Number(button.dataset.attachmentIndex)];
        if (!attachment) return;
        openAttachmentPreview(attachment);
      });
    });
  });
}

function openAttachmentPreview(attachment: NonNullable<ConversationSnapshot["messages"][number]["attachments"]>[number]): void {
  const overlay = document.createElement("div");
  overlay.className = "ai-chat-helper-export-modal__full-preview";
  overlay.dataset.aiChatHelperAttachmentFullPreview = "true";
  overlay.innerHTML = `
    <div class="ai-chat-helper-export-modal__full-preview-box" role="dialog" aria-modal="true" aria-label="附件内容预览">
      <div class="ai-chat-helper-export-modal__header">
        <div>
          <strong>附件内容预览</strong>
          <span>${escapeHtml(attachment.fileName || attachment.id || "附件")} · ${escapeHtml(attachment.mimeType || "text/plain")}</span>
        </div>
        <button type="button" class="ai-chat-helper-export-modal__close" data-ai-chat-helper-attachment-preview-close aria-label="关闭" data-ai-chat-helper-tooltip="关闭">${closeIcon}</button>
      </div>
      <div class="ai-chat-helper-export-modal__full-preview-body">
        <pre class="ai-chat-helper-export-modal__attachment-content">${escapeHtml(String(attachment.content || "").trim())}</pre>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = registerDismissLayer(overlay, () => overlay.remove());
  overlay.querySelector("[data-ai-chat-helper-attachment-preview-close]")?.addEventListener("click", close);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}


