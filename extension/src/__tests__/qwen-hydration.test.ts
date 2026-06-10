import { afterEach, describe, expect, it, vi } from "vitest";
import { qwenAdapter } from "../platforms/qwen/adapter";
import { extractQwenSnapshotFromMessageList } from "../platforms/qwen/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const qwenPayload = {
  data: {
    list: [
      {
        req_id: "req-1",
        session_id: "session-1",
        request_messages: [
          {
            content: "[(think_1)] What is this?",
            resource_infos: [{
              file_name: "note.txt",
              mime_type: "text/plain",
              url: "https://example.com/note.txt"
            }]
          }
        ],
        response_messages: [
          { mime_type: "text/plain", content: "This is Qwen." },
          { mime_type: "bar/progress", content: "ignore me" }
        ]
      }
    ]
  }
};

describe("Qwen API hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("extracts request, attachments, and assistant responses", () => {
    const snapshot = extractQwenSnapshotFromMessageList(qwenPayload);

    expect(snapshot).toMatchObject({
      platformId: "qwen",
      conversationId: "session-1",
      title: "Tongyi Qianwen Conversation"
    });
    expect(snapshot.messages).toEqual([
      {
        id: "req-1",
        role: "user",
        text: "[附件] note.txt\nWhat is this?",
        attachments: [{
          id: "req-1-file-1",
          fileName: "note.txt",
          mimeType: "text/plain",
          url: "https://example.com/note.txt"
        }]
      },
      {
        id: "req-1-a-1",
        role: "assistant",
        text: "This is Qwen."
      }
    ]);
  });

  it("includes nested Qwen attachment names before the user prompt text", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-nested-file",
            session_id: "session-nested-file",
            request_messages: [
              {
                content: "Summarize this document",
                attachments: [{
                  file_name: "nested-brief.pdf",
                  mime_type: "application/pdf",
                  url: "https://example.com/nested-brief.pdf"
                }]
              }
            ],
            response_messages: [{ mime_type: "text/plain", content: "Summary ready." }]
          }
        ]
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "req-nested-file",
      role: "user",
      text: "[附件] nested-brief.pdf\nSummarize this document",
      attachments: [{
        id: "req-nested-file-file-1",
        fileName: "nested-brief.pdf",
        mimeType: "application/pdf",
        url: "https://example.com/nested-brief.pdf"
      }]
    });
  });

  it("hydrates from captured msg list events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=session-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(qwenPayload),
      createdAt: 1
    }];

    await expect(qwenAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "session-1",
      messages: [
        { role: "user", text: "[附件] note.txt\nWhat is this?" },
        { role: "assistant", text: "This is Qwen." }
      ]
    });
  });

  it("falls back to root and mixed user message fields", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-2",
            session_id: "session-2",
            user_message: "Root question",
            messages: [
              { role: "assistant", content: "Not a user prompt" },
              { sender_role: "human", content: "Mixed user question" }
            ],
            response_messages: [{ mime_type: "text/plain", content: "Answer" }]
          }
        ]
      }
    });

    expect(snapshot.messages).toEqual([
      { id: "req-2", role: "user", text: "Root question\nMixed user question" },
      { id: "req-2-a-1", role: "assistant", text: "Answer" }
    ]);
  });

  it("orders Qwen messages by item position fields instead of response array order", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-newer",
            session_id: "session-pos",
            pos: "200",
            user_message: "Newer question",
            response_messages: [{ mime_type: "text/plain", content: "Newer answer" }]
          },
          {
            req_id: "req-older",
            session_id: "session-pos",
            pos: "100",
            user_message: "Older question",
            response_messages: [{ mime_type: "text/plain", content: "Older answer" }]
          }
        ]
      }
    });

    expect(snapshot.messages.map((message) => message.text)).toEqual([
      "Older question",
      "Older answer",
      "Newer question",
      "Newer answer"
    ]);
  });

  it("ignores Qwen assistant image/url responses like the userscript parser", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-image",
            session_id: "session-image",
            user_message: "Draw a chart",
            response_messages: [
              { mime_type: "text/plain", content: "Here is the chart." },
              { mime_type: "image/url", content: "https://example.com/chart.png" }
            ]
          }
        ]
      }
    });

    expect(snapshot.messages).toEqual([
      { id: "req-image", role: "user", text: "Draw a chart" },
      { id: "req-image-a-1", role: "assistant", text: "Here is the chart." }
    ]);
  });

  it("skips Qwen request image urls when building the user prompt text", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-user-image-url",
            session_id: "session-user-image-url",
            request_messages: [
              { mime_type: "image/url", content: "https://example.com/uploaded.png" }
            ],
            user_message: "What is in this image?",
            response_messages: [
              { mime_type: "text/plain", content: "It is a diagram." }
            ]
          }
        ]
      }
    });

    expect(snapshot.messages).toEqual([
      { id: "req-user-image-url", role: "user", text: "What is in this image?" },
      { id: "req-user-image-url-a-1", role: "assistant", text: "It is a diagram." }
    ]);
  });

  it("does not export Qwen request image/url entries as attachments", () => {
    const snapshot = extractQwenSnapshotFromMessageList({
      data: {
        list: [
          {
            req_id: "req-user-image-attachment",
            session_id: "session-user-image-attachment",
            request_messages: [
              {
                mime_type: "image/url",
                file_name: "uploaded.png",
                url: "https://example.com/uploaded.png",
                content: "https://example.com/uploaded.png"
              }
            ],
            user_message: "What is in this image?",
            response_messages: [
              { mime_type: "text/plain", content: "It is a diagram." }
            ]
          }
        ]
      }
    });

    expect(snapshot.messages).toEqual([
      { id: "req-user-image-attachment", role: "user", text: "What is in this image?" },
      { id: "req-user-image-attachment-a-1", role: "assistant", text: "It is a diagram." }
    ]);
  });

  it("fetches recent conversation summaries from the Qwen page list API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          list: [
            {
              session_id: "session-1",
              title: "Qwen Conversation",
              modifiedTime: "2026-06-08T03:00:00Z",
              message_count: 2
            }
          ]
        }
      })
    } as Response);

    await expect(qwenAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([
      {
        platformId: "qwen",
        conversationId: "session-1",
        title: "Qwen Conversation",
        updatedAt: "2026-06-08T03:00:00Z",
        updatedAtText: new Date("2026-06-08T03:00:00Z").toLocaleString(),
        messageCount: 2
      }
    ]);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const calledOptions = fetchMock.mock.calls[0][1];
    const ut = calledUrl.searchParams.get("ut");

    expect(calledUrl.origin + calledUrl.pathname).toBe("https://chat2-api.qianwen.com/api/v2/session/page/list");
    expect(calledUrl.searchParams.get("biz_id")).toBe("ai_qwen");
    expect(calledUrl.searchParams.get("chat_client")).toBe("h5");
    expect(ut).toMatch(/^[0-9a-f-]{36}$|^[a-z0-9-]+$/i);
    expect(calledOptions).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "x-deviceid": ut,
        "x-platform": "pc_tongyi"
      },
      body: JSON.stringify({
        limit: 20,
        next_token: "",
        sort_field: "modifiedTime",
        need_filter_tag: true
      })
    });
  });

  it("skips Qwen recent conversation entries without ids like the userscript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          list: [
            {
              title: "Missing id should be skipped",
              modifiedTime: "2026-06-08T03:01:00Z",
              message_count: 99
            },
            {
              session_id: "session-valid",
              title: "Valid Qwen Conversation",
              modifiedTime: "2026-06-08T03:00:00Z",
              message_count: 2
            }
          ]
        }
      })
    } as Response);

    await expect(qwenAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([{
      platformId: "qwen",
      conversationId: "session-valid",
      title: "Valid Qwen Conversation",
      updatedAt: "2026-06-08T03:00:00Z",
      updatedAtText: new Date("2026-06-08T03:00:00Z").toLocaleString(),
      messageCount: 2
    }]);
  });

  it("uses userscript-style Qwen ut headers and request URL parameters for batch APIs", async () => {
    localStorage.setItem("ut", "qwen-ut-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/api/v2/session/page/list")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              list: [{
                session_id: "session-ut",
                title: "Qwen UT Conversation",
                modifiedTime: "2026-06-08T03:00:00Z"
              }]
            }
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            list: [{
              req_id: "req-ut",
              session_id: "session-ut",
              user_message: "Question with ut",
              response_messages: [{ mime_type: "text/plain", content: "Answer with ut" }]
            }]
          }
        })
      } as Response;
    });

    await qwenAdapter.fetchConversationList?.({ limit: 1 });
    await qwenAdapter.fetchConversationDetail?.("session-ut");

    const listUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const listOptions = fetchMock.mock.calls[0][1];
    const detailUrl = new URL(String(fetchMock.mock.calls[1][0]));
    const detailOptions = fetchMock.mock.calls[1][1];

    expect(listUrl.searchParams.get("ut")).toBe("qwen-ut-1");
    expect(listOptions?.headers).toMatchObject({
      "content-type": "application/json",
      "x-deviceid": "qwen-ut-1",
      "x-platform": "pc_tongyi"
    });
    expect(detailUrl.searchParams.get("session_id")).toBe("session-ut");
    expect(detailUrl.searchParams.get("ut")).toBe("qwen-ut-1");
    expect(detailUrl.searchParams.get("nonce")).toMatch(/^[a-z0-9]{11}$/);
    expect(Number(detailUrl.searchParams.get("timestamp"))).toBeGreaterThan(0);
    expect(detailOptions?.headers).toMatchObject({
      accept: "application/json, text/plain, */*",
      "x-deviceid": "qwen-ut-1"
    });
  });

  it("reuses captured Qwen authorization headers for the conversation list request", async () => {
    localStorage.setItem("ut", "qwen-list-ut");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          list: [{
            session_id: "session-list-captured",
            title: "Qwen Captured List",
            modifiedTime: "2026-06-08T03:00:00Z"
          }]
        }
      })
    } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-list-template",
      kind: "xhr",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=session-template&ut=qwen-list-ut",
      method: "GET",
      status: 200,
      requestHeaders: {
        "Clt-Acs-Sign": "list-sig",
        Cookie: "should-not-forward"
      },
      responseText: JSON.stringify({
        data: {
          list: [{
            req_id: "req-list-header",
            header: JSON.stringify({
              "eo-clt-actkn": "list-actkn",
              "x-deviceid": "list-device"
            })
          }]
        }
      }),
      createdAt: 1
    }];

    await qwenAdapter.fetchConversationList?.({ limit: 1, capturedEvents });

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      accept: "application/json, text/plain, */*",
      "clt-acs-sign": "list-sig",
      "eo-clt-actkn": "list-actkn",
      "x-deviceid": "list-device",
      "content-type": "application/json",
      "x-platform": "pc_tongyi"
    });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("cookie");
  });

  it("uses captured Qwen x-deviceid as the request URL ut when no captured URL ut exists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/api/v2/session/page/list")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              list: [{
                session_id: "session-header-ut",
                title: "Qwen Header UT",
                modifiedTime: "2026-06-08T03:00:00Z"
              }]
            }
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            list: [{
              req_id: "req-header-ut",
              session_id: "session-header-ut",
              user_message: "Question from captured header",
              response_messages: [{ mime_type: "text/plain", content: "Answer from captured header" }]
            }]
          }
        })
      } as Response;
    });
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-header-ut-template",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=old-session",
      method: "GET",
      status: 200,
      requestHeaders: {
        "X-DeviceId": "captured-device-ut"
      },
      responseText: JSON.stringify({
        data: {
          list: [{
            req_id: "req-header-ut-response",
            header: JSON.stringify({
              "x-deviceid": "captured-device-ut"
            })
          }]
        }
      }),
      createdAt: 1
    }];

    await qwenAdapter.fetchConversationList?.({ limit: 1, capturedEvents });
    await qwenAdapter.fetchConversationDetail?.("session-header-ut", undefined, capturedEvents);

    const listUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const detailUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(listUrl.searchParams.get("ut")).toBe("captured-device-ut");
    expect(detailUrl.searchParams.get("ut")).toBe("captured-device-ut");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "x-deviceid": "captured-device-ut"
    });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      "x-deviceid": "captured-device-ut"
    });
  });

  it("uses captured Qwen URL ut as x-deviceid when captured headers omit it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => qwenPayload
    } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-url-ut-template",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=old-session&ut=url-only-ut",
      method: "GET",
      status: 200,
      requestHeaders: {
        "Clt-Acs-Sign": "url-ut-sig"
      },
      responseText: JSON.stringify(qwenPayload),
      createdAt: 1
    }];

    await qwenAdapter.fetchConversationDetail?.("session-url-ut", undefined, capturedEvents);

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get("ut")).toBe("url-only-ut");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "clt-acs-sign": "url-ut-sig",
      "x-deviceid": "url-only-ut"
    });
  });

  it("fetches multiple Qwen conversation list pages until the requested limit is reached", async () => {
    const firstList = Array.from({ length: 50 }, (_, index) => ({
      session_id: `session-${index + 1}`,
      title: `Qwen Conversation ${index + 1}`,
      modifiedTime: `2026-06-08T03:${String(index).padStart(2, "0")}:00Z`,
      message_count: index + 1
    }));
    const secondList = Array.from({ length: 25 }, (_, index) => ({
      session_id: `session-${index + 51}`,
      title: `Qwen Conversation ${index + 51}`,
      modifiedTime: `2026-06-08T04:${String(index).padStart(2, "0")}:00Z`,
      message_count: index + 51
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            next_token: "next-page",
            list: firstList
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            list: secondList
          }
        })
      } as Response);

    const summaries = await qwenAdapter.fetchConversationList?.({ limit: 75 });

    expect(summaries).toHaveLength(75);
    expect(summaries?.[0].conversationId).toBe("session-75");
    expect(summaries?.[74].conversationId).toBe("session-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ limit: 50, next_token: "" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ limit: 25, next_token: "next-page" });
  });

  it("extracts userscript-style Qwen batch timestamps and sorts recent conversations by update time", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          list: [
            {
              session_id: "session-old",
              title: "Older Qwen Conversation",
              modified_time: "2026-06-08T02:00:00Z",
              created_time: "2026-06-07T02:00:00Z",
              badge_count: 2
            },
            {
              session_id: "session-new",
              title: "Newer Qwen Conversation",
              gmt_modified: "2026-06-08T03:00:00Z",
              gmt_create: "2026-06-07T03:00:00Z",
              msg_count: 5
            }
          ]
        }
      })
    } as Response);

    await expect(qwenAdapter.fetchConversationList?.({ limit: 10 })).resolves.toEqual([
      {
        platformId: "qwen",
        conversationId: "session-new",
        title: "Newer Qwen Conversation",
        updatedAt: "2026-06-08T03:00:00Z",
        updatedAtText: new Date("2026-06-08T03:00:00Z").toLocaleString(),
        createdAt: "2026-06-07T03:00:00Z",
        createdAtText: new Date("2026-06-07T03:00:00Z").toLocaleString(),
        messageCount: 5
      },
      {
        platformId: "qwen",
        conversationId: "session-old",
        title: "Older Qwen Conversation",
        updatedAt: "2026-06-08T02:00:00Z",
        updatedAtText: new Date("2026-06-08T02:00:00Z").toLocaleString(),
        createdAt: "2026-06-07T02:00:00Z",
        createdAtText: new Date("2026-06-07T02:00:00Z").toLocaleString(),
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches conversation detail from the Qwen message list API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => qwenPayload
    } as Response);

    await expect(qwenAdapter.fetchConversationDetail?.("session-1")).resolves.toMatchObject({
      platformId: "qwen",
      conversationId: "session-1",
      messages: [
        { role: "user", text: "[附件] note.txt\nWhat is this?" },
        { role: "assistant", text: "This is Qwen." }
      ]
    });
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const calledOptions = fetchMock.mock.calls[0][1];
    const ut = calledUrl.searchParams.get("ut");

    expect(calledUrl.origin + calledUrl.pathname).toBe("https://chat2-api.qianwen.com/api/v1/session/msg/list");
    expect(calledUrl.searchParams.get("return_response_messages")).toBe("true");
    expect(calledUrl.searchParams.get("page_size")).toBe("50");
    expect(calledUrl.searchParams.get("session_id")).toBe("session-1");
    expect(calledUrl.searchParams.get("nonce")).toMatch(/^[a-z0-9]{11}$/);
    expect(Number(calledUrl.searchParams.get("timestamp"))).toBeGreaterThan(0);
    expect(calledOptions).toMatchObject({
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "x-deviceid": ut
      }
    });
  });

  it("reuses captured Qwen message-list URL and sanitized headers for conversation detail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => qwenPayload
    } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-template-1",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=old-session&pos=old-pos&custom=1&ut=captured-ut&page_size=10",
      method: "GET",
      status: 200,
      requestHeaders: {
        "Clt-Acs-Sign": "sig-123",
        "Content-Type": "application/json",
        Cookie: "should-not-forward",
        Referer: "https://www.qianwen.com/chat/old-session"
      },
      responseText: JSON.stringify({
        data: {
          list: [{
            req_id: "req-header",
            session_id: "old-session",
            header: JSON.stringify({
              "eo-clt-actkn": "actkn-123",
              "x-deviceid": "device-from-response"
            })
          }]
        }
      }),
      createdAt: 1
    }];

    await qwenAdapter.fetchConversationDetail?.("session-captured", undefined, capturedEvents);

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const calledOptions = fetchMock.mock.calls[0][1];
    expect(calledUrl.origin + calledUrl.pathname).toBe("https://chat2-api.qianwen.com/api/v1/session/msg/list");
    expect(calledUrl.searchParams.get("custom")).toBe("1");
    expect(calledUrl.searchParams.get("session_id")).toBe("session-captured");
    expect(calledUrl.searchParams.get("pos")).toBeNull();
    expect(calledUrl.searchParams.get("page_size")).toBe("50");
    expect(calledUrl.searchParams.get("ut")).toBe("captured-ut");
    expect(calledUrl.searchParams.get("nonce")).toMatch(/^[a-z0-9]{11}$/);
    expect(Number(calledUrl.searchParams.get("timestamp"))).toBeGreaterThan(0);
    expect(calledOptions).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "clt-acs-sign": "sig-123",
        "eo-clt-actkn": "actkn-123",
        "x-deviceid": "device-from-response"
      }
    });
    expect(calledOptions?.headers).not.toHaveProperty("cookie");
    expect(calledOptions?.headers).not.toHaveProperty("referer");
    expect(calledOptions?.headers).not.toHaveProperty("content-type");
  });

  it("falls back to GET when a captured Qwen POST message-list request returns 405", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
        json: async () => ({})
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => qwenPayload
      } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "qwen-post-template",
      kind: "fetch",
      url: "https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=old-session&ut=post-ut",
      method: "POST",
      status: 200,
      requestHeaders: {
        "Content-Type": "application/json",
        "X-DeviceId": "post-device"
      },
      requestBody: JSON.stringify({ mode: "captured" }),
      responseText: JSON.stringify(qwenPayload),
      createdAt: 1
    }];

    await expect(qwenAdapter.fetchConversationDetail?.("session-post", undefined, capturedEvents)).resolves.toMatchObject({
      conversationId: "session-1",
      messages: [
        { role: "user", text: "[附件] note.txt\nWhat is this?" },
        { role: "assistant", text: "This is Qwen." }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-deviceid": "post-device"
      },
      body: JSON.stringify({ mode: "captured" })
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "x-deviceid": "post-device"
      }
    });
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty("content-type");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("session_id")).toBe("session-post");
  });

  it("fetches all Qwen message pages using the history pos cursor", async () => {
    const firstPage = {
      data: {
        have_next_page: true,
        list: [
          {
            req_id: "req-new",
            session_id: "session-1",
            pos: "200",
            user_message: "New question",
            response_messages: [{ mime_type: "text/plain", content: "New answer" }]
          },
          {
            req_id: "req-mid",
            session_id: "session-1",
            pos: "100",
            user_message: "Middle question",
            response_messages: [{ mime_type: "text/plain", content: "Middle answer" }]
          }
        ]
      }
    };
    const secondPage = {
      data: {
        have_next_page: false,
        list: [
          {
            req_id: "req-old",
            session_id: "session-1",
            pos: "50",
            user_message: "Old question",
            response_messages: [{ mime_type: "text/plain", content: "Old answer" }]
          }
        ]
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstPage
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage
      } as Response);

    await expect(qwenAdapter.fetchConversationDetail?.("session-1")).resolves.toMatchObject({
      platformId: "qwen",
      conversationId: "session-1",
      messages: [
        { role: "user", text: "Old question" },
        { role: "assistant", text: "Old answer" },
        { role: "user", text: "Middle question" },
        { role: "assistant", text: "Middle answer" },
        { role: "user", text: "New question" },
        { role: "assistant", text: "New answer" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pos=100");
  });
});
