// Small, deterministic movement rules shared by the live controller and its
// regression checks. Height never changes collision admission on the ground.
import { planetBasis, planetPoint, planetStep } from "../shared/planet.js";
import type { Position } from "../shared/protocol.js";

export const WALK_SPEED = 3.2;
export const RUN_SPEED = 5.6;
export const JUMP_DURATION = .72;
export const JUMP_APEX = .88;

export function jumpHeight(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= JUMP_DURATION) return 0;
    const phase = seconds / JUMP_DURATION;
    return 4 * JUMP_APEX * phase * (1 - phase);
}

export function bearingToward(from: Position, target: { x: number; z: number }): number {
    const b = planetBasis(from.x, from.z), p = planetPoint(target.x, target.z);
    return Math.atan2(p.x * b.east.x + p.y * b.east.y + p.z * b.east.z,
        p.x * b.south.x + p.y * b.south.y + p.z * b.south.z);
}

export function moveOnPlanet(from: Position, forward: number, right: number, metres: number,
    canStand: (x: number, z: number) => boolean): { position: Position; distance: number; blocked: boolean } {
    if (![forward, right, metres].every(Number.isFinite) || metres <= 0 || (!forward && !right))
        return { position: { ...from }, distance: 0, blocked: false };
    // Even a fast run / delayed frame must test narrow doors rather than leap
    // from one valid side of a wall to the other.
    const steps = Math.ceil(Math.min(metres, 4) / .1), step = Math.min(metres, 4) / steps;
    let position = { ...from }, distance = 0;
    for (let i = 0; i < steps; i++) {
        const candidate = planetStep(position, forward, right, step);
        if (!canStand(candidate.x, candidate.z)) return { position, distance, blocked: true };
        position = candidate;
        distance += step;
    }
    return { position, distance, blocked: false };
}
