// A tangent-plane projection alone cannot identify a building footprint:
// its antipode has the same local x/z. Keep the front hemisphere explicitly
// before applying authored local rectangles or raising a floor over a sphere.
import { PLANET_RADIUS, planetCoordsValid, planetLocal, planetNormal } from "../shared/planet.js";

type Point = { x: number; z: number };
export interface FrontPlanetLocal extends Point { facing: number; }

/** Local metres only on the hemisphere that actually contains this frame. */
export function frontPlanetLocal(point: Point, center: Point): FrontPlanetLocal | null {
    if (!planetCoordsValid(point.x, point.z) || !planetCoordsValid(center.x, center.z)) return null;
    const a = planetNormal(point.x, point.z), b = planetNormal(center.x, center.z);
    const facing = Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z);
    if (facing <= 0) return null;
    return { ...planetLocal(point, center), facing };
}

/** Actual radial height of a raised tangent-plane floor; never its antipode.
 * Callers still check that the point lies inside the authored local footprint.
 * This does not change surface coordinates or permit movement through a wall.
 */
export function raisedPlanetFloorHeight(point: Point, center: Point, floorTop: number): number | null {
    if (!Number.isFinite(floorTop) || floorTop < 0) return null;
    const local = frontPlanetLocal(point, center);
    if (!local) return null;
    const height = (PLANET_RADIUS + floorTop) / local.facing - PLANET_RADIUS;
    return Number.isFinite(height) ? height : null;
}
