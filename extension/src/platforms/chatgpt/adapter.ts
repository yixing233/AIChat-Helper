import type { BatchListOptions, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractChatGPTSnapshotFromConversation } from "./mapping";

export const chatgptAdapter: PlatformAdapter = {
  id: "chatgpt",
  name: "ChatGPT",
  matches(url) {
    return (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com")) && /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[data-message-author-role]", "[data-message-id]", "article"], "chatgpt");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/backend-api\/conversation(?:\/[^/?#]+)?/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured ChatGPT conversation response is available");
    }
    return extractChatGPTSnapshotFromConversation(JSON.parse(event.responseText));
  },
  async fetchConversationList(options) {
    return fetchChatGPTConversationList(options);
  },
  async fetchConversationDetail(id) {
    const response = await fetch(`/backend-api/conversation/${encodeURIComponent(id)}`, {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`ChatGPT conversation detail request failed (${response.status})`);
    }
    return extractChatGPTSnapshotFromConversation(await response.json());
  }
};

async function fetchChatGPTConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const offset = Math.max(0, Number(options.cursor || 0) || 0);
  const response = await fetch(`/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`ChatGPT conversation list request failed (${response.status})`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item: any, index: number) => ({
    platformId: "chatgpt",
    conversationId: String(item.id || item.conversation_id || `chatgpt-${offset + index + 1}`),
    title: String(item.title || "Untitled conversation"),
    updatedAt: normalizeChatGPTTimestamp(item.update_time ?? item.updated_at ?? item.create_time ?? item.created_at),
    messageCount: item.mapping && typeof item.mapping === "object" ? Object.keys(item.mapping).length : undefined
  }));
}

function normalizeChatGPTTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  const text = String(value || "").trim();
  return text || undefined;
}
