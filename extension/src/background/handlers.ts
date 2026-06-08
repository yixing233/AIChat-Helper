import type { BackgroundRequest, BackgroundResponse } from "../messaging/protocol";

export interface FetchTextResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: string;
}

export interface BackgroundHandlerDependencies {
  getVersion(): string;
  fetchText(request: Extract<BackgroundRequest, { type: "http-request" }>["payload"]): Promise<FetchTextResult>;
  downloadFile(request: Extract<BackgroundRequest, { type: "download-file" }>["payload"]): Promise<number>;
}

export async function handleBackgroundRequest(
  request: BackgroundRequest,
  deps: BackgroundHandlerDependencies
): Promise<BackgroundResponse> {
  try {
    if (request.type === "get-version") {
      return { ok: true, value: deps.getVersion() };
    }

    if (request.type === "http-request") {
      return { ok: true, value: await deps.fetchText(request.payload) };
    }

    if (request.type === "download-file") {
      const downloadId = await deps.downloadFile(request.payload);
      return { ok: true, value: { downloadId } };
    }

    return { ok: false, error: "Unsupported background request" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
