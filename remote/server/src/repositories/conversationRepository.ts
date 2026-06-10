import type Database from "better-sqlite3";
import type { NormalizedConversation } from "@remote/shared";

export function findConversation(
  db: Database.Database,
  platform: string,
  sourceConversationId: string,
) {
  return db
    .prepare(
      "SELECT id, content_hash FROM conversations WHERE platform = ? AND source_conversation_id = ?",
    )
    .get(platform, sourceConversationId) as
    | { id: number; content_hash: string }
    | undefined;
}

export function insertConversation(
  db: Database.Database,
  conversation: NormalizedConversation,
  contentHash: string,
  now: string,
) {
  const result = db
    .prepare(
      "INSERT INTO conversations (platform, source_conversation_id, title, source_url, message_count, last_message_at, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      conversation.platform,
      conversation.sourceConversationId,
      conversation.title,
      conversation.url || null,
      conversation.messageCount,
      conversation.updatedAt || null,
      contentHash,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

export function updateConversation(
  db: Database.Database,
  conversationId: number,
  conversation: NormalizedConversation,
  contentHash: string,
  now: string,
) {
  db.prepare(
    "UPDATE conversations SET title = ?, source_url = ?, message_count = ?, last_message_at = ?, content_hash = ?, updated_at = ? WHERE id = ?",
  ).run(
    conversation.title,
    conversation.url || null,
    conversation.messageCount,
    conversation.updatedAt || null,
    contentHash,
    now,
    conversationId,
  );
}

export function insertSnapshot(
  db: Database.Database,
  input: {
    conversationId: number;
    snapshotVersion: number;
    payloadJson: string;
    contentHash: string;
    syncedAt: string;
    createdByDeviceId: string;
  },
) {
  const result = db
    .prepare(
      "INSERT INTO conversation_snapshots (conversation_id, snapshot_version, payload_json, content_hash, synced_at, created_by_device_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.conversationId,
      input.snapshotVersion,
      input.payloadJson,
      input.contentHash,
      input.syncedAt,
      input.createdByDeviceId,
    );

  return Number(result.lastInsertRowid);
}

export function getSnapshotCountForConversation(
  db: Database.Database,
  conversationId: number,
) {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM conversation_snapshots WHERE conversation_id = ?",
    )
    .get(conversationId) as { count: number };

  return row.count;
}

export function getNextSnapshotVersion(
  db: Database.Database,
  conversationId: number,
) {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(snapshot_version), 0) + 1 as nextVersion FROM conversation_snapshots WHERE conversation_id = ?",
    )
    .get(conversationId) as { nextVersion: number };

  return row.nextVersion;
}
