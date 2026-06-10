import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension manifest popup", () => {
  it("opens the settings popup from the browser action", () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "manifest.json"), "utf8"));

    expect(manifest.description).toBe("为 ChatGPT、通义千问、豆包、DeepSeek、Claude 提供节点导航、搜索、阅读辅助、对话导出、自动备份和含图片预览的备份库。");
    expect(manifest.action).toMatchObject({
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      },
      default_popup: "popup/popup.html",
      default_title: "AI Chat Helper 设置"
    });
    expect(manifest.icons).toMatchObject({
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    });
    for (const iconPath of Object.values<string>(manifest.icons)) {
      expect(existsSync(resolve(process.cwd(), "public", iconPath))).toBe(true);
    }
    expect(manifest.permissions).toContain("activeTab");
    expect(manifest.permissions).toContain("unlimitedStorage");
  });
});
