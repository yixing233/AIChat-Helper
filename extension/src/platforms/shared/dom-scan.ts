import type { ConversationNode } from "../../shared/types";

export interface ScanTextNodesOptions {
  roles?: Array<NonNullable<ConversationNode["role"]>>;
}

export function scanTextNodes(root: ParentNode, selectors: string[], prefix: string, options: ScanTextNodesOptions = {}): ConversationNode[] {
  const seen = new Set<Element>();
  const elements = selectors.flatMap((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)));

  return elements
    .filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      if (!element.textContent?.trim()) return false;
      const role = inferRole(element);
      if (!options.roles?.length) return true;
      if (!role) return false;
      return options.roles.includes(role);
    })
    .map((element, index) => {
      const id = element.getAttribute("data-message-id") || element.id || `${prefix}-node-${index + 1}`;
      const elementSelector = getOrCreateElementSelector(element, id);
      const text = element.textContent?.trim().replace(/\s+/g, " ") || "";
      const role = inferRole(element);

      return {
        id,
        title: text.slice(0, 80) || `Message ${index + 1}`,
        text,
        index,
        role,
        sourceMessageId: id,
        sessionIndex: index,
        elementSelector
      };
    });
}

function inferRole(element: HTMLElement): ConversationNode["role"] {
  const directRole = normalizeRole(element.getAttribute("data-message-author-role") || element.getAttribute("data-role") || "");
  if (directRole) return directRole;

  const testId = String(element.getAttribute("data-testid") || "").toLowerCase();
  const msgId = String(element.getAttribute("data-msgid") || element.getAttribute("data-msg-id") || "").toLowerCase();
  const className = String(element.getAttribute("class") || "").toLowerCase();
  const signature = `${testId} ${msgId} ${className}`;

  if (/\bconversation-turn-user\b/.test(testId) || testId === "send_message") return "user";
  if (testId === "receive_message") return "assistant";
  if (/-(question|user|human)$/i.test(msgId)) return "user";
  if (/-(answer|assistant|bot)$/i.test(msgId)) return "assistant";
  if (/(^|[-_\s])(question|user|human|sender|send)([-_\s]|$)/i.test(signature)) return "user";
  if (/(^|[-_\s])(answer|assistant|bot|reply|receive)([-_\s]|$)/i.test(signature)) return "assistant";

  return undefined;
}

function normalizeRole(value: string): ConversationNode["role"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "user" || normalized === "human") return "user";
  if (normalized === "assistant" || normalized === "ai" || normalized === "bot") return "assistant";
  if (normalized === "system") return "system";
  if (normalized === "tool") return "tool";
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
