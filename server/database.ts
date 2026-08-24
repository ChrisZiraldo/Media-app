import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export function openDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const database = new Database(path.join(dataDir, "media-tracker.db"));
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  runMigrations(database);
  return database;
}
