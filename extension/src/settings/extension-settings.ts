export interface ExtensionSettings {
  visibleLimit: number;
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  visibleLimit: 20
};

export const LEGACY_VISIBLE_LIMIT_KEY = "ai-nodes-visible-limit";

export function normalizeExtensionSettings(value: Partial<Record<keyof ExtensionSettings, unknown>>): ExtensionSettings {
  return {
    visibleLimit: normalizeVisibleLimit(value.visibleLimit)
  };
}

function normalizeVisibleLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.visibleLimit);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.visibleLimit;
  return Math.max(1, Math.min(Math.round(parsed), 100));
}
