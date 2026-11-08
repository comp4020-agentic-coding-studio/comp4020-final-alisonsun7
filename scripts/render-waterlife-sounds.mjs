#!/usr/bin/env node
// Original bubble and whale illustrations, authored for Little Chorus.
// Pond frogs now uses a licensed field recording: process-pond-frogs.mjs.
// No downloaded samples, synthesis package or network access is used.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WATERLIFE_SOUNDS = [
  { id: "pond-bubbles", label: "Pond bubbles", family: "geophony", zones: ["pond", "tide", "creek"], length: 3, interval: 12, seed: 802012, peak: .32 },
  { id: "whale-song", label: "Whale song", family: "biophony", zones: ["tide", "pier", "beach"], length: 7.5, interval: 32, seed: 802032, peak: .26 },
];
const TAU = Math.PI * 2;
const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const envelope = (t, duration, attack, release) => smooth(t / attack) * smooth((duration - t) / release);

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296 * 2 - 1;
  };
}

/** Reproduce one mono cycle, with real silence between bounded phrases.
 * The planet plays only `length`; the full `interval` keeps legacy coast
 * playback sparse even though that older engine loops complete MP3 assets. */
export function renderWaterlifeSound(id, sampleRate = 44100) {
  const sound = WATERLIFE_SOUNDS.find(s => s.id === id);
  if (!sound || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw new Error("Unknown water-life sound or unsupported sample rate");
  const samples = new Float32Array(Math.round(sound.interval * sampleRate));
  const noise = random(sound.seed);
  const write = (from, duration, sample) => {
    const start = Math.round(from * sampleRate), count = Math.round(duration * sampleRate);
    for (let i = 0; i < count && start + i < samples.length; i++) samples[start + i] += sample(i / sampleRate, i);
  };

  if (id === "pond-bubbles") {
    // Three small groups. A damped rising resonance suggests released air;
    // this does not claim that fish make this particular vocal sound.
    const pops = [[.20, 510, .18, .9], [.34, 860, .10, .5], [.92, 380, .22, 1],
      [1.10, 680, .14, .65], [1.27, 1010, .11, .4], [1.92, 450, .22, .85],
      [2.15, 740, .15, .55], [2.45, 1120, .13, .35]];
    for (const [at, hz, duration, level] of pops) {
      let phase = 0, water = 0;
      write(at, duration, (t, i) => {
        phase += TAU * hz * (1 + .65 * (1 - Math.exp(-t * 26))) / sampleRate;
        water += .11 * (noise() - water);
        const body = Math.sin(phase) + .13 * Math.sin(phase * 2.03);
        return level * envelope(t, duration, .004, .045) * Math.exp(-t * 25) * (body + .07 * water);
      });
    }
  } else {
    // Slow, irregular vowel contours in a speaker-readable register, with
    // gentle generated reflections. No distress call, alarm or real species
    // identification is implied by this illustrative timbre.
    for (const [at, duration, first, last, level] of [[.18, 2.85, 180, 226, 1], [4.1, 2.5, 266, 178, .74]]) {
      const phrase = new Float32Array(Math.round(duration * sampleRate));
      let phase = 0, breath = 0;
      for (let i = 0; i < phrase.length; i++) {
        const t = i / sampleRate, p = t / duration;
        const frequency = first + (last - first) * smooth(p)
          + 12 * Math.sin(Math.PI * p) + 2.5 * Math.sin(TAU * .63 * t);
        phase += TAU * frequency / sampleRate;
        breath += .024 * (noise() - breath);
        const vowel = .8 * Math.sin(phase) + .19 * Math.sin(2 * phase + .2 * Math.sin(TAU * .23 * t))
          + .075 * Math.sin(3 * phase) + .025 * Math.sin(4 * phase);
        phrase[i] = level * envelope(t, duration, .3, .6) * (.93 + .07 * Math.sin(TAU * .7 * t)) * (vowel + .045 * breath);
      }
      for (const [delay, attenuation] of [[0, 1], [.23, .14], [.51, .055]]) {
        const start = Math.round((at + delay) * sampleRate);
        for (let i = 0; i < phrase.length && start + i < samples.length; i++) samples[start + i] += phrase[i] * attenuation;
      }
    }
  }

  // A gentle high-pass removes numerical DC without making a non-zero bed
  // from the intended silence. Fade the active window to exact zero well
  // before the long inter-phrase gap, then normalize linearly with headroom.
  const coefficient = Math.exp(-TAU * 35 / sampleRate);
  let previousInput = 0, previousOutput = 0, peak = 0;
  const active = Math.round(sound.length * sampleRate);
  for (let i = 0; i < active; i++) {
    const input = samples[i], value = input - previousInput + coefficient * previousOutput;
    previousInput = input; previousOutput = value;
    const edge = smooth(i / (sampleRate * .008)) * smooth((active - i - 1) / (sampleRate * .12));
    samples[i] = value * edge; peak = Math.max(peak, Math.abs(samples[i]));
  }
  for (let i = 0; i < active; i++) samples[i] *= sound.peak / Math.max(peak, .000001);
  samples.fill(0, active); samples[0] = 0; samples[samples.length - 1] = 0;
  return samples;
}

export function measureWaterlifePcm(samples, sampleRate, eventLength) {
  let peak = 0, sum = 0, eventSum = 0, mean = 0, largestStep = 0, active = 0;
  const clipSamples = Math.round(eventLength * sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (!Number.isFinite(value)) throw new Error("Non-finite generated PCM");
    peak = Math.max(peak, Math.abs(value)); sum += value * value; mean += value;
    if (i < clipSamples) eventSum += value * value;
    if (Math.abs(value) > .0001) active++;
    if (i) largestStep = Math.max(largestStep, Math.abs(value - samples[i - 1]));
  }
  return { sampleRate, samples: samples.length, fileSeconds: samples.length / sampleRate, eventSeconds: eventLength,
    peakDbFS: 20 * Math.log10(peak), rmsDbFS: 20 * Math.log10(Math.sqrt(sum / samples.length)),
    eventRmsDbFS: 20 * Math.log10(Math.sqrt(eventSum / clipSamples)), mean: mean / samples.length,
    largestStep, activeFraction: active / samples.length, start: samples[0], end: samples.at(-1) };
}

function writeWav(samples, sampleRate, path) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  writeFileSync(path, wav);
}

function main() {
  const sampleRate = 44100, manifestPath = "public/assets-manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const indexPath = "public/assets/sounds/sounds.json", index = JSON.parse(readFileSync(indexPath, "utf8"));
  mkdirSync(".cache/waterlife-sounds", { recursive: true });
  mkdirSync("public/assets/sounds", { recursive: true });
  for (const sound of WATERLIFE_SOUNDS) {
    const { id, label, family, zones, length, interval } = sound;
    const samples = renderWaterlifeSound(id, sampleRate), measuredPcm = measureWaterlifePcm(samples, sampleRate, length);
    const wav = `.cache/waterlife-sounds/${id}.wav`, output = `public/assets/sounds/${id}.mp3`;
    writeWav(samples, sampleRate, wav);
    execFileSync("lame", ["--silent", "--noreplaygain", "-V", "4", "-m", "m", wav, output]);
    const record = { id: `original-${id}`, path: output, usage: "sound", publicAllowed: true,
      source: "Original Little Chorus procedural sound illustration, authored in scripts/render-waterlife-sounds.mjs with coding-agent assistance; no wildlife recordings, samples or third-party composition",
      rights: "Original project-generated sound; not a third-party CC0 asset",
      sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
      pcmSha256: createHash("sha256").update(new Uint8Array(samples.buffer)).digest("hex"),
      generator: { script: "scripts/render-waterlife-sounds.mjs", version: 1, seed: sound.seed, sampleRate,
        sourceSha256: createHash("sha256").update(readFileSync("scripts/render-waterlife-sounds.mjs")).digest("hex"),
        peakAmplitude: sound.peak, noise: "deterministic integer PRNG", externalSamples: false },
      playback: { length, interval }, measuredPcm,
      processing: "Deterministic original synthesis; mono 44.1 kHz PCM, 35 Hz DC-removal high-pass, bounded smooth envelopes and exact-zero tail; LAME VBR quality 4 MP3 without source metadata. Full-cycle quiet padding is for legacy coastal playback; planet uses only the bounded event. Reproduce: node scripts/render-waterlife-sounds.mjs",
      listeningStatus: "Machine PCM, encoding and lifecycle checks only; human listening remains pending. Stylized synthesis, not a field recording."
    };
    const existing = manifest.assets.findIndex(asset => asset.id === record.id);
    if (existing < 0) manifest.assets.push(record); else manifest.assets[existing] = record;
    const metadata = { id, label, family, kind: "now-and-then", zones, seconds: length, pause: interval - length, interval,
      provenance: "original-stylized-synthesis" };
    const indexed = index.findIndex(item => item.id === id);
    if (indexed < 0) index.push(metadata); else index[indexed] = metadata;
    console.log(JSON.stringify({ id, bytes: readFileSync(output).length, ...measuredPcm, sha256: record.sha256 }));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
