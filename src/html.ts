import { invitationHref } from "./shared/chorus-invitation.js";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { SCENES, findZone, type Mode, type Scene } from "./shared/catalog.js";
import type { Snapshot } from "./shared/protocol.js";
import { WEATHER_LABELS, formatTime, minuteAt } from "./shared/environment.js";
import type { User } from "./users.js";

const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

// Public supporting notes are deliberately enumerated, never a filesystem route.
const PROJECT_NOTES = {
  "chorus-audio": { file: "docs/chorus-audio.md", title: "Sound and listening notes" },
  "promise-evidence-map": { file: "docs/submission/promise-evidence-map.md", title: "Product promises and evidence" },
  "human-playtest": { file: "docs/submission/human-playtest.md", title: "Two-pair playtest protocol" },
  "little-chorus": { file: "docs/little-chorus.md", title: "Little Chorus walkthrough" },
} as const;
const REPOSITORY = "https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/blob/chorus-seaside-performance-2026-11-08/";

function projectDocumentHref(href: string, sourcePath: string): string {
  const localPlanet = href.match(/^http:\/\/localhost:18861(\/planet(?:[?#].*)?)$/);
  if (localPlanet) return localPlanet[1];
  if (!href || href.startsWith("#") || href.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)) return href;
  // Resolve only link text. The resulting path is never used to read a file.
  const target = new URL(href, `https://project.invalid/${sourcePath}`);
  const path = target.pathname.slice(1);
  const suffix = target.search + target.hash;
  if (path === "README.md") return "/readme/" + suffix;
  if (path === "public/assets-manifest.json") return "/assets-manifest.json" + suffix;
  for (const [slug, note] of Object.entries(PROJECT_NOTES)) {
    if (path === note.file) return `/project-notes/${slug}${suffix}`;
  }
  // Unpublished supporting files remain repository references, not local routes.
  return REPOSITORY + path + suffix;
}

function renderProjectMarkdown(source: string, sourcePath: string): string {
  return marked.parse(source, {
    async: false,
    walkTokens(token) {
      if (token.type === "link" || token.type === "image") token.href = projectDocumentHref(token.href, sourcePath);
    },
  });
}

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
  <a class="brand" href="/">Little Chorus</a>
  <nav><a href="/planet">Little world</a> <a href="/explore">Places</a> <a href="/about">About</a></nav>
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
    "Little Chorus — A little world, made together through sound",
    "landing",
    `<main class="hero">
  <div class="hero-photo sound-field" aria-hidden="true"><span class="field-ring field-water"></span><span class="field-ring field-animal"></span><span class="field-ring field-people"></span></div>
  <div class="hero-text">
    <p class="kicker">A place that remembers your answer.</p>
    <h1>Little Chorus</h1>
    <p class="subtitle">A little world, made together through sound.</p>
    <p class="lede">Bring a little water, a melody or a pulse. Answer a friend, and watch your sounds become a canopy, a beat flower or a lantern. No musical knowledge needed.</p>
    <p class="hero-promise">Your ingredients stay after you leave. Your work remembers who began it, who answered, and what you changed together.</p>
    <p class="actions">
      <a class="btn primary" href="/planet">Start at Listening Green</a>
      <a class="btn ghost" href="/scene/seaside">Visit the coast</a>
    </p>
    <p class="hero-editions">The coastal world is still here, with everything you left in it. <a href="/about#how">How it works</a></p>
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
  const ordered = [...SCENES].sort((a, b) => Number(b.id === "planet") - Number(a.id === "planet"));
  const cards = ordered.map((scene) => {
    const planet = scene.id === "planet";
    const modes = scene.modes
      .map(
        (m) => `<li><a class="mode-link" href="${planet ? "/planet" : `/scene/${scene.id}?mode=${m.id}`}">
            <span class="mode-label">${m.label}</span>
            <span class="place-live">${placeLine(find(scene.id, m.id))}</span>
          </a></li>`,
      )
      .join("");
    return `<article class="place-card${planet ? " planet-place-card" : ""}">
        <div class="place-body">
          <h2>${scene.title}</h2>
          <p>${scene.summary}</p>
          <p class="badge real">${planet ? "The little world · made together" : "Coastal edition · your sounds stay here"}</p>
          <ul class="modes">${modes}</ul>
        </div>
      </article>`;
  }).join("\n");

  return page(
    "Our worlds — Little Chorus",
    "explore",
    `${nav}
<main class="explore-main">
  <h1>Find your kind of place</h1>
  <p class="lede">Make a cozy corner with a friend, start a lively gathering, or find your own mix. The little world and the coast each keep their own sounds. You bring the same name and character to both.</p>
  <p class="explore-planet-invite"><a class="btn primary" href="/planet">Enter the little world</a><span>Little places for the things you do together.</span></p>
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
    `${scene.title} — Little Chorus`,
    `scene-page scene-${scene.id} mode-${mode.id} is-world`,
    `<header class="bar">
  <a class="back" href="/explore" aria-label="Places"><span aria-hidden="true">←</span><span class="back-label">Places</span></a>
  <div class="where"><h1>Little Chorus <span class="edition-label">· Coast</span></h1></div>
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
    <div class="legacy-view-tools">
      <h3>Your view</h3>
      <button type="button" class="world-tool" id="view-mode" aria-pressed="false">See my character</button>
      <p>Switch between walking in first person and seeing your character from behind.</p>
    </div>
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
    <details class="restroom-check"><summary>Restrooms &amp; doors</summary><p>One person per room. A red lamp means occupied; the door stays locked until that person leaves. Residents make their own visits too.</p><p id="restroom-status" role="status" aria-live="polite">Walk to a restroom to see whether it is free.</p></details>
    <a class="world-tool planet-edition-link" href="/planet">Visit the little world</a>
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

// A separate playable edition. The server supplies this world's real room;
// the new page never maps old coastal contributions onto planet coordinates.
export function renderPlanet(snap: Snapshot, joined: boolean, user: User | null = null, work: unknown = null): string {
  const identity = user?.nickname ?? snap.you?.name ?? "Just looking around";
  const avatar = user?.avatar ?? snap.you?.avatar ?? "cat";
  return page(
    "Little Chorus — The little world",
    "scene-page planet-page is-world",
    `<header class="planet-bar">
  <div class="planet-brand-actions">
    <a class="planet-brand" href="/" aria-label="Little Chorus home"><span class="planet-brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Little Chorus</span></a>
    <div class="planet-sound-actions" role="group" aria-label="Sharing and listening">
      <button type="button" id="planet-place" class="btn primary planet-create-control" aria-haspopup="dialog" aria-description="Choose a sound privately. Only Leave it here changes the shared world."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 9v6m4-9v12m4-16v20m4-16v12m4-9v6"/></svg><span>Share a sound</span></button>
      <button type="button" id="planet-listening-settings" class="planet-control planet-listening-settings" aria-haspopup="dialog" aria-controls="planet-tools-panel" aria-label="Listening settings: only what you hear" title="Listening settings: only what you hear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="19" r="2"/></svg></button>
    </div>
  </div>
  <p id="planet-identity" class="planet-identity">${escapeHtml(identity)}</p>
  <nav class="planet-actions" aria-label="World controls">
    <button type="button" id="planet-view" class="planet-control" aria-pressed="false" title="Change first or third person view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4M3 7H1m22 0h-2"/></svg><span>Third person</span></button>
    <button type="button" id="planet-sound" class="planet-control" aria-pressed="false" title="Turn sound on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m11 4-5 4H2v8h4l5 4Z"/><path d="m16 9 6 6m0-6-6 6"/></svg><span>Sound off</span></button>
    <button type="button" id="planet-tools" class="planet-control" aria-haspopup="dialog" aria-controls="planet-tools-panel" aria-expanded="false" title="Places, friends and settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="19" r="2"/></svg><span>Places &amp; friends</span></button>
  </nav>
</header>
<main id="planet-stage" class="planet-stage" data-presentation="3d" aria-label="A little world made through sound">
  <nav id="chorus-travel" class="chorus-travel" aria-label="Little places"><button type="button" data-place="green" aria-pressed="true">Listening Green</button><button type="button" data-place="stage" aria-pressed="false">Pocket Jam</button><button type="button" data-place="reading" aria-pressed="false">Reading Nook</button><button type="button" data-place="tea" aria-pressed="false">Tide &amp; Coffee</button></nav>
  <aside class="planet-corner" aria-label="Where you are">
    <button type="button" id="planet-shared" aria-haspopup="dialog" aria-label="Our soundscape: sounds and responses"><span class="planet-corner-kicker">Our soundscape · sounds &amp; responses</span><strong id="planet-area">Listening Green</strong><span id="planet-presence">Connecting to the world…</span></button>
    <p id="planet-guide">A place for what you make together.</p>
  </aside>
  <div class="planet-play-controls" aria-label="Run and jump"><button type="button" id="planet-run" aria-pressed="false">Run <kbd>Shift</kbd></button><button type="button" id="planet-jump">Jump <kbd>Space</kbd></button></div>
  <button type="button" id="planet-interact" class="planet-interact" hidden>Meet the kangaroo</button>
  <form id="planet-chat" class="planet-chat" hidden>
    <div class="planet-chat-heading"><label id="planet-chat-to" for="planet-chat-input">Talk to friends nearby</label><button type="button" id="planet-chat-close" aria-label="Close chat">Close</button></div>
    <div class="planet-chat-row"><input id="planet-chat-input" name="text" maxlength="120" autocomplete="off" placeholder="Say something…"/><button type="submit" id="planet-chat-submit" class="btn primary">Say</button></div>
    <p class="planet-chat-note">Only people nearby hear you. Your words are not saved.</p>
  </form>
  <div id="planet-chat-log" class="planet-chat-log" role="log" aria-live="polite"></div>
  <p id="planet-notice" class="planet-notice" role="status" aria-live="polite" hidden></p>
  <p class="planet-movement"><span class="planet-keys">W A S D · Shift run · Space jump · E interact · drag to look</span><span class="planet-touch-hint">Arrows to move · Run &amp; Jump buttons · drag to look</span></p>
</main>
<dialog id="planet-tools-panel" class="planet-dialog planet-drawer" aria-labelledby="planet-tools-title" hidden>
  <div class="planet-dialog-heading"><div><p class="planet-kicker">Your kind of world</p><h2 id="planet-tools-title">Places &amp; friends</h2></div><button type="button" id="planet-tools-close" class="btn ghost" autofocus>Close</button></div>
  <p class="planet-dialog-intro">A little world, made together through sound.</p>
  <button type="button" id="planet-open-soundscape" class="btn ghost">Our soundscape · sounds &amp; responses</button>
  <section class="planet-panel-section" aria-labelledby="planet-places-title"><h3 id="planet-places-title">Find a little place</h3><div id="planet-destinations" class="planet-destinations"></div></section>
  <section class="planet-panel-section" aria-labelledby="planet-friends-title"><h3 id="planet-friends-title">Here together</h3><div id="planet-people" class="planet-people"></div><button type="button" id="planet-chat-toggle" class="btn ghost">Talk nearby</button></section>
  <section class="planet-panel-section" aria-labelledby="planet-activity-title"><h3 id="planet-activity-title">Made while you’re here</h3><div id="planet-activity" class="planet-activity"><p>Shared changes appear here as they happen during this visit.</p></div></section>
  <section id="planet-environment" class="planet-panel-section" aria-label="Weather and light"></section>
  <section id="planet-listening-settings-section" class="planet-panel-section" aria-labelledby="planet-listening-title"><h3 id="planet-listening-title">Your listening · Only what you hear</h3><button type="button" id="planet-listening-toggle" class="btn ghost" aria-pressed="false">Turn sound on</button><label for="chorus-volume">Work volume <input id="chorus-volume" type="range" min="0" max="100" value="70"/></label><p>Work volume and Listen closely change only your mix of contributions. Sound off also silences residents. Adding, answering and withdrawing change the shared work.</p><label id="planet-examples-label" class="planet-examples-label"><input id="planet-examples" type="checkbox" checked/> World sound examples</label><p id="planet-examples-note">See how coffee, birds and gulls answer sounds. Examples are local demonstrations; your friends' sounds stay when you turn them off.</p><button type="button" id="chorus-notebook" class="btn ghost">Our works</button><button type="button" id="chorus-welcome-again" class="btn ghost">Show the invitation again</button><button type="button" id="chorus-overview" class="btn ghost" aria-pressed="false">World overview</button></section>
  <details id="planet-help" class="planet-help"><summary>Moving, listening &amp; looking</summary><p>Walk with W A S D or the arrows. Hold Shift to run; Space jumps. Drag to look; click the ground to walk there. On a phone, use the arrows and Run / Jump buttons.</p><p>First person brings you close to the little details. Third person lets you see your character and the people you meet.</p><label class="planet-look" for="planet-look-settings">Look direction<select id="planet-look-settings"><option value="follow">Follow pointer</option><option value="scene">Drag the scene</option></select></label><p class="planet-form-note">Follow pointer: down looks down, left looks left. Drag the scene reverses both directions. Saved in this browser.</p><p>Choose a sound, listen privately, then share it where you stand. Click its named marker or press E beside it to Respond to sound. Real replies form threads around the globe. Meet the kangaroo at the green: invite it along, then jump and play together.</p><a href="/about#how">How sounds and privacy work</a></details>
  <details class="planet-restroom"><summary>Restrooms &amp; doors</summary><p>A red lamp means someone is in. Occupied doors stay locked, including during residents' own visits. Flush or run the shower inside; your stay sound ends when you come out.</p><p id="planet-occupancy" role="status" aria-live="polite">Walk to the restrooms to see the shared door state.</p></details>
  <a class="planet-coast-link" href="/scene/seaside">Visit the coastal world <span aria-hidden="true">↗</span></a>
  <p class="planet-edition-note">A separate edition. Everything you left at the coast stays at the coast.</p>
  <p class="planet-project-note">${NOT_AFFILIATED} <a href="/about">Sources &amp; privacy</a></p>
</dialog>
<dialog id="planet-join" class="planet-dialog planet-arrival" aria-labelledby="planet-join-title" hidden>
  <p class="planet-kicker">Welcome to Little Chorus</p><h2 id="planet-join-title">A little room for you.</h2>
  <p>Bring a friend, leave a sound, and see what this world becomes. A quiet nook or a lively gathering is yours to make together.</p>
  <form id="planet-join-form" method="post" action="/join">
    <input type="hidden" name="next" value="${escapeHtml(invitationHref(work))}"/>
    <label class="planet-name" for="planet-nickname">Your name here<input id="planet-nickname" name="nickname" maxlength="24" autocomplete="nickname" required value="${escapeHtml(user?.nickname ?? "")}" placeholder="A nickname is fine"/></label>
    <fieldset class="planet-avatars"><legend>Come as</legend><label><input type="radio" name="avatar" value="cat"${avatar === "cat" ? " checked" : ""}/>${avatarMark("cat")} A cat</label><label><input type="radio" name="avatar" value="dog"${avatar === "dog" ? " checked" : ""}/>${avatarMark("dog")} A dog</label></fieldset>
    <details><summary>Look direction</summary><label class="planet-look" for="planet-look">Mouse or trackpad<select id="planet-look" name="look-mode"><option value="follow">Follow pointer</option><option value="scene">Drag the scene</option></select></label>
    <p id="planet-look-hint" class="planet-form-note">Follow pointer: drag down to look down, left to look left. You can change this later.</p></details>
    <p id="planet-join-error" class="planet-form-error" role="alert" hidden></p>
    <button type="submit" id="planet-enter" class="btn primary">Find my place</button>
    <button type="button" id="planet-observe" class="planet-observe">Just look around first</button>
  </form>
  <p class="planet-form-note">Your name is visible to people you meet. No account or email.</p>
</dialog>
<noscript><p class="noscript">This little world needs JavaScript. <a href="/explore">Choose a place</a>.</p></noscript>
<script type="application/json" id="planet-boot">${embed({ snapshot: snap, joined, view: "3d", user: user ? { nickname: user.nickname, avatar: user.avatar } : null })}</script>
<script type="module" src="/client/planet.js"></script>`,
  );
}

export function renderAbout(): string {
  return page(
    "Sources and privacy — Little Chorus",
    "about",
    `${nav}
<main class="prose">
  <h1>Sources and privacy</h1>
  <p><strong>${NOT_AFFILIATED}</strong></p>

  <h2 id="how">How it works</h2>
  <p>Little Chorus has two editions: <a href="/planet">the little world</a> and <a href="/scene/seaside">the coast</a>. Each keeps its own sounds and shared sky. Your name and character work in both.</p>
  <ol>
    <li>Open the place. Give a name and come as a cat or a dog. No account.</li>
    <li>Walk with W A S D or the arrow keys, drag to look, or choose a destination. On the coastal forest trail, a kangaroo points you back if you wander too far.</li>
    <li>Everyone in the place sees everyone else. Come within a few steps of someone and you can talk: your words show over your head for five seconds, or until you say something new, and only people nearby see them.</li>
    <li>Leave a sound where you stand: it shows as a coloured light (blue for water and wind, green for animals, orange for people) and plays from there for everyone until someone standing beside it removes it. It stays after you leave. Anyone can leave or remove any sound, and everyone is told who did.</li>
    <li>Find someone else's sound and choose <em>Reply with a sound</em>. Walk to a spot, choose your answer, and leave it there. The two sounds stay connected in their conversation.</li>
  </ol>

  <h2>Where the place comes from</h2>
  <p>It's imagined, not a real location. Surface grain, furniture, food, plants and skies use free CC0 (public domain) assets from <a href="https://polyhaven.com">Poly Haven</a>, brought into the same painted palette. Each external asset and its author is recorded in <code>public/assets-manifest.json</code>. Trees, buildings, water and animal people use original three-dimensional geometry. The café's coastal mural is original AI-generated artwork, recorded separately from external CC0 assets. Earlier material studies remain documented in the manifest.</p>
  <p>Nature and everyday recordings come from <a href="https://commons.wikimedia.org">Wikimedia Commons</a>, with CC0 or public-domain permissions. Warm chords, Soft pulse and Little bell notes are original Little Chorus scores made with coding-agent assistance, with no sampled music. In the little world they share a gentle 72 BPM pulse; natural textures keep their own rhythm and short events have quiet intervals. Each source and processing step is recorded separately in <code>public/assets-manifest.json</code>.</p>

  <h2>What is stored</h2>
  <ul>
    <li>Your nickname, cat-or-dog choice, and a random session token (the server keeps only its hash). No email, no account, no location.</li>
    <li>Where you stand and what you say are never stored: they go to the people in the place as they happen, and are gone.</li>
    <li>Sounds you leave are stored with your nickname, where and when, and stay public until someone removes them; who removed one is stored too.</li>
    <li>Withdrawing stops an ingredient from playing. Its author and response relationships remain visible in the work's history. Local volume, focused listening and Sound off change only your listening.</li>
  </ul>
</main>
${footer}`,
  );
}

export function renderReadme(): string {
  return page(
    "About — Little Chorus",
    "about",
    `${nav}
<main class="prose readme">
${renderProjectMarkdown(readmeSource, "README.md")}
</main>
${footer}`,
  );
}

export function renderProjectNote(slug: string): string | null {
  if (!Object.hasOwn(PROJECT_NOTES, slug)) return null;
  const note = PROJECT_NOTES[slug as keyof typeof PROJECT_NOTES];
  const source = readFileSync(new URL(`../${note.file}`, import.meta.url), "utf8");
  return page(
    `${note.title} — Little Chorus`,
    "about",
    `${nav}
<main class="prose readme project-note">
<p><a href="/readme/">← About Little Chorus</a></p>
${renderProjectMarkdown(source, note.file)}
</main>
${footer}`,
  );
}

export function renderNotFound(message: string): string {
  return page(
    "Not found — Little Chorus",
    "about",
    `<header class="site-bar"><a class="brand" href="/">Little Chorus</a></header>
<main class="prose"><h1>Not here</h1><p>${escapeHtml(message)}</p><p><a href="/explore">Choose a place</a></p></main>`,
  );
}
