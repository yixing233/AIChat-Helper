import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";

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
  }
};
