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
    expect(panel.textContent).toContain("ChatGPT");
    expect(panel.querySelector("[data-ai-chat-helper-orbital]")).toBeTruthy();
    expect(panel.querySelector(".ai-chat-helper-orbital__track")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-nodes]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-trigger]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-search-trigger]")?.classList.contains("ai-chat-helper-round-button")).toBe(true);
    expect(panel.querySelector("[data-ai-chat-helper-settings-trigger]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-settings-trigger]")?.classList.contains("ai-chat-helper-round-button")).toBe(true);
    const versionButton = panel.querySelector("[data-ai-chat-helper-version]");
    expect(versionButton).toBeTruthy();
    expect(versionButton?.textContent).toContain("v3.0.0");
    expect(versionButton?.getAttribute("aria-label")).toBe("Extension version 3.0.0");
    expect(panel.querySelector("[data-ai-chat-helper-version] svg")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-version-badge]")).toBeTruthy();
    const settingsPopover = panel.querySelector("[data-ai-chat-helper-settings-popover]");
    expect(settingsPopover).toBeTruthy();
    expect(settingsPopover?.classList.contains("ai-chat-helper-popover")).toBe(true);
    expect(settingsPopover?.getAttribute("aria-hidden")).toBe("true");
    expect(settingsPopover?.querySelector(".ai-chat-helper-panel__platform-card")?.textContent).toContain("当前 AI 平台:");
    expect(settingsPopover?.querySelector(".ai-chat-helper-panel__platform-icon")?.getAttribute("src")).toBe("https://chatgpt.com/favicon.ico");
    expect(settingsPopover?.querySelector(".ai-chat-helper-panel__platform-icon")?.getAttribute("alt")).toBe("ChatGPT");
    const autoUpdateToggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-auto-update-check]");
    expect(autoUpdateToggle).toBeTruthy();
    expect(autoUpdateToggle?.checked).toBe(true);
    expect(autoUpdateToggle?.closest(".ai-chat-helper-panel__switch")).toBeTruthy();
    expect(autoUpdateToggle?.parentElement?.querySelector(".ai-chat-helper-panel__switch-slider")).toBeTruthy();
    const searchPopover = panel.querySelector("[data-ai-chat-helper-search-popover]");
    expect(searchPopover).toBeTruthy();
    expect(searchPopover?.classList.contains("ai-chat-helper-popover")).toBe(true);
    expect(searchPopover?.getAttribute("aria-hidden")).toBe("true");
    expect(searchPopover?.querySelector("[data-ai-chat-helper-search]")).toBeTruthy();
    expect(searchPopover?.querySelector("[data-ai-chat-helper-search-confirm]")).toBeTruthy();
    expect(searchPopover?.querySelector("[data-ai-chat-helper-search-prev]")).toBeFalsy();
    expect(searchPopover?.querySelector("[data-ai-chat-helper-search-next]")).toBeFalsy();
    const searchResultsPopover = panel.querySelector("[data-ai-chat-helper-search-results-popover]");
    expect(searchResultsPopover).toBeTruthy();
    expect(searchResultsPopover?.getAttribute("aria-hidden")).toBe("true");
    expect(searchResultsPopover?.querySelector("[data-ai-chat-helper-search-prev]")).toBeTruthy();
    expect(searchResultsPopover?.querySelector("[data-ai-chat-helper-search-next]")).toBeTruthy();
    expect(searchResultsPopover?.querySelector("[data-ai-chat-helper-search-status]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-drag-handle]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-visible-limit]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-reading-line]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-dot-gap]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-limit]")).toBeFalsy();
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
    expect(toggle?.closest(".ai-chat-helper-panel__switch")).toBeTruthy();
    expect(toggle?.parentElement?.querySelector(".ai-chat-helper-panel__switch-slider")).toBeTruthy();
  });

  it("renders the DeepSeek native navigation toggle only for DeepSeek", () => {
    const panel = createPanel({ platformId: "deepseek", platformName: "DeepSeek", hideDeepSeekNativeNav: true });
    const toggle = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-hide-deepseek-native-nav]");

    expect(toggle).toBeTruthy();
    expect(toggle?.checked).toBe(true);
    expect(toggle?.closest(".ai-chat-helper-panel__switch")).toBeTruthy();
    expect(toggle?.parentElement?.querySelector(".ai-chat-helper-panel__switch-slider")).toBeTruthy();
  });

  it("renders batch export action when supported", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true, batchLimit: 35 });
    const refreshButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--refresh");
    const exportButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--export");
    const batchButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--batch");
    const githubButton = panel.querySelector<HTMLButtonElement>(".ai-chat-helper-panel__action--github");

    expect(refreshButton).toBeTruthy();
    expect(refreshButton?.getAttribute("aria-label")).toBe("重新获取节点");
    expect(refreshButton?.getAttribute("title")).toBe("重新获取节点");
    expect(refreshButton?.querySelector("svg")).toBeTruthy();
    expect(exportButton).toBeTruthy();
    expect(exportButton?.getAttribute("aria-label")).toBe("导出对话记录");
    expect(exportButton?.getAttribute("title")).toBe("导出对话记录");
    expect(exportButton?.querySelector("svg")).toBeTruthy();
    expect(batchButton).toBeTruthy();
    expect(batchButton?.getAttribute("aria-label")).toBe("批量导出对话");
    expect(batchButton?.getAttribute("title")).toBe("批量导出对话");
    expect(batchButton?.querySelector("svg")).toBeTruthy();
    expect(githubButton).toBeTruthy();
    expect(githubButton?.getAttribute("aria-label")).toBe("GitHub 项目");
    expect(githubButton?.getAttribute("title")).toBe("GitHub 项目");
    expect(githubButton?.querySelector("svg")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-github]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeTruthy();
    expect(panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit]")?.value).toBe("35");
  });

  it("applies saved panel position when provided", () => {
    const panel = createPanel({
      platformName: "ChatGPT",
      panelPosition: { right: 28, top: 144 }
    });

    expect(panel.style.right).toBe("28px");
    expect(panel.style.top).toBe("144px");
  });

  it("renders and updates export status", () => {
    const panel = createPanel({ platformName: "ChatGPT", canBatchExport: true });
    const status = panel.querySelector("[data-ai-chat-helper-status]");

    expect(status).toBeTruthy();

    setPanelStatus(panel, "Exporting recent conversations...");

    expect(status?.textContent).toBe("Exporting recent conversations...");
  });

  it("toggles the userscript-style version update badge", () => {
    const panel = createPanel({ platformName: "ChatGPT", extensionVersion: "3.0.0" });
    const versionButton = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version]");
    const badge = panel.querySelector<HTMLElement>("[data-ai-chat-helper-version-badge]");

    setPanelVersionUpdateBadge(panel, "3.1.0");

    expect(badge?.style.opacity).toBe("1");
    expect(badge?.style.transform).toBe("scale(1)");
    expect(versionButton?.title).toBe("New version v3.1.0 available. Click to update.");

    setPanelVersionUpdateBadge(panel, "");

    expect(badge?.style.opacity).toBe("0");
    expect(badge?.style.transform).toBe("scale(.7)");
    expect(versionButton?.title).toBe("Current version v3.0.0. Click to check updates.");
  });
});
