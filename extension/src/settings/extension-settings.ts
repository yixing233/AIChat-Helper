export interface ExtensionSettings {
  visibleLimit: number;
  batchLimit: number;
  readingLineOffset: number;
  dotGap: number;
  removeQwenAds: boolean;
  hideDeepSeekNativeNav: boolean;
  panelPosition: PanelPosition | null;
}

export interface PanelPosition {
  right: number;
  top: number;
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  visibleLimit: 20,
  batchLimit: 20,
  readingLineOffset: 150,
  dotGap: 36,
  removeQwenAds: false,
  hideDeepSeekNativeNav: false,
  panelPosition: null
};

export const LEGACY_VISIBLE_LIMIT_KEY = "ai-nodes-visible-limit";
export const LEGACY_READING_LINE_KEY = "ai-nodes-reading-line";
export const LEGACY_DOT_GAP_KEY = "ai-nodes-dot-gap";
export const LEGACY_QWEN_ADS_KEY = "ai-nodes-remove-qwen-ads";
export const LEGACY_DEEPSEEK_NATIVE_NAV_KEY = "ai-nodes-hide-deepseek-native-nav";
export const LEGACY_PANEL_POSITION_KEY = "AI-Chat-Helper-pos";

export const LEGACY_SETTING_MIGRATIONS: Array<[string, keyof ExtensionSettings]> = [
  [LEGACY_VISIBLE_LIMIT_KEY, "visibleLimit"],
  [LEGACY_READING_LINE_KEY, "readingLineOffset"],
  [LEGACY_DOT_GAP_KEY, "dotGap"],
  [LEGACY_QWEN_ADS_KEY, "removeQwenAds"],
  [LEGACY_DEEPSEEK_NATIVE_NAV_KEY, "hideDeepSeekNativeNav"],
  [LEGACY_PANEL_POSITION_KEY, "panelPosition"]
];

export function normalizeExtensionSettings(value: Partial<Record<keyof ExtensionSettings, unknown>>): ExtensionSettings {
  return {
    visibleLimit: normalizeVisibleLimit(value.visibleLimit),
    batchLimit: normalizeBatchLimit(value.batchLimit),
    readingLineOffset: normalizeReadingLineOffset(value.readingLineOffset),
    dotGap: normalizeDotGap(value.dotGap),
    removeQwenAds: normalizeBoolean(value.removeQwenAds, DEFAULT_EXTENSION_SETTINGS.removeQwenAds),
    hideDeepSeekNativeNav: normalizeBoolean(value.hideDeepSeekNativeNav, DEFAULT_EXTENSION_SETTINGS.hideDeepSeekNativeNav),
    panelPosition: normalizePanelPosition(value.panelPosition)
  };
}

function normalizeVisibleLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.visibleLimit);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.visibleLimit;
  return Math.max(1, Math.min(Math.round(parsed), 100));
}

function normalizeBatchLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.batchLimit);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.batchLimit;
  return Math.max(1, Math.min(Math.round(parsed), 100));
}

function normalizeReadingLineOffset(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.readingLineOffset);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.readingLineOffset;
  return Math.max(10, Math.min(Math.round(parsed), 500));
}

function normalizeDotGap(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.dotGap);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.dotGap;
  return Math.max(20, Math.min(Math.round(parsed), 50));
}

function normalizeBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return defaultValue;
}

function normalizePanelPosition(value: unknown): PanelPosition | null {
  const raw = parsePanelPosition(value);
  if (!raw) return null;
  const right = Number(raw.right);
  const top = Number(raw.top);
  if (!Number.isFinite(right) || !Number.isFinite(top)) return null;
  return {
    right: Math.max(0, Math.min(Math.round(right), 1200)),
    top: Math.max(0, Math.min(Math.round(top), 1200))
  };
}

function parsePanelPosition(value: unknown): Partial<PanelPosition> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Partial<PanelPosition>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Partial<PanelPosition> : null;
  } catch {
    return null;
  }
}
