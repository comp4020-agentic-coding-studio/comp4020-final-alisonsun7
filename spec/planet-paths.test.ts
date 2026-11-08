import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANET_HALF, PLANET_RADIUS as R, planetPoint } from "../src/shared/planet.ts";

// A frozen pre-change build can exercise the same rendered geometry checks.
// Only sign rasterisation is stubbed; all sphere, paths and collisions are real.
const { buildPlanet } = await import(process.env.PLANET_BUILD_UNDER_TEST ?? "../src/client/planet-build.ts");
describe("continuous ground paths around the tide pool", () => {
    let scene: ReturnType<typeof buildPlanet>, roads: THREE.Mesh[];
    const ray = new THREE.Raycaster();
    const at = (x: number, z: number): THREE.Intersection[] => {
        const p = planetPoint(x, z, 1), origin = new THREE.Vector3(p.x, p.y, p.z);
        ray.set(origin, origin.clone().normalize().negate()); return ray.intersectObjects(roads, false);
    };
    beforeEach(() => {
        vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) });
        scene = buildPlanet(); roads = [];
        scene.root.traverse((object: THREE.Object3D) => {
            if (object instanceof THREE.Mesh && ["around-the-world-promenade", "village-path"].includes(object.name)) roads.push(object);
        });
        scene.root.updateMatrixWorld(true);
    });
    afterEach(() => { scene.dispose(); vi.unstubAllGlobals(); });

    it("uses one bounded mesh for the road network and joins branches without overlapping road faces", () => {
        expect(roads).toHaveLength(1);
        const geometry = roads[0].geometry;
        expect(geometry.getAttribute("position").count).toBeLessThan(18_000);
        expect(geometry.index!.count / 3).toBeLessThan(26_000);
        // The explicit branch join lies on one surface, not independently
        // coloured ribbons competing for the same depth.
        expect(at(14, 10)).toHaveLength(1);
        expect(at(-9, -3.7)).toHaveLength(1);
    });

    it("keeps the promenade and the curved pool-bank approach continuously covered", () => {
        for (let i = 0; i < 140; i++) {
            const x = -PLANET_HALF + (i + .13) / 140 * PLANET_HALF * 2;
            const z = 1.2 * Math.sin((x + PLANET_HALF) / (PLANET_HALF * 2) * Math.PI * 4);
            expect(at(x, z).length, `promenade at ${x}`).toBeGreaterThan(0);
        }
        const bank = new THREE.CatmullRomCurve3([[14, 10], [12, 11], [11.2, 13.6], [12.3, 16.6], [14, 18]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
        for (const p of bank.getPoints(70)) expect(at(p.x, p.z).length, `pool bank at ${p.x},${p.z}`).toBeGreaterThan(0);
    });

    it("leaves the pool and its open sea channel free of floating road, without relocating or blocking historical points", () => {
        for (const p of [{ x: 16, z: 14 }, { x: 16.5, z: 15 }, { x: 16, z: 18 }]) {
            expect(at(p.x, p.z), `open water at ${p.x},${p.z}`).toHaveLength(0);
            expect(scene.canStand(p.x, p.z, new Set())).toBe(true);
        }
        expect(at(11.2, 13.6).length).toBeGreaterThan(0);
        expect(at(21.1, 15.4).length).toBeGreaterThan(0);
    });

    it("subdivides both directions over the sphere, with outward normals and an actual coloured shoulder", () => {
        const geometry = roads[0].geometry, positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), colours = geometry.getAttribute("color");
        expect(colours).toBeDefined();
        let darkest = Infinity, lightest = -Infinity;
        for (let i = 0; i < positions.count; i++) {
            const radius = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
            expect(radius).toBeCloseTo(R + .065, 4);
            expect(positions.getX(i) * normals.getX(i) + positions.getY(i) * normals.getY(i) + positions.getZ(i) * normals.getZ(i)).toBeGreaterThan(R);
            darkest = Math.min(darkest, colours.getX(i)); lightest = Math.max(lightest, colours.getX(i));
        }
        expect(lightest - darkest).toBeGreaterThan(.1);
        const indices = geometry.index!, center = new THREE.Vector3(), p = new THREE.Vector3();
        for (let i = 0; i < indices.count; i += 3) {
            center.set(0, 0, 0);
            for (let j = 0; j < 3; j++) center.add(p.fromBufferAttribute(positions, indices.getX(i + j)));
            expect(center.multiplyScalar(1 / 3).length()).toBeGreaterThan(R + .06);
        }
    });

    it("meets the exact longitude seam at matching heights on both sides", () => {
        const west = at(-PLANET_HALF + .001, 0)[0], east = at(PLANET_HALF - .001, 0)[0];
        expect(west).toBeDefined(); expect(east).toBeDefined();
        expect(west.distance).toBeCloseTo(east.distance, 5);
        expect(west.point.distanceTo(east.point)).toBeLessThan(.003);
    });
});
