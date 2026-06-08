import type { SnapshotExportFormat } from "../../exporters/snapshot-export";
import type { ConversationSummary } from "../../shared/types";
import { escapeHtml } from "../shared/escape-html";

export function createExportModal(onExport?: (format: SnapshotExportFormat) => void): HTMLElement {
  const modal = document.createElement("div");

  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box">
      <strong>Export</strong>
      <div class="ai-chat-helper-export-modal__formats">
        <button type="button" data-format="html">HTML</button>
        <button type="button" data-format="markdown">Markdown</button>
        <button type="button" data-format="txt">TXT</button>
        <button type="button" data-format="zip">ZIP</button>
      </div>
      <button type="button" data-ai-chat-helper-close-export>Close</button>
    </div>
  `;
  modal.querySelectorAll<HTMLButtonElement>("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      onExport?.(button.dataset.format as SnapshotExportFormat);
      modal.remove();
    });
  });
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", () => modal.remove());
  return modal;
}

export function openExportModal(onExport?: (format: SnapshotExportFormat) => void): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();
  const modal = createExportModal(onExport);
  document.body.appendChild(modal);
}

export function createBatchExportModal(
  summaries: ConversationSummary[],
  onExport?: (format: SnapshotExportFormat, selectedSummaries: ConversationSummary[]) => void
): HTMLElement {
  const modal = document.createElement("div");

  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box ai-chat-helper-export-modal__box--batch">
      <div class="ai-chat-helper-export-modal__header">
        <strong>Batch export</strong>
        <span>${summaries.length} conversations</span>
      </div>
      <div class="ai-chat-helper-export-modal__batch-list">
        ${summaries.length ? summaries.map((summary, index) => renderBatchSummary(summary, index)).join("") : `
          <div class="ai-chat-helper-export-modal__empty">No recent conversations found.</div>
        `}
      </div>
      <div class="ai-chat-helper-export-modal__formats">
        <button type="button" data-format="html">HTML</button>
        <button type="button" data-format="markdown">Markdown</button>
        <button type="button" data-format="txt">TXT</button>
        <button type="button" data-format="zip">ZIP</button>
      </div>
      <button type="button" data-ai-chat-helper-close-export>Close</button>
    </div>
  `;

  const itemInputs = Array.from(modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-item]"));
  const formatButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>("[data-format]"));
  const updateFormatButtons = () => {
    const hasSelection = itemInputs.some((input) => input.checked);
    formatButtons.forEach((button) => {
      button.disabled = !hasSelection;
    });
  };

  itemInputs.forEach((input) => input.addEventListener("change", updateFormatButtons));
  formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedSummaries = itemInputs
        .filter((input) => input.checked)
        .map((input) => summaries[Number(input.dataset.index)])
        .filter((summary): summary is ConversationSummary => Boolean(summary));
      if (!selectedSummaries.length) return;
      onExport?.(button.dataset.format as SnapshotExportFormat, selectedSummaries);
      modal.remove();
    });
  });
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", () => modal.remove());
  updateFormatButtons();
  return modal;
}

export function openBatchExportModal(
  summaries: ConversationSummary[],
  onExport?: (format: SnapshotExportFormat, selectedSummaries: ConversationSummary[]) => void
): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();
  const modal = createBatchExportModal(summaries, onExport);
  document.body.appendChild(modal);
}

function renderBatchSummary(summary: ConversationSummary, index: number): string {
  const updatedAt = summary.updatedAt ? `<span>${escapeHtml(formatDate(summary.updatedAt))}</span>` : "";
  const count = typeof summary.messageCount === "number" ? `<span>${summary.messageCount} messages</span>` : "";
  const meta = [updatedAt, count].filter(Boolean).join("");

  return `
    <label class="ai-chat-helper-export-modal__batch-item">
      <input type="checkbox" checked data-index="${index}" data-ai-chat-helper-batch-item />
      <span>
        <strong>${escapeHtml(summary.title || summary.conversationId)}</strong>
        <small>${meta || escapeHtml(summary.conversationId)}</small>
      </span>
    </label>
  `;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
