import { describe, expect, it } from "vitest";
import { createConversationSnapshot } from "../content/conversation-snapshot";
import type { CapturedNetworkEvent, ConversationSnapshot, PlatformAdapter } from "../shared/types";

describe("createConversationSnapshot", () => {
  const hydratedSnapshot: ConversationSnapshot = {
    platformId: "chatgpt",
    conversationId: "api",
    title: "API Snapshot",
    attachments: [],
    messages: [{ id: "1", role: "user", text: "from api" }]
  };

  it("prefers adapter API hydration when available", async () => {
    const adapter: PlatformAdapter = {
      id: "chatgpt",
      name: "ChatGPT",
      matches: () => true,
      getConversationId: () => "dom",
      scanDomNodes: () => [{ id: "dom-1", title: "from dom", index: 0 }],
      hydrateFromCapturedApi: async () => hydratedSnapshot
    };

    await expect(createConversationSnapshot(adapter, [], document)).resolves.toBe(hydratedSnapshot);
  });

  it("falls back to DOM nodes when hydration is unavailable", async () => {
    const adapter: PlatformAdapter = {
      id: "chatgpt",
      name: "ChatGPT",
      matches: () => true,
      getConversationId: () => "dom",
      scanDomNodes: () => [{ id: "dom-1", title: "from dom", index: 0, role: "user" }]
    };
    document.title = "DOM Snapshot";

    await expect(createConversationSnapshot(adapter, [] satisfies CapturedNetworkEvent[], document)).resolves.toMatchObject({
      conversationId: "dom",
      title: "DOM Snapshot",
      messages: [{ id: "dom-1", role: "user", text: "from dom" }]
    });
  });
});
