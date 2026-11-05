#!/usr/bin/env node
// Downloads the public-domain and CC0 recordings the place's sounds are made
// from, from Wikimedia Commons (https://commons.wikimedia.org), checks each
// against the SHA-1 Commons lists, and cuts it with ffmpeg into a mono MP3 in
// public/assets/sounds/: a seamless loop (the tail crossfaded into the head)
// or a short clip that plays now and then. Each is recorded in
// public/assets-manifest.json with its author, licence and what was done.
//
//   node scripts/fetch-sounds.mjs        (needs ffmpeg on PATH)
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
  { id: "evening-forest", label: "Evening forest", family: "biophony", kind: "loop", zones: ["forest"], file: "Waidachswald Oberschefflenz Abend 20250616 2005.ogg", from: 20, seconds: 40 },
  // the creek (only the trickle for now)
  { id: "trickle", label: "Trickling stream", family: "geophony", kind: "loop", zones: ["creek", "forest-edge"], file: "Hemlock stream.ogg", from: 0, seconds: 16 },
  // the boardwalk and the café
  { id: "cafe-chatter", label: "Café chatter", family: "anthrophony", kind: "loop", zones: ["boardwalk", "counter", "tables", "window"], file: "Restaurant ambience.ogg", from: 5, seconds: 40 },
  { id: "espresso", label: "Espresso machine", family: "anthrophony", kind: "loop", zones: ["counter", "tables"], file: "Espresso machine.ogg", from: 0, seconds: 26 },
  { id: "cafe-music", label: "Café music", family: "anthrophony", kind: "loop", zones: ["tables", "window", "counter"], file: "John Bartmann - Mellow Cafe Vibe.ogg", from: 0, seconds: 98 },
  { id: "guitar", label: "Someone playing guitar", family: "anthrophony", kind: "loop", zones: ["boardwalk", "beach", "pier"], file: "El Noi de la Mare (guitar).ogg", from: 0, seconds: 130 },
];

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
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Commons API: ${res.status}`);
  const pages = Object.values((await res.json()).query.pages);
  return new Map(pages.map((p) => [p.title.replace(/^File:/, ""), p]));
}

async function download(url, file, sum) {
  if (existsSync(file) && sha1(readFileSync(file)) === sum) return;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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
  const pick = `[0:a]aformat=channel_layouts=mono,atrim=${s.from}:${s.from + s.seconds + (s.kind === "loop" ? XFADE : 0)},asetpts=PTS-STARTPTS`;
  if (s.kind !== "loop") {
    return `${pick},afade=t=in:d=0.02,afade=t=out:st=${s.seconds - 0.4}:d=0.4`;
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

// loudnorm's first pass prints what it measured as JSON on stderr; the
// second applies one constant gain from it, so a loop's seam doesn't jump.
function measure(src, cut) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-i", src, "-filter_complex", `${cut},loudnorm=I=${LOUDNESS}:TP=-2:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${src}: ${r.stderr}`);
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
}

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const meta = new Map();
const files = [...new Set(SOUNDS.map((s) => s.file))];
for (let i = 0; i < files.length; i += 10) {
  for (const [k, v] of await info(files.slice(i, i + 10))) meta.set(k, v);
  await sleep(1500);
}

const entries = [];
for (const s of SOUNDS) {
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

  entries.push({
    id: `commons-${s.id}`,
    path: out,
    source: `Wikimedia Commons, "${s.file}" by ${strip(m.Artist?.value) || "unknown"}: ${ii.descriptionurl}`,
    usage: "sound",
    publicAllowed: true,
    rights: licence.toLowerCase() === "cc0" ? "CC0 1.0 (public domain dedication)" : "Public domain (as stated on its Commons page)",
    processing: s.kind === "loop"
      ? `mono, ${s.seconds} s from ${s.from} s, last ${XFADE} s crossfaded into the start for a seamless loop, loudness ${LOUDNESS} LUFS, MP3 96 kbps, metadata removed`
      : `mono, ${s.seconds} s clip from ${s.from} s with short fades, loudness ${LOUDNESS} LUFS, MP3 96 kbps, metadata removed`,
  });
  console.log(`${s.kind.padEnd(12)} ${s.id.padEnd(15)} ${licence}`);
}

const manifestPath = "public/assets-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.assets = [...manifest.assets.filter((a) => !a.id.startsWith("commons-")), ...entries];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(OUT, "sounds.json"), `${JSON.stringify(SOUNDS.map(({ file, from, ...s }) => s), null, 2)}\n`);
console.log(`${entries.length} sounds`);
