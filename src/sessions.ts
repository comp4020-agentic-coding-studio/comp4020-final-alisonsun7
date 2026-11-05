// Live places, the operations people send them, the server's 3-minute clock,
// and sealing a session into a memory.
//
// A place is a scene in one mode (Marie Reay everyday, Chifley rainy dusk…).
// Each place has one open session at a time. Sounds can be placed while it's
// idle; "Start a 3-minute memory" starts the server clock; at 3:00 (or when
// the starter saves early) the session is sealed into a memory and the place
// opens a new, empty session.
//
// A living place (ADR 007) never seals: one session per scene for every
// mode, kept for good, with no clock.
//
// Every accepted change is one transaction that bumps the session's revision
// and writes a session_events row with that number as server_seq, so the
// event order is the order the server applied writes, with no gaps.
import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { db, inTransaction, nowIso } from "./db.js";
import { log } from "./log.js";
import {
  isLiving,
  maxSoundsIn,
  placeMode,
  SPOT_MAX,
  PER_PERSON,
  SESSION_MS,
  SOUNDS,
  checkPlace,
  findMode,
  findScene,
  roomKey,
  spotFor,
  type SoundId,
} from "./shared/catalog.js";
import {
  REJECT_MESSAGES,
  type Avatar,
  type Committed,
  type CommittedPayload,
  type MemorySnapshot,
  type Op,
  type OpResult,
  type Person,
  type Placement,
  type PlacementPatch,
  type RejectCode,
  type SessionStatus,
  type Snapshot,
  type TimelineEntry,
} from "./shared/protocol.js";
import { applyPlacementEvent } from "./shared/state.js";
import type { User } from "./users.js";

// Tests shorten the memory; production never sets this.
const DURATION_MS = Number(process.env.SOAC_SESSION_MS) > 0 ? Number(process.env.SOAC_SESSION_MS) : SESSION_MS;

const newId = (prefix: string): string => `${prefix}_${randomBytes(8).toString("hex")}`;

interface SessionRow {
  id: string;
  scene_id: string;
  mode: string;
  status: SessionStatus;
  started_at: string | null;
  started_by: string | null;
  duration_ms: number;
  revision: number;
  error: string | null;
}

interface PlacementRow {
  id: string;
  owner_id: string;
  display_name: string;
  avatar_id: Avatar;
  sound_id: SoundId;
  shot_id: string;
  anchor_id: string;
  x: number;
  y: number;
  gain: number;
  pan: number;
  revision: number;
  created_at: string;
}

const OPEN = "('idle','active','ending','failed')";

function getSession(id: string): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
}

// The place's open session, created empty if there isn't one.
export function openSession(sceneId: string, givenMode: string): SessionRow {
  const mode = placeMode(sceneId, givenMode);
  const found = db
    .prepare(`SELECT * FROM sessions WHERE scene_id = ? AND mode = ? AND status IN ${OPEN} ORDER BY created_at DESC LIMIT 1`)
    .get(sceneId, mode) as SessionRow | undefined;
  if (found) return found;
  const id = newId("ses");
  db.prepare("INSERT INTO sessions (id, scene_id, mode, status, duration_ms, created_at) VALUES (?, ?, ?, 'idle', ?, ?)").run(
    id,
    sceneId,
    mode,
    DURATION_MS,
    nowIso(),
  );
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

function toPlacement(r: PlacementRow): Placement {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.display_name,
    ownerAvatar: r.avatar_id,
    soundId: r.sound_id,
    shotId: r.shot_id,
    anchorId: r.anchor_id,
    x: r.x,
    y: r.y,
    gain: r.gain,
    pan: r.pan,
    revision: r.revision,
    createdAt: r.created_at,
  };
}

const PLACEMENT_SELECT = `SELECT p.id, p.owner_id, pa.display_name, pa.avatar_id, p.sound_id, p.shot_id, p.anchor_id,
  p.x, p.y, p.gain, p.pan, p.revision, p.created_at
  FROM placements p JOIN participants pa ON pa.id = p.owner_id`;

function livePlacements(sessionId: string): Placement[] {
  return (
    db.prepare(`${PLACEMENT_SELECT} WHERE p.session_id = ? AND p.is_deleted = 0 ORDER BY p.created_at, p.id`).all(sessionId) as unknown as PlacementRow[]
  ).map(toPlacement);
}

function getPlacement(sessionId: string, placementId: string): (Placement & { deleted: boolean }) | undefined {
  const row = db.prepare(`${PLACEMENT_SELECT} WHERE p.session_id = ? AND p.id = ?`).get(sessionId, placementId) as PlacementRow | undefined;
  if (!row) return undefined;
  const { is_deleted } = db.prepare("SELECT is_deleted FROM placements WHERE id = ?").get(placementId) as { is_deleted: number };
  return { ...toPlacement(row), deleted: is_deleted === 1 };
}

function lastMemoryId(sceneId: string, mode: string): string | null {
  const row = db
    .prepare(
      `SELECT m.id FROM memories m JOIN sessions s ON s.id = m.session_id
       WHERE s.scene_id = ? AND s.mode = ? ORDER BY m.saved_at DESC LIMIT 1`,
    )
    .get(sceneId, mode) as { id: string } | undefined;
  return row?.id ?? null;
}

const elapsedMs = (s: SessionRow): number =>
  s.started_at ? Math.max(0, Math.min(s.duration_ms, Date.now() - Date.parse(s.started_at))) : 0;

// ---- live streams and presence ------------------------------------------

// Open SSE streams per place. A stream without a user is someone looking
// before they've joined: they see everything but aren't counted as here.
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
    mode: session.mode,
    status: session.status,
    serverNow: nowIso(),
    startedAt: session.started_at,
    startedBy: session.started_by,
    durationMs: session.duration_ms,
    seq: session.revision,
    placements: livePlacements(session.id),
    online: onlineIn(session.scene_id, session.mode, session),
    you: user ? ensureParticipant(session, user) : null,
    lastMemoryId: lastMemoryId(session.scene_id, session.mode),
    error: session.error,
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

// After a session is sealed, everyone in the place gets the new, empty one.
function rollover(sceneId: string, mode: string): void {
  const session = openSession(sceneId, mode);
  const room = rooms.get(roomKey(sceneId, mode));
  if (!room) return;
  for (const [res, user] of room) res.write(frame(snapshotFor(session, user)));
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
    log("person_arrived", { user: user.id, nickname: user.nickname, scene: sceneId, mode, session: session.id });
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
    log("person_left", { user: user.id, nickname: user.nickname, scene: sceneId, mode });
    sendPresence(sceneId, mode);
  }
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
  if (!session || !isLiving(session.scene_id)) return { ok: false, code: "no_session" };
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
  if (!session || !isLiving(session.scene_id)) return { ok: false, code: "no_session" };
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

export function placeSummary(sceneId: string, mode: string): { online: number; sounds: number; status: SessionStatus } {
  const session = openSession(sceneId, mode);
  const room = rooms.get(roomKey(sceneId, mode));
  const people = new Set([...(room?.values() ?? [])].filter((u): u is User => u !== null).map((u) => u.id));
  const { n } = db.prepare("SELECT count(*) AS n FROM placements WHERE session_id = ? AND is_deleted = 0").get(session.id) as { n: number };
  return { online: people.size, sounds: n, status: session.status };
}

// ---- operations ---------------------------------------------------------

function reject(code: RejectCode, placement?: Placement): OpResult {
  return { ok: false, code, message: REJECT_MESSAGES[code], ...(placement ? { placement } : {}) };
}

// Inside a transaction: the next event in this session's order.
function commit(sessionId: string, by: string | null, operationId: string, payload: CommittedPayload): Committed {
  db.prepare("UPDATE sessions SET revision = revision + 1 WHERE id = ?").run(sessionId);
  const s = getSession(sessionId)!;
  const serverAt = nowIso();
  const elapsed = elapsedMs(s);
  db.prepare(
    `INSERT INTO session_events (id, session_id, participant_id, event_type, operation_id, payload_json, elapsed_ms, server_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId("evt"), sessionId, by, payload.kind, operationId, JSON.stringify(payload), elapsed, s.revision, serverAt);
  return { type: "committed", sessionId, serverSeq: s.revision, operationId, by, serverAt, elapsedMs: elapsed, payload };
}

const OP_ID = /^[A-Za-z0-9_-]{8,64}$/;
const isStr = (v: unknown, max = 64): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isGain = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

// Shape only; whether the values make sense here is checked per op.
export function parseOp(raw: unknown): Op | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.operationId !== "string" || !OP_ID.test(o.operationId)) return null;
  const operationId = o.operationId;
  switch (o.type) {
    case "sound.add":
      if (!isStr(o.soundId) || !isStr(o.shotId) || !isStr(o.anchorId) || typeof o.gain !== "number") return null;
      return { operationId, type: "sound.add", soundId: o.soundId, shotId: o.shotId, anchorId: o.anchorId, gain: o.gain };
    case "sound.update": {
      if (!isStr(o.placementId) || !isInt(o.baseRevision)) return null;
      const moving = o.shotId !== undefined || o.anchorId !== undefined;
      if (moving && (!isStr(o.shotId) || !isStr(o.anchorId))) return null;
      if (o.gain !== undefined && typeof o.gain !== "number") return null;
      if (!moving && o.gain === undefined) return null;
      return {
        operationId,
        type: "sound.update",
        placementId: o.placementId,
        baseRevision: o.baseRevision,
        ...(o.gain !== undefined ? { gain: o.gain as number } : {}),
        ...(moving ? { shotId: o.shotId as string, anchorId: o.anchorId as string } : {}),
      };
    }
    case "sound.remove":
      if (!isStr(o.placementId) || !isInt(o.baseRevision)) return null;
      return { operationId, type: "sound.remove", placementId: o.placementId, baseRevision: o.baseRevision };
    case "session.start":
      return { operationId, type: "session.start" };
    case "session.finish":
      return { operationId, type: "session.finish" };
    default:
      return null;
  }
}

// A person may send this many changes per window; enough to fiddle with a
// volume slider, not enough to flood a room.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 40;
const recent = new Map<string, number[]>();

function allow(userId: string): boolean {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) {
    recent.set(userId, times);
    return false;
  }
  times.push(now);
  recent.set(userId, times);
  return true;
}

function isDuplicate(sessionId: string, operationId: string): boolean {
  return db.prepare("SELECT 1 FROM session_events WHERE session_id = ? AND operation_id = ?").get(sessionId, operationId) !== undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function applyOp(user: User, sessionId: string, raw: unknown): OpResult {
  const op = parseOp(raw);
  if (!op) return reject("bad_request");
  const session = getSession(sessionId);
  if (!session) return reject("no_session");
  // A retried request is answered as it was the first time, before anything
  // else is checked: it already happened.
  if (isDuplicate(session.id, op.operationId)) return { ok: true, duplicate: true, committed: [] };
  if (!allow(user.id)) return reject("slow_down");

  const me = ensureParticipant(session, user);
  const result = run(session, me, op);
  if (result.ok) {
    for (const c of result.committed) sendAll(session.scene_id, session.mode, c);
    if (result.committed.some((c) => c.payload.kind === "session.saved")) rollover(session.scene_id, session.mode);
    const first = result.committed[0];
    if (first) log(first.payload.kind.replace(".", "_"), { user: user.id, nickname: user.nickname, session: session.id, ...describe(first.payload) });
  } else {
    log("op_rejected", { user: user.id, nickname: user.nickname, session: session.id, op: op.type, code: result.code });
  }
  return result;
}

function describe(p: CommittedPayload): Record<string, unknown> {
  switch (p.kind) {
    case "sound.add":
      return { sound: p.placement.soundId, shot: p.placement.shotId, anchor: p.placement.anchorId, gain: p.placement.gain };
    case "sound.update":
      return { placement: p.patch.placementId, ...(p.patch.gain !== undefined ? { gain: p.patch.gain } : {}), ...(p.patch.anchorId ? { anchor: p.patch.anchorId } : {}) };
    case "sound.remove":
      return { placement: p.placementId };
    case "session.saved":
      return { memory: p.memoryId };
    case "session.failed":
      return { error: p.error };
    default:
      return {};
  }
}

// Thrown inside a transaction to undo what it already wrote and refuse.
class Rejected extends Error {
  constructor(readonly code: RejectCode) {
    super(code);
  }
}

const editable = (s: SessionRow): boolean => s.status === "idle" || s.status === "active";

function run(session: SessionRow, me: Person, op: Op): OpResult {
  switch (op.type) {
    case "sound.add": {
      if (!editable(session)) return reject("sealed");
      const place = checkPlace(session.scene_id, op.shotId, op.anchorId, op.soundId);
      if (!place.ok) return reject(place.code);
      if (!isGain(op.gain)) return reject("bad_gain");
      const living = isLiving(session.scene_id);
      try {
        return inTransaction(() => {
        let live = livePlacements(session.id);
        const here = live.filter((p) => p.shotId === op.shotId && p.anchorId === op.anchorId);
        if (living && here.length >= SPOT_MAX) return reject("spot_full");
        const committed: Committed[] = [];
        const mine = live.filter((p) => p.ownerId === me.id);
        if (mine.length >= PER_PERSON) {
          if (!living) return reject("your_limit");
          // In a living place your newest sound replaces your oldest, so you
          // can always add one.
          const oldest = mine[0];
          db.prepare("UPDATE placements SET is_deleted = 1, revision = revision + 1, updated_at = ? WHERE id = ?").run(nowIso(), oldest.id);
          committed.push(commit(session.id, me.id, `${op.operationId}-r`, { kind: "sound.remove", placementId: oldest.id }));
          live = live.filter((p) => p.id !== oldest.id);
        }
        if (live.length >= maxSoundsIn(session.scene_id)) throw new Rejected("place_full");
        const index = live.filter((p) => p.shotId === op.shotId && p.anchorId === op.anchorId).length;
        const spot = spotFor(place.anchor, index);
        const id = newId("plc");
        const at = nowIso();
        db.prepare(
          `INSERT INTO placements (id, session_id, owner_id, sound_id, shot_id, anchor_id, x, y, gain, pan, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(id, session.id, me.id, op.soundId, op.shotId, op.anchorId, spot.x, spot.y, round2(op.gain), spot.pan, at, at);
        const placement = getPlacement(session.id, id)!;
        const { deleted: _d, ...clean } = placement;
        committed.push(commit(session.id, me.id, op.operationId, { kind: "sound.add", placement: clean }));
        return { ok: true, duplicate: false, committed } as OpResult;
        });
      } catch (err) {
        if (err instanceof Rejected) return reject(err.code);
        throw err;
      }
    }

    case "sound.update":
    case "sound.remove": {
      if (!editable(session)) return reject("sealed");
      const found = getPlacement(session.id, op.placementId);
      if (!found || found.deleted) return reject("no_placement");
      const { deleted: _d, ...current } = found;
      // In a living place anyone may turn a sound up or down; only the person
      // who added it may move or remove it.
      const volumeOnly = op.type === "sound.update" && op.shotId === undefined && op.anchorId === undefined;
      if (current.ownerId !== me.id && !(volumeOnly && isLiving(session.scene_id))) return reject("not_owner");
      if (current.revision !== op.baseRevision) return reject("stale", current);

      if (op.type === "sound.remove") {
        return inTransaction(() => {
          db.prepare("UPDATE placements SET is_deleted = 1, revision = revision + 1, updated_at = ? WHERE id = ?").run(nowIso(), current.id);
          return { ok: true, duplicate: false, committed: [commit(session.id, me.id, op.operationId, { kind: "sound.remove", placementId: current.id })] };
        });
      }

      const patch: PlacementPatch = { placementId: current.id, revision: current.revision + 1 };
      if (op.gain !== undefined) {
        if (!isGain(op.gain)) return reject("bad_gain");
        patch.gain = round2(op.gain);
      }
      if (op.shotId !== undefined && op.anchorId !== undefined) {
        const place = checkPlace(session.scene_id, op.shotId, op.anchorId, current.soundId);
        if (!place.ok) return reject(place.code);
        const others = livePlacements(session.id).filter((p) => p.id !== current.id && p.shotId === op.shotId && p.anchorId === op.anchorId);
        const spot = spotFor(place.anchor, others.length);
        Object.assign(patch, { shotId: op.shotId, anchorId: op.anchorId, x: spot.x, y: spot.y, pan: spot.pan });
      }
      return inTransaction(() => {
        db.prepare(
          `UPDATE placements SET gain = ?, shot_id = ?, anchor_id = ?, x = ?, y = ?, pan = ?, revision = ?, updated_at = ? WHERE id = ?`,
        ).run(
          patch.gain ?? current.gain,
          patch.shotId ?? current.shotId,
          patch.anchorId ?? current.anchorId,
          patch.x ?? current.x,
          patch.y ?? current.y,
          patch.pan ?? current.pan,
          patch.revision,
          nowIso(),
          current.id,
        );
        return { ok: true, duplicate: false, committed: [commit(session.id, me.id, op.operationId, { kind: "sound.update", patch })] };
      });
    }

    case "session.start": {
      if (isLiving(session.scene_id)) return reject("no_memories");
      if (session.status === "active") return reject("already_started");
      if (session.status !== "idle") return reject("sealed");
      const committed = inTransaction(() => {
        const startedAt = nowIso();
        db.prepare("UPDATE sessions SET status = 'active', started_at = ?, started_by = ?, duration_ms = ? WHERE id = ?").run(
          startedAt,
          me.id,
          DURATION_MS,
          session.id,
        );
        return commit(session.id, me.id, op.operationId, { kind: "session.start", startedAt, startedBy: me.id, durationMs: DURATION_MS });
      });
      schedule(session.id, DURATION_MS);
      return { ok: true, duplicate: false, committed: [committed] };
    }

    case "session.finish": {
      if (isLiving(session.scene_id)) return reject("no_memories");
      // Finishing is idempotent: a session that's saved, or being saved, is
      // already finished.
      if (session.status === "saved" || session.status === "ending") return { ok: true, duplicate: true, committed: [] };
      if (session.status === "idle") return reject("not_started");
      if (session.status === "active" && session.started_by !== me.id && elapsedMs(session) < session.duration_ms) {
        return reject("not_starter");
      }
      return { ok: true, duplicate: false, committed: seal(session.id, op.operationId, me.id) };
    }
  }
}

// ---- the clock and sealing ----------------------------------------------

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function schedule(sessionId: string, inMs: number): void {
  clearTimeout(timers.get(sessionId));
  timers.set(
    sessionId,
    setTimeout(() => {
      timers.delete(sessionId);
      const s = getSession(sessionId);
      if (!s || s.status !== "active") return;
      const committed = seal(sessionId, `clock-${sessionId}`, null);
      for (const c of committed) sendAll(s.scene_id, s.mode, c);
      if (committed.some((c) => c.payload.kind === "session.saved")) rollover(s.scene_id, s.mode);
    }, Math.max(0, inMs)),
  );
}

let failNextSave = false;
// Test hook: the next memory write throws inside its transaction, as a full
// disk or a locked database would.
export function failNextSaveForTest(): void {
  failNextSave = true;
}

function isSoundPayload(p: CommittedPayload): p is TimelineEntry["payload"] {
  return p.kind === "sound.add" || p.kind === "sound.update" || p.kind === "sound.remove";
}

function buildMemory(session: SessionRow, memoryId: string): MemorySnapshot {
  const scene = findScene(session.scene_id);
  const mode = scene && findMode(scene, session.mode);
  const events = db
    .prepare("SELECT server_seq, event_type, payload_json, elapsed_ms FROM session_events WHERE session_id = ? ORDER BY server_seq")
    .all(session.id) as { server_seq: number; event_type: string; payload_json: string; elapsed_ms: number }[];
  const startSeq = events.find((e) => e.event_type === "session.start")?.server_seq ?? 0;
  // Saved early, the memory is as long as it actually ran, so a replay
  // doesn't sit on the last frame for the rest of the three minutes.
  const ran = Math.max(1000, elapsedMs(session));

  // What was already there when the clock started is the memory's first
  // frame; everything after is replayed at the moment it happened.
  let atStart: Placement[] = [];
  const during: TimelineEntry[] = [];
  for (const e of events) {
    const payload = JSON.parse(e.payload_json) as CommittedPayload;
    if (!isSoundPayload(payload)) continue;
    if (e.server_seq < startSeq) atStart = applyPlacementEvent(atStart, payload);
    else during.push({ seq: e.server_seq, t: Math.min(ran, e.elapsed_ms), payload });
  }
  const timeline: TimelineEntry[] = [
    ...atStart.map((placement, i) => ({ seq: -atStart.length + i, t: 0, payload: { kind: "sound.add" as const, placement } })),
    ...during,
  ];

  const people = db
    .prepare("SELECT id, display_name, avatar_id FROM participants WHERE session_id = ? ORDER BY joined_at")
    .all(session.id) as { id: string; display_name: string; avatar_id: Avatar }[];
  const contributed = new Set(timeline.filter((e) => e.payload.kind === "sound.add").map((e) => (e.payload as { placement: Placement }).placement.ownerId));
  const here = new Set(onlineIn(session.scene_id, session.mode, session).map((p) => p.id));
  const asPerson = (p: (typeof people)[number]): Person => ({ id: p.id, name: p.display_name, avatar: p.avatar_id });

  return {
    version: 1,
    memoryId,
    sceneId: session.scene_id,
    mode: session.mode,
    title: `${scene?.title ?? session.scene_id} · ${mode?.label ?? session.mode}`,
    startedAt: session.started_at ?? nowIso(),
    endedAt: nowIso(),
    durationMs: ran,
    contributors: people.filter((p) => contributed.has(p.id)).map(asPerson),
    listeners: people.filter((p) => !contributed.has(p.id) && here.has(p.id)).map(asPerson),
    placements: livePlacements(session.id),
    timeline,
  };
}

// Seal a session into a memory. Returns the events it committed: ending,
// then saved or failed. A failed save leaves every sound in place, and
// finishing again retries.
function seal(sessionId: string, operationId: string, by: string | null): Committed[] {
  clearTimeout(timers.get(sessionId));
  timers.delete(sessionId);
  const out: Committed[] = [];
  const s = getSession(sessionId)!;
  if (s.status === "active" || s.status === "failed") {
    out.push(
      inTransaction(() => {
        db.prepare("UPDATE sessions SET status = 'ending', error = NULL WHERE id = ?").run(sessionId);
        return commit(sessionId, by, operationId, { kind: "session.ending" });
      }),
    );
  }

  try {
    out.push(
      inTransaction(() => {
        const sealed = getSession(sessionId)!;
        const memoryId = newId("mem");
        const snapshot = buildMemory(sealed, memoryId);
        if (failNextSave) {
          failNextSave = false;
          throw new Error("injected save failure");
        }
        db.prepare("INSERT INTO memories (id, session_id, title, visibility, saved_at, snapshot_json) VALUES (?, ?, ?, 'public', ?, ?)").run(
          memoryId,
          sessionId,
          snapshot.title,
          snapshot.endedAt,
          JSON.stringify(snapshot),
        );
        db.prepare("UPDATE sessions SET status = 'saved' WHERE id = ?").run(sessionId);
        log("memory_saved", { session: sessionId, memory: memoryId, sounds: snapshot.placements.length, contributors: snapshot.contributors.length });
        return commit(sessionId, by, `${operationId}-saved`, { kind: "session.saved", memoryId });
      }),
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("memory_save_failed", { session: sessionId, error });
    out.push(
      inTransaction(() => {
        db.prepare("UPDATE sessions SET status = 'failed', error = ? WHERE id = ?").run(REJECT_MESSAGES.save_failed, sessionId);
        return commit(sessionId, by, `${operationId}-failed-${Date.now()}`, { kind: "session.failed", error: REJECT_MESSAGES.save_failed });
      }),
    );
  }
  return out;
}

// On start: memories whose three minutes ran out while the server was
// stopped are sealed now; the rest get their clocks back.
export function recover(): void {
  const rows = db.prepare("SELECT * FROM sessions WHERE status IN ('active','ending')").all() as unknown as SessionRow[];
  for (const s of rows) {
    const left = s.started_at ? Date.parse(s.started_at) + s.duration_ms - Date.now() : 0;
    if (s.status === "active" && left > 0) {
      schedule(s.id, left);
      log("clock_resumed", { session: s.id, remaining_ms: left });
    } else {
      seal(s.id, `recover-${s.id}-${Date.now()}`, null);
      log("clock_recovered", { session: s.id });
    }
  }
}

export function sessionSnapshot(sessionId: string, user: User | null): Snapshot | null {
  const s = getSession(sessionId);
  return s ? snapshotFor(s, user) : null;
}

export function eventsSince(sessionId: string, sinceSeq: number): Committed[] {
  const rows = db
    .prepare(
      `SELECT operation_id, participant_id, payload_json, elapsed_ms, server_seq, created_at
       FROM session_events WHERE session_id = ? AND server_seq > ? ORDER BY server_seq`,
    )
    .all(sessionId, sinceSeq) as { operation_id: string; participant_id: string | null; payload_json: string; elapsed_ms: number; server_seq: number; created_at: string }[];
  return rows.map((r) => ({
    type: "committed",
    sessionId,
    serverSeq: r.server_seq,
    operationId: r.operation_id,
    by: r.participant_id,
    serverAt: r.created_at,
    elapsedMs: r.elapsed_ms,
    payload: JSON.parse(r.payload_json) as CommittedPayload,
  }));
}

export function isKnownSound(id: string): id is SoundId {
  return id in SOUNDS;
}
