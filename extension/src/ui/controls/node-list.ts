import type { ConversationNode } from "../../shared/types";

export interface NodeListOptions {
  readingLineOffset?: number;
  highlightedNodeIds?: Set<string>;
  activeNodeId?: string;
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

export function getNextSearchIndex(currentIndex: number, resultCount: number, direction: 1 | -1): number {
  if (resultCount <= 0) return -1;
  return (currentIndex + direction + resultCount) % resultCount;
}

export function scrollNodeIntoView(node: ConversationNode, readingLineOffset: number): boolean {
  if (!node.elementSelector) return false;
  const target = document.querySelector(node.elementSelector);
  if (!target) return false;
  window.scrollTo({
    top: getReadingLineScrollTop(target, readingLineOffset),
    behavior: "smooth"
  });
  return true;
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
  if (options.highlightedNodeIds?.has(node.id)) {
    button.classList.add("ai-chat-helper-node--match");
  }
  if (options.activeNodeId === node.id) {
    button.classList.add("ai-chat-helper-node--active");
  }
  button.textContent = `${node.index + 1}. ${node.title}`;
  button.addEventListener("click", () => {
    scrollNodeIntoView(node, options.readingLineOffset || 150);
  });
  return button;
}
