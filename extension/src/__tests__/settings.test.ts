import { describe, expect, it } from "vitest";
import { DEFAULT_EXTENSION_SETTINGS, normalizeExtensionSettings } from "../settings/extension-settings";

describe("extension settings", () => {
  it("uses defaults for missing values", () => {
    expect(normalizeExtensionSettings({})).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it("clamps visible limit to a practical range", () => {
    expect(normalizeExtensionSettings({ visibleLimit: 0 }).visibleLimit).toBe(1);
    expect(normalizeExtensionSettings({ visibleLimit: 500 }).visibleLimit).toBe(100);
  });

  it("accepts numeric strings from legacy userscript storage", () => {
    expect(normalizeExtensionSettings({ visibleLimit: "25" }).visibleLimit).toBe(25);
  });

  it("clamps reading line offset to the userscript-compatible range", () => {
    expect(normalizeExtensionSettings({ readingLineOffset: 1 }).readingLineOffset).toBe(10);
    expect(normalizeExtensionSettings({ readingLineOffset: 900 }).readingLineOffset).toBe(500);
    expect(normalizeExtensionSettings({ readingLineOffset: "180" }).readingLineOffset).toBe(180);
  });
});
