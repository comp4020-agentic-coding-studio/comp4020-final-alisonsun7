// The audio engine: one AudioContext, created only when the person presses
// Enable sound (browsers block audio before a gesture, and the pack says sound
// must never start on its own). Each placement is a looping voice with its
// own gain and stereo pan, all summed through a limiter so twelve sounds at
// full volume don't clip. Voices are scheduled a little ahead on the audio
// clock and stopped by disconnecting their gain node, so nothing leaks when a
// sound is removed or the page is hidden.
//
// In the walkable world a sound also has a position: it's heard through a
// PannerNode from where it is, relative to where you stand and face, and
// muffled when a wall is between you (one of you is indoors, the other not).
import { SOUNDS, type SoundId } from "../shared/catalog.js";
import { VOICES, playAmbience, type Ambience } from "./synth.js";

interface Source {
  soundId: SoundId;
  gain: number;
  pan: number;
  // how far "away" the sound is: placements in another view of the same
  // place are heard through the wall, quieter and duller
  away: boolean;
  // in the world: where it is (metres) and whether that's indoors
  pos?: [number, number, number];
  inside?: boolean;
}

interface Live {
  src: Source;
  node: GainNode;
  panner: StereoPannerNode | PannerNode;
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
  private listenerInside: boolean | null = null;
  // what indoors sounds like when there's nothing placed: room tone, or a café
  indoorAmbience: Ambience = "room";
  private outdoorAmbience: Ambience;

  constructor(private ambience: Ambience) {
    this.outdoorAmbience = ambience;
  }

  // Where you are in the world, each frame. Indoors the background is the
  // room's; sounds on the other side of the glass are muffled.
  listen(x: number, y: number, z: number, yaw: number, inside: boolean, ambience?: Ambience): void {
    if (inside !== this.listenerInside) {
      this.listenerInside = inside;
      if (this.ctx) for (const live of this.voices.values()) this.shape(live);
    }
    // the place may say what its background is where you stand
    this.ambience = ambience ?? (inside ? this.indoorAmbience : this.outdoorAmbience);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // Sound is on only when the person turned it on; a preview alone doesn't
  // count, so it never starts the place playing.
  private on = false;

  get enabled(): boolean {
    return this.on && this.ctx !== null && this.ctx.state === "running";
  }

  // How many of the place's sounds are playing now.
  get playing(): number {
    return this.enabled ? this.voices.size : 0;
  }

  // One occurrence of a sound, for this person only, to hear before adding
  // it. Must be called from a click or keypress.
  async preview(soundId: SoundId): Promise<boolean> {
    if (!(await this.ready())) return false;
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    g.connect(this.master!);
    VOICES[soundId](ctx, g, ctx.currentTime + 0.05);
    setTimeout(() => g.disconnect(), 12000);
    return true;
  }

  // Must be called from a click or keypress.
  async enable(): Promise<boolean> {
    if (!(await this.ready())) return false;
    this.on = true;
    this.start();
    return this.enabled;
  }

  // The audio context, made and running (from a click or keypress).
  private async ready(): Promise<boolean> {
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
      return this.ctx.state === "running";
    } catch {
      return false;
    }
  }

  async disable(): Promise<void> {
    this.on = false;
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
    const panner = src.pos ? ctx.createPanner() : ctx.createStereoPanner();
    if (panner instanceof PannerNode) {
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      // heard clearly within a few metres, and still faintly across the beach
      panner.refDistance = 4;
      panner.rolloffFactor = 0.9;
      panner.maxDistance = 80;
    }
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
    const p = live.panner;
    // in the world, "away" means through a wall
    const away = live.src.pos && this.listenerInside !== null ? (live.src.inside ?? false) !== this.listenerInside : live.src.away;
    const level = live.src.gain * (away ? (live.src.pos ? 0.45 : 0.25) : 1);
    live.node.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
    if (p instanceof PannerNode && live.src.pos) {
      const [x, y, z] = live.src.pos;
      if (p.positionX) {
        p.positionX.value = x;
        p.positionY.value = y;
        p.positionZ.value = z;
      } else p.setPosition(x, y, z);
    } else if (p instanceof StereoPannerNode) {
      p.pan.setTargetAtTime(away ? live.src.pan * 0.4 : live.src.pan, ctx.currentTime, 0.08);
    }
    live.muffle.frequency.setTargetAtTime(away ? 900 : 18000, ctx.currentTime, 0.1);
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
    } else if (this.on && this.voicesWanted()) {
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
