#!/usr/bin/env node
// Downloads the CC0 models, textures and skies the places are built from,
// from Poly Haven's public API (https://api.polyhaven.com), into
// public/assets/, and records each one in public/assets-manifest.json.
// Every file is checked against the MD5 the API lists.
//
//   node scripts/fetch-assets.mjs
//
// Re-running skips files that are already there and match.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "public/assets";
const API = "https://api.polyhaven.com";

// What each place needs. Models at 1k textures keep a place to a few MB.
const MODELS = [
  // the café
  "CoffeeCart_01",
  "CashRegister_01",
  "coffee_table_round_01",
  "WoodenChair_01",
  "bar_chair_round_01",
  "croissant",
  "carrot_cake",
  "tea_set_01",
  "hanging_industrial_lamp",
  "steel_frame_shelves_01",
  "shrub_04",
];
const TEXTURES = ["brown_planks_05", "brick_wall_001", "plastered_wall", "brick_pavement_02", "asphalt_02"];
const SKIES = ["qwantani_dawn_puresky", "qwantani_noon_puresky", "kloppenheim_01_puresky"];

const md5 = (buf) => createHash("md5").update(buf).digest("hex");

async function json(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function save(url, file, sum) {
  if (existsSync(file) && md5(readFileSync(file)) === sum) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (md5(buf) !== sum) throw new Error(`${url}: checksum mismatch`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return true;
}

const entries = [];
let bytes = 0;

async function record(id, kind, files) {
  const info = await json(`/info/${id}`);
  const authors = Object.keys(info.authors ?? {}).join(", ");
  entries.push({
    id: `polyhaven-${id}`,
    path: files[0],
    files,
    source: `Poly Haven, "${info.name}" by ${authors}: https://polyhaven.com/a/${id}`,
    usage: kind,
    publicAllowed: true,
    rights: "CC0 1.0 (public domain); Poly Haven asset licence: https://polyhaven.com/license",
    processing: "unchanged; 1k textures (skies 2k HDR)",
  });
}

for (const id of MODELS) {
  const f = (await json(`/files/${id}`)).gltf["1k"].gltf;
  const dir = join(OUT, "models", id);
  const files = [join(dir, `${id}.gltf`)];
  await save(f.url, files[0], f.md5);
  bytes += f.size;
  for (const [rel, inc] of Object.entries(f.include ?? {})) {
    const file = join(dir, rel);
    await save(inc.url, file, inc.md5);
    files.push(file);
    bytes += inc.size;
  }
  await record(id, "model", files);
  console.log(`model   ${id}`);
}

for (const id of TEXTURES) {
  const d = await json(`/files/${id}`);
  const files = [];
  for (const map of ["Diffuse", "nor_gl", "arm"]) {
    const f = d[map]["1k"].jpg;
    const file = join(OUT, "textures", id, `${map.toLowerCase()}.jpg`);
    await save(f.url, file, f.md5);
    files.push(file);
    bytes += f.size;
  }
  await record(id, "texture", files);
  console.log(`texture ${id}`);
}

for (const id of SKIES) {
  const f = (await json(`/files/${id}`)).hdri["2k"].hdr;
  const file = join(OUT, "skies", `${id}.hdr`);
  await save(f.url, file, f.md5);
  bytes += f.size;
  await record(id, "sky", [file]);
  console.log(`sky     ${id}`);
}

// Keep the photo entries; replace any earlier Poly Haven ones.
const manifestPath = "public/assets-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.assets = [...manifest.assets.filter((a) => !a.id.startsWith("polyhaven-")), ...entries];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${entries.length} assets, ${(bytes / 1e6).toFixed(1)} MB`);
