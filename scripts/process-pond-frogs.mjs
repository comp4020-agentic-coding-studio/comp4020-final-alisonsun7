#!/usr/bin/env node
// A gentle derivative of a verified CC0 pond-frog field recording. No pitch,
// speed, vocal synthesis or invented two-call rhythm is added.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { measureWaterlifePcm, renderWaterlifeSound, WATERLIFE_SOUNDS } from "./render-waterlife-sounds.mjs";

export const FROG_RECORDING = {
  id: "pond-frogs", label: "Pond frogs", family: "biophony", zones: ["pond", "green", "creek"],
  length: 4.5, interval: 18, from: .4, seconds: 3.2, at: .8, peak: .30,
  sourceTitle: "Bad Waldliesborn - Brandscherenteich.oga", author: "Ath",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Bad_Waldliesborn_-_Brandscherenteich.oga",
  downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Bad_Waldliesborn_-_Brandscherenteich.oga",
  sourceSha1: "e482140e86da6d21fd145fff77bacffd6e1f84f1",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Cut a complete natural phrase, preserve its timing, soften only its edges,
 * and retain a genuinely silent gap for the older whole-file coast player. */
export function prepareFrogCycle(filteredMono, sampleRate = 44100) {
  if (!(filteredMono instanceof Float32Array) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000
      || filteredMono.length < Math.round((FROG_RECORDING.from + FROG_RECORDING.seconds) * sampleRate))
    throw new Error("A complete decoded frog recording and supported sample rate are required");
  const sourceFrom = Math.round(FROG_RECORDING.from * sampleRate), count = Math.round(FROG_RECORDING.seconds * sampleRate);
  const start = Math.round(FROG_RECORDING.at * sampleRate), samples = new Float32Array(Math.round(FROG_RECORDING.interval * sampleRate));
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const value = filteredMono[sourceFrom + i];
    if (!Number.isFinite(value)) throw new Error("Non-finite source recording");
    const fade = smooth(i / (sampleRate * .035)) * smooth((count - i - 1) / (sampleRate * .15));
    samples[start + i] = value * fade; peak = Math.max(peak, Math.abs(samples[start + i]));
  }
  if (peak < .00001) throw new Error("The source phrase is silent");
  for (let i = start; i < start + count; i++) samples[i] *= FROG_RECORDING.peak / peak;
  return samples;
}

export function frogCallEnvelope(samples, sampleRate = 44100) {
  const stepSeconds = .1, count = Math.round(FROG_RECORDING.length / stepSeconds) + 1, values = [];
  for (let n = 0; n < count; n++) {
    const from = Math.round(n * stepSeconds * sampleRate), to = Math.min(samples.length, Math.round((n + 1) * stepSeconds * sampleRate));
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] ** 2;
    values.push(Math.sqrt(sum / Math.max(1, to - from)));
  }
  const max = Math.max(...values, .000001);
  return { stepSeconds, interval: FROG_RECORDING.interval, values: values.map(value => Math.round(value / max * 10000) / 10000) };
}

function wav(samples, sampleRate) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) bytes.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  return bytes;
}

function main() {
  const sourcePath = process.argv[2] ?? ".cache/frog-voice/pond-chorus.oga", input = readFileSync(sourcePath);
  if (createHash("sha1").update(input).digest("hex") !== FROG_RECORDING.sourceSha1) throw new Error("Frog recording SHA-1 differs from Commons metadata");
  const sampleRate = 44100;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-i", sourcePath, "-ac", "1", "-af", "highpass=f=70,lowpass=f=6500", "-ar", String(sampleRate), "-f", "f32le", "-"], { maxBuffer: 16e6 });
  const decoded = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const samples = prepareFrogCycle(decoded, sampleRate), envelope = frogCallEnvelope(samples, sampleRate);
  const measuredPcm = measureWaterlifePcm(samples, sampleRate, FROG_RECORDING.length);
  mkdirSync(".cache/frog-voice", { recursive: true });
  const output = "public/assets/sounds/pond-frogs.mp3", rawPath = ".cache/frog-voice/pond-frogs.wav";
  writeFileSync(rawPath, wav(samples, sampleRate));
  execFileSync("lame", ["--silent", "--noreplaygain", "-V", "4", "-m", "m", rawPath, output]);
  const manifestPath = "public/assets-manifest.json", manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const previous = manifest.assets.find(asset => asset.id === "original-pond-frogs");
  const current = manifest.assets.find(asset => asset.id === "commons-pond-frogs");
  const record = {
    id: "commons-pond-frogs", path: output, usage: "sound", publicAllowed: true,
    source: `Wikimedia Commons, "${FROG_RECORDING.sourceTitle}" by Ath: ${FROG_RECORDING.sourceUrl}`,
    sourceUrl: FROG_RECORDING.downloadUrl, sourceSha1: FROG_RECORDING.sourceSha1,
    rights: "CC0 1.0 (public domain dedication)", licenseUrl: FROG_RECORDING.licenseUrl,
    sha256: hash(readFileSync(output)), pcmSha256: hash(new Uint8Array(samples.buffer)),
    playback: { length: FROG_RECORDING.length, interval: FROG_RECORDING.interval }, measuredPcm,
    processor: { script: "scripts/process-pond-frogs.mjs", sourceSha256: hash(readFileSync("scripts/process-pond-frogs.mjs")),
      version: 1, sampleRate, from: FROG_RECORDING.from, seconds: FROG_RECORDING.seconds, at: FROG_RECORDING.at,
      peakAmplitude: FROG_RECORDING.peak, highpassHz: 70, lowpassHz: 6500, fadeInSeconds: .035, fadeOutSeconds: .15,
      pitchOrSpeedChanged: false, sourceSha1: FROG_RECORDING.sourceSha1 },
    processing: "Verified Commons source SHA-1; 3.2 s natural pond-frog chorus from 0.4 s, mono 44.1 kHz, gentle 70 Hz high-pass/6500 Hz low-pass, 35/150 ms edge fades, linear peak scale to 0.30. Phrase begins at 0.8 s; silence to 18 s. No pitch, speed or natural intra-phrase timing change. LAME VBR quality 4, source metadata removed. Reproduce: node scripts/process-pond-frogs.mjs <verified-source.oga>",
    listeningStatus: "Author rejected the previous synthesized frog timbre. This replacement is a verified real pond-frog recording; machine checks do not establish a human listening verdict. Awaiting author audition.",
    superseded: current?.superseded ?? (previous ? { id: previous.id, sha256: previous.sha256, pcmSha256: previous.pcmSha256,
      date: "2026-11-08", reason: "Author reported that the synthesized frog sound was wrong; replaced with a licensed real recording." } : undefined),
    callEnvelope: envelope,
  };
  const position = manifest.assets.findIndex(asset => asset.id === "original-pond-frogs" || asset.id === record.id);
  manifest.assets = manifest.assets.filter(asset => asset.id !== "original-pond-frogs" && asset.id !== record.id);
  manifest.assets.splice(position < 0 ? manifest.assets.length : position, 0, record);
  // The old synthesis module no longer owns frogs. Its unchanged remaining
  // algorithms reproduce the original bubble/whale PCM without re-encoding.
  for (const definition of WATERLIFE_SOUNDS) {
    const asset = manifest.assets.find(entry => entry.id === `original-${definition.id}`);
    const expected = hash(new Uint8Array(renderWaterlifeSound(definition.id, sampleRate).buffer));
    if (!asset || asset.pcmSha256 !== expected) throw new Error(`${definition.id} original PCM changed`);
    asset.generator.sourceSha256 = hash(readFileSync("scripts/render-waterlife-sounds.mjs"));
  }
  const indexPath = "public/assets/sounds/sounds.json", index = JSON.parse(readFileSync(indexPath, "utf8"));
  const metadata = { id: FROG_RECORDING.id, label: FROG_RECORDING.label, family: FROG_RECORDING.family, kind: "now-and-then",
    zones: FROG_RECORDING.zones, seconds: FROG_RECORDING.length, pause: FROG_RECORDING.interval - FROG_RECORDING.length,
    interval: FROG_RECORDING.interval, provenance: "commons-cc0-field-recording" };
  const indexed = index.findIndex(item => item.id === metadata.id);
  if (indexed < 0) index.push(metadata); else index[indexed] = metadata;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  writeFileSync("src/shared/frog-call.ts", "// Generated by scripts/process-pond-frogs.mjs from the real recording's 100 ms RMS.\n// This is source energy, not a claim to isolate two individual animals' calls.\nexport const FROG_CALL_ENVELOPE = " + JSON.stringify(envelope, null, 2) + " as const;\n");
  writeFileSync(".cache/frog-voice/processed-verification.json", JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({ id: record.id, bytes: readFileSync(output).length, sha256: record.sha256, measuredPcm, envelope }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
