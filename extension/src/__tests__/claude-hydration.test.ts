import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "lastActiveOrg=; Max-Age=0";
  });

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

  it("fetches recent conversation summaries from the Claude list API", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            uuid: "claude-conv-1",
            name: "Claude Conversation",
            updated_at: "2026-06-08T01:00:03Z",
            chat_messages_count: 2
          }
        ]
      })
    } as Response);

    await expect(claudeAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([
      {
        platformId: "claude",
        conversationId: "claude-conv-1",
        title: "Claude Conversation",
        updatedAt: "2026-06-08T01:00:03Z",
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=20&starred=false&consistency=eventual",
      { credentials: "include" }
    );
  });

  it("fetches conversation detail from the Claude detail API", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => claudePayload
    } as Response);

    await expect(claudeAdapter.fetchConversationDetail?.("claude-conv-1")).resolves.toMatchObject({
      platformId: "claude",
      conversationId: "claude-conv-1",
      title: "Claude Conversation",
      messages: [
        { role: "user", text: "Hello Claude\n\n[Attachment 1: brief.pdf]" },
        { role: "assistant", text: "Hello human" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations/claude-conv-1?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong",
      { credentials: "include" }
    );
  });
});
