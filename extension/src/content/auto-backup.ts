import { createConversationBackupRecord, type BackupSaveResult, type ConversationBackupRecord } from "../backup/backup-store";
import type { SnapshotExportFormat } from "../exporters/snapshot-export";
import type { ExtensionSettings } from "../settings/extension-settings";
import type { ConversationSnapshot, ExportFile } from "../shared/types";
import type { PreviewImageFetcher } from "../backup/backup-store";

export type AutoBackupTickResult =
  | { status: "disabled" }
  | { status: "skipped" }
  | { status: "created"; record: ConversationBackupRecord }
  | { status: "unchanged"; record: ConversationBackupRecord };

export interface AutoBackupRunner {
  tick(force?: boolean): Promise<AutoBackupTickResult>;
}

export interface AutoBackupRunnerOptions {
  getSettings: () => Pick<ExtensionSettings, "autoBackupEnabled" | "autoBackupIntervalMinutes">;
  shouldRun?: () => boolean;
  waitForReady?: () => Promise<void>;
  createSnapshot: () => Promise<ConversationSnapshot>;
  findExistingRecord?: (snapshot: ConversationSnapshot, format: SnapshotExportFormat) => Promise<ConversationBackupRecord | null>;
  exportSnapshot: (snapshot: ConversationSnapshot, format: SnapshotExportFormat) => Promise<ExportFile[]>;
  saveRecord: (record: ConversationBackupRecord) => Promise<BackupSaveResult>;
  fetchImage?: PreviewImageFetcher;
  onStart?: () => void;
  now?: () => number;
  createTimestamp?: () => string;
}

export function createAutoBackupRunner(options: AutoBackupRunnerOptions): AutoBackupRunner {
  let lastAttemptAt = 0;
  const now = options.now || (() => Date.now());
  const createTimestamp = options.createTimestamp || (() => new Date().toISOString());

  return {
    async tick(force = false): Promise<AutoBackupTickResult> {
      const settings = options.getSettings();
      if (!settings.autoBackupEnabled) return { status: "disabled" };
      if (options.shouldRun && !options.shouldRun()) return { status: "skipped" };

      const currentTime = now();
      const intervalMs = Math.max(5, settings.autoBackupIntervalMinutes || 15) * 60 * 1000;
      if (!force && lastAttemptAt > 0 && currentTime - lastAttemptAt < intervalMs) {
        return { status: "skipped" };
      }
      lastAttemptAt = currentTime;

      const format: SnapshotExportFormat = "zip";
      const initialSnapshot = await options.createSnapshot();
      if (options.findExistingRecord) {
        const existingRecord = await options.findExistingRecord(initialSnapshot, format);
        if (existingRecord) {
          return { status: "unchanged", record: existingRecord };
        }
      }

      options.onStart?.();
      if (options.waitForReady) {
        await options.waitForReady();
      }
      const snapshot = options.waitForReady ? await options.createSnapshot() : initialSnapshot;
      const files = await options.exportSnapshot(snapshot, format);
      const result = await options.saveRecord(await createConversationBackupRecord(snapshot, format, files, {
        createdAt: createTimestamp(),
        source: "auto",
        fetchImage: options.fetchImage
      }));

      return result.created
        ? { status: "created", record: result.record }
        : { status: "unchanged", record: result.record };
    }
  };
}
