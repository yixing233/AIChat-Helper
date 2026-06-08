import { escapeHtml } from "../shared/escape-html";

export interface PanelOptions {
  platformName: string;
  canBatchExport?: boolean;
}

export function createPanel(options: PanelOptions): HTMLElement {
  const root = document.createElement("aside");
  root.id = "ai-chat-helper-panel";
  root.className = "ai-chat-helper-panel";
  root.innerHTML = `
    <header class="ai-chat-helper-panel__header">
      <strong>AI Chat Helper</strong>
      <span>${escapeHtml(options.platformName)}</span>
    </header>
    <label class="ai-chat-helper-panel__search">
      <span>Search</span>
      <input type="search" data-ai-chat-helper-search placeholder="Search nodes" />
    </label>
    <div class="ai-chat-helper-panel__nodes" data-ai-chat-helper-nodes></div>
    <div class="ai-chat-helper-panel__status" data-ai-chat-helper-status aria-live="polite"></div>
    <footer class="ai-chat-helper-panel__actions">
      <button type="button" data-ai-chat-helper-refresh>Refresh</button>
      <button type="button" data-ai-chat-helper-export>Export</button>
      ${options.canBatchExport ? "<button type=\"button\" data-ai-chat-helper-batch-export>Batch</button>" : ""}
    </footer>
  `;
  return root;
}

export function setPanelStatus(panel: HTMLElement, message: string): void {
  const status = panel.querySelector<HTMLElement>("[data-ai-chat-helper-status]");
  if (!status) return;

  status.textContent = message;
  status.hidden = message.length === 0;
}
