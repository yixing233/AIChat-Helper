import type { ConversationMessage, ConversationSnapshot } from "../../shared/types";

interface ChatGPTMappingNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: ChatGPTMessage;
}

interface ChatGPTMessage {
  id?: string;
  author?: { role?: string };
  content?: unknown;
  create_time?: number;
  metadata?: {
    attachments?: Array<{ name?: string; filename?: string; file_name?: string }>;
  };
}

interface ChatGPTConversationPayload {
  id?: string;
  conversation_id?: string;
  title?: string;
  current_node?: string;
  mapping?: Record<string, ChatGPTMappingNode>;
  create_time?: number;
  update_time?: number;
}

export function extractChatGPTSnapshotFromConversation(payload: unknown): ConversationSnapshot {
  const conversation = payload as ChatGPTConversationPayload;
  const mapping = conversation.mapping || {};
  const messages = extractMessagesFromMapping(mapping, conversation.current_node);

  return {
    platformId: "chatgpt",
    conversationId: String(conversation.id || conversation.conversation_id || "current"),
    title: String(conversation.title || "ChatGPT Conversation"),
    attachments: [],
    messages,
    createdAt: conversation.create_time ? new Date(conversation.create_time * 1000).toISOString() : undefined,
    updatedAt: conversation.update_time ? new Date(conversation.update_time * 1000).toISOString() : undefined
  };
}

function extractMessagesFromMapping(mapping: Record<string, ChatGPTMappingNode>, currentNodeId?: string): ConversationMessage[] {
  const orderedNodes = currentNodeId && mapping[currentNodeId]
    ? collectActivePath(mapping, currentNodeId)
    : collectDepthFirstPath(mapping);

  return orderedNodes
    .map((node) => nodeToMessage(node))
    .filter((message): message is ConversationMessage => Boolean(message))
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function collectActivePath(mapping: Record<string, ChatGPTMappingNode>, currentNodeId: string): ChatGPTMappingNode[] {
  const path: ChatGPTMappingNode[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = currentNodeId;

  while (cursor && mapping[cursor] && !visited.has(cursor)) {
    visited.add(cursor);
    path.unshift(mapping[cursor]);
    cursor = mapping[cursor].parent || undefined;
  }

  return path;
}

function collectDepthFirstPath(mapping: Record<string, ChatGPTMappingNode>): ChatGPTMappingNode[] {
  const keys = Object.keys(mapping);
  const rootId = mapping["client-created-root"] ? "client-created-root" : keys.find((id) => !mapping[id]?.parent) || keys[0];
  const visited = new Set<string>();
  const out: ChatGPTMappingNode[] = [];

  function walk(nodeId?: string): void {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = mapping[nodeId];
    if (!node) return;
    out.push(node);
    node.children?.forEach(walk);
  }

  walk(rootId);
  return out;
}

function nodeToMessage(node: ChatGPTMappingNode): ConversationMessage | null {
  const msg = node.message;
  if (!msg) return null;
  const role = normalizeRole(msg.author?.role);
  if (!role) return null;
  const text = [extractContentText(msg.content), extractAttachmentText(msg)].filter(Boolean).join("\n\n").trim();
  if (!text) return null;

  return {
    id: String(msg.id || node.id || `${role}-${Math.random().toString(36).slice(2)}`),
    role,
    text,
    createdAt: msg.create_time ? String(msg.create_time) : undefined
  };
}

function normalizeRole(role?: string): ConversationMessage["role"] | null {
  if (role === "user" || role === "assistant" || role === "system") return role;
  if (role === "tool") return "assistant";
  return null;
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!content || typeof content !== "object") return "";

  const value = content as Record<string, unknown>;
  if (Array.isArray(value.parts)) return partsToText(value.parts);
  if (typeof value.text === "string") return value.text.trim();
  if (Array.isArray(value.items)) return partsToText(value.items);
  if (Array.isArray(value.output)) return partsToText(value.output);
  if (Array.isArray(value.content)) return partsToText(value.content);
  return "";
}

function partsToText(parts: unknown[]): string {
  return parts.map(partToText).filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function partToText(part: unknown): string {
  if (typeof part === "string") return part.trim();
  if (!part || typeof part !== "object") return "";
  const value = part as Record<string, unknown>;
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.content === "string") return value.content.trim();
  if (typeof value.name === "string" && (value.content_type === "image_asset_pointer" || value.type === "image")) {
    return `[Image: ${value.name}]`;
  }
  return "";
}

function extractAttachmentText(msg: ChatGPTMessage): string {
  const attachments = msg.metadata?.attachments || [];
  return attachments
    .map((item, index) => {
      const name = item.name || item.filename || item.file_name || `file-${index + 1}`;
      return `[Attachment ${index + 1}: ${name}]`;
    })
    .join("\n");
}
