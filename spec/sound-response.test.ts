import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { PlacedSound } from "../src/shared/protocol.ts";
import { chooseResidentResponse, residentPhase, soundResponseFor, RESIDENT_SETTLE_MS } from "../src/shared/sound-response.ts";
import { SoundResidents } from "../src/client/sound-residents.ts";
import type { AnimalFigure } from "../src/client/characters.ts";

const now = Date.parse("2026-11-07T10:00:10Z");
const home = { id: "neighbour", x: 0, z: 0, preference: "cozy" as const };
const source = (id: string, patch: Partial<PlacedSound> = {}): PlacedSound => ({
  id, soundId: "beach-waves", x: 6, z: 0, at: "2026-11-07T10:00:00Z", by: "Ada", byId: "a", ...patch,
});

describe("shared sound-driven NPC choices", () => {
  it("gives nature, rhythm, play, conversation and calls distinct supported reactions", () => {
    expect(soundResponseFor("beach-waves")?.behavior).toBe("listen");
    expect(soundResponseFor("guitar")?.behavior).toBe("sway");
    expect(soundResponseFor("children-playing")?.behavior).toBe("play");
    expect(soundResponseFor("cafe-chatter")?.behavior).toBe("chat");
    expect(soundResponseFor("evening-forest")?.behavior).toBe("watch");
    expect(soundResponseFor("bicycle-bell")?.behavior).toBe("wave");
    expect(soundResponseFor("bicycle-bell")?.mood).toBe("lively");
    expect(soundResponseFor("harbour-boat")?.mood).toBe("lively");
    expect(soundResponseFor("rainstick")?.mood).toBe("cozy");
    expect(soundResponseFor("rainstick")?.mood).toBe("cozy");
    expect(soundResponseFor("hand-claps")?.behavior).toBe("sway");
    expect(soundResponseFor("toilet-flush")).toBeNull();
    expect(soundResponseFor("shower")).toBeNull();
    expect(soundResponseFor("unknown")).toBeNull();
    expect(soundResponseFor("constructor")).toBeNull();
  });

  it("ignores private stays, tombstones, unknown/future/malformed and distant sources", () => {
    const excluded = [
      source("private", { whileIn: "shower-1" }),
      source("removed", { removedAt: "2026-11-07T10:00:01Z" }),
      source("unknown", { soundId: "does-not-exist" }),
      source("future", { at: "2026-11-07T11:00:00Z" }),
      source("bad-time", { at: "invalid" }),
      source("bad-position", { x: Infinity }),
      source("distant", { x: 18.01 }),
    ];
    for (const item of excluded) expect(chooseResidentResponse(home, [item], now), item.id).toBeNull();
    const sound = source("same-id");
    expect(chooseResidentResponse(home, [sound, { ...sound, removedAt: "2026-11-07T10:00:01Z" }], now)).toBeNull();
    expect(chooseResidentResponse(home, [source("edge", { x: 18 })], now)?.sourceId).toBe("edge");
    expect(chooseResidentResponse(home, [source("a")], NaN)).toBeNull();
  });

  it("settles new sources at the shared server boundary and releases an ended source", () => {
    const fresh = source("fresh", { at: new Date(now).toISOString() });
    expect(chooseResidentResponse(home, [fresh], now + RESIDENT_SETTLE_MS - 1)).toBeNull();
    expect(chooseResidentResponse(home, [fresh], now + RESIDENT_SETTLE_MS)?.sourceId).toBe("fresh");
    expect(chooseResidentResponse(home, [{ ...fresh, removedAt: new Date(now + 3000).toISOString() }], now + 4000)).toBeNull();
    expect(chooseResidentResponse(home, [], now + 5000)).toBeNull();
  });

  it("stays stable on reordering and close additions, while nearer ingredients can change the response", () => {
    const older = source("older", { x: 6.3 });
    const newer = source("newer", { x: 6.01, at: "2026-11-07T10:00:01Z" });
    const frozen = Object.freeze([Object.freeze(older), Object.freeze(newer)]);
    expect(chooseResidentResponse(home, frozen, now)?.sourceId).toBe("older");
    expect(chooseResidentResponse(home, [...frozen].reverse(), now)?.sourceId).toBe("older");
    const nearerMusic = source("nearer", { x: 0.5, soundId: "guitar", at: "2026-11-07T10:00:02Z" });
    expect(chooseResidentResponse(home, [...frozen, nearerMusic], now)?.sourceId).toBe("nearer");
    const simultaneous = [source("b"), source("a")];
    expect(chooseResidentResponse(home, simultaneous, now)?.sourceId).toBe("a");
    expect(chooseResidentResponse(home, simultaneous.reverse(), now)?.sourceId).toBe("a");
  });

  it("lets different neighbours find different ingredients without using listener or local audio state", () => {
    const sounds = [source("nature"), source("rhythm", { soundId: "guitar" })];
    const calm = chooseResidentResponse(home, sounds, now);
    const lively = chooseResidentResponse({ ...home, id: "beach", preference: "lively" }, sounds, now);
    expect(calm?.profile.behavior).toBe("listen");
    expect(lively?.profile.behavior).toBe("sway");
    expect(chooseResidentResponse(home, JSON.parse(JSON.stringify(sounds)), now)).toEqual(calm);
    expect(residentPhase("beach", now)).toBe(residentPhase("beach", now));
    expect(residentPhase("beach", now + 1600)).not.toBeCloseTo(residentPhase("beach", now));
    expect(residentPhase("coast", now)).not.toBe(residentPhase("beach", now));
  });
});

// A small bone rig tests controller safety without loading browser art/assets.
function figure(): AnimalFigure {
  const sprite = new THREE.Group();
  const names = ["hip-rig", "upper-body-rig", "head-rig", "right-shoulder", "right-elbow", "right-knee"];
  for (const name of names) { const bone = new THREE.Bone(); bone.name = name; sprite.add(bone); }
  const cast = sprite as unknown as AnimalFigure;
  cast.setFacing = (yaw) => { sprite.rotation.y = yaw; };
  cast.setPose = vi.fn();
  cast.setMotion = () => { sprite.children.forEach((bone) => bone.rotation.set(0, 0, 0)); };
  cast.dispose = vi.fn(() => sprite.removeFromParent());
  return cast;
}

const definition = { ...home, label: "Neighbour · NPC", facing: 0 };

describe("sound resident movement and gestures", () => {
  it("uses shared-time positions and bone poses across different load times and frame rates", () => {
    const first = new SoundResidents({ surfaceHeight: () => 0.4, canStand: () => true });
    const second = new SoundResidents({ surfaceHeight: () => 0.4, canStand: () => true });
    const a = figure(), b = figure();
    first.add(definition, a); second.add(definition, b);
    const music = source("music", { soundId: "guitar" });
    first.setContributions([music]); second.setContributions([music]);
    for (let t = now - 8000; t < now; t += 17) first.frame(t, 0.017);
    first.frame(now, 0.017); second.frame(now, 0.25);
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.rotation.y).toBe(b.rotation.y);
    expect(a.getObjectByName("upper-body-rig")!.rotation.z).toBe(b.getObjectByName("upper-body-rig")!.rotation.z);
    expect(first.responses).toEqual(second.responses);
    expect(first.responses[0]?.sourceId).toBe("music");
    expect(Math.hypot(a.position.x - home.x, a.position.z - home.z)).toBeLessThanOrEqual(1.1);
    first.dispose(); second.dispose();
  });

  it("refuses an intervening solid and a floor drop even when the endpoint is walkable", () => {
    for (const options of [
      { surfaceHeight: () => 0, canStand: (x: number) => !(x > 0.4 && x < 0.7) },
      { surfaceHeight: (x: number) => x > 0.4 ? -1 : 0, canStand: () => true },
    ]) {
      const residents = new SoundResidents(options);
      const sprite = figure(); residents.add(definition, sprite);
      residents.setContributions([source("music", { soundId: "guitar" })]);
      residents.frame(now, 0.1);
      expect(sprite.position.x).toBe(0);
      expect(residents.responses[0]?.behavior).toBe("sway");
      residents.dispose();
    }
  });

  it("keeps a reduced-motion response static, returns after removal and tears down once", () => {
    const residents = new SoundResidents({ surfaceHeight: () => 0, canStand: () => true });
    const root = new THREE.Group();
    const owned = figure(), existing = figure(); root.add(owned, existing);
    residents.add(definition, owned, true);
    residents.add({ ...definition, id: "other" }, existing);
    residents.frame(NaN, 0.1);
    expect(owned.position.toArray()).toEqual([0, 0, 0]);
    residents.setContributions([source("bell", { soundId: "bicycle-bell" })]);
    residents.frame(now, 0.1, true);
    const bone = owned.getObjectByName("right-shoulder")!;
    const rotations = bone.rotation.toArray();
    residents.frame(now + 1500, 0.25, true);
    expect(owned.position.toArray()).toEqual([0, 0, 0]);
    expect(bone.rotation.toArray()).toEqual(rotations);
    expect(residents.responses).toHaveLength(2);
    expect(residents.responses[0]?.behavior).toBe("wave");
    residents.frame(now + 2000, 0.1);
    residents.setContributions([]);
    residents.frame(now + 2250, 0.1);
    expect(residents.responses).toHaveLength(0);
    residents.frame(now + 4250, 0.1);
    expect(owned.position.toArray()).toEqual([0, 0, 0]);
    residents.dispose(); residents.dispose();
    expect(owned.dispose).toHaveBeenCalledOnce();
    expect(existing.dispose).not.toHaveBeenCalled();
    expect(root.children).toEqual([existing]);
    expect(existing.userData.soundResident).toBeUndefined();
    residents.setContributions([source("after-dispose")]);
    residents.frame(now + 5000, 0.1);
    expect(residents.responses).toEqual([]);
  });
});
