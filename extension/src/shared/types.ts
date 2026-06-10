export type PlatformId = "chatgpt" | "claude" | "qwen" | "doubao" | "deepseek";

export interface PlatformMatch {
  id: PlatformId;
  name: string;
}

export interface ConversationNode {
  id: string;
  title: string;
  text?: string;
  attachments?: ExportAttachment[];
  index: number;
  role?: "user" | "assistant" | "system" | "tool";
  sourceMessageId?: string;
  sessionIndex?: number;
  elementSelector?: string;
}

export interface NodeJumpContext {
  readingLineOffset: number;
  nodes: ConversationNode[];
  activeNodeId?: string | null;
  root?: ParentNode;
}

export interface NodeActiveContext extends NodeJumpContext {
  scrollContainer?: HTMLElement | null;
}

export interface ConversationMessage {
  id: string;
  sourceMessageId?: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  fullText?: string;
  status?: string;
  createdAt?: string;
  attachments?: ExportAttachment[];
  fragmentType?: string;
  isThought?: boolean;
  isSearch?: boolean;
  isArtifact?: boolean;
  hasThought?: boolean;
  textWithoutThought?: string;
}

export interface ExportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content?: string;
  url?: string;
}

export interface DeepSeekExportMetadata {
  sessionId?: string;
  title?: string;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
}

export interface ConversationSnapshotMetadata {
  deepseek?: DeepSeekExportMetadata;
}

export interface ConversationSnapshot {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  messages: ConversationMessage[];
  attachments: ExportAttachment[];
  createdAt?: string;
  createdAtText?: string;
  updatedAt?: string;
  updatedAtText?: string;
  messageCount?: number;
  metadata?: ConversationSnapshotMetadata;
}

export interface ConversationSummary {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  updatedAt?: string;
  updatedAtText?: string;
  createdAt?: string;
  createdAtText?: string;
  messageCount?: number;
  pinned?: boolean;
  workspaceId?: string;
  workspaceLabel?: string;
  projectId?: string;
  projectTitle?: string;
  archived?: boolean;
  batchKey?: string;
}

export interface BatchConversationSelection {
  summary: ConversationSummary;
  selectedMessageIndices?: number[];
  textWithoutThoughtMessageIds?: string[];
}

export interface BatchListOptions {
  limit: number;
  cursor?: string;
  capturedEvents?: CapturedNetworkEvent[];
}

export interface CapturedNetworkEvent {
  id: string;
  platformId?: PlatformId;
  kind: "fetch" | "xhr" | "blob-url";
  url: string;
  method?: string;
  status?: number;
  requestHeaders?: Record<string, string>;
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
  jumpToNode?(node: ConversationNode, context: NodeJumpContext): boolean | Promise<boolean>;
  getActiveNode?(context: NodeActiveContext): ConversationNode | null;
  getScrollContainer?(root?: ParentNode): HTMLElement | null;
  hydrateFromCapturedApi?(events: CapturedNetworkEvent[]): Promise<ConversationSnapshot>;
  fetchConversationList?(options: BatchListOptions): Promise<ConversationSummary[]>;
  fetchConversationDetail?(id: string, summary?: ConversationSummary, capturedEvents?: CapturedNetworkEvent[]): Promise<ConversationSnapshot>;
}
