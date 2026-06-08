import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractDeepSeekSnapshotFromHistory } from "./mapping";

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
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/api\/v0\/chat\/history_messages/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured DeepSeek history response is available");
    }
    return extractDeepSeekSnapshotFromHistory(JSON.parse(event.responseText));
  }
};
