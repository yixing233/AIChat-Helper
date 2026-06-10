import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth.js";

export async function systemRoutes(app: FastifyInstance) {
  app.get(
    "/api/system/status",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      const conversationCountRow = app.db
        .prepare("SELECT COUNT(*) as count FROM conversations")
        .get() as { count: number };
      const deviceCountRow = app.db
        .prepare("SELECT COUNT(*) as count FROM devices")
        .get() as { count: number };

      return {
        ok: true,
        service: "remote-sync",
        database: "sqlite",
        conversationCount: conversationCountRow.count,
        deviceCount: deviceCountRow.count,
        serverTime: new Date().toISOString(),
      };
    },
  );
}
