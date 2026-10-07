import type { DatabaseSync } from "node:sqlite";
import { hashCredential, newCredential, newId, newRoomCode } from "./ids.js";
import { emptyRoleCounts, pickLeastPopulated, type RoleCounts } from "./roles.js";
import type { Category } from "./validation.js";

export const MAX_PARTICIPANTS = 12;
export const MIN_TO_START = 2;

export interface Room {
  id: string;
  code: string;
  title: string;
  phase: string;
  revision: number;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  nickname: string;
  role: Category | null;
  createdAt: string;
}

export interface Proposal {
  id: string;
  roomId: string;
  participantId: string;
  authorNickname: string;
  category: Category;
  title: string;
  createdAt: string;
}

// node:sqlite's row type is Record<string, SQLOutputValue>, which has no
// structural overlap with our narrower row shapes for `as` to accept directly.
const asRow = <T>(row: unknown): T => row as T;

const isUniqueViolationOn = (err: unknown, columns: string): boolean =>
  err instanceof Error &&
  (err as { code?: string }).code === "ERR_SQLITE_ERROR" &&
  err.message.includes(`UNIQUE constraint failed: ${columns}`);

interface RoomRow {
  id: string;
  code: string;
  title: string;
  phase: string;
  revision: number;
  created_at: string;
}

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  code: row.code,
  title: row.title,
  phase: row.phase,
  revision: row.revision,
  createdAt: row.created_at,
});

// Every state-changing commit below calls this inside its own transaction so
// the revision bump can never be observed without the change it describes,
// or vice versa. Reads (support totals, votes, etc. in later milestones)
// don't bump it; only membership/proposal/phase writes do, per M1 scope.
function bumpRevision(db: DatabaseSync, roomId: string): void {
  db.prepare("UPDATE rooms SET revision = revision + 1 WHERE id = ?").run(roomId);
}

interface ParticipantRow {
  id: string;
  room_id: string;
  nickname: string;
  role: Category | null;
  created_at: string;
}

const toParticipant = (row: ParticipantRow): Participant => ({
  id: row.id,
  roomId: row.room_id,
  nickname: row.nickname,
  role: row.role,
  createdAt: row.created_at,
});

// Current count of participants already assigned each category, for picking
// the least-populated one next.
export function tallyRoles(db: DatabaseSync, roomId: string): RoleCounts {
  const counts = emptyRoleCounts();
  const rows = asRow<{ role: Category; n: number }[]>(
    db
      .prepare("SELECT role, COUNT(*) as n FROM participants WHERE room_id = ? AND role IS NOT NULL GROUP BY role")
      .all(roomId),
  );
  for (const row of rows) counts[row.role] = row.n;
  return counts;
}

export type AddParticipantResult =
  | { outcome: "added"; participant: Participant; credential: string }
  | { outcome: "full" };

// Capacity and role assignment happen in one statement (an INSERT gated by a
// subquery count, with the role pre-computed from the current tally just
// before it): since node:sqlite calls are synchronous, nothing else can run
// on this single-threaded server between the tally and the insert, so two
// "concurrent" join requests can never both land in the same slot or both
// see the same stale counts.
function addParticipant(
  db: DatabaseSync,
  roomId: string,
  nickname: string,
): AddParticipantResult {
  const participantId = newId();
  const credential = newCredential();
  const credentialHash = hashCredential(credential);
  const role = pickLeastPopulated(tallyRoles(db, roomId));

  const info = db
    .prepare(
      `INSERT INTO participants (id, room_id, nickname, credential_hash, role)
       SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM participants WHERE room_id = ?) < ${MAX_PARTICIPANTS}`,
    )
    .run(participantId, roomId, nickname, credentialHash, role, roomId);
  if (info.changes === 0) return { outcome: "full" };

  const row = asRow<ParticipantRow>(
    db.prepare("SELECT * FROM participants WHERE id = ?").get(participantId),
  );
  return { outcome: "added", participant: toParticipant(row), credential };
}

export type CreateRoomResult =
  | { outcome: "created"; room: Room; participant: Participant; credential: string }
  | { outcome: "full" }; // unreachable in practice (a brand-new room starts at 0), kept for type honesty

export function createRoom(
  db: DatabaseSync,
  input: { title: string; nickname: string },
): CreateRoomResult {
  const roomId = newId();

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newRoomCode();
    try {
      db.exec("BEGIN");
      db.prepare("INSERT INTO rooms (id, code, title) VALUES (?, ?, ?)").run(roomId, code, input.title);
      const added = addParticipant(db, roomId, input.nickname);
      if (added.outcome === "full") {
        db.exec("ROLLBACK");
        return { outcome: "full" };
      }
      bumpRevision(db, roomId);
      db.exec("COMMIT");

      const room = asRow<RoomRow>(db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId));
      return {
        outcome: "created",
        room: toRoom(room),
        participant: added.participant,
        credential: added.credential,
      };
    } catch (err) {
      db.exec("ROLLBACK");
      if (isUniqueViolationOn(err, "rooms.code")) continue; // code collision: retry with a fresh code
      throw err;
    }
  }
  throw new Error("could not allocate a unique room code");
}

// addParticipant's own INSERT is already atomic with the capacity check
// (single statement), but adding a second write (the revision bump) needs an
// explicit transaction so a crash between the two can't commit one without
// the other.
export function joinRoom(db: DatabaseSync, roomId: string, nickname: string): AddParticipantResult {
  db.exec("BEGIN");
  try {
    const added = addParticipant(db, roomId, nickname);
    if (added.outcome === "added") bumpRevision(db, roomId);
    db.exec("COMMIT");
    return added;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function findRoomByCode(db: DatabaseSync, code: string): Room | undefined {
  const row = asRow<RoomRow | undefined>(db.prepare("SELECT * FROM rooms WHERE code = ?").get(code));
  return row && toRoom(row);
}

export function listParticipants(db: DatabaseSync, roomId: string): Participant[] {
  const rows = asRow<ParticipantRow[]>(
    db
      .prepare("SELECT * FROM participants WHERE room_id = ? ORDER BY created_at ASC")
      .all(roomId),
  );
  return rows.map(toParticipant);
}

export type StartRoomResult = "started" | "already-started" | "too-few-members";

// Idempotent: a repeated start is a no-op (never un-starts or resets), and
// requires no particular participant — any member may start once ≥2 exist.
export function startRoom(db: DatabaseSync, roomId: string): StartRoomResult {
  const info = db
    .prepare(
      `UPDATE rooms SET phase = 'planning', revision = revision + 1
       WHERE id = ? AND phase = 'collecting'
         AND (SELECT COUNT(*) FROM participants WHERE room_id = ?) >= ${MIN_TO_START}`,
    )
    .run(roomId, roomId);
  if (info.changes === 1) return "started";

  const room = asRow<RoomRow>(db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId));
  return room.phase === "planning" ? "already-started" : "too-few-members";
}

// Membership is credential-hash + room-id together: a credential issued for
// room A matches no row when checked against room B, so it authorises
// nothing there (spoofing participantId alone is insufficient — this never
// trusts a client-supplied id).
export function authenticateParticipant(
  db: DatabaseSync,
  roomId: string,
  credential: string | undefined,
): Participant | undefined {
  if (!credential) return undefined;
  const row = asRow<ParticipantRow | undefined>(
    db
      .prepare("SELECT * FROM participants WHERE room_id = ? AND credential_hash = ?")
      .get(roomId, hashCredential(credential)),
  );
  return row && toParticipant(row);
}

export type SubmitProposalResult =
  | { outcome: "created" | "replayed"; proposal: Proposal }
  | { outcome: "conflict" };

export function submitProposal(
  db: DatabaseSync,
  input: { roomId: string; participantId: string; authorNickname: string; category: Category; title: string; requestKey: string },
): SubmitProposalResult {
  const id = newId();
  // Wraps the insert and the revision bump so a crash between them can't
  // commit one without the other. A UNIQUE violation (retried/conflicting
  // request key) rolls back the whole attempt — nothing was written, so the
  // replay/conflict read below runs afterwards as a plain autocommit read.
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO proposals (id, room_id, participant_id, category, title, request_key) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.roomId, input.participantId, input.category, input.title, input.requestKey);
    bumpRevision(db, input.roomId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    if (isUniqueViolationOn(err, "proposals.room_id, proposals.participant_id, proposals.request_key")) {
      const existing = asRow<{
        id: string;
        room_id: string;
        participant_id: string;
        category: Category;
        title: string;
        created_at: string;
      }>(
        db
          .prepare(
            "SELECT * FROM proposals WHERE room_id = ? AND participant_id = ? AND request_key = ?",
          )
          .get(input.roomId, input.participantId, input.requestKey),
      );
      if (existing.category === input.category && existing.title === input.title) {
        return {
          outcome: "replayed",
          proposal: {
            id: existing.id,
            roomId: existing.room_id,
            participantId: existing.participant_id,
            authorNickname: input.authorNickname,
            category: existing.category,
            title: existing.title,
            createdAt: existing.created_at,
          },
        };
      }
      return { outcome: "conflict" };
    }
    throw err;
  }

  const row = asRow<{
    id: string;
    room_id: string;
    participant_id: string;
    category: Category;
    title: string;
    created_at: string;
  }>(db.prepare("SELECT * FROM proposals WHERE id = ?").get(id));
  return {
    outcome: "created",
    proposal: {
      id: row.id,
      roomId: row.room_id,
      participantId: row.participant_id,
      authorNickname: input.authorNickname,
      category: row.category,
      title: row.title,
      createdAt: row.created_at,
    },
  };
}

export function listProposals(db: DatabaseSync, roomId: string): Proposal[] {
  const rows = asRow<
    {
      id: string;
      room_id: string;
      participant_id: string;
      category: Category;
      title: string;
      created_at: string;
      author_nickname: string;
    }[]
  >(
    db
      .prepare(
        `SELECT proposals.*, participants.nickname AS author_nickname
       FROM proposals JOIN participants ON participants.id = proposals.participant_id
       WHERE proposals.room_id = ?
       ORDER BY proposals.created_at ASC`,
      )
      .all(roomId),
  );
  return rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    authorNickname: row.author_nickname,
    category: row.category,
    title: row.title,
    createdAt: row.created_at,
  }));
}

// The authoritative, versioned view the live stream (src/live.ts) sends on
// every connect/reconnect/notify: membership, proposals and phase, nothing
// else — no credential hash, no vote mapping (not built yet anyway).
export interface RoomSnapshot {
  revision: number;
  phase: string;
  participants: { id: string; nickname: string; role: Category | null }[];
  proposals: { id: string; category: Category; title: string; authorNickname: string; createdAt: string }[];
}

export function buildRoomSnapshot(db: DatabaseSync, room: Room): RoomSnapshot {
  return {
    revision: room.revision,
    phase: room.phase,
    participants: listParticipants(db, room.id).map((p) => ({ id: p.id, nickname: p.nickname, role: p.role })),
    proposals: listProposals(db, room.id).map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      authorNickname: p.authorNickname,
      createdAt: p.createdAt,
    })),
  };
}
