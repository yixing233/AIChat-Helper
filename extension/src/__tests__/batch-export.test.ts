import { describe, expect, it, vi } from "vitest";
import { collectBatchSnapshots } from "../content/batch-export";
import type { ConversationSnapshot, ConversationSummary } from "../shared/types";

const summaries: ConversationSummary[] = [
  { platformId: "chatgpt", conversationId: "conv-1", title: "First" },
  { platformId: "chatgpt", conversationId: "conv-2", title: "Second" },
  { platformId: "chatgpt", conversationId: "conv-3", title: "Third" }
];

function snapshot(id: string): ConversationSnapshot {
  return {
    platformId: "chatgpt",
    conversationId: id,
    title: id,
    messages: [
      { id: `${id}-user`, role: "user", text: "Question" },
      { id: `${id}-assistant`, role: "assistant", text: "Answer" },
      { id: `${id}-tool`, role: "tool", text: "Tool result" }
    ],
    attachments: []
  };
}

describe("collectBatchSnapshots", () => {
  it("continues collecting snapshots after individual conversation failures", async () => {
    const onProgress = vi.fn();
    const onFailure = vi.fn();
    const fetchDetail = vi.fn(async (id: string) => {
      if (id === "conv-2") throw new Error("detail unavailable");
      return snapshot(id);
    });

    const result = await collectBatchSnapshots(summaries, fetchDetail, { onProgress, onFailure });

    expect(result.snapshots.map((item) => item.conversationId)).toEqual(["conv-1", "conv-3"]);
    expect(result.failures).toEqual([
      {
        summary: summaries[1],
        error: new Error("detail unavailable")
      }
    ]);
    expect(fetchDetail).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(summaries[1], 1, 3);
    expect(onFailure).toHaveBeenCalledWith(summaries[1], expect.any(Error));
  });

  it("reports all failures when no conversations can be collected", async () => {
    const result = await collectBatchSnapshots(
      summaries.slice(0, 2),
      async () => {
        throw new Error("network failed");
      }
    );

    expect(result.snapshots).toEqual([]);
    expect(result.failures).toHaveLength(2);
  });

  it("filters collected snapshots with per-conversation selected message indices", async () => {
    const result = await collectBatchSnapshots(
      [
        { summary: summaries[0], selectedMessageIndices: [1] },
        { summary: summaries[1], selectedMessageIndices: [] },
        { summary: summaries[2], selectedMessageIndices: undefined }
      ],
      async (id) => snapshot(id)
    );

    expect(result.snapshots[0].messages.map((message) => message.id)).toEqual(["conv-1-assistant"]);
    expect(result.snapshots[1].messages).toEqual([]);
    expect(result.snapshots[2].messages.map((message) => message.id)).toEqual([
      "conv-3-user",
      "conv-3-assistant",
      "conv-3-tool"
    ]);
    expect(result.snapshots[0].messageCount).toBe(1);
    expect(result.snapshots[1].messageCount).toBe(0);
    expect(result.snapshots[2].messageCount).toBe(3);
  });

  it("applies DeepSeek textWithoutThought choices after collecting batch detail snapshots", async () => {
    const deepseekSummary: ConversationSummary = {
      platformId: "deepseek",
      conversationId: "deepseek-1",
      title: "DeepSeek conversation"
    };
    const result = await collectBatchSnapshots(
      [
        {
          summary: deepseekSummary,
          selectedMessageIndices: [1],
          textWithoutThoughtMessageIds: ["answer-1"]
        }
      ],
      async (): Promise<ConversationSnapshot> => ({
        platformId: "deepseek",
        conversationId: "deepseek-1",
        title: "DeepSeek conversation",
        attachments: [],
        messages: [
          { id: "user-1", role: "user", text: "Question" },
          {
            id: "answer-1",
            role: "assistant",
            text: "思考过程\n\n最终回答",
            hasThought: true,
            textWithoutThought: "最终回答",
            fragmentType: "RESPONSE"
          }
        ]
      })
    );

    expect(result.snapshots[0].messages).toHaveLength(1);
    expect(result.snapshots[0].messages[0]).toMatchObject({
      id: "answer-1",
      text: "最终回答"
    });
  });

  it("preserves list summary metadata and uses exported message count on collected detail snapshots", async () => {
    const summary = {
      platformId: "qwen",
      conversationId: "session-1",
      title: "真实千问会话标题",
      createdAt: "2026-06-07T01:30:00Z",
      createdAtText: "2026/6/7 09:30:00",
      updatedAt: "2026-06-08T03:00:00Z",
      updatedAtText: "2026/6/8 11:00:00",
      messageCount: 12
    } as ConversationSummary & { updatedAtText: string };

    const result = await collectBatchSnapshots([summary], async (): Promise<ConversationSnapshot> => ({
      platformId: "qwen",
      conversationId: "session-1",
      title: "Tongyi Qianwen Conversation",
      messages: [{ id: "msg-1", role: "user", text: "Question" }],
      attachments: []
    }));

    expect(result.snapshots[0]).toMatchObject({
      platformId: "qwen",
      conversationId: "session-1",
      title: "真实千问会话标题",
      createdAt: "2026-06-07T01:30:00Z",
      createdAtText: "2026/6/7 09:30:00",
      updatedAt: "2026-06-08T03:00:00Z",
      updatedAtText: "2026/6/8 11:00:00",
      messageCount: 1
    });
  });
});
