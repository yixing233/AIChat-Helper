import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorizedError } from "../utils/errors.js";

export function verifyBearerToken(expectedToken: string) {
  return async function authGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token || token !== expectedToken) {
      return reply.status(401).send(unauthorizedError());
    }
  };
}
