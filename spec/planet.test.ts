import { describe, it, expect } from "vitest";
import { PLANET_RADIUS as R, PLANET_HALF, planetNormal, planetPoint, planetBasis, planetDistance, planetStep, planetCoordsValid, sceneHutAt, sceneDistance, PLANET_HUTS, PLANET_PLACES } from "../src/shared/planet.ts";
import { roomKey, SCENES } from "../src/shared/catalog.ts";
const magnitude = (p: {
    x: number;
    y: number;
    z: number;
}): number => Math.hypot(p.x, p.y, p.z);
const dot = (a: {
    x: number;
    y: number;
    z: number;
}, b: {
    x: number;
    y: number;
    z: number;
}): number => a.x * b.x + a.y * b.y + a.z * b.z;
describe("the actual spherical world", () => {
    it("returns to its starting position after walking one great circle", () => {
        for (const yaw of [0, .7, Math.PI / 2, 2.5]) {
            const start = { x: 9, z: 6, yaw }, end = planetStep(start, 1, 0, Math.PI * 2 * R);
            expect(planetDistance(start, end)).toBeLessThan(1e-8);
            expect(Math.sin(end.yaw - start.yaw)).toBeCloseTo(0, 8);
        }
    });
    it("walks continuously over longitude's seam and either pole", () => {
        const seam = planetStep({ x: PLANET_HALF - .5, z: 0, yaw: Math.PI / 2 }, 1, 0, 1);
        expect(seam.x).toBeCloseTo(-PLANET_HALF + .5, 8);
        for (const sign of [-1, 1]) {
            const start = { x: 4, z: sign * (PLANET_HALF / 2 - .4), yaw: sign > 0 ? 0 : Math.PI }, end = planetStep(start, 1, 0, 1);
            expect(planetCoordsValid(end.x, end.z)).toBe(true);
            expect(planetDistance(start, end)).toBeCloseTo(1, 7);
            expect(Math.abs(end.x - start.x)).toBeGreaterThan(60);
        }
    });
    it("uses short spherical proximity for chat, placement and removal", () => {
        const a = { x: PLANET_HALF - .5, z: 0 }, b = { x: -PLANET_HALF + .5, z: 0 };
        expect(sceneDistance("planet", a, b)).toBeCloseTo(1, 8);
        expect(sceneDistance("seaside", a, b)).toBeGreaterThan(130);
        expect(planetDistance({ x: 0, z: 0 }, { x: PLANET_HALF, z: 0 })).toBeCloseTo(PLANET_HALF, 8);
    });
    it("keeps an orthonormal right-handed local frame and grounded positions", () => {
        for (const x of [-PLANET_HALF, -17, 0, 40])
            for (const z of [-PLANET_HALF / 2, -12, 0, PLANET_HALF / 2]) {
                const b = planetBasis(x, z);
                expect(magnitude(b.up)).toBeCloseTo(1, 12);
                expect(dot(b.up, b.east)).toBeCloseTo(0, 12);
                expect(dot(b.south, b.east)).toBeCloseTo(0, 12);
                expect(dot(b.south, b.up)).toBeCloseTo(0, 12);
                expect(magnitude(planetPoint(x, z, 1.7))).toBeCloseTo(R + 1.7, 10);
                expect(magnitude(planetNormal(x, z))).toBeCloseTo(1, 12);
            }
    });
    it("normalizes diagonal input without faster movement or invalid positions", () => { const p = { x: 0, z: 0, yaw: .5 }; expect(planetDistance(p, planetStep(p, 1, 1, 3.2))).toBeCloseTo(3.2, 8); expect(planetStep(p, NaN, 0, 1)).toEqual(p); expect(planetCoordsValid(Infinity, 0)).toBe(false); expect(planetCoordsValid(0, PLANET_HALF)).toBe(false); });
    it("moves D to rendered screen-right at different longitudes and headings", () => { for (const x of [0, 20, 65])
        for (const yaw of [0, .9, Math.PI]) {
            const p = { x, z: 8, yaw }, b = planetBasis(x, 8), f = { x: b.east.x * Math.sin(yaw) + b.south.x * Math.cos(yaw), y: b.east.y * Math.sin(yaw) + b.south.y * Math.cos(yaw), z: b.east.z * Math.sin(yaw) + b.south.z * Math.cos(yaw) }, right = { x: f.y * b.up.z - f.z * b.up.y, y: f.z * b.up.x - f.x * b.up.z, z: f.x * b.up.y - f.y * b.up.x }, a = planetNormal(p.x, p.z), end = planetStep(p, 0, 1, .1), v = planetNormal(end.x, end.z);
            expect(dot({ x: v.x - a.x, y: v.y - a.y, z: v.z - a.z }, right)).toBeGreaterThan(0);
        } });
    it("keeps each edition's room and private hut coordinates distinct", () => { expect(roomKey("seaside", "weekday")).toBe("seaside:morning"); expect(roomKey("planet", "weekday")).toBe("planet:morning"); expect(sceneHutAt("planet", 13.5, 5)?.id).toBe("planet-toilet"); expect(sceneHutAt("seaside", 13.5, 5)).toBeUndefined(); expect(PLANET_HUTS.every(h => sceneHutAt("planet", (h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2)?.id === h.id)).toBe(true); expect(SCENES.find(s => s.id === "seaside")?.zones[0].spawn.z).toBe(-130); expect(PLANET_PLACES.length).toBe(9); });
});
