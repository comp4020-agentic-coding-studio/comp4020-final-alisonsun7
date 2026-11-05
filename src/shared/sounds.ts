// The sounds people can leave in the place (ADR 011), and the rules about
// where. Shared by server (validation) and client (drawing, playing), so the
// two can't disagree.
//
// Each is a recording from Wikimedia Commons, CC0 or public domain, cut into
// a loop by scripts/fetch-sounds.mjs and listed in public/assets-manifest.json.

// What makes a sound, after Bernie Krause: the land and water, animals, or
// people. Each family has a colour, so a place with many kinds of sound is
// a colourful one.
export type Family = "geophony" | "biophony" | "anthrophony";

export const FAMILIES: Record<Family, { label: string; colour: string }> = {
  geophony: { label: "Water and wind", colour: "#5aa9e6" },
  biophony: { label: "Animals", colour: "#7bd389" },
  anthrophony: { label: "People", colour: "#f2a65a" },
};

export interface SoundKind {
  id: string;
  label: string;
  family: Family;
  // the zones it suits; it can still be left anywhere
  zones: string[];
}

export const SOUNDS: SoundKind[] = [
  { id: "evening-forest", label: "Bird sounds", family: "biophony", zones: ["forest"] },
  { id: "trickle", label: "Trickling stream", family: "geophony", zones: ["creek", "forest-edge"] },
  { id: "beach-waves", label: "Waves on the beach", family: "geophony", zones: ["beach", "pier"] },
  { id: "cafe-chatter", label: "Café chatter", family: "anthrophony", zones: ["boardwalk", "counter", "tables", "window"] },
  { id: "espresso", label: "Espresso machine", family: "anthrophony", zones: ["counter", "tables"] },
  { id: "cafe-music", label: "Café music", family: "anthrophony", zones: ["tables", "window", "counter"] },
  { id: "guitar", label: "Someone playing guitar", family: "anthrophony", zones: ["boardwalk", "beach", "pier"] },
];

export const findSound = (id: unknown): SoundKind | undefined => SOUNDS.find((s) => s.id === id);
export const soundUrl = (id: string): string => `/assets/sounds/${id}.mp3`;

// You leave a sound where you stand, and can remove one only from beside it.
export const REACH = 4;
// The same sound twice needs this much room between them.
export const SAME_APART = 4;
// No more than CROWD_MAX sounds within CROWD_RADIUS of each other.
export const CROWD_RADIUS = 10;
export const CROWD_MAX = 6;
// The whole place, so it can't fill without end.
export const PLACE_MAX = 150;
// Sounds further than this aren't played, and at most VOICES at once.
export const HEAR = 40;
export const VOICES = 12;
