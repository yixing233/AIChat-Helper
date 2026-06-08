import type { ConversationMessage, ConversationSnapshot } from "../../shared/types";

interface DoubaoSingleChainPayload {
  downlink_body?: {
    pull_singe_chain_downlink_body?: {
      messages?: DoubaoRawMessage[];
    };
  };
}

interface DoubaoRawMessage {
  message_id?: string;
  msg_id?: string;
  user_type?: number;
  content_block?: unknown[];
  content?: unknown;
  tts_content?: string;
  index_in_conv?: number;
  create_time?: number;
}

interface DoubaoBuiltMessage {
  role: ConversationMessage["role"];
  text: string;
  indexInConv: number;
  createTime: number;
  sourceMessageId: string;
}

export function extractDoubaoSnapshotFromSingleChain(payload: unknown, conversationId = "current"): ConversationSnapshot {
  const messages = parseDoubaoSingleChainMessages(payload);

  return {
    platformId: "doubao",
    conversationId,
    title: "Doubao Conversation",
    attachments: [],
    messages
  };
}

export function extractDoubaoConversationIdFromRequestBody(requestBody?: string): string {
  const parsed = safeParseJson(requestBody || "");
  const pull = parsed?.uplink_body?.pull_singe_chain_uplink_body;
  return String(pull?.conversation_id || pull?.conv_id || pull?.chat_id || "").trim();
}

function parseDoubaoSingleChainMessages(payload: unknown): ConversationMessage[] {
  const rawMessages = findDoubaoMessages(payload);
  const built: DoubaoBuiltMessage[] = [];

  rawMessages.forEach((message) => {
    const role: ConversationMessage["role"] = Number(message.user_type) === 1 ? "user" : "assistant";
    const blockText = Array.isArray(message.content_block) ? extractDoubaoTextFromBlocks(message.content_block) : "";
    const contentText = parseDoubaoContentPayload(message.content);
    const ttsText = typeof message.tts_content === "string" ? message.tts_content.trim() : "";
    const candidates = role === "user" ? [ttsText, blockText, contentText] : [blockText, contentText, ttsText];
    const text = uniqueTextParts(candidates).join(role === "user" ? "\n" : "\n\n").trim();

    if (!text) return;
    built.push({
      role,
      text,
      indexInConv: Number(message.index_in_conv || 0),
      createTime: Number(message.create_time || 0),
      sourceMessageId: String(message.message_id || message.msg_id || "").trim()
    });
  });

  return built
    .sort((a, b) => a.indexInConv - b.indexInConv || a.createTime - b.createTime)
    .map((message, index) => ({
      id: `doubao-export-${message.sourceMessageId || index + 1}`,
      role: message.role,
      text: message.text,
      createdAt: message.createTime ? new Date(message.createTime * 1000).toISOString() : undefined
    }));
}

function findDoubaoMessages(payload: unknown): DoubaoRawMessage[] {
  const direct = (payload as DoubaoSingleChainPayload)?.downlink_body?.pull_singe_chain_downlink_body?.messages;
  if (Array.isArray(direct)) return direct;

  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const messages = (current as { messages?: unknown }).messages;
    if (Array.isArray(messages)) return messages as DoubaoRawMessage[];
    Object.values(current).forEach((value) => {
      if (value && typeof value === "object") queue.push(value);
    });
  }
  return [];
}

function extractDoubaoTextFromBlocks(blocks: unknown[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  const pushText = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const parsed = parseDoubaoContentPayload(raw);
    const text = parsed && parsed !== raw ? parsed : raw;
    text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      if (shouldIgnoreDoubaoText(line) || seen.has(line)) return;
      seen.add(line);
      lines.push(line);
    });
  };

  const walk = (node: unknown): void => {
    if (!node) return;
    if (typeof node === "string") {
      pushText(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    const content = (obj.content && typeof obj.content === "object") ? obj.content as Record<string, unknown> : obj;
    const textBlock = content.text_block as { text?: unknown } | undefined;
    const referenceBlock = content.reference_block as { text?: { text?: unknown } } | undefined;
    if (typeof textBlock?.text === "string") pushText(textBlock.text);
    if (typeof referenceBlock?.text?.text === "string") pushText(referenceBlock.text.text);
    if (typeof obj.text === "string") pushText(obj.text);
    if (typeof obj.content === "string") pushText(obj.content);

    Object.values(obj).forEach(walk);
  };

  walk(blocks);
  return lines.join("\n").trim();
}

function parseDoubaoContentPayload(value: unknown, depth = 0): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (depth > 3) return raw;

  const parsed = safeParseJson(raw);
  if (parsed == null) return raw;
  if (typeof parsed === "string") return parseDoubaoContentPayload(parsed, depth + 1) || parsed.trim();
  if (Array.isArray(parsed)) return extractDoubaoTextFromBlocks(parsed);
  if (typeof parsed !== "object") return raw;

  const obj = parsed as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof obj.text === "string" && obj.text.trim()) lines.push(obj.text.trim());
  if (!lines.length && typeof obj.content === "string") {
    const contentText = parseDoubaoContentPayload(obj.content, depth + 1);
    if (contentText) lines.push(contentText);
  }

  const entities = Array.isArray(obj.entities) ? obj.entities : [];
  const fileNames: string[] = [];
  entities.forEach((entity, index) => {
    if (!entity || typeof entity !== "object") return;
    const entityObj = entity as Record<string, unknown>;
    const content = entityObj.entity_content as Record<string, unknown> | undefined;
    const file = (content?.file || entityObj.file) as Record<string, unknown> | undefined;
    const fileName = String(file?.file_name || file?.name || "").trim();
    if (fileName) {
      fileNames.push(fileName);
      return;
    }
    const image = (content?.image || entityObj.image) as Record<string, unknown> | undefined;
    const key = String(image?.key || "").trim();
    const serial = entities.length > 1 ? String(index + 1) : "";
    if (key) lines.push(`[Image${serial}] ${key}`);
  });
  fileNames.forEach((name, index) => {
    const serial = fileNames.length > 1 ? ` ${index + 1}` : "";
    lines.push(`[Attachment${serial}] ${name}`);
  });

  return lines.join("\n").trim();
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function uniqueTextParts(candidates: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  candidates.forEach((candidate) => {
    const text = String(candidate || "").trim();
    const key = text.replace(/\s+/g, " ");
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function shouldIgnoreDoubaoText(text: string): boolean {
  return /^[0-9]{14,}$/.test(text)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    || /^tos-cn-i-[a-z0-9-]+\//i.test(text)
    || /^R[A-Za-z0-9]{20,}$/i.test(text);
}
