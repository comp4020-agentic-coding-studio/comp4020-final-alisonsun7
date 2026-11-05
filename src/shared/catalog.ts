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
  | "chatter"
  | "waves"
  | "seagulls"
  | "leaves"
  | "woodpecker"
  | "creek";

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
  waves: { id: "waves", label: "Waves", category: "Nature", activity: "watches the waves come in", pose: "stand" },
  seagulls: { id: "seagulls", label: "Seagulls", category: "Nature", activity: "looks up at the gulls", pose: "stand" },
  leaves: { id: "leaves", label: "Rustling leaves", category: "Nature", activity: "walks through the leaves", pose: "walk" },
  woodpecker: { id: "woodpecker", label: "Woodpecker", category: "Nature", activity: "listens for the woodpecker", pose: "stand" },
  creek: { id: "creek", label: "Creek", category: "Nature", activity: "stops by the water", pose: "stand" },
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
  // In the walkable world only: where the spot is, in metres (x east, y up,
  // z south), and where a figure making its sound stands. x/y above are then
  // the spot's place on the map, so stored placements still fit 0..1.
  at?: { x: number; y: number; z: number };
  foot?: { x: number; z: number; y?: number; facing?: number };
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
  // In the walkable world, a shot is a zone you can walk to: where "Go to"
  // puts you, which way you face (radians, 0 = north), and whether it's
  // indoors (sound through the walls is muffled).
  spawn?: { x: number; z: number; yaw: number };
  inside?: boolean;
}

export interface Mode {
  id: string;
  label: string;
  // shown under the scene: what the picture is, honestly
  note: string;
  ambience: "room" | "birds" | "crowd" | "rain" | "cafe" | "forest" | "sea";
}

export interface Scene {
  id: string;
  title: string;
  kind: "indoor" | "outdoor";
  summary: string;
  evidence: "photo" | "placeholder";
  modes: Mode[];
  shots: Shot[];
  // "photo": shots are Wen's photos. "world": one drawn, walkable place
  // (ADR 004); its shots are zones and its anchors have positions in metres.
  view?: "photo" | "world";
  // how many sounds the place holds at once (default MAX_SOUNDS)
  maxSounds?: number;
  // old photo scenes stay so their memories still replay, but aren't listed
  retired?: boolean;
  // what the place is, honestly, shown under it
  about?: string;
  // the background indoors, when it isn't plain room tone
  indoorAmbience?: Mode["ambience"];
  // A living place (ADR 007): one shared world for every time of day, whose
  // sounds stay until someone removes them. No 3-minute memories; anyone may
  // change a sound's volume (only its owner may remove it); a spot holds
  // SPOT_MAX sounds; a person's newest sound replaces their oldest.
  living?: boolean;
}

export const FIGURE_SCALE = 1.13;

// ---- The walkable world (ADR 004) -----------------------------------------
//
// One drawn place you walk through: the Chifley bridge, Marie Reay's door,
// and its ground floor. The layout follows Wen's sketch of the floor (door
// bottom left, corridor up the left side, two tables, three lifts facing the
// tables, bins at the end of the lift wall, the tea point facing the bins,
// the stair top right, a hall) and the bridge photo (Marie Reay's door on
// your right as you face the library). Sizes are estimates, not a survey,
// and the page says so.

// The map's extent in metres, so a spot's map position fits 0..1.
export const WORLD_BOUNDS = { minX: -26, maxX: 38, minZ: -2, maxZ: 44 };

function spot(
  id: string,
  label: string,
  at: { x: number; y: number; z: number },
  foot: { x: number; z: number; y?: number; facing?: number; pose?: Pose },
  sounds: SoundId[],
  b: { minX: number; maxX: number; minZ: number; maxZ: number } = WORLD_BOUNDS,
): Anchor {
  const fx = (v: number): number => Math.round(((v - b.minX) / (b.maxX - b.minX)) * 1000) / 1000;
  const fz = (v: number): number => Math.round(((v - b.minZ) / (b.maxZ - b.minZ)) * 1000) / 1000;
  return {
    id,
    label,
    x: fx(at.x),
    y: fz(at.z),
    stand: { x: fx(foot.x), y: fz(foot.z), pose: foot.pose },
    sounds,
    at,
    foot: { x: foot.x, z: foot.z, y: foot.y, facing: foot.facing },
  };
}

const WORLD: Scene = {
  id: "campus",
  retired: true,
  about: "A drawn place, not a survey: the layout follows Wen's sketch and photos, and sizes and distances are estimates.",
  title: "Chifley Bridge & Marie Reay",
  kind: "outdoor",
  summary: "Walk from the Chifley bridge through Marie Reay's door: lifts, an orange stair, tiered seats and a tea point.",
  evidence: "photo",
  view: "world",
  maxSounds: 24,
  modes: [
    { id: "morning", label: "Early Morning", note: "", ambience: "birds" },
    { id: "weekday", label: "Busy Weekday", note: "", ambience: "crowd" },
    { id: "rainy-dusk", label: "Rainy Dusk", note: "", ambience: "rain" },
  ],
  shots: [
    {
      id: "bridge",
      title: "Chifley bridge",
      image: null,
      thumb: "/scenes/chifley-bridge-thumb.webp",
      aspect: 4 / 3,
      evidence: "Drawn from IMG_8114: the bridge, its railings and lamp post, the library doors ahead, Marie Reay's door on the right",
      horizon: 0.5,
      inside: false,
      spawn: { x: 9, z: 37, yaw: Math.PI / 2 - 0.12 },
      anchors: [
        spot("library-doors", "Library doors", { x: -21.4, y: 1.4, z: 34 }, { x: -19.6, z: 34.6 }, ["door-slide", "footsteps", "quiet-talk"]),
        spot("bridge-deck", "Bridge", { x: -12, y: 1.1, z: 34 }, { x: -12, z: 33.2, pose: "walk" }, ["footsteps", "bicycle", "puddle-steps", "quiet-talk"]),
        spot("paving", "Paving", { x: 2, y: 0.7, z: 38 }, { x: 2.6, z: 38.8 }, ["footsteps", "bicycle", "puddle-steps", "rain"]),
        spot("lamp-post", "Lamp post", { x: -1, y: 2.6, z: 31.6 }, { x: -0.2, z: 32.6 }, ["wind", "birdsong", "rain"]),
        spot("marie-door", "Marie Reay door", { x: 4.5, y: 1.6, z: 30.7 }, { x: 6, z: 31.6 }, ["door-slide", "footsteps"]),
      ],
      links: [],
    },
    {
      id: "entry",
      title: "Entrance corridor",
      image: null,
      thumb: "/scenes/marie-entry-thumb.webp",
      aspect: 4 / 3,
      evidence: "Drawn from IMG_8098: the striped mat inside the door, glass on the left, timber on the right, tables beyond",
      horizon: 0.5,
      inside: true,
      spawn: { x: 4.5, z: 28.6, yaw: 0 },
      anchors: [
        spot("doormat", "Entrance mat", { x: 4.5, y: 0.5, z: 27.4 }, { x: 5.4, z: 26.6 }, ["footsteps", "door-slide"]),
        spot("corridor", "Corridor", { x: 2.4, y: 1.2, z: 23.6 }, { x: 3, z: 23, pose: "walk" }, ["footsteps", "quiet-talk"]),
      ],
      links: [],
    },
    {
      id: "lobby",
      title: "Lifts and tables",
      image: null,
      thumb: "/scenes/marie-lift-wall-thumb.webp",
      aspect: 4 / 3,
      evidence: "Drawn from IMG_8100 and IMG_8113: three lifts in a timber wall, the high tables and stools, the recycling bins",
      horizon: 0.5,
      inside: true,
      spawn: { x: 5, z: 19.5, yaw: -0.75 },
      anchors: [
        spot("high-table", "High table", { x: 5.8, y: 1.25, z: 10 }, { x: 5.8, z: 11.1, facing: 0 }, ["typing", "page-turn", "cup-down", "quiet-talk"]),
        spot("long-table", "Long table", { x: 5.8, y: 1.25, z: 14.2 }, { x: 5.2, z: 15.3, facing: 0 }, ["typing", "page-turn", "cup-down", "quiet-talk"]),
        spot("lifts", "Lifts", { x: 14.3, y: 1.6, z: 10.5 }, { x: 12.9, z: 10.6, facing: -Math.PI / 2 }, ["lift-ding", "footsteps", "quiet-talk"]),
        spot("bins", "Recycling bins", { x: 14.4, y: 1.0, z: 16.8 }, { x: 13.2, z: 17.4, pose: "lean" }, ["bin-drop", "footsteps"]),
        spot("lobby-floor", "Lobby floor", { x: 10.5, y: 0.4, z: 18.6 }, { x: 10.8, z: 19.2, pose: "walk" }, ["footsteps", "quiet-talk"]),
        spot("hall-doors", "Hall doors", { x: 23.6, y: 1.5, z: 17.2 }, { x: 22.4, z: 17.6 }, ["door-slide", "footsteps", "quiet-talk"]),
      ],
      links: [],
    },
    {
      id: "tea-point",
      title: "Tea point",
      image: null,
      thumb: "/scenes/marie-tea-point-thumb.webp",
      aspect: 4 / 3,
      evidence: "Drawn from IMG_8101: the dark cabinet with four microwaves, the sink and tap to their left. Wen: it faces the bins.",
      horizon: 0.5,
      inside: true,
      spawn: { x: 15.6, z: 17.4, yaw: Math.PI },
      anchors: [
        spot("microwaves", "Microwaves", { x: 13.6, y: 1.5, z: 21.3 }, { x: 13.6, z: 20.3, facing: Math.PI, pose: "back" }, ["microwave-hum", "microwave-beep"]),
        spot("sink", "Sink", { x: 17.1, y: 1.05, z: 21.3 }, { x: 17.1, z: 20.3, facing: Math.PI, pose: "back" }, ["running-water"]),
      ],
      links: [],
    },
    {
      id: "stairs",
      title: "Orange stair and tiered seats",
      image: null,
      thumb: "/scenes/marie-stairs-thumb.webp",
      aspect: 4 / 3,
      evidence: "Drawn from IMG_8104 and IMG_8106: the orange stair with timber handrails, the tiered seats with green and yellow cushions beside it",
      horizon: 0.5,
      inside: true,
      spawn: { x: 25.5, z: 14.6, yaw: 0.05 },
      anchors: [
        spot("orange-stair", "Orange stair", { x: 23.5, y: 1.0, z: 10.4 }, { x: 23.2, z: 11.2, pose: "walk" }, ["footsteps", "quiet-talk"]),
        spot("tiered-seats", "Tiered seats", { x: 29.5, y: 1.4, z: 7.6 }, { x: 29.5, z: 7.7, y: 0.9, pose: "sit" }, ["quiet-talk", "typing", "page-turn"]),
        spot("seat-foot", "Under the seats", { x: 31.5, y: 0.6, z: 11.2 }, { x: 31.5, z: 11.8 }, ["footsteps", "quiet-talk"]),
      ],
      links: [],
    },
  ],
};

// ---- The corner café (ADR 005) -------------------------------------------
//
// An imagined café, not a real one: built from CC0 models, surfaces and
// skies (Poly Haven), arranged in client/cafe.ts. Metres: the room is
// x 0..14, z 0..10, its glass front on the street at z = 10.
const CAFE: Scene = {
  id: "cafe",
  retired: true,
  title: "The Corner Café",
  kind: "indoor",
  summary: "A small café on a street corner: an espresso cart, a counter, round tables and a bar along the window.",
  evidence: "photo",
  view: "world",
  maxSounds: 24,
  about: "An imagined café, not a real place. Furniture, food, plants, surfaces and skies are free CC0 models from Poly Haven.",
  indoorAmbience: "cafe",
  modes: [
    { id: "morning", label: "Early Morning", note: "", ambience: "birds" },
    { id: "weekday", label: "Busy Lunch", note: "", ambience: "crowd" },
    { id: "rainy-dusk", label: "Rainy Evening", note: "", ambience: "rain" },
  ],
  shots: [
    {
      id: "street",
      title: "The street",
      image: null,
      thumb: null,
      aspect: 4 / 3,
      evidence: "The footpath outside the café's glass front, a street lamp, the road and the buildings opposite.",
      horizon: 0.5,
      inside: false,
      spawn: { x: 9.6, z: 12.6, yaw: 0.25 },
      anchors: [
        spot("footpath", "Footpath", { x: 12, y: 0.6, z: 12 }, { x: 12.6, z: 12.4, pose: "walk" }, ["footsteps", "bicycle", "puddle-steps", "quiet-talk"]),
        spot("street-lamp", "Street lamp", { x: 3, y: 2.6, z: 13.6 }, { x: 3.6, z: 12.9 }, ["wind", "birdsong", "rain"]),
        spot("cafe-door", "Café door", { x: 7, y: 1.7, z: 10.2 }, { x: 8.2, z: 10.9 }, ["door-slide", "footsteps", "rain"]),
      ],
      links: [],
    },
    {
      id: "counter",
      title: "The counter",
      image: null,
      thumb: null,
      aspect: 4 / 3,
      evidence: "The espresso cart, the counter with pastries and the till, steel shelves on the brick wall behind.",
      horizon: 0.5,
      inside: true,
      spawn: { x: 8.2, z: 4.6, yaw: 0.45 },
      anchors: [
        spot("espresso-cart", "Espresso cart", { x: 2.2, y: 1.4, z: 1.6 }, { x: 3.2, z: 2.2, facing: Math.PI / 2, pose: "back" }, ["espresso", "grinder"]),
        spot("pastries", "Pastries", { x: 7, y: 1.25, z: 2.6 }, { x: 7, z: 3.6 }, ["cups", "chatter", "cup-down"]),
        spot("till", "Till", { x: 10.6, y: 1.35, z: 2.6 }, { x: 10.4, z: 3.6 }, ["cups", "chatter"]),
      ],
      links: [],
    },
    {
      id: "tables",
      title: "Tables",
      image: null,
      thumb: null,
      aspect: 4 / 3,
      evidence: "Four round tables with wooden chairs under hanging lamps.",
      horizon: 0.5,
      inside: true,
      spawn: { x: 7, z: 7.8, yaw: 0.6 },
      anchors: [
        spot("corner-table", "Corner table", { x: 2.2, y: 1.0, z: 5.6 }, { x: 2.2, z: 6.35, y: 0.47, pose: "sit" }, ["chatter", "typing", "page-turn", "cup-down", "quiet-talk"]),
        spot("middle-table", "Middle table", { x: 4.6, y: 1.0, z: 6.6 }, { x: 4.6, z: 7.35, y: 0.47, pose: "sit" }, ["chatter", "typing", "page-turn", "cup-down", "quiet-talk"]),
        spot("far-table", "Far table", { x: 11.8, y: 1.0, z: 5.6 }, { x: 11.8, z: 6.35, y: 0.47, pose: "sit" }, ["chatter", "typing", "page-turn", "cup-down", "quiet-talk"]),
      ],
      links: [],
    },
    {
      id: "window",
      title: "Window bar",
      image: null,
      thumb: null,
      aspect: 4 / 3,
      evidence: "A long bar along the shop window, with stools, looking out at the street.",
      horizon: 0.5,
      inside: true,
      spawn: { x: 7, z: 8.6, yaw: Math.PI },
      anchors: [
        spot("window-west", "Window bar", { x: 2.8, y: 1.3, z: 9.6 }, { x: 2.8, z: 8.95, y: 0.75, pose: "sit" }, ["typing", "page-turn", "quiet-talk", "rain"]),
        spot("window-east", "Window seat", { x: 11.2, y: 1.3, z: 9.6 }, { x: 11.2, z: 8.95, y: 0.75, pose: "sit" }, ["rain", "chatter", "cup-down"]),
      ],
      links: [],
    },
  ],
};

// ---- From the forest to the sea (ADR 006) -----------------------------------
//
// One imagined place, laid out in client/seaside.ts: a trail through a pine
// forest, a creek and footbridge, then a boardwalk with the café, a kiosk and
// beach huts, the sand, the sea and a pier. Metres, the sea to the south.
export const SEASIDE_BOUNDS = { minX: -60, maxX: 60, minZ: -160, maxZ: 80 };
const at = (
  id: string,
  label: string,
  pos: { x: number; y: number; z: number },
  foot: { x: number; z: number; y?: number; facing?: number; pose?: Pose },
  sounds: SoundId[],
): Anchor => spot(id, label, pos, foot, sounds, SEASIDE_BOUNDS);
// the café's room sits at x -24, z -14 (its own spots are written in its
// coordinates and moved here)
const inCafe = (id: string, label: string, pos: { x: number; y: number; z: number }, foot: { x: number; z: number; y?: number; facing?: number; pose?: Pose }, sounds: SoundId[]): Anchor =>
  at(id, label, { ...pos, x: pos.x - 24, z: pos.z - 14 }, { ...foot, x: foot.x - 24, z: foot.z - 14 }, sounds);

const zone = (id: string, title: string, evidence: string, inside: boolean, spawn: { x: number; z: number; yaw: number }, anchors: Anchor[]): Shot => ({
  id,
  title,
  image: null,
  thumb: null,
  aspect: 4 / 3,
  evidence,
  horizon: 0.5,
  inside,
  spawn,
  anchors,
  links: [],
});

const SEASIDE: Scene = {
  id: "seaside",
  title: "From the Forest to the Sea",
  kind: "outdoor",
  summary: "Start on a trail through a pine forest, cross the creek, and come out by the sea: a boardwalk with a café, a kiosk and beach huts, the sand, and a pier.",
  evidence: "photo",
  view: "world",
  living: true,
  maxSounds: 72,
  about: "An imagined place, not a real one. Ground, sand, timber, furniture, plants and skies are free CC0 assets from Poly Haven; the trees and buildings are drawn from simple shapes.",
  indoorAmbience: "cafe",
  modes: [
    { id: "morning", label: "Early Morning", note: "", ambience: "forest" },
    { id: "weekday", label: "Sunny Day", note: "", ambience: "sea" },
    { id: "rainy-dusk", label: "Rainy Dusk", note: "", ambience: "rain" },
  ],
  shots: [
    zone("forest", "Forest trail", "Where the trail starts, among tall pines, ferns and fallen needles.", false, { x: 0, z: -130, yaw: Math.PI }, [
      at("trail-start", "Trail", { x: 0.4, y: 0.5, z: -125 }, { x: 1.0, z: -124.4, pose: "walk" }, ["footsteps", "leaves", "quiet-talk"]),
      at("tall-pines", "Tall pines", { x: -4.8, y: 3.4, z: -120.4 }, { x: -3.9, z: -119.8 }, ["birdsong", "wind", "leaves", "woodpecker"]),
      at("clearing-log", "Log in the clearing", { x: -9, y: 0.9, z: -93.7 }, { x: -9, z: -93.2, y: 0.42, pose: "sit" }, ["quiet-talk", "birdsong", "leaves"]),
      at("old-stump", "Old stump", { x: 6, y: 0.9, z: -85.2 }, { x: 5, z: -84 }, ["woodpecker", "leaves", "wind"]),
    ]),
    zone("creek", "Creek and footbridge", "A creek about twelve metres wide across the trail, crossed on a long timber footbridge.", false, { x: -1.7, z: -82, yaw: Math.PI }, [
      at("creek", "Creek", { x: 9, y: 0.1, z: -69 }, { x: 9, z: -62.2 }, ["creek", "leaves"]),
      at("footbridge", "Footbridge", { x: -2, y: 0.8, z: -69 }, { x: -2.2, z: -69.6, pose: "walk" }, ["footsteps", "creek", "quiet-talk"]),
      at("mossy-boulder", "Boulder", { x: -12, y: 1.6, z: -54 }, { x: -10.6, z: -53 }, ["woodpecker", "birdsong", "wind"]),
    ]),
    zone("forest-edge", "Edge of the forest", "The trees thin out and the ground turns to sand and grass.", false, { x: 1, z: -38, yaw: Math.PI }, [
      at("edge-pines", "Last pines", { x: -6, y: 3, z: -30 }, { x: -5, z: -29 }, ["wind", "birdsong", "seagulls"]),
      at("trail-end", "Trail's end", { x: 0.6, y: 0.5, z: -22 }, { x: 1.4, z: -21.4, pose: "walk" }, ["footsteps", "leaves", "quiet-talk"]),
    ]),
    zone("boardwalk", "Boardwalk", "A timber boardwalk along the shore: the café, a kiosk, beach huts, lamps and benches.", false, { x: -3, z: 1.6, yaw: 0.95 }, [
      at("boardwalk", "Boardwalk", { x: 14, y: 0.5, z: 0.5 }, { x: 14.6, z: 0.8, pose: "walk" }, ["footsteps", "bicycle", "puddle-steps", "quiet-talk"]),
      at("kiosk", "Kiosk", { x: 7.7, y: 1.4, z: -4 }, { x: 7.7, z: -3.1 }, ["chatter", "cups", "quiet-talk"]),
      at("beach-huts", "Beach huts", { x: 23.6, y: 1.6, z: -4.4 }, { x: 23.6, z: -3.4 }, ["door-slide", "wind", "quiet-talk"]),
      at("boardwalk-lamp", "Lamp post", { x: -1, y: 3, z: 2.25 }, { x: -1.6, z: 1.3 }, ["wind", "seagulls", "rain"]),
      at("cafe-door", "Café door", { x: -17, y: 1.7, z: -3.8 }, { x: -15.6, z: -3.1 }, ["door-slide", "footsteps", "rain"]),
    ]),
    zone("counter", "Café counter", "Inside the café: the espresso cart, the counter with pastries and the till.", true, { x: -15.8, z: -9.4, yaw: 0.45 }, [
      inCafe("espresso-cart", "Espresso cart", { x: 2.2, y: 1.4, z: 1.6 }, { x: 3.2, z: 2.2, facing: Math.PI / 2, pose: "back" }, ["espresso", "grinder"]),
      inCafe("pastries", "Pastries", { x: 7, y: 1.25, z: 2.6 }, { x: 7, z: 3.6 }, ["cups", "chatter", "cup-down"]),
      inCafe("till", "Till", { x: 10.6, y: 1.35, z: 2.6 }, { x: 10.4, z: 3.6 }, ["cups", "chatter"]),
    ]),
    zone("tables", "Café tables", "Round tables with wooden chairs under hanging lamps.", true, { x: -17, z: -6.2, yaw: 0.6 }, [
      inCafe("corner-table", "Corner table", { x: 2.2, y: 1.0, z: 5.6 }, { x: 2.2, z: 6.35, y: 0.47, pose: "sit" }, ["chatter", "typing", "page-turn", "cup-down", "quiet-talk"]),
      inCafe("far-table", "Far table", { x: 11.8, y: 1.0, z: 5.6 }, { x: 11.8, z: 6.35, y: 0.47, pose: "sit" }, ["chatter", "typing", "page-turn", "cup-down", "quiet-talk"]),
    ]),
    zone("window", "Café window", "A bar along the café's glass front, looking out over the boardwalk to the sea.", true, { x: -17, z: -5.4, yaw: Math.PI }, [
      inCafe("window-west", "Window bar", { x: 2.8, y: 1.3, z: 9.6 }, { x: 2.8, z: 8.95, y: 0.75, pose: "sit" }, ["typing", "page-turn", "quiet-talk", "rain", "waves"]),
    ]),
    zone("beach", "Beach", "The sand down to the water, a lifeguard tower, rocks at the tideline.", false, { x: 4, z: 19, yaw: Math.PI - 0.3 }, [
      at("shoreline", "Water's edge", { x: 6, y: 0.4, z: 30 }, { x: 6.6, z: 29.2 }, ["waves", "seagulls", "footsteps"]),
      at("lifeguard-tower", "Lifeguard tower", { x: 17, y: 3.2, z: 15 }, { x: 18.8, z: 16.2 }, ["seagulls", "wind", "quiet-talk"]),
      at("sand", "Sand", { x: -6, y: 0.4, z: 13 }, { x: -6, z: 13.6 }, ["footsteps", "quiet-talk", "rain"]),
    ]),
    zone("pier", "Pier", "A timber pier on posts, out over the water.", false, { x: -32.5, z: 8, yaw: Math.PI }, [
      at("pier-middle", "Pier", { x: -32.5, y: 1, z: 38 }, { x: -32, z: 38.6 }, ["waves", "footsteps", "wind"]),
      at("pier-end", "End of the pier", { x: -32.5, y: 1.2, z: 68 }, { x: -32.5, z: 67, pose: "back" }, ["waves", "seagulls", "wind"]),
    ]),
  ],
};

export const SCENES: Scene[] = [
  SEASIDE,
  CAFE,
  WORLD,
  {
    id: "marie-reay-ground",
    retired: true,
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
    retired: true,
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
    retired: true,
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

// In a living place, the most sounds one spot holds.
export const SPOT_MAX = 3;

export function isLiving(sceneId: string): boolean {
  return findScene(sceneId)?.living === true;
}

// A living place is one world whatever the time of day: every mode shares
// the first mode's session. Other places keep a session per mode.
export function placeMode(sceneId: string, mode: string): string {
  const scene = findScene(sceneId);
  return scene?.living ? scene.modes[0].id : mode;
}

export function maxSoundsIn(sceneId: string): number {
  return findScene(sceneId)?.maxSounds ?? MAX_SOUNDS;
}

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
  // on the world map a fraction is ~64 m, so spread much less
  const k = anchor.at ? 0.2 : 1;
  const dx = [0, 0.045, -0.045, 0.09, -0.09, 0.02][index % 6] * k;
  const dy = Math.floor(index / 6) * 0.035 * k;
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
  return `${sceneId}:${placeMode(sceneId, mode)}`;
}

export function figureHeight(shot: Shot, floorY: number): number {
  return Math.max(0.04, (floorY - shot.horizon) * FIGURE_SCALE);
}
