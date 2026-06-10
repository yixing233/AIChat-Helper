import type { ConversationMessage, ConversationSnapshot, ExportAttachment } from "../../shared/types";

interface ClaudeConversationPayload {
  uuid?: string;
  id?: string;
  name?: string;
  title?: string;
  chat_messages?: ClaudeMessagePayload[];
  updated_at?: string;
  created_at?: string;
}

interface ClaudeMessagePayload {
  uuid?: string;
  id?: string;
  sender?: string;
  text?: string;
  content?: unknown;
  files?: ClaudeFilePayload[];
  created_at?: string;
}

interface ClaudeFilePayload {
  id?: string;
  uuid?: string;
  file_uuid?: string;
  file_name?: string;
  filename?: string;
  name?: string;
  file_kind?: string;
  kind?: string;
  file_type?: string;
  mime_type?: string;
  url?: string;
  preview_url?: string;
  thumbnail_url?: string;
  preview_asset?: { url?: string; image_width?: number; image_height?: number };
  thumbnail_asset?: { url?: string; image_width?: number; image_height?: number };
  download_url?: string;
  downloadUrl?: string;
  file_url?: string;
  fileUrl?: string;
  asset?: { url?: string };
}

export function extractClaudeSnapshotFromConversation(payload: unknown): ConversationSnapshot {
  const conversation = payload as ClaudeConversationPayload;
  const chatMessages = Array.isArray(conversation.chat_messages) ? conversation.chat_messages : [];

  return {
    platformId: "claude",
    conversationId: String(conversation.uuid || conversation.id || "current"),
    title: String(conversation.name || conversation.title || "Claude Conversation"),
    attachments: [],
    messages: chatMessages.map(messageToSnapshotMessage).filter((message): message is ConversationMessage => Boolean(message)),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at
  };
}

function messageToSnapshotMessage(message: ClaudeMessagePayload, index: number): ConversationMessage | null {
  const role = normalizeClaudeRole(message.sender);
  if (!role) return null;
  const id = String(message.uuid || message.id || `claude-msg-${index + 1}`);
  const attachments = extractClaudeMessageAttachments(message, id);

  const text = [
    extractClaudeContentText(message.content),
    extractClaudeFileText(message.files, countClaudeWidgetParts(message.content), countClaudeImageParts(message.content)),
    fallbackText(message.text)
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!text && !attachments.length) return null;

  const snapshotMessage: ConversationMessage = {
    id,
    sourceMessageId: id,
    role,
    text: text || attachments.map((attachment, attachmentIndex) => `[附件${attachmentIndex + 1}] ${attachment.fileName}`).join("\n"),
    createdAt: message.created_at
  };
  if (attachments.length) snapshotMessage.attachments = attachments;
  return snapshotMessage;
}

function normalizeClaudeRole(sender?: string): ConversationMessage["role"] | null {
  const normalized = String(sender || "").toLowerCase();
  if (normalized === "human") return "user";
  if (normalized === "assistant") return "assistant";
  if (normalized === "system") return "system";
  return null;
}

function extractClaudeContentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    let imageSerial = 0;
    let fileSerial = 0;
    return content.map((part) => {
      if (part && typeof part === "object" && claudeImagePartToAttachment(part as Record<string, unknown>, "image", imageSerial + 1)) {
        imageSerial += 1;
        return contentPartToText(part, imageSerial);
      }
      const widgetInfo = part && typeof part === "object"
        ? claudeWidgetInfoFromPart(part as Record<string, unknown>, fileSerial + 1)
        : null;
      if (widgetInfo) {
        fileSerial += 1;
        return [`[附件${fileSerial}] ${widgetInfo.fileName}`, widgetInfo.visibleText].filter(Boolean).join("\n\n");
      }
      return contentPartToText(part, imageSerial + 1);
    }).filter(Boolean).join("\n\n").trim();
  }
  if (content && typeof content === "object") return contentPartToText(content);
  return "";
}

function contentPartToText(part: unknown, imageIndex = 1): string {
  if (typeof part === "string") return part.trim();
  if (!part || typeof part !== "object") return "";
  const value = part as Record<string, unknown>;
  const imageAttachment = claudeImagePartToAttachment(value, "image", 1);
  if (imageAttachment) return `${isClaudeSvgPart(value) ? "[图像" : "[图片"}${imageIndex}] ${imageAttachment.fileName}`;
  const widgetInfo = claudeWidgetInfoFromPart(value, 1);
  if (widgetInfo) return [`[附件1] ${widgetInfo.fileName}`, widgetInfo.visibleText].filter(Boolean).join("\n\n");
  const artifactText = claudeArtifactPartToText(value);
  if (artifactText) return artifactText;
  const toolUseText = claudeToolUsePartToText(value);
  if (toolUseText) return toolUseText;
  const toolResultText = claudeToolResultPartToText(value);
  if (toolResultText) return toolResultText;
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.content === "string") return value.content.trim();
  if (typeof value.name === "string" && typeof value.type === "string") return `[${value.type}: ${value.name}]`;
  return "";
}

function claudeArtifactPartToText(part: Record<string, unknown>): string {
  const type = String(part.type || "").trim().toLowerCase();
  const name = String(part.name || "").trim().toLowerCase();
  if (type !== "tool_use" && type !== "tool_result" && name !== "artifacts") return "";

  const input = part.input && typeof part.input === "object" ? part.input as Record<string, unknown> : {};
  const content = part.content && typeof part.content === "object" ? part.content as Record<string, unknown> : {};
  const source = Object.keys(input).length ? input : content;
  const code = String(source.code || source.html || source.svg || source.content || "").trim();
  if (!code) return "";

  const title = String(source.title || source.name || part.name || "Claude artifact").trim();
  const language = String(source.language || source.lang || (source.html ? "html" : source.svg ? "svg" : "")).trim();
  return `[Artifact: ${title}]\n\`\`\`${language}\n${code}\n\`\`\``;
}

function claudeToolUsePartToText(part: Record<string, unknown>): string {
  const type = String(part.type || "").trim().toLowerCase();
  if (type !== "tool_use") return "";
  const toolName = String(part.name || "").trim();
  if (shouldIgnoreClaudeToolName(toolName)) return "";
  if (toolName === "visualize:show_widget") {
    const widgetCode = findClaudeWidgetCodeInValue(part.input) || findClaudeWidgetCodeInValue(part);
    const widgetText = extractClaudeVisibleTextFromHtmlFragment(widgetCode);
    if (widgetText) return widgetText;
  }
  return summarizeClaudeToolInput(toolName, part.input);
}

function looksLikeClaudeWidgetHtml(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return /<[^>]+>/i.test(raw)
    && (
      /id=["']vis-container["']/i.test(raw)
      || /class=["'][^"']*\bstep-card\b/i.test(raw)
      || /id=["']hole-svg["']/i.test(raw)
      || /\bsendPrompt\s*\(/i.test(raw)
      || (/<style[\s\S]*<\/style>/i.test(raw) && /<(?:div|section|article|main|svg|pre)\b/i.test(raw))
    );
}

function findClaudeWidgetCodeInValue(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return looksLikeClaudeWidgetHtml(value) ? value : "";
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const priorityKeys = ["widget_code", "widgetCode", "html", "html_content", "htmlContent", "content", "code", "text"];
  const record = value as Record<string, unknown>;
  for (const key of priorityKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const found = findClaudeWidgetCodeInValue(record[key], depth + 1, seen);
    if (found) return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findClaudeWidgetCodeInValue(item, depth + 1, seen);
      if (found) return found;
    }
    return "";
  }

  for (const item of Object.values(record)) {
    const found = findClaudeWidgetCodeInValue(item, depth + 1, seen);
    if (found) return found;
  }
  return "";
}

function extractClaudeVisibleTextFromHtmlFragment(html: string): string {
  const raw = String(html || "").trim();
  if (!raw || typeof DOMParser === "undefined") return raw;

  let root: Element | null = null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");
    if (/<(?:!doctype\s+html|html|head|body)\b/i.test(raw)) {
      root = doc.body || doc.documentElement;
    } else {
      doc.documentElement.innerHTML = `<head></head><body><div id="__claude_widget_root__">${raw}</div></body>`;
      root = doc.querySelector("#__claude_widget_root__");
    }
  } catch {
    root = null;
  }
  if (!root) return raw;
  const hasRenderableMedia = hasClaudeRenderableMedia(root);

  const blockTags = new Set([
    "div", "p", "section", "article", "main", "aside",
    "ul", "ol", "li", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "td", "th",
    "svg"
  ]);
  const lines: string[] = [];
  const pushLine = (text: string): void => {
    const value = normalizeClaudeVisibleLine(text);
    if (!value) return;
    if (lines[lines.length - 1] === value) return;
    lines.push(value);
  };
  const pushBlock = (text: string): void => {
    const value = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!value) return;
    const block = `\`\`\`\n${value}\n\`\`\``;
    if (lines[lines.length - 1] === block) return;
    lines.push(block);
  };

  const walk = (node: Element): void => {
    const tag = String(node.tagName || "").toLowerCase();
    if (["style", "script", "noscript", "template"].includes(tag)) return;
    if (node.getAttribute("aria-hidden") === "true") return;
    if (String(node.className || "").split(/\s+/).includes("sr-only")) return;
    if (["input", "select", "textarea", "option", "button"].includes(tag)) return;

    if (tag === "pre") {
      pushBlock(node.textContent || "");
      return;
    }
    if (tag === "code") {
      pushLine(node.textContent || "");
      return;
    }
    if (tag === "svg") {
      if (hasRenderableMedia && isClaudeExportableSvgElement(node)) return;
      const svgTexts = Array.from(node.querySelectorAll("title, desc, text"))
        .map((el) => normalizeClaudeVisibleLine(el.textContent || ""))
        .filter(Boolean);
      if (svgTexts.length) pushLine(svgTexts.join("\n"));
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1)) || 1;
      const heading = normalizeClaudeVisibleLine(node.textContent || "");
      if (heading) pushLine(`${"#".repeat(Math.min(6, level))} ${heading}`);
      return;
    }
    if (tag === "li") {
      const bullet = normalizeClaudeVisibleLine(node.textContent || "");
      if (bullet) pushLine(`- ${bullet}`);
      return;
    }

    const childElements = Array.from(node.children || []).filter((child) => {
      const childTag = String(child.tagName || "").toLowerCase();
      return !["style", "script", "noscript", "template"].includes(childTag);
    });
    const hasBlockChild = childElements.some((child) => blockTags.has(String(child.tagName || "").toLowerCase()));
    if (!hasBlockChild) {
      pushLine(node.textContent || "");
      return;
    }
    childElements.forEach(walk);
  };

  Array.from(root.children || []).forEach(walk);
  return lines.join("\n\n").trim();
}

function hasClaudeRenderableMedia(root: Element): boolean {
  const seen = new Set<Element>();
  const mediaNodes: Element[] = [];
  const pushNode = (node: Element | null): void => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    mediaNodes.push(node);
  };

  root.querySelectorAll("#vis-container svg, svg[role=\"img\"], img").forEach(pushNode);
  if (!mediaNodes.length) {
    root.querySelectorAll("svg").forEach((node) => {
      if (isClaudeExportableSvgElement(node)) pushNode(node);
    });
  }

  return mediaNodes.some((node) => {
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "img") return true;
    return tag === "svg" && hasClaudeSvgDrawableContent(node);
  });
}

function isClaudeExportableSvgElement(node: Element): boolean {
  const tag = String(node.tagName || "").toLowerCase();
  if (tag !== "svg") return false;
  if (node.closest("#vis-container")) return true;
  if (String(node.getAttribute("role") || "").toLowerCase() === "img") return true;
  if (node.querySelector("title, desc")) return true;
  if (node.querySelectorAll("text").length >= 3) return true;
  const viewBox = String(node.getAttribute("viewBox") || "").trim().split(/\s+/).map((item) => Number(item) || 0);
  const viewBoxWidth = viewBox.length === 4 ? viewBox[2] : 0;
  const viewBoxHeight = viewBox.length === 4 ? viewBox[3] : 0;
  if (viewBoxWidth >= 160 && viewBoxHeight >= 100) return true;
  const width = parseClaudeNumericDimension(node.getAttribute("width"));
  const height = parseClaudeNumericDimension(node.getAttribute("height"));
  return width >= 160 || height >= 100;
}

function hasClaudeSvgDrawableContent(node: Element): boolean {
  const scopedRoot = node.querySelector("#hole-group") || node;
  return Array.from(scopedRoot.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line, text, image"))
    .some((el) => !el.closest("defs"));
}

function parseClaudeNumericDimension(value: string | null): number {
  const match = String(value || "").trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function normalizeClaudeVisibleLine(text: string): string {
  return String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function summarizeClaudeToolInput(name: string, input: unknown): string {
  const toolName = String(name || "").trim() || "tool";
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out: string[] = [];

  if (Array.isArray(payload.loading_messages) && payload.loading_messages.length) {
    const messages = payload.loading_messages.map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
    if (messages) out.push(`加载提示: ${messages}`);
  }
  if (payload.title) out.push(`标题: ${String(payload.title).trim()}`);
  if (Array.isArray(payload.modules) && payload.modules.length) {
    const modules = payload.modules.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    if (modules) out.push(`模块: ${modules}`);
  }
  if (typeof payload.message === "string" && payload.message.trim()) out.push(`消息: ${payload.message.trim()}`);
  if (typeof payload.widget_code === "string" && payload.widget_code.trim()) out.push(payload.widget_code.trim());
  if (!out.length) {
    try {
      out.push(JSON.stringify(payload, null, 2));
    } catch {
      // Keep the tool call visible even when serialization fails.
    }
  }

  return `【工具调用: ${toolName}】\n${out.join("\n\n")}`.trim();
}

function claudeToolResultPartToText(part: Record<string, unknown>): string {
  const type = String(part.type || "").trim().toLowerCase();
  if (type !== "tool_result") return "";
  const toolName = String(part.name || "").trim();
  if (shouldIgnoreClaudeToolName(toolName)) return "";

  const resultText = extractClaudeToolResultText(part.content);
  if (isClaudeToolBoilerplateText(resultText)) return "";
  const suffix = part.is_error ? " / error" : "";
  return `【工具结果: ${toolName || "tool"}${suffix}】${resultText ? `\n${resultText}` : ""}`;
}

function extractClaudeToolResultText(content: unknown): string {
  const items = Array.isArray(content) ? content : [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const value = item as Record<string, unknown>;
      const text = typeof value.text === "string" ? value.text : "";
      return text.replace(/\r\n/g, "\n").trim();
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function isClaudeToolBoilerplateText(text: string): boolean {
  const value = String(text || "").replace(/\r\n/g, "\n").trim();
  return !value
    || /^Content rendered and shown to the user\./i.test(value)
    || /^\[This tool call rendered an interactive widget/i.test(value);
}

function shouldIgnoreClaudeToolName(name: string): boolean {
  return String(name || "").trim().toLowerCase() === "visualize:read_me";
}

function extractClaudeFileText(files?: ClaudeFilePayload[], fileSerialOffset = 0, imageSerialOffset = 0): string {
  if (!Array.isArray(files) || files.length === 0) return "";
  let imageSerial = imageSerialOffset;
  let fileSerial = fileSerialOffset;
  return files
    .map((file) => {
      const name = file.file_name || file.filename || file.name || `file-${imageSerial + fileSerial + 1}`;
      const url = getClaudeFileUrl(file);
      if (isClaudeImageFile(file)) {
        imageSerial += 1;
        return `[图片${imageSerial}] ${name}`;
      }
      fileSerial += 1;
      return url ? `[附件${fileSerial}] ${name}\n链接: ${url}` : `[附件${fileSerial}] ${name}`;
    })
    .join("\n\n");
}

function fallbackText(text?: string): string {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function extractClaudeMessageAttachments(message: ClaudeMessagePayload, messageId: string): ExportAttachment[] {
  const attachments: ExportAttachment[] = [];

  collectClaudeContentAttachments(message.content, messageId, attachments);

  (message.files || []).forEach((file, index) => {
    const fileName = String(file.file_name || file.filename || file.name || `file-${index + 1}`).trim();
    const attachment: ExportAttachment = {
      id: String(file.id || file.file_uuid || file.uuid || `${messageId}-file-${index + 1}`),
      fileName,
      mimeType: String(file.mime_type || file.file_type || "application/octet-stream")
    };
    const url = getClaudeFileUrl(file);
    if (url) attachment.url = url;
    const inlineHtml = getClaudeInlineHtmlContent(file, fileName);
    if (inlineHtml) attachment.content = inlineHtml;
    attachments.push(attachment);
  });

  return uniqueClaudeAttachments(attachments);
}

function getClaudeFileUrl(file: ClaudeFilePayload): string | undefined {
  return resolveClaudeAssetUrl(
    file.preview_url
    || file.url
    || file.download_url
    || file.downloadUrl
    || file.file_url
    || file.fileUrl
    || file.preview_asset?.url
    || file.thumbnail_url
    || file.thumbnail_asset?.url
    || file.asset?.url
    || ""
  ) || undefined;
}

function getClaudeInlineHtmlContent(file: ClaudeFilePayload, fileName: string): string {
  const mimeType = String(file.mime_type || file.file_type || "").toLowerCase();
  if (!mimeType.includes("html") && !/\.html?$/i.test(fileName)) return "";
  const source = file as Record<string, unknown>;
  const direct = [
    source.content,
    source.html,
    source.html_content,
    source.htmlContent,
    source.code,
    source.text
  ]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .find(Boolean);
  return normalizeClaudeInlineHtmlContent(direct || findClaudeWidgetCodeInValue(file), fileName);
}

function collectClaudeContentAttachments(value: unknown, messageId: string, out: ExportAttachment[], depth = 0): void {
  if (value == null || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectClaudeContentAttachments(item, messageId, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const widgetInfo = claudeWidgetInfoFromPart(obj, out.length + 1);
  if (widgetInfo) {
    out.push({
      id: `${messageId}-widget-${out.length + 1}`,
      fileName: widgetInfo.fileName,
      mimeType: "text/html",
      content: widgetInfo.inlineContent
    });
    return;
  }

  const imageAttachment = claudeImagePartToAttachment(obj, messageId, out.length + 1);
  if (imageAttachment) out.push(imageAttachment);

  ["content", "parts", "children", "files", "attachments"].forEach((key) => {
    collectClaudeContentAttachments(obj[key], messageId, out, depth + 1);
  });
}

function claudeImagePartToAttachment(part: Record<string, unknown>, messageId: string, index: number): ExportAttachment | null {
  const type = String(part.type || part.content_type || "").trim().toLowerCase();
  if (type !== "image" && type !== "image_asset_pointer" && type !== "svg") return null;

  const fileName = String(part.fileName || part.file_name || part.filename || part.name || part.title || (type === "svg" ? `image-${index}.svg` : `image-${index}`)).trim();
  const rawSvg = type === "svg" && typeof part.svg === "string" ? part.svg.trim() : "";
  const attachment: ExportAttachment = {
    id: `${messageId}-image-${index}`,
    fileName,
    mimeType: String(part.mime_type || part.file_type || part.media_type || (type === "svg" ? "image/svg+xml" : "image/*"))
  };
  const url = resolveClaudeAssetUrl(part.url || part.preview_url || part.previewUrl || part.src || "") || svgDataUrl(rawSvg);
  if (url) attachment.url = url;
  return attachment;
}

function isClaudeSvgPart(part: Record<string, unknown>): boolean {
  return String(part.type || part.content_type || "").trim().toLowerCase() === "svg";
}

interface ClaudeWidgetInfo {
  fileName: string;
  inlineContent: string;
  visibleText: string;
}

function claudeWidgetInfoFromPart(part: Record<string, unknown>, index: number): ClaudeWidgetInfo | null {
  const type = String(part.type || "").trim().toLowerCase();
  const toolName = String(part.name || "").trim();
  if (type !== "tool_use" && type !== "tool_result") return null;
  if (shouldIgnoreClaudeToolName(toolName)) return null;
  if (type === "tool_use" && toolName !== "visualize:show_widget") return null;

  const widgetCode = findClaudeWidgetCodeInValue(type === "tool_use" ? part.input : part.content) || findClaudeWidgetCodeInValue(part);
  if (!widgetCode) return null;

  const fileName = inferClaudeWidgetFileName(widgetCode, index);
  const inlineContent = buildClaudeWidgetHtmlDocument(widgetCode, fileName.replace(/\.html?$/i, ""));
  return {
    fileName,
    inlineContent,
    visibleText: extractClaudeVisibleTextFromHtmlFragment(inlineContent)
  };
}

function countClaudeWidgetParts(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((part) => part && typeof part === "object" && claudeWidgetInfoFromPart(part as Record<string, unknown>, 1)).length;
}

function countClaudeImageParts(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((part) => {
    if (!part || typeof part !== "object") return false;
    return Boolean(claudeImagePartToAttachment(part as Record<string, unknown>, "image", 1));
  }).length;
}

function inferClaudeWidgetFileName(widgetCode: string, index: number): string {
  const raw = String(widgetCode || "").trim();
  let title = "";
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div id="__claude_widget_file_root__">${raw}</div>`, "text/html");
      title = String(
        doc.querySelector("title")?.textContent
        || doc.querySelector("h1, h2, [id=\"hole-title\"]")?.textContent
        || ""
      ).trim();
    } catch {
      title = "";
    }
  }
  if (!title) {
    title = String(raw.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1] || "")
      .replace(/<[^>]+>/g, "")
      .trim();
  }
  return `${sanitizeClaudeWidgetFileBase(title || `交互演示${index}`)}.html`;
}

function buildClaudeWidgetHtmlDocument(widgetCode: string, title: string): string {
  const raw = removeClaudePromptSuggestionsFromHtml(widgetCode);
  const safeTitle = escapeClaudeHtmlText(title || "Claude 交互演示");
  if (/<(?:!doctype\s+html|html|head|body)\b/i.test(raw)) return raw;
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `<title>${safeTitle}</title>`,
    "<style>",
    ":root{--color-border-primary:#94a3b8;--color-border-secondary:#cbd5e1;--color-border-tertiary:#e2e8f0;--color-background-primary:#ffffff;--color-background-secondary:#f8fafc;--color-background-info:#dbeafe;--color-text-primary:#0f172a;--color-text-secondary:#475569;--color-text-tertiary:#64748b;--color-text-info:#1d4ed8;--border-radius-md:10px;--border-radius-lg:16px;font-family:\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif;}",
    "body{margin:0;padding:24px;background:#f8fafc;color:#0f172a;}",
    "button,input,select,textarea{font:inherit;}",
    "</style>",
    "</head>",
    "<body>",
    raw,
    "</body>",
    "</html>"
  ].join("");
}

function normalizeClaudeInlineHtmlContent(html: string, title: string): string {
  const raw = removeClaudePromptSuggestionsFromHtml(String(html || "").trim());
  if (!raw) return "";
  if (/<(?:!doctype\s+html|html|head|body)\b/i.test(raw)) return raw;
  return buildClaudeWidgetHtmlDocument(raw, String(title || "Claude 交互演示").replace(/\.html?$/i, ""));
}

function removeClaudePromptSuggestionsFromHtml(html: string): string {
  const raw = String(html || "").trim();
  if (!raw || !/\bsendPrompt\s*\(/.test(raw)) return raw;

  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "text/html");
      pruneClaudePromptSuggestionNodes(doc);
      Array.from(doc.querySelectorAll("script")).forEach((el) => {
        const code = String(el.textContent || "");
        if (/\bsendPrompt\s*=|\bsendPrompt\s*\(/.test(code) && !/\b(addEventListener|querySelector|querySelectorAll|getElementById)\b/.test(code)) {
          el.remove();
        }
      });
      if (/<(?:!doctype\s+html|html|head|body)\b/i.test(raw)) {
        const doctype = /^<!doctype/i.test(raw) ? "<!doctype html>\n" : "";
        return doctype + (doc.documentElement?.outerHTML || raw);
      }
      const headStyles = Array.from(doc.head?.querySelectorAll("style") || [])
        .map((el) => el.outerHTML)
        .join("\n");
      const bodyHtml = doc.body ? doc.body.innerHTML.trim() : "";
      return [headStyles, bodyHtml].filter(Boolean).join("\n").trim() || raw;
    } catch {
      // Fall back to simple button/link stripping below.
    }
  }

  return raw
    .replace(/<button\b[^>]*\bonclick=(["'])[^"']*\bsendPrompt\s*\([^"']*\1[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<a\b[^>]*\bonclick=(["'])[^"']*\bsendPrompt\s*\([^"']*\1[^>]*>[\s\S]*?<\/a>/gi, "")
    .trim();
}

function pruneClaudePromptSuggestionNodes(root: Document | Element): void {
  const isPromptSuggestionNode = (el: Element): boolean => {
    const onclick = String(el.getAttribute("onclick") || "").trim();
    if (/\bsendPrompt\s*\(/.test(onclick)) return true;
    const role = String(el.getAttribute("role") || "").trim().toLowerCase();
    const href = String(el.getAttribute("href") || "").trim();
    return (role === "button" || href === "#") && /\bsendPrompt\s*\(/i.test(String(el.outerHTML || ""));
  };

  Array.from(root.querySelectorAll("*")).forEach((el) => {
    if (!isPromptSuggestionNode(el)) return;
    const parent = el.parentElement;
    el.remove();
    let current = parent;
    while (current && current !== root && current.children.length === 0 && !String(current.textContent || "").trim()) {
      const next = current.parentElement;
      current.remove();
      current = next;
    }
  });
}

function sanitizeClaudeWidgetFileBase(value: string): string {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    || "Claude 交互演示";
}

function escapeClaudeHtmlText(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgDataUrl(svg: string): string {
  const raw = String(svg || "").trim();
  return raw ? `data:image/svg+xml;utf8,${encodeURIComponent(raw)}` : "";
}

function uniqueClaudeAttachments(attachments: ExportAttachment[]): ExportAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = [attachment.id, attachment.url, attachment.fileName].filter(Boolean).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isClaudeImageFile(file: ClaudeFilePayload): boolean {
  const fileKind = String(file.file_kind || file.kind || "").trim().toLowerCase();
  const mimeType = String(file.mime_type || file.file_type || "").trim().toLowerCase();
  return fileKind === "image"
    || mimeType.startsWith("image/")
    || Boolean(file.preview_asset?.url || file.thumbnail_asset?.url || file.thumbnail_url);
}

function resolveClaudeAssetUrl(rawUrl: unknown): string {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, "https://claude.ai").href;
  } catch {
    return raw;
  }
}
