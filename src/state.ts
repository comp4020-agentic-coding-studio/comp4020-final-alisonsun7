import type { ServerResponse } from "node:http";
import { GRID_SIZE, type BoardState, type Cell, type Instrument } from "./types.js";

// One shared board for every visitor: no rooms, one process, one truth.
// Simultaneous cell writes are applied in arrival order with no locking —
// the newest one simply overwrites the cell (see
// docs/decisions/001-cell-conflict-resolution.md for why that's the chosen
// behaviour, not an oversight).
const board: BoardState = {
  cells: new Array<Cell>(GRID_SIZE).fill(null),
  instrument: "piano",
  playing: false,
  startedAtMs: null,
  version: 0,
  userCount: 0,
};

const subscribers = new Set<ServerResponse>();

function frame(): string {
  return `data: ${JSON.stringify(board)}\n\n`;
}

function broadcast(): void {
  const payload = frame();
  for (const res of subscribers) res.write(payload);
}

export function getBoard(): BoardState {
  return board;
}

export function subscribe(res: ServerResponse): void {
  subscribers.add(res);
  board.userCount = subscribers.size;
  res.write(frame());
  broadcast(); // let existing sessions see the updated presence count
}

export function unsubscribe(res: ServerResponse): void {
  subscribers.delete(res);
  board.userCount = subscribers.size;
  broadcast();
}

export function setCell(index: number, note: Cell): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) return false;
  board.cells[index] = note;
  board.version++;
  broadcast();
  return true;
}

export function setInstrument(instrument: Instrument): void {
  board.instrument = instrument;
  board.version++;
  broadcast();
}

export function play(): void {
  board.playing = true;
  board.startedAtMs = Date.now();
  board.version++;
  broadcast();
}

export function stop(): void {
  board.playing = false;
  board.startedAtMs = null;
  board.version++;
  broadcast();
}
