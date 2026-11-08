import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SoundVessels, findHarbourRoute, harbourVesselPose, type SoundVesselOptions } from "../src/client/sound-vessels.ts";
import { coastlineAt, planetPierHeightAt } from "../src/client/planet-coast.ts";
import { PLANET_HALF, PLANET_RADIUS } from "../src/shared/planet.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const at = Date.parse("2026-11-08T12:00:00Z");
const options: SoundVesselOptions = { shoreline: coastlineAt, isWater: (x, z) => z > coastlineAt(x) + .12 && planetPierHeightAt(x, z) === null };
const source = (id = "horn", patch: Partial<PlacedSound> = {}): PlacedSound => ({ id, soundId: "harbour-boat", x: 16, z: 14, at: new Date(at).toISOString(), byId: "person-a", by: "Ada", ...patch });
const model = (vessels: SoundVessels): THREE.Group => vessels.root.children.find(child => child.name === "sound-born-ferry") as THREE.Group;
const snapshot = (vessels: SoundVessels): number[][] => { vessels.root.updateMatrixWorld(true);return vessels.root.children.flatMap(child => child instanceof THREE.InstancedMesh ? [Array.from(child.instanceMatrix.array).slice(0, child.count * 16)] : [child.matrix.elements.slice()]); };

describe("actual horn ingredients bring passing ferries", () => {
  it("uses complete offshore routes and avoids the real pier across seams and source latitudes", () => {
    for (const [x, z] of [[16, 14], [7, 18], [0, 0], [PLANET_HALF - .05, 0], [-PLANET_HALF + .05, -10], [0, PLANET_HALF / 2 - .01]]) {
      const row = source("route", { x, z }), route = findHarbourRoute(row, options);
      expect(route).not.toBeNull();
      for (let sample = 0; sample <= 720; sample++) {
        const pose = harbourVesselPose(route!, at + sample / 720 * 86_000, options);
        expect(pose).not.toBeNull();
        expect(pose!.z).toBeGreaterThan(coastlineAt(pose!.x) + .15);
        expect(planetPierHeightAt(pose!.x, pose!.z)).toBeNull();
        expect([pose!.x, pose!.z, pose!.yaw].every(Number.isFinite)).toBe(true);
      }
    }
    expect(findHarbourRoute(source(), { shoreline: () => PLANET_HALF / 2 })).toBeNull();
    expect(findHarbourRoute(source(), { shoreline: () => NaN })).toBeNull();
  });

  it("only responds to actual public horns and releases removed, private or malformed endpoints immediately", () => {
    const vessels = new SoundVessels(new THREE.Scene(), options);
    try {
      const example = { ...source("example"), origin: "example" };
      vessels.setSources([source(), source("bird", { soundId: "evening-forest" }), example,
        source("ended"), source("ended", { removedAt: new Date(at + 1000).toISOString() }), source("inside", { whileIn: "planet-shower" }),
        source("bad", { x: NaN }), source("future-invalid", { at: "not-a-date" })]);
      vessels.frame(at + 2000);
      expect(vessels.state).toHaveLength(1);
      expect(vessels.state[0]).toMatchObject({ sourceId: "horn", byId: "person-a", by: "Ada", sourceX: 16, sourceZ: 14, visible: true });
      expect(model(vessels).userData.soundVessel).toMatchObject({ sourceId: "horn", byId: "person-a", by: "Ada" });
      vessels.setSources([source("horn", { removedAt: new Date(at + 3000).toISOString() })]);
      expect(vessels.state).toEqual([]);expect(vessels.root.children.filter(child => child.name === "sound-born-ferry")).toHaveLength(0);
      expect((vessels.root.getObjectByName("sound-vessel-wake") as THREE.InstancedMesh).count).toBe(0);
      vessels.setSources([source()]);vessels.frame(at + 5000);expect(vessels.state).toEqual([]);
    } finally { vessels.dispose(); }
  });

  it("prioritises the newest three real contributors, reports the budget and keeps canonical order for late arrivals", () => {
    const first = new SoundVessels(new THREE.Scene(), options), late = new SoundVessels(new THREE.Scene(), options);
    const rows = Array.from({ length: 4 }, (_, i) => source(`source-${i}`, { byId: `person-${i}`, by: `Friend ${i}`, at: new Date(at + i * 1000).toISOString() }));
    const frozen = JSON.stringify(rows);
    try {
      first.setSources(rows.slice(0, 2));first.frame(at + 5000);first.setSources(rows);
      late.setSources([...rows].reverse());first.frame(at + 70_000);late.frame(at + 70_000);
      expect(first.state.filter(state => state.visible).map(state => state.sourceId)).toEqual(["source-3", "source-2", "source-1"]);
      expect(first.state.find(state => state.sourceId === "source-0")).toMatchObject({ visible: false, reason: "budget" });
      expect(late.state).toEqual(first.state);expect(snapshot(late)).toEqual(snapshot(first));
      expect(first.viewpoint("source-0")).toBeNull();
      first.setSources(rows.slice(0, 3));expect(first.state.every(state => state.visible)).toBe(true);
      expect(JSON.stringify(rows)).toBe(frozen);
    } finally { first.dispose();late.dispose(); }
  });

  it("has a hull, cabin, chimney, windows and a curved sea-level wake, with visible upward deck faces", () => {
    const vessels = new SoundVessels(new THREE.Scene(), options);
    try {
      vessels.setSources([source()]);vessels.frame(at + 7000);vessels.root.updateMatrixWorld(true);
      const ship = model(vessels);expect(ship.children).toHaveLength(6);
      const deck = ship.getObjectByName("ferry-timber-deck") as THREE.Mesh;
      const positions = deck.geometry.getAttribute("position"), normals = deck.geometry.getAttribute("normal");
      let upward = 0;
      for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getY(i) - .205) < .00001 && normals.getY(i) > .5) upward++;
      expect(upward).toBeGreaterThan(5);
      ship.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        expect(object.userData.soundVessel).toMatchObject({ sourceId: "horn", byId: "person-a" });
        const position = object.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
          const x = Math.atan2(point.x, point.z) * PLANET_RADIUS, z = -Math.asin(point.y / point.length()) * PLANET_RADIUS;
          expect(z).toBeGreaterThan(coastlineAt(x));expect(planetPierHeightAt(x, z)).toBeNull();
        }
      });
      const wake = vessels.root.getObjectByName("sound-vessel-wake") as THREE.InstancedMesh;
      expect(wake.count).toBe(8);
      for (let i = 0; i < wake.count; i++) {
        const matrix = new THREE.Matrix4();wake.getMatrixAt(i, matrix);
        const point = new THREE.Vector3().setFromMatrixPosition(matrix);
        expect(point.length() - PLANET_RADIUS).toBeCloseTo(.105, 4);
      }
      const viewing = vessels.viewpoint("horn")!;
      expect(viewing.z).toBeLessThan(coastlineAt(viewing.x));expect(Number.isFinite(viewing.yaw)).toBe(true);
    } finally { vessels.dispose(); }
  });

  it("is server-anchored and freezes the ferry, smoke and wake under reduced motion", () => {
    const first = new SoundVessels(new THREE.Scene(), options), late = new SoundVessels(new THREE.Scene(), options);
    try {
      first.setSources([source()]);first.frame(at + 5000);const before = snapshot(first);first.frame(at + 12_000);
      expect(snapshot(first)).not.toEqual(before);
      late.setSources([source()]);late.frame(at + 12_000);expect(snapshot(late)).toEqual(snapshot(first));
      first.frame(at + 12_000, true);const still = snapshot(first);first.frame(at + 29_000, true);
      expect(snapshot(first)).toEqual(still);expect(first.state[0].visible).toBe(true);
      expect((first.root.getObjectByName("sound-vessel-wake") as THREE.InstancedMesh).count).toBe(0);
    } finally { first.dispose();late.dispose(); }
  });

  it("disposes shared resources exactly once and cannot revive after disposal", () => {
    const scene = new THREE.Scene(), vessels = new SoundVessels(scene, options);vessels.setSources([source()]);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    vessels.root.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry);for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    let releasedGeometry = 0, releasedMaterial = 0;
    for (const geometry of geometries) geometry.addEventListener("dispose", () => releasedGeometry++);
    for (const material of materials) material.addEventListener("dispose", () => releasedMaterial++);
    vessels.dispose();vessels.dispose();vessels.setSources([source("later")]);vessels.frame(at + 9000);
    expect(releasedGeometry).toBe(geometries.size);expect(releasedMaterial).toBe(materials.size);
    expect(vessels.state).toEqual([]);expect(scene.children).toEqual([]);
  });
});
