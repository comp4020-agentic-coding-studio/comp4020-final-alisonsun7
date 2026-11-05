// The sounds people have left in the place (ADR 011): each one a coloured
// light where it was left, a label when you're near it, and, once sound is
// on, a recording playing from that spot.
//
// What you hear is worked out here in your own browser from the positions
// everyone already has: the nearest VOICES sounds within HEAR metres, placed
// around you as you walk, and muffled through the café's walls. The network
// never starts or stops a sound directly; it changes the list, and the list
// decides.
import * as THREE from "three";
import type { PlacedSound } from "../shared/protocol.js";
import { FAMILIES, HEAR, REACH, VOICES, findSound, soundUrl } from "../shared/sounds.js";
import type { Listener, WorldView } from "./world.js";

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIGHT_Y = 1.15;
// labels show within this distance; the nearest within REACH can be removed
const LABEL_NEAR = 9;

interface Mark {
  sound: PlacedSound;
  glow: THREE.Sprite;
  core: THREE.Sprite;
  beam: THREE.Mesh;
  label: HTMLDivElement;
  phase: number;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  muffled: boolean | null;
}

// One soft round light, drawn once and tinted per sound.
let glowTexture: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

// Lights keep their colour whatever the time of day (no tone mapping, no
// fog), so where it's lively can be seen from far off.
function lightSprite(colour: string, size: number, opacity: number, additive: boolean): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glow(),
    color: colour,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

// A thin column of light from the ground up through the sound.
const BEAM = new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8, 1, true);
BEAM.translate(0, 1.7, 0);
function beam(colour: string): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  return new THREE.Mesh(BEAM, mat);
}

const shortDate = (iso: string): string => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export interface SoundscapeOptions {
  // you've joined, so you may remove a sound
  canChange: () => boolean;
  onRemove: (sound: PlacedSound) => void;
}

export class Soundscape {
  private marks = new Map<string, Mark>();
  private ctx: AudioContext | null = null;
  private place: GainNode | null = null;
  private preview: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Voice>();
  private listener: Listener | null = null;
  private choseAt = 0;
  private reachable: string | null = null;
  on = false;

  constructor(
    private world: WorldView,
    private host: HTMLElement,
    private opts: SoundscapeOptions,
  ) {
    // a hidden tab goes quiet, and comes back as it was
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on) void this.ctx.resume();
    });
  }

  // ---- the list ------------------------------------------------------------

  setAll(sounds: PlacedSound[]): void {
    const keep = new Set(sounds.map((s) => s.id));
    for (const id of [...this.marks.keys()]) if (!keep.has(id)) this.remove(id);
    for (const s of sounds) if (!this.marks.has(s.id)) this.add(s);
  }

  add(sound: PlacedSound): void {
    const kind = findSound(sound.soundId);
    if (!kind || this.marks.has(sound.id)) return;
    const colour = FAMILIES[kind.family].colour;
    const glowS = lightSprite(colour, 2.4, 0.7, true);
    const core = lightSprite(colour, 0.6, 1, false);
    for (const s of [glowS, core]) {
      s.position.set(sound.x, LIGHT_Y, sound.z);
      s.renderOrder = 2;
      this.world.root.add(s);
    }
    const column = beam(colour);
    column.position.set(sound.x, 0, sound.z);
    column.renderOrder = 2;
    this.world.root.add(column);
    const label = document.createElement("div");
    label.className = "sound-label";
    label.hidden = true;
    label.style.setProperty("--family", colour);
    const name = document.createElement("strong");
    name.textContent = kind.label;
    const by = document.createElement("span");
    by.className = "sound-by";
    by.textContent = `left by ${sound.by} · ${shortDate(sound.at)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "sound-remove";
    remove.textContent = "Remove";
    remove.hidden = true;
    remove.onclick = () => this.opts.onRemove(sound);
    label.append(name, by, remove);
    this.world.labels.append(label);
    this.marks.set(sound.id, { sound, glow: glowS, core, beam: column, label, phase: Math.random() * Math.PI * 2 });
    this.choseAt = 0;
    this.host.dataset.marks = String(this.marks.size);
  }

  remove(id: string): void {
    const m = this.marks.get(id);
    if (!m) return;
    this.world.root.remove(m.glow, m.core, m.beam);
    (m.beam.material as THREE.Material).dispose();
    m.glow.material.dispose();
    m.core.material.dispose();
    m.label.remove();
    this.marks.delete(id);
    this.stopVoice(id);
    this.host.dataset.marks = String(this.marks.size);
  }

  has(id: string): boolean {
    return this.marks.has(id);
  }

  // ---- turning sound on and off ---------------------------------------------

  // Browsers only let sound start from a click or key press: call this from
  // one.
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    // a gentle limiter, so many sounds together never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.place = ctx.createGain();
    this.place.gain.value = 0;
    this.place.connect(limiter);
    this.preview = ctx.createGain();
    this.preview.connect(limiter);
    this.ctx = ctx;
    return ctx;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) {
      const ctx = this.ensureContext();
      void ctx.resume();
      this.place!.gain.setTargetAtTime(0.9, ctx.currentTime, 0.25);
      this.choseAt = 0;
    } else if (this.ctx) {
      this.place!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      for (const id of [...this.voices.keys()]) this.stopVoice(id);
    }
    this.host.dataset.soundOn = on ? "1" : "0";
  }

  private load(soundId: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(soundId);
    if (!p) {
      const ctx = this.ensureContext();
      p = fetch(soundUrl(soundId))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => {
          // a failed load is tried again next time it's wanted
          this.buffers.delete(soundId);
          return null;
        });
      this.buffers.set(soundId, p);
    }
    return p;
  }

  // A few seconds of a sound, only for you, without turning the place's sound
  // on.
  private previewing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  async listen(soundId: string): Promise<void> {
    const ctx = this.ensureContext();
    void ctx.resume();
    const buf = await this.load(soundId);
    if (!buf) return;
    this.stopPreview();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.3);
    gain.gain.setValueAtTime(0.8, t + 4.2);
    gain.gain.linearRampToValueAtTime(0, t + 5);
    src.connect(gain).connect(this.preview!);
    src.start(t, Math.min(2, buf.duration / 4), 5);
    this.previewing = { src, gain };
    src.onended = () => {
      if (this.previewing?.src === src) this.previewing = null;
    };
  }

  stopPreview(): void {
    if (!this.previewing || !this.ctx) return;
    const { src, gain } = this.previewing;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    src.stop(this.ctx.currentTime + 0.2);
    this.previewing = null;
  }

  // ---- voices ----------------------------------------------------------------

  private async startVoice(m: Mark): Promise<void> {
    const ctx = this.ctx!;
    const id = m.sound.id;
    // a placeholder, so it isn't started twice while loading
    if (this.voices.has(id)) return;
    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 2.5,
      rolloffFactor: 1.1,
      maxDistance: HEAR,
      positionX: m.sound.x,
      positionY: LIGHT_Y,
      positionZ: m.sound.z,
    });
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 20000 });
    const gain = new GainNode(ctx, { gain: 0 });
    const voice: Voice = { src: ctx.createBufferSource(), gain, filter, panner, muffled: null };
    this.voices.set(id, voice);
    const buf = await this.load(m.sound.soundId);
    if (!buf || this.voices.get(id) !== voice || !this.on) {
      if (this.voices.get(id) === voice) this.voices.delete(id);
      return;
    }
    voice.src.buffer = buf;
    voice.src.loop = true;
    voice.src.connect(filter).connect(gain).connect(panner).connect(this.place!);
    // two of the same sound don't start in step
    voice.src.start(ctx.currentTime, Math.random() * buf.duration);
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    this.muffle(m, voice);
    this.host.dataset.voices = String(this.playing());
  }

  private stopVoice(id: string): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    if (this.ctx && v.src.buffer) {
      v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      v.src.stop(this.ctx.currentTime + 1.2);
    }
    this.host.dataset.voices = String(this.playing());
  }

  private playing(): number {
    return [...this.voices.values()].filter((v) => v.src.buffer).length;
  }

  // Through the café's walls a sound is quieter and duller.
  private muffle(m: Mark, v: Voice): void {
    if (!this.ctx || !this.listener) return;
    const muffled = this.world.isInside(m.sound.x, m.sound.z) !== this.listener.inside;
    if (muffled === v.muffled) return;
    v.muffled = muffled;
    const t = this.ctx.currentTime;
    v.filter.frequency.setTargetAtTime(muffled ? 700 : 20000, t, 0.2);
    v.gain.gain.setTargetAtTime(muffled ? 0.4 : 1, t, 0.3);
  }

  // The nearest VOICES within HEAR, chosen a few times a second.
  private choose(): void {
    const l = this.listener!;
    const near = [...this.marks.values()]
      .map((m) => ({ m, d: Math.hypot(m.sound.x - l.x, m.sound.z - l.z) }))
      .filter((e) => e.d <= HEAR)
      .sort((a, b) => a.d - b.d)
      .slice(0, VOICES);
    const want = new Set(near.map((e) => e.m.sound.id));
    for (const id of [...this.voices.keys()]) if (!want.has(id)) this.stopVoice(id);
    for (const { m } of near) {
      const v = this.voices.get(m.sound.id);
      if (!v) void this.startVoice(m);
      else this.muffle(m, v);
    }
  }

  private moveListener(l: Listener): void {
    const ctx = this.ctx!;
    const a = ctx.listener;
    // facing yaw: forward is (-sin, 0, -cos), as the world walks
    const fx = -Math.sin(l.yaw);
    const fz = -Math.cos(l.yaw);
    if (a.positionX) {
      const t = ctx.currentTime;
      a.positionX.setTargetAtTime(l.x, t, 0.03);
      a.positionY.setTargetAtTime(l.y, t, 0.03);
      a.positionZ.setTargetAtTime(l.z, t, 0.03);
      a.forwardX.setTargetAtTime(fx, t, 0.03);
      a.forwardY.setTargetAtTime(0, t, 0.03);
      a.forwardZ.setTargetAtTime(fz, t, 0.03);
      a.upX.value = 0;
      a.upY.value = 1;
      a.upZ.value = 0;
    } else {
      // Firefox: the older calls
      a.setPosition(l.x, l.y, l.z);
      a.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ---- each frame --------------------------------------------------------------

  frame(l: Listener): void {
    this.listener = l;
    const now = performance.now();
    if (this.on && this.ctx) {
      this.moveListener(l);
      if (now - this.choseAt > 250) {
        this.choseAt = now;
        this.choose();
      }
    }
    this.drawMarks(l, now);
  }

  private drawMarks(l: Listener, now: number): void {
    const { w, h } = this.world.size;
    const cam = this.world.eye;
    const v = new THREE.Vector3();
    const still = reduced();
    let nearest: Mark | null = null;
    let nearestD = REACH;
    for (const m of this.marks.values()) {
      // a slow breath, so a light reads as something alive
      const s = still ? 1 : 1 + Math.sin(now / 700 + m.phase) * 0.12;
      m.glow.scale.set(2.4 * s, 2.4 * s, 1);
      const d = Math.hypot(m.sound.x - l.x, m.sound.z - l.z);
      if (d < nearestD) {
        nearestD = d;
        nearest = m;
      }
      if (d > LABEL_NEAR) {
        m.label.hidden = true;
        continue;
      }
      v.set(m.sound.x, LIGHT_Y + 0.55, m.sound.z).project(cam);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.label.hidden = !visible;
      m.label.classList.remove("pinned");
      // further off, only its name, so neighbouring labels don't pile up
      m.label.classList.toggle("far", d > REACH);
      if (visible) m.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
    // Standing on a sound (just after leaving it, say), its light is under
    // you: its label sits low in the view instead, so it can still be removed.
    if (nearest && nearest.label.hidden && this.opts.canChange()) {
      nearest.label.hidden = false;
      nearest.label.classList.add("pinned");
      nearest.label.classList.remove("far");
      nearest.label.style.transform = `translate(${w / 2}px, ${Math.round(h * 0.56)}px) translate(-50%, -100%)`;
    }
    const id = this.opts.canChange() ? (nearest?.sound.id ?? null) : null;
    if (id !== this.reachable) {
      if (this.reachable) {
        const old = this.marks.get(this.reachable);
        if (old) old.label.querySelector<HTMLButtonElement>(".sound-remove")!.hidden = true;
        old?.label.classList.remove("in-reach");
      }
      this.reachable = id;
      if (nearest && id) {
        nearest.label.querySelector<HTMLButtonElement>(".sound-remove")!.hidden = false;
        nearest.label.classList.add("in-reach");
      }
    }
  }
}
