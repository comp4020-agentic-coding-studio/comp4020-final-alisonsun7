import * as THREE from "three";
import { expect, it } from "vitest";
import { PlanetSourceCues } from "../src/client/planet-world.ts";
import { onPlanet } from "../src/client/planet-build.ts";
import { PlanetSupportSurfaces, type PlanetSupport } from "../src/client/planet-support.ts";
import { PLANET_RADIUS, planetNormal, planetPoint } from "../src/shared/planet.ts";
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

it("seats a real author's bud and its actual ground glow on the transformed floor plane", () => {
  const scene = new THREE.Scene(), cues = new PlanetSourceCues(scene);
  const geometry = new THREE.BoxGeometry(6, .2, 5), material = new THREE.MeshBasicMaterial();
  const parent = new THREE.Group();onPlanet(parent, -9, -7);
  const floor = new THREE.Mesh(geometry, material);floor.position.y = .2;parent.add(floor);parent.updateMatrixWorld(true);
  const surfaces = new PlanetSupportSurfaces();surfaces.add(floor, "actual-flat-cafe-floor");surfaces.refresh();
  const supportAt = (x: number, z: number): PlanetSupport => surfaces.at(x, z, { height: 0, normal: planetNormal(x, z), kind: "ground", id: "sphere" });
  const actualFloorPoint = new THREE.Vector3(2.1, .1, 1.1).applyMatrix4(floor.matrixWorld), radial = actualFloorPoint.clone().normalize();
  const normal = new THREE.Vector3(0, 1, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(floor.matrixWorld)).normalize();
  const contribution = source("authored-floor-bud", { byId: "real-author", by: "Ada", x: Math.atan2(radial.x, radial.z) * PLANET_RADIUS, z: -Math.asin(radial.y) * PLANET_RADIUS });
  const original = { ...contribution };
  try {
    expect(supportAt(contribution.x, contribution.z).id).toBe("actual-flat-cafe-floor");
    expect(radial.distanceTo(normal)).toBeGreaterThan(.05);
    cues.setAll([contribution], (x, z) => supportAt(x, z).height, supportAt);
    cues.frame(1_800_000_000_000);scene.updateMatrixWorld(true);
    const bud = cues.root.getObjectByName("planet-sound-bud")!, glow = bud.getObjectByName("source-soft-ground-glow") as THREE.Mesh;
    expect(bud.userData).toMatchObject({ sourceId: contribution.id, authorId: contribution.byId });
    expect(bud.getWorldPosition(new THREE.Vector3()).distanceTo(actualFloorPoint.clone().addScaledVector(normal, .006))).toBeLessThan(1e-8);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(bud.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.dot(normal)).toBeCloseTo(1, 10);
    const vertices = glow.geometry.getAttribute("position");
    for (let index = 0; index < vertices.count; index++) {
      const actualVertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(glow.matrixWorld);
      expect(actualVertex.sub(actualFloorPoint).dot(normal)).toBeCloseTo(.006, 7);
    }
    expect(cues.state).toEqual([{ id: contribution.id, authorId: contribution.byId, soundId: contribution.soundId, x: contribution.x, z: contribution.z, kind: "paper-glass-bud" }]);
    expect(contribution).toEqual(original);
    cues.setAll([{ ...contribution, removedAt: "2026-11-08T10:00:00Z" }], undefined, supportAt);
    expect(cues.state).toHaveLength(0);expect(cues.root.children).toHaveLength(0);
    cues.dispose();cues.setAll([contribution], undefined, supportAt);
    expect(cues.state).toHaveLength(0);expect(scene.children).toHaveLength(0);
  } finally { cues.dispose();geometry.dispose();material.dispose(); }
});

it("retains the height-only radial cue contract with the same small ground clearance", () => {
  const cues = new PlanetSourceCues(new THREE.Scene()), contribution = source("radial-height-bud");
  try {
    cues.setAll([contribution], () => .18);
    const bud = cues.root.getObjectByName("planet-sound-bud")!, expected = planetPoint(contribution.x, contribution.z, .186), normal = planetNormal(contribution.x, contribution.z);
    expect(bud.position.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z))).toBeLessThan(1e-9);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(bud.quaternion).dot(new THREE.Vector3(normal.x, normal.y, normal.z))).toBeCloseTo(1, 10);
  } finally { cues.dispose(); }
});
