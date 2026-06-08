import { describe, expect, it } from "vitest";
import { claudeAdapter } from "../platforms/claude/adapter";
import { extractClaudeSnapshotFromConversation } from "../platforms/claude/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const claudePayload = {
  uuid: "claude-conv-1",
  name: "Claude Conversation",
  chat_messages: [
    {
      uuid: "msg-1",
      sender: "human",
      created_at: "2026-06-08T01:00:00Z",
      content: [{ type: "text", text: "Hello Claude" }],
      files: [{ file_name: "brief.pdf", file_type: "application/pdf" }]
    },
    {
      uuid: "msg-2",
      sender: "assistant",
      created_at: "2026-06-08T01:00:03Z",
      content: [{ type: "text", text: "Hello human" }]
    }
  ]
};

describe("Claude API hydration", () => {
  it("extracts normalized messages and attachments from chat_messages", () => {
    const snapshot = extractClaudeSnapshotFromConversation(claudePayload);

    expect(snapshot).toMatchObject({
      platformId: "claude",
      conversationId: "claude-conv-1",
      title: "Claude Conversation"
    });
    expect(snapshot.messages).toEqual([
      {
        id: "msg-1",
        role: "user",
        text: "Hello Claude\n\n[Attachment 1: brief.pdf]",
        createdAt: "2026-06-08T01:00:00Z"
      },
      {
        id: "msg-2",
        role: "assistant",
        text: "Hello human",
        createdAt: "2026-06-08T01:00:03Z"
      }
    ]);
  });

  it("hydrates from captured Claude conversation events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://claude.ai/api/organizations/org/chat_conversations/claude-conv-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(claudePayload),
      createdAt: 1
    }];

    await expect(claudeAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "claude-conv-1",
      messages: [
        { role: "user", text: "Hello Claude\n\n[Attachment 1: brief.pdf]" },
        { role: "assistant", text: "Hello human" }
      ]
    });
  });
});
