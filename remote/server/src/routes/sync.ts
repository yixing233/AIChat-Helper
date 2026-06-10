import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth.js";
import { upsertConversation } from "../services/syncService.js";
import {
  badRequestError,
  isUpsertConversationRequest,
} from "../utils/validation.js";

export async function syncRoutes(app: FastifyInstance) {
  app.post(
    "/api/sync/ping",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      return {
        ok: true,
        serverTime: new Date().toISOString(),
      };
    },
  );

  app.post(
    "/api/sync/upsert-conversation",
    { preHandler: verifyBearerToken(app.config.token) },
    async (request, reply) => {
      if (!isUpsertConversationRequest(request.body)) {
        return reply
          .status(400)
          .send(badRequestError("Invalid upsert conversation payload"));
      }

      return upsertConversation(app.db, request.body);
    },
  );
}
