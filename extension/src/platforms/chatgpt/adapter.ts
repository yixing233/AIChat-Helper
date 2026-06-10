import type { BatchListOptions, CapturedNetworkEvent, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { jumpToVirtualizedNode } from "../shared/node-jump";
import { normalizeBatchTimestamp } from "../shared/timestamp";
import { extractChatGPTSnapshotFromConversation } from "./mapping";

const CHATGPT_BATCH_PAGE_LIMIT = 100;
const chatgptBatchSummaryContext = new Map<string, ConversationSummary>();

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
    return scanTextNodes(root, [
      "[data-message-author-role=\"user\"]",
      "[data-testid=\"conversation-turn-user\"]",
      "article[data-testid^=\"conversation-turn-\"] [data-message-author-role=\"user\"]",
      "[data-message-author-role]",
      "[data-message-id]",
      "article"
    ], "chatgpt", { roles: ["user"] });
  },
  jumpToNode(node, context) {
    return jumpToVirtualizedNode(node, context, {
      rowSelectors: [
        "[data-message-author-role=\"user\"]",
        "[data-testid=\"conversation-turn-user\"]",
        "article[data-testid^=\"conversation-turn-\"]",
        "[data-message-id]",
        "article"
      ],
      scrollContainerSelectors: [
        "[data-testid=\"conversation-turn-list\"]",
        "[data-testid=\"message-list\"]",
        "main"
      ],
      maxSearchAttempts: 160,
      waitAfterScrollMs: 90,
      alignRatio: 0,
      acceptRow: isChatGPTUserRow,
      getCandidateElement: getChatGPTUserElement,
      getCandidateId: getChatGPTRowId,
      getCandidateText: (_row, element) => getElementText(element),
      normalizeId: normalizeChatGPTNodeId,
      normalizeText: normalizeChatGPTText
    });
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
    const summaries = await fetchChatGPTConversationList(options);
    summaries.forEach((summary) => {
      chatgptBatchSummaryContext.set(getChatGPTSummaryKey(summary), summary);
      chatgptBatchSummaryContext.set(summary.conversationId, summary);
    });
    return summaries;
  },
  async fetchConversationDetail(id, summary, capturedEvents) {
    const capturedContext = getChatGPTCapturedRequestContext(capturedEvents);
    const token = capturedContext.accessToken || await getChatGPTAccessToken();
    const context = summary || chatgptBatchSummaryContext.get(id);
    const response = await chatGPTPageFetch(`/backend-api/conversation/${encodeURIComponent(id)}`, {
      headers: buildChatGPTApiHeaders(token, context?.workspaceId || "", capturedContext.deviceId)
    });
    if (!response.ok) {
      throw new Error(`ChatGPT conversation detail request failed (${response.status})`);
    }
    return extractChatGPTSnapshotFromConversation(await response.json());
  }
};

function isChatGPTUserRow(row: HTMLElement): boolean {
  if (row.getAttribute("data-message-author-role") === "user") return true;
  if (row.getAttribute("data-message-author-role") === "assistant") return false;

  const testId = String(row.getAttribute("data-testid") || "").toLowerCase();
  if (testId === "conversation-turn-user") return true;
  if (testId === "conversation-turn-assistant") return false;

  const directUser = row.querySelector<HTMLElement>("[data-message-author-role=\"user\"]");
  if (directUser) return true;
  if (row.querySelector("[data-message-author-role=\"assistant\"]")) return false;

  const className = String(row.getAttribute("class") || "").toLowerCase();
  if (/(^|[-_\s])(user|human)([-_\s]|$)/.test(className)) return true;
  if (/(^|[-_\s])(assistant|bot)([-_\s]|$)/.test(className)) return false;

  return false;
}

function getChatGPTUserElement(row: HTMLElement): HTMLElement | null {
  return row.matches("[data-message-author-role=\"user\"]")
    ? row
    : row.querySelector<HTMLElement>("[data-message-author-role=\"user\"]")
      || row.querySelector<HTMLElement>("[data-testid=\"conversation-turn-user\"]")
      || row;
}

function getChatGPTRowId(row: HTMLElement): string {
  return row.getAttribute("data-message-id")
    || row.querySelector<HTMLElement>("[data-message-id]")?.getAttribute("data-message-id")
    || row.id
    || "";
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

function normalizeChatGPTNodeId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeChatGPTText(value: string): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchChatGPTConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const capturedContext = getChatGPTCapturedRequestContext(options.capturedEvents);
  const token = capturedContext.accessToken || await getChatGPTAccessToken();
  const requested = Math.max(1, Math.min(Number(options.limit || 100), 500));
  const merged: ConversationSummary[] = [];
  const seen = new Set<string>();
  const appendItems = (items: ConversationSummary[]) => {
    items.forEach((item) => {
      const key = getChatGPTSummaryKey(item);
      if (!item.conversationId || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });
  };

  appendItems(await fetchChatGPTRootConversations("", token, false, requested, capturedContext.deviceId));
  if (merged.length < requested) {
    appendItems(await fetchChatGPTRootConversations("", token, true, requested - merged.length, capturedContext.deviceId));
  }

  const workspaceIds = detectChatGPTWorkspaceIds(capturedContext.workspaceIds);
  for (const workspaceId of workspaceIds) {
    if (merged.length >= requested) break;

    try {
      appendItems(await fetchChatGPTRootConversations(workspaceId, token, false, requested - merged.length, capturedContext.deviceId));
      if (merged.length < requested) {
        appendItems(await fetchChatGPTRootConversations(workspaceId, token, true, requested - merged.length, capturedContext.deviceId));
      }
    } catch (error) {
      console.warn("[AI Chat Helper] ChatGPT workspace conversations request failed", workspaceId, error);
    }

    if (merged.length >= requested) break;

    try {
      const projects = await fetchChatGPTProjects(workspaceId, token, capturedContext.deviceId);
      for (const project of projects) {
        if (merged.length >= requested) break;
        appendItems(await fetchChatGPTProjectConversations(workspaceId, token, project, requested - merged.length, capturedContext.deviceId));
      }
    } catch (error) {
      console.warn("[AI Chat Helper] ChatGPT project conversations request failed", workspaceId, error);
    }
  }

  return merged
    .sort((a, b) => getChatGPTSortTime(b.updatedAt) - getChatGPTSortTime(a.updatedAt))
    .slice(0, requested);
}

function chatGPTPageFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    credentials: "include",
    ...options
  });
}

async function getChatGPTAccessToken(): Promise<string> {
  const response = await chatGPTPageFetch("/api/auth/session?unstable_client=true");
  if (!response.ok) {
    throw new Error("ChatGPT access token request failed");
  }
  const session = await response.json();
  const token = String(session?.accessToken || "").trim();
  if (!token) throw new Error("ChatGPT access token is not available");
  return token;
}

interface ChatGPTCapturedRequestContext {
  accessToken: string;
  workspaceIds: string[];
  deviceId: string;
}

function getChatGPTCapturedRequestContext(events: CapturedNetworkEvent[] | undefined): ChatGPTCapturedRequestContext {
  const workspaceIds: string[] = [];
  const seenWorkspaces = new Set<string>();
  let accessToken = "";
  let deviceId = "";

  [...(events || [])].reverse().forEach((event) => {
    const headers = normalizeCapturedHeaders(event.requestHeaders);
    Object.entries(headers).forEach(([key, value]) => {
      if (!value) return;
      if (key === "authorization" && !accessToken && /^bearer\s+/i.test(value)) {
        accessToken = value.replace(/^bearer\s+/i, "").trim();
        return;
      }
      if (key === "chatgpt-account-id") {
        if (seenWorkspaces.has(value)) return;
        seenWorkspaces.add(value);
        workspaceIds.push(value);
        return;
      }
      if (key === "oai-device-id" && !deviceId) {
        deviceId = value;
      }
    });
  });

  return { accessToken, workspaceIds, deviceId };
}

function normalizeCapturedHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim().toLowerCase();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) return;
    out[normalizedKey] = normalizedValue;
  });
  return out;
}

function buildChatGPTApiHeaders(token: string, workspaceId = "", deviceId = ""): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };
  const resolvedDeviceId = deviceId || getChatGPTDeviceId();
  if (resolvedDeviceId) headers["oai-device-id"] = resolvedDeviceId;
  if (workspaceId) headers["ChatGPT-Account-Id"] = workspaceId;
  return headers;
}

function getChatGPTDeviceId(): string {
  const cookieValue = getCookieValue("oai-did");
  if (cookieValue) return cookieValue;

  const keys = ["oai-did", "oai-device-id", "oaiDeviceId"];
  for (const key of keys) {
    const localValue = getStorageValue(localStorage, key);
    if (localValue) return localValue;
    const sessionValue = getStorageValue(sessionStorage, key);
    if (sessionValue) return sessionValue;
  }

  return "";
}

function getCookieValue(name: string): string {
  try {
    const pattern = new RegExp(`(?:^|;\\s*)${escapeRegExp(name)}=([^;]+)`, "i");
    const match = String(document.cookie || "").match(pattern);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function getStorageValue(storage: Storage, key: string): string {
  try {
    return String(storage.getItem(key) || "").replace(/^"|"$/g, "");
  } catch {
    return "";
  }
}

function detectChatGPTWorkspaceIds(capturedWorkspaceIds: string[] = []): string[] {
  const found = new Set<string>(capturedWorkspaceIds.map((value) => String(value || "").trim()).filter(Boolean));

  try {
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl?.textContent) {
      const nextData = JSON.parse(nextDataEl.textContent);
      const accounts = nextData?.props?.pageProps?.user?.accounts;
      if (accounts && typeof accounts === "object") {
        Object.values(accounts).forEach((account: any) => {
          const accountId = String(account?.account?.id || "").trim();
          if (accountId) found.add(accountId);
        });
      }
    }
  } catch {
    // Best-effort workspace discovery.
  }

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !/account|workspace/i.test(key)) continue;
      const value = localStorage.getItem(key);
      const matched = String(value || "").match(/\bws-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i);
      if (matched?.[0]) found.add(matched[0]);
    }
  } catch {
    // Storage can be unavailable in restricted contexts.
  }

  return Array.from(found);
}

async function fetchChatGPTRootConversations(
  workspaceId: string,
  token: string,
  archived: boolean,
  limit: number,
  deviceId = "",
  maxPages = 10
): Promise<ConversationSummary[]> {
  const out: ConversationSummary[] = [];
  let offset = 0;
  let page = 0;
  let hasMore = true;

  while (hasMore && out.length < limit && page < maxPages) {
    const response = await chatGPTPageFetch(
      `/backend-api/conversations?offset=${offset}&limit=${CHATGPT_BATCH_PAGE_LIMIT}&order=updated${archived ? "&is_archived=true" : ""}`,
      { headers: buildChatGPTApiHeaders(token, workspaceId, deviceId) }
    );
    if (!response.ok) {
      throw new Error(`ChatGPT conversation list request failed (${response.status})`);
    }

    const payload = await response.json();
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    out.push(...extractChatGPTConversationListItems(rawItems, { workspaceId, archived, offset }));
    hasMore = rawItems.length === CHATGPT_BATCH_PAGE_LIMIT;
    offset += rawItems.length;
    page += 1;
  }

  return out.slice(0, limit);
}

interface ChatGPTProjectSummary {
  id: string;
  title: string;
}

async function fetchChatGPTProjects(workspaceId: string, token: string, deviceId = ""): Promise<ChatGPTProjectSummary[]> {
  if (!workspaceId) return [];
  const response = await chatGPTPageFetch("/backend-api/gizmos/snorlax/sidebar", {
    headers: buildChatGPTApiHeaders(token, workspaceId, deviceId)
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return (Array.isArray(payload?.items) ? payload.items : [])
    .map((item: any) => ({
      id: String(item?.gizmo?.id || "").trim(),
      title: String(item?.gizmo?.display?.name || item?.gizmo?.display_name || "").trim()
    }))
    .filter((item: ChatGPTProjectSummary) => item.id);
}

async function fetchChatGPTProjectConversations(
  workspaceId: string,
  token: string,
  project: ChatGPTProjectSummary,
  limit: number,
  deviceId = ""
): Promise<ConversationSummary[]> {
  if (!workspaceId || !project.id || limit <= 0) return [];
  const out: ConversationSummary[] = [];
  let cursor = "0";
  let guard = 0;

  while (cursor && out.length < limit && guard < 20) {
    const response = await chatGPTPageFetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${encodeURIComponent(cursor)}`, {
      headers: buildChatGPTApiHeaders(token, workspaceId, deviceId)
    });
    if (!response.ok) {
      throw new Error(`ChatGPT project conversation request failed (${response.status})`);
    }

    const payload = await response.json();
    out.push(...extractChatGPTConversationListItems(payload?.items, {
      workspaceId,
      projectId: project.id,
      projectTitle: project.title
    }));

    const nextCursor = String(payload?.cursor || "").trim();
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
    guard += 1;
  }

  return out.slice(0, limit);
}

function extractChatGPTConversationListItems(
  rawItems: unknown,
  extra: {
    workspaceId?: string;
    projectId?: string;
    projectTitle?: string;
    archived?: boolean;
    offset?: number;
  } = {}
): ConversationSummary[] {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const workspaceId = String(extra.workspaceId || "").trim();
  const workspaceLabel = workspaceId ? "团队空间" : "个人空间";
  const projectId = String(extra.projectId || "").trim();
  const projectTitle = String(extra.projectTitle || "").trim();
  const archived = Boolean(extra.archived);
  const offset = Number(extra.offset || 0) || 0;

  return items.map<ConversationSummary | null>((item: any, index: number) => {
    const conversationId = String(item?.id || item?.conversation_id || item?.conversationId || "").trim();
    if (!conversationId) return null;
    const updated = normalizeBatchTimestamp(item?.update_time ?? item?.updated_time ?? item?.updated_at ?? item?.create_time ?? item?.created_at);
    const created = normalizeBatchTimestamp(item?.create_time ?? item?.created_at ?? item?.inserted_at ?? item?.update_time);
    const title = String(item?.title || item?.name || item?.conversation_title || "").trim() || `会话 ${offset + index + 1}`;
    const messageCount = normalizeChatGPTMessageCount(item);
    const batchKey = `${workspaceId || "personal"}::${projectId || "root"}::${conversationId}`;
    return {
      platformId: "chatgpt",
      conversationId,
      title,
      updatedAt: updated.value,
      updatedAtText: updated.text,
      createdAt: created.value,
      createdAtText: created.text,
      messageCount,
      workspaceId,
      workspaceLabel,
      projectId,
      projectTitle,
      archived,
      batchKey
    };
  }).filter((item): item is ConversationSummary => item !== null);
}

function normalizeChatGPTMessageCount(item: any): number | undefined {
  const count = Number(item?.message_count ?? item?.badge_count ?? item?.messageCount ?? item?.num_messages);
  if (Number.isFinite(count)) return count;
  if (item?.mapping && typeof item.mapping === "object") return Object.keys(item.mapping).length;
  return undefined;
}

function getChatGPTSummaryKey(summary: ConversationSummary): string {
  return summary.batchKey || `${summary.workspaceId || "personal"}::${summary.projectId || "root"}::${summary.conversationId}`;
}

function getChatGPTSortTime(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numberValue = Number(text);
    if (Number.isFinite(numberValue)) return text.split(".")[0].length <= 10 ? numberValue * 1000 : numberValue;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
