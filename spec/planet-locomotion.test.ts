import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PLANET_HALF, PLANET_RADIUS, planetDistance, planetPoint } from "../src/shared/planet.ts";
import { WALK_SPEED, RUN_SPEED, JUMP_APEX, JUMP_DURATION, jumpHeight, moveOnPlanet, bearingToward } from "../src/client/planet-locomotion.ts";
import { KangarooCompanion } from "../src/client/planet-wildlife.ts";

describe("playable spherical locomotion", () => {
    const start = { x: 1.8, z: 2.2, yaw: Math.PI };
    it("runs at a genuinely faster surface speed, without a diagonal boost", () => {
        const walk = moveOnPlanet(start, 1, 0, WALK_SPEED, () => true);
        const run = moveOnPlanet(start, 1, 0, RUN_SPEED * .5, () => true);
        expect(planetDistance(start, walk.position)).toBeCloseTo(WALK_SPEED, 8);
        expect(planetDistance(start, run.position) * 2 / planetDistance(start, walk.position)).toBeGreaterThan(1.65);
        const diagonal = moveOnPlanet(start, 1, 1, WALK_SPEED, () => true);
        expect(planetDistance(start, diagonal.position)).toBeCloseTo(WALK_SPEED, 8);
    });
    it("tests the ground every ten centimetres so running or jumping cannot tunnel through a shut door", () => {
        const calls: number[] = [];
        const move = moveOnPlanet({ x: 0, z: 0, yaw: 0 }, 1, 0, 2, (_x, z) => { calls.push(z); return z < .45 || z > .7; });
        expect(move.blocked).toBe(true);
        expect(move.position.z).toBeLessThan(.45);
        expect(move.distance).toBeCloseTo(.4, 8);
        expect(calls.length).toBeGreaterThan(1);
        // Vertical offset is intentionally absent from the admission callback.
        expect(Object.keys(move.position).sort()).toEqual(["x", "yaw", "z"]);
    });
    it("retains continuous travel and shortest-path bearing at seams and poles", () => {
        const seam = { x: PLANET_HALF - .3, z: 0, yaw: Math.PI / 2 };
        const target = { x: -PLANET_HALF + 1, z: 0 };
        expect(Math.sin(bearingToward(seam, target))).toBeCloseTo(1, 8);
        const end = moveOnPlanet(seam, 1, 0, 1, () => true).position;
        expect(end.x).toBeLessThan(0);
        expect(planetDistance(seam, end)).toBeCloseTo(1, 8);
        const pole = { x: 4, z: PLANET_HALF / 2 - .1, yaw: 0 };
        expect(planetDistance(pole, moveOnPlanet(pole, 1, 0, 1, () => true).position)).toBeCloseTo(1, 8);
    });
    it("has a bounded visible radial jump and lands exactly, independently of frame rate", () => {
        expect(jumpHeight(0)).toBe(0);
        expect(jumpHeight(JUMP_DURATION / 2)).toBeGreaterThan(.7);
        expect(jumpHeight(JUMP_DURATION / 2)).toBeCloseTo(JUMP_APEX, 10);
        const base = planetPoint(43, -18), top = planetPoint(43, -18, jumpHeight(JUMP_DURATION / 2));
        expect(Math.hypot(top.x, top.y, top.z) - Math.hypot(base.x, base.y, base.z)).toBeCloseTo(JUMP_APEX, 10);
        expect(JUMP_APEX).toBeLessThanOrEqual(1.4);
        for (const t of [JUMP_DURATION, 1, 40, NaN, Infinity, -1]) expect(jumpHeight(t)).toBe(0);
        for (let t = 0; t < JUMP_DURATION; t += .011) expect(jumpHeight(t)).toBeGreaterThanOrEqual(0);
        expect(Math.hypot(base.x, base.y, base.z)).toBeCloseTo(PLANET_RADIUS, 8);
    });
    it("ignores invalid motion instead of introducing NaNs", () => {
        for (const distance of [NaN, Infinity, -2]) expect(moveOnPlanet(start, 1, 0, distance, () => true).position).toEqual(start);
    });
});

describe("the interactive kangaroo companion", () => {
    it("is an original solid rig with paired ears, planted hind paws and a tail", () => {
        const roo = new KangarooCompanion();
        roo.figure.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(roo.figure, true), size = box.getSize(new THREE.Vector3());
        expect(box.min.y).toBeCloseTo(0, 8);
        expect(size.y).toBeGreaterThan(1.8);
        expect(size.z).toBeGreaterThan(.7);
        expect(roo.figure.getObjectByName("kangaroo-tail")).toBeInstanceOf(THREE.Mesh);
        let paws = 0, ears = 0, triangles = 0;
        roo.figure.traverse(o => {
            expect(o).not.toBeInstanceOf(THREE.Sprite);
            if (o.name === "kangaroo-hind-paw") paws++;
            if (o.name === "kangaroo-ear") ears++;
            if (o instanceof THREE.Mesh) {
                triangles += (o.geometry.index?.count ?? 0) / 3;
                expect((o.material as THREE.MeshStandardMaterial).roughness).toBeGreaterThan(.9);
            }
        });
        expect(paws).toBe(2); expect(ears).toBe(2); expect(triangles).toBeLessThan(8000);
        roo.dispose();
    });
    it("requires an explicit nearby invitation and actually follows along the sphere", () => {
        const roo = new KangarooCompanion(), home = { ...roo.at };
        expect(roo.interact({ x: 40, z: 0, yaw: 0 })).toBeNull();
        expect(roo.phase).toBe("resting");
        expect(roo.interact({ ...home, x: home.x + 1 })).toContain("coming along");
        const visitor = { x: home.x + 7, z: home.z, yaw: 0 };
        for (let i = 0; i < 30; i++) roo.frame(.05, visitor, 0, () => true, false);
        expect(planetDistance(home, roo.at)).toBeGreaterThan(3);
        expect(planetDistance(visitor, roo.at)).toBeGreaterThanOrEqual(2.09);
        expect(planetDistance(visitor, roo.at)).toBeLessThan(3.2);
        roo.dispose();
    });
    it("hops visibly when invited to play and can be asked to rest", () => {
        const roo = new KangarooCompanion(), visitor = { ...roo.at };
        roo.interact(visitor); roo.interact(visitor);
        expect(roo.phase).toBe("playing");
        roo.frame(.1, visitor, 0, () => true, false);
        expect(roo.height).toBeGreaterThan(.2);
        expect(roo.interact(visitor)).toContain("rest");
        expect(roo.phase).toBe("resting");
        for (let i = 0; i < 15; i++) roo.frame(.05, visitor, 0, () => true, false);
        expect(roo.height).toBe(0);
        roo.dispose();
    });
    it("mirrors a nearby jump, respects obstacles and never teleports to a distant visitor", () => {
        const roo = new KangarooCompanion(), home = { ...roo.at };
        roo.interact(home);
        for (let i = 0; i < 15; i++) roo.frame(.05, home, 0, () => true, false);
        roo.frame(.05, home, .5, () => true, false);
        roo.frame(.1, home, .7, () => true, false);
        expect(roo.height).toBeGreaterThan(.2);
        roo.frame(.05, { ...home, x: home.x + 10 }, 0, () => false, false);
        expect(planetDistance(roo.at, home)).toBeLessThan(1e-8);
        roo.frame(.05, { x: 50, z: 0, yaw: 0 }, 0, () => true, false);
        expect(planetDistance(roo.at, home)).toBeLessThan(1e-8);
        roo.dispose();
    });
    it("still offers rest after the short hopping game has finished", () => {
        const roo = new KangarooCompanion(), visitor = { ...roo.at };
        roo.interact(visitor); roo.interact(visitor);
        for (let i = 0; i < 60; i++) roo.frame(.05, visitor, 0, () => true, true);
        expect(roo.phase).toBe("following");
        expect(roo.action).toContain("rest");
        expect(roo.interact(visitor)).toContain("rest");
        expect(roo.phase).toBe("resting");
        roo.dispose();
    });
});
