import type { NormalizedConversation, SupportedPlatform } from "./conversation";

export type ValidateTokenResponse = {
  ok: true;
};

export type SyncPingRequest = {
  deviceId: string;
  deviceName: string;
};

export type SyncPingResponse = {
  ok: true;
  serverTime: string;
};

export type UpsertConversationRequest = {
  deviceId: string;
  deviceName: string;
  conversation: NormalizedConversation;
  contentHash: string;
};

export type UpsertConversationStatus = "created" | "updated" | "unchanged";

export type UpsertConversationResponse = {
  ok: true;
  status: UpsertConversationStatus;
  conversationId: string;
  snapshotId?: string;
};

export type ConversationListItem = {
  id: string;
  platform: SupportedPlatform;
  sourceConversationId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};

export type ConversationListResponse = {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ConversationDetailResponse = {
  conversation: ConversationListItem & {
    sourceUrl?: string;
    contentHash: string;
    createdAt: string;
    lastMessageAt?: string;
  };
  latestSnapshot: {
    id: string;
    snapshotVersion: number;
    syncedAt: string;
    payload: NormalizedConversation;
  };
};

export type ConversationsQuery = {
  platform?: SupportedPlatform;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
};
