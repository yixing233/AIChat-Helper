import { describe, expect, it } from "vitest";
import { createPanel } from "../ui/panel/panel";

describe("createPanel", () => {
  it("creates one root panel element for a platform", () => {
    const panel = createPanel({ platformName: "ChatGPT" });

    expect(panel.id).toBe("ai-chat-helper-panel");
    expect(panel.textContent).toContain("ChatGPT");
    expect(panel.querySelector("[data-ai-chat-helper-nodes]")).toBeTruthy();
    expect(panel.querySelector("[data-ai-chat-helper-export]")).toBeTruthy();
  });
});
