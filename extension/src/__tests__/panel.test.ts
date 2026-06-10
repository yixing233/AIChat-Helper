import { describe, expect, it } from "vitest";
import { createPanel, setPanelStatus, setPanelVersionUpdateBadge } from "../ui/panel/panel";

describe("createPanel", () => {
  it("creates a userscript-style rail shell with popover cards for a platform", () => {
    const panel = createPanel({
      platformName: "ChatGPT",
      platformIconUrl: "https://chatgpt.com/favicon.ico",
      extensionVersion: "3.0.0"
    });

    expect(panel.id).toBe("ai-chat-helper-panel");
    expect(panel.classList.contains("ai-chat-helper-nav-wrapper")).toBe(true);
    expect(panel.textContent).not.toContain("当前 AI 平台");
    expect(panel.querySelector("[data-ai-chat-helper-orbital]")).toBeTruthy();
    expect(panel.querySelector(".ai-chat-helper-orbital__track")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-nodes]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-trigger]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-settings-trigger]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-version]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-version-badge]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-settings-popover]")).toBeFalsy();
    expect(panel.querySelector(".ai-chat-helper-panel__platform-card")).toBeFalsy();
    expect(panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-update-check]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-popover]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-results-popover]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-confirm]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-prev]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-next]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-search-status]")).toBeFalsy();
    expect(panel.querySelector(".ai-chat-helper-nav-wrapper__grip")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-orbital]")?.getAttribute("data-ai-chat-helper-drag-handle")).toBe("");
    expect(panel.querySelector("[data-ai-chat-helper-visible-limit]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-reading-line]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-dot-gap]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-limit]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-export]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-github]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-remove-qwen-ads]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-hide-deepseek-native-nav]")).toBeFalsy();
  });

  it("renders the Qwen ad removal toggle only for Qwen", () => {
    const panel = createPanel({ platformId: "qwen", platformName: "Tongyi Qianwen", removeQwenAds: true });
    const toggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-remove-qwen-ads]");

    expect(toggle).toBeFalsy();
  });

  it("renders the DeepSeek native navigation toggle only for DeepSeek", () => {
    const panel = createPanel({ platformId: "deepseek", platformName: "DeepSeek", hideDeepSeekNativeNav: true });
    const toggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");

    expect(toggle).toBeFalsy();
  });

  it("keeps page rail actions focused on navigation", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true, batchLimit: 35 });
    const refreshButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--refresh");
    const exportButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--export");
    const batchButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--batch");
    const githubButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--github");

    expect(refreshButton).toBeTruthy();
    expect(refreshButton?.getAttribute("aria-label")).toBe("重新获取节点");
    expect(refreshButton?.getAttribute("title")).toBe("重新获取节点");
    expect(refreshButton?.querySelector("svg")).toBeTruthy();
    expect(exportButton).toBeFalsy();
    expect(batchButton).toBeFalsy();
    expect(githubButton).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-github]")).toBeFalsy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeFalsy();
    expect(panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit]")).toBeFalsy();
  });

  it("applies saved panel position when provided", () => {
    const panel = createPanel({
      platformName: "ChatGPT",
      panelPosition: { right: 28, top: 144 }
    });

    expect(panel.style.right).toBe("28px");
    expect(panel.style.top).toBe("144px");
  });

  it("does not render the old inline panel status area", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true });
    const status = panel.querySelector("[data-ai-chat-helper-status]");

    expect(status).toBeFalsy();
    expect(panel.querySelector(".ai-chat-helper-panel__status")).toBeFalsy();

    setPanelStatus(panel, "Exporting recent conversations...");

    expect(panel.querySelector("[data-ai-chat-helper-status]")).toBeFalsy();
    expect(panel.textContent).not.toContain("Exporting recent conversations...");
  });

  it("ignores version badge updates after update controls move to the popup menu", () => {
    const panel = createPanel({ platformName: "ChatGPT", extensionVersion: "3.0.0" });

    setPanelVersionUpdateBadge(panel, "3.1.0");
    setPanelVersionUpdateBadge(panel, "");

    expect(panel.querySelector("[data-ai-chat-helper-version-badge]")).toBeFalsy();
  });
});
