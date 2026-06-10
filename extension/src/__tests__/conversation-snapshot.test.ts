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

  it("prefers actively fetched conversation detail over captured API hydration for API-capable platforms", async () => {
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-msg-list",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list",
      method: "GET",
      status: 200,
      createdAt: 1
    }];
    const detailSnapshot: ConversationSnapshot = {
      platformId: "qwen",
      conversationId: "session-1",
      title: "Fetched Full Snapshot",
      attachments: [],
      messages: [{ id: "api-full", role: "assistant", text: "from full detail API" }]
    };
    let receivedEvents: CapturedNetworkEvent[] | undefined;
    const adapter: PlatformAdapter = {
      id: "qwen",
      name: "Tongyi Qianwen",
      matches: () => true,
      getConversationId: () => "session-1",
      scanDomNodes: () => [{ id: "dom-1", title: "from dom", index: 0 }],
      hydrateFromCapturedApi: async () => hydratedSnapshot,
      fetchConversationDetail: async (conversationId, summary, events) => {
        expect(conversationId).toBe("session-1");
        expect(summary).toBeUndefined();
        receivedEvents = events;
        return detailSnapshot;
      }
    };

    await expect(createConversationSnapshot(adapter, capturedEvents, document)).resolves.toBe(detailSnapshot);
    expect(receivedEvents).toBe(capturedEvents);
  });

  it("fetches the current conversation detail when captured hydration is unavailable", async () => {
    const detailSnapshot: ConversationSnapshot = {
      platformId: "qwen",
      conversationId: "session-1",
      title: "Fetched API Snapshot",
      attachments: [],
      messages: [{ id: "api-1", role: "assistant", text: "from detail API" }]
    };
    const adapter: PlatformAdapter = {
      id: "qwen",
      name: "Tongyi Qianwen",
      matches: () => true,
      getConversationId: () => "session-1",
      scanDomNodes: () => [{ id: "dom-1", title: "from dom", index: 0 }],
      hydrateFromCapturedApi: async () => {
        throw new Error("No captured Qwen message list response is available");
      },
      fetchConversationDetail: async (conversationId) => {
        expect(conversationId).toBe("session-1");
        return detailSnapshot;
      }
    };

    await expect(createConversationSnapshot(adapter, [], document)).resolves.toBe(detailSnapshot);
  });

  it("normalizes consecutive export fragments like the userscript current export path", async () => {
    const detailSnapshot: ConversationSnapshot = {
      platformId: "qwen",
      conversationId: "session-fragments",
      title: "Fragmented API Snapshot",
      attachments: [],
      messages: [
        { id: "assistant-1", sourceMessageId: "same-response", role: "assistant", text: "First paragraph" },
        { id: "assistant-2", sourceMessageId: "same-response", role: "assistant", text: "Second paragraph" },
        { id: "assistant-artifact", sourceMessageId: "same-response", role: "assistant", text: "Artifact body", isArtifact: true }
      ]
    };
    const adapter: PlatformAdapter = {
      id: "qwen",
      name: "Tongyi Qianwen",
      matches: () => true,
      getConversationId: () => "session-fragments",
      scanDomNodes: () => [],
      fetchConversationDetail: async () => detailSnapshot
    };

    await expect(createConversationSnapshot(adapter, [], document)).resolves.toMatchObject({
      messages: [
        {
          id: "assistant-1",
          sourceMessageId: "same-response",
          role: "assistant",
          text: "First paragraph\n\nSecond paragraph"
        },
        {
          id: "assistant-artifact",
          sourceMessageId: "same-response",
          role: "assistant",
          text: "Artifact body",
          isArtifact: true
        }
      ]
    });
  });

  it("does not fall back to DOM text when an API-capable platform detail request fails", async () => {
    const adapter: PlatformAdapter = {
      id: "doubao",
      name: "Doubao",
      matches: () => true,
      getConversationId: () => "conv-1",
      scanDomNodes: () => [{ id: "dom-1", title: "partial virtual dom", index: 0 }],
      hydrateFromCapturedApi: async () => {
        throw new Error("No captured Doubao single-chain response is available");
      },
      fetchConversationDetail: async () => {
        throw new Error("Doubao single-chain request failed (401)");
      }
    };

    await expect(createConversationSnapshot(adapter, [], document)).rejects.toThrow(
      "Doubao single-chain request failed (401)"
    );
  });

  it("falls back to DOM nodes with the full node text when hydration is unavailable", async () => {
    const fullText = `${"完整 DOM 消息内容 ".repeat(12)}结尾`;
    const adapter: PlatformAdapter = {
      id: "chatgpt",
      name: "ChatGPT",
      matches: () => true,
      getConversationId: () => "dom",
      scanDomNodes: () => [{ id: "dom-1", title: "完整 DOM 消息内容", text: fullText, index: 0, role: "user" }]
    };
    document.title = "DOM Snapshot";

    await expect(createConversationSnapshot(adapter, [] satisfies CapturedNetworkEvent[], document)).resolves.toMatchObject({
      conversationId: "dom",
      title: "DOM Snapshot",
      messages: [{ id: "dom-1", role: "user", text: fullText }]
    });
  });
});
