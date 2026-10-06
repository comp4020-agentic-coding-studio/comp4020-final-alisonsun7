import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb } from "../src/db.ts";
import { authenticateParticipant, createRoom, findRoomByCode, listProposals, submitProposal } from "../src/rooms.ts";

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

it("creates a room with a unique code and the creator as its first participant", () => {
  const db = openDb(dbPath);
  const { room, participant, credential } = createRoom(db, { title: "Saturday Out", nickname: "Wen" });

  expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
  expect(participant.nickname).toBe("Wen");
  expect(credential.length).toBeGreaterThan(20);
  expect(findRoomByCode(db, room.code)?.id).toBe(room.id);
});

it("authenticates a participant only for their own room, never by id alone (DD10)", () => {
  const db = openDb(dbPath);
  const a = createRoom(db, { title: "Room A", nickname: "Wen" });
  const b = createRoom(db, { title: "Room B", nickname: "Alex" });

  expect(authenticateParticipant(db, a.room.id, a.credential)?.id).toBe(a.participant.id);
  expect(authenticateParticipant(db, b.room.id, a.credential)).toBeUndefined();
  expect(authenticateParticipant(db, a.room.id, undefined)).toBeUndefined();
  expect(authenticateParticipant(db, a.room.id, "not-a-real-credential")).toBeUndefined();
});

it("an idempotency-key retry replays the same row; a reused key with a different payload conflicts (DD08/DD09)", () => {
  const db = openDb(dbPath);
  const { room, participant } = createRoom(db, { title: "Room", nickname: "Wen" });

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

it("two participants' proposals in the same room are both listed, ordered by creation", () => {
  const db = openDb(dbPath);
  const { room, participant: wen } = createRoom(db, { title: "Room", nickname: "Wen" });
  // No join endpoint yet (next slice); insert Alex directly to exercise
  // listProposals with more than one author.
  const alexId = "alex-participant";
  db.prepare(
    "INSERT INTO participants (id, room_id, nickname, credential_hash) VALUES (?, ?, ?, ?)",
  ).run(alexId, room.id, "Alex", "irrelevant-hash-for-this-test");

  submitProposal(db, {
    roomId: room.id,
    participantId: wen.id,
    authorNickname: wen.nickname,
    category: "WHERE",
    title: "Beach",
    requestKey: "k1",
  });
  submitProposal(db, {
    roomId: room.id,
    participantId: alexId,
    authorNickname: "Alex",
    category: "EAT",
    title: "Korean BBQ",
    requestKey: "k2",
  });

  const proposals = listProposals(db, room.id);
  expect(proposals.map((p) => p.authorNickname)).toEqual(["Wen", "Alex"]);
});

it("reopening the database file preserves rooms/participants/proposals, and migrating twice doesn't reset anything (DD04/DD13)", () => {
  const db1 = openDb(dbPath);
  const { room, participant } = createRoom(db1, { title: "Durable Room", nickname: "Wen" });
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

  // A third open (another "restart") must still not reset anything.
  const db3 = openDb(dbPath);
  expect(listProposals(db3, room.id)).toHaveLength(1);
});
