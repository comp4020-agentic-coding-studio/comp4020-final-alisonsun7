// Two original illustrated views of the existing planet. A view never creates
// another room or rewrites a stored coordinate. Movement, hearing and admission
// retain their spherical metre metric; only the screen projection changes.
import * as THREE from "three";
import type { PlanetWorld } from "./planet-world.js";
import { PLANET_HALF, PLANET_RADIUS, PLANET_PLACES, PLANET_HUTS, planetDistance, planetPoint, planetBasis, planetLocal, canonicalPlanetPosition, sceneHutAt, type PlanetPlace } from "../shared/planet.js";
import type { Person, Position, PlacedSound, Moves } from "../shared/protocol.js";
import type { NpcRoutineFrame } from "../shared/npc-routines.js";
import { minuteAt, type Environment } from "../shared/environment.js";
import { CHORUS_BPM, CHORUS_PLACES, type ChorusWork } from "../shared/chorus.js";
import { FAMILIES, findSound } from "../shared/sounds.js";
import { chooseResidentResponse, type ResidentHome } from "../shared/sound-response.js";
import { coastlineAt, planetPierHeightAt } from "./planet-coast.js";
import { WALK_SPEED, RUN_SPEED, JUMP_DURATION, jumpHeight, bearingToward, moveOnPlanet } from "./planet-locomotion.js";
import { drawFlatBackdrop, drawFlatObject, drawFlatPerson, type FlatObjectKind, type FlatStyle } from "./flat-art.js";

export type FlatMode = "2d" | "2.5d";
type Point = { x: number; z: number };
export interface FlatProjection { mode: FlatMode; width: number; height: number; scale: number; center: Point; }
const wrap = (x: number): number => ((x + PLANET_HALF) % (PLANET_HALF * 2) + PLANET_HALF * 2) % (PLANET_HALF * 2) - PLANET_HALF;
/** Reversible presentation math, including the longitude seam. */
export function projectFlat(point: Point, view: FlatProjection, height = 0): { x: number; y: number } {
    const dx = wrap(point.x - view.center.x), dz = point.z - view.center.z, iso = view.mode === "2.5d";
    return { x: view.width / 2 + (iso ? (dx - dz) / Math.SQRT2 : dx) * view.scale,
        y: view.height * .46 + (iso ? (dx + dz) / Math.SQRT2 * .52 : dz * .85) * view.scale - height * view.scale };
}
export function unprojectFlat(point: { x: number; y: number }, view: FlatProjection): Point {
    const sx = (point.x - view.width / 2) / view.scale, sy = (point.y - view.height * .46) / view.scale;
    const dx = view.mode === "2.5d" ? (sx + sy / .52) / Math.SQRT2 : sx;
    const dz = view.mode === "2.5d" ? (sy / .52 - sx) / Math.SQRT2 : sy / .85;
    const canonical = canonicalPlanetPosition({ x: view.center.x + dx, z: view.center.z + dz, yaw: 0 });
    return { x: canonical.x, z: canonical.z };
}
/** Invert a screen-direction vector before taking the real great-circle step. */
export function flatMovementBearing(mode: FlatMode, screenRight: number, screenDown: number, latitude = 0): number {
    const x = mode === "2.5d" ? (screenRight + screenDown / .52) / Math.SQRT2 : screenRight;
    const z = mode === "2.5d" ? (screenDown / .52 - screenRight) / Math.SQRT2 : screenDown / .85;
    return Math.atan2(x * Math.cos(latitude / PLANET_RADIUS), z);
}
/** Identical authored floors, walls, door clearance and water boundary to 3D. */
export function canStandFlat(x: number, z: number, locked: ReadonlySet<string>, ownHut?: string): boolean {
    if (![x, z].every(Number.isFinite)) return false;
    if (z > coastlineAt(x) + .12 && planetPierHeightAt(x, z) === null) return false;
    if (PLANET_PLACES.some(p => (p.id === "green" || p.id === "stage") && planetDistance({ x, z }, p) < (p.id === "green" ? 1.05 : 1.5))) return false;
    for (const p of PLANET_PLACES.filter(p => ["tea", "reading", "workshop"].includes(p.kind))) {
        const { x: dx, z: dz } = planetLocal({ x, z }, p);
        if (Math.abs(dx) <= 2.7 && Math.abs(dz) <= 2.5 && (Math.abs(dx) > 2.15 || dz < -1.75)) return false;
    }
    for (const h of PLANET_HUTS) {
        if (x < h.x0 - .25 || x > h.x1 + .25 || z < h.z0 - .25 || z > h.z1 + .25) continue;
        if (x < h.x0 + .25 || x > h.x1 - .25 || z < h.z0 + .25) return false;
        if (z > h.z1 - .3 && (x < h.door.x0 + .15 || x > h.door.x1 - .15)) return false;
        if (locked.has(h.id) && h.id !== ownHut) return false;
    }
    return true;
}

type Options = ConstructorParameters<typeof PlanetWorld>[1];
type Actor = { person: Person; at: Position; target: Position; label: HTMLSpanElement; };
type Resident = ResidentHome & { name: string; avatar: "cat" | "dog"; };
const RESIDENTS: Resident[] = [
    { id: "green-neighbour", name: "Fern", avatar: "cat", x: -3, z: 1, preference: "cozy" },
    { id: "jam-neighbour", name: "Pip", avatar: "dog", x: 9, z: -6.8, preference: "lively" },
    { id: "reading-neighbour", name: "Moss", avatar: "cat", x: -12, z: 8.5, preference: "cozy" },
    { id: "garden-neighbour", name: "Clover", avatar: "dog", x: -.5, z: 14.5, preference: "wild" },
    { id: "coffee-barista", name: "Bean", avatar: "cat", x: -9.1, z: -7.55, preference: "lively" },
    { id: "coffee-reader", name: "Coco", avatar: "dog", x: -12.9, z: -4.5, preference: "cozy" },
    { id: "coffee-company", name: "Maple", avatar: "cat", x: -5.1, z: -4.5, preference: "lively" },
];

export class FlatWorld {
    // PlanetAudio consumes this camera's spherical basis and position. No
    // WebGLRenderer or GPU context is constructed by either illustrated view.
    readonly camera = new THREE.PerspectiveCamera(68, 1, .1, 220);
    readonly renderer: { domElement: HTMLCanvasElement };
    private context: CanvasRenderingContext2D;
    private overlay = document.createElement("div");
    private touch = document.createElement("div");
    private abort = new AbortController();
    private resizeObserver: ResizeObserver;
    private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    private position: Position = { x: 1.8, z: 2.2, yaw: Math.PI };
    private self: Person | null = null;
    private selfLabel: HTMLSpanElement | null = null;
    private people = new Map<string, Actor>();
    private npcs: NpcRoutineFrame[] = [];
    private npcLabels = new Map<string, HTMLSpanElement>();
    private publicSounds: PlacedSound[] = [];
    private works: ChorusWork[] = [];
    private focusedWork: string | null = null;
    private keys = new Set<string>();
    private paused = false;
    private runningRequested = false;
    private _running = false;
    private jumpingAt: number | null = null;
    private jumpOffset = 0;
    private walkingTarget: (Point & { stopDistance: number }) | null = null;
    private walkingRevision = 0;
    private zoom = 8;
    private pan: Point = { x: 0, z: 0 };
    private drag: { id: number; x: number; y: number; original: { x: number; y: number }; travel: number } | null = null;
    private width = 1;
    private height = 1;
    private pixelRatio = 1;
    private frameId = 0;
    private last = performance.now();
    private frameNumber = 0;
    private disposed = false;
    private hasEnvironment = false;
    private environment: Environment = { weather: "clear", minuteOfDay: 840, clockRunning: false, updatedAt: new Date().toISOString(), revision: 0 };
    private serverSample = { server: Date.now(), received: performance.now() };
    private companion = { x: -2.3, z: 1, yaw: .8, phase: "resting" as "resting" | "following" | "playing", height: 0, played: false, until: 0 };
    private companionAction: string | null = null;
    private lastWait = "";
    constructor(private host: HTMLElement, private opts: Options, readonly mode: FlatMode) {
        const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("An HTML canvas is needed to explore the illustrated village.");
        this.context = ctx;this.renderer = { domElement: canvas };
        canvas.className = "planet-canvas flat-canvas";canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", `Little Chorus ${mode === "2d" ? "illustrated 2D" : "paper diorama"}. Click to walk. W A S D or arrow keys move in screen directions. Shift runs, Space jumps, E responds, T talks. V changes between follow and village overview.`);
        canvas.textContent = "Walk, listen and answer a friend's sound. Keyboard movement, nearby sound buttons and the sound library are available.";
        this.overlay.className = "planet-labels flat-labels";
        Object.assign(this.overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
        this.host.prepend(canvas);this.host.append(this.overlay);
        this.host.dataset.flatMode = mode;this.host.dataset.renderEngine = "canvas2d";
        for (const resident of RESIDENTS) this.npcLabels.set(resident.id, this.makeLabel(`${resident.name} · NPC`, "npc"));
        this.npcLabels.set("kangaroo", this.makeLabel("Kangaroo · local companion", "npc"));
        this.bind();this.resizeObserver = new ResizeObserver(() => this.resize());this.resizeObserver.observe(host);this.resize();
        this.frameId = requestAnimationFrame(this.frame);
    }
    get at(): Position { return { ...this.position, motion: { running: this._running, jump: this.jumpOffset } }; }
    get viewMode(): "first" | "third" { return "third"; }
    get running(): boolean { return this._running; }
    get runEnabled(): boolean { return this.runningRequested; }
    get grounded(): boolean { return this.jumpingAt === null; }
    get walkingIntent(): boolean { return this.walkingTarget !== null; }
    get walkingIntentRevision(): number { return this.walkingRevision; }
    get serverNow(): number { return this.serverSample.server + Math.max(0, performance.now() - this.serverSample.received); }
    get cameraDistance(): number { return this.zoom; }
    get area(): PlanetPlace { return [...PLANET_PLACES].sort((a,b) => planetDistance(this.position,a) - planetDistance(this.position,b))[0]; }
    get responses(): { residentId: string; label: string; sourceId: string; soundId: string; behavior: string; x: number; z: number }[] {
        return RESIDENTS.flatMap(home => { const response = chooseResidentResponse(home, this.publicSounds, this.serverNow, planetDistance);return response ? [{ residentId: home.id, label: home.name + " · NPC", sourceId: response.sourceId, soundId: response.soundId, behavior: response.profile.behavior, x: home.x, z: home.z }] : []; });
    }
    setSelf(person: Person | null): void { this.self = person ? { ...person } : null;this.selfLabel?.remove();this.selfLabel = person ? this.makeLabel(person.name + " · YOU", "player") : null; }
    setCameraDistance(distance: number): void { if (Number.isFinite(distance)) {this.zoom = Math.max(4.2, Math.min(28, distance));this.pan = { x: 0, z: 0 };} }
    setViewMode(_mode: "first" | "third"): void { this.keys.clear(); }
    setLookMode(_mode: "follow" | "scene"): void { /* Screen-direction walking has no reversed mouse look. */ }
    setPaused(paused: boolean): void { this.paused = paused;this.keys.clear();this.runningRequested = false;this._running = false;this.drag = null;this.cancelWalkingIntent(); }
    setRunning(enabled: boolean): void { this.runningRequested = !this.paused && enabled; }
    jump(): boolean { if (this.paused || !this.grounded) return false;this.jumpingAt = this.serverNow;return true; }
    focus(): void { this.renderer.domElement.focus({ preventScroll: true }); }
    correctPosition(position: Position): void {
        if (![position.x,position.z,position.yaw].every(Number.isFinite)) return;
        this.position = { ...position };this.keys.clear();this.cancelWalkingIntent();this.jumpingAt = null;this.jumpOffset = 0;
    }
    goTo(id: string): void {
        const p = PLANET_PLACES.find(place => place.id === id);if (!p) return;
        const green = p.kind === "green", front = p.kind === "tea" ? 3 : p.kind === "stage" || p.kind === "reading" ? 4 : 0;
        this.correctPosition({ x: p.x + (green ? 1.8 : 0), z: p.z + (green ? 2.2 : front), yaw: Math.PI });this.pan = { x: 0, z: 0 };this.opts.area(p);
    }
    walkToward(target: Point, stopDistance = 2.5): boolean {
        if (this.paused || ![target.x,target.z,stopDistance].every(Number.isFinite)) return false;
        this.walkingRevision++;this.walkingTarget = { x: target.x, z: target.z, stopDistance: Math.max(.15, Math.min(10, stopDistance)) };return true;
    }
    cancelWalkingIntent(): void { if (this.walkingTarget) this.walkingRevision++;this.walkingTarget = null; }
    setEnvironment(environment: Environment, serverNow: string): void {
        const server = Date.parse(serverNow);if (!Number.isFinite(server) || this.hasEnvironment && environment.revision < this.environment.revision) return;
        this.serverSample = { server: this.hasEnvironment && environment.revision === this.environment.revision ? Math.max(server,this.serverNow) : server, received: performance.now() };
        this.environment = { ...environment };this.hasEnvironment = true;
    }
    setPeople(people: Moves["people"], selfId: string | null): void {
        const wanted = new Set<string>();
        for (const person of people) {
            if (person.id === selfId) continue;wanted.add(person.id);
            const existing = this.people.get(person.id);
            if (existing) {existing.target = { ...person };existing.person = { id: person.id, name: person.name, avatar: person.avatar };existing.label.textContent = person.name + " · PLAYER";}
            else this.people.set(person.id, { person: { id: person.id, name: person.name, avatar: person.avatar }, at: { ...person }, target: { ...person }, label: this.makeLabel(person.name + " · PLAYER","player") });
        }
        for (const [id, actor] of this.people) if (!wanted.has(id)) {actor.label.remove();this.people.delete(id);}
    }
    setNpcs(frames: readonly NpcRoutineFrame[]): void {
        for (const n of this.npcs) if (!frames.some(f => f.id === n.id)) {this.npcLabels.get(n.id)?.remove();this.npcLabels.delete(n.id);}
        this.npcs = frames.map(n => ({ ...n }));
        for (const n of this.npcs) if (!this.npcLabels.has(n.id)) this.npcLabels.set(n.id,this.makeLabel(n.label,"npc"));
    }
    setContributions(sounds: readonly PlacedSound[]): void { this.publicSounds = sounds.filter(s => !s.removedAt && !s.whileIn).map(s => ({ ...s })); }
    setWorks(works: readonly ChorusWork[]): void { this.works = works.map(work => ({ ...work, liveSources: work.liveSources.map(s => ({ ...s })), sources: work.sources.map(s => ({ ...s })), contributors: work.contributors.map(p => ({ ...p })) })); }
    focusWork(workId: string | null): void { this.focusedWork = workId; }
    project(x: number, z: number, height = 0): { x: number; y: number; visible: boolean } {
        const point = projectFlat({ x,z },this.projection,height);
        const hut = sceneHutAt("planet",x,z), own = sceneHutAt("planet",this.position.x,this.position.z);
        return { ...point, visible: point.x > -15 && point.x < this.width + 15 && point.y > 0 && point.y < this.height && (!hut || hut.id === own?.id) };
    }
    interact(): boolean {
        if (!this.companionNear()) return false;
        if (this.companion.phase === "resting") {this.companion.phase = "following";this.companion.played = false;this.opts.wait("Kangaroo is coming along. Lead the way to a sound, or hop together.");}
        else if (this.companion.phase === "following" && !this.companion.played) {this.companion.phase = "playing";this.companion.played = true;this.companion.until = this.serverNow + 2500;this.opts.wait("A little hopping game! Jump alongside Kangaroo.");}
        else {this.companion.phase = "resting";this.opts.wait("Kangaroo settles here. Invite it along again whenever you like.");}
        this.publishInteraction();return true;
    }
    private get projection(): FlatProjection {
        const overview = Math.max(0, Math.min(1,(this.zoom - 10) / 16)), followScale = Math.max(22,Math.min(38,this.width / 14,this.height / 20)) * 8 / Math.min(10,this.zoom);
        const overviewScale = this.mode === "2.5d" ? Math.min(this.width / 95,this.height / 62) : Math.min(this.width / 112,this.height / 65);
        return { mode: this.mode, width: this.width, height: this.height, scale: followScale * (1-overview) + overviewScale * overview,
            center: { x: this.position.x * (1-overview) + 12 * overview + this.pan.x, z: (this.position.z - .6) * (1-overview) + this.pan.z } };
    }
    private makeLabel(text: string, role: "player" | "npc"): HTMLSpanElement {
        const label = document.createElement("span");label.className = "planet-person-label " + role;label.textContent = text;
        Object.assign(label.style,{ position: "absolute", padding: "3px 8px", borderRadius: "12px", background: role === "player" ? "#edf5ed" : "#f6e8c9", color: "#304d48", font: "600 11px system-ui", whiteSpace: "nowrap", border: role === "player" ? "1px solid #7b9e96" : "1px solid #cfb38a", transform: "translate(-50%,-100%)" });
        this.overlay.append(label);return label;
    }
    private label(label: HTMLSpanElement | null | undefined, position: Point, role: "self" | "player" | "npc", height = 2.3): void {
        if (!label) return;const point = this.project(position.x,position.z,height), distance = planetDistance(position,this.position);
        label.hidden = !point.visible || this.zoom >= 20 || role !== "self" && distance > (role === "player" ? 7 : 2.7);
        if (!label.hidden) {label.style.left = point.x + "px";label.style.top = point.y + "px";}
    }
    private locked(): Set<string> {
        const locked = new Set(this.npcs.filter(n => n.occupying).map(n => n.hutId));
        for (const actor of this.people.values()) {const hut = sceneHutAt("planet",actor.target.x,actor.target.z);if (hut) locked.add(hut.id);}return locked;
    }
    private bind(): void {
        const signal = this.abort.signal, canvas = this.renderer.domElement;
        canvas.addEventListener("keydown",event => {
            if (this.paused || event.altKey || event.ctrlKey || event.metaKey) return;
            const key = event.key.toLowerCase();
            if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"].includes(key)) {event.preventDefault();this.keys.add(key);if (key !== "shift") {this.cancelWalkingIntent();this.pan = { x: 0,z: 0 };}}
            if (event.code === "Space") {event.preventDefault();if (!event.repeat) this.jump();}
            if (key === "v" && !event.repeat) {event.preventDefault();this.setCameraDistance(this.zoom < 20 ? 26 : 8);}
            if (key === "e" && !event.repeat && this.interact()) event.preventDefault();
        },{ signal });
        window.addEventListener("keyup",event => this.keys.delete(event.key.toLowerCase()),{ signal });
        window.addEventListener("blur",() => {this.keys.clear();this.runningRequested = false;this._running = false;this.drag = null;this.cancelWalkingIntent();},{ signal });
        canvas.addEventListener("pointerdown",event => {if (this.paused) return;this.focus();this.drag = { id: event.pointerId, x: event.clientX,y: event.clientY,original: { x: event.clientX,y: event.clientY },travel: 0 };canvas.setPointerCapture(event.pointerId);},{ signal });
        canvas.addEventListener("pointermove",event => {
            const drag = this.drag;if (!drag || drag.id !== event.pointerId || this.paused) return;
            const dx = event.clientX-drag.x,dy = event.clientY-drag.y;drag.travel += Math.hypot(dx,dy);
            if (drag.travel > 6) {const view = this.projection,sx = dx/view.scale,sy = dy/view.scale;this.pan.x -= this.mode === "2.5d" ? (sx+sy/.52)/Math.SQRT2 : sx;this.pan.z -= this.mode === "2.5d" ? (sy/.52-sx)/Math.SQRT2 : sy/.85;}
            drag.x = event.clientX;drag.y = event.clientY;
        },{ signal });
        canvas.addEventListener("pointerup",event => {
            const drag = this.drag;this.drag = null;if (!drag || drag.id !== event.pointerId || drag.travel > 6 || this.paused) return;
            const rect = canvas.getBoundingClientRect(),screen = { x: event.clientX-rect.left,y: event.clientY-rect.top },companion = this.project(this.companion.x,this.companion.z,1);
            if (this.companionNear() && Math.hypot(screen.x-companion.x,screen.y-companion.y) < Math.max(24,this.projection.scale)) {this.interact();return;}
            for (const placeId of CHORUS_PLACES) {
                const place = PLANET_PLACES.find(p => p.id === placeId)!,p = this.project(place.x,place.z,1.5);
                if (p.visible && planetDistance(this.position,place) < 8 && Math.hypot(screen.x-p.x,screen.y-p.y) < Math.max(26,this.projection.scale * 1.65)) {this.opts.work?.(this.workAt(placeId)?.id ?? null,placeId);return;}
            }
            const target = unprojectFlat(screen,this.projection);this.walkToward(target,.25);
        },{ signal });
        for (const name of ["pointercancel","lostpointercapture"] as const) canvas.addEventListener(name,() => {this.drag = null;},{ signal });
        canvas.addEventListener("wheel",event => {if (this.paused) return;event.preventDefault();this.setCameraDistance(this.zoom + event.deltaY * .012);},{ signal,passive: false });
        this.touch.className = "planet-touch";this.touch.setAttribute("aria-label","Walking controls");
        for (const [name,key,text] of [["forward","w","↑"],["left","a","←"],["back","s","↓"],["right","d","→"]]) {
            const button = document.createElement("button");button.type = "button";button.className = "planet-move-"+name;button.setAttribute("aria-label","Move "+name);button.textContent = text;
            button.addEventListener("pointerdown",event => {event.preventDefault();if (this.paused) return;this.cancelWalkingIntent();this.keys.add(key);this.pan = { x: 0,z: 0 };button.setPointerCapture(event.pointerId);},{ signal });
            for (const event of ["pointerup","pointercancel","lostpointercapture"] as const) button.addEventListener(event,() => this.keys.delete(key),{ signal });this.touch.append(button);
        }
        this.host.append(this.touch);
    }
    private resize(): void {
        this.width = Math.max(1,this.host.clientWidth);this.height = Math.max(1,this.host.clientHeight);this.pixelRatio = Math.min(window.devicePixelRatio || 1,2);
        const canvas = this.renderer.domElement;canvas.width = Math.round(this.width*this.pixelRatio);canvas.height = Math.round(this.height*this.pixelRatio);canvas.style.width = this.width+"px";canvas.style.height = this.height+"px";
        this.camera.aspect = this.width/this.height;this.camera.updateProjectionMatrix();
    }
    private frame = (now: number): void => {
        if (this.disposed) return;this.frameId = requestAnimationFrame(this.frame);
        const dt = Math.min(.1,Math.max(0,(now-this.last)/1000));this.last = now;
        const screenRight = Number(this.keys.has("d") || this.keys.has("arrowright"))-Number(this.keys.has("a") || this.keys.has("arrowleft"));
        const screenDown = Number(this.keys.has("s") || this.keys.has("arrowdown"))-Number(this.keys.has("w") || this.keys.has("arrowup"));
        let walking = false;const locked = this.locked(),own = sceneHutAt("planet",this.position.x,this.position.z)?.id;
        if (screenRight || screenDown) this.cancelWalkingIntent();
        if (this.walkingTarget && planetDistance(this.position,this.walkingTarget) <= this.walkingTarget.stopDistance + .015) this.cancelWalkingIntent();
        this._running = false;
        if (!this.paused && (screenRight || screenDown || this.walkingTarget)) {
            const target = this.walkingTarget, yaw = target ? bearingToward(this.position,target) : flatMovementBearing(this.mode,screenRight,screenDown,this.position.z);
            const run = this.runningRequested || this.keys.has("shift"),available = target ? Math.max(0,planetDistance(this.position,target)-target.stopDistance) : Infinity;
            const movement = moveOnPlanet({ ...this.position,yaw },1,0,Math.min(dt*(run ? RUN_SPEED : WALK_SPEED),available),(x,z) => canStandFlat(x,z,locked,own));
            this.position = movement.position;walking = movement.distance > .0001;this._running = walking && run;
            if (movement.blocked) {
                if (target) this.cancelWalkingIntent();
                const near = PLANET_HUTS.find(h => locked.has(h.id) && planetDistance(this.position,{ x: (h.door.x0+h.door.x1)/2,z: h.z1 }) < 3);
                const message = near ? "Someone is using "+near.name+". Wait for the green light." : target ? "The path is blocked. Walk around it, then try again." : "";
                if (message && message !== this.lastWait) {this.lastWait = message;this.opts.wait(message);}
            } else this.lastWait = "";
        }
        this.jumpOffset = this.jumpingAt === null ? 0 : jumpHeight((this.serverNow-this.jumpingAt)/1000);
        if (this.jumpingAt !== null && this.serverNow-this.jumpingAt >= JUMP_DURATION*1000) {this.jumpingAt = null;this.jumpOffset = 0;}
        this.updateCompanion(dt,locked);
        this.updateAudioCamera();this.draw(walking,dt,locked);
        this.opts.listen({ ...this.at,camera: this.camera,serverNow: this.serverNow });
        this.publishInteraction();
        this.host.dataset.running = String(this._running);this.host.dataset.jumpHeight = this.jumpOffset.toFixed(3);this.host.dataset.grounded = String(this.grounded);this.host.dataset.walkingIntent = String(this.walkingIntent);
        if (this.frameNumber++ % 12 === 0) this.debugState(locked);
    };
    private updateAudioCamera(): void {
        const at = planetPoint(this.position.x,this.position.z,1.45+this.jumpOffset),basis = planetBasis(this.position.x,this.position.z);
        this.camera.position.set(at.x,at.y,at.z);this.camera.up.set(basis.up.x,basis.up.y,basis.up.z);
        // Listener forward follows the visible screen's up direction, not the
        // moving avatar's facing, so stereo does not rotate on each keypress.
        const yaw = flatMovementBearing(this.mode,0,-1),forward = new THREE.Vector3(basis.south.x,basis.south.y,basis.south.z).multiplyScalar(Math.cos(yaw)).addScaledVector(new THREE.Vector3(basis.east.x,basis.east.y,basis.east.z),Math.sin(yaw));
        this.camera.lookAt(this.camera.position.clone().add(forward));this.camera.updateMatrixWorld();
    }
    private workAt(placeId: string): ChorusWork | undefined {
        return this.works.filter(w => w.placeId === placeId && w.liveSources.length).sort((a,b) => b.lastAt.localeCompare(a.lastAt) || a.id.localeCompare(b.id))[0];
    }
    private draw(walking: boolean,dt: number,locked: ReadonlySet<string>): void {
        const ctx = this.context,view = this.projection,style: FlatStyle = this.mode === "2d" ? "flat" : "iso",time = this.serverNow/1000,reducedMotion = this.reduced.matches;
        ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);ctx.clearRect(0,0,this.width,this.height);
        this.drawGround(ctx,view,time,reducedMotion);
        ctx.save();ctx.globalAlpha = .13;drawFlatBackdrop(ctx,{ style,width: this.width,height: this.height,time,reducedMotion });ctx.restore();
        type Drawing = { y: number; draw: () => void };const drawings: Drawing[] = [];
        const object = (kind: FlatObjectKind,at: Point,extra: Record<string,unknown> = {}): void => {
            const p = projectFlat(at,view);if (p.x < -view.scale*10 || p.x > this.width+view.scale*10 || p.y < -view.scale*8 || p.y > this.height+view.scale*9) return;
            drawings.push({ y: p.y,draw: () => drawFlatObject(ctx,kind,{ style,x: p.x,y: p.y,scale: view.scale,time,reducedMotion,...extra }) });
        };
        for (const p of PLANET_PLACES) {
            if (p.kind === "restrooms") continue;
            const kind: FlatObjectKind = p.kind === "tea" ? "cafe" : p.kind;
            const cafeSounds = p.kind === "tea" ? this.publicSounds.filter(s => planetDistance(s,p) <= 8) : [];
            object(kind,p,{ seed: p.id,name: p.title,active: cafeSounds.length > 0,variant: cafeSounds.some(s => s.soundId === "espresso") ? "steam" : cafeSounds.some(s => ["guitar","cafe-music","chorus-chords","chorus-pulse","chorus-bells"].includes(s.soundId)) ? "music" : undefined });
            if (CHORUS_PLACES.includes(p.id as typeof CHORUS_PLACES[number])) {
                const work = this.workAt(p.id);if (work) object(work.variant === "habitat" ? "canopy" : work.variant === "ensemble" ? "beat-flower" : "lantern",p,{ seed: work.id,active: this.focusedWork === work.id,duet: work.duet,authors: work.contributors.map(p => p.id),sourceIds: work.liveSources.map(s => s.id),variant: work.variant });
            }
        }
        for (const hut of PLANET_HUTS) object(hut.kind.endsWith("shower") ? "shower" : "restroom",{ x: (hut.x0+hut.x1)/2,z: (hut.z0+hut.z1)/2 },{ occupied: locked.has(hut.id) || sceneHutAt("planet",this.position.x,this.position.z)?.id === hut.id,interior: sceneHutAt("planet",this.position.x,this.position.z)?.id === hut.id,seed: hut.id });
        for (let i = 0;i < 100;i++) {
            const x = -63 + (i*13.87 % 125),z = -25 + (i*7.91 % 49);
            if (z > coastlineAt(x)-2 || PLANET_PLACES.some(p => planetDistance(p,{ x,z }) < 6.5) || PLANET_HUTS.some(h => x > h.x0-2 && x < h.x1+2 && z > h.z0-2 && z < h.z1+2)) continue;
            object(i % 5 === 0 ? "rock" : i % 3 === 0 ? "flower" : "tree",{ x,z },{ seed: String(i) });
        }
        for (const source of this.publicSounds) object("sound",source,{ seed: source.id,variant: source.soundId.startsWith("chorus-") || ["guitar","cafe-music"].includes(source.soundId) ? "music" : ["bicycle-bell","hand-claps"].includes(source.soundId) ? "event" : "nature",sourceIds: [source.id],authors: [source.byId],active: planetDistance(source,this.position) < 4 });
        for (const source of this.publicSounds) if (source.replyToId) {
            const parent = this.publicSounds.find(s => s.id === source.replyToId);if (!parent || planetDistance(parent,source) > 25) continue;
            const a = this.project(parent.x,parent.z,.25),b = this.project(source.x,source.z,.25);if (!a.visible && !b.visible) continue;
            ctx.save();ctx.strokeStyle = "#b47e7180";ctx.lineWidth = 1.6;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-24,b.x,b.y);ctx.stroke();ctx.restore();
        }
        const person = (p: Person,at: Position,role: "self" | "player" | "npc",moving: boolean,label?: HTMLSpanElement | null,behavior?: string): void => {
            const projected = this.project(at.x,at.z);if (!projected.visible) {if (label) label.hidden = true;return;}
            const nearWork = role === "npc" ? this.works.find(w => w.duet && w.liveSources.length && planetDistance(w,at) < 8) : undefined,performing = nearWork?.variant === "ensemble" || ["sway","play","chat","wave"].includes(behavior ?? "");
            drawings.push({ y: projected.y+.1,draw: () => drawFlatPerson(ctx,{ style,x: projected.x,y: projected.y,scale: view.scale,time,reducedMotion,animal: p.avatar,seed: p.id,authors: [p.id],yaw: at.yaw,moving: moving || performing,running: at.motion?.running,jump: at.motion?.jump ?? (nearWork?.variant === "ensemble" && !reducedMotion ? Math.max(0,Math.sin(time * CHORUS_BPM/60*Math.PI*2))*.12 : 0),npc: role === "npc",self: role === "self" }) });
            this.label(label,at,role,2.35+(at.motion?.jump ?? 0));
        };
        for (const home of RESIDENTS) {
            const response = chooseResidentResponse(home,this.publicSounds,this.serverNow,planetDistance);
            person({ id: home.id,name: home.name,avatar: home.avatar },{ x: home.x,z: home.z,yaw: response ? bearingToward({ ...home,yaw: 0 },response) : .3 },"npc",false,this.npcLabels.get(home.id),response?.profile.behavior);
        }
        for (const actor of this.people.values()) {
            const moving = planetDistance(actor.at,actor.target) > .08;
            actor.at.x += wrap(actor.target.x-actor.at.x) * Math.min(1,dt*12);actor.at.x = wrap(actor.at.x);actor.at.z += (actor.target.z-actor.at.z)*Math.min(1,dt*12);actor.at.yaw = actor.target.yaw;actor.at.motion = actor.target.motion;
            person(actor.person,actor.at,"player",moving,actor.label);
        }
        for (const npc of this.npcs) {
            if (["occupied","flushing"].includes(npc.phase)) {const label = this.npcLabels.get(npc.id);if (label) label.hidden = true;continue;}
            person({ id: npc.id,name: npc.label,avatar: npc.avatar },npc,"npc",["walking","entering","leaving"].includes(npc.phase),this.npcLabels.get(npc.id));
        }
        const kangarooPoint = projectFlat(this.companion,view,this.companion.height);
        drawings.push({ y: projectFlat(this.companion,view).y,draw: () => drawFlatObject(ctx,"kangaroo",{ style,x: kangarooPoint.x,y: kangarooPoint.y,scale: view.scale,time,reducedMotion,active: this.companion.phase !== "resting",seed: "companion" }) });
        this.label(this.npcLabels.get("kangaroo"),this.companion,"npc",2.2+this.companion.height);
        if (this.self) person(this.self,this.at,"self",walking,this.selfLabel);
        drawings.sort((a,b) => a.y-b.y);for (const d of drawings) d.draw();
        this.drawPlaceNames(ctx,view);
        if (this.walkingTarget) {const p = projectFlat(this.walkingTarget,view);ctx.save();ctx.strokeStyle = "#fff9e6";ctx.lineWidth = 2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.ellipse(p.x,p.y,view.scale*.35,view.scale*.18,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
        const minute = minuteAt(this.environment,this.serverNow),night = 1-Math.max(0,Math.sin((minute-360)/1440*Math.PI*2));
        if (night > .2) {ctx.save();ctx.fillStyle = `rgba(38,49,77,${night*.3})`;ctx.fillRect(0,0,this.width,this.height);ctx.globalCompositeOperation = "screen";for (const p of PLANET_PLACES.filter(p => ["tea","reading","stage"].includes(p.kind))) {const q = projectFlat(p,view),r = view.scale*4,glow = ctx.createRadialGradient(q.x,q.y,1,q.x,q.y,r);glow.addColorStop(0,"#eeb26850");glow.addColorStop(1,"#eeb26800");ctx.fillStyle = glow;ctx.fillRect(q.x-r,q.y-r,r*2,r*2);}ctx.restore();}
        this.drawWeather(ctx,time,reducedMotion);
    }
    private drawGround(ctx: CanvasRenderingContext2D,view: FlatProjection,time: number,reduced: boolean): void {
        ctx.save();ctx.fillStyle = "#a7c7bd";ctx.fillRect(0,0,this.width,this.height);
        const start = view.center.x-PLANET_HALF+.02,end = view.center.x+PLANET_HALF-.02;
        const polygon = (edge: number): void => {const first = projectFlat({ x: start,z: -34.5 },view);ctx.beginPath();ctx.moveTo(first.x,first.y);for (let x = start;x <= end;x += 1) {const p = projectFlat({ x,z: -34.5 },view);ctx.lineTo(p.x,p.y);}for (let x = end;x >= start;x -= 1) {const p = projectFlat({ x,z: coastlineAt(x)+edge },view);ctx.lineTo(p.x,p.y);}ctx.closePath();};
        polygon(1.4);ctx.fillStyle = "#e9d5ad";ctx.fill();polygon(0);ctx.fillStyle = "#bfd0a8";ctx.fill();
        ctx.lineCap = "round";ctx.lineJoin = "round";
        const path = (points: Point[]): void => {ctx.beginPath();points.forEach((p,i) => {const q = projectFlat(p,view);i ? ctx.lineTo(q.x,q.y) : ctx.moveTo(q.x,q.y);});ctx.stroke();};
        ctx.strokeStyle = "#e5d9b8";ctx.lineWidth = view.scale*1.35;
        const green = { x: 1.8,z: 2.2 };
        for (const p of PLANET_PLACES) if (p.id !== "green" && p.id !== "observatory") path([green,{ x: (p.x+green.x)/2,z: (p.z+green.z)/2+1 },{ x: p.x,z: p.z+(p.kind === "tea" || p.kind === "reading" ? 3 : 1) }]);
        path([{ x: -68,z: -.7 },{ x: -35,z: 2 },{ x: 1,z: 2 },{ x: 34,z: 1 },{ x: 68,z: -.7 }]);
        for (const p of PLANET_PLACES) {const q = projectFlat(p,view);ctx.fillStyle = p.kind === "green" ? "#d5dec0" : "#e7dcbc";ctx.beginPath();ctx.ellipse(q.x,q.y,view.scale*(p.kind === "green" ? 5.1 : 3.8),view.scale*(this.mode === "2.5d" ? 1.9 : 3),0,0,Math.PI*2);ctx.fill();}
        const pierStart = coastlineAt(7)-1.5;ctx.strokeStyle = "#b98f6f";ctx.lineWidth = view.scale*2;path([{ x: 7,z: pierStart },{ x: 7,z: pierStart+8.5 }]);ctx.strokeStyle = "#eed5ad";ctx.lineWidth = 1;
        for (let i = 0;i < 20;i++) {const z = pierStart+i*.43;path([{ x: 6.1,z },{ x: 7.9,z }]);}
        ctx.strokeStyle = "#f4f2d790";ctx.lineWidth = 1.5;
        for (let band = 0;band < 5;band++) {const points: Point[] = [];for (let x = start;x < end;x += 1.2) points.push({ x,z: coastlineAt(x)+2.4+band*1.7+Math.sin(x*.3+(reduced ? 0 : time*.55))*.19 });path(points);}
        ctx.restore();
    }
    private drawPlaceNames(ctx: CanvasRenderingContext2D,view: FlatProjection): void {
        ctx.save();ctx.textAlign = "center";ctx.textBaseline = "middle";
        for (const place of PLANET_PLACES) {
            const distance = planetDistance(this.position,place);if (this.zoom < 20 && distance > (this.width < 600 ? 9 : 20)) continue;
            const p = projectFlat(place,view);if (p.x < 45 || p.x > this.width-45 || p.y < 40 || p.y > this.height-35) continue;
            const label = place.title.replace("The ","").replace("the ","");ctx.font = `${this.zoom >= 20 ? 11 : 12}px Georgia, serif`;
            const w = Math.min(this.width-24,ctx.measureText(label).width+20),y = p.y+view.scale*2.1;
            ctx.fillStyle = "#fff8e9e8";ctx.strokeStyle = "#b8bfa0";ctx.lineWidth = 1;ctx.beginPath();ctx.roundRect(p.x-w/2,y-11,w,23,11);ctx.fill();ctx.stroke();ctx.fillStyle = "#416454";ctx.fillText(label,p.x,y+1);
        }
        ctx.restore();
    }
    private drawWeather(ctx: CanvasRenderingContext2D,time: number,reduced: boolean): void {
        if (this.environment.weather === "mist") {ctx.fillStyle = "#edf3e524";ctx.fillRect(0,0,this.width,this.height);}
        if (this.environment.weather === "cloudy") {ctx.fillStyle = "#788aa511";ctx.fillRect(0,0,this.width,this.height);}
        if (this.environment.weather !== "rain") return;
        ctx.save();ctx.fillStyle = "#687c9a14";ctx.fillRect(0,0,this.width,this.height);
        if (!reduced && !sceneHutAt("planet",this.position.x,this.position.z)) {ctx.strokeStyle = "#e5f4ef88";ctx.lineWidth = 1;ctx.beginPath();for (let i = 0;i < 80;i++) {const x = (i*193.7+time*17)%this.width,y = (i*79.3+time*270)%this.height;ctx.moveTo(x,y);ctx.lineTo(x-3,y+9);}ctx.stroke();}ctx.restore();
    }
    private updateCompanion(dt: number,locked: ReadonlySet<string>): void {
        if (this.companion.phase === "playing" && this.serverNow > this.companion.until) this.companion.phase = "following";
        const distance = planetDistance(this.position,this.companion);
        if (!this.paused && this.companion.phase === "following" && distance > 2.1 && distance < 35) {
            const movement = moveOnPlanet({ ...this.companion,yaw: bearingToward(this.companion,this.position) },1,0,Math.min(dt*3.8,distance-2.1),(x,z) => !sceneHutAt("planet",x,z) && canStandFlat(x,z,locked));
            Object.assign(this.companion,movement.position);
        }
        const ensemble = this.works.some(w => w.duet && w.variant === "ensemble" && w.liveSources.length > 0 && planetDistance(w,this.companion) < 7);
        this.companion.height = this.reduced.matches ? 0 : this.companion.phase === "playing" || this.jumpOffset > .1 && this.companion.phase !== "resting" ? Math.max(0,Math.sin(this.serverNow/115))*.5 : ensemble ? Math.max(0,Math.sin(this.serverNow/(60_000/CHORUS_BPM)*Math.PI*2))*.18 : 0;
    }
    private companionNear(): boolean { return !this.paused && planetDistance(this.position,this.companion) <= 3.2 && this.project(this.companion.x,this.companion.z,1).visible; }
    private publishInteraction(): void {
        const action = this.companionNear() ? this.companion.phase === "resting" ? "Invite kangaroo along" : this.companion.phase === "following" && !this.companion.played ? "Hop together" : "Let kangaroo rest" : null;
        if (action === this.companionAction) return;this.companionAction = action;this.opts.interaction?.(action ? { kind: "kangaroo",label: "Kangaroo companion",action } : null);
    }
    private debugState(locked: ReadonlySet<string>): void {
        const own = sceneHutAt("planet",this.position.x,this.position.z)?.id;this.opts.area(this.area);
        this.host.dataset.at = `${this.position.x.toFixed(3)},${this.position.z.toFixed(3)}`;this.host.dataset.view = "third";this.host.dataset.cameraDistance = this.zoom.toFixed(1);this.host.dataset.selfVisible = String(!!this.self);
        this.host.dataset.minute = minuteAt(this.environment,this.serverNow).toFixed(1);this.host.dataset.serverNow = String(this.serverNow);this.host.dataset.weather = this.environment.weather;this.host.dataset.sea = "true";
        this.host.dataset.players = JSON.stringify([...this.people.values()].map(a => ({ id: a.person.id,name: a.person.name,...a.at })));
        this.host.dataset.residentResponses = JSON.stringify(this.responses);this.host.dataset.npcRoutines = JSON.stringify(this.npcs);this.host.dataset.huts = JSON.stringify(PLANET_HUTS.map(h => ({ id: h.id,taken: locked.has(h.id) || h.id === own,angle: 0 })));
        this.host.dataset.chorusGardens = JSON.stringify(CHORUS_PLACES.map(placeId => {const work = this.workAt(placeId);return { placeId,workId: work?.id ?? null,variant: work?.variant ?? null,duet: work?.duet ?? false,sourceIds: work?.liveSources.map(s => s.id) ?? [],contributors: work?.contributors.map(p => p.id) ?? [],open: work ? work.duet ? 1 : .45 : 0,focused: work?.id === this.focusedWork };}));
        const cafe = PLANET_PLACES.find(p => p.kind === "tea")!,sources = this.publicSounds.filter(s => planetDistance(s,cafe) <= 8);
        this.host.dataset.cafe = JSON.stringify({ sourceIds: sources.map(s => s.id),steam: sources.some(s => s.soundId === "espresso"),music: sources.some(s => ["guitar","cafe-music","chorus-chords","chorus-pulse","chorus-bells"].includes(s.soundId)),company: sources.some(s => ["cafe-dishes","cafe-chatter"].includes(s.soundId)) });
        this.host.dataset.soundCues = JSON.stringify(this.publicSounds.map(s => ({ id: s.id,x: s.x,z: s.z,colour: FAMILIES[findSound(s.soundId)?.family ?? "anthrophony"].colour })));
        this.host.dataset.kangaroo = JSON.stringify({ id: "green-kangaroo",...this.companion,nearby: this.companionNear(),action: this.companionAction,localOnly: true });
    }
    dispose(): void {
        if (this.disposed) return;this.disposed = true;cancelAnimationFrame(this.frameId);this.abort.abort();this.resizeObserver.disconnect();this.overlay.remove();this.touch.remove();this.renderer.domElement.remove();delete this.host.dataset.flatMode;delete this.host.dataset.renderEngine;
    }
}
