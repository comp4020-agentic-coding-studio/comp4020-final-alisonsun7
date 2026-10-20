import { readFileSync } from "node:fs";
import { marked } from "marked";
import { COLS, LOOP_MS, STEP_MS, crowdLine, formatTime, gardenLine, type PreviewState } from "./types.js";

const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap" />
<link rel="stylesheet" href="/client/style.css" />
</head>
<body>
${body}
</body>
</html>
`;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderWelcome(preview: PreviewState, error = ""): string {
  const cells = preview.grid
    .flatMap((row, r) =>
      row.map(
        (note, c) =>
          `<span class="mini-cell" data-row="${r}" data-col="${c}" data-note="${note ?? ""}"${note ? ` style="--c: var(--note-${note})"` : ""}></span>`,
      ),
    )
    .join("");
  const notes = preview.grid.flat().filter((n) => n !== null).length;

  return page(
    "SoundGarden",
    `<main class="welcome">
  <div class="book" id="book">
    <section class="inner-page" aria-hidden="true">
      <div class="staff"><span></span><span></span><span></span><span></span><span></span></div>
      <p class="inner-hello">Hello, <strong id="hello-name">friend</strong>!</p>
      <p class="inner-sub">Turning to the garden…</p>
      <div class="welcome-notes inner-notes">
        <span style="--c: var(--note-C4)"></span><span style="--c: var(--note-D4)"></span><span style="--c: var(--note-E4)"></span><span style="--c: var(--note-G4)"></span><span style="--c: var(--note-A4)"></span>
      </div>
    </section>

    <div class="cover" id="cover">
      <section class="cover-front">
        <div class="welcome-notes" aria-hidden="true">
          <span style="--c: var(--note-C4)"></span><span style="--c: var(--note-D4)"></span><span style="--c: var(--note-E4)"></span><span style="--c: var(--note-G4)"></span><span style="--c: var(--note-A4)"></span>
        </div>
        <h1>Welcome to SoundGarden</h1>
        <p class="tagline">Everyone contributes a note. Together, we make music.</p>

        <figure class="mini">
          <figcaption class="mini-live">
            <span class="live-dot${preview.online === 0 ? " quiet" : ""}" id="live-dot" aria-hidden="true"></span>
            <span id="crowd-line" aria-live="polite">${crowdLine(preview.online)}</span>
          </figcaption>
          <div class="mini-grid" id="mini-grid" role="img" aria-label="Live view of the shared grid: ${notes} ${notes === 1 ? "note" : "notes"}">${cells}</div>
          <p class="mini-caption" id="garden-line">${gardenLine(preview.grid, preview.instrument)}</p>
        </figure>

        <form method="post" action="/join" class="join-form" id="join-form">
          <label for="nickname">What should we call you?</label>
          <input id="nickname" name="nickname" maxlength="24" required autocomplete="off" placeholder="Your name" autofocus />
          ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button type="submit" class="btn-primary">Join the garden <span aria-hidden="true">→</span></button>
        </form>
        <p class="small"><a href="/readme/">What is this?</a></p>
      </section>
      <div class="cover-back" aria-hidden="true"></div>
    </div>
  </div>
</main>
<script type="module" src="/client/welcome.js"></script>`,
  );
}

const NOTE_SWATCHES = [
  ["C4", "C", "Do"],
  ["D4", "D", "Re"],
  ["E4", "E", "Mi"],
  ["G4", "G", "Sol"],
  ["A4", "A", "La"],
] as const;

export function renderGarden(nickname: string): string {
  const swatches = NOTE_SWATCHES.map(
    ([note, letter, solfege], i) =>
      `<button type="button" class="swatch" data-tool="${note}" aria-pressed="${i === 0}" style="--c: var(--note-${note})">
        <span class="swatch-chip"></span><span class="swatch-letter">${letter}</span><span class="swatch-solfege">${solfege}</span>
      </button>`,
  ).join("\n");

  return page(
    "SoundGarden",
    `<main class="studio">
  <header class="topbar">
    <div>
      <h1><span class="logo-note" aria-hidden="true">♪</span> SoundGarden</h1>
      <p class="tagline">Make music together, one note at a time.</p>
    </div>
    <div class="presence" id="presence" aria-live="polite"><span class="dot"></span><span id="presence-text">Connecting…</span></div>
  </header>

  <p class="welcome-back">Welcome, <strong>${escapeHtml(nickname)}</strong>! Pick a note, then tap any square.</p>

  <div class="workspace">
    <section class="grid-card" aria-label="Shared music grid">
      <div class="card-title">Shared music grid</div>
      <div class="grid-frame">
        <div class="step-labels" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map((n) => `<span>${n}</span>`).join("")}</div>
        <div class="grid" id="grid"></div>
      </div>
      <div class="timeline" id="timeline">
        <div class="timeline-head">
          <span class="timeline-label">Timeline</span>
          <span class="timeline-time"><span id="timeline-now">0:00.0</span> / <span id="timeline-total">${formatTime(LOOP_MS)}</span></span>
        </div>
        <div class="timeline-track" id="timeline-track" role="slider" tabindex="0" aria-label="Playback position" aria-valuemin="1" aria-valuemax="${COLS}" aria-valuenow="1" aria-valuetext="Step 1 of ${COLS}">
          <div class="timeline-roll" id="timeline-roll"></div>
          <div class="timeline-playhead" id="timeline-playhead" aria-hidden="true"></div>
        </div>
        <div class="timeline-ticks" aria-hidden="true">${Array.from({ length: COLS }, (_, c) => `<span>${((c * STEP_MS) / 1000).toFixed(1)}s</span>`).join("")}</div>
      </div>
      <div class="transport">
        <button type="button" id="play" class="btn-primary btn-play"><span aria-hidden="true">▶</span> Play</button>
        <button type="button" id="stop" class="btn-secondary" disabled><span aria-hidden="true">■</span> Stop</button>
      </div>
    </section>

    <aside class="palette-card" aria-label="Choose a note">
      <div class="card-title">Choose a note</div>
      <div class="palette" id="palette">
        ${swatches}
        <button type="button" class="swatch eraser" data-tool="eraser" aria-pressed="false">
          <span class="swatch-chip" aria-hidden="true">⌫</span><span class="swatch-letter">Eraser</span>
        </button>
      </div>
    </aside>
  </div>

  <section class="instrument-card" aria-label="Instrument">
    <div class="card-title">Instrument <span class="shared-tag">shared by everyone</span></div>
    <div class="instruments" id="instruments" role="radiogroup">
      <button type="button" class="instrument" data-instrument="piano" role="radio" aria-checked="true"><span aria-hidden="true">🎹</span> Piano</button>
      <button type="button" class="instrument" data-instrument="guitar" role="radio" aria-checked="false"><span aria-hidden="true">🎸</span> Guitar</button>
      <button type="button" class="instrument" data-instrument="saxophone" role="radio" aria-checked="false"><span aria-hidden="true">🎷</span> Saxophone</button>
    </div>
  </section>

  <section class="activity-card" aria-label="Recent activity">
    <div class="card-title">Recent activity</div>
    <ul class="activity" id="activity" aria-live="polite"></ul>
  </section>

  <p class="small footer-link"><a href="/readme/">About SoundGarden</a></p>
</main>
<script type="module" src="/client/app.js"></script>`,
  );
}

export function renderReadme(): string {
  return page(
    "SoundGarden — Readme",
    `<main class="readme">
  <p><a href="/">&larr; Back to the garden</a></p>
  ${marked.parse(readmeSource, { async: false })}
</main>`,
  );
}
