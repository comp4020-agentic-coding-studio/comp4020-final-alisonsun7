import type { ServerResponse } from "node:http";
import { db } from "./db.js";
import { log } from "./log.js";
import { COLS, ROWS, type Activity, type Cell, type GardenState, type Instrument, type Note, type PreviewState } from "./types.js";
import type { User } from "./users.js";

const NOTE_NAMES: Record<Note, string> = { C4: "C", D4: "D", E4: "E", G4: "G", A4: "A" };
const INSTRUMENT_NAMES: Record<Instrument, string> = { piano: "Piano", guitar: "Guitar", saxophone: "Saxophone" };

// Open SSE streams, keyed so presence counts people, not tabs.
const streams = new Map<ServerResponse, string>();
// Read-only preview streams from the welcome page. Not people creating, so
// they never count towards presence.
const watchers = new Set<ServerResponse>();

function onlineCount(): number {
  return new Set(streams.values()).size;
}

export function snapshot(): GardenState {
  const grid: Cell[][] = Array.from({ length: ROWS }, () => new Array<Cell>(COLS).fill(null));
  for (const n of db.prepare("SELECT row, col, note_type FROM notes").all() as { row: number; col: number; note_type: Note }[]) {
    grid[n.row][n.col] = n.note_type;
  }
  const state = db.prepare("SELECT instrument, version FROM garden_state WHERE id = 1").get() as {
    instrument: Instrument;
    version: number;
  };
  const activity = (
    db
      .prepare(
        `SELECT a.id, u.nickname, a.action, a.details, a.created_at
         FROM activity_logs a JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT 6`,
      )
      .all() as { id: number; nickname: string; action: string; details: string; created_at: string }[]
  ).map(describe);
  return { version: state.version, grid, instrument: state.instrument, online: onlineCount(), activity };
}

function describe(row: { id: number; nickname: string; action: string; details: string; created_at: string }): Activity {
  const d = JSON.parse(row.details) as Record<string, string | number>;
  let text: string;
  switch (row.action) {
    case "note_placed":
      text = `placed ${NOTE_NAMES[d.note as Note]} at row ${Number(d.row) + 1}, step ${Number(d.col) + 1}`;
      break;
    case "note_removed":
      text = `removed a note at row ${Number(d.row) + 1}, step ${Number(d.col) + 1}`;
      break;
    case "instrument_changed":
      text = `switched to ${INSTRUMENT_NAMES[d.to as Instrument]}`;
      break;
    default:
      text = "joined the garden";
  }
  return { id: row.id, nickname: row.nickname, text, at: row.created_at };
}

const toPreview = ({ version, grid, instrument, online }: GardenState): PreviewState => ({ version, grid, instrument, online });

export function preview(): PreviewState {
  return toPreview(snapshot());
}

function broadcast(): void {
  const state = snapshot();
  const frame = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of streams.keys()) res.write(frame);
  if (watchers.size === 0) return;
  const previewFrame = `data: ${JSON.stringify(toPreview(state))}\n\n`;
  for (const res of watchers) res.write(previewFrame);
}

// Every mutation runs in one transaction that also bumps the version, so
// the version order is the order the server applied writes: last write wins,
// and every client converges on the same final grid.
function mutate(user: User, action: string, details: Record<string, unknown>, apply: () => void): void {
  db.exec("BEGIN");
  try {
    apply();
    db.prepare("UPDATE garden_state SET version = version + 1, updated_at = datetime('now') WHERE id = 1").run();
    db.prepare("INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)").run(user.id, action, JSON.stringify(details));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  log(action, { user: user.id, nickname: user.nickname, ...details });
  broadcast();
}

export function recordJoin(user: User): void {
  mutate(user, "user_joined", {}, () => {});
}

export function placeNote(user: User, row: number, col: number, note: Note): void {
  mutate(user, "note_placed", { row, col, note }, () => {
    db.prepare(
      `INSERT INTO notes (row, col, note_type, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (row, col) DO UPDATE SET note_type = excluded.note_type,
         updated_by = excluded.updated_by, updated_at = datetime('now')`,
    ).run(row, col, note, user.id);
  });
}

export function removeNote(user: User, row: number, col: number): void {
  mutate(user, "note_removed", { row, col }, () => {
    db.prepare("DELETE FROM notes WHERE row = ? AND col = ?").run(row, col);
  });
}

export function changeInstrument(user: User, to: Instrument): void {
  const { instrument: from } = db.prepare("SELECT instrument FROM garden_state WHERE id = 1").get() as { instrument: Instrument };
  if (from === to) return;
  mutate(user, "instrument_changed", { from, to }, () => {
    db.prepare("UPDATE garden_state SET instrument = ? WHERE id = 1").run(to);
  });
}

export function subscribe(res: ServerResponse, user: User): void {
  const wasOnline = new Set(streams.values()).has(user.id);
  streams.set(res, user.id);
  if (!wasOnline) log("user_connected", { user: user.id, nickname: user.nickname, online: onlineCount() });
  broadcast();
}

export function unsubscribe(res: ServerResponse, user: User): void {
  streams.delete(res);
  if (!new Set(streams.values()).has(user.id)) {
    log("user_disconnected", { user: user.id, nickname: user.nickname, online: onlineCount() });
  }
  broadcast();
}

export function watch(res: ServerResponse): void {
  watchers.add(res);
  res.write(`data: ${JSON.stringify(preview())}\n\n`);
}

export function unwatch(res: ServerResponse): void {
  watchers.delete(res);
}
