import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlanet, type PlanetBuild } from "../src/client/planet-build.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const sound = (id: string, soundId: string, extra: Partial<PlacedSound> = {}): PlacedSound => ({
  id, soundId, byId: "real-person", by: "Ada", x: -9, z: -7,
  at: `2026-11-07T10:00:0${id === "coffee" ? 0 : 1}Z`, ...extra,
});
describe("the sound-shaped coffee house", () => {
  let scene: PlanetBuild;
  beforeEach(() => {
    // Sign rasterisation is outside this geometry/lifecycle check. Every
    // actual cafe mesh and its sound-driven animation remains unmocked.
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => (() => {}) }) }) });
    scene = buildPlanet();
  });
  afterEach(() => { scene.dispose(); vi.unstubAllGlobals(); });

  it("opens the real front approach and makes the coffee counter and patio available at the original location", () => {
    expect(scene.root.getObjectByName("village-coffee-house")).toBeInstanceOf(THREE.Group);
    expect(scene.root.getObjectByName("cafe-coffee-counter")).toBeInstanceOf(THREE.Mesh);
    expect(scene.root.getObjectByName("cafe-espresso-machine")).toBeInstanceOf(THREE.Mesh);
    // This previously stopped at a closed front wall outside the narrow door.
    expect(scene.canStand(-7.65, -4.9, new Set())).toBe(true);
    // The existing back and side walls remain physical boundaries.
    expect(scene.canStand(-9, -10, new Set())).toBe(false);
    expect(scene.canStand(-5.3, -7, new Set())).toBe(false);
  });

  it("uses living public cafe ingredients for steam, the record and company, and cancels their effects after removal", () => {
    const ignored = [sound("private", "espresso", { whileIn: "planet-shower" }),
      sound("ended", "cafe-chatter", { removedAt: "2026-11-07T10:00:05Z" }), sound("far", "cafe-dishes", { x: 40, z: 0 })];
    scene.setContributions(ignored); scene.animate(100, false);
    expect(scene.cafeState).toEqual({ sourceIds: [], steam: false, music: false, company: false });
    const sources = [sound("coffee", "espresso"), sound("rhythm", "cafe-music"), sound("talk", "cafe-chatter")];
    scene.setContributions([...sources, ...ignored]); scene.animate(100, false);
    expect(scene.cafeState).toEqual({ sourceIds: ["coffee", "rhythm", "talk"], steam: true, music: true, company: true });
    const steam: THREE.Object3D[] = []; scene.root.traverse(object => { if (object.name === "cafe-source-steam") steam.push(object); });
    expect(steam.length).toBeGreaterThan(0); expect(steam.every(object => object.visible)).toBe(true);
    const pose = steam.map(object => object.position.toArray());
    const record = scene.root.getObjectByName("cafe-source-record")!;
    expect(record.rotation.y).not.toBe(0);
    scene.setContributions([...sources].reverse()); scene.animate(100, false);
    expect(scene.cafeState.sourceIds).toEqual(["coffee", "rhythm", "talk"]);
    expect(steam.map(object => object.position.toArray())).toEqual(pose);
    scene.animate(100, true); const still = steam.map(object => object.position.toArray());
    scene.animate(120, true); expect(steam.map(object => object.position.toArray())).toEqual(still);
    expect(record.rotation.y).toBe(0);
    scene.setContributions(sources.map(source => ({ ...source, removedAt: "2026-11-07T10:00:05Z" })));
    scene.animate(121, false);
    expect(scene.cafeState).toEqual({ sourceIds: [], steam: false, music: false, company: false });
    expect(steam.every(object => !object.visible)).toBe(true); expect(record.rotation.y).toBe(0);
  });
});
