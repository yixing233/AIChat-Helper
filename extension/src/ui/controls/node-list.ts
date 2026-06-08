import type { ConversationNode } from "../../shared/types";

export function filterConversationNodes(nodes: ConversationNode[], query: string): ConversationNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes.filter((node) => {
    const haystack = `${node.title} ${node.role || ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function renderNodeList(container: HTMLElement, nodes: ConversationNode[]): void {
  if (nodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ai-chat-helper-empty";
    empty.textContent = "No nodes found";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...nodes.map(createNodeButton));
}

function createNodeButton(node: ConversationNode): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ai-chat-helper-node";
  button.textContent = `${node.index + 1}. ${node.title}`;
  button.addEventListener("click", () => {
    if (!node.elementSelector) return;
    document.querySelector(node.elementSelector)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  return button;
}
