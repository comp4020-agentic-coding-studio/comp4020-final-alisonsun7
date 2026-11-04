#!/usr/bin/env node
// Turns Wen's original reference photos (gitignored, under
// design/sound-of-a-city/references/) into the scene images the app publishes
// (public/scenes/). Every passer-by, and the TV showing real people, is
// mosaicked and blurred so nobody in the photos is recognisable; re-encoding
// through a canvas drops EXIF (time, phone, location).
//
//   node scripts/build-scenes.mjs          build public/scenes/*.webp
//   node scripts/build-scenes.mjs --grid   also write annotated grids to /tmp
//
// Uses the installed Google Chrome through Playwright for the canvas work.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const REF = "design/sound-of-a-city/references";
const OUT = "public/scenes";

// Redaction boxes are [x0, y0, x1, y1] in fractions of the photo, set by
// looking at each photo; `what` says what's hidden.
export const SHOTS = [
  {
    id: "marie-lift-wall",
    src: "marie-reay/IMG_8100.jpeg",
    redact: [
      { box: [0.07, 0.43, 0.145, 0.575], what: "passer-by, back left" },
      { box: [0.755, 0.445, 0.845, 0.52], what: "TV showing real people" },
    ],
  },
  { id: "marie-lift-detail", src: "marie-reay/IMG_8113.jpeg", redact: [] },
  {
    id: "marie-stair-front",
    src: "marie-reay/IMG_8104.jpeg",
    redact: [{ box: [0.455, 0.275, 0.535, 0.335], what: "person at the top of the stair" }],
  },
  {
    id: "marie-stairs",
    src: "marie-reay/IMG_8106.jpeg",
    redact: [{ box: [0.17, 0.28, 0.235, 0.36], what: "people at the top of the stair" }],
  },
  {
    id: "marie-entry",
    src: "marie-reay/IMG_8098.jpeg",
    redact: [
      { box: [0.4, 0.465, 0.47, 0.575], what: "students at the far table" },
      { box: [0.57, 0.475, 0.625, 0.535], what: "two people standing, far right" },
    ],
  },
  { id: "marie-tea-point", src: "marie-reay/IMG_8101.jpeg", redact: [] },
  {
    id: "chifley-bridge",
    src: "chifley/IMG_8114.jpeg",
    redact: [{ box: [0.42, 0.565, 0.5, 0.765], what: "two people walking in, and their reflections" }],
  },
];

const grid = process.argv.includes("--grid");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
mkdirSync(OUT, { recursive: true });
if (grid) mkdirSync("/tmp/soac-ref/grid", { recursive: true });

for (const shot of SHOTS) {
  const path = `${REF}/${shot.src}`;
  if (!existsSync(path)) {
    console.error(`missing ${path}: the original photos aren't in the repo; ask Wen for them`);
    process.exitCode = 1;
    continue;
  }
  const dataUrl = `data:image/jpeg;base64,${readFileSync(path).toString("base64")}`;
  const out = await page.evaluate(
    async ({ dataUrl, redact, grid }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      for (const { box } of redact) {
        const [x0, y0, x1, y1] = [box[0] * w, box[1] * h, box[2] * w, box[3] * h];
        const bw = x1 - x0;
        const bh = y1 - y0;
        // Mosaic first (destroys detail), then blur (softens the blocks so it
        // reads as out-of-focus rather than censored).
        const tiny = document.createElement("canvas");
        tiny.width = Math.max(2, Math.round(bw / 14));
        tiny.height = Math.max(2, Math.round(bh / 14));
        tiny.getContext("2d").drawImage(canvas, x0, y0, bw, bh, 0, 0, tiny.width, tiny.height);
        const patch = document.createElement("canvas");
        patch.width = Math.ceil(bw);
        patch.height = Math.ceil(bh);
        const pctx = patch.getContext("2d");
        pctx.imageSmoothingEnabled = true;
        pctx.filter = `blur(${Math.max(4, Math.round(Math.min(bw, bh) / 10))}px)`;
        pctx.drawImage(tiny, 0, 0, patch.width, patch.height);
        ctx.drawImage(patch, x0, y0);
      }

      const encode = (c, q) => c.toDataURL("image/webp", q);
      const thumb = document.createElement("canvas");
      const ts = 480 / Math.max(w, h);
      thumb.width = Math.round(w * ts);
      thumb.height = Math.round(h * ts);
      thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
      // Encode before the grid goes on: the grid is for reading coordinates
      // off, never for publishing.
      const full = encode(canvas, 0.8);

      let gridUrl = null;
      if (grid) {
        ctx.font = `${Math.round(w / 60)}px sans-serif`;
        for (let i = 1; i < 20; i++) {
          const f = i / 20;
          ctx.strokeStyle = i % 2 ? "rgba(255,0,255,.45)" : "rgba(0,255,255,.8)";
          ctx.lineWidth = i % 2 ? 1 : 2;
          ctx.beginPath();
          ctx.moveTo(f * w, 0);
          ctx.lineTo(f * w, h);
          ctx.moveTo(0, f * h);
          ctx.lineTo(w, f * h);
          ctx.stroke();
          if (i % 2 === 0) {
            ctx.fillStyle = "#0ff";
            ctx.fillText(f.toFixed(1), f * w + 3, 18);
            ctx.fillText(f.toFixed(1), 3, f * h - 3);
          }
        }
        gridUrl = canvas.toDataURL("image/jpeg", 0.85);
      }
      return { full, thumb: encode(thumb, 0.75), gridUrl, w, h };
    },
    { dataUrl, redact: shot.redact, grid },
  );

  const write = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  write(`${OUT}/${shot.id}.webp`, out.full);
  write(`${OUT}/${shot.id}-thumb.webp`, out.thumb);
  if (out.gridUrl) write(`/tmp/soac-ref/grid/${shot.id}.jpg`, out.gridUrl);
  console.log(`${shot.id}: ${out.w}x${out.h}, ${shot.redact.length} area(s) redacted`);
}

await browser.close();
