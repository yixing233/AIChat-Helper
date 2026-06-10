export const supportedPlatforms = [
  "chatgpt",
  "claude",
  "qwen",
  "doubao",
  "deepseek",
] as const;

export type SupportedPlatform = (typeof supportedPlatforms)[number];

export type NormalizedAttachment = {
  name?: string;
  url?: string;
  mimeType?: string;
};

export type NormalizedToolCall = {
  type: string;
  name?: string;
  input?: unknown;
  output?: unknown;
};

export type NormalizedMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  text?: string;
  html?: string;
  attachments?: NormalizedAttachment[];
  toolCalls?: NormalizedToolCall[];
  parentId?: string;
  sequence: number;
  createdAt?: string;
};

export type NormalizedConversation = {
  platform: SupportedPlatform;
  sourceConversationId: string;
  title: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  messages: NormalizedMessage[];
};
