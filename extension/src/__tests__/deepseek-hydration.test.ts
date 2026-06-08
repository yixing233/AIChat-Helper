import { describe, expect, it } from "vitest";
import { deepseekAdapter } from "../platforms/deepseek/adapter";
import { extractDeepSeekSnapshotFromHistory } from "../platforms/deepseek/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const deepSeekPayload = {
  data: {
    biz_data: {
      chat_session: {
        id: "session-1",
        title: "DeepSeek Conversation",
        inserted_at: "2026-06-08T02:00:00Z",
        updated_at: "2026-06-08T02:00:05Z"
      },
      chat_messages: [
        {
          message_id: "m1",
          fragments: [
            { id: "r", type: "REQUEST", content: "Question" }
          ]
        },
        {
          message_id: "m2",
          role: "ASSISTANT",
          fragments: [
            { id: "t", type: "THINK", content: "Thinking" },
            { id: "a", type: "RESPONSE", content: "Answer [citation:1]" },
            { id: "s", type: "SEARCH", results: [{ cite_index: 1, title: "Source", url: "https://example.com" }] }
          ]
        }
      ]
    }
  }
};

describe("DeepSeek API hydration", () => {
  it("extracts request, thinking, response, and citation text", () => {
    const snapshot = extractDeepSeekSnapshotFromHistory(deepSeekPayload);

    expect(snapshot).toMatchObject({
      platformId: "deepseek",
      conversationId: "session-1",
      title: "DeepSeek Conversation"
    });
    expect(snapshot.messages).toEqual([
      { id: "deepseek-export-m1", role: "user", text: "Question" },
      { id: "deepseek-export-m2-think", role: "assistant", text: "Thinking" },
      {
        id: "deepseek-export-m2-response",
        role: "assistant",
        text: "Answer [参考#1]\n\n【引用来源】\n[参考#1] Source\n链接: https://example.com"
      }
    ]);
  });

  it("hydrates from captured history_messages events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=session-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(deepSeekPayload),
      createdAt: 1
    }];

    await expect(deepseekAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "session-1",
      messages: [
        { role: "user", text: "Question" },
        { role: "assistant", text: "Thinking" },
        { role: "assistant", text: expect.stringContaining("Answer [参考#1]") }
      ]
    });
  });
});
