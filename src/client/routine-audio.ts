// A resident's actual short flush, never a contribution or background bed.
// Server phase/token and elapsed time decide what can play; Sound off, hidden
// pages and stale async completions cannot start or replay an earlier flush.
import type { NpcRoutineFrame } from "../shared/npc-routines.js";
import { NPC_ROUTINE_MS } from "../shared/npc-routines.js";

interface Point { x: number; z: number }
export interface RoutineListener extends Point { yaw: number }
interface Options {
  distanceBetween?: (a: Point, b: Point) => number;
  panBetween?: (source: Point, listener: RoutineListener) => number;
  report?: (playing: number) => void;
}
interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }
const HEAR = 18;
const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

export class RoutineAudio {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer | null> | null = null;
  private fetchController: AbortController | null = null;
  private voices = new Map<string, Voice>();
  private pending = new Map<string, object>();
  private seen = new Set<string>();
  private wanted = new Map<string, NpcRoutineFrame>();
  private listener: RoutineListener = { x: 0, z: 0, yaw: 0 };
  private sample = { server: 0, received: 0 };
  private on = false;
  private disposed = false;
  private visibilityChanged = (): void => {
    if (document.hidden) { this.stopAll(); void this.ctx?.suspend().catch(() => undefined); }
  };

  constructor(private options: Options = {}) {
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.report();
  }

  get playing(): number { return !this.disposed && this.on && !document.hidden && this.ctx?.state === "running" ? this.voices.size : 0; }

  frame(npcs: readonly NpcRoutineFrame[], listener: RoutineListener, soundOn: boolean, serverNowMs: number): void {
    if (this.disposed) return;
    this.on = soundOn;
    this.listener = { ...listener };
    this.sample = { server: serverNowMs, received: performance.now() };
    this.wanted.clear();
    if (soundOn && !document.hidden && [listener.x, listener.z, listener.yaw, serverNowMs].every(Number.isFinite)) {
      for (const npc of npcs) {
        const age = serverNowMs - Date.parse(npc.phaseStartedAt);
        if (npc.phase !== "flushing" || typeof npc.flushId !== "string" || !npc.flushId || npc.flushId.length > 160
          || ![npc.x, npc.z, age].every(Number.isFinite) || age < 0 || age >= NPC_ROUTINE_MS.flushing) continue;
        const distance = this.distance(npc);
        if (Number.isFinite(distance) && distance >= 0 && distance <= HEAR) this.wanted.set(npc.flushId, { ...npc });
      }
    }
    for (const token of this.pending.keys()) if (!this.wanted.has(token)) this.pending.delete(token);
    for (const token of this.voices.keys()) if (!this.wanted.has(token)) this.stopVoice(token);
    if (!soundOn || document.hidden) {
      this.stopAll();
      if (!soundOn && this.ctx?.state === "running") void this.ctx.suspend().catch(() => undefined);
      return;
    }
    for (const [token, npc] of this.wanted) {
      const voice = this.voices.get(token);
      if (voice) this.position(voice, npc);
      else if (!this.pending.has(token) && !this.seen.has(token)) void this.start(token);
    }
    this.report();
  }

  private distance(source: Point): number {
    return this.options.distanceBetween?.(source, this.listener) ?? Math.hypot(source.x - this.listener.x, source.z - this.listener.z);
  }

  private serverNow(): number { return this.sample.server + Math.max(0, performance.now() - this.sample.received); }

  private eligible(token: string): NpcRoutineFrame | null {
    const npc = this.wanted.get(token);
    const age = npc ? this.serverNow() - Date.parse(npc.phaseStartedAt) : NaN;
    return !this.disposed && this.on && !document.hidden && npc && Number.isFinite(age) && age >= 0 && age < NPC_ROUTINE_MS.flushing ? npc : null;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ctx.onstatechange = () => this.report();
    }
    return this.ctx;
  }

  private load(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.loading) return this.loading;
    const controller = new AbortController();
    this.fetchController = controller;
    const loading = fetch("/assets/sounds/toilet-flush.mp3", { signal: controller.signal })
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(bytes => controller.signal.aborted ? null : ctx.decodeAudioData(bytes))
      .then(buffer => { if (!this.disposed && !controller.signal.aborted) this.buffer = buffer; return buffer; })
      .catch(() => null).finally(() => {
        if (this.loading === loading) { this.loading = null; this.fetchController = null; }
      });
    this.loading = loading;
    return loading;
  }

  private async start(token: string): Promise<void> {
    if (!this.eligible(token)) return;
    const request = {};
    this.pending.set(token, request);
    this.seen.add(token);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    try {
      const ctx = this.context();
      await ctx.resume();
      if (this.pending.get(token) !== request || !this.eligible(token)) return;
      const buffer = await this.load(ctx);
      const npc = this.eligible(token);
      if (!buffer || !npc || this.pending.get(token) !== request || ctx.state !== "running") return;
      const offset = Math.max(0, this.serverNow() - Date.parse(npc.phaseStartedAt)) / 1000;
      const remaining = Math.min(buffer.duration - offset, NPC_ROUTINE_MS.flushing / 1000 - offset);
      if (remaining <= 0.01) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
      gain.gain.value = 0;
      const voice = { source, gain, pan };
      source.buffer = buffer;
      source.connect(gain).connect(pan).connect(ctx.destination);
      source.onended = () => { if (this.voices.get(token) === voice) { this.voices.delete(token); this.disconnect(voice); this.report(); } };
      this.voices.set(token, voice);
      this.position(voice, npc);
      source.start(ctx.currentTime, offset, remaining);
      this.report();
    } catch {
      // A blocked context or failed recording never falls back to a fake sound.
      this.stopVoice(token);
    } finally {
      if (this.pending.get(token) === request) this.pending.delete(token);
    }
  }

  private position(voice: Voice, npc: NpcRoutineFrame): void {
    const distance = this.distance(npc);
    const dx = npc.x - this.listener.x, dz = npc.z - this.listener.z;
    const side = dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw);
    const pan = this.options.panBetween?.(npc, this.listener) ?? side / Math.max(1, Math.hypot(dx, dz));
    voice.gain.gain.setTargetAtTime(0.55 * Math.max(0, 1 - distance / HEAR) ** 1.4, this.ctx!.currentTime, 0.04);
    voice.pan.pan.setTargetAtTime(clamp(Number.isFinite(pan) ? pan : 0), this.ctx!.currentTime, 0.04);
  }

  private disconnect(voice: Voice): void { voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect(); }
  private stopVoice(token: string): void {
    const voice = this.voices.get(token);
    if (!voice) return;
    this.voices.delete(token);
    try { voice.source.stop(); } catch { /* already ended */ }
    this.disconnect(voice);
    this.report();
  }
  private stopAll(): void {
    this.pending.clear();
    this.fetchController?.abort(); this.fetchController = null; this.loading = null;
    for (const token of [...this.voices.keys()]) this.stopVoice(token);
    this.report();
  }
  private report(): void { this.options.report?.(this.playing); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.stopAll();
    const ctx = this.ctx; this.ctx = null; this.buffer = null;
    if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => undefined); }
  }
}
