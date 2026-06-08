import type { Exporter } from "../shared/types";
import { formatAttachmentText, safeFileName } from "./shared";

export const txtExporter: Exporter = {
  format: "txt",
  async export(snapshot) {
    const messages = snapshot.messages.map((message) => {
      const lines = [`${message.role}: ${message.text}`];
      message.attachments?.forEach((attachment) => {
        lines.push(formatAttachmentText(attachment));
      });
      return lines.join("\n");
    });
    if (snapshot.attachments.length) {
      messages.push(["Attachments:", ...snapshot.attachments.map(formatAttachmentText)].join("\n"));
    }

    return [{
      path: `${safeFileName(snapshot.title)}.txt`,
      mimeType: "text/plain;charset=utf-8",
      content: messages.join("\n\n")
    }];
  }
};
