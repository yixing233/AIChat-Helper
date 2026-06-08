export interface ExtensionSettings {
  visibleLimit: number;
  readingLineOffset: number;
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  visibleLimit: 20,
  readingLineOffset: 150
};

export const LEGACY_VISIBLE_LIMIT_KEY = "ai-nodes-visible-limit";
export const LEGACY_READING_LINE_KEY = "ai-nodes-reading-line";

export function normalizeExtensionSettings(value: Partial<Record<keyof ExtensionSettings, unknown>>): ExtensionSettings {
  return {
    visibleLimit: normalizeVisibleLimit(value.visibleLimit),
    readingLineOffset: normalizeReadingLineOffset(value.readingLineOffset)
  };
}

function normalizeVisibleLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.visibleLimit);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.visibleLimit;
  return Math.max(1, Math.min(Math.round(parsed), 100));
}

function normalizeReadingLineOffset(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_EXTENSION_SETTINGS.readingLineOffset);
  if (!Number.isFinite(parsed)) return DEFAULT_EXTENSION_SETTINGS.readingLineOffset;
  return Math.max(10, Math.min(Math.round(parsed), 500));
}
