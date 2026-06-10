import Fastify from "fastify";
import type Database from "better-sqlite3";
import { createDatabase } from "./db/database.js";
import { resolveConfig, type AppConfig } from "./plugins/env.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { syncRoutes } from "./routes/sync.js";
import { systemRoutes } from "./routes/system.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Database.Database;
  }
}

export function buildApp(overrides?: Partial<AppConfig>) {
  const config = resolveConfig(overrides);
  const db = createDatabase(config.databasePath);
  const app = Fastify();

  app.decorate("config", config);
  app.decorate("db", db);

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/health", async () => {
    return { ok: true };
  });

  void app.register(authRoutes);
  void app.register(syncRoutes);
  void app.register(conversationRoutes);
  void app.register(systemRoutes);

  return app;
}
