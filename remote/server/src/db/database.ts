import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { schemaSql } from "./schema.js";

export function createDatabase(filename: string) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(schemaSql);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
