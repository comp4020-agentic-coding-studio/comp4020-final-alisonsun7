import type { DatabaseSync } from "node:sqlite";
import { hashCredential, newCredential, newId, newRoomCode } from "./ids.js";
import type { Category } from "./validation.js";

export interface Room {
  id: string;
  code: string;
  title: string;
  phase: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  nickname: string;
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
  created_at: string;
}

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  code: row.code,
  title: row.title,
  phase: row.phase,
  createdAt: row.created_at,
});

export function createRoom(
  db: DatabaseSync,
  input: { title: string; nickname: string },
): { room: Room; participant: Participant; credential: string } {
  const roomId = newId();
  const participantId = newId();
  const credential = newCredential();
  const credentialHash = hashCredential(credential);

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newRoomCode();
    try {
      db.exec("BEGIN");
      db.prepare("INSERT INTO rooms (id, code, title) VALUES (?, ?, ?)").run(roomId, code, input.title);
      db.prepare(
        "INSERT INTO participants (id, room_id, nickname, credential_hash) VALUES (?, ?, ?, ?)",
      ).run(participantId, roomId, input.nickname, credentialHash);
      db.exec("COMMIT");

      const room = asRow<RoomRow>(db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId));
      return {
        room: toRoom(room),
        participant: { id: participantId, roomId, nickname: input.nickname, createdAt: room.created_at },
        credential,
      };
    } catch (err) {
      db.exec("ROLLBACK");
      if (isUniqueViolationOn(err, "rooms.code")) continue; // code collision: retry with a fresh code
      throw err;
    }
  }
  throw new Error("could not allocate a unique room code");
}

export function findRoomByCode(db: DatabaseSync, code: string): Room | undefined {
  const row = asRow<RoomRow | undefined>(db.prepare("SELECT * FROM rooms WHERE code = ?").get(code));
  return row && toRoom(row);
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
  const row = asRow<{ id: string; room_id: string; nickname: string; created_at: string } | undefined>(
    db
      .prepare("SELECT * FROM participants WHERE room_id = ? AND credential_hash = ?")
      .get(roomId, hashCredential(credential)),
  );
  if (!row) return undefined;
  return { id: row.id, roomId: row.room_id, nickname: row.nickname, createdAt: row.created_at };
}

export type SubmitProposalResult =
  | { outcome: "created" | "replayed"; proposal: Proposal }
  | { outcome: "conflict" };

export function submitProposal(
  db: DatabaseSync,
  input: { roomId: string; participantId: string; authorNickname: string; category: Category; title: string; requestKey: string },
): SubmitProposalResult {
  const id = newId();
  try {
    db.prepare(
      "INSERT INTO proposals (id, room_id, participant_id, category, title, request_key) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.roomId, input.participantId, input.category, input.title, input.requestKey);
  } catch (err) {
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
