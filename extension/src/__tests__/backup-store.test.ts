import { describe, expect, it, vi } from "vitest";
import {
  buildConversationBackupRecord,
  createConversationBackupRecord,
  createBackupStore,
  getBackupExportFiles,
  groupBackupRecordsByConversation,
  groupBackupsByPlatform,
  type ConversationBackupRecord
} from "../backup/backup-store";
import type { ConversationSnapshot, ExportFile } from "../shared/types";
import type { ExtensionStorage } from "../storage/extension-storage";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "conv-1",
  title: "Backup conversation",
  attachments: [],
  messages: [
    { id: "user-1", role: "user", text: "Question" },
    { id: "assistant-1", role: "assistant", text: "Answer" }
  ],
  updatedAt: "2026-06-09T08:00:00Z"
};

const textFile: ExportFile = {
  path: "ChatGPT_Export.html",
  mimeType: "text/html;charset=utf-8",
  content: "<html>Backup</html>"
};

function createMemoryStorage(): ExtensionStorage {
  const values = new Map<string, unknown>();
  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      return values.has(key) ? values.get(key) as T : defaultValue;
    },
    async set<T>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
    async remove(key: string): Promise<void> {
      values.delete(key);
    }
  };
}

describe("backup store", () => {
  it("builds platform-scoped backup records with serialized files", () => {
    const binaryFile: ExportFile = {
      path: "images/photo.png",
      mimeType: "image/png",
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    };

    const record = buildConversationBackupRecord(snapshot, "zip", [textFile, binaryFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });

    expect(record.id).toContain("chatgpt");
    expect(record.platformId).toBe("chatgpt");
    expect(record.platformName).toBe("ChatGPT");
    expect(record.conversationId).toBe("conv-1");
    expect(record.title).toBe("Backup conversation");
    expect(record.format).toBe("zip");
    expect(record.source).toBe("auto");
    expect(record.messageCount).toBe(2);
    expect(record.files).toEqual([
      { path: "ChatGPT_Export.html", mimeType: "text/html;charset=utf-8", content: "<html>Backup</html>", encoding: "text" },
      { path: "images/photo.png", mimeType: "image/png", content: "iVBORw==", encoding: "base64" }
    ]);
  });

  it("deduplicates unchanged backups for the same platform conversation and format", async () => {
    const store = createBackupStore(createMemoryStorage());
    const first = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const duplicate = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:05:00.000Z",
      source: "auto"
    });

    await expect(store.save(first)).resolves.toEqual({ record: first, created: true });
    await expect(store.save(duplicate)).resolves.toEqual({ record: first, created: false });

    expect(await store.list()).toEqual([first]);
  });

  it("upgrades an unchanged backup when the new preview caches more images", async () => {
    const store = createBackupStore(createMemoryStorage());
    const first = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    first.previewSnapshot = snapshot;
    first.assetStatus = { cachedImages: 1, failedImages: 3 };
    const improved = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:05:00.000Z",
      source: "auto"
    });
    improved.previewSnapshot = {
      ...snapshot,
      messages: [{ ...snapshot.messages[1], text: "Preview with cached images" }]
    };
    improved.assetStatus = { cachedImages: 4, failedImages: 0 };

    await expect(store.save(first)).resolves.toEqual({ record: first, created: true });
    await expect(store.save(improved)).resolves.toEqual({ record: improved, created: false });

    expect(await store.list()).toEqual([improved]);
  });

  it("keeps changed backups and sorts newest first", async () => {
    const store = createBackupStore(createMemoryStorage());
    const older = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...snapshot,
      messages: [...snapshot.messages, { id: "assistant-2", role: "assistant", text: "More" }]
    }, "zip", [textFile], {
      createdAt: "2026-06-09T09:10:00.000Z",
      source: "auto"
    });

    await store.save(older);
    await store.save(newer);

    expect((await store.list()).map((record) => record.id)).toEqual([newer.id, older.id]);
  });

  it("groups changed backups for the same conversation into version history", async () => {
    const older = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...snapshot,
      title: "Renamed backup conversation",
      messages: [...snapshot.messages, { id: "assistant-2", role: "assistant", text: "More" }]
    }, "zip", [textFile], {
      createdAt: "2026-06-09T09:10:00.000Z",
      source: "manual"
    });

    const conversations = groupBackupRecordsByConversation([older, newer]);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("chatgpt::conv-1");
    expect(conversations[0].latest).toBe(newer);
    expect(conversations[0].versions.map((record) => record.id)).toEqual([newer.id, older.id]);
    expect(conversations[0].versionCount).toBe(2);
    expect(conversations[0].title).toBe("Renamed backup conversation");
  });

  it("groups backup records by platform", () => {
    const chatgpt = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const deepseek: ConversationBackupRecord = {
      ...chatgpt,
      id: "deepseek-backup",
      platformId: "deepseek",
      platformName: "DeepSeek",
      conversationId: "deepseek-1"
    };

    const groups = groupBackupsByPlatform([deepseek, chatgpt]);

    expect(groups).toEqual([
      { platformId: "chatgpt", platformName: "ChatGPT", records: [chatgpt] },
      { platformId: "deepseek", platformName: "DeepSeek", records: [deepseek] }
    ]);
  });

  it("restores stored backup files for downloading and deletes records", async () => {
    const store = createBackupStore(createMemoryStorage());
    const record = buildConversationBackupRecord(snapshot, "zip", [{
      path: "backup.zip",
      mimeType: "application/zip",
      content: new Uint8Array([1, 2, 3])
    }], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });

    await store.save(record);

    expect(getBackupExportFiles(record)).toEqual([{
      path: "backup.zip",
      mimeType: "application/zip",
      content: new Uint8Array([1, 2, 3])
    }]);

    await store.remove(record.id);

    expect(await store.list()).toEqual([]);
  });

  it("restores legacy byte-encoded backup files", () => {
    const record = buildConversationBackupRecord(snapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    record.files = [{
      path: "legacy.zip",
      mimeType: "application/zip",
      content: [4, 5, 6],
      encoding: "bytes"
    }];

    expect(getBackupExportFiles(record)).toEqual([{
      path: "legacy.zip",
      mimeType: "application/zip",
      content: new Uint8Array([4, 5, 6])
    }]);
  });

  it("builds preview snapshots with inline image attachment data urls", async () => {
    const imageSnapshot: ConversationSnapshot = {
      ...snapshot,
      attachments: [{
        id: "global-image",
        fileName: "preview.png",
        mimeType: "image/png",
        content: "raw image bytes"
      }],
      messages: [{
        id: "user-image",
        role: "user",
        text: "这是一张图",
        attachments: [{
          id: "message-image",
          fileName: "answer.png",
          mimeType: "image/png",
          content: "message image"
        }]
      }]
    };

    const record = await createConversationBackupRecord(imageSnapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });

    expect(record.previewSnapshot?.attachments[0]?.url).toBe("data:image/png;base64,cmF3IGltYWdlIGJ5dGVz");
    expect(record.previewSnapshot?.messages[0]?.attachments?.[0]?.url).toBe("data:image/png;base64,bWVzc2FnZSBpbWFnZQ==");
    expect(record.assetStatus).toEqual({ cachedImages: 2, failedImages: 0 });
  });

  it("keeps remote image urls when preview caching fails", async () => {
    const remoteSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "![图片](https://example.test/image.png)",
        attachments: [{
          id: "remote-image",
          fileName: "image.png",
          mimeType: "image/png",
          url: "https://example.test/image.png"
        }]
      }]
    };
    const fetchImage = async () => {
      throw new Error("offline");
    };

    const record = await createConversationBackupRecord(remoteSnapshot, "zip", [textFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto",
      fetchImage
    });

    expect(record.previewSnapshot?.messages[0]?.text).toContain("https://example.test/image.png");
    expect(record.previewSnapshot?.messages[0]?.attachments?.[0]?.url).toBe("https://example.test/image.png");
    expect(record.assetStatus).toEqual({ cachedImages: 0, failedImages: 1 });
  });

  it("retries remote preview image caching with fallback request options", async () => {
    const originalFetch = globalThis.fetch;
    const remoteSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "![图片](https://example.test/image.png)",
        attachments: []
      }]
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, headers: new Headers({ "content-type": "image/png" }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const record = await createConversationBackupRecord(remoteSnapshot, "zip", [textFile], {
        createdAt: "2026-06-09T09:00:00.000Z",
        source: "auto"
      });

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://example.test/image.png", { method: "GET", credentials: "include", cache: "no-store" });
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://example.test/image.png", { method: "GET", credentials: "same-origin", cache: "no-store" });
      expect(record.previewSnapshot?.messages[0]?.text).toContain("data:image/png;base64,AQID");
      expect(record.assetStatus).toEqual({ cachedImages: 1, failedImages: 0 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
