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

const snapshotWithAttachmentContent: ConversationSnapshot = {
  ...snapshot,
  attachments: [
    {
      id: "global",
      fileName: "diagram.png",
      mimeType: "image/png",
      content: "PNGDATA"
    }
  ],
  messages: [
    {
      id: "msg-1",
      role: "user",
      text: "see attached",
      attachments: [
        {
          id: "message-file",
          fileName: "../notes.txt",
          mimeType: "text/plain",
          content: "notes"
        }
      ]
    }
  ]
};

describe("exportSnapshot", () => {
  it("exports a single requested format", async () => {
    const files = await exportSnapshot(snapshot, "html");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("Zip Chat.html");
  });

  it("exports inline attachment content as companion files", async () => {
    const files = await exportSnapshot(snapshotWithAttachmentContent, "markdown");

    expect(files.map((file) => file.path)).toEqual([
      "Zip Chat.md",
      "attachments/global/diagram.png",
      "attachments/msg-1/notes.txt"
    ]);
    expect(files[1].content).toBe("PNGDATA");
    expect(files[2].content).toBe("notes");
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

  it("packages inline attachment content into current-conversation zip exports", async () => {
    const [file] = await exportSnapshot(snapshotWithAttachmentContent, "zip");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("attachments/global/diagram.png");
    expect(text).toContain("attachments/msg-1/notes.txt");
    expect(text).toContain("PNGDATA");
    expect(text).toContain("notes");
  });

  it("packages batch exports into a single archive", async () => {
    const files = await exportBatchSnapshots([snapshot, { ...snapshot, conversationId: "conv-2", title: "Second" }], "markdown");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("AI Chat Helper Batch Export.zip");
    expect(files[0].mimeType).toBe("application/zip");
    expect(files[0].content).toBeInstanceOf(Uint8Array);
  });

  it("keeps duplicate batch conversation titles in distinct folders", async () => {
    const [file] = await exportBatchSnapshots([snapshot, { ...snapshot, conversationId: "conv-2" }], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("Zip Chat - conv-1/Zip Chat.md");
    expect(text).toContain("Zip Chat - conv-2/Zip Chat.md");
  });
});
