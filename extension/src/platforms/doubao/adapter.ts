import type { PlatformAdapter } from "../../shared/types";
import { scanTextNodes } from "../shared/dom-scan";
import { extractDoubaoConversationIdFromRequestBody, extractDoubaoSnapshotFromSingleChain } from "./mapping";

export const doubaoAdapter: PlatformAdapter = {
  id: "doubao",
  name: "Doubao",
  matches(url) {
    return url.hostname === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return scanTextNodes(root, ["[class*='message']", "[data-testid*='message']", "article"], "doubao");
  },
  async hydrateFromCapturedApi(events) {
    const event = [...events].reverse().find((item) => {
      if (item.status && item.status >= 400) return false;
      return /\/im\/chain\/single/i.test(item.url) && Boolean(item.responseText);
    });
    if (!event?.responseText) {
      throw new Error("No captured Doubao single-chain response is available");
    }
    const conversationId = extractDoubaoConversationIdFromRequestBody(event.requestBody) || "current";
    return extractDoubaoSnapshotFromSingleChain(JSON.parse(event.responseText), conversationId);
  }
};
