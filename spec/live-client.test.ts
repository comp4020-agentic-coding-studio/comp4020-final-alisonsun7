import { expect, it } from "vitest";
import { isNewer } from "../src/client/live.ts";

// This is the exact guard src/client/live.ts applies to every incoming SSE
// snapshot (LIVE04): a response/notification at or behind the already-
// rendered revision must never roll the UI back, whatever order it arrives
// in (a slow stale request racing a fresh reconnect, a duplicate coalesced
// push, etc).
it("a strictly newer revision is applied", () => {
  expect(isNewer(5, 6)).toBe(true);
});

it("the same revision arriving again (a harmless duplicate push) is not reapplied", () => {
  expect(isNewer(5, 5)).toBe(false);
});

it("an older/stale revision is rejected, never rolling the UI back", () => {
  expect(isNewer(5, 3)).toBe(false);
});

it("the initial sentinel accepts the very first snapshot regardless of its revision", () => {
  expect(isNewer(-1, 0)).toBe(true);
});
