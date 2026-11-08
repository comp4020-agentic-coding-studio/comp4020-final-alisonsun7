import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AnimalFigure } from "../src/client/characters.ts";
import type { ResidentDefinition } from "../src/client/sound-residents.ts";
import type { SoundSignal } from "../src/shared/sound-response.ts";
import { PLANET_HALF, planetDistance } from "../src/shared/planet.ts";
import { prepareResidentLife, sampleResidentLife, validResidentLifePlan, type ResidentLifePlan } from "../src/client/resident-life.ts";

// A frozen pre-life controller can be selected without replacing production
// files or touching a database. It genuinely lacks the new activity behaviour.
const { SoundResidents } = await import(process.env.RESIDENT_CONTROLLER_UNDER_TEST ?? "../src/client/sound-residents.ts") as typeof import("../src/client/sound-residents.ts");
const now = Date.parse("2026-11-08T10:00:00Z");
const geometry = { surfaceHeight: () => .4, canStand: () => true, distanceBetween: planetDistance };
const loop: ResidentLifePlan = { group: "garden-round", periodSeconds: 40, pauseFraction: .6,
    waypoints: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }] };
function figure() {
    const sprite = new THREE.Group();
    for (const name of ["hip-rig", "upper-body-rig", "head-rig", "right-shoulder", "right-elbow", "right-knee"]) {
        const bone = new THREE.Bone();bone.name = name;sprite.add(bone);
    }
    const actor = sprite as unknown as AnimalFigure & { setConversation: ReturnType<typeof vi.fn> };
    actor.setFacing = yaw => { sprite.rotation.y = yaw; };
    actor.setPose = vi.fn();actor.setMotion = vi.fn(() => { sprite.children.forEach(bone => bone.rotation.set(0, 0, 0)); });
    actor.setConversation = vi.fn<AnimalFigure["setConversation"]>();actor.dispose = vi.fn();return actor;
}
const definition = (id = "neighbour", life: ResidentLifePlan = loop): ResidentDefinition => ({ id, label: "Neighbour · NPC", x: 0, z: 0, preference: "cozy", facing: 0, life });
const source = (id: string, at = now): SoundSignal => ({ id, soundId: "guitar", x: 8, z: 0, at: new Date(at).toISOString() });

describe("authored daily life remains actual movement and conversation", () => {
    it("walks and pauses through the whole tour with identical late-arrival and high/low-rate states", () => {
        const early = new SoundResidents(geometry), late = new SoundResidents(geometry), a = figure(), b = figure();
        early.add(definition(), a);late.add(definition(), b);
        const observed = [];
        for (let offset = 0; offset <= 40_000; offset += 200) { early.frame(now + offset, .2);observed.push({ ...early.activities[0] }); }
        const final = now + 43_725;
        early.frame(final, .017);late.frame(final, .25);
        expect(early.activities).toEqual(late.activities);expect(a.position.toArray()).toEqual(b.position.toArray());
        expect(observed.some(state => state.walking)).toBe(true);expect(observed.some(state => !state.walking)).toBe(true);
        expect(Math.max(...observed.map(state => state.x)) - Math.min(...observed.map(state => state.x))).toBeGreaterThan(1.8);
        expect(observed.every(state => state.sourceId === null && !state.attending)).toBe(true);
        expect((a.setMotion as ReturnType<typeof vi.fn>).mock.calls.some(([, walking]) => walking)).toBe(true);
        expect((a.setPose as ReturnType<typeof vi.fn>).mock.calls.some(([pose]) => pose === "walk")).toBe(true);
        early.dispose();late.dispose();
    });

    it("faces a physically nearby partner and alternates speaking/listening regardless of add order", () => {
        const make = (reverse: boolean) => {
            const residents = new SoundResidents(geometry), a = figure(), b = figure();
            const plans = [
                { id: "a", actor: a, plan: { group: "table-pair", partnerId: "b", waypoints: [{ x: -1, z: 0, action: "talk" as const }] } },
                { id: "b", actor: b, plan: { group: "table-pair", partnerId: "a", waypoints: [{ x: 1, z: 0, action: "talk" as const }] } },
            ];
            for (const person of reverse ? [...plans].reverse() : plans) residents.add(definition(person.id, person.plan), person.actor);
            return { residents, a, b };
        };
        const first = make(false), second = make(true);
        first.residents.frame(now, .017);second.residents.frame(now, .25);
        const initial = first.residents.activities;
        expect([...initial].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...second.residents.activities].sort((a, b) => a.id.localeCompare(b.id)));
        expect(initial.map(state => state.role).sort()).toEqual(["listening", "speaking"]);
        expect(initial.find(state => state.id === "a")?.yaw).toBeCloseTo(Math.PI / 2, 8);
        expect(initial.find(state => state.id === "b")?.yaw).toBeCloseTo(-Math.PI / 2, 8);
        expect(first.a.setConversation).toHaveBeenCalledOnce();expect(first.b.setConversation).toHaveBeenCalledOnce();
        first.residents.frame(now + 3200, .017);
        for (const state of first.residents.activities) expect(state.role).not.toBe(initial.find(prior => prior.id === state.id)?.role);
        first.residents.dispose();second.residents.dispose();
    });

    it("never converses across a long gap or while a partner is walking", () => {
        const residents = new SoundResidents(geometry), a = figure(), b = figure();
        residents.add(definition("a", { group: "far", partnerId: "b", waypoints: [{ x: -4, z: 0, action: "talk" }] }), a);
        residents.add(definition("b", { group: "far", partnerId: "a", waypoints: [{ x: 4, z: 0, action: "talk" }] }), b);
        residents.frame(now, .017);expect(residents.activities.every(state => state.role === null && state.partnerId === null)).toBe(true);
        expect(a.setConversation).not.toHaveBeenCalled();expect(b.setConversation).not.toHaveBeenCalled();residents.dispose();
        const walkers = new SoundResidents(geometry), c = figure(), d = figure();
        walkers.add(definition("a", { ...loop, group: "moving-pair", partnerId: "b", waypoints: loop.waypoints.map(point => ({ ...point, action: "talk" })) }), c);
        walkers.add(definition("b", { ...loop, group: "moving-pair", partnerId: "a", waypoints: loop.waypoints.map(point => ({ x: point.x + .8, z: point.z, action: "talk" })) }), d);
        let checkedMoving = false;
        for (let offset = 0; offset <= 40_000; offset += 200) {
            walkers.frame(now + offset, .2);
            if (walkers.activities.some(state => state.walking)) { expect(walkers.activities.every(state => state.role === null)).toBe(true);checkedMoving = true; }
        }
        expect(checkedMoving).toBe(true);walkers.dispose();
    });

    it("keeps source response priority and true metadata without teleporting a routine after additions/removal", () => {
        const reacting = new SoundResidents(geometry), quiet = new SoundResidents(geometry), a = figure(), b = figure();
        reacting.add(definition(), a);quiet.add(definition(), b);reacting.setContributions([source("real-music")]);
        const attention = [];
        for (let offset = 2500; offset < 70_000; offset += 250) {
            reacting.frame(now + offset, .25);quiet.frame(now + offset, .017);
            const actual = reacting.activities[0];attention.push(actual.attending);
            expect(actual.sourceId).toBe("real-music");expect(reacting.responses[0]?.sourceId).toBe("real-music");
            expect(a.position.toArray()).toEqual(b.position.toArray());
        }
        expect(attention.includes(true) && attention.includes(false)).toBe(true);
        reacting.setContributions([]);reacting.frame(now + 70_250, .25);quiet.frame(now + 70_250, .017);
        expect(a.position.toArray()).toEqual(b.position.toArray());expect(reacting.responses).toHaveLength(0);
        expect(reacting.activities[0].sourceId).toBeNull();expect(reacting.activities[0].attending).toBe(false);
        expect(a.userData.residentLife).toEqual(reacting.activities[0]);reacting.dispose();quiet.dispose();
    });

    it("promotes a shared real chat source to two-person gestures at a safe stop", () => {
        const residents = new SoundResidents(geometry), a = figure(), b = figure();
        for (const [id, actor, x, partnerId] of [["a", a, -1, "b"], ["b", b, 1, "a"]] as const)
            residents.add(definition(id, { group: "coffee", partnerId, waypoints: [{ x, z: 0, action: "rest" }] }), actor);
        residents.setContributions([{ ...source("actual-coffee-chat"), soundId: "cafe-chatter" }]);
        residents.frame(now + 3500, .017);
        expect(residents.activities.map(state => state.role).sort()).toEqual(["listening", "speaking"]);
        expect(residents.activities.every(state => state.attending && state.sourceId === "actual-coffee-chat")).toBe(true);
        expect(residents.responses.every(state => state.sourceId === "actual-coffee-chat" && state.behavior === "chat")).toBe(true);
        residents.dispose();
    });

    it("rejects blocked intermediate paths and floor drops as a stationary safe fallback, including late arrivals", () => {
        for (const obstruction of [
            { ...geometry, canStand: (x: number) => !(x > .8 && x < 1.2) },
            { ...geometry, surfaceHeight: (x: number) => x > .8 ? -.5 : .4 },
        ]) {
            const first = new SoundResidents(obstruction), second = new SoundResidents(obstruction), a = figure(), b = figure();
            first.add(definition(), a);second.add(definition(), b);
            for (let offset = 0; offset < 40_000; offset += 333) first.frame(now + offset, .333);
            first.frame(now + 42_000, .017);second.frame(now + 42_000, .25);
            expect(first.activities).toEqual(second.activities);expect(a.position.toArray()).toEqual([0, .4, 0]);
            expect(first.activities[0]).toMatchObject({ blocked: true, blockedReason: "blocked-route", walking: false, activity: "blocked" });
            first.dispose();second.dispose();
        }
    });

    it("holds reduced motion at one safe authored stop through time and source changes, leaving old no-plan behaviour intact", () => {
        const plan = { ...loop, waypoints: loop.waypoints.map((point, index) => ({ ...point, action: index % 2 ? "work" as const : "rest" as const })) };
        const residents = new SoundResidents(geometry), actor = figure();residents.add({ ...definition("calm", plan), x: 5 }, actor);
        residents.setContributions([source("quiet-call")]);residents.frame(now + 3500, .017, true);
        const position = actor.position.toArray(), bones = actor.children.map(bone => bone.rotation.toArray()), state = residents.activities[0];
        residents.frame(now + 41_000, .25, true);
        expect(actor.position.toArray()).toEqual(position);expect(actor.children.map(bone => bone.rotation.toArray())).toEqual(bones);
        expect(residents.activities[0].slot).toBe(state.slot);expect(residents.activities[0].walking).toBe(false);
        residents.setContributions([]);residents.frame(now + 42_000, .017, true);expect(actor.position.toArray()).toEqual(position);
        residents.dispose();expect(actor.userData.residentLife).toBeUndefined();
        const legacy = new SoundResidents(geometry), existing = figure(), { life: _life, ...oldDefinition } = definition();
        legacy.add(oldDefinition, existing);legacy.frame(now, .017);legacy.frame(now + 40_000, .25);
        expect(existing.position.toArray()).toEqual([0, .4, 0]);expect(legacy.activities).toEqual([]);legacy.dispose();
    });

    it("revalidates a tour only when actual shared geometry changes instead of using a stale collision cache", () => {
        let sculpture = false;
        const currentGeometry = { ...geometry, canStand: (x: number) => !sculpture || !(x > .8 && x < 1.2) };
        const early = new SoundResidents(currentGeometry), late = new SoundResidents(currentGeometry), a = figure(), b = figure();
        early.add(definition(), a);late.add(definition(), b);
        early.frame(now, .017);expect(early.activities[0].blocked).toBe(false);
        sculpture = true;early.refreshLifeGeometry();late.refreshLifeGeometry();
        early.frame(now + 10_000, .017);late.frame(now + 10_000, .25);
        expect(early.activities).toEqual(late.activities);
        expect(early.activities[0]).toMatchObject({ blocked: true, blockedReason: "blocked-route", walking: false, x: 0, z: 0 });
        sculpture = false;early.refreshLifeGeometry();early.frame(now + 20_000, .017);
        expect(early.activities[0].blocked).toBe(false);early.dispose();late.dispose();
    });
});

describe("canonical bounded life plans", () => {
    it("follows the short actual route over the longitude seam and rejects malformed or unbounded plans", () => {
        const seam = { group: "seam", waypoints: [{ x: -PLANET_HALF + .2, z: 0 }, { x: PLANET_HALF - .2, z: 0 }] };
        const prepared = prepareResidentLife(seam, seam.waypoints[0], { surfaceHeight: () => 0, canStand: x => Math.abs(x) > PLANET_HALF - 1 });
        expect(prepared.blocked).toBe(false);
        for (let offset = 0; offset <= 48_000; offset += 200) expect(Math.abs(sampleResidentLife(seam, now + offset)!.x)).toBeGreaterThan(PLANET_HALF - 1);
        for (const invalid of [{ ...loop, periodSeconds: 300 }, { ...loop, waypoints: [{ x: NaN, z: 0 }] }, { ...loop, waypoints: [{ x: 0, z: 0 }, { x: 20, z: 0 }] }])
            expect(validResidentLifePlan(invalid)).toBe(false);
        expect(sampleResidentLife(loop, NaN)).toBeNull();
    });
});
