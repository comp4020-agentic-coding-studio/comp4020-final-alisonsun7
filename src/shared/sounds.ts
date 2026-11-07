// The sounds people can leave in the place (ADR 011), and the rules about
// where. Shared by server (validation) and client (drawing, playing), so the
// two can't disagree.
//
// Recordings are Wikimedia Commons CC0/public domain derivatives. The three
// chorus-* parts are original project scores rendered without sampled music.
// Both forms are listed in public/assets-manifest.json.

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
  { id: "children-playing", label: "Children playing", family: "anthrophony", zones: ["beach"] },
  { id: "toilet-flush", label: "Toilet flushing", family: "anthrophony", zones: ["boardwalk"] },
  { id: "shower", label: "Someone showering", family: "anthrophony", zones: ["boardwalk"] },
  { id: "cafe-chatter", label: "Café chatter", family: "anthrophony", zones: ["boardwalk", "counter", "tables", "window"] },
  { id: "espresso", label: "Espresso machine", family: "anthrophony", zones: ["counter", "tables"] },
  { id: "cafe-music", label: "Café music", family: "anthrophony", zones: ["tables", "window", "counter"] },
  { id: "guitar", label: "Someone playing guitar", family: "anthrophony", zones: ["boardwalk", "beach", "pier"] },
  { id: "coastal-gulls", label: "Seagulls", family: "biophony", zones: ["beach", "pier"] },
  { id: "gentle-breeze", label: "Breeze and birds", family: "geophony", zones: ["forest", "forest-edge", "creek"] },
  { id: "summer-cicadas", label: "Summer cicadas", family: "biophony", zones: ["forest", "forest-edge"] },
  { id: "bicycle-bell", label: "Bicycle bell", family: "anthrophony", zones: ["boardwalk", "forest-edge"] },
  { id: "cafe-dishes", label: "Cups and dishes", family: "anthrophony", zones: ["counter", "tables", "window"] },
  { id: "harbour-boat", label: "Boat by the pier", family: "anthrophony", zones: ["pier", "beach"] },
  { id: "rainstick", label: "A softly turning rainstick", family: "anthrophony", zones: ["forest", "creek", "window", "beach"] },
  { id: "hand-claps", label: "Hand-clap rhythm", family: "anthrophony", zones: ["boardwalk", "beach", "tables", "pier"] },
  { id: "chorus-chords", label: "Warm chords", family: "anthrophony", zones: ["green", "stage"] },
  { id: "chorus-pulse", label: "Soft pulse", family: "anthrophony", zones: ["green", "stage"] },
  { id: "chorus-bells", label: "Little bell notes", family: "anthrophony", zones: ["green", "stage", "reading"] },
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
