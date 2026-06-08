import type { Exporter } from "../shared/types";
import { safeFileName } from "./shared";

export const markdownExporter: Exporter = {
  format: "markdown",
  async export(snapshot) {
    const lines = [`# ${snapshot.title}`, ""];
    snapshot.messages.forEach((message) => {
      lines.push(`## ${message.role}`, "", message.text, "");
    });

    return [{
      path: `${safeFileName(snapshot.title)}.md`,
      mimeType: "text/markdown;charset=utf-8",
      content: lines.join("\n")
    }];
  }
};
