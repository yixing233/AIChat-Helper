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
    .map((element, index) => ({
      id: element.getAttribute("data-message-id") || element.id || `${prefix}-node-${index + 1}`,
      title: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || `Message ${index + 1}`,
      index,
      role: inferRole(element),
      elementSelector: element.id ? `#${CSS.escape(element.id)}` : undefined
    }));
}

function inferRole(element: HTMLElement): ConversationNode["role"] {
  const role = element.getAttribute("data-message-author-role") || element.getAttribute("data-role") || "";
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") return role;
  return undefined;
}
