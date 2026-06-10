import { createConversationBackupRecord, type BackupSaveResult, type ConversationBackupRecord } from "../backup/backup-store";
import type { SnapshotExportFormat } from "../exporters/snapshot-export";
import type { ExtensionSettings } from "../settings/extension-settings";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

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
  createSnapshot: () => Promise<ConversationSnapshot>;
  exportSnapshot: (snapshot: ConversationSnapshot, format: SnapshotExportFormat) => Promise<ExportFile[]>;
  saveRecord: (record: ConversationBackupRecord) => Promise<BackupSaveResult>;
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

      const currentTime = now();
      const intervalMs = Math.max(5, settings.autoBackupIntervalMinutes || 15) * 60 * 1000;
      if (!force && lastAttemptAt > 0 && currentTime - lastAttemptAt < intervalMs) {
        return { status: "skipped" };
      }
      lastAttemptAt = currentTime;

      options.onStart?.();
      const snapshot = await options.createSnapshot();
      const files = await options.exportSnapshot(snapshot, "zip");
      const result = await options.saveRecord(await createConversationBackupRecord(snapshot, "zip", files, {
        createdAt: createTimestamp(),
        source: "auto"
      }));

      return result.created
        ? { status: "created", record: result.record }
        : { status: "unchanged", record: result.record };
    }
  };
}
