import type { Exporter } from "../shared/types";
import { escapeHtml, formatAttachmentHtml, safeFileName } from "./shared";

export const htmlExporter: Exporter = {
  format: "html",
  async export(snapshot) {
    const messages = snapshot.messages
      .map((message) => {
        const attachments = message.attachments?.length
          ? `<ul>${message.attachments.map(formatAttachmentHtml).join("")}</ul>`
          : "";
        return `<section><strong>${escapeHtml(message.role)}</strong><p>${escapeHtml(message.text)}</p>${attachments}</section>`;
      })
      .join("\n");
    const title = escapeHtml(snapshot.title);
    const globalAttachments = snapshot.attachments.length
      ? `<section><h2>Attachments</h2><ul>${snapshot.attachments.map(formatAttachmentHtml).join("")}</ul></section>`
      : "";

    return [{
      path: `${safeFileName(snapshot.title)}.html`,
      mimeType: "text/html;charset=utf-8",
      content: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${messages}${globalAttachments}</body></html>`
    }];
  }
};
