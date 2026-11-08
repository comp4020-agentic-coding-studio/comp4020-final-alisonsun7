import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnimalFigure } from "../src/client/characters.ts";
import { PLANET_HALF, PLANET_RADIUS as R, PLANET_PLACES, planetBasis, planetNormal, planetPoint } from "../src/shared/planet.ts";
import { supportedPlanetFrame, type PlanetSupport } from "../src/client/planet-support.ts";
import type { PlanetBuild } from "../src/client/planet-build.ts";

// Optional frozen pre-change build is a physical negative control. Only canvas
// text rasterisation is stubbed; meshes, transforms, soles and rays are real.
const { buildPlanet } = await import(process.env.PLANET_SUPPORT_BUILD_UNDER_TEST ?? "../src/client/planet-build.ts");
const vector = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const coordinates = (p: THREE.Vector3) => ({ x: Math.atan2(p.x, p.z) * R, z: -Math.asin(p.y / p.length()) * R });
const atLocal = (center: { x: number; z: number }, x: number, z: number) => {
    const basis = planetBasis(center.x, center.z);
    return coordinates(vector(planetPoint(center.x, center.z)).addScaledVector(vector(basis.east), x).addScaledVector(vector(basis.south), z));
};

describe("physical support on a small curved world", () => {
    let world: PlanetBuild;
    let ground: THREE.Mesh[], floors: THREE.Mesh[];
    const objects = (predicate: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] => {
        const result: THREE.Mesh[] = [];world.root.traverse(object => { if (object instanceof THREE.Mesh && predicate(object)) result.push(object); });return result;
    };
    beforeAll(() => {
        vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) });
        world = buildPlanet();world.root.updateMatrixWorld(true);
        ground = objects(object => object.geometry.userData.surfacePatch || object.geometry.userData.continuousRoad || object.name === "soundfolk-beach" || object.geometry instanceof THREE.SphereGeometry && object.geometry.parameters.radius === R);
        floors = objects(object => {
            if (object.userData.supportSurface) return true;
            // Legacy actual floors are retained for the frozen negative control.
            if (object.name === "cafe-terrace-floor" || object.name === "washroom-tiled-floor" || object.name === "shower-tray") return true;
            if (object.geometry instanceof THREE.BoxGeometry) {
                const p = object.geometry.parameters;
                return p.width === 5 && p.height === .18 && p.depth === 4.4 || p.width === 3.1 && p.height === .15 && p.depth === 3.1;
            }
            if (object.geometry instanceof THREE.CylinderGeometry) {
                const p = object.geometry.parameters;return p.radiusTop === 3.1 && p.height === .22 || p.radiusTop === 2.4 && p.height === .25;
            }
            return false;
        });
    });
    afterAll(() => { world.dispose();vi.unstubAllGlobals(); });

    it("puts both actual standing shoe soles on the highest visible cafe, stage, tile and shower floor", () => {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!, stage = PLANET_PLACES.find(place => place.kind === "stage")!;
        const samples = [atLocal(cafe, 0, 0), atLocal(cafe, 4.5, 2.3), atLocal(cafe, 0, 4.4), atLocal(stage, 1.7, .5),
            atLocal({ x: 13.5, z: 5.5 }, .3, .3), atLocal({ x: 18, z: 5.5 }, -.37, -.58)];
        for (const sample of samples) {
            const radial = vector(planetNormal(sample.x, sample.z)), origin = vector(planetPoint(sample.x, sample.z, 3));
            const hit = new THREE.Raycaster(origin, radial.clone().negate()).intersectObjects(floors, false)[0];expect(hit).toBeDefined();
            const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
            const hasSupport = typeof world.supportAt === "function";
            const support: PlanetSupport = hasSupport ? world.supportAt(sample.x, sample.z) : { height: world.heightAt(sample.x, sample.z), normal: planetNormal(sample.x, sample.z), kind: "floor", id: "legacy" };
            const figure = new AnimalFigure({ avatar: "cat", seed: "physical-contact", pose: "stand", role: "player" });
            figure.setMotion(0, false);figure.position.copy(vector(planetPoint(sample.x, sample.z, support.height)));
            figure.quaternion.copy(supportedPlanetFrame(sample.x, sample.z, .7, support.normal));figure.updateMatrixWorld(true);
            expect(Math.abs(figure.position.clone().sub(hit.point).dot(normal)), `feet origin on ${hit.object.name}`).toBeLessThan(.001);
            for (const name of ["left-shoe", "right-shoe"]) {
                const shoe = figure.getObjectByName(name) as THREE.Mesh, positions = shoe.geometry.getAttribute("position");let soleVertices = 0;
                for (let i = 0; i < positions.count; i++) if (positions.getY(i) < -.0439) {
                    const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(shoe.matrixWorld);
                    expect(Math.abs(point.sub(hit.point).dot(normal)), `${name} on ${hit.object.name}`).toBeLessThan(.001);soleVertices++;
                }
                expect(soleVertices).toBeGreaterThan(20);
            }
        }
    });

    it("grounds every bench leg and lantern post at all four real corners, rather than only its origin", () => {
        const feet = objects(object => {
            if (!(object.geometry instanceof THREE.BoxGeometry)) return false;
            const p = object.geometry.parameters;return p.width === .1 && p.depth === .44 || p.width === .14 && p.depth === .14;
        });
        expect(feet.length).toBeGreaterThan(25);
        for (const foot of feet) {
            const p = (foot.geometry as THREE.BoxGeometry).parameters, up = new THREE.Vector3().setFromMatrixColumn(foot.matrixWorld, 1).normalize();
            const gaps: number[] = [];
            for (const x of [-p.width / 2, p.width / 2]) for (const z of [-p.depth / 2, p.depth / 2]) {
                const corner = new THREE.Vector3(x, -p.height / 2, z).applyMatrix4(foot.matrixWorld);
                const hit = new THREE.Raycaster(corner.clone().addScaledVector(up, .75), up.clone().negate(), 0, 3).intersectObjects([...ground, ...floors], false)[0];
                expect(hit).toBeDefined();
                const gap = hit.distance - .75;
                expect(gap, `${foot.name} corner must not float`).toBeLessThan(.002);
                gaps.push(gap);
            }
            // The stage's existing rim post straddles a steep bevel: its inner
            // corners legitimately enter the plinth. At least one outer corner
            // must meet real ground, so simply burying the whole prop fails.
            expect(Math.max(...gaps), `${foot.name} actually meets a support triangle`).toBeGreaterThan(-.002);
        }
    });

    it("physically closes wide deck edges all the way down to the curved earth", () => {
        const foundations = objects(object => object.geometry.userData.groundFoundation);
        expect(foundations.length).toBeGreaterThanOrEqual(12);
        for (const foundation of foundations) {
            const positions = foundation.geometry.getAttribute("position");expect(positions.count % 2).toBe(0);
            expect(foundation.geometry.index!.count / 3).toBe(positions.count);
            for (let i = 1; i < positions.count; i += 2) {
                const base = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(foundation.matrixWorld);
                expect(base.length(), `${foundation.name} bottom joins the actual ground`).toBeLessThanOrEqual(R - .015);
            }
            // A side-on ray must hit the actual skirt in the middle of the
            // former gap; a name, texture or contact shadow cannot pass this.
            const a = new THREE.Vector3().fromBufferAttribute(positions, 0), b = new THREE.Vector3().fromBufferAttribute(positions, 2);
            const lowA = new THREE.Vector3().fromBufferAttribute(positions, 1), lowB = new THREE.Vector3().fromBufferAttribute(positions, 3);
            const point = a.clone().add(b).add(lowA).add(lowB).multiplyScalar(.25).applyMatrix4(foundation.matrixWorld);
            const edge = b.clone().sub(a).transformDirection(foundation.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(foundation.matrixWorld);
            const outward = edge.cross(up).normalize();
            const hit = new THREE.Raycaster(point.clone().addScaledVector(outward, .4), outward.clone().negate(), 0, .8).intersectObject(foundation, false)[0];
            expect(hit, `${foundation.name} is an opaque physical side`).toBeDefined();
            expect(hit.distance).toBeCloseTo(.4, 3);
        }
    });

    it("places the actual cafe furniture feet on the room or terrace top instead of burying them below it", () => {
        const feet = objects(object => {
            if (!(object.geometry instanceof THREE.BoxGeometry)) return false;
            let parent: THREE.Object3D | null = object;
            while (parent && parent.name !== "cafe-company-table") parent = parent.parent;
            const p = object.geometry.parameters;
            return !!parent && (p.width === .12 && p.depth === .12 || p.width === .045 && p.depth === .045);
        });
        // This exact table/chair inventory is an established venue, not new NPCs.
        expect(feet).toHaveLength(54);
        for (const foot of feet) {
            foot.geometry.computeBoundingBox();const base = new THREE.Vector3(0, foot.geometry.boundingBox!.min.y, 0).applyMatrix4(foot.matrixWorld);
            const up = new THREE.Vector3().setFromMatrixColumn(foot.matrixWorld, 1).normalize();
            const hit = new THREE.Raycaster(base.clone().addScaledVector(up, .5), up.clone().negate()).intersectObjects(floors, false)[0];
            expect(hit).toBeDefined();expect(Math.abs(hit.distance - .5), foot.name).toBeLessThan(.001);
        }
        expect(world.contactAnchors.length).toBeGreaterThan(80);
        expect(new Set(world.contactAnchors.map(anchor => anchor.id)).size).toBe(world.contactAnchors.length);
    });

    it("keeps the antipodal shore outside remote floors and retains the original authoritative room walls and locks", () => {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!, far = { x: cafe.x + PLANET_HALF, z: -cafe.z };
        const height = world.heightAt(far.x, far.z);
        expect(height).toBeGreaterThanOrEqual(0);expect(height).toBeLessThanOrEqual(.065);expect(world.inside(far.x, far.z)).toBe(false);
        expect(world.canStand(far.x, far.z, new Set())).toBe(true);
        const wall = atLocal(cafe, 3.6, 0);expect(world.canStand(wall.x, wall.z, new Set())).toBe(false);
        expect(world.canStand(13.5, 5.5, new Set(["planet-toilet"]))).toBe(false);
        expect(world.canStand(13.5, 5.5, new Set(["planet-toilet"]), "planet-toilet")).toBe(true);
    });

    it("lets the central cafe entrance walk down actual supported treads to the unchanged ground", () => {
        const cafe = PLANET_PLACES.find(place => place.kind === "tea")!, steps = objects(object => /^cafe-entrance-step-\d+$/.test(object.name));
        expect(steps).toHaveLength(5);
        const encountered = new Set<string>();let lastHeight: number | undefined;
        for (let z = 4.55; z <= 6.4; z += .015) {
            const point = atLocal(cafe, 0, z);expect(world.canStand(point.x, point.z, new Set())).toBe(true);
            const support = world.supportAt(point.x, point.z), origin = vector(planetPoint(point.x, point.z, 3));
            // Riser faces are crossed by automatic stepping; a real horizontal
            // tread must exist on every ray, not just a vertical box side.
            const hit = new THREE.Raycaster(origin, vector(planetNormal(point.x, point.z)).negate()).intersectObjects([...ground, ...floors], false)
                .find(hit => ground.includes(hit.object as THREE.Mesh) || (hit.face?.normal.y ?? 0) > .99);
            expect(hit).toBeDefined();
            if(!hit)throw new Error(`No visible entrance tread at z=${z}`);
            expect(Math.abs(R + support.height - hit.point.length()), `entrance z=${z}, support=${support.id}, visible=${hit.object.name}`).toBeLessThan(support.kind === "ground" ? .012 : .001);
            if (lastHeight !== undefined) expect(Math.abs(support.height - lastHeight)).toBeLessThan(.25);
            lastHeight = support.height;
            if (support.id.startsWith("cafe-entrance-step-")) encountered.add(support.id);
        }
        expect(encountered.size).toBe(5);
    });

    it("gives the stage sails, reading canopy, conservatory arches and cafe parasols real supporting posts", () => {
        const extensions = objects(object => /^(stage-sail-foot-|reading-canopy-foot-|conservatory-arch-foot-)/.test(object.name));
        expect(extensions).toHaveLength(12);
        for (const foot of extensions) {
            const p = (foot.geometry as THREE.CylinderGeometry).parameters, up = new THREE.Vector3().setFromMatrixColumn(foot.matrixWorld, 1).normalize();
            let closest = -Infinity;
            for (let i = 0; i < 12; i++) {
                const angle = i / 12 * Math.PI * 2, corner = new THREE.Vector3(Math.sin(angle) * p.radiusBottom, -p.height / 2, Math.cos(angle) * p.radiusBottom).applyMatrix4(foot.matrixWorld);
                const hit = new THREE.Raycaster(corner.clone().addScaledVector(up, .5), up.clone().negate()).intersectObjects(ground, false)[0];
                expect(hit).toBeDefined();expect(hit.distance - .5, `${foot.name} rim does not float`).toBeLessThan(.002);closest = Math.max(closest, hit.distance - .5);
            }
            expect(closest).toBeGreaterThan(-.002);
        }
        const parasols = objects(object => object.name === "cafe-canopy-ground-post");expect(parasols).toHaveLength(2);
        for (const foot of parasols) {
            foot.geometry.computeBoundingBox();const base = new THREE.Vector3(0, foot.geometry.boundingBox!.min.y, 0).applyMatrix4(foot.matrixWorld);
            const up = new THREE.Vector3().setFromMatrixColumn(foot.matrixWorld, 1).normalize();
            const hit = new THREE.Raycaster(base.clone().addScaledVector(up, .5), up.clone().negate()).intersectObjects(floors, false)[0];
            expect(Math.abs(hit.distance - .5)).toBeLessThan(.001);
        }
    });

    it("lets low-opacity glass transmit shadow light while its opaque structure still casts", () => {
        const glass = objects(object => { const material = object.material as THREE.Material;return material.transparent && material.opacity < .65 && material instanceof THREE.MeshStandardMaterial; });
        expect(glass.length).toBeGreaterThan(10);expect(glass.every(object => !object.castShadow)).toBe(true);
        expect(objects(object => object.name === "bench-ground-leg").every(object => object.castShadow)).toBe(true);
    });
});
