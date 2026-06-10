export type AppConfig = {
  token: string;
  databasePath: string;
};

export function resolveConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    token: overrides?.token || process.env.REMOTE_SYNC_TOKEN || "dev-token",
    databasePath:
      overrides?.databasePath ||
      process.env.REMOTE_SYNC_DB_PATH ||
      "data/remote-sync.db",
  };
}
