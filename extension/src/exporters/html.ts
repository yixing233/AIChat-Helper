import type { Exporter } from "../shared/types";
import { escapeHtml, safeFileName } from "./shared";

export const htmlExporter: Exporter = {
  format: "html",
  async export(snapshot) {
    const messages = snapshot.messages
      .map((message) => `<section><strong>${escapeHtml(message.role)}</strong><p>${escapeHtml(message.text)}</p></section>`)
      .join("\n");
    const title = escapeHtml(snapshot.title);

    return [{
      path: `${safeFileName(snapshot.title)}.html`,
      mimeType: "text/html;charset=utf-8",
      content: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${messages}</body></html>`
    }];
  }
};
