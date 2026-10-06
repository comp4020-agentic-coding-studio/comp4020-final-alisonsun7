import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { emptyRoleCounts, pickLeastPopulated } from "./roles.js";
import type { Category } from "./validation.js";

interface Migration {
  name: string;
  sql?: string;
  // For migrations that need more than DDL, e.g. backfilling existing rows
  // the same way the live assignment path would.
  run?: (db: DatabaseSync) => void;
}

// Each migration must be safe to run once and only once; re-running the
// whole list on every boot (guarded by _migrations) is what makes startup
// idempotent — no table-drop, no reseed.
const MIGRATIONS: Migration[] = [
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
  {
    name: "002_roles",
    // Nullable: a brand-new row always sets it at insert time (src/rooms.ts),
    // so NULL only ever appears on rows written before this column existed —
    // handled by the backfill below, not by a NOT NULL default here. The
    // column-add is itself guarded (not just the outer _migrations table) so
    // this migration is safe to re-run if an upgrade crashes between adding
    // the column and finishing the backfill.
    run: (db) => {
      const hasRoleColumn = (
        db.prepare("SELECT 1 FROM pragma_table_info('participants') WHERE name = 'role'").get()
      ) !== undefined;
      if (!hasRoleColumn) db.exec("ALTER TABLE participants ADD COLUMN role TEXT;");

      const rooms = db
        .prepare("SELECT DISTINCT room_id FROM participants WHERE role IS NULL")
        .all() as { room_id: string }[];
      for (const { room_id: roomId } of rooms) {
        const rows = db
          .prepare("SELECT id FROM participants WHERE room_id = ? ORDER BY created_at ASC")
          .all(roomId) as { id: string }[];
        const counts = emptyRoleCounts();
        for (const row of rows) {
          const role: Category = pickLeastPopulated(counts);
          counts[role]++;
          db.prepare("UPDATE participants SET role = ? WHERE id = ?").run(role, row.id);
        }
      }
    },
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
    // SQLite's DDL is transactional, so a crash mid-migration rolls back the
    // schema change too — otherwise a restart would re-run an ALTER TABLE
    // whose column already exists and fail permanently.
    db.exec("BEGIN");
    try {
      if (migration.sql) db.exec(migration.sql);
      if (migration.run) migration.run(db);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
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
