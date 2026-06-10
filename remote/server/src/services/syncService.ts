import type Database from "better-sqlite3";
import type {
  UpsertConversationRequest,
  UpsertConversationResponse,
} from "@remote/shared";
import {
  findConversation,
  getNextSnapshotVersion,
  insertConversation,
  insertSnapshot,
  updateConversation,
} from "../repositories/conversationRepository.js";
import { upsertDevice } from "../repositories/deviceRepository.js";
import { hashConversationPayload } from "../utils/hash.js";

export function upsertConversation(
  db: Database.Database,
  input: UpsertConversationRequest,
): UpsertConversationResponse {
  const transact = db.transaction((): UpsertConversationResponse => {
    const now = new Date().toISOString();
    const contentHash = hashConversationPayload(input.conversation);

    upsertDevice(db, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      now,
    });

    const existing = findConversation(
      db,
      input.conversation.platform,
      input.conversation.sourceConversationId,
    );

    if (!existing) {
      const conversationId = insertConversation(
        db,
        input.conversation,
        contentHash,
        now,
      );
      const snapshotId = insertSnapshot(db, {
        conversationId,
        snapshotVersion: 1,
        payloadJson: JSON.stringify(input.conversation),
        contentHash,
        syncedAt: now,
        createdByDeviceId: input.deviceId,
      });

      return {
        ok: true,
        status: "created" as const,
        conversationId: String(conversationId),
        snapshotId: String(snapshotId),
      };
    }

    if (existing.content_hash === contentHash) {
      return {
        ok: true,
        status: "unchanged" as const,
        conversationId: String(existing.id),
      };
    }

    updateConversation(db, existing.id, input.conversation, contentHash, now);
    const snapshotId = insertSnapshot(db, {
      conversationId: existing.id,
      snapshotVersion: getNextSnapshotVersion(db, existing.id),
      payloadJson: JSON.stringify(input.conversation),
      contentHash,
      syncedAt: now,
      createdByDeviceId: input.deviceId,
    });

    return {
      ok: true,
      status: "updated" as const,
      conversationId: String(existing.id),
      snapshotId: String(snapshotId),
    };
  });

  return transact();
}
