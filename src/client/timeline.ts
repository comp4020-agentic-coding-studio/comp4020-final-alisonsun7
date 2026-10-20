import { COLS, LOOP_MS, NOTES, STEP_MS, formatTime, type Cell } from "../types.js";

// The timeline under the grid: which notes sound when across the six-step
// loop, a playhead that glides with playback, and a track you can click or
// drag to choose where playback goes. It only draws; app.ts owns playback.

export interface TimelineHooks {
  position(): number; // ms into the loop right now
  onScrub(step: number): void; // pressed or dragged onto a step
  onSeek(step: number): void; // let go there: play from this step
  onCancel(): void; // the browser took the gesture (e.g. a scroll)
}

export interface Timeline {
  setGrid(grid: Cell[][]): void;
  play(): void;
  stop(): void;
  refresh(): void;
}

export function createTimeline(hooks: TimelineHooks): Timeline {
  const track = document.getElementById("timeline-track")!;
  const roll = document.getElementById("timeline-roll")!;
  const playhead = document.getElementById("timeline-playhead")!;
  const nowEl = document.getElementById("timeline-now")!;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // One pill per step and pitch, built once: higher notes sit higher, in the
  // same colours as the palette.
  const pills = Array.from({ length: COLS }, (_, c) =>
    NOTES.map((note, p) => {
      const pill = document.createElement("span");
      pill.className = "tl-note";
      pill.dataset.count = "0";
      pill.style.gridColumn = String(c + 1);
      pill.style.gridRow = String(NOTES.length - p);
      pill.style.setProperty("--c", `var(--note-${note})`);
      roll.append(pill);
      return pill;
    }),
  );
  const columnText: string[] = new Array<string>(COLS).fill("silent");

  function setGrid(grid: Cell[][]): void {
    let total = 0;
    for (let c = 0; c < COLS; c++) {
      const names: string[] = [];
      NOTES.forEach((note, p) => {
        const count = grid.filter((row) => row[c] === note).length;
        total += count;
        if (count) names.push(count > 1 ? `${note.slice(0, 1)}×${count}` : note.slice(0, 1));
        const pill = pills[c][p];
        if (pill.dataset.count === String(count)) return;
        pill.dataset.count = String(count);
        pill.textContent = count > 1 ? String(count) : "";
      });
      columnText[c] = names.length ? names.join(", ") : "silent";
    }
    roll.classList.toggle("empty", total === 0);
    describe(shownStep);
  }

  // --- the playhead --------------------------------------------------------

  let width = track.clientWidth;
  let shownMs = -1;
  let shownStep = -1;

  function draw(ms: number): void {
    // With reduced motion the playhead steps from column to column.
    const at = reducedMotion ? Math.floor(ms / STEP_MS) * STEP_MS : ms;
    if (at !== shownMs) {
      shownMs = at;
      playhead.style.transform = `translateX(${(at / LOOP_MS) * width}px)`;
      const text = formatTime(at);
      if (nowEl.textContent !== text) nowEl.textContent = text;
    }
    const step = Math.min(COLS - 1, Math.floor(ms / STEP_MS));
    if (step === shownStep) return;
    for (let c = 0; c < COLS; c++) for (const pill of pills[c]) pill.classList.toggle("lit", c === step);
    describe(step);
  }

  function describe(step: number): void {
    shownStep = step;
    const s = Math.max(0, step);
    track.setAttribute("aria-valuenow", String(s + 1));
    track.setAttribute("aria-valuetext", `Step ${s + 1} of ${COLS}, ${formatTime(s * STEP_MS)}: ${columnText[s]}`);
  }

  new ResizeObserver(() => {
    width = track.clientWidth;
    shownMs = -1;
    draw(dragMs ?? hooks.position());
  }).observe(track);

  let raf = 0;
  const frame = (): void => {
    if (dragMs === null) draw(hooks.position());
    raf = requestAnimationFrame(frame);
  };

  // --- seeking ---------------------------------------------------------------

  let dragMs: number | null = null;
  let dragStep = -1;

  function scrubTo(clientX: number): void {
    const rect = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    dragMs = Math.min(frac * LOOP_MS, LOOP_MS - 1);
    draw(dragMs);
    const step = Math.floor(dragMs / STEP_MS);
    if (step !== dragStep) {
      dragStep = step;
      hooks.onScrub(step);
    }
  }

  function endDrag(commit: boolean): void {
    if (dragMs === null) return;
    dragMs = null;
    track.classList.remove("dragging");
    if (!raf) track.classList.remove("live");
    if (commit) hooks.onSeek(dragStep);
    else hooks.onCancel();
    draw(hooks.position());
  }

  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    track.setPointerCapture(e.pointerId);
    track.classList.add("dragging", "live");
    dragStep = -1;
    scrubTo(e.clientX);
  });
  track.addEventListener("pointermove", (e) => {
    if (dragMs !== null) scrubTo(e.clientX);
  });
  track.addEventListener("pointerup", () => endDrag(true));
  track.addEventListener("pointercancel", () => endDrag(false));

  track.addEventListener("keydown", (e) => {
    const current = Math.min(COLS - 1, Math.floor(hooks.position() / STEP_MS));
    const target =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(COLS - 1, current + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, current - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? COLS - 1
      : null;
    if (target === null) return;
    e.preventDefault();
    hooks.onScrub(target);
    hooks.onSeek(target);
    draw(hooks.position());
  });

  draw(hooks.position());

  return {
    setGrid,
    play() {
      track.classList.add("live");
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (dragMs === null) track.classList.remove("live");
      draw(hooks.position());
    },
    refresh() {
      if (dragMs === null) draw(hooks.position());
    },
  };
}
