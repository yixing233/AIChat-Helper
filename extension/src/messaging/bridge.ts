import {
  CONTENT_COMMAND_MESSAGE_TYPE,
  IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE,
  INJECTED_MESSAGE_SOURCE,
  type BackgroundRequest,
  type BackgroundResponse,
  type ContentCommandRequest,
  type ImmediateBackupProgressMessage,
  type InjectedToContentMessage
} from "./protocol";

export function isInjectedMessage(value: unknown): value is InjectedToContentMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; payload?: unknown };
  return candidate.source === INJECTED_MESSAGE_SOURCE && typeof candidate.type === "string" && "payload" in candidate;
}

export function isContentCommandRequest(value: unknown): value is ContentCommandRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; command?: unknown };
  return candidate.type === CONTENT_COMMAND_MESSAGE_TYPE
    && (
      candidate.command === "export-current"
      || candidate.command === "export-batch"
      || candidate.command === "check-update"
      || candidate.command === "backup-current-now"
      || candidate.command === "backup-platform-now"
    );
}

export function isImmediateBackupProgressMessage(value: unknown): value is ImmediateBackupProgressMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; payload?: Partial<ImmediateBackupProgressMessage["payload"]> };
  const payload = candidate.payload;
  return candidate.type === IMMEDIATE_BACKUP_PROGRESS_MESSAGE_TYPE
    && Boolean(payload)
    && (
      payload?.status === "starting"
      || payload?.status === "running"
      || payload?.status === "done"
      || payload?.status === "error"
    )
    && typeof payload?.platformName === "string"
    && typeof payload?.current === "number"
    && typeof payload?.total === "number"
    && typeof payload?.created === "number"
    && typeof payload?.unchanged === "number"
    && typeof payload?.failed === "number";
}

export function sendBackgroundRequest<T>(request: BackgroundRequest): Promise<BackgroundResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: BackgroundResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "Unknown runtime error" });
        return;
      }
      resolve(response || { ok: false, error: "Empty background response" });
    });
  });
}
