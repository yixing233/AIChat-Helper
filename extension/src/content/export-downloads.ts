import type { BackgroundRequest, BackgroundResponse } from "../messaging/protocol";
import type { ExportFile } from "../shared/types";

export type BackgroundSender = (request: BackgroundRequest) => Promise<BackgroundResponse>;

export async function downloadExportFiles(files: ExportFile[], send: BackgroundSender): Promise<void> {
  for (const file of files) {
    const response = await send({
      type: "download-file",
      payload: {
        ...file,
        fileName: file.path
      }
    });

    if (!response.ok) {
      throw new Error(response.error);
    }
  }
}
