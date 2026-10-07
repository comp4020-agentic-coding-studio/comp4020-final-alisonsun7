import { expect, it } from "vitest";
import { _subscriberCountForTests, notifyRoom, subscribe } from "../src/live.ts";

// Unit-tests the in-process hub directly (not over HTTP): the HTTP-level
// behaviour (spec/live.test.ts) proves the wiring works end-to-end, but
// "does unsubscribe actually remove the listener" (LIVE05) and "do bursts
// coalesce" are properties of this module alone, testable without a server.
const unique = () => `room-${Math.random().toString(36).slice(2)}`;

it("subscribing then unsubscribing returns the room to zero listeners (LIVE05)", () => {
  const roomId = unique();
  expect(_subscriberCountForTests(roomId)).toBe(0);

  const unsubscribe = subscribe(roomId, () => {});
  expect(_subscriberCountForTests(roomId)).toBe(1);

  unsubscribe();
  expect(_subscriberCountForTests(roomId)).toBe(0);
});

it("repeated connect/disconnect cycles leave no accumulated listeners (LIVE05)", () => {
  const roomId = unique();
  for (let i = 0; i < 20; i++) {
    const unsubscribe = subscribe(roomId, () => {});
    unsubscribe();
  }
  expect(_subscriberCountForTests(roomId)).toBe(0);
});

it("an unsubscribed listener is never called by a later notify", async () => {
  const roomId = unique();
  let calls = 0;
  const unsubscribe = subscribe(roomId, () => {
    calls++;
  });
  unsubscribe();

  notifyRoom(roomId);
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(calls).toBe(0);
});

it("several notifies within the coalescing window flush exactly once, after the last one", async () => {
  const roomId = unique();
  let calls = 0;
  const unsubscribe = subscribe(roomId, () => {
    calls++;
  });

  notifyRoom(roomId);
  notifyRoom(roomId);
  notifyRoom(roomId);
  notifyRoom(roomId);
  notifyRoom(roomId);

  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(calls).toBe(1);
  unsubscribe();
});

it("notifying a room with no subscribers is a safe no-op", () => {
  expect(() => notifyRoom(unique())).not.toThrow();
});

it("a notify for one room never calls a different room's listener", async () => {
  const roomA = unique();
  const roomB = unique();
  let callsA = 0;
  let callsB = 0;
  const unsubA = subscribe(roomA, () => {
    callsA++;
  });
  const unsubB = subscribe(roomB, () => {
    callsB++;
  });

  notifyRoom(roomA);
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(callsA).toBe(1);
  expect(callsB).toBe(0);
  unsubA();
  unsubB();
});
