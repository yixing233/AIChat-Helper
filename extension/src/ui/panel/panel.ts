import { escapeHtml } from "../shared/escape-html";
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

const searchIcon = `
  <svg class="ai-chat-helper-search-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path class="ai-chat-helper-search-icon__base" d="M16.6725 16.6412L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path class="ai-chat-helper-search-icon__extra" d="M11 6C13.7614 6 16 8.23858 16 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

const settingsIcon = `
  <svg class="ai-chat-helper-settings-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 9.75C10.7574 9.75 9.75 10.7574 9.75 12C9.75 13.2426 10.7574 14.25 12 14.25C13.2426 14.25 14.25 13.2426 14.25 12C14.25 10.7574 13.2426 9.75 12 9.75ZM8.25 12C8.25 9.92893 9.92893 8.25 12 8.25C14.0711 8.25 15.75 9.92893 15.75 12C15.75 14.0711 14.0711 15.75 12 15.75C9.92893 15.75 8.25 14.0711 8.25 12Z" fill="currentColor"></path>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M9.60347 3.77018C9.3358 3.32423 8.77209 3.18551 8.35347 3.43457L8.34256 3.44105L6.61251 4.43096C6.06514 4.74375 5.8763 5.45289 6.1894 5.9948L5.54 6.37001L6.18888 5.99391C6.72395 6.91704 6.86779 7.92882 6.38982 8.75823C5.91192 9.58753 4.96479 9.97001 3.9 9.97001C3.26678 9.97001 2.75 10.4917 2.75 11.12V12.88C2.75 13.5084 3.26678 14.03 3.9 14.03C4.96479 14.03 5.91192 14.4125 6.38982 15.2418C6.86773 16.0711 6.72398 17.0827 6.18909 18.0058C5.87642 18.5476 6.06491 19.2561 6.6121 19.5688L8.35352 20.5654C8.77214 20.8144 9.33577 20.6758 9.60345 20.2299L9.71093 20.0442C10.2458 19.1214 11.052 18.4925 12.0087 18.4925C12.9662 18.4925 13.77 19.1219 14.3 20.0458C14.3002 20.0462 14.3004 20.0466 14.3007 20.047L14.4065 20.2298C14.6742 20.6758 15.2379 20.8145 15.6565 20.5655L15.6674 20.559L17.3975 19.5691C17.9434 19.2571 18.1351 18.5578 17.8198 18.0038C17.2858 17.0813 17.1426 16.0705 17.6202 15.2418C18.0981 14.4125 19.0452 14.03 20.11 14.03C20.7432 14.03 21.26 13.5084 21.26 12.88V11.12C21.26 10.4868 20.7384 9.97001 20.11 9.97001C19.0452 9.97001 18.0981 9.58753 17.6202 8.75824C17.1423 7.92899 17.286 6.91744 17.8208 5.99445C18.1336 5.45258 17.9451 4.74391 17.3979 4.43119L15.6565 3.43466C15.2379 3.1856 14.6742 3.32423 14.4065 3.77019L14.2991 3.95579C13.7642 4.8786 12.958 5.50751 12.0012 5.50751C11.0439 5.50751 10.2402 4.87825 9.71021 3.95455C9.70992 3.95403 9.70962 3.95352 9.70933 3.95301L9.60347 3.77018ZM7.59248 2.14193C8.75191 1.45656 10.2226 1.87704 10.8946 3.00654L10.8991 3.01421L11.0091 3.20423L11.0107 3.20701C11.3807 3.85247 11.7666 4.00751 12.0012 4.00751C12.237 4.00751 12.6259 3.85115 13.0009 3.20423C13.001 3.20412 13.0009 3.20434 13.0009 3.20423L13.1154 3.00651C13.7874 1.877 15.2581 1.45656 16.4175 2.14193L18.1421 3.12883C19.4147 3.85604 19.8463 5.48713 19.1194 6.74522L19.1189 6.74611C18.7439 7.39298 18.8028 7.8062 18.9198 8.00929C19.0369 8.21249 19.3648 8.47001 20.11 8.47001C21.5616 8.47001 22.76 9.65323 22.76 11.12V12.88C22.76 14.3317 21.5768 15.53 20.11 15.53C19.3648 15.53 19.0369 15.7875 18.9198 15.9907C18.8028 16.1938 18.7439 16.607 19.1189 17.2539L19.1212 17.2579C19.8444 18.5235 19.4157 20.1431 18.1425 20.871C18.1424 20.871 18.1426 20.8709 18.1425 20.871L16.4174 21.8581C15.258 22.5434 13.7874 22.123 13.1154 20.9935L13.1109 20.9858L13.0009 20.7958L12.9993 20.793C12.6293 20.1476 12.2434 19.9925 12.0087 19.9925C11.773 19.9925 11.3841 20.1489 11.0091 20.7958C11.009 20.7959 11.0091 20.7957 11.0091 20.7958L10.8946 20.9935C10.2226 22.123 8.75199 22.5434 7.59257 21.8581L5.8679 20.8712C5.86776 20.8711 5.86803 20.8713 5.8679 20.8712C4.59558 20.1439 4.16378 18.5128 4.8906 17.2548L4.89112 17.2539C5.26605 16.607 5.20721 16.1938 5.09018 15.9907C4.97308 15.7875 4.64521 15.53 3.9 15.53C2.43322 15.53 1.25 14.3317 1.25 12.88V11.12C1.25 9.66837 2.43322 8.47001 3.9 8.47001C4.64521 8.47001 4.97308 8.21249 5.09018 8.00929C5.20721 7.8062 5.26605 7.39298 4.89112 6.74611L4.8906 6.74522C4.16378 5.48726 4.59518 3.85639 5.86749 3.12906L7.59248 2.14193Z" fill="currentColor"></path>
  </svg>
`;

const versionIcon = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10V11H17C18.933 11 20.5 12.567 20.5 14.5C20.5 16.433 18.933 18 17 18H16.9C16.3477 18 15.9 18.4477 15.9 19C15.9 19.5523 16.3477 20 16.9 20H17C20.0376 20 22.5 17.5376 22.5 14.5C22.5 11.7793 20.5245 9.51997 17.9296 9.07824C17.4862 6.20213 15.0003 4 12 4C8.99974 4 6.51381 6.20213 6.07036 9.07824C3.47551 9.51997 1.5 11.7793 1.5 14.5C1.5 17.5376 3.96243 20 7 20H7.1C7.65228 20 8.1 19.5523 8.1 19C8.1 18.4477 7.65228 18 7.1 18H7C5.067 18 3.5 16.433 3.5 14.5C3.5 12.567 5.067 11 7 11H8V10ZM13 11C13 10.4477 12.5523 10 12 10C11.4477 10 11 10.4477 11 11V16.5858L9.70711 15.2929C9.31658 14.9024 8.68342 14.9024 8.29289 15.2929C7.90237 15.6834 7.90237 16.3166 8.29289 16.7071L11.2929 19.7071C11.6834 20.0976 12.3166 20.0976 12.7071 19.7071L15.7071 16.7071C16.0976 16.3166 16.0976 15.6834 15.7071 15.2929C15.3166 14.9024 14.6834 14.9024 14.2929 15.2929L13 16.5858V11Z" fill="currentColor"></path>
  </svg>
`;

export function createPanel(options: PanelOptions): HTMLElement {
  const root = document.createElement("div");
  const extensionVersion = options.extensionVersion || "0.0.0";
  root.id = "ai-chat-helper-panel";
  root.className = "ai-chat-helper-nav-wrapper";
  root.innerHTML = `
    <div class="ai-chat-helper-nav-wrapper__grip" aria-hidden="true" title="拖动导航" data-ai-chat-helper-drag-handle></div>
    <div class="ai-chat-helper-orbital" data-ai-chat-helper-orbital>
      <div class="ai-chat-helper-orbital__track" aria-hidden="true"></div>
      <div class="ai-chat-helper-panel__nodes ai-chat-helper-orbital__nodes" data-ai-chat-helper-nodes></div>
    </div>
    <div class="ai-chat-helper-panel__button-host">
      <button type="button" class="ai-chat-helper-round-button ai-chat-helper-round-button--search" title="搜索当前对话" aria-label="搜索当前对话" data-ai-chat-helper-search-trigger>${searchIcon}</button>
      <button type="button" class="ai-chat-helper-round-button ai-chat-helper-round-button--settings" title="AI 节点设置" aria-label="AI 节点设置" data-ai-chat-helper-settings-trigger>${settingsIcon}</button>
    </div>
    <section class="ai-chat-helper-popover ai-chat-helper-search-popover" aria-hidden="true" data-ai-chat-helper-search-popover>
      <div class="ai-chat-helper-search-popover__controls">
        <input type="search" data-ai-chat-helper-search placeholder="搜索当前对话消息..." />
        <button type="button" data-ai-chat-helper-search-confirm>搜索</button>
      </div>
    </section>
    <section class="ai-chat-helper-popover ai-chat-helper-search-results-popover" aria-hidden="true" data-ai-chat-helper-search-results-popover>
      <div class="ai-chat-helper-panel__search-nav">
        <button type="button" data-ai-chat-helper-search-prev>上一个</button>
        <span data-ai-chat-helper-search-status>0/0</span>
        <button type="button" data-ai-chat-helper-search-next>下一个</button>
      </div>
    </section>
    <section class="ai-chat-helper-popover ai-chat-helper-settings-popover" aria-hidden="true" data-ai-chat-helper-settings-popover>
      <header class="ai-chat-helper-panel__header">
        <div>
          <strong>AI对话助手</strong>
          <button type="button" class="ai-chat-helper-panel__version" title="Extension version ${escapeHtml(extensionVersion)}" aria-label="Extension version ${escapeHtml(extensionVersion)}" data-ai-chat-helper-version>
            <span>v${escapeHtml(extensionVersion)}</span>
            ${versionIcon}
            <span class="ai-chat-helper-panel__version-badge" aria-hidden="true" data-ai-chat-helper-version-badge></span>
          </button>
        </div>
      </header>
      <button type="button" class="ai-chat-helper-panel__platform-card">
        ${renderPlatformIcon(options)}
        <span>当前 AI 平台: <b>${escapeHtml(options.platformName)}</b></span>
      </button>
      <label class="ai-chat-helper-panel__setting ai-chat-helper-panel__setting--toggle">
        <span>自动检查更新</span>
        <span class="ai-chat-helper-panel__switch">
          <input type="checkbox" ${options.autoUpdateCheck === false ? "" : "checked"} data-ai-chat-helper-auto-update-check />
          <span class="ai-chat-helper-panel__switch-slider"></span>
        </span>
      </label>
      <div class="ai-chat-helper-panel__setting-group">
        <button type="button" class="ai-chat-helper-panel__subcard-trigger" data-ai-chat-helper-node-settings-trigger>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
          <span>节点设置</span>
          <b data-ai-chat-helper-node-settings-summary>${Number(options.dotGap || 36)} px | ${Number(options.visibleLimit || 20)}</b>
        </button>
        <button type="button" class="ai-chat-helper-panel__subcard-trigger" data-ai-chat-helper-reading-line-trigger>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><polyline points="8 8 12 4 16 8"></polyline><polyline points="16 16 12 20 8 16"></polyline></svg>
          <span>调整阅读线</span>
          <b data-ai-chat-helper-reading-line-summary>${Number(options.readingLineOffset || 150)} px</b>
        </button>
      </div>
      ${renderBatchLimitSetting(options)}
      ${renderPlatformToggles(options)}
      <div class="ai-chat-helper-panel__status" data-ai-chat-helper-status aria-live="polite"></div>
      <footer class="ai-chat-helper-panel__actions">
        <button type="button" class="ai-chat-helper-panel__action--refresh" title="重新获取节点" aria-label="重新获取节点" data-ai-chat-helper-refresh>${refreshIcon}</button>
        <button type="button" class="ai-chat-helper-panel__action--export" title="导出对话记录" aria-label="导出对话记录" data-ai-chat-helper-export>${exportIcon}</button>
        ${options.canBatchExport ? `<button type="button" class="ai-chat-helper-panel__action--batch" title="批量导出对话" aria-label="批量导出对话" data-ai-chat-helper-batch-export>${batchIcon}</button>` : ""}
        <button type="button" class="ai-chat-helper-panel__action--github" title="GitHub 项目" aria-label="GitHub 项目" data-ai-chat-helper-github>${githubIcon}</button>
      </footer>
    </section>
    <section class="ai-chat-helper-popover ai-chat-helper-node-settings-popover" aria-hidden="true" data-ai-chat-helper-node-settings-popover>
      <label class="ai-chat-helper-panel__setting">
        <span>节点间距</span>
        <input type="number" min="20" max="50" step="1" value="${Number(options.dotGap || 36)}" data-ai-chat-helper-dot-gap />
      </label>
      <label class="ai-chat-helper-panel__setting">
        <span>单页数量</span>
        <input type="number" min="1" max="100" step="1" value="${Number(options.visibleLimit || 20)}" data-ai-chat-helper-visible-limit />
      </label>
      <div class="ai-chat-helper-popover__hint">调整节点纵向间距与单页显示数量。</div>
    </section>
    <section class="ai-chat-helper-popover ai-chat-helper-reading-line-popover" aria-hidden="true" data-ai-chat-helper-reading-line-popover>
      <div class="ai-chat-helper-reading-line-popover__header">
        <span>阅读线高度</span>
        <b data-ai-chat-helper-reading-line-display>${Number(options.readingLineOffset || 150)}px</b>
      </div>
      <input type="range" min="10" max="500" step="10" value="${Number(options.readingLineOffset || 150)}" data-ai-chat-helper-reading-line />
      <div class="ai-chat-helper-popover__hint">设置滚动到屏幕何处时激活导航点。</div>
    </section>
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
        <span>移除推荐广告</span>
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
        <span>隐藏原生节点导航</span>
        <span class="ai-chat-helper-panel__switch">
          <input type="checkbox" ${options.hideDeepSeekNativeNav ? "checked" : ""} data-ai-chat-helper-hide-deepseek-native-nav />
          <span class="ai-chat-helper-panel__switch-slider"></span>
        </span>
      </label>
    `;
  }

  return "";
}

function renderBatchLimitSetting(options: PanelOptions): string {
  if (!options.canBatchExport) return "";

  return `
    <label class="ai-chat-helper-panel__setting">
      <span>批量上限</span>
      <input type="number" min="1" max="100" step="1" value="${Number(options.batchLimit || 20)}" data-ai-chat-helper-batch-limit />
    </label>
  `;
}

export function setPanelStatus(panel: HTMLElement, message: string): void {
  const status = panel.querySelector<HTMLElement>("[data-ai-chat-helper-status]");
  if (!status) return;

  status.textContent = message;
  status.hidden = message.length === 0;
}

export function setPanelVersionUpdateBadge(panel: HTMLElement, latestVersion: string): void {
  const badge = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version-badge]");
  const trigger = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version]");
  if (!badge || !trigger) return;

  const currentVersion = trigger.textContent?.match(/v([0-9][^\s]*)/)?.[1] || "0.0.0";
  const availableVersion = String(latestVersion || "").trim();
  const hasUpdate = availableVersion.length > 0;

  badge.style.opacity = hasUpdate ? "1" : "0";
  badge.style.transform = hasUpdate ? "scale(1)" : "scale(.7)";
  trigger.title = hasUpdate
    ? `New version v${availableVersion} available. Click to update.`
    : `Current version v${currentVersion}. Click to check updates.`;
}
