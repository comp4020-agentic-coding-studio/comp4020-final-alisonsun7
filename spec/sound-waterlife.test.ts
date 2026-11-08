import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SoundWaterlife, findWaterlifeAnchor, sampleWaterlife, type SoundWaterlifeOptions } from "../src/client/sound-waterlife.ts";
import { coastlineAt, planetPierHeightAt } from "../src/client/planet-coast.ts";
import { PLANET_HALF, PLANET_RADIUS as R, planetDistance, planetNormal } from "../src/shared/planet.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const at = Date.parse("2026-11-08T12:00:00Z"), pool = { x: 16, z: 14, radius: 2.55, height: .035 };
const options: SoundWaterlifeOptions = { shoreline: coastlineAt, isWater: (x, z) => z > coastlineAt(x) + .15 && planetPierHeightAt(x, z) === null, pool };
const source = (id = "fish", patch: Partial<PlacedSound> = {}): PlacedSound => ({ id, soundId: "pond-bubbles", x: 16, z: 14, at: new Date(at).toISOString(), byId: "person-a", by: "Ada", ...patch });
const whale = (id = "whale", patch: Partial<PlacedSound> = {}) => source(id, { soundId: "whale-song", x: 16, z: coastlineAt(16) - 1, ...patch });
const frog = (id = "frog", patch: Partial<PlacedSound> = {}) => source(id, { soundId: "pond-frogs", ...patch });
const mesh = (life: SoundWaterlife, name: string) => life.root.getObjectByName(name) as THREE.InstancedMesh;
const snapshot = (life: SoundWaterlife): unknown[] => {
    life.root.updateMatrixWorld(true);const rows: unknown[] = [];
    life.root.traverse(object => {
        if (object instanceof THREE.InstancedMesh) rows.push({ name: object.name, count: object.count, matrix: Array.from(object.instanceMatrix.array).slice(0, object.count * 16),
            color: object.instanceColor ? Array.from(object.instanceColor.array).slice(0, object.count * 3) : null, sources: object.userData.sources });
        else if (object instanceof THREE.Mesh) rows.push({ name: object.name, source: object.userData.soundWaterlife, matrix: object.matrixWorld.elements.slice() });
    });return rows;
};
const coordinates = (p: THREE.Vector3) => ({ x: Math.atan2(p.x, p.z) * R, z: -Math.asin(Math.max(-1, Math.min(1, p.y / p.length()))) * R });

describe("real sounds invite life to the actual pond and sea", () => {
    it("keeps five small scenery fish separate from author-attributed public consequences and rejects private/examples", () => {
        const life = new SoundWaterlife(new THREE.Scene(), options);
        try {
            expect(life.state).toEqual([]);expect(life.sceneryState.map(s => [s.origin, s.count])).toEqual([["scenery", 2], ["scenery", 3]]);
            expect(mesh(life, "waterlife-fish-bodies").count).toBe(5);
            const fish = mesh(life, "waterlife-fish-bodies"), vertices = fish.geometry.getAttribute("position");
            for (let i = 0; i < fish.count; i++) {
                const transform = new THREE.Matrix4();fish.getMatrixAt(i, transform);let low = Infinity, high = -Infinity;
                for (let j = 0; j < vertices.count; j++) { const radius = new THREE.Vector3().fromBufferAttribute(vertices, j).applyMatrix4(transform).length();low = Math.min(low, radius);high = Math.max(high, radius); }
                const water = R + (i < 2 ? pool.height : .055);
                expect(low, "small scenery fish straddles the actual water rather than floating wholly above it").toBeLessThan(water);
                expect(high).toBeGreaterThan(water + .025);
            }
            const example = { ...source("@world:example"), origin: "example" };
            life.setSources([source(), frog(), whale(), example, source("private", { whileIn: "planet-shower" }), source("ended"), source("ended", { removedAt: new Date(at + 10).toISOString() }), source("invalid", { x: NaN }), source("bird", { soundId: "evening-forest" })]);
            life.frame(at + 1300);
            expect(life.state.map(s => s.sourceId)).toEqual(["fish", "frog", "whale"]);
            expect(life.state.every(s => s.visible && s.origin === "player" && s.byId === "person-a")).toBe(true);
            expect(mesh(life, "waterlife-fish-bodies").count).toBe(8);
            expect(mesh(life, "waterlife-fish-bodies").userData.sources.filter((id: string | null) => id === null)).toHaveLength(5);
            expect(life.state.find(s => s.kind === "fish")).toMatchObject({ sourceX: 16, sourceZ: 14, count: 3 });
            expect(life.root.getObjectByName("sound-born-whale")?.userData.soundWaterlife).toMatchObject({ sourceId: "whale", by: "Ada", origin: "player" });
        } finally { life.dispose(); }
    });

    it("declines remote ingredients rather than sending their effect to an unrelated place or across a pier", () => {
        const life = new SoundWaterlife(new THREE.Scene(), options);
        try {
            life.setSources([source("inland", { x: -40, z: -20 }), frog("far-frog", { x: 0, z: 0 }), whale("far-whale", { x: 0, z: -20 })]);life.frame(at + 3000);
            expect(life.state).toHaveLength(3);expect(life.state.every(s => !s.visible && s.reason === "no-nearby-water")).toBe(true);
            expect(life.getFocus("inland")).toBeNull();expect(life.viewpoint("far-whale")).toBeNull();
            expect(findWaterlifeAnchor(whale(), "whale", { ...options, isWater: () => false })).toMatchObject({ anchor: null, reason: "no-water-route" });
            expect(findWaterlifeAnchor(whale(), "whale", { shoreline: () => NaN })).toMatchObject({ anchor: null });
            const pierSource = whale("pier", { x: 7, z: coastlineAt(7) - .5 });
            const result = findWaterlifeAnchor(pierSource, "whale", options);expect(result.anchor).not.toBeNull();
            for (let ms = 0; ms <= 120_000; ms += 250) {
                const pose = sampleWaterlife("whale", result.anchor!, at, at + ms)!;
                expect(options.isWater!(pose.x, pose.z)).toBe(true);expect(planetDistance(pierSource, pose)).toBeLessThan(19.1);
            }
        } finally { life.dispose(); }
    });

    it("shows an immediate breath and a complete rare breach with articulated tail/flippers, instead of an unchanging model", () => {
        const life = new SoundWaterlife(new THREE.Scene(), options);
        try {
            life.setSources([whale()]);life.frame(at + 1800);
            expect(life.state[0]).toMatchObject({ action: "breathing", visible: true });expect(mesh(life, "waterlife-whale-spray").count).toBe(12);
            life.frame(at + 19_200);const start = life.state[0], before = snapshot(life);
            life.frame(at + 21_300);const apex = life.state[0];expect(apex.action).toBe("leaping");expect(apex.height!).toBeGreaterThan(2.8);
            expect(apex.height! - start.height!).toBeGreaterThan(2.9);expect(snapshot(life)).not.toEqual(before);
            const model = life.root.getObjectByName("sound-born-whale")!;
            for (const name of ["whale-body-and-face", "whale-tail-flukes", "whale-left-flipper", "whale-right-flipper", "whale-author-mark"]) expect(model.getObjectByName(name)).toBeDefined();
            life.root.updateMatrixWorld(true);model.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;const positions = object.geometry.getAttribute("position");
                for (let i = 0; i < positions.count; i++) expect(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).length()).toBeGreaterThan(R + .08);
            });
            life.frame(at + 23_500);expect(life.state[0].height!).toBeLessThan(.1);expect(mesh(life, "waterlife-ripples").count).toBe(3);
            let leapFrames = 0;for (let i = 0; i < 580; i++) if (sampleWaterlife("whale", findWaterlifeAnchor(whale(), "whale", options).anchor!, at, at + 5200 + i * 100)!.action === "leaping") leapFrames++;
            expect(leapFrames).toBeGreaterThanOrEqual(41);expect(leapFrames).toBeLessThanOrEqual(43);
        } finally { life.dispose(); }
    });

    it("keeps the actual whale geometry and spray over ocean water through a full route, including the seam", () => {
        for (const [x, z] of [[7, coastlineAt(7) - .5], [16, coastlineAt(16) - .5], [16, 14], [PLANET_HALF - .05, coastlineAt(PLANET_HALF - .05) - .5], [-PLANET_HALF + .05, coastlineAt(-PLANET_HALF + .05) - .5]]) {
            const life = new SoundWaterlife(new THREE.Scene(), options), row = whale(`route-${x}-${z}`, { x, z });
            try {
                life.setSources([row]);
                for (let ms = 0; ms < 64_000; ms += 900) {
                    life.frame(at + ms);life.root.updateMatrixWorld(true);expect(life.state[0].visible).toBe(true);
                    const model = life.root.getObjectByName("sound-born-whale")!;
                    model.traverse(object => {
                        if (!(object instanceof THREE.Mesh)) return;
                        object.geometry.computeBoundingBox();const b = object.geometry.boundingBox!;
                        for (const xx of [b.min.x, b.max.x]) for (const yy of [b.min.y, b.max.y]) for (const zz of [b.min.z, b.max.z]) {
                            const p = coordinates(new THREE.Vector3(xx, yy, zz).applyMatrix4(object.matrixWorld));
                            expect(options.isWater!(p.x, p.z), `${object.name} ocean footprint at ${x}/${ms}`).toBe(true);
                        }
                    });
                    const spray = mesh(life, "waterlife-whale-spray");for (let i = 0; i < spray.count; i++) { const m = new THREE.Matrix4();spray.getMatrixAt(i, m);const p = coordinates(new THREE.Vector3().setFromMatrixPosition(m));expect(options.isWater!(p.x, p.z)).toBe(true); }
                }
            } finally { life.dispose(); }
        }
    });

    it("times pond calls and bubble clusters to their event periods while frogs hop occasionally between still pads", () => {
        const life = new SoundWaterlife(new THREE.Scene(), options);
        try {
            life.setSources([source(), frog()]);life.frame(at + 1000);
            expect(life.state.find(s => s.kind === "frog")?.action).toBe("calling");expect(mesh(life, "waterlife-bubbles").count).toBe(5);
            const frogs = life.root.children.filter(child => child.name === "sound-born-frog");
            expect(frogs[0].getObjectByName("frog-calling-throat")!.scale.y).toBeGreaterThan(.13);
            expect(frogs[1].getObjectByName("frog-calling-throat")!.scale.y).toBeCloseTo(.065);
            life.frame(at + 1850);expect(frogs[1].getObjectByName("frog-calling-throat")!.scale.y).toBeGreaterThan(.13);expect(life.state.find(s => s.kind === "frog")?.action).toBe("calling");
            life.frame(at + 8000);expect(mesh(life, "waterlife-bubbles").count).toBe(0);expect(life.state.find(s => s.kind === "frog")?.action).toBe("resting");
            const pads = Array.from(mesh(life, "waterlife-lily-pads").instanceMatrix.array);
            life.frame(at + 10_900);expect(life.state.find(s => s.kind === "frog")?.action).toBe("hopping");expect(life.state.find(s => s.kind === "frog")?.height!).toBeGreaterThan(.45);
            expect(Array.from(mesh(life, "waterlife-lily-pads").instanceMatrix.array)).toEqual(pads);
            life.frame(at + 19_000);expect(frogs[0].getObjectByName("frog-calling-throat")!.scale.y).toBeGreaterThan(.13);
            for (const model of frogs) { const p = coordinates(model.position);expect(planetDistance(p, pool)).toBeLessThan(2.5); }
            life.frame(at + 54_000 - .1);const before = frogs[0].position.clone();life.frame(at + 54_000 + .1);expect(frogs[0].position.distanceTo(before)).toBeLessThan(.001);
        } finally { life.dispose(); }
    });

    it("gives independent arrivals identical actual poses/instances, canonical bounded selection and frozen reduced motion", () => {
        const first = new SoundWaterlife(new THREE.Scene(), options), late = new SoundWaterlife(new THREE.Scene(), options);
        const rows = [...Array.from({ length: 5 }, (_, i) => source(`fish-${i}`, { at: new Date(at + i).toISOString(), byId: `person-${i}` })),
            ...Array.from({ length: 3 }, (_, i) => frog(`frog-${i}`, { at: new Date(at + i).toISOString() })), ...Array.from({ length: 3 }, (_, i) => whale(`whale-${i}`, { at: new Date(at + i).toISOString() }))];
        const original = JSON.stringify(rows);
        try {
            first.setSources(rows.slice(0, 3));first.frame(at + 3000);first.setSources(rows);late.setSources([...rows].reverse());
            first.frame(at + 21_300);late.frame(at + 21_300);expect(first.state).toEqual(late.state);expect(snapshot(first)).toEqual(snapshot(late));
            expect(first.state.filter(s => s.visible)).toHaveLength(8);expect(first.state.filter(s => s.reason === "budget")).toHaveLength(3);
            expect(mesh(first, "waterlife-fish-bodies").count).toBe(17);expect(mesh(first, "waterlife-lily-pads").count).toBe(4);
            expect(first.getFocus("fish-0")).toBeNull();expect(first.getFocus("fish-4")).toMatchObject({ kind: "fish" });
            const view = first.viewpoint("whale-2")!;expect(view.z).toBeLessThan(coastlineAt(view.x));
            first.frame(at + 21_300, true);const still = snapshot(first);first.frame(at + 140_000, true);expect(snapshot(first)).toEqual(still);
            for (const name of ["waterlife-bubbles", "waterlife-ripples", "waterlife-whale-spray"]) expect(mesh(first, name).count).toBe(0);
            expect(first.state.filter(s => s.visible)).toHaveLength(8);expect(JSON.stringify(rows)).toBe(original);
        } finally { first.dispose();late.dispose(); }
    });

    it("withdraws all source-owned models and particles immediately, and tombstones outrank old live snapshots", () => {
        const life = new SoundWaterlife(new THREE.Scene(), options), rows = [source(), frog(), whale()];
        try {
            life.setSources(rows);life.frame(at + 1800);expect(mesh(life, "waterlife-whale-spray").count).toBe(12);
            life.setSources(rows.map(row => ({ ...row, removedAt: new Date(at + 2000).toISOString() })));
            expect(life.state).toEqual([]);expect(life.root.getObjectByName("sound-born-whale")).toBeUndefined();expect(life.root.getObjectByName("sound-born-frog")).toBeUndefined();
            for (const name of ["waterlife-bubbles", "waterlife-ripples", "waterlife-whale-spray", "waterlife-lily-pads"]) expect(mesh(life, name).count).toBe(0);
            expect(mesh(life, "waterlife-fish-bodies").count).toBe(5);
            life.setSources(rows);life.frame(at + 21_300);expect(life.state).toEqual([]);expect(mesh(life, "waterlife-fish-bodies").userData.sources).toEqual([null, null, null, null, null]);
            const later = [source("later-fish"), frog("later-frog"), whale("later-whale")];
            life.setSources(later);life.frame(at + 1800);expect(life.state.filter(s => s.visible)).toHaveLength(3);
            life.setSources([]);expect(life.state).toEqual([]);life.setSources(later);life.frame(at + 21_300);expect(life.state).toEqual([]);
        } finally { life.dispose(); }
    });

    it("releases a withdrawn author's accent without disposing shared pond meshes, then disposes everything exactly once", () => {
        const parent = new THREE.Scene(), life = new SoundWaterlife(parent, options), ada = whale("ada"), bo = whale("bo", { byId: "person-b", at: new Date(at + 1).toISOString() });
        life.setSources([ada, bo, frog()]);life.frame(at + 1800);
        const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();let releasedGeometry = 0, releasedMaterial = 0;
        life.root.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry);for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
        for (const g of geometries) g.addEventListener("dispose", () => releasedGeometry++);for (const m of materials) m.addEventListener("dispose", () => releasedMaterial++);
        life.setSources([bo, frog()]);expect(releasedGeometry).toBe(0);expect(releasedMaterial).toBe(1);
        life.dispose();life.dispose();life.setSources([ada]);life.frame(at + 3000);
        expect(releasedGeometry).toBe(geometries.size);expect(releasedMaterial).toBe(materials.size);expect(parent.children).toEqual([]);expect(life.state).toEqual([]);expect(life.sceneryState).toEqual([]);
    });
});
