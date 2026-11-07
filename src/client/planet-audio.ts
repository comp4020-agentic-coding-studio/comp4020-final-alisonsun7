// Optional, explicitly enabled spatial playback of real shared contributions.
import * as THREE from "three";
import type { PlacedSound, Position } from "../shared/protocol.js";
import { findSound } from "../shared/sounds.js";
import { planetDistance, planetPoint } from "../shared/planet.js";
interface Voice {
    source: AudioBufferSourceNode;
    gain: GainNode;
    pan: PannerNode;
}
export class PlanetAudio {
    private ctx: AudioContext | null = null;
    private buffers = new Map<string, Promise<AudioBuffer>>();
    private voices = new Map<string, Voice>();
    private pending = new Set<string>();
    private wanted=new Set<string>();
    private generation=0;
    private sources: PlacedSound[] = [];
    private seenRemoved = new Set<string>();
    private previewSource: AudioBufferSourceNode | null = null;
    private previewGain: GainNode | null = null;
    private previewRevision = 0;
    private enabled = false;
    private disposed = false;
    private serverNow = Date.now();
    private listener: Position = { x: 0, z: 0, yaw: 0 };
    constructor(private report: (count: number) => void) { document.addEventListener("visibilitychange", this.visibility); }
    get on(): boolean { return this.enabled; }
    private context(): AudioContext {if(this.disposed)throw new Error("Audio disposed");return this.ctx ??= new AudioContext(); }
    private buffer(id: string): Promise<AudioBuffer> {
        let promise = this.buffers.get(id);
        if (!promise) {
            promise = fetch(`/assets/sounds/${encodeURIComponent(id)}.mp3`).then(async (r) => { if (!r.ok)
                throw new Error("Recording unavailable"); return this.context().decodeAudioData(await r.arrayBuffer()); });
            this.buffers.set(id, promise);
            promise.catch(() => this.buffers.delete(id));
        }
        return promise;
    }
    setOn(on: boolean): void {if(this.disposed)return;if(on!==this.enabled)this.generation++;this.enabled = on; if (on)
        void this.context().resume().catch(() => { });
    else
        this.stopAll(); }
    setAll(sounds: readonly PlacedSound[]): void {
        for (const s of sounds)
            if (s.removedAt)
                this.seenRemoved.add(s.id);
        this.sources = sounds.filter(s => !s.removedAt && !this.seenRemoved.has(s.id) && !!findSound(s.soundId)).map(s => ({ ...s }));
        for (const [id] of this.voices)
            if (!this.sources.some(s => s.id === id))
                this.stop(id);
    }
    remove(id: string): void { this.seenRemoved.add(id); this.sources = this.sources.filter(s => s.id !== id); this.stop(id); }
    private visibility = (): void => { if (document.hidden) {
        this.stopAll();
        this.stopPreview();
    } };
    frame(position: Position, camera: THREE.Camera, serverNow: number): void {
        this.listener = position;
        this.serverNow = serverNow;
        if (!this.enabled || document.hidden || this.disposed) {
            this.stopAll();
            return;
        }
        const selected = this.sources.map(s => ({ s, d: planetDistance(s, position) })).filter(s => s.d < 18).sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id)).slice(0, 8);
        this.wanted=new Set(selected.map(s=>s.s.id));
        for (const [id] of this.voices)
            if (!selected.some(s => s.s.id === id))
                this.stop(id);
        if (this.ctx) {
            const l = this.ctx.listener, p = camera.position, forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            const t = this.ctx.currentTime;
            l.positionX.setValueAtTime(p.x, t);
            l.positionY.setValueAtTime(p.y, t);
            l.positionZ.setValueAtTime(p.z, t);
            l.forwardX.setValueAtTime(forward.x, t);
            l.forwardY.setValueAtTime(forward.y, t);
            l.forwardZ.setValueAtTime(forward.z, t);
            l.upX.setValueAtTime(up.x, t);
            l.upY.setValueAtTime(up.y, t);
            l.upZ.setValueAtTime(up.z, t);
        }
        for (const { s, d } of selected) {
            const voice = this.voices.get(s.id);
            if (voice && this.ctx)
                voice.gain.gain.setTargetAtTime(.24 * (1 - d / 18) ** 2, this.ctx.currentTime, .08);
            else if (!this.pending.has(s.id))
                void this.start(s);
        }
        this.report(this.voices.size);
    }
    private async start(sound: PlacedSound): Promise<void> {
        const generation=this.generation;
        this.pending.add(sound.id);
        try {
            const ctx = this.context(), buffer = await this.buffer(sound.soundId);
            if (this.disposed || generation!==this.generation || !this.wanted.has(sound.id)||this.voices.has(sound.id)|| !this.enabled || document.hidden || this.seenRemoved.has(sound.id) || !this.sources.some(s => s.id === sound.id) || planetDistance(sound, this.listener) >= 18)
                return;
            const source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createPanner();
            source.buffer = buffer;
            source.loop = true;
            pan.panningModel = "HRTF";
            pan.distanceModel = "inverse";
            pan.refDistance = 2;
            pan.maxDistance = 100;
            pan.rolloffFactor = 0;
            const p = planetPoint(sound.x, sound.z, .55);
            pan.positionX.value = p.x;
            pan.positionY.value = p.y;
            pan.positionZ.value = p.z;
            gain.gain.value = .24 * (1 - planetDistance(sound, this.listener) / 18) ** 2;
            source.connect(gain).connect(pan).connect(ctx.destination);
            const offset = Math.max(0, (this.serverNow - Date.parse(sound.at)) / 1000) % buffer.duration;
            source.start(0, offset);
            this.voices.set(sound.id, { source, gain, pan });
            this.report(this.voices.size);
        }
        catch { /* An unavailable recording cannot create a visual-only voice. */ }
        finally {
            this.pending.delete(sound.id);
        }
    }
    async preview(id: string): Promise<boolean> {
        this.stopPreview();
        const revision = this.previewRevision;
        if (!findSound(id) || this.disposed)
            return false;
        try {
            const ctx = this.context();
            await ctx.resume();
            const b = await this.buffer(id);
            if (this.disposed || revision !== this.previewRevision || document.hidden)
                return false;
            const source = ctx.createBufferSource(), gain = ctx.createGain();
            source.buffer = b;
            source.loop = false;
            gain.gain.value = .22;
            source.connect(gain).connect(ctx.destination);
            source.start(0,0,Math.min(5,b.duration));
            source.onended=()=>{source.disconnect();gain.disconnect();if(this.previewSource===source){this.previewSource=null;this.previewGain=null;}};
            this.previewSource = source;
            this.previewGain = gain;
            return true;
        }
        catch {
            return false;
        }
    }
    stopPreview(): void { this.previewRevision++; try {
        this.previewSource?.stop();
    }
    catch { } this.previewSource?.disconnect(); this.previewGain?.disconnect(); this.previewSource = null; this.previewGain = null; }
    private stop(id: string): void { const v = this.voices.get(id); if (!v)
        return; try {
        v.source.stop();
    }
    catch { } v.source.disconnect(); v.gain.disconnect(); v.pan.disconnect(); this.voices.delete(id); this.report(this.voices.size); }
    private stopAll(): void {this.wanted.clear(); for (const id of [...this.voices.keys()])
        this.stop(id); this.report(0); }
    dispose(): void { if (this.disposed)
        return; this.disposed = true; this.stopAll(); this.stopPreview(); document.removeEventListener("visibilitychange", this.visibility); void this.ctx?.close(); this.buffers.clear(); }
}
