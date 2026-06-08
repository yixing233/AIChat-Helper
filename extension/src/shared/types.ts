export type PlatformId = "chatgpt" | "claude" | "qwen" | "doubao" | "deepseek";

export interface PlatformMatch {
  id: PlatformId;
  name: string;
}

export interface ConversationNode {
  id: string;
  title: string;
  index: number;
  role?: "user" | "assistant" | "system" | "tool";
  elementSelector?: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  createdAt?: string;
  attachments?: ExportAttachment[];
}

export interface ExportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content?: string;
  url?: string;
}

export interface ConversationSnapshot {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  messages: ConversationMessage[];
  attachments: ExportAttachment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationSummary {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  updatedAt?: string;
  messageCount?: number;
}

export interface BatchListOptions {
  limit: number;
  cursor?: string;
}

export interface CapturedNetworkEvent {
  id: string;
  platformId?: PlatformId;
  kind: "fetch" | "xhr" | "blob-url";
  url: string;
  method?: string;
  status?: number;
  requestBody?: string;
  responseText?: string;
  fileName?: string;
  mimeType?: string;
  createdAt: number;
}

export interface ExportFile {
  path: string;
  mimeType: string;
  content: string | Uint8Array;
}

export interface Exporter {
  format: "html" | "markdown" | "txt";
  export(snapshot: ConversationSnapshot): Promise<ExportFile[]>;
}

export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  matches(url: URL): boolean;
  getConversationId(url?: URL): string;
  scanDomNodes(root?: ParentNode): ConversationNode[];
  hydrateFromCapturedApi?(events: CapturedNetworkEvent[]): Promise<ConversationSnapshot>;
  fetchConversationList?(options: BatchListOptions): Promise<ConversationSummary[]>;
  fetchConversationDetail?(id: string): Promise<ConversationSnapshot>;
}
