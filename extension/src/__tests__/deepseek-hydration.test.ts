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
        pinned: true,
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
          thinking_enabled: true,
          search_enabled: true,
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

  it("resolves current session ids only from DeepSeek UUID routes and query parameters", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";

    expect(deepseekAdapter.getConversationId(new URL(`https://chat.deepseek.com/a/chat/s/${id}`))).toBe(id);
    expect(deepseekAdapter.getConversationId(new URL(`https://chat.deepseek.com/chat/${id}`))).toBe(id);
    expect(deepseekAdapter.getConversationId(new URL(`https://chat.deepseek.com/a/chat/s?chat_session_id=${id}`))).toBe(id);
    expect(deepseekAdapter.getConversationId(new URL(`https://chat.deepseek.com/a/chat/s#${id}`))).toBe(id);
    expect(deepseekAdapter.getConversationId(new URL("https://chat.deepseek.com/a/chat/s"))).toBe("current");
  });

  it("extracts request, thinking, response, and citation text", () => {
    const snapshot = extractDeepSeekSnapshotFromHistory(deepSeekPayload);

    expect(snapshot).toMatchObject({
      platformId: "deepseek",
      conversationId: "session-1",
      title: "DeepSeek Conversation",
      metadata: {
        deepseek: {
          sessionId: "session-1",
          title: "DeepSeek Conversation",
          pinned: true,
          createdAt: new Date("2026-06-08T02:00:00Z").toLocaleString(),
          updatedAt: new Date("2026-06-08T02:00:05Z").toLocaleString(),
          thinkingEnabled: true,
          searchEnabled: true
        }
      }
    });
    expect(snapshot.messages).toEqual([
      {
        id: "deepseek-export-m1",
        sourceMessageId: "m1",
        role: "user",
        text: "Question",
        status: "",
        fragmentType: "REQUEST",
        isThought: false,
        isSearch: false,
        hasThought: false,
        textWithoutThought: "Question"
      },
      {
        id: "deepseek-export-m2-think",
        sourceMessageId: "m2",
        role: "assistant",
        text: "Thinking",
        fullText: "Thinking",
        status: "",
        isThought: true,
        fragmentType: "THINK",
        isSearch: false,
        hasThought: true,
        textWithoutThought: ""
      },
      {
        id: "deepseek-export-m2-response",
        sourceMessageId: "m2",
        role: "assistant",
        text: "Answer [参考#1]\n\n【引用来源】\n[参考#1] Source\n链接: https://example.com",
        fullText: "Answer [参考#1]\n\n【引用来源】\n[参考#1] Source\n链接: https://example.com",
        status: "",
        fragmentType: "RESPONSE",
        isThought: false,
        isSearch: false,
        hasThought: true,
        textWithoutThought: "Answer [参考#1]\n\n【引用来源】\n[参考#1] Source\n链接: https://example.com"
      }
    ]);
  });

  it("formats numeric DeepSeek session timestamps for export metadata", () => {
    const insertedAtSeconds = 1717821600;
    const updatedAtMillis = 1717821605000;

    const snapshot = extractDeepSeekSnapshotFromHistory({
      data: {
        biz_data: {
          chat_session: {
            id: "session-time",
            title: "DeepSeek Timestamp Conversation",
            inserted_at: insertedAtSeconds,
            updated_at: updatedAtMillis
          },
          chat_messages: []
        }
      }
    });

    expect(snapshot.createdAt).toBe(String(insertedAtSeconds));
    expect(snapshot.updatedAt).toBe(String(updatedAtMillis));
    expect(snapshot.metadata?.deepseek?.createdAt).toBe(new Date(insertedAtSeconds * 1000).toLocaleString());
    expect(snapshot.metadata?.deepseek?.updatedAt).toBe(new Date(updatedAtMillis).toLocaleString());
  });

  it("falls back to readable text from unknown DeepSeek fragments", () => {
    const snapshot = extractDeepSeekSnapshotFromHistory({
      data: {
        biz_data: {
          chat_session: {
            id: "session-fallback",
            title: "DeepSeek Fallback Conversation"
          },
          chat_messages: [
            {
              message_id: "m-fallback",
              role: "ASSISTANT",
              fragments: [
                {
                  id: "x",
                  type: "ANSWER_CARD",
                  answer: "Fallback answer",
                  metadata: { display_text: "Visible detail" }
                }
              ]
            }
          ]
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "deepseek-export-m-fallback-response",
        sourceMessageId: "m-fallback",
        role: "assistant",
        text: "Fallback answer\n\nVisible detail",
        fullText: "Fallback answer\n\nVisible detail",
        status: "",
        fragmentType: "MESSAGE",
        isThought: false,
        isSearch: false,
        hasThought: false,
        textWithoutThought: "Fallback answer\n\nVisible detail"
      }
    ]);
  });

  it("falls back to nested readable text when DeepSeek messages have no fragments", () => {
    const snapshot = extractDeepSeekSnapshotFromHistory({
      data: {
        biz_data: {
          chat_session: {
            id: "session-nested",
            title: "DeepSeek Nested Conversation"
          },
          chat_messages: [
            {
              message_id: "m-nested",
              role: "ASSISTANT",
              payload: {
                answer: "Nested answer",
                metadata: {
                  display_text: "Visible detail"
                }
              }
            }
          ]
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "deepseek-export-m-nested-response",
        sourceMessageId: "m-nested",
        role: "assistant",
        text: "Nested answer\n\nVisible detail",
        fullText: "Nested answer\n\nVisible detail",
        status: "",
        fragmentType: "RESPONSE",
        isThought: false,
        isSearch: false,
        hasThought: false,
        textWithoutThought: "Nested answer\n\nVisible detail"
      }
    ]);
  });

  it("orders REQUEST fragments inside DeepSeek assistant messages after assistant output like the userscript", () => {
    const snapshot = extractDeepSeekSnapshotFromHistory({
      data: {
        biz_data: {
          chat_session: {
            id: "session-assistant-request",
            title: "DeepSeek Assistant Request Conversation"
          },
          chat_messages: [
            {
              message_id: "m-mixed",
              role: "ASSISTANT",
              fragments: [
                { id: "q", type: "REQUEST", content: "Echoed prompt" },
                { id: "a", type: "RESPONSE", content: "Final answer" },
                { id: "t", type: "THINK", content: "Thinking first" }
              ]
            }
          ]
        }
      }
    });

    expect(snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      fragmentType: message.fragmentType
    }))).toEqual([
      {
        id: "deepseek-export-m-mixed-think",
        role: "assistant",
        text: "Thinking first",
        fragmentType: "THINK"
      },
      {
        id: "deepseek-export-m-mixed-response",
        role: "assistant",
        text: "Final answer",
        fragmentType: "RESPONSE"
      },
      {
        id: "deepseek-export-m-mixed",
        role: "user",
        text: "Echoed prompt",
        fragmentType: "REQUEST"
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
        updatedAtText: new Date("2026-06-08T02:00:05Z").toLocaleString(),
        createdAt: undefined,
        createdAtText: undefined,
        pinned: false,
        messageCount: 3
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/v0/chat_session/fetch_page?lte_cursor.pinned=false", {
      credentials: "include"
    });
  });

  it("skips DeepSeek recent conversation entries without ids like the userscript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          biz_data: {
            chat_sessions: [
              {
                title: "Missing id should be skipped",
                updated_at: "2026-06-08T02:00:06Z",
                message_count: 99
              },
              {
                id: "session-valid",
                title: "Valid DeepSeek Conversation",
                updated_at: "2026-06-08T02:00:05Z",
                message_count: 3
              }
            ]
          }
        }
      })
    } as Response);

    await expect(deepseekAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([{
      platformId: "deepseek",
      conversationId: "session-valid",
      title: "Valid DeepSeek Conversation",
      updatedAt: "2026-06-08T02:00:05Z",
      updatedAtText: new Date("2026-06-08T02:00:05Z").toLocaleString(),
      createdAt: undefined,
      createdAtText: undefined,
      pinned: false,
      messageCount: 3
    }]);
  });

  it("fetches multiple DeepSeek conversation list pages using lte cursor parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              next_cursor: { updated_at: "cursor-1", pinned: false },
              chat_sessions: [
                {
                  id: "session-1",
                  title: "DeepSeek Conversation 1",
                  updated_at: "2026-06-08T02:00:05Z"
                }
              ]
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [
                {
                  id: "session-2",
                  title: "DeepSeek Conversation 2",
                  updated_at: "2026-06-08T02:00:06Z"
                }
              ]
            }
          }
        })
      } as Response);

    const summaries = await deepseekAdapter.fetchConversationList?.({ limit: 2 });

    expect(summaries?.map((item) => item.conversationId)).toEqual(["session-2", "session-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=cursor-1");
  });

  it("extracts userscript-style DeepSeek batch metadata and sorts recent conversations by update time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          biz_data: {
            chat_sessions: [
              {
                id: "session-old",
                title: "Older DeepSeek Conversation",
                modified_time: "2026-06-08T02:00:00Z",
                created_time: "2026-06-07T02:00:00Z",
                msg_count: 2,
                pinned: false
              },
              {
                id: "session-new",
                title: "Newer DeepSeek Conversation",
                gmt_modified: "2026-06-08T03:00:00Z",
                gmt_create: "2026-06-07T03:00:00Z",
                badge_count: 5,
                pinned: true
              }
            ]
          }
        }
      })
    } as Response);

    await expect(deepseekAdapter.fetchConversationList?.({ limit: 10 })).resolves.toEqual([
      {
        platformId: "deepseek",
        conversationId: "session-new",
        title: "Newer DeepSeek Conversation",
        updatedAt: "2026-06-08T03:00:00Z",
        updatedAtText: new Date("2026-06-08T03:00:00Z").toLocaleString(),
        createdAt: "2026-06-07T03:00:00Z",
        createdAtText: new Date("2026-06-07T03:00:00Z").toLocaleString(),
        pinned: true,
        messageCount: 5
      },
      {
        platformId: "deepseek",
        conversationId: "session-old",
        title: "Older DeepSeek Conversation",
        updatedAt: "2026-06-08T02:00:00Z",
        updatedAtText: new Date("2026-06-08T02:00:00Z").toLocaleString(),
        createdAt: "2026-06-07T02:00:00Z",
        createdAtText: new Date("2026-06-07T02:00:00Z").toLocaleString(),
        pinned: false,
        messageCount: 2
      }
    ]);
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

  it("reuses captured DeepSeek request headers for batch list and detail requests", async () => {
    const capturedEvents = [
      {
        id: "fetch-captured-list",
        kind: "fetch",
        url: "https://chat.deepseek.com/api/v0/chat_session/fetch_page?lte_cursor.pinned=false",
        method: "GET",
        status: 200,
        requestHeaders: {
          authorization: "Bearer deepseek-token",
          "x-client-locale": "zh-CN",
          cookie: "blocked",
          referer: "https://chat.deepseek.com/"
        },
        responseText: "{}",
        createdAt: 1
      },
      {
        id: "fetch-captured-history",
        kind: "fetch",
        url: "https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=session-1",
        method: "GET",
        status: 200,
        requestHeaders: {
          authorization: "Bearer deepseek-history-token",
          "x-app-version": "2026.6"
        },
        responseText: "{}",
        createdAt: 2
      }
    ] as any;
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_sessions: [{
                id: "session-1",
                title: "DeepSeek Conversation",
                updated_at: "2026-06-08T02:00:05Z"
              }]
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => deepSeekPayload
      } as Response);

    await deepseekAdapter.fetchConversationList?.({ limit: 1, capturedEvents } as any);
    await deepseekAdapter.fetchConversationDetail?.("session-1", undefined, capturedEvents);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v0/chat_session/fetch_page?lte_cursor.pinned=false", {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: "Bearer deepseek-token",
        "x-app-version": "2026.6",
        "x-client-locale": "zh-CN"
      }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v0/chat/history_messages?chat_session_id=session-1", {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: "Bearer deepseek-history-token",
        "x-client-locale": "zh-CN",
        "x-app-version": "2026.6"
      }
    });
  });

  it("merges DeepSeek page-list template headers into history detail requests like the userscript", async () => {
    const capturedEvents = [
      {
        id: "fetch-page-template",
        kind: "fetch",
        url: "https://chat.deepseek.com/api/v0/chat_session/fetch_page?lte_cursor.pinned=false",
        method: "GET",
        status: 200,
        requestHeaders: {
          authorization: "Bearer page-list-token",
          "x-client-locale": "zh-CN",
          cookie: "blocked"
        },
        responseText: "{}",
        createdAt: 1
      },
      {
        id: "fetch-history-template",
        kind: "fetch",
        url: "https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=session-1",
        method: "GET",
        status: 200,
        requestHeaders: {
          "x-app-version": "2026.6"
        },
        responseText: "{}",
        createdAt: 2
      }
    ] as any;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => deepSeekPayload
    } as Response);

    await deepseekAdapter.fetchConversationDetail?.("session-1", undefined, capturedEvents);

    expect(fetchMock).toHaveBeenCalledWith("/api/v0/chat/history_messages?chat_session_id=session-1", {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: "Bearer page-list-token",
        "x-client-locale": "zh-CN",
        "x-app-version": "2026.6"
      }
    });
  });
});
