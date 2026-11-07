import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { buildPlanet } from "../src/client/planet-build.ts";
import { planetBasis, planetPoint } from "../src/shared/planet.ts";

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
