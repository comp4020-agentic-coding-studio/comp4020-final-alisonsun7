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
type Actor = {
    figure: AnimalFigure;
    label: HTMLSpanElement;
    at: Position;
    target: Position;
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
    private cues = new Map<string, THREE.Mesh>();
    private residentPos = new Map<AnimalFigure, Position>();
    private residents: SoundResidents;
    private residentLabels = new Map<AnimalFigure, HTMLSpanElement>();
    private overlay = document.createElement("div");
    private touch: HTMLElement | null = null;
    private sun = new THREE.DirectionalLight(0xffefcf, 3.2);
    private hemi = new THREE.HemisphereLight(0xe2e9cf, 0x6d826f, 2.2);
    private position: Position = { x: 1.8, z: 2.2, yaw: Math.PI };
    private selfYaw = Math.PI;
    private keys = new Set<string>();
    private paused = false;
    private _viewMode: "first" | "third" = "third";
    private pitch = .12;
    private zoom = 12;
    private walkingTarget: {
        x: number;
        z: number;
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
    }) {
        const canvas = this.renderer.domElement;
        canvas.className = "planet-canvas";
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", "Soundfolk little world. Walk with W A S D or arrow keys; drag to look. V changes view.");
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
        this.residents = new SoundResidents({ surfaceHeight: (x, z) => this.built.heightAt(x, z), canStand: (x, z) => this.built.canStand(x, z, new Set()) && !sceneHutAt("planet", x, z), distanceBetween: planetDistance });
        const homes = [{ id: "green-neighbour", x: -3, z: 1, avatar: "cat", preference: "cozy" }, { id: "jam-neighbour", x: 9, z: -6.8, avatar: "dog", preference: "lively" }, { id: "reading-neighbour", x: -12, z: 8.5, avatar: "cat", preference: "cozy" }, { id: "garden-neighbour", x: -.5, z: 14.5, avatar: "dog", preference: "wild" }, { id: "tea-neighbour", x: -8, z: -6, avatar: "dog", preference: "lively" }, { id: "lantern-neighbour", x: -20, z: -14, avatar: "cat", preference: "lively" }] as const;
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
    get at(): Position { return { ...this.position, yaw: this.selfYaw }; }
    get viewMode(): "first" | "third" { return this._viewMode; }
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
    setPaused(paused: boolean): void { this.paused = paused; this.keys.clear(); this.drag = null; this.walkingTarget = null; }
    focus(): void { this.renderer.domElement.focus({ preventScroll: true }); }
    correctPosition(p: Position): void { if ([p.x, p.z, p.yaw].every(Number.isFinite)) {
        this.position = { ...p };
        this.selfYaw = p.yaw;
        this.keys.clear();
        this.walkingTarget = null;
    } }
    goTo(id: string): void { const p = PLANET_PLACES.find(p => p.id === id); if (!p)
        return; this.position = { x: p.x, z: p.z + (p.kind === "tea" ? 3 : 0), yaw: Math.PI }; this.selfYaw = Math.PI; this.keys.clear(); this.opts.area(p); }
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
            actor.target = { x: p.x, z: p.z, yaw: p.yaw };
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
        for (const [id, cue] of this.cues)
            if (!this.publicSounds.some(s => s.id === id)) {
                cue.geometry.dispose();
                (cue.material as THREE.Material).dispose();
                cue.parent?.removeFromParent();
                this.cues.delete(id);
            }
        for (const s of this.publicSounds) {
            if (this.cues.has(s.id))
                continue;
            const family = findSound(s.soundId)?.family;
            if (!family)
                continue;
            const m = new THREE.MeshStandardMaterial({ color: FAMILIES[family].colour, emissive: FAMILIES[family].colour, emissiveIntensity: .35, roughness: .6 });
            const cue = new THREE.Mesh(new THREE.TorusGeometry(.38, .055, 6, 32), m);
            cue.rotation.x = -Math.PI / 2;
            const g = new THREE.Group();
            g.add(cue);
            onPlanet(g, s.x, s.z, this.built.heightAt(s.x, s.z) + .08);
            this.scene.add(g);
            this.cues.set(s.id, cue);
        }
    }
    private makeLabel(text: string, role: "player" | "npc"): HTMLSpanElement { const e = document.createElement("span"); e.className = "planet-person-label " + role; e.textContent = text; Object.assign(e.style, { position: "absolute", padding: "3px 8px", borderRadius: "12px", background: role === "player" ? "#e4f0f5" : "#f3e1bb", color: "#294a43", font: "600 12px system-ui", whiteSpace: "nowrap", border: role === "player" ? "1px solid #6196ad" : "1px solid #b89450" }); this.overlay.append(e); return e; }
    private actor(p: Person & Position, role: "player" | "npc", label: string): Actor { const f = new AnimalFigure({ avatar: p.avatar, seed: p.id, role }); this.scene.add(f); return { figure: f, label: this.makeLabel(label, role), at: { x: p.x, z: p.z, yaw: p.yaw }, target: { x: p.x, z: p.z, yaw: p.yaw } }; }
    private locked(): Set<string> { const locked = new Set(this.npcFrames.filter(n => n.occupying).map(n => n.hutId)); for (const a of this.others.values()) {
        const h = sceneHutAt("planet", a.target.x, a.target.z);
        if (h)
            locked.add(h.id);
    } return locked; }
    private bind(): void {
        const canvas = this.renderer.domElement, signal = this.abort.signal;
        canvas.addEventListener("keydown", e => { if (this.paused || e.altKey || e.ctrlKey || e.metaKey)
            return; if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            this.keys.add(e.key.toLowerCase());
        } if (e.key.toLowerCase() === "v")
            this.setViewMode(this.viewMode === "first" ? "third" : "first"); }, { signal });
        window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()), { signal });
        window.addEventListener("blur", () => this.keys.clear(), { signal });
        canvas.addEventListener("pointerdown", e => { if (this.paused)
            return; this.focus(); this.dragTravel = 0; this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }, { signal });
        canvas.addEventListener("pointermove", e => { if (!this.drag || this.drag.id !== e.pointerId || this.paused)
            return; const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y, sign = this.look === "follow" ? 1 : -1; this.dragTravel += Math.hypot(dx, dy); this.position.yaw -= dx * .006 * sign; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .004 * sign, -.5, .8); this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; }, { signal });
        canvas.addEventListener("pointerup", e => { if (this.paused || this.dragTravel > 6 || this.drag?.id !== e.pointerId)
            return; const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera); const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), R), new THREE.Vector3()); if (hit) {
            hit.normalize();
            this.walkingTarget = { x: Math.atan2(hit.x, hit.z) * R, z: -Math.asin(hit.y) * R };
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
        const dt = Math.min(.05, (now - this.last) / 1000);
        this.last = now;
        let forward = Number(this.keys.has("w") || this.keys.has("arrowup")) - Number(this.keys.has("s") || this.keys.has("arrowdown"));
        const right = Number(this.keys.has("d") || this.keys.has("arrowright")) - Number(this.keys.has("a") || this.keys.has("arrowleft"));
        if (forward || right)
            this.walkingTarget = null;
        if (!this.paused && this.walkingTarget) {
            if (planetDistance(this.position, this.walkingTarget) < .35)
                this.walkingTarget = null;
            else {
                const target = planetPoint(this.walkingTarget.x, this.walkingTarget.z), b = planetBasis(this.position.x, this.position.z), direction = new THREE.Vector3(target.x, target.y, target.z).projectOnPlane(new THREE.Vector3(b.up.x, b.up.y, b.up.z));
                this.position.yaw = Math.atan2(direction.dot(new THREE.Vector3(b.east.x, b.east.y, b.east.z)), direction.dot(new THREE.Vector3(b.south.x, b.south.y, b.south.z)));
                forward = 1;
            }
        }
        const walk = !this.paused && (forward !== 0 || right !== 0), locked = this.locked(), own = sceneHutAt("planet", this.position.x, this.position.z)?.id;
        if (walk) {
            const target = planetStep(this.position, forward, right, dt * 3.2);
            if (this.built.canStand(target.x, target.z, locked, own)) {
                this.position = target;
                this.selfYaw = target.yaw - Math.atan2(right, forward);
                this.walking += dt * 1.65;
                this.lastWait = "";
            }
            else {
                const hut = PLANET_HUTS.find(h => locked.has(h.id) && planetDistance(target, { x: (h.x0 + h.x1) / 2, z: h.z1 }) < 3);
                if (hut && this.lastWait !== hut.id) {
                    this.lastWait = hut.id;
                    this.opts.wait("Someone is using " + hut.name + ". Wait for its green light.");
                }
            }
        }
        const b = planetBasis(this.position.x, this.position.z), up = new THREE.Vector3(b.up.x, b.up.y, b.up.z), heading = new THREE.Vector3(b.south.x, b.south.y, b.south.z).multiplyScalar(Math.cos(this.position.yaw)).addScaledVector(new THREE.Vector3(b.east.x, b.east.y, b.east.z), Math.sin(this.position.yaw));
        const p = planetPoint(this.position.x, this.position.z, this.built.heightAt(this.position.x, this.position.z)), feet = new THREE.Vector3(p.x, p.y, p.z);
        if (this.self) {
            this.self.visible = this.viewMode === "third";
            this.self.setPose(walk ? "walk" : "stand");
            this.self.setMotion(this.walking % 1, walk && !this.reduced.matches);
            onPlanet(this.self, this.position.x, this.position.z, this.built.heightAt(this.position.x, this.position.z), this.selfYaw);
        }
        const head = feet.clone().addScaledVector(up, 1.45);
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
            this.camera.lookAt(head.clone().lerp(up.clone().multiplyScalar(R * .1), overview));
            if (this.self)
                this.self.visible = distance > 1.15;
        }
        this.camera.updateMatrixWorld();
        if(this.self&&this.selfLabel)this.label(this.selfLabel,this.self,this.position);
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
            a.figure.setPose(walking ? "walk" : "stand");
            a.figure.setMotion((this.serverNow / 700) % 1, walking && !this.reduced.matches);
            a.figure.setInteriorLight(fill(a.at.x, a.at.z));
            onPlanet(a.figure, a.at.x, a.at.z, this.built.heightAt(a.at.x, a.at.z), a.at.yaw);
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
            onPlanet(f, p.x, p.z, this.built.heightAt(p.x, p.z), p.yaw);
            this.label(this.residentLabels.get(f)!, f, p);
        }
        for (const door of this.built.doors) {
            const n = this.npcFrames.find(n => n.hutId === door.id && n.occupying), taken = locked.has(door.id) || (own === door.id), h = PLANET_HUTS.find(h => h.id === door.id)!;
            const near = planetDistance(this.position, { x: (h.door.x0 + h.door.x1) / 2, z: h.z1 }) < 2.4, passing = n && ["entering", "leaving"].includes(n.phase);
            const target = passing || (!taken && near) || (own === door.id && near) ? -Math.PI * .49 : 0;
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
        this.opts.listen({ ...this.position, camera: this.camera, serverNow: this.serverNow });
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
            this.host.dataset.triangles = String(this.renderer.info.render.triangles);
            this.host.dataset.calls = String(this.renderer.info.render.calls);
        }
    };
    private label(e: HTMLSpanElement, f: AnimalFigure, at: {
        x: number;
        z: number;
    }): void {
        const head = f.headAnchor.getWorldPosition(new THREE.Vector3()).addScaledVector(f.position.clone().normalize(), .2), distance = planetDistance(at, this.position), visible = f.visible && distance < (e.classList.contains("npc")?12:20) && f.position.clone().normalize().dot(this.camera.position.clone().sub(f.position)) > 0;
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
        a.figure.dispose(); this.residents.dispose(); this.built.dispose(); this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose(); for (const cue of this.cues.values()) {
        cue.geometry.dispose();
        (cue.material as THREE.Material).dispose();
        cue.parent?.removeFromParent();
    } this.renderer.dispose(); this.overlay.remove(); this.touch?.remove(); this.renderer.domElement.remove(); }
}
