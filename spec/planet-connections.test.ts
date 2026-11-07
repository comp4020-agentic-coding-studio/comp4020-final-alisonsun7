import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { PlanetSoundConnections } from "../src/client/planet-connections.ts";
import { PLANET_HALF, PLANET_RADIUS } from "../src/shared/planet.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";
const sound = (id: string, x: number, parent?: PlacedSound): PlacedSound => ({ id, x, z: 0, soundId: "guitar", at: "2026-11-07T10:00:00Z", by: "Ada", byId: "p1", ...(parent ? { replyToId: parent.id, replyTo: parent } : {}) });
describe("reply threads on the actual sphere", () => {
  it("connects the short side of the longitude seam above the real surface", () => {
    const scene = new THREE.Scene(), threads = new PlanetSoundConnections(scene, () => .2);
    const parent = sound("a", PLANET_HALF - 1), child = sound("b", -PLANET_HALF + 1, parent);
    threads.setAll([child, parent]);
    expect(threads.frame(parent)).toBe(1);
    const group = scene.getObjectByName("planet-sound-conversations")!, line = group.children[0] as THREE.Line;
    const positions = line.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      expect(p.length()).toBeGreaterThan(PLANET_RADIUS + .3);
      expect(p.z).toBeLessThan(-PLANET_RADIUS + .1);
    }
    expect(threads.frame({ x: 0, z: 0 })).toBe(0);
    threads.dispose();expect(group.parent).toBeNull();
  });
  it("never links removed/private endpoints or revives a parent from reply metadata", () => {
    const scene = new THREE.Scene(), threads = new PlanetSoundConnections(scene, () => 0);
    const parent = sound("a", 0), child = sound("b", 2, parent);
    threads.setAll([parent, child]);expect(threads.frame(parent)).toBe(1);
    for (const list of [[child], [{ ...parent, removedAt: "now" }, child], [{ ...parent, whileIn: "planet-toilet" }, child], [parent, { ...child, whileIn: "planet-toilet" }], [parent, { ...child, replyTo: { ...parent, removedAt: "now" } }]]) {
      threads.setAll(list);expect(threads.frame(parent)).toBe(0);
    }
    threads.dispose();threads.setAll([parent, child]);expect(scene.children).toHaveLength(0);
  });
});
