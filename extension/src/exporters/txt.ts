import type { Exporter } from "../shared/types";
import { formatAssistantName, formatAttachmentText, formatDeepSeekMetadataText, formatMessageExportText, getMessageAttachmentsForExport, safeFileName } from "./shared";

export const txtExporter: Exporter = {
  format: "txt",
  async export(snapshot) {
    const assistantName = formatAssistantName(snapshot);
    const messages = snapshot.messages.map((message) => {
      const attachments = getMessageAttachmentsForExport(snapshot, message);
      const lines = [
        "----------------------------",
        `【${message.role === "user" ? "用户问题" : assistantName}】`,
        "----------------------------",
        formatMessageExportText(snapshot, message, "txt")
      ];
      attachments.forEach((attachment) => {
        lines.push(formatAttachmentText(attachment));
      });
      return lines.join("\n");
    });
    if (snapshot.attachments.length) {
      messages.push([
        "----------------------------",
        "【附件】",
        "----------------------------",
        ...snapshot.attachments.map(formatAttachmentText)
      ].join("\n"));
    }
    const deepSeekMeta = formatDeepSeekMetadataText(snapshot);

    return [{
      path: `${safeFileName(snapshot.title)}.txt`,
      mimeType: "text/plain;charset=utf-8",
      content: [deepSeekMeta, messages.join("\n\n")].filter(Boolean).join("\n\n")
    }];
  }
};
