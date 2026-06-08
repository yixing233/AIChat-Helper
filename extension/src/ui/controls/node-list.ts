import type { ConversationNode } from "../../shared/types";

export interface NodeListOptions {
  readingLineOffset?: number;
}

export function filterConversationNodes(nodes: ConversationNode[], query: string): ConversationNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes.filter((node) => {
    const haystack = `${node.title} ${node.role || ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getReadingLineScrollTop(element: Element, readingLineOffset: number, currentScrollY = window.scrollY || document.documentElement.scrollTop || 0): number {
  return currentScrollY + element.getBoundingClientRect().top - readingLineOffset;
}

export function renderNodeList(container: HTMLElement, nodes: ConversationNode[], options: NodeListOptions = {}): void {
  if (nodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ai-chat-helper-empty";
    empty.textContent = "No nodes found";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...nodes.map((node) => createNodeButton(node, options)));
}

function createNodeButton(node: ConversationNode, options: NodeListOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ai-chat-helper-node";
  button.textContent = `${node.index + 1}. ${node.title}`;
  button.addEventListener("click", () => {
    if (!node.elementSelector) return;
    const target = document.querySelector(node.elementSelector);
    if (!target) return;
    window.scrollTo({
      top: getReadingLineScrollTop(target, options.readingLineOffset || 150),
      behavior: "smooth"
    });
  });
  return button;
}
