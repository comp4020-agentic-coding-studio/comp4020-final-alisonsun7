// Places and the people in them: who is here (presence), where they stand
// (moves), and what they say to whoever is near (talk). Sound was taken out
// (ADR 010), so a place's session is now only the room people share.
//
// A place is one room at every time of day (ADR 007). The session row in the
// database gives the room an id and lets a person keep the same participant
// id across visits; positions and words are kept in memory only.
import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { db, nowIso } from "./db.js";
import { log } from "./log.js";
import { placeMode, roomKey } from "./shared/catalog.js";
import type { Avatar, Person, Snapshot } from "./shared/protocol.js";
import type { User } from "./users.js";

const newId = (prefix: string): string => `${prefix}_${randomBytes(8).toString("hex")}`;

interface SessionRow {
  id: string;
  scene_id: string;
  mode: string;
}

const OPEN = "('idle','active','ending','failed')";

function getSession(id: string): SessionRow | undefined {
  return db.prepare("SELECT id, scene_id, mode FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
}

// The place's room, made if there isn't one yet. A room made before sound was
// taken out is still the room: it keeps its people's participant ids.
export function openSession(sceneId: string, givenMode: string): SessionRow {
  const mode = placeMode(sceneId, givenMode);
  const found = db
    .prepare(`SELECT id, scene_id, mode FROM sessions WHERE scene_id = ? AND mode = ? AND status IN ${OPEN} ORDER BY created_at DESC LIMIT 1`)
    .get(sceneId, mode) as SessionRow | undefined;
  if (found) return found;
  const id = newId("ses");
  db.prepare("INSERT INTO sessions (id, scene_id, mode, status, created_at) VALUES (?, ?, ?, 'idle', ?)").run(id, sceneId, mode, nowIso());
  log("session_opened", { session: id, scene: sceneId, mode });
  return getSession(id)!;
}

function ensureParticipant(session: SessionRow, user: User): Person {
  const row = db
    .prepare("SELECT id, display_name, avatar_id FROM participants WHERE session_id = ? AND user_id = ?")
    .get(session.id, user.id) as { id: string; display_name: string; avatar_id: Avatar } | undefined;
  if (row) return { id: row.id, name: row.display_name, avatar: row.avatar_id };
  const id = newId("par");
  db.prepare("INSERT INTO participants (id, session_id, user_id, display_name, avatar_id, joined_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    session.id,
    user.id,
    user.nickname,
    user.avatar,
    nowIso(),
  );
  return { id, name: user.nickname, avatar: user.avatar };
}

// ---- live streams and presence ------------------------------------------

// Open SSE streams per place. A stream without a user is someone looking
// before they've joined: they see everyone but aren't counted as here.
const rooms = new Map<string, Map<ServerResponse, User | null>>();

function onlineIn(sceneId: string, mode: string, session: SessionRow): Person[] {
  const room = rooms.get(roomKey(sceneId, mode));
  const seen = new Map<string, Person>();
  for (const user of room?.values() ?? []) {
    if (user && !seen.has(user.id)) seen.set(user.id, ensureParticipant(session, user));
  }
  return [...seen.values()];
}

export function snapshotFor(session: SessionRow, user: User | null): Snapshot {
  return {
    type: "snapshot",
    sessionId: session.id,
    sceneId: session.scene_id,
    serverNow: nowIso(),
    online: onlineIn(session.scene_id, session.mode, session),
    you: user ? ensureParticipant(session, user) : null,
  };
}

const frame = (msg: unknown): string => `data: ${JSON.stringify(msg)}\n\n`;

function sendAll(sceneId: string, mode: string, msg: unknown): void {
  const room = rooms.get(roomKey(sceneId, mode));
  if (!room) return;
  const data = frame(msg);
  for (const res of room.keys()) res.write(data);
}

function sendPresence(sceneId: string, mode: string): void {
  const session = openSession(sceneId, mode);
  sendAll(sceneId, mode, { type: "presence", sessionId: session.id, online: onlineIn(sceneId, mode, session) });
}

export function subscribe(res: ServerResponse, sceneId: string, mode: string, user: User | null): void {
  const key = roomKey(sceneId, mode);
  const room = rooms.get(key) ?? new Map<ServerResponse, User | null>();
  rooms.set(key, room);
  const wasHere = user ? [...room.values()].some((u) => u?.id === user.id) : true;
  room.set(res, user);
  const session = openSession(sceneId, mode);
  res.write(frame(snapshotFor(session, user)));
  if (user && !wasHere) {
    log("person_arrived", { user: user.id, nickname: user.nickname, scene: sceneId, session: session.id });
    sendPresence(sceneId, mode);
  }
}

export function unsubscribe(res: ServerResponse, sceneId: string, mode: string, user: User | null): void {
  const key = roomKey(sceneId, mode);
  const room = rooms.get(key);
  if (!room) return;
  room.delete(res);
  if (room.size === 0) rooms.delete(key);
  if (user && ![...room.values()].some((u) => u?.id === user.id)) {
    if (standing.get(key)?.delete(user.id)) moved.add(key);
    log("person_left", { user: user.id, nickname: user.nickname, scene: sceneId });
    sendPresence(sceneId, mode);
  }
}

export function placeSummary(sceneId: string, mode: string): { online: number } {
  const room = rooms.get(roomKey(sceneId, mode));
  return { online: new Set([...(room?.values() ?? [])].filter((u): u is User => u !== null).map((u) => u.id)).size };
}

// ---- where people stand, and what they say (ADR 007) --------------------
//
// Kept in memory only: positions are sent to everyone in the place five
// times a second; something said goes only to people within earshot, and
// is never stored or logged (the log has who spoke and how long it was).

interface Standing {
  person: Person;
  x: number;
  z: number;
  yaw: number;
  at: number;
}

const standing = new Map<string, Map<string, Standing>>(); // room → user id → where
const moved = new Set<string>();
const EARSHOT = 12;
const SAY_MAX = 120;

function streamsOf(key: string, userId: string): ServerResponse[] {
  return [...(rooms.get(key) ?? new Map<ServerResponse, User | null>())].filter(([, u]) => u?.id === userId).map(([res]) => res);
}

function sendMoves(key: string): void {
  const room = rooms.get(key);
  const here = standing.get(key);
  if (!room || !here) return;
  const [sceneId, mode] = key.split(":");
  const session = openSession(sceneId, mode);
  const msg = frame({ type: "moves", sessionId: session.id, people: [...here.values()].map((s) => ({ ...s.person, x: s.x, z: s.z, yaw: s.yaw })) });
  for (const res of room.keys()) res.write(msg);
}

// Five times a second, send whoever moved; forget anyone silent for 20 s.
setInterval(() => {
  const now = Date.now();
  for (const [key, here] of standing) {
    for (const [userId, s] of here)
      if (now - s.at > 20_000) {
        here.delete(userId);
        moved.add(key);
      }
  }
  for (const key of moved) sendMoves(key);
  moved.clear();
}, 200).unref();

const finite = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const moveTimes = new Map<string, number>();

export function move(user: User, sessionId: string, raw: unknown): { ok: boolean; code?: string } {
  const session = getSession(sessionId);
  if (!session) return { ok: false, code: "no_session" };
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!finite(o.x, 2000) || !finite(o.z, 2000) || !finite(o.yaw, 1000)) return { ok: false, code: "bad_request" };
  // at most ten a second; more are dropped, not refused
  const now = Date.now();
  if (now - (moveTimes.get(user.id) ?? 0) < 90) return { ok: true };
  moveTimes.set(user.id, now);
  const key = roomKey(session.scene_id, session.mode);
  const here = standing.get(key) ?? new Map<string, Standing>();
  standing.set(key, here);
  here.set(user.id, { person: ensureParticipant(session, user), x: o.x, z: o.z, yaw: o.yaw, at: now });
  moved.add(key);
  return { ok: true };
}

const sayTimes = new Map<string, number[]>();

// Words are trimmed, control characters dropped, and cut at SAY_MAX.
export function cleanWords(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SAY_MAX);
  return text.length > 0 ? text : null;
}

export function say(user: User, sessionId: string, raw: unknown): { ok: boolean; code?: string; heard?: number } {
  const session = getSession(sessionId);
  if (!session) return { ok: false, code: "no_session" };
  const text = cleanWords((raw as Record<string, unknown> | null)?.text);
  if (!text) return { ok: false, code: "bad_request" };
  const key = roomKey(session.scene_id, session.mode);
  const here = standing.get(key);
  const me = here?.get(user.id);
  if (!me) return { ok: false, code: "not_here" };
  // only words actually said count towards the limit
  const now = Date.now();
  const times = (sayTimes.get(user.id) ?? []).filter((t) => now - t < 10_000);
  if (times.length >= 8 || (times.length > 0 && now - times[times.length - 1] < 600)) return { ok: false, code: "slow_down" };
  times.push(now);
  sayTimes.set(user.id, times);
  // only people within earshot (and the speaker's own pages) hear it
  const listeners = [...(here?.entries() ?? [])].filter(([, s]) => Math.hypot(s.x - me.x, s.z - me.z) <= EARSHOT).map(([id]) => id);
  const msg = frame({ type: "said", sessionId: session.id, by: me.person.id, name: me.person.name, text });
  for (const id of listeners) for (const res of streamsOf(key, id)) res.write(msg);
  log("said", { user: user.id, nickname: user.nickname, session: session.id, chars: text.length, heard: listeners.length - 1 });
  return { ok: true, heard: listeners.length - 1 };
}

