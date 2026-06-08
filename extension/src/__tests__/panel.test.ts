import { describe, expect, it } from "vitest";
import { createPanel, setPanelStatus } from "../ui/panel/panel";

describe("createPanel", () => {
  it("creates one root panel element for a platform", () => {
    const panel = createPanel({ platformName: "ChatGPT" });

    expect(panel.id).toBe("ai-chat-helper-panel");
    expect(panel.textContent).toContain("ChatGPT");
    expect(panel.querySelector("[data-ai-chat-helper-nodes]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-export]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-batch-export]")).toBeFalsy();
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
