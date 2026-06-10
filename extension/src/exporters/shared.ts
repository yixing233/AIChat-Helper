import type { ConversationMessage, ConversationSnapshot, DeepSeekExportMetadata, ExportAttachment } from "../shared/types";

export type MessageExportMode = "markdown" | "txt" | "html";

interface ChatGPTImageMessageLike {
  role?: ConversationMessage["role"] | string;
  text?: string;
  attachments?: ExportAttachment[];
}

export interface ChatGPTImagePreviewModel {
  url: string;
  title: string;
  alt: string;
  text: string;
}

export function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").trim() || "conversation";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return entities[char] || char;
  });
}

export function formatAttachmentText(attachment: ExportAttachment): string {
  const label = attachment.fileName || attachment.id || "attachment";
  return attachment.url ? `附件: ${label} <${attachment.url}>` : `附件: ${label}`;
}

export function formatMessageExportText(snapshot: ConversationSnapshot, message: ConversationMessage, mode: MessageExportMode): string {
  const textMode = mode === "txt" ? "txt" : "markdown";
  let text: string;
  if (snapshot.platformId === "chatgpt" && hasChatGPTImageEvidence(message)) {
    text = formatChatGPTImageMessageText(message, textMode);
  } else if (snapshot.platformId === "claude" && hasClaudeRepresentedImageAttachment(message)) {
    text = mode === "html"
      ? message.text
      : formatClaudeRepresentedImageText(message, textMode);
  } else {
    text = hasImagePlaceholderWithAttachment(message)
      ? formatGenericImagePlaceholderText(message, textMode)
      : message.text;
  }

  return mode === "html"
    ? text
    : formatRepresentedAttachmentText(snapshot, message, text, textMode);
}

export function getMessageAttachmentsForExport(snapshot: ConversationSnapshot, message: ConversationMessage, mode: MessageExportMode = "markdown"): ExportAttachment[] {
  const attachments = message.attachments || [];
  const representedAttachments = new Set(attachments.filter((attachment) => (
    isAttachmentRepresentedInText(message.text, attachment)
      || (snapshot.platformId === "claude" && isClaudeImageAttachmentRepresentedInText(message.text, attachment))
  )));
  if (snapshot.platformId !== "chatgpt" || !hasChatGPTImageEvidence(message)) {
    if (hasImagePlaceholderWithAttachment(message)) {
      return attachments.filter((attachment) => !isImageAttachment(attachment) && !representedAttachments.has(attachment));
    }
    return attachments.filter((attachment) => !representedAttachments.has(attachment));
  }
  return attachments.filter((attachment) => !isImageAttachment(attachment) && !representedAttachments.has(attachment));
}

export function formatDeepSeekMetadataText(snapshot: ConversationSnapshot): string {
  const meta = getDeepSeekMetadata(snapshot);
  if (!meta) return "";
  return [
    "【DeepSeek 对话信息】",
    `会话ID: ${fallback(meta.sessionId)}`,
    `标题: ${fallback(meta.title)}`,
    `已置顶: ${meta.pinned ? "是" : "否"}`,
    `创建时间: ${fallback(meta.createdAt)}`,
    `更新时间: ${fallback(meta.updatedAt)}`,
    `深度思考: ${meta.thinkingEnabled ? "开启" : "关闭"}`,
    `智能搜索: ${meta.searchEnabled ? "开启" : "关闭"}`
  ].join("\n");
}

export function formatDeepSeekMetadataMarkdown(snapshot: ConversationSnapshot): string {
  const meta = getDeepSeekMetadata(snapshot);
  if (!meta) return "";
  return [
    "## DeepSeek 对话信息",
    "",
    `- 会话ID: ${fallback(meta.sessionId)}`,
    `- 标题: ${fallback(meta.title)}`,
    `- 已置顶: ${meta.pinned ? "是" : "否"}`,
    `- 创建时间: ${fallback(meta.createdAt)}`,
    `- 更新时间: ${fallback(meta.updatedAt)}`,
    `- 深度思考: ${meta.thinkingEnabled ? "开启" : "关闭"}`,
    `- 智能搜索: ${meta.searchEnabled ? "开启" : "关闭"}`
  ].join("\n");
}

export function formatDeepSeekMetadataHtml(snapshot: ConversationSnapshot): string {
  const meta = getDeepSeekMetadata(snapshot);
  if (!meta) return "";
  return [
    `<div style="margin:-12px 0 20px;padding:12px 14px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;font-size:12px;color:#1e3a8a;line-height:1.7;">`,
    `<div style="font-weight:700;margin-bottom:6px;">DeepSeek 对话信息</div>`,
    `<div>会话ID: ${escapeHtml(fallback(meta.sessionId))}</div>`,
    `<div>标题: ${escapeHtml(fallback(meta.title))}</div>`,
    `<div>已置顶: ${meta.pinned ? "是" : "否"} | 深度思考: ${meta.thinkingEnabled ? "开启" : "关闭"} | 智能搜索: ${meta.searchEnabled ? "开启" : "关闭"}</div>`,
    `<div>创建时间: ${escapeHtml(fallback(meta.createdAt))} | 更新时间: ${escapeHtml(fallback(meta.updatedAt))}</div>`,
    `</div>`
  ].join("");
}

export function formatRoleLabel(role: ConversationMessage["role"]): string {
  if (role === "user") return "用户问题";
  if (role === "assistant") return "AI回答";
  if (role === "system") return "系统消息";
  return "工具消息";
}

export function formatAssistantName(snapshot: ConversationSnapshot): string {
  const labels: Record<ConversationSnapshot["platformId"], string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    qwen: "通义千问",
    doubao: "豆包",
    deepseek: "DeepSeek"
  };
  return labels[snapshot.platformId] || "AI 助手";
}

function getDeepSeekMetadata(snapshot: ConversationSnapshot): DeepSeekExportMetadata | null {
  if (snapshot.platformId !== "deepseek") return null;
  return snapshot.metadata?.deepseek || null;
}

function fallback(value: string | undefined): string {
  return value ? value : "-";
}

export function hasChatGPTImageEvidence(message: ChatGPTImageMessageLike): boolean {
  if ((message.attachments || []).some(isImageAttachment)) return true;
  return /^\s*(?:!\[[^\]]*]\([^)]+\)|\[图片[^\]]*]\s+.+|\[图片地址缺失])\s*$/im.test(message.text || "");
}

function hasImagePlaceholderWithAttachment(message: ConversationMessage): boolean {
  return (message.attachments || []).some(isImageAttachment)
    && /(?:!\[[^\]]*]\([^)]+\)|^\s*\[图片[^\]]*]\s+\S+\s*$)/im.test(message.text || "");
}

function hasClaudeRepresentedImageAttachment(message: ConversationMessage): boolean {
  return (message.attachments || []).some((attachment, index) => (
    isClaudeImageAttachmentRepresentedInText(message.text, attachment, index + 1)
  ));
}

function formatChatGPTImageMessageText(message: ConversationMessage, mode: "markdown" | "txt"): string {
  const image = getChatGPTImageAttachment(message);
  const parsedImage = parseChatGPTImageLine(message.text);
  const url = String(image?.url || parsedImage.url || "").trim();
  const title = String(image?.fileName || parsedImage.title || "").trim();
  const text = stripChatGPTImageLines(message.text);
  const imageLine = url
    ? (mode === "markdown" ? `![图片](${url})` : `[图片] ${url}`)
    : (mode === "markdown" ? "[图片地址缺失]" : "[图片]");
  const parts = [imageLine];
  if (message.role === "user" && text) parts.push(text);
  if (message.role === "assistant" && !url && title) parts.push(title);
  return parts.filter(Boolean).join(mode === "markdown" ? "\n\n" : "\n");
}

export function getChatGPTImagePreviewModel(message: ChatGPTImageMessageLike): ChatGPTImagePreviewModel | null {
  if (!hasChatGPTImageEvidence(message)) return null;
  const image = getChatGPTImageAttachment(message);
  const parsedImage = parseChatGPTImageLine(message.text || "");
  const url = String(image?.url || parsedImage.url || "").trim();
  if (!url) return null;

  const title = String(image?.fileName || parsedImage.title || "").trim();
  const text = cleanChatGPTImagePreviewText(message.text || "");
  const role = String(message.role || "").trim().toLowerCase();
  return {
    url,
    title,
    alt: role === "assistant" ? (title || "图片") : (text || "图片"),
    text
  };
}

export function cleanChatGPTImagePreviewText(text: string): string {
  return stripChatGPTImageLines(text)
    .replace(/\[附件\d+:[^\]]+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatGenericImagePlaceholderText(message: ConversationMessage, mode: "markdown" | "txt"): string {
  const image = getChatGPTImageAttachment(message);
  const parsedImage = parseChatGPTImageLine(message.text);
  const url = String(image?.url || parsedImage.url || "").trim();
  const imageLine = url
    ? (mode === "markdown" ? `![图片](${url})` : `[图片] ${url}`)
    : (mode === "markdown" ? "[图片地址缺失]" : "[图片]");
  const replaced = String(message.text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, imageLine)
    .replace(/^\s*\[图片[^\]]*]\s+\S+\s*$/gim, imageLine)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return replaced || imageLine;
}

function getChatGPTImageAttachment(message: ChatGPTImageMessageLike): ExportAttachment | undefined {
  const attachments = message.attachments || [];
  return attachments.find((attachment) => isImageAttachment(attachment) && attachment.url)
    || attachments.find(isImageAttachment);
}

function parseChatGPTImageLine(text: string): { url: string; title: string } {
  const markdownMatch = String(text || "").match(/!\[([^\]]*)]\(([^)]+)\)/);
  if (markdownMatch) {
    return {
      title: String(markdownMatch[1] || "").trim(),
      url: String(markdownMatch[2] || "").trim()
    };
  }
  const textMatch = String(text || "").match(/^\s*\[图片[^\]]*]\s+(.+?)\s*$/im);
  if (textMatch) {
    const value = String(textMatch[1] || "").trim();
    return isLikelyExportUrl(value) ? { url: value, title: "" } : { url: "", title: value };
  }
  return { url: "", title: "" };
}

function stripChatGPTImageLines(text: string): string {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/^\s*\[图片[^\]]*]\s+.+\s*$/gim, "")
    .replace(/^\s*\[图片地址缺失]\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyExportUrl(value: string): boolean {
  return /^(?:https?:\/\/|data:|blob:|images\/|files\/|attachments\/)/i.test(String(value || "").trim());
}

function formatClaudeRepresentedImageText(message: ConversationMessage, mode: "markdown" | "txt"): string {
  let out = String(message.text || "");
  let imageSerial = 0;
  (message.attachments || []).forEach((attachment) => {
    if (!isImageAttachment(attachment)) return;
    imageSerial += 1;
    out = replaceClaudeImageAttachmentBlock(
      out,
      attachment,
      mode === "markdown"
        ? formatClaudeRepresentedImageMarkdown(attachment, out, imageSerial)
        : formatClaudeRepresentedImageTextLine(attachment, out, imageSerial),
      imageSerial
    );
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function formatClaudeRepresentedImageMarkdown(attachment: ExportAttachment, text: string, fallbackSerial: number): string {
  const reference = getClaudeImageAttachmentReference(text, attachment, fallbackSerial);
  if (!reference) return "";
  const url = String(attachment.url || "").trim();
  const label = `${reference.kind}${reference.serial} ${reference.fileName}`;
  return url ? `![${label}](${url})` : `[${reference.kind}${reference.serial}] ${reference.fileName}`;
}

function formatClaudeRepresentedImageTextLine(attachment: ExportAttachment, text: string, fallbackSerial: number): string {
  const reference = getClaudeImageAttachmentReference(text, attachment, fallbackSerial);
  return reference ? `[${reference.kind}${reference.serial}] ${reference.fileName}` : "";
}

export function formatAttachmentMarkdown(attachment: ExportAttachment): string {
  const label = attachment.fileName || attachment.id || "attachment";
  const htmlSnapshot = formatInlineHtmlAttachmentMarkdown(attachment, label);
  if (htmlSnapshot) return htmlSnapshot;
  if (attachment.url && isImageAttachment(attachment)) {
    return `![${label}](${attachment.url})`;
  }
  return attachment.url ? `[${label}](${attachment.url})` : label;
}

function formatRepresentedAttachmentText(
  snapshot: ConversationSnapshot,
  message: ConversationMessage,
  value: string,
  mode: "markdown" | "txt"
): string {
  let out = String(value || "");
  (message.attachments || []).forEach((attachment, index) => {
    if (!isAttachmentRepresentedInText(out, attachment)) return;
    if (snapshot.platformId !== "claude") return;
    out = replaceRepresentedAttachmentBlock(
      out,
      attachment,
      mode === "markdown"
        ? formatRepresentedAttachmentMarkdown(attachment, index + 1)
        : formatRepresentedAttachmentTextLine(attachment, index + 1)
    );
  });
  return out;
}

function formatRepresentedAttachmentMarkdown(attachment: ExportAttachment, serial: number): string {
  const label = attachment.fileName || attachment.id || "attachment";
  const linkLabel = `附件${serial} ${label}`;
  if (isHtmlAttachment(attachment)) {
    const htmlSnapshot = formatInlineHtmlAttachmentMarkdown(attachment, label, linkLabel);
    if (htmlSnapshot) return htmlSnapshot;
  }
  return attachment.url ? `[${linkLabel}](${attachment.url})` : `[附件${serial}] ${label}`;
}

function formatRepresentedAttachmentTextLine(attachment: ExportAttachment, serial: number): string {
  const label = attachment.fileName || attachment.id || "attachment";
  return attachment.url ? `[附件${serial}] ${label}\n链接: ${attachment.url}` : `[附件${serial}] ${label}`;
}

export function replaceRepresentedAttachmentBlock(text: string, attachment: ExportAttachment, replacement: string): string {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!isAttachmentLineForAttachment(lines[index], attachment)) continue;
    const removeCount = index + 1 < lines.length && /^\s*链接\s*:/i.test(lines[index + 1]) ? 2 : 1;
    lines.splice(index, removeCount, replacement);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return [String(text || "").trim(), replacement].filter(Boolean).join("\n\n");
}

export function isAttachmentRepresentedInText(text: string, attachment: ExportAttachment): boolean {
  return String(text || "").replace(/\r\n/g, "\n").split("\n").some((line) => isAttachmentLineForAttachment(line, attachment));
}

export function isClaudeImageAttachmentRepresentedInText(text: string, attachment: ExportAttachment, fallbackSerial = 1): boolean {
  return !!getClaudeImageAttachmentReference(text, attachment, fallbackSerial);
}

export function replaceClaudeImageAttachmentBlock(text: string, attachment: ExportAttachment, replacement: string, fallbackSerial = 1): string {
  if (!replacement) return String(text || "");
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!parseClaudeImageAttachmentLine(lines[index], attachment, fallbackSerial)) continue;
    lines.splice(index, 1, replacement);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return String(text || "");
}

function isAttachmentLineForAttachment(line: string, attachment: ExportAttachment): boolean {
  const value = String(line || "").trim();
  const fileName = String(attachment.fileName || "").trim();
  if (!fileName || !/\[附件[^\]]*]/.test(value)) return false;
  return new RegExp(escapeRegExp(fileName), "i").test(value);
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatRepresentedAttachmentHtmlBlock(attachment: ExportAttachment): string {
  const label = escapeHtml(attachment.fileName || attachment.id || "attachment");
  const mimeType = attachment.mimeType ? ` <small>${escapeHtml(attachment.mimeType)}</small>` : "";
  const htmlSnapshot = formatInlineHtmlAttachmentFigure(attachment, label);
  if (htmlSnapshot) return htmlSnapshot;
  if (attachment.url && isImageAttachment(attachment)) {
    return `<figure><img src="${escapeHtml(attachment.url)}" alt="${label}" loading="lazy"><figcaption>${label}${mimeType}</figcaption></figure>`;
  }
  if (attachment.url) {
    return `<p>[附件] <a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${label}</a>${mimeType}</p>`;
  }
  return `<p>[附件] ${label}${mimeType}</p>`;
}

export function formatRepresentedClaudeImageHtmlBlock(text: string, attachment: ExportAttachment, fallbackSerial = 1): string {
  const reference = getClaudeImageAttachmentReference(text, attachment, fallbackSerial);
  if (!reference) return "";
  const label = escapeHtml(reference.fileName);
  const url = String(attachment.url || "").trim();
  if (!url) {
    return `<p>[${escapeHtml(reference.kind)}${reference.serial}] ${label}</p>`;
  }
  const inlineSvg = getInlineSvgMarkup(attachment);
  if (inlineSvg) {
    return `<figure class="claude-image-block claude-svg-block"><div class="claude-inline-svg">${inlineSvg}</div><figcaption>${escapeHtml(reference.kind)}${reference.serial} · ${label}</figcaption></figure>`;
  }
  return `<figure class="claude-image-block"><img src="${escapeHtml(url)}" alt="${label}" loading="lazy"><figcaption>${escapeHtml(reference.kind)}${reference.serial} · ${label}</figcaption></figure>`;
}

function getInlineSvgMarkup(attachment: ExportAttachment): string {
  const content = typeof attachment.content === "string" ? attachment.content.trim() : "";
  if (/^<svg\b/i.test(content)) return sanitizeInlineAttachmentHtml(content);

  const url = String(attachment.url || "").trim();
  if (!/^data:image\/svg\+xml/i.test(url)) return "";
  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) return "";

  const meta = url.slice(0, commaIndex);
  const payload = url.slice(commaIndex + 1);
  let decoded = "";
  if (/;base64/i.test(meta)) {
    try {
      decoded = globalThis.atob ? globalThis.atob(payload) : "";
    } catch {
      decoded = "";
    }
  } else {
    try {
      decoded = decodeURIComponent(payload);
    } catch {
      decoded = payload;
    }
  }

  const sanitized = sanitizeInlineAttachmentHtml(decoded);
  return /^<svg\b/i.test(sanitized) ? sanitized : "";
}

function formatInlineHtmlAttachmentMarkdown(attachment: ExportAttachment, label: string, linkLabel = label): string {
  const raw = String(attachment.content || "").trim();
  if (!raw || !isHtmlAttachment(attachment)) return "";
  const styles = extractInlineAttachmentStyles(raw);
  const sanitized = sanitizeInlineAttachmentHtml(removeInlineAttachmentStyles(raw));
  if (!sanitized) return "";
  const className = `claude-md-widget-${hashTextForArchiveKey(raw)}`;
  const styleBlock = scopeInlineAttachmentStyles(styles, `.${className}`);
  const link = attachment.url ? `\n\n[${linkLabel}](${attachment.url})` : "";
  return [
    `<div class="${className}" data-ai-chat-helper-snapshot="true">`,
    `<p><strong>附件快照：${escapeHtml(label)}</strong></p>`,
    styleBlock,
    sanitized,
    `</div>${link}`
  ].filter(Boolean).join("\n");
}

export function formatAttachmentHtml(attachment: ExportAttachment): string {
  const label = escapeHtml(attachment.fileName || attachment.id || "attachment");
  const mimeType = attachment.mimeType ? ` <small>${escapeHtml(attachment.mimeType)}</small>` : "";

  const htmlSnapshot = formatInlineHtmlAttachmentSnapshot(attachment, label);
  if (htmlSnapshot) return htmlSnapshot;

  if (attachment.url && isImageAttachment(attachment)) {
    return `<li><figure><img src="${escapeHtml(attachment.url)}" alt="${label}" loading="lazy"><figcaption>${label}${mimeType}</figcaption></figure></li>`;
  }

  if (attachment.url) {
    return `<li><a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${label}</a>${mimeType}</li>`;
  }

  return `<li>${label}${mimeType}</li>`;
}

function formatInlineHtmlAttachmentSnapshot(attachment: ExportAttachment, label: string): string {
  const figure = formatInlineHtmlAttachmentFigure(attachment, label);
  return figure ? `<li>${figure}</li>` : "";
}

function formatInlineHtmlAttachmentFigure(attachment: ExportAttachment, label: string): string {
  const raw = String(attachment.content || "").trim();
  if (!raw || !isHtmlAttachment(attachment)) return "";
  const styles = extractInlineAttachmentStyles(raw);
  const sanitized = sanitizeInlineAttachmentHtml(removeInlineAttachmentStyles(raw));
  if (!sanitized) return "";
  const styleBlock = scopeInlineAttachmentStyles(styles, ".claude-html-widget");
  const link = attachment.url
    ? `<p><a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${label}</a></p>`
    : "";
  return `<figure class="claude-html-widget-block"><figcaption>交互内容 · ${label}</figcaption>${styleBlock}<div class="claude-html-widget">${sanitized}</div>${link}</figure>`;
}

function extractInlineAttachmentStyles(value: string): string[] {
  const styles: string[] = [];
  String(value || "").replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    const text = String(css || "").trim();
    if (text) styles.push(text);
    return "";
  });
  return styles;
}

function removeInlineAttachmentStyles(value: string): string {
  return String(value || "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
}

function scopeInlineAttachmentStyles(styles: string[], scope: string): string {
  if (!styles.length) return "";
  const normalizedScope = String(scope || "").trim();
  if (!normalizedScope) return "";
  const scoped = styles
    .map((css) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string, body: string) => {
      const rawSelector = String(selector || "").trim();
      if (!rawSelector || rawSelector.startsWith("@")) return rule;
      const scopedSelector = rawSelector
        .split(",")
        .map((item) => {
          const selectorPart = item.trim();
          if (!selectorPart) return "";
          if (/^(?:html|body|:root)\b/i.test(selectorPart)) return normalizedScope;
          if (selectorPart.startsWith(normalizedScope)) return selectorPart;
          return `${normalizedScope} ${selectorPart}`;
        })
        .filter(Boolean)
        .join(", ");
      return scopedSelector ? `${scopedSelector}{${body}}` : rule;
    }))
    .join("\n")
    .trim();
  return scoped ? `<style>${scoped}</style>` : "";
}

function hashTextForArchiveKey(text: string): string {
  const src = String(text || "");
  let hash = 2166136261;
  for (let index = 0; index < src.length; index += 1) {
    hash ^= src.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function sanitizeInlineAttachmentHtml(value: string): string {
  return String(value || "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/<\/?(?:html|body)[^>]*>/gi, "")
    .trim();
}

function isImageAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:$|[?#])/i.test(attachment.fileName || attachment.url || "");
}

function isHtmlAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return mimeType.includes("html") || /\.html?$/i.test(attachment.fileName || "");
}

interface ClaudeImageAttachmentReference {
  kind: "图片" | "图像";
  serial: number;
  fileName: string;
}

function getClaudeImageAttachmentReference(text: string, attachment: ExportAttachment, fallbackSerial: number): ClaudeImageAttachmentReference | null {
  if (!isImageAttachment(attachment)) return null;
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const reference = parseClaudeImageAttachmentLine(line, attachment, fallbackSerial);
    if (reference) return reference;
  }
  return null;
}

function parseClaudeImageAttachmentLine(line: string, attachment: ExportAttachment, fallbackSerial: number): ClaudeImageAttachmentReference | null {
  if (!isImageAttachment(attachment)) return null;
  const value = String(line || "").trim();
  const match = value.match(/^\[(图片|图像)(\d*)]\s+(.+?)\s*$/);
  if (!match) return null;

  const fileName = String(attachment.fileName || "").trim();
  const lineLabel = String(match[3] || "").trim();
  if (fileName && !new RegExp(escapeRegExp(fileName), "i").test(lineLabel)) return null;

  const parsedSerial = Number.parseInt(match[2] || "", 10);
  const serial = Number.isFinite(parsedSerial) && parsedSerial > 0 ? parsedSerial : Math.max(1, fallbackSerial);
  return {
    kind: match[1] as "图片" | "图像",
    serial,
    fileName: fileName || lineLabel || `${match[1]}${serial}`
  };
}
