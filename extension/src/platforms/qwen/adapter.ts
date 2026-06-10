import type { BatchListOptions, CapturedNetworkEvent, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import {
  findNodeByIdText,
  getActiveScrollContainer,
  getViewportMetrics,
  isElementVisibleInMetrics,
  isScrollNearBottom,
  queryElements
} from "../shared/node-active";
import { jumpToVirtualizedNode } from "../shared/node-jump";
import { normalizeBatchTimestamp } from "../shared/timestamp";
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
    return scanTextNodes(root, [
      "[data-msgid$=\"-question\"]",
      "[data-msg-id$=\"-question\"]",
      "[class*=\"questionItem\"]",
      "[class*=\"question-item\"]",
      "[data-role=\"user\"]",
      "[class*=\"user\"]",
      "[class*=\"message\"]",
      "[data-testid*=\"message\"]",
      "article"
    ], "qwen", { roles: ["user"] });
  },
  jumpToNode(node, context) {
    return jumpToVirtualizedNode(node, context, {
      rowSelectors: [
        "[class*=\"questionItem\"]",
        "[class*=\"question-item\"]",
        "[class*=\"answerItem\"]",
        "[class*=\"answer-item\"]",
        "[class*=\"message-item\"]",
        "[class*=\"messageItem\"]",
        "[class*=\"chat-item\"]",
        "[data-msgid]",
        "[data-msg-id]"
      ],
      maxSearchAttempts: 120,
      waitAfterScrollMs: 90,
      alignRatio: 0.35,
      acceptRow: (row) => getQwenRowType(row) === "question",
      getCandidateElement: getQwenMessageBubble,
      getCandidateId: getQwenRowId,
      getCandidateText: (row, element) => getQwenRowText(row) || getElementText(element),
      normalizeId: normalizeQwenMessageId,
      normalizeText: normalizeQwenText
    });
  },
  getActiveNode(context) {
    const rows = getQwenConversationRows(context.root || document);
    if (!rows.length) return null;
    if (context.nodes.length === 1) return context.nodes[0] || null;

    const scrollContainer = getActiveScrollContainer(context, rows, [
      "[class*=\"chatContent\"]",
      "[class*=\"messageList\"]",
      "main"
    ]);
    if (isScrollNearBottom(scrollContainer, 140)) {
      const visibleRows = getVisibleQwenRows(rows, context, scrollContainer);
      return resolveQwenNodeFromRow(visibleRows[visibleRows.length - 1] || rows[rows.length - 1], rows, context.nodes);
    }

    const metrics = getViewportMetrics(context, scrollContainer);
    const visibleRows = rows.filter((row) => isElementVisibleInMetrics(row, metrics));
    const candidateRows = visibleRows.length ? visibleRows : rows;

    const crossingRow = candidateRows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top <= metrics.readingAnchor && rect.bottom >= metrics.readingAnchor;
    });
    if (crossingRow) return resolveQwenNodeFromRow(crossingRow, rows, context.nodes);

    let bestRow: HTMLElement | null = null;
    let bestScore = -Infinity;
    candidateRows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (!isElementVisibleInMetrics(row, metrics)) return;
      const score = rect.top <= metrics.readingAnchor
        ? 2000 - Math.abs(metrics.readingAnchor - rect.top)
        : 1000 - Math.abs(rect.top - metrics.readingAnchor);
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    });

    return bestRow ? resolveQwenNodeFromRow(bestRow, rows, context.nodes) : null;
  },
  getScrollContainer(root = document) {
    const rows = getQwenConversationRows(root);
    return getActiveScrollContainer({ nodes: [], readingLineOffset: 150, root }, rows, [
      "[class*=\"chatContent\"]",
      "[class*=\"messageList\"]",
      "main"
    ]);
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
  async fetchConversationDetail(id, _summary, capturedEvents) {
    return fetchQwenConversationDetail(id, 20, getQwenCapturedRequestContext(capturedEvents));
  }
};

function getQwenConversationRows(root: ParentNode): HTMLElement[] {
  const rows = queryElements(root, [
    "[data-msgid]",
    "[data-msg-id]",
    "[class*=\"questionItem\"]",
    "[class*=\"question-item\"]",
    "[class*=\"answerItem\"]",
    "[class*=\"answer-item\"]",
    "[class*=\"message-item\"]",
    "[class*=\"messageItem\"]",
    "[class*=\"chat-item\"]"
  ].join(","));
  const seen = new Set<HTMLElement>();
  return rows.filter((row) => {
    if (seen.has(row)) return false;
    seen.add(row);
    return getQwenRowType(row) !== "unknown";
  });
}

function getVisibleQwenRows(rows: HTMLElement[], context: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0], scrollContainer: HTMLElement | null): HTMLElement[] {
  const metrics = getViewportMetrics(context, scrollContainer);
  return rows.filter((row) => isElementVisibleInMetrics(row, metrics));
}

function resolveQwenNodeFromRow(row: HTMLElement | null | undefined, rows: HTMLElement[], nodes: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0]["nodes"]) {
  if (!row) return null;
  const rowType = getQwenRowType(row);
  const rowIndex = rows.indexOf(row);
  const questionRows = rows.filter((item) => getQwenRowType(item) === "question");
  const canUseGlobalSessionIndex = questionRows.length > 0 && questionRows.length === nodes.length;
  const rowId = getQwenRowId(row);

  const directById = findNodeByIdText(nodes, rowId, "", {
    normalizeId: normalizeQwenMessageId,
    normalizeText: normalizeQwenText
  });
  if (directById) return directById;

  if (rowType !== "question" && rowIndex !== -1) {
    for (let index = rowIndex - 1; index >= 0; index -= 1) {
      if (getQwenRowType(rows[index]) === "question") {
        return resolveQwenNodeFromRow(rows[index], rows, nodes);
      }
    }
  }

  const sessionIndex = canUseGlobalSessionIndex ? questionRows.indexOf(row) : -1;
  return findNodeByIdText(nodes, rowId, getQwenRowText(row), {
    normalizeId: normalizeQwenMessageId,
    normalizeText: normalizeQwenText,
    sessionIndex,
    minTextScore: 8
  });
}

function getQwenRowType(row: HTMLElement): "question" | "answer" | "unknown" {
  const msgId = String(row.getAttribute("data-msgid") || row.getAttribute("data-msg-id") || "").toLowerCase();
  if (msgId.endsWith("-question")) return "question";
  if (msgId.endsWith("-answer")) return "answer";

  const className = String(row.className || "").toLowerCase();
  if (className.includes("answeritem") || className.includes("answer-item")) return "answer";
  if (/(question|user|human|sender)/i.test(className)) return "question";
  if (/(answer|assistant|bot|reply)/i.test(className)) return "answer";
  if (row.querySelector("[class*=\"user\"], [class*=\"human\"], [class*=\"User\"]")) return "question";
  if (row.querySelector("[class*=\"assistant\"], [class*=\"bot\"], [class*=\"Ai\"]")) return "answer";
  return "unknown";
}

function getQwenRowId(row: HTMLElement): string {
  return normalizeQwenMessageId(
    row.getAttribute("data-msgid")
      || row.getAttribute("data-msg-id")
      || row.getAttribute("data-id")
      || row.id
      || ""
  );
}

function getQwenMessageBubble(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>("[class*=\"contentBox\"] [class*=\"bubble\"]")
    || row.querySelector<HTMLElement>("[class*=\"bubble\"]")
    || row.querySelector<HTMLElement>("[class*=\"contentBox\"]")
    || row;
}

function getQwenRowText(row: HTMLElement): string {
  return normalizeQwenText(getElementText(getQwenMessageBubble(row) || row));
}

function normalizeQwenMessageId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[-_:]?(question|answer|assistant|receive|send)$/i, "")
    .toLowerCase();
}

function normalizeQwenText(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

const QWEN_PAGE_LIST_URL = "https://chat2-api.qianwen.com/api/v2/session/page/list?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai";
const QWEN_MSG_LIST_URL = "https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai";
const QWEN_FALLBACK_UT_KEY = "AI-Chat-Helper-qwen-fallback-ut";
const QWEN_MSG_LIST_PATH = "/api/v1/session/msg/list";
const QWEN_PAGE_LIST_PATH = "/api/v2/session/page/list";

interface QwenRequestContext {
  msgListUrl: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  bodyTemplate: Record<string, unknown>;
}

async function fetchQwenConversationDetail(id: string, maxPages = 20, context = getQwenCapturedRequestContext()) {
  const mergedList: unknown[] = [];
  const seen = new Set<string>();
  let firstPayload: any = null;
  let nextPos = "";
  let lastPos = "";
  let requestMethod = context.method;

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildQwenMessageListUrl(id, nextPos, context.msgListUrl, context);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = buildQwenRequestHeaders(context, {});
      if (requestMethod === "GET" && headers["content-type"]) delete headers["content-type"];
      const init: RequestInit = {
        method: requestMethod,
        credentials: "include",
        headers
      };
      if (requestMethod !== "GET") init.body = JSON.stringify(context.bodyTemplate || {});
      response = await fetch(url, init);
      if (response.status !== 405) break;
      requestMethod = getQwenAlternateHttpMethod(requestMethod);
    }
    if (!response || !response.ok) {
      throw new Error(`Qwen message list request failed (${response?.status || 0})`);
    }

    const payload = await response.json();
    if (!firstPayload) firstPayload = payload;
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    list.forEach((item: any, index: number) => {
      const key = String(item?.req_id || item?.request_id || item?.id || item?.pos || `${page}-${index}`).trim();
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      mergedList.push(item);
    });

    const hasNext = Boolean(payload?.data?.have_next_page || payload?.data?.haveNextPage);
    const cursor = getQwenNextPagePos(payload);
    if (!hasNext || !cursor || cursor === lastPos) break;
    lastPos = cursor;
    nextPos = cursor;
  }

  const mergedPayload = firstPayload && typeof firstPayload === "object"
    ? {
      ...firstPayload,
      data: {
        ...(firstPayload.data || {}),
        list: mergedList,
        have_next_page: false
      }
    }
    : { data: { list: mergedList } };
  return extractQwenSnapshotFromMessageList(mergedPayload);
}

function buildQwenMessageListUrl(sessionId: string, pos = "", templateUrl = "", context?: QwenRequestContext): string {
  const url = new URL(templateUrl || QWEN_MSG_LIST_URL, "https://www.qianwen.com");
  if (!url.pathname.includes(QWEN_MSG_LIST_PATH)) {
    url.hostname = "chat2-api.qianwen.com";
    url.pathname = QWEN_MSG_LIST_PATH;
  }
  const isHistoryPage = Boolean(pos);
  const preservedPageSize = String(url.searchParams.get("page_size") || "").trim();
  const defaultPageSize = isHistoryPage ? "10" : (preservedPageSize || "5");
  const defaults: Record<string, string> = {
    return_response_messages: "true",
    biz_id: "ai_qwen",
    event_filter: "all",
    page_size: defaultPageSize,
    chat_client: "h5",
    device: "pc",
    fr: "pc",
    pr: "qwen",
    la: "zh-CN",
    tz: "Asia/Shanghai"
  };
  Object.entries(defaults).forEach(([key, value]) => url.searchParams.set(key, value));
  [
    "pos",
    "cursor",
    "offset",
    "page",
    "page_no",
    "page_num",
    "next_cursor",
    "nextCursor",
    "start",
    "start_time",
    "end_time"
  ].forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("session_id", sessionId);
  const ut = getQwenUt(context);
  if (ut && !url.searchParams.get("ut")) url.searchParams.set("ut", ut);
  url.searchParams.set("page_size", "50");
  if (pos) url.searchParams.set("pos", pos);
  url.searchParams.set("nonce", createNonce(11));
  url.searchParams.set("timestamp", String(Date.now()));
  return url.toString();
}

function getQwenNextPagePos(payload: any): string {
  const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  const numericPositions: string[] = list
    .map((item: any) => String(
      item?.pos
      ?? item?.position
      ?? item?.request_timestamp
      ?? item?.created_at
      ?? item?.updated_at
      ?? item?.create_time
      ?? item?.update_time
      ?? ""
    ).trim())
    .filter((value: string) => /^\d+$/.test(value));

  if (!numericPositions.length) return "";
  return numericPositions.reduce((min, value) => (BigInt(value) < BigInt(min) ? value : min), numericPositions[0]);
}

async function fetchQwenConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const totalLimit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const items: any[] = [];
  const seen = new Set<string>();
  let nextToken = String(options.cursor || "");
  const context = getQwenCapturedRequestContext(options.capturedEvents);

  for (let page = 0; page < 10 && items.length < totalLimit; page += 1) {
    const pageLimit = Math.min(50, totalLimit - items.length);
    const response = await fetch(buildQwenPageListUrl(context), {
      method: "POST",
      credentials: "include",
      headers: buildQwenRequestHeaders(context, {
        "content-type": "application/json",
        "x-platform": "pc_tongyi"
      }),
      body: JSON.stringify({
        limit: pageLimit,
        next_token: nextToken,
        sort_field: "modifiedTime",
        need_filter_tag: true
      })
    });
    if (!response.ok) {
      throw new Error(`Qwen conversation list request failed (${response.status})`);
    }

    const payload = await response.json();
    const pageItems = pickQwenConversationArray(payload);
    pageItems.forEach((item: any) => {
      const key = String(findQwenValue(item, ["session_id", "sessionId", "id", "uuid", "conversation_id", "conversationId"]) || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });

    const cursor = getQwenNextSessionToken(payload);
    if (!cursor || !pageItems.length || cursor === nextToken) break;
    nextToken = cursor;
  }

  return items
    .map<ConversationSummary | null>((item: any) => {
    const conversationId = String(findQwenValue(item, ["session_id", "sessionId", "id", "uuid", "conversation_id", "conversationId"]) || "").trim();
    if (!conversationId) return null;
    const updated = normalizeBatchTimestamp(findQwenValue(item, ["modifiedTime", "modified_time", "updated_at", "update_time", "gmt_modified"]));
    const created = normalizeBatchTimestamp(findQwenValue(item, ["createdTime", "created_time", "created_at", "create_time", "gmt_create"]));
    const summary: ConversationSummary = {
      platformId: "qwen",
      conversationId,
      title: String(findQwenValue(item, ["title", "name", "session_name", "session_title", "topic", "summary", "display_title"]) || "Tongyi Qianwen Conversation"),
      updatedAt: updated.value,
      updatedAtText: updated.text,
      messageCount: normalizeQwenCount(findQwenValue(item, ["message_count", "msg_count", "badge_count", "messageCount"]))
    };
    if (created.value) summary.createdAt = created.value;
    if (created.text) summary.createdAtText = created.text;
    return summary;
  })
    .filter((summary): summary is ConversationSummary => Boolean(summary))
    .sort((a, b) => getQwenSummarySortValue(b.updatedAt) - getQwenSummarySortValue(a.updatedAt))
    .slice(0, totalLimit);
}

function getQwenNextSessionToken(payload: any): string {
  const candidates = [
    payload?.data?.next_token,
    payload?.data?.nextToken,
    payload?.data?.page_info?.next_token,
    payload?.data?.pageInfo?.nextToken,
    payload?.next_token,
    payload?.nextToken
  ];
  const token = candidates.find((item) => item != null && item !== "");
  return token ? String(token) : "";
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

function normalizeQwenCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}

function getQwenSummarySortValue(value: unknown): number {
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

function buildQwenPageListUrl(context?: QwenRequestContext): string {
  const url = new URL(QWEN_PAGE_LIST_URL);
  url.hostname = "chat2-api.qianwen.com";
  url.pathname = QWEN_PAGE_LIST_PATH;
  const ut = getQwenUt(context);
  if (ut) url.searchParams.set("ut", ut);
  return url.toString();
}

function getQwenUt(context?: QwenRequestContext): string {
  const capturedUrlUt = getQwenUtFromCapturedUrl(context?.msgListUrl || "");
  if (capturedUrlUt) return capturedUrlUt;

  const capturedHeaderUt = getQwenUtFromHeaders(context?.headers || {});
  if (capturedHeaderUt) return capturedHeaderUt;

  return getQwenUtFromPage();
}

function getQwenUtFromCapturedUrl(rawUrl: string): string {
  try {
    return String(new URL(rawUrl, "https://www.qianwen.com").searchParams.get("ut") || "").trim();
  } catch {
    return "";
  }
}

function getQwenUtFromHeaders(headers: Record<string, string> = {}): string {
  const lower: Record<string, string> = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    lower[String(key || "").toLowerCase()] = String(value || "").trim();
  });
  return String(
    lower["x-deviceid"]
    || lower["x-qwen-ut"]
    || lower["qwen-ut"]
    || lower.ut
    || ""
  ).trim();
}

function buildQwenRequestHeaders(
  contextOrExtraHeaders: QwenRequestContext | Record<string, string> = getQwenCapturedRequestContext(),
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const hasContextShape = "headers" in contextOrExtraHeaders && "method" in contextOrExtraHeaders;
  const context = hasContextShape ? contextOrExtraHeaders as QwenRequestContext : undefined;
  const contextHeaders = context?.headers || {};
  const mergedExtraHeaders = hasContextShape ? extraHeaders : contextOrExtraHeaders as Record<string, string>;
  const headers = sanitizeQwenHeaders({
    ...contextHeaders,
    ...mergedExtraHeaders,
    accept: "application/json, text/plain, */*"
  });
  const xsrfToken = getCookieValue("XSRF-TOKEN");
  if (xsrfToken && !headers["x-xsrf-token"]) {
    headers["x-xsrf-token"] = xsrfToken;
  }
  const ut = getQwenUt(context);
  if (ut && !headers["x-deviceid"]) {
    headers["x-deviceid"] = ut;
  }
  return headers;
}

function getQwenCapturedRequestContext(events: CapturedNetworkEvent[] = []): QwenRequestContext {
  const event = [...events].reverse().find(isQwenMsgListEvent);
  const responseHeaders = extractQwenTemplateHeadersFromResponse(event?.responseText || "");
  return {
    msgListUrl: event?.url || "",
    method: normalizeQwenHttpMethod(event?.method, "GET"),
    headers: sanitizeQwenHeaders({
      ...(event?.requestHeaders || {}),
      ...responseHeaders
    }),
    bodyTemplate: parseQwenTemplateBody(event?.requestBody || "")
  };
}

function isQwenMsgListEvent(event: CapturedNetworkEvent): boolean {
  try {
    return new URL(event.url || "", "https://www.qianwen.com").pathname.includes(QWEN_MSG_LIST_PATH);
  } catch {
    return false;
  }
}

function sanitizeQwenHeaders(inputHeaders: Record<string, string> = {}): Record<string, string> {
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

function extractQwenTemplateHeadersFromResponse(responseText: string): Record<string, string> {
  const payload = safeParseJson(responseText);
  const list = Array.isArray((payload as any)?.data?.list) ? (payload as any).data.list : [];
  for (const item of list) {
    const rawHeader = typeof item?.header === "string" ? item.header.trim() : "";
    if (!rawHeader) continue;
    const parsed = safeParseJson(rawHeader);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  }
  return {};
}

function parseQwenTemplateBody(bodyText: string): Record<string, unknown> {
  const parsed = safeParseJson(bodyText);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function normalizeQwenHttpMethod(method: unknown, fallback: "GET" | "POST" = "GET"): "GET" | "POST" {
  const upper = String(method || "").trim().toUpperCase();
  return upper === "GET" || upper === "POST" ? upper : fallback;
}

function getQwenAlternateHttpMethod(method: "GET" | "POST"): "GET" | "POST" {
  return method === "GET" ? "POST" : "GET";
}

function getQwenUtFromPage(): string {
  const storageKeys = ["ut", "x-qwen-ut", "qwen-ut", "qwen_ut", "X-Qwen-UT", "deviceId", "device_id", "utdid"];
  for (const key of storageKeys) {
    const localValue = getStorageValue(localStorage, key);
    if (localValue) return localValue;
    const sessionValue = getStorageValue(sessionStorage, key);
    if (sessionValue) return sessionValue;
  }

  const cookieValue = [
    getCookieValue("ut"),
    getCookieValue("qwen_ut"),
    getCookieValue("deviceId"),
    getCookieValue("device_id"),
    getCookieValue("x-deviceid")
  ].find(Boolean);
  if (cookieValue) return cookieValue;

  const storedFallback = getStorageValue(localStorage, QWEN_FALLBACK_UT_KEY);
  if (storedFallback) return storedFallback;

  const generated = createFallbackQwenUt();
  try {
    localStorage.setItem(QWEN_FALLBACK_UT_KEY, generated);
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
  return generated;
}

function getStorageValue(storage: Storage, key: string): string {
  try {
    return String(storage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function getCookieValue(name: string): string {
  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(document.cookie || "").match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function createFallbackQwenUt(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to nonce-based UUID.
  }

  return [
    createNonce(8),
    createNonce(4),
    createNonce(4),
    createNonce(4),
    createNonce(12)
  ].join("-");
}

function createNonce(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
