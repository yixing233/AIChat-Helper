import type { PlatformId } from "../../shared/types";
import { applyPanelPosition, type PanelPosition } from "./drag";

export interface PanelOptions {
  platformId?: PlatformId;
  platformName: string;
  platformIconUrl?: string;
  extensionVersion?: string;
  canBatchExport?: boolean;
  visibleLimit?: number;
  batchLimit?: number;
  readingLineOffset?: number;
  dotGap?: number;
  autoUpdateCheck?: boolean;
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

export function createPanel(options: PanelOptions): HTMLElement {
  const root = document.createElement("div");
  root.id = "ai-chat-helper-panel";
  root.className = "ai-chat-helper-nav-wrapper";
  root.innerHTML = `
    <div class="ai-chat-helper-orbital" title="拖动导航" data-ai-chat-helper-orbital data-ai-chat-helper-drag-handle>
      <div class="ai-chat-helper-panel__nodes ai-chat-helper-orbital__nodes" data-ai-chat-helper-nodes></div>
    </div>
    <div class="ai-chat-helper-panel__button-host">
      <button type="button" class="ai-chat-helper-round-button ai-chat-helper-panel__action--refresh" title="重新获取节点" aria-label="重新获取节点" data-ai-chat-helper-refresh>${refreshIcon}</button>
    </div>
  `;
  if (options.panelPosition) {
    applyPanelPosition(root, options.panelPosition);
  }
  return root;
}

export function setPanelStatus(panel: HTMLElement, message: string): void {
  void panel;
  void message;
}

export function setPanelVersionUpdateBadge(panel: HTMLElement, latestVersion: string): void {
  const badge = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version-badge]");
  const trigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version]");
  if (!badge || !trigger) return;

  const currentVersion = trigger.dataset.aiChatHelperVersionCurrent
    || trigger.textContent?.match(/v([0-9][^\s]*)/)?.[1]
    || "0.0.0";
  const availableVersion = String(latestVersion || "").trim();
  const hasUpdate = availableVersion.length > 0;

  badge.style.opacity = hasUpdate ? "1" : "0";
  badge.style.transform = hasUpdate ? "scale(1)" : "scale(.7)";
  trigger.title = hasUpdate
    ? `New version v${availableVersion} available. Click to update.`
    : `Current version v${currentVersion}. Click to check updates.`;
}
