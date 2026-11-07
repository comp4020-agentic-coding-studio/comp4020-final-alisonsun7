#!/usr/bin/env node
// Downloads the public-domain and CC0 recordings the place's sounds are made
// from, from Wikimedia Commons (https://commons.wikimedia.org), checks each
// against the SHA-1 Commons lists, and cuts it with ffmpeg into a mono MP3 in
// public/assets/sounds/: a seamless loop (the tail crossfaded into the head)
// or a short clip that plays now and then. Each is recorded in
// public/assets-manifest.json with its author, licence and what was done.
//
//   node scripts/fetch-sounds.mjs        (needs ffmpeg on PATH)
//   node scripts/fetch-sounds.mjs --only coastal-gulls,bicycle-bell
//
// Originals are kept in .cache/sounds/ (gitignored). Re-running skips
// downloads that are already there and match.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "public/assets/sounds";
const CACHE = ".cache/sounds";
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "SoundOfACity/0.1 (COMP4020 coursework; https://comp4020-final-alisonsun7.fly.dev)";

// kind: "loop" plays continuously; "now-and-then" plays a clip at intervals.
// family: geophony (water, wind), biophony (animals), anthrophony (people).
// from/seconds: the part of the original used. Cuts are a first guess, made
// without listening: adjust them by ear.
const SOUNDS = [
  // the forest
  { id: "evening-forest", label: "Bird sounds", family: "biophony", kind: "loop", zones: ["forest"], file: "Waidachswald Oberschefflenz Abend 20250616 2005.ogg", from: 20, seconds: 40 },
  // the creek (only the trickle for now)
  { id: "trickle", label: "Trickling stream", family: "geophony", kind: "loop", zones: ["creek", "forest-edge"], file: "Hemlock stream.ogg", from: 0, seconds: 16 },
  // the beach and the pier
  { id: "beach-waves", label: "Waves on the beach", family: "geophony", kind: "loop", zones: ["beach", "pier"], file: "Beach sounds South Carolina.ogg", from: 4, seconds: 54 },
  // the children playing on the beach
  { id: "children-playing", label: "Children playing", family: "anthrophony", kind: "loop", zones: ["beach"], file: "209901 foongaz city-playground-boxhagenerplatz-berlin.wav", from: 6, seconds: 80 },
  // the toilets and showers along the boardwalk (the flush starts at 2.1 s,
  // just after the loop's 2 s fade in)
  { id: "toilet-flush", label: "Toilet flushing", family: "anthrophony", kind: "loop", zones: ["boardwalk"], file: "Flushing the toilet.ogg", from: 0, seconds: 70 },
  { id: "shower", label: "Someone showering", family: "anthrophony", kind: "loop", zones: ["boardwalk"], file: "Shower Sound Ambience.ogg", from: 10, seconds: 60 },
  // the boardwalk and the café
  { id: "cafe-chatter", label: "Café chatter", family: "anthrophony", kind: "loop", zones: ["boardwalk", "counter", "tables", "window"], file: "Restaurant ambience.ogg", from: 5, seconds: 40 },
  { id: "espresso", label: "Espresso machine", family: "anthrophony", kind: "loop", zones: ["counter", "tables"], file: "Espresso machine.ogg", from: 0, seconds: 26 },
  { id: "cafe-music", label: "Café music", family: "anthrophony", kind: "loop", zones: ["tables", "window", "counter"], file: "John Bartmann - Mellow Cafe Vibe.ogg", from: 0, seconds: 98 },
  { id: "guitar", label: "Someone playing guitar", family: "anthrophony", kind: "loop", zones: ["boardwalk", "beach", "pier"], file: "El Noi de la Mare (guitar).ogg", from: 0, seconds: 130 },
  // More choices for people to leave; none is an automatic background bed.
  { id: "coastal-gulls", label: "Seagulls", family: "biophony", kind: "loop", zones: ["beach", "pier"], file: "Gull 1.ogg", from: 0, seconds: 16 },
  { id: "gentle-breeze", label: "Breeze and birds", family: "geophony", kind: "loop", zones: ["forest", "forest-edge", "creek"], file: "Gentle breeze and birds singing.ogg", from: 2, seconds: 28 },
  { id: "summer-cicadas", label: "Summer cicadas", family: "biophony", kind: "loop", zones: ["forest", "forest-edge"], file: "HyalessaFuscata KR.flac", from: 15, seconds: 36 },
  // Keep a quiet interval in the recording itself: the spatial player loops
  // assets, so a brief bell must not ring repeatedly without a pause.
  { id: "bicycle-bell", label: "Bicycle bell", family: "anthrophony", kind: "now-and-then", zones: ["boardwalk", "forest-edge"], file: "Rotating-bicycle-bell.wav", from: 0, seconds: 1.3, pause: 14.7 },
  { id: "cafe-dishes", label: "Cups and dishes", family: "anthrophony", kind: "loop", zones: ["counter", "tables", "window"], file: "Kitchen tidy up.ogg", from: 4, seconds: 32 },
  { id: "harbour-boat", label: "Boat by the pier", family: "anthrophony", kind: "loop", zones: ["pier", "beach"], file: "Boat by a wharf 1.ogg", from: 1, seconds: 26 },
  { id: "rainstick", label: "A softly turning rainstick", family: "anthrophony", kind: "loop", zones: ["forest", "creek", "window", "beach"], file: "Rainstick (1).ogg", from: 1, seconds: 20, highpassHz: 35, reportMeasurements: true },
  { id: "hand-claps", label: "Hand-clap rhythm", family: "anthrophony", kind: "loop", zones: ["boardwalk", "beach", "tables", "pier"], file: "Palmas sevillanas (flamenco clapping), 160 BPM.ogg", from: 12, seconds: 12, reportMeasurements: true },
];

// A targeted run must neither re-encode existing recordings nor remove their
// provenance. Validate arguments before touching files or contacting Commons.
const args = process.argv.slice(2);
let only;
if (args.length) {
  if (args[0] === "--help" && args.length === 1) {
    console.log("Usage: node scripts/fetch-sounds.mjs [--only id,id,...]");
    process.exit(0);
  }
  const value = args[0] === "--only" && args.length === 2 ? args[1]
    : args.length === 1 && args[0].startsWith("--only=") ? args[0].slice(7) : undefined;
  if (!value) throw new Error("Usage: node scripts/fetch-sounds.mjs [--only id,id,...]");
  only = new Set(value.split(",").map((id) => id.trim()).filter(Boolean));
  if (!only.size) throw new Error("--only needs at least one sound id");
  for (const id of only) {
    if (!SOUNDS.some((s) => s.id === id)) throw new Error(`Unknown sound id: ${id}`);
  }
}
const selected = only ? SOUNDS.filter((s) => only.has(s.id)) : SOUNDS;

const XFADE = 2; // seconds of tail crossfaded into the head of a loop
const LOUDNESS = -20; // integrated LUFS every sound is brought to

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const strip = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function info(titles) {
  const url = new URL(API);
  const params = {
    action: "query",
    format: "json",
    titles: titles.map((t) => `File:${t}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|sha1|extmetadata",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Commons API: ${res.status}`);
  const pages = Object.values((await res.json()).query.pages);
  return new Map(pages.map((p) => [p.title.replace(/^File:/, ""), p]));
}

async function download(url, file, sum) {
  if (existsSync(file) && sha1(readFileSync(file)) === sum) return;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha1(buf) !== sum) throw new Error(`${url}: checksum mismatch`);
  writeFileSync(file, buf);
}

function ffmpeg(args) {
  return execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// The cut, before loudness: a loop's tail crossfaded into its head, or a
// clip with short fades at both ends.
function cutFilter(s) {
  // This recording has a measured source DC offset. Keep its cleanup explicit
  // and source-specific; the existing recordings retain their exact filters.
  const cleanup = s.highpassHz ? `highpass=f=${s.highpassHz},` : "";
  const pick = `[0:a]aformat=channel_layouts=mono,${cleanup}atrim=${s.from}:${s.from + s.seconds + (s.kind === "loop" ? XFADE : 0)},asetpts=PTS-STARTPTS`;
  if (s.kind !== "loop") {
    return `${pick},afade=t=in:d=0.02,afade=t=out:st=${s.seconds - 0.4}:d=0.4${s.pause ? `,apad=pad_dur=${s.pause}` : ""}`;
  }
  const L = s.seconds;
  return [
    `${pick},asplit=3[h][m][t]`,
    `[h]atrim=0:${XFADE},asetpts=PTS-STARTPTS,afade=t=in:d=${XFADE}[hf]`,
    `[t]atrim=${L}:${L + XFADE},asetpts=PTS-STARTPTS,afade=t=out:d=${XFADE}[tf]`,
    `[hf][tf]amix=inputs=2:normalize=0[x]`,
    `[m]atrim=${XFADE}:${L},asetpts=PTS-STARTPTS[mid]`,
    `[x][mid]concat=n=2:v=0:a=1`,
  ].join(";");
}

// loudnorm's first pass prints measurements as JSON. The second requests
// linear gain; FFmpeg can fall back to peak-constrained dynamic normalization
// when the peak or loudness range prevents that target. New assets report
// their achieved loudness separately from the requested target.
function measure(src, cut) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-i", src, "-filter_complex", `${cut},loudnorm=I=${LOUDNESS}:TP=-2:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${src}: ${r.stderr}`);
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
}

// New recordings report the achieved result separately from the requested
// target: a peak ceiling can leave a percussive recording quieter than -20.
// This never changes the existing recordings' filters or manifest entries.
function encodedMeasurements(src) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-i", src,
    "-af", `astats=metadata=0:reset=0,loudnorm=I=${LOUDNESS}:TP=-2:print_format=json`,
    "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${src}: ${r.stderr}`);
  const stats = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
  const offsets = [...r.stderr.matchAll(/DC offset: ([^\n]+)/g)];
  const measured = { integratedLufs: Number(stats.input_i), truePeakDbTP: Number(stats.input_tp),
    dcOffset: Number(offsets.at(-1)?.[1]), targetLufs: LOUDNESS, truePeakCeilingDbTP: -2 };
  if (![measured.integratedLufs, measured.truePeakDbTP, measured.dcOffset].every(Number.isFinite)) {
    throw new Error(`${src}: non-finite encoded measurement`);
  }
  return measured;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const meta = new Map();
const files = [...new Set(selected.map((s) => s.file))];
for (let i = 0; i < files.length; i += 10) {
  for (const [k, v] of await info(files.slice(i, i + 10))) meta.set(k, v);
  await sleep(1500);
}

const entries = [];
for (const s of selected) {
  const page = meta.get(s.file);
  const ii = page?.imageinfo?.[0];
  if (!ii) throw new Error(`${s.file}: not on Commons`);
  const m = ii.extmetadata;
  const licence = m.LicenseShortName?.value ?? "";
  if (!/^(cc0|public domain)$/i.test(licence.trim())) throw new Error(`${s.file}: licence is "${licence}", not CC0 or public domain`);

  const src = join(CACHE, `${s.id}${s.file.slice(s.file.lastIndexOf("."))}`);
  await download(ii.url, src, ii.sha1);

  const out = join(OUT, `${s.id}.mp3`);
  const cut = cutFilter(s);
  const probe = measure(src, cut);
  const norm = `loudnorm=I=${LOUDNESS}:TP=-2:linear=true:measured_I=${probe.input_i}:measured_TP=${probe.input_tp}:measured_LRA=${probe.input_lra}:measured_thresh=${probe.input_thresh}:offset=${probe.target_offset}`;
  ffmpeg(["-i", src, "-filter_complex", `${cut},${norm},aresample=44100`, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", out]);

  const measuredAudio = s.reportMeasurements ? encodedMeasurements(out) : undefined;
  const normalization = s.reportMeasurements
    ? `-20 LUFS target, -2 dBTP ceiling; measured ${measuredAudio.integratedLufs} LUFS, ${measuredAudio.truePeakDbTP} dBTP, DC offset ${measuredAudio.dcOffset}`
    : `loudness ${LOUDNESS} LUFS`;
  entries.push({
    id: `commons-${s.id}`,
    path: out,
    source: `Wikimedia Commons, "${s.file}" by ${strip(m.Artist?.value) || "unknown"}: ${ii.descriptionurl}`,
    usage: "sound",
    publicAllowed: true,
    rights: licence.toLowerCase() === "cc0" ? "CC0 1.0 (public domain dedication)" : "Public domain (as stated on its Commons page)",
    sourceSha1: ii.sha1,
    sourceUrl: ii.url,
    ...(measuredAudio ? { measuredAudio } : {}),
    ...(m.LicenseUrl?.value ? { licenseUrl: m.LicenseUrl.value } : {}),
    processing: s.kind === "loop"
      ? `mono, ${s.highpassHz ? `source DC cleanup highpass=f=${s.highpassHz}, ` : ""}${s.seconds} s from ${s.from} s, last ${XFADE} s crossfaded into the start${s.reportMeasurements ? "" : " for a seamless loop"}, ${normalization}, MP3 96 kbps, metadata removed`
      : `mono, ${s.seconds} s clip from ${s.from} s with short fades${s.pause ? ` and ${s.pause} s quiet interval` : ""}, ${normalization}, MP3 96 kbps, metadata removed`,
  });
  console.log(`${s.kind.padEnd(12)} ${s.id.padEnd(15)} ${licence}`);
}

const manifestPath = "public/assets-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const replaced = new Set(entries.map((a) => a.id));
manifest.assets = [...manifest.assets.filter((a) => !replaced.has(a.id)), ...entries];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(OUT, "sounds.json"), `${JSON.stringify(SOUNDS.map(({ file, from, highpassHz, reportMeasurements, ...s }) => s), null, 2)}\n`);
console.log(`${entries.length} sounds`);
