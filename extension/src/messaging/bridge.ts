import { INJECTED_MESSAGE_SOURCE, type BackgroundRequest, type BackgroundResponse, type InjectedToContentMessage } from "./protocol";

export function isInjectedMessage(value: unknown): value is InjectedToContentMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; payload?: unknown };
  return candidate.source === INJECTED_MESSAGE_SOURCE && typeof candidate.type === "string" && "payload" in candidate;
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
