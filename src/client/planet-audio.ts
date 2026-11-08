// Optional spatial playback. Local listening choices never edit the work.
import * as THREE from "three";
import type { PlacedSound, Position } from "../shared/protocol.js";
import { findSound, soundUrl } from "../shared/sounds.js";
import { PLANET_PLACES, planetDistance, planetPoint } from "../shared/planet.js";
import type { ChorusWork } from "../shared/chorus.js";
import type { SoundSignal } from "../shared/sound-response.js";
import { CHORUS_BAR_SECONDS, chorusBuffer, isChorusInstrument, nextChorusBar, seamlessRecording } from "./chorus-instrument.js";
import { PLANET_BUSKER } from "./planet-busker.js";

interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: PannerNode; sound: Audible; }
interface Audible { id: string; soundId: string; x: number; z: number; at: string; derived?: boolean; origin?: "example" | "npc"; }
// A short event is not a continuously looping texture. The 160 BPM recording
// of claps is deliberately not offered as a tempo-compatible jam part.
const EVENTS: Record<string, { length: number; interval: number }> = {
    "bicycle-bell": { length: 1.3, interval: 16 },
    "hand-claps": { length: 1.8, interval: 14 },
    "toilet-flush": { length: 12, interval: 70 },
    "espresso": { length: 8, interval: 30 },
};
// Catalogue-authored events retain their own quiet gaps. Textures and the
// original tempo-compatible scores keep their existing playback behaviour.
const soundEvent = (id: string): {length:number;interval:number}|undefined => findSound(id)?.playback ?? EVENTS[id];
export function planetHearingRadius(source: { x: number; z: number; origin?: "example" | "npc" }): number {
    if (source.origin === "npc") return PLANET_BUSKER.hear;
    if (source.origin === "example") return 6;
    const reading = PLANET_PLACES.find(p => p.id === "reading")!;
    const stage = PLANET_PLACES.find(p => p.id === "stage")!;
    if (planetDistance(source, reading) <= 5) return 6;
    if (planetDistance(source, stage) <= 5) return 18;
    return 14;
}

export class PlanetAudio {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private worldGain: GainNode | null = null;
    private limiter: DynamicsCompressorNode | null = null;
    private buffers = new Map<string, Promise<AudioBuffer>>();
    private voices = new Map<string, Voice>();
    private pending = new Set<string>();
    private wanted = new Set<string>();
    private generation = 0;
    private sources: PlacedSound[] = [];
    private examples: SoundSignal[] = [];
    private exampleRevision = 0;
    private works: ChorusWork[] = [];
    private seenRemoved = new Set<string>();
    private previewSource: AudioBufferSourceNode | null = null;
    private previewGain: GainNode | null = null;
    private previewRevision = 0;
    private previewing = false;
    private enabled = false;
    private disposed = false;
    private volume = 1;
    private focus: string | null = null;
    private serverNow = Date.now();
    private listener: Position = { x: 0, z: 0, yaw: 0 };
    constructor(private report: (count: number) => void, private options: { busker?: boolean } = {}) { document.addEventListener("visibilitychange", this.visibility); }
    get on(): boolean { return this.enabled; }
    // Enabled is the listener's preference; it is not proof that autoplay or
    // the operating system has allowed this context to run. The interface can
    // offer a fresh gesture instead of claiming that suspended audio is on.
    get playbackState(): "off" | AudioContextState { return this.enabled ? this.ctx?.state ?? "suspended" : "off"; }
    get volumeLevel(): number { return this.volume; }
    get buskerPlaying(): boolean { return this.voices.has(PLANET_BUSKER.id); }
    private context(): AudioContext {
        if (this.disposed) throw new Error("Audio disposed");
        if (!this.ctx) {
            const ctx = this.ctx = new AudioContext();
            this.master = ctx.createGain(); this.worldGain = ctx.createGain();
            this.master.gain.value = this.volume * .7;
            this.worldGain.gain.value = this.previewing ? .18 : 1;
            this.worldGain.connect(this.master);
            // Bounded voices and .7 headroom protect peaks before compression.
            // The feature guard also supports older WebAudio implementations.
            if (typeof ctx.createDynamicsCompressor === "function") {
                const limiter = this.limiter = ctx.createDynamicsCompressor();
                limiter.threshold.value = -9; limiter.knee.value = 4;
                limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .14;
                this.master.connect(limiter).connect(ctx.destination);
            } else this.master.connect(ctx.destination);
        }
        return this.ctx;
    }
    private buffer(id: string): Promise<AudioBuffer> {
        let promise = this.buffers.get(id);
        if (!promise) {
            if (isChorusInstrument(id)) promise = Promise.resolve().then(() => chorusBuffer(this.context(), id));
            else promise = fetch(soundUrl(id)).then(async response => {
                if (!response.ok) throw new Error("Recording unavailable");
                const context = this.context(), decoded = await context.decodeAudioData(await response.arrayBuffer());
                return soundEvent(id) ? decoded : seamlessRecording(context, decoded);
            });
            this.buffers.set(id, promise); promise.catch(() => this.buffers.delete(id));
        }
        return promise;
    }
    setOn(on: boolean): void {
        if (this.disposed) return;
        if (on !== this.enabled) this.generation++;
        this.enabled = on;
        if (on) void this.context().resume().catch(() => { });
        else { this.stopAll(); this.stopPreview(); }
    }
    setVolume(volume: number): void {
        if (!Number.isFinite(volume)) return;
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume * .7, this.ctx.currentTime, .03);
    }
    setFocus(id: string | null): void { this.focus = id; }
    setWorks(works: readonly ChorusWork[]): void {
        this.works = works.map(work => ({ ...work, liveSources: work.liveSources.map(source => ({ ...source })) }));
        const live = new Set(this.audibles().map(source => source.id));
        for (const [id] of this.voices) if (!live.has(id)) this.stop(id);
    }
    setAll(sounds: readonly PlacedSound[]): void {
        for (const source of sounds) if (source.removedAt) this.seenRemoved.add(source.id);
        this.sources = sounds.filter(source => !source.removedAt && !this.seenRemoved.has(source.id) && !!findSound(source.soundId)).map(source => ({ ...source }));
        if(this.focus && !this.sources.some(source=>source.id===this.focus))this.focus=null;
        const live = new Set(this.audibles().map(source => source.id));
        for (const [id] of this.voices) if (!live.has(id)) this.stop(id);
    }
    setExamples(sounds: readonly SoundSignal[]): void {
        // Examples have their own list and no fabricated contribution author.
        // Copy only their signal fields; they never enter this.sources/works.
        const ended = new Set(sounds.filter(sound => sound.removedAt || sound.whileIn).map(sound => sound.id));
        const next = [...new Map(sounds.filter(sound => sound.origin === "example" && !ended.has(sound.id)
            && !!findSound(sound.soundId) && [sound.x, sound.z, Date.parse(sound.at)].every(Number.isFinite))
            .map(({ id, soundId, x, z, at }): [string, SoundSignal] => [id, { id, soundId, x, z, at, origin: "example" }])).values()];
        const same = (a: Pick<Audible,"id"|"soundId"|"x"|"z"|"at">, b: Pick<Audible,"id"|"soundId"|"x"|"z"|"at">): boolean => a.id === b.id && a.soundId === b.soundId && a.x === b.x && a.z === b.z && a.at === b.at;
        const previous = this.examples ?? [];
        // Clearing then quickly showing examples cannot release an old decode.
        // Identical shared refreshes do not starve a legitimate pending load.
        if (previous.some(old => !next.some(sound => same(old, sound)))) this.exampleRevision = (this.exampleRevision ?? 0) + 1;
        for (const old of previous) if (!next.some(sound => same(old, sound))) this.wanted.delete(old.id);
        this.examples = next;
        const live = new Set(this.audibles().map(source => source.id));
        for (const [id, voice] of this.voices) if (!live.has(id)
            || voice.sound.origin === "example" && !next.some(sound => same(voice.sound, sound))) this.stop(id);
    }
    remove(id: string): void {
        if(this.focus===id)this.focus=null;
        this.seenRemoved.add(id); this.sources = this.sources.filter(source => source.id !== id); this.stop(id);
        // Silence the derived answer before the next work snapshot arrives.
        for (const work of this.works) if (work.liveSources.some(source => source.id === id)) this.stop("@chorus:" + work.id);
    }
    private audibles(): Audible[] {
        const publicLive = new Map(this.sources.filter(source => !source.whileIn).map(source => [source.id, source]));
        const support = this.works.filter(work => work.duet && work.variant === "ensemble" && work.liveSources.some(source => {
            const child = publicLive.get(source.id), parent = source.replyToId && publicLive.get(source.replyToId);
            return child && parent && child.byId !== parent.byId;
        })).map(work => ({ id: "@chorus:" + work.id, soundId: "chorus-harmony", x: work.x, z: work.z, at: work.at, derived: true }));
        const realIds = new Set(this.sources.map(source => source.id));
        // The requested local performer has no author, database row, work or
        // response. Nearby real guitar takes his place rather than doubling.
        const playerGuitar=this.sources.some(source=>!source.whileIn&&source.soundId==="guitar"
            &&planetDistance(source,this.listener)<planetHearingRadius(source));
        const busker:Audible[]=this.options.busker&&!playerGuitar?[{...PLANET_BUSKER,origin:"npc"}]:[];
        return [...this.sources, ...support, ...(this.examples ?? []).filter(source => !realIds.has(source.id)),...busker];
    }
    private visibility = (): void => {
        if (document.hidden) { this.generation++; this.stopAll(); this.stopPreview(); }
    };
    private gainFor(sound: Audible, distance: number): number {
        // Quiet does not mean inaudible beside the object. Squaring a linear
        // falloff had reduced Reading Nook's four-metre reply position to 11%
        // gain before its already quiet score and master headroom. Keep a
        // conversational near field, then ease smoothly to the same boundary.
        const radius = planetHearingRadius(sound), near = Math.min(1.5, radius / 4);
        const edge = Math.max(0, Math.min(1, (distance - near) / (radius - near)));
        const spatial = Math.cos(edge * Math.PI / 2) ** 2;
        const base = sound.derived ? .26 : isChorusInstrument(sound.soundId) ? .72 : soundEvent(sound.soundId) ? .28 : .42;
        const localFocus = this.focus && this.focus !== sound.id && !sound.derived ? .12 : 1;
        const headroom = 1 / Math.sqrt(Math.max(1, this.wanted.size / 3));
        return base * spatial * localFocus * headroom * (sound.origin === "example" ? .5 : sound.origin === "npc" ? .55 : 1);
    }
    frame(position: Position, camera: THREE.Camera, serverNow: number): void {
        this.listener = position; this.serverNow = serverNow;
        if (!this.enabled || document.hidden || this.disposed) { this.stopAll(); return; }
        const nearby = this.audibles().map(sound => ({ sound, distance: planetDistance(sound, position) }))
            .filter(item => item.distance < planetHearingRadius(item.sound))
            // Existing in-range player work takes the mix before examples,
            // even when an example happens to sit closer to this listener.
            .sort((a, b) => (a.sound.origin === "npc"?2:a.sound.origin === "example"?1:0) - (b.sound.origin === "npc"?2:b.sound.origin === "example"?1:0)
                || a.distance - b.distance || a.sound.id.localeCompare(b.sound.id));
        // A real duet's low answer occupies one seat inside the eight-voice cap.
        const support = nearby.find(item => item.sound.derived);
        const ordinary = nearby.filter(item => !item.sound.derived);
        const focused = ordinary.find(item => item.sound.id === this.focus);
        // An explicit listening choice must reach the mix before other voices
        // are ducked. It still has to pass the same spatial boundary above.
        const selected = (focused ? [focused, ...ordinary.filter(item => item !== focused)] : ordinary).slice(0, support ? 7 : 8);
        if (support) selected.push(support);
        this.wanted = new Set(selected.map(item => item.sound.id));
        for (const [id] of this.voices) if (!this.wanted.has(id)) this.stop(id);
        if (this.ctx) {
            const listener = this.ctx.listener, p = camera.position;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            const t = this.ctx.currentTime;
            listener.positionX.setValueAtTime(p.x, t); listener.positionY.setValueAtTime(p.y, t); listener.positionZ.setValueAtTime(p.z, t);
            listener.forwardX.setValueAtTime(forward.x, t); listener.forwardY.setValueAtTime(forward.y, t); listener.forwardZ.setValueAtTime(forward.z, t);
            listener.upX.setValueAtTime(up.x, t); listener.upY.setValueAtTime(up.y, t); listener.upZ.setValueAtTime(up.z, t);
        }
        for (const { sound, distance } of selected) {
            const voice = this.voices.get(sound.id);
            if (voice && this.ctx) voice.gain.gain.setTargetAtTime(this.gainFor(sound, distance), this.ctx.currentTime, .08);
            else if (!this.pending.has(sound.id)) void this.start(sound);
        }
        this.report(this.voices.size);
    }
    private async start(sound: Audible): Promise<void> {
        const generation = this.generation, exampleRevision = this.exampleRevision; this.pending.add(sound.id);
        try {
            const ctx = this.context(), buffer = await this.buffer(sound.soundId);
            if (this.disposed || generation !== this.generation || !this.wanted.has(sound.id) || this.voices.has(sound.id)
                || !this.enabled || document.hidden || (sound.origin === "example" ? exampleRevision !== this.exampleRevision : this.seenRemoved.has(sound.id))
                || !this.audibles().some(source => source.id === sound.id) || planetDistance(sound, this.listener) >= planetHearingRadius(sound)) return;
            const source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createPanner();
            source.buffer = buffer;
            pan.panningModel = "HRTF"; pan.distanceModel = "inverse"; pan.refDistance = 2; pan.maxDistance = 100; pan.rolloffFactor = 0;
            const p = planetPoint(sound.x, sound.z, sound.origin === "npc" ? PLANET_BUSKER.height : .55);
            pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
            gain.gain.value = this.gainFor(sound, planetDistance(sound, this.listener));
            source.connect(gain).connect(pan).connect(this.worldGain!);
            if (isChorusInstrument(sound.soundId)) {
                source.loop = true;
                // Correct rounded PCM length so repeated bars do not drift.
                if (source.playbackRate) source.playbackRate.value = buffer.duration / CHORUS_BAR_SECONDS;
                source.start(ctx.currentTime + nextChorusBar(this.serverNow), 0);
            } else if (soundEvent(sound.soundId)) {
                source.loop = false;
                const event = soundEvent(sound.soundId)!, length = Math.min(event.length, buffer.duration);
                const age = Math.max(0, (this.serverNow - Date.parse(sound.at)) / 1000), phase = age % event.interval;
                const delay = phase < length ? 0 : event.interval - phase, offset = phase < length ? phase : 0;
                source.start(ctx.currentTime + delay, offset, Math.max(.01, length - offset));
                source.onended = () => { if (this.voices.get(sound.id)?.source === source) this.stop(sound.id); };
            } else {
                source.loop = true;
                const offset = Math.max(0, (this.serverNow - Date.parse(sound.at)) / 1000) % buffer.duration;
                source.start(0, offset);
            }
            this.voices.set(sound.id, { source, gain, pan, sound }); this.report(this.voices.size);
        } catch { /* A failed load remains silent and can be retried. */ }
        finally { this.pending.delete(sound.id); }
    }
    async preview(id: string): Promise<boolean> {
        this.stopPreview(); const revision = this.previewRevision;
        if (!findSound(id) || this.disposed) return false;
        try {
            const ctx = this.context(); await ctx.resume(); const buffer = await this.buffer(id);
            if (this.disposed || revision !== this.previewRevision || document.hidden) return false;
            const source = ctx.createBufferSource(), gain = ctx.createGain();
            source.buffer = buffer; source.loop = false;
            gain.gain.value = isChorusInstrument(id) ? .72 : soundEvent(id) ? .28 : .42;
            source.connect(gain).connect(this.master!);
            this.previewing = true; this.worldGain!.gain.setTargetAtTime(.18, ctx.currentTime, .035);
            const duration=Math.min(5,buffer.duration);
            // New nature events can outlast the five-second private audition.
            // Soften its cutoff without changing anyone's world playback.
            const event=findSound(id)?.playback;
            if(event&&event.length>duration&&duration>.045){
                if(typeof gain.gain.linearRampToValueAtTime==="function"){
                    gain.gain.setValueAtTime(gain.gain.value,ctx.currentTime+duration-.045);
                    gain.gain.linearRampToValueAtTime(0,ctx.currentTime+duration);
                }else gain.gain.setTargetAtTime(0,ctx.currentTime+duration-.045,.012);
            }
            source.start(0, 0, duration);
            source.onended = () => {
                source.disconnect(); gain.disconnect();
                if (this.previewSource === source) { this.previewSource = null; this.previewGain = null; this.restoreWorld(); }
            };
            this.previewSource = source; this.previewGain = gain; return true;
        } catch { return false; }
    }
    private restoreWorld(): void {
        this.previewing = false;
        if (this.ctx && this.worldGain) this.worldGain.gain.setTargetAtTime(1, this.ctx.currentTime, .1);
    }
    stopPreview(): void {
        this.previewRevision++;
        const source = this.previewSource, gain = this.previewGain;
        this.previewSource = null; this.previewGain = null;
        try { source?.stop(); } catch { }
        source?.disconnect(); gain?.disconnect(); this.restoreWorld();
    }
    private stop(id: string): void {
        const voice = this.voices.get(id); if (!voice) return;
        this.voices.delete(id);
        try { voice.source.stop(); } catch { }
        voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect(); this.report(this.voices.size);
    }
    private stopAll(): void { this.wanted.clear(); for (const id of [...this.voices.keys()]) this.stop(id); this.report(0); }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.generation++; this.stopAll(); this.stopPreview();
        document.removeEventListener("visibilitychange", this.visibility);
        this.worldGain?.disconnect(); this.master?.disconnect(); this.limiter?.disconnect();
        void this.ctx?.close(); this.buffers.clear();
    }
}
