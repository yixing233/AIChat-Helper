import { describe, expect, it } from "vitest";
import { isContentCommandRequest, isImmediateBackupProgressMessage, isInjectedMessage } from "../messaging/bridge";

describe("isInjectedMessage", () => {
  it("accepts injected messages from the page bridge", () => {
    expect(
      isInjectedMessage({
        source: "ai-chat-helper:injected",
        type: "injected-ready",
        payload: { href: "https://chatgpt.com/" }
      })
    ).toBe(true);
  });

  it("rejects unrelated messages", () => {
    expect(isInjectedMessage({ source: "other", type: "injected-ready" })).toBe(false);
  });
});

describe("content command messages", () => {
  it("accepts immediate backup commands for current and all conversations", () => {
    expect(isContentCommandRequest({
      type: "ai-chat-helper:content-command",
      command: "backup-current-now"
    })).toBe(true);
    expect(isContentCommandRequest({
      type: "ai-chat-helper:content-command",
      command: "backup-platform-now"
    })).toBe(true);
  });

  it("accepts immediate backup progress messages", () => {
    expect(isImmediateBackupProgressMessage({
      type: "ai-chat-helper:backup-progress",
      payload: {
        status: "running",
        platformName: "ChatGPT",
        current: 2,
        total: 5,
        created: 1,
        unchanged: 1,
        failed: 0,
        title: "Conversation"
      }
    })).toBe(true);
  });
});
