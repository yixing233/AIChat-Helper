import { describe, expect, it, vi } from "vitest";
import { downloadExportFiles } from "../content/export-downloads";
import type { BackgroundResponse } from "../messaging/protocol";
import type { ExportFile } from "../shared/types";

const files: ExportFile[] = [
  {
    path: "conversation.html",
    mimeType: "text/html;charset=utf-8",
    content: "<h1>Hello</h1>"
  }
];

describe("downloadExportFiles", () => {
  it("sends each export file to the background download handler", async () => {
    const send = vi.fn(async (): Promise<BackgroundResponse> => ({ ok: true, value: { downloadId: 7 } }));

    await downloadExportFiles(files, send);

    expect(send).toHaveBeenCalledWith({
      type: "download-file",
      payload: {
        ...files[0],
        fileName: "conversation.html"
      }
    });
  });

  it("serializes binary export content for extension runtime messaging", async () => {
    const send = vi.fn(async (): Promise<BackgroundResponse> => ({ ok: true, value: { downloadId: 8 } }));

    await downloadExportFiles([{ ...files[0], content: new Uint8Array([0x50, 0x4b]) }], send);

    expect(send).toHaveBeenCalledWith({
      type: "download-file",
      payload: {
        ...files[0],
        content: [0x50, 0x4b],
        fileName: "conversation.html"
      }
    });
  });

  it("fails when the background download handler returns an error", async () => {
    const send = vi.fn(async (): Promise<BackgroundResponse> => ({ ok: false, error: "downloads permission denied" }));

    await expect(downloadExportFiles(files, send)).rejects.toThrow("downloads permission denied");
  });
});
