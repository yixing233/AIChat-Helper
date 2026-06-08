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

const githubIcon = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.71 1.25 3.37.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.19 1.18a11.1 11.1 0 0 1 5.81 0c2.22-1.49 3.19-1.18 3.19-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.66.41.35.78 1.04.78 2.1v3.11c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"></path>
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
      <button type="button" class="ai-chat-helper-panel__action--github" title="Open GitHub project" aria-label="Open GitHub project" data-ai-chat-helper-github>${githubIcon}</button>
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
