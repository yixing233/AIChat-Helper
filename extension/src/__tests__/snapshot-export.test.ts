import { describe, expect, it } from "vitest";
import { exportBatchSnapshots, exportSnapshot } from "../exporters/snapshot-export";
import type { ConversationSnapshot } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "claude",
  conversationId: "conv-1",
  title: "Zip Chat",
  attachments: [],
  messages: [
    { id: "1", role: "user", text: "hello" },
    { id: "2", role: "assistant", text: "hi" }
  ]
};

describe("exportSnapshot", () => {
  it("exports a single requested format", async () => {
    const files = await exportSnapshot(snapshot, "html");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("Zip Chat.html");
  });

  it("exports all current-conversation formats as a zip", async () => {
    const [file] = await exportSnapshot(snapshot, "zip");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(file.path).toBe("Zip Chat.zip");
    expect(file.mimeType).toBe("application/zip");
    expect(text).toContain("Zip Chat.html");
    expect(text).toContain("Zip Chat.md");
    expect(text).toContain("Zip Chat.txt");
  });

  it("packages batch exports into a single archive", async () => {
    const files = await exportBatchSnapshots([snapshot, { ...snapshot, conversationId: "conv-2", title: "Second" }], "markdown");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("AI Chat Helper Batch Export.zip");
    expect(files[0].mimeType).toBe("application/zip");
    expect(files[0].content).toBeInstanceOf(Uint8Array);
  });
});
