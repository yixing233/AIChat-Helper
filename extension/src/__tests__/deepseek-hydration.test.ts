import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("fetches recent conversation summaries from the session page API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          biz_data: {
            chat_sessions: [
              {
                id: "session-1",
                title: "DeepSeek Conversation",
                updated_at: "2026-06-08T02:00:05Z",
                message_count: 3
              }
            ]
          }
        }
      })
    } as Response);

    await expect(deepseekAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([
      {
        platformId: "deepseek",
        conversationId: "session-1",
        title: "DeepSeek Conversation",
        updatedAt: "2026-06-08T02:00:05Z",
        messageCount: 3
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/v0/chat_session/fetch_page?lte_cursor.pinned=false", {
      credentials: "include"
    });
  });

  it("fetches conversation detail from the history messages API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => deepSeekPayload
    } as Response);

    await expect(deepseekAdapter.fetchConversationDetail?.("session-1")).resolves.toMatchObject({
      platformId: "deepseek",
      conversationId: "session-1",
      title: "DeepSeek Conversation",
      messages: [
        { role: "user", text: "Question" },
        { role: "assistant", text: "Thinking" },
        { role: "assistant", text: expect.stringContaining("Answer [参考#1]") }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/v0/chat/history_messages?chat_session_id=session-1", {
      credentials: "include"
    });
  });
});
