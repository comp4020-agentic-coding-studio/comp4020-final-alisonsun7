import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { PlanetLighting, planetGlobalLightDirection, type PlanetLightingInput } from "../src/client/planet-lighting.ts";
import { PLANET_PLACES, PLANET_RADIUS, planetNormal, planetPoint, planetStep } from "../src/shared/planet.ts";

const input = (changes: Partial<PlanetLightingInput> = {}): PlanetLightingInput => ({ x: 0, z: 0, groundHeight: 0, minute: 840, weather: "clear", zoom: 8, ...changes });
const point = (at: {x:number;z:number}, height = 0): THREE.Vector3 => { const p = planetPoint(at.x, at.z, height);return new THREE.Vector3(p.x, p.y, p.z); };
const insideShadow = (rig: PlanetLighting, position: THREE.Vector3): boolean => {
    const p = position.clone().applyMatrix4(rig.sun.shadow.matrix);
    return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.z >= 0 && p.z <= 1;
};

describe("a shared key and surface-relative painted sky", () => {
    it("retains the same global-time key direction for friends on different hemispheres and zooms", () => {
        const a = new PlanetLighting(), b = new PlanetLighting();
        try {
            for (const minute of [0, 360, 720, 840, 1110, 1320, 1440]) {
                a.update(input({ x: -9, z: -7, minute }));b.update(input({ x: 55, z: -8, minute, zoom: 28 }));
                const actualA = a.sun.position.clone().sub(a.target.position).normalize(), actualB = b.sun.position.clone().sub(b.target.position).normalize();
                const day = Math.max(0, Math.sin((minute - 360) / 1440 * Math.PI * 2));
                const original = new THREE.Vector3(Math.cos(minute / 1440 * Math.PI * 2) * 45, 45, 20 + day * 45).normalize();
                expect(actualA.distanceTo(original)).toBeLessThan(1e-12);expect(actualB.distanceTo(original)).toBeLessThan(1e-12);
                expect(a.state.globalDirection).toEqual(b.state.globalDirection);
            }
        } finally { a.dispose();b.dispose(); }
    });

    it("gives each local upward surface the sky side of hemisphere fill, including the southern coast and backside", () => {
        const rig = new PlanetLighting();
        try {
            for (const place of PLANET_PLACES) for (const minute of [360, 840, 1110, 1320]) {
                rig.update(input({ ...place, minute }));
                const n = planetNormal(place.x, place.z), up = new THREE.Vector3(n.x, n.y, n.z);
                expect(rig.hemi.getWorldPosition(new THREE.Vector3()).normalize().dot(up)).toBeCloseTo(1, 12);
                expect(rig.hemi.intensity).toBeGreaterThanOrEqual(.8);
            }
        } finally { rig.dispose(); }
    });

    it("softens the key with weather while retaining a cool readable night fill and warm daytime key", () => {
        const rig = new PlanetLighting();
        try {
            rig.update(input());const clear = rig.state;
            expect(rig.sun.color.r).toBeGreaterThan(rig.sun.color.b);
            for (const weather of ["cloudy", "rain"] as const) {
                rig.update(input({ weather }));expect(rig.sun.intensity / clear.sunIntensity).toBeCloseTo(.5, 12);
                expect(rig.hemi.intensity / clear.hemiIntensity).toBeCloseTo(.9, 12);
            }
            rig.update(input({ weather: "mist" }));expect(rig.sun.intensity / clear.sunIntensity).toBeCloseTo(.7, 12);
            rig.update(input({ minute: 1320 }));
            expect(rig.sun.intensity).toBeLessThan(clear.sunIntensity * .1);
            expect(rig.hemi.color.b).toBeGreaterThan(rig.hemi.color.r);
            expect(rig.hemi.groundColor.b).toBeGreaterThan(rig.hemi.groundColor.r);
        } finally { rig.dispose(); }
    });
});

describe("bounded local contact-scale sun shadows", () => {
    it("reserves fine texels and millimetre-scale offsets rather than detaching small shoes by centimetres", () => {
        const rig = new PlanetLighting();
        try {
            rig.update(input());
            const state = rig.state, camera = rig.sun.shadow.camera;
            expect(rig.sun.shadow.mapSize.toArray()).toEqual([2048, 2048]);
            const actualTexelMetres = (camera.right - camera.left) / rig.sun.shadow.mapSize.x;
            expect(state.texelMetres).toBeCloseTo(actualTexelMetres, 12);
            expect(actualTexelMetres).toBeLessThan(.011);
            const detachedScale = Math.abs(rig.sun.shadow.bias) * (camera.far - camera.near) + rig.sun.shadow.normalBias;
            expect(detachedScale).toBeLessThan(.012);
            // These are the frozen 40ed231 parameters, not a claim to render
            // old screenshots here. This bound would reject their scale.
            expect(.0006 * (150 - 1) + .035).toBeGreaterThan(.1);
        } finally { rig.dispose(); }
    });

    it("contains nearby actual spherical ground and tall props at all venues without clipping their shadow depth", () => {
        const rig = new PlanetLighting();
        try {
            for (const place of PLANET_PLACES) for (const minute of [0, 360, 840, 1110]) {
                rig.update(input({ ...place, minute, groundHeight: .16 }));
                for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
                    const around = planetStep({ x: place.x, z: place.z, yaw }, 1, 0, 8);
                    for (const height of [.16, 4.8]) expect(insideShadow(rig, point(around, height)), `${place.id}, ${minute}, ${yaw}, ${height}`).toBe(true);
                }
            }
        } finally { rig.dispose(); }
    });

    it("updates live overview projection to contain both hemispheres and returns to the precise close box", () => {
        const rig = new PlanetLighting();
        try {
            for (const place of [PLANET_PLACES[0], PLANET_PLACES.at(-1)!]) {
                rig.update(input({ ...place, zoom: 28 }));
                expect(rig.state.span).toBeLessThanOrEqual(64);
                expect(rig.target.position.length()).toBeLessThan(1e-12);
                for (let longitude = -Math.PI; longitude <= Math.PI; longitude += Math.PI / 8)
                    for (let latitude = -Math.PI / 2; latitude <= Math.PI / 2; latitude += Math.PI / 8)
                        expect(insideShadow(rig, point({ x: longitude * PLANET_RADIUS, z: latitude * PLANET_RADIUS }, 6))).toBe(true);
                const overviewProjection = rig.sun.shadow.camera.projectionMatrix.clone();
                rig.update(input({ ...place, zoom: 8 }));
                expect(rig.sun.shadow.camera.projectionMatrix.equals(overviewProjection)).toBe(false);
                expect(rig.state.texelMetres).toBeLessThan(.011);
            }
        } finally { rig.dispose(); }
    });

    it("moves the shadow grid by whole texels without turning the key or accumulating transforms", () => {
        const rig = new PlanetLighting();
        try {
            const minute = 840, direction = planetGlobalLightDirection(minute), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
            const up = new THREE.Vector3().crossVectors(direction, right).normalize();
            rig.update(input({ x: -9, z: -7, minute }));const original = rig.state;
            for (const x of [-9.0001, -8.999, -8.995, -8.98]) {
                rig.update(input({ x, z: -7, minute }));
                for (const axis of [right, up]) {
                    const steps = rig.target.position.dot(axis) / rig.state.texelMetres;
                    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
                }
                expect(rig.sun.position.clone().sub(rig.target.position).normalize().distanceTo(direction)).toBeLessThan(1e-12);
            }
            rig.update(input({ minute: 1320, zoom: 28 }));rig.update(input({ x: -9, z: -7, minute }));
            expect(rig.state).toEqual(original);
        } finally { rig.dispose(); }
    });

    it("holds the last valid rig for invalid frames and disposes its one shadow map only once", () => {
        const rig = new PlanetLighting(), scene = new THREE.Scene();scene.add(rig.sun, rig.hemi, rig.target);
        const original = rig.state;
        for (const change of [{ x: NaN }, { z: Infinity }, { minute: NaN }, { zoom: Infinity }, { groundHeight: NaN }]) {
            rig.update(input(change));expect(rig.state).toEqual(original);
        }
        const map = new THREE.WebGLRenderTarget(1, 1), disposed = vi.fn();map.addEventListener("dispose", disposed);
        rig.sun.shadow.map = map;
        rig.dispose();rig.dispose();
        expect(disposed).toHaveBeenCalledTimes(1);expect(scene.children).toHaveLength(0);
        rig.update(input({ x: 55 }));expect(rig.state).toEqual(original);
    });
});
