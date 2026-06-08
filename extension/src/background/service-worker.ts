import { handleBackgroundRequest } from "./handlers";
import { createDownloadDataUrl, createDownloadOptions } from "./downloads";
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
      const url = createDownloadDataUrl(payload.content, payload.mimeType);
      return chrome.downloads.download(createDownloadOptions(url, payload.fileName));
    }
  }).then(sendResponse);

  return true;
});
