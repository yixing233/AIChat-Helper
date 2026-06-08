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
    messages: [],
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
});
