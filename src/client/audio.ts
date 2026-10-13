import type { Instrument, Note } from "../types.js";

// Simplified synthesised timbres, not real instrument models. No samples to
// load, so a switched instrument applies on the very next note.
const FREQ: Record<Note, number> = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// Must run inside a click: browsers keep audio suspended until a gesture.
export function unlockAudio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  void ctx.resume();
  return ctx;
}

export function audioTime(): number {
  return ctx?.currentTime ?? 0;
}

function voice(type: OscillatorType, freq: number, gain: number, when: number, dur: number, out: AudioNode): OscillatorNode {
  const osc = ctx!.createOscillator();
  const g = ctx!.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + dur);
  return osc;
}

export function playNote(note: Note, instrument: Instrument, when: number, voices: number): void {
  if (!ctx || !master) return;
  const f = FREQ[note];
  const env = ctx.createGain();
  env.connect(master);
  const level = 0.32 / Math.sqrt(Math.max(1, voices)); // chords shouldn't clip
  env.gain.setValueAtTime(0, when);

  if (instrument === "piano") {
    env.gain.linearRampToValueAtTime(level, when + 0.005);
    env.gain.exponentialRampToValueAtTime(level * 0.35, when + 0.15);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    voice("sine", f, 1, when, 1.2, env);
    voice("sine", f * 2, 0.35, when, 1.2, env);
    voice("sine", f * 3, 0.12, when, 0.6, env);
    voice("triangle", f * 4, 0.05, when, 0.25, env);
  } else if (instrument === "guitar") {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(3200, when);
    filter.frequency.exponentialRampToValueAtTime(500, when + 0.4);
    filter.connect(env);
    env.gain.linearRampToValueAtTime(level, when + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
    voice("sawtooth", f, 0.5, when, 1, filter);
    voice("triangle", f * 1.003, 0.5, when, 1, filter); // slight detune = string shimmer
  } else {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = f * 3;
    filter.Q.value = 0.8;
    filter.connect(env);
    env.gain.linearRampToValueAtTime(level * 1.1, when + 0.06);
    env.gain.setValueAtTime(level, when + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    const body = voice("sawtooth", f, 0.8, when, 0.65, filter);
    voice("square", f, 0.15, when, 0.65, filter);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5;
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(f * 0.012, when + 0.25); // vibrato blooms in
    lfo.connect(depth).connect(body.frequency);
    lfo.start(when);
    lfo.stop(when + 0.65);
  }
}
