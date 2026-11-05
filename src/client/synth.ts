// Every sound in the app, made from oscillators and filtered noise. Nothing
// is recorded or downloaded, so there's no licence to clear.
//
// A voice is a loop: `play` schedules one occurrence of the sound starting at
// `when` into `out`, and returns how long until the next occurrence should
// start. Occurrences vary a little each time so a loop doesn't sound
// mechanical.
import type { SoundId } from "../shared/catalog.js";

export type Ambience = "room" | "birds" | "crowd" | "rain" | "cafe" | "forest" | "sea";

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

// A short burst of filtered noise: footsteps, clicks, splashes, paper.
function burst(
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  { type = "bandpass", freq = 1000, q = 1, attack = 0.002, decay = 0.08, level = 0.5 }: {
    type?: BiquadFilterType;
    freq?: number;
    q?: number;
    attack?: number;
    decay?: number;
    level?: number;
  },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level, when + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  src.connect(filter).connect(env).connect(out);
  src.start(when, rand(0, 1.5));
  src.stop(when + attack + decay + 0.05);
}

// A sine tone with a bell-like decay.
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  { decay = 1.2, level = 0.3, type = "sine" as OscillatorType, attack = 0.005 } = {},
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level, when + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  osc.connect(env).connect(out);
  osc.start(when);
  osc.stop(when + attack + decay + 0.05);
}

// A sustained band of noise, faded in and out: water, wind, hum, rain.
function wash(
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  dur: number,
  { type = "bandpass" as BiquadFilterType, freq = 800, q = 0.7, level = 0.2, fade = 0.4, wobble = 0 } = {},
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  if (wobble > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(0.15, 0.4);
    const depth = ctx.createGain();
    depth.gain.value = freq * wobble;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start(when);
    lfo.stop(when + dur + 0.1);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level, when + fade);
  env.gain.setValueAtTime(level, when + dur - fade);
  env.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(when, rand(0, 1.5));
  src.stop(when + dur + 0.05);
}

function hum(ctx: BaseAudioContext, out: AudioNode, when: number, dur: number, freq: number, level: number): void {
  for (const [mult, lvl] of [
    [1, 1],
    [2, 0.4],
    [3, 0.15],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(level * lvl, when + 0.3);
    env.gain.setValueAtTime(level * lvl, when + dur - 0.3);
    env.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}

function steps(ctx: BaseAudioContext, out: AudioNode, when: number, n: number, gap: number, freq: number, level: number): number {
  for (let i = 0; i < n; i++) {
    const t = when + i * gap * rand(0.9, 1.1);
    burst(ctx, out, t, { type: "lowpass", freq: freq * rand(0.85, 1.15), q: 0.8, decay: 0.06, level });
    burst(ctx, out, t + 0.012, { type: "bandpass", freq: freq * 3, q: 2, decay: 0.03, level: level * 0.4 });
  }
  return n * gap;
}

function murmur(ctx: BaseAudioContext, out: AudioNode, when: number, syllables: number, base: number, level: number): number {
  let t = when;
  for (let i = 0; i < syllables; i++) {
    const dur = rand(0.09, 0.22);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(base * rand(0.9, 1.15), t);
    osc.frequency.linearRampToValueAtTime(base * rand(0.85, 1.2), t + dur);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = rand(450, 1100);
    formant.Q.value = 4;
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 900;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.03);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(formant).connect(muffle).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + rand(0.03, i % 5 === 4 ? 0.45 : 0.1);
  }
  return t - when;
}

type Voice = (ctx: BaseAudioContext, out: AudioNode, when: number) => number;

export const VOICES: Record<SoundId, Voice> = {
  "lift-ding": (ctx, out, when) => {
    // a two-note chime, then the doors' soft rumble
    tone(ctx, out, when, 1318.5, { decay: 1.6, level: 0.22 });
    tone(ctx, out, when + 0.45, 1046.5, { decay: 1.9, level: 0.2 });
    wash(ctx, out, when + 1.2, 2.2, { type: "lowpass", freq: 220, level: 0.08, fade: 0.5 });
    return rand(9, 14);
  },
  footsteps: (ctx, out, when) => steps(ctx, out, when, Math.round(rand(6, 10)), 0.52, 320, 0.55) + rand(2, 5),
  "quiet-talk": (ctx, out, when) => murmur(ctx, out, when, Math.round(rand(10, 18)), rand(150, 210), 0.09) + rand(2, 4),
  typing: (ctx, out, when) => {
    let t = when;
    const n = Math.round(rand(14, 26));
    for (let i = 0; i < n; i++) {
      burst(ctx, out, t, { type: "highpass", freq: rand(2500, 4000), decay: 0.02, level: 0.25 });
      t += rand(0.07, i % 6 === 5 ? 0.4 : 0.16);
    }
    return t - when + rand(1, 3);
  },
  "page-turn": (ctx, out, when) => {
    wash(ctx, out, when, 0.45, { type: "highpass", freq: 2200, level: 0.18, fade: 0.15 });
    return rand(5, 9);
  },
  "cup-down": (ctx, out, when) => {
    burst(ctx, out, when, { type: "bandpass", freq: 2400, q: 6, decay: 0.12, level: 0.35 });
    tone(ctx, out, when, 2900, { decay: 0.25, level: 0.05 });
    return rand(6, 11);
  },
  "microwave-hum": (ctx, out, when) => {
    const dur = rand(8, 11);
    hum(ctx, out, when, dur, 100, 0.08);
    wash(ctx, out, when, dur, { type: "lowpass", freq: 500, level: 0.04 });
    return dur + rand(1.5, 3);
  },
  "microwave-beep": (ctx, out, when) => {
    for (let i = 0; i < 3; i++) tone(ctx, out, when + i * 0.6, 2000, { type: "square", decay: 0.35, level: 0.04, attack: 0.002 });
    burst(ctx, out, when + 2.4, { type: "lowpass", freq: 600, decay: 0.15, level: 0.4 });
    return rand(10, 16);
  },
  "running-water": (ctx, out, when) => {
    const dur = rand(4, 7);
    wash(ctx, out, when, dur, { type: "bandpass", freq: 1800, q: 0.6, level: 0.16, fade: 0.25, wobble: 0.25 });
    return dur + rand(3, 6);
  },
  "bin-drop": (ctx, out, when) => {
    wash(ctx, out, when, 0.5, { type: "highpass", freq: 3000, level: 0.12, fade: 0.1 });
    burst(ctx, out, when + 0.55, { type: "lowpass", freq: 260, decay: 0.2, level: 0.6 });
    burst(ctx, out, when + 0.57, { type: "bandpass", freq: 1200, q: 3, decay: 0.08, level: 0.2 });
    return rand(8, 14);
  },
  birdsong: (ctx, out, when) => {
    let t = when;
    const n = Math.round(rand(3, 7));
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const f = rand(2600, 4200);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * rand(0.6, 1.5), t + 0.12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.09, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
      t += rand(0.12, 0.3);
    }
    return t - when + rand(1.5, 4);
  },
  wind: (ctx, out, when) => {
    const dur = rand(6, 10);
    wash(ctx, out, when, dur, { type: "bandpass", freq: 500, q: 1.2, level: 0.14, fade: 2, wobble: 0.6 });
    return dur - 1.5;
  },
  bicycle: (ctx, out, when) => {
    tone(ctx, out, when, 2093, { decay: 0.6, level: 0.12, type: "triangle" });
    tone(ctx, out, when + 0.18, 2093, { decay: 0.9, level: 0.12, type: "triangle" });
    // the freewheel ticking as it rolls past
    let t = when + 0.4;
    for (let i = 0; i < 24; i++) {
      burst(ctx, out, t, { type: "highpass", freq: 5000, decay: 0.01, level: 0.12 });
      t += 0.06;
    }
    return rand(10, 16);
  },
  rain: (ctx, out, when) => {
    const dur = 8;
    wash(ctx, out, when, dur, { type: "highpass", freq: 1200, level: 0.13, fade: 1.5 });
    for (let i = 0; i < 30; i++) burst(ctx, out, when + rand(0, dur), { type: "bandpass", freq: rand(3000, 6000), q: 4, decay: 0.02, level: 0.08 });
    return dur - 1.5;
  },
  "puddle-steps": (ctx, out, when) => {
    let t = when;
    for (let i = 0; i < 6; i++) {
      burst(ctx, out, t, { type: "bandpass", freq: rand(900, 1500), q: 1.5, decay: 0.14, level: 0.4 });
      t += 0.38;
    }
    return t - when + rand(3, 6);
  },
  "door-slide": (ctx, out, when) => {
    wash(ctx, out, when, 1.4, { type: "bandpass", freq: 300, q: 1, level: 0.12, fade: 0.3 });
    burst(ctx, out, when + 1.4, { type: "lowpass", freq: 400, decay: 0.08, level: 0.25 });
    return rand(9, 14);
  },
  espresso: (ctx, out, when) => {
    hum(ctx, out, when, 4, 60, 0.07);
    wash(ctx, out, when + 3, 2.5, { type: "bandpass", freq: 2600, q: 0.8, level: 0.12, fade: 0.3, wobble: 0.3 });
    return rand(10, 15);
  },
  grinder: (ctx, out, when) => {
    hum(ctx, out, when, 3, 180, 0.05);
    wash(ctx, out, when, 3, { type: "bandpass", freq: 1500, q: 1.5, level: 0.14, fade: 0.2, wobble: 0.4 });
    return rand(12, 18);
  },
  cups: (ctx, out, when) => {
    for (let i = 0; i < 3; i++) {
      const t = when + rand(0, 1.2);
      burst(ctx, out, t, { type: "bandpass", freq: rand(2800, 4200), q: 8, decay: 0.15, level: 0.25 });
    }
    return rand(5, 9);
  },
  chatter: (ctx, out, when) => {
    const a = murmur(ctx, out, when, Math.round(rand(10, 16)), rand(140, 190), 0.07);
    murmur(ctx, out, when + rand(0.3, 1.2), Math.round(rand(8, 14)), rand(200, 260), 0.06);
    return a + rand(1, 3);
  },
  // a swell that builds, breaks into hiss, and draws back
  waves: (ctx, out, when) => {
    const dur = rand(5, 8);
    wash(ctx, out, when, dur, { type: "lowpass", freq: 420, level: 0.2, fade: dur * 0.45 });
    wash(ctx, out, when + dur * 0.4, dur * 0.5, { type: "highpass", freq: 1800, level: 0.09, fade: dur * 0.2 });
    return dur * rand(0.75, 0.95);
  },
  // two or three cries that rise and fall
  seagulls: (ctx, out, when) => {
    let t = when;
    const n = Math.round(rand(2, 4));
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = rand(1100, 1500);
      osc.frequency.setValueAtTime(f * 0.8, t);
      osc.frequency.linearRampToValueAtTime(f * 1.25, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.42);
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1500;
      band.Q.value = 2.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.07, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(band).connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 0.5);
      t += rand(0.45, 0.8);
    }
    return t - when + rand(3, 7);
  },
  leaves: (ctx, out, when) => {
    const dur = rand(2, 4);
    wash(ctx, out, when, dur, { type: "highpass", freq: 2600, level: 0.07, fade: 0.6, wobble: 0.5 });
    return dur + rand(1.5, 4);
  },
  // a quick drumroll on a trunk
  woodpecker: (ctx, out, when) => {
    const n = Math.round(rand(10, 18));
    for (let i = 0; i < n; i++) burst(ctx, out, when + i * 0.055, { type: "bandpass", freq: 900, q: 4, decay: 0.03, level: 0.35 * (1 - i / (n * 1.4)) });
    return n * 0.055 + rand(3, 7);
  },
  // water over stones: a bright wash with small bubbles in it
  creek: (ctx, out, when) => {
    const dur = rand(5, 8);
    wash(ctx, out, when, dur, { type: "bandpass", freq: 2400, q: 0.8, level: 0.11, fade: 0.8, wobble: 0.35 });
    for (let t = 0.3; t < dur - 0.5; t += rand(0.12, 0.4)) tone(ctx, out, when + t, rand(500, 1300), { decay: 0.05, level: 0.03 });
    return dur - 0.6;
  },
};

// The bed underneath everything, one per mode. Quiet, and separately mutable.
export function playAmbience(ctx: BaseAudioContext, out: AudioNode, kind: Ambience, when: number): number {
  const dur = 10;
  switch (kind) {
    case "room":
      wash(ctx, out, when, dur, { type: "lowpass", freq: 300, level: 0.05, fade: 2 });
      break;
    case "birds":
      wash(ctx, out, when, dur, { type: "bandpass", freq: 500, level: 0.035, fade: 2, wobble: 0.4 });
      if (Math.random() < 0.6) VOICES.birdsong(ctx, out, when + rand(1, 6));
      break;
    case "crowd":
      wash(ctx, out, when, dur, { type: "lowpass", freq: 600, level: 0.05, fade: 2 });
      murmur(ctx, out, when + rand(0, 3), 14, rand(150, 230), 0.025);
      break;
    case "rain":
      wash(ctx, out, when, dur, { type: "highpass", freq: 900, level: 0.08, fade: 2 });
      wash(ctx, out, when, dur, { type: "lowpass", freq: 250, level: 0.05, fade: 2 });
      break;
    case "cafe":
      wash(ctx, out, when, dur, { type: "lowpass", freq: 700, level: 0.05, fade: 2 });
      murmur(ctx, out, when + rand(0, 3), 12, rand(160, 230), 0.02);
      break;
    case "forest":
      wash(ctx, out, when, dur, { type: "bandpass", freq: 450, level: 0.04, fade: 2, wobble: 0.5 });
      if (Math.random() < 0.5) VOICES.birdsong(ctx, out, when + rand(1, 7));
      if (Math.random() < 0.4) VOICES.leaves(ctx, out, when + rand(0, 6));
      break;
    case "sea":
      VOICES.waves(ctx, out, when);
      VOICES.waves(ctx, out, when + rand(4, 6));
      if (Math.random() < 0.25) VOICES.seagulls(ctx, out, when + rand(1, 7));
      break;
  }
  return dur - 2;
}

// ---- footsteps, as people walk (ADR 009) ----------------------------------

export type Ground = "leaves" | "gravel" | "wood" | "sand" | "floor";

// One step on this ground, at this level. Each sounds a little different
// every time, so walking doesn't tick like a clock.
export function footstep(ctx: BaseAudioContext, out: AudioNode, when: number, ground: Ground, wet: boolean, level: number): void {
  const v = rand(0.8, 1.15);
  switch (ground) {
    case "leaves":
      burst(ctx, out, when, { type: "highpass", freq: rand(1500, 2300), decay: 0.11 * v, level: 0.5 * level });
      burst(ctx, out, when + 0.01, { type: "bandpass", freq: 500, q: 1, decay: 0.05, level: 0.35 * level });
      break;
    case "gravel":
      burst(ctx, out, when, { type: "bandpass", freq: rand(1100, 1600), q: 0.8, decay: 0.07 * v, level: 0.55 * level });
      burst(ctx, out, when + 0.025, { type: "highpass", freq: 2600, decay: 0.05, level: 0.3 * level });
      break;
    case "wood":
      burst(ctx, out, when, { type: "bandpass", freq: rand(300, 420), q: 3, decay: 0.08 * v, level: 0.8 * level });
      tone(ctx, out, when, rand(150, 190), { decay: 0.07, level: 0.12 * level, type: "triangle" });
      break;
    case "sand":
      burst(ctx, out, when, { type: "lowpass", freq: rand(700, 1000), decay: 0.14 * v, level: 0.45 * level, attack: 0.02 });
      break;
    case "floor":
      burst(ctx, out, when, { type: "bandpass", freq: rand(450, 600), q: 2, decay: 0.06 * v, level: 0.65 * level });
      burst(ctx, out, when, { type: "highpass", freq: 3200, decay: 0.012, level: 0.25 * level });
      break;
  }
  if (wet) burst(ctx, out, when + 0.02, { type: "highpass", freq: rand(2000, 3000), decay: 0.16, level: 0.3 * level });
}
