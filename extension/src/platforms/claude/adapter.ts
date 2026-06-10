import type { BatchListOptions, CapturedNetworkEvent, ConversationSnapshot, ConversationSummary, ExportAttachment, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import {
  findNodeByIdText,
  getActiveScrollContainer,
  getOrderedNodes,
  getViewportMetrics,
  isScrollNearBottom,
  queryElements
} from "../shared/node-active";
import { jumpToVirtualizedNode } from "../shared/node-jump";
import { normalizeBatchTimestamp } from "../shared/timestamp";
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
    return scanTextNodes(root, [
      "[data-user-message-bubble=\"true\"]",
      "[data-testid=\"user-message\"]",
      "[data-testid*=\"user\"]",
      "[data-testid*=\"message\"]",
      "[data-message-id]",
      "article"
    ], "claude", { roles: ["user"] });
  },
  jumpToNode(node, context) {
    return jumpToVirtualizedNode(node, context, {
      rowSelectors: [
        "[data-user-message-bubble=\"true\"]",
        "[data-testid=\"user-message\"]",
        "[data-testid*=\"user\"]",
        "[data-message-id]",
        "article",
        "section"
      ],
      maxSearchAttempts: 32,
      waitAfterScrollMs: 100,
      alignRatio: 0,
      acceptRow: isClaudeHumanMessageBlock,
      getCandidateElement: (row) => row,
      getCandidateId: getClaudeBlockId,
      getCandidateText: (row) => extractClaudeUserText(row),
      normalizeText: normalizeClaudeText
    });
  },
  getActiveNode(context) {
    if (!context.nodes.length) return null;
    const blocks = getClaudeHumanMessageBlocks(context.root || document);
    if (!blocks.length) return null;

    const orderedNodes = getOrderedNodes(context.nodes);
    const usedBlocks = new Set<HTMLElement>();
    const entries = orderedNodes
      .map((node) => {
        const block = findClaudeBlockForNode(node, blocks, usedBlocks);
        if (block) usedBlocks.add(block);
        return block ? { node, block } : null;
      })
      .filter((entry): entry is { node: typeof orderedNodes[number]; block: HTMLElement } => Boolean(entry));
    if (!entries.length) return null;

    const scrollContainer = getActiveScrollContainer(context, entries.map((entry) => entry.block), [
      "#main-content",
      "main"
    ]);
    if (isScrollNearBottom(scrollContainer, 40)) return entries[entries.length - 1]?.node || null;

    const metrics = getViewportMetrics(context, scrollContainer);
    let bestEntry: { node: typeof orderedNodes[number]; block: HTMLElement } | null = null;
    for (const entry of entries) {
      const rect = entry.block.getBoundingClientRect();
      if (rect.top <= metrics.readingAnchor) bestEntry = entry;
      else break;
    }

    return bestEntry?.node || entries[0]?.node || null;
  },
  getScrollContainer(root = document) {
    const blocks = getClaudeHumanMessageBlocks(root);
    return getActiveScrollContainer({ nodes: [], readingLineOffset: 150, root }, blocks, [
      "#main-content",
      "main"
    ]);
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?#]+/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Claude conversation response is available");
    }
    const snapshot = extractClaudeSnapshotFromConversation(JSON.parse(event.responseText));
    hydrateCapturedHtmlAttachments(snapshot, events);
    return snapshot;
  },
  async fetchConversationList(options) {
    return fetchClaudeConversationList(options);
  },
  async fetchConversationDetail(id, _summary, capturedEvents) {
    const orgId = getClaudeOrgId(capturedEvents);
    const url = `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(id)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`;
    const response = await fetch(url, buildClaudeGetInit(getClaudeCapturedHeaders(capturedEvents)));
    if (!response.ok) {
      throw new Error(`Claude conversation detail request failed (${response.status})`);
    }
    const snapshot = extractClaudeSnapshotFromConversation(await response.json());
    await hydrateRemoteHtmlAttachments(snapshot);
    return snapshot;
  }
};

function getClaudeHumanMessageBlocks(root: ParentNode): HTMLElement[] {
  const blocks = queryElements(root, [
    "[data-user-message-bubble=\"true\"]",
    "[data-testid=\"user-message\"]",
    "[data-testid*=\"user\"]",
    "[data-message-id]",
    "article",
    "section"
  ].join(","));
  const seen = new Set<HTMLElement>();
  return blocks.filter((block) => {
    if (seen.has(block)) return false;
    seen.add(block);
    return isClaudeHumanMessageBlock(block);
  });
}

function findClaudeBlockForNode(
  node: Parameters<NonNullable<PlatformAdapter["getActiveNode"]>>[0]["nodes"][number],
  blocks: HTMLElement[],
  usedBlocks: Set<HTMLElement>
): HTMLElement | null {
  let bestBlock: HTMLElement | null = null;
  let bestScore = -Infinity;
  blocks.forEach((block) => {
    if (usedBlocks.has(block)) return;
    const matched = findNodeByIdText([node], getClaudeBlockId(block), extractClaudeUserText(block), {
      normalizeText: normalizeClaudeText,
      minTextScore: 8
    });
    if (!matched) return;
    const idMatches = getClaudeBlockId(block)
      && [node.id, node.sourceMessageId].some((id) => String(id || "").trim() === getClaudeBlockId(block));
    const score = idMatches ? 100 : 10;
    if (score > bestScore) {
      bestScore = score;
      bestBlock = block;
    }
  });
  return bestBlock;
}

function isClaudeHumanMessageBlock(row: HTMLElement): boolean {
  const testId = String(row.getAttribute("data-testid") || "").toLowerCase();
  if (row.getAttribute("data-user-message-bubble") === "true") return true;
  if (testId.includes("user") || testId.includes("human")) return true;
  const text = normalizeClaudeText(getElementText(row));
  return Boolean(text && /(^|\s)you said:?/i.test(getElementText(row)));
}

function getClaudeBlockId(row: HTMLElement): string {
  return String(
    row.getAttribute("data-message-id")
      || row.getAttribute("data-message-uuid")
      || row.getAttribute("data-node-id")
      || row.id
      || ""
  ).trim();
}

function extractClaudeUserText(row: HTMLElement): string {
  const direct = row.querySelector<HTMLElement>("[data-user-message-bubble=\"true\"], [data-testid=\"user-message\"]");
  const source = direct || row;
  return normalizeClaudeText(getElementText(source));
}

function normalizeClaudeText(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^you said:?\s*/i, "")
    .trim();
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

async function hydrateRemoteHtmlAttachments(snapshot: ConversationSnapshot): Promise<void> {
  const cache = new Map<string, string>();
  const attachments = snapshot.messages
    .flatMap((message) => message.attachments || [])
    .concat(snapshot.attachments || [])
    .filter((attachment) => isRemoteHtmlAttachment(attachment));

  for (const attachment of attachments) {
    const url = String(attachment.url || "").trim();
    if (!url || attachment.content) continue;
    if (cache.has(url)) {
      attachment.content = cache.get(url);
      continue;
    }

    const content = await fetchRemoteHtmlAttachment(url, attachment.fileName);
    if (!content) continue;
    cache.set(url, content);
    attachment.content = content;
  }
}

function hydrateCapturedHtmlAttachments(snapshot: ConversationSnapshot, events: CapturedNetworkEvent[]): void {
  const htmlEvents = [...events]
    .filter((event) => event.kind === "blob-url" && isCapturedHtmlEvent(event))
    .reverse();
  if (!htmlEvents.length) return;

  const attachments = snapshot.messages
    .flatMap((message) => message.attachments || [])
    .concat(snapshot.attachments || [])
    .filter((attachment) => isRemoteHtmlAttachment(attachment) || isNamedHtmlAttachment(attachment));

  attachments.forEach((attachment) => {
    if (attachment.content) return;
    const match = htmlEvents.find((event) => capturedHtmlEventMatchesAttachment(event, attachment));
    const content = String(match?.responseText || "").trim();
    if (content) attachment.content = content;
  });
}

function isCapturedHtmlEvent(event: CapturedNetworkEvent): boolean {
  const mimeType = String(event.mimeType || "").toLowerCase();
  const fileName = String(event.fileName || "").trim();
  return Boolean(String(event.responseText || "").trim())
    && (mimeType.includes("html") || /\.html?$/i.test(fileName));
}

function capturedHtmlEventMatchesAttachment(event: CapturedNetworkEvent, attachment: ExportAttachment): boolean {
  const eventUrl = String(event.url || "").trim();
  const attachmentUrl = String(attachment.url || "").trim();
  if (eventUrl && attachmentUrl && eventUrl === attachmentUrl) return true;

  const eventName = normalizeHtmlFileName(event.fileName || event.url || "");
  const attachmentName = normalizeHtmlFileName(attachment.fileName || attachment.url || "");
  return Boolean(eventName && attachmentName && (eventName === attachmentName || eventName.includes(attachmentName) || attachmentName.includes(eventName)));
}

function normalizeHtmlFileName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/g, "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.html?$/i, "")
    .replace(/[\s._-]+/g, "");
}

function isRemoteHtmlAttachment(attachment: ExportAttachment): boolean {
  if (!attachment.url || attachment.content) return false;
  return isNamedHtmlAttachment(attachment);
}

function isNamedHtmlAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return mimeType.includes("html") || /\.html?$/i.test(attachment.fileName || "");
}

async function fetchRemoteHtmlAttachment(url: string, fileName: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) return "";
    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    const text = await response.text();
    if (!contentType.includes("html") && !/<(?:!doctype\s+html|html|body|section|div|article|main|h[1-6]|p)\b/i.test(text) && !/\.html?$/i.test(fileName)) {
      return "";
    }
    return text.trim();
  } catch {
    return "";
  }
}

async function fetchClaudeConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const orgId = getClaudeOrgId(options.capturedEvents);
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 500));
  const headers = getClaudeCapturedHeaders(options.capturedEvents);
  const seen = new Set<string>();
  const out: ConversationSummary[] = [];

  for (const starred of [false, true]) {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations_v2?limit=${limit}&starred=${String(starred)}&consistency=eventual`,
      buildClaudeGetInit(headers)
    );
    if (!response.ok) continue;

    const payload = await response.json();
    const items = Array.isArray(payload?.data) ? payload.data : [];
    items.forEach((item: any) => {
      const conversationId = String(item.uuid || item.id || "").trim();
      if (!conversationId || seen.has(conversationId)) return;
      seen.add(conversationId);
      const updated = normalizeBatchTimestamp(item.updated_at || item.updatedAt || item.created_at);
      const created = normalizeBatchTimestamp(item.created_at || item.createdAt);
      out.push({
        platformId: "claude",
        conversationId,
        title: String(item.name || item.title || "Claude Conversation"),
        updatedAt: updated.value,
        updatedAtText: updated.text,
        createdAt: created.value,
        createdAtText: created.text,
        messageCount: Number.isFinite(Number(item.chat_messages_count ?? item.message_count))
          ? Number(item.chat_messages_count ?? item.message_count)
          : undefined
      });
    });
  }

  if (!out.length) {
    throw new Error("Claude conversation list request failed");
  }

  return out
    .sort((a, b) => getClaudeSortTime(b.updatedAt) - getClaudeSortTime(a.updatedAt))
    .slice(0, limit);
}

function buildClaudeGetInit(headers: Record<string, string>): RequestInit {
  return {
    method: "GET",
    credentials: "include",
    headers
  };
}

function getClaudeCapturedHeaders(events: CapturedNetworkEvent[] | undefined): Record<string, string> {
  const event = [...(events || [])]
    .reverse()
    .find((item) => isClaudeConversationEvent(item) || isClaudeConversationListEvent(item));
  return sanitizeClaudeHeaders(event?.requestHeaders || {});
}

function sanitizeClaudeHeaders(inputHeaders: Record<string, string>): Record<string, string> {
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

  return out;
}

function isClaudeConversationEvent(event: CapturedNetworkEvent): boolean {
  return /\/api\/organizations\/[0-9a-f-]+\/chat_conversations\/[^/?#]+/i.test(event.url || "");
}

function isClaudeConversationListEvent(event: CapturedNetworkEvent): boolean {
  return /\/api\/organizations\/[0-9a-f-]+\/chat_conversations_v2/i.test(event.url || "");
}

function getClaudeSortTime(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getClaudeOrgId(events?: CapturedNetworkEvent[]): string {
  const match = String(document.cookie || "").match(/(?:^|;\s*)lastActiveOrg=([0-9a-f-]{36})(?:;|$)/i);
  const orgId = String(match?.[1] || "").trim() || getClaudeOrgIdFromCapturedEvents(events);
  if (!orgId) {
    throw new Error("Claude lastActiveOrg cookie is not available");
  }
  return orgId;
}

function getClaudeOrgIdFromCapturedEvents(events: CapturedNetworkEvent[] | undefined): string {
  for (const event of [...(events || [])].reverse()) {
    const match = String(event.url || "").match(/\/api\/organizations\/([0-9a-f-]{36})\/chat_conversations(?:_v2|\/)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}
