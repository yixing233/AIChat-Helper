import type { ConversationNode } from "../../shared/types";

export function scanTextNodes(root: ParentNode, selectors: string[], prefix: string): ConversationNode[] {
  const seen = new Set<Element>();
  const elements = selectors.flatMap((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)));

  return elements
    .filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      return Boolean(element.textContent?.trim());
    })
    .map((element, index) => {
      const id = element.getAttribute("data-message-id") || element.id || `${prefix}-node-${index + 1}`;
      const elementSelector = getOrCreateElementSelector(element, id);

      return {
        id,
        title: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || `Message ${index + 1}`,
        index,
        role: inferRole(element),
        elementSelector
      };
    });
}

function inferRole(element: HTMLElement): ConversationNode["role"] {
  const role = element.getAttribute("data-message-author-role") || element.getAttribute("data-role") || "";
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") return role;
  return undefined;
}

function getOrCreateElementSelector(element: HTMLElement, nodeId: string): string {
  if (element.id) return `#${escapeCssIdentifier(element.id)}`;

  const existingId = element.getAttribute("data-ai-chat-helper-node-id");
  const helperId = existingId || nodeId;
  element.setAttribute("data-ai-chat-helper-node-id", helperId);
  return `[data-ai-chat-helper-node-id="${escapeAttributeValue(helperId)}"]`;
}

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
