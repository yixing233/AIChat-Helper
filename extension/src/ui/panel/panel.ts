import { escapeHtml } from "../shared/escape-html";
import type { PlatformId } from "../../shared/types";
import { applyPanelPosition, type PanelPosition } from "./drag";

export interface PanelOptions {
  platformId?: PlatformId;
  platformName: string;
  platformIconUrl?: string;
  canBatchExport?: boolean;
  visibleLimit?: number;
  batchLimit?: number;
  readingLineOffset?: number;
  dotGap?: number;
  removeQwenAds?: boolean;
  hideDeepSeekNativeNav?: boolean;
  panelPosition?: PanelPosition | null;
}

const refreshIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 2v6h-6"></path>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
    <path d="M3 22v-6h6"></path>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
  </svg>
`;

const exportIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
`;

const batchIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 6h13"></path>
    <path d="M8 12h13"></path>
    <path d="M8 18h13"></path>
    <path d="M3 6h.01"></path>
    <path d="M3 12h.01"></path>
    <path d="M3 18h.01"></path>
  </svg>
`;

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
      ${renderPlatformIcon(options)}
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
      <button type="button" class="ai-chat-helper-panel__action--refresh" title="Refresh nodes" aria-label="Refresh nodes" data-ai-chat-helper-refresh>${refreshIcon}</button>
      <button type="button" class="ai-chat-helper-panel__action--export" title="Export current conversation" aria-label="Export current conversation" data-ai-chat-helper-export>${exportIcon}</button>
      ${options.canBatchExport ? `<button type="button" class="ai-chat-helper-panel__action--batch" title="Batch export conversations" aria-label="Batch export conversations" data-ai-chat-helper-batch-export>${batchIcon}</button>` : ""}
    </footer>
  `;
  if (options.panelPosition) {
    applyPanelPosition(root, options.panelPosition);
  }
  return root;
}

function renderPlatformIcon(options: PanelOptions): string {
  if (!options.platformIconUrl) return "";
  return `<img class="ai-chat-helper-panel__platform-icon" src="${escapeHtml(options.platformIconUrl)}" alt="${escapeHtml(options.platformName)}" referrerpolicy="no-referrer" />`;
}

function renderPlatformToggles(options: PanelOptions): string {
  if (options.platformId === "qwen") {
    return `
      <label class="ai-chat-helper-panel__setting ai-chat-helper-panel__setting--toggle">
        <span>Remove ads</span>
        <span class="ai-chat-helper-panel__switch">
          <input type="checkbox" ${options.removeQwenAds ? "checked" : ""} data-ai-chat-helper-remove-qwen-ads />
          <span class="ai-chat-helper-panel__switch-slider"></span>
        </span>
      </label>
    `;
  }

  if (options.platformId === "deepseek") {
    return `
      <label class="ai-chat-helper-panel__setting ai-chat-helper-panel__setting--toggle">
        <span>Hide native nav</span>
        <span class="ai-chat-helper-panel__switch">
          <input type="checkbox" ${options.hideDeepSeekNativeNav ? "checked" : ""} data-ai-chat-helper-hide-deepseek-native-nav />
          <span class="ai-chat-helper-panel__switch-slider"></span>
        </span>
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
