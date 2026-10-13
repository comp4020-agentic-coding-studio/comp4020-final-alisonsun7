// Shared between server and client (both compile from src/ with the same
// tsconfig), so the wire shape can never silently drift between them.

export const NOTES = ["do", "re", "mi", "fa", "so"] as const;
export type Note = (typeof NOTES)[number];

export const INSTRUMENTS = ["piano", "guitar", "sax"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const GRID_SIZE = 36;
export const STEP_MS = 350;

export type Cell = Note | null;

// The full board, broadcast to every open session on every mutation. A
// client needs nothing else to render the grid, audibly follow playback in
// sync, or react to another user's instrument switch.
export interface BoardState {
  cells: Cell[];
  instrument: Instrument;
  playing: boolean;
  // Server epoch ms when Play was pressed; null while stopped. A client
  // derives "which step is playing right now" from this plus STEP_MS, so
  // playback stays in sync across sessions without the server ticking.
  startedAtMs: number | null;
  version: number;
  userCount: number;
}
