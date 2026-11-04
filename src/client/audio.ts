// The audio engine: one AudioContext, created only when the person presses
// Enable sound (browsers block audio before a gesture, and the pack says sound
// must never start on its own). Each placement is a looping voice with its
// own gain and stereo pan, all summed through a limiter so twelve sounds at
// full volume don't clip. Voices are scheduled a little ahead on the audio
// clock and stopped by disconnecting their gain node, so nothing leaks when a
// sound is removed or the page is hidden.
import { SOUNDS, type SoundId } from "../shared/catalog.js";
import { VOICES, playAmbience, type Ambience } from "./synth.js";

interface Source {
  soundId: SoundId;
  gain: number;
  pan: number;
  // how far "away" the sound is: placements in another view of the same
  // place are heard through the wall, quieter and duller
  away: boolean;
}

interface Live {
  src: Source;
  node: GainNode;
  panner: StereoPannerNode;
  muffle: BiquadFilterNode;
  next: number;
  onPlay?: () => void;
}

const LOOKAHEAD = 0.6;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private voices = new Map<string, Live>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ambienceNext = 0;
  private ambienceOn = true;
  private wanted = new Map<string, Source & { onPlay?: () => void }>();

  constructor(private ambience: Ambience) {}

  get enabled(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  // Must be called from a click or keypress.
  async enable(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        const master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(limiter).connect(ctx.destination);
        const bus = ctx.createGain();
        bus.gain.value = 0.8;
        bus.connect(master);
        this.ctx = ctx;
        this.master = master;
        this.ambienceBus = bus;
      }
      await this.ctx.resume();
      this.start();
      return this.enabled;
    } catch {
      return false;
    }
  }

  async disable(): Promise<void> {
    this.stop();
    for (const id of [...this.voices.keys()]) this.drop(id);
    await this.ctx?.suspend();
  }

  setAmbience(on: boolean): void {
    this.ambienceOn = on;
    if (this.ambienceBus && this.ctx) this.ambienceBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.2);
  }

  // The full set of sounds that should be playing now; anything not in it
  // stops. Called after every change the page applies.
  sync(sources: Map<string, Source & { onPlay?: () => void }>): void {
    this.wanted = sources;
    if (!this.enabled) return;
    for (const id of [...this.voices.keys()]) if (!sources.has(id)) this.drop(id);
    for (const [id, src] of sources) {
      const live = this.voices.get(id);
      if (live) {
        live.src = src;
        live.onPlay = src.onPlay;
        this.shape(live);
      } else this.add(id, src);
    }
  }

  private add(id: string, src: Source & { onPlay?: () => void }): void {
    const ctx = this.ctx!;
    const node = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    node.connect(muffle).connect(panner).connect(this.master!);
    // stagger starts so several new sounds don't all fire on one beat
    const live: Live = { src, node, panner, muffle, next: ctx.currentTime + 0.05 + Math.random() * 0.8, onPlay: src.onPlay };
    this.voices.set(id, live);
    this.shape(live);
  }

  private shape(live: Live): void {
    const ctx = this.ctx!;
    const level = live.src.gain * (live.src.away ? 0.25 : 1);
    live.node.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
    live.panner.pan.setTargetAtTime(live.src.away ? live.src.pan * 0.4 : live.src.pan, ctx.currentTime, 0.08);
    live.muffle.frequency.setTargetAtTime(live.src.away ? 900 : 18000, ctx.currentTime, 0.1);
  }

  private drop(id: string): void {
    const live = this.voices.get(id);
    if (!live || !this.ctx) return;
    live.node.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    const { node } = live;
    setTimeout(() => node.disconnect(), 400);
    this.voices.delete(id);
  }

  private tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const live of this.voices.values()) {
      while (live.next < horizon) {
        const at = live.next;
        live.next = at + Math.max(0.5, VOICES[live.src.soundId](ctx, live.node, at));
        if (live.onPlay) {
          const cb = live.onPlay;
          setTimeout(cb, Math.max(0, (at - ctx.currentTime) * 1000));
        }
      }
    }
    if (this.ambienceNext < horizon) {
      const at = Math.max(this.ambienceNext, ctx.currentTime);
      this.ambienceNext = at + playAmbience(ctx, this.ambienceBus!, this.ambience, at);
    }
  };

  private start(): void {
    if (this.timer) return;
    this.setAmbience(this.ambienceOn);
    this.sync(this.wanted);
    this.timer = setInterval(this.tick, 150);
    this.tick();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Pause while the tab is hidden; nothing piles up to play on return.
  async visibility(hidden: boolean): Promise<void> {
    if (!this.ctx) return;
    if (hidden) {
      this.stop();
      await this.ctx.suspend();
    } else if (this.voicesWanted()) {
      await this.ctx.resume();
      const now = this.ctx.currentTime;
      for (const live of this.voices.values()) live.next = Math.max(live.next, now + 0.1);
      this.ambienceNext = Math.max(this.ambienceNext, now);
      this.start();
    }
  }

  private voicesWanted(): boolean {
    return this.ctx !== null && this.ctx.state !== "closed";
  }
}

export function soundLabel(id: SoundId): string {
  return SOUNDS[id].label;
}
