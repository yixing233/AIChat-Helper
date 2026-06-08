import type { BatchListOptions, ConversationSummary, PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractDoubaoConversationIdFromRequestBody, extractDoubaoSnapshotFromSingleChain } from "./mapping";

export const doubaoAdapter: PlatformAdapter = {
  id: "doubao",
  name: "Doubao",
  matches(url) {
    return url.hostname === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "doubao");
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
    return extractDoubaoSnapshotFromSingleChain(JSON.parse(event.responseText), conversationId);
  },
  async fetchConversationList(options) {
    return fetchDoubaoConversationList(options);
  },
  async fetchConversationDetail(id) {
    const response = await fetch("/im/chain/single", {
      method: "POST",
      credentials: "include",
      headers: doubaoJsonHeaders(),
      body: JSON.stringify(buildDoubaoSingleChainBody(id))
    });
    if (!response.ok) {
      throw new Error(`Doubao single-chain request failed (${response.status})`);
    }
    return extractDoubaoSnapshotFromSingleChain(await response.json(), id);
  }
};

async function fetchDoubaoConversationList(options: BatchListOptions): Promise<ConversationSummary[]> {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
  const response = await fetch("/im/chain/recent_conv", {
    method: "POST",
    credentials: "include",
    headers: doubaoJsonHeaders(),
    body: JSON.stringify(buildDoubaoRecentConvBody(limit))
  });
  if (!response.ok) {
    throw new Error(`Doubao recent conversation request failed (${response.status})`);
  }

  const payload = await response.json();
  return extractDoubaoConversationSummaries(payload);
}

function doubaoJsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json; encoding=utf-8",
    "agw-js-conv": "str",
    accept: "application/json, text/plain, */*"
  };
}

function buildDoubaoRecentConvBody(limit: number): object {
  return {
    cmd: 3200,
    uplink_body: {
      pull_recent_conv_chain_uplink_body: {
        limit,
        message_count_per_conv: 10,
        api_version: 1,
        conv_version: 0,
        direction: 3,
        option: {
          not_need_message: true,
          need_complete_conversation: true,
          need_coco_conversation: true,
          need_coco_bot: true,
          need_pc_pin_chain: true,
          pc_pin_query_type: 0
        }
      }
    },
    channel: 2,
    version: "1"
  };
}

function buildDoubaoSingleChainBody(conversationId: string): object {
  return {
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

  return items.map((item: any, index: number) => ({
    platformId: "doubao",
    conversationId: String(item?.conversation_id || item?.conv_id || item?.id || item?.chat_id || `doubao-${index + 1}`),
    title: String(item?.title || item?.name || item?.conversation_title || item?.summary || "Doubao Conversation"),
    updatedAt: normalizeDoubaoTimestamp(item?.updated_at ?? item?.update_time ?? item?.modified_time ?? item?.created_at ?? item?.create_time),
    messageCount: normalizeDoubaoCount(item?.message_count ?? item?.msg_count ?? item?.badge_count ?? item?.messageCount)
  }));
}

function normalizeDoubaoTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  const text = String(value || "").trim();
  return text || undefined;
}

function normalizeDoubaoCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) ? count : undefined;
}
