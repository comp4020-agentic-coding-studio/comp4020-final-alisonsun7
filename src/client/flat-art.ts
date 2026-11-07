/**
 * Original, dependency-free Little Chorus paper illustration primitives.
 *
 * The caller owns world coordinates, collision, visibility, depth ordering and
 * canonical shared state. x/y are a projected ground centre in CSS pixels;
 * scale is CSS pixels per world metre. No painter creates actors or sources.
 * Time is server-anchored seconds. Reduced motion keeps the finished form.
 */
export type FlatStyle = "flat" | "iso";
export type FlatObjectKind = "tree" | "green" | "cafe" | "stage" | "reading" | "restroom" | "shower" | "conservatory" | "pool" | "workshop" | "observatory" | "kangaroo" | "sound" | "canopy" | "beat-flower" | "lantern" | "rock" | "flower" | "bench";
export interface FlatArtOptions {
  style: FlatStyle;
  x: number;
  y: number;
  scale: number;
  time: number;
  reducedMotion: boolean;
  seed?: string | number;
  active?: boolean;
  duet?: boolean;
  authors?: readonly string[];
  sourceIds?: readonly string[];
  name?: string;
  /** Sound family, or a small scenery variant; never used to infer participants. */
  variant?: string;
  occupied?: boolean;
  /** Cut away the private room only for its actual local occupant. */
  interior?: boolean;
}
export interface FlatPersonOptions extends FlatArtOptions {
  animal: "cat" | "dog";
  color?: string;
  yaw?: number;
  moving?: boolean;
  running?: boolean;
  jump?: number;
  npc?: boolean;
  self?: boolean;
}
export interface FlatBackdropOptions {
  style: FlatStyle;
  width: number;
  height: number;
  time: number;
  reducedMotion: boolean;
}

export const FLAT_PALETTE = Object.freeze({
  paper: "#f8f3e6", cream: "#fffaf0", ink: "#30483f", sage: "#a8bc98",
  grass: "#d7dfb6", deepSage: "#6f9274", moss: "#486e5a", terracotta: "#c77f62",
  peach: "#e8b89a", ochre: "#d6b265", water: "#99c8c7", waterDark: "#6fa7ab",
  shadow: "rgba(48,72,63,.12)", plum: "#8f7b9d", pink: "#d99591",
});
const P = FLAT_PALETTE;
const AUTHOR_COLORS = [P.terracotta, P.waterDark, P.ochre, P.plum, P.deepSage, P.pink];
function hash(value: string | number = "little-chorus"): number {
  let n = 2166136261;
  for (const char of String(value)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** Stable ornament colour from a real participant ID, not their mutable name. */
export function flatAuthorColor(id: string): string { return AUTHOR_COLORS[hash(id) % AUTHOR_COLORS.length]!; }
function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function line(c: CanvasRenderingContext2D, points: readonly [number, number][], color: string, width = .045): void {
  if (!points.length) return;
  c.beginPath(); c.moveTo(...points[0]!); for (const p of points.slice(1)) c.lineTo(...p);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function poly(c: CanvasRenderingContext2D, points: readonly [number, number][], fill: string, stroke?: string): void {
  c.beginPath(); c.moveTo(...points[0]!); for (const p of points.slice(1)) c.lineTo(...p); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = P.ink): void {
  c.fillStyle = color; c.font = `600 ${size}px Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, x, y);
}
function groundShadow(c: CanvasRenderingContext2D, width: number, o: FlatArtOptions): void {
  ellipse(c, .18, .1, width, o.style === "iso" ? width * .24 : width * .42, P.shadow);
}
function leaf(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, color: string): void {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-size * .8, -size * .6, -size * .5, -size * 1.5, 0, -size * 1.8);
  c.bezierCurveTo(size * .7, -size * 1.2, size * .65, -size * .45, 0, 0); c.fillStyle = color; c.fill();
  line(c, [[0, -.1], [0, -size * 1.4]], "rgba(255,250,240,.3)", .025); c.restore();
}
function flower(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5;
    ellipse(c, x + Math.sin(a) * s * .65, y + Math.cos(a) * s * .65, s * .48, s * .48, color);
  }
  ellipse(c, x, y, s * .35, s * .35, P.ochre);
}
function musicNote(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ellipse(c, x, y, s * .14, s * .09, color);
  line(c, [[x + s * .12, y], [x + s * .12, y - s * .56], [x + s * .4, y - s * .48]], color, s * .07);
}
function paperBird(c: CanvasRenderingContext2D, x: number, y: number, size: number, flap: number): void {
  poly(c, [[x, y], [x - size, y - size * (.5 + flap)], [x - size * .24, y + size * .15], [x + size * .82, y - size * (.7 - flap)]], P.cream);
  line(c, [[x - size * .24, y + size * .15], [x, y]], P.waterDark, .025);
}
function plank(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string = P.peach): void {
  round(c, x, y, w, h, .07, color);
  line(c, [[x + .09, y + h * .6], [x + w - .09, y + h * .6]], "rgba(90,62,43,.13)", .018);
}

/** A paper grain backdrop; no photographed/generated backdrop substitutes for geometry. */
export function drawFlatBackdrop(c: CanvasRenderingContext2D, o: FlatBackdropOptions): void {
  c.save();
  c.fillStyle = o.style === "flat" ? "#f0edda" : "#e9ede0"; c.fillRect(0, 0, o.width, o.height);
  const glow = c.createRadialGradient(o.width * .45, o.height * .3, 0, o.width * .45, o.height * .4, Math.max(o.width, o.height) * .8);
  glow.addColorStop(0, "rgba(255,253,240,.6)"); glow.addColorStop(1, "rgba(155,177,153,.05)"); c.fillStyle = glow; c.fillRect(0, 0, o.width, o.height);
  c.fillStyle = "rgba(74,93,66,.04)";
  for (let i = 0; i < 100; i++) { const n = hash(i); c.fillRect(n % Math.max(1, o.width), (n >>> 12) % Math.max(1, o.height), 1, 1); }
  c.restore();
}

function tree(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const sway = o.reducedMotion ? 0 : Math.sin(o.time * .55 + hash(o.seed) % 9) * .045;
  groundShadow(c, 1.15, o); c.save(); c.rotate(sway);
  if (o.style === "flat") {
    line(c, [[0, .15], [0, -.9], [-.45, -1.4]], "#8e8b68", .16);
    ellipse(c, -.44, -.95, .86, .8, P.sage); ellipse(c, .43, -1.05, .95, .9, P.deepSage); ellipse(c, -.13, -1.66, .9, .79, "#b9ca9c");
    leaf(c, -.35, -.7, .22, -.3, "#e0e5b8"); leaf(c, .6, -1.45, .18, .7, "#d0daac");
  } else {
    poly(c, [[-.13, .08], [.13, -.03], [.12, -2.2], [-.06, -2.42]], "#8f8e69");
    line(c, [[0, -1.17], [-.5, -1.7]], "#8f8e69", .13);
    ellipse(c, -.52, -2.03, .95, .7, P.deepSage); ellipse(c, .44, -2.22, 1.03, .84, P.sage);
    ellipse(c, -.1, -2.76, .95, .72, "#b4c799");
    leaf(c, -.58, -2.25, .25, -.4, "#d3ddb0"); leaf(c, .58, -2.2, .22, .7, "#d3ddb0");
  }
  c.restore();
}
function cafe(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const iso = o.style === "iso";
  groundShadow(c, 3.25, o);
  if (iso) poly(c, [[2.25, 0], [3.18, -.62], [3.18, -3.35], [2.25, -2.8]], "#cdb899");
  round(c, -2.25, -2.75, 4.5, 2.85, .12, P.cream);
  round(c, -1.94, -2.4, 3.88, 1.93, .07, "#e8d6b5");
  round(c, -1.7, -2.21, 3.4, 1.72, .05, "#9bac92");
  // Open frontage: the counter is low enough to see barista/players behind it.
  plank(c, -1.93, -.75, 3.86, .72, "#cb9976"); plank(c, -2.02, -.85, 4.04, .19, "#f0d6b0");
  round(c, -.8, -1.45, .75, .57, .07, "#536e64");
  round(c, -.69, -1.36, .5, .16, .025, P.cream); ellipse(c, -.45, -.94, .18, .045, P.ochre);
  for (let k = 0; k < 3; k++) { round(c, .38 + k * .32, -1.13, .19, .26, .04, P.cream); ellipse(c, .475 + k * .32, -1.12, .07, .025, "#836954"); }
  if (o.active) for (let k = 0; k < 3; k++) {
    const phase = o.reducedMotion ? .45 : (o.time * .36 + k * .32) % 1;
    c.globalAlpha = (1 - phase) * .75; line(c, [[-.47 + k * .13, -1.5 - phase * .7], [-.52 + k * .13, -1.72 - phase * .7], [-.45 + k * .13, -1.9 - phase * .7]], P.cream, .04);
  }
  c.globalAlpha = 1;
  if (iso) poly(c, [[-2.55, -2.76], [-1.6, -3.39], [3.18, -3.39], [2.55, -2.76]], "#d09b81");
  round(c, -2.55, -2.97, 5.1, .64, .09, P.cream);
  for (let k = 0; k < 9; k++) if (k % 2 === 0) round(c, -2.55 + k * 5.1 / 9, -2.97, 5.1 / 9, .64, .04, P.terracotta);
  round(c, -1.57, -3.33, 3.14, .54, .1, P.moss); label(c, "TIDE & COFFEE", 0, -3.06, .25, P.cream);
  // Patio tables live to the sides of the open entry, not across the doorway.
  for (const side of [-1, 1]) {
    const x = side * 3.15;
    groundShadowAt(c, x, .67, .67, iso ? .21 : .38);
    line(c, [[x, .4], [x, 1.12]], "#8a8c66", .13); ellipse(c, x, .28, .75, iso ? .35 : .56, P.peach);
    round(c, x - .17, -.04, .25, .32, .05, P.cream); ellipse(c, x - .045, -.03, .09, .03, "#82624e");
    for (const chair of [-1, 1]) { plank(c, x + chair * .84 - .25, .52, .5, .22, "#a6b194"); line(c, [[x + chair * .84, .6], [x + chair * .84, .9]], "#8b967a", .07); }
  }
  if (o.variant === "music") musicNote(c, 1.32, -1.61 - (o.reducedMotion ? 0 : Math.sin(o.time) * .12), .66, P.ochre);
  flowerPot(c, -2.11, -.03, .35); flowerPot(c, 2.08, -.03, .35);
}
function groundShadowAt(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void { ellipse(c, x, y, rx, ry, P.shadow); }
function flowerPot(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  poly(c, [[x - s * .7, y - s], [x + s * .7, y - s], [x + s * .5, y], [x - s * .5, y]], P.terracotta);
  leaf(c, x, y - s * .8, s * .65, -.45, P.deepSage); leaf(c, x, y - s * .8, s * .68, .55, P.sage);
}
function stage(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  groundShadow(c, 3.2, o);
  const sy = o.style === "iso" ? .52 : .75;
  ellipse(c, 0, 0, 3.02, 2.05 * sy, "#c4a988"); ellipse(c, 0, -.17, 3.02, 2.05 * sy, "#e6caa4");
  for (let n = -2; n <= 2; n++) line(c, [[n * .9, -.17 - Math.sqrt(1 - (n * .9 / 3.02) ** 2) * 2.05 * sy], [n * .9, -.17 + Math.sqrt(1 - (n * .9 / 3.02) ** 2) * 2.05 * sy]], "rgba(117,94,69,.17)", .03);
  line(c, [[-2.65, -.1], [-2.65, -2.65], [2.65, -2.65], [2.65, -.1]], P.moss, .11);
  c.beginPath(); c.moveTo(-2.65, -2.61); c.quadraticCurveTo(0, -1.72, 2.65, -2.61); c.strokeStyle = P.moss; c.lineWidth = .035; c.stroke();
  for (let k = 0; k < 9; k++) { const x = -2.36 + k * .59; const y = -2.61 + .43 * (1 - (x / 2.65) ** 2); poly(c, [[x - .17, y], [x + .17, y], [x, y + .33]], AUTHOR_COLORS[k % AUTHOR_COLORS.length]!); }
  round(c, -.5, -2.93, 1, .44, .13, P.cream); label(c, "JAM", 0, -2.71, .24);
  if (o.active) for (let k = 0; k < 3; k++) musicNote(c, -1 + k, -.9 - (o.reducedMotion ? .1 : Math.sin(o.time * 1.2 + k) * .12), .55, AUTHOR_COLORS[k]!);
}
function reading(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  groundShadow(c, 2.35, o);
  if (o.style === "iso") poly(c, [[1.7, 0], [2.4, -.5], [2.4, -2.7], [1.7, -2.3]], "#b4b394");
  round(c, -1.7, -2.36, 3.4, 2.45, .1, "#e3d9ba");
  poly(c, [[-2.05, -2.28], [0, -3.31], [2.05, -2.28]], P.deepSage);
  poly(c, [[-1.85, -2.28], [0, -3.17], [1.85, -2.28]], P.sage);
  round(c, -1.37, -1.93, 2.74, 1.48, .04, "#a6ac8b");
  for (const yy of [-1.34, -.62]) { plank(c, -1.39, yy, 2.78, .13, "#c8aa82"); for (let k = 0; k < 9; k++) { const x = -1.2 + k * .28; round(c, x, yy - .52 - (k % 3) * .06, .19, .52 + (k % 3) * .06, .025, AUTHOR_COLORS[k % 6]!); } }
  plank(c, -1.86, .04, 3.72, .32, P.peach); plank(c, -1.65, .31, 3.3, .14, "#c39c7b");
  // Open book, drawn as two folded leaves rather than a label on the hut.
  poly(c, [[-.5, -.22], [0, -.14], [0, -.55], [-.5, -.68]], P.cream); poly(c, [[0, -.14], [.5, -.22], [.5, -.68], [0, -.55]], "#f1e8cf");
  line(c, [[0, -.14], [0, -.55]], P.terracotta, .025);
  flowerPot(c, 2.02, .29, .42);
}
function hut(c: CanvasRenderingContext2D, o: FlatArtOptions, shower: boolean): void {
  groundShadow(c, 1.8, o);
  const col = shower ? "#9ab9b2" : "#c6b394";
  if (o.interior) {
    // A faithful cutaway, not a see-through occupied room for other visitors.
    round(c, -1.45, -1.02, 2.9, 1.2, .08, "#e4e4cf");
    round(c, -1.45, -2.43, 2.9, .26, .04, col);
    round(c, -1.45, -2.25, .16, 2.42, .03, col);
    round(c, 1.29, -2.25, .16, 2.42, .03, col);
    if (shower) {
      round(c, -.48, -1.22, .96, .85, .12, P.cream);
      ellipse(c, 0, -.73, .1, .045, P.waterDark);
      line(c, [[.68, -1.14], [.68, -2.03], [.25, -2.03]], P.waterDark, .06);
      if (o.active) for (let k = 0; k < 4; k++) { const f = o.reducedMotion ? .5 : (o.time + k * .23) % 1; line(c, [[.12 + k * .08, -1.9 + f * .8], [.1 + k * .08, -1.78 + f * .8]], P.water, .035); }
    } else {
      round(c, -.45, -1.78, .9, .48, .09, P.cream);
      ellipse(c, 0, -1.06, .48, .32, P.cream); ellipse(c, 0, -1.08, .28, .17, "#d1dfd3");
    }
    ellipse(c, .99, -2.29, .09, .09, "#b9564f", P.cream);
    return;
  }
  if (o.style === "iso") poly(c, [[1.45, .05], [2.14, -.56], [2.14, -2.93], [1.45, -2.4]], shower ? "#6f9f98" : "#a18d72");
  round(c, -1.45, -2.43, 2.9, 2.54, .08, col);
  for (let k = -1; k <= 1; k++) line(c, [[k * .75, -2.3], [k * .75, -.05]], "rgba(48,72,63,.1)", .028);
  poly(c, [[-1.65, -2.43], [-1.45, -2.75], [1.6, -2.75], [1.66, -2.43]], P.moss);
  round(c, -.53, -1.93, 1.06, 2.02, .06, o.occupied ? P.terracotta : "#eef0d9");
  if (!o.occupied) { poly(c, [[-.53, -1.93], [-.04, -1.65], [-.04, .22], [-.53, .07]], "#d8d4b7"); round(c, -.01, -1.83, .51, 1.8, .03, "#58685a"); }
  ellipse(c, .33, -.83, .045, .045, P.ochre);
  round(c, -.31, -2.57, .62, .44, .08, P.cream);
  if (shower) { line(c, [[-.15, -2.29], [-.15, -2.44], [.05, -2.46], [.14, -2.39]], P.ink, .04); for (let k = 0; k < 3; k++) line(c, [[.03 + k * .07, -2.35], [-.01 + k * .08, -2.27]], P.waterDark, .025); }
  else { ellipse(c, 0, -2.41, .07, .07, P.ink); line(c, [[0, -2.32], [0, -2.22]], P.ink, .075); }
  ellipse(c, .83, -2.13, .105, .105, o.occupied ? "#b9564f" : P.deepSage, P.cream);
  if (o.active && shower) for (let k = 0; k < 5; k++) { const f = o.reducedMotion ? .5 : (o.time * 1.2 + k * .18) % 1; line(c, [[.05 + k * .06, -1.5 + f * .9], [.02 + k * .06, -1.38 + f * .9]], P.water, .035); }
}
function bench(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  groundShadow(c, 1.2, o); for (const x of [-.83, .83]) line(c, [[x, -.52], [x, .17]], P.moss, .12);
  plank(c, -1.16, -.77, 2.32, .3, "#cdaa82"); plank(c, -1.16, -.37, 2.32, .35, P.peach);
}
function canopy(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const open = o.duet ? 1 : .62; const count = Math.max(2, Math.min(8, o.sourceIds?.length ?? 2));
  groundShadow(c, 2.75 * open, o);
  for (let k = 0; k < 3; k++) { const phase = o.reducedMotion ? .35 + k * .22 : (o.time * .15 + k / 3) % 1; c.globalAlpha = (1 - phase) * .52; ellipse(c, 0, .2, .5 + phase * 2.5 * open, (.2 + phase * .7) * (o.style === "iso" ? .65 : 1), P.water); }
  c.globalAlpha = 1;
  poly(c, [[-.19, .1], [.19, 0], [.1, -2.3], [-.1, -2.3]], "#9a9c77");
  for (let k = 0; k < count; k++) {
    const a = (k / count - .5) * Math.PI * 1.65;
    const tipX = Math.sin(a) * 2.1 * open, tipY = -2.15 - Math.cos(a) * .9;
    line(c, [[0, -1.3], [tipX * .6, tipY + .2], [tipX, tipY]], "#8da084", .07);
    leaf(c, tipX, tipY + .3, .78 * open, a * .8, k % 2 ? P.sage : P.deepSage);
    const color = flatAuthorColor(o.authors?.[k % Math.max(1, o.authors.length)] ?? `leaf-${k}`);
    flower(c, tipX * .8, tipY + .48, .14, color);
  }
  if (o.duet) for (let k = 0; k < 3; k++) { const angle = k * 2.1 + (o.reducedMotion ? 0 : o.time * .3); paperBird(c, Math.sin(angle) * 2.4, -2.6 + Math.cos(angle) * .4, .26, o.reducedMotion ? 0 : Math.sin(o.time * 2 + k) * .14); }
}
function beatFlower(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const count = Math.max(3, Math.min(8, o.sourceIds?.length ?? 3));
  const pulse = o.reducedMotion ? .5 : (Math.sin(o.time * Math.PI * 2 * 72 / 60) + 1) / 2;
  const open = o.duet ? 1 : .6;
  groundShadow(c, 2.5 * open, o);
  for (let k = 0; k < count; k++) {
    c.save(); c.translate(0, -.1); c.scale(1, o.style === "iso" ? .48 : .72); c.rotate(k * Math.PI * 2 / count + (o.reducedMotion ? 0 : o.time * .035));
    leaf(c, 0, 0, (1.2 + pulse * .09) * open, 0, flatAuthorColor(o.authors?.[k % Math.max(1, o.authors.length)] ?? `beat-${k}`)); c.restore();
  }
  line(c, [[0, .03], [0, -1.47]], P.moss, .1);
  ellipse(c, 0, -1.53, .43 + pulse * .04, .43 + pulse * .04, P.ochre, P.cream);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + (o.reducedMotion ? 0 : o.time * .15); leaf(c, Math.sin(a) * .2, -1.53 + Math.cos(a) * .2, .48 * open, -a, AUTHOR_COLORS[k]!); }
  ellipse(c, 0, -1.53, .25, .25, P.cream); musicNote(c, -.06, -1.48, .4, P.moss);
  if (o.duet) for (let k = 0; k < 3; k++) musicNote(c, -1.5 + k * 1.5, -2.1 - pulse * .16, .5, AUTHOR_COLORS[k]!);
}
function lantern(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const count = Math.max(2, Math.min(6, o.sourceIds?.length ?? 2)); const open = o.duet ? 1 : .57;
  groundShadow(c, 2 * open, o);
  const glow = c.createRadialGradient(0, -.6, .1, 0, -.6, 2.4 * open); glow.addColorStop(0, "rgba(237,199,114,.3)"); glow.addColorStop(1, "rgba(237,199,114,0)"); c.fillStyle = glow; c.fillRect(-3, -3.5, 6, 4.5);
  line(c, [[-1.9 * open, 0], [-1.9 * open, -2.74], [1.9 * open, -2.74], [1.9 * open, 0]], "#9e9e76", .07);
  for (let k = 0; k < count; k++) {
    const x = (k / Math.max(1, count - 1) - .5) * 3.2 * open; const y = -2.05 + Math.sin(k * 1.7) * .25;
    const sway = o.reducedMotion ? 0 : Math.sin(o.time * .65 + k) * .04;
    line(c, [[x, -2.74], [x + sway, y - .35]], P.moss, .025);
    c.save(); c.translate(x + sway, y); const col = flatAuthorColor(o.authors?.[k % Math.max(1, o.authors.length)] ?? `lantern-${k}`);
    ellipse(c, 0, 0, .35, .45, col); ellipse(c, -.1, -.04, .11, .3, "rgba(255,250,221,.45)");
    round(c, -.22, -.45, .44, .08, .025, P.moss); round(c, -.19, .4, .38, .07, .025, P.moss); line(c, [[0, .47], [0, .66]], P.ochre, .04); c.restore();
  }
  if (o.duet) for (let k = 0; k < 5; k++) { const t = o.reducedMotion ? k : o.time * .23 + k * 1.3; ellipse(c, Math.sin(t) * 1.8, -1.4 + Math.cos(t * .9) * .75, .055, .055, P.ochre); }
}
function sound(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const family = o.variant ?? "nature"; const col = o.authors?.[0] ? flatAuthorColor(o.authors[0]) : family === "music" ? P.terracotta : family === "event" ? P.ochre : P.waterDark;
  const bloom = o.active ? 1.14 : 1; const t = o.reducedMotion ? .5 : (Math.sin(o.time * 1.7 + hash(o.seed) % 12) + 1) / 2;
  groundShadow(c, .48, o);
  if (o.active) { c.globalAlpha = .2; ellipse(c, 0, -.05, .8 + t * .18, o.style === "iso" ? .28 : .55, col); c.globalAlpha = 1; }
  line(c, [[0, -.03], [0, -.73]], P.deepSage, .055); leaf(c, 0, -.2, .22, -.9, P.sage); leaf(c, 0, -.29, .19, .9, P.deepSage);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ellipse(c, Math.sin(a) * .2 * bloom, -.76 + Math.cos(a) * .19 * bloom, .19, .21, col); }
  ellipse(c, 0, -.76, .155, .155, P.cream); if (family === "music") musicNote(c, -.035, -.74, .22, P.ink); else if (family === "event") { line(c, [[-.075, -.76], [.075, -.76]], P.ink, .03); line(c, [[0, -.84], [0, -.68]], P.ink, .03); } else ellipse(c, 0, -.77, .045, .065, P.waterDark);
  // Seed notches indicate the exact source without placing text over the world.
  const marks = 1 + hash(o.sourceIds?.[0] ?? o.seed) % 3;
  for (let k = 0; k < marks; k++) ellipse(c, -.12 + k * .12, .025, .035, .022, col);
}
function kangaroo(c: CanvasRenderingContext2D, o: FlatArtOptions): void {
  const hop = o.active && !o.reducedMotion ? Math.max(0, Math.sin(o.time * 4)) * .35 : 0;
  groundShadow(c, .6, o); c.save(); c.translate(0, -hop);
  line(c, [[.16, -.35], [.65, -.18], [1.12, -.2]], "#b48d67", .18);
  ellipse(c, .1, -.66, .4, .62, "#bf9d76"); ellipse(c, -.01, -.55, .23, .37, "#eddbb4");
  ellipse(c, -.11, -1.27, .32, .36, "#c3a27a"); ellipse(c, -.28, -1.72, .115, .47, "#c3a27a"); ellipse(c, .06, -1.75, .105, .45, "#c3a27a");
  ellipse(c, -.28, -1.75, .046, .29, "#dfb9a1"); ellipse(c, .06, -1.79, .04, .27, "#dfb9a1");
  ellipse(c, -.29, -1.24, .2, .14, "#ead2ac"); ellipse(c, -.43, -1.26, .06, .05, P.ink); ellipse(c, -.12, -1.38, .035, .045, P.ink);
  line(c, [[-.18, -.86], [-.42, -.7]], "#ad8b66", .1); ellipse(c, -.23, -.06, .33, .11, "#a78965"); ellipse(c, .27, -.03, .36, .12, "#b48d67");
  c.restore();
}

/** Draw one upright object around its projected, collision-aligned ground anchor. */
export function drawFlatObject(c: CanvasRenderingContext2D, kind: FlatObjectKind, o: FlatArtOptions): void {
  c.save(); c.translate(o.x, o.y); c.scale(o.scale, o.scale); c.lineJoin = "round"; c.lineCap = "round"; c.lineWidth = .035;
  switch (kind) {
    case "tree": tree(c, o); break;
    case "green":
      ellipse(c, 0, 0, 3.5, o.style === "iso" ? 1.45 : 2.6, "#d4ddb4");
      for (let k = 0; k < 10; k++) flower(c, Math.sin(k * 2.4) * 3, Math.cos(k * 2.4) * (o.style === "iso" ? 1.2 : 2.2), .08, k % 2 ? P.cream : P.pink);
      break;
    case "cafe": cafe(c, o); break;
    case "stage": stage(c, o); break;
    case "reading": reading(c, o); break;
    case "restroom": hut(c, o, false); break;
    case "shower": hut(c, o, true); break;
    case "canopy": canopy(c, o); break;
    case "beat-flower": beatFlower(c, o); break;
    case "lantern": lantern(c, o); break;
    case "sound": sound(c, o); break;
    case "kangaroo": kangaroo(c, o); break;
    case "bench": bench(c, o); break;
    case "flower": flower(c, 0, -.07, .15, o.variant === "white" ? P.cream : P.pink); break;
    case "rock": groundShadow(c, .7, o); poly(c, [[-.65, 0], [-.46, -.56], [.14, -.83], [.62, -.39], [.63, .02], [0, .16]], "#a4b5a3"); poly(c, [[-.46, -.56], [.14, -.83], [.4, -.3], [-.04, -.22]], "#c3cdb8"); break;
    case "pool":
      groundShadow(c, 2.6, o); ellipse(c, 0, 0, 2.45, o.style === "iso" ? .95 : 1.8, "#dacda9"); ellipse(c, 0, -.06, 2.03, o.style === "iso" ? .76 : 1.45, P.water);
      for (let k = 0; k < 3; k++) { const yy = -.49 + k * .4; line(c, [[-1.2, yy], [-.8, yy + .07], [-.3, yy], [.3, yy + .06], [.8, yy], [1.25, yy + .03]], "rgba(255,250,240,.6)", .045); }
      break;
    case "conservatory":
      groundShadow(c, 2.25, o); round(c, -1.9, -2.3, 3.8, 2.4, .13, "rgba(176,205,183,.6)", P.deepSage); poly(c, [[-2.1, -2.28], [0, -3.3], [2.1, -2.28]], "rgba(212,230,200,.8)", P.deepSage);
      line(c, [[0, -3.3], [0, 0]], P.deepSage, .06); line(c, [[-1.4, -2.3], [-1.4, 0]], P.deepSage, .045); line(c, [[1.4, -2.3], [1.4, 0]], P.deepSage, .045);
      for (const x of [-1, 0, 1]) flowerPot(c, x, .02, .45); break;
    case "workshop":
      groundShadow(c, 2, o); round(c, -1.55, -2.26, 3.1, 2.35, .1, "#e2cfb0"); poly(c, [[-1.88, -2.2], [0, -3.14], [1.88, -2.2]], P.terracotta); plank(c, -1.8, -.13, 3.6, .3);
      for (let k = 0; k < 3; k++) { line(c, [[-.9 + k * .9, -2.19], [-.9 + k * .9, -1.67]], P.moss, .03); ellipse(c, -.9 + k * .9, -1.42, .23, .32, AUTHOR_COLORS[k]!); }
      break;
    case "observatory":
      groundShadow(c, 1.7, o); ellipse(c, 0, -.05, 1.65, o.style === "iso" ? .5 : .9, "#cbb692"); line(c, [[0, -1.7], [-.7, .02]], P.moss, .09); line(c, [[0, -1.7], [.7, .02]], P.moss, .09); line(c, [[0, -1.7], [.1, .18]], P.moss, .09);
      c.save(); c.translate(0, -1.75); c.rotate(-.4); round(c, -.9, -.24, 1.8, .48, .08, P.waterDark); round(c, .73, -.31, .2, .62, .05, P.ochre); c.restore(); break;
  }
  c.restore();
}

/** Expressive two-metre paper animal. Players have a scarf; NPCs an apron. */
export function drawFlatPerson(c: CanvasRenderingContext2D, o: FlatPersonOptions): void {
  c.save(); c.translate(o.x, o.y); c.scale(o.scale, o.scale); c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = .035;
  const h = hash(o.seed ?? o.name); const fur = o.color ?? (o.animal === "cat" ? ["#e8c39c", "#d3c8b3", "#b5aaa1"][h % 3]! : ["#bca486", "#dcc8aa", "#b7afa4"][h % 3]!);
  const cloth = o.authors?.[0] ? flatAuthorColor(o.authors[0]) : AUTHOR_COLORS[h % 6]!;
  const phase = o.reducedMotion || !o.moving ? 0 : Math.sin(o.time * (o.running ? 16 : 10));
  const bob = o.reducedMotion ? 0 : o.moving ? Math.abs(phase) * .055 : Math.sin(o.time * 1.5 + h % 9) * .012;
  const jump = Math.max(0, o.jump ?? 0);
  groundShadow(c, .49 * Math.max(.65, 1 - jump * .1), o);
  if (o.self) { c.setLineDash([.07, .07]); c.strokeStyle = "rgba(48,72,63,.38)"; c.lineWidth = .025; c.beginPath(); c.ellipse(0, .02, .65, o.style === "iso" ? .23 : .37, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  c.translate(0, -jump - bob);
  // Tail, then independent feet, gives walking a readable body silhouette.
  const face = Math.sin(o.yaw ?? 0); const tailSide = face >= 0 ? -1 : 1;
  c.beginPath(); c.moveTo(tailSide * .28, -.56); c.quadraticCurveTo(tailSide * .83, -.63, tailSide * .7, -1.05); c.strokeStyle = fur; c.lineWidth = .15; c.stroke();
  for (const side of [-1, 1]) {
    const stride = phase * .12 * side;
    round(c, side * .17 - .105, -.42 + stride, .23, .42, .1, fur);
    ellipse(c, side * .17 + .02, -.015 + stride, .18, .09, "#7b7768");
  }
  round(c, -.37, -1.25, .74, .96, .27, cloth);
  if (o.npc) { poly(c, [[-.23, -.98], [.23, -.98], [.28, -.39], [-.28, -.39]], "#efe8d4"); round(c, -.11, -.68, .22, .15, .02, "#d6c8aa"); }
  else { round(c, -.33, -1.18, .66, .15, .045, P.cream); poly(c, [[.13, -1.16], [.31, -1.16], [.4, -.73], [.2, -.81]], P.cream); }
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * .35, -1.06); c.rotate(side * (.17 + phase * .19)); round(c, -.075, 0, .17, .52, .08, fur); c.restore();
  }
  const headX = Math.max(-.08, Math.min(.08, face * .08));
  c.save(); c.translate(headX, -1.59);
  if (o.animal === "cat") {
    poly(c, [[-.41, -.2], [-.4, -.79], [-.04, -.47]], fur); poly(c, [[.41, -.2], [.4, -.79], [.04, -.47]], fur);
    poly(c, [[-.33, -.43], [-.32, -.67], [-.16, -.45]], "#d7aaa0"); poly(c, [[.33, -.43], [.32, -.67], [.16, -.45]], "#d7aaa0");
  } else {
    ellipse(c, -.43, -.22, .18, .42, "#a18e7a"); ellipse(c, .43, -.22, .18, .42, "#a18e7a");
  }
  ellipse(c, 0, -.15, .46, .46, fur);
  if (o.animal === "cat") { line(c, [[-.17, -.54], [-.13, -.39]], "#ad917d", .045); line(c, [[0, -.58], [0, -.42]], "#ad917d", .045); line(c, [[.17, -.54], [.13, -.39]], "#ad917d", .045); }
  const back = Math.cos(o.yaw ?? 0) < -.6;
  if (!back) {
    const gaze = face * .055;
    ellipse(c, -.17 + gaze, -.19, .04, .055, P.ink); ellipse(c, .17 + gaze, -.19, .04, .055, P.ink);
    ellipse(c, -.26, -.025, .085, .04, "rgba(206,139,124,.4)"); ellipse(c, .26, -.025, .085, .04, "rgba(206,139,124,.4)");
    ellipse(c, 0 + gaze, -.025, o.animal === "cat" ? .045 : .07, .038, "#655c53");
    c.beginPath(); c.arc(gaze, .033, .069, .15, Math.PI - .15); c.strokeStyle = "#736656"; c.lineWidth = .025; c.stroke();
    if (o.animal === "cat") for (const side of [-1, 1]) { line(c, [[side * .26, -.02], [side * .5, -.07]], "#8d8270", .019); line(c, [[side * .27, .05], [side * .48, .1]], "#8d8270", .019); }
  }
  if (o.self) { leaf(c, .27, -.53, .15, .55, P.deepSage); flower(c, .27, -.63, .065, P.cream); }
  c.restore();
  c.restore();
}
