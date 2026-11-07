// Soundfolk's spherical coordinates are metres of longitude and south latitude.
// The old coast keeps its planar coordinates and room unchanged.
import { HUTS, type Hut } from "./huts.js";
import type { Position } from "./protocol.js";
export const PLANET_RADIUS = 22;
export const PLANET_HALF = Math.PI * PLANET_RADIUS;
// Presentation geometry only; existing source coordinates are never remapped.
export const PLANET_CAFE_SCALE = { x: 1.5, z: 1.35 } as const;
type Point = {
    x: number;
    z: number;
};
export type Vec3 = {
    x: number;
    y: number;
    z: number;
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scaled = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const plus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const unit = (a: Vec3): Vec3 => scaled(a, 1 / Math.max(1e-15, Math.hypot(a.x, a.y, a.z)));
export function planetCoordsValid(x: number, z: number): boolean {
    return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= PLANET_HALF && Math.abs(z) <= PLANET_HALF / 2;
}
export function planetNormal(x: number, z: number): Vec3 {
    const lon = x / PLANET_RADIUS, lat = z / PLANET_RADIUS;
    return { x: Math.sin(lon) * Math.cos(lat), y: -Math.sin(lat), z: Math.cos(lon) * Math.cos(lat) };
}
export function planetPoint(x: number, z: number, height = 0): Vec3 {
    return scaled(planetNormal(x, z), PLANET_RADIUS + height);
}
export function planetBasis(x: number, z: number): {
    east: Vec3;
    up: Vec3;
    south: Vec3;
} {
    const lon = x / PLANET_RADIUS, lat = z / PLANET_RADIUS;
    return { east: { x: Math.cos(lon), y: 0, z: -Math.sin(lon) }, up: planetNormal(x, z),
        south: { x: -Math.sin(lon) * Math.sin(lat), y: -Math.cos(lat), z: -Math.cos(lon) * Math.sin(lat) } };
}
/** Project a surface point into a building's actual tangent-plane metre frame. */
export function planetLocal(point: Point, center: Point): Point {
    const p = planetPoint(point.x, point.z), c = planetPoint(center.x, center.z), b = planetBasis(center.x, center.z);
    const delta = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
    return { x: dot(delta, b.east), z: dot(delta, b.south) };
}
export function canonicalPlanetPosition(p: Position): Position {
    const n = planetNormal(p.x, p.z);
    return { x: Math.atan2(n.x, n.z) * PLANET_RADIUS, z: -Math.asin(Math.max(-1, Math.min(1, n.y))) * PLANET_RADIUS, yaw: Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) };
}
export function planetDistance(a: Point, b: Point): number {
    const av = planetNormal(a.x, a.z), bv = planetNormal(b.x, b.z);
    // atan2 remains accurate for identical and nearly antipodal positions.
    const c = cross(av, bv);
    return PLANET_RADIUS * Math.atan2(Math.hypot(c.x, c.y, c.z), dot(av, bv));
}
/** Exact great-circle step, with parallel transport of the walking heading. */
export function planetStep(p: Position, forward: number, right: number, metres: number): Position {
    if (![p.x, p.z, p.yaw, forward, right, metres].every(Number.isFinite))
        return { ...p };
    const b = planetBasis(p.x, p.z);
    const facing = plus(scaled(b.east, Math.sin(p.yaw)), scaled(b.south, Math.cos(p.yaw)));
    const side = plus(scaled(b.east, -Math.cos(p.yaw)), scaled(b.south, Math.sin(p.yaw)));
    const travel = plus(scaled(facing, forward), scaled(side, right));
    if (Math.hypot(travel.x, travel.y, travel.z) < 1e-9)
        return { ...p };
    const direction = unit(travel), axis = unit(cross(b.up, direction));
    const angle = metres / PLANET_RADIUS, c = Math.cos(angle), s = Math.sin(angle);
    const n = plus(scaled(b.up, c), scaled(direction, s));
    const rotatedFacing = plus(plus(scaled(facing, c), scaled(cross(axis, facing), s)), scaled(axis, dot(axis, facing) * (1 - c)));
    const target = { x: Math.atan2(n.x, n.z) * PLANET_RADIUS, z: -Math.asin(Math.max(-1, Math.min(1, n.y))) * PLANET_RADIUS };
    const next = planetBasis(target.x, target.z);
    return { ...target, yaw: Math.atan2(dot(rotatedFacing, next.east), dot(rotatedFacing, next.south)) };
}
export interface PlanetPlace extends Point {
    id: string;
    title: string;
    description: string;
    kind: "green" | "tea" | "stage" | "reading" | "conservatory" | "pool" | "workshop" | "restrooms" | "observatory";
    sounds: string[];
}
export const PLANET_PLACES: readonly PlanetPlace[] = [
    { id: "green", title: "Listening green", description: "Meet here. Leave a sound, then answer a friend's ingredient.", kind: "green", x: 0, z: 0, sounds: ["gentle-breeze", "cafe-chatter"] },
    { id: "tea", title: "Tide & Coffee", description: "Meet the café regulars. Coffee brings steam, conversation warms the tables, and music turns the record.", kind: "tea", x: -9, z: -7, sounds: ["espresso", "cafe-dishes", "cafe-chatter", "cafe-music"] },
    { id: "stage", title: "Pocket jam stage", description: "Make a rhythm together. Neighbours join the sounds you choose.", kind: "stage", x: 10, z: -9, sounds: ["guitar", "hand-claps", "cafe-music"] },
    { id: "reading", title: "The reading nook", description: "A small roof, books and a quiet place to listen with a friend.", kind: "reading", x: -13, z: 7, sounds: ["rainstick", "gentle-breeze"] },
    { id: "conservatory", title: "Rain conservatory", description: "Build a soft water-and-bird corner; living sources colour the flower beds.", kind: "conservatory", x: -2, z: 16, sounds: ["rainstick", "trickle", "evening-forest"] },
    { id: "pool", title: "Tide pools", description: "Waves, gulls and a passing boat bring the shore to this tiny world.", kind: "pool", x: 16, z: 14, sounds: ["beach-waves", "coastal-gulls", "harbour-boat"] },
    { id: "workshop", title: "Lantern workshop", description: "Each nearby public sound lights a lantern in its family's colour.", kind: "workshop", x: -21, z: -15, sounds: ["bicycle-bell", "hand-claps", "cafe-music"] },
    { id: "restrooms", title: "Restrooms and showers", description: "A little privacy. The door locks while a visitor is inside; a green lamp means the room is free.", kind: "restrooms", x: 14, z: 10, sounds: [] },
    { id: "observatory", title: "The other-side lookout", description: "Walk around the globe and meet again; there is no edge to fall off.", kind: "observatory", x: 55, z: -8, sounds: ["evening-forest", "summer-cicadas"] },
];
export const PLANET_HUTS: readonly Hut[] = [
    { id: "planet-toilet", kind: "mens-toilet", name: "the planet restroom", x0: 12, x1: 15, z0: 4, z1: 7, door: { x0: 13, x1: 14 } },
    { id: "planet-shower", kind: "mens-shower", name: "the planet shower", x0: 16.5, x1: 19.5, z0: 4, z1: 7, door: { x0: 17.5, x1: 18.5 } },
];
export const sceneHuts = (sceneId: string): readonly Hut[] => sceneId === "planet" ? PLANET_HUTS : HUTS;
export const sceneHutAt = (sceneId: string, x: number, z: number): Hut | undefined => sceneHuts(sceneId).find(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
export const sceneDistance = (sceneId: string, a: Point, b: Point): number => sceneId === "planet" ? planetDistance(a, b) : Math.hypot(a.x - b.x, a.z - b.z);
