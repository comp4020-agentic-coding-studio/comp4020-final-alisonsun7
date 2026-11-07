import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ChorusGarden } from "../src/client/chorus-garden.ts";
import type { ChorusWork } from "../src/shared/chorus.ts";
import type { SoundReference } from "../src/shared/protocol.ts";
import { bearingToward, moveOnPlanet } from "../src/client/planet-locomotion.ts";
import { planetDistance } from "../src/shared/planet.ts";

const source = (id: string, soundId: string, byId = "person-a"): SoundReference => ({
  id, soundId, byId, by: byId, at: `2026-11-07T10:00:0${id === "a" ? 0 : 1}Z`, x: 1, z: 1,
});
function work(overrides: Partial<ChorusWork> = {}): ChorusWork {
  const sounds = [source("a", "trickle"), source("b", "evening-forest", "person-b")];
  return { id: "a", placeId: "green", x: 1, z: 1, title: "Watersong canopy", variant: "habitat", duet: true,
    sources: sounds, liveSources: sounds, contributors: [{ id: "person-a", name: "Ada" }, { id: "person-b", name: "Bo" }],
    at: sounds[0].at, lastAt: sounds[1].at, ...overrides };
}
const named = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const list: THREE.Object3D[] = []; root.traverse(object => { if (object.name === name) list.push(object); }); return list;
};
const transforms = (objects: THREE.Object3D[]): number[][] => objects.map(object => [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)] as number[]);

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
});
