import type { BatchListOptions, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractDeepSeekSnapshotFromHistory } from "./mapping";

export const deepseekAdapter: PlatformAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  matches(url) {
    return url.hostname === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "deepseek");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/v0\/chat\/history_messages/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured DeepSeek history response is available");
    }
    return extractDeepSeekSnapshotFromHistory(JSON.parse(event.responseText));
  },
  async fetchConversationList(options) {
    return fetchDeepSeekConversationList(options);
  },
  async fetchConversationDetail(id) {
    const response = await fetch(`/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`, {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`DeepSeek history request failed (${response.status})`);
    }
    return extractDeepSeekSnapshotFromHistory(await response.json());
  }
};

async function fetchDeepSeekConversationList(_options: BatchListOptions): Promise<ConversationSummary[]> {
  const response = await fetch("/api/v0/chat_session/fetch_page?lte_cursor.pinned=false", {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`DeepSeek conversation list request failed (${response.status})`);
  }

  const payload = await response.json();
  const items = pickDeepSeekConversationArray(payload);
  return items.map((item: any, index: number) => ({
    platformId: "deepseek",
    conversationId: String(findDeepSeekValue(item, ["id", "chat_session_id", "chatSessionId", "session_id", "sessionId", "uuid"]) || `deepseek-${index + 1}`),
    title: String(findDeepSeekValue(item, ["title", "name", "session_title", "sessionTitle", "topic", "summary"]) || "DeepSeek Conversation"),
    updatedAt: normalizeDeepSeekTimestamp(findDeepSeekValue(item, ["updated_at", "updatedAt", "update_time", "updateTime", "last_message_at"])),
    messageCount: normalizeDeepSeekCount(findDeepSeekValue(item, ["message_count", "messageCount", "messages_count", "chat_messages_count"]))
  }));
}

function pickDeepSeekConversationArray(payload: any): any[] {
  const candidates = [
    payload?.data?.biz_data?.chat_sessions,
    payload?.data?.biz_data?.session_list,
    payload?.data?.biz_data?.sessions,
    payload?.data?.chat_sessions,
    payload?.data?.list,
    payload?.data?.sessions,
    payload?.chat_sessions,
    payload?.sessions,
    payload?.list
  ];
  return candidates.find((item) => Array.isArray(item)) || [];
}

function findDeepSeekValue(item: any, keys: string[]): unknown {
  for (const key of keys) {
    if (item?.[key] != null && item[key] !== "") return item[key];
  }
  return undefined;
}

function normalizeDeepSeekTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  const text = String(value || "").trim();
  return text || undefined;
}

function normalizeDeepSeekCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}
