import { COLS, LOOP_MS, ROWS, STEP_MS, type Cell, type GardenState, type Instrument, type Note } from "../types.js";
import { audioTime, playNote, unlockAudio } from "./audio.js";
import { createTimeline } from "./timeline.js";

type Tool = Note | "eraser";

const gridEl = document.getElementById("grid")!;
const paletteEl = document.getElementById("palette")!;
const presenceEl = document.getElementById("presence")!;
const presenceText = document.getElementById("presence-text")!;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;
const instrumentBtns = document.querySelectorAll<HTMLButtonElement>(".instrument");
const activityEl = document.getElementById("activity")!;

// Set by the welcome page's turning cover, so the garden lands like the next page.
try {
  if (sessionStorage.getItem("sg-arrive")) {
    sessionStorage.removeItem("sg-arrive");
    document.body.classList.add("arriving");
  }
} catch {
  // storage blocked: no arrival animation, nothing else changes
}

let tool: Tool = "C4";
let state: GardenState | null = null;
const cells: HTMLButtonElement[][] = [];

// --- grid ---------------------------------------------------------------

for (let r = 0; r < ROWS; r++) {
  cells.push([]);
  for (let c = 0; c < COLS; c++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.row = String(r);
    cell.dataset.col = String(c);
    cell.setAttribute("aria-label", `Row ${r + 1}, step ${c + 1}: empty`);
    cell.addEventListener("click", () => onCellClick(r, c));
    gridEl.appendChild(cell);
    cells[r].push(cell);
  }
}

function onCellClick(row: number, col: number): void {
  if (!state) return;
  const current = state.grid[row][col];
  const note: Cell = tool === "eraser" ? null : tool;
  if (current === note) return;

  // Show the change straight away; the server's broadcast confirms it (or
  // replaces it, if someone else's write landed after ours).
  state.grid[row][col] = note;
  paintCell(row, col, note, true);
  timeline.setGrid(state.grid);
  if (note && !playing) previewNote(note);

  void fetch("/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ row, col, note }),
  }).then((res) => {
    if (!res.ok) showStatus("That change didn't save. Try again.");
  });
}

function paintCell(row: number, col: number, note: Cell, pop = false): void {
  const cell = cells[row][col];
  if (cell.dataset.note === (note ?? "")) return;
  cell.dataset.note = note ?? "";
  cell.style.setProperty("--c", note ? `var(--note-${note})` : "");
  cell.setAttribute("aria-label", `Row ${row + 1}, step ${col + 1}: ${note ? note.slice(0, 1) : "empty"}`);
  if (pop) {
    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
  }
}

// --- palette ------------------------------------------------------------

for (const btn of paletteEl.querySelectorAll<HTMLButtonElement>(".swatch")) {
  btn.addEventListener("click", () => {
    tool = btn.dataset.tool as Tool;
    for (const b of paletteEl.querySelectorAll<HTMLButtonElement>(".swatch")) {
      b.setAttribute("aria-pressed", String(b === btn));
    }
    gridEl.classList.toggle("erasing", tool === "eraser");
    if (tool !== "eraser" && !playing) previewNote(tool);
  });
}

function previewNote(note: Note): void {
  if (!state) return;
  unlockAudio();
  playNote(note, state.instrument, audioTime() + 0.01, 1);
}

// --- instrument (shared) ------------------------------------------------

for (const btn of instrumentBtns) {
  btn.addEventListener("click", () => {
    const instrument = btn.dataset.instrument as Instrument;
    if (!state || state.instrument === instrument) return;
    state.instrument = instrument;
    renderInstrument(instrument);
    void fetch("/instrument", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrument }),
    });
  });
}

function renderInstrument(instrument: Instrument): void {
  for (const btn of instrumentBtns) btn.setAttribute("aria-checked", String(btn.dataset.instrument === instrument));
}

// --- playback (each browser plays for itself) ----------------------------

// Notes are scheduled slightly ahead on the audio clock for steady timing,
// but read the grid and instrument only when they're scheduled, so someone
// else's edit or instrument switch is heard on the next step.
const LOOKAHEAD_S = 0.12;
let playing = false;
let nextStep = 0;
let nextStepTime = 0;
let timer: number | null = null;
// Where the timeline says playback starts, and, while playing, the audio
// time the current run began and the time step 0 of its loop fell on.
let cueStep = 0;
let startedAt = 0;
let loopZero = 0;
// Bumped on every seek and stop, so beats already queued for the old
// position don't light the grid at the new one.
let epoch = 0;

const columnNotes = (col: number): Note[] => (state ? state.grid.map((row) => row[col]).filter((n): n is Note => n !== null) : []);

function schedule(): void {
  if (!state) return;
  while (nextStepTime < audioTime() + LOOKAHEAD_S) {
    const col = nextStep;
    const column = columnNotes(col);
    for (const note of column) playNote(note, state.instrument, nextStepTime, column.length);
    const delayMs = Math.max(0, (nextStepTime - audioTime()) * 1000);
    const run = epoch;
    window.setTimeout(() => highlight(col, run), delayMs);
    nextStep = (nextStep + 1) % COLS;
    nextStepTime += STEP_MS / 1000;
  }
}

function highlight(col: number, run: number): void {
  if (!playing || run !== epoch) return;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = cells[r][c];
      const active = c === col;
      cell.classList.toggle("active-step", active);
      if (active && cell.dataset.note) {
        cell.classList.remove("ring");
        void cell.offsetWidth;
        cell.classList.add("ring");
      }
    }
  }
  gridEl.dataset.step = String(col);
}

// Lights one column without the beat's ring, for a stopped cue or a scrub.
function markColumn(col: number | null): void {
  for (const row of cells) row.forEach((cell, c) => cell.classList.toggle("active-step", c === col));
}

// Start (or restart) the run at a step, a hair ahead of now.
function runFrom(step: number): void {
  epoch++;
  nextStep = step;
  nextStepTime = audioTime() + 0.05;
  startedAt = nextStepTime;
  loopZero = startedAt - (step * STEP_MS) / 1000;
  schedule();
}

// Milliseconds into the loop: the audio clock while playing, the cue when not.
function position(): number {
  if (!playing) return cueStep * STEP_MS;
  const t = Math.max(audioTime(), startedAt);
  return ((((t - loopZero) * 1000) % LOOP_MS) + LOOP_MS) % LOOP_MS;
}

const timeline = createTimeline({
  position,
  onScrub(step) {
    // Stopped: hear the column you're on, like dragging a needle over a record.
    if (playing || !state) return;
    markColumn(step);
    unlockAudio();
    const column = columnNotes(step);
    for (const note of column) playNote(note, state.instrument, audioTime() + 0.01, column.length);
  },
  onSeek(step) {
    if (playing) runFrom(step);
    else {
      cueStep = step;
      markColumn(step === 0 ? null : step);
    }
  },
  onCancel() {
    if (!playing) markColumn(cueStep === 0 ? null : cueStep);
  },
});

playBtn.addEventListener("click", () => {
  if (playing) return;
  unlockAudio();
  playing = true;
  markColumn(null);
  runFrom(cueStep);
  timer = window.setInterval(schedule, 25);
  timeline.play();
  playBtn.disabled = true;
  stopBtn.disabled = false;
  document.body.classList.add("is-playing");
});

stopBtn.addEventListener("click", () => {
  playing = false;
  epoch++;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  cueStep = 0; // Stop goes back to the start, like a tape deck
  for (const row of cells) for (const cell of row) cell.classList.remove("active-step", "ring");
  timeline.stop();
  playBtn.disabled = false;
  stopBtn.disabled = true;
  document.body.classList.remove("is-playing");
  playBtn.focus();
});

// --- live state ----------------------------------------------------------

function render(next: GardenState): void {
  // Versions only go up; an older snapshot arriving late is ignored.
  if (state && next.version < state.version) return;
  state = next;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) paintCell(r, c, next.grid[r][c], false);
  timeline.setGrid(next.grid);
  renderInstrument(next.instrument);
  presenceEl.classList.remove("offline");
  presenceText.textContent = `${next.online} ${next.online === 1 ? "person" : "people"} creating`;
  renderActivity(next);
}

function renderActivity(next: GardenState): void {
  activityEl.replaceChildren(
    ...next.activity.map((a) => {
      const li = document.createElement("li");
      const who = document.createElement("strong");
      who.textContent = a.nickname;
      li.append(who, ` ${a.text}`);
      return li;
    }),
  );
  if (next.activity.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing yet — place the first note!";
    activityEl.append(li);
  }
}

function showStatus(text: string): void {
  presenceEl.classList.add("offline");
  presenceText.textContent = text;
}

// EventSource reconnects by itself; each reconnect gets a full snapshot, so
// nothing missed while offline is lost.
const events = new EventSource("/events");
events.onmessage = (e) => render(JSON.parse(e.data) as GardenState);
events.onerror = () => showStatus("Reconnecting…");
