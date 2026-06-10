import type Database from "better-sqlite3";

export function upsertDevice(
  db: Database.Database,
  input: { deviceId: string; deviceName: string; now: string },
) {
  const existing = db
    .prepare("SELECT id FROM devices WHERE device_id = ?")
    .get(input.deviceId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE devices SET device_name = ?, last_seen_at = ?, updated_at = ? WHERE device_id = ?",
    ).run(input.deviceName, input.now, input.now, input.deviceId);
    return existing.id;
  }

  const result = db
    .prepare(
      "INSERT INTO devices (device_id, device_name, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.deviceId, input.deviceName, input.now, input.now, input.now);

  return Number(result.lastInsertRowid);
}
