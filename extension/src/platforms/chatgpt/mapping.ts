import type { ConversationMessage, ConversationSnapshot, ExportAttachment } from "../../shared/types";

interface ChatGPTMappingNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: ChatGPTMessage;
}

interface ChatGPTMessage {
  id?: string;
  author?: { role?: string; name?: string };
  content?: unknown;
  channel?: string;
  recipient?: string;
  end_turn?: boolean;
  create_time?: number;
  metadata?: {
    is_visually_hidden_from_conversation?: boolean;
    is_contextual_answers_system_message?: boolean;
    can_save?: boolean;
    is_complete?: boolean;
    command?: string;
    message_type?: string;
    ui_card?: unknown;
    image_gen_async?: unknown;
    content_references?: Array<{
      start_idx?: number;
      end_idx?: number;
      matched_text?: string;
      render_as?: string;
      alt?: string;
      type?: string;
      name?: string;
      title?: string;
      id?: string;
      metadata?: {
        type?: string;
        name?: string;
        title?: string;
        id?: string;
      };
    }>;
    serialization_metadata?: {
      content_references?: Array<{
        matched_text?: string;
        render_as?: string;
        alt?: string;
      }>;
    };
    citations?: Array<{
      start_ix?: number;
      end_ix?: number;
      metadata?: {
        type?: string;
        name?: string;
        title?: string;
        id?: string;
      };
    }>;
    attachments?: Array<{
      id?: string;
      name?: string;
      filename?: string;
      file_name?: string;
      mime_type?: string;
      mimeType?: string;
      url?: string;
      download_url?: string;
      downloadUrl?: string;
    }>;
    image_gen_title?: string;
  };
}

type ChatGPTMetadataAttachment = NonNullable<NonNullable<ChatGPTMessage["metadata"]>["attachments"]>[number];

interface ChatGPTConversationPayload {
  id?: string;
  conversation_id?: string;
  title?: string;
  current_node?: string;
  mapping?: Record<string, ChatGPTMappingNode>;
  create_time?: number;
  update_time?: number;
}

export function extractChatGPTSnapshotFromConversation(payload: unknown): ConversationSnapshot {
  const conversation = payload as ChatGPTConversationPayload;
  const mapping = conversation.mapping || {};
  const messages = extractMessagesFromMapping(mapping, conversation.current_node);

  return {
    platformId: "chatgpt",
    conversationId: String(conversation.id || conversation.conversation_id || "current"),
    title: String(conversation.title || "ChatGPT Conversation"),
    attachments: [],
    messages,
    createdAt: conversation.create_time ? new Date(conversation.create_time * 1000).toISOString() : undefined,
    updatedAt: conversation.update_time ? new Date(conversation.update_time * 1000).toISOString() : undefined
  };
}

function extractMessagesFromMapping(mapping: Record<string, ChatGPTMappingNode>, currentNodeId?: string): ConversationMessage[] {
  const orderedNodes = currentNodeId && mapping[currentNodeId]
    ? collectActivePath(mapping, currentNodeId)
    : collectDepthFirstPath(mapping);

  return orderedNodes
    .map((node) => nodeToMessage(node))
    .filter((message): message is ConversationMessage => Boolean(message));
}

function collectActivePath(mapping: Record<string, ChatGPTMappingNode>, currentNodeId: string): ChatGPTMappingNode[] {
  const path: ChatGPTMappingNode[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = currentNodeId;

  while (cursor && mapping[cursor] && !visited.has(cursor)) {
    visited.add(cursor);
    path.unshift(mapping[cursor]);
    cursor = mapping[cursor].parent || undefined;
  }

  return path;
}

function collectDepthFirstPath(mapping: Record<string, ChatGPTMappingNode>): ChatGPTMappingNode[] {
  const keys = Object.keys(mapping);
  const rootId = mapping["client-created-root"] ? "client-created-root" : keys.find((id) => !mapping[id]?.parent) || keys[0];
  const visited = new Set<string>();
  const out: ChatGPTMappingNode[] = [];

  function walk(nodeId?: string): void {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = mapping[nodeId];
    if (!node) return;
    out.push(node);
    node.children?.forEach(walk);
  }

  walk(rootId);
  return out;
}

function nodeToMessage(node: ChatGPTMappingNode): ConversationMessage | null {
  const msg = node.message;
  if (!msg) return null;
  if (!isExportableChatGPTMessage(msg)) return null;
  const role = normalizeRole(msg.author?.role);
  if (!role) return null;
  const id = String(msg.id || node.id || `${role}-${Math.random().toString(36).slice(2)}`);
  const attachments = extractMessageAttachments(msg, id, role);
  const attachmentText = msg.author?.role === "user" ? extractAttachmentText(msg) : "";
  const extractedText = [extractMessageText(msg), attachmentText].filter(Boolean).join("\n\n").trim();
  const text = extractedText || (attachments.length ? "" : formatChatGPTImageTitleText(msg));
  if (!text && !attachments.length) return null;

  const message: ConversationMessage = {
    id,
    sourceMessageId: id,
    role,
    text,
    createdAt: msg.create_time ? String(msg.create_time) : undefined
  };
  if (attachments.length) message.attachments = attachments;
  return message;
}

function normalizeRole(role?: string): ConversationMessage["role"] | null {
  if (role === "user" || role === "assistant") return role;
  if (role === "tool") return "assistant";
  return null;
}

function isExportableChatGPTMessage(msg: ChatGPTMessage): boolean {
  const author = String(msg.author?.role || "").trim();
  if (author !== "user" && author !== "assistant" && author !== "tool") return false;

  const metadata = msg.metadata || {};
  if (metadata.is_visually_hidden_from_conversation || metadata.is_contextual_answers_system_message) return false;

  const content = msg.content && typeof msg.content === "object"
    ? msg.content as Record<string, unknown>
    : {};
  const contentType = String(content.content_type || content.type || "").trim().toLowerCase();
  if (contentType && contentType !== "text" && contentType !== "multimodal_text") return false;

  if (author === "tool") {
    if (!isExportableChatGPTToolMessage(msg, content)) return false;
  }

  if (author === "assistant") {
    const channel = String(msg.channel || "").trim().toLowerCase();
    if (channel && channel !== "final") return false;
    if (channel === "final" && msg.end_turn === false) return false;
    if (!channel && msg.end_turn === false) return false;
    if (!channel && metadata.can_save === false) return false;
  }

  return true;
}

function isExportableChatGPTToolMessage(msg: ChatGPTMessage, content: Record<string, unknown>): boolean {
  const toolName = String(msg.author?.name || "").trim().toLowerCase();
  if (toolName === "file_search") return false;

  const metadata = msg.metadata || {};
  if (metadata.ui_card || metadata.image_gen_async) return false;
  if (String(metadata.command || "").trim()) return false;

  return hasChatGPTImageEvidence(msg, content);
}

function hasChatGPTImageEvidence(msg: ChatGPTMessage, content: Record<string, unknown>): boolean {
  if (String(msg.metadata?.image_gen_title || "").trim()) return true;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts.some((part) => {
    if (!part || typeof part !== "object") return false;
    const partObj = part as Record<string, unknown>;
    const partType = String(partObj.content_type || partObj.type || "").trim().toLowerCase();
    return partType === "image_asset_pointer" || partType === "image";
  });
}

function extractMessageText(msg: ChatGPTMessage): string {
  const raw = extractContentText(msg.content);
  return cleanChatGPTText(applyChatGPTMessageReferences(raw, msg));
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") return cleanChatGPTText(content);
  if (!content || typeof content !== "object") return "";

  const value = content as Record<string, unknown>;
  if (Array.isArray(value.parts)) return partsToText(value.parts);
  if (typeof value.text === "string") return cleanChatGPTText(value.text);
  if (Array.isArray(value.items)) return partsToText(value.items);
  if (Array.isArray(value.output)) return partsToText(value.output);
  if (Array.isArray(value.result)) return partsToText(value.result);
  if (Array.isArray(value.content)) return partsToText(value.content);
  return partToText(value);
}

function partsToText(parts: unknown[]): string {
  return cleanChatGPTText(parts.map(partToText).filter(Boolean).join("\n"));
}

function partToText(part: unknown): string {
  if (typeof part === "string") return cleanChatGPTText(part);
  if (Array.isArray(part)) return partsToText(part);
  if (part == null) return "";
  if (typeof part !== "object") return String(part);
  const value = part as Record<string, unknown>;
  const partType = String(value.content_type || value.type || "").trim().toLowerCase();
  if (shouldIgnoreChatGPTPart(partType, value)) return "";

  if (partType === "image" || partType === "image_asset_pointer") return "";

  const rawText = typeof value.text === "string"
    ? value.text
    : (typeof value.content === "string" ? value.content : "");
  const language = String(value.language || value.lang || "").trim();
  if ((partType === "code" || partType === "program" || language) && rawText) {
    return `\`\`\`${language}\n${rawText}\n\`\`\``;
  }
  const nested = extractNestedPartText(value);
  if (rawText && nested) return cleanChatGPTText(`${rawText}\n${nested}`);
  if (rawText) return cleanChatGPTText(rawText);
  return nested;
}

function formatChatGPTImageTitleText(msg: ChatGPTMessage): string {
  const title = String(msg.metadata?.image_gen_title || "").trim();
  return title ? `[图片] ${title}` : "";
}

function extractNestedPartText(part: Record<string, unknown>): string {
  return [
    part.parts,
    part.items,
    part.content,
    part.output,
    part.result,
    part.children,
    part.data
  ]
    .filter((candidate) => candidate && typeof candidate === "object")
    .map(partToText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function cleanChatGPTText(text: string): string {
  const cleaned = String(text || "")
    .replace(/\uE200cite(?:\uE202turn\d+(?:search|view)\d+)+\uE201/gi, "")
    .replace(/\uE200filecite(?:\uE202turn\d+file\d+)+\uE201/gi, "")
    .replace(/cite(?:turn\d+(?:search|view)\d+)+/gi, "")
    .replace(/filecite(?:turn\d+file\d+)+/gi, "")
    .replace(/\[引用\]/g, " ")
    .replace(/\[\s*文件引用\s*\]/g, "")
    .replace(/【引用来源】[\s\S]*$/g, "")
    .replace(/已思考几秒/g, "")
    .replace(/GPT-4o returned \d+ images?\.[\s\S]*?(?=$|\n{2,})/gi, "")
    .replace(/Do not summarize the image\.[\s\S]*?(?=$|\n{2,})/gi, "")
    .replace(/Do not give the user a link to download the image\.[\s\S]*?(?=$|\n{2,})/gi, "")
    .replace(/\r\n/g, "\n");

  const normalized = cleaned
    .split("\n")
    .filter((line) => !isChatGPTToolCallJsonLine(line))
    .map((line) => repairSplitMarkdownMarkers(line).trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return restoreChatGPTImplicitLists(normalized).trim();
}

function repairSplitMarkdownMarkers(line: string): string {
  let out = String(line || "");
  out = out.replace(/^(\s*)((?:#\s+){1,6})(?=\S)/, (_match, indent: string, markers: string) => {
    const level = Math.min((markers.match(/#/g) || []).length, 6);
    return `${indent}${"#".repeat(level)} `;
  });
  out = out.replace(/^\s*(?:-\s*){2,}\s*$/g, "---");
  return out;
}

function restoreChatGPTImplicitLists(text: string): string {
  const lines = String(text || "").split("\n");
  const out: string[] = [];
  const isMarkdownLine = (line: string) => /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|```|~~~|---+|\|)/.test(line);
  const listIntroPattern = /(?:分析|包括|包含|如下|参数|流程|步骤|指标|例如|分为|提取|判断|寻找|识别|输出|输入|类型|关系|结构|模块|功能|能力|字段|类别|清单)[：:]\s*$/;
  const isIntroLine = (line: string) => {
    const value = String(line || "").trim();
    return listIntroPattern.test(value) && !isMarkdownLine(value);
  };
  const isLikelyListItem = (line: string) => {
    const value = String(line || "").trim();
    if (!value || isMarkdownLine(value)) return false;
    if (isIntroLine(value)) return false;
    if (/^<\/?[\w-]+/i.test(value)) return false;
    if (/[。！？.!?；;]\s*$/.test(value)) return false;
    if (/^[（(]?\d+[）)]/.test(value)) return true;
    if (/^[\u4e00-\u9fa5A-Za-z0-9_ /+()（）-]+[：:]/.test(value)) return true;
    return value.length <= 28;
  };

  for (let index = 0; index < lines.length; index += 1) {
    out.push(lines[index]);
    if (!isIntroLine(lines[index])) continue;

    let cursor = index + 1;
    const pending: string[] = [];
    while (cursor < lines.length) {
      const raw = lines[cursor];
      const value = String(raw || "").trim();
      if (!value) break;
      if (!isLikelyListItem(raw)) break;
      pending.push(raw);
      cursor += 1;
    }

    if (pending.length >= 2) {
      pending.forEach((item) => {
        out.push(`- ${String(item || "").trim()}`);
      });
      index = cursor - 1;
    }
  }

  return out.join("\n");
}

function isChatGPTToolCallJsonLine(line: string): boolean {
  const text = String(line || "").trim();
  if (!text || text[0] !== "{" || text[text.length - 1] !== "}") return false;
  return /"(?:search_query|image_query|open|click|find|screenshot|finance|weather|sports|time|response_length)"\s*:/.test(text);
}

function applyChatGPTMessageReferences(text: string, msg: ChatGPTMessage): string {
  let output = applyChatGPTMathReferences(String(text || ""), msg);
  const refs = Array.isArray(msg.metadata?.content_references) ? msg.metadata.content_references : [];
  if (refs.length) {
    const exactItems = refs
      .filter((ref) => String(ref.render_as || "").trim().toLowerCase() !== "latex")
      .map((ref) => ({
        start: Number(ref.start_idx),
        end: Number(ref.end_idx),
        matchedText: String(ref.matched_text || ""),
        replacement: buildChatGPTReferenceReplacement(ref, ref.type === "file" ? "文件引用" : "引用")
      }))
      .filter((item) => item.matchedText || (Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start));

    if (exactItems.length) {
      exactItems.forEach((item) => {
        if (item.matchedText && output.includes(item.matchedText)) {
          output = output.split(item.matchedText).join(item.replacement);
        }
      });

      exactItems
        .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
        .sort((a, b) => b.start - a.start)
        .forEach((item) => {
          const segment = output.slice(item.start, item.end);
          if (segment === item.replacement) return;
          if (item.matchedText && segment && segment !== item.matchedText && !segment.includes("filecite") && !segment.includes("\uE200")) return;
          output = output.slice(0, item.start) + item.replacement + output.slice(item.end);
        });
      return output;
    }
  }

  const citations = Array.isArray(msg.metadata?.citations) ? msg.metadata.citations : [];
  if (citations.length) {
    const items = citations
      .map((citation) => ({
        start: Number(citation.start_ix),
        end: Number(citation.end_ix),
        replacement: buildChatGPTReferenceReplacement(
          citation.metadata || {},
          citation.metadata?.type === "file" ? "文件引用" : "引用"
        )
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => b.start - a.start);

    if (items.length) {
      items.forEach((item) => {
        output = output.slice(0, item.start) + item.replacement + output.slice(item.end);
      });
      return output;
    }
  }

  return output
    .replace(/\uE200filecite(?:\uE202turn\d+file\d+)+\uE201/gi, "[文件引用]")
    .replace(/\uE200cite(?:\uE202turn\d+(?:search|view)\d+)+\uE201/gi, "[引用]")
    .replace(/filecite(?:turn\d+file\d+)+/gi, "[文件引用]")
    .replace(/cite(?:turn\d+(?:search|view)\d+)+/gi, "[引用]");
}

function applyChatGPTMathReferences(text: string, msg: ChatGPTMessage): string {
  let output = String(text || "");
  const refs = Array.isArray(msg.metadata?.content_references)
    ? msg.metadata.content_references
    : (Array.isArray(msg.metadata?.serialization_metadata?.content_references)
      ? msg.metadata.serialization_metadata.content_references
      : []);

  refs.forEach((ref) => {
    if (!ref || String(ref.render_as || "").trim().toLowerCase() !== "latex") return;
    const matchedText = String(ref.matched_text || "").trim();
    const alt = normalizeChatGPTLatexReferenceText(ref);
    if (!matchedText || !alt) return;
    const replacement = `\n\n$$\n${alt}\n$$\n\n`;
    if (output.includes(matchedText)) output = output.split(matchedText).join(replacement);
  });

  return output;
}

function normalizeChatGPTLatexReferenceText(reference: unknown): string {
  if (!reference || typeof reference !== "object") return "";
  const ref = reference as Record<string, any>;
  return String(
    ref.alt
    || ref.text
    || ref.content
    || ref.latex
    || ref.metadata?.alt
    || ref.metadata?.text
    || ref.metadata?.content
    || ref.metadata?.latex
    || ""
  ).trim();
}

function buildChatGPTReferenceReplacement(reference: unknown, fallbackLabel: string): string {
  const ref = reference && typeof reference === "object" ? reference as Record<string, any> : {};
  const type = String(ref.type || ref.metadata?.type || "").toLowerCase();
  const name = normalizeChatGPTReferenceName(ref);
  if (type === "file" || name) return `[${fallbackLabel}: ${name || "未命名文件"}]`;
  return `[${fallbackLabel}]`;
}

function normalizeChatGPTReferenceName(reference: unknown): string {
  if (!reference || typeof reference !== "object") return "";
  const ref = reference as Record<string, any>;
  return String(
    ref.name
    || ref.metadata?.name
    || ref.metadata?.title
    || ref.title
    || ref.id
    || ""
  ).trim();
}

function shouldIgnoreChatGPTPart(partType: string, part: Record<string, unknown>): boolean {
  if (
    partType.includes("tool")
    || partType.includes("execution")
    || partType.includes("browser")
    || partType.includes("search")
    || partType.includes("citation")
    || partType.includes("metadata")
  ) {
    return true;
  }

  const recipient = String(part.recipient || "").trim();
  return /^(?:browser|python|web|search|image|finance|weather|sports|time)\b/i.test(recipient);
}

function extractAttachmentText(msg: ChatGPTMessage): string {
  const attachments = msg.metadata?.attachments || [];
  return attachments
    .map((item, index) => {
      const name = item.name || item.filename || item.file_name || `file-${index + 1}`;
      return `[附件${index + 1}: ${name}]`;
    })
    .join("\n");
}

function extractMessageAttachments(msg: ChatGPTMessage, messageId: string, role: ConversationMessage["role"]): ExportAttachment[] {
  const attachments: ExportAttachment[] = [];

  (msg.metadata?.attachments || []).forEach((item, index) => {
    if (role !== "user" && !isRawChatGPTImageAttachment(item)) return;
    const fileName = String(item.name || item.filename || item.file_name || `file-${index + 1}`).trim();
    const id = String(item.id || `${messageId}-attachment-${index + 1}`).trim();
    attachments.push({
      id,
      fileName,
      mimeType: String(item.mime_type || item.mimeType || "application/octet-stream"),
      url: String(item.url || item.download_url || item.downloadUrl || "").trim() || undefined
    });
  });

  collectImagePartAttachments(msg.content, messageId, attachments);
  return hydrateChatGPTImageAttachmentsFromDom(uniqueAttachments(attachments), messageId, role);
}

function isRawChatGPTImageAttachment(attachment: ChatGPTMetadataAttachment): boolean {
  const mimeType = String(attachment.mime_type || attachment.mimeType || "").trim();
  if (/^image\//i.test(mimeType)) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:$|[?#])/i.test(
    String(attachment.name || attachment.filename || attachment.file_name || attachment.url || attachment.download_url || attachment.downloadUrl || "")
  );
}

function collectImagePartAttachments(value: unknown, messageId: string, out: ExportAttachment[], depth = 0): void {
  if (value == null || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImagePartAttachments(item, messageId, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const attachment = imagePartToAttachment(obj, messageId, out.length + 1);
  if (attachment) out.push(attachment);

  ["parts", "items", "content", "output", "result", "children", "data"].forEach((key) => {
    collectImagePartAttachments(obj[key], messageId, out, depth + 1);
  });
}

function imagePartToAttachment(part: Record<string, unknown>, messageId: string, index: number): ExportAttachment | null {
  const type = String(part.content_type || part.type || "").trim().toLowerCase();
  if (type !== "image_asset_pointer" && type !== "image") return null;

  const metadata = part.metadata && typeof part.metadata === "object"
    ? part.metadata as Record<string, unknown>
    : {};
  const url = normalizeChatGPTImageUrl(
    metadata.asset_pointer_link
    || metadata.watermarked_asset_pointer
    || metadata.preview_url
    || part.previewUrl
    || part.preview_url
    || part.url
    || part.src
    || part.asset_pointer
    || ""
  );
  const fileName = String(
    metadata.image_gen_title
    || metadata.title
    || part.name
    || part.file_name
    || part.filename
    || `image-${index}`
  ).trim();
  const mimeType = String(metadata.mime_type || metadata.mimeType || part.mime_type || part.mimeType || "image/*");

  return {
    id: `${messageId}-image-${index}`,
    fileName,
    mimeType,
    url: url || undefined
  };
}

function normalizeChatGPTImageUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw || /^sediment:\/\//i.test(raw)) return "";
  if (/^(?:data:|blob:)/i.test(raw)) return raw;
  try {
    const base = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://chatgpt.com";
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

function hydrateChatGPTImageAttachmentsFromDom(
  attachments: ExportAttachment[],
  messageId: string,
  role: ConversationMessage["role"]
): ExportAttachment[] {
  if (!attachments.some((attachment) => !attachment.url && isImageAttachment(attachment))) return attachments;
  const domImageUrls = getChatGPTMessageImagesFromDomByMessageId(messageId, role);
  if (!domImageUrls.length) return attachments;

  let domImageIndex = 0;
  return attachments.map((attachment) => {
    if (attachment.url || !isImageAttachment(attachment)) return attachment;
    const url = domImageUrls[domImageIndex] || domImageUrls[0];
    domImageIndex += 1;
    return url ? { ...attachment, url } : attachment;
  });
}

function getChatGPTMessageImagesFromDomByMessageId(messageId: string, role: ConversationMessage["role"]): string[] {
  if (typeof document === "undefined") return [];
  const id = String(messageId || "").trim();
  if (!id) return [];

  let candidates: HTMLImageElement[] = [];
  if (role === "assistant") {
    const container = document.getElementById(`image-${id}`);
    if (!container) return [];
    const preferred = Array.from(container.querySelectorAll<HTMLImageElement>('img[alt^="已生成图片"]'));
    const fallback = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
    candidates = preferred.length ? preferred : fallback;
  } else if (role === "user") {
    const container = document.querySelector(`[data-message-id="${escapeCssIdentifier(id)}"]`);
    if (!container) return [];
    candidates = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
  }

  const seen = new Set<string>();
  return candidates
    .map((image) => String(image.currentSrc || image.src || "").trim())
    .filter((src) => src && !/^data:image\/svg/i.test(src))
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    });
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function isImageAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:$|[?#])/i.test(attachment.fileName || attachment.url || "");
}

function uniqueAttachments(attachments: ExportAttachment[]): ExportAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = [attachment.id, attachment.url, attachment.fileName].filter(Boolean).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
