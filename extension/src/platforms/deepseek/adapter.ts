import type { BatchListOptions, CapturedNetworkEvent, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import {
  findNodeByIdText,
  getActiveScrollContainer,
  getViewportMetrics,
  isElementVisibleInMetrics,
  queryElements
} from "../shared/node-active";
import { jumpToVirtualizedNode } from "../shared/node-jump";
import { normalizeBatchTimestamp } from "../shared/timestamp";
import { extractDeepSeekSnapshotFromHistory } from "./mapping";

export const deepseekAdapter: PlatformAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  matches(url) {
    return url.hostname === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return getDeepSeekSessionIdFromUrl(url) || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, [
      "[data-message-author-role=\"user\"]",
      "[data-role=\"user\"]",
      "[class*=\"user\"]",
      "[class*=\"question\"]",
      "[class*=\"message\"]",
      "[data-testid*=\"message\"]",
      "article"
    ], "deepseek", { roles: ["user"] });
  },
  jumpToNode(node, context) {
    return jumpToVirtualizedNode(node, context, {
      rowSelectors: [
        "._81e7b5e",
        ".ds-message"
      ],
      scrollContainerSelectors: [
        ".ds-virtual-list",
        ".ds-virtual-list-visible-items"
      ],
      maxSearchAttempts: 80,
      waitAfterScrollMs: 90,
      alignRatio: 0.2,
      acceptRow: isDeepSeekUserRow,
      getCandidateElement: getDeepSeekMessageBubble,
      getCandidateId: getDeepSeekRowId,
      getCandidateText: (_row, element) => normalizeDeepSeekText(getElementText(element)),
      normalizeId: normalizeDeepSeekNodeId,
      normalizeText: normalizeDeepSeekText
    });
  },
  getActiveNode(context) {
    const rows = getDeepSeekConversationRows(context.root || document);
    if (!rows.length || !context.nodes.length) return null;

    const scrollContainer = getActiveScrollContainer(context, rows, [
      ".ds-virtual-list-scroll-view",
      ".ds-virtual-list",
      ".ds-virtual-list-visible-items"
    ]);
    const metrics = getViewportMetrics(context, scrollContainer);
    let hitNode: ReturnType<NonNullable<PlatformAdapter["getActiveNode"]>> = null;
    let bestTop = -Infinity;

    context.nodes.forEach((node) => {
      const range = getDeepSeekNodeGroupRange(node, rows, context.nodes);
      if (!range) return;
      if (range.bottom < metrics.viewportTop || range.top > metrics.viewportBottom) return;
      if (range.top <= metrics.readingAnchor && range.bottom >= metrics.readingAnchor && range.top > bestTop) {
        bestTop = range.top;
        hitNode = node;
      }
    });

    if (hitNode) return hitNode;

    let bestNode: ReturnType<NonNullable<PlatformAdapter["getActiveNode"]>> = null;
    let bestScore = -Infinity;
    rows.forEach((row) => {
      if (!isDeepSeekUserRow(row) || !isElementVisibleInMetrics(row, metrics)) return;
      const rect = row.getBoundingClientRect();
      const score = rect.top <= metrics.readingAnchor
        ? 2000 - Math.abs(metrics.readingAnchor - rect.top)
        : 1000 - Math.abs(rect.top - metrics.readingAnchor);
      const node = findNodeByIdText(context.nodes, getDeepSeekRowId(row), normalizeDeepSeekText(getElementText(getDeepSeekMessageBubble(row) || row)), {
        normalizeId: normalizeDeepSeekNodeId,
        normalizeText: normalizeDeepSeekText,
        minTextScore: 8
      });
      if (node && score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });

    return bestNode;
  },
  getScrollContainer(root = document) {
    const rows = getDeepSeekConversationRows(root);
    return getActiveScrollContainer({ nodes: [], readingLineOffset: 150, root }, rows, [
      ".ds-virtual-list-scroll-view",
      ".ds-virtual-list",
      ".ds-virtual-list-visible-items"
    ]);
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
  async fetchConversationDetail(id, _summary, capturedEvents) {
    const context = getDeepSeekCapturedRequestContext(capturedEvents, "history");
    const response = await fetch(`/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`, {
      credentials: "include",
      ...buildDeepSeekFetchInit(context.headers)
    });
    if (!response.ok) {
      throw new Error(`DeepSeek history request failed (${response.status})`);
    }
    return extractDeepSeekSnapshotFromHistory(await response.json());
  }
};

function getDeepSeekConversationRows(root: ParentNode): HTMLElement[] {
  const rows = queryElements(root, [
    "._81e7b5e",
    ".ds-message",
    "[data-virtual-list-item-key]"
  ].join(","));
  const seen = new Set<HTMLElement>();
  return rows.filter((row) => {
    if (seen.has(row)) return false;
    seen.add(row);
    return Boolean(normalizeDeepSeekText(getElementText(row)));
  });
}

function getDeepSeekNodeGroupRange(
  node: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0]["nodes"][number],
  rows: HTMLElement[],
  nodes: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0]["nodes"]
): { top: number; bottom: number } | null {
  const userIndex = rows.findIndex((row) => {
    if (!isDeepSeekUserRow(row)) return false;
    return findNodeByIdText(nodes, getDeepSeekRowId(row), normalizeDeepSeekText(getElementText(getDeepSeekMessageBubble(row) || row)), {
      normalizeId: normalizeDeepSeekNodeId,
      normalizeText: normalizeDeepSeekText,
      minTextScore: 8
    }) === node;
  });
  if (userIndex < 0) return null;

  let nextUserIndex = rows.length;
  for (let index = userIndex + 1; index < rows.length; index += 1) {
    if (isDeepSeekUserRow(rows[index])) {
      nextUserIndex = index;
      break;
    }
  }

  let top = Infinity;
  let bottom = -Infinity;
  rows.slice(userIndex, nextUserIndex).forEach((row) => {
    const rect = row.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  });

  return Number.isFinite(top) && Number.isFinite(bottom) ? { top, bottom } : null;
}

function isDeepSeekUserRow(row: HTMLElement): boolean {
  return Boolean(
    row.classList.contains("_19d617c")
      || (!row.querySelector(".ds-markdown") && !row.querySelector(".ds-think-content") && !row.querySelector(".ds-thought-content"))
  );
}

function getDeepSeekMessageBubble(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>("._72b6158")
    || row.querySelector<HTMLElement>(".ds-message-item--content")
    || row;
}

function getDeepSeekRowId(row: HTMLElement): string {
  return normalizeDeepSeekNodeId(
    row.closest<HTMLElement>("[data-virtual-list-item-key]")?.getAttribute("data-virtual-list-item-key")
      || row.getAttribute("data-virtual-list-item-key")
      || ""
  );
}

function normalizeDeepSeekNodeId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^deepseek-user-/i, "")
    .toLowerCase();
}

function normalizeDeepSeekText(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

function getDeepSeekSessionIdFromUrl(url: URL): string {
  const fromQuery = url.searchParams.get("chat_session_id") || url.searchParams.get("session_id") || url.searchParams.get("id");
  if (isDeepSeekUuid(fromQuery)) return String(fromQuery);

  const pathMatch = url.pathname.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i)
    || url.pathname.match(/\/chat\/([0-9a-f-]{36})/i)
    || url.pathname.match(/\/session\/([0-9a-f-]{36})/i);
  if (pathMatch && isDeepSeekUuid(pathMatch[1])) return pathMatch[1];

  const hashMatch = url.hash.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (hashMatch && isDeepSeekUuid(hashMatch[1])) return hashMatch[1];

  return "";
}

function isDeepSeekUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

async function fetchDeepSeekConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const items: any[] = [];
  const seen = new Set<string>();
  let cursor: Record<string, unknown> | null = null;
  let cursorKey = "";
  const context = getDeepSeekCapturedRequestContext(options.capturedEvents, "page-list");

  for (let page = 0; page < 8 && items.length < limit; page += 1) {
    const response = await fetch(buildDeepSeekPageListUrl(cursor, context.pageListUrl), {
      credentials: "include",
      ...buildDeepSeekFetchInit(context.headers)
    });
    if (!response.ok) {
      throw new Error(`DeepSeek conversation list request failed (${response.status})`);
    }

    const payload = await response.json();
    const pageItems = pickDeepSeekConversationArray(payload);
    pageItems.forEach((item: any) => {
      const id = String(findDeepSeekValue(item, ["id", "chat_session_id", "chatSessionId", "session_id", "sessionId", "uuid"]) || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push(item);
    });

    const next = getDeepSeekNextCursor(payload);
    if (!next.value || !pageItems.length || next.key === cursorKey) break;
    cursor = next.value;
    cursorKey = next.key;
  }

  return items
    .map<ConversationSummary | null>((item: any) => {
      const conversationId = String(findDeepSeekValue(item, ["id", "chat_session_id", "chatSessionId", "session_id", "sessionId", "uuid"]) || "").trim();
      if (!conversationId) return null;
      const updatedRaw = findDeepSeekValue(item, ["updated_at", "updatedAt", "update_time", "updateTime", "modified_at", "modified_time", "modifiedAt", "modifiedTime", "gmt_modified", "last_message_at"]);
      const createdRaw = findDeepSeekValue(item, ["inserted_at", "insertedAt", "created_at", "createdAt", "create_time", "createTime", "created_time", "createdTime", "gmt_create"]);
      const updated = normalizeBatchTimestamp(updatedRaw);
      const created = normalizeBatchTimestamp(createdRaw);
      return {
        platformId: "deepseek",
        conversationId,
        title: String(findDeepSeekValue(item, ["title", "name", "session_title", "sessionTitle", "topic", "summary"]) || "DeepSeek Conversation"),
        updatedAt: updated.value,
        updatedAtText: updated.text,
        createdAt: created.value,
        createdAtText: created.text,
        pinned: Boolean(findDeepSeekValue(item, ["pinned"])),
        messageCount: normalizeDeepSeekCount(findDeepSeekValue(item, ["message_count", "messageCount", "messages_count", "chat_messages_count", "msg_count", "badge_count"]))
      };
    })
    .filter((summary): summary is ConversationSummary => Boolean(summary))
    .sort((a, b) => getDeepSeekSummarySortValue(b.updatedAt) - getDeepSeekSummarySortValue(a.updatedAt))
    .slice(0, limit);
}

function buildDeepSeekPageListUrl(cursor: Record<string, unknown> | null, templateUrl = ""): string {
  const url = new URL(templateUrl || "/api/v0/chat_session/fetch_page?lte_cursor.pinned=false", "https://chat.deepseek.com");
  url.pathname = "/api/v0/chat_session/fetch_page";
  if (!url.searchParams.has("lte_cursor.pinned")) url.searchParams.set("lte_cursor.pinned", "false");
  if (cursor) {
    Object.entries(cursor).forEach(([key, value]) => {
      if (value == null || value === "") return;
      const queryKey = key.startsWith("lte_cursor.") ? key : `lte_cursor.${key}`;
      url.searchParams.set(queryKey, String(value));
    });
  }
  return `${url.pathname}${url.search}`;
}

interface DeepSeekCapturedRequestContext {
  headers: Record<string, string>;
  pageListUrl: string;
}

function getDeepSeekCapturedRequestContext(
  events: CapturedNetworkEvent[] | undefined,
  preferred: "history" | "page-list"
): DeepSeekCapturedRequestContext {
  const relevant = [...(events || [])]
    .reverse()
    .filter((event) => isDeepSeekHistoryEvent(event) || isDeepSeekPageListEvent(event));
  const preferredEvent = relevant.find((event) => preferred === "history" ? isDeepSeekHistoryEvent(event) : isDeepSeekPageListEvent(event));
  const pageListEvent = relevant.find(isDeepSeekPageListEvent);
  const historyEvent = relevant.find(isDeepSeekHistoryEvent);
  const latestHeaderEvent = relevant.find((event) => event.requestHeaders && Object.keys(event.requestHeaders).length);
  const pageListHeaders = sanitizeDeepSeekCapturedEventHeaders(pageListEvent);
  const historyHeaders = sanitizeDeepSeekCapturedEventHeaders(historyEvent);
  const latestHeaders = sanitizeDeepSeekCapturedEventHeaders(latestHeaderEvent);

  return {
    headers: mergeDeepSeekContextHeaders(
      preferred === "history"
        ? [latestHeaders, pageListHeaders, historyHeaders]
        : [latestHeaders, historyHeaders, pageListHeaders]
    ),
    pageListUrl: pageListEvent?.url || ""
  };
}

function mergeDeepSeekContextHeaders(sources: Record<string, string>[]): Record<string, string> {
  const merged = Object.assign({}, ...sources);
  return Object.keys(merged).length ? sanitizeDeepSeekHeaders(merged) : {};
}

function sanitizeDeepSeekCapturedEventHeaders(event: CapturedNetworkEvent | undefined): Record<string, string> {
  return event?.requestHeaders && Object.keys(event.requestHeaders).length
    ? sanitizeDeepSeekHeaders(event.requestHeaders)
    : {};
}

function buildDeepSeekFetchInit(headers: Record<string, string>): Pick<RequestInit, "headers"> {
  return Object.keys(headers).length ? { headers } : {};
}

function sanitizeDeepSeekHeaders(inputHeaders: Record<string, string>): Record<string, string> {
  const blocked = new Set([
    "cookie",
    "host",
    "origin",
    "referer",
    "content-length",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "accept-encoding",
    "connection",
    ":authority",
    ":method",
    ":path",
    ":scheme"
  ]);
  const out: Record<string, string> = {};

  Object.entries(inputHeaders || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (!normalizedKey || blocked.has(normalizedKey) || value == null || value === "") return;
    out[normalizedKey] = String(value);
  });

  if (!out.accept) out.accept = "application/json, text/plain, */*";
  return out;
}

function isDeepSeekHistoryEvent(event: CapturedNetworkEvent): boolean {
  return /\/api\/v0\/chat\/history_messages/i.test(event.url || "");
}

function isDeepSeekPageListEvent(event: CapturedNetworkEvent): boolean {
  return /\/api\/v0\/chat_session\/fetch_page/i.test(event.url || "");
}

function getDeepSeekNextCursor(payload: any): { value: Record<string, unknown> | null; key: string } {
  const candidates = [
    payload?.data?.biz_data?.next_cursor,
    payload?.data?.biz_data?.lte_cursor,
    payload?.data?.next_cursor,
    payload?.data?.cursor,
    payload?.next_cursor,
    payload?.cursor
  ];
  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const value = { value: item };
      return { value, key: JSON.stringify(value) };
    }
    if (typeof item === "object") {
      const value: Record<string, unknown> = {};
      Object.entries(item).forEach(([key, entryValue]) => {
        if (entryValue == null || entryValue === "") return;
        value[String(key)] = entryValue;
      });
      if (Object.keys(value).length) return { value, key: JSON.stringify(value) };
    }
  }
  return { value: null, key: "" };
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
    const value = readDeepSeekPath(item, key);
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function normalizeDeepSeekCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}

function readDeepSeekPath(item: any, key: string): unknown {
  if (!item || typeof item !== "object") return undefined;
  const parts = String(key).split(".");
  let cursor = item;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function getDeepSeekSummarySortValue(value: unknown): number {
  if (value == null || value === "") return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return 0;
    return raw.split(".")[0].length <= 10 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
