import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "../platforms/chatgpt/adapter";
import { extractChatGPTSnapshotFromConversation } from "../platforms/chatgpt/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const conversationPayload = {
  id: "conv-1",
  title: "Mapped Conversation",
  current_node: "assistant-1",
  mapping: {
    root: { id: "root", parent: null, children: ["user-1"] },
    "user-1": {
      id: "user-1",
      parent: "root",
      children: ["assistant-1", "assistant-retry"],
      message: {
        id: "msg-user-1",
        author: { role: "user" },
        content: { parts: ["Hello"] },
        create_time: 1
      }
    },
    "assistant-1": {
      id: "assistant-1",
      parent: "user-1",
      children: [],
      message: {
        id: "msg-assistant-1",
        author: { role: "assistant" },
        content: { parts: ["Hi there"] },
        create_time: 2
      }
    },
    "assistant-retry": {
      id: "assistant-retry",
      parent: "user-1",
      children: [],
      message: {
        id: "msg-assistant-retry",
        author: { role: "assistant" },
        content: { parts: ["Retry branch"] },
        create_time: 3
      }
    }
  }
};

describe("ChatGPT mapping hydration", () => {
  it("extracts only the active current_node path", () => {
    const snapshot = extractChatGPTSnapshotFromConversation(conversationPayload);

    expect(snapshot).toMatchObject({
      platformId: "chatgpt",
      conversationId: "conv-1",
      title: "Mapped Conversation"
    });
    expect(snapshot.messages.map((message) => message.text)).toEqual(["Hello", "Hi there"]);
  });

  it("hydrates from captured backend-api conversation events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://chatgpt.com/backend-api/conversation/conv-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(conversationPayload),
      createdAt: 1
    }];

    await expect(chatgptAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "conv-1",
      title: "Mapped Conversation",
      messages: [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" }
      ]
    });
  });
});
