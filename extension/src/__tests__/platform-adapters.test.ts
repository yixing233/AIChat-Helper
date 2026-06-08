import { describe, expect, it } from "vitest";
import { getPlatformAdapter, platformAdapters } from "../platforms";

describe("platform adapter registry", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000", "claude"],
    ["https://www.qianwen.com/chat/abcdefghi", "qwen"],
    ["https://www.doubao.com/chat/abc", "doubao"],
    ["https://chat.deepseek.com/chat/123e4567-e89b-12d3-a456-426614174000", "deepseek"]
  ])("returns adapter for %s", (url, expected) => {
    expect(getPlatformAdapter(new URL(url))?.id).toBe(expected);
  });

  it("registers all first-version platforms", () => {
    expect(platformAdapters.map((adapter) => adapter.id).sort()).toEqual([
      "chatgpt",
      "claude",
      "deepseek",
      "doubao",
      "qwen"
    ]);
  });
});
