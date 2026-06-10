import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth.js";
import { parsePositiveInteger } from "../utils/validation.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get(
    "/api/conversations",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request) => {
      const query = request.query as {
        platform?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };
      const page = parsePositiveInteger(query.page, 1, 100000);
      const pageSize = parsePositiveInteger(query.pageSize, 20, 100);
      const offset = (page - 1) * pageSize;

      const filters: string[] = [];
      const values: Array<string | number> = [];

      if (query.platform) {
        filters.push("platform = ?");
        values.push(query.platform);
      }

      if (query.search) {
        filters.push("title LIKE ?");
        values.push(`%${query.search}%`);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = app.db
        .prepare(
          `SELECT id, platform, source_conversation_id as sourceConversationId, title, message_count as messageCount, updated_at as updatedAt
           FROM conversations
           ${whereClause}
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...values, pageSize, offset) as Array<{
          id: number;
          platform: string;
          sourceConversationId: string;
          title: string;
          messageCount: number;
          updatedAt: string;
        }>;
      const totalRow = app.db
        .prepare(`SELECT COUNT(*) as count FROM conversations ${whereClause}`)
        .get(...values) as { count: number };

      return {
        items: rows.map((row) => ({ ...row, id: String(row.id) })),
        total: totalRow.count,
        page,
        pageSize,
      };
    },
  );

  app.get(
    "/api/conversations/:id",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request, reply) => {
      const params = request.params as { id: string };
      const conversation = app.db
        .prepare(
          "SELECT id, platform, source_conversation_id as sourceConversationId, title, source_url as sourceUrl, message_count as messageCount, content_hash as contentHash, created_at as createdAt, updated_at as updatedAt, last_message_at as lastMessageAt FROM conversations WHERE id = ?",
        )
        .get(params.id) as
        | {
            id: number;
            platform: string;
            sourceConversationId: string;
            title: string;
            sourceUrl?: string;
            messageCount: number;
            contentHash: string;
            createdAt: string;
            updatedAt: string;
            lastMessageAt?: string;
          }
        | undefined;

      if (!conversation) {
        reply.status(404);
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Conversation not found",
        };
      }

      const latestSnapshot = app.db
        .prepare(
          "SELECT id, snapshot_version as snapshotVersion, synced_at as syncedAt, payload_json as payloadJson FROM conversation_snapshots WHERE conversation_id = ? ORDER BY snapshot_version DESC LIMIT 1",
        )
        .get(params.id) as
        | {
            id: number;
            snapshotVersion: number;
            syncedAt: string;
            payloadJson: string;
        }
        | undefined;

      if (!latestSnapshot) {
        reply.status(404);
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Conversation snapshot not found",
        };
      }

      const detailConversation = {
        id: String(conversation.id),
        platform: conversation.platform,
        sourceConversationId: conversation.sourceConversationId,
        title: conversation.title,
        messageCount: conversation.messageCount,
        contentHash: conversation.contentHash,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        ...(conversation.sourceUrl ? { sourceUrl: conversation.sourceUrl } : {}),
        ...(conversation.lastMessageAt
          ? { lastMessageAt: conversation.lastMessageAt }
          : {}),
      };

      return {
        conversation: detailConversation,
        latestSnapshot: {
          id: String(latestSnapshot.id),
          snapshotVersion: latestSnapshot.snapshotVersion,
          syncedAt: latestSnapshot.syncedAt,
          payload: JSON.parse(latestSnapshot.payloadJson),
        },
      };
    },
  );
}
