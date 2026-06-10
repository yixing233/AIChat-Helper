import type { Exporter } from "../shared/types";
import { formatAssistantName, formatAttachmentMarkdown, formatDeepSeekMetadataMarkdown, formatMessageExportText, getMessageAttachmentsForExport, safeFileName } from "./shared";

export const markdownExporter: Exporter = {
  format: "markdown",
  async export(snapshot) {
    const lines: string[] = [];
    const deepSeekMeta = formatDeepSeekMetadataMarkdown(snapshot);
    if (deepSeekMeta) {
      lines.push(deepSeekMeta, "", "---", "");
    }
    const assistantName = formatAssistantName(snapshot);
    const body = snapshot.messages.map((message) => {
      const attachments = getMessageAttachmentsForExport(snapshot, message);
      const parts = [
        `### ${message.role === "user" ? "🧑 用户问题" : `🤖 ${assistantName}回答`}`,
        "",
        formatMessageExportText(snapshot, message, "markdown")
      ];
      if (attachments.length) {
        parts.push("", "#### 附件", "");
        attachments.forEach((attachment) => {
          const rendered = formatAttachmentMarkdown(attachment);
          parts.push(rendered.includes("\n") ? rendered : `- ${rendered}`);
        });
      }
      return parts.join("\n").trim();
    }).join("\n\n---\n\n");
    if (body) lines.push(body);

    if (snapshot.attachments.length) {
      if (lines.length) lines.push("", "---", "");
      lines.push("### 附件", "");
      snapshot.attachments.forEach((attachment) => {
        const rendered = formatAttachmentMarkdown(attachment);
        lines.push(rendered.includes("\n") ? rendered : `- ${rendered}`);
      });
    }

    return [{
      path: `${safeFileName(snapshot.title)}.md`,
      mimeType: "text/markdown;charset=utf-8",
      content: lines.join("\n").trim()
    }];
  }
};
