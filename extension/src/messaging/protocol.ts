import type { CapturedNetworkEvent, ExportFile } from "../shared/types";

export const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";
export const CONTENT_COMMAND_MESSAGE_TYPE = "ai-chat-helper:content-command";
export const IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE = "ai-chat-helper:backup-progress";

export type ContentCommand = "export-current" | "export-batch" | "check-update" | "backup-current-now" | "backup-platform-now";

export interface ContentCommandRequest {
  type: typeof CONTENT_COMMAND_MESSAGE_TYPE;
  command: ContentCommand;
}

export type ImmediateBackupProgressStatus = "starting" | "running" | "done" | "error";

export interface ImmediateBackupProgressPayload {
  status: ImmediateBackupProgressStatus;
  platformName: string;
  current: number;
  total: number;
  created: number;
  unchanged: number;
  failed: number;
  title?: string;
  error?: string;
}

export interface ImmediateBackupProgressMessage {
  type: typeof IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE;
  payload: ImmediateBackupProgressPayload;
}

export type InjectedToContentMessage =
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "injected-ready";
      payload: { href: string };
    }
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "captured-network-event";
      payload: CapturedNetworkEvent;
    };

export type BackgroundRequest =
  | {
      type: "http-request";
      payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
    }
  | {
      type: "download-file";
      payload: Omit<ExportFile, "content"> & { content: string | number[]; fileName: string };
    }
  | {
      type: "get-version";
    };

export type BackgroundResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };
