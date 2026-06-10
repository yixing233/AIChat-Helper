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
    expect(savedRecord?.assetStatus).toEqual({ cachedImages: 1, failedImages: 0 });
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
});
