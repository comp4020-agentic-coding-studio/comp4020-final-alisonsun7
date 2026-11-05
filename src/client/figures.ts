// The people: cats and dogs drawn at adult proportions (about seven and a
// half heads tall), in everyday campus clothes. They are deliberately simple
// SVG silhouettes, marked in the UI as placeholder figures until real
// character art exists, and they never copy anyone from the photos.
//
// Every figure belongs to one placed sound and does what that sound is.
// How a figure stands.
// "walk" is the side view; "walk-front" and "walk-back" walk towards and
// away from the viewer.
export type Pose = "stand" | "walk" | "walk-front" | "walk-back" | "talk" | "sit" | "back" | "umbrella" | "lean" | "guitar" | "strum" | "arms-up";
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

// How far the body sinks below standing height when the thighs are turned
// by `deg`: the hip is 90 units above the sole, so a straight leg at an
// angle leaves the foot off the ground unless the body comes down.
const sink = (deg: number): number => 90 * (1 - Math.cos((deg * Math.PI) / 180));
const STRIDE = 20; // degrees each thigh swings either side of straight down

// Front or back view, standing. `arms` changes for talking, leaning and
// holding an umbrella. With `phase` (0 to 1, a step of each leg) the figure
// walks towards or away from the viewer: the leg swinging through lifts,
// the arms swing against the legs, and the weight shifts and dips.
function standing(avatar: Avatar, l: Look, pose: Pose, phase?: number): string {
  const back = pose === "back" || pose === "walk-back";
  const q = phase === undefined ? null : phase * Math.PI * 2;
  const lift = (a: number): number => 9 * Math.max(0, Math.cos(a));
  const legL = q === null ? "" : ` transform="translate(0 ${-lift(q).toFixed(2)})"`;
  const legR = q === null ? "" : ` transform="translate(0 ${-lift(q + Math.PI).toFixed(2)})"`;
  // seen from in front, a forward hand drops a little, a back one rises
  const armL = q === null ? "" : ` transform="translate(0 ${(-3 * Math.sin(q)).toFixed(2)})"`;
  const armR = q === null ? "" : ` transform="translate(0 ${(3 * Math.sin(q)).toFixed(2)})"`;
  const body = q === null ? "" : ` transform="translate(${(1.2 * Math.sin(q)).toFixed(2)} ${sink(STRIDE * Math.abs(Math.sin(q))).toFixed(2)})"`;
  const talk = pose === "talk";
  const umbrella = pose === "umbrella";
  const lean = pose === "lean";
  const up = pose === "arms-up";
  const tail =
    back && avatar === "cat"
      ? `<path d="M34 104 C46 112 48 132 40 146" stroke="${l.fur}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
      : back
        ? `<path d="M33 104 C40 108 42 114 41 120" stroke="${l.fur}" stroke-width="4" fill="none" stroke-linecap="round"/>`
        : "";
  const rightArm = up
    ? `<g class="arm arm-r"><path d="M40 50 C44 38 47 22 47 10 L51 10 C52 24 49 40 44 50 Z" fill="${l.top}"/><circle cx="49" cy="8" r="3.3" fill="${l.fur}"/></g>`
    : talk
    ? `<g class="arm arm-r gesture"><path d="M44 46 C50 60 51 74 49 84 L45 84 C45 74 43 62 40 50 Z" fill="${l.top}"/><path d="M49 84 C52 80 55 74 55 70 L51 68 C50 73 48 78 45 82 Z" fill="${l.top}"/><circle cx="54" cy="68" r="3.2" fill="${l.fur}"/></g>`
    : umbrella
      ? `<g class="arm arm-r"><path d="M44 46 C50 58 50 68 46 78 L42 76 C44 68 43 58 40 50 Z" fill="${l.top}"/><circle cx="44" cy="78" r="3.2" fill="${l.fur}"/></g>`
      : `<g class="arm arm-r"><path d="M44 46 C49 62 50 86 48 106 L43 106 C43 88 42 64 40 50 Z" fill="${l.top}"/><circle cx="45.5" cy="108" r="3.3" fill="${l.fur}"/></g>`;
  const leftArm = up
    ? `<g class="arm arm-l"><path d="M20 50 C16 38 13 22 13 10 L9 10 C8 24 11 40 16 50 Z" fill="${l.top}"/><circle cx="11" cy="8" r="3.3" fill="${l.fur}"/></g>`
    : lean
    ? `<g class="arm arm-l"><path d="M16 46 C10 60 8 78 6 96 L11 97 C13 80 16 64 20 50 Z" fill="${l.top}"/><circle cx="8.5" cy="99" r="3.3" fill="${l.fur}"/></g>`
    : `<g class="arm arm-l"><path d="M16 46 C11 62 10 86 12 106 L17 106 C17 88 18 64 20 50 Z" fill="${l.top}"/><circle cx="14.5" cy="108" r="3.3" fill="${l.fur}"/></g>`;
  const brolly = umbrella
    ? `<g class="umbrella"><path d="M44 78 L44 6" stroke="#222" stroke-width="1.4"/><path d="M6 14 C14 -6 74 -6 82 14 C76 10 70 10 64 14 C58 10 50 10 44 14 C38 10 30 10 24 14 C18 10 12 10 6 14 Z" fill="#26313d"/></g>`
    : "";
  return `<g class="body${lean ? " leaning" : ""}"${body}>
    ${tail}
    <rect x="25.5" y="35" width="9" height="9" fill="${l.fur}"/>
    <g class="leg leg-l"${legL}><path d="M18.5 104 L29.2 104 L28.6 186 L20 186 Z" fill="${l.bottom}"/><path d="M18.6 186 L29 186 L29.4 194 L16.4 194 C16.4 190 17 187.5 18.6 186 Z" fill="#1f1f22"/></g>
    <g class="leg leg-r"${legR}><path d="M30.8 104 L41.5 104 L40 186 L31.4 186 Z" fill="${l.bottom}"/><path d="M31 186 L41.4 186 C43 187.5 43.6 190 43.6 194 L30.6 194 Z" fill="#1f1f22"/></g>
    <path d="M17 44 C22 40 38 40 43 44 L45 70 L43 110 L17 110 L15 70 Z" fill="${l.top}"/>
    ${back ? `<path d="M22 44 C26 49 34 49 38 44" stroke="#000" stroke-opacity=".18" fill="none"/>` : `<path d="M26 42 L30 52 L34 42" stroke="#000" stroke-opacity=".22" fill="none"/>`}
    <g${armL}>${leftArm}</g><g${armR}>${rightArm}</g>
    ${head(avatar, l, back)}
    ${brolly}
  </g>`;
}

// Side view, for walking, at a point in the stride (`phase`, 0 to 1: a step
// of each leg). Each thigh turns at the hip and the shin at the knee, which
// bends as the leg swings through and straightens to land; the arms swing
// against the legs; the body dips so the standing foot stays on the ground.
// The world swaps these frames as the walker covers ground.
function walking(avatar: Avatar, l: Look, phase: number): string {
  const q = phase * Math.PI * 2;
  const leg = (a: number, fill: string, shoe: string, cls: string): string => {
    // forward (to the right) is anticlockwise in SVG
    const thigh = -STRIDE * Math.sin(a);
    const knee = 30 * Math.max(0, Math.cos(a)) ** 1.5;
    return `<g class="leg ${cls}" transform="rotate(${thigh.toFixed(2)} 30 104)"><path d="M25 104 L35 104 L34.4 146 L25.8 146 Z" fill="${fill}"/>
      <g transform="rotate(${knee.toFixed(2)} 30 145)"><path d="M25.8 144 L34.2 144 L33 186 L25.4 186 Z" fill="${fill}"/><path d="M24.6 186 L33.6 186 L40 194 L24.6 194 Z" fill="${shoe}"/></g></g>`;
  };
  const arm = (a: number, fill: string, cls: string, hand: string): string =>
    `<g class="arm ${cls}" transform="rotate(${(16 * Math.sin(a)).toFixed(2)} 31 47)"><path d="M28 46 L35 46 L34 104 L28 104 Z" fill="${fill}"/>${hand}</g>`;
  const ear =
    avatar === "cat"
      ? `<path d="M26 13 L29 1.5 L33 12 Z" fill="${l.fur}"/>`
      : `<ellipse cx="26" cy="22" rx="3.6" ry="9.5" transform="rotate(10 26 22)" fill="${shade(l.fur, -0.2)}"/>`;
  const tail =
    avatar === "cat"
      ? `<path d="M22 104 C10 110 8 128 14 140" stroke="${l.fur}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : `<path d="M22 104 C16 106 14 112 15 118" stroke="${l.fur}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return `<g class="body" transform="translate(0 ${sink(STRIDE * Math.abs(Math.sin(q))).toFixed(2)})">
    ${tail}
    ${leg(q + Math.PI, shade(l.bottom, -0.15), "#1a1a1c", "leg-back")}
    ${arm(q + Math.PI, shade(l.top, -0.18), "arm-back", "")}
    ${leg(q, l.bottom, "#1f1f22", "leg-front")}
    <path d="M21 44 C25 40 37 40 39 44 L40 72 L38 110 L22 110 L20 72 Z" fill="${l.top}"/>
    <rect x="27" y="35" width="8" height="9" fill="${l.fur}"/>
    ${arm(q, l.top, "arm-front", `<circle cx="31" cy="106" r="3.2" fill="${l.fur}"/>`)}
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

// Sitting with a guitar across the lap, the strumming hand up ("guitar") or
// down ("strum"): two drawings the world swaps between.
function guitarist(avatar: Avatar, l: Look, down: boolean): string {
  const wood = "#b5763c";
  const dark = "#5a3518";
  const hand = down ? `<circle cx="37" cy="${117}" r="3.4" fill="${l.fur}"/>` : `<circle cx="38" cy="${104}" r="3.4" fill="${l.fur}"/>`;
  return `${sitting(avatar, l).replace(/<g class="arm arm-r">.*?<\/g>/, "")}
    <g class="guitar">
      <path d="M27 104 L4 80 L7 77 L30 101 Z" fill="${dark}"/>
      <rect x="1" y="73" width="7" height="6" rx="1.5" transform="rotate(-45 4.5 76)" fill="${dark}"/>
      <ellipse cx="30" cy="103" rx="8" ry="7" fill="${wood}"/>
      <ellipse cx="37" cy="112" rx="11" ry="9.5" fill="${wood}"/>
      <circle cx="33" cy="107" r="3" fill="${dark}"/>
    </g>
    <path d="M16 66 C10 74 8 82 9 86 L13 86 C13 80 16 74 20 70 Z" fill="${l.top}"/><circle cx="10" cy="84" r="3.2" fill="${l.fur}"/>
    <path d="M44 66 C49 78 46 ${down ? 108 : 96} 40 ${down ? 114 : 102} L36 ${down ? 111 : 99} C41 ${down ? 102 : 92} 41 82 40 70 Z" fill="${l.top}"/>${hand}`;
}

// `phase` (0 to 1) is how far through a stride a walking pose is drawn.
export function figureSvg(avatar: Avatar, pose: Pose, seed: string, phase = 0): string {
  const l = lookFor(seed);
  const inner =
    pose === "walk"
      ? walking(avatar, l, phase)
      : pose === "walk-front" || pose === "walk-back"
        ? standing(avatar, l, pose, phase)
        : pose === "sit"
        ? sitting(avatar, l)
        : pose === "guitar" || pose === "strum"
          ? guitarist(avatar, l, pose === "strum")
          : standing(avatar, l, pose);
  // the umbrella reaches outside the body's box, and so does a stride
  const box = pose === "umbrella" ? "0 -6 88 206" : pose === "walk" ? "-10 0 80 200" : "0 0 60 200";
  return `<svg viewBox="${box}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${SHADOW}${inner}</svg>`;
}

export function figureAspect(pose: Pose): number {
  return pose === "umbrella" ? 88 / 206 : pose === "walk" ? 80 / 200 : 60 / 200;
}

// Children playing on the beach: the same figures with a child's bigger
// head for their height, bright tops, and shorts with bare legs below. The
// head reaches above the adult box, so the viewBox is 60 × 216.
const KID_COLOURS = ["#e63946", "#f4a261", "#2a9d8f", "#457be0", "#f2c14e", "#9b5de5"];
export const KID_ASPECT = 60 / 216;

export function kidSvg(avatar: Avatar, pose: Pose, seed: string): string {
  const h = hash(seed);
  const l = { ...lookFor(seed), top: KID_COLOURS[h % KID_COLOURS.length], bottom: KID_COLOURS[(h >>> 3) % KID_COLOURS.length] };
  const bare = `<path d="M19 140 L28.9 140 L28.6 186 L20 186 Z" fill="${l.fur}"/><path d="M31 140 L41 140 L40 186 L31.4 186 Z" fill="${l.fur}"/>`;
  let inner = standing(avatar, l, pose)
    .replace('<g class="head">', '<g class="head" transform="translate(30 40) scale(1.5) translate(-30 -40)">')
    .replace('<path d="M17 44', `${bare}<path d="M17 44`);
  // with the bigger head, raised hands reach above it
  if (pose === "arms-up")
    inner = inner
      .replace("C44 38 47 22 47 10 L51 10 C52 24", "C44 32 46 6 46 -10 L50 -10 C52 8")
      .replace('cx="49" cy="8"', 'cx="48" cy="-12"')
      .replace("C16 38 13 22 13 10 L9 10 C8 24", "C16 32 14 6 14 -10 L10 -10 C8 8")
      .replace('cx="11" cy="8"', 'cx="12" cy="-12"');
  return `<svg viewBox="0 -16 60 216" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${SHADOW}${inner}</svg>`;
}

// Faint passers-by for an outdoor mode's crowd. They make no sound and
// aren't anyone's: they only show how busy the hour is.
export const passerAvatar = (seed: string): Avatar => (hash(seed) % 2 ? "cat" : "dog");

// The kangaroo who comes to find you when you wander off the trail. Side
// view, facing right, drawn like the other figures: flat shapes, no outline.
// The viewBox is 120 × 150; the feet are at the bottom.
export function kangarooSvg(): string {
  const fur = "#a8754a";
  const light = "#d8b48a";
  const dark = "#6e4a2e";
  return `<svg viewBox="0 0 120 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <ellipse cx="58" cy="147" rx="34" ry="3" fill="#000" opacity=".25"/>
    <path d="M40 112 C22 120 8 132 2 146 L10 147 C18 136 30 128 46 122 Z" fill="${dark}"/>
    <path d="M44 70 C30 84 30 112 44 122 C56 130 72 126 76 112 C80 96 72 74 60 66 Z" fill="${fur}"/>
    <path d="M62 84 C70 92 70 110 64 118 C60 110 58 96 62 84 Z" fill="${light}"/>
    <path d="M48 112 C44 126 46 138 56 144 L88 146 C90 142 86 139 78 138 L62 136 C58 128 60 120 62 114 Z" fill="${dark}"/>
    <path d="M58 64 C60 52 64 42 70 36 L78 42 C74 50 70 58 68 68 Z" fill="${fur}"/>
    <path d="M66 82 C74 84 80 88 84 94 L81 97 C76 92 71 89 64 88 Z" fill="${dark}"/>
    <ellipse cx="78" cy="32" rx="13" ry="9" fill="${fur}"/>
    <path d="M86 30 C94 30 100 33 101 37 C97 39 91 38 86 37 Z" fill="${fur}"/>
    <circle cx="100.5" cy="36.2" r="1.6" fill="#2a2524"/>
    <circle cx="84" cy="29" r="1.5" fill="#1e1b1a"/>
    <path d="M70 26 C66 14 66 6 70 2 C74 8 75 16 74 25 Z" fill="${fur}"/>
    <path d="M70.5 22 C68.5 14 68.6 9 70.4 6 C72.2 10 72.6 15 72 21 Z" fill="${light}"/>
    <path d="M76 25 C76 13 79 6 84 3 C85 10 83 18 80 26 Z" fill="${dark}"/>
  </svg>`;
}
