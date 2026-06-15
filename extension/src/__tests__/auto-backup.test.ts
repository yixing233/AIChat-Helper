import { describe, expect, it, vi } from "vitest";
import { createAutoBackupRunner } from "../content/auto-backup";
import { buildConversationBackupRecord, createConversationBackupRecord, type BackupSaveResult } from "../backup/backup-store";
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from "../settings/extension-settings";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "conv-auto",
  title: "Automatic backup",
  attachments: [],
  messages: [
    { id: "user-1", role: "user", text: "Question" },
    { id: "assistant-1", role: "assistant", text: "Answer" }
  ]
};

const zipFile: ExportFile = {
  path: "backup.zip",
  mimeType: "application/zip",
  content: new Uint8Array([1, 2, 3])
};

function makeSettings(value: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    autoBackupEnabled: true,
    autoBackupIntervalMinutes: 15,
    ...value
  };
}

async function waitForPredicate(predicate: () => boolean, maxPasses = 12): Promise<void> {
  for (let index = 0; index < maxPasses; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
}

describe("auto backup runner", () => {
  it("does nothing when automatic backup is disabled", async () => {
    const createSnapshot = vi.fn(async () => snapshot);
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings({ autoBackupEnabled: false }),
      createSnapshot,
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }))
    });

    await expect(runner.tick()).resolves.toEqual({ status: "disabled" });

    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("does nothing when the current page is not a real conversation", async () => {
    const createSnapshot = vi.fn(async () => snapshot);
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      shouldRun: () => false,
      createSnapshot,
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }))
    });

    await expect(runner.tick(true)).resolves.toEqual({ status: "skipped" });

    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("exports the current conversation as zip and stores a backup record", async () => {
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => snapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    const result = await runner.tick();

    expect(result.status).toBe("created");
    expect(saveRecord).toHaveBeenCalledWith(await createConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    }));
  });

  it("stores preview snapshots with cached image status during automatic backup", async () => {
    const imageSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "Image",
        attachments: [{
          id: "image-1",
          fileName: "image.png",
          mimeType: "image/png",
          content: "cached image"
        }]
      }]
    };
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => imageSnapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    const result = await runner.tick();
    const savedRecord = saveRecord.mock.calls[0]?.[0];

    expect(result.status).toBe("created");
    expect(savedRecord?.previewSnapshot?.messages[0]?.attachments?.[0]?.url).toBe("data:image/png;base64,Y2FjaGVkIGltYWdl");
    expect(savedRecord?.assetStatus).toEqual({ totalImages: 1, cachedImages: 1, failedImages: 0 });
  });

  it("waits for preview image caching to finish before reporting completion", async () => {
    let resolveFetch!: (value: { bytes: Uint8Array; mimeType?: string }) => void;
    const fetchImage = vi.fn(() => new Promise<{ bytes: Uint8Array; mimeType?: string }>((resolve) => {
      resolveFetch = resolve;
    }));
    const remoteSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "",
        attachments: [{
          id: "remote-image",
          fileName: "image.png",
          mimeType: "image/png",
          url: "https://example.test/image.png"
        }]
      }]
    };
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => remoteSnapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord,
      fetchImage,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    const tickPromise = runner.tick(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchImage).toHaveBeenCalledOnce();
    expect(saveRecord).not.toHaveBeenCalled();

    resolveFetch({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" });
    await expect(tickPromise).resolves.toMatchObject({ status: "created" });
    expect(saveRecord).toHaveBeenCalledOnce();
    const savedRecord = saveRecord.mock.calls[0]?.[0];
    expect(savedRecord?.assetStatus).toEqual({ totalImages: 1, cachedImages: 1, failedImages: 0 });
    expect(savedRecord?.previewSnapshot?.messages[0]?.attachments?.[0]?.url).toContain("data:image/png;base64,");
  });

  it("notifies when an automatic backup starts so the page can warn users to stay", async () => {
    const onStart = vi.fn();
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => snapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true })),
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z",
      onStart
    });

    await runner.tick();

    expect(onStart).toHaveBeenCalledOnce();
  });

  it("waits for the page to become backup-ready before creating a snapshot", async () => {
    const calls: string[] = [];
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const waitForReady = vi.fn(async () => {
      calls.push("wait:start");
      await readyPromise;
      calls.push("wait:done");
    });
    const createSnapshot = vi.fn(async () => {
      calls.push("snapshot");
      return snapshot;
    });
    let resolveFind!: () => void;
    const findPromise = new Promise<void>((resolve) => {
      resolveFind = resolve;
    });
    const findExistingRecord = vi.fn(async () => {
      calls.push("find");
      await findPromise;
      return null;
    });
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      waitForReady,
      createSnapshot,
      findExistingRecord,
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true })),
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    const tickPromise = runner.tick(true);
    await waitForPredicate(() => calls.length >= 2);

    expect(createSnapshot).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["snapshot", "find"]);
    expect(waitForReady).not.toHaveBeenCalled();

    resolveFind();
    await waitForPredicate(() => waitForReady.mock.calls.length === 1);
    expect(waitForReady).toHaveBeenCalledOnce();
    resolveReady();
    await expect(tickPromise).resolves.toMatchObject({ status: "created" });
    expect(createSnapshot).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["snapshot", "find", "wait:start", "wait:done", "snapshot", "find"]);
  });

  it("skips ticks until the configured interval has elapsed", async () => {
    let now = 1000;
    const createSnapshot = vi.fn(async () => snapshot);
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings({ autoBackupIntervalMinutes: 15 }),
      createSnapshot,
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true })),
      now: () => now,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick()).resolves.toMatchObject({ status: "created" });
    now += 5 * 60 * 1000;
    await expect(runner.tick()).resolves.toEqual({ status: "skipped" });
    now += 10 * 60 * 1000;
    await expect(runner.tick()).resolves.toMatchObject({ status: "created" });

    expect(createSnapshot).toHaveBeenCalledTimes(2);
  });

  it("reports unchanged conversations when the backup store deduplicates a record", async () => {
    const existing = buildConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => snapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (): Promise<BackupSaveResult> => ({ record: existing, created: false })),
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick()).resolves.toEqual({ status: "unchanged", record: existing });
  });

  it("checks existing content changes before starting automatic backup feedback", async () => {
    const existing = buildConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const onStart = vi.fn();
    const createSnapshot = vi.fn(async () => snapshot);
    const exportSnapshot = vi.fn(async () => [zipFile]);
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const findExistingRecord = vi.fn(async () => existing);
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot,
      findExistingRecord,
      exportSnapshot,
      saveRecord,
      onStart,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick(true)).resolves.toEqual({ status: "unchanged", record: existing });

    expect(findExistingRecord).toHaveBeenCalledWith(snapshot, "zip");
    expect(onStart).not.toHaveBeenCalled();
    expect(exportSnapshot).not.toHaveBeenCalled();
    expect(saveRecord).not.toHaveBeenCalled();
    expect(createSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not start backup loading feedback while only checking for content changes", async () => {
    const existing = buildConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const onCheckStart = vi.fn();
    const onStart = vi.fn();
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => snapshot),
      findExistingRecord: vi.fn(async () => existing),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord: vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true })),
      onCheckStart,
      onStart,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick(true)).resolves.toEqual({ status: "unchanged", record: existing });

    expect(onCheckStart).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("still starts automatic backup feedback when content has changed", async () => {
    const onStart = vi.fn();
    const createSnapshot = vi.fn(async () => snapshot);
    const exportSnapshot = vi.fn(async () => [zipFile]);
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const findExistingRecord = vi.fn(async () => null);
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot,
      findExistingRecord,
      exportSnapshot,
      saveRecord,
      onStart,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick(true)).resolves.toMatchObject({ status: "created" });

    expect(findExistingRecord).toHaveBeenCalledWith(snapshot, "zip");
    expect(onStart).toHaveBeenCalledOnce();
    expect(exportSnapshot).toHaveBeenCalledOnce();
    expect(saveRecord).toHaveBeenCalledOnce();
  });

  it("re-checks for unchanged content after waitForReady before starting auto backup", async () => {
    const existing = buildConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const transientSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [
        ...snapshot.messages,
        { id: "assistant-loading", role: "assistant", text: "Loading..." }
      ]
    };
    const createSnapshot = vi.fn()
      .mockResolvedValueOnce(transientSnapshot)
      .mockResolvedValueOnce(snapshot);
    const findExistingRecord = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const onStart = vi.fn();
    const exportSnapshot = vi.fn(async () => [zipFile]);
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => ({ record, created: true }));
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      waitForReady: vi.fn(async () => undefined),
      createSnapshot,
      findExistingRecord,
      exportSnapshot,
      saveRecord,
      onStart,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick(true)).resolves.toEqual({ status: "unchanged", record: existing });

    expect(createSnapshot).toHaveBeenCalledTimes(2);
    expect(findExistingRecord).toHaveBeenNthCalledWith(1, transientSnapshot, "zip");
    expect(findExistingRecord).toHaveBeenNthCalledWith(2, snapshot, "zip");
    expect(onStart).not.toHaveBeenCalled();
    expect(exportSnapshot).not.toHaveBeenCalled();
    expect(saveRecord).not.toHaveBeenCalled();
  });

  it("treats timestamp-only snapshot changes as unchanged automatic backups", async () => {
    const timestampOnlyChangedSnapshot: ConversationSnapshot = {
      ...snapshot,
      updatedAt: "2026-06-09T10:05:00.000Z",
      updatedAtText: "2026/06/09 18:05",
      createdAt: "2026-06-09T09:00:00.000Z",
      createdAtText: "2026/06/09 17:00"
    };
    const existing = await createConversationBackupRecord(snapshot, "zip", [zipFile], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const saveRecord = vi.fn(async (record): Promise<BackupSaveResult> => {
      expect(record.digest).toBe(existing.digest);
      return { record: existing, created: false };
    });
    const runner = createAutoBackupRunner({
      getSettings: () => makeSettings(),
      createSnapshot: vi.fn(async () => timestampOnlyChangedSnapshot),
      exportSnapshot: vi.fn(async () => [zipFile]),
      saveRecord,
      now: () => 1000,
      createTimestamp: () => "2026-06-09T10:00:00.000Z"
    });

    await expect(runner.tick()).resolves.toEqual({ status: "unchanged", record: existing });
    expect(saveRecord).toHaveBeenCalledTimes(1);
  });
});
