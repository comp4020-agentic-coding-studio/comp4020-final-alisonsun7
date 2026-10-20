// Shared between server and client so the wire shape can't drift.

export const NOTES = ["C4", "D4", "E4", "G4", "A4"] as const;
export type Note = (typeof NOTES)[number];

export const INSTRUMENTS = ["piano", "guitar", "saxophone"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const ROWS = 6;
export const COLS = 6;
export const STEP_MS = 400;
export const LOOP_MS = COLS * STEP_MS;

export type Cell = Note | null;

export interface Activity {
  id: number;
  nickname: string;
  text: string;
  at: string;
}

// The whole garden. Sent in full on connect and after every mutation, so a
// reconnecting client never depends on events it missed.
export interface GardenState {
  version: number;
  grid: Cell[][]; // grid[row][col]
  instrument: Instrument;
  online: number;
  activity: Activity[];
}

// What a visitor sees before joining: the music and how many are here, but no
// nicknames, since they haven't chosen to take part yet.
export type PreviewState = Pick<GardenState, "version" | "grid" | "instrument" | "online">;

// Shared wording so the server-rendered welcome page and its live updates say
// the same thing.
export function crowdLine(online: number): string {
  if (online === 0) return "Nobody's here right now. Be the first to plant a note";
  return `${online} ${online === 1 ? "person is" : "people are"} creating right now`;
}

// "0:01.2": minutes, seconds and tenths, for the timeline's clock.
export function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

export function gardenLine(grid: Cell[][], instrument: Instrument): string {
  const notes = grid.flat().filter((n) => n !== null).length;
  if (notes === 0) return "The grid is empty, waiting for its first note";
  const name = instrument[0].toUpperCase() + instrument.slice(1);
  return `${notes} ${notes === 1 ? "note" : "notes"} in the garden · playing on ${name}`;
}
