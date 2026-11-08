// Original surface-water visitors. Real public ingredients cause them; neither
// these animals nor the five small scenery fish are people or audio emitters.
import * as THREE from "three";
import { PLANET_HALF, PLANET_RADIUS as R, planetBasis, planetCoordsValid, planetDistance, planetPoint, planetStep } from "../shared/planet.js";
import type { PlacedSound, Position } from "../shared/protocol.js";
import { authorMark } from "../shared/chorus-signature.js";

type Point = { x: number; z: number };
export type WaterlifeKind = "fish" | "frog" | "whale";
export type WaterlifeAction = "swimming" | "bubbling" | "resting" | "calling" | "hopping" | "cruising" | "breathing" | "leaping";
export interface SoundWaterlifeOptions {
    shoreline(x: number): number;
    isWater?: (x: number, z: number) => boolean;
    waterHeight?: number;
    pool?: Point & { radius: number; height: number };
}
export interface WaterlifeAnchor extends Point { area: "pond" | "ocean"; height: number; phase: number; radius?: number }
export interface SoundWaterlifeState {
    sourceId: string; byId: string; by: string; soundId: string; kind: WaterlifeKind;
    origin: "player"; sourceX: number; sourceZ: number; visible: boolean; count: number; color: string;
    reason?: "budget" | "no-nearby-water" | "no-water-route" | "not-started";
    anchorX?: number; anchorZ?: number; x?: number; z?: number; height?: number; yaw?: number;
    phase?: number; action?: WaterlifeAction;
}
export interface WaterlifePose extends Position {
    height: number; phase: number; action: WaterlifeAction;
    throat: number; hop: number; pitch: number; roll: number; spray: number; bubbles: number; splash: number;
}
interface Group {
    source: PlacedSound; kind: WaterlifeKind; anchor: WaterlifeAnchor;
    models: THREE.Group[]; accent: THREE.MeshStandardMaterial | null; pose: WaterlifePose;
}
const TAU = Math.PI * 2, FISH_SOURCES = 4, FROG_SOURCES = 2, WHALE_SOURCES = 2;
const FISH_PER_SOURCE = 3, FROGS_PER_SOURCE = 2, MAX_FISH = 5 + FISH_SOURCES * FISH_PER_SOURCE;
const MAX_BUBBLES = FISH_SOURCES * 5, MAX_RIPPLES = FROG_SOURCES * 4 + WHALE_SOURCES * 4, MAX_SPRAY = WHALE_SOURCES * 12;
const DEFAULT_POOL = { x: 16, z: 14, radius: 2.55, height: .035 };
const kindFor = (soundId: string): WaterlifeKind | null => soundId === "pond-bubbles" ? "fish" : soundId === "pond-frogs" ? "frog" : soundId === "whale-song" ? "whale" : null;
const wrap = (x: number): number => ((x + PLANET_HALF) % (PLANET_HALF * 2) + PLANET_HALF * 2) % (PLANET_HALF * 2) - PLANET_HALF;
const unit = (x: number): number => ((x % 1) + 1) % 1;
function seed(id: string): number { let h = 2166136261;for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);return (h >>> 0) / 0x100000000; }
function bearing(from: Point, to: Point): number {
    const point = planetPoint(to.x, to.z), b = planetBasis(from.x, from.z);
    return Math.atan2(point.x * b.east.x + point.y * b.east.y + point.z * b.east.z, point.x * b.south.x + point.y * b.south.y + point.z * b.south.z);
}
function ocean(point: Point, options: SoundWaterlifeOptions): boolean {
    const shore = options.shoreline(point.x);
    return planetCoordsValid(point.x, point.z) && Number.isFinite(shore) && point.z > shore + .15 && point.z < PLANET_HALF / 2 - .35
        && (!options.isWater || options.isWater(point.x, point.z));
}
function shoreNear(source: Point, options: SoundWaterlifeOptions): Point | null {
    let best: Point | null = null, nearest = Infinity;
    // Search only this nearby coast, never the other side of the sphere.
    for (let offset = -12; offset <= 12; offset += 1) {
        const x = wrap(source.x + offset), point = { x, z: options.shoreline(x) };
        if (!planetCoordsValid(point.x, point.z)) continue;
        const distance = planetDistance(source, point);
        if (distance < nearest) { nearest = distance;best = point; }
    }
    return best;
}
function circle(anchor: Point, angle: number, radius: number): Position {
    const point = planetStep({ ...anchor, yaw: 0 }, Math.cos(angle), Math.sin(angle), radius);
    const ahead = planetStep({ ...anchor, yaw: 0 }, Math.cos(angle + .001), Math.sin(angle + .001), radius);
    return { x: point.x, z: point.z, yaw: bearing(point, ahead) };
}
function oceanFootprint(point: Point, radius: number, options: SoundWaterlifeOptions): boolean {
    if (!ocean(point, options)) return false;
    for (let i = 0; i < 12; i++) if (!ocean(planetStep({ ...point, yaw: 0 }, Math.cos(i / 12 * TAU), Math.sin(i / 12 * TAU), radius), options)) return false;
    return true;
}

/** A bounded, deterministic real-water anchor; the ingredient itself stays put. */
export function findWaterlifeAnchor(source: Pick<PlacedSound, "id" | "x" | "z">, kind: WaterlifeKind, options: SoundWaterlifeOptions): { anchor: WaterlifeAnchor | null; reason?: "no-nearby-water" | "no-water-route" } {
    if (!planetCoordsValid(source.x, source.z)) return { anchor: null, reason: "no-nearby-water" };
    const pool = options.pool ?? DEFAULT_POOL, pondDistance = planetDistance(source, pool), shore = shoreNear(source, options);
    const shoreDistance = shore ? planetDistance(source, shore) : Infinity, phase = seed(source.id) * TAU;
    if (kind === "frog") return pondDistance <= 8 ? { anchor: { ...pool, area: "pond", phase } } : { anchor: null, reason: "no-nearby-water" };
    if (kind === "fish" && pondDistance <= 8 && pondDistance <= shoreDistance) return { anchor: { ...pool, area: "pond", phase } };
    if (!shore || shoreDistance > (kind === "whale" ? 12 : 10)) return { anchor: null, reason: "no-nearby-water" };
    const offsets = kind === "whale" ? [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12, 14, -14, 16, -16] : [0, 2, -2, 4, -4, 6, -6];
    const candidates = offsets.flatMap(offset => (kind === "whale" ? [5.2, 6.5, 8, 10] : [1.9]).map(depth => {
        const x = wrap(shore.x + offset);return { x, z: options.shoreline(x) + depth, area: "ocean" as const, height: options.waterHeight ?? .055, phase };
    })).filter(anchor => planetCoordsValid(anchor.x, anchor.z) && planetDistance(source, anchor) <= (kind === "whale" ? 18 : 14))
        .sort((a, b) => planetDistance(source, a) - planetDistance(source, b) || a.x - b.x || a.z - b.z);
    for (const anchor of candidates) {
        let safe = true;
        for (let i = 0; i < 72; i++) if (!oceanFootprint(circle(anchor, i / 72 * TAU, kind === "whale" ? 1.05 : .55), kind === "whale" ? 2.65 : .7, options)) { safe = false;break; }
        if (safe) return { anchor };
    }
    return { anchor: null, reason: "no-water-route" };
}
const envelope = (time: number, start: number, duration: number): number => time >= start && time <= start + duration ? Math.sin((time - start) / duration * Math.PI) : 0;

/** The whole pose is a sample of source time, never integrated frame deltas. */
export function sampleWaterlife(kind: WaterlifeKind, anchor: WaterlifeAnchor, sourceAt: number, serverNow: number, member = 0, reducedMotion = false): WaterlifePose | null {
    if (![sourceAt, serverNow, member].every(Number.isFinite) || serverNow < sourceAt) return null;
    const time = reducedMotion ? 0 : Math.max(0, serverNow - sourceAt) / 1000;
    const blank = { throat: 0, hop: 0, pitch: 0, roll: 0, spray: 0, bubbles: 0, splash: 0 };
    if (kind === "fish") {
        const phase = anchor.phase + member * 2.1 + time * .48;
        const point = circle(anchor, phase, anchor.area === "pond" ? .85 + member * .25 : .35 + member * .1);
        const bubbles = reducedMotion ? 0 : envelope(time % 12, .1, 2.9);
        return { ...point, ...blank, height: anchor.height + .075, phase, action: bubbles > .05 ? "bubbling" : "swimming", bubbles };
    }
    if (kind === "frog") {
        const cycle = Math.floor(time / 54), t = time % 54, progress = Math.max(0, Math.min(1, (t - 10.5) / .8));
        const phase = anchor.phase + member * .5, radius = Math.min(2.05, Math.max(.6, (anchor.radius ?? DEFAULT_POOL.radius) - .6)) + (cycle % 2 ? -1 : 1) * (-.18 + .36 * (progress * progress * (3 - 2 * progress)));
        const point = circle(anchor, phase, radius), throat = reducedMotion ? .2 : envelope(time % 18, member === 0 ? .8 : 1.55, member === 0 ? .4 : .6);
        const hop = reducedMotion ? 0 : Math.sin(progress * Math.PI);
        return { ...point, ...blank, height: anchor.height + .035 + hop * .42, yaw: bearing(point, anchor), phase, throat, hop,
            action: hop > .01 ? "hopping" : throat > .1 ? "calling" : "resting", splash: !reducedMotion ? envelope(t, 11.3, 1.6) : 0 };
    }
    const phase = anchor.phase + time / 58 * TAU, point = circle(anchor, phase, 1.05), t = Math.max(0, time - 5.2) % 58;
    let height = anchor.height - .22, pitch = 0, roll = 0, spray = 0, splash = 0, action: WaterlifeAction = "cruising";
    if (!reducedMotion && time < 5.2) {
        height += Math.sin(time / 5.2 * Math.PI) * .23;spray = envelope(time, .65, 3.7);action = "breathing";
    } else if (!reducedMotion && t >= 14 && t < 18.2) {
        const p = (t - 14) / 4.2;height += Math.sin(p * Math.PI) ** 2 * 3.05;pitch = -Math.sin(p * TAU) * 1.05;roll = Math.sin(p * Math.PI) * .26;action = "leaping";
    } else if (!reducedMotion && t >= 30 && t < 35.2) {
        height += Math.sin((t - 30) / 5.2 * Math.PI) * .23;spray = envelope(t, 30.65, 3.7);action = "breathing";
    }
    if (!reducedMotion && time >= 5.2) splash = envelope(t, 18.15, 2.8);
    return { ...point, ...blank, height, phase, pitch, roll, spray, splash, action };
}

function combine(parts: { geometry: THREE.BufferGeometry; color: number }[]): THREE.BufferGeometry {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    for (const part of parts) {
        const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry, p = g.getAttribute("position"), n = g.getAttribute("normal"), c = new THREE.Color(part.color);
        for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i));normals.push(n.getX(i), n.getY(i), n.getZ(i));colors.push(c.r, c.g, c.b); }
        if (g !== part.geometry) g.dispose();part.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));geometry.computeBoundingSphere();return geometry;
}
const solid = (size: [number, number, number], at: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry => new THREE.SphereGeometry(1, 12, 8).scale(...size).translate(...at);

export class SoundWaterlife {
    readonly root = new THREE.Group();
    private readonly geometries = new Set<THREE.BufferGeometry>();
    private readonly materials = new Set<THREE.Material>();
    private readonly fishBody: THREE.InstancedMesh;
    private readonly fishTail: THREE.InstancedMesh;
    private readonly bubbles: THREE.InstancedMesh;
    private readonly ripples: THREE.InstancedMesh;
    private readonly spray: THREE.InstancedMesh;
    private readonly pads: THREE.InstancedMesh;
    private readonly frogGeometry: THREE.BufferGeometry;
    private readonly frogLegGeometry: THREE.BufferGeometry;
    private readonly whaleGeometry: THREE.BufferGeometry;
    private readonly whaleTailGeometry: THREE.BufferGeometry;
    private readonly whaleFlipperGeometry: THREE.BufferGeometry;
    private readonly plainGeometry: THREE.BufferGeometry;
    private readonly bodyMaterial: THREE.MeshStandardMaterial;
    private readonly frogThroatMaterial: THREE.MeshStandardMaterial;
    private readonly whaleFlipperMaterial: THREE.MeshStandardMaterial;
    private groups = new Map<string, Group>();
    private sources: PlacedSound[] = [];
    private rejected = new Map<string, NonNullable<SoundWaterlifeState["reason"]>>();
    private removed = new Set<string>();
    private disposed = false;
    private lastNow: number | null = null;
    private reducedMotion = false;
    private readonly matrix = new THREE.Matrix4();
    private readonly pose = new THREE.Object3D();
    private readonly localPose = new THREE.Object3D();
    private readonly pointMatrix = new THREE.Matrix4();
    private readonly yaw = new THREE.Quaternion();
    private readonly upAxis = new THREE.Vector3(0, 1, 0);
    private readonly scenery: { anchor: WaterlifeAnchor; count: number }[];

    constructor(parent: THREE.Scene | THREE.Group, private readonly options: SoundWaterlifeOptions) {
        this.root.name = "sound-waterlife";
        const material = (color: number, vertexColors = false): THREE.MeshStandardMaterial => { const m = new THREE.MeshStandardMaterial({ color, roughness: .94, metalness: 0, vertexColors, flatShading: true });this.materials.add(m);return m; };
        const geometry = (g: THREE.BufferGeometry): THREE.BufferGeometry => { this.geometries.add(g);return g; };
        this.bodyMaterial = material(0xffffff, true);this.frogThroatMaterial = material(0xddd49a);this.whaleFlipperMaterial = material(0x6c939a);
        this.plainGeometry = geometry(new THREE.SphereGeometry(1, 10, 7));
        const instances = (name: string, g: THREE.BufferGeometry, m: THREE.Material, capacity: number): THREE.InstancedMesh => {
            geometry(g);const mesh = new THREE.InstancedMesh(g, m, capacity);mesh.name = name;mesh.count = 0;mesh.frustumCulled = false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;
        };
        const fishBody = combine([
            { geometry: solid([.13, .11, .28]), color: 0xe6bc76 }, { geometry: solid([.105, .052, .21], [0, -.053, .035]), color: 0xf2dfb2 },
            { geometry: new THREE.ConeGeometry(.075, .13, 4).scale(.65, 1, 1).translate(0, .115, -.035), color: 0xbb7e64 },
            ...[-1, 1].map(sign => ({ geometry: solid([.014, .019, .016], [sign * .105, .025, .17]), color: 0x314f4d })),
            { geometry: solid([.035, .013, .013], [0, .012, .281]), color: 0xb87568 },
        ]);
        const fishTail = combine([-1, 1].map(sign => ({ geometry: solid([.10, .025, .14]).rotateZ(sign * .42).rotateX(sign * .45).translate(sign * .06, 0, -.36), color: 0xc58b73 })));
        this.fishBody = instances("waterlife-fish-bodies", fishBody, this.bodyMaterial, MAX_FISH);this.fishTail = instances("waterlife-fish-tails", fishTail, this.bodyMaterial, MAX_FISH);
        const bubbleMaterial = material(0xcce2d9);bubbleMaterial.transparent = true;bubbleMaterial.opacity = .63;bubbleMaterial.depthWrite = false;
        this.bubbles = instances("waterlife-bubbles", this.plainGeometry, bubbleMaterial, MAX_BUBBLES);
        const foamMaterial = material(0xe9f0dc);foamMaterial.transparent = true;foamMaterial.opacity = .66;foamMaterial.depthWrite = false;
        const ring = new THREE.RingGeometry(.88, 1, 36).rotateX(-Math.PI / 2), ringPoints = ring.getAttribute("position");
        for (let i = 0; i < ringPoints.count; i++) ringPoints.setY(i, -(ringPoints.getX(i) ** 2 + ringPoints.getZ(i) ** 2) / (2 * R));ring.computeVertexNormals();
        this.ripples = instances("waterlife-ripples", ring, foamMaterial, MAX_RIPPLES);this.spray = instances("waterlife-whale-spray", this.plainGeometry, foamMaterial, MAX_SPRAY);
        const padMaterial = material(0x719f82);this.pads = instances("waterlife-lily-pads", new THREE.CylinderGeometry(.38, .36, .035, 18), padMaterial, FROG_SOURCES * FROGS_PER_SOURCE);
        this.frogGeometry = geometry(combine([
            { geometry: solid([.23, .14, .28], [0, .18, 0]), color: 0x7d9f70 }, { geometry: solid([.24, .12, .19], [0, .25, .19]), color: 0x8aab78 },
            { geometry: solid([.17, .055, .18], [0, .12, .10]), color: 0xd3ce9d },
            ...[-1, 1].flatMap(sign => [{ geometry: solid([.075, .075, .075], [sign * .15, .35, .24]), color: 0xa2b47d },
                { geometry: solid([.038, .041, .034], [sign * .15, .365, .292]), color: 0x345247 },
                { geometry: solid([.048, .12, .045], [sign * .15, .14, .26]), color: 0x6d9169 },
                { geometry: solid([.07, .025, .065], [sign * .17, .025, .31]), color: 0x71926a }]),
        ]));
        this.frogLegGeometry = geometry(combine([{ geometry: solid([.11, .09, .16], [0, .095, -.055]), color: 0x729566 }, { geometry: solid([.09, .026, .17], [0, .026, .09]), color: 0x729566 }]));
        this.whaleGeometry = geometry(combine([
            { geometry: solid([.53, .46, 1.33]), color: 0x638d98 }, { geometry: solid([.47, .38, .64], [0, .015, 1.02]), color: 0x638d98 },
            { geometry: solid([.38, .10, .95], [0, -.34, .30]), color: 0xd5ddce },
            { geometry: solid([.26, .23, .63], [0, -.03, -1.18]), color: 0x638d98 },
            { geometry: solid([.43, .035, .45], [0, -.20, 1.22]), color: 0xd4dccd },
            { geometry: new THREE.ConeGeometry(.16, .37, 6).scale(.65, 1, 1).rotateX(-.35).translate(0, .49, -.65), color: 0x4d7b88 },
            ...[-1, 1].map(sign => ({ geometry: solid([.027, .032, .035], [sign * .445, .07, 1.05]), color: 0x294951 })),
            { geometry: solid([.052, .012, .075], [0, .385, .80]), color: 0x345f6b },
        ]));
        this.whaleTailGeometry = geometry(combine([-1, 1].map(sign => ({ geometry: solid([.49, .065, .24]).rotateY(sign * .22).translate(sign * .37, 0, -.16), color: 0x507f8b }))));
        this.whaleFlipperGeometry = geometry(solid([.16, .075, .58]).translate(0, 0, -.32));
        const pool = options.pool ?? DEFAULT_POOL, offshore = findWaterlifeAnchor({ id: "scenery-ocean-fish", x: 16, z: options.shoreline(16) - .2 }, "fish", options).anchor;
        this.scenery = [{ anchor: { ...pool, area: "pond", phase: 1.25 }, count: 2 }, ...(offshore ? [{ anchor: offshore, count: 3 }] : [])];
        parent.add(this.root);this.frame(0, true);
    }

    get sceneryState(): { origin: "scenery"; kind: "fish"; count: number; x: number; z: number; area: "pond" | "ocean" }[] {
        return this.disposed ? [] : this.scenery.map(({ anchor, count }) => ({ origin: "scenery", kind: "fish", count, x: anchor.x, z: anchor.z, area: anchor.area }));
    }
    get state(): SoundWaterlifeState[] {
        return this.sources.map(source => {
            const group = this.groups.get(source.id), reason = this.rejected.get(source.id), visible = !!group && (this.lastNow ?? 0) >= Date.parse(source.at);
            return { sourceId: source.id, byId: source.byId, by: source.by, soundId: source.soundId, kind: kindFor(source.soundId)!, origin: "player", sourceX: source.x, sourceZ: source.z,
                visible, count: visible ? group.kind === "fish" ? FISH_PER_SOURCE : group.kind === "frog" ? FROGS_PER_SOURCE : 1 : 0, color: authorMark(source.byId).color,
                ...(reason ? { reason } : !visible && group ? { reason: "not-started" as const } : {}),
                ...(group ? { anchorX: group.anchor.x, anchorZ: group.anchor.z, ...group.pose } : {}) };
        });
    }
    private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, parent: THREE.Group): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);mesh.name = name;mesh.castShadow = true;mesh.receiveShadow = true;parent.add(mesh);return mesh;
    }
    private frog(): THREE.Group {
        const model = new THREE.Group();model.name = "sound-born-frog";this.mesh(this.frogGeometry, this.bodyMaterial, "frog-body-and-eyes", model);
        const throat = this.mesh(this.plainGeometry, this.frogThroatMaterial, "frog-calling-throat", model);throat.position.set(0, .19, .31);throat.scale.set(.12, .065, .07);
        for (const side of [-1, 1]) { const leg = this.mesh(this.frogLegGeometry, this.bodyMaterial, side < 0 ? "frog-left-hindleg" : "frog-right-hindleg", model);leg.position.x = side * .22; }
        return model;
    }
    private whale(accent: THREE.Material): THREE.Group {
        const model = new THREE.Group();model.name = "sound-born-whale";this.mesh(this.whaleGeometry, this.bodyMaterial, "whale-body-and-face", model);
        const tail = this.mesh(this.whaleTailGeometry, this.bodyMaterial, "whale-tail-flukes", model);tail.position.set(0, -.04, -1.65);
        for (const side of [-1, 1]) { const fin = this.mesh(this.whaleFlipperGeometry, this.whaleFlipperMaterial, side < 0 ? "whale-left-flipper" : "whale-right-flipper", model);fin.position.set(side * .43, -.12, .43);fin.rotation.y = -side * .7; }
        const mark = this.mesh(this.plainGeometry, accent, "whale-author-mark", model);mark.position.set(.23, .43, -.16);mark.scale.set(.13, .018, .20);
        return model;
    }
    setSources(sources: readonly PlacedSound[]): void {
        if (this.disposed) return;
        // This API consumes the controller's complete public snapshot. A known
        // immutable ID disappearing is a withdrawal even when the controller
        // no longer retains its tombstone row; stale ACKs cannot revive it.
        const present = new Set(sources.map(source => source.id));
        for (const previous of this.sources) if (!present.has(previous.id)) this.removed.add(previous.id);
        for (const source of sources) if (source.removedAt || source.whileIn) this.removed.add(source.id);
        const seen = new Set<string>();
        this.sources = sources.filter(source => kindFor(source.soundId) && !this.removed.has(source.id) && !(source as PlacedSound & { origin?: string }).origin && !source.id.startsWith("@world:")
            && typeof source.byId === "string" && !!source.byId && typeof source.by === "string" && planetCoordsValid(source.x, source.z) && Number.isFinite(Date.parse(source.at)))
            .map(source => ({ ...source })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id) || JSON.stringify(a).localeCompare(JSON.stringify(b)))
            .filter(source => { if (seen.has(source.id)) return false;seen.add(source.id);return true; });
        const wanted = new Set<string>(), counts = { fish: 0, frog: 0, whale: 0 }, limits = { fish: FISH_SOURCES, frog: FROG_SOURCES, whale: WHALE_SOURCES };
        this.rejected.clear();
        for (const source of this.sources) {
            const kind = kindFor(source.soundId)!;
            if (counts[kind] >= limits[kind]) { this.rejected.set(source.id, "budget");continue; }
            const existing = this.groups.get(source.id), same = existing && existing.source.soundId === source.soundId && existing.source.x === source.x && existing.source.z === source.z;
            const result = same ? { anchor: existing.anchor } : findWaterlifeAnchor(source, kind, this.options);
            if (!result.anchor) { this.rejected.set(source.id, result.reason ?? "no-water-route");continue; }
            const anchor = result.anchor;let group = existing;
            if (!group || group.kind !== kind) {
                if (group) { group.accent?.dispose();for (const model of group.models) model.removeFromParent(); }
                const accent = kind === "whale" ? new THREE.MeshStandardMaterial({ color: new THREE.Color(authorMark(source.byId).color).lerp(new THREE.Color(0xe5ddbd), .35), roughness: .95 }) : null;
                const models = kind === "frog" ? [this.frog(), this.frog()] : kind === "whale" ? [this.whale(accent!)] : [];
                for (const model of models) this.root.add(model);
                group = { source, kind, anchor, models, accent, pose: sampleWaterlife(kind, anchor, Date.parse(source.at), Date.parse(source.at))! };
                this.groups.set(source.id, group);
            }
            group.source = source;group.anchor = anchor;
            for (const model of group.models) model.traverse(object => { object.userData.soundWaterlife = { sourceId: source.id, byId: source.byId, by: source.by, kind, origin: "player" }; });
            wanted.add(source.id);counts[kind]++;
        }
        for (const [id, group] of this.groups) if (!wanted.has(id)) { group.accent?.dispose();for (const model of group.models) model.removeFromParent();this.groups.delete(id); }
        const ordered = new Map<string, Group>();for (const source of this.sources) { const group = this.groups.get(source.id);if (group) { ordered.set(source.id, group);for (const model of group.models) this.root.add(model); } }this.groups = ordered;
        this.frame(this.lastNow ?? Date.parse(this.sources[0]?.at ?? "1970-01-01T00:00:00Z"), this.reducedMotion);
    }
    /** Actor point for an explicit local look, never a sound-emitter move. */
    getFocus(sourceId: string): (Position & { height: number; kind: WaterlifeKind; label: string }) | null {
        const group = this.groups.get(sourceId);if (!group || (this.lastNow ?? 0) < Date.parse(group.source.at)) return null;
        return { x: group.pose.x, z: group.pose.z, yaw: group.pose.yaw, height: group.pose.height + (group.kind === "whale" ? .45 : .2), kind: group.kind,
            label: group.kind === "whale" ? "Watch the whale" : group.kind === "frog" ? "Meet the pond frogs" : "Watch the fish" };
    }
    /** Optional safe-shore viewing suggestion; the controller checks admission. */
    viewpoint(sourceId: string): Position | null {
        const group = this.groups.get(sourceId);if (!group || !this.getFocus(sourceId)) return null;
        const point = group.anchor.area === "pond" ? planetStep({ ...(this.options.pool ?? DEFAULT_POOL), yaw: Math.PI }, 1, 0, 4)
            : { x: group.anchor.x, z: this.options.shoreline(group.anchor.x) - 1.5, yaw: 0 };
        return { x: point.x, z: point.z, yaw: bearing(point, group.pose) };
    }
    private orient(object: THREE.Object3D, point: Position, height: number): void {
        const p = planetPoint(point.x, point.z, height), b = planetBasis(point.x, point.z);
        this.matrix.makeBasis(new THREE.Vector3(b.east.x, b.east.y, b.east.z), new THREE.Vector3(b.up.x, b.up.y, b.up.z), new THREE.Vector3(b.south.x, b.south.y, b.south.z));
        object.position.set(p.x, p.y, p.z);object.quaternion.setFromRotationMatrix(this.matrix).multiply(this.yaw.setFromAxisAngle(this.upAxis, point.yaw));
    }
    frame(serverNow: number, reducedMotion = false): void {
        if (this.disposed || !Number.isFinite(serverNow)) return;
        this.lastNow = serverNow;this.reducedMotion = reducedMotion;
        let fishCount = 0, bubbleCount = 0, rippleCount = 0, sprayCount = 0, padCount = 0;
        const fishSources: (string | null)[] = [], bubbleSources: string[] = [], rippleSources: string[] = [], spraySources: string[] = [], padSources: string[] = [];
        const fish = (anchor: WaterlifeAnchor, at: number, member: number, size: number, source: PlacedSound | null): void => {
            const sample = sampleWaterlife("fish", anchor, at, serverNow, member, reducedMotion);if (!sample) return;
            const height = source ? sample.height : anchor.height + (sample.height - anchor.height) * size;
            this.orient(this.pose, sample, height);this.pose.scale.setScalar(size);this.pose.updateMatrix();this.pointMatrix.copy(this.pose.matrix);
            this.fishBody.setMatrixAt(fishCount, this.pointMatrix);
            this.localPose.position.set(0, 0, 0);this.localPose.quaternion.setFromAxisAngle(this.upAxis, reducedMotion ? .1 : Math.sin(sample.phase * 7) * .28);this.localPose.scale.setScalar(1);this.localPose.updateMatrix();
            this.fishTail.setMatrixAt(fishCount, this.matrix.multiplyMatrices(this.pointMatrix, this.localPose.matrix));
            const tint = source ? new THREE.Color(authorMark(source.byId).color).lerp(new THREE.Color(0xffffff), .76) : new THREE.Color(0xc9d5bd);
            this.fishBody.setColorAt(fishCount, tint);this.fishTail.setColorAt(fishCount, tint);fishCount++;fishSources.push(source?.id ?? null);
        };
        const ripple = (sample: Position, height: number, radius: number, sourceId: string): void => {
            if (rippleCount >= MAX_RIPPLES || radius < .02) return;
            this.orient(this.pose, sample, height + .035);this.pose.scale.set(radius, radius * radius, radius);this.pose.updateMatrix();this.ripples.setMatrixAt(rippleCount++, this.pose.matrix);rippleSources.push(sourceId);
        };
        for (const scenery of this.scenery) for (let i = 0; i < scenery.count; i++) fish(scenery.anchor, 0, i, .58, null);
        for (const group of this.groups.values()) {
            const at = Date.parse(group.source.at), sample = sampleWaterlife(group.kind, group.anchor, at, serverNow, 0, reducedMotion);
            for (const model of group.models) model.visible = !!sample;
            if (!sample) continue;group.pose = sample;
            if (group.kind === "fish") {
                for (let member = 0; member < FISH_PER_SOURCE; member++) fish(group.anchor, at, member, 1.05, group.source);
                if (!reducedMotion && sample.bubbles > .05) for (let i = 0; i < 5; i++) {
                    const age = unit((serverNow - at) / 900 + i / 5), point = planetStep(sample, 1, Math.sin(i * 2.1) * .2, .26);
                    this.orient(this.pose, point, group.anchor.height + .10 + age * .55);this.pose.scale.setScalar((.035 + i % 3 * .01) * Math.sin(age * Math.PI));this.pose.updateMatrix();this.bubbles.setMatrixAt(bubbleCount++, this.pose.matrix);bubbleSources.push(group.source.id);
                }
            } else if (group.kind === "frog") {
                for (let member = 0; member < group.models.length; member++) {
                    const pose = sampleWaterlife("frog", group.anchor, at, serverNow, member, reducedMotion)!, model = group.models[member];
                    if (pose.action === "calling" || pose.action === "hopping") group.pose = pose;
                    this.orient(model, pose, pose.height);model.scale.setScalar(1);model.updateMatrix();
                    const throat = model.getObjectByName("frog-calling-throat")!;throat.scale.set(.12 + pose.throat * .085, .065 + pose.throat * .08, .07 + pose.throat * .10);
                    for (const side of [-1, 1]) { const leg = model.getObjectByName(side < 0 ? "frog-left-hindleg" : "frog-right-hindleg")!;leg.rotation.x = pose.hop * -.75;leg.rotation.z = side * pose.hop * .28; }
                    const pad = circle(group.anchor, group.anchor.phase + member * .5, Math.min(2.05, Math.max(.6, (group.anchor.radius ?? DEFAULT_POOL.radius) - .6)));
                    this.orient(this.pose, pad, group.anchor.height + .018);this.pose.scale.setScalar(1);this.pose.updateMatrix();this.pads.setMatrixAt(padCount++, this.pose.matrix);padSources.push(group.source.id);
                    if (!reducedMotion && pose.splash > .02) ripple(pose, group.anchor.height, .2 + pose.splash * .7, group.source.id);
                    if (!reducedMotion && pose.throat > .05) ripple(pose, group.anchor.height, .3 + pose.throat * .3, group.source.id);
                }
            } else {
                const model = group.models[0];this.orient(model, sample, sample.height);model.rotateX(sample.pitch);model.rotateZ(sample.roll);model.updateMatrix();
                const tail = model.getObjectByName("whale-tail-flukes")!;tail.rotation.x = reducedMotion ? -.08 : Math.sin(sample.phase * 3) * .18 + (sample.action === "leaping" ? -.2 : 0);
                for (const side of [-1, 1]) model.getObjectByName(side < 0 ? "whale-left-flipper" : "whale-right-flipper")!.rotation.z = side * (sample.action === "leaping" ? -.6 : .1);
                if (!reducedMotion && sample.spray > .02) for (let i = 0; i < 12; i++) {
                    const age = unit((serverNow - at) / 1050 + i / 12), side = i % 2 ? 1 : -1;
                    this.localPose.position.set(side * age ** 1.6 * .42, .45 + Math.sin(age * Math.PI * .82) * (1.15 + sample.spray * .65), .8 + age * .12);
                    this.localPose.quaternion.identity();this.localPose.scale.set(.035 + age * .025, .065 + age * .06, .035 + age * .025);this.localPose.updateMatrix();
                    this.spray.setMatrixAt(sprayCount++, this.matrix.multiplyMatrices(model.matrix, this.localPose.matrix));spraySources.push(group.source.id);
                }
                if (!reducedMotion && sample.splash > .01) for (let i = 0; i < 3; i++) ripple(sample, group.anchor.height, .6 + sample.splash * (1 + i * .22), group.source.id);
                else if (!reducedMotion && sample.action !== "leaping") ripple(sample, group.anchor.height, .8, group.source.id);
            }
        }
        for (const [mesh, count, ids] of [[this.fishBody, fishCount, fishSources], [this.fishTail, fishCount, fishSources], [this.bubbles, bubbleCount, bubbleSources], [this.ripples, rippleCount, rippleSources], [this.spray, sprayCount, spraySources], [this.pads, padCount, padSources]] as const) {
            mesh.count = count;mesh.instanceMatrix.needsUpdate = true;if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.userData.sources = [...ids];mesh.userData.origins = ids.map(id => id === null ? "scenery" : "player");
        }
    }
    dispose(): void {
        if (this.disposed) return;this.disposed = true;
        for (const group of this.groups.values()) group.accent?.dispose();this.groups.clear();this.sources = [];this.rejected.clear();this.removed.clear();
        for (const mesh of [this.fishBody, this.fishTail, this.bubbles, this.ripples, this.spray, this.pads]) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();for (const material of this.materials) material.dispose();
        this.root.clear();this.root.removeFromParent();
    }
}
