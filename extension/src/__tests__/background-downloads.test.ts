import { describe, expect, it } from "vitest";
import { createDownloadDataUrl, createDownloadOptions } from "../background/downloads";

describe("createDownloadOptions", () => {
  it("creates automatic download options without a native save dialog", () => {
    expect(createDownloadOptions("blob:extension-file", "exports/chat.html")).toEqual({
      url: "blob:extension-file",
      filename: "exports/chat.html",
      saveAs: false
    });
  });

  it("creates data URLs for text download content", () => {
    expect(createDownloadDataUrl("hello", "text/plain")).toBe("data:text/plain;base64,aGVsbG8=");
  });

  it("creates data URLs for binary download content", () => {
    expect(createDownloadDataUrl(new Uint8Array([0x50, 0x4b]), "application/zip")).toBe("data:application/zip;base64,UEs=");
  });

  it("creates data URLs for runtime-serialized binary download content", () => {
    expect(createDownloadDataUrl([0x50, 0x4b], "application/zip")).toBe("data:application/zip;base64,UEs=");
  });
});
