import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";

export const claudeAdapter: PlatformAdapter = {
  id: "claude",
  name: "Claude",
  matches(url) {
    return url.hostname === "claude.ai" && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[data-testid*='message']", "[data-message-id]", "article"], "claude");
  }
};
