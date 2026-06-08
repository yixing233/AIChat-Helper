import type { BatchListOptions, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractQwenSnapshotFromMessageList } from "./mapping";

export const qwenAdapter: PlatformAdapter = {
  id: "qwen",
  name: "Tongyi Qianwen",
  matches(url) {
    return url.hostname === "www.qianwen.com" && /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "qwen");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/v1\/session\/msg\/list/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Qwen message list response is available");
    }
    return extractQwenSnapshotFromMessageList(JSON.parse(event.responseText));
  },
  async fetchConversationList(options) {
    return fetchQwenConversationList(options);
  },
  async fetchConversationDetail(id) {
    const url = new URL(QWEN_MSG_LIST_URL);
    url.searchParams.set("session_id", id);
    const response = await fetch(url.toString(), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Qwen message list request failed (${response.status})`);
    }
    return extractQwenSnapshotFromMessageList(await response.json());
  }
};

const QWEN_PAGE_LIST_URL = "https://chat2-api.qianwen.com/api/v2/session/page/list?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai";
const QWEN_MSG_LIST_URL = "https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai";

async function fetchQwenConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 50));
  const response = await fetch(QWEN_PAGE_LIST_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-platform": "pc_tongyi"
    },
    body: JSON.stringify({
      limit,
      next_token: options.cursor || "",
      sort_field: "modifiedTime",
      need_filter_tag: true
    })
  });
  if (!response.ok) {
    throw new Error(`Qwen conversation list request failed (${response.status})`);
  }

  const payload = await response.json();
  const items = pickQwenConversationArray(payload);
  return items.map((item: any, index: number) => ({
    platformId: "qwen",
    conversationId: String(findQwenValue(item, ["session_id", "sessionId", "id", "uuid", "conversation_id", "conversationId"]) || `qwen-${index + 1}`),
    title: String(findQwenValue(item, ["title", "name", "session_name", "session_title", "topic", "summary", "display_title"]) || "Tongyi Qianwen Conversation"),
    updatedAt: normalizeQwenTimestamp(findQwenValue(item, ["modifiedTime", "modified_time", "updated_at", "update_time", "gmt_modified"])),
    messageCount: normalizeQwenCount(findQwenValue(item, ["message_count", "msg_count", "badge_count", "messageCount"]))
  }));
}

function pickQwenConversationArray(payload: any): any[] {
  const candidates = [
    payload?.data?.list,
    payload?.data?.session_list,
    payload?.data?.sessions,
    payload?.data?.page_list,
    payload?.list,
    payload?.sessions
  ];
  return candidates.find((item) => Array.isArray(item)) || [];
}

function findQwenValue(item: any, keys: string[]): unknown {
  for (const key of keys) {
    if (item?.[key] != null && item[key] !== "") return item[key];
  }
  return undefined;
}

function normalizeQwenTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  const text = String(value || "").trim();
  return text || undefined;
}

function normalizeQwenCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}
