import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanetSocial } from "../src/client/planet-social.ts";
import type { Position, Person, PlacedSound } from "../src/shared/protocol.ts";
import type { NpcRoutineFrame } from "../src/shared/npc-routines.ts";

const npc = (): NpcRoutineFrame => ({ id: "rowan", label: "Rowan · resident NPC", avatar: "dog", x: 13.5, z: 5.7, yaw: 0, phase: "occupied", occupying: true, hutId: "planet-toilet", phaseStartedAt: "2026-11-07T10:00:00Z" });
describe("in-world nearby chat and private room access", () => {
    let dom: JSDOM, social: PlanetSocial, now: number, at: Position, people: (Person & Position)[], npcs: NpcRoutineFrame[], sounds: PlacedSound[];
    let options: ConstructorParameters<typeof PlanetSocial>[1];
    beforeEach(() => {
        dom = new JSDOM('<!doctype html><main id="host"><canvas></canvas><form id="planet-chat" hidden><label id="planet-chat-to"></label><input></form></main>');
        vi.stubGlobal("document", dom.window.document);vi.stubGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement);vi.stubGlobal("AbortController", dom.window.AbortController);vi.stubGlobal("performance", { now: () => now });
        now = 0;at = { x: 0, z: 3, yaw: Math.PI };people = [];npcs = [];sounds = [];
        options = { at: () => at, you: () => ({ id: "me", name: "Me", avatar: "cat" }), people: () => people, npcs: () => npcs, sounds: () => sounds,
            joined: () => true, connected: () => true, project: () => ({ x: 50, y: 80, visible: true }),
            openChat: vi.fn(), closeChat: vi.fn(), walk: vi.fn(), stay: vi.fn(async () => null), notice: vi.fn() };
        social = new PlanetSocial(document.getElementById("host")!, options);
    });
    afterEach(() => { social?.dispose();dom.window.close();vi.unstubAllGlobals(); });
    const frame = () => {now += 101;social.frame();};

    it("offers a visible talk action for real nearby people, excludes self and NPCs, and respects the spherical seam", () => {
        at = { x: Math.PI * 22 - .8, z: 0, yaw: 0 };
        people = [{ id: "me", name: "Me", avatar: "cat", ...at }, { id: "friend", name: "Bo", avatar: "dog", x: -Math.PI * 22 + .8, z: 0, yaw: 0 }, { id: "far", name: "Far", avatar: "cat", x: 0, z: 0, yaw: 0 }];
        npcs = [npc()];frame();
        expect(social.talk.hidden).toBe(false);expect(social.talk.textContent).toBe("Talk · 1 nearby");
        expect(social.talk.getAttribute("aria-label")).toBe("Talk with Bo");social.talk.click();expect(options.openChat).toHaveBeenCalledOnce();
        document.getElementById("planet-chat")!.hidden = false;frame();expect(social.talk.hidden).toBe(true);expect(document.getElementById("planet-chat-to")!.textContent).toBe("Talk with Bo");
    });
    it("gives keyboard access from the canvas without treating form typing as commands", () => {
        document.querySelector("canvas")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "t", bubbles: true }));expect(options.openChat).toHaveBeenCalledOnce();
        document.querySelector("input")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "t", bubbles: true }));expect(options.openChat).toHaveBeenCalledOnce();
        document.getElementById("planet-chat")!.hidden = false;
        document.querySelector("input")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));expect(options.closeChat).toHaveBeenCalledOnce();
    });
    it("reveals walk-in, private stay and exit actions next to the actual room, and stops offering entry during authoritative occupancy", () => {
        expect(social.restroom.hidden).toBe(true);at = { x: 13.5, z: 3.9, yaw: Math.PI };frame();expect(social.restroom.hidden).toBe(true);
        at = { x: 13.5, z: 8.2, yaw: Math.PI };frame();expect(social.restroom.hidden).toBe(false);
        const status = document.getElementById("planet-restroom-live")!.firstChild;frame();expect(document.getElementById("planet-restroom-live")!.firstChild).toBe(status);
        document.getElementById("planet-enter-room")!.click();expect(options.walk).toHaveBeenCalledExactlyOnceWith({ x: 13.5, z: 5.5, yaw: Math.PI });
        document.getElementById("planet-switch-room")!.click();expect(options.walk).toHaveBeenLastCalledWith({ x: 18, z: 8.25, yaw: Math.PI });
        npcs = [npc()];frame();expect((document.getElementById("planet-enter-room") as HTMLButtonElement).disabled).toBe(true);expect(social.restroom.textContent).toContain("Rowan is using");
        npcs = [];people = [{ id: "bo", name: "Bo", avatar: "dog", x: 13.5, z: 5.9, yaw: 0 }];frame();expect(social.restroom.textContent).toContain("Bo is inside");
        people = [];at = { x: 13.5, z: 5.9, yaw: Math.PI };frame();expect(document.getElementById("planet-switch-room")!.hidden).toBe(true);expect(document.getElementById("planet-stay-action")!.hidden).toBe(false);expect(document.getElementById("planet-enter-room")!.hidden).toBe(true);
        document.getElementById("planet-leave-room")!.click();expect(options.walk).toHaveBeenLastCalledWith({ x: 13.5, z: 8.25, yaw: Math.PI });
    });
    it("lets residents keep their own routine without offering a player invitation or lock-test action", () => {
        at = { x: 13.5, z: 8.2, yaw: Math.PI };frame();
        expect(social.restroom.hidden).toBe(false);
        expect(document.getElementById("planet-invite-resident")).toBeNull();
        expect([...social.restroom.querySelectorAll("button")].some(button => /invite|try the lock|test with/i.test(button.textContent ?? ""))).toBe(false);
        npcs = [npc()];frame();
        expect((document.getElementById("planet-enter-room") as HTMLButtonElement).disabled).toBe(true);
        expect(document.getElementById("planet-restroom-live")!.textContent).toContain("Rowan is using");
    });
    it("starts a shower only on an explicit action and prevents duplicate pending requests", async () => {
        let resolve!: (error: string | null) => void;options.stay = vi.fn(() => new Promise<string | null>(done => {resolve = done;}));
        at = { x: 18, z: 5.9, yaw: Math.PI };frame();expect(options.stay).not.toHaveBeenCalled();
        const action = document.getElementById("planet-stay-action") as HTMLButtonElement;expect(action.textContent).toBe("Run shower");action.click();action.click();expect(options.stay).toHaveBeenCalledExactlyOnceWith("shower");expect(action.disabled).toBe(true);
        resolve(null);await Promise.resolve();await Promise.resolve();
        sounds = [{ id: "stay", byId: "me", by: "Me", soundId: "shower", x: at.x, z: at.z, at: "2026-11-07T10:00:00Z", whileIn: "planet-shower" }];frame();expect(action.textContent).toBe("Shower running");expect(action.disabled).toBe(true);
        at = { x: 18, z: 8.5, yaw: Math.PI };sounds = [];frame();expect(action.hidden).toBe(true);expect(document.getElementById("planet-enter-room")!.hidden).toBe(false);
        document.getElementById("planet-switch-room")!.click();expect(options.walk).toHaveBeenLastCalledWith({ x: 13.5, z: 8.25, yaw: Math.PI });
    });
    it("lets a player dismiss room controls and explicitly reopen them without losing movement", () => {
        at = { x: 13.5, z: 8.2, yaw: Math.PI };frame();document.getElementById("planet-restroom-dismiss")!.click();frame();expect(social.restroom.hidden).toBe(true);
        const reopen = document.getElementById("planet-restroom-reopen")!;expect(reopen.hidden).toBe(false);reopen.click();expect(social.restroom.hidden).toBe(false);
        document.getElementById("planet-restroom-dismiss")!.click();at = { x: 0, z: 3, yaw: 0 };frame();at = { x: 13.5, z: 8.2, yaw: 0 };frame();expect(social.restroom.hidden).toBe(false);
    });
    it("shows escaped speaker words for five seconds, replaces their previous bubble, and removes all on disposal", () => {
        people = [{ id: "bo", name: "Bo", avatar: "dog", x: 1, z: 3, yaw: 0 }];
        social.receiveWords("bo", "Bo", "<img src=x onerror=alert(1)>");expect(document.querySelector(".planet-speech img")).toBeNull();expect(document.querySelector(".planet-speech")!.textContent).toContain("<img");
        social.receiveWords("bo", "Bo", "Meet at the cafe?");expect(document.querySelectorAll(".planet-speech").length).toBe(1);expect(document.querySelector(".planet-speech")!.textContent).toBe("Bo: Meet at the cafe?");
        now += 5001;social.frame();expect(document.querySelector(".planet-speech")).toBeNull();social.receiveWords("bo", "Bo", "Bye");social.dispose();expect(document.querySelector(".planet-speech")).toBeNull();expect(document.getElementById("planet-talk")).toBeNull();
    });
});
