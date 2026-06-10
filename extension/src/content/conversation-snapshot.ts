import type { CapturedNetworkEvent, ConversationMessage, ConversationSnapshot, ExportAttachment, PlatformAdapter } from "../shared/types";

export async function createConversationSnapshot(
  adapter: PlatformAdapter,
  capturedEvents: CapturedNetworkEvent[],
  root: ParentNode
): Promise<ConversationSnapshot> {
  let detailError: unknown;

  if (adapter.fetchConversationDetail) {
    try {
      return normalizeConversationSnapshot(await adapter.fetchConversationDetail(adapter.getConversationId(), undefined, capturedEvents));
    } catch (error) {
      detailError = error;
    }
  }

  if (adapter.hydrateFromCapturedApi) {
    try {
      return normalizeConversationSnapshot(await adapter.hydrateFromCapturedApi(capturedEvents));
    } catch (_) {
      // Captured API data is best-effort; current export should prefer actively fetched detail.
    }
  }

  if (detailError) {
    throw detailError;
  }

  const nodes = adapter.scanDomNodes(root);
  return normalizeConversationSnapshot({
    platformId: adapter.id,
    conversationId: adapter.getConversationId(),
    title: document.title || `${adapter.name} Conversation`,
    attachments: [],
    messages: nodes.map((node) => ({
      id: node.id,
      role: node.role || "assistant",
      text: node.text || node.title
    }))
  });
}

function normalizeConversationSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  const messages: ConversationMessage[] = [];
  let changed = false;

  snapshot.messages.forEach((message) => {
    const last = messages[messages.length - 1];
    if (!shouldMergeExportMessage(snapshot, last, message)) {
      messages.push(changed ? { ...message } : message);
      return;
    }

    if (!changed) {
      for (let index = 0; index < messages.length; index += 1) {
        messages[index] = { ...messages[index] };
      }
      changed = true;
    }

    const target = messages[messages.length - 1];
    target.text = [target.text, message.text].filter((part) => part != null && part !== "").join("\n\n");
    if (message.attachments?.length) {
      target.attachments = mergeExportAttachments(target.attachments || [], message.attachments);
    }
  });

  return changed ? { ...snapshot, messages } : snapshot;
}

function shouldMergeExportMessage(
  snapshot: ConversationSnapshot,
  previous: ConversationMessage | undefined,
  next: ConversationMessage
): previous is ConversationMessage {
  if (!previous) return false;
  if (previous.role !== next.role) return false;
  if (String(previous.sourceMessageId || "") !== String(next.sourceMessageId || "")) return false;
  if (Boolean(previous.isArtifact) !== Boolean(next.isArtifact)) return false;

  if (snapshot.platformId === "deepseek") {
    return Boolean(previous.isThought) === Boolean(next.isThought)
      && Boolean(previous.isSearch) === Boolean(next.isSearch)
      && String(previous.fragmentType || "") === String(next.fragmentType || "");
  }

  return true;
}

function mergeExportAttachments(previous: ExportAttachment[], next: ExportAttachment[]): ExportAttachment[] {
  const seen = new Set<string>();
  return [...previous, ...next].filter((attachment) => {
    const key = [attachment.id, attachment.url, attachment.fileName].filter(Boolean).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
