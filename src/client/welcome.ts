import { COLS, STEP_MS, crowdLine, gardenLine, type PreviewState } from "../types.js";

const book = document.getElementById("book")!;
const form = document.getElementById("join-form") as HTMLFormElement;
const nickname = document.getElementById("nickname") as HTMLInputElement;
const helloName = document.getElementById("hello-name")!;
const miniGrid = document.getElementById("mini-grid")!;
const crowd = document.getElementById("crowd-line")!;
const liveDot = document.getElementById("live-dot")!;
const gardenText = document.getElementById("garden-line")!;
const cells = [...miniGrid.querySelectorAll<HTMLElement>(".mini-cell")];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- live preview ---------------------------------------------------------

let version = -1;

function render(next: PreviewState): void {
  if (next.version < version) return;
  version = next.version;
  for (const cell of cells) {
    const note = next.grid[Number(cell.dataset.row)][Number(cell.dataset.col)] ?? "";
    if (cell.dataset.note === note) continue;
    cell.dataset.note = note;
    cell.style.setProperty("--c", note ? `var(--note-${note})` : "");
    if (note && !reducedMotion) {
      cell.classList.remove("pop");
      void cell.offsetWidth;
      cell.classList.add("pop");
    }
  }
  const notes = next.grid.flat().filter((n) => n !== null).length;
  miniGrid.setAttribute("aria-label", `Live view of the shared grid: ${notes} ${notes === 1 ? "note" : "notes"}`);
  crowd.textContent = crowdLine(next.online);
  liveDot.classList.toggle("quiet", next.online === 0);
  gardenText.textContent = gardenLine(next.grid, next.instrument);
}

const preview = new EventSource("/preview");
preview.onmessage = (e) => render(JSON.parse(e.data) as PreviewState);

// A silent playhead sweeps the columns, so the grid reads as music, not a
// picture. No sound before someone chooses to join.
if (!reducedMotion) {
  let step = 0;
  window.setInterval(() => {
    for (const cell of cells) cell.classList.toggle("active-step", Number(cell.dataset.col) === step);
    step = (step + 1) % COLS;
  }, STEP_MS);
}

// --- turning the page -----------------------------------------------------

// The form posts as normal without this script. With it, the cover turns
// first and the join is sent once the page has flipped.
const FLIP_MS = 900;
let turning = false;

form.addEventListener("submit", (e) => {
  if (reducedMotion || turning) return;
  e.preventDefault();
  turning = true;
  helloName.textContent = nickname.value.trim() || "friend";
  book.classList.add("opening");
  try {
    sessionStorage.setItem("sg-arrive", "1");
  } catch {
    // storage blocked: the garden just won't play its arrival
  }
  window.setTimeout(() => {
    preview.close();
    form.submit();
  }, FLIP_MS);
});

// Coming back with the browser's Back button can restore this page from
// cache mid-flip; close the book again.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  turning = false;
  book.classList.remove("opening");
});
