import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCENES, SOUNDS } from "./shared/catalog.js";

// Production: the Fly volume at /data (the only storage that survives a
// redeploy). Locally: .data/, which is gitignored. A new file name, so the
// SoundGarden database on the volume is left alone rather than migrated.
const path = process.env.DB_PATH ?? (process.env.NODE_ENV === "production" ? "/data/sound-of-a-city.db" : ".data/sound-of-a-city.db");
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);

// Tables follow the pack's docs/05, plus `users` (the anonymous identity
// SoundGarden already had, so a person is the same across visits).
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 2000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    avatar TEXT NOT NULL CHECK (avatar IN ('cat','dog')),
    session_token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id),
    mode TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('idle','active','ending','saved','failed')),
    started_at TEXT,
    started_by TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 180000,
    revision INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_open ON sessions (scene_id, mode, status);

  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    display_name TEXT NOT NULL,
    avatar_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    UNIQUE (session_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS sound_assets (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    file_path TEXT,
    duration_ms INTEGER,
    looping INTEGER NOT NULL DEFAULT 0,
    license_name TEXT NOT NULL,
    attribution TEXT,
    publication_allowed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS placements (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    owner_id TEXT NOT NULL REFERENCES participants(id),
    sound_id TEXT NOT NULL REFERENCES sound_assets(id),
    shot_id TEXT NOT NULL,
    anchor_id TEXT NOT NULL,
    x REAL NOT NULL CHECK (x BETWEEN 0 AND 1),
    y REAL NOT NULL CHECK (y BETWEEN 0 AND 1),
    gain REAL NOT NULL CHECK (gain BETWEEN 0 AND 1),
    pan REAL NOT NULL CHECK (pan BETWEEN -1 AND 1),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS placements_live ON placements (session_id, is_deleted);

  CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    participant_id TEXT,
    event_type TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    server_seq INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (session_id, operation_id),
    UNIQUE (session_id, server_seq)
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
    title TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
    saved_at TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS memories_public ON memories (visibility, saved_at);
`);

// Added for living places (ADR 008): who last turned a sound up or down.
// Older databases get the column on start; nothing else changes.
const placementColumns = (db.prepare("PRAGMA table_info(placements)").all() as { name: string }[]).map((c) => c.name);
if (!placementColumns.includes("adjusted_by")) db.exec("ALTER TABLE placements ADD COLUMN adjusted_by TEXT");

// Reference rows the foreign keys point at. Upserted from the catalogue on
// every start, never deleted, so old memories keep resolving.
const upsertScene = db.prepare(
  "INSERT INTO scenes (id, title) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET title = excluded.title",
);
for (const s of SCENES) upsertScene.run(s.id, s.title);

const upsertSound = db.prepare(
  `INSERT INTO sound_assets (id, label, category, looping, license_name, attribution, publication_allowed)
   VALUES (?, ?, ?, 1, 'Original Web Audio synthesis', 'Synthesised in the browser by this app; no recorded audio', 1)
   ON CONFLICT (id) DO UPDATE SET label = excluded.label, category = excluded.category`,
);
for (const s of Object.values(SOUNDS)) upsertSound.run(s.id, s.label, s.category);

export function inTransaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const nowIso = (): string => new Date().toISOString();
