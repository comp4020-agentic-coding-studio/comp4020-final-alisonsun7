// The people: cats and dogs drawn at adult proportions (about seven and a
// half heads tall), in everyday campus clothes. They are deliberately simple
// SVG silhouettes, marked in the UI as placeholder figures until real
// character art exists, and they never copy anyone from the photos.
//
// Every figure belongs to one placed sound and does what that sound is.
import type { Pose } from "../shared/catalog.js";
import type { Avatar } from "../shared/protocol.js";

// Muted colours that sit in a photo rather than on top of it.
const FUR = ["#8a7f72", "#b98a5e", "#d9c7a7", "#5c4a3d", "#3b3735", "#a9a19a"];
const TOPS = ["#2f3e55", "#5b6a43", "#8a4b34", "#3d3f44", "#4a6278", "#9a7a3c", "#6b3f4e"];
const BOTTOMS = ["#22262c", "#3c4654", "#4c4237", "#2d3a33"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Look {
  fur: string;
  muzzle: string;
  top: string;
  bottom: string;
}

// Same person, same look, in every view and on every device.
export function lookFor(seed: string): Look {
  const h = hash(seed);
  const fur = FUR[h % FUR.length];
  return { fur, muzzle: shade(fur, 0.25), top: TOPS[(h >>> 4) % TOPS.length], bottom: BOTTOMS[(h >>> 8) % BOTTOMS.length] };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

function ears(avatar: Avatar, l: Look, back: boolean): string {
  if (avatar === "cat") {
    return `<path d="M20.5 19 L22.5 4.5 L28.5 13.5 Z" fill="${l.fur}"/><path d="M39.5 19 L37.5 4.5 L31.5 13.5 Z" fill="${l.fur}"/>${
      back ? "" : `<path d="M22.6 15 L23.4 8.5 L26.4 13 Z" fill="${l.muzzle}" opacity=".7"/><path d="M37.4 15 L36.6 8.5 L33.6 13 Z" fill="${l.muzzle}" opacity=".7"/>`
    }`;
  }
  return `<ellipse cx="19.5" cy="23" rx="4" ry="10" transform="rotate(14 19.5 23)" fill="${shade(l.fur, -0.2)}"/><ellipse cx="40.5" cy="23" rx="4" ry="10" transform="rotate(-14 40.5 23)" fill="${shade(l.fur, -0.2)}"/>`;
}

function head(avatar: Avatar, l: Look, back: boolean): string {
  const face = back
    ? ""
    : `<ellipse cx="30" cy="31" rx="${avatar === "dog" ? 5.5 : 4.5}" ry="${avatar === "dog" ? 5 : 3.8}" fill="${l.muzzle}"/>
       <ellipse cx="30" cy="28.6" rx="1.6" ry="1.1" fill="#2a2524"/>
       <circle cx="25.6" cy="22.5" r="1.15" fill="#1e1b1a"/><circle cx="34.4" cy="22.5" r="1.15" fill="#1e1b1a"/>`;
  return `<g class="head">${avatar === "dog" ? "" : ears(avatar, l, back)}<ellipse cx="30" cy="24" rx="10" ry="12.5" fill="${l.fur}"/>${
    avatar === "dog" ? ears(avatar, l, back) : ""
  }${face}</g>`;
}

const SHADOW = `<ellipse class="shadow" cx="30" cy="197" rx="15" ry="2.6" fill="#000" opacity=".28"/>`;

// Front or back view, standing. `arms` changes for talking, leaning and
// holding an umbrella.
function standing(avatar: Avatar, l: Look, pose: Pose): string {
  const back = pose === "back";
  const talk = pose === "talk";
  const umbrella = pose === "umbrella";
  const lean = pose === "lean";
  const tail =
    back && avatar === "cat"
      ? `<path d="M34 104 C46 112 48 132 40 146" stroke="${l.fur}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
      : back
        ? `<path d="M33 104 C40 108 42 114 41 120" stroke="${l.fur}" stroke-width="4" fill="none" stroke-linecap="round"/>`
        : "";
  const rightArm = talk
    ? `<g class="arm arm-r gesture"><path d="M44 46 C50 60 51 74 49 84 L45 84 C45 74 43 62 40 50 Z" fill="${l.top}"/><path d="M49 84 C52 80 55 74 55 70 L51 68 C50 73 48 78 45 82 Z" fill="${l.top}"/><circle cx="54" cy="68" r="3.2" fill="${l.fur}"/></g>`
    : umbrella
      ? `<g class="arm arm-r"><path d="M44 46 C50 58 50 68 46 78 L42 76 C44 68 43 58 40 50 Z" fill="${l.top}"/><circle cx="44" cy="78" r="3.2" fill="${l.fur}"/></g>`
      : `<g class="arm arm-r"><path d="M44 46 C49 62 50 86 48 106 L43 106 C43 88 42 64 40 50 Z" fill="${l.top}"/><circle cx="45.5" cy="108" r="3.3" fill="${l.fur}"/></g>`;
  const leftArm = lean
    ? `<g class="arm arm-l"><path d="M16 46 C10 60 8 78 6 96 L11 97 C13 80 16 64 20 50 Z" fill="${l.top}"/><circle cx="8.5" cy="99" r="3.3" fill="${l.fur}"/></g>`
    : `<g class="arm arm-l"><path d="M16 46 C11 62 10 86 12 106 L17 106 C17 88 18 64 20 50 Z" fill="${l.top}"/><circle cx="14.5" cy="108" r="3.3" fill="${l.fur}"/></g>`;
  const brolly = umbrella
    ? `<g class="umbrella"><path d="M44 78 L44 6" stroke="#222" stroke-width="1.4"/><path d="M6 14 C14 -6 74 -6 82 14 C76 10 70 10 64 14 C58 10 50 10 44 14 C38 10 30 10 24 14 C18 10 12 10 6 14 Z" fill="#26313d"/></g>`
    : "";
  return `<g class="body${lean ? " leaning" : ""}">
    ${tail}
    <rect x="25.5" y="35" width="9" height="9" fill="${l.fur}"/>
    <g class="leg leg-l"><path d="M18.5 104 L29.2 104 L28.6 186 L20 186 Z" fill="${l.bottom}"/><path d="M18.6 186 L29 186 L29.4 194 L16.4 194 C16.4 190 17 187.5 18.6 186 Z" fill="#1f1f22"/></g>
    <g class="leg leg-r"><path d="M30.8 104 L41.5 104 L40 186 L31.4 186 Z" fill="${l.bottom}"/><path d="M31 186 L41.4 186 C43 187.5 43.6 190 43.6 194 L30.6 194 Z" fill="#1f1f22"/></g>
    <path d="M17 44 C22 40 38 40 43 44 L45 70 L43 110 L17 110 L15 70 Z" fill="${l.top}"/>
    ${back ? `<path d="M22 44 C26 49 34 49 38 44" stroke="#000" stroke-opacity=".18" fill="none"/>` : `<path d="M26 42 L30 52 L34 42" stroke="#000" stroke-opacity=".22" fill="none"/>`}
    ${leftArm}${rightArm}
    ${head(avatar, l, back)}
    ${brolly}
  </g>`;
}

// Side view, for walking: legs and arms swing (CSS), and the walker paces.
function walking(avatar: Avatar, l: Look): string {
  const ear =
    avatar === "cat"
      ? `<path d="M26 13 L29 1.5 L33 12 Z" fill="${l.fur}"/>`
      : `<ellipse cx="26" cy="22" rx="3.6" ry="9.5" transform="rotate(10 26 22)" fill="${shade(l.fur, -0.2)}"/>`;
  const tail =
    avatar === "cat"
      ? `<path d="M22 104 C10 110 8 128 14 140" stroke="${l.fur}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : `<path d="M22 104 C16 106 14 112 15 118" stroke="${l.fur}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return `<g class="body">
    ${tail}
    <g class="leg leg-back"><path d="M25 104 L35 104 L33 186 L25 186 Z" fill="${shade(l.bottom, -0.15)}"/><path d="M24 186 L34 186 L40 194 L24 194 Z" fill="#1a1a1c"/></g>
    <g class="arm arm-back"><path d="M28 46 L35 46 L33 104 L27 104 Z" fill="${shade(l.top, -0.18)}"/></g>
    <g class="leg leg-front"><path d="M24 104 L35 104 L33 186 L25 186 Z" fill="${l.bottom}"/><path d="M24 186 L34 186 L41 194 L24 194 Z" fill="#1f1f22"/></g>
    <path d="M21 44 C25 40 37 40 39 44 L40 72 L38 110 L22 110 L20 72 Z" fill="${l.top}"/>
    <rect x="27" y="35" width="8" height="9" fill="${l.fur}"/>
    <g class="arm arm-front"><path d="M28 46 L35 46 L34 104 L28 104 Z" fill="${l.top}"/><circle cx="31" cy="106" r="3.2" fill="${l.fur}"/></g>
    <g class="head"><ellipse cx="31" cy="24" rx="9" ry="12" fill="${l.fur}"/>${ear}
      <ellipse cx="${avatar === "dog" ? 41 : 39.5}" cy="29" rx="${avatar === "dog" ? 6 : 4.5}" ry="${avatar === "dog" ? 4.6 : 3.6}" fill="${l.muzzle}"/>
      <circle cx="${avatar === "dog" ? 46.4 : 43.6}" cy="27.5" r="1.3" fill="#2a2524"/>
      <circle cx="35" cy="21.5" r="1.1" fill="#1e1b1a"/></g>
  </g>`;
}

// Sitting on a tier, seen from the front: knees towards the viewer.
function sitting(avatar: Avatar, l: Look): string {
  return `<g class="body">
    <path d="M18 118 L42 118 L41 128 L19 128 Z" fill="${l.bottom}"/>
    <path d="M19.5 128 L28.5 128 L28 186 L20.5 186 Z" fill="${l.bottom}"/><path d="M31.5 128 L40.5 128 L39.5 186 L32 186 Z" fill="${l.bottom}"/>
    <path d="M18.6 186 L29 186 L29.4 194 L16.4 194 Z" fill="#1f1f22"/><path d="M31 186 L41.4 186 L43.6 194 L30.6 194 Z" fill="#1f1f22"/>
    <path d="M17 64 C22 60 38 60 43 64 L45 90 L43 122 L17 122 L15 90 Z" fill="${l.top}"/>
    <rect x="25.5" y="55" width="9" height="9" fill="${l.fur}"/>
    <g class="arm arm-l"><path d="M16 66 C12 80 14 104 22 114 L26 111 C20 102 19 84 20 70 Z" fill="${l.top}"/><circle cx="25" cy="115" r="3.3" fill="${l.fur}"/></g>
    <g class="arm arm-r"><path d="M44 66 C48 80 46 104 38 114 L34 111 C40 102 41 84 40 70 Z" fill="${l.top}"/><circle cx="35" cy="115" r="3.3" fill="${l.fur}"/></g>
    <g transform="translate(0 20)">${head(avatar, l, false)}</g>
  </g>`;
}

export function figureSvg(avatar: Avatar, pose: Pose, seed: string): string {
  const l = lookFor(seed);
  const inner = pose === "walk" ? walking(avatar, l) : pose === "sit" ? sitting(avatar, l) : standing(avatar, l, pose);
  // the umbrella reaches outside the body's box, so that pose is wider
  const box = pose === "umbrella" ? "0 -6 88 206" : "0 0 60 200";
  return `<svg viewBox="${box}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${SHADOW}${inner}</svg>`;
}

export function figureAspect(pose: Pose): number {
  return pose === "umbrella" ? 88 / 206 : 60 / 200;
}

// Faint passers-by for an outdoor mode's crowd. They make no sound and
// aren't anyone's: they only show how busy the hour is.
export function passerSvg(seed: string, umbrella: boolean): string {
  return figureSvg(hash(seed) % 2 ? "cat" : "dog", umbrella ? "umbrella" : "walk", seed);
}
