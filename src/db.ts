import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Production: the Fly volume at /data (the only storage that survives a
// redeploy). Locally: .data/, which is gitignored.
const path = process.env.DB_PATH ?? (process.env.NODE_ENV === "production" ? "/data/garden.db" : ".data/garden.db");
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    row INTEGER NOT NULL CHECK (row BETWEEN 0 AND 5),
    col INTEGER NOT NULL CHECK (col BETWEEN 0 AND 5),
    note_type TEXT NOT NULL,
    updated_by TEXT NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (row, col)
  );

  CREATE TABLE IF NOT EXISTS garden_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    instrument TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO garden_state (id, instrument, version) VALUES (1, 'piano', 0);
`);
