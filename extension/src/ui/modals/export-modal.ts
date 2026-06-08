export function openExportModal(): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();

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
      </div>
      <button type="button" data-ai-chat-helper-close-export>Close</button>
    </div>
  `;
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", () => modal.remove());
  document.body.appendChild(modal);
}
