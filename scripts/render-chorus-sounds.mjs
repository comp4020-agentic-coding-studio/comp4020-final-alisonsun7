#!/usr/bin/env node
// Reproduce the original score's legacy-coast fallback MP3s after pnpm build.
// Planet playback renders the same score directly, without fetching these.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = resolve(process.argv[2] ?? "dist/client/chorus-instrument.js");
const { renderChorusPart } = await import(pathToFileURL(modulePath).href);
const sampleRate = 44100, ids = ["chorus-chords", "chorus-pulse", "chorus-bells"];
const manifestPath = "public/assets-manifest.json", manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
mkdirSync(".cache/chorus-score", { recursive: true });
mkdirSync("public/assets/sounds", { recursive: true });
for (const id of ids) {
  const samples = renderChorusPart(id, sampleRate);
  const rawPath = `.cache/chorus-score/${id}.wav`, output = `public/assets/sounds/${id}.mp3`;
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  writeFileSync(rawPath, wav);
  // LAME is an existing local tool. No dependency installation is required.
  execFileSync("lame", ["--silent", "--noreplaygain", "-b", "128", rawPath, output]);
  let peak = 0, sum = 0;
  for (const value of samples) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
  const record = {
    id: `original-${id}`, path: output, usage: "sound", publicAllowed: true,
    source: "Original Little Chorus procedural score, authored in src/client/chorus-instrument.ts with coding-agent assistance; no samples or third-party composition",
    rights: "Original project-generated sound; not a third-party CC0 asset",
    sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
    score: { bpm: 72, beatsPerBar: 4, pitchSet: "C major pentatonic (C,D,E,G,A)", role: id === "chorus-pulse" ? "rhythm" : id === "chorus-chords" ? "harmony" : "sparse upper melody" },
    measuredPcm: { sampleRate, samples: samples.length, peakDbFS: 20 * Math.log10(peak), rmsDbFS: 20 * Math.log10(Math.sqrt(sum / samples.length)), start: samples[0], end: samples.at(-1) },
    processing: "Deterministic mono PCM from renderChorusPart; bounded envelopes, short zero-ended seam, 128 kbps MP3 fallback for the legacy coast. Planet uses PCM directly with exact-bar playback-rate correction. Reproduce after build: node scripts/render-chorus-sounds.mjs",
    listeningStatus: "Numerical and lifecycle checks only; musical comfort and blend still require human listening."
  };
  const index = manifest.assets.findIndex(asset => asset.id === record.id);
  if (index < 0) manifest.assets.push(record); else manifest.assets[index] = record;
  console.log(JSON.stringify({ id, peakDbFS: record.measuredPcm.peakDbFS, rmsDbFS: record.measuredPcm.rmsDbFS, sha256: record.sha256 }));
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
