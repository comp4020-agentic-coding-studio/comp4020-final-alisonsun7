// Walk on a real sphere. Public coordinates and all nearby interactions use
// the same great-circle metric as the authoritative server.
import * as THREE from "three";
import { AnimalFigure } from "./characters.js";
import { SoundResidents } from "./sound-residents.js";
import { buildPlanet, onPlanet, surfaceFrame } from "./planet-build.js";
import { PLANET_RADIUS as R, PLANET_PLACES, PLANET_HUTS, planetBasis, planetPoint, planetDistance, planetStep, sceneHutAt, type PlanetPlace } from "../shared/planet.js";
import type { Person, Position, PlacedSound, Moves } from "../shared/protocol.js";
import type { NpcRoutineFrame } from "../shared/npc-routines.js";
import { minuteAt, type Environment } from "../shared/environment.js";
import { FAMILIES, findSound } from "../shared/sounds.js";
import { WALK_SPEED, RUN_SPEED, JUMP_DURATION, jumpHeight, bearingToward, moveOnPlanet } from "./planet-locomotion.js";
import { KangarooCompanion } from "./planet-wildlife.js";
import { PlanetSoundConnections } from "./planet-connections.js";
import { ChorusGarden } from "./chorus-garden.js";
import { CHORUS_BPM, type ChorusPlace, type ChorusWork } from "../shared/chorus.js";
export type PlanetInteraction = { kind: "kangaroo"; label: string; action: string };
type Actor = {
    figure: AnimalFigure;
    label: HTMLSpanElement;
    at: Position;
    target: Position;
    name: string;
};
type Listener = Position & {
    camera: THREE.PerspectiveCamera;
    serverNow: number;
};
export class PlanetWorld {
    readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    readonly camera = new THREE.PerspectiveCamera(68, 1, .1, 220);
    readonly scene = new THREE.Scene();
    readonly built = buildPlanet();
    private self: AnimalFigure | null = null;
    private selfLabel: HTMLSpanElement | null = null;
    private others = new Map<string, Actor>();
    private routines = new Map<string, Actor>();
    private npcFrames: NpcRoutineFrame[] = [];
    private publicSounds: PlacedSound[] = [];
    private cues = new PlanetSourceCues(this.scene);
    private residentPos = new Map<AnimalFigure, Position>();
    private residents: SoundResidents;
    private connections: PlanetSoundConnections;
    private garden: ChorusGarden;
    private works: ChorusWork[] = [];
    private focusedWork: string | null = null;
    private gestureRigs = new WeakMap<AnimalFigure, { body?: THREE.Object3D; head?: THREE.Object3D; left?: THREE.Object3D; right?: THREE.Object3D }>();
    private kangaroo = new KangarooCompanion();
    private kangarooLabel: HTMLSpanElement;
    private lastInteraction: string | null = null;
    private residentLabels = new Map<AnimalFigure, HTMLSpanElement>();
    private overlay = document.createElement("div");
    private touch: HTMLElement | null = null;
    private sun = new THREE.DirectionalLight(0xffefcf, 3.2);
    private hemi = new THREE.HemisphereLight(0xe2e9cf, 0x6d826f, 2.2);
    private position: Position = { x: 1.8, z: 2.2, yaw: Math.PI };
    private selfYaw = Math.PI;
    private keys = new Set<string>();
    private paused = false;
    private runRequested = false;
    private walkingRevision = 0;
    private labelWidths = new WeakMap<HTMLElement, number>();
    private _running = false;
    private jumpStarted: number | null = null;
    private jumpOffset = 0;
    private _viewMode: "first" | "third" = "third";
    private pitch = .12;
    private zoom = 8;
    private walkingTarget: {
        x: number;
        z: number;
        stopDistance: number;
    } | null = null;
    private dragTravel = 0;
    private look: "follow" | "scene" = "follow";
    private drag: {
        id: number;
        x: number;
        y: number;
    } | null = null;
    private frameId = 0;
    private last = performance.now();
    private walking = 0;
    private frameNumber = 0;
    private disposed = false;
    private environment: Environment = { weather: "clear", minuteOfDay: 840, clockRunning: false, updatedAt: new Date().toISOString(), revision: 0 };
    private serverSample = { server: Date.now(), received: performance.now() };
    private hasEnvironment=false;
    private rain: THREE.Points;
    private rainPositions = new Float32Array(240 * 3);
    private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    private resizeObserver: ResizeObserver;
    private abort = new AbortController();
    private lastWait = "";
    constructor(private host: HTMLElement, private opts: {
        listen: (l: Listener) => void;
        area: (p: PlanetPlace) => void;
        wait: (text: string) => void;
        interaction?: (cue: PlanetInteraction | null) => void;
        work?: (workId: string | null, placeId: ChorusPlace) => void;
    }) {
        const canvas = this.renderer.domElement;
        canvas.className = "planet-canvas";
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", "Little Chorus. Walk with W A S D or arrows, hold Shift to run, Space to jump, and E to interact. Drag to look. V changes view.");
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this.renderer.setSize(host.clientWidth, host.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.overlay.className = "planet-labels";
        Object.assign(this.overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
        host.prepend(canvas);
        host.append(this.overlay);
        this.scene.add(this.built.root, this.hemi, this.sun);
        this.connections = new PlanetSoundConnections(this.scene, (x, z) => this.built.heightAt(x, z));
        this.garden = new ChorusGarden(this.scene);
        this.scene.add(this.kangaroo.figure);
        this.kangarooLabel = this.makeLabel("Kangaroo · companion", "npc");
        this.sun.position.set(-28, 45, 55);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        const sc = this.sun.shadow.camera;
        sc.left = sc.bottom = -35;
        sc.right = sc.top = 35;
        sc.near = 1;
        sc.far = 150;
        this.sun.shadow.bias = -.0006;
        this.sun.shadow.normalBias = .035;
        const rainGeo = new THREE.BufferGeometry();
        rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
        this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbadadd, size: .065, transparent: true, opacity: .65 }));
        this.rain.frustumCulled = false;
        this.scene.add(this.rain);
        this.residents = new SoundResidents({ surfaceHeight: (x, z) => this.built.heightAt(x, z), canStand: (x, z) => this.garden.canStand(x, z) && this.built.canStand(x, z, new Set()) && !sceneHutAt("planet", x, z), distanceBetween: planetDistance });
        const homes = [{ id: "green-neighbour", x: -3, z: 1, avatar: "cat", preference: "cozy" }, { id: "jam-neighbour", x: 9, z: -6.8, avatar: "dog", preference: "lively" }, { id: "reading-neighbour", x: -12, z: 8.5, avatar: "cat", preference: "cozy" }, { id: "garden-neighbour", x: -.5, z: 14.5, avatar: "dog", preference: "wild" }, { id: "tea-neighbour", x: -8, z: -6, avatar: "dog", preference: "lively" }, { id: "lantern-neighbour", x: -20, z: -14, avatar: "cat", preference: "lively" },
            { id: "coffee-barista", x: -9.1, z: -7.55, avatar: "cat", preference: "lively" },
            { id: "coffee-reader", x: -12.9, z: -4.5, avatar: "dog", preference: "cozy" },
            { id: "coffee-company", x: -5.1, z: -4.5, avatar: "cat", preference: "lively" }] as const;
        for (const h of homes) {
            const f = new AnimalFigure({ avatar: h.avatar, seed: h.id, role: "npc" });
            this.residents.add({ ...h, label: h.id.replace("-", " ") + " · NPC", facing: 0 }, f, true);
            this.scene.add(f);
            this.residentPos.set(f, { x: h.x, z: h.z, yaw: 0 });
            this.residentLabels.set(f, this.makeLabel("Resident · NPC", "npc"));
        }
        this.bind();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.resize();
        this.frameId = requestAnimationFrame(this.frame);
    }
    get at(): Position { return { ...this.position, yaw: this.selfYaw, motion: { running: this._running, jump: this.jumpOffset } }; }
    get viewMode(): "first" | "third" { return this._viewMode; }
    get running(): boolean { return this._running; }
    get runEnabled(): boolean { return this.runRequested; }
    get grounded(): boolean { return this.jumpStarted === null; }
    get walkingIntent(): boolean { return this.walkingTarget !== null; }
    get walkingIntentRevision(): number { return this.walkingRevision; }
    get serverNow(): number { return this.serverSample.server + Math.max(0, performance.now() - this.serverSample.received); }
    get responses() { return this.residents.responses.map(r => { const figure = this.residents.figures.find(f => f.userData.soundResident?.id === r.residentId), p = figure && this.residentPos.get(figure); return p ? { ...r, x: p.x, z: p.z } : r; }); }
    get area(): PlanetPlace { return [...PLANET_PLACES].sort((a, b) => planetDistance(this.position, a) - planetDistance(this.position, b))[0]; }
    setSelf(person: Person | null): void { this.self?.dispose(); this.selfLabel?.remove();this.selfLabel=null; this.self = null; if (person) {
        this.self = new AnimalFigure({ avatar: person.avatar, seed: person.id, role: "player" });
        this.self.userData.self = true;
        this.scene.add(this.self);
        this.selfLabel=this.makeLabel(person.name+" · YOU","player");
    } }
    get cameraDistance():number{return this.zoom;}
    setCameraDistance(distance:number):void{if(Number.isFinite(distance))this.zoom=THREE.MathUtils.clamp(distance,4.2,28);}
    setViewMode(mode: "first" | "third"): void { this._viewMode = mode; try {
        localStorage.setItem("soundfolk-view", mode);
    }
    catch { } this.keys.clear(); }
    setLookMode(mode: "follow" | "scene"): void { this.look = mode; }
    setPaused(paused: boolean): void { this.paused = paused; this.keys.clear(); this.runRequested = false; this._running = false; this.drag = null; this.cancelWalkingIntent(); }
    setRunning(enabled: boolean): void { this.runRequested = !this.paused && enabled; }
    jump(): boolean {
        if (this.paused || !this.grounded) return false;
        this.jumpStarted = this.serverNow;
        return true;
    }
    interact(): boolean {
        if (this.paused || !this.kangarooIsNear()) return false;
        const message = this.kangaroo.interact(this.position);
        if (!message) return false;
        this.opts.wait(message);
        this.publishInteraction();
        return true;
    }
    walkToward(target: Pick<Position, "x" | "z">, stopDistance = 2.5): boolean {
        if (this.paused || ![target.x, target.z, stopDistance].every(Number.isFinite)) return false;
        this.walkingRevision++;
        this.walkingTarget = { x: target.x, z: target.z, stopDistance: Math.max(.15, Math.min(10, stopDistance)) };
        return true;
    }
    cancelWalkingIntent(): void { if (this.walkingTarget) this.walkingRevision++;this.walkingTarget = null; }
    project(x: number, z: number, height = 0): { x: number; y: number; visible: boolean } {
        const p = planetPoint(x, z, this.built.heightAt(x, z) + height), point = new THREE.Vector3(p.x, p.y, p.z);
        const delta = point.clone().sub(this.camera.position), length = delta.length();
        const hit = length > 0 ? new THREE.Ray(this.camera.position, delta.clone().normalize()).intersectSphere(new THREE.Sphere(new THREE.Vector3(), R - .03), new THREE.Vector3()) : null;
        const wall = length > .15 ? new THREE.Raycaster(this.camera.position, delta.clone().normalize(), .1, length - .08).intersectObjects(this.built.solids, false)[0] : undefined;
        const projected = point.project(this.camera), occluded = !!wall || hit !== null && this.camera.position.distanceTo(hit) < length - .08;
        return { x: (projected.x * .5 + .5) * this.host.clientWidth, y: (-projected.y * .5 + .5) * this.host.clientHeight,
            visible: !occluded && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 };
    }
    focus(): void { this.renderer.domElement.focus({ preventScroll: true }); }
    correctPosition(p: Position): void { if ([p.x, p.z, p.yaw].every(Number.isFinite)) {
        this.position = { ...p };
        this.selfYaw = p.yaw;
        this.keys.clear();
        this.walkingTarget = null;
        this.jumpStarted = null; this.jumpOffset = 0;
    } }
    goTo(id: string): void {
        const p = PLANET_PLACES.find(p => p.id === id); if (!p) return;
        // Explicit visits arrive where the person can see and approach the
        // work, outside the real base and roofs. Stored sounds never move.
        const green = p.kind === "green", front = p.kind === "tea" ? 3 : p.kind === "stage" || p.kind === "reading" ? 4 : 0;
        this.position = { x: p.x + (green ? 1.8 : 0), z: p.z + (green ? 2.2 : front), yaw: Math.PI };
        this.selfYaw = Math.PI; this.keys.clear(); this.cancelWalkingIntent(); this.jumpStarted = null; this.jumpOffset = 0; this.opts.area(p);
    }
    setEnvironment(environment: Environment, serverNow: string): void {
        const server = Date.parse(serverNow);
        if (!Number.isFinite(server) || (this.hasEnvironment&&environment.revision < this.environment.revision))
            return;
        this.serverSample = { server: this.hasEnvironment&&environment.revision === this.environment.revision ? Math.max(server, this.serverNow) : server, received: performance.now() };
        this.hasEnvironment=true;
        this.environment = { ...environment };
    }
    setPeople(people: Moves["people"], selfId: string | null): void {
        const wanted = new Set<string>();
        for (const p of people) {
            if (p.id === selfId)
                continue;
            wanted.add(p.id);
            let actor = this.others.get(p.id);
            if (!actor) {
                actor = this.actor(p, "player", p.name + " · PLAYER");
                this.others.set(p.id, actor);
            }
            actor.target = { x: p.x, z: p.z, yaw: p.yaw, motion: p.motion };
        }
        for (const [id, actor] of this.others)
            if (!wanted.has(id)) {
                actor.figure.dispose();
                actor.label.remove();
                this.others.delete(id);
            }
    }
    setNpcs(frames: readonly NpcRoutineFrame[]): void {
        this.npcFrames = frames.map(f => ({ ...f }));
        const ids = new Set(frames.map(f => f.id));
        for (const n of frames) {
            let actor = this.routines.get(n.id);
            if (!actor) {
                actor = this.actor({ id: n.id, name: n.label, avatar: n.avatar, x: n.x, z: n.z, yaw: n.yaw }, "npc", n.label);
                this.routines.set(n.id, actor);
            }
            actor.target = { x: n.x, z: n.z, yaw: n.yaw };
            actor.figure.visible = !['occupied', 'flushing'].includes(n.phase);
        }
        for (const [id, a] of this.routines)
            if (!ids.has(id)) {
                a.figure.dispose();
                a.label.remove();
                this.routines.delete(id);
            }
    }
    setContributions(sounds: readonly PlacedSound[]): void {
        this.publicSounds = sounds.filter(s => !s.removedAt && !s.whileIn).map(s => ({ ...s })).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
        this.residents.setContributions(this.publicSounds);
        this.built.setContributions(this.publicSounds);
        this.connections.setAll(this.publicSounds);
        this.cues.setAll(this.publicSounds, (x, z) => this.built.heightAt(x, z));
    }
    setWorks(works: readonly ChorusWork[]): void {
        this.works = works.map(work => ({ ...work, liveSources: work.liveSources.map(source => ({ ...source })),
            sources: work.sources.map(source => ({ ...source })), contributors: work.contributors.map(person => ({ ...person })) }));
        this.garden.setWorks(this.works);
    }
    /** Selecting a record only highlights its real sculpture; travel is explicit. */
    focusWork(workId: string | null): void { this.focusedWork = workId; this.garden.focusWork(workId); }
    private makeLabel(text: string, role: "player" | "npc"): HTMLSpanElement { const e = document.createElement("span"); e.className = "planet-person-label " + role; e.textContent = text; Object.assign(e.style, { position: "absolute", padding: "3px 8px", borderRadius: "12px", background: role === "player" ? "#e4f0f5" : "#f3e1bb", color: "#294a43", font: "600 12px system-ui", whiteSpace: "nowrap", border: role === "player" ? "1px solid #6196ad" : "1px solid #b89450" }); this.overlay.append(e);this.labelWidths.set(e,e.offsetWidth); return e; }
    private actor(p: Person & Position, role: "player" | "npc", label: string): Actor { const f = new AnimalFigure({ avatar: p.avatar, seed: p.id, role }); this.scene.add(f); return { figure: f, name: p.name, label: this.makeLabel(label, role), at: { x: p.x, z: p.z, yaw: p.yaw }, target: { x: p.x, z: p.z, yaw: p.yaw, motion: p.motion } }; }
    private locked(): Set<string> { const locked = new Set(this.npcFrames.filter(n => n.occupying).map(n => n.hutId)); for (const a of this.others.values()) {
        const h = sceneHutAt("planet", a.target.x, a.target.z);
        if (h)
            locked.add(h.id);
    } return locked; }
    private bind(): void {
        const canvas = this.renderer.domElement, signal = this.abort.signal;
        canvas.addEventListener("keydown", e => { if (this.paused || e.altKey || e.ctrlKey || e.metaKey)
            return; if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            this.keys.add(e.key.toLowerCase());
            if (e.key.toLowerCase() !== "shift") this.cancelWalkingIntent();
        } if (e.code === "Space") { e.preventDefault(); if (!e.repeat) this.jump(); }
        if (e.key.toLowerCase() === "e" && !e.repeat && !e.defaultPrevented) { if (this.interact()) e.preventDefault(); }
        if (e.key.toLowerCase() === "v")
            this.setViewMode(this.viewMode === "first" ? "third" : "first"); }, { signal });
        window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()), { signal });
        window.addEventListener("blur", () => { this.keys.clear(); this.runRequested = false; this._running = false; this.cancelWalkingIntent(); }, { signal });
        canvas.addEventListener("pointerdown", e => { if (this.paused)
            return; this.focus(); this.dragTravel = 0; this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }, { signal });
        canvas.addEventListener("pointermove", e => { if (!this.drag || this.drag.id !== e.pointerId || this.paused)
            return; const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y, sign = this.look === "follow" ? 1 : -1; this.dragTravel += Math.hypot(dx, dy); this.position.yaw -= dx * .006 * sign; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .004 * sign, -.5, .8); this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; }, { signal });
        canvas.addEventListener("pointerup", e => { if (this.paused || this.dragTravel > 6 || this.drag?.id !== e.pointerId)
            return; const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
            if (this.kangarooIsNear() && ray.intersectObject(this.kangaroo.figure, true).length) { this.interact(); return; }
            const sculpture = this.opts.work && this.garden.pick(ray, this.position);
            if (sculpture) {
                const wall = ray.intersectObjects(this.built.solids, false)[0];
                const ground = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), R - .03), new THREE.Vector3());
                if ((!wall || wall.distance >= sculpture.distance - .05) && (!ground || ray.ray.origin.distanceTo(ground) >= sculpture.distance - .05)) {
                    this.opts.work!(sculpture.workId, sculpture.placeId); return;
                }
            }
            const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), R), new THREE.Vector3()); if (hit) {
            hit.normalize();
            this.walkToward({ x: Math.atan2(hit.x, hit.z) * R, z: -Math.asin(hit.y) * R }, .25);
        } }, { signal });
        for (const event of ["pointerup", "pointercancel", "lostpointercapture"] as const)
            canvas.addEventListener(event, () => { this.drag = null; }, { signal });
        canvas.addEventListener("wheel", e => { if (this.paused || this.viewMode !== "third")
            return; e.preventDefault(); this.setCameraDistance(this.zoom + e.deltaY * .012); }, { signal, passive: false });
        const touch = document.createElement("div");
        this.touch = touch;
        touch.className = "planet-touch";
        touch.setAttribute("aria-label", "Walking controls");
        for (const [name, key, label] of [["forward", "w", "↑"], ["left", "a", "←"], ["back", "s", "↓"], ["right", "d", "→"]]) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "planet-move-" + name;
            b.setAttribute("aria-label", "Move " + name);
            b.textContent = label;
            b.addEventListener("pointerdown", e => { e.preventDefault(); if (!this.paused) {
                this.cancelWalkingIntent();
                this.keys.add(key);
                b.setPointerCapture(e.pointerId);
            } }, { signal });
            for (const ev of ["pointerup", "pointercancel", "lostpointercapture"] as const)
                b.addEventListener(ev, () => this.keys.delete(key), { signal });
            touch.append(b);
        }
        this.host.append(touch);
    }
    private resize(): void { const w = this.host.clientWidth, h = this.host.clientHeight; if (w < 1 || h < 1)
        return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.fov = w / h < .8 ? 72 : 68; this.camera.updateProjectionMatrix(); }
    private frame = (now: number): void => {
        if (this.disposed)
            return;
        this.frameId = requestAnimationFrame(this.frame);
        const dt = Math.min(.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        let forward = Number(this.keys.has("w") || this.keys.has("arrowup")) - Number(this.keys.has("s") || this.keys.has("arrowdown"));
        const right = Number(this.keys.has("d") || this.keys.has("arrowright")) - Number(this.keys.has("a") || this.keys.has("arrowleft"));
        if (forward || right)
            this.cancelWalkingIntent();
        if (!this.paused && this.walkingTarget) {
            if (planetDistance(this.position, this.walkingTarget) <= this.walkingTarget.stopDistance + .015)
                this.cancelWalkingIntent();
            else {
                this.position.yaw = bearingToward(this.position, this.walkingTarget);
                forward = 1;
            }
        }
        const wantsWalk = !this.paused && (forward !== 0 || right !== 0), locked = this.locked(), own = sceneHutAt("planet", this.position.x, this.position.z)?.id;
        let walk = false;
        this._running = false;
        if (wantsWalk) {
            const run = this.runRequested || this.keys.has("shift"), speed = run ? RUN_SPEED : WALK_SPEED;
            const available = this.walkingTarget ? Math.max(0, planetDistance(this.position, this.walkingTarget) - this.walkingTarget.stopDistance) : Infinity;
            const movement = moveOnPlanet(this.position, forward, right, Math.min(dt * speed, available), (x, z) => this.garden.canStand(x, z) && this.built.canStand(x, z, locked, own));
            if (movement.distance > 0) {
                this.position = movement.position;
                this.selfYaw = this.position.yaw - Math.atan2(right, forward);
                this.walking += movement.distance / (run ? 1.35 : 1.94);
                walk = true; this._running = run;
                this.lastWait = "";
            }
            if (movement.blocked) {
                const target = planetStep(this.position, forward, right, .15);
                const hut = PLANET_HUTS.find(h => locked.has(h.id) && planetDistance(target, { x: (h.x0 + h.x1) / 2, z: h.z1 }) < 3);
                if (hut && this.lastWait !== hut.id) {
                    this.lastWait = hut.id;
                    this.opts.wait("Someone is using " + hut.name + ". Wait for its green light.");
                }
                if (this.walkingTarget) { this.cancelWalkingIntent(); this.opts.wait("The path is blocked here. Walk around the obstacle, then try again."); }
            }
        }
        this.jumpOffset = this.jumpStarted === null ? 0 : jumpHeight((this.serverNow - this.jumpStarted) / 1000);
        if (this.jumpStarted !== null && this.serverNow - this.jumpStarted >= JUMP_DURATION * 1000) { this.jumpStarted = null; this.jumpOffset = 0; }
        const b = planetBasis(this.position.x, this.position.z), up = new THREE.Vector3(b.up.x, b.up.y, b.up.z), heading = new THREE.Vector3(b.south.x, b.south.y, b.south.z).multiplyScalar(Math.cos(this.position.yaw)).addScaledVector(new THREE.Vector3(b.east.x, b.east.y, b.east.z), Math.sin(this.position.yaw));
        const p = planetPoint(this.position.x, this.position.z, this.built.heightAt(this.position.x, this.position.z)), feet = new THREE.Vector3(p.x, p.y, p.z);
        // A roof can shorten the visual jump, but never open a wall/door or
        // change the server's two-dimensional occupancy admission.
        if (this.jumpOffset > 0) {
            const ceiling = new THREE.Raycaster(feet.clone().addScaledVector(up, 1.55), up, .01, this.jumpOffset + .12).intersectObjects(this.built.solids, false)[0];
            if (ceiling) this.jumpOffset = Math.max(0, Math.min(this.jumpOffset, ceiling.distance - .12));
        }
        if (this.self) {
            this.self.visible = this.viewMode === "third";
            this.self.setPose(this.jumpOffset > .05 ? "arms-up" : walk ? "walk" : "stand");
            this.self.setMotion(this.walking % 1, walk && this.grounded && !this.reduced.matches);
            onPlanet(this.self, this.position.x, this.position.z, this.built.heightAt(this.position.x, this.position.z) + this.jumpOffset, this.selfYaw);
        }
        const head = feet.clone().addScaledVector(up, 1.45 + this.jumpOffset);
        this.camera.up.copy(up);
        if (this.viewMode === "first") {
            this.camera.position.copy(head);
            this.camera.lookAt(head.clone().add(heading).addScaledVector(up, -this.pitch));
        }
        else {
            const desired = head.clone().addScaledVector(heading, -this.zoom).addScaledVector(up, this.zoom * .82 + this.pitch * 5), ray = desired.clone().sub(head), length = ray.length();
            const hits = new THREE.Raycaster(head, ray.normalize(), .1, length).intersectObjects(this.built.solids, false), distance = hits.length ? Math.max(.55, hits[0].distance - .22) : length;
            this.camera.position.copy(head).addScaledVector(ray, distance);
            const overview = THREE.MathUtils.clamp((this.zoom - 12) / 10, 0, 1) * (this.camera.aspect < .8 ? .5 : 1);
            const target = head.clone().lerp(up.clone().multiplyScalar(R * .1), overview);
            // Portrait controls occupy the lower view. Aim below the head so
            // the body and nearby work remain above the contribution card.
            // Fade with overview and scale at close zoom; collision is unchanged.
            if (this.camera.aspect < .8) target.addScaledVector(up, -Math.min(this.zoom, 8) * .16 * (1 - overview * 2));
            this.camera.lookAt(target);
            if (this.self)
                this.self.visible = thirdPersonBodyVisible(distance, hits.length > 0, !!own || this.built.inside(this.position.x, this.position.z));
        }
        this.camera.updateMatrixWorld();
        if(this.self&&this.selfLabel)this.label(this.selfLabel,this.self,this.position);
        this.built.animate?.(this.serverNow / 1000, this.reduced.matches);
        this.garden.frame(this.serverNow, this.reduced.matches);
        this.cues.frame(this.serverNow, this.reduced.matches);
        this.kangaroo.frame(dt, this.position, this.jumpOffset, (x, z) => this.garden.canStand(x, z) && !sceneHutAt("planet", x, z) && this.built.canStand(x, z, locked), this.reduced.matches);
        const companionWork = this.garden.workNear(this.kangaroo.at, 7, false);
        const companionBeat = this.serverNow / (60_000 / CHORUS_BPM) * Math.PI * 2;
        // This is a local companion reacting to a real shared work. It does
        // not add a participant, contribution or invented server event.
        const companionHop = companionWork?.duet && companionWork.variant === "ensemble" && !this.reduced.matches ? Math.max(0, Math.sin(companionBeat)) * .14 : 0;
        const companionYaw = companionWork && this.kangaroo.phase === "resting" ? bearingToward(this.kangaroo.at, PLANET_PLACES.find(place => place.id === companionWork.placeId)!) : this.kangaroo.at.yaw;
        this.kangaroo.figure.userData.soundWorkId = companionWork?.id ?? null;
        this.kangaroo.figure.userData.localOnly = true;
        onPlanet(this.kangaroo.figure, this.kangaroo.at.x, this.kangaroo.at.z, this.built.heightAt(this.kangaroo.at.x, this.kangaroo.at.z) + this.kangaroo.height + companionHop, companionYaw);
        const companionLabel = this.project(this.kangaroo.at.x, this.kangaroo.at.z, 2.1 + this.kangaroo.height + companionHop);
        this.kangarooLabel.hidden = !companionLabel.visible || planetDistance(this.position, this.kangaroo.at) > 3.4;
        if (!this.kangarooLabel.hidden) Object.assign(this.kangarooLabel.style, { left: companionLabel.x + "px", top: companionLabel.y + "px", transform: "translate(-50%,-100%)" });
        this.publishInteraction();
        this.host.dataset.replyThreads = String(this.connections.frame(this.position));
        const minute = minuteAt(this.environment, this.serverNow), day = Math.max(0, Math.sin((minute - 360) / 1440 * Math.PI * 2)), night = 1 - day;
        this.sun.intensity = .2 + day * 3.2;
        this.hemi.intensity = .8 + day * 1.4;
        this.sun.position.set(Math.cos(minute / 1440 * Math.PI * 2) * 45, 45, 20 + day * 45);
        const weather = this.environment.weather, cloudy = weather === "cloudy" || weather === "rain", mist = weather === "mist";
        this.sun.intensity *= cloudy ? .5 : mist ? .7 : 1;
        this.hemi.intensity *= cloudy ? .9 : 1;
        const bg = new THREE.Color(0x1e3441).lerp(new THREE.Color(cloudy ? 0xa5babb : mist ? 0xc2d4ce : 0xdce8da), day);
        this.scene.background = bg;
        this.scene.fog = mist ? new THREE.Fog(bg, 28, 85) : weather === "rain" ? new THREE.Fog(bg, 40, 120) : null;
        if (this.frameNumber % 24 === 0) {
            const nearby = [...this.built.lamps].sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceToSquared(this.camera.position) - b.getWorldPosition(new THREE.Vector3()).distanceToSquared(this.camera.position)).slice(0, 8);
            for (const lamp of this.built.lamps)
                lamp.visible = nearby.includes(lamp);
        }
        for (const lamp of this.built.lamps)
            lamp.intensity = 8 + night * 14;
        const fill = (x: number, z: number): number => this.built.inside(x, z) ? night * .17 : 0;
        if (this.self)
            this.self.setInteriorLight(fill(this.position.x, this.position.z));
        const positionActor = (a: Actor, walking: boolean): void => {
            if (Math.abs(a.target.x - a.at.x) > Math.PI * R)
                a.at = { ...a.target };
            else {
                a.at.x += (a.target.x - a.at.x) * Math.min(1, dt * 12);
                a.at.z += (a.target.z - a.at.z) * Math.min(1, dt * 12);
            }
            a.at.yaw = a.target.yaw;
            a.at.motion = a.target.motion;
            const jump = a.at.motion?.jump ?? 0, running = a.at.motion?.running ?? false;
            a.figure.setPose(jump > .05 ? "arms-up" : walking ? "walk" : "stand");
            a.figure.setMotion((this.serverNow / (running ? 430 : 700)) % 1, walking && jump < .05 && !this.reduced.matches);
            a.figure.setInteriorLight(fill(a.at.x, a.at.z));
            onPlanet(a.figure, a.at.x, a.at.z, this.built.heightAt(a.at.x, a.at.z) + jump, a.at.yaw);
            this.label(a.label, a.figure, a.at);
        };
        for (const a of this.others.values())
            positionActor(a, planetDistance(a.at, a.target) > .08);
        for (const [id, a] of this.routines) {
            const n = this.npcFrames.find(n => n.id === id);
            positionActor(a, !!n && ["walking", "entering", "leaving"].includes(n.phase));
            a.label.hidden = !a.figure.visible || a.label.hidden;
        }
        // Restore controller-native coordinates before running its actual rig.
        for (const [f, p] of this.residentPos) {
            f.position.set(p.x, this.built.heightAt(p.x, p.z), p.z);
            f.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
        }
        this.residents.frame(this.serverNow, dt, this.reduced.matches);
        for (const f of this.residents.figures) {
            const p = { x: f.position.x, z: f.position.z, yaw: f.rotation.y };
            this.residentPos.set(f, p);
            f.setInteriorLight(fill(p.x, p.z));
            this.sharedWorkGesture(f, p);
            onPlanet(f, p.x, p.z, this.built.heightAt(p.x, p.z), p.yaw);
            this.label(this.residentLabels.get(f)!, f, p);
        }
        this.arrangeLabels();
        for (const door of this.built.doors) {
            const n = this.npcFrames.find(n => n.hutId === door.id && n.occupying), taken = locked.has(door.id) || (own === door.id), h = PLANET_HUTS.find(h => h.id === door.id)!;
            const doorDistance = planetDistance(this.position, { x: (h.door.x0 + h.door.x1) / 2, z: h.z1 }), near = doorDistance < 2.4, passing = n && ["entering", "leaving"].includes(n.phase);
            const target = passing || (!taken && near) || (own === door.id && doorDistance <= .8) ? -Math.PI * .49 : 0;
            door.group.rotation.y += (target - door.group.rotation.y) * Math.min(1, dt * 8);
            const m = door.signal.material as THREE.MeshStandardMaterial;
            m.color.setHex(taken ? 0xc5725b : 0x6da781);
            m.emissive.copy(m.color);
        }
        for (const l of this.built.lanterns) {
            const nearby = this.publicSounds.filter(s => planetDistance(s, l) < 10), index = this.built.lanterns.indexOf(l), source = nearby[index % Math.max(1, nearby.length)], colour = source ? FAMILIES[findSound(source.soundId)!.family].colour : "#dfba74", m = l.mesh.material as THREE.MeshStandardMaterial;
            m.color.set(colour);
            m.emissive.set(colour);
            m.emissiveIntensity = source ? .8 : .15;
        }
        for (const flowers of this.built.blossoms) {
            const sounds = this.publicSounds.filter(s => planetDistance(s, flowers) < 12), source = sounds[0];
            flowers.mesh.instanceColor ??= new THREE.InstancedBufferAttribute(new Float32Array(flowers.mesh.count * 3).fill(1), 3);
            for (let i = 0; i < flowers.mesh.count; i++)
                flowers.mesh.setColorAt(i, new THREE.Color(source ? FAMILIES[findSound(sounds[i % sounds.length].soundId)!.family].colour : 0xdfba74));
            flowers.mesh.instanceColor.needsUpdate = true;
        }
        const inside = this.built.inside(this.position.x, this.position.z) || !!own;
        this.rain.visible = this.environment.weather === "rain" && !this.reduced.matches && !inside;
        if (this.rain.visible) {
            for (let i = 0; i < 240; i++) {
                const v = new THREE.Vector3(((i * 13) % 101) / 101 * 16 - 8, ((i * 17) % 103) / 103 * 12 - (now * .005 % 12), ((i * 23) % 107) / 107 * 16 - 8);
                v.y = ((v.y + 12) % 12) + .5;
                v.applyQuaternion(surfaceFrame(this.position.x, this.position.z)).add(feet);
                this.rainPositions.set([v.x, v.y, v.z], i * 3);
            }
            this.rain.geometry.getAttribute("position").needsUpdate = true;
        }
        this.renderer.render(this.scene, this.camera);
        this.opts.listen({ ...this.at, camera: this.camera, serverNow: this.serverNow });
        this.host.dataset.running = String(this._running);
        this.host.dataset.jumpHeight = this.jumpOffset.toFixed(3);
        this.host.dataset.grounded = String(this.grounded);
        this.host.dataset.walkingIntent = String(this.walkingIntent);
        this.host.dataset.renderedSelfRadius = String(this.self?.position.length() ?? R + this.built.heightAt(this.position.x, this.position.z) + this.jumpOffset);
        this.host.dataset.kangaroo = JSON.stringify({ id: this.kangaroo.id, ...this.kangaroo.at, phase: this.kangaroo.phase, height: this.kangaroo.height + companionHop, nearby: this.kangarooIsNear(), action: this.kangaroo.action, localOnly: true, soundWorkId: companionWork?.id ?? null });
        this.host.dataset.players = JSON.stringify([...this.others.entries()].map(([id, a]) => ({ id, name: a.name, x: a.at.x, z: a.at.z, running: a.at.motion?.running ?? false, jump: a.at.motion?.jump ?? 0, radius: a.figure.position.length() })));
        if (this.frameNumber++ % 12 === 0) {
            const area = this.area;
            this.opts.area(area);
            this.host.dataset.at = `${this.position.x.toFixed(3)},${this.position.z.toFixed(3)}`;
            this.host.dataset.view = this.viewMode;
            this.host.dataset.selfVisible = String(!!this.self?.visible);
            this.host.dataset.cameraDistance=this.zoom.toFixed(1);
            this.host.dataset.surfaceRadius = String(Math.hypot(feet.x, feet.y, feet.z));
            this.host.dataset.residentResponses = JSON.stringify(this.responses);
            this.host.dataset.npcRoutines = JSON.stringify(this.npcFrames);
            this.host.dataset.huts = JSON.stringify(this.built.doors.map(d => ({ id: d.id, taken: locked.has(d.id) || own === d.id, angle: d.group.rotation.y })));
            this.host.dataset.minute = minute.toFixed(1);
            this.host.dataset.serverNow=String(this.serverNow);
            this.host.dataset.weather=this.environment.weather;
            this.host.dataset.figureFill=String(this.self?.userData.interiorLight??0);
            this.host.dataset.sea = String(this.built.root.getObjectByName("soundfolk-ocean")?.visible ?? false);
            this.host.dataset.triangles = String(this.renderer.info.render.triangles);
            this.host.dataset.calls = String(this.renderer.info.render.calls);
            this.host.dataset.chorusGardens = JSON.stringify(this.garden.state);
            this.host.dataset.cafe = JSON.stringify(this.built.cafeState);
            this.host.dataset.soundCues = JSON.stringify(this.cues.state);
            this.host.dataset.chorusResidents = JSON.stringify(this.residents.figures.map(figure => ({
                id: figure.userData.soundResident.id, workId: figure.userData.chorusWorkId ?? null,
                variant: figure.userData.chorusVariant ?? null, npc: true })));
        }
    };
    private kangarooIsNear(): boolean {
        return !this.paused && planetDistance(this.position, this.kangaroo.at) <= 3.2 && this.project(this.kangaroo.at.x, this.kangaroo.at.z, 1.2).visible;
    }
    private sharedWorkGesture(figure: AnimalFigure, position: Position): void {
        const work = this.garden.workNear(position, 6);
        figure.userData.chorusWorkId = work?.id ?? null;
        figure.userData.chorusVariant = work?.variant ?? null;
        if (!work) return;
        let rig = this.gestureRigs.get(figure);
        if (!rig) {
            rig = { body: figure.getObjectByName("upper-body-rig"), head: figure.getObjectByName("head-rig"),
                left: figure.getObjectByName("left-shoulder"), right: figure.getObjectByName("right-shoulder") };
            this.gestureRigs.set(figure, rig);
        }
        const phase = this.reduced.matches ? 0 : this.serverNow / (60_000 / CHORUS_BPM) * Math.PI * 2;
        const anchor = PLANET_PLACES.find(place => place.id === work.placeId)!;
        position.yaw = bearingToward(position, anchor);
        figure.setPose("stand"); figure.setMotion(0, false);
        if (work.variant === "ensemble") {
            if (rig.body) rig.body.rotation.z = Math.sin(phase) * .08;
            if (rig.head) rig.head.rotation.x = .05 + Math.sin(phase) * .05;
            if (rig.left) rig.left.rotation.set(-.85 - Math.max(0, Math.sin(phase)) * .18, 0, -.18);
            if (rig.right) rig.right.rotation.set(-.85 - Math.max(0, Math.sin(phase)) * .18, 0, .18);
        } else if (work.variant === "habitat") {
            if (rig.head) rig.head.rotation.set(-.16, Math.sin(phase / 8) * .12, -.1);
            if (rig.body) rig.body.rotation.z = Math.sin(phase / 8) * .025;
        } else {
            if (rig.head) rig.head.rotation.set(-.12, 0, .08);
            if (rig.right) rig.right.rotation.set(-1.7, 0, .35 + Math.sin(phase / 4) * .07);
        }
    }
    private publishInteraction(): void {
        const action = this.kangarooIsNear() ? this.kangaroo.action : null;
        if (action === this.lastInteraction) return;
        this.lastInteraction = action;
        this.opts.interaction?.(action ? { kind: "kangaroo", label: "Kangaroo companion", action } : null);
    }
    private arrangeLabels(): void {
        // Cache widths at creation; avoid measuring layout in the render loop.
        const labels = [...this.overlay.querySelectorAll<HTMLElement>(".planet-person-label")].filter(e => !e.hidden).sort((a,b) => Number(b.classList.contains("player"))-Number(a.classList.contains("player")));
        const placed: {x:number;y:number;width:number}[] = [];
        for (const e of labels) {
            const x=parseFloat(e.style.left), width=this.labelWidths.get(e)??120;
            let y=parseFloat(e.style.top);
            for(let i=0;i<8&&placed.some(p=>Math.abs(x-p.x)<(width+p.width)/2+4&&Math.abs(y-p.y)<25);i++) y-=26;
            e.style.top=Math.max(25,y)+"px";placed.push({x,y:Math.max(25,y),width});
        }
    }
    private label(e: HTMLSpanElement, f: AnimalFigure, at: {
        x: number;
        z: number;
    }): void {
        const head = f.headAnchor.getWorldPosition(new THREE.Vector3()).addScaledVector(f.position.clone().normalize(), .2), distance = planetDistance(at, this.position);
        const focused = this.works.find(work => work.id === this.focusedWork);
        const focusedNpc = e.classList.contains("npc") && distance <= 8 && !!focused?.liveSources.some(source => source.id === f.userData.soundResident?.sourceId);
        const near = e === this.selfLabel || distance <= (e.classList.contains("npc") ? 3 : 8) || focusedNpc;
        const visible = f.visible && near && f.position.clone().normalize().dot(this.camera.position.clone().sub(f.position)) > 0;
        const v = head.project(this.camera);
        e.hidden = !visible || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
        if (!e.hidden) {
            e.style.left = (v.x * .5 + .5) * this.host.clientWidth + "px";
            e.style.top = (-v.y * .5 + .5) * this.host.clientHeight + "px";
            e.style.transform = "translate(-50%,-100%)";
        }
    }
    dispose(): void { if (this.disposed)
        return; this.disposed = true; cancelAnimationFrame(this.frameId); this.abort.abort(); this.resizeObserver.disconnect(); this.self?.dispose(); for (const a of [...this.others.values(), ...this.routines.values()])
        a.figure.dispose(); this.residents.dispose(); this.kangaroo.dispose(); this.connections.dispose(); this.garden.dispose(); this.built.dispose(); this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose(); this.cues.dispose(); this.renderer.dispose(); this.overlay.remove(); this.touch?.remove(); this.renderer.domElement.remove(); }
}

/** A room wall/roof can compress the camera into the player's own head.
 * Keep the selected third-person mode, but clear the body from that cramped
 * view; stepping back outside restores it without changing any controls. */
export function thirdPersonBodyVisible(distance: number, collisionLimited: boolean, indoors: boolean): boolean {
    return distance > 1.15 && !(indoors && collisionLimited && distance < 2.5);
}

/** Grounded paper/glass buds mark real contributions. Their shimmer means
 * "a sound lives here", not a promise that this visitor has enabled audio.
 * Geometry is pooled per world, while each ended source releases its own
 * animated material and instance buffer immediately. No point light is added. */
export class PlanetSourceCues {
    readonly root = new THREE.Group();
    private cues = new Map<string, { source: PlacedSound; group: THREE.Group; petals: THREE.InstancedMesh; crystal: THREE.Mesh; ring: THREE.Mesh }>();
    private geometries: THREE.BufferGeometry[] = [];
    private materials = new Map<string, { paper: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial; glow: THREE.ShaderMaterial }>();
    private disposed = false;
    private petal = new THREE.BufferGeometry();
    private seed = new THREE.IcosahedronGeometry(.13, 0);
    private disc = new THREE.CircleGeometry(.64, 32);
    private ring = new THREE.RingGeometry(.49, .515, 40);
    constructor(parent: THREE.Object3D) {
        this.root.name = "planet-contribution-buds"; parent.add(this.root);
        this.petal.setAttribute("position", new THREE.Float32BufferAttribute([-.13, 0, 0, 0, .48, .035, 0, .17, -.05, 0, .17, -.05, 0, .48, .035, .13, 0, 0], 3));
        this.petal.computeVertexNormals(); this.geometries.push(this.petal, this.seed, this.disc, this.ring);
    }
    get state() { return [...this.cues.values()].map(cue => ({ id: cue.source.id, authorId: cue.source.byId, soundId: cue.source.soundId, x: cue.source.x, z: cue.source.z, kind: "paper-glass-bud" })); }
    setAll(sounds: readonly PlacedSound[], heightAt: (x: number, z: number) => number = () => 0): void {
        if (this.disposed) return;
        const ended = new Set(sounds.filter(source => source.removedAt || source.whileIn).map(source => source.id));
        const live = [...new Map(sounds.filter(source => !ended.has(source.id) && !!findSound(source.soundId)).map(source => [source.id, source])).values()]
            .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
        const keep = new Set(live.map(source => source.id));
        for (const [id, cue] of this.cues) if (!keep.has(id)) {
            cue.group.removeFromParent(); cue.petals.dispose(); (cue.ring.material as THREE.Material).dispose(); this.cues.delete(id);
        }
        for (const source of live) {
            if (this.cues.has(source.id)) continue;
            const family = findSound(source.soundId)!.family, colour = new THREE.Color(FAMILIES[family].colour);
            let materials = this.materials.get(family);
            if (!materials) {
                materials = {
                    paper: new THREE.MeshStandardMaterial({ color: colour.clone().lerp(new THREE.Color(0xf6e5c6), .32), roughness: .85, side: THREE.DoubleSide }),
                    glass: new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: .42, roughness: .35, transparent: true, opacity: .86 }),
                    glow: new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
                        uniforms: { tint: { value: colour } },
                        vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
                        fragmentShader: "uniform vec3 tint; varying vec2 vUv; void main(){float r=length((vUv-.5)*2.0);float a=(1.0-smoothstep(.12,1.0,r))*.28;gl_FragColor=vec4(tint,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}" }),
                }; this.materials.set(family, materials);
            }
            const group = new THREE.Group(); group.name = "planet-sound-bud"; group.userData.sourceId = source.id; group.userData.authorId = source.byId;
            onPlanet(group, source.x, source.z, heightAt(source.x, source.z) + .055); this.root.add(group);
            const glow = new THREE.Mesh(this.disc, materials.glow); glow.name = "source-soft-ground-glow"; glow.rotation.x = -Math.PI / 2; glow.renderOrder = 1; group.add(glow);
            const petals = new THREE.InstancedMesh(this.petal, materials.paper, 4); petals.name = "source-paper-petals"; petals.castShadow = true; petals.receiveShadow = true; group.add(petals);
            const crystal = new THREE.Mesh(this.seed, materials.glass); crystal.position.y = .24; crystal.name = "source-glass-heart"; crystal.castShadow = true; group.add(crystal);
            const ringMaterial = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false });
            const ring = new THREE.Mesh(this.ring, ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .015; ring.name = "source-listening-ripple"; group.add(ring);
            this.cues.set(source.id, { source: { ...source }, group, petals, crystal, ring });
        }
    }
    frame(serverNow: number, reducedMotion = false): void {
        if (this.disposed || !Number.isFinite(serverNow)) return;
        const pose = new THREE.Object3D();
        for (const cue of this.cues.values()) {
            let seed = 0; for (const char of cue.source.id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
            const phase = seed % 997 / 997 * Math.PI * 2, time = reducedMotion ? phase : serverNow / 1600 + phase;
            for (let i = 0; i < cue.petals.count; i++) {
                pose.position.set(0, .06, 0); pose.rotation.set(0, i * Math.PI / 2 + phase, -.88 - Math.sin(time + i) * .06 * Number(!reducedMotion));
                pose.updateMatrix(); cue.petals.setMatrixAt(i, pose.matrix);
            }
            cue.petals.instanceMatrix.needsUpdate = true;
            cue.crystal.rotation.y = reducedMotion ? phase : time * .35;
            const progress = reducedMotion ? .4 : ((serverNow / 3300 + phase / (Math.PI * 2)) % 1 + 1) % 1;
            cue.ring.scale.setScalar(.8 + progress * .7);
            (cue.ring.material as THREE.MeshBasicMaterial).opacity = .06 + (1 - progress) * .25;
        }
    }
    dispose(): void {
        if (this.disposed) return; this.disposed = true;
        for (const cue of this.cues.values()) { cue.petals.dispose(); (cue.ring.material as THREE.Material).dispose(); }
        this.cues.clear(); for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials.values()) { material.paper.dispose(); material.glass.dispose(); material.glow.dispose(); }
        this.materials.clear(); this.root.removeFromParent();
    }
}
