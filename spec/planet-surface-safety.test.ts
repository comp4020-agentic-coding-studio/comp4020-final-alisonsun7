import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PLANET_HALF as HALF, PLANET_RADIUS as R, PLANET_PLACES, planetBasis, planetNormal, planetPoint, planetStep } from "../src/shared/planet.ts";
import { coastlineAt } from "../src/client/planet-coast.ts";
import { frontPlanetLocal, raisedPlanetFloorHeight } from "../src/client/planet-surface-safety.ts";

// Select an actual frozen pre-fix build for the negative control. No server,
// database, canvas renderer or substitute world state is required.
const { buildPlanet } = await import(process.env.PLANET_BUILD_UNDER_TEST ?? "../src/client/planet-build.ts");
const antipode = (point: { x: number; z: number }) => ({ x: point.x > 0 ? point.x - HALF : point.x + HALF, z: -point.z });
describe("the actual ground and camera on the far shore", () => {
    let scene: ReturnType<typeof buildPlanet>;
    beforeAll(() => {
        vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) });
        scene = buildPlanet();scene.root.updateMatrixWorld(true);
    });
    afterAll(() => { scene.dispose();vi.unstubAllGlobals(); });

    it("keeps the cafe's walkable antipodal shore on this hemisphere instead of a negative remote floor", () => {
        const point = antipode(PLANET_PLACES.find(place => place.kind === "tea")!);
        expect(point).toEqual({ x: HALF - 9, z: 7 });
        expect(scene.canStand(point.x, point.z, new Set())).toBe(true);
        expect(scene.inside(point.x, point.z)).toBe(false);
        // This shore has real raised sand now. A valid ground layer must not
        // be confused with the remote cafe's negative tangent-plane floor.
        expect(scene.heightAt(point.x, point.z)).toBeGreaterThanOrEqual(0);
        expect(scene.heightAt(point.x, point.z)).toBeLessThanOrEqual(.065);
        const feet = planetPoint(point.x, point.z, scene.heightAt(point.x, point.z)), up = planetNormal(point.x, point.z);
        expect(feet.x * up.x + feet.y * up.y + feet.z * up.z).toBeCloseTo(R + scene.heightAt(point.x, point.z), 8);
    });

    it("removes phantom building walls at antipodes while retaining actual cafe walls and floor clearance", () => {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!, far = antipode(cafe);
        const offset = (center: { x: number; z: number }, x: number, z: number) => planetStep({ ...center, yaw: Math.atan2(x, z) }, 1, 0, R * Math.asin(Math.hypot(x, z) / R));
        for (const side of [-1, 1]) {
            const phantomWall = offset(far, side * 3.6, 0), actualWall = offset(cafe, side * 3.6, 0);
            expect(scene.canStand(phantomWall.x, phantomWall.z, new Set())).toBe(true);
            expect(scene.inside(phantomWall.x, phantomWall.z)).toBe(false);
            expect(scene.heightAt(phantomWall.x, phantomWall.z)).toBeGreaterThanOrEqual(0);
            expect(scene.heightAt(phantomWall.x, phantomWall.z)).toBeLessThanOrEqual(.065);
            expect(scene.canStand(actualWall.x, actualWall.z, new Set())).toBe(false);
        }
        const floor = scene.root.getObjectByName("cafe-terrace-floor")!;
        const floors: THREE.Object3D[] = [];
        scene.root.traverse((object: THREE.Object3D) => { if (object.userData.supportSurface) floors.push(object); });
        if (!floors.length) floors.push(floor);
        for (const [x, z] of [[0, 0], [3, 1], [-3, 1], [4.5, 2.3]]) {
            const p = offset(cafe, x, z), origin = planetPoint(p.x, p.z, 3);
            const o = new THREE.Vector3(origin.x, origin.y, origin.z);
            const hit = new THREE.Raycaster(o, o.clone().normalize().negate()).intersectObjects(floors, false)[0];
            expect(hit, "An actual terrace triangle must support the existing raised walking surface").toBeDefined();
            const clearance = R + scene.heightAt(p.x, p.z) - hit.point.length();
            expect(Math.abs(clearance)).toBeLessThan(.001);
        }
    });

    it("has no negative or non-finite floor anywhere along the walkable coast, seam or either pole", () => {
        let checked = 0;
        for (let x = -HALF; x <= HALF; x += .25) for (const inset of [.25, .75, 2]) {
            const z = coastlineAt(x) - inset;
            if (!scene.canStand(x, z, new Set())) continue;
            const height = scene.heightAt(x, z);
            expect(Number.isFinite(height), `finite coast ${x},${z}`).toBe(true);
            expect(height, `nonnegative coast ${x},${z}`).toBeGreaterThanOrEqual(0);checked++;
        }
        expect(checked).toBeGreaterThan(1500);
        for (const x of [-HALF, -1, 0, HALF]) for (const z of [-HALF / 2, -HALF / 2 + .001, HALF / 2 - .001, HALF / 2])
            expect(scene.heightAt(x, z)).toBe(0);
    });

    it("keeps first/third person and their entire near-plane envelope outside the globe across legal view settings", () => {
        const points = [];
        for (let x = -HALF; x <= HALF; x += 3) points.push({ x, z: coastlineAt(x) - .25 });
        points.push({ x: 0, z: -HALF / 2 }, { x: HALF, z: -HALF / 2 + .001 });
        let views = 0;
        for (const point of points) {
            const basis = planetBasis(point.x, point.z), p = planetPoint(point.x, point.z, scene.heightAt(point.x, point.z));
            const up = new THREE.Vector3(basis.up.x, basis.up.y, basis.up.z), feet = new THREE.Vector3(p.x, p.y, p.z);
            for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const pitch of [-.5, .12, .8]) {
                const heading = new THREE.Vector3(basis.south.x, basis.south.y, basis.south.z).multiplyScalar(Math.cos(yaw))
                    .addScaledVector(new THREE.Vector3(basis.east.x, basis.east.y, basis.east.z), Math.sin(yaw));
                const head = feet.clone().addScaledVector(up, 1.45);
                // First person is exactly the head. Third-person collision
                // shortening stays on this outward segment, so test both
                // the shortest permitted endpoint and each zoom endpoint.
                for (const zoom of [4.2, 8, 28]) {
                    const arm = heading.clone().multiplyScalar(-zoom).addScaledVector(up, zoom * .82 + pitch * 5);
                    const length = arm.length(), direction = arm.normalize();
                    for (const distance of [0, .55, length]) for (const [width, height] of [[1920, 1080], [390, 844]]) {
                        const camera = head.clone().addScaledVector(direction, distance), fov = width / height < .8 ? 72 : 68;
                        // A bounding sphere around the entire near plane is
                        // stronger than a center-point test and independent
                        // of camera look direction, including the overview.
                        const nearEnvelope = .1 * Math.sqrt(1 + Math.tan(fov * Math.PI / 360) ** 2 * (1 + (width / height) ** 2));
                        expect(camera.length() - nearEnvelope, `view ${point.x},${point.z},${yaw},${pitch},${zoom},${distance}`).toBeGreaterThan(R + .1);views++;
                    }
                }
            }
        }
        expect(views).toBeGreaterThan(10_000);
    });

    it("identifies front-hemisphere local frames across longitude's seam and polar orientation", () => {
        for (const center of [{ x: HALF - .05, z: 0 }, { x: 2, z: -HALF / 2 + .01 }, { x: -3, z: HALF / 2 - .01 }]) {
            const close = planetStep({ ...center, yaw: .9 }, 1, 0, .5);
            expect(frontPlanetLocal(close, center)?.facing).toBeCloseTo(Math.cos(.5 / R), 8);
            expect(raisedPlanetFloorHeight(close, center, .16)).toBeGreaterThan(.16);
            expect(frontPlanetLocal(antipode(center), center)).toBeNull();
            expect(raisedPlanetFloorHeight(antipode(center), center, .16)).toBeNull();
        }
        expect(frontPlanetLocal({ x: NaN, z: 0 }, { x: 0, z: 0 })).toBeNull();
        expect(raisedPlanetFloorHeight({ x: 0, z: 0 }, { x: 0, z: 0 }, -1)).toBeNull();
    });
});
