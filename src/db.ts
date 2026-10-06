import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Each migration's SQL must be safe to run once and only once; re-running the
// whole list on every boot (guarded by _migrations) is what makes startup
// idempotent — no table-drop, no reseed.
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_initial",
    sql: `
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'collecting',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        nickname TEXT NOT NULL,
        credential_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_participants_room ON participants(room_id);

      CREATE TABLE proposals (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        participant_id TEXT NOT NULL REFERENCES participants(id),
        category TEXT NOT NULL CHECK (category IN ('WHERE', 'EAT', 'DO')),
        title TEXT NOT NULL,
        request_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (room_id, participant_id, request_key)
      );
      CREATE INDEX idx_proposals_room ON proposals(room_id);
    `,
  },
];

function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );`);
  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec(migration.sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

// /data is the course's persistent Fly volume; anywhere else is local/dev and
// must not collide with it.
export function defaultDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return process.env.NODE_ENV === "production" ? "/data/daydraw.db" : "./.data/dev.db";
}
