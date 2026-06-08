import { describe, expect, it, vi } from "vitest";
import { handleBackgroundRequest } from "../background/handlers";

describe("handleBackgroundRequest", () => {
  it("returns the extension version", async () => {
    const response = await handleBackgroundRequest(
      { type: "get-version" },
      {
        getVersion: () => "3.0.0",
        fetchText: vi.fn(),
        downloadFile: vi.fn()
      }
    );

    expect(response).toEqual({ ok: true, value: "3.0.0" });
  });

  it("proxies HTTP requests through the background layer", async () => {
    const response = await handleBackgroundRequest(
      { type: "http-request", payload: { url: "https://raw.githubusercontent.com/example/update.json" } },
      {
        getVersion: () => "3.0.0",
        fetchText: vi.fn(async () => ({
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          text: "{}"
        })),
        downloadFile: vi.fn()
      }
    );

    expect(response).toEqual({
      ok: true,
      value: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        text: "{}"
      }
    });
  });

  it("delegates extension downloads", async () => {
    const response = await handleBackgroundRequest(
      {
        type: "download-file",
        payload: {
          fileName: "conversation.txt",
          path: "conversation.txt",
          mimeType: "text/plain;charset=utf-8",
          content: "hello"
        }
      },
      {
        getVersion: () => "3.0.0",
        fetchText: vi.fn(),
        downloadFile: vi.fn(async () => 7)
      }
    );

    expect(response).toEqual({ ok: true, value: { downloadId: 7 } });
  });
});
