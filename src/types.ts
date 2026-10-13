// Shared between server and client so the wire shape can't drift.

export const NOTES = ["C4", "D4", "E4", "G4", "A4"] as const;
export type Note = (typeof NOTES)[number];

export const INSTRUMENTS = ["piano", "guitar", "saxophone"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const ROWS = 6;
export const COLS = 6;
export const STEP_MS = 400;

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
