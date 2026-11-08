import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PLANET_HALF, PLANET_RADIUS } from "../src/shared/planet.js";
import type { SoundSignal } from "../src/shared/sound-response.js";
import { SoundWildlife } from "../src/client/sound-wildlife.js";

const source = (id: string, soundId = "evening-forest", extra: Partial<SoundSignal> = {}): SoundSignal =>
  ({ id, soundId, x: 18, z: 14, at: "2026-11-08T12:00:00Z", ...extra });
const meshes = (wildlife: SoundWildlife): THREE.InstancedMesh[] => wildlife.root.children as THREE.InstancedMesh[];
const matrices = (wildlife: SoundWildlife): number[][] => meshes(wildlife).map(mesh => Array.from(mesh.instanceMatrix.array).slice(0, mesh.count * 16));

describe("sound-born bird and gull visitors", () => {
  it("only brings visitors for living public bird calls, preserves example origin and removes tombstoned duplicates", () => {
    const wildlife = new SoundWildlife(new THREE.Scene(), () => 0);
    try {
      wildlife.setSources([source("real"), source("world", "coastal-gulls", { origin: "example" }), source("music", "guitar"),
        source("ended"), source("ended", "evening-forest", { removedAt: "2026-11-08T12:01:00Z" }),
        source("inside", "evening-forest", { whileIn: "planet-toilet" }), source("invalid", "evening-forest", { x: NaN })]);
      expect(wildlife.state).toEqual([
        { sourceId: "real", kind: "bird", origin: "player", count: 2, x: 18, z: 14 },
        { sourceId: "world", kind: "gull", origin: "example", count: 2, x: 18, z: 14 },
      ]);
      expect(meshes(wildlife).filter(mesh => mesh.count > 0)).toHaveLength(6);
      wildlife.setSources([source("real", "evening-forest", { removedAt: "2026-11-08T12:02:00Z" })]);
      expect(wildlife.state).toEqual([]);
      expect(meshes(wildlife).every(mesh => mesh.count === 0)).toBe(true);
      wildlife.frame(1_800_000_000_000);
      expect(meshes(wildlife).every(mesh => mesh.count === 0)).toBe(true);
    } finally { wildlife.dispose(); }
  });

  it("gives actual sources priority over teaching props, bounds the flock, and selects canonically independent of input order", () => {
    const first = new SoundWildlife(new THREE.Scene(), () => 0), late = new SoundWildlife(new THREE.Scene(), () => 0);
    const sources = Array.from({ length: 8 }, (_, i) => source(`real-${i}`, i % 2 ? "coastal-gulls" : "evening-forest"));
    sources.push(source("old-example", "coastal-gulls", { at: "2026-11-01T00:00:00Z", origin: "example" }));
    try {
      first.setSources(sources); late.setSources([...sources].reverse());
      first.frame(1_800_000_000_000); late.frame(1_800_000_000_000);
      expect(first.state.map(state => state.sourceId)).toEqual(["real-0", "real-1", "real-2", "real-3", "real-4", "real-5"]);
      expect(first.state.reduce((sum, state) => sum + state.count, 0)).toBe(12);
      expect(late.state).toEqual(first.state);
      expect(matrices(late)).toEqual(matrices(first));
      expect(meshes(first)).toHaveLength(6);
      const returned = first.state; returned[0].x = 0;
      expect(first.state[0].x).toBe(18);
    } finally { first.dispose(); late.dispose(); }
  });

  it("uses the same server-time poses for late arrivals, with still wings and orbit under reduced motion", () => {
    const first = new SoundWildlife(new THREE.Scene(), () => 0), late = new SoundWildlife(new THREE.Scene(), () => 0);
    try {
      const sources = [source("one"), source("two", "coastal-gulls")];
      first.setSources(sources); first.frame(1_800_000_000_000);
      const before = matrices(first); first.frame(1_800_000_000_700);
      expect(matrices(first)).not.toEqual(before);
      late.setSources(sources); late.frame(1_800_000_000_700);
      expect(matrices(late)).toEqual(matrices(first));
      first.frame(1_800_000_000_700, true); const still = matrices(first);
      first.frame(1_800_000_010_000, true);
      expect(matrices(first)).toEqual(still);
    } finally { first.dispose(); late.dispose(); }
  });

  it("places finite volumetric visitors above sampled terrain across the seam and pole, and gives gulls longer wings", () => {
    const sampled: { x: number; z: number }[] = [], wildlife = new SoundWildlife(new THREE.Scene(), (x, z) => { sampled.push({ x, z }); return 3; });
    try {
      wildlife.setSources([source("seam", "evening-forest", { x: PLANET_HALF - .05, z: 0 }),
        source("pole", "coastal-gulls", { x: 0, z: PLANET_HALF / 2 - .05 })]);
      wildlife.frame(1_800_000_000_000);
      expect(sampled.some(point => point.x < 0)).toBe(true);
      for (const mesh of meshes(wildlife)) {
        const p = mesh.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeGreaterThan(.02);
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          expect(matrix.elements.every(Number.isFinite)).toBe(true);
          const altitude = new THREE.Vector3().setFromMatrixPosition(matrix).length() - PLANET_RADIUS;
          expect(altitude).toBeGreaterThan(4.5);
          expect(altitude).toBeLessThan(6);
        }
      }
      const wing = (kind: string): THREE.BufferGeometry => meshes(wildlife).find(mesh => mesh.name === `sound-wildlife-${kind}-left-wing`)!.geometry;
      expect(wing("gull").boundingBox!.max.x).toBeGreaterThan(wing("bird").boundingBox!.max.x * 1.9);
    } finally { wildlife.dispose(); }
  });

  it("releases shared geometry, instance buffers and material exactly once and cannot revive after disposal", () => {
    const scene = new THREE.Scene(), wildlife = new SoundWildlife(scene, () => 0);
    wildlife.setSources([source("one")]);
    const originals = meshes(wildlife), geometries = new Set(originals.map(mesh => mesh.geometry));
    const released = { mesh: 0, geometry: 0, material: 0 };
    originals.forEach(mesh => mesh.addEventListener("dispose", () => released.mesh++));
    geometries.forEach(geometry => geometry.addEventListener("dispose", () => released.geometry++));
    (originals[0].material as THREE.Material).addEventListener("dispose", () => released.material++);
    wildlife.dispose(); wildlife.dispose(); wildlife.setSources([source("new")]); wildlife.frame(1_800_000_000_000);
    expect(released).toEqual({ mesh: 6, geometry: 4, material: 1 });
    expect(wildlife.state).toEqual([]);
    expect(scene.children).toEqual([]);
  });
});
