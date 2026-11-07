import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ChorusGarden } from "../src/client/chorus-garden.ts";
import type { ChorusWork } from "../src/shared/chorus.ts";
import type { SoundReference } from "../src/shared/protocol.ts";
import { bearingToward, moveOnPlanet } from "../src/client/planet-locomotion.ts";
import { planetDistance } from "../src/shared/planet.ts";
import { authorMark, liveChorusAnswers, visibleChorusSources, workSignature } from "../src/shared/chorus-signature.ts";

const source = (id: string, soundId: string, byId = "person-a"): SoundReference => ({
  id, soundId, byId, by: byId, at: `2026-11-07T10:00:0${id === "a" ? 0 : 1}Z`, x: 1, z: 1,
});
function work(overrides: Partial<ChorusWork> = {}): ChorusWork {
  const sounds = [source("a", "trickle"), { ...source("b", "evening-forest", "person-b"), replyToId: "a" }];
  return { id: "a", placeId: "green", x: 1, z: 1, title: "Watersong canopy", variant: "habitat", duet: true,
    sources: sounds, liveSources: sounds, contributors: [{ id: "person-a", name: "Ada" }, { id: "person-b", name: "Bo" }],
    at: sounds[0].at, lastAt: sounds[1].at, ...overrides };
}
const named = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const list: THREE.Object3D[] = []; root.traverse(object => { if (object.name === name) list.push(object); }); return list;
};
const transforms = (objects: THREE.Object3D[]): number[][] => objects.map(object => [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)] as number[]);

describe("recognisable real answers", () => {
  const answered = (): ChorusWork => {
    const a = source("a", "trickle"), b = { ...source("b", "evening-forest", "person-b"), replyToId: "a" };
    return work({ sources: [a, b], liveSources: [a, b] });
  };
  it("keeps an author's colour and silhouette stable across works, reorderings and withdrawal", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      const original = answered(); garden.setWorks([original]); garden.frame(1_800_000_000_000, true);
      const marks = named(garden.root, "chorus-author-mark");
      expect(marks).toHaveLength(2);
      for (const mark of marks) {
        const signature = authorMark(mark.userData.authorId as string);
        expect(mark.userData).toMatchObject({ color: signature.color, shape: signature.shape });
        expect((mark as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe(signature.color.slice(1));
      }
      const fingerprint = workSignature(original);
      expect(workSignature({ ...original, liveSources: [...original.liveSources].reverse() })).toBe(fingerprint);
      expect(workSignature({ ...original, liveSources: original.liveSources.slice(0, 1) })).not.toBe(fingerprint);
      garden.setWorks([{ ...original, liveSources: original.liveSources.slice(0, 1), duet: false }]);
      expect(named(garden.root, "chorus-author-mark")).toHaveLength(1);
      expect(named(garden.root, "chorus-author-mark")[0].userData.color).toBe(authorMark("person-a").color);
    } finally { garden.dispose(); }
  });

  it("draws only living cross-author answers, with a deterministic server-time journey from parent to reply", () => {
    const first = new ChorusGarden(new THREE.Scene()), late = new ChorusGarden(new THREE.Scene());
    try {
      const original = answered(); first.setWorks([original]); late.setWorks([{ ...original, liveSources: [...original.liveSources].reverse() }]);
      first.frame(1_800_000_000_000); late.frame(1_800_000_000_000);
      expect(liveChorusAnswers(original)).toEqual([{ sourceId: "b", parentId: "a", fromAuthorId: "person-a", toAuthorId: "person-b" }]);
      const path = named(first.root, "chorus-answer-path"), lights = named(first.root, "chorus-answer-light");
      expect(path).toHaveLength(1); expect(lights).toHaveLength(1);
      expect(path[0].userData).toMatchObject({ sourceId: "b", parentId: "a", fromAuthorId: "person-a", toAuthorId: "person-b" });
      expect(transforms(named(late.root, "chorus-answer-light"))).toEqual(transforms(lights));
      const before = transforms(lights); first.frame(1_800_000_000_600);
      expect(transforms(lights)).not.toEqual(before);
      first.frame(1_800_000_000_600, true); const still = transforms(lights);
      first.frame(1_800_000_007_000, true); expect(transforms(lights)).toEqual(still);
      let released = false; (path[0] as THREE.Mesh).geometry.addEventListener("dispose", () => { released = true; });
      first.setWorks([{ ...original, liveSources: original.liveSources.slice(1), duet: false }]);
      expect(released).toBe(true); expect(named(first.root, "chorus-answer-path")).toHaveLength(0);
      expect(named(first.root, "chorus-answer-light")).toHaveLength(0);
    } finally { first.dispose(); late.dispose(); }
  });

  it("cannot open a joint form from a same-cookie answer, a missing parent or a tombstoned endpoint", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      const a = source("a", "trickle"), b = { ...source("b", "evening-forest"), replyToId: "a" };
      for (const sources of [[a, b], [{ ...b, byId: "person-b" }], [a, { ...b, byId: "person-b", removedAt: "2026-11-08T00:00:00Z" }]]) {
        const invalid = work({ sources, liveSources: sources, duet: true });
        garden.setWorks([invalid]); garden.frame(1_800_000_000_000);
        expect(liveChorusAnswers(invalid)).toEqual([]);
        expect(named(garden.root, "chorus-answer-path")).toHaveLength(0);
        expect(named(garden.root, "chorus-shared-place")).toHaveLength(0);
        expect(garden.state[0].duet).toBe(false);
      }
    } finally { garden.dispose(); }
  });

  it("keeps a late friend's actual parent and answer visible within six slots, without losing the full work", () => {
    const sources: SoundReference[] = Array.from({ length: 9 }, (_, i) => ({ ...source(`sound-${i}`, "chorus-bells", `person-${Math.min(i, 5)}`),
      at: `2026-11-07T10:00:0${i}Z` }));
    sources[8] = { ...sources[8], byId: "person-late", replyToId: sources[0].id };
    const original = work({ sources, liveSources: sources });
    const slots = visibleChorusSources(original), garden = new ChorusGarden(new THREE.Scene());
    try {
      expect(slots).toHaveLength(6);
      expect(slots.map(s => s.id)).toEqual(expect.arrayContaining([sources[0].id, sources[8].id]));
      expect(visibleChorusSources({ liveSources: [...sources].reverse() })).toEqual(slots);
      garden.setWorks([original]); garden.frame(1_800_000_000_000);
      expect(named(garden.root, "chorus-source-pendant")).toHaveLength(6);
      expect(named(garden.root, "chorus-answer-path")[0].userData).toMatchObject({ parentId: sources[0].id, sourceId: sources[8].id });
      expect(original.liveSources).toHaveLength(9);
      expect(garden.canStand(2, 2)).toBe(true);
    } finally { garden.dispose(); }
  });
});

describe("real source-born Chorus sculptures", () => {
  it("shows a dormant invitation, then grows attributed sources and only opens shared topology for a confirmed duet", () => {
    const scene = new THREE.Scene(), garden = new ChorusGarden(scene);
    try {
      expect(garden.state.every(state => state.workId === null && !state.duet && !state.sourceIds.length)).toBe(true);
      const single = work({ duet: false, variant: "lantern", liveSources: [source("a", "trickle")] });
      garden.setWorks([single]); garden.frame(1_800_000_000_000);
      expect(named(garden.root, "chorus-source-pendant")).toHaveLength(1);
      expect(named(garden.root, "chorus-source-pendant")[0].userData).toEqual({ sourceId: "a", authorId: "person-a" });
      expect(named(garden.root, "chorus-paper-bird")).toHaveLength(0);
      garden.setWorks([work({ duet: false })]); garden.frame(1_800_000_000_000);
      expect(named(garden.root, "chorus-source-pendant")).toHaveLength(2);
      expect(named(garden.root, "chorus-paper-bird")).toHaveLength(0);
      const closed = named(garden.root, "chorus-source-pendant")[0].parent!.rotation.z;
      garden.setWorks([work()]); garden.frame(1_800_000_000_000);
      expect(named(garden.root, "chorus-paper-bird")).toHaveLength(3);
      expect(named(garden.root, "chorus-source-pendant")[0].parent!.rotation.z).toBeGreaterThan(closed + .4);
      expect(garden.state[0]).toMatchObject({ workId: "a", duet: true, contributors: ["person-a", "person-b"], sourceIds: ["a", "b"], open: 1 });
    } finally { garden.dispose(); }
  });

  it("uses canonical living-work selection and identical actual geometry poses in independent late-arriving renderers", () => {
    const first = new ChorusGarden(new THREE.Scene()), late = new ChorusGarden(new THREE.Scene());
    const old = work({ id: "old", lastAt: "2026-11-07T09:00:00Z" });
    const archived = work({ id: "archive", lastAt: "2026-11-07T12:00:00Z", liveSources: [] });
    try {
      first.setWorks([old, archived, work()]); first.frame(1_800_000_000_000);
      late.setWorks([work({ liveSources: [...work().liveSources].reverse() }), archived, old]);
      late.frame(1_800_000_000_000);
      expect(late.state).toEqual(first.state);
      expect((late.root.getObjectByName("chorus-place-score") as THREE.InstancedMesh).instanceColor!.array)
        .toEqual((first.root.getObjectByName("chorus-place-score") as THREE.InstancedMesh).instanceColor!.array);
      const a = named(first.root, "chorus-paper-bird"), b = named(late.root, "chorus-paper-bird");
      expect(transforms(b)).toEqual(transforms(a));
      const before = transforms(b);
      late.frame(1_800_000_000_600);
      expect(transforms(b)).not.toEqual(before);
      // Viewer focus is explicitly local and never changes the active work,
      // its contributors, duet eligibility or sculptural source topology.
      late.focusWork("a"); late.frame(1_800_000_000_600);
      expect(late.state[0]).toMatchObject({ workId: "a", focused: true, sourceIds: ["a", "b"], duet: true });
    } finally { first.dispose(); late.dispose(); }
  });

  it("builds different spatial objects for the three combinations and keeps reduced-motion results intact", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      garden.setWorks([work(), work({ id: "stage", placeId: "stage", variant: "ensemble" }),
        work({ id: "reading", placeId: "reading", variant: "lantern" })]);
      garden.frame(1_800_000_000_000, true);
      expect(named(garden.root, "chorus-paper-bird")).toHaveLength(3);
      expect(named(garden.root, "chorus-beat-flower")).toHaveLength(2);
      expect(named(garden.root, "chorus-paper-lantern")).toHaveLength(1);
      expect(named(garden.root, "chorus-travelling-light")).toHaveLength(6);
      const objects = [...named(garden.root, "chorus-paper-bird"), ...named(garden.root, "chorus-beat-flower"), ...named(garden.root, "chorus-travelling-light")];
      const still = transforms(objects);
      garden.frame(1_800_000_007_000, true);
      expect(transforms(objects)).toEqual(still);
      garden.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++)
          expect([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)).toBe(true);
      });
    } finally { garden.dispose(); }
  });

  it("removes active geometry when the last source is ended, releases GPU resources, and cannot revive after disposal", () => {
    const scene = new THREE.Scene(), garden = new ChorusGarden(scene);
    garden.setWorks([work()]); garden.frame(1_800_000_000_000);
    const pendant = named(garden.root, "chorus-source-pendant")[0] as THREE.Mesh;
    let disposed = false; pendant.geometry.addEventListener("dispose", () => { disposed = true; });
    garden.setWorks([work({ liveSources: [], duet: false })]); garden.frame(1_800_000_003_000);
    expect(disposed).toBe(true);
    expect(named(garden.root, "chorus-source-pendant")).toHaveLength(0);
    expect(named(garden.root, "chorus-paper-bird")).toHaveLength(0);
    expect(garden.state.every(state => !state.workId && state.sourceIds.length === 0)).toBe(true);
    garden.dispose(); garden.setWorks([work()]); garden.frame(1_800_000_004_000);
    expect(scene.children).toHaveLength(0); expect(garden.state).toHaveLength(0);
  });

  it("selects a reachable sculpture through its actual mesh and cannot select a distant place", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      garden.setWorks([work()]); garden.frame(1_800_000_000_000);
      garden.root.updateMatrixWorld(true);
      const seed = garden.root.getObjectByName("chorus-garden-green")!.getObjectByName("chorus-seed")!;
      const target = seed.getWorldPosition(new THREE.Vector3());
      const origin = target.clone().add(new THREE.Vector3(0, -6, 3));
      const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize());
      expect(garden.pick(ray, { x: 1.8, z: 2.2 })).toMatchObject({ placeId: "green", workId: "a" });
      expect(garden.pick(ray, { x: 30, z: 0 })).toBeNull();
      const miss = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
      expect(garden.pick(miss, { x: 1.8, z: 2.2 })).toBeNull();
      garden.setWorks([]); garden.frame(1_800_000_000_000);
      garden.root.updateMatrixWorld(true);
      const dormant = garden.root.getObjectByName("chorus-garden-green")!.getObjectByName("chorus-seed")!;
      const dormantTarget = dormant.getWorldPosition(new THREE.Vector3());
      const dormantRay = new THREE.Raycaster(origin, dormantTarget.clone().sub(origin).normalize());
      expect(garden.pick(dormantRay, { x: 1.8, z: 2.2 })).toMatchObject({ placeId: "green", workId: null });
    } finally { garden.dispose(); }
  });

  it("blocks a real walking path through the sculptural bases and keeps them solid after the work is withdrawn", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      const boundary = garden.root.getObjectByName("chorus-stage-display")!;
      expect(new THREE.Box3().setFromObject(boundary).getSize(new THREE.Vector3()).length()).toBeGreaterThan(3);
      for (const center of [{ x: 0, z: 0 }, { x: 10, z: -9 }]) {
        const start = { x: center.x, z: center.z + 2.8, yaw: 0 };
        start.yaw = bearingToward(start, center);
        const attempted = moveOnPlanet(start, 1, 0, 4, (x, z) => garden.canStand(x, z));
        expect(attempted.blocked).toBe(true);
        expect(attempted.distance).toBeLessThan(2);
        expect(planetDistance(attempted.position, center)).toBeGreaterThan(.8);
      }
      garden.setWorks([work()]); garden.setWorks([work({ liveSources: [], duet: false })]);
      expect(garden.root.getObjectByName("chorus-stage-display")).toBe(boundary);
      expect(garden.canStand(0, 0)).toBe(false);
      expect(garden.canStand(10, -9)).toBe(false);
      expect(garden.canStand(-13, 11)).toBe(true);
      expect(garden.canStand(2, 2)).toBe(true);
    } finally { garden.dispose(); }
  });

  it("changes the whole gathering space for a real duet, keeps its canopy above walking heads, and withdraws it with the last source", () => {
    const garden = new ChorusGarden(new THREE.Scene());
    try {
      garden.setWorks([work({ duet: false })]); garden.frame(1_800_000_000_000);
      expect(named(garden.root, "chorus-shared-place")).toHaveLength(0);
      garden.setWorks([work()]); garden.frame(1_800_000_000_000);
      garden.root.updateMatrixWorld(true);
      const place = garden.root.getObjectByName("chorus-garden-green")!;
      const floor = garden.root.getObjectByName("chorus-place-score") as THREE.InstancedMesh;
      expect(floor).toBeInstanceOf(THREE.InstancedMesh);
      const inverse = place.matrixWorld.clone().invert(), vertex = new THREE.Vector3(), instance = new THREE.Matrix4();
      const floorBounds = new THREE.Box3();
      for (let i = 0; i < floor.count; i++) {
        floor.getMatrixAt(i, instance);
        const transform = inverse.clone().multiply(floor.matrixWorld).multiply(instance);
        const position = floor.geometry.getAttribute("position");
        for (let j = 0; j < position.count; j++) floorBounds.expandByPoint(vertex.fromBufferAttribute(position, j).applyMatrix4(transform));
      }
      expect(floorBounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(4.5);
      expect(floorBounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(4.5);
      const leaves = named(garden.root, "chorus-canopy-leaves") as THREE.InstancedMesh[];
      expect(leaves.length).toBeGreaterThan(0);
      for (const leaf of leaves) for (let i = 0; i < leaf.count; i++) {
        leaf.getMatrixAt(i, instance);
        const transform = inverse.clone().multiply(leaf.matrixWorld).multiply(instance), positions = leaf.geometry.getAttribute("position");
        for (let j = 0; j < positions.count; j++) {
          vertex.fromBufferAttribute(positions, j).applyMatrix4(transform);
          // Green's physical base is already guarded. Outside it, no new
          // opaque canopy leaf should pass through a standing player's head.
          if (Math.hypot(vertex.x, vertex.z) > 1.05) expect(vertex.y).toBeGreaterThan(2.1);
        }
      }
      let released = false; floor.addEventListener("dispose", () => { released = true; });
      garden.setWorks([work({ liveSources: [], duet: false })]);
      expect(released).toBe(true);
      expect(named(garden.root, "chorus-shared-place")).toHaveLength(0);
      expect(named(garden.root, "chorus-place-score")).toHaveLength(0);
    } finally { garden.dispose(); }
  });
});
