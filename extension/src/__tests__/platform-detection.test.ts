import { describe, expect, it } from "vitest";
import { detectPlatform } from "../shared/platform-detection";

describe("detectPlatform", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000", "claude"],
    ["https://www.qianwen.com/chat/abcdefghi", "qwen"],
    ["https://www.doubao.com/chat/123", "doubao"],
    ["https://chat.deepseek.com/a/chat/s/123e4567-e89b-12d3-a456-426614174000", "deepseek"]
  ])("detects %s as %s", (url, expected) => {
    expect(detectPlatform(new URL(url))?.id).toBe(expected);
  });

  it("returns null for unsupported pages", () => {
    expect(detectPlatform(new URL("https://example.com/"))).toBeNull();
  });
});
