// Drawing one shot: the photo (or placeholder), the anchors you can place a
// sound on, links to the place's other views, the sound markers and the
// figure making each sound. The live scene and the memory replay both draw
// with this; only the live scene makes the anchors clickable.
import { SOUNDS, figureHeight, type Scene, type Shot } from "../shared/catalog.js";
import type { Placement } from "../shared/protocol.js";
import { figureAspect, figureSvg, passerSvg } from "./figures.js";

export interface StageOptions {
  interactive: boolean;
  mineId: string | null;
  // sound being placed: anchors that accept it are highlighted
  choosing: string | null;
  selected: string | null;
  onAnchor?: (anchorId: string) => void;
  onLink?: (to: string) => void;
  onMarker?: (placementId: string) => void;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;

export function drawPlaceholder(stage: HTMLElement, scene: Scene): void {
  if (stage.querySelector(".placeholder-room")) return;
  // A deliberately abstract room: a counter, a wall, some tables. Labelled
  // as a placeholder on the stage itself, not only in the text below it.
  const el = document.createElement("div");
  el.className = "placeholder-room";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${scene.title}: visual placeholder, not the real café`);
  el.innerHTML = `<svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
    <rect width="400" height="150" fill="#3b2f27"/><rect y="150" width="400" height="150" fill="#5a4a3c"/>
    <rect x="40" y="96" width="200" height="86" fill="#6b4d33"/><rect x="40" y="90" width="200" height="8" fill="#8a6a4c"/>
    <rect x="70" y="60" width="40" height="32" fill="#26211d"/><rect x="290" y="190" width="80" height="6" fill="#8a6a4c"/>
    <rect x="300" y="196" width="4" height="40" fill="#2b241f"/><rect x="356" y="196" width="4" height="40" fill="#2b241f"/>
    <rect x="270" y="40" width="110" height="80" fill="#4e5a63" opacity=".55"/>
  </svg><span class="placeholder-tag">Visual placeholder · not LAB ANU's real interior</span>`;
  stage.prepend(el);
}

export function drawShot(stage: HTMLElement, scene: Scene, shot: Shot, placements: Placement[], opts: StageOptions): void {
  stage.style.setProperty("--aspect", String(shot.aspect));
  const photo = stage.querySelector<HTMLImageElement>("img.photo");
  if (shot.image) {
    stage.querySelector(".placeholder-room")?.remove();
    if (!photo) {
      const img = document.createElement("img");
      img.className = "photo";
      img.src = shot.image;
      img.alt = shot.evidence;
      stage.prepend(img);
    } else if (photo.getAttribute("src") !== shot.image) {
      photo.src = shot.image;
      photo.alt = shot.evidence;
    }
  } else {
    photo?.remove();
    drawPlaceholder(stage, scene);
  }

  let layer = stage.querySelector<HTMLElement>(".layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "layer";
    stage.append(layer);
  }

  const here = placements.filter((p) => p.shotId === shot.id);
  const html: string[] = [];

  // figures first, sorted far to near so nearer people overlap farther ones
  const people = here
    .map((p) => {
      const anchor = shot.anchors.find((a) => a.id === p.anchorId);
      if (!anchor) return null;
      const index = here.filter((q) => q.anchorId === p.anchorId).indexOf(p);
      const fx = Math.min(0.97, Math.max(0.03, anchor.stand.x + [0, 0.07, -0.07, 0.13, -0.13, 0.04][index % 6]));
      const fy = anchor.stand.y + Math.floor(index / 6) * 0.02;
      const pose = anchor.stand.pose ?? SOUNDS[p.soundId].pose;
      const h = figureHeight(shot, anchor.stand.depth ?? fy) * (pose === "sit" ? 0.78 : 1);
      return { p, fx, fy, pose, h };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => a.fy - b.fy);

  for (const { p, fx, fy, pose, h } of people) {
    const w = (h / shot.aspect) * figureAspect(pose);
    const flip = fx > 0.5 ? " flip" : "";
    html.push(`<div class="figure pose-${pose}${flip}${p.ownerId === opts.mineId ? " is-mine" : ""}" data-placement="${p.id}"
      style="left:${pct(fx)};top:${pct(fy)};height:${pct(h)};width:${pct(w)};z-index:${1 + Math.round(Math.min(1, fy) * 98)}"
      title="${esc(p.ownerName)} ${esc(SOUNDS[p.soundId].activity)}">${figureSvg(p.ownerAvatar, pose, p.ownerId)}</div>`);
  }

  if (opts.interactive) {
    for (const a of shot.anchors) {
      const accepts = opts.choosing ? a.sounds.includes(opts.choosing as never) : false;
      const cls = opts.choosing ? (accepts ? " accepts" : " refuses") : "";
      html.push(`<button type="button" class="anchor${cls}" data-anchor="${a.id}" style="left:${pct(a.x)};top:${pct(a.y)}"
        aria-label="${esc(a.label)}${opts.choosing ? (accepts ? ": place the sound here" : ": this sound doesn't belong here") : ""}">
        <span class="anchor-dot" aria-hidden="true"></span><span class="anchor-label">${esc(a.label)}</span></button>`);
    }
  }

  for (const l of shot.links) {
    // Links near an edge hang inwards from it, so the label isn't cut off.
    const side = l.x < 0.25 ? " from-left" : l.x > 0.75 ? " from-right" : "";
    html.push(`<button type="button" class="shot-link${side}" data-to="${esc(l.to)}" style="left:${pct(l.x)};top:${pct(l.y)}">
      <span aria-hidden="true">${l.to.includes("/") ? "⇄" : "→"}</span> ${esc(l.label)}</button>`);
  }

  for (const p of here) {
    const def = SOUNDS[p.soundId];
    html.push(`<button type="button" class="marker${p.ownerId === opts.mineId ? " mine" : ""}${p.id === opts.selected ? " selected" : ""}" data-marker="${p.id}"
      style="left:${pct(p.x)};top:${pct(p.y)};--gain:${p.gain}"
      aria-label="${esc(def.label)}, added by ${esc(p.ownerName)}, volume ${Math.round(p.gain * 100)}%">
      <span class="ring" aria-hidden="true"></span><span class="marker-label">${esc(def.label)}</span></button>`);
  }

  reconcile(layer, html);
  const scrim = opts.choosing ? " choosing" : "";
  stage.className = `stage${scrim}`;

  if (opts.onAnchor) for (const b of layer.querySelectorAll<HTMLButtonElement>(".anchor")) b.onclick = () => opts.onAnchor!(b.dataset.anchor!);
  if (opts.onLink) for (const b of layer.querySelectorAll<HTMLButtonElement>(".shot-link")) b.onclick = () => opts.onLink!(b.dataset.to!);
  if (opts.onMarker) for (const b of layer.querySelectorAll<HTMLButtonElement>(".marker")) b.onclick = () => opts.onMarker!(b.dataset.marker!);
}

// Put these elements in the layer, keeping any that are already there
// unchanged. A figure that's rebuilt starts its fade-in again, so rebuilding
// everything on each change made every figure blink when one sound arrived,
// and kept replay's figures invisible (it redraws every frame).
type Kept = Element & { _src?: string };

function reconcile(layer: HTMLElement, html: string[]): void {
  const old = new Map<string, Kept>();
  for (const el of layer.children as HTMLCollectionOf<Kept>) if (el._src !== undefined) old.set(el._src, el);
  const nodes = html.map((src) => {
    const kept = old.get(src);
    if (kept) {
      old.delete(src);
      return kept;
    }
    const t = document.createElement("template");
    t.innerHTML = src;
    const el = t.content.firstElementChild as Kept;
    el._src = src;
    return el;
  });
  for (const el of [...layer.children] as Kept[]) if (el._src === undefined || old.get(el._src) === el) el.remove();
  let cursor = layer.firstElementChild;
  for (const node of nodes) {
    if (node === cursor) cursor = cursor.nextElementSibling;
    else layer.insertBefore(node, cursor);
  }
}

// Briefly animate a figure when its sound plays.
export function pulse(stage: HTMLElement, placementId: string): void {
  const marker = stage.querySelector<HTMLElement>(`.marker[data-marker="${placementId}"]`);
  const figure = stage.querySelector<HTMLElement>(`.figure[data-placement="${placementId}"]`);
  for (const el of [marker, figure]) {
    if (!el) continue;
    el.classList.remove("sounding");
    void el.offsetWidth;
    el.classList.add("sounding");
  }
}

// Rain and passers-by for the outdoor modes. Decorative: aria-hidden, and
// skipped entirely under prefers-reduced-motion.
export function drawWeather(stage: HTMLElement, mode: string, shot: Shot): void {
  stage.querySelector(".weather")?.remove();
  stage.querySelector(".passers")?.remove();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (mode === "rainy-dusk" && !reduced) {
    const rain = document.createElement("div");
    rain.className = "weather rain";
    rain.setAttribute("aria-hidden", "true");
    const drops: string[] = [];
    for (let i = 0; i < 90; i++) {
      drops.push(`<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(-Math.random() * 1.2).toFixed(2)}s;animation-duration:${(0.55 + Math.random() * 0.45).toFixed(2)}s;opacity:${(0.25 + Math.random() * 0.45).toFixed(2)}"></i>`);
    }
    rain.innerHTML = drops.join("");
    stage.append(rain);
  }

  const count = mode === "weekday" ? 6 : mode === "morning" ? 1 : mode === "rainy-dusk" ? 2 : 0;
  if (count === 0) return;
  const passers = document.createElement("div");
  passers.className = "passers";
  passers.setAttribute("aria-hidden", "true");
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    // passers-by cross the paving in front of the bridge, near to far
    const y = 0.86 + (i % 3) * 0.045;
    const h = figureHeight(shot, y);
    const w = (h / shot.aspect) * figureAspect(mode === "rainy-dusk" ? "umbrella" : "walk");
    const dir = i % 2 ? "rtl" : "ltr";
    items.push(`<div class="passer ${dir}${reduced ? " still" : ""}" style="top:${pct(y)};height:${pct(h)};width:${pct(w)};animation-delay:${(-i * 4.3).toFixed(1)}s;animation-duration:${(16 + i * 2.5).toFixed(1)}s">${passerSvg(`passer-${mode}-${i}`, mode === "rainy-dusk")}</div>`);
  }
  passers.innerHTML = items.join("");
  stage.append(passers);
}
