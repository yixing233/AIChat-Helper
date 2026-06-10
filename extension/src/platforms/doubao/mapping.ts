import type { ConversationMessage, ConversationSnapshot, ExportAttachment } from "../../shared/types";

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
  subOrder: number;
  isArtifact: boolean;
  attachments: ExportAttachment[];
}

export interface DoubaoArtifactMeta {
  codeId: string;
  version: string;
  title: string;
}

export interface DoubaoExtractionOptions {
  artifactTexts?: Record<string, string>;
}

export function extractDoubaoSnapshotFromSingleChain(
  payload: unknown,
  conversationId = "current",
  options: DoubaoExtractionOptions = {}
): ConversationSnapshot {
  const messages = parseDoubaoSingleChainMessages(payload, options);

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

export function collectDoubaoArtifactMetasFromSingleChain(payload: unknown): DoubaoArtifactMeta[] {
  const metas: DoubaoArtifactMeta[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    const meta = getDoubaoArtifactMetaFromBlock(node);
    if (meta) {
      const key = doubaoArtifactKey(meta.codeId, meta.version);
      if (!seen.has(key)) {
        seen.add(key);
        metas.push(meta);
      }
      return;
    }

    Object.values(node).forEach(walk);
  };

  walk(payload);
  return metas;
}

function parseDoubaoSingleChainMessages(payload: unknown, options: DoubaoExtractionOptions): ConversationMessage[] {
  const rawMessages = findDoubaoMessages(payload);
  const built: DoubaoBuiltMessage[] = [];

  rawMessages.forEach((message, rawIndex) => {
    const role: ConversationMessage["role"] = Number(message.user_type) === 1 ? "user" : "assistant";
    const blockText = Array.isArray(message.content_block) ? extractDoubaoTextFromBlocks(message.content_block) : "";
    const artifactText = Array.isArray(message.content_block) ? extractDoubaoArtifactTextFromContentBlocks(message.content_block, options) : "";
    const contentText = parseDoubaoContentPayload(message.content);
    const ttsText = typeof message.tts_content === "string" ? message.tts_content.trim() : "";
    const text = buildDoubaoMessageText(role, ttsText, blockText, contentText);
    const sourceMessageId = String(message.message_id || message.msg_id || "").trim();
    const ownerId = `doubao-export-${sourceMessageId || rawIndex + 1}`;
    const attachments = extractDoubaoAttachments([message.content, message.content_block], ownerId);
    const fallbackAttachmentText = attachments.map((attachment, attachmentIndex, allAttachments) => (
      `[附件${allAttachments.length > 1 ? attachmentIndex + 1 : ""}] ${attachment.fileName}`
    )).join("\n");
    const normalText = text || fallbackAttachmentText;

    if (normalText) {
      built.push({
        role,
        text: normalText,
        indexInConv: Number(message.index_in_conv || 0),
        createTime: Number(message.create_time || 0),
        sourceMessageId,
        subOrder: 0,
        isArtifact: false,
        attachments
      });
    }
    if (artifactText) {
      built.push({
        role,
        text: artifactText,
        indexInConv: Number(message.index_in_conv || 0),
        createTime: Number(message.create_time || 0),
        sourceMessageId,
        subOrder: 1,
        isArtifact: true,
        attachments: []
      });
    }
  });

  return built
    .sort((a, b) => a.indexInConv - b.indexInConv || a.createTime - b.createTime || a.subOrder - b.subOrder)
    .map((message, index) => {
      const sourceId = message.sourceMessageId || String(index + 1);
      const snapshotMessage: ConversationMessage = {
        id: `doubao-export-${sourceId}${message.isArtifact ? "-artifact" : ""}`,
        sourceMessageId: message.sourceMessageId,
        role: message.role,
        text: message.text
      };
      if (message.createTime) snapshotMessage.createdAt = new Date(message.createTime * 1000).toISOString();
      if (message.isArtifact) snapshotMessage.isArtifact = true;
      if (message.attachments.length) snapshotMessage.attachments = message.attachments;
      return snapshotMessage;
    });
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

function buildDoubaoMessageText(
  role: ConversationMessage["role"],
  ttsText: string,
  blockText: string,
  contentText: string
): string {
  const candidates = role === "user" ? [ttsText, blockText, contentText] : [blockText, contentText, ttsText];
  const normalParts = uniqueTextParts(candidates);

  if (role === "user" && ttsText) {
    const seenLines = new Set([normalizeDoubaoCompareText(ttsText)]);
    const extraLines: string[] = [];

    normalParts.forEach((part) => {
      if (normalizeDoubaoCompareText(part) === normalizeDoubaoCompareText(ttsText)) return;
      String(part)
        .replace(ttsText, "\n")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const key = normalizeDoubaoCompareText(line);
          if (!key || seenLines.has(key)) return;
          seenLines.add(key);
          extraLines.push(line);
        });
    });

    return [ttsText, ...extraLines].join("\n").trim();
  }

  return normalParts.join(role === "user" ? "\n" : "\n\n").trim() || ttsText;
}

function extractDoubaoTextFromBlocks(blocks: unknown[], options: DoubaoExtractionOptions = {}): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  const pushText = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const parsed = parseDoubaoContentPayload(raw);
    if (parsed && parsed !== raw) {
      parsed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        if (shouldIgnoreDoubaoText(line) || seen.has(line)) return;
        seen.add(line);
        lines.push(line);
      });
      return;
    }
    const cleanedRaw = raw
      .split(/\r?\n/)
      .filter((line) => !shouldIgnoreDoubaoText(line.trim()))
      .join("\n")
      .trim();
    if (!cleanedRaw || seen.has(cleanedRaw)) return;
    seen.add(cleanedRaw);
    lines.push(cleanedRaw);
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
    const artifactMeta = getDoubaoArtifactMetaFromBlock(obj);
    if (artifactMeta) {
      return;
    }

    const requirementBlock = content.requirement_clarify_block || obj.requirement_clarify_block;
    if (requirementBlock) {
      const summary = formatDoubaoRequirementClarifyBlock(requirementBlock);
      if (summary) pushText(summary);
      return;
    }

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

function extractDoubaoArtifactTextFromContentBlocks(blocks: unknown[], options: DoubaoExtractionOptions = {}): string {
  const out: string[] = [];

  blocks.forEach((block) => {
    const meta = getDoubaoArtifactMetaFromBlock(block);
    if (!meta) return;
    const artifactText = getDoubaoArtifactText(options, meta);
    if (!artifactText) return;
    out.push(`【${meta.title || "代码编辑器内容"}】\n${artifactText}`);
  });

  return out.join("\n\n").trim();
}

function getDoubaoArtifactMetaFromBlock(value: unknown): DoubaoArtifactMeta | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  const content = block.content && typeof block.content === "object"
    ? block.content as Record<string, unknown>
    : {};
  const artifact = (content.artifact_block || block.artifact_block) as Record<string, unknown> | undefined;
  if (!artifact || typeof artifact !== "object") return null;
  const codeId = String(artifact.resource_id || artifact.code_id || artifact.id || "").trim();
  if (!codeId) return null;
  return {
    codeId,
    version: String(artifact.resource_version || artifact.version || "").trim(),
    title: String(artifact.title || artifact.artifact_topic || "代码编辑器").trim()
  };
}

function getDoubaoArtifactText(options: DoubaoExtractionOptions, meta: DoubaoArtifactMeta): string {
  const texts = options.artifactTexts || {};
  return String(texts[doubaoArtifactKey(meta.codeId, meta.version)] || texts[meta.codeId] || "").trim();
}

export function doubaoArtifactKey(codeId: string, version = ""): string {
  return `${String(codeId || "").trim()}@${String(version || "").trim()}`;
}

function formatDoubaoRequirementClarifyBlock(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const reqBlock = value as Record<string, unknown>;
  const requirements = Array.isArray(reqBlock.requirements) ? reqBlock.requirements : [];
  const out: string[] = [];

  requirements.forEach((group) => {
    if (!group || typeof group !== "object") return;
    const items = Array.isArray((group as Record<string, unknown>).requirement_items)
      ? (group as Record<string, unknown>).requirement_items as unknown[]
      : [];

    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const obj = item as Record<string, unknown>;
      const title = String(obj.title || "").trim();
      const content = String(obj.content || "").trim();
      const selectedKey = String(obj.selected_requirement_key || "").trim();
      const choices = Array.isArray(obj.requirement_items) ? obj.requirement_items as unknown[] : [];
      const selected = choices.find((choice) => {
        if (!choice || typeof choice !== "object") return false;
        return String((choice as Record<string, unknown>).key || "") === selectedKey;
      });
      const selectedTitle = selected && typeof selected === "object"
        ? String((selected as Record<string, unknown>).title || "").trim()
        : "";

      if (title && content) out.push(`【${title}】\n${content}`);
      else if (title) out.push(`【${title}】`);
      else if (content) out.push(content);
      if (selectedTitle) out.push(`已选风格: ${selectedTitle}`);
    });
  });

  return out.join("\n\n").trim();
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
    const imageUrl = image ? getDoubaoImageUrl(image) : "";
    const key = String(image?.key || "").trim();
    const serial = entities.length > 1 ? String(index + 1) : "";
    if (imageUrl) lines.push(`[图片${serial}] ${imageUrl}`);
    else if (key) lines.push(`[图片${serial}] ${key}`);
  });
  fileNames.forEach((name, index) => {
    const serial = fileNames.length > 1 ? String(index + 1) : "";
    lines.push(`[附件${serial}] ${name}`);
  });

  return lines.join("\n").trim();
}

function extractDoubaoAttachments(value: unknown, ownerId: string): ExportAttachment[] {
  const out: ExportAttachment[] = [];
  collectDoubaoAttachments(value, ownerId, out);
  return uniqueDoubaoAttachments(out);
}

function collectDoubaoAttachments(value: unknown, ownerId: string, out: ExportAttachment[], depth = 0): void {
  if (value == null || depth > 8) return;
  if (typeof value === "string") {
    const parsed = safeParseJson(value.trim());
    if (parsed != null) collectDoubaoAttachments(parsed, ownerId, out, depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectDoubaoAttachments(item, ownerId, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const content = obj.entity_content && typeof obj.entity_content === "object"
    ? obj.entity_content as Record<string, unknown>
    : obj;
  pushDoubaoAttachment(content.file, "file", ownerId, out);
  pushDoubaoAttachment(content.image, "image", ownerId, out);

  Object.values(obj).forEach((item) => collectDoubaoAttachments(item, ownerId, out, depth + 1));
}

function pushDoubaoAttachment(value: unknown, kind: "file" | "image", ownerId: string, out: ExportAttachment[]): void {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const fileName = String(
    obj.file_name
    || obj.filename
    || obj.name
    || obj.title
    || obj.key
    || `${kind}-${out.length + 1}`
  ).trim();
  if (!fileName) return;

  out.push({
    id: `${ownerId}-${kind}-${out.length + 1}`,
    fileName,
    mimeType: String(obj.mime_type || obj.mimeType || obj.file_type || (kind === "image" ? "image/*" : "application/octet-stream")),
    url: getDoubaoAttachmentUrl(obj, kind) || undefined
  });
}

function uniqueDoubaoAttachments(attachments: ExportAttachment[]): ExportAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = attachment.url || `${attachment.fileName}|${attachment.mimeType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDoubaoAttachmentUrl(obj: Record<string, unknown>, kind: "file" | "image"): string {
  const direct = String(obj.url || obj.download_url || obj.downloadUrl || obj.file_url || obj.image_url || "").trim();
  if (direct) return direct;
  return kind === "image" ? getDoubaoImageUrl(obj) : "";
}

function getDoubaoImageUrl(image: Record<string, unknown>): string {
  return getNestedDoubaoUrl(image.image_ori)
    || getNestedDoubaoUrl(image.preview_img)
    || getNestedDoubaoUrl(image.image_thumb);
}

function getNestedDoubaoUrl(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as Record<string, unknown>).url || "").trim();
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeDoubaoCompareText(text: string): string {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextParts(candidates: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  candidates.forEach((candidate) => {
    const text = String(candidate || "").trim();
    const key = normalizeDoubaoCompareText(text);
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
    || /^R[A-Za-z0-9]{20,}$/i.test(text)
    || /^\{.*"entities"\s*:\s*\[.*"text"\s*:/i.test(text)
    || /^\{.*"entity_content"\s*:\s*\{.*"file"\s*:/i.test(text)
    || (/^https?:\/\//i.test(text) && /(byteimg|tos-cn-|flow-sign|flow-imagex-sign)/i.test(text));
}
