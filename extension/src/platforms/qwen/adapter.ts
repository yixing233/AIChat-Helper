import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractQwenSnapshotFromMessageList } from "./mapping";

export const qwenAdapter: PlatformAdapter = {
  id: "qwen",
  name: "Tongyi Qianwen",
  matches(url) {
    return url.hostname === "www.qianwen.com" && /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "qwen");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/v1\/session\/msg\/list/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Qwen message list response is available");
    }
    return extractQwenSnapshotFromMessageList(JSON.parse(event.responseText));
  }
};
