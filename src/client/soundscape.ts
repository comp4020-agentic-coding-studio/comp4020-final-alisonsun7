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
import { BUSKER_SOUND } from "./seaside.js";

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIGHT_Y = 1.15;
// labels show within this distance; the nearest within REACH can be removed
const LABEL_NEAR = 9;
// Hover above planks and the footbridge, without needing a terrain query.
const WAVE_Y = 0.55;

interface Mark {
  sound: PlacedSound;
  glow: THREE.Sprite;
  core: THREE.Sprite;
  beam: THREE.Mesh;
  anchor: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  wave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
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

// Shared by every mark; only each mark's tint and opacity need a material.
// A quiet ring locates the sound, and a spreading wave means it is playing.
const RING = new THREE.RingGeometry(0.94, 1, 48);
RING.rotateX(-Math.PI / 2);
function ring(colour: string): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  return new THREE.Mesh(RING, new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
}

const shortDate = (iso: string): string => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export interface SoundscapeOptions {
  // you've joined, so you may remove a sound
  canChange: () => boolean;
  onRemove: (sound: PlacedSound) => void;
  onReply: (sound: PlacedSound) => void;
  onConversation: (sound: PlacedSound) => void;
}

export class Soundscape {
  private marks = new Map<string, Mark>();
  private ctx: AudioContext | null = null;
  private place: GainNode | null = null;
  private preview: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Voice>();
  // The busker is local scene audio, never a placed sound or a shared quota.
  private busker: Voice | null = null;
  private listener: Listener | null = null;
  private choseAt = 0;
  private reachable: string | null = null;
  private previewRequest = 0;
  on = false;

  constructor(
    private world: WorldView,
    private host: HTMLElement,
    private opts: SoundscapeOptions,
  ) {
    this.host.dataset.buskerVoice = "0";
    // a hidden tab goes quiet, and comes back as it was
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this.stopPreview();
        void this.ctx.suspend();
        this.reportBusker();
      } else if (this.on) void this.ctx.resume();
    });
  }

  // ---- the list ------------------------------------------------------------

  setAll(sounds: PlacedSound[]): void {
    const keep = new Set(sounds.map((s) => s.id));
    for (const id of [...this.marks.keys()]) if (!keep.has(id)) this.remove(id);
    for (const s of sounds) this.add(s);
  }

  add(sound: PlacedSound): void {
    const kind = findSound(sound.soundId);
    if (!kind || sound.removedAt) return;
    const existing = this.marks.get(sound.id);
    if (existing) {
      existing.sound = sound;
      const relation = existing.label.querySelector<HTMLElement>(".sound-answer")!;
      relation.textContent = this.replyDescription(sound);
      relation.hidden = !sound.replyTo;
      return;
    }
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
    const anchor = ring(colour);
    const wave = ring(colour);
    for (const r of [anchor, wave]) {
      r.position.set(sound.x, WAVE_Y, sound.z);
      r.renderOrder = 1;
      this.world.root.add(r);
    }
    const label = document.createElement("div");
    label.className = "sound-label";
    label.dataset.id = sound.id;
    label.hidden = true;
    label.style.setProperty("--family", colour);
    const name = document.createElement("strong");
    name.textContent = kind.label;
    const by = document.createElement("span");
    by.className = "sound-by";
    by.textContent = `left by ${sound.by} · ${shortDate(sound.at)}`;
    const relation = document.createElement("span");
    relation.className = "sound-answer";
    relation.textContent = this.replyDescription(sound);
    relation.hidden = !sound.replyTo;
    const actions = document.createElement("div");
    actions.className = "sound-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "sound-remove";
    remove.textContent = "Remove";
    remove.hidden = true;
    remove.onclick = () => this.opts.onRemove(sound);
    if (!sound.whileIn) {
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "sound-reply";
      reply.textContent = "Reply with a sound";
      reply.hidden = true;
      reply.onclick = () => this.opts.onReply(this.marks.get(sound.id)!.sound);
      const conversation = document.createElement("button");
      conversation.type = "button";
      conversation.className = "sound-conversation";
      conversation.textContent = "Conversation";
      conversation.setAttribute("aria-label", "View conversation for " + kind.label);
      conversation.hidden = true;
      conversation.onclick = () => this.opts.onConversation(this.marks.get(sound.id)!.sound);
      actions.append(reply, conversation);
    }
    actions.append(remove);
    label.append(name, by, relation, actions);
    this.world.labels.append(label);
    this.marks.set(sound.id, { sound, glow: glowS, core, beam: column, anchor, wave, label, phase: Math.random() * Math.PI * 2 });
    this.choseAt = 0;
    this.host.dataset.marks = String(this.marks.size);
  }

  remove(id: string): void {
    const m = this.marks.get(id);
    if (!m) return;
    this.world.root.remove(m.glow, m.core, m.beam, m.anchor, m.wave);
    (m.beam.material as THREE.Material).dispose();
    m.glow.material.dispose();
    m.core.material.dispose();
    m.anchor.material.dispose();
    m.wave.material.dispose();
    m.label.remove();
    this.marks.delete(id);
    this.stopVoice(id);
    this.host.dataset.marks = String(this.marks.size);
  }

  has(id: string): boolean {
    return this.marks.has(id);
  }

  private replyDescription(sound: PlacedSound): string {
    return sound.replyTo ? "Answering " + sound.replyTo.by + "'s " + (findSound(sound.replyTo.soundId)?.label ?? "sound")
      + (sound.replyTo.removedAt ? " · source removed" : "") : "";
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
      this.stopBusker();
    }
    this.host.dataset.soundOn = on ? "1" : "0";
    this.reportBusker();
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
  // false means loading failed, or this request was superseded/cancelled.
  async listen(soundId: string): Promise<boolean> {
    this.stopPreview();
    const request = this.previewRequest;
    try {
      const ctx = this.ensureContext();
      await ctx.resume();
      if (request !== this.previewRequest || document.hidden) return false;
      const buf = await this.load(soundId);
      if (!buf || request !== this.previewRequest || document.hidden) return false;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.8, t + 0.3);
      gain.gain.setValueAtTime(0.8, t + 4.2);
      gain.gain.linearRampToValueAtTime(0, t + 5);
      src.connect(gain).connect(this.preview!);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
        if (this.previewing?.src === src) this.previewing = null;
      };
      // Start at the beginning: short calls such as the bicycle bell are
      // followed by intentional silence, which must not become the preview.
      src.start(t, 0, Math.min(5, buf.duration));
      this.previewing = { src, gain };
      return true;
    } catch {
      // Audio may be unavailable or permission may have been denied.
      return false;
    }
  }

  stopPreview(): void {
    // Also cancel a preview which is still waiting for resume/fetch/decode.
    this.previewRequest++;
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
    // A contribution near Mateo takes precedence over his scene recording.
    // It keeps its usual lifetime and all ordinary placement rules.
    const playerGuitar = near.some(({ m }) => m.sound.soundId === BUSKER_SOUND.soundId
      && Math.hypot(m.sound.x - BUSKER_SOUND.x, m.sound.z - BUSKER_SOUND.z) <= BUSKER_SOUND.hear);
    this.chooseBusker(playerGuitar);
  }

  private chooseBusker(playerGuitar: boolean): void {
    const l = this.listener!;
    if (playerGuitar || Math.hypot(l.x - BUSKER_SOUND.x, l.z - BUSKER_SOUND.z) > BUSKER_SOUND.hear) {
      this.stopBusker();
      return;
    }
    if (!this.busker) void this.startBusker();
    else this.muffleBusker(this.busker);
  }

  private async startBusker(): Promise<void> {
    if (this.busker || !this.ctx || !this.on) return;
    const ctx = this.ctx;
    const voice: Voice = {
      src: ctx.createBufferSource(),
      gain: new GainNode(ctx, { gain: 0 }),
      filter: new BiquadFilterNode(ctx, { type: "lowpass", frequency: 20000 }),
      panner: new PannerNode(ctx, {
        panningModel: "HRTF", distanceModel: "inverse", refDistance: 2.5,
        rolloffFactor: 1.1, maxDistance: BUSKER_SOUND.hear,
        positionX: BUSKER_SOUND.x, positionY: BUSKER_SOUND.y, positionZ: BUSKER_SOUND.z,
      }),
      muffled: null,
    };
    this.busker = voice;
    const buf = await this.load(BUSKER_SOUND.soundId);
    if (!buf || this.busker !== voice || !this.on) {
      if (this.busker === voice) this.busker = null;
      return;
    }
    voice.src.buffer = buf;
    voice.src.loop = true;
    voice.src.connect(voice.filter).connect(voice.gain).connect(voice.panner).connect(this.place!);
    voice.src.onended = () => {
      voice.src.disconnect();
      voice.filter.disconnect();
      voice.gain.disconnect();
      voice.panner.disconnect();
    };
    voice.src.start(ctx.currentTime, Math.random() * buf.duration);
    this.muffleBusker(voice);
    this.reportBusker();
  }

  private muffleBusker(voice: Voice): void {
    if (!this.ctx || !this.listener) return;
    const muffled = this.world.isInside(BUSKER_SOUND.x, BUSKER_SOUND.z) !== this.listener.inside;
    if (muffled === voice.muffled) return;
    voice.muffled = muffled;
    voice.filter.frequency.setTargetAtTime(muffled ? 700 : 20000, this.ctx.currentTime, 0.2);
    voice.gain.gain.setTargetAtTime(muffled ? 0.4 : 1, this.ctx.currentTime, 0.3);
  }

  private stopBusker(): void {
    const voice = this.busker;
    if (!voice) return;
    this.busker = null;
    if (this.ctx && voice.src.buffer) {
      voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      voice.src.stop(this.ctx.currentTime + 0.3);
    }
    this.reportBusker();
  }

  private reportBusker(): void {
    const playing = this.on && !document.hidden && this.ctx?.state === "running" && !!this.busker?.src.buffer;
    const value = playing ? "1" : "0";
    if (this.host.dataset.buskerVoice !== value) this.host.dataset.buskerVoice = value;
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
    this.reportBusker();
  }

  private drawMarks(l: Listener, now: number): void {
    const { w, h } = this.world.size;
    const cam = this.world.eye;
    const v = new THREE.Vector3();
    const still = reduced();
    let nearest: Mark | null = null;
    let nearestD = REACH;
    for (const m of this.marks.values()) {
      const d = Math.hypot(m.sound.x - l.x, m.sound.z - l.z);
      const near = d <= REACH;
      const playing = this.on && this.ctx?.state === "running" && !!this.voices.get(m.sound.id)?.src.buffer;
      // Motion has one meaning: a sound this listener is actually hearing.
      // Keep distant marks quiet and reduced-motion marks completely still.
      const s = playing && !still ? 1 + Math.sin(now / 850 + m.phase) * 0.08 : 1;
      const glowSize = near ? 2.8 : 2.4;
      m.glow.scale.set(glowSize * s, glowSize * s, 1);
      m.glow.material.opacity = playing ? 0.8 : 0.55;
      const coreSize = near ? 0.76 : playing ? 0.66 : 0.6;
      m.core.scale.set(coreSize, coreSize, 1);
      (m.beam.material as THREE.MeshBasicMaterial).opacity = near ? 0.45 : playing ? 0.35 : 0.22;
      m.anchor.visible = d <= HEAR;
      m.anchor.scale.setScalar(near ? 0.8 : 0.65);
      m.anchor.material.opacity = near ? 0.7 : playing ? 0.48 : 0.25;
      m.wave.visible = playing && d <= LABEL_NEAR;
      if (m.wave.visible) {
        const phase = still ? 0.45 : (now / 2800 + m.phase / (Math.PI * 2)) % 1;
        m.wave.scale.setScalar(0.85 + phase * 1.1);
        m.wave.material.opacity = still ? 0.16 : Math.sin(phase * Math.PI) * 0.3;
      }
      m.label.classList.toggle("is-playing", playing);
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
    if (nearest && nearest.label.hidden && (this.opts.canChange() || !nearest.sound.whileIn)) {
      nearest.label.hidden = false;
      nearest.label.classList.add("pinned");
      nearest.label.classList.remove("far");
      nearest.label.style.transform = `translate(${w / 2}px, ${Math.round(h * 0.56)}px) translate(-50%, -100%)`;
    }
    const id = nearest?.sound.id ?? null;
    if (id !== this.reachable) {
      if (this.reachable) {
        const old = this.marks.get(this.reachable);
        if (old) for (const button of old.label.querySelectorAll<HTMLButtonElement>(".sound-actions button")) button.hidden = true;
        old?.label.classList.remove("in-reach");
      }
      this.reachable = id;
    }
    if (nearest && id) {
      for (const button of nearest.label.querySelectorAll<HTMLButtonElement>(".sound-actions button"))
        button.hidden = !this.opts.canChange() && !button.classList.contains("sound-conversation");
      nearest.label.classList.add("in-reach");
    }
  }
}
