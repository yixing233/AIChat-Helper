import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractChatGPTSnapshotFromConversation } from "./mapping";

export const chatgptAdapter: PlatformAdapter = {
  id: "chatgpt",
  name: "ChatGPT",
  matches(url) {
    return (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com")) && /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[data-message-author-role]", "[data-message-id]", "article"], "chatgpt");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/backend-api\/conversation(?:\/[^/?#]+)?/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured ChatGPT conversation response is available");
    }
    return extractChatGPTSnapshotFromConversation(JSON.parse(event.responseText));
  }
};
