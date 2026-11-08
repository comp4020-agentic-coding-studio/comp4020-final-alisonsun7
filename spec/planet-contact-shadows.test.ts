import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanetContactShadows, contactStrength, type PlanetActorContact } from "../src/client/planet-contact-shadows.ts";
import { PlanetSupportSurfaces, type PlanetSupport, type PlanetContactAnchor } from "../src/client/planet-support.ts";
import { onPlanet } from "../src/client/planet-build.ts";
import { PLANET_RADIUS, planetBasis, planetNormal, planetPoint } from "../src/shared/planet.ts";

const at = (changes: Partial<PlanetActorContact> = {}): PlanetActorContact => ({ x: -9, z: -7, yaw: .7, air: 0, ...changes });
const vector = (v: {x:number;y:number;z:number}): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z);
const canonical = (p: THREE.Vector3): {x:number;z:number} => { const n = p.clone().normalize();return { x: Math.atan2(n.x, n.z) * PLANET_RADIUS, z: -Math.asin(n.y) * PLANET_RADIUS }; };
const ground = (x: number, z: number): PlanetSupport => ({ height: 0, normal: planetNormal(x, z), kind: "ground", id: "actual-sphere" });
const batch = (shade: PlanetContactShadows, name = "moving-feet-contact-shade"): THREE.InstancedMesh => shade.root.getObjectByName(name) as THREE.InstancedMesh;
const matrixAt = (mesh: THREE.InstancedMesh, index = 0): THREE.Matrix4 => { const m = new THREE.Matrix4();mesh.getMatrixAt(index, m);return m; };
const positionAt = (mesh: THREE.InstancedMesh, index = 0): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(matrixAt(mesh, index));
const weight = (mesh: THREE.InstancedMesh, index = 0): number => mesh.geometry.getAttribute("contactWeight").getX(index);

describe("contact shade follows actual support and stays bounded", () => {
    let shade: PlanetContactShadows | undefined;
    const resources: {dispose(): void}[] = [];
    beforeEach(() => {
        // Only rasterisation is stubbed. The production gradient API exists;
        // actual Three meshes, instance matrices, floor queries and materials
        // remain unmocked. This is not a WebGL shader compilation check.
        const gradient = { addColorStop: vi.fn() };
        vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({
            createRadialGradient: vi.fn(() => gradient), fillRect: vi.fn(), fillStyle: "",
        }) }) });
    });
    afterEach(() => { shade?.dispose();shade = undefined;for (const resource of resources.splice(0)) resource.dispose();vi.unstubAllGlobals(); });

    it("puts actual instance planes on the transformed flat floor rather than radial gravity", () => {
        const group = new THREE.Group();onPlanet(group, -9, -7);
        const geometry = new THREE.BoxGeometry(6, .2, 5), material = new THREE.MeshBasicMaterial();resources.push(geometry, material);
        const floor = new THREE.Mesh(geometry, material);floor.position.y = .2;group.add(floor);group.updateMatrixWorld(true);
        const surfaces = new PlanetSupportSurfaces();surfaces.add(floor, "cafe-floor");surfaces.refresh();
        const supportAt = (x: number, z: number) => surfaces.at(x, z, ground(x, z));
        const actualTop = new THREE.Vector3(2.1, .1, 1.1).applyMatrix4(floor.matrixWorld);
        const floorNormal = new THREE.Vector3(0, 1, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(floor.matrixWorld)).normalize();
        const coords = canonical(actualTop), support = supportAt(coords.x, coords.z);
        expect(support.id).toBe("cafe-floor");
        expect(vector(planetNormal(coords.x, coords.z)).distanceTo(floorNormal)).toBeGreaterThan(.05);
        const anchors: PlanetContactAnchor[] = [{ id: "actual-table-foot", point: actualTop.clone(), normal: floorNormal.clone(), rx: .2, rz: .3, yaw: .6 }];
        const original = JSON.stringify(anchors);
        shade = new PlanetContactShadows(anchors, undefined, supportAt);
        shade.update([at({ ...coords, yaw: 1.1 })], 1);
        for (const mesh of [batch(shade), batch(shade, "furniture-and-tree-contact-shade")]) {
            const matrix = matrixAt(mesh), centre = positionAt(mesh);
            expect(centre.distanceTo(actualTop.clone().addScaledVector(floorNormal, .006))).toBeLessThan(2e-6);
            const localNormal = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute("normal"), 0)
                .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
            expect(localNormal.dot(floorNormal)).toBeCloseTo(1, 6);
            // Every actual corner of the shade stays on the floor's tangent
            // plane. Merely moving a horizontal disk to the right centre fails.
            const vertices = mesh.geometry.getAttribute("position");
            for (let index = 0; index < vertices.count; index++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(matrix);
                expect(vertex.clone().sub(actualTop).dot(floorNormal)).toBeCloseTo(.006, 5);
            }
        }
        const forward = new THREE.Vector3().setFromMatrixColumn(matrixAt(batch(shade)), 2).normalize(), basis = planetBasis(coords.x, coords.z);
        const requested = vector(basis.south).multiplyScalar(Math.cos(1.1)).addScaledVector(vector(basis.east), Math.sin(1.1));
        requested.addScaledVector(floorNormal, -requested.dot(floorNormal)).normalize();
        expect(forward.dot(requested)).toBeCloseTo(1, 6);expect(JSON.stringify(anchors)).toBe(original);
    });

    it("uses the world transform of each real tree instance, including its parent", () => {
        const geometry = new THREE.CylinderGeometry(.1, .17, 2, 8), material = new THREE.MeshBasicMaterial();resources.push(geometry, material);
        const trees = new THREE.InstancedMesh(geometry, material, 1);resources.push(trees);
        const dummy = new THREE.Object3D();onPlanet(dummy, 12, 4, 1);dummy.updateMatrix();trees.setMatrixAt(0, dummy.matrix);
        const parent = new THREE.Group();parent.rotation.y = .4;parent.add(trees);parent.updateMatrixWorld(true);
        const actualFoot = new THREE.Vector3(0, -1, 0).applyMatrix4(dummy.matrix).applyMatrix4(trees.matrixWorld), coords = canonical(actualFoot);
        shade = new PlanetContactShadows([], trees, ground);
        const fixed = batch(shade, "furniture-and-tree-contact-shade"), expected = vector(planetPoint(coords.x, coords.z)).addScaledVector(vector(planetNormal(coords.x, coords.z)), .006);
        expect(shade.state).toMatchObject({ fixed: 1, actors: 0, draws: 1 });
        expect(positionAt(fixed).distanceTo(expected)).toBeLessThan(2e-6);expect(weight(fixed)).toBe(1);
    });

    it("keeps jump shade on the floor while weakening and slightly spreading it", () => {
        shade = new PlanetContactShadows([], undefined, ground);const actors = batch(shade);
        shade.update([at()], 1);const grounded = matrixAt(actors), centre = positionAt(actors), solid = weight(actors);
        shade.update([at({ air: .7 })], 1);const airborne = matrixAt(actors);
        expect(positionAt(actors).distanceTo(centre)).toBeLessThan(1e-8);
        expect(weight(actors)).toBeGreaterThan(0);expect(weight(actors)).toBeLessThan(solid * .1);
        const groundedScale = new THREE.Vector3().setFromMatrixScale(grounded), airborneScale = new THREE.Vector3().setFromMatrixScale(airborne);
        expect(airborneScale.x / groundedScale.x).toBeGreaterThan(1);expect(airborneScale.x / groundedScale.x).toBeLessThanOrEqual(1.25);
        shade.update([at({ air: -1 })], 0);expect(weight(actors)).toBe(1);
        expect([NaN, Infinity, -Infinity].map(contactStrength)).toEqual([0, 0, 0]);
        expect(contactStrength(4)).toBeLessThan(contactStrength(1));
    });

    it("does not write nonfinite contacts, support or day values into instance buffers or materials", () => {
        const supportAt = (x: number, z: number): PlanetSupport => x === 1 ? { ...ground(x, z), height: NaN }
            : x === 2 ? { ...ground(x, z), normal: { x: 0, y: Infinity, z: 1 } } : ground(x, z);
        shade = new PlanetContactShadows([], undefined, supportAt);
        const contacts = [at({ x: NaN }), at({ z: Infinity }), at({ yaw: NaN }), at({ air: NaN }), at({ air: Infinity }), at({ x: 1 }), at({ x: 2 }), at()];
        shade.update(contacts, NaN);
        const actors = batch(shade);expect(actors.count).toBe(1);
        expect(matrixAt(actors).elements.every(Number.isFinite)).toBe(true);expect(Number.isFinite(weight(actors))).toBe(true);
        const material = actors.material as THREE.MeshBasicMaterial;expect(Number.isFinite(material.opacity)).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);expect(material.opacity).toBeLessThanOrEqual(1);
        shade.update(contacts.slice(0, -1), 1);expect(actors.count).toBe(0);expect(shade.state.draws).toBe(0);
    });

    it("uses at most 32 moving instances and two batches, then removes stale actors", () => {
        const anchor: PlanetContactAnchor = { id: "bench-foot", point: planetPoint(0, 0), normal: planetNormal(0, 0), rx: .2, rz: .3, yaw: 0 };
        shade = new PlanetContactShadows([anchor], undefined, ground);
        const crowd = Array.from({ length: 80 }, (_, index) => at({ x: index * .1, z: 0 }));shade.update(crowd, 1);
        expect(shade.root.children).toHaveLength(2);expect(shade.state).toMatchObject({ actors: 32, fixed: 1, draws: 2 });
        const actors = batch(shade), fixed = batch(shade, "furniture-and-tree-contact-shade");
        expect(actors.material).toBe(fixed.material);expect(actors.geometry.getAttribute("contactWeight")).toBeInstanceOf(THREE.InstancedBufferAttribute);
        expect(fixed.geometry.getAttribute("contactWeight")).toBeInstanceOf(THREE.InstancedBufferAttribute);
        expect(actors.castShadow || fixed.castShadow).toBe(false);expect(actors.receiveShadow || fixed.receiveShadow).toBe(false);
        for (let index = 0; index < actors.count; index++) expect(matrixAt(actors, index).elements.every(Number.isFinite)).toBe(true);
        shade.update([at({ companion: true })], 1);expect(shade.state).toMatchObject({ actors: 1, draws: 2 });
        const animalScale = new THREE.Vector3().setFromMatrixScale(matrixAt(actors));shade.update([at()], 1);
        expect(animalScale.x).toBeGreaterThan(new THREE.Vector3().setFromMatrixScale(matrixAt(actors)).x);
        shade.update([], 1);expect(shade.state).toMatchObject({ actors: 0, fixed: 1, draws: 1 });
    });

    it("releases both meshes/geometries and the shared material/texture once, without resurrecting on update", () => {
        const supportAt = vi.fn(ground), scene = new THREE.Scene();
        shade = new PlanetContactShadows([], undefined, supportAt);scene.add(shade.root);shade.update([at()], 1);
        const actors = batch(shade), fixed = batch(shade, "furniture-and-tree-contact-shade"), material = actors.material as THREE.MeshBasicMaterial;
        const resources = [actors, fixed, actors.geometry, fixed.geometry, material, material.map!], disposals = resources.map(() => vi.fn());
        resources.forEach((resource, index) => (resource as THREE.EventDispatcher<{ dispose: {} }>).addEventListener("dispose", disposals[index]));
        const calls = supportAt.mock.calls.length, matrix = matrixAt(actors);
        shade.dispose();shade.dispose();shade.update([at({ x: 12 })], .5);
        expect(shade.root.children).toHaveLength(0);expect(scene.children).toHaveLength(0);
        expect(shade.state).toEqual({ actors: 0, fixed: 0, draws: 0, disposed: true });
        expect(supportAt.mock.calls).toHaveLength(calls);expect(matrixAt(actors).equals(matrix)).toBe(true);
        for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    });
});
