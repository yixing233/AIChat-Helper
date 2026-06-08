import type { BatchListOptions, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractClaudeSnapshotFromConversation } from "./mapping";

export const claudeAdapter: PlatformAdapter = {
  id: "claude",
  name: "Claude",
  matches(url) {
    return url.hostname === "claude.ai" && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[data-testid*='message']", "[data-message-id]", "article"], "claude");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?#]+/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Claude conversation response is available");
    }
    return extractClaudeSnapshotFromConversation(JSON.parse(event.responseText));
  },
  async fetchConversationList(options) {
    return fetchClaudeConversationList(options);
  },
  async fetchConversationDetail(id) {
    const orgId = getClaudeOrgId();
    const url = `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(id)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Claude conversation detail request failed (${response.status})`);
    }
    return extractClaudeSnapshotFromConversation(await response.json());
  }
};

async function fetchClaudeConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const orgId = getClaudeOrgId();
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/chat_conversations_v2?limit=${limit}&starred=false&consistency=eventual`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`Claude conversation list request failed (${response.status})`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items.map((item: any, index: number) => ({
    platformId: "claude",
    conversationId: String(item.uuid || item.id || `claude-${index + 1}`),
    title: String(item.name || item.title || "Claude Conversation"),
    updatedAt: String(item.updated_at || item.updatedAt || item.created_at || "").trim() || undefined,
    messageCount: Number.isFinite(Number(item.chat_messages_count ?? item.message_count))
      ? Number(item.chat_messages_count ?? item.message_count)
      : undefined
  }));
}

function getClaudeOrgId(): string {
  const match = String(document.cookie || "").match(/(?:^|;\s*)lastActiveOrg=([0-9a-f-]{36})(?:;|$)/i);
  const orgId = String(match?.[1] || "").trim();
  if (!orgId) {
    throw new Error("Claude lastActiveOrg cookie is not available");
  }
  return orgId;
}
