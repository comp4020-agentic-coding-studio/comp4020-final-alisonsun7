import { afterEach, expect, inject, it } from "vitest";
import { Session, type GardenEvents } from "./session.js";

// Crit 9: "a change one person makes reaches everyone else within about a
// second, without a reload." Two Sessions are two separate people; each test
// passes only if the other person's open stream sees the change in budget.
const baseUrl = inject("baseUrl");
const BUDGET_MS = 1000;
const open: GardenEvents[] = [];
afterEach(() => open.splice(0).forEach((e) => e.cancel()));

async function watch(s: Session): Promise<GardenEvents> {
  const ev = await s.events();
  open.push(ev);
  await ev.next(); // the snapshot sent on connect
  return ev;
}

it("a note one person places reaches another person within a second", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  const bob = await Session.join(baseUrl, "Bob");
  const bobSees = await watch(bob);

  expect((await alice.setNote(1, 2, "C4")).status).toBe(204);
  const seen = await bobSees.waitFor((s) => s.grid[1][2] === "C4", BUDGET_MS);
  expect(seen.activity.some((a) => a.nickname === "Alice" && a.text.startsWith("placed C at row 2, step 3"))).toBe(true);
});

it("a note one person erases disappears for another person within a second", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  const bob = await Session.join(baseUrl, "Bob");
  await alice.setNote(4, 4, "A4");
  const aliceSees = await watch(alice);

  expect((await bob.setNote(4, 4, null)).status).toBe(204);
  await aliceSees.waitFor((s) => s.grid[4][4] === null, BUDGET_MS);
});

it("an instrument switch reaches another person within a second", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  const bob = await Session.join(baseUrl, "Bob");
  await alice.setInstrument("piano");
  const aliceSees = await watch(alice);

  expect((await bob.setInstrument("guitar")).status).toBe(204);
  await aliceSees.waitFor((s) => s.instrument === "guitar", BUDGET_MS);
});

it("simultaneous writes to one square converge: everyone ends on the last-applied value", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  const bob = await Session.join(baseUrl, "Bob");
  const aliceSees = await watch(alice);
  const bobSees = await watch(bob);

  await Promise.all([alice.setNote(5, 0, "D4"), bob.setNote(5, 0, "G4")]);

  const final = await (await Session.join(baseUrl, "Carol")).events();
  open.push(final);
  const truth = (await final.next())!;
  expect(["D4", "G4"]).toContain(truth.grid[5][0]);
  await aliceSees.waitFor((s) => s.version >= truth.version && s.grid[5][0] === truth.grid[5][0], BUDGET_MS);
  await bobSees.waitFor((s) => s.version >= truth.version && s.grid[5][0] === truth.grid[5][0], BUDGET_MS);
});

it("presence counts people who have the page open", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  const aliceSees = await alice.events();
  open.push(aliceSees);
  const before = (await aliceSees.next())!.online;

  const bob = await Session.join(baseUrl, "Bob");
  const bobStream = await bob.events();
  await aliceSees.waitFor((s) => s.online === before + 1, BUDGET_MS);
  bobStream.cancel();
  await aliceSees.waitFor((s) => s.online === before, 3000);
});

it("a reconnecting client gets the full current garden, not just new events", async () => {
  const alice = await Session.join(baseUrl, "Alice");
  await alice.setNote(3, 5, "E4");
  await alice.setInstrument("saxophone");

  const fresh = await alice.events();
  open.push(fresh);
  const snap = (await fresh.next())!;
  expect(snap.grid[3][5]).toBe("E4");
  expect(snap.instrument).toBe("saxophone");
  expect(snap.grid).toHaveLength(6);
  expect(snap.grid.every((row) => row.length === 6)).toBe(true);
});
