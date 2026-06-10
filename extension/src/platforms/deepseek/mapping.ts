import type { ConversationMessage, ConversationSnapshot } from "../../shared/types";
import { normalizeBatchTimestamp } from "../shared/timestamp";

interface DeepSeekHistoryPayload {
  data?: {
    biz_data?: {
      chat_session?: {
        id?: string;
        title?: string;
        pinned?: boolean;
        inserted_at?: string | number;
        updated_at?: string | number;
      };
      chat_messages?: DeepSeekRawMessage[];
    };
  };
}

interface DeepSeekRawMessage {
  message_id?: string;
  role?: string;
  sender_role?: string;
  author_role?: string;
  message_type?: string;
  from_user?: boolean;
  is_user?: boolean;
  from_bot?: boolean;
  is_assistant?: boolean;
  thinking_enabled?: boolean;
  search_enabled?: boolean;
  status?: string;
  fragments?: DeepSeekFragment[];
  text?: string;
  content?: string;
  message?: string;
}

interface DeepSeekFragment {
  id?: string;
  type?: string;
  content_type?: string;
  content?: string;
  results?: Array<{
    cite_index?: number;
    title?: string;
    url?: string;
    snippet?: string;
  }>;
}

interface DeepSeekParsedMessage extends ConversationMessage {
  sourceMessageId: string;
  status?: string;
  fragmentType: string;
  isThought: boolean;
  isSearch: boolean;
}

export function extractDeepSeekSnapshotFromHistory(payload: unknown): ConversationSnapshot {
  const history = payload as DeepSeekHistoryPayload;
  const bizData = history.data?.biz_data;
  const session = bizData?.chat_session;
  const rawMessages = Array.isArray(bizData?.chat_messages) ? bizData.chat_messages : [];
  const messages = aggregateDeepSeekMessages(parseDeepSeekMessages(rawMessages));
  const createdAtText = formatDeepSeekTimestampText(session?.inserted_at);
  const updatedAtText = formatDeepSeekTimestampText(session?.updated_at);

  return {
    platformId: "deepseek",
    conversationId: String(session?.id || "current"),
    title: String(session?.title || "DeepSeek Conversation"),
    attachments: [],
    messages,
    createdAt: stringifyDeepSeekValue(session?.inserted_at) || undefined,
    updatedAt: stringifyDeepSeekValue(session?.updated_at) || undefined,
    metadata: {
      deepseek: {
        sessionId: String(session?.id || ""),
        title: String(session?.title || ""),
        pinned: Boolean(session?.pinned),
        createdAt: createdAtText,
        updatedAt: updatedAtText,
        thinkingEnabled: rawMessages.some((message) => Boolean(message.thinking_enabled)),
        searchEnabled: rawMessages.some((message) => Boolean(message.search_enabled))
      }
    }
  };
}

function parseDeepSeekMessages(rawMessages: DeepSeekRawMessage[]): DeepSeekParsedMessage[] {
  const out: DeepSeekParsedMessage[] = [];

  rawMessages.forEach((message, index) => {
    const msgId = String(message.message_id || index + 1);
    const status = String(message.status || "");
    const baseRole = guessDeepSeekRole(message);
    const fragments = Array.isArray(message.fragments) ? message.fragments : [];
    const citationMap = buildCitationMap(fragments);

    const pushFragment = (text: string, fragmentType: string, role: ConversationMessage["role"], isThought = false, isSearch = false, fragmentId = "") => {
      const clean = text.trim();
      if (!clean) return;
      out.push({
        id: fragmentId ? `${msgId}-${fragmentType}-${fragmentId}` : `${msgId}-${fragmentType}`,
        sourceMessageId: msgId,
        role,
        text: clean,
        status,
        fragmentType,
        isThought,
        isSearch
      });
    };

    if (fragments.length) {
      orderFragments(fragments, baseRole).forEach((fragment, fragmentIndex) => {
        const fragmentType = String(fragment.type || fragment.content_type || "").toUpperCase() || "UNKNOWN";
        const fragmentId = String(fragment.id || fragmentIndex + 1);

        if (fragmentType === "REQUEST") {
          pushFragment(String(fragment.content || ""), fragmentType, "user", false, false, fragmentId);
          return;
        }

        if (fragmentType === "RESPONSE") {
          pushFragment(adaptCitationText(String(fragment.content || ""), citationMap), fragmentType, "assistant", false, false, fragmentId);
          return;
        }

        if (fragmentType === "THINK") {
          pushFragment(adaptCitationText(String(fragment.content || ""), citationMap), fragmentType, "assistant", true, false, fragmentId);
          return;
        }

        if (fragmentType === "SEARCH") {
          return;
        }

        if (isIgnoredDeepSeekFragmentType(fragmentType)) {
          return;
        }

        const fallbackText = uniqueJoined(collectDeepSeekText(fragment));
        pushFragment(fallbackText, fragmentType, baseRole, false, false, fragmentId);
      });
      return;
    }

    const text = uniqueJoined(collectDeepSeekText(message));
    pushFragment(text, "MESSAGE", baseRole);
  });

  return out;
}

function aggregateDeepSeekMessages(messages: DeepSeekParsedMessage[]): ConversationMessage[] {
  const groups = new Map<string, {
    sourceMessageId: string;
    role: ConversationMessage["role"];
    status?: string;
    userParts: string[];
    thoughtParts: string[];
    responseParts: string[];
    fallbackParts: string[];
  }>();

  for (const message of messages) {
    const key = `${message.sourceMessageId}:${message.role}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceMessageId: message.sourceMessageId,
        role: message.role,
        status: message.status,
        userParts: [],
        thoughtParts: [],
        responseParts: [],
        fallbackParts: []
      };
      groups.set(key, group);
    }

    if (message.role === "user") group.userParts.push(message.text);
    else if (message.isThought || message.fragmentType === "THINK") group.thoughtParts.push(message.text);
    else if (message.fragmentType === "RESPONSE" || message.fragmentType === "MESSAGE") group.responseParts.push(message.text);
    else if (!isIgnoredDeepSeekFragmentType(message.fragmentType)) group.fallbackParts.push(message.text);
  }

  const out: ConversationMessage[] = [];
  Array.from(groups.values()).forEach((group, index) => {
    if (group.role === "user") {
      const text = uniqueJoined(group.userParts);
      if (text) {
        out.push({
          id: `deepseek-export-${group.sourceMessageId || index + 1}`,
          sourceMessageId: group.sourceMessageId,
          role: "user",
          text,
          status: group.status,
          fragmentType: "REQUEST",
          isThought: false,
          isSearch: false,
          hasThought: false,
          textWithoutThought: text
        });
      }
      return;
    }

    const thoughtText = uniqueJoined(group.thoughtParts);
    const responseText = uniqueJoined(group.responseParts);
    const fallbackText = uniqueJoined(group.fallbackParts);
    if (thoughtText) {
      out.push({
        id: `deepseek-export-${group.sourceMessageId || index + 1}-think`,
        sourceMessageId: group.sourceMessageId,
        role: "assistant",
        text: thoughtText,
        fullText: thoughtText,
        status: group.status,
        fragmentType: "THINK",
        isThought: true,
        isSearch: false,
        hasThought: true,
        textWithoutThought: ""
      });
    }
    const finalText = responseText || fallbackText;
    if (finalText) {
      out.push({
        id: `deepseek-export-${group.sourceMessageId || index + 1}-response`,
        sourceMessageId: group.sourceMessageId,
        role: "assistant",
        text: finalText,
        fullText: finalText,
        status: group.status,
        fragmentType: responseText ? "RESPONSE" : "MESSAGE",
        isThought: false,
        isSearch: false,
        hasThought: Boolean(thoughtText),
        textWithoutThought: finalText
      });
    }
  });

  return out;
}

function orderFragments(fragments: DeepSeekFragment[], role: ConversationMessage["role"]): DeepSeekFragment[] {
  const rank = (fragment: DeepSeekFragment) => {
    const type = String(fragment.type || fragment.content_type || "").toUpperCase();
    if (role === "assistant") {
      if (type === "THINK") return 10;
      if (type === "RESPONSE") return 20;
      if (type === "SEARCH") return 30;
      if (type === "REQUEST") return 90;
      return 80;
    }
    if (type === "REQUEST") return 10;
    return 80;
  };
  return fragments.map((fragment, index) => ({ fragment, index }))
    .sort((a, b) => rank(a.fragment) - rank(b.fragment) || a.index - b.index)
    .map(({ fragment }) => fragment);
}

function isIgnoredDeepSeekFragmentType(fragmentType: string): boolean {
  const type = String(fragmentType || "").toUpperCase();
  return type === "TIP"
    || type.startsWith("TOOL_")
    || type.includes("TOOL")
    || type.includes("PLUGIN")
    || type.includes("FUNCTION")
    || type.includes("STATUS")
    || type.includes("FINISHED")
    || type.includes("OPEN");
}

function collectDeepSeekText(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node) return;
    if (typeof node === "string") {
      const text = node.trim();
      if (text) out.push(text);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    ["text", "content", "message", "msg", "answer", "question", "value", "display_text"].forEach((key) => {
      if (typeof obj[key] === "string") {
        const text = obj[key].trim();
        if (text) out.push(text);
      }
    });
    Object.entries(obj).forEach(([key, nested]) => {
      if (/^(id|type|content_type|message_id|fragment_id|role|sender_role|author_role|message_type|status|inserted_at|updated_at|created_at)$/i.test(key)) return;
      walk(nested);
    });
  };

  walk(value);
  return out;
}

function guessDeepSeekRole(message: DeepSeekRawMessage): ConversationMessage["role"] {
  const raw = String(message.role || message.sender_role || message.author_role || message.message_type || "").toUpperCase();
  if (raw === "USER") return "user";
  if (raw === "ASSISTANT") return "assistant";
  const low = raw.toLowerCase();
  if (low.includes("user") || low.includes("human") || low.includes("question")) return "user";
  if (message.from_user === true || message.is_user === true) return "user";
  return "assistant";
}

function buildCitationMap(fragments: DeepSeekFragment[]): Map<number, { title: string; url: string }> {
  const map = new Map<number, { title: string; url: string }>();
  fragments.forEach((fragment) => {
    const type = String(fragment.type || fragment.content_type || "").toUpperCase();
    if (type !== "SEARCH") return;
    fragment.results?.forEach((result, index) => {
      const key = Number(result.cite_index ?? index + 1);
      if (!Number.isFinite(key) || key <= 0 || map.has(key)) return;
      map.set(key, {
        title: String(result.title || "").trim(),
        url: String(result.url || "").trim()
      });
    });
  });
  return map;
}

function adaptCitationText(text: string, citationMap: Map<number, { title: string; url: string }>): string {
  const used = new Set<number>();
  const replaced = text.replace(/\[citation\s*:\s*(\d+)\]/gi, (_, value: string) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) used.add(n);
    return `[参考#${value}]`;
  }).trim();
  if (!used.size) return replaced;

  const lines = ["【引用来源】"];
  Array.from(used).sort((a, b) => a - b).forEach((n) => {
    const ref = citationMap.get(n);
    lines.push(`[参考#${n}] ${ref?.title || "未命名来源"}`);
    if (ref?.url) lines.push(`链接: ${ref.url}`);
  });
  return `${replaced}\n\n${lines.join("\n")}`;
}

function uniqueJoined(parts: string[]): string {
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join("\n\n").trim();
}

function stringifyDeepSeekValue(value: string | number | undefined): string {
  return value == null ? "" : String(value);
}

function formatDeepSeekTimestampText(value: string | number | undefined): string {
  const normalized = normalizeBatchTimestamp(value);
  if (normalized.text) return normalized.text;
  const raw = value == null ? "" : String(value).trim();
  return raw;
}
