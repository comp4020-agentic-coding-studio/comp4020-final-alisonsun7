import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { buildPlanet } from "../src/client/planet-build.ts";
import { PLANET_HUTS, planetBasis, planetPoint } from "../src/shared/planet.ts";
import { thirdPersonBodyVisible } from "../src/client/planet-world.ts";

it("keeps the actual initial player's body clear of instanced tree crowns", () => {
  // Only the sign-writing canvas is stubbed. Every tested mesh, instance
  // transform and ray intersection is the real authored scene geometry.
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({ measureText: () => ({ width: 100 }) }, { get: (object, key) => Reflect.get(object, key) ?? (() => {}) }) }) });
  const scene = buildPlanet();
  try {
    const b = planetBasis(1.8, 2.2), up = new THREE.Vector3(b.up.x, b.up.y, b.up.z), south = new THREE.Vector3(b.south.x, b.south.y, b.south.z);
    const p = planetPoint(1.8, 2.2), feet = new THREE.Vector3(p.x, p.y, p.z);
    // The reviewed 16m camera sits behind a north-facing player. Test actual
    // view rays at legs, torso and head, rather than trusting selfVisible.
    const camera = feet.clone().addScaledVector(up, 1.45 + 16 * .82 + .12 * 5).addScaledVector(south, 16);
    scene.root.updateMatrixWorld(true);
    const crowns = scene.root.getObjectByName("village-irregular-canopies")!;
    for (const height of [.45, .9, 1.4]) {
      const target = feet.clone().addScaledVector(up, height), direction = target.clone().sub(camera);
      const hits = new THREE.Raycaster(camera, direction.clone().normalize(), .1, direction.length() - .05).intersectObject(crowns, false);
      expect(hits.length, `Tree crown hides the real player at height ${height}`).toBe(0);
    }
  } finally { scene.dispose();vi.unstubAllGlobals(); }
});

it("clears the player's body from the actual wall-shortened restroom and shower views, then restores it outdoors", () => {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => (() => {}) }) }) });
  const scene = buildPlanet();
  try {
    scene.root.updateMatrixWorld(true);
    for (const hut of PLANET_HUTS) {
      let formerlyObscuredViews = 0;
      for (const z of [5.2, 5.9, 6.4]) for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const x = (hut.x0 + hut.x1) / 2, b = planetBasis(x, z), p = planetPoint(x, z, scene.heightAt(x, z));
        const up = new THREE.Vector3(b.up.x, b.up.y, b.up.z), heading = new THREE.Vector3(b.south.x, b.south.y, b.south.z).multiplyScalar(Math.cos(yaw))
          .addScaledVector(new THREE.Vector3(b.east.x, b.east.y, b.east.z), Math.sin(yaw));
        const head = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(up, 1.45);
        const ray = heading.clone().multiplyScalar(-8).addScaledVector(up, 8 * .82 + .12 * 5), length = ray.length();
        const hit = new THREE.Raycaster(head, ray.clone().normalize(), .1, length).intersectObjects(scene.solids, false)[0];
        if (!hit) continue;
        const distance = Math.max(.55, hit.distance - .22);
        if (distance >= 2.5) continue;
        expect(thirdPersonBodyVisible(distance, true, true)).toBe(false);
        if (distance > 1.15) formerlyObscuredViews++;
      }
      expect(formerlyObscuredViews, `${hut.id} must exercise a real cramped view that previously showed the body`).toBeGreaterThan(0);
    }
    expect(thirdPersonBodyVisible(10, false, false)).toBe(true);
    expect(thirdPersonBodyVisible(10, false, true)).toBe(true);
    expect(thirdPersonBodyVisible(2, false, true)).toBe(true);
  } finally { scene.dispose(); vi.unstubAllGlobals(); }
});
