import type { ConversationSnapshot, ConversationSummary } from "../shared/types";

export interface BatchSnapshotFailure {
  summary: ConversationSummary;
  error: Error;
}

export interface BatchSnapshotResult {
  snapshots: ConversationSnapshot[];
  failures: BatchSnapshotFailure[];
}

export interface BatchSnapshotOptions {
  onProgress?: (summary: ConversationSummary, index: number, total: number) => void;
  onFailure?: (summary: ConversationSummary, error: Error) => void;
}

export async function collectBatchSnapshots(
  summaries: ConversationSummary[],
  fetchDetail: (conversationId: string) => Promise<ConversationSnapshot>,
  options: BatchSnapshotOptions = {}
): Promise<BatchSnapshotResult> {
  const snapshots: ConversationSnapshot[] = [];
  const failures: BatchSnapshotFailure[] = [];

  for (const [index, summary] of summaries.entries()) {
    options.onProgress?.(summary, index, summaries.length);
    try {
      snapshots.push(await fetchDetail(summary.conversationId));
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      failures.push({ summary, error: normalizedError });
      options.onFailure?.(summary, normalizedError);
    }
  }

  return { snapshots, failures };
}
