import type { ConversationNode } from "../../shared/types";

export interface NodeListOptions {
  readingLineOffset?: number;
  dotGap?: number;
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
  const dotGap = normalizeDotGap(options.dotGap);
  container.classList.add("ai-chat-helper-orbital__nodes");
  container.style.setProperty("--ai-chat-helper-dot-gap", `${dotGap}px`);

  const track = document.createElement("div");
  track.className = "ai-chat-helper-orbital__track";
  track.setAttribute("aria-hidden", "true");

  if (nodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ai-chat-helper-empty";
    empty.textContent = "No nodes found";
    container.replaceChildren(track, empty);
    return;
  }

  const railHeight = (nodes.length - 1) * dotGap + 32;
  container.style.height = `${Math.max(96, railHeight)}px`;
  container.replaceChildren(track, ...nodes.map((node, index) => createNodeButton(node, index, dotGap, options)));
}

function createNodeButton(node: ConversationNode, index: number, dotGap: number, options: NodeListOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ai-chat-helper-node ai-chat-helper-node-dot";
  if (options.highlightedNodeIds?.has(node.id)) {
    button.classList.add("ai-chat-helper-node--match");
  }
  if (options.activeNodeId === node.id) {
    button.classList.add("ai-chat-helper-node--active");
    button.setAttribute("aria-current", "true");
  }
  button.style.top = `${16 + index * dotGap}px`;
  button.setAttribute("aria-label", `${node.index + 1}. ${node.title}`);
  button.title = node.title;
  button.textContent = String(node.index + 1);
  button.addEventListener("click", () => {
    scrollNodeIntoView(node, options.readingLineOffset || 150);
  });
  return button;
}

function normalizeDotGap(value: unknown): number {
  const parsed = Number(value ?? 36);
  if (!Number.isFinite(parsed)) return 36;
  return Math.max(20, Math.min(50, Math.round(parsed)));
}
