import type { ConversationMessage, ConversationSnapshot } from "../../shared/types";

interface ClaudeConversationPayload {
  uuid?: string;
  id?: string;
  name?: string;
  title?: string;
  chat_messages?: ClaudeMessagePayload[];
  updated_at?: string;
  created_at?: string;
}

interface ClaudeMessagePayload {
  uuid?: string;
  id?: string;
  sender?: string;
  text?: string;
  content?: unknown;
  files?: ClaudeFilePayload[];
  created_at?: string;
}

interface ClaudeFilePayload {
  file_name?: string;
  filename?: string;
  name?: string;
  file_type?: string;
  mime_type?: string;
  url?: string;
}

export function extractClaudeSnapshotFromConversation(payload: unknown): ConversationSnapshot {
  const conversation = payload as ClaudeConversationPayload;
  const chatMessages = Array.isArray(conversation.chat_messages) ? conversation.chat_messages : [];

  return {
    platformId: "claude",
    conversationId: String(conversation.uuid || conversation.id || "current"),
    title: String(conversation.name || conversation.title || "Claude Conversation"),
    attachments: [],
    messages: chatMessages.map(messageToSnapshotMessage).filter((message): message is ConversationMessage => Boolean(message)),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at
  };
}

function messageToSnapshotMessage(message: ClaudeMessagePayload, index: number): ConversationMessage | null {
  const role = normalizeClaudeRole(message.sender);
  if (!role) return null;

  const text = [extractClaudeContentText(message.content), extractClaudeFileText(message.files), fallbackText(message.text)]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!text) return null;

  return {
    id: String(message.uuid || message.id || `claude-msg-${index + 1}`),
    role,
    text,
    createdAt: message.created_at
  };
}

function normalizeClaudeRole(sender?: string): ConversationMessage["role"] | null {
  const normalized = String(sender || "").toLowerCase();
  if (normalized === "human") return "user";
  if (normalized === "assistant") return "assistant";
  if (normalized === "system") return "system";
  return null;
}

function extractClaudeContentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map(contentPartToText).filter(Boolean).join("\n").trim();
  if (content && typeof content === "object") return contentPartToText(content);
  return "";
}

function contentPartToText(part: unknown): string {
  if (typeof part === "string") return part.trim();
  if (!part || typeof part !== "object") return "";
  const value = part as Record<string, unknown>;
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.content === "string") return value.content.trim();
  if (typeof value.name === "string" && typeof value.type === "string") return `[${value.type}: ${value.name}]`;
  return "";
}

function extractClaudeFileText(files?: ClaudeFilePayload[]): string {
  if (!Array.isArray(files) || files.length === 0) return "";
  return files
    .map((file, index) => {
      const name = file.file_name || file.filename || file.name || `file-${index + 1}`;
      return `[Attachment ${index + 1}: ${name}]`;
    })
    .join("\n");
}

function fallbackText(text?: string): string {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}
