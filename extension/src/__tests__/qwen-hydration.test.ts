import { describe, expect, it } from "vitest";
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
});
