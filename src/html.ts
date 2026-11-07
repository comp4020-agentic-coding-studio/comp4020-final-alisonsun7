import { readFileSync } from "node:fs";
import { marked } from "marked";
import { SCENES, findZone, type Mode, type Scene } from "./shared/catalog.js";
import type { Snapshot } from "./shared/protocol.js";
import { WEATHER_LABELS, formatTime, minuteAt } from "./shared/environment.js";
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
<meta name="description" content="Build a soundscape together. Leave a sound, answer someone else's, and hear this shared place change." />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='5' fill='%23d9a25b'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23d9a25b' stroke-width='2' opacity='.6'/%3E%3Ccircle cx='16' cy='16' r='15' fill='none' stroke='%23d9a25b' stroke-width='1.5' opacity='.3'/%3E%3C/svg%3E" />
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
  <div class="hero-photo sound-field" aria-hidden="true"><span class="field-ring field-water"></span><span class="field-ring field-animal"></span><span class="field-ring field-people"></span></div>
  <div class="hero-text">
    <p class="kicker">A place we make by listening</p>
    <h1>Sound of a City</h1>
    <p class="subtitle">Your kind of place, made with sound.</p>
    <p class="lede">Walk from the forest to the sea. With your friends, layer sounds into a cozy corner or a lively gathering. Nearby residents listen, sway and play in response.</p>
    <p class="hero-promise">The sounds we leave stay here after we go, until someone beside them removes them.</p>
    <p class="actions">
      <a class="btn primary" href="/scene/seaside">Enter &amp; listen</a>
      <a class="btn ghost" href="/about#how">How it Works</a>
    </p>
    <ul class="hero-families" aria-label="Three kinds of shared sound"><li class="family-water">Water &amp; wind</li><li class="family-animal">Animals</li><li class="family-people">People</li></ul>
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
          <p class="badge real">One shared place · lasting sounds</p>
          <ul class="modes">${modes}</ul>
        </div>
      </article>`;
  }).join("\n");

  return page(
    "Our shared place — Sound of a City",
    "explore",
    `${nav}
<main class="explore-main">
  <h1>Our shared place</h1>
  <p class="lede">Everyone walks in the same world. Make a cozy corner with a friend, bring the boardwalk to life, or find your own mix of sounds. Nearby residents respond; shared sounds stay after you leave, until someone beside them removes them.</p>
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
  // with one time of day there's nothing to switch between
  const modeNav = scene.modes.length < 2 ? "" : `<nav class="mode-switch" aria-label="Time of day">${scene.modes
    .map((m) => `<a href="/scene/${scene.id}?mode=${m.id}"${m.id === mode.id ? ' aria-current="page"' : ""}>${m.label}</a>`)
    .join("")}</nav>`;
  return page(
    `${scene.title} — Sound of a City`,
    `scene-page scene-${scene.id} mode-${mode.id} is-world`,
    `<header class="bar">
  <a class="back" href="/explore" aria-label="Places"><span aria-hidden="true">←</span><span class="back-label">Places</span></a>
  <div class="where"><h1>Sound of a City</h1></div>
  <div class="world-actions">
    <button type="button" class="btn ghost controls-switch" id="look-settings" aria-label="Controls" title="Controls"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9v6m-3-3h6m5-3h2m-2 6h2"/></svg><span class="world-action-label">Controls</span></button>
    <button type="button" class="btn ghost sound-switch" id="sound-switch" aria-pressed="false" aria-label="Sound off" title="Sound off"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m11 4-5 4H2v8h4l5 4Z"/><g class="sound-on-wave"><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></g><path class="sound-off-line" d="m16 9 6 6m0-6-6 6"/></svg><span class="world-action-label">Sound off</span></button>
    <button type="button" class="btn ghost world-tools-toggle" id="world-tools-toggle" aria-label="Tools" aria-haspopup="dialog" aria-controls="world-tools-panel" aria-expanded="false" title="Tools: weather, scenes and nearby sounds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg><span class="world-action-label">Tools</span></button>
  </div>
</header>
${modeNav}
<main class="scene-main world-only">
  <section class="stage-area" aria-label="The place">
    <div class="stage-frame world-frame" id="stage-frame">
      <div class="stage world-stage" id="stage">
        <p class="world-help" aria-hidden="true"><span class="keys">Drag to look · W A S D or arrows to walk · click the floor to walk there</span><span class="touch">Drag to look · stick to walk · tap the floor to walk there</span></p>
      </div>
    </div>
  </section>
</main>
<dialog class="world-tools-panel" id="world-tools-panel" aria-labelledby="world-tools-title" hidden>
  <div class="tools-panel-heading"><div><p class="world-caption">One place · made by all of us</p><h2 id="world-tools-title">Our soundscape</h2></div><button type="button" class="btn ghost" id="world-tools-close" autofocus>Close</button></div>
  <p class="mode-name">From the forest to the sea</p>
  <div class="people" id="people" aria-live="polite"></div>
  <div id="shared-sound-place"></div>
  <div id="tools-listening"></div>
    <div class="world-tools" aria-label="World settings">
      <div class="world-conditions"><span class="world-conditions-label">The shared sky</span><span id="world-conditions">${escapeHtml(WEATHER_LABELS[snap.environment.weather])} · ${formatTime(minuteAt(snap.environment, Date.parse(snap.serverNow)))}</span><span id="world-clock-mode">${snap.environment.clockRunning ? "24-minute day" : "Time paused"}</span></div>
      <div class="world-tool-actions">
        <button type="button" class="world-tool" id="environment-settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>Weather &amp; time</button>
        <button type="button" class="world-tool" id="scene-settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="16" cy="8" r="2"/><path d="m3 17 6-7 5 6 3-3 5 6"/></svg>Explore scenes</button>
      </div>
    </div>
    <nav class="goto" id="zones" aria-label="Go to"><span class="goto-label">Go to</span>${scene.zones
      .map((z) => `<a href="?mode=${mode.id}&amp;zone=${z.id}" data-zone="${z.id}"${z.id === zone.id ? ' aria-current="true"' : ""}>${escapeHtml(z.title)}</a>`)
      .join("")}</nav>
    <p class="evidence"><span class="label">Here</span> <span id="zone-text">${escapeHtml(zone.description)}</span></p>
    <p class="mode-note">${escapeHtml(scene.about)}</p>
    <p class="fine not-affiliated">${NOT_AFFILIATED} <a href="/about">Sources</a></p>
</dialog>
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
    <li>Everyone in the place sees everyone else. Come within a few steps of someone and you can talk: your words show over your head for five seconds, or until you say something new, and only people nearby see them.</li>
    <li>Leave a sound where you stand: it shows as a coloured light (blue for water and wind, green for animals, orange for people) and plays from there for everyone until someone standing beside it removes it. It stays after you leave. Anyone can leave or remove any sound, and everyone is told who did.</li>
    <li>Find someone else's sound and choose <em>Reply with a sound</em>. Walk to a spot, choose your answer, and leave it there. The two sounds stay connected in their conversation.</li>
  </ol>

  <h2>Where the place comes from</h2>
  <p>It's imagined, not a real location. Surface grain, furniture, food, plants and skies use free CC0 (public domain) assets from <a href="https://polyhaven.com">Poly Haven</a>, brought into the same painted palette. Each external asset and its author is recorded in <code>public/assets-manifest.json</code>. Trees, buildings, water and animal people use original three-dimensional geometry. The café's coastal mural is original AI-generated artwork, recorded separately from external CC0 assets. Earlier material studies remain documented in the manifest.</p>
  <p>The sounds are recordings from <a href="https://commons.wikimedia.org">Wikimedia Commons</a> that are CC0 or in the public domain, cut into loops; each is listed with its author and what was done to it in <code>public/assets-manifest.json</code>.</p>

  <h2>What is stored</h2>
  <ul>
    <li>Your nickname, cat-or-dog choice, and a random session token (the server keeps only its hash). No email, no account, no location.</li>
    <li>Where you stand and what you say are never stored: they go to the people in the place as they happen, and are gone.</li>
    <li>Sounds you leave are stored with your nickname, where and when, and stay public until someone removes them; who removed one is stored too.</li>
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
