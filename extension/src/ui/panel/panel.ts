import { escapeHtml } from "../shared/escape-html";
import type { PlatformId } from "../../shared/types";
import { applyPanelPosition, type PanelPosition } from "./drag";

export interface PanelOptions {
  platformId?: PlatformId;
  platformName: string;
  canBatchExport?: boolean;
  visibleLimit?: number;
  batchLimit?: number;
  readingLineOffset?: number;
  dotGap?: number;
  removeQwenAds?: boolean;
  hideDeepSeekNativeNav?: boolean;
  panelPosition?: PanelPosition | null;
}

export function createPanel(options: PanelOptions): HTMLElement {
  const root = document.createElement("aside");
  root.id = "ai-chat-helper-panel";
  root.className = "ai-chat-helper-panel";
  root.innerHTML = `
    <header class="ai-chat-helper-panel__header">
      <div>
        <strong>AI Chat Helper</strong>
        <span>Extension</span>
      </div>
      <span aria-hidden="true" title="Drag panel" data-ai-chat-helper-drag-handle>drag</span>
    </header>
    <div class="ai-chat-helper-panel__platform-card">
      <span>Current AI platform: <b>${escapeHtml(options.platformName)}</b></span>
    </div>
    <label class="ai-chat-helper-panel__search">
      <span>Search</span>
      <input type="search" data-ai-chat-helper-search placeholder="Search nodes" />
    </label>
    <div class="ai-chat-helper-panel__search-nav">
      <button type="button" data-ai-chat-helper-search-prev>Prev</button>
      <span data-ai-chat-helper-search-status>0/0</span>
      <button type="button" data-ai-chat-helper-search-next>Next</button>
    </div>
    <label class="ai-chat-helper-panel__setting">
      <span>Visible</span>
      <input type="number" min="1" max="100" step="1" value="${Number(options.visibleLimit || 20)}" data-ai-chat-helper-visible-limit />
    </label>
    ${options.canBatchExport ? `
      <label class="ai-chat-helper-panel__setting">
        <span>Batch limit</span>
        <input type="number" min="1" max="100" step="1" value="${Number(options.batchLimit || 20)}" data-ai-chat-helper-batch-limit />
      </label>
    ` : ""}
    <label class="ai-chat-helper-panel__setting">
      <span>Reading line</span>
      <input type="number" min="10" max="500" step="10" value="${Number(options.readingLineOffset || 150)}" data-ai-chat-helper-reading-line />
    </label>
    <label class="ai-chat-helper-panel__setting">
      <span>Dot gap</span>
      <input type="number" min="20" max="50" step="1" value="${Number(options.dotGap || 36)}" data-ai-chat-helper-dot-gap />
    </label>
    ${renderPlatformToggles(options)}
    <div class="ai-chat-helper-panel__nodes" data-ai-chat-helper-nodes></div>
    <div class="ai-chat-helper-panel__status" data-ai-chat-helper-status aria-live="polite"></div>
    <footer class="ai-chat-helper-panel__actions">
      <button type="button" class="ai-chat-helper-panel__action--refresh" data-ai-chat-helper-refresh>Refresh</button>
      <button type="button" class="ai-chat-helper-panel__action--export" data-ai-chat-helper-export>Export</button>
      ${options.canBatchExport ? "<button type=\"button\" class=\"ai-chat-helper-panel__action--batch\" data-ai-chat-helper-batch-export>Batch</button>" : ""}
    </footer>
  `;
  if (options.panelPosition) {
    applyPanelPosition(root, options.panelPosition);
  }
  return root;
}

function renderPlatformToggles(options: PanelOptions): string {
  if (options.platformId === "qwen") {
    return `
      <label class="ai-chat-helper-panel__setting ai-chat-helper-panel__setting--toggle">
        <span>Remove ads</span>
        <input type="checkbox" ${options.removeQwenAds ? "checked" : ""} data-ai-chat-helper-remove-qwen-ads />
      </label>
    `;
  }

  if (options.platformId === "deepseek") {
    return `
      <label class="ai-chat-helper-panel__setting ai-chat-helper-panel__setting--toggle">
        <span>Hide native nav</span>
        <input type="checkbox" ${options.hideDeepSeekNativeNav ? "checked" : ""} data-ai-chat-helper-hide-deepseek-native-nav />
      </label>
    `;
  }

  return "";
}

export function setPanelStatus(panel: HTMLElement, message: string): void {
  const status = panel.querySelector<HTMLElement>("[data-ai-chat-helper-status]");
  if (!status) return;

  status.textContent = message;
  status.hidden = message.length === 0;
}
