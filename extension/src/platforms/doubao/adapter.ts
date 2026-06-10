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
import {
  collectDoubaoArtifactMetasFromSingleChain,
  doubaoArtifactKey,
  extractDoubaoConversationIdFromRequestBody,
  extractDoubaoSnapshotFromSingleChain,
  type DoubaoArtifactMeta
} from "./mapping";

const DOUBAO_QUERY_DEFAULTS = "version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7571732726702835209&pc_version=3.12.3&web_id=7572300776296236571&tea_uuid=7572300776296236571&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1";
const DOUBAO_BATCH_FETCH_MAX_PAGES = 30;
const DOUBAO_FULL_FETCH_MAX_PAGES = 200;
const doubaoSummaryRawPayloads = new WeakMap<ConversationSummary, unknown>();

interface DoubaoRequestContext {
  headers: Record<string, string>;
  recentUrl: string;
  recentUrlCandidates: string[];
  recentBodyTemplate: unknown;
  singleUrl: string;
  singleBodyTemplate: unknown;
  mcsListUrl: string;
  mcsListMethod: string;
  mcsListHeaders: Record<string, string>;
  mcsListBodyText: string;
  webTabId: string;
}

export const doubaoAdapter: PlatformAdapter = {
  id: "doubao",
  name: "Doubao",
  matches(url) {
    return url.hostname === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    const queryId = String(
      url.searchParams.get("conversation_id")
      || url.searchParams.get("chat_id")
      || url.searchParams.get("session_id")
      || ""
    ).trim();
    if (queryId) return queryId;
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, [
      "[data-testid=\"send_message\"]",
      "[data-role=\"user\"]",
      "[class*=\"user\"]",
      "[class*=\"question\"]",
      "[class*=\"message\"]",
      "[data-testid*=\"message\"]",
      "article"
    ], "doubao", { roles: ["user"] });
  },
  jumpToNode(node, context) {
    return jumpToVirtualizedNode(node, context, {
      rowSelectors: [
        "[data-testid=\"send_message\"]",
        "[data-testid=\"receive_message\"]",
        "[data-target-id=\"message-box-target-id\"]"
      ],
      maxSearchAttempts: 80,
      waitAfterScrollMs: 90,
      alignRatio: 0.35,
      acceptRow: (row) => getDoubaoRowType(row) === "user",
      getCandidateElement: getDoubaoMessageBubble,
      getCandidateId: getDoubaoRowId,
      getCandidateText: (row, element) => getDoubaoRowText(row) || getElementText(element),
      normalizeId: normalizeDoubaoMessageId,
      normalizeText: normalizeDoubaoText
    });
  },
  getActiveNode(context) {
    const rows = getDoubaoConversationRows(context.root || document);
    if (!rows.length) return null;
    if (context.nodes.length === 1) return context.nodes[0] || null;

    const scrollContainer = getActiveScrollContainer(context, rows, [
      ".scrollable-Se7zNt",
      "[class*=\"scrollable-\"]",
      ".scroll-view-OEiNXD",
      "[class*=\"scroll-view-\"]",
      "[data-testid=\"chat_content\"]",
      "[class*=\"chat-content\"]",
      "main"
    ]);
    if (isScrollNearBottom(scrollContainer, 140)) return context.nodes[context.nodes.length - 1] || null;

    const metrics = getViewportMetrics(context, scrollContainer);
    const visibleRows = rows.filter((row) => isElementVisibleInMetrics(row, metrics));
    const candidateRows = visibleRows.length ? visibleRows : rows;

    const crossingRow = candidateRows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top <= metrics.readingAnchor && rect.bottom >= metrics.readingAnchor;
    });
    if (crossingRow) return resolveDoubaoNodeFromRow(crossingRow, rows, context.nodes);

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

    return bestRow ? resolveDoubaoNodeFromRow(bestRow, rows, context.nodes) : null;
  },
  getScrollContainer(root = document) {
    const rows = getDoubaoConversationRows(root);
    return getActiveScrollContainer({ nodes: [], readingLineOffset: 150, root }, rows, [
      ".scrollable-Se7zNt",
      "[class*=\"scrollable-\"]",
      ".scroll-view-OEiNXD",
      "[class*=\"scroll-view-\"]",
      "[data-testid=\"chat_content\"]",
      "[class*=\"chat-content\"]",
      "main"
    ]);
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/im\/chain\/single/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Doubao single-chain response is available");
    }
    const conversationId = extractDoubaoConversationIdFromRequestBody(event.requestBody) || "current";
    const payload = JSON.parse(event.responseText);
    const context = getDoubaoCapturedRequestContext(events);
    const artifactTexts = await fetchDoubaoArtifactTexts(payload, context.headers, context.webTabId);
    return extractDoubaoSnapshotFromSingleChain(payload, conversationId, { artifactTexts });
  },
  async fetchConversationList(options) {
    return fetchDoubaoConversationList(options);
  },
  async fetchConversationDetail(id, summary, capturedEvents) {
    const context = getDoubaoCapturedRequestContext(capturedEvents);
    const payload = await fetchDoubaoSingleChainAllPages(
      id,
      summary ? DOUBAO_BATCH_FETCH_MAX_PAGES : DOUBAO_FULL_FETCH_MAX_PAGES,
      context
    );
    const artifactTexts = await fetchDoubaoArtifactTexts(payload, context.headers, context.webTabId);
    return extractDoubaoSnapshotFromSingleChain(payload, id, { artifactTexts });
  }
};

function getDoubaoConversationRows(root: ParentNode): HTMLElement[] {
  const rows = queryElements(root, [
    "[data-testid=\"send_message\"]",
    "[data-testid=\"receive_message\"]",
    "[data-target-id=\"message-box-target-id\"]",
    "[data-message-id]"
  ].join(","));
  const seen = new Set<HTMLElement>();
  return rows.filter((row) => {
    if (seen.has(row)) return false;
    seen.add(row);
    return getDoubaoRowType(row) !== "unknown";
  });
}

function resolveDoubaoNodeFromRow(row: HTMLElement | null | undefined, rows: HTMLElement[], nodes: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0]["nodes"]) {
  if (!row) return null;
  const rowIndex = rows.indexOf(row);
  const rowType = getDoubaoRowType(row);

  if (rowType !== "user" && rowIndex !== -1) {
    for (let index = rowIndex - 1; index >= 0; index -= 1) {
      if (getDoubaoRowType(rows[index]) === "user") {
        return resolveDoubaoNodeFromRow(rows[index], rows, nodes);
      }
    }
    for (let index = rowIndex + 1; index < rows.length; index += 1) {
      if (getDoubaoRowType(rows[index]) === "user") {
        return resolveDoubaoNodeFromRow(rows[index], rows, nodes);
      }
    }
    if (nodes.length === 1) return nodes[0] || null;
  }

  const resolved = findNodeByIdText(nodes, getDoubaoRowId(row), getDoubaoRowText(row), {
    normalizeId: normalizeDoubaoMessageId,
    normalizeText: normalizeDoubaoText,
    minTextScore: 8
  });
  if (resolved) return resolved;
  if (nodes.length === 1) return nodes[0] || null;

  const userRows = rows.filter((item) => getDoubaoRowType(item) === "user");
  const userIndex = userRows.indexOf(row);
  if (userRows.length > 1 && userIndex >= 0 && nodes.length > 1) {
    const mapped = Math.round((userIndex / (userRows.length - 1)) * (nodes.length - 1));
    return nodes[Math.max(0, Math.min(nodes.length - 1, mapped))] || null;
  }

  return null;
}

function getDoubaoRowType(row: HTMLElement): "user" | "assistant" | "unknown" {
  const testId = String(row.getAttribute("data-testid") || "").toLowerCase();
  if (testId === "send_message") return "user";
  if (testId === "receive_message") return "assistant";
  if (row.querySelector("[data-plugin-identifier*=\"receive\"]")) return "assistant";
  if (row.querySelector("[data-plugin-identifier*=\"send\"]")) return "user";
  if (row.querySelector("[data-foundation-type=\"receive-message-action-bar\"]")) return "assistant";
  if (row.querySelector("[class*=\"justify-end\"]")) return "user";
  return "unknown";
}

function getDoubaoMessageBubble(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>("[data-testid=\"message_content\"]")
    || row.querySelector<HTMLElement>("[data-testid=\"message_text_content\"]")
    || row.querySelector<HTMLElement>("[data-message-id]")
    || row;
}

function getDoubaoRowId(row: HTMLElement): string {
  return normalizeDoubaoMessageId(
    row.querySelector<HTMLElement>("[data-testid=\"message_content\"]")?.getAttribute("data-message-id")
      || row.querySelector<HTMLElement>("[data-message-id]")?.getAttribute("data-message-id")
      || row.getAttribute("data-message-id")
      || row.getAttribute("data-id")
      || ""
  );
}

function getDoubaoRowText(row: HTMLElement): string {
  const bubble = getDoubaoMessageBubble(row) || row;
  return normalizeDoubaoText(getElementText(bubble));
}

function normalizeDoubaoMessageId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[-_:]?(question|answer|assistant|receive|send)$/i, "")
    .replace(/-(u|a)-\d+$/i, "")
    .toLowerCase();
}

function normalizeDoubaoText(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

async function fetchDoubaoConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const items: ConversationSummary[] = [];
  const seen = new Set<string>();
  let convVersionCursor: string | number = 0;
  let lastCursor = "";
  const context = getDoubaoCapturedRequestContext(options.capturedEvents);

  for (let page = 0; page < 12 && items.length < limit; page += 1) {
    const requestLimit = Math.min(20, limit - items.length);
    if (page > 0) {
      await preflightDoubaoMcsList(context);
    }
    const payload = await fetchDoubaoConversationListPage(requestLimit, convVersionCursor, page > 0, context);
    const pageItems = extractDoubaoConversationSummaries(payload);
    let added = 0;

    pageItems.forEach((item) => {
      const id = String(item.conversationId || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push(item);
      added += 1;
    });

    const downlink = getDoubaoRecentConvDownlink(payload);
    const hasMore = parseBoolLike(downlink.has_more ?? downlink.hasMore) || pageItems.length >= requestLimit;
    const nextCursor = resolveDoubaoNextConvCursor(payload, pageItems);
    const normalizedNext = String(nextCursor || "").trim();
    const currentCursor = String(convVersionCursor == null ? "" : convVersionCursor).trim();

    if (!hasMore || added === 0 || !normalizedNext || normalizedNext === currentCursor || normalizedNext === lastCursor) break;
    lastCursor = currentCursor;
    convVersionCursor = normalizeDoubaoConvVersionValue(normalizedNext);
  }

  return items
    .sort((a, b) => Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0)))
    .slice(0, limit);
}

async function fetchDoubaoConversationListPage(
  limit: number,
  convVersion: string | number = 0,
  isContinuation = false,
  context = getDoubaoCapturedRequestContext()
): Promise<unknown> {
  const bodyTemplates = isPlainRecord(context.recentBodyTemplate)
    ? [context.recentBodyTemplate, null]
    : [null];
  const urls = context.recentUrlCandidates.length ? context.recentUrlCandidates : [context.recentUrl];
  let lastFailure = "";

  for (const url of urls) {
    for (const templateBody of bodyTemplates) {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: sanitizeDoubaoHeaders(context.headers),
        body: JSON.stringify(buildDoubaoRecentConvBody(limit, convVersion, isContinuation, templateBody))
      });
      if (!response.ok) {
        lastFailure = `${url}: HTTP ${response.status}`;
        continue;
      }

      const payload = await response.json();
      const statusCode = Number((payload as any)?.status_code || 0);
      if (Number.isFinite(statusCode) && statusCode !== 0) {
        lastFailure = `${url}: status_code=${statusCode}`;
        continue;
      }
      context.recentUrl = url;
      context.recentUrlCandidates = prioritizeDoubaoRecentUrlCandidate(url, urls);
      return payload;
    }
  }

  throw new Error(`Doubao recent conversation request failed (${lastFailure || "empty response"})`);
}

function buildDoubaoRecentConvBody(
  limit: number,
  convVersion: string | number = 0,
  isContinuation = false,
  templateBody: unknown = null
): object {
  const body: Record<string, any> = isPlainRecord(templateBody)
    ? clonePlainJson(templateBody)
    : {
      cmd: 3200,
      uplink_body: {
        pull_recent_conv_chain_uplink_body: {
          limit,
          message_count_per_conv: 10,
          api_version: 1,
          conv_version: normalizeDoubaoConvVersionValue(convVersion),
          direction: isContinuation ? 1 : 3,
          option: {
            not_need_message: true,
            need_complete_conversation: true,
            need_coco_conversation: !isContinuation,
            need_coco_bot: !isContinuation,
            need_pc_pin_chain: true,
            pc_pin_query_type: isContinuation ? 1 : 0
          }
        }
      },
      channel: 2,
      version: "1"
    };

  if (!isPlainRecord(body.uplink_body)) body.uplink_body = {};
  if (!isPlainRecord(body.uplink_body.pull_recent_conv_chain_uplink_body)) {
    body.uplink_body.pull_recent_conv_chain_uplink_body = {};
  }

  const pull = body.uplink_body.pull_recent_conv_chain_uplink_body;
  if (!isPlainRecord(pull.option)) pull.option = {};
  pull.limit = limit;
  pull.conv_version = normalizeDoubaoConvVersionValue(convVersion);
  if (pull.api_version == null) pull.api_version = 1;
  pull.direction = isContinuation ? 1 : (pull.direction == null ? 3 : pull.direction);
  if (pull.message_count_per_conv == null) pull.message_count_per_conv = 10;

  if (isContinuation) {
    pull.option.need_coco_conversation = false;
    pull.option.need_coco_bot = false;
    pull.option.need_pc_pin_chain = true;
    pull.option.pc_pin_query_type = 1;
  } else {
    if (pull.option.need_coco_conversation == null) pull.option.need_coco_conversation = true;
    if (pull.option.need_coco_bot == null) pull.option.need_coco_bot = true;
    if (pull.option.need_pc_pin_chain == null) pull.option.need_pc_pin_chain = true;
    if (pull.option.pc_pin_query_type == null) pull.option.pc_pin_query_type = 0;
  }

  body.cmd = Number(body.cmd || 3200) || 3200;
  body.sequence_id = createDoubaoSequenceId();
  if (body.channel == null) body.channel = 2;
  if (body.version == null) body.version = "1";
  return body;
}

function sanitizeDoubaoHeaders(inputHeaders: Record<string, string> = {}): Record<string, string> {
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
  if (!out["content-type"]) out["content-type"] = "application/json; encoding=utf-8";
  if (!out["agw-js-conv"]) out["agw-js-conv"] = "str";
  return out;
}

function getDoubaoCapturedRequestContext(events: CapturedNetworkEvent[] = []): DoubaoRequestContext {
  const reversed = [...events].reverse();
  const singleEvent = reversed.find(isDoubaoSingleChainEvent);
  const recentEvent = reversed.find(isDoubaoRecentConvEvent);
  const mcsListEvent = reversed.find(isDoubaoMcsListEvent);
  const headerEvent = [singleEvent, recentEvent, ...reversed].find((event) => event?.requestHeaders && Object.keys(event.requestHeaders).length);
  const preferredTabId = getFirstNonEmpty(
    getDoubaoWebTabIdFromUrl(singleEvent?.url || ""),
    getDoubaoWebTabIdFromUrl(recentEvent?.url || ""),
    getDoubaoWebTabIdFromUrl(typeof window !== "undefined" ? window.location.href : "")
  );
  const recentUrlCandidates = buildDoubaoRecentUrlCandidates(recentEvent?.url || "", preferredTabId);
  const recentUrl = recentUrlCandidates[0];
  const singleUrl = ensureDoubaoSingleChainUrl(singleEvent?.url || "", getFirstNonEmpty(preferredTabId, getDoubaoWebTabIdFromUrl(recentUrl)));

  return {
    headers: sanitizeDoubaoHeaders(headerEvent?.requestHeaders || {}),
    recentUrl,
    recentUrlCandidates,
    recentBodyTemplate: safeParseJson(String(recentEvent?.requestBody || "")),
    singleUrl,
    singleBodyTemplate: safeParseJson(String(singleEvent?.requestBody || "")),
    mcsListUrl: mcsListEvent?.url || "",
    mcsListMethod: String(mcsListEvent?.method || "").toUpperCase(),
    mcsListHeaders: sanitizeDoubaoHeaders(mcsListEvent?.requestHeaders || {}),
    mcsListBodyText: typeof mcsListEvent?.requestBody === "string" ? mcsListEvent.requestBody : "",
    webTabId: getFirstNonEmpty(getDoubaoWebTabIdFromUrl(singleUrl), getDoubaoWebTabIdFromUrl(recentUrl), preferredTabId)
  };
}

function isDoubaoSingleChainEvent(event: CapturedNetworkEvent): boolean {
  return /\/im\/chain\/single(?:[?#]|$)/i.test(event.url || "");
}

function isDoubaoRecentConvEvent(event: CapturedNetworkEvent): boolean {
  return /\/im\/chain\/recent_conv(?:[?#]|$)/i.test(event.url || "");
}

function isDoubaoMcsListEvent(event: CapturedNetworkEvent): boolean {
  try {
    const url = new URL(event.url || "");
    return url.hostname === "mcs.doubao.com" && /^\/list\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function preflightDoubaoMcsList(context: DoubaoRequestContext): Promise<void> {
  const hasCaptured = Boolean(context.mcsListUrl);
  const url = hasCaptured ? context.mcsListUrl : "https://mcs.doubao.com/list";
  let method = hasCaptured ? String(context.mcsListMethod || "POST").toUpperCase() : "POST";
  if (method === "OPTIONS") method = "POST";

  const headers = hasCaptured
    ? sanitizeDoubaoHeaders(context.mcsListHeaders)
    : { accept: "*/*", "content-type": "application/json;charset=utf-8" };

  if (!headers.accept) headers.accept = "application/json, text/plain, */*";
  if (method === "GET" || method === "HEAD") {
    delete headers["content-type"];
  } else if (!headers["content-type"]) {
    headers["content-type"] = "application/json;charset=utf-8";
  }

  const init: RequestInit = {
    method,
    credentials: "include",
    headers
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = hasCaptured && context.mcsListBodyText ? context.mcsListBodyText : "{}";
  }

  try {
    await fetch(url, init);
  } catch {
    // The userscript treats this request as a best-effort warm-up before recent_conv pagination.
  }
}

function getFirstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function ensureDoubaoSingleChainUrl(rawUrl = "", preferredWebTabId = ""): string {
  const url = new URL(rawUrl || "/im/chain/single", getDoubaoOrigin());
  addDoubaoQueryDefaults(url);
  const webTabId = getFirstNonEmpty(
    url.searchParams.get("web_tab_id"),
    preferredWebTabId,
    getDoubaoStoredWebTabId()
  ) || createDoubaoSequenceId();
  url.searchParams.set("web_tab_id", rememberDoubaoWebTabId(webTabId));
  return url.toString();
}

function ensureDoubaoRecentConvUrl(rawUrl = "", preferredWebTabId = ""): string {
  const url = new URL(rawUrl || "/im/chain/recent_conv", getDoubaoOrigin());
  addDoubaoQueryDefaults(url);
  const webTabId = getFirstNonEmpty(
    preferredWebTabId,
    url.searchParams.get("web_tab_id"),
    getDoubaoStoredWebTabId()
  ) || createDoubaoSequenceId();
  url.searchParams.set("web_tab_id", rememberDoubaoWebTabId(webTabId));
  return url.toString();
}

function buildDoubaoRecentUrlCandidates(rawUrl = "", preferredWebTabId = ""): string[] {
  const tabIds: string[] = [];
  const urls: string[] = [];
  const seenTabs = new Set<string>();
  const seenUrls = new Set<string>();

  const pushTab = (value: unknown) => {
    const tabId = String(value || "").trim();
    if (!tabId || seenTabs.has(tabId)) return;
    seenTabs.add(tabId);
    tabIds.push(tabId);
  };
  const pushUrl = (url: string) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    urls.push(url);
  };

  pushTab(preferredWebTabId);
  pushTab(getDoubaoWebTabIdFromUrl(rawUrl));
  pushTab(getDoubaoWebTabIdFromUrl(typeof window !== "undefined" ? window.location.href : ""));
  pushTab(getDoubaoStoredWebTabId());

  tabIds.forEach((tabId) => pushUrl(ensureDoubaoRecentConvUrl(rawUrl, tabId)));
  if (!urls.length) pushUrl(ensureDoubaoRecentConvUrl(rawUrl, ""));
  return urls;
}

function prioritizeDoubaoRecentUrlCandidate(successfulUrl: string, candidates: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  [successfulUrl, ...candidates].forEach((url) => {
    const value = String(url || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function addDoubaoQueryDefaults(url: URL): void {
  new URLSearchParams(DOUBAO_QUERY_DEFAULTS).forEach((value, key) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  });
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clonePlainJson(value: unknown): Record<string, any> {
  return JSON.parse(JSON.stringify(value || {}));
}

function createDoubaoSequenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deepReplaceConversationId(value: unknown, conversationId: string, parentKey = ""): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number") {
    return /^(conversation_id|conv_id|chat_id|section_id)$/i.test(parentKey) ? conversationId : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepReplaceConversationId(item, conversationId, parentKey));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
      out[key] = deepReplaceConversationId(entryValue, conversationId, key);
    });
    return out;
  }
  return value;
}

function getDoubaoRecentConvDownlink(payload: any): Record<string, any> {
  return payload?.downlink_body?.pull_recent_conv_chain_downlink_body
    || payload?.downlink_body?.pull_recent_conv_downlink_body
    || {};
}

function resolveDoubaoNextConvCursor(payload: unknown, pageItems: ConversationSummary[]): string {
  const downlink = getDoubaoRecentConvDownlink(payload);
  const direct = String(
    downlink.next_conv_version
    || downlink.nextConvVersion
    || downlink.next_cursor
    || downlink.nextCursor
    || downlink.cursor
    || downlink.conv_version
    || downlink.conversation_version
    || ""
  ).trim();
  if (direct) return direct;

  for (let index = pageItems.length - 1; index >= 0; index -= 1) {
    const raw = doubaoSummaryRawPayloads.get(pageItems[index]);
    const nested = findDoubaoNestedVersion(raw, ["next_conv_version", "nextConvVersion", "conv_version", "conversation_version"], 6);
    if (nested) return nested;
  }

  const oldestTime = pageItems
    .map((item) => Date.parse(String(item.updatedAt || "")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0];
  return Number.isFinite(oldestTime) && oldestTime > 0 ? String(oldestTime) : "";
}

function findDoubaoNestedVersion(value: unknown, keys: string[], maxDepth: number): string {
  if (!value || typeof value !== "object" || maxDepth < 0) return "";
  const obj = value as Record<string, unknown>;

  for (const key of keys) {
    const candidate = obj[key];
    if (candidate === 0 || candidate === "0") return "0";
    const text = String(candidate == null ? "" : candidate).trim();
    if (text) return text;
  }

  if (maxDepth === 0) return "";
  for (const nested of Object.values(obj)) {
    if (!nested || typeof nested !== "object") continue;
    const found = findDoubaoNestedVersion(nested, keys, maxDepth - 1);
    if (found) return found;
  }
  return "";
}

function normalizeDoubaoConvVersionValue(cursor: string | number): string | number {
  const text = String(cursor == null ? "" : cursor).trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : text;
  }
  return text;
}

function buildDoubaoSingleChainBody(
  conversationId: string,
  cursor = "",
  anchorIndex: number | null = null,
  templateBody: unknown = null
): object {
  const body: Record<string, any> = isPlainRecord(templateBody)
    ? deepReplaceConversationId(clonePlainJson(templateBody), conversationId) as Record<string, any>
    : {
      cmd: 3100,
      uplink_body: {
        pull_singe_chain_uplink_body: {
          conversation_id: conversationId,
          anchor_index: Number.MAX_SAFE_INTEGER,
          conversation_type: 3,
          direction: 1,
          limit: 50,
          ext: {},
          filter: { index_list: [] }
        }
      },
      channel: 2,
      version: "1"
    };

  if (!isPlainRecord(body.uplink_body)) body.uplink_body = {};
  if (!isPlainRecord(body.uplink_body.pull_singe_chain_uplink_body)) {
    body.uplink_body.pull_singe_chain_uplink_body = {};
  }

  const pull: Record<string, any> = body.uplink_body.pull_singe_chain_uplink_body;
  pull.conversation_id = conversationId;
  pull.limit = Number(pull.limit || 50) || 50;
  pull.direction = 1;
  pull.anchor_index = anchorIndex != null && Number.isFinite(Number(anchorIndex)) ? Number(anchorIndex) : Number.MAX_SAFE_INTEGER;
  if (cursor) pull.msg_cursor = cursor;
  else if ("msg_cursor" in pull) delete pull.msg_cursor;

  body.cmd = Number(body.cmd || 3100) || 3100;
  body.sequence_id = createDoubaoSequenceId();
  if (body.channel == null) body.channel = 2;
  if (body.version == null) body.version = "1";
  return body;
}

async function fetchDoubaoSingleChainAllPages(
  conversationId: string,
  maxPages = 30,
  context = getDoubaoCapturedRequestContext()
): Promise<unknown> {
  const pages: unknown[] = [];
  let cursor = "";
  let anchorIndex: number | null = null;
  let lastSignature = "";

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchDoubaoSingleChainPage(conversationId, cursor, anchorIndex, context);
    pages.push(payload);

    const chain = getDoubaoSingleChainDownlink(payload);
    const messages = getDoubaoSingleChainMessages(payload);
    const hasMore = parseBoolLike(chain.has_more ?? chain.hasMore);
    if (!hasMore) break;

    if (messages.length) {
      const firstId = getDoubaoRawMessageId(messages[0]);
      const lastId = getDoubaoRawMessageId(messages[messages.length - 1]);
      const signature = `${firstId}|${lastId}|${messages.length}`;
      if (signature && signature === lastSignature) break;
      lastSignature = signature;
    }

    const nextCursor = String(chain.msg_cursor || "").trim();
    const nextIndex = Number(chain.next_index);
    const hasNextIndex = Number.isFinite(nextIndex) && nextIndex > 0;
    const minIndex = getDoubaoMinMessageIndex(messages);
    const fallbackAnchor = minIndex > 1 ? minIndex - 1 : 0;

    if (nextCursor && nextCursor !== cursor) {
      cursor = nextCursor;
      anchorIndex = hasNextIndex ? nextIndex : (fallbackAnchor || anchorIndex);
      continue;
    }

    if (hasNextIndex && nextIndex !== Number(anchorIndex)) {
      cursor = "";
      anchorIndex = nextIndex;
      continue;
    }

    if (fallbackAnchor > 0 && fallbackAnchor !== Number(anchorIndex)) {
      cursor = "";
      anchorIndex = fallbackAnchor;
      continue;
    }

    break;
  }

  return mergeDoubaoSingleChainPayloads(pages);
}

async function fetchDoubaoSingleChainPage(
  conversationId: string,
  cursor = "",
  anchorIndex: number | null = null,
  context = getDoubaoCapturedRequestContext()
): Promise<unknown> {
  const response = await fetch(context.singleUrl, {
    method: "POST",
    credentials: "include",
    headers: sanitizeDoubaoHeaders(context.headers),
    body: JSON.stringify(buildDoubaoSingleChainBody(conversationId, cursor, anchorIndex, context.singleBodyTemplate))
  });
  if (!response.ok) {
    throw new Error(`Doubao single-chain request failed (${response.status})`);
  }
  const payload = await response.json();
  const statusCode = Number((payload as any)?.status_code || 0);
  if (statusCode !== 0) {
    throw new Error(`Doubao single-chain status_code=${(payload as any)?.status_code}, msg=${(payload as any)?.status_desc || "unknown"}`);
  }
  return payload;
}

function mergeDoubaoSingleChainPayloads(pages: unknown[]): unknown {
  if (pages.length <= 1) return pages[0] || {};
  const mergedMessages: unknown[] = [];
  const seen = new Set<string>();

  pages.forEach((page, pageIndex) => {
    getDoubaoSingleChainMessages(page).forEach((message, messageIndex) => {
      const key = getDoubaoRawMessageId(message) || `${pageIndex}:${messageIndex}:${JSON.stringify(message).slice(0, 120)}`;
      if (seen.has(key)) return;
      seen.add(key);
      mergedMessages.push(message);
    });
  });

  return {
    downlink_body: {
      pull_singe_chain_downlink_body: {
        messages: mergedMessages
      }
    }
  };
}

function getDoubaoSingleChainDownlink(payload: any): Record<string, any> {
  return payload?.downlink_body?.pull_singe_chain_downlink_body || {};
}

function getDoubaoSingleChainMessages(payload: unknown): any[] {
  const direct = getDoubaoSingleChainDownlink(payload).messages;
  return Array.isArray(direct) ? direct : [];
}

function getDoubaoRawMessageId(message: any): string {
  return String(message?.message_id || message?.msg_id || "").trim();
}

function getDoubaoMinMessageIndex(messages: any[]): number {
  const indexes = messages
    .map((message) => Number(message?.index_in_conv || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return indexes.length ? Math.min(...indexes) : 0;
}

function parseBoolLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

async function fetchDoubaoArtifactTexts(
  payload: unknown,
  headers: Record<string, string> = {},
  webTabId = ""
): Promise<Record<string, string>> {
  const metas = collectDoubaoArtifactMetasFromSingleChain(payload);
  const out: Record<string, string> = {};

  for (const meta of metas) {
    const text = await fetchDoubaoArtifactText(meta, headers, webTabId);
    if (!text) continue;
    out[doubaoArtifactKey(meta.codeId, meta.version)] = text;
    out[meta.codeId] = text;
  }

  return out;
}

async function fetchDoubaoArtifactText(
  meta: DoubaoArtifactMeta,
  headers: Record<string, string> = {},
  webTabId = ""
): Promise<string> {
  const response = await fetch(buildDoubaoArtifactUrl(meta, webTabId), {
    method: "GET",
    credentials: "include",
    headers: sanitizeDoubaoHeaders(headers)
  });
  if (!response.ok) return "";

  const raw = await response.text();
  const parsed = safeParseJson(raw);
  const extracted = parsed ? extractDoubaoArtifactText(parsed) : "";
  return extracted || (raw.length < 50000 ? raw.trim() : "");
}

function buildDoubaoArtifactUrl(meta: DoubaoArtifactMeta, webTabId = ""): string {
  const url = new URL("/samantha/code/get_artifact", getDoubaoOrigin());
  addDoubaoQueryDefaults(url);
  const resolvedWebTabId = getDoubaoWebTabId(webTabId);
  if (resolvedWebTabId) url.searchParams.set("web_tab_id", resolvedWebTabId);
  url.searchParams.set("code_id", meta.codeId);
  if (meta.version) url.searchParams.set("version", meta.version);
  return url.toString();
}

function getDoubaoOrigin(): string {
  return typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://www.doubao.com";
}

function getDoubaoWebTabId(preferred = ""): string {
  const resolved = getFirstNonEmpty(
    preferred,
    getDoubaoWebTabIdFromUrl(typeof window !== "undefined" ? window.location.href : ""),
    getDoubaoStoredWebTabId()
  ) || createDoubaoSequenceId();
  return rememberDoubaoWebTabId(resolved) || resolved;
}

function getDoubaoWebTabIdFromUrl(rawUrl: string): string {
  try {
    return String(new URL(rawUrl, getDoubaoOrigin()).searchParams.get("web_tab_id") || "").trim();
  } catch {
    return "";
  }
}

function rememberDoubaoWebTabId(id: string): string {
  const value = String(id || "").trim();
  if (!value) return "";
  try {
    sessionStorage.setItem("ai-nodes-doubao-web-tab-id", value);
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
  return value;
}

function getDoubaoStoredWebTabId(): string {
  try {
    return String(sessionStorage.getItem("ai-nodes-doubao-web-tab-id") || "").trim();
  } catch {
    return "";
  }
}

function extractDoubaoArtifactText(value: unknown): string {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (label: string, text: unknown, language = "") => {
    const body = String(text || "").trim();
    if (!body) return;
    const key = `${label}::${body.slice(0, 240)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const fenced = buildCodeFence(language, body);
    out.push(label ? `【${label}】${fenced}` : fenced || body);
  };

  const walk = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    const fileName = String(obj.name || obj.file_name || obj.filename || obj.path || "").trim();
    const language = String(obj.language || obj.lang || "").trim();
    [obj.content, obj.code, obj.source, obj.text, obj.artifact_content, obj.raw_content, obj.value].forEach((candidate) => {
      if (typeof candidate !== "string" || !candidate.trim()) return;
      const hasLineBreak = candidate.includes("\n");
      const hasCodeHint = /function|class|import|export|const|let|var|<\/?[a-z][\s>]/i.test(candidate);
      if (hasLineBreak || hasCodeHint || fileName) push(fileName, candidate, language);
    });

    if (Array.isArray(obj.files)) {
      obj.files.forEach((file) => {
        if (!file || typeof file !== "object") return;
        const fileObj = file as Record<string, unknown>;
        const name = String(fileObj.name || fileObj.file_name || fileObj.filename || fileObj.path || "").trim();
        const lang = String(fileObj.language || fileObj.lang || "").trim();
        const content = typeof fileObj.content === "string"
          ? fileObj.content
          : (typeof fileObj.code === "string" ? fileObj.code : (typeof fileObj.text === "string" ? fileObj.text : ""));
        if (content && name) push(name, content, lang);
      });
    }

    Object.values(obj).forEach((nested) => {
      if (nested && typeof nested === "object") walk(nested);
    });
  };

  const root = value && typeof value === "object" && "data" in value
    ? (value as Record<string, unknown>).data
    : value;
  walk(root);
  return out.join("\n").trim();
}

function buildCodeFence(language: string, code: string): string {
  const body = String(code || "").trim();
  if (!body) return "";
  return `\n\n\`\`\`${String(language || "").trim()}\n${body}\n\`\`\``;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractDoubaoConversationSummaries(payload: any): ConversationSummary[] {
  const direct = payload?.downlink_body?.pull_recent_conv_chain_downlink_body
    || payload?.downlink_body?.pull_recent_conv_downlink_body;
  const items = [
    ...(Array.isArray(direct?.conversation_list) ? direct.conversation_list : []),
    ...(Array.isArray(direct?.conversations) ? direct.conversations : []),
    ...(Array.isArray(payload?.data?.conversation_list) ? payload.data.conversation_list : []),
    ...(Array.isArray(payload?.data?.conversations) ? payload.data.conversations : [])
  ];
  const summaries: ConversationSummary[] = [];
  const seen = new Set<string>();

  const pushConversation = (item: any) => {
    if (!item || typeof item !== "object") return;
    const conversationId = String(item?.conversation_id || item?.conv_id || item?.id || item?.chat_id || "").trim();
    if (!conversationId || seen.has(conversationId)) return;
    const timestamps = resolveDoubaoConversationTimestamps(item);
    const updated = normalizeBatchTimestamp(timestamps.updatedAt || timestamps.createdAt || undefined);
    const created = normalizeBatchTimestamp(timestamps.createdAt || undefined);
    const summary: ConversationSummary = {
      platformId: "doubao",
      conversationId,
      title: resolveDoubaoConversationTitle(item, conversationId),
      updatedAt: updated.value,
      updatedAtText: updated.text,
      messageCount: normalizeDoubaoCount(resolveDoubaoConversationBadgeCount(item))
    };
    if (created.value) summary.createdAt = created.value;
    if (created.text) summary.createdAtText = created.text;
    seen.add(conversationId);
    doubaoSummaryRawPayloads.set(summary, item);
    summaries.push(summary);
  };

  items.forEach(pushConversation);

  if (!summaries.length) {
    const queue = [payload];
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) {
        current.forEach((item) => queue.push(item));
        continue;
      }
      pushConversation(current);
      Object.values(current).forEach((value) => {
        if (value && typeof value === "object") queue.push(value);
      });
    }
  }

  return summaries.sort((a, b) => Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0)));
}

function normalizeDoubaoCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}

function resolveDoubaoConversationTitle(item: any, id: string): string {
  const preferredPaths = [
    "name",
    "title",
    "conversation_title",
    "conv_title",
    "chat_title",
    "conversation.name",
    "conversation.title",
    "conversation_info.name",
    "conversation_info.title",
    "conv.name",
    "conv.title",
    "coco_conversation.name",
    "coco_conversation.title",
    "chain_info.name",
    "chain_info.title",
    "meta.name",
    "meta.title"
  ];

  for (const path of preferredPaths) {
    const value = getDoubaoStringByPath(item, path);
    if (value && !/^[0-9]{8,}$/.test(value)) return value;
  }

  return findDoubaoNestedConversationTitle(item, 5) || `会话 ${id}`;
}

function resolveDoubaoConversationBadgeCount(item: any): unknown {
  const preferredPaths = [
    "badge_count",
    "message_count",
    "msg_count",
    "messageCount",
    "conversation.badge_count",
    "conversation.message_count",
    "conversation_info.badge_count",
    "conversation_info.message_count",
    "conv.badge_count",
    "coco_conversation.badge_count",
    "chain_info.badge_count"
  ];

  for (const path of preferredPaths) {
    const value = getDoubaoNumberByPath(item, path);
    if (Number.isFinite(value)) return value;
  }

  return findDoubaoNestedNumber(item, ["badge_count", "message_count", "msg_count", "messageCount"], 5);
}

function resolveDoubaoConversationTimestamps(item: any): { createdAt: unknown; updatedAt: unknown } {
  const createPaths = [
    "create_time",
    "created_at",
    "create_timestamp",
    "conversation.create_time",
    "conversation.created_at",
    "conversation_info.create_time",
    "conversation_info.created_at",
    "conv.create_time",
    "conv.created_at",
    "coco_conversation.create_time",
    "coco_conversation.created_at",
    "chain_info.create_time",
    "chain_info.created_at"
  ];
  const updatePaths = [
    "update_time",
    "updated_at",
    "update_timestamp",
    "modified_time",
    "conversation.update_time",
    "conversation.updated_at",
    "conversation_info.update_time",
    "conversation_info.updated_at",
    "conv.update_time",
    "conv.updated_at",
    "coco_conversation.update_time",
    "coco_conversation.updated_at",
    "chain_info.update_time",
    "chain_info.updated_at"
  ];

  const createdAt = getFirstFiniteDoubaoPath(item, createPaths)
    ?? findDoubaoNestedNumber(item, ["create_time", "created_at", "create_timestamp"], 6);
  const updatedAt = getFirstFiniteDoubaoPath(item, updatePaths)
    ?? findDoubaoNestedNumber(item, ["update_time", "updated_at", "update_timestamp"], 6);
  return { createdAt, updatedAt };
}

function getFirstFiniteDoubaoPath(item: any, paths: string[]): number | null {
  for (const path of paths) {
    const value = getDoubaoNumberByPath(item, path);
    if (Number.isFinite(value) && Number(value) > 0) return Number(value);
  }
  return null;
}

function getDoubaoStringByPath(item: any, path: string): string {
  const value = getDoubaoValueByPath(item, path);
  return typeof value === "string" ? value.trim() : "";
}

function getDoubaoNumberByPath(item: any, path: string): number | null {
  const value = getDoubaoValueByPath(item, path);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getDoubaoValueByPath(item: any, path: string): unknown {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = item;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function findDoubaoNestedConversationTitle(item: any, maxDepth: number): string {
  if (!item || typeof item !== "object" || maxDepth < 0) return "";
  const keys = ["name", "title", "conversation_title", "conv_title", "chat_title", "display_title"];
  for (const key of keys) {
    const value = typeof item[key] === "string" ? item[key].trim() : "";
    if (value && !/^[0-9]{8,}$/.test(value)) return value;
  }
  if (maxDepth === 0) return "";
  for (const value of Object.values(item)) {
    if (!value || typeof value !== "object") continue;
    const nested = findDoubaoNestedConversationTitle(value, maxDepth - 1);
    if (nested) return nested;
  }
  return "";
}

function findDoubaoNestedNumber(item: any, keys: string[], maxDepth: number): number | null {
  if (!item || typeof item !== "object" || maxDepth < 0) return null;
  for (const key of keys) {
    const numeric = Number(item[key]);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  if (maxDepth === 0) return null;
  for (const value of Object.values(item)) {
    if (!value || typeof value !== "object") continue;
    const nested = findDoubaoNestedNumber(value, keys, maxDepth - 1);
    if (Number.isFinite(nested) && Number(nested) > 0) return nested;
  }
  return null;
}
