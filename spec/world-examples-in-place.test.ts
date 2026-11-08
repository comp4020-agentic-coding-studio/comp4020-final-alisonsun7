import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SoundWaterlife, type SoundWaterlifeOptions } from "../src/client/sound-waterlife.ts";
import { SoundVessels, type SoundVesselOptions } from "../src/client/sound-vessels.ts";
import { coastlineAt, planetPierHeightAt } from "../src/client/planet-coast.ts";
import { activeWorldExamples, soundLifeEffect, worldChangingFirst, worldSoundExamples, type WorldSoundExample } from "../src/shared/sound-life.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

// ADR 038: sounds that change the world are in place from the start, as
// labelled world examples, and are what the choosers recommend first.
const waterOptions: SoundWaterlifeOptions = { shoreline: coastlineAt, isWater: (x, z) => z > coastlineAt(x) + .15 && planetPierHeightAt(x, z) === null, pool: { x: 16, z: 14, radius: 2.55, height: .035 } };
const vesselOptions: SoundVesselOptions = { shoreline: coastlineAt, isWater: (x, z) => z > coastlineAt(x) + .12 && planetPierHeightAt(x, z) === null };
const examples = worldSoundExamples("room");
const example = (kind: WorldSoundExample["kind"]): WorldSoundExample => examples.find(e => e.kind === kind)!;
const real = (id: string, soundId: string, x: number, z: number): PlacedSound => ({ id, soundId, x, z, at: "2026-11-08T12:00:00Z", byId: "person-a", by: "Ada" });

describe("world examples that change the world are in place from the start", () => {
  it("includes the guitar, whale and gulls, with frogs and a ferry, each with an effect to see", () => {
    expect(examples.map(e => e.soundId)).toEqual(expect.arrayContaining(["guitar", "whale-song", "coastal-gulls", "pond-frogs", "harbour-boat"]));
    for (const e of examples) expect(soundLifeEffect(e.soundId), e.id).not.toBeNull();
  });

  it("lets a real nearby sound of the same kind take each new example's place", () => {
    for (const [kind, soundId] of [["whale", "whale-song"], ["frogs", "pond-frogs"], ["boat", "harbour-boat"], ["guitar", "hand-claps"]] as const) {
      const e = example(kind), ids = activeWorldExamples(examples, [real("r", soundId, e.x, e.z)], true).map(s => s.id);
      expect(ids, kind).not.toContain(e.id);
      expect(ids, kind).toHaveLength(examples.length - 1);
    }
    // a different sound beside the whale leaves it showing
    const whale = example("whale");
    expect(activeWorldExamples(examples, [real("r", "trickle", whale.x, whale.z)], true).map(s => s.id)).toContain(whale.id);
  });

  it("brings the example whale and frogs to actual water, behind real sources, and clears them when paused", () => {
    const life = new SoundWaterlife(new THREE.Scene(), waterOptions);
    try {
      life.setExamples(examples);life.frame(Date.parse("2026-11-08T12:00:00Z"));
      const shown = life.state.filter(s => s.origin === "example");
      expect(shown.map(s => s.kind).sort()).toEqual(["frog", "whale"]);
      expect(shown.every(s => s.visible && s.by === "World example")).toBe(true);
      expect(life.root.getObjectByName("sound-born-whale")?.userData.soundWaterlife).toMatchObject({ sourceId: "@world:whale", origin: "example" });
      // two real whales fill the budget: the example yields, and returns after
      const sea = { x: 16, z: coastlineAt(16) - 1 };
      life.setSources([real("w1", "whale-song", sea.x, sea.z), real("w2", "whale-song", sea.x + 6, coastlineAt(sea.x + 6) - 1)]);
      expect(life.state.find(s => s.sourceId === "@world:whale")).toMatchObject({ reason: "budget", count: 0 });
      expect(life.state.filter(s => s.kind === "whale" && s.count === 1).map(s => s.sourceId).sort()).toEqual(["w1", "w2"]);
      life.setSources([real("w1", "whale-song", sea.x, sea.z)]);
      expect(life.state.find(s => s.sourceId === "@world:whale")?.reason).toBeUndefined();
      life.setExamples([]);
      expect(life.state.filter(s => s.origin === "example")).toEqual([]);
      // the paused example is not a withdrawal: showing it again brings it back
      life.setExamples(examples);
      expect(life.state.filter(s => s.origin === "example").map(s => s.kind).sort()).toEqual(["frog", "whale"]);
      // examples still never come in as ordinary sources
      life.setExamples([]);life.setSources([{ ...real("@world:whale", "whale-song", sea.x, sea.z), origin: "example" } as PlacedSound]);
      expect(life.state).toEqual([]);
    } finally { life.dispose(); }
  });

  it("sets the example ferry sailing, behind real horns", () => {
    const vessels = new SoundVessels(new THREE.Scene(), vesselOptions);
    try {
      vessels.setExamples(examples);vessels.frame(Date.parse("2026-11-08T12:00:00Z") + 2000);
      expect(vessels.state).toHaveLength(1);
      expect(vessels.state[0]).toMatchObject({ sourceId: "@world:boat", origin: "example", by: "World example", visible: true });
      vessels.setSources([0, 8, 16].map(dx => real(`h${dx}`, "harbour-boat", dx, 14)));
      expect(vessels.state.find(s => s.sourceId === "@world:boat")?.reason).toBe("budget");
      vessels.setSources([]);vessels.setExamples([]);
      expect(vessels.state).toEqual([]);
    } finally { vessels.dispose(); }
  });

  it("recommends sounds that change the world first, filling in from nearby places", () => {
    const changes = (id: string) => soundLifeEffect(id) !== null;
    expect(worldChangingFirst(["trickle", "rainstick", "gentle-breeze"], { x: -13, z: 7 })).toEqual(expect.arrayContaining(["gentle-breeze"]));
    const reading = worldChangingFirst(["trickle", "rainstick", "gentle-breeze"], { x: -13, z: 7 });
    expect(reading.every(changes)).toBe(true);
    expect(worldChangingFirst(["pond-bubbles", "pond-frogs", "whale-song", "beach-waves"], { x: 16, z: 14 })).toEqual(["pond-bubbles", "pond-frogs", "whale-song"]);
    // a sound asked for stays first, even one with nothing to see
    expect(worldChangingFirst(["guitar", "trickle"], { x: 0, z: 0 }, 3, "trickle")[0]).toBe("trickle");
  });
});
