import * as THREE from "three";
import { expect, it } from "vitest";
import { PlanetSourceCues } from "../src/client/planet-world.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const source = (id: string, extra: Partial<PlacedSound> = {}): PlacedSound => ({ id, byId: id, by: id, soundId: "trickle", x: 2, z: 3, at: "2026-11-07T10:00:00Z", ...extra });
const petals = (cue: PlanetSourceCues): THREE.InstancedMesh[] => {
  const result: THREE.InstancedMesh[] = []; cue.root.traverse(object => { if (object.name === "source-paper-petals") result.push(object as THREE.InstancedMesh); }); return result;
};
const poses = (cue: PlanetSourceCues): number[][] => petals(cue).map(object => [...object.instanceMatrix.array]);

it("shows public source buds with pooled geometry and server-time poses, and releases ended instances without disposing another sound's shared geometry", () => {
  const scene = new THREE.Scene(), cues = new PlanetSourceCues(scene), late = new PlanetSourceCues(new THREE.Scene());
  try {
    const sources = [source("a"), source("b", { soundId: "chorus-chords", x: 3 })];
    const ignored = [source("private", { whileIn: "planet-shower" }), source("ended", { removedAt: "2026-11-07T10:00:02Z" })];
    cues.setAll([...sources, ...ignored]); late.setAll([...ignored, ...sources].reverse());
    cues.frame(1_800_000_000_000); late.frame(1_800_000_000_000);
    expect(cues.state.map(cue => cue.id)).toEqual(["a", "b"]); expect(late.state).toEqual(cues.state);
    expect(poses(late)).toEqual(poses(cues));
    const [first, other] = petals(cues);
    expect(first.geometry).toBe(other.geometry);
    let firstReleased = false, geometryReleased = false;
    first.addEventListener("dispose", () => { firstReleased = true; });
    first.geometry.addEventListener("dispose", () => { geometryReleased = true; });
    cues.setAll([sources[1]]); cues.frame(1_800_000_001_000);
    expect(firstReleased).toBe(true); expect(geometryReleased).toBe(false); expect(petals(cues)).toEqual([other]);
    cues.frame(1_800_000_001_000, true); const still = poses(cues);
    cues.frame(1_800_000_009_000, true); expect(poses(cues)).toEqual(still);
    expect(cues.root.getObjectsByProperty("type", "PointLight")).toHaveLength(0);
    cues.dispose(); expect(geometryReleased).toBe(true); expect(scene.children).toHaveLength(0);
    cues.setAll(sources); cues.frame(1_800_000_010_000); expect(cues.state).toHaveLength(0);
  } finally { cues.dispose(); late.dispose(); }
});
