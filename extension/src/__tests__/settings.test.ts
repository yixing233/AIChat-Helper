import { describe, expect, it } from "vitest";
import { DEFAULT_EXTENSION_SETTINGS, LEGACY_SETTING_MIGRATIONS, normalizeExtensionSettings } from "../settings/extension-settings";

describe("extension settings", () => {
  it("uses defaults for missing values", () => {
    expect(normalizeExtensionSettings({})).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it("clamps visible limit to a practical range", () => {
    expect(normalizeExtensionSettings({ visibleLimit: 0 }).visibleLimit).toBe(1);
    expect(normalizeExtensionSettings({ visibleLimit: 500 }).visibleLimit).toBe(100);
  });

  it("clamps batch export limit to a practical range", () => {
    expect(normalizeExtensionSettings({ batchLimit: 0 }).batchLimit).toBe(1);
    expect(normalizeExtensionSettings({ batchLimit: 500 }).batchLimit).toBe(100);
    expect(normalizeExtensionSettings({ batchLimit: "35" }).batchLimit).toBe(35);
  });

  it("normalizes automatic backup settings", () => {
    expect(normalizeExtensionSettings({ autoBackupEnabled: "true" }).autoBackupEnabled).toBe(true);
    expect(normalizeExtensionSettings({ autoBackupEnabled: "false" }).autoBackupEnabled).toBe(false);
    expect(normalizeExtensionSettings({ autoBackupIntervalMinutes: 0 }).autoBackupIntervalMinutes).toBe(5);
    expect(normalizeExtensionSettings({ autoBackupIntervalMinutes: 5000 }).autoBackupIntervalMinutes).toBe(1440);
    expect(normalizeExtensionSettings({ autoBackupIntervalMinutes: "30" }).autoBackupIntervalMinutes).toBe(30);
  });

  it("accepts numeric strings from legacy userscript storage", () => {
    expect(normalizeExtensionSettings({ visibleLimit: "25" }).visibleLimit).toBe(25);
  });

  it("clamps reading line offset to the userscript-compatible range", () => {
    expect(normalizeExtensionSettings({ readingLineOffset: 1 }).readingLineOffset).toBe(10);
    expect(normalizeExtensionSettings({ readingLineOffset: 900 }).readingLineOffset).toBe(500);
    expect(normalizeExtensionSettings({ readingLineOffset: "180" }).readingLineOffset).toBe(180);
  });

  it("normalizes migrated userscript-only settings", () => {
    expect(normalizeExtensionSettings({ dotGap: 1 }).dotGap).toBe(20);
    expect(normalizeExtensionSettings({ dotGap: 90 }).dotGap).toBe(50);
    expect(normalizeExtensionSettings({ dotGap: "42" }).dotGap).toBe(42);
    expect(normalizeExtensionSettings({ autoUpdateCheck: "true" }).autoUpdateCheck).toBe(true);
    expect(normalizeExtensionSettings({ autoUpdateCheck: "false" }).autoUpdateCheck).toBe(false);
    expect(normalizeExtensionSettings({ removeQwenAds: "true" }).removeQwenAds).toBe(true);
    expect(normalizeExtensionSettings({ hideDeepSeekNativeNav: "1" }).hideDeepSeekNativeNav).toBe(true);
    expect(normalizeExtensionSettings({ removeQwenAds: "false" }).removeQwenAds).toBe(false);
  });

  it("normalizes panel position from saved extension or legacy userscript storage", () => {
    expect(normalizeExtensionSettings({
      panelPosition: { right: 24.4, top: 188.6 }
    }).panelPosition).toEqual({ right: 24, top: 189 });
    expect(normalizeExtensionSettings({
      panelPosition: "{\"right\":32,\"top\":120}"
    }).panelPosition).toEqual({ right: 32, top: 120 });
    expect(normalizeExtensionSettings({
      panelPosition: { right: -20, top: 5000 }
    }).panelPosition).toEqual({ right: 0, top: 1200 });
    expect(normalizeExtensionSettings({
      panelPosition: "not-json"
    }).panelPosition).toBeNull();
  });

  it("declares legacy localStorage keys for settings migration", () => {
    expect(LEGACY_SETTING_MIGRATIONS).toEqual([
      ["ai-nodes-visible-limit", "visibleLimit"],
      ["ai-nodes-reading-line", "readingLineOffset"],
      ["ai-nodes-dot-gap", "dotGap"],
      ["ai-nodes-auto-update-check", "autoUpdateCheck"],
      ["ai-nodes-remove-qwen-ads", "removeQwenAds"],
      ["ai-nodes-hide-deepseek-native-nav", "hideDeepSeekNativeNav"],
      ["AI-Chat-Helper-pos", "panelPosition"]
    ]);
  });
});
