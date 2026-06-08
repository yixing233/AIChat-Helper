import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";

export const deepseekAdapter: PlatformAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  matches(url) {
    return url.hostname === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "deepseek");
  }
};
