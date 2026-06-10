import type { BatchConversationSelection, ConversationSnapshot, ConversationSummary } from "../shared/types";

type BatchSnapshotInput = ConversationSummary | BatchConversationSelection;

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

type BatchSnapshotFetcher = (conversationId: string, summary: ConversationSummary) => Promise<ConversationSnapshot>;

export async function collectBatchSnapshots(
  summaries: BatchSnapshotInput[],
  fetchDetail: BatchSnapshotFetcher,
  options: BatchSnapshotOptions = {}
): Promise<BatchSnapshotResult> {
  const snapshots: ConversationSnapshot[] = [];
  const failures: BatchSnapshotFailure[] = [];

  for (const [index, input] of summaries.entries()) {
    const { summary, selectedMessageIndices, textWithoutThoughtMessageIds } = normalizeBatchSnapshotInput(input);
    options.onProgress?.(summary, index, summaries.length);
    try {
      const detailSnapshot = await fetchDetail(summary.conversationId, summary);
      const strippedSnapshot = applyTextWithoutThoughtSelection(detailSnapshot, textWithoutThoughtMessageIds);
      const selectedSnapshot = applyMessageSelection(strippedSnapshot, selectedMessageIndices);
      snapshots.push(applySummaryMetadata(selectedSnapshot, summary));
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      failures.push({ summary, error: normalizedError });
      options.onFailure?.(summary, normalizedError);
    }
  }

  return { snapshots, failures };
}

function applySummaryMetadata(snapshot: ConversationSnapshot, summary: ConversationSummary): ConversationSnapshot {
  return {
    ...snapshot,
    platformId: summary.platformId || snapshot.platformId,
    conversationId: summary.conversationId || snapshot.conversationId,
    title: summary.title || snapshot.title,
    updatedAt: summary.updatedAt || snapshot.updatedAt,
    updatedAtText: summary.updatedAtText || snapshot.updatedAtText,
    createdAt: summary.createdAt || snapshot.createdAt,
    createdAtText: summary.createdAtText || snapshot.createdAtText,
    messageCount: snapshot.messages.length
  };
}

function normalizeBatchSnapshotInput(input: BatchSnapshotInput): BatchConversationSelection {
  if ("summary" in input) return input;
  return { summary: input };
}

function applyMessageSelection(
  snapshot: ConversationSnapshot,
  selectedMessageIndices: number[] | undefined
): ConversationSnapshot {
  if (!Array.isArray(selectedMessageIndices)) return snapshot;

  const indices = normalizeMessageSelectionIndices(selectedMessageIndices, snapshot.messages.length);
  return {
    ...snapshot,
    messages: indices
      .map((index) => snapshot.messages[index])
      .filter((message): message is ConversationSnapshot["messages"][number] => Boolean(message))
  };
}

function applyTextWithoutThoughtSelection(
  snapshot: ConversationSnapshot,
  textWithoutThoughtMessageIds: string[] | undefined
): ConversationSnapshot {
  if (!Array.isArray(textWithoutThoughtMessageIds) || !textWithoutThoughtMessageIds.length) return snapshot;

  const strippedMessageIds = new Set(textWithoutThoughtMessageIds.map((id) => String(id || "").trim()).filter(Boolean));
  if (!strippedMessageIds.size) return snapshot;

  return {
    ...snapshot,
    messages: snapshot.messages.map((message) => {
      if (!strippedMessageIds.has(message.id) || !hasTextWithoutThought(message)) return message;
      return {
        ...message,
        text: String(message.textWithoutThought || "").trim()
      };
    })
  };
}

function hasTextWithoutThought(message: ConversationSnapshot["messages"][number]): boolean {
  return Boolean(message.hasThought && String(message.textWithoutThought || "").trim());
}

function normalizeMessageSelectionIndices(indices: number[], totalCount: number): number[] {
  return Array.from(new Set(indices))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < totalCount)
    .sort((a, b) => a - b);
}
