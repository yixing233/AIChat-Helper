export const schemaSql = `
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  message_count INTEGER NOT NULL,
  last_message_at TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, source_conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  snapshot_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  UNIQUE(conversation_id, snapshot_version),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_conversation_id
  ON conversation_snapshots(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_synced_at
  ON conversation_snapshots(synced_at);
`;
