import type { ConversationSnapshot, ExportAttachment, ExportFile } from "../shared/types";
import { exporters } from ".";
import { renderMessageExportHtml, renderMessageMarkdown } from "./html";
import { escapeHtml, formatAssistantName, formatAttachmentHtml, formatAttachmentMarkdown, formatAttachmentText, formatMessageExportText, getMessageAttachmentsForExport, safeFileName } from "./shared";
import { createZip } from "./zip";

export type SnapshotExportFormat = keyof typeof exporters | "zip";

export async function exportSnapshot(snapshot: ConversationSnapshot, format: SnapshotExportFormat): Promise<ExportFile[]> {
  const archiveBundle = await buildImageArchiveBundle([snapshot]);
  const exportSnapshot = archiveBundle.hasArchiveEntries
    ? rewriteSnapshotArchiveUrls(snapshot, archiveBundle.urlMap, archiveBundle.attachmentPathMap)
    : snapshot;
  const attachmentFiles = collectAttachmentFiles(exportSnapshot);
  const exportBaseName = getCurrentExportBaseName(exportSnapshot);

  if (format !== "zip") {
    const files = [
      ...renameCurrentMainFiles(await exporters[format].export(exportSnapshot), exportBaseName),
      ...attachmentFiles
    ];
    const shouldPackageCompanionFiles = archiveBundle.hasArchiveEntries || attachmentFiles.length > 0;

    if (!shouldPackageCompanionFiles) return files;

    return [{
      path: `${exportBaseName}.zip`,
      mimeType: "application/zip",
      content: createZip([
        ...files,
        ...archiveBundle.files,
        ...buildArchiveReadmeFiles(archiveBundle, collectUsedRootFileNames(files))
      ])
    }];
  }

  const files = [
    ...renameCurrentMainFiles(await exporters.html.export(exportSnapshot), exportBaseName),
    ...renameCurrentMainFiles(await exporters.markdown.export(exportSnapshot), exportBaseName),
    ...renameCurrentMainFiles(await exporters.txt.export(exportSnapshot), exportBaseName),
    ...attachmentFiles,
    ...archiveBundle.files
  ];
  files.push(...buildArchiveReadmeFiles(archiveBundle, collectUsedRootFileNames(files)));

  return [{
    path: `${exportBaseName}.zip`,
    mimeType: "application/zip",
    content: createZip(files)
  }];
}

function getCurrentExportBaseName(snapshot: ConversationSnapshot): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_");
  return safeFileName(`${formatAssistantName(snapshot)}_Export_${stamp}`);
}

function renameCurrentMainFiles(files: ExportFile[], baseNameValue: string): ExportFile[] {
  return files.map((file) => {
    const ext = normalizeBatchFileExtension(file.path.match(/\.([a-z0-9]+)$/i)?.[1] || "");
    if (!["html", "md", "txt"].includes(ext)) return file;
    return {
      ...file,
      path: `${baseNameValue}.${ext}`
    };
  });
}

export async function exportBatchSnapshots(snapshots: ConversationSnapshot[], format: SnapshotExportFormat): Promise<ExportFile[]> {
  const entries: ExportFile[] = [];
  const archiveBundle = await buildImageArchiveBundle(snapshots);
  const usedBatchNames = new Set<string>();
  const usedAttachmentPaths = new Set<string>();

  for (const snapshot of snapshots) {
    const exportSnapshot = archiveBundle.hasArchiveEntries
      ? rewriteSnapshotArchiveUrls(snapshot, archiveBundle.urlMap, archiveBundle.attachmentPathMap)
      : snapshot;
    const files = format === "zip"
      ? [
        ...(await exporters.html.export(exportSnapshot)),
        ...(await exporters.markdown.export(exportSnapshot)),
        ...(await exporters.txt.export(exportSnapshot)),
        ...collectAttachmentFiles(exportSnapshot)
      ]
      : [
        buildBatchMainExportFile(exportSnapshot, format),
        ...collectAttachmentFiles(exportSnapshot)
      ];
    const outputFiles = format === "zip"
      ? files.map((file) => addBatchMetadataToMainFile(file, exportSnapshot))
      : files;

    outputFiles.forEach((file) => {
      entries.push({
        ...file,
        path: getBatchEntryPath(file.path, exportSnapshot, usedBatchNames, usedAttachmentPaths)
      });
    });
  }

  entries.push(...archiveBundle.files, ...buildArchiveReadmeFiles(archiveBundle, usedBatchNames));

  return [{
    path: getBatchExportZipPath(snapshots, format),
    mimeType: "application/zip",
    content: createZip(entries)
  }];
}

function buildBatchMainExportFile(snapshot: ConversationSnapshot, format: Exclude<SnapshotExportFormat, "zip">): ExportFile {
  const ext = normalizeBatchFileExtension(format);
  const path = `${safeFileName(snapshot.title)}.${ext}`;
  if (ext === "html") {
    return {
      path,
      mimeType: "text/html;charset=utf-8",
      content: buildBatchConversationPrintableHtml(snapshot)
    };
  }
  if (ext === "md") {
    return {
      path,
      mimeType: "text/markdown;charset=utf-8",
      content: buildBatchConversationMarkdown(snapshot)
    };
  }
  return {
    path,
    mimeType: "text/plain;charset=utf-8",
    content: buildBatchConversationText(snapshot)
  };
}

interface ImageArchiveBundle {
  hasImages: boolean;
  hasArchiveEntries: boolean;
  urlMap: Record<string, string>;
  attachmentPathMap: Record<string, string>;
  files: ExportFile[];
  readmeLines: string[];
}

async function buildImageArchiveBundle(snapshots: ConversationSnapshot[]): Promise<ImageArchiveBundle> {
  const urls = collectExportImageUrls(snapshots);
  const inlineFiles = collectExportInlineFiles(snapshots);
  const urlMap: Record<string, string> = {};
  const attachmentPathMap: Record<string, string> = {};
  const files: ExportFile[] = [];
  const readmeLines: string[] = [];
  const usedNames = new Set<string>();
  const usedFileNames = new Set<string>();

  for (const [index, url] of urls.entries()) {
    try {
      const resource = await fetchBinaryResource(url);
      const ext = getImageExtensionFromUrl(url, resource.contentType);
      const path = `images/${uniqueArchiveFileName(`image-${String(index + 1).padStart(3, "0")}`, ext, usedNames)}`;
      urlMap[url] = path;
      files.push({
        path,
        mimeType: resource.contentType || `image/${ext === "jpg" ? "jpeg" : ext}`,
        content: resource.bytes
      });
    } catch (error) {
      readmeLines.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  inlineFiles.forEach((file, index) => {
    const base = baseName(file.fileName).replace(/\.[a-z0-9]+$/i, "") || `交互演示${index + 1}`;
    const path = `files/${getUniqueBatchFileName(base, file.ext || "html", usedFileNames)}`;
    attachmentPathMap[file.key] = path;
    if (file.url) urlMap[file.url] = path;
    files.push({
      path,
      mimeType: file.mimeType || "text/html;charset=utf-8",
      content: file.content
    });
  });

  return {
    hasImages: urls.length > 0,
    hasArchiveEntries: urls.length > 0 || inlineFiles.length > 0,
    urlMap,
    attachmentPathMap,
    files,
    readmeLines: readmeLines.length
      ? ["以下图片下载失败，导出文件中会保留原始图片 URL：", ...readmeLines]
      : []
  };
}

function buildArchiveReadmeFiles(bundle: ImageArchiveBundle, usedRootNames = new Set<string>()): ExportFile[] {
  if (!bundle.readmeLines.length) return [];
  return [{
    path: getUniqueBatchFileName("README", "txt", usedRootNames),
    mimeType: "text/plain;charset=utf-8",
    content: bundle.readmeLines.join("\n")
  }];
}

function collectUsedRootFileNames(files: ExportFile[]): Set<string> {
  const used = new Set<string>();
  files.forEach((file) => {
    const path = String(file.path || "");
    if (!path || path.includes("/")) return;
    used.add(path);
  });
  return used;
}

function collectExportImageUrls(snapshots: ConversationSnapshot[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const pushUrl = (raw: string | undefined, attachment?: ExportAttachment) => {
    const url = String(raw || "").trim();
    if (!isHttpUrl(url) || seen.has(url)) return;
    if (attachment && !isImageAttachment(attachment)) return;
    seen.add(url);
    urls.push(url);
  };

  snapshots.forEach((snapshot) => {
    snapshot.attachments.forEach((attachment) => {
      if (attachment.content === undefined) pushUrl(attachment.url, attachment);
    });
    snapshot.messages.forEach((message) => {
      message.attachments?.forEach((attachment) => {
        if (attachment.content === undefined) pushUrl(attachment.url, attachment);
      });
      collectImageUrlsFromText(message.text).forEach((url) => pushUrl(url));
    });
  });

  return urls;
}

interface InlineArchiveFile {
  key: string;
  fileName: string;
  ext: string;
  mimeType: string;
  content: string;
  url?: string;
}

function collectExportInlineFiles(snapshots: ConversationSnapshot[]): InlineArchiveFile[] {
  const files: InlineArchiveFile[] = [];
  const seen = new Set<string>();

  snapshots.forEach((snapshot) => {
    snapshot.attachments.forEach((attachment) => {
      pushInlineArchiveFile(files, seen, snapshot, "global", attachment);
    });
    snapshot.messages.forEach((message) => {
      message.attachments?.forEach((attachment) => {
        pushInlineArchiveFile(files, seen, snapshot, message.id, attachment);
      });
    });
  });

  return files;
}

function pushInlineArchiveFile(
  files: InlineArchiveFile[],
  seen: Set<string>,
  snapshot: ConversationSnapshot,
  ownerId: string,
  attachment: ExportAttachment
): void {
  const content = typeof attachment.content === "string" ? attachment.content.trim() : "";
  if (!content || !isHtmlAttachment(attachment)) return;

  const key = getAttachmentArchiveKey(snapshot, ownerId, attachment);
  if (seen.has(key)) return;
  seen.add(key);

  const fileName = attachment.fileName || "交互演示.html";
  files.push({
    key,
    fileName,
    ext: getFileExtension(fileName) || "html",
    mimeType: attachment.mimeType || "text/html;charset=utf-8",
    content,
    url: attachment.url
  });
}

function collectImageUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  const push = (raw: string) => {
    const url = String(raw || "").trim().replace(/[),.;，。；]+$/g, "");
    if (isHttpUrl(url)) urls.push(url);
  };

  String(text || "").replace(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi, (_, url: string) => {
    push(url);
    return "";
  });
  String(text || "").replace(/\[图片[^\]]*]\s+(https?:\/\/\S+)/gi, (_, url: string) => {
    push(url);
    return "";
  });

  return urls;
}

async function fetchBinaryResource(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (typeof fetch !== "function") throw new Error("fetch is not available");
  const attempts: RequestInit[] = [
    { method: "GET", credentials: "include", cache: "no-store" },
    { method: "GET", credentials: "same-origin", cache: "no-store" },
    { method: "GET", cache: "no-store" }
  ];
  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") || ""
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("图片下载失败");
}

function rewriteSnapshotArchiveUrls(
  snapshot: ConversationSnapshot,
  urlMap: Record<string, string>,
  attachmentPathMap: Record<string, string>
): ConversationSnapshot {
  return {
    ...snapshot,
    attachments: snapshot.attachments.map((attachment) => rewriteAttachmentArchiveUrl(snapshot, "global", attachment, urlMap, attachmentPathMap)),
    messages: snapshot.messages.map((message) => {
      let text = replaceTextByUrlMap(message.text, urlMap);
      const attachments = message.attachments?.map((attachment) => {
        const rewritten = rewriteAttachmentArchiveUrl(snapshot, message.id, attachment, urlMap, attachmentPathMap);
        if (attachment.url && rewritten.url && rewritten.url !== attachment.url) {
          text = replaceTextByUrlMap(text, { [attachment.url]: rewritten.url });
        }
        return rewritten;
      });
      return {
        ...message,
        text,
        attachments
      };
    })
  };
}

function rewriteAttachmentArchiveUrl(
  snapshot: ConversationSnapshot,
  ownerId: string,
  attachment: ExportAttachment,
  urlMap: Record<string, string>,
  attachmentPathMap: Record<string, string>
): ExportAttachment {
  const archivedAttachmentPath = isHtmlAttachment(attachment)
    ? attachmentPathMap[getAttachmentArchiveKey(snapshot, ownerId, attachment)]
    : "";
  const replacement = archivedAttachmentPath || (attachment.url ? urlMap[attachment.url] : "");
  return replacement ? { ...attachment, url: replacement } : { ...attachment };
}

function replaceTextByUrlMap(text: string, urlMap: Record<string, string>): string {
  let out = String(text || "");
  Object.entries(urlMap)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([from, to]) => {
      if (!from || !to) return;
      out = out.split(from).join(to);
      const escapedFrom = escapeHtml(from);
      if (escapedFrom && escapedFrom !== from) {
        out = out.split(escapedFrom).join(escapeHtml(to));
      }
    });
  return out;
}

function getImageExtensionFromUrl(url: string, contentType = ""): string {
  const type = String(contentType || "").toLowerCase().split(";")[0].trim();
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "image/avif": "avif"
  };
  if (byType[type]) return byType[type];

  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {
    // Fall through to the default below.
  }

  return "png";
}

function uniqueArchiveFileName(baseNameValue: string, extension: string, usedNames: Set<string>): string {
  const base = safeFileName(baseNameValue);
  const ext = String(extension || "png").replace(/^\./, "") || "png";
  let candidate = `${base}.${ext}`;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}-${index}.${ext}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function getBatchEntryPath(
  filePath: string,
  snapshot: ConversationSnapshot,
  usedBatchNames: Set<string>,
  usedAttachmentPaths: Set<string>
): string {
  const fileName = baseName(filePath);
  const mainExt = fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "";
  const expectedBase = safeFileName(snapshot.title);
  const actualBase = mainExt ? fileName.slice(0, -mainExt.length - 1) : fileName;

  if (actualBase === expectedBase && ["html", "md", "markdown", "txt"].includes(mainExt.toLowerCase())) {
    return getUniqueBatchFileName(snapshot.title || snapshot.conversationId || "会话", normalizeBatchFileExtension(mainExt), usedBatchNames);
  }

  return uniquePath(filePath, usedAttachmentPaths);
}

function addBatchMetadataToMainFile(file: ExportFile, snapshot: ConversationSnapshot): ExportFile {
  if (typeof file.content !== "string") return file;

  const fileName = baseName(file.path);
  const ext = normalizeBatchFileExtension(fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "");
  const expectedBase = safeFileName(snapshot.title);
  const actualBase = fileName.includes(".") ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName;
  if (actualBase !== expectedBase || !["html", "md", "txt"].includes(ext)) return file;

  return {
    ...file,
    content: decorateBatchContent(file.content, ext, snapshot)
  };
}

function decorateBatchContent(content: string, extension: string, snapshot: ConversationSnapshot): string {
  if (extension === "html") {
    const metaHtml = [
      `<div class="meta">`,
      `会话ID: ${escapeHtml(snapshot.conversationId || "-")}<br>`,
      `更新时间: ${escapeHtml(getBatchUpdatedAt(snapshot))}<br>`,
      `消息数: ${escapeHtml(String(getBatchMessageCount(snapshot)))}`,
      `</div>`
    ].join("");
    if (/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(content)) {
      return content.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${metaHtml}`);
    }
    if (/<body\b[^>]*>/i.test(content)) {
      return content.replace(/(<body\b[^>]*>)/i, `$1${metaHtml}`);
    }
    return `${metaHtml}${content}`;
  }

  if (extension === "md") {
    const metaMarkdown = [
      `- 会话ID: ${snapshot.conversationId || "-"}`,
      `- 更新时间: ${getBatchUpdatedAt(snapshot)}`,
      `- 消息数: ${getBatchMessageCount(snapshot)}`
    ].join("\n");
    if (/^#\s+.+(?:\r?\n){1,2}/.test(content)) {
      return content.replace(/^(#\s+.+(?:\r?\n){1,2})/, `$1${metaMarkdown}\n\n`);
    }
    return `# ${snapshot.title || `会话 ${snapshot.conversationId || "-"}`}\n\n${metaMarkdown}\n\n${content}`;
  }

  const metaText = [
    snapshot.title || `会话 ${snapshot.conversationId || "-"}`,
    `会话ID: ${snapshot.conversationId || "-"}`,
    `更新时间: ${getBatchUpdatedAt(snapshot)}`,
    `消息数: ${getBatchMessageCount(snapshot)}`
  ].join("\n");
  return `${metaText}\n${content}`;
}

function buildBatchConversationMarkdown(snapshot: ConversationSnapshot): string {
  const assistantName = getPlatformExportLabel(snapshot.platformId);
  const header = [
    `# ${snapshot.title || `会话 ${snapshot.conversationId || "-"}`}`,
    "",
    `- 会话ID: ${snapshot.conversationId || "-"}`,
    `- 更新时间: ${getBatchUpdatedAt(snapshot)}`,
    `- 消息数: ${getBatchMessageCount(snapshot)}`
  ].join("\n");
  const body = snapshot.messages
    .map((message, index) => {
      const attachments = getMessageAttachmentsForExport(snapshot, message);
      const parts = [
        "",
        `## ${index + 1}. ${message.role === "user" ? "用户" : assistantName}`,
        "",
        formatMessageExportText(snapshot, message, "markdown")
      ];
      if (attachments.length) {
        parts.push("", "### 附件", "");
        attachments.forEach((attachment) => {
          const rendered = formatAttachmentMarkdown(attachment);
          parts.push(rendered.includes("\n") ? rendered : `- ${rendered}`);
        });
      }
      return parts.join("\n");
    })
    .join("\n");
  const attachments = snapshot.attachments.length
    ? ["", "## 附件", "", ...snapshot.attachments.map((attachment) => {
      const rendered = formatAttachmentMarkdown(attachment);
      return rendered.includes("\n") ? rendered : `- ${rendered}`;
    })].join("\n")
    : "";
  return `${header}\n${body}${attachments}`.trim();
}

function buildBatchConversationText(snapshot: ConversationSnapshot): string {
  const assistantName = getPlatformExportLabel(snapshot.platformId);
  const header = [
    snapshot.title || `会话 ${snapshot.conversationId || "-"}`,
    `会话ID: ${snapshot.conversationId || "-"}`,
    `更新时间: ${getBatchUpdatedAt(snapshot)}`,
    `消息数: ${getBatchMessageCount(snapshot)}`
  ].join("\n");
  const body = snapshot.messages
    .map((message, index) => {
      const attachments = getMessageAttachmentsForExport(snapshot, message);
      const parts = [
        "",
        `[${index + 1}] ${message.role === "user" ? "用户" : assistantName}`,
        formatMessageExportText(snapshot, message, "txt")
      ];
      attachments.forEach((attachment) => parts.push(formatAttachmentText(attachment)));
      return parts.join("\n");
    })
    .join("\n");
  const attachments = snapshot.attachments.length
    ? ["", "[附件]", ...snapshot.attachments.map(formatAttachmentText)].join("\n")
    : "";
  return `${header}\n${body}${attachments}`.trim();
}

function buildBatchConversationPrintableHtml(snapshot: ConversationSnapshot): string {
  const assistantName = getPlatformExportLabel(snapshot.platformId);
  const rows = snapshot.messages.map((message, index) => {
    return `
      <div class="msg">
        <div class="role">${index + 1}. ${message.role === "user" ? "用户" : escapeHtml(assistantName)}</div>
        <div class="text">${renderMessageExportHtml(snapshot, message)}</div>
      </div>
    `.trim();
  }).join("");
  const attachments = snapshot.attachments.length
    ? `<div class="msg"><div class="role">附件</div><div class="text"><ul>${snapshot.attachments.map(formatAttachmentHtml).join("")}</ul></div></div>`
    : "";
  return `
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(snapshot.title || `会话 ${snapshot.conversationId || "-"}`)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color:#0f172a; margin:0; padding:0; }
        .head { margin-bottom: 14px; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
        .platform { font-size: 12px; color: #64748b; margin-bottom: 6px; }
        .title { font-size: 18px; font-weight: 700; }
        .meta { margin-top: 6px; color: #475569; font-size: 12px; line-height: 1.6; }
        .msg { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin: 10px 0; }
        .role { font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 6px; }
        .text { font-size: 13px; line-height: 1.7; white-space: normal; word-break: break-word; }
        .text pre { font-family: "Consolas", "Monaco", "Courier New", monospace; }
        .text code { font-family: "Consolas", "Monaco", "Courier New", monospace; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
        .m-preview-media img { max-width: 100%; max-height: 320px; width: auto; height: auto; object-fit: contain; }
        .claude-image-block { margin: 14px 0 18px; padding: 12px; border: 1px solid #dbeafe; border-radius: 12px; background: #f8fbff; }
        .claude-image-block img { display: block; max-width: 100%; max-height: 480px; width: auto; height: auto; margin: 0 auto; border-radius: 8px; border: 1px solid #dbeafe; background: #fff; object-fit: contain; }
        .claude-image-block figcaption { margin-top: 8px; font-size: 12px; color: #475569; text-align: center; }
        .claude-inline-svg { display: flex; justify-content: center; overflow-x: auto; }
        .claude-inline-svg svg { max-width: 100%; height: auto; }
      </style>
    </head>
    <body>
      <section class="conv">
        <div class="head">
          <div class="platform">${escapeHtml(assistantName)} 批量导出</div>
          <div class="title">${escapeHtml(snapshot.title || `会话 ${snapshot.conversationId || "-"}`)}</div>
          <div class="meta">
            会话ID: ${escapeHtml(snapshot.conversationId || "-")}<br>
            更新时间: ${escapeHtml(getBatchUpdatedAt(snapshot))}<br>
            消息数: ${escapeHtml(String(getBatchMessageCount(snapshot)))}
          </div>
        </div>
        ${rows || '<div class="meta">该会话暂无可导出的消息内容。</div>'}
        ${attachments}
      </section>
    </body>
    </html>
  `.trim();
}

function getBatchUpdatedAt(snapshot: ConversationSnapshot): string {
  return String(snapshot.updatedAtText || snapshot.updatedAt || snapshot.createdAtText || snapshot.createdAt || "-");
}

function getBatchMessageCount(snapshot: ConversationSnapshot): number {
  if (typeof snapshot.messageCount === "number" && Number.isFinite(snapshot.messageCount)) {
    return Math.max(0, Math.floor(snapshot.messageCount));
  }
  return snapshot.messages.length || 0;
}

function getUniqueBatchFileName(baseNameValue: string, extension: string, usedNames: Set<string>): string {
  const safeBase = sanitizeBatchExportFileName(baseNameValue);
  const ext = normalizeBatchFileExtension(extension);
  let candidate = `${safeBase}.${ext}`;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${safeBase} (${index}).${ext}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function sanitizeBatchExportFileName(name: string, fallback = "会话"): string {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return (cleaned || fallback).slice(0, 80);
}

function normalizeBatchFileExtension(extension: string): string {
  const ext = String(extension || "").replace(/^\./, "").toLowerCase();
  return ext === "markdown" ? "md" : (ext || "txt");
}

function getBatchExportZipPath(snapshots: ConversationSnapshot[], format: SnapshotExportFormat): string {
  const platformId = snapshots.find((snapshot) => snapshot.platformId)?.platformId || "chatgpt";
  const platform = getPlatformExportLabel(platformId);
  const formatLabel = format === "markdown" ? "md" : normalizeBatchFileExtension(format);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_");
  return `${platform}_批量导出_${formatLabel}_${stamp}.zip`;
}

function getPlatformExportLabel(platformId: ConversationSnapshot["platformId"]): string {
  const labels: Record<ConversationSnapshot["platformId"], string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    qwen: "千问",
    doubao: "豆包",
    deepseek: "DeepSeek"
  };
  return labels[platformId] || "AI";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isImageUrl(value: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:$|[?#])/i.test(String(value || ""));
}

function collectAttachmentFiles(snapshot: ConversationSnapshot): ExportFile[] {
  const files: ExportFile[] = [];
  const usedPaths = new Set<string>();

  snapshot.attachments.forEach((attachment) => {
    pushAttachmentFile(files, usedPaths, "global", attachment);
  });

  snapshot.messages.forEach((message) => {
    message.attachments?.forEach((attachment) => {
      pushAttachmentFile(files, usedPaths, message.id, attachment);
    });
  });

  return files;
}

function isImageAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return isImageUrl(attachment.fileName || attachment.url || "");
}

function pushAttachmentFile(files: ExportFile[], usedPaths: Set<string>, ownerId: string, attachment: ExportAttachment): void {
  if (attachment.content === undefined) return;
  if (isHtmlAttachment(attachment)) return;

  const folder = safeFileName(ownerId || attachment.id || "attachment");
  const fileName = safeFileName(baseName(attachment.fileName || attachment.id || "attachment"));
  const path = uniquePath(`attachments/${folder}/${fileName}`, usedPaths);
  files.push({
    path,
    mimeType: attachment.mimeType || "application/octet-stream",
    content: attachment.content
  });
}

function baseName(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).pop() || "attachment";
}

function getFileExtension(path: string): string {
  return baseName(path).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "";
}

function isHtmlAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return mimeType.includes("html") || /\.html?$/i.test(attachment.fileName || "");
}

function getAttachmentArchiveKey(snapshot: ConversationSnapshot, ownerId: string, attachment: ExportAttachment): string {
  return [
    snapshot.conversationId || "current",
    ownerId || "global",
    attachment.id || "",
    attachment.fileName || ""
  ].join("\u0000");
}

function uniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const slashIndex = path.lastIndexOf("/");
  const folder = slashIndex >= 0 ? `${path.slice(0, slashIndex + 1)}` : "";
  const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";

  let index = 2;
  let candidate = `${folder}${base}-${index}${ext}`;
  while (usedPaths.has(candidate)) {
    index += 1;
    candidate = `${folder}${base}-${index}${ext}`;
  }
  usedPaths.add(candidate);
  return candidate;
}
