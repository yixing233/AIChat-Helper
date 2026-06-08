import type { SnapshotExportFormat } from "../../exporters/snapshot-export";

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
