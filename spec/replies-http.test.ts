import { expect, inject, it } from "vitest";
import type { PlacedSound, SoundPlacementResult, SoundReplies } from "../src/shared/protocol.ts";
import { Stream, join, type Person } from "./helpers.ts";

const base = inject("baseUrl");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("accepts concurrent branches and duplicate delivery once, then gives late arrivals removed-source metadata", async () => {
  const people = await Promise.all(["Reply Ada", "Reply Bo", "Reply Cy"].map((name) => join(base, name)));
  const watcher = await Stream.open(base, "seaside", "weekday", null);
  const sessionId = watcher.snapshot().sessionId;
  const made: { who: Person; sound: PlacedSound }[] = [];
  const api = async (who: Person, path: string, method: string, body?: unknown) => fetch(new URL(`/api/sessions/${sessionId}/${path}`, base), {
    method, headers: { cookie: who.cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const stand = async (who: Person, x: number, z: number) => {
    expect((await api(who, "move", "POST", { x, z, yaw: 0 })).status).toBe(200);
    await wait(100);
  };
  const place = async (who: Person, body: unknown) => {
    const response = await api(who, "sounds", "POST", body);
    return { status: response.status, ...await response.json() as SoundPlacementResult };
  };
  try {
    for (const [i, who] of people.entries()) await stand(who, 1600 + i * 20, 1600);
    const parent = await place(people[0], { soundId: "evening-forest", operationId: "http-parent-operation" });
    expect(parent.status).toBe(201);
    made.push({ who: people[0], sound: parent.sound! });
    const target = parent.sound!.id;
    const request = { soundId: "trickle", replyToId: target, operationId: "http-branch-operation" };
    // One user delivers the same command twice while another answers too.
    const [b1, b2, c] = await Promise.all([place(people[1], request), place(people[1], request), place(people[2], request)]);
    for (const result of [b1, b2, c]) if (result.ok && !made.some((entry) => entry.sound.id === result.sound!.id)) made.push({ who: result.sound!.by === people[1].name ? people[1] : people[2], sound: result.sound! });
    expect([b1.status, b2.status].sort()).toEqual([200, 201]);
    expect([b1.replayed, b2.replayed].filter(Boolean)).toHaveLength(1);
    expect(b1.sound!.id).toBe(b2.sound!.id);
    expect(c).toMatchObject({ status: 201, ok: true, sound: { replyToId: target, replyTo: { by: people[0].name, id: target } } });
    expect(c.sound!.id).not.toBe(b1.sound!.id);
    await watcher.next((message) => message.type === "sound-left" && message.sound.id === c.sound!.id);
    await watcher.next((message) => message.type === "sound-left" && message.sound.id === b1.sound!.id);
    expect(watcher.messages.filter(({ msg }) => msg.type === "sound-left" && msg.sound.id === b1.sound!.id)).toHaveLength(1);
    const relatedResponse = await fetch(new URL(`/api/sessions/${sessionId}/sounds/${target}/replies`, base));
    expect(relatedResponse.status).toBe(200);
    const related = await relatedResponse.json() as SoundReplies;
    expect(related.replies.map((sound) => sound.id).sort()).toEqual([b1.sound!.id, c.sound!.id].sort());
    expect(related.nextCursor).toBeNull();
    expect(await place(people[1], { ...request, soundId: "espresso" })).toMatchObject({ status: 409, code: "operation_conflict" });
    await wait(1100);
    expect((await api(people[0], `sounds/${target}`, "DELETE")).status).toBe(200);
    const removed = await watcher.next((message) => message.type === "sound-removed" && message.id === target);
    expect(removed).toMatchObject({ removedAt: expect.any(String) });
    const late = await Stream.open(base, "seaside", "weekday", null);
    try {
      expect(late.snapshot().sounds.find((sound) => sound.id === b1.sound!.id)?.replyTo).toMatchObject({ id: target, removedAt: expect.any(String) });
    } finally { late.close(); }
    // A fresh command cannot silently become an ordinary sound; an already
    // committed retry remains the original acknowledgement after removal.
    expect(await place(people[1], { ...request, operationId: "http-source-now-gone" })).toMatchObject({ status: 409, code: "reply_gone" });
    expect(await place(people[1], request)).toMatchObject({ status: 200, replayed: true, sound: { id: b1.sound!.id, replyTo: { removedAt: expect.any(String) } } });
  } finally {
    await wait(1100);
    for (const entry of made) {
      await stand(entry.who, entry.sound.x, entry.sound.z);
      await api(entry.who, `sounds/${entry.sound.id}`, "DELETE");
    }
    watcher.close();
  }
}, 15_000);
