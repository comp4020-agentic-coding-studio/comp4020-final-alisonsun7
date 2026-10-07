import { expect, inject, it } from "vitest";
import { Session } from "./session.ts";

const baseUrl = inject("baseUrl");
const unique = () => Math.random().toString(36).slice(2);

it("a joined member's new idea reaches another session's stream without asking again, and the reverse direction also works (LIVE01)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Live Room ${unique()}`, "Ava");
  const b = new Session(baseUrl);
  await b.joinRoom(code, "Ben");

  // One stream stands in for "a browser rendering without reload" at the
  // HTTP level; e2e/live.spec.ts checks the actual rendered DOM in two real
  // browser contexts.
  const stream = await a.events(code);
  try {
    await stream.waitFor(() => true); // initial snapshot (create + join)

    await a.submitIdea(code, { category: "WHERE", title: "From Ava", requestKey: unique() });
    const afterA = (await stream.waitFor(
      (data) => (data as { proposals: { title: string }[] }).proposals.some((p) => p.title === "From Ava"),
    )) as { proposals: { title: string }[] };
    expect(afterA.proposals.map((p) => p.title)).toContain("From Ava");

    await b.submitIdea(code, { category: "EAT", title: "From Ben", requestKey: unique() });
    const afterB = (await stream.waitFor(
      (data) => (data as { proposals: { title: string }[] }).proposals.some((p) => p.title === "From Ben"),
    )) as { proposals: { title: string }[] };
    const titles = afterB.proposals.map((p) => p.title);
    expect(titles).toContain("From Ava");
    expect(titles).toContain("From Ben");
  } finally {
    stream.cancel();
  }
});

it("a committed mutation reaches an already-open stream in well under a second on a local connection (LIVE02)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Timing Room ${unique()}`, "Ava");
  const stream = await a.events(code);
  try {
    await stream.waitFor(() => true); // initial snapshot

    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const title = `Timed idea ${i} ${unique()}`;
      const start = performance.now();
      await a.submitIdea(code, { category: "DO", title, requestKey: unique() });
      await stream.waitFor((data) => (data as { proposals: { title: string }[] }).proposals.some((p) => p.title === title));
      samples.push(performance.now() - start);
    }
    // Reported distribution, not one silently-averaged number: a local,
    // warmed, in-process connection is expected in low tens of ms, nowhere
    // near the ~1s course bound this guards against regressing past.
    console.log(`LIVE02 commit-to-stream-receipt samples (ms): ${samples.map((s) => s.toFixed(1)).join(", ")}`);
    for (const sample of samples) expect(sample).toBeLessThan(1000);
  } finally {
    stream.cancel();
  }
});

it("a disconnected participant reconnecting sees state committed while they were away, without asking again (LIVE03)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Reconnect Room ${unique()}`, "Ava");
  const b = new Session(baseUrl);
  await b.joinRoom(code, "Ben");

  const firstConnection = await a.events(code);
  await firstConnection.waitFor(() => true); // the initial snapshot
  firstConnection.cancel(); // simulate A going offline

  await b.submitIdea(code, { category: "WHERE", title: "Added while A was away", requestKey: unique() });

  const reconnected = await a.events(code);
  try {
    const snapshot = (await reconnected.waitFor(() => true)) as { proposals: { title: string }[] };
    expect(snapshot.proposals.map((p) => p.title)).toContain("Added while A was away");
  } finally {
    reconnected.cancel();
  }
});

it("connecting after several mutations already happened catches up directly to the current state, not a replay from zero (LIVE04)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Catchup Room ${unique()}`, "Ava");
  await a.submitIdea(code, { category: "WHERE", title: "One", requestKey: unique() });
  await a.submitIdea(code, { category: "EAT", title: "Two", requestKey: unique() });
  const third = await a.submitIdea(code, { category: "DO", title: "Three", requestKey: unique() });
  expect(third.status).toBe(201);

  const stream = await a.events(code);
  try {
    const snapshot = (await stream.waitFor(() => true)) as { revision: number; proposals: { title: string }[] };
    expect(snapshot.revision).toBeGreaterThanOrEqual(4); // create + 3 proposals
    expect(snapshot.proposals.map((p) => p.title)).toEqual(["One", "Two", "Three"]);
  } finally {
    stream.cancel();
  }
});

it("revisions received on one stream never go backwards, even across a burst of concurrent mutations (LIVE04)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Monotonic Room ${unique()}`, "Ava");
  const stream = await a.events(code);
  try {
    await stream.waitFor(() => true); // initial snapshot

    await Promise.all([
      a.submitIdea(code, { category: "WHERE", title: "Concurrent A", requestKey: unique() }),
      a.submitIdea(code, { category: "EAT", title: "Concurrent B", requestKey: unique() }),
      a.submitIdea(code, { category: "DO", title: "Concurrent C", requestKey: unique() }),
    ]);

    const wanted = ["Concurrent A", "Concurrent B", "Concurrent C"];
    let lastRevision = -1;
    const final = (await stream.waitFor((data) => {
      const snap = data as { revision: number; proposals: { title: string }[] };
      expect(snap.revision).toBeGreaterThan(lastRevision);
      lastRevision = snap.revision;
      const titles = snap.proposals.map((p) => p.title);
      return wanted.every((t) => titles.includes(t));
    })) as { proposals: { title: string }[] };

    const titles = final.proposals.map((p) => p.title);
    for (const t of wanted) expect(titles).toContain(t);
  } finally {
    stream.cancel();
  }
});

it("the live stream never carries a credential/hash, and read access follows the room page's existing open-by-code policy (LIVE06)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Privacy Room ${unique()}`, "Ava");
  await a.submitIdea(code, { category: "WHERE", title: "Visible idea", requestKey: unique() });

  // Deliberately no cookies: matches the room page's existing anonymous-read
  // policy (DD05 in spec/proposal.test.ts) — the stream grants no read
  // capability beyond what the page already shows a visitor.
  const res = await fetch(new URL(`/rooms/${code}/events`, baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!buffer.includes('"revision"')) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  reader.cancel();

  expect(buffer).toContain("Visible idea");
  expect(buffer.toLowerCase()).not.toContain("credential");
});

it("an unknown room code's stream answers 404, not an open connection to nothing", async () => {
  const res = await fetch(new URL("/rooms/ZZZZZZ/events", baseUrl));
  expect(res.status).toBe(404);
});
