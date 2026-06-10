import { escapeHtml } from "../ui/shared/escape-html";
import { isImmediateBackupProgressMessage } from "../messaging/bridge";
import { DEFAULT_EXTENSION_SETTINGS, normalizeExtensionSettings, type ExtensionSettings } from "../settings/extension-settings";
import type { ImmediateBackupProgressPayload } from "../messaging/protocol";
import type { PlatformId } from "../shared/types";

export interface SettingsPopupOptions {
  settings: ExtensionSettings;
  version: string;
  platformId?: PlatformId | null;
  canExportCurrent?: boolean;
  canBatchExport?: boolean;
}

export type SettingsChangeHandler = (settings: ExtensionSettings) => void | Promise<void>;
export type PopupAction = "export-current" | "export-batch" | "check-update" | "open-github" | "open-backups" | "backup-current-now" | "backup-platform-now";
export type PopupActionHandler = (action: PopupAction) => void | Promise<void>;

const readingLineRangeWidth = 240;
const readingLineTrackHeight = 10;
const readingLineHandleWidth = 18;
const readingLineActiveHandleWidth = 24;

const exportIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
`;

const batchIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"></path>
    <polyline points="5 10 8 13 11 10"></polyline>
    <line x1="8" y1="13" x2="8" y2="4"></line>
    <polyline points="13 10 16 13 19 10"></polyline>
    <line x1="16" y1="13" x2="16" y2="4"></line>
  </svg>
`;

const backupIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"></path>
    <path d="M8 9h8"></path>
    <path d="M8 13h5"></path>
    <path d="M16 15.5 18 17l2-3"></path>
  </svg>
`;

const backupCurrentIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g data-ai-chat-helper-icon="single-document">
      <path d="M5 4.8A2.2 2.2 0 0 1 7.2 2.6h6.6L19 7.8v3.9"></path>
      <path d="M13.8 2.6v4.2a1 1 0 0 0 1 1H19"></path>
      <path d="M8 10h5.2"></path>
      <path d="M8 13.2h4.2"></path>
      <path d="M5 4.8v12A2.2 2.2 0 0 0 7.2 19h4.2"></path>
      <path d="M12.4 17.2h6.2"></path>
      <path d="m16.1 13.8 3.4 3.4-3.4 3.4"></path>
    </g>
  </svg>
`;

const backupPlatformIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g data-ai-chat-helper-icon="stacked-documents">
      <path d="M8.5 3.2h7.8A2.2 2.2 0 0 1 18.5 5.4v9.8"></path>
      <path d="M6.4 5.4h8A2.2 2.2 0 0 1 16.6 7.6v9.7"></path>
      <path d="M4.4 8A2.2 2.2 0 0 1 6.6 5.8h5.9l4.1 4.1v2.2"></path>
      <path d="M12.5 5.8v3.3a.8.8 0 0 0 .8.8h3.3"></path>
      <path d="M7.2 11.9h4.4"></path>
      <path d="M7.2 14.7h3.6"></path>
      <path d="M4.4 8v9.6a2.2 2.2 0 0 0 2.2 2.2h3.7"></path>
      <path d="M11.7 17.3h6.8"></path>
      <path d="m15.8 13.9 3.4 3.4-3.4 3.4"></path>
    </g>
  </svg>
`;

const updateIcon = `
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10V11H17C18.933 11 20.5 12.567 20.5 14.5C20.5 16.433 18.933 18 17 18H16.9C16.3477 18 15.9 18.4477 15.9 19C15.9 19.5523 16.3477 20 16.9 20H17C20.0376 20 22.5 17.5376 22.5 14.5C22.5 11.7793 20.5245 9.51997 17.9296 9.07824C17.4862 6.20213 15.0003 4 12 4C8.99974 4 6.51381 6.20213 6.07036 9.07824C3.47551 9.51997 1.5 11.7793 1.5 14.5C1.5 17.5376 3.96243 20 7 20H7.1C7.65228 20 8.1 19.5523 8.1 19C8.1 18.4477 7.65228 18 7.1 18H7C5.067 18 3.5 16.433 3.5 14.5C3.5 12.567 5.067 11 7 11H8V10ZM13 11C13 10.4477 12.5523 10 12 10C11.4477 10 11 10.4477 11 11V16.5858L9.70711 15.2929C9.31658 14.9024 8.68342 14.9024 8.29289 15.2929C7.90237 15.6834 7.90237 16.3166 8.29289 16.7071L11.2929 19.7071C11.6834 20.0976 12.3166 20.0976 12.7071 19.7071L15.7071 16.7071C16.0976 16.3166 16.0976 15.6834 15.7071 15.2929C15.3166 14.9024 14.6834 14.9024 14.2929 15.2929L13 16.5858V11Z" fill="currentColor"></path>
  </svg>
`;

const githubIcon = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.71 1.25 3.37.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.19 1.18a11.1 11.1 0 0 1 5.81 0c2.22-1.49 3.19-1.18 3.19-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.66.41.35.78 1.04.78 2.1v3.11c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"></path>
  </svg>
`;

export function createSettingsPopup(options: SettingsPopupOptions): HTMLElement {
  const settings = normalizeExtensionSettings(options.settings);
  const root = document.createElement("main");
  root.className = "ai-chat-helper-popup";
  root.innerHTML = `
    <header class="ai-chat-helper-popup__header">
      <div class="ai-chat-helper-popup__header-title">
        <strong>AI Chat Helper</strong>
        <span>v${escapeHtml(options.version || "0.0.0")}</span>
        <button type="button" class="ai-chat-helper-popup__header-icon ai-chat-helper-popup__header-icon--inline" title="检查更新" aria-label="检查更新" data-ai-chat-helper-popup-action="check-update">${updateIcon}</button>
      </div>
      <div class="ai-chat-helper-popup__header-actions">
        <small data-ai-chat-helper-popup-status></small>
        <button type="button" class="ai-chat-helper-popup__header-icon" title="GitHub 项目" aria-label="GitHub 项目" data-ai-chat-helper-popup-action="open-github">${githubIcon}</button>
      </div>
    </header>

    <section class="ai-chat-helper-popup__section">
      <h2>操作</h2>
      <div class="ai-chat-helper-popup__actions">
        ${options.canExportCurrent === false ? "" : renderActionButton("导出对话", "export-current", exportIcon)}
        ${options.canBatchExport === false ? "" : renderActionButton("批量导出", "export-batch", batchIcon)}
      </div>
    </section>

    <section class="ai-chat-helper-popup__section">
      <h2>节点</h2>
      ${renderNumberSetting("节点间距", "data-ai-chat-helper-dot-gap", settings.dotGap, 20, 50, 1)}
      ${renderNumberSetting("最大显示节点数", "data-ai-chat-helper-visible-limit", settings.visibleLimit, 1, 100, 1)}
    </section>

    <section class="ai-chat-helper-popup__section">
      <h2>阅读线</h2>
      <label class="ai-chat-helper-popup__range">
        <span>阅读线高度 <b data-ai-chat-helper-reading-line-display>${settings.readingLineOffset}px</b></span>
        <div class="ai-chat-helper-popup__canvas-range">
          <canvas width="${readingLineRangeWidth}" height="${readingLineTrackHeight}" aria-hidden="true" data-ai-chat-helper-reading-line-canvas></canvas>
          <input class="ai-chat-helper-popup__range-native" type="range" min="10" max="500" step="10" value="${settings.readingLineOffset}" data-ai-chat-helper-reading-line />
        </div>
      </label>
    </section>

    <section class="ai-chat-helper-popup__section">
      <h2>导出</h2>
      ${renderNumberSetting("批量上限", "data-ai-chat-helper-batch-limit", settings.batchLimit, 1, 100, 1)}
    </section>

    <section class="ai-chat-helper-popup__section">
      <h2>备份</h2>
      <div class="ai-chat-helper-popup__actions ai-chat-helper-popup__actions--single">
        ${renderActionButton("备份库", "open-backups", backupIcon)}
      </div>
      <div class="ai-chat-helper-popup__actions ai-chat-helper-popup__actions--split">
        ${renderActionButton("备份当前", "backup-current-now", backupCurrentIcon)}
        ${renderActionButton("备份全部", "backup-platform-now", backupPlatformIcon)}
      </div>
      <div class="ai-chat-helper-popup__backup-progress" data-ai-chat-helper-backup-progress hidden>
        <div class="ai-chat-helper-popup__backup-progress-head">
          <strong data-ai-chat-helper-backup-progress-title>备份进度</strong>
          <span data-ai-chat-helper-backup-progress-count>0/0</span>
        </div>
        <div class="ai-chat-helper-popup__backup-progress-track" aria-hidden="true">
          <span data-ai-chat-helper-backup-progress-bar style="width:0%"></span>
        </div>
        <p data-ai-chat-helper-backup-progress-detail></p>
      </div>
      ${renderSwitchSetting("自动备份", "data-ai-chat-helper-auto-backup-enabled", settings.autoBackupEnabled)}
      ${renderNumberSetting("备份间隔", "data-ai-chat-helper-auto-backup-interval", settings.autoBackupIntervalMinutes, 5, 1440, 5)}
    </section>

    <section class="ai-chat-helper-popup__section">
      <h2>行为</h2>
      ${renderSwitchSetting("自动检查更新", "data-ai-chat-helper-auto-update-check", settings.autoUpdateCheck)}
    </section>

    ${renderPlatformSettings(options.platformId || null, settings)}
  `;
  return root;
}

export function bindPopupActions(root: HTMLElement, onAction: PopupActionHandler): void {
  const status = root.querySelector<HTMLElement>("[data-ai-chat-helper-popup-status]");
  const progressListener = (message: unknown) => {
    if (!isImmediateBackupProgressMessage(message)) return;
    renderImmediateBackupProgress(root, message.payload);
  };
  if (typeof chrome !== "undefined") {
    chrome.runtime?.onMessage?.addListener?.(progressListener);
  }

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("[data-ai-chat-helper-popup-action]");
    if (!button) return;

    const action = button.dataset.aiChatHelperPopupAction;
    if (!isPopupAction(action)) return;

    const shouldShowLoading = button.classList.contains("ai-chat-helper-popup__action");
    setPopupActionLoading(button, shouldShowLoading);
    if (status) status.textContent = "处理中";
    let actionResult: void | Promise<void>;
    try {
      actionResult = onAction(action);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      setPopupActionLoading(button, false);
      return;
    }
    Promise.resolve(actionResult)
      .then(() => {
        if (status) status.textContent = action === "open-github" ? "已打开" : "已发送";
      })
      .catch((error) => {
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        setPopupActionLoading(button, false);
      });
  });
}

export function bindSettingsPopup(root: HTMLElement, initialSettings: ExtensionSettings, onChange: SettingsChangeHandler): void {
  let currentSettings = normalizeExtensionSettings(initialSettings);
  const status = root.querySelector<HTMLElement>("[data-ai-chat-helper-popup-status]");
  const readingLineDisplay = root.querySelector<HTMLElement>("[data-ai-chat-helper-reading-line-display]");
  const readingLineRange = createReadingLineRangePainter(root);
  const redrawReadingLineRange = () => readingLineRange.draw();

  const emitChange = () => {
    const nextSettings = readSettingsFromPopup(root, currentSettings);
    currentSettings = nextSettings;
    writeSettingsToPopup(root, nextSettings);
    if (readingLineDisplay) readingLineDisplay.textContent = `${nextSettings.readingLineOffset}px`;
    redrawReadingLineRange();
    if (status) status.textContent = "保存中";

    Promise.resolve(onChange(nextSettings))
      .then(() => {
        if (status) status.textContent = "已保存";
      })
      .catch((error) => {
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
      });
  };

  redrawReadingLineRange();
  bindReadingLineDragState(root, readingLineRange);

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "range") return;
    emitChange();
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    emitChange();
  });
}

interface ReadingLineRangePainter {
  input: HTMLInputElement | null;
  draw: () => void;
  setDragging: (isDragging: boolean) => void;
}

function createReadingLineRangePainter(root: HTMLElement): ReadingLineRangePainter {
  const input = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
  const canvas = root.querySelector<HTMLCanvasElement>("[data-ai-chat-helper-reading-line-canvas]");
  let isDragging = false;
  const draw = () => {
    if (!input || !canvas) return;
    drawReadingLineRange(canvas, input, isDragging);
  };
  return {
    input,
    draw,
    setDragging(nextIsDragging: boolean) {
      if (isDragging === nextIsDragging) return;
      isDragging = nextIsDragging;
      draw();
    }
  };
}

function bindReadingLineDragState(root: HTMLElement, painter: ReadingLineRangePainter): void {
  if (!painter.input) return;

  const stopDragging = () => painter.setDragging(false);

  root.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target !== painter.input) return;
    if (typeof event.pointerId === "number") {
      painter.input?.setPointerCapture(event.pointerId);
    }
    painter.setDragging(true);
  });

  root.addEventListener("pointerup", (event) => {
    if (event.target === painter.input) stopDragging();
  });

  root.addEventListener("pointercancel", (event) => {
    if (event.target === painter.input) stopDragging();
  });

  painter.input.addEventListener("lostpointercapture", stopDragging);
  painter.input.addEventListener("blur", stopDragging);
}

function drawReadingLineRange(canvas: HTMLCanvasElement, input: HTMLInputElement, isDragging: boolean): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = Math.max(readingLineHandleWidth, Math.round(canvas.clientWidth || canvas.width || readingLineRangeWidth));
  const height = readingLineTrackHeight;
  const min = parseFiniteNumber(input.min, 0);
  const max = parseFiniteNumber(input.max, 100);
  const value = Math.min(max, Math.max(min, parseFiniteNumber(input.value, min)));
  const progress = max === min ? 0 : (value - min) / (max - min);
  const handleWidth = Math.min(isDragging ? readingLineActiveHandleWidth : readingLineHandleWidth, width);
  const handleX = (width - handleWidth) * progress;
  const fillWidth = Math.max(handleWidth / 2, handleX + handleWidth / 2);
  const radius = height / 2;
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const bitmapWidth = Math.round(width * pixelRatio);
  const bitmapHeight = Math.round(height * pixelRatio);

  if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
  if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;

  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);
  fillRoundedRect(context, 0, 0, width, height, radius, "#e2e8f0");
  fillRoundedRect(context, 0, 0, fillWidth, height, radius, isDragging ? "#93c5fd" : "#bfdbfe");
  fillRoundedRect(context, handleX, 0, handleWidth, height, radius, isDragging ? "#1d4ed8" : "#2563eb");
  context.restore();
}

function fillRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
  context.fillStyle = color;
  context.fill();
}

function parseFiniteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function renderActionButton(label: string, action: PopupAction, icon: string): string {
  return `
    <button type="button" class="ai-chat-helper-popup__action" data-ai-chat-helper-popup-action="${action}">
      ${icon}
      <span class="ai-chat-helper-popup__action-spinner" aria-hidden="true"></span>
      <span class="ai-chat-helper-popup__action-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function setPopupActionLoading(button: HTMLButtonElement, isLoading: boolean): void {
  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;
  if (isLoading) {
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.removeAttribute("aria-busy");
}

function isPopupAction(value: unknown): value is PopupAction {
  return value === "export-current"
    || value === "export-batch"
    || value === "check-update"
    || value === "open-github"
    || value === "open-backups"
    || value === "backup-current-now"
    || value === "backup-platform-now";
}

function renderImmediateBackupProgress(root: HTMLElement, payload: ImmediateBackupProgressPayload): void {
  const progress = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-progress]");
  const title = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-progress-title]");
  const count = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-progress-count]");
  const bar = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-progress-bar]");
  const detail = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-progress-detail]");
  if (!progress || !title || !count || !bar || !detail) return;

  const total = Math.max(0, Math.floor(payload.total || 0));
  const current = Math.max(0, Math.min(total || payload.current || 0, Math.floor(payload.current || 0)));
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  progress.hidden = false;
  title.textContent = getImmediateBackupProgressTitle(payload);
  count.textContent = `${payload.platformName} ${current}/${total}`;
  bar.style.width = `${percent}%`;
  detail.textContent = getImmediateBackupProgressDetail(payload);
}

function getImmediateBackupProgressTitle(payload: ImmediateBackupProgressPayload): string {
  if (payload.status === "done") return "立即备份完成";
  if (payload.status === "error") return "立即备份失败";
  if (payload.status === "starting") return "正在准备备份";
  return "正在立即备份";
}

function getImmediateBackupProgressDetail(payload: ImmediateBackupProgressPayload): string {
  const parts = [
    `覆盖 ${payload.created}`,
    `未变化 ${payload.unchanged}`,
    `失败 ${payload.failed}`
  ];
  if (payload.error) parts.push(payload.error);
  else if (payload.title) parts.push(payload.title);
  return parts.join(" · ");
}

function readSettingsFromPopup(root: HTMLElement, previousSettings: ExtensionSettings): ExtensionSettings {
  return normalizeExtensionSettings({
    ...DEFAULT_EXTENSION_SETTINGS,
    panelPosition: previousSettings.panelPosition,
    visibleLimit: readInputValue(root, "[data-ai-chat-helper-visible-limit]"),
    batchLimit: readInputValue(root, "[data-ai-chat-helper-batch-limit]"),
    readingLineOffset: readInputValue(root, "[data-ai-chat-helper-reading-line]"),
    dotGap: readInputValue(root, "[data-ai-chat-helper-dot-gap]"),
    autoUpdateCheck: readChecked(root, "[data-ai-chat-helper-auto-update-check]", previousSettings.autoUpdateCheck),
    autoBackupEnabled: readChecked(root, "[data-ai-chat-helper-auto-backup-enabled]", previousSettings.autoBackupEnabled),
    autoBackupIntervalMinutes: readInputValue(root, "[data-ai-chat-helper-auto-backup-interval]"),
    removeQwenAds: readChecked(root, "[data-ai-chat-helper-remove-qwen-ads]", previousSettings.removeQwenAds),
    hideDeepSeekNativeNav: readChecked(root, "[data-ai-chat-helper-hide-deepseek-native-nav]", previousSettings.hideDeepSeekNativeNav)
  });
}

function writeSettingsToPopup(root: HTMLElement, settings: ExtensionSettings): void {
  writeInputValue(root, "[data-ai-chat-helper-visible-limit]", settings.visibleLimit);
  writeInputValue(root, "[data-ai-chat-helper-batch-limit]", settings.batchLimit);
  writeInputValue(root, "[data-ai-chat-helper-reading-line]", settings.readingLineOffset);
  writeInputValue(root, "[data-ai-chat-helper-dot-gap]", settings.dotGap);
  writeChecked(root, "[data-ai-chat-helper-auto-update-check]", settings.autoUpdateCheck);
  writeChecked(root, "[data-ai-chat-helper-auto-backup-enabled]", settings.autoBackupEnabled);
  writeInputValue(root, "[data-ai-chat-helper-auto-backup-interval]", settings.autoBackupIntervalMinutes);
  writeChecked(root, "[data-ai-chat-helper-remove-qwen-ads]", settings.removeQwenAds);
  writeChecked(root, "[data-ai-chat-helper-hide-deepseek-native-nav]", settings.hideDeepSeekNativeNav);
}

function renderNumberSetting(label: string, dataAttribute: string, value: number, min: number, max: number, step: number): string {
  return `
    <label class="ai-chat-helper-popup__setting">
      <span>${escapeHtml(label)}</span>
      <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" ${dataAttribute} />
    </label>
  `;
}

function renderSwitchSetting(label: string, dataAttribute: string, checked: boolean): string {
  return `
    <label class="ai-chat-helper-popup__setting ai-chat-helper-popup__setting--toggle">
      <span>${escapeHtml(label)}</span>
      <span class="ai-chat-helper-popup__switch">
        <input type="checkbox" ${checked ? "checked" : ""} ${dataAttribute} />
        <span class="ai-chat-helper-popup__switch-slider"></span>
      </span>
    </label>
  `;
}

function renderPlatformSettings(platformId: PlatformId | null, settings: ExtensionSettings): string {
  const controls: string[] = [];
  if (platformId === "qwen") {
    controls.push(renderSwitchSetting("Qwen 移除推荐广告", "data-ai-chat-helper-remove-qwen-ads", settings.removeQwenAds));
  }
  if (platformId === "deepseek") {
    controls.push(renderSwitchSetting("DeepSeek 隐藏原生节点导航", "data-ai-chat-helper-hide-deepseek-native-nav", settings.hideDeepSeekNativeNav));
  }
  if (!controls.length) return "";
  return `
    <section class="ai-chat-helper-popup__section">
      <h2>平台</h2>
      ${controls.join("")}
    </section>
  `;
}

function readInputValue(root: HTMLElement, selector: string): string {
  return root.querySelector<HTMLInputElement>(selector)?.value || "";
}

function writeInputValue(root: HTMLElement, selector: string, value: number): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (input) input.value = String(value);
}

function readChecked(root: HTMLElement, selector: string, fallback: boolean): boolean {
  const input = root.querySelector<HTMLInputElement>(selector);
  return input ? input.checked : fallback;
}

function writeChecked(root: HTMLElement, selector: string, checked: boolean): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (input) input.checked = checked;
}
