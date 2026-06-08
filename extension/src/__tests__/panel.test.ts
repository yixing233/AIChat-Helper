import { describe, expect, it } from "vitest";
import { createPanel, setPanelStatus } from "../ui/panel/panel";

describe("createPanel", () => {
  it("creates one root panel element for a platform", () => {
    const panel = createPanel({ platformName: "ChatGPT" });

    expect(panel.id).toBe("ai-chat-helper-panel");
    expect(panel.textContent).toContain("ChatGPT");
    expect(panel.querySelector("[data-ai-chat-helper-search]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-prev]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-next]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-status]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-visible-limit]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-reading-line]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-dot-gap]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-nodes]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-export]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-remove-qwen-ads]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-hide-deepseek-native-nav]")).toBeFalsy();
  });

  it("renders the Qwen ad removal toggle only for Qwen", () => {
    const panel = createPanel({ platformId: "qwen", platformName: "Tongyi Qianwen", removeQwenAds: true });
    const toggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]");

    expect(toggle).toBeTruthy();
    expect(toggle?.checked).toBe(true);
  });

  it("renders the DeepSeek native navigation toggle only for DeepSeek", () => {
    const panel = createPanel({ platformId: "deepseek", platformName: "DeepSeek", hideDeepSeekNativeNav: true });
    const toggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");

    expect(toggle).toBeTruthy();
    expect(toggle?.checked).toBe(true);
  });

  it("renders batch export action when supported", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true });

    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeTruthy();
  });

  it("renders and updates export status", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true });
    const status = panel.querySelector("[data-ai-chat-helper-status]");

    expect(status).toBeTruthy();

    setPanelStatus(panel, "Exporting recent conversations...");

    expect(status?.textContent).toBe("Exporting recent conversations...");
  });
});
