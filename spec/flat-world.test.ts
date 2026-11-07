import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canStandFlat, flatMovementBearing, FlatWorld, projectFlat, unprojectFlat, type FlatMode, type FlatProjection } from "../src/client/flat-world.ts";
import { PLANET_HALF, planetDistance, planetStep } from "../src/shared/planet.ts";
import { deriveChorusWorks } from "../src/shared/chorus.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const painters = vi.hoisted(() => ({ object: vi.fn(), person: vi.fn(), backdrop: vi.fn() }));
vi.mock("../src/client/flat-art.js",() => ({ drawFlatObject: painters.object,drawFlatPerson: painters.person,drawFlatBackdrop: painters.backdrop }));

describe("two screen projections of the same spherical world",() => {
    for (const mode of ["2d","2.5d"] as const) {
        it(`${mode} inverts the same persisted coordinates at both grading sizes and across the seam`,() => {
            for (const [width,height] of [[1920,1080],[390,844]]) for (const center of [{ x: 1.8,z: 2.2 },{ x: PLANET_HALF-.5,z: 8 }]) {
                const view: FlatProjection = { mode,width,height,scale: 28,center };
                for (const at of [{ x: 0,z: 0 },{ x: -9,z: -7 },{ x: 13.5,z: 5.5 },{ x: -PLANET_HALF+.5,z: 8 }]) {
                    const result = unprojectFlat(projectFlat(at,view),view);
                    expect(planetDistance(result,at)).toBeLessThan(1e-9);
                }
            }
        });
        it(`${mode} arrows move in their visible direction, rather than a hidden camera heading`,() => {
            const at = { x: -9,z: -7,yaw: 0 },view: FlatProjection = { mode,width: 390,height: 844,scale: 28,center: at };
            const start = projectFlat(at,view);
            for (const [right,down] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,1]]) {
                const yaw = flatMovementBearing(mode,right,down,at.z),end = projectFlat(planetStep({ ...at,yaw },1,0,.01),view);
                const dx = end.x-start.x,dy = end.y-start.y;
                if (right) expect(Math.sign(dx)).toBe(right);else expect(Math.abs(dx)).toBeLessThan(.001);
                if (down) expect(Math.sign(dy)).toBe(down);else expect(Math.abs(dy)).toBeLessThan(.001);
            }
        });
    }
    it("isometric presentation changes the visible arrangement without moving the source",() => {
        const common = { width: 390,height: 844,scale: 28,center: { x: 0,z: 0 } },at = { x: 4,z: 0 };
        const flat = projectFlat(at,{ ...common,mode: "2d" }),iso = projectFlat(at,{ ...common,mode: "2.5d" });
        expect(flat.y).toBe(common.height*.46);expect(iso.y).toBeGreaterThan(flat.y+35);
        expect(unprojectFlat(iso,{ ...common,mode: "2.5d" })).toEqual({ x: expect.closeTo(4,10),z: expect.closeTo(0,10) });
    });
});

describe("illustrated walls and real private-room admission",() => {
    it("keeps an occupied room closed while letting its own occupant leave through the actual door",() => {
        const locked = new Set(["planet-toilet"]);
        expect(canStandFlat(13.5,5.5,locked)).toBe(false);
        expect(canStandFlat(13.5,5.5,locked,"planet-toilet")).toBe(true);
        expect(canStandFlat(13.5,7.2,new Set())).toBe(true);
        expect(canStandFlat(12.3,7.1,new Set())).toBe(false);
        expect(canStandFlat(13.5,4.1,new Set(),"planet-toilet")).toBe(false);
        expect(canStandFlat(18,5.5,locked)).toBe(true);
    });
    it("keeps the water and common sculpture bases solid while retaining open café access",() => {
        expect(canStandFlat(0,30,new Set())).toBe(false);
        expect(canStandFlat(0,0,new Set())).toBe(false);
        expect(canStandFlat(10,-9,new Set())).toBe(false);
        expect(canStandFlat(-9,-7,new Set())).toBe(true);
        expect(canStandFlat(NaN,0,new Set())).toBe(false);
    });
});

describe("illustrated live state, lifecycle and input isolation",() => {
    let dom: JSDOM,world: FlatWorld | undefined,now: number,raf: FrameRequestCallback;
    const sources = (): PlacedSound[] => [
        { id: "a",soundId: "trickle",x: 1.8,z: 2.2,by: "A",byId: "a-person",at: "2026-11-08T00:00:00Z" },
        { id: "b",soundId: "evening-forest",x: 2,z: 2,by: "B",byId: "b-person",replyToId: "a",at: "2026-11-08T00:00:01Z" },
    ];
    beforeEach(() => {
        dom = new JSDOM('<!doctype html><main id="host"></main><input id="chat">');now = 100;
        const gradient = { addColorStop: vi.fn() },ctx = new Proxy({ measureText: () => ({ width: 40 }),createRadialGradient: () => gradient },{ get: (target,key) => key in target ? target[key as keyof typeof target] : () => {},set: () => true });
        vi.stubGlobal("window",dom.window);vi.stubGlobal("document",dom.window.document);vi.stubGlobal("AbortController",dom.window.AbortController);
        vi.stubGlobal("performance",{ now: () => now });vi.stubGlobal("ResizeObserver",class { observe() {} disconnect() {} });
        vi.stubGlobal("requestAnimationFrame",(callback: FrameRequestCallback) => {raf = callback;return 1;});vi.stubGlobal("cancelAnimationFrame",vi.fn());
        Object.defineProperty(dom.window,"matchMedia",{ value: () => ({ matches: false }) });
        vi.spyOn(dom.window.HTMLCanvasElement.prototype,"getContext").mockReturnValue(ctx as never);
        Object.defineProperties(document.getElementById("host")!,{ clientWidth: { value: 390 },clientHeight: { value: 844 } });
        painters.object.mockClear();painters.person.mockClear();painters.backdrop.mockClear();
    });
    afterEach(() => {world?.dispose();world = undefined;dom.window.close();vi.unstubAllGlobals();vi.restoreAllMocks();});
    const start = (mode: FlatMode = "2d"): FlatWorld => world = new FlatWorld(document.getElementById("host")!,{ listen: vi.fn(),area: vi.fn(),wait: vi.fn() },mode);
    const frame = (ms = 20): void => {now += ms;raf(now);};
    const installation = (): unknown[] => painters.object.mock.calls.filter(call => ["canopy","beat-flower","lantern"].includes(call[1]));

    it("draws a canonical cross-person work, then removes its shared form and withdrawn source",() => {
        start("2.5d");const rows = sources();world!.setContributions(rows);world!.setWorks(deriveChorusWorks(rows));frame();
        const canopy = painters.object.mock.calls.find(call => call[1] === "canopy");expect(canopy).toBeDefined();expect(canopy![2].duet).toBe(true);expect(canopy![2].authors).toEqual(["a-person","b-person"]);
        expect(canopy![2].sourceIds).toEqual(["a","b"]);
        rows[1].removedAt = "2026-11-08T00:00:02Z";painters.object.mockClear();world!.setContributions(rows);world!.setWorks(deriveChorusWorks(rows));frame();
        expect(painters.object.mock.calls.some(call => call[1] === "canopy")).toBe(false);
        expect(painters.object.mock.calls.filter(call => call[1] === "sound").map(call => call[2].seed)).toEqual(["a"]);
        const lantern = painters.object.mock.calls.find(call => call[1] === "lantern");expect(lantern![2].duet).toBe(false);
        rows[0].removedAt = "2026-11-08T00:00:03Z";painters.object.mockClear();world!.setContributions(rows);world!.setWorks(deriveChorusWorks(rows));frame();expect(installation()).toHaveLength(0);
    });
    it("does not mistake a same-identity answer, NPC or local companion for a second author",() => {
        start();world!.setSelf({ id: "a-person",name: "A",avatar: "cat" });const rows = sources();rows[1].byId = rows[0].byId;world!.setContributions(rows);world!.setWorks(deriveChorusWorks(rows));frame();
        const canopy = painters.object.mock.calls.find(call => call[1] === "canopy");expect(canopy![2].duet).toBe(false);expect(canopy![2].authors).toEqual(["a-person"]);
        expect(document.getElementById("host")!.dataset.players).toBe("[]");
        const self = painters.person.mock.calls.find(call => call[1].self);expect(self![1].seed).toBe("a-person");expect(self![1].authors).toEqual(["a-person"]);expect(self![1].color).toBeUndefined();
    });
    it("pauses movement and jump while a form is open, without listening to input typing",() => {
        start();const canvas = world!.renderer.domElement,startAt = world!.at;
        document.getElementById("chat")!.dispatchEvent(new dom.window.KeyboardEvent("keydown",{ key: "d",bubbles: true }));frame(100);expect(planetDistance(startAt,world!.at)).toBe(0);
        world!.setPaused(true);canvas.dispatchEvent(new dom.window.KeyboardEvent("keydown",{ key: "d",bubbles: true }));expect(world!.jump()).toBe(false);frame(100);expect(planetDistance(startAt,world!.at)).toBe(0);
        world!.setPaused(false);canvas.dispatchEvent(new dom.window.KeyboardEvent("keydown",{ key: "d",bubbles: true }));frame(100);expect(planetDistance(startAt,world!.at)).toBeGreaterThan(.3);
        world!.setPaused(true);frame(100);expect(world!.walkingIntent).toBe(false);expect(world!.running).toBe(false);
    });
    it("uses only a 2D canvas and removes its controls and animation on disposal",() => {
        start();expect(document.getElementById("host")!.dataset.renderEngine).toBe("canvas2d");
        const calls = vi.mocked(dom.window.HTMLCanvasElement.prototype.getContext).mock.calls;expect(calls.map(call => call[0])).toEqual(["2d"]);
        expect(document.querySelectorAll(".planet-touch button")).toHaveLength(4);world!.dispose();expect(document.querySelector("canvas")).toBeNull();expect(document.querySelector(".planet-touch")).toBeNull();expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
