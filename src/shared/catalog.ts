// The places, shots, anchors and sounds. Shared by server (validation) and
// client (rendering), so the two can't disagree about what exists.
//
// Every shot is one of Wen's photos, and every anchor's x/y was read off that
// photo (fractions of its width and height). Coordinates are where things
// appear in the picture, not where they are in the building: two shots of the
// same room don't share a coordinate system, and nothing here is a floor plan.

export type SoundId =
  | "lift-ding"
  | "footsteps"
  | "quiet-talk"
  | "typing"
  | "page-turn"
  | "cup-down"
  | "microwave-hum"
  | "microwave-beep"
  | "running-water"
  | "bin-drop"
  | "birdsong"
  | "wind"
  | "bicycle"
  | "rain"
  | "puddle-steps"
  | "door-slide"
  | "espresso"
  | "grinder"
  | "cups"
  | "chatter";

export type SoundCategory = "Nature" | "People" | "Movement" | "Places" | "Objects";
export const CATEGORIES: SoundCategory[] = ["Nature", "People", "Movement", "Places", "Objects"];

// How a figure stands while making a sound: the activity is the caption, the
// pose is how it's drawn.
export type Pose = "stand" | "walk" | "talk" | "sit" | "back" | "umbrella" | "lean";

export interface SoundDef {
  id: SoundId;
  label: string;
  category: SoundCategory;
  activity: string;
  pose: Pose;
}

export const SOUNDS: Record<SoundId, SoundDef> = {
  "lift-ding": { id: "lift-ding", label: "Lift chime", category: "Places", activity: "waits for the lift", pose: "stand" },
  footsteps: { id: "footsteps", label: "Footsteps", category: "Movement", activity: "walks through", pose: "walk" },
  "quiet-talk": { id: "quiet-talk", label: "Quiet talk", category: "People", activity: "talks quietly", pose: "talk" },
  typing: { id: "typing", label: "Laptop typing", category: "People", activity: "studies on a laptop", pose: "stand" },
  "page-turn": { id: "page-turn", label: "Turning pages", category: "Objects", activity: "reads", pose: "stand" },
  "cup-down": { id: "cup-down", label: "Cup on a table", category: "Objects", activity: "sets a cup down", pose: "stand" },
  "microwave-hum": { id: "microwave-hum", label: "Microwave hum", category: "Places", activity: "heats lunch", pose: "back" },
  "microwave-beep": { id: "microwave-beep", label: "Microwave beep", category: "Places", activity: "takes lunch out", pose: "back" },
  "running-water": { id: "running-water", label: "Tap running", category: "Places", activity: "fills a bottle", pose: "back" },
  "bin-drop": { id: "bin-drop", label: "Recycling drop", category: "Objects", activity: "sorts a cup into the bins", pose: "lean" },
  birdsong: { id: "birdsong", label: "Birdsong", category: "Nature", activity: "stops to listen", pose: "stand" },
  wind: { id: "wind", label: "Wind", category: "Nature", activity: "pulls a jacket closer", pose: "stand" },
  bicycle: { id: "bicycle", label: "Bicycle bell", category: "Movement", activity: "wheels a bike past", pose: "walk" },
  rain: { id: "rain", label: "Rain", category: "Nature", activity: "waits under an umbrella", pose: "umbrella" },
  "puddle-steps": { id: "puddle-steps", label: "Steps in puddles", category: "Movement", activity: "hurries for the doors", pose: "walk" },
  "door-slide": { id: "door-slide", label: "Sliding doors", category: "Places", activity: "goes through the doors", pose: "walk" },
  espresso: { id: "espresso", label: "Espresso machine", category: "Places", activity: "makes a coffee", pose: "back" },
  grinder: { id: "grinder", label: "Coffee grinder", category: "Objects", activity: "grinds beans", pose: "back" },
  cups: { id: "cups", label: "Cups and saucers", category: "Objects", activity: "clears cups", pose: "stand" },
  chatter: { id: "chatter", label: "Café chatter", category: "People", activity: "chats over coffee", pose: "talk" },
};

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

export interface Anchor {
  id: string;
  label: string;
  // the marker, in fractions of the photo
  x: number;
  y: number;
  // where a figure making this sound puts its feet (a floor point in the
  // photo), and optionally the floor line its size is taken from when it sits
  // above the floor
  stand: { x: number; y: number; depth?: number; pose?: Pose };
  sounds: SoundId[];
}

export interface ShotLink {
  to: string; // a shot in the same scene, or "<sceneId>/<shotId>"
  label: string;
  x: number;
  y: number;
}

export interface Shot {
  id: string;
  title: string;
  image: string | null; // /scenes/<file>.webp, or null for a placeholder
  thumb: string | null;
  aspect: number; // width / height
  evidence: string; // which of Wen's photos this is, and what it shows
  // The eye line in the photo, as a fraction of its height. A figure whose
  // feet are at y is (y - horizon) * FIGURE_SCALE tall: the photos were taken
  // standing (camera ≈ 1.5 m), so an adult (≈ 1.7 m) is ≈ 1.13 × the gap
  // between their feet and the horizon. Read off each photo from things of
  // known size (lift doors ≈ 2.1 m, stair risers ≈ 17 cm, counter ≈ 0.9 m).
  horizon: number;
  anchors: Anchor[];
  links: ShotLink[];
}

export interface Mode {
  id: string;
  label: string;
  // shown under the scene: what the picture is, honestly
  note: string;
  ambience: "room" | "birds" | "crowd" | "rain" | "cafe";
}

export interface Scene {
  id: string;
  title: string;
  kind: "indoor" | "outdoor";
  summary: string;
  evidence: "photo" | "placeholder";
  modes: Mode[];
  shots: Shot[];
}

export const FIGURE_SCALE = 1.13;

export const SCENES: Scene[] = [
  {
    id: "marie-reay-ground",
    title: "Marie Reay — Ground Floor",
    kind: "indoor",
    summary: "Three lifts in a timber wall, an orange stair, tiered seats and a tea point.",
    evidence: "photo",
    modes: [{ id: "everyday", label: "Everyday", note: "", ambience: "room" }],
    shots: [
      {
        id: "lift-wall",
        title: "Lift lobby",
        image: "/scenes/marie-lift-wall.webp",
        thumb: "/scenes/marie-lift-wall-thumb.webp",
        aspect: 1152 / 1536,
        evidence: "IMG_8100: three lifts in the timber wall, high table and stools, recycling bins, the orange stair's side at right",
        horizon: 0.49,
        anchors: [
          { id: "lifts", label: "Lifts", x: 0.47, y: 0.52, stand: { x: 0.45, y: 0.64 }, sounds: ["lift-ding", "footsteps", "quiet-talk"] },
          { id: "high-table", label: "High table", x: 0.17, y: 0.56, stand: { x: 0.33, y: 0.71 }, sounds: ["typing", "page-turn", "cup-down", "quiet-talk"] },
          { id: "bins", label: "Recycling bins", x: 0.8, y: 0.58, stand: { x: 0.74, y: 0.66 }, sounds: ["bin-drop", "footsteps"] },
          { id: "lobby-floor", label: "Lobby floor", x: 0.55, y: 0.76, stand: { x: 0.6, y: 0.84 }, sounds: ["footsteps", "quiet-talk"] },
        ],
        links: [
          { to: "lift-detail", label: "Closer to the lifts", x: 0.47, y: 0.4 },
          { to: "stair-front", label: "The orange stair", x: 0.93, y: 0.47 },
          { to: "tea-point", label: "Turn round: the tea point faces the bins", x: 0.8, y: 0.93 },
          { to: "entry", label: "Towards the entrance", x: 0.06, y: 0.47 },
        ],
      },
      {
        id: "lift-detail",
        title: "Lifts",
        image: "/scenes/marie-lift-detail.webp",
        thumb: "/scenes/marie-lift-detail-thumb.webp",
        aspect: 1536 / 1152,
        evidence: "IMG_8113: the three lift doors, floor indicators, call buttons and level directory",
        horizon: 0.495,
        anchors: [
          { id: "lift-1", label: "Left lift", x: 0.2, y: 0.53, stand: { x: 0.2, y: 0.7 }, sounds: ["lift-ding", "footsteps"] },
          { id: "lift-2", label: "Middle lift", x: 0.355, y: 0.55, stand: { x: 0.34, y: 0.75 }, sounds: ["lift-ding", "quiet-talk"] },
          { id: "lift-3", label: "Right lift", x: 0.69, y: 0.58, stand: { x: 0.72, y: 0.86 }, sounds: ["lift-ding", "quiet-talk"] },
        ],
        links: [{ to: "lift-wall", label: "Back to the lobby", x: 0.07, y: 0.6 }],
      },
      {
        id: "stair-front",
        title: "Orange stair",
        image: "/scenes/marie-stair-front.webp",
        thumb: "/scenes/marie-stair-front-thumb.webp",
        aspect: 1152 / 1536,
        evidence: "IMG_8104: the orange stair head-on, timber walls and handrails; the lobby's bins and FINISH HERE sign at left",
        horizon: 0.46,
        anchors: [
          { id: "stair-steps", label: "Orange stair", x: 0.52, y: 0.5, stand: { x: 0.5, y: 0.77 }, sounds: ["footsteps", "quiet-talk"] },
          { id: "stair-bins", label: "Recycling bins", x: 0.09, y: 0.66, stand: { x: 0.22, y: 0.8 }, sounds: ["bin-drop"] },
        ],
        links: [
          { to: "stairs", label: "Step back: stair and tiered seats", x: 0.88, y: 0.66 },
          { to: "lift-wall", label: "Back to the lifts", x: 0.06, y: 0.9 },
        ],
      },
      {
        id: "stairs",
        title: "Stair and tiered seats",
        image: "/scenes/marie-stairs.webp",
        thumb: "/scenes/marie-stairs-thumb.webp",
        aspect: 1536 / 1152,
        evidence: "IMG_8106: orange stair on the left, timber tiered seats with green and yellow cushions on the right",
        horizon: 0.49,
        anchors: [
          { id: "orange-stair", label: "Foot of the stair", x: 0.2, y: 0.6, stand: { x: 0.26, y: 0.85 }, sounds: ["footsteps", "quiet-talk"] },
          { id: "tiered-seats", label: "Tiered seats", x: 0.74, y: 0.58, stand: { x: 0.72, y: 0.695, depth: 0.79, pose: "sit" }, sounds: ["quiet-talk", "typing", "page-turn"] },
          { id: "passage", label: "Passage under the stair", x: 0.38, y: 0.6, stand: { x: 0.4, y: 0.8 }, sounds: ["footsteps"] },
        ],
        links: [
          { to: "stair-front", label: "Face the stair", x: 0.08, y: 0.4 },
          { to: "lift-wall", label: "Back to the lifts", x: 0.5, y: 0.93 },
        ],
      },
      {
        id: "tea-point",
        title: "Tea point",
        image: "/scenes/marie-tea-point.webp",
        thumb: "/scenes/marie-tea-point-thumb.webp",
        aspect: 1152 / 1536,
        evidence: "IMG_8101: dark cabinet with four microwaves, sink and tap at left. Wen: it faces the bins.",
        horizon: 0.47,
        anchors: [
          { id: "microwaves", label: "Microwaves", x: 0.6, y: 0.52, stand: { x: 0.62, y: 1.06 }, sounds: ["microwave-hum", "microwave-beep"] },
          { id: "sink", label: "Sink", x: 0.14, y: 0.62, stand: { x: 0.17, y: 1.06 }, sounds: ["running-water"] },
        ],
        links: [{ to: "lift-wall", label: "Turn round to the bins", x: 0.93, y: 0.92 }],
      },
      {
        id: "entry",
        title: "Entrance from the Chifley bridge",
        image: "/scenes/marie-entry.webp",
        thumb: "/scenes/marie-entry-thumb.webp",
        aspect: 1152 / 1536,
        evidence: "IMG_8098: inside the door off the Chifley bridge (Wen confirmed), striped mat, tables beyond",
        horizon: 0.49,
        anchors: [
          { id: "doormat", label: "Entrance mat", x: 0.5, y: 0.8, stand: { x: 0.56, y: 0.9 }, sounds: ["footsteps", "door-slide"] },
          { id: "far-tables", label: "Tables beyond", x: 0.6, y: 0.52, stand: { x: 0.62, y: 0.6 }, sounds: ["quiet-talk", "typing", "cup-down"] },
        ],
        links: [
          { to: "lift-wall", label: "Into the lobby", x: 0.75, y: 0.44 },
          { to: "chifley-path/bridge", label: "Out to the Chifley bridge", x: 0.18, y: 0.93 },
        ],
      },
    ],
  },
  {
    id: "chifley-path",
    title: "Chifley Bridge",
    kind: "outdoor",
    summary: "The bridge from Kambri to the J.B. Chifley Library doors.",
    evidence: "photo",
    modes: [
      { id: "morning", label: "Early Morning", note: "Morning light is a colour grade over Wen's night photo, not a morning photograph.", ambience: "birds" },
      { id: "weekday", label: "Busy Weekday", note: "Daylight is a colour grade over Wen's night photo, not a daytime photograph.", ambience: "crowd" },
      { id: "rainy-dusk", label: "Rainy Dusk", note: "Wen's photo, taken after rain; the falling rain is added.", ambience: "rain" },
    ],
    shots: [
      {
        id: "bridge",
        title: "Bridge to the library",
        image: "/scenes/chifley-bridge.webp",
        thumb: "/scenes/chifley-bridge-thumb.webp",
        aspect: 1600 / 1200,
        evidence: "IMG_8114: J.B. Chifley Library entrance, the bridge and its railings, lamp post; Marie Reay's door at right",
        horizon: 0.6,
        anchors: [
          { id: "library-doors", label: "Library doors", x: 0.47, y: 0.61, stand: { x: 0.47, y: 0.69 }, sounds: ["door-slide", "footsteps", "quiet-talk"] },
          { id: "bridge-deck", label: "Bridge", x: 0.38, y: 0.73, stand: { x: 0.37, y: 0.8 }, sounds: ["footsteps", "bicycle", "puddle-steps", "quiet-talk"] },
          { id: "paving", label: "Paving", x: 0.47, y: 0.9, stand: { x: 0.3, y: 0.97 }, sounds: ["footsteps", "bicycle", "puddle-steps", "rain"] },
          { id: "lamp-post", label: "Lamp post", x: 0.61, y: 0.4, stand: { x: 0.57, y: 0.8 }, sounds: ["wind", "birdsong", "rain"] },
          { id: "marie-door", label: "Marie Reay door", x: 0.86, y: 0.66, stand: { x: 0.79, y: 0.83 }, sounds: ["door-slide", "footsteps"] },
        ],
        links: [{ to: "marie-reay-ground/entry", label: "Into Marie Reay", x: 0.86, y: 0.5 }],
      },
    ],
  },
  {
    id: "lab-cafe",
    title: "LAB ANU",
    kind: "indoor",
    summary: "The café in Kambri's Di Riddell Student Centre. Reference photos pending.",
    evidence: "placeholder",
    modes: [{ id: "everyday", label: "Everyday", note: "Placeholder drawing. Where the counter sits relative to the door is not yet known.", ambience: "cafe" }],
    shots: [
      {
        id: "counter",
        title: "Café (placeholder)",
        image: null,
        thumb: null,
        aspect: 4 / 3,
        evidence: "No licensed photo yet. This layout is a placeholder, not LAB ANU's real layout.",
        horizon: 0.5,
        anchors: [
          { id: "coffee-machine", label: "Espresso machine", x: 0.3, y: 0.5, stand: { x: 0.3, y: 0.78, pose: "back" }, sounds: ["espresso", "grinder"] },
          { id: "counter-top", label: "Counter", x: 0.55, y: 0.56, stand: { x: 0.56, y: 0.84 }, sounds: ["cups", "chatter"] },
          { id: "tables", label: "Tables", x: 0.82, y: 0.7, stand: { x: 0.84, y: 0.92 }, sounds: ["chatter", "typing", "cups"] },
        ],
        links: [],
      },
    ],
  },
];

export const SESSION_MS = 180_000;
// A place holds at most this many sounds at once, so a crowd can't turn it
// into noise; one person at most PER_PERSON of them.
export const MAX_SOUNDS = 12;
export const PER_PERSON = 4;

export function findScene(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

export function findMode(scene: Scene, mode: string): Mode | undefined {
  return scene.modes.find((m) => m.id === mode);
}

export function findShot(scene: Scene, shotId: string): Shot | undefined {
  return scene.shots.find((s) => s.id === shotId);
}

export function findAnchor(scene: Scene, shotId: string, anchorId: string): Anchor | undefined {
  return findShot(scene, shotId)?.anchors.find((a) => a.id === anchorId);
}

export type PlaceCheck =
  | { ok: true; anchor: Anchor }
  | { ok: false; code: "unknown_sound" | "unknown_anchor" | "wrong_place" };

// Whether this sound may go at this anchor. The server enforces it; the
// client asks first so it can say why before sending anything.
export function checkPlace(sceneId: string, shotId: string, anchorId: string, soundId: string): PlaceCheck {
  const scene = findScene(sceneId);
  const anchor = scene && findAnchor(scene, shotId, anchorId);
  if (!(soundId in SOUNDS)) return { ok: false, code: "unknown_sound" };
  if (!anchor) return { ok: false, code: "unknown_anchor" };
  if (!anchor.sounds.includes(soundId as SoundId)) return { ok: false, code: "wrong_place" };
  return { ok: true, anchor };
}

// Sounds that may go somewhere in this scene, in catalogue order.
export function soundsIn(scene: Scene): SoundId[] {
  const used = new Set(scene.shots.flatMap((s) => s.anchors.flatMap((a) => a.sounds)));
  return SOUND_IDS.filter((id) => used.has(id));
}

// The nth sound at one anchor sits a little beside the others, so several
// people's sounds at the lifts don't hide each other.
export function spotFor(anchor: Anchor, index: number): { x: number; y: number; pan: number } {
  const dx = [0, 0.045, -0.045, 0.09, -0.09, 0.02][index % 6];
  const dy = Math.floor(index / 6) * 0.035;
  const x = Math.min(0.98, Math.max(0.02, anchor.x + dx));
  const y = Math.min(0.98, Math.max(0.02, anchor.y + dy));
  return { x, y, pan: panFor(x) };
}

export function panFor(x: number): number {
  return Math.round(Math.min(1, Math.max(-1, (x - 0.5) * 1.6)) * 100) / 100;
}

// One live place is a scene in one mode: Chifley at dusk and Chifley in the
// morning are different rooms with different people and sounds.
export function roomKey(sceneId: string, mode: string): string {
  return `${sceneId}:${mode}`;
}

export function figureHeight(shot: Shot, floorY: number): number {
  return Math.max(0.04, (floorY - shot.horizon) * FIGURE_SCALE);
}
