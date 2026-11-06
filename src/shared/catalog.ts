// The places, their times of day and the parts of each you can go to.
// Shared by server (validation) and client (drawing), so the two can't
// disagree about what exists.
//
// The sounds people can leave in a place are in shared/sounds.ts (ADR 011).

export interface Mode {
  id: string;
  label: string;
}

// A part of a place you can go to ("Go to"): where it puts you, which way
// you face (radians, 0 = north), and whether it's indoors.
export interface Zone {
  id: string;
  title: string;
  description: string;
  inside: boolean;
  spawn: { x: number; z: number; yaw: number };
}

export interface Scene {
  id: string;
  title: string;
  summary: string;
  // what the place is, honestly, shown under it
  about: string;
  modes: Mode[];
  // times of day the place had once: old links to them open the first mode
  retiredModes: string[];
  // The mode the place's one room was first made under (ADR 007), kept as its
  // name in the database so the room keeps its people and their sounds.
  room: string;
  zones: Zone[];
}

// ---- From the forest to the sea (ADR 006) -----------------------------------
//
// One imagined place, laid out in client/seaside.ts: a trail through a pine
// forest, a creek and footbridge, then a boardwalk with the café, a fish
// and chip kiosk and beach huts, the sand, the sea and a pier. Metres, the sea to the south.

const zone = (id: string, title: string, description: string, inside: boolean, spawn: Zone["spawn"]): Zone => ({ id, title, description, inside, spawn });

const SEASIDE: Scene = {
  id: "seaside",
  title: "From the Forest to the Sea",
  summary: "Start on a trail through a pine forest, cross the creek, and come out by the sea: a boardwalk with a café, a fish and chip kiosk and beach huts, the sand, and a pier.",
  about: "An imagined place, not a real one. Ground, sand, timber, furniture, plants and skies are free CC0 assets from Poly Haven; the trees and buildings are drawn from simple shapes. The sounds are CC0 or public-domain recordings from Wikimedia Commons.",
  // One canonical route; the shared environment now controls its weather
  // and light (ADR 018). Retired routes still lead to this same room.
  modes: [{ id: "weekday", label: "Shared world" }],
  retiredModes: ["morning", "rainy-dusk"],
  room: "morning",
  zones: [
    zone("forest", "Forest trail", "Where the trail starts, among tall pines, ferns and fallen needles.", false, { x: 0, z: -130, yaw: Math.PI }),
    zone("creek", "Creek and footbridge", "A creek about twelve metres wide across the trail, crossed on a long timber footbridge.", false, { x: -1.7, z: -82, yaw: Math.PI }),
    zone("forest-edge", "Edge of the forest", "The trees thin out and the ground turns to sand and grass.", false, { x: 1, z: -38, yaw: Math.PI }),
    zone("boardwalk", "Boardwalk", "A timber boardwalk along the shore: the café, a fish and chip kiosk, toilets, showers and a souvenir shop, lamps and benches.", false, { x: -11, z: 0, yaw: Math.PI / 2 }),
    zone("counter", "Café counter", "Inside the café: the espresso cart, the counter with pastries and the till.", true, { x: -15.8, z: -9.4, yaw: 0.45 }),
    zone("tables", "Café tables", "Round tables with wooden chairs under hanging lamps.", true, { x: -17, z: -6.2, yaw: 0.6 }),
    zone("window", "Café window", "A bar along the café's glass front, looking out over the boardwalk to the sea.", true, { x: -17, z: -5.4, yaw: Math.PI }),
    zone("beach", "Beach", "The sand down to the water, a lifeguard tower, rocks at the tideline.", false, { x: 4, z: 19, yaw: Math.PI - 0.3 }),
    zone("pier", "Pier", "A timber pier on posts, out over the water.", false, { x: -32.5, z: 8, yaw: Math.PI }),
  ],
};

export const SCENES: Scene[] = [SEASIDE];

export function findScene(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

export function findMode(scene: Scene, mode: string): Mode | undefined {
  return scene.modes.find((m) => m.id === mode);
}

// A mode, or the first if it names one that was retired (ADR 012), so an
// old link or an old open page still finds the place.
export function liveMode(scene: Scene, mode: string): Mode | undefined {
  return findMode(scene, mode) ?? (scene.retiredModes.includes(mode) ? scene.modes[0] : undefined);
}

export function findZone(scene: Scene, zoneId: string): Zone | undefined {
  return scene.zones.find((z) => z.id === zoneId);
}

// A place is one world whatever the time of day: every mode shares one room
// (ADR 007), still named for the mode it was first made under.
export function placeMode(sceneId: string, mode: string): string {
  return findScene(sceneId)?.room ?? mode;
}

// Everyone in one place, at any time of day, is in one room.
export function roomKey(sceneId: string, mode: string): string {
  return `${sceneId}:${placeMode(sceneId, mode)}`;
}
