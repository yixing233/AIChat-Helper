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
            resource_infos: [{ file_name: "note.txt" }]
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
        text: "[Attachment] note.txt\nWhat is this?"
      },
      {
        id: "req-1-a-1",
        role: "assistant",
        text: "This is Qwen."
      }
    ]);
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
        { role: "user", text: "[Attachment] note.txt\nWhat is this?" },
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
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat2-api.qianwen.com/api/v2/session/page/list?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-platform": "pc_tongyi"
        },
        body: JSON.stringify({
          limit: 20,
          next_token: "",
          sort_field: "modifiedTime",
          need_filter_tag: true
        })
      }
    );
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
        { role: "user", text: "[Attachment] note.txt\nWhat is this?" },
        { role: "assistant", text: "This is Qwen." }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai&session_id=session-1",
      {
        credentials: "include"
      }
    );
  });
});
