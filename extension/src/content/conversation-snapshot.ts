import type { CapturedNetworkEvent, ConversationSnapshot, PlatformAdapter } from "../shared/types";

export async function createConversationSnapshot(
  adapter: PlatformAdapter,
  capturedEvents: CapturedNetworkEvent[],
  root: ParentNode
): Promise<ConversationSnapshot> {
  if (adapter.hydrateFromCapturedApi && capturedEvents.length >= 0) {
    try {
      return await adapter.hydrateFromCapturedApi(capturedEvents);
    } catch (_) {
      // DOM fallback keeps export available when the platform API was not captured yet.
    }
  }

  const nodes = adapter.scanDomNodes(root);
  return {
    platformId: adapter.id,
    conversationId: adapter.getConversationId(),
    title: document.title || `${adapter.name} Conversation`,
    attachments: [],
    messages: nodes.map((node) => ({
      id: node.id,
      role: node.role || "assistant",
      text: node.title
    }))
  };
}
