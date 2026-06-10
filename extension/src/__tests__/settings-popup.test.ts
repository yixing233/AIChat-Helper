import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from "../settings/extension-settings";
import { bindPopupActions, bindSettingsPopup, createSettingsPopup } from "../popup/settings-popup";

const popupCss = readFileSync(resolve(process.cwd(), "src/popup/styles.css"), "utf8");
const scriptUpdateIconPath = "M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10V11H17C18.933 11 20.5 12.567 20.5 14.5C20.5 16.433 18.933 18 17 18H16.9C16.3477 18 15.9 18.4477 15.9 19C15.9 19.5523 16.3477 20 16.9 20H17C20.0376 20 22.5 17.5376 22.5 14.5C22.5 11.7793 20.5245 9.51997 17.9296 9.07824C17.4862 6.20213 15.0003 4 12 4C8.99974 4 6.51381 6.20213 6.07036 9.07824C3.47551 9.51997 1.5 11.7793 1.5 14.5C1.5 17.5376 3.96243 20 7 20H7.1C7.65228 20 8.1 19.5523 8.1 19C8.1 18.4477 7.65228 18 7.1 18H7C5.067 18 3.5 16.433 3.5 14.5C3.5 12.567 5.067 11 7 11H8V10ZM13 11C13 10.4477 12.5523 10 12 10C11.4477 10 11 10.4477 11 11V16.5858L9.70711 15.2929C9.31658 14.9024 8.68342 14.9024 8.29289 15.2929C7.90237 15.6834 7.90237 16.3166 8.29289 16.7071L11.2929 19.7071C11.6834 20.0976 12.3166 20.0976 12.7071 19.7071L15.7071 16.7071C16.0976 16.3166 16.0976 15.6834 15.7071 15.2929C15.3166 14.9024 14.6834 14.9024 14.2929 15.2929L13 16.5858V11Z";

describe("settings popup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders common settings and only the Qwen platform setting on Qwen tabs", () => {
    const root = createSettingsPopup({
      settings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        visibleLimit: 25,
        batchLimit: 40,
        readingLineOffset: 180,
        dotGap: 42,
        autoUpdateCheck: false,
        removeQwenAds: true,
        hideDeepSeekNativeNav: true
      },
      version: "1.0.0",
      platformId: "qwen"
    });

    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-visible-limit]")?.value).toBe("25");
    expect(root.textContent).toContain("最大显示节点数");
    expect(root.textContent).not.toContain("单页数量");
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-dot-gap]")?.value).toBe("42");
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]")?.value).toBe("180");
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit]")?.value).toBe("40");
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-update-check]")?.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-backup-enabled]")?.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-backup-interval]")?.value).toBe("15");
    expect(root.textContent).toContain("备份");
    expect(root.textContent).toContain("自动备份");
    expect(root.textContent).toContain("备份间隔");
    expect(root.querySelector("[data-ai-chat-helper-popup-action='open-backups']")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-popup-action='backup-current-now']")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-popup-action='backup-platform-now']")).toBeTruthy();
    const backupCurrentIcon = root.querySelector("[data-ai-chat-helper-popup-action='backup-current-now'] svg");
    const backupAllIcon = root.querySelector("[data-ai-chat-helper-popup-action='backup-platform-now'] svg");
    expect(backupCurrentIcon?.innerHTML).not.toBe(backupAllIcon?.innerHTML);
    expect(backupCurrentIcon?.querySelector("[data-ai-chat-helper-icon='single-document']")).toBeTruthy();
    expect(backupAllIcon?.querySelector("[data-ai-chat-helper-icon='stacked-documents']")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-popup-action='export-current']")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-popup-action='export-batch']")).toBeTruthy();
    const title = root.querySelector(".ai-chat-helper-popup__header-title");
    const version = title?.querySelector("span");
    const updateButton = title?.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='check-update']");
    expect(updateButton).toBeTruthy();
    expect(title?.querySelector("strong")?.nextElementSibling).toBe(version);
    expect(version?.nextElementSibling).toBe(updateButton);
    expect(updateButton?.classList.contains("ai-chat-helper-popup__header-icon")).toBe(true);
    expect(updateButton?.getAttribute("aria-label")).toBe("检查更新");
    expect(updateButton?.getAttribute("title")).toBe("检查更新");
    expect(updateButton?.querySelector("svg")).toBeTruthy();
    expect(updateButton?.querySelector("path")?.getAttribute("d")).toBe(scriptUpdateIconPath);
    expect(updateButton?.textContent?.trim()).toBe("");
    expect(root.querySelector(".ai-chat-helper-popup__actions [data-ai-chat-helper-popup-action='check-update']")).toBeFalsy();
    expect(root.querySelector(".ai-chat-helper-popup__actions [data-ai-chat-helper-popup-action='open-github']")).toBeFalsy();
    const githubButton = root.querySelector<HTMLButtonElement>(".ai-chat-helper-popup__header [data-ai-chat-helper-popup-action='open-github']");
    expect(githubButton).toBeTruthy();
    expect(githubButton?.classList.contains("ai-chat-helper-popup__header-icon")).toBe(true);
    expect(githubButton?.getAttribute("aria-label")).toBe("GitHub 项目");
    expect(githubButton?.getAttribute("title")).toBe("GitHub 项目");
    expect(githubButton?.querySelector("svg")).toBeTruthy();
    expect(githubButton?.textContent?.trim()).toBe("");
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]")?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]")).toBeFalsy();
    expect(root.textContent).toContain("v1.0.0");
  });

  it("renders only the DeepSeek platform setting on DeepSeek tabs", () => {
    const root = createSettingsPopup({
      settings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        removeQwenAds: true,
        hideDeepSeekNativeNav: true
      },
      version: "1.0.0",
      platformId: "deepseek"
    });

    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]")).toBeFalsy();
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]")?.checked).toBe(true);
  });

  it("hides platform-only settings when the active tab is not platform-specific", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt"
    });

    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]")).toBeFalsy();
    expect(root.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]")).toBeFalsy();
  });

  it("hides export actions when the active tab is not a supported platform", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: null,
      canExportCurrent: false,
      canBatchExport: false
    });

    expect(root.querySelector("[data-ai-chat-helper-popup-action='export-current']")).toBeFalsy();
    expect(root.querySelector("[data-ai-chat-helper-popup-action='export-batch']")).toBeFalsy();
    expect(root.querySelector(".ai-chat-helper-popup__header-title [data-ai-chat-helper-popup-action='check-update']")).toBeTruthy();
    expect(root.querySelector(".ai-chat-helper-popup__header [data-ai-chat-helper-popup-action='open-github']")).toBeTruthy();
  });

  it("emits popup menu actions", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt",
      canBatchExport: true
    });
    const onAction = vi.fn();

    bindPopupActions(root, onAction);
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='export-current']")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='export-batch']")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='check-update']")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='open-github']")?.click();

    expect(onAction).toHaveBeenNthCalledWith(1, "export-current");
    expect(onAction).toHaveBeenNthCalledWith(2, "export-batch");
    expect(onAction).toHaveBeenNthCalledWith(3, "check-update");
    expect(onAction).toHaveBeenNthCalledWith(4, "open-github");
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='open-backups']")?.click();
    expect(onAction).toHaveBeenNthCalledWith(5, "open-backups");
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='backup-current-now']")?.click();
    expect(onAction).toHaveBeenNthCalledWith(6, "backup-current-now");
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='backup-platform-now']")?.click();
    expect(onAction).toHaveBeenNthCalledWith(7, "backup-platform-now");
  });

  it("shows immediate backup progress from runtime messages", () => {
    const listeners: Array<(message: unknown) => void> = [];
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          onMessage: {
            addListener: vi.fn((listener: (message: unknown) => void) => {
              listeners.push(listener);
            }),
            removeListener: vi.fn()
          }
        }
      }
    });
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt",
      canBatchExport: true
    });

    bindPopupActions(root, vi.fn());
    listeners[0]?.({
      type: "ai-chat-helper:backup-progress",
      payload: {
        status: "running",
        platformName: "ChatGPT",
        current: 2,
        total: 5,
        created: 1,
        unchanged: 1,
        failed: 0,
        title: "Conversation"
      }
    });

    expect(root.querySelector("[data-ai-chat-helper-backup-progress]")?.textContent).toContain("ChatGPT 2/5");
    expect(root.querySelector("[data-ai-chat-helper-backup-progress]")?.textContent).toContain("覆盖 1");
  });

  it("renders batch export as two smaller side-by-side download arrows", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt",
      canBatchExport: true
    });
    const exportButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='export-current']");
    const batchButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='export-batch']");

    expect(exportButton?.querySelectorAll("polyline[points='7 10 12 15 17 10']")).toHaveLength(1);
    expect(batchButton?.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.8");
    expect(batchButton?.querySelectorAll("polyline[points='5 10 8 13 11 10']")).toHaveLength(1);
    expect(batchButton?.querySelectorAll("polyline[points='13 10 16 13 19 10']")).toHaveLength(1);
    expect(batchButton?.querySelectorAll("line[x1='8'][x2='8']")).toHaveLength(1);
    expect(batchButton?.querySelectorAll("line[x1='16'][x2='16']")).toHaveLength(1);
    expect(batchButton?.querySelector("polyline[points='7 13 12 18 17 13']")).toBeFalsy();
    expect(batchButton?.querySelector("path[d='M8 6h13']")).toBeFalsy();
  });

  it("shows a loading animation while exporting the current conversation", async () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt",
      canBatchExport: true
    });
    let resolveExport: (() => void) | undefined;
    const onAction = vi.fn(() => new Promise<void>((resolve) => {
      resolveExport = resolve;
    }));
    const exportButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='export-current']");

    expect(exportButton).toBeTruthy();
    expect(exportButton?.querySelector(".ai-chat-helper-popup__action-spinner")).toBeTruthy();
    bindPopupActions(root, onAction);
    exportButton!.click();

    expect(exportButton!.disabled).toBe(true);
    expect(exportButton!.classList.contains("is-loading")).toBe(true);
    expect(exportButton!.getAttribute("aria-busy")).toBe("true");

    resolveExport?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exportButton!.disabled).toBe(false);
    expect(exportButton!.classList.contains("is-loading")).toBe(false);
    expect(exportButton!.hasAttribute("aria-busy")).toBe(false);
  });

  it("normalizes and emits the full settings object when a control changes", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "qwen"
    });
    const onChange = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    bindSettingsPopup(root, DEFAULT_EXTENSION_SETTINGS, onChange);
    const visibleLimitInput = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-visible-limit]");
    expect(visibleLimitInput).toBeTruthy();

    visibleLimitInput!.value = "500";
    visibleLimitInput!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining<Partial<ExtensionSettings>>({
      visibleLimit: 100,
      batchLimit: DEFAULT_EXTENSION_SETTINGS.batchLimit,
      readingLineOffset: DEFAULT_EXTENSION_SETTINGS.readingLineOffset,
      dotGap: DEFAULT_EXTENSION_SETTINGS.dotGap,
      autoUpdateCheck: DEFAULT_EXTENSION_SETTINGS.autoUpdateCheck,
      autoBackupEnabled: DEFAULT_EXTENSION_SETTINGS.autoBackupEnabled,
      autoBackupIntervalMinutes: DEFAULT_EXTENSION_SETTINGS.autoBackupIntervalMinutes,
      removeQwenAds: DEFAULT_EXTENSION_SETTINGS.removeQwenAds,
      hideDeepSeekNativeNav: DEFAULT_EXTENSION_SETTINGS.hideDeepSeekNativeNav,
      panelPosition: DEFAULT_EXTENSION_SETTINGS.panelPosition
    }));
    expect(visibleLimitInput!.value).toBe("100");
  });

  it("emits automatic backup settings when backup controls change", () => {
    const root = createSettingsPopup({
      settings: DEFAULT_EXTENSION_SETTINGS,
      version: "1.0.0",
      platformId: "chatgpt"
    });
    const onChange = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    bindSettingsPopup(root, DEFAULT_EXTENSION_SETTINGS, onChange);
    const enabledInput = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-backup-enabled]");
    const intervalInput = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-backup-interval]");
    expect(enabledInput).toBeTruthy();
    expect(intervalInput).toBeTruthy();

    enabledInput!.checked = true;
    enabledInput!.dispatchEvent(new Event("change", { bubbles: true }));
    intervalInput!.value = "30";
    intervalInput!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining<Partial<ExtensionSettings>>({
      autoBackupEnabled: true
    }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining<Partial<ExtensionSettings>>({
      autoBackupEnabled: true,
      autoBackupIntervalMinutes: 30
    }));
  });

  it("draws the reading-line range with canvas while keeping native range interaction", () => {
    const root = createSettingsPopup({
      settings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        readingLineOffset: 170
      },
      version: "1.0.0",
      platformId: "chatgpt"
    });
    const input = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
    const canvas = root.querySelector<HTMLCanvasElement>("[data-ai-chat-helper-reading-line-canvas]");
    const onChange = vi.fn();
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0
    };

    expect(input).toBeTruthy();
    expect(canvas).toBeTruthy();
    expect(input?.classList.contains("ai-chat-helper-popup__range-native")).toBe(true);
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    vi.spyOn(canvas!, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);

    bindSettingsPopup(root, DEFAULT_EXTENSION_SETTINGS, onChange);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    expect(context.roundRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), 10, expect.any(Number));

    input!.value = "260";
    input!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector("[data-ai-chat-helper-reading-line-display]")?.textContent).toBe("260px");
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(context.roundRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), 10, expect.any(Number));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining<Partial<ExtensionSettings>>({
      readingLineOffset: 260
    }));
  });

  it("draws active handle feedback while dragging the reading-line range", () => {
    const root = createSettingsPopup({
      settings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        readingLineOffset: 220
      },
      version: "1.0.0",
      platformId: "chatgpt"
    });
    const input = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-reading-line]");
    const canvas = root.querySelector<HTMLCanvasElement>("[data-ai-chat-helper-reading-line-canvas]");
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0
    };

    expect(input).toBeTruthy();
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);

    bindSettingsPopup(root, DEFAULT_EXTENSION_SETTINGS, vi.fn());
    expect(context.roundRect).toHaveBeenNthCalledWith(3, expect.any(Number), 0, 18, 10, 5);

    input!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(context.roundRect).toHaveBeenNthCalledWith(6, expect.any(Number), 0, 24, 10, 5);

    input!.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(context.roundRect).toHaveBeenNthCalledWith(9, expect.any(Number), 0, 18, 10, 5);
  });

  it("stretches the reading-line range track across the full setting row", () => {
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__range\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*justify-content:\s*stretch;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__canvas-range\s*\{[\s\S]*width:\s*100%;[\s\S]*justify-self:\s*stretch;/s);
  });

  it("keeps the reading-line range free of a drag focus outline", () => {
    expect(popupCss).not.toMatch(/\.ai-chat-helper-popup__canvas-range:focus-within\s*\{[\s\S]*box-shadow:/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__range-native\s*\{[\s\S]*outline:\s*none;/s);
  });

  it("styles the export action loading spinner", () => {
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__action-spinner\s*\{[\s\S]*display:\s*none;[\s\S]*border:\s*2px solid rgb\(37 99 235 \/ 18%\);[\s\S]*animation:\s*ai-chat-helper-popup-spin/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__action\.is-loading\s*>\s*svg\s*\{[\s\S]*display:\s*none;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__action\.is-loading\s+\.ai-chat-helper-popup__action-spinner\s*\{[\s\S]*display:\s*inline-block;/s);
    expect(popupCss).toMatch(/@keyframes ai-chat-helper-popup-spin\s*\{[\s\S]*to\s*\{[\s\S]*transform:\s*rotate\(360deg\);/s);
  });

  it("keeps the popup version and update icon on the title row without button chrome", () => {
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__header-title\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*baseline;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__header-icon--inline\s*\{[\s\S]*border:\s*none;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-popup__header-icon--inline:hover,\s*\.ai-chat-helper-popup__header-icon--inline:focus-visible\s*\{[\s\S]*border:\s*none;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/s);
  });
});
