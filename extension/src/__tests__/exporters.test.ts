import { describe, expect, it } from "vitest";
import { htmlExporter } from "../exporters/html";
import { markdownExporter } from "../exporters/markdown";
import { txtExporter } from "../exporters/txt";
import { createZip } from "../exporters/zip";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "abc",
  title: "Sample Chat",
  attachments: [],
  messages: [
    { id: "1", role: "user", text: "Hello" },
    { id: "2", role: "assistant", text: "Hi there" }
  ]
};

describe("exporters", () => {
  it("exports html", async () => {
    const [file] = await htmlExporter.export(snapshot);

    expect(file.path).toBe("Sample Chat.html");
    expect(String(file.content)).toContain("<h1>Sample Chat</h1>");
  });

  it("exports markdown", async () => {
    const [file] = await markdownExporter.export(snapshot);

    expect(file.path).toBe("Sample Chat.md");
    expect(String(file.content)).toContain("# Sample Chat");
  });

  it("exports txt", async () => {
    const [file] = await txtExporter.export(snapshot);

    expect(file.path).toBe("Sample Chat.txt");
    expect(String(file.content)).toContain("user: Hello");
  });

  it("creates a stored zip archive containing file names", () => {
    const files: ExportFile[] = [
      { path: "one.txt", mimeType: "text/plain", content: "one" },
      { path: "two.txt", mimeType: "text/plain", content: "two" }
    ];
    const zip = createZip(files);
    const text = new TextDecoder().decode(zip);

    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain("one.txt");
    expect(text).toContain("two.txt");
  });
});
