import { readFileSync } from "node:fs";
import { marked } from "marked";

const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="stylesheet" href="/client/style.css" />
</head>
<body>
${body}
</body>
</html>
`;

export function renderHome(): string {
  return page(
    "NoteGrid",
    `<main class="home">
  <h1>NoteGrid</h1>
  <p>A shared 6&times;6 grid, played together. Pick a name to join the board.</p>
  <form id="name-form" method="post" action="/nickname">
    <label for="nickname">Your name</label>
    <input id="nickname" name="nickname" maxlength="24" required autocomplete="off" />
    <button type="submit">Join the board</button>
  </form>
  <p><a href="/readme/">What this is</a></p>
</main>`,
  );
}

export function renderBoard(nickname: string): string {
  return page(
    "NoteGrid",
    `<main class="board-page" data-nickname="${escapeHtml(nickname)}">
  <header>
    <h1>NoteGrid</h1>
    <p class="status" id="status" aria-live="polite">Connecting&hellip;</p>
  </header>
  <div class="layout">
    <section class="grid-wrap">
      <div class="grid" id="grid" role="grid" aria-label="36-step note grid"></div>
      <div class="transport">
        <button id="play-stop" type="button">Play</button>
        <fieldset id="instruments">
          <legend>Instrument</legend>
          <label><input type="radio" name="instrument" value="piano" checked /> Piano</label>
          <label><input type="radio" name="instrument" value="guitar" /> Guitar</label>
          <label><input type="radio" name="instrument" value="sax" /> Saxophone</label>
        </fieldset>
      </div>
    </section>
    <aside class="palette" id="palette" aria-label="Notes">
      <h2>Notes</h2>
    </aside>
  </div>
  <p><a href="/readme/">What this is</a></p>
</main>
<script type="module" src="/client/app.js"></script>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderReadme(): string {
  const body = marked.parse(readmeSource, { async: false });
  return page(
    "NoteGrid — Readme",
    `<main class="readme">
  <p><a href="/">&larr; Back to the board</a></p>
  ${body}
</main>`,
  );
}
