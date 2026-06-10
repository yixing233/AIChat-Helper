import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it("falls back to userscript-style Blob downloads when the background receiver is unavailable", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (): Promise<BackgroundResponse> => ({
      ok: false,
      error: "Could not establish connection. Receiving end does not exist."
    }));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ai-chat-helper-export");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await downloadExportFiles(files, send);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ai-chat-helper-export");
  });
});
