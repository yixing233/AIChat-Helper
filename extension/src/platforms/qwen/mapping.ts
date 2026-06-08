import type { ConversationMessage, ConversationSnapshot } from "../../shared/types";

interface QwenMessageListPayload {
  data?: {
    list?: QwenConversationItem[];
  };
}

interface QwenConversationItem {
  req_id?: string;
  request_id?: string;
  session_id?: string;
  sessionId?: string;
  conversation_id?: string;
  request_messages?: unknown[];
  response_messages?: Array<{
    mime_type?: string;
    content?: string;
  }>;
  query?: unknown;
  question?: unknown;
  prompt?: unknown;
  input?: unknown;
  user_message?: unknown;
  user_msg?: unknown;
  request?: unknown;
  messages?: unknown[];
}

export function extractQwenSnapshotFromMessageList(payload: unknown): ConversationSnapshot {
  const resp = payload as QwenMessageListPayload;
  const list = Array.isArray(resp.data?.list) ? resp.data.list : [];
  const messages = parseQwenMessages(list);
  const first = list[0];

  return {
    platformId: "qwen",
    conversationId: String(first?.session_id || first?.sessionId || first?.conversation_id || "current"),
    title: "Tongyi Qianwen Conversation",
    attachments: [],
    messages
  };
}

function parseQwenMessages(list: QwenConversationItem[]): ConversationMessage[] {
  const out: Array<ConversationMessage & { order: number }> = [];

  list.forEach((item, index) => {
    const baseOrder = (index + 1) * 10;
    const reqId = String(item.req_id || item.request_id || `qwen-req-${index + 1}`);
    const userText = unique(extractQwenUserTexts(item)).join("\n").trim();
    if (userText) {
      out.push({ id: reqId, role: "user", text: userText, order: baseOrder + 1 });
    }

    extractQwenAssistantTexts(item).forEach((text, assistantIndex) => {
      out.push({ id: `${reqId}-a-${assistantIndex + 1}`, role: "assistant", text, order: baseOrder + 2 + assistantIndex });
    });
  });

  return out.sort((a, b) => a.order - b.order).map(({ order: _order, ...message }) => message);
}

function extractQwenUserTexts(item: QwenConversationItem): string[] {
  const out: string[] = [];
  const requestMessages = Array.isArray(item.request_messages) ? item.request_messages : [];

  requestMessages.forEach((message) => {
    extractQwenAttachmentTexts(message).forEach((line) => out.push(line));
    const bucket: string[] = [];
    collectQwenTextCandidates(message, bucket);
    bucket.forEach((text) => out.push(text));
  });

  const fallbackBucket: string[] = [];
  collectQwenTextCandidates({
    query: item.query,
    question: item.question,
    prompt: item.prompt,
    input: item.input,
    user_message: item.user_message,
    user_msg: item.user_msg,
    request: item.request
  }, fallbackBucket);
  fallbackBucket.forEach((text) => out.push(text));

  const mixedMessages = Array.isArray(item.messages) ? item.messages : [];
  mixedMessages.forEach((message) => {
    if (!isLikelyUserRole(getQwenRole(message))) return;
    const bucket: string[] = [];
    collectQwenTextCandidates(message, bucket);
    bucket.forEach((text) => out.push(text));
  });

  return unique(out.map(normalizeQwenMessageText).filter(Boolean));
}

function extractQwenAssistantTexts(item: QwenConversationItem): string[] {
  const responseMessages = Array.isArray(item.response_messages) ? item.response_messages : [];
  return unique(responseMessages
    .filter((message) => !shouldIgnoreQwenMimeType(message.mime_type))
    .map((message) => normalizeQwenMessageText(message.content || ""))
    .filter(Boolean));
}

function collectQwenTextCandidates(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 4) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = normalizeQwenMessageText(String(value));
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectQwenTextCandidates(item, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  ["content", "text", "value", "display_text", "prompt", "question", "query", "input", "message", "msg", "user_message", "user_msg", "request", "caption", "desc", "description"]
    .forEach((key) => collectQwenTextCandidates(obj[key], out, depth + 1));
  ["parts", "segments", "blocks", "messages"].forEach((key) => {
    if (Array.isArray(obj[key])) collectQwenTextCandidates(obj[key], out, depth + 1);
  });
}

function extractQwenAttachmentTexts(value: unknown): string[] {
  const names: string[] = [];
  collectQwenAttachmentNames(value, names);
  return unique(names).map((name, index, arr) => `[Attachment${arr.length > 1 ? ` ${index + 1}` : ""}] ${name}`);
}

function collectQwenAttachmentNames(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectQwenAttachmentNames(item, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const directName = String(obj.file_name || obj.filename || obj.name || "").trim();
  if (directName) out.push(normalizeQwenMessageText(directName));
  const resourceInfos = Array.isArray(obj.resource_infos) ? obj.resource_infos : [];
  resourceInfos.forEach((item) => collectQwenAttachmentNames(item, out, depth + 1));
}

function normalizeQwenMessageText(text: string): string {
  return String(text || "").trim().replace(/^\[\([^)]+\)\]\s*/g, "").trim();
}

function shouldIgnoreQwenMimeType(mimeType?: string): boolean {
  const value = String(mimeType || "").toLowerCase();
  return value === "signal/post" || value === "bar/progress" || value === "bar/iframe" || value === "image/url" || value === "image_inline" || value === "ref_source_inline";
}

function getQwenRole(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  return String(obj.role || obj.sender_role || obj.author_role || obj.type || "");
}

function isLikelyUserRole(rawRole: string): boolean {
  const role = rawRole.toLowerCase();
  return role.includes("user") || role.includes("human") || role.includes("question") || role === "u";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
