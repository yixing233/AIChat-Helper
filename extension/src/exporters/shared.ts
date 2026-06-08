import type { ExportAttachment } from "../shared/types";

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
  return attachment.url ? `Attachment: ${label} <${attachment.url}>` : `Attachment: ${label}`;
}

export function formatAttachmentMarkdown(attachment: ExportAttachment): string {
  const label = attachment.fileName || attachment.id || "attachment";
  return attachment.url ? `[${label}](${attachment.url})` : label;
}

export function formatAttachmentHtml(attachment: ExportAttachment): string {
  const label = escapeHtml(attachment.fileName || attachment.id || "attachment");
  const mimeType = attachment.mimeType ? ` <small>${escapeHtml(attachment.mimeType)}</small>` : "";

  if (attachment.url) {
    return `<li><a href="${escapeHtml(attachment.url)}">${label}</a>${mimeType}</li>`;
  }

  return `<li>${label}${mimeType}</li>`;
}
