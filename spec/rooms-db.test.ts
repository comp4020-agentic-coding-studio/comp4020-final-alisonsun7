import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb } from "../src/db.ts";
import {
  authenticateParticipant,
  createRoom,
  findRoomByCode,
  joinRoom,
  listParticipants,
  listProposals,
  startRoom,
  submitProposal,
  MAX_PARTICIPANTS,
  type Participant,
  type Room,
} from "../src/rooms.ts";
import type { DatabaseSync } from "node:sqlite";

// Real SQLite in an isolated temp file per test, per docs/acceptance.md's
// "minimal test tiers" — not an in-memory mock standing in for persistence.
let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "daydraw-test-"));
  dbPath = join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mustCreate(db: DatabaseSync, input: { title: string; nickname: string }): {
  room: Room;
  participant: Participant;
  credential: string;
} {
  const result = createRoom(db, input);
  if (result.outcome !== "created") throw new Error("expected room creation to succeed");
  return result;
}

function mustJoin(db: DatabaseSync, roomId: string, nickname: string): { participant: Participant; credential: string } {
  const result = joinRoom(db, roomId, nickname);
  if (result.outcome !== "added") throw new Error("expected join to succeed");
  return result;
}

it("creates a room with a unique code and the creator as its first participant", () => {
  const db = openDb(dbPath);
  const { room, participant, credential } = mustCreate(db, { title: "Saturday Out", nickname: "Wen" });

  expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
  expect(participant.nickname).toBe("Wen");
  expect(credential.length).toBeGreaterThan(20);
  expect(findRoomByCode(db, room.code)?.id).toBe(room.id);
});

it("authenticates a participant only for their own room, never by id alone (DD10)", () => {
  const db = openDb(dbPath);
  const a = mustCreate(db, { title: "Room A", nickname: "Wen" });
  const b = mustCreate(db, { title: "Room B", nickname: "Alex" });

  expect(authenticateParticipant(db, a.room.id, a.credential)?.id).toBe(a.participant.id);
  expect(authenticateParticipant(db, b.room.id, a.credential)).toBeUndefined();
  expect(authenticateParticipant(db, a.room.id, undefined)).toBeUndefined();
  expect(authenticateParticipant(db, a.room.id, "not-a-real-credential")).toBeUndefined();
});

it("joining fills the room up to the 12-member cap, and a 13th is rejected (DD07)", () => {
  const db = openDb(dbPath);
  const { room } = mustCreate(db, { title: "Full Room", nickname: "P1" }); // 1 member already

  for (let i = 2; i <= MAX_PARTICIPANTS; i++) {
    const result = joinRoom(db, room.id, `P${i}`);
    expect(result.outcome).toBe("added");
  }
  expect(listParticipants(db, room.id)).toHaveLength(MAX_PARTICIPANTS);

  const thirteenth = joinRoom(db, room.id, "P13");
  expect(thirteenth.outcome).toBe("full");
  expect(listParticipants(db, room.id)).toHaveLength(MAX_PARTICIPANTS); // unchanged
});

it("two simultaneous joins for the final seat accept at most one (DD07)", () => {
  const db = openDb(dbPath);
  const { room } = mustCreate(db, { title: "Almost Full", nickname: "P1" });
  for (let i = 2; i <= MAX_PARTICIPANTS - 1; i++) mustJoin(db, room.id, `P${i}`); // now 11 members, 1 seat left

  // node:sqlite is synchronous, so this models two requests racing for the
  // same instant as closely as a single process can: both calls run to
  // completion back-to-back with nothing able to interleave between them.
  const results = [joinRoom(db, room.id, "Racer A"), joinRoom(db, room.id, "Racer B")];
  const added = results.filter((r) => r.outcome === "added");
  const full = results.filter((r) => r.outcome === "full");
  expect(added).toHaveLength(1);
  expect(full).toHaveLength(1);
  expect(listParticipants(db, room.id)).toHaveLength(MAX_PARTICIPANTS);
});

for (const size of [2, 3, 4, 5, 6, 9, 12]) {
  it(`balances roles for ${size} members: largest-minus-smallest category count is at most 1 (DD06)`, () => {
    const db = openDb(dbPath);
    const { room } = mustCreate(db, { title: `Room of ${size}`, nickname: "P1" });
    for (let i = 2; i <= size; i++) mustJoin(db, room.id, `P${i}`);

    const participants = listParticipants(db, room.id);
    expect(participants).toHaveLength(size);
    const counts = { WHERE: 0, EAT: 0, DO: 0 };
    for (const p of participants) {
      expect(p.role).not.toBeNull();
      counts[p.role!]++;
    }
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
}

it("a role, once assigned, never changes on repeated reads (stable repeated draw)", () => {
  const db = openDb(dbPath);
  const { room, participant } = mustCreate(db, { title: "Room", nickname: "Wen" });
  mustJoin(db, room.id, "Alex");

  const before = listParticipants(db, room.id).find((p) => p.id === participant.id)?.role;
  // "Repeated draw" here is just repeated reads: nothing in this app ever
  // re-rolls or updates participants.role after insert.
  for (let i = 0; i < 5; i++) {
    const again = listParticipants(db, room.id).find((p) => p.id === participant.id)?.role;
    expect(again).toBe(before);
  }
});

it("a single member cannot start, two members can, and starting twice doesn't reset anything (DD14)", () => {
  const db = openDb(dbPath);
  const { room } = mustCreate(db, { title: "Room", nickname: "Wen" });

  expect(startRoom(db, room.id)).toBe("too-few-members");
  expect(findRoomByCode(db, room.code)?.phase).toBe("collecting");

  mustJoin(db, room.id, "Alex");
  expect(startRoom(db, room.id)).toBe("started");
  expect(findRoomByCode(db, room.code)?.phase).toBe("planning");

  // Idempotent: starting again doesn't un-start, reset, or error.
  expect(startRoom(db, room.id)).toBe("already-started");
  expect(findRoomByCode(db, room.code)?.phase).toBe("planning");
});

it("an idempotency-key retry replays the same row; a reused key with a different payload conflicts (DD08/DD09)", () => {
  const db = openDb(dbPath);
  const { room, participant } = mustCreate(db, { title: "Room", nickname: "Wen" });

  const first = submitProposal(db, {
    roomId: room.id,
    participantId: participant.id,
    authorNickname: participant.nickname,
    category: "WHERE",
    title: "National Zoo",
    requestKey: "k1",
  });
  expect(first.outcome).toBe("created");

  const replay = submitProposal(db, {
    roomId: room.id,
    participantId: participant.id,
    authorNickname: participant.nickname,
    category: "WHERE",
    title: "National Zoo",
    requestKey: "k1",
  });
  expect(replay.outcome).toBe("replayed");
  expect(replay.outcome === "replayed" && replay.proposal.id).toBe(first.outcome === "created" && first.proposal.id);

  const conflict = submitProposal(db, {
    roomId: room.id,
    participantId: participant.id,
    authorNickname: participant.nickname,
    category: "EAT",
    title: "Something else",
    requestKey: "k1",
  });
  expect(conflict.outcome).toBe("conflict");

  const distinct = submitProposal(db, {
    roomId: room.id,
    participantId: participant.id,
    authorNickname: participant.nickname,
    category: "DO",
    title: "Bowling",
    requestKey: "k2",
  });
  expect(distinct.outcome).toBe("created");

  expect(listProposals(db, room.id)).toHaveLength(2);
});

it("two joined participants' proposals in the same room are both listed, ordered by creation (DD05 — any category, any member)", () => {
  const db = openDb(dbPath);
  const { room, participant: wen } = mustCreate(db, { title: "Room", nickname: "Wen" });
  const { participant: alex } = mustJoin(db, room.id, "Alex");

  submitProposal(db, {
    roomId: room.id,
    participantId: wen.id,
    authorNickname: wen.nickname,
    category: "WHERE",
    title: "Beach",
    requestKey: "k1",
  });
  // Alex contributes to WHERE too, regardless of Alex's own assigned role —
  // roles guide, they don't restrict (DD05).
  submitProposal(db, {
    roomId: room.id,
    participantId: alex.id,
    authorNickname: alex.nickname,
    category: "WHERE",
    title: "Korean BBQ",
    requestKey: "k2",
  });

  const proposals = listProposals(db, room.id);
  expect(proposals.map((p) => p.authorNickname)).toEqual(["Wen", "Alex"]);
  expect(proposals.every((p) => p.category === "WHERE")).toBe(true);
});

it("reopening the database file preserves rooms/participants/proposals, and migrating twice doesn't reset anything (DD04/DD13)", () => {
  const db1 = openDb(dbPath);
  const { room, participant } = mustCreate(db1, { title: "Durable Room", nickname: "Wen" });
  mustJoin(db1, room.id, "Alex");
  submitProposal(db1, {
    roomId: room.id,
    participantId: participant.id,
    authorNickname: participant.nickname,
    category: "WHERE",
    title: "National Zoo",
    requestKey: "k1",
  });

  // Simulate a process restart: close by dropping the reference and reopen
  // the same file path, re-running migrations against existing tables.
  const db2 = openDb(dbPath);
  expect(findRoomByCode(db2, room.code)?.title).toBe("Durable Room");
  expect(listProposals(db2, room.id)).toHaveLength(1);
  expect(listParticipants(db2, room.id)).toHaveLength(2);
  expect(listParticipants(db2, room.id).every((p) => p.role !== null)).toBe(true);

  // A third open (another "restart") must still not reset anything.
  const db3 = openDb(dbPath);
  expect(listProposals(db3, room.id)).toHaveLength(1);
  expect(listParticipants(db3, room.id)).toHaveLength(2);
});

it("a pre-existing participant with no role (older schema) is balanced-backfilled by the migration, not left null forever", () => {
  // Build a DB that looks like it came from before the role column existed:
  // create tables the way 001_initial did, with no role column, and insert
  // rows directly — then open it with the real openDb (today's migrations)
  // and confirm the backfill assigns real, balanced roles.
  const db = openDb(dbPath); // applies 001 + 002 fresh — role column already exists here

  // Simulate "existing rows predating the column" by nulling it out directly,
  // the way a real upgrade would find them (migration 002 already ran once
  // for this fresh file, so we drop back into the pre-migration shape for a
  // second, independent DB file instead).
  const legacyDir = mkdtempSync(join(tmpdir(), "daydraw-legacy-"));
  const legacyPath = join(legacyDir, "legacy.db");
  try {
    const legacy = openDb(legacyPath); // creates with role column via today's code...
    // ...so directly null out role and pretend migration 002 never ran, by
    // deleting its row from _migrations and re-invoking openDb on the same
    // path to force the backfill path to execute again.
    const { room } = mustCreate(legacy, { title: "Legacy Room", nickname: "Wen" });
    mustJoin(legacy, room.id, "Alex");
    legacy.exec("UPDATE participants SET role = NULL");
    legacy.exec("DELETE FROM _migrations WHERE name = '002_roles'");

    const reopened = openDb(legacyPath);
    const participants = listParticipants(reopened, room.id);
    expect(participants).toHaveLength(2);
    expect(participants.every((p) => p.role !== null)).toBe(true);
    const roles = new Set(participants.map((p) => p.role));
    expect(roles.size).toBe(2); // 2 members, balanced across 2 distinct categories
  } finally {
    rmSync(legacyDir, { recursive: true, force: true });
  }
  void db;
});
