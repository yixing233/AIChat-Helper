import type { Exporter } from "../shared/types";
import { formatAttachmentMarkdown, safeFileName } from "./shared";

export const markdownExporter: Exporter = {
  format: "markdown",
  async export(snapshot) {
    const lines = [`# ${snapshot.title}`, ""];
    snapshot.messages.forEach((message) => {
      lines.push(`## ${message.role}`, "", message.text, "");
      if (message.attachments?.length) {
        lines.push("### Attachments", "");
        message.attachments.forEach((attachment) => {
          lines.push(`- ${formatAttachmentMarkdown(attachment)}`);
        });
        lines.push("");
      }
    });
    if (snapshot.attachments.length) {
      lines.push("## Attachments", "");
      snapshot.attachments.forEach((attachment) => {
        lines.push(`- ${formatAttachmentMarkdown(attachment)}`);
      });
      lines.push("");
    }

    return [{
      path: `${safeFileName(snapshot.title)}.md`,
      mimeType: "text/markdown;charset=utf-8",
      content: lines.join("\n")
    }];
  }
};
