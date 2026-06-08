import { handleBackgroundRequest } from "./handlers";
import type { BackgroundRequest } from "../messaging/protocol";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[AI Chat Helper] extension installed");
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handleBackgroundRequest(request, {
    getVersion: () => chrome.runtime.getManifest().version,
    fetchText: async (payload) => {
      const response = await fetch(payload.url, {
        method: payload.method || "GET",
        headers: payload.headers,
        body: payload.body
      });
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text: await response.text()
      };
    },
    downloadFile: async (payload) => {
      const content = payload.content instanceof Uint8Array ? payload.content : new TextEncoder().encode(payload.content);
      const blobPart = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([blobPart], { type: payload.mimeType }));
      return chrome.downloads.download({
        url,
        filename: payload.fileName,
        saveAs: true
      });
    }
  }).then(sendResponse);

  return true;
});
