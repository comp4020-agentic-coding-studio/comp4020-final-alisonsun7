import { readFileSync } from "node:fs";
import { marked } from "marked";

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

export function renderWelcome(error = ""): string {
  return page(
    "SoundGarden",
    `<main class="welcome">
  <div class="welcome-card">
    <div class="welcome-notes" aria-hidden="true">
      <span style="--c: var(--note-C4)"></span><span style="--c: var(--note-D4)"></span><span style="--c: var(--note-E4)"></span><span style="--c: var(--note-G4)"></span><span style="--c: var(--note-A4)"></span>
    </div>
    <h1>Welcome to SoundGarden</h1>
    <p class="tagline">Everyone contributes a note. Together, we make music.</p>
    <form method="post" action="/join" class="join-form">
      <label for="nickname">What should we call you?</label>
      <input id="nickname" name="nickname" maxlength="24" required autocomplete="off" placeholder="Your name" autofocus />
      ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <button type="submit" class="btn-primary">Join the garden</button>
    </form>
    <p class="small"><a href="/readme/">What is this?</a></p>
  </div>
</main>`,
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
