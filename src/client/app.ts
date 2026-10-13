import type { BoardState, Cell, Instrument, Note } from "../types.js";
import { GRID_SIZE, NOTES, STEP_MS } from "../types.js";
import { audioNow, playNote, resumeAudio } from "./audio.js";

const grid = document.getElementById("grid")!;
const palette = document.getElementById("palette")!;
const status = document.getElementById("status")!;
const playStop = document.getElementById("play-stop") as HTMLButtonElement;
const instrumentInputs = document.querySelectorAll<HTMLInputElement>('input[name="instrument"]');

const NOTE_LABELS: Record<Note, string> = { do: "Do", re: "Re", mi: "Mi", fa: "Fa", so: "So" };

let selectedNote: Note = NOTES[0];
let board: BoardState | null = null;
let lastPlayedStep = -1;
let schedulerHandle: number | null = null;

function cellColor(note: Cell): string {
  return note ? `var(--note-${note})` : "transparent";
}

function buildPalette(): void {
  for (const note of NOTES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.note = note;
    button.style.setProperty("--swatch-color", `var(--note-${note})`);
    button.textContent = NOTE_LABELS[note];
    button.setAttribute("aria-pressed", String(note === selectedNote));
    button.addEventListener("click", () => {
      selectedNote = note;
      for (const el of palette.querySelectorAll<HTMLButtonElement>(".swatch")) {
        el.setAttribute("aria-pressed", String(el.dataset.note === note));
      }
    });
    palette.appendChild(button);
  }
}

function buildGrid(): void {
  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.setAttribute("role", "gridcell");
    cell.addEventListener("click", () => onCellClick(i));
    grid.appendChild(cell);
  }
}

function onCellClick(index: number): void {
  const current = board?.cells[index] ?? null;
  const next: Cell = current === selectedNote ? null : selectedNote;
  void fetch(`/cells/${index}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: next }),
  });
}

function render(next: BoardState): void {
  board = next;
  const cells = grid.querySelectorAll<HTMLButtonElement>(".cell");
  cells.forEach((cell, i) => {
    cell.style.backgroundColor = cellColor(next.cells[i]);
  });
  for (const input of instrumentInputs) {
    input.checked = input.value === next.instrument;
  }
  playStop.textContent = next.playing ? "Stop" : "Play";
  status.textContent = next.playing
    ? `Playing — ${next.instrument} — ${next.userCount} here`
    : `Stopped — ${next.userCount} here`;
  if (next.playing) startScheduler();
  else stopScheduler();
}

function currentStep(): number {
  if (!board?.playing || board.startedAtMs === null) return -1;
  const elapsed = Date.now() - board.startedAtMs;
  return Math.floor(elapsed / STEP_MS) % GRID_SIZE;
}

function tick(): void {
  if (!board) return;
  const step = currentStep();
  if (step === -1 || step === lastPlayedStep) return;
  lastPlayedStep = step;

  const cells = grid.querySelectorAll<HTMLButtonElement>(".cell");
  cells.forEach((cell, i) => cell.classList.toggle("playing", i === step));

  const note = board.cells[step];
  if (note) playNote(note, board.instrument, audioNow());
}

function startScheduler(): void {
  if (schedulerHandle !== null) return;
  lastPlayedStep = -1;
  schedulerHandle = window.setInterval(tick, 30);
}

function stopScheduler(): void {
  if (schedulerHandle === null) return;
  window.clearInterval(schedulerHandle);
  schedulerHandle = null;
  lastPlayedStep = -1;
  grid.querySelectorAll<HTMLButtonElement>(".cell").forEach((cell) => cell.classList.remove("playing"));
}

playStop.addEventListener("click", () => {
  resumeAudio();
  void fetch(board?.playing ? "/stop" : "/play", { method: "POST" });
});

for (const input of instrumentInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    void fetch("/instrument", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrument: input.value as Instrument }),
    });
  });
}

buildPalette();
buildGrid();

const source = new EventSource("/events");
source.onmessage = (event) => render(JSON.parse(event.data) as BoardState);
source.onerror = () => {
  status.textContent = "Reconnecting…";
};
