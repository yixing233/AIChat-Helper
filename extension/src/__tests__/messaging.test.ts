import { describe, expect, it } from "vitest";
import { isInjectedMessage } from "../messaging/bridge";

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
