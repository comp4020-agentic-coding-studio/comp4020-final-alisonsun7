// Small authored routines, sampled from shared server time. No visitor,
// arrival time, accumulated dt, network action or random state participates.
import { planetCoordsValid, planetDistance, planetStep } from "../shared/planet.js";
import { bearingToward } from "./planet-locomotion.js";
import { RESIDENT_SETTLE_MS } from "../shared/sound-response.js";

export type LifePoint = { x: number; z: number };
export type ResidentLifeAction = "rest" | "work" | "talk";
export interface ResidentLifePlan {
    group: string;
    waypoints: readonly (LifePoint & { action?: ResidentLifeAction })[];
    periodSeconds?: number;
    pauseFraction?: number;
    offsetSeconds?: number;
    partnerId?: string;
}
export interface ResidentLifeSample extends LifePoint {
    yaw: number;
    walking: boolean;
    action: ResidentLifeAction;
    phase: number;
    slot: number;
}
export interface ResidentLifeGeometry {
    surfaceHeight(x: number, z: number): number;
    canStand(x: number, z: number): boolean;
}
export interface PreparedResidentLife {
    plan: ResidentLifePlan;
    fallback: LifePoint;
    blocked: boolean;
    reason: "invalid-plan" | "blocked-route" | "no-safe-stop" | null;
}
const ease = (t: number): number => { const p = Math.max(0, Math.min(1, t));return p * p * (3 - 2 * p); };
const modulo = (value: number, period: number): number => ((value % period) + period) % period;
export function residentLifeSeed(id: string): number {
    let hash = 2166136261;for (const letter of id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
    return (hash >>> 0) / 0x1_0000_0000;
}
export function validResidentLifePlan(plan: ResidentLifePlan): boolean {
    const period = plan.periodSeconds ?? 48, pause = plan.pauseFraction ?? .62;
    return typeof plan.group === "string" && plan.group.length > 0 && plan.group.length <= 100
        && Number.isFinite(period) && period >= 32 && period <= 60
        && Number.isFinite(pause) && pause >= .35 && pause <= .8
        && Number.isFinite(plan.offsetSeconds ?? 0) && plan.waypoints.length >= 1 && plan.waypoints.length <= 8
        && plan.waypoints.every(point => planetCoordsValid(point.x, point.z)
            && (point.action === undefined || ["rest", "work", "talk"].includes(point.action)))
        && plan.waypoints.every((point, index) => planetDistance(point, plan.waypoints[(index + 1) % plan.waypoints.length]) <= 12);
}
export function lifePointBetween(from: LifePoint, to: LifePoint, fraction: number): LifePoint {
    const distance = planetDistance(from, to);
    if (distance < .000001) return { x: from.x, z: from.z };
    const at = planetStep({ ...from, yaw: bearingToward({ ...from, yaw: 0 }, to) }, 1, 0, distance * Math.max(0, Math.min(1, fraction)));
    return { x: at.x, z: at.z };
}
export function sampleResidentLife(plan: ResidentLifePlan, serverNow: number): ResidentLifeSample | null {
    if (!Number.isFinite(serverNow) || !validResidentLifePlan(plan)) return null;
    const period = plan.periodSeconds ?? 48, slotSeconds = period / plan.waypoints.length;
    const time = modulo(serverNow / 1000 + residentLifeSeed(plan.group) * period + (plan.offsetSeconds ?? 0), period);
    const slot = Math.min(plan.waypoints.length - 1, Math.floor(time / slotSeconds));
    const phase = time / slotSeconds - slot, hold = plan.pauseFraction ?? .62;
    const from = plan.waypoints[slot], to = plan.waypoints[(slot + 1) % plan.waypoints.length];
    const fraction = phase <= hold ? 0 : ease((phase - hold) / (1 - hold));
    const distance = planetDistance(from, to), walking = fraction > 0 && fraction < 1 && distance > .01;
    return { ...lifePointBetween(from, to, fraction), yaw: distance > .001 ? bearingToward({ ...from, yaw: 0 }, to) : 0,
        walking, action: from.action ?? "rest", phase, slot };
}
/** Check the whole path, including its start and intermediate floor changes. */
export function safeResidentLifePath(from: LifePoint, to: LifePoint, geometry: ResidentLifeGeometry): boolean {
    if (!planetCoordsValid(from.x, from.z) || !planetCoordsValid(to.x, to.z)) return false;
    const distance = planetDistance(from, to), steps = Math.max(1, Math.ceil(distance / .1));
    let lastHeight = geometry.surfaceHeight(from.x, from.z);
    if (!geometry.canStand(from.x, from.z) || !Number.isFinite(lastHeight)) return false;
    for (let index = 1; index <= steps; index++) {
        const point = lifePointBetween(from, to, index / steps), height = geometry.surfaceHeight(point.x, point.z);
        if (!geometry.canStand(point.x, point.z) || !Number.isFinite(height) || Math.abs(height - lastHeight) > .16) return false;
        lastHeight = height;
    }
    return true;
}
/** A blocked tour is a fixed safe stop, never a per-frame pursuit of a
 * different waypoint. Both late and long-running pages use the same fallback.
 */
export function prepareResidentLife(plan: ResidentLifePlan, home: LifePoint, geometry: ResidentLifeGeometry): PreparedResidentLife {
    const copy: ResidentLifePlan = { ...plan, waypoints: plan.waypoints.map(point => ({ ...point })) };
    const candidates = [...copy.waypoints, home];
    const fallback = candidates.find(point => planetCoordsValid(point.x, point.z) && geometry.canStand(point.x, point.z)
        && Number.isFinite(geometry.surfaceHeight(point.x, point.z)));
    if (!fallback) return { plan: copy, fallback: { ...home }, blocked: true, reason: "no-safe-stop" };
    if (!validResidentLifePlan(copy)) return { plan: copy, fallback: { x: fallback.x, z: fallback.z }, blocked: true, reason: "invalid-plan" };
    const blocked = copy.waypoints.some((point, index) => !safeResidentLifePath(point, copy.waypoints[(index + 1) % copy.waypoints.length], geometry));
    return { plan: copy, fallback: { x: fallback.x, z: fallback.z }, blocked, reason: blocked ? "blocked-route" : null };
}
/** A new ingredient gets a clear initial response. Lasting ingredients are
 * revisited for eight seconds per thirty, leaving room for ordinary life.
 * Smooth boundaries avoid jumping to or from the attention stop.
 */
export function residentAttentionWeight(id: string, group: string, sourceAt: number, serverNow: number): number {
    const age = serverNow - sourceAt - RESIDENT_SETTLE_MS;
    if (![age, sourceAt, serverNow].every(Number.isFinite) || age < 0) return 0;
    const first = age < 7000 ? ease(age / 700) * ease((7000 - age) / 1000) : 0;
    const since = age - 22_000 - residentLifeSeed(`${group}:${id}`) * 6000;
    const phase = since < 0 ? -1 : modulo(since, 30_000);
    const periodic = phase >= 0 && phase < 8000 ? ease(phase / 700) * ease((8000 - phase) / 700) : 0;
    return Math.max(first, periodic);
}
export function residentConversationRole(id: string, partnerId: string, group: string, serverNow: number, reducedMotion: boolean): "speaking" | "listening" {
    const turn = reducedMotion ? 0 : modulo(Math.floor(serverNow / 3200 + residentLifeSeed(group) * 2), 2);
    return Number(id > partnerId) === turn ? "speaking" : "listening";
}
