import { readFileSync } from "node:fs";
import { marked } from "marked";
import { SCENES, findZone, type Mode, type Scene } from "./shared/catalog.js";
import type { Snapshot } from "./shared/protocol.js";
import type { User } from "./users.js";

const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

export const NOT_AFFILIATED = "Independent student creative project. Not affiliated with or endorsed by ANU or LAB ANU.";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// JSON inside a <script> tag: "<" escaped so a nickname can't close it.
const embed = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

const page = (title: string, bodyClass: string, body: string): string => `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="Walk from a forest to the sea, and meet whoever else is there." />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='5' fill='%23d9a25b'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23d9a25b' stroke-width='2' opacity='.6'/%3E%3Ccircle cx='16' cy='16' r='15' fill='none' stroke='%23d9a25b' stroke-width='1.5' opacity='.3'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" />
<link rel="stylesheet" href="/client/style.css" />
<script type="importmap">{"imports":{"three":"/vendor/three.module.min.js","three/addons/":"/vendor/addons/"}}</script>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;

const footer = `<footer class="site-footer">
  <p>${NOT_AFFILIATED}</p>
  <p><a href="/about">Sources and privacy</a> · <a href="/readme/">About this app</a></p>
</footer>`;

const nav = `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/explore">Places</a> <a href="/about">About</a></nav>
</header>`;

const avatarMark = (avatar: string): string => `<span class="avatar-mark avatar-${avatar === "dog" ? "dog" : "cat"}" aria-hidden="true"></span>`;

function joinForm(next: string, error: string | null): string {
  return `<form method="post" action="/join" class="join" id="join-form">
  <input type="hidden" name="next" value="${escapeHtml(next)}" />
  <label for="nickname">Your name here</label>
  <input id="nickname" name="nickname" maxlength="24" required autocomplete="off" placeholder="A nickname is fine" />
  <fieldset class="avatar-pick">
    <legend>Walk around as</legend>
    <label><input type="radio" name="avatar" value="cat" required /> ${avatarMark("cat")} A cat</label>
    <label><input type="radio" name="avatar" value="dog" /> ${avatarMark("dog")} A dog</label>
  </fieldset>
  ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}
  <p class="fine">No account. Your nickname is shown to people you meet in the place.</p>
  <button type="submit" class="btn primary">Join</button>
</form>`;
}

export function renderLanding(user: User | null): string {
  return page(
    "Sound of a City",
    "landing",
    `<main class="hero">
  <div class="hero-photo" aria-hidden="true"></div>
  <div class="hero-text">
    <p class="kicker">From the forest to the sea</p>
    <h1>Sound of a City</h1>
    <p class="lede">Walk a trail through the trees down to the sea, and meet whoever else is there.</p>
    <p class="actions">
      <a class="btn primary" href="/scene/seaside">Enter the world</a>
      <a class="btn ghost" href="/about#how">How it Works</a>
    </p>
    ${user ? `<p class="fine">Welcome back, ${escapeHtml(user.nickname)}.</p>` : ""}
    <p class="independent">An independent student project.</p>
  </div>
</main>
${footer}`,
  );
}

export interface PlaceSummary {
  sceneId: string;
  mode: string;
  online: number;
}

const placeLine = (p: PlaceSummary | undefined): string =>
  !p ? "" : p.online === 0 ? "nobody here" : `${p.online} ${p.online === 1 ? "person" : "people"} here`;

export function renderExplore(user: User | null, places: PlaceSummary[], error: string | null): string {
  const find = (sceneId: string, mode: string): PlaceSummary | undefined => places.find((p) => p.sceneId === sceneId && p.mode === mode);
  const cards = SCENES.map((scene) => {
    const modes = scene.modes
      .map(
        (m) => `<li><a class="mode-link" href="/scene/${scene.id}?mode=${m.id}">
            <span class="mode-label">${m.label}</span>
            <span class="place-live">${placeLine(find(scene.id, m.id))}</span>
          </a></li>`,
      )
      .join("");
    return `<article class="place-card">
        <div class="place-body">
          <h2>${scene.title}</h2>
          <p>${scene.summary}</p>
          <p class="badge real">Walkable · free CC0 models</p>
          <ul class="modes">${modes}</ul>
        </div>
      </article>`;
  }).join("\n");

  return page(
    "Places — Sound of a City",
    "explore",
    `${nav}
<main class="explore-main">
  <h1>Choose a place</h1>
  <p class="lede">Walk in, look around, and meet whoever else is there. Every time of day is the same place, with the same people.</p>
  ${
    user
      ? `<form method="post" action="/leave" class="you-are">${avatarMark(user.avatar)} You're <strong>${escapeHtml(user.nickname)}</strong>. <button class="link-btn" type="submit">Change</button></form>`
      : `<details class="join-box"${error ? " open" : ""}><summary>Join (you can look around first)</summary>${joinForm("/explore", error)}</details>`
  }
  <div class="places">${cards}</div>
</main>
${footer}`,
  );
}

// The walkable world: a 3D view you move through, and "Go to" buttons for
// each part of it.
export function renderScene(scene: Scene, mode: Mode, zoneId: string, snap: Snapshot, user: User | null): string {
  const zone = findZone(scene, zoneId) ?? scene.zones[0];
  const modeNav = `<nav class="mode-switch" aria-label="Time of day">${scene.modes
    .map((m) => `<a href="/scene/${scene.id}?mode=${m.id}"${m.id === mode.id ? ' aria-current="page"' : ""}>${m.label}</a>`)
    .join("")}</nav>`;
  return page(
    `${scene.title} · ${mode.label} — Sound of a City`,
    `scene-page scene-${scene.id} mode-${mode.id} is-world`,
    `<header class="bar">
  <a class="back" href="/explore"><span aria-hidden="true">←</span> Places</a>
  <div class="where"><h1>${scene.title}</h1><span class="mode-name">${mode.label}</span></div>
  <div class="people" id="people" aria-live="polite"></div>
</header>
${modeNav}
<main class="scene-main world-only">
  <section class="stage-area" aria-label="The place">
    <div class="stage-frame world-frame" id="stage-frame">
      <div class="stage world-stage" id="stage">
        <p class="world-help" aria-hidden="true"><span class="keys">Drag to look · W A S D or arrows to walk · click the floor to walk there</span><span class="touch">Drag to look · stick to walk · tap the floor to walk there</span></p>
      </div>
    </div>
    <nav class="goto" id="zones" aria-label="Go to"><span class="goto-label">Go to</span>${scene.zones
      .map((z) => `<a href="?mode=${mode.id}&amp;zone=${z.id}" data-zone="${z.id}"${z.id === zone.id ? ' aria-current="true"' : ""}>${escapeHtml(z.title)}</a>`)
      .join("")}</nav>
    <p class="evidence"><span class="label">Here</span> <span id="zone-text">${escapeHtml(zone.description)}</span></p>
    <p class="mode-note">${escapeHtml(scene.about)}</p>
    <p class="fine not-affiliated">${NOT_AFFILIATED} <a href="/about">Sources</a></p>
  </section>
</main>
<div class="status" id="status" role="status" aria-live="polite"></div>
<div class="toast" id="toast" aria-live="polite"></div>
<noscript><p class="noscript">This place needs JavaScript to show it and the people in it.</p></noscript>
<script type="application/json" id="boot">${embed({ sceneId: scene.id, mode: mode.id, zoneId: zone.id, snapshot: snap, joined: user !== null })}</script>
<script type="module" src="/client/scene.js"></script>`,
  );
}

export function renderAbout(): string {
  return page(
    "Sources and privacy — Sound of a City",
    "about",
    `${nav}
<main class="prose">
  <h1>Sources and privacy</h1>
  <p><strong>${NOT_AFFILIATED}</strong></p>

  <h2 id="how">How it works</h2>
  <ol>
    <li>Open the place. Give a name and come as a cat or a dog. No account.</li>
    <li>Walk with W A S D or the arrow keys, drag to look, or use <em>Go to</em>. Wander far off the forest trail and a kangaroo comes to point you back.</li>
    <li>Everyone in the place sees everyone else, at every time of day. Come within a few steps of someone and you can talk: your words show over your head for five seconds, or until you say something new, and only people nearby see them.</li>
  </ol>
  <p>Sound is being redesigned and isn't in the place for now.</p>

  <h2>Where the place comes from</h2>
  <p>It's imagined, not a real location. Ground, sand, timber, furniture, food, plants and skies are free CC0 (public domain) models, surfaces and HDR skies from <a href="https://polyhaven.com">Poly Haven</a>; each is listed with its author in <code>public/assets-manifest.json</code>. Trees, buildings and the water are drawn from simple shapes. The cats, dogs and the kangaroo are the app's own drawings.</p>

  <h2>What is stored</h2>
  <ul>
    <li>Your nickname, cat-or-dog choice, and a random session token (the server keeps only its hash). No email, no account, no location.</li>
    <li>Where you stand and what you say are never stored: they go to the people in the place as they happen, and are gone.</li>
  </ul>
</main>
${footer}`,
  );
}

export function renderReadme(): string {
  return page(
    "About — Sound of a City",
    "about",
    `${nav}
<main class="prose readme">
${marked.parse(readmeSource, { async: false })}
</main>
${footer}`,
  );
}

export function renderNotFound(message: string): string {
  return page(
    "Not found — Sound of a City",
    "about",
    `<header class="site-bar"><a class="brand" href="/">Sound of a City</a></header>
<main class="prose"><h1>Not here</h1><p>${escapeHtml(message)}</p><p><a href="/explore">Choose a place</a></p></main>`,
  );
}
