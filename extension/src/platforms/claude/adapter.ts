import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractClaudeSnapshotFromConversation } from "./mapping";

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
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?#]+/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Claude conversation response is available");
    }
    return extractClaudeSnapshotFromConversation(JSON.parse(event.responseText));
  }
};
