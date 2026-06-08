import type { Exporter } from "../shared/types";
import { safeFileName } from "./shared";

export const txtExporter: Exporter = {
  format: "txt",
  async export(snapshot) {
    return [{
      path: `${safeFileName(snapshot.title)}.txt`,
      mimeType: "text/plain;charset=utf-8",
      content: snapshot.messages.map((message) => `${message.role}: ${message.text}`).join("\n\n")
    }];
  }
};
