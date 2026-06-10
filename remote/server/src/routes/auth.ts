import type { FastifyInstance } from "fastify";
import { verifyBearerToken } from "../plugins/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/validate-token",
    { preHandler: verifyBearerToken(app.config.token) },
    async () => {
      return { ok: true };
    },
  );
}
