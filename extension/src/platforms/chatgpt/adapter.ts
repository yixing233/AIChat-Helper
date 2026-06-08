import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";

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
  }
};
