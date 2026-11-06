// Places and the people in them: who is here (presence), where they stand
// (moves), what they say to whoever is near (talk), and the sounds they
// leave (ADR 011).
//
// A place is one room at every time of day (ADR 007). The session row in the
// database gives the room an id and lets a person keep the same participant
// id across visits; positions and words are kept in memory only, sounds in
// placed_sounds.
import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { db, inTransaction, nowIso } from "./db.js";
import { log } from "./log.js";
import { placeMode, roomKey } from "./shared/catalog.js";
import type { Avatar, MoveResult, Person, PlacedSound, Snapshot } from "./shared/protocol.js";
import { CROWD_MAX, CROWD_RADIUS, PLACE_MAX, REACH, SAME_APART, findSound } from "./shared/sounds.js";
import { hutAt, isPrivate, privateSound } from "./shared/huts.js";
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
    sounds: liveSounds(session.id),
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
  // A new page needs to see a taken hut immediately, even if its person
  // hasn't moved since before this page connected.
  sendMoves(key);
}

export function unsubscribe(res: ServerResponse, sceneId: string, mode: string, user: User | null): void {
  const key = roomKey(sceneId, mode);
  const room = rooms.get(key);
  if (!room) return;
  room.delete(res);
  if (room.size === 0) rooms.delete(key);
  if (user && ![...room.values()].some((u) => u?.id === user.id)) {
    if (standing.get(key)?.delete(user.id)) moved.add(key);
    endHutSounds(sceneId, mode, user, "left_place");
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
        const [sceneId, mode] = key.split(":");
        endHutSounds(sceneId, mode, { id: userId, nickname: s.person.name } as User, "went_quiet");
      }
  }
  for (const key of moved) sendMoves(key);
  moved.clear();
}, 200).unref();

const finite = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const moveTimes = new Map<string, number>();

export function move(user: User, sessionId: string, raw: unknown): MoveResult {
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
  const hut = hutAt(o.x, o.z);
  // Checking and accepting a move are synchronous in this single process:
  // two arrivals cannot both claim the same private hut. The browser's
  // locked doorway is helpful feedback, not the authority for admission.
  if (hut && isPrivate(hut) && [...here].some(([id, s]) => id !== user.id && now - s.at <= 20_000 && hutAt(s.x, s.z)?.id === hut.id)) {
    let previous = here.get(user.id);
    // A reconnect may beat the expiry sweep after another person has
    // entered. Never refresh or return to that expired/contested position.
    if (previous && (now - previous.at > 20_000 || hutAt(previous.x, previous.z)?.id === hut.id)) {
      here.delete(user.id);
      moved.add(key);
      endHutSounds(session.scene_id, session.mode, user, now - previous.at > 20_000 ? "went_quiet" : "hut_taken");
      previous = undefined;
    }
    if (previous) previous.at = now;
    return {
      ok: false,
      code: "hut_taken",
      hutId: hut.id,
      position: previous ? { x: previous.x, z: previous.z, yaw: previous.yaw } : { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 1, yaw: o.yaw },
    };
  }
  here.set(user.id, { person: ensureParticipant(session, user), x: o.x, z: o.z, yaw: o.yaw, at: now });
  moved.add(key);
  // out of the toilet or shower: whatever they left there for while they
  // were in goes (ADR 013)
  endHutSounds(session.scene_id, session.mode, user, "came_out", hut?.id);
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


// ---- sounds people leave (ADR 011) ----------------------------------------
//
// A sound is left where the server last saw you stand, and only someone
// standing beside it can remove it, so each change happens in the place, in
// front of whoever is there. Everything else is free: anyone may leave or
// remove any sound, and nothing fades.

interface PlacedRow {
  id: string;
  sound_id: string;
  x: number;
  z: number;
  name: string;
  placed_by: string;
  placed_at: string;
  while_in: string | null;
}

const placedFrom = (r: PlacedRow): PlacedSound => ({
  id: r.id,
  soundId: r.sound_id,
  x: r.x,
  z: r.z,
  by: r.name,
  byId: r.placed_by,
  at: r.placed_at,
  ...(r.while_in ? { whileIn: r.while_in } : {}),
});

function liveSounds(sessionId: string): PlacedSound[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.sound_id, s.x, s.z, p.display_name AS name, s.placed_by, s.placed_at, s.while_in FROM placed_sounds s
       JOIN participants p ON p.id = s.placed_by WHERE s.session_id = ? AND s.removed_at IS NULL ORDER BY s.placed_at`,
    )
    .all(sessionId) as unknown as PlacedRow[];
  return rows.map(placedFrom);
}

const soundTimes = new Map<string, number>();

// At most one change a second per person; the same sound needs room; a spot
// can't crowd up; nor can the whole place.
export function leaveSound(user: User, sessionId: string, raw: unknown): { ok: boolean; code?: string; sound?: PlacedSound } {
  const session = getSession(sessionId);
  if (!session) return { ok: false, code: "no_session" };
  const body = (raw ?? {}) as Record<string, unknown>;
  const kind = findSound(body.soundId);
  if (!kind) return { ok: false, code: "bad_request" };
  const key = roomKey(session.scene_id, session.mode);
  const me = standing.get(key)?.get(user.id);
  if (!me) return { ok: false, code: "not_here" };
  const now = Date.now();
  if (now - (soundTimes.get(user.id) ?? 0) < 1000) return { ok: false, code: "slow_down" };
  // For while you're inside (ADR 013): only in a toilet or shower, only
  // its own sound, one at a time; the room rules don't apply, since it
  // goes as soon as you come out.
  const hut = body.whileInside === true ? hutAt(me.x, me.z) : undefined;
  if (body.whileInside === true) {
    if (!hut || !isPrivate(hut)) return { ok: false, code: "not_inside" };
    if (privateSound(hut) !== kind.id) return { ok: false, code: "bad_request" };
  }

  const result = inTransaction((): { ok: boolean; code?: string; sound?: PlacedSound } => {
    const live = liveSounds(session.id);
    if (hut) {
      if (live.some((p) => p.byId === me.person.id && p.whileIn)) return { ok: false, code: "already" };
    } else {
      // Sounds tied to a stay cannot fill the enduring soundscape or use
      // up a neighbour's room: they end as soon as their person leaves.
      const kept = live.filter((p) => !p.whileIn);
      if (kept.length >= PLACE_MAX) return { ok: false, code: "place_full" };
      const near = kept.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) <= CROWD_RADIUS);
      if (near.some((p) => p.soundId === kind.id && Math.hypot(p.x - me.x, p.z - me.z) < SAME_APART)) return { ok: false, code: "too_close" };
      if (near.length >= CROWD_MAX) return { ok: false, code: "crowded" };
    }
    const sound: PlacedSound = {
      id: newId("snd"),
      soundId: kind.id,
      x: Math.round(me.x * 100) / 100,
      z: Math.round(me.z * 100) / 100,
      by: me.person.name,
      byId: me.person.id,
      at: nowIso(),
      ...(hut ? { whileIn: hut.id } : {}),
    };
    db.prepare("INSERT INTO placed_sounds (id, session_id, sound_id, x, z, placed_by, placed_at, while_in) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      sound.id,
      session.id,
      sound.soundId,
      sound.x,
      sound.z,
      me.person.id,
      sound.at,
      hut?.id ?? null,
    );
    return { ok: true, sound };
  });
  if (!result.ok) return result;
  soundTimes.set(user.id, now);
  const sound = result.sound!;
  sendAll(session.scene_id, session.mode, { type: "sound-left", sessionId: session.id, sound });
  log("sound_left", { user: user.id, nickname: user.nickname, session: session.id, sound: sound.soundId, id: sound.id, x: sound.x, z: sound.z, ...(hut ? { while_in: hut.id } : {}) });
  return result;
}

// Whatever someone left for while they were inside a toilet or shower goes
// once they're no longer in it: they came out (`stillIn` is the hut they're
// in now, if any), left the place, or went quiet (ADR 013).
function endHutSounds(sceneId: string, mode: string, user: Pick<User, "id" | "nickname">, reason: string, stillIn?: string): void {
  const session = openSession(sceneId, mode);
  const participant = db.prepare("SELECT id, display_name FROM participants WHERE session_id = ? AND user_id = ?").get(session.id, user.id) as { id: string; display_name: string } | undefined;
  if (!participant) return;
  const rows = db
    .prepare("SELECT id, sound_id, while_in FROM placed_sounds WHERE session_id = ? AND placed_by = ? AND while_in IS NOT NULL AND removed_at IS NULL")
    .all(session.id, participant.id) as { id: string; sound_id: string; while_in: string }[];
  for (const row of rows) {
    if (row.while_in === stillIn) continue;
    db.prepare("UPDATE placed_sounds SET removed_by = ?, removed_at = ? WHERE id = ? AND removed_at IS NULL").run(participant.id, nowIso(), row.id);
    sendAll(sceneId, mode, { type: "sound-removed", sessionId: session.id, id: row.id, soundId: row.sound_id, by: participant.display_name, byId: participant.id, left: true });
    log("sound_removed", { user: user.id, nickname: user.nickname, session: session.id, sound: row.sound_id, id: row.id, reason, hut: row.while_in });
  }
}

// After a restart nobody is inside anything: end what was left for a stay.
db.prepare("UPDATE placed_sounds SET removed_by = placed_by, removed_at = ? WHERE while_in IS NOT NULL AND removed_at IS NULL").run(nowIso());

export function removeSound(user: User, sessionId: string, soundRowId: string): { ok: boolean; code?: string } {
  const session = getSession(sessionId);
  if (!session) return { ok: false, code: "no_session" };
  const key = roomKey(session.scene_id, session.mode);
  const me = standing.get(key)?.get(user.id);
  if (!me) return { ok: false, code: "not_here" };
  const now = Date.now();
  if (now - (soundTimes.get(user.id) ?? 0) < 1000) return { ok: false, code: "slow_down" };
  const row = db
    .prepare(
      `SELECT s.id, s.sound_id, s.x, s.z, p.display_name AS name, s.placed_by, s.placed_at FROM placed_sounds s
       JOIN participants p ON p.id = s.placed_by WHERE s.id = ? AND s.session_id = ? AND s.removed_at IS NULL`,
    )
    .get(soundRowId, session.id) as PlacedRow | undefined;
  if (!row) return { ok: false, code: "gone" };
  if (Math.hypot(row.x - me.x, row.z - me.z) > REACH) return { ok: false, code: "too_far" };
  // only the first of two people removing it at once removes it
  const changed = db.prepare("UPDATE placed_sounds SET removed_by = ?, removed_at = ? WHERE id = ? AND removed_at IS NULL").run(me.person.id, nowIso(), row.id);
  if (Number(changed.changes) === 0) return { ok: false, code: "gone" };
  soundTimes.set(user.id, now);
  sendAll(session.scene_id, session.mode, { type: "sound-removed", sessionId: session.id, id: row.id, soundId: row.sound_id, by: me.person.name, byId: me.person.id });
  log("sound_removed", { user: user.id, nickname: user.nickname, session: session.id, sound: row.sound_id, id: row.id, left_by: row.name });
  return { ok: true };
}
