import type { BackgroundRequest, BackgroundResponse } from "../messaging/protocol";
import type { ExportFile } from "../shared/types";

export type BackgroundSender = (request: BackgroundRequest) => Promise<BackgroundResponse>;

export async function downloadExportFiles(files: ExportFile[], send: BackgroundSender): Promise<void> {
  for (const file of files) {
    const request: BackgroundRequest = {
      type: "download-file",
      payload: {
        ...file,
        content: serializeDownloadContent(file.content),
        fileName: file.path
      }
    };

    let response: BackgroundResponse;
    try {
      response = await send(request);
    } catch (error) {
      if (isMissingBackgroundReceiverError(error)) {
        downloadFileInPage(file);
        continue;
      }
      throw error;
    }

    if (!response.ok) {
      if (isMissingBackgroundReceiverError(response.error)) {
        downloadFileInPage(file);
        continue;
      }
      throw new Error(response.error);
    }
  }
}

function serializeDownloadContent(content: ExportFile["content"]): string | number[] {
  return content instanceof Uint8Array ? Array.from(content) : content;
}

function downloadFileInPage(file: ExportFile): void {
  const blob = new Blob([getBlobPart(file.content)], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.path;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getBlobPart(content: ExportFile["content"]): BlobPart {
  if (!(content instanceof Uint8Array)) return String(content);
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

function isMissingBackgroundReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /receiving end does not exist|could not establish connection/i.test(message);
}
