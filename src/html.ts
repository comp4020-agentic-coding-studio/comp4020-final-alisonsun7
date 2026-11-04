import { readFileSync } from "node:fs";
import { marked } from "marked";
import { SCENES, SOUNDS, type Mode, type Scene } from "./shared/catalog.js";
import type { MemorySnapshot, MemorySummary, Person, Snapshot } from "./shared/protocol.js";
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
<meta name="description" content="A campus comes alive through the sounds we leave behind." />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='5' fill='%23d9a25b'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23d9a25b' stroke-width='2' opacity='.6'/%3E%3Ccircle cx='16' cy='16' r='15' fill='none' stroke='%23d9a25b' stroke-width='1.5' opacity='.3'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" />
<link rel="stylesheet" href="/client/style.css" />
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;

const footer = `<footer class="site-footer">
  <p>${NOT_AFFILIATED}</p>
  <p><a href="/about">Sources, sounds and privacy</a> · <a href="/readme/">About this app</a> · <a href="/archive">Archive</a></p>
</footer>`;

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
  <p class="fine">No account. Your nickname is shown to people in the same place, and on any memory you help make, which is listed in the public archive.</p>
  <button type="submit" class="btn primary">Join</button>
</form>`;
}

export function renderLanding(user: User | null): string {
  return page(
    "Sound of a City — ANU Edition",
    "landing",
    `<main class="hero">
  <div class="hero-photo" aria-hidden="true"></div>
  <div class="hero-text">
    <p class="kicker">ANU Edition</p>
    <h1>Sound of a City</h1>
    <p class="subtitle">A campus comes alive through the sounds we leave behind.</p>
    <p class="lede">Walk through ANU, add an everyday sound, and create a shared memory of place.</p>
    <p class="actions">
      <a class="btn primary" href="/explore">Enter the Campus</a>
      <a class="btn ghost" href="/about#how">How it Works</a>
    </p>
    ${user ? `<p class="fine">Welcome back, ${escapeHtml(user.nickname)}.</p>` : ""}
    <p class="independent">An independent student project inspired by ANU.</p>
  </div>
</main>
${footer}`,
  );
}

export interface PlaceSummary {
  sceneId: string;
  mode: string;
  online: number;
  sounds: number;
  status: string;
}

function placeLine(p: PlaceSummary | undefined): string {
  if (!p) return "";
  const people = p.online === 0 ? "nobody here" : `${p.online} ${p.online === 1 ? "person" : "people"} here`;
  const sounds = p.sounds === 0 ? "silent" : `${p.sounds} ${p.sounds === 1 ? "sound" : "sounds"}`;
  const rec = p.status === "active" ? " · recording a memory" : "";
  return `${people} · ${sounds}${rec}`;
}

export function renderExplore(user: User | null, places: PlaceSummary[], error: string | null): string {
  const find = (sceneId: string, mode: string): PlaceSummary | undefined => places.find((p) => p.sceneId === sceneId && p.mode === mode);
  const order = ["chifley-path", "lab-cafe", "marie-reay-ground"];
  const cards = order
    .map((id) => SCENES.find((s) => s.id === id)!)
    .map((scene) => {
      const thumb = scene.shots[0].thumb;
      const modes = scene.modes
        .map(
          (m) => `<li><a class="mode-link" href="/scene/${scene.id}?mode=${m.id}">
            <span class="mode-label">${m.label}</span>
            <span class="place-live" data-scene="${scene.id}" data-mode="${m.id}">${placeLine(find(scene.id, m.id))}</span>
          </a></li>`,
        )
        .join("");
      return `<article class="place-card${scene.evidence === "placeholder" ? " is-placeholder" : ""}">
        <a class="place-image" href="/scene/${scene.id}?mode=${scene.modes[0].id}" tabindex="-1" aria-hidden="true">
          ${thumb ? `<img src="${thumb}" alt="" loading="lazy" />` : `<span class="placeholder-art">Reference pending</span>`}
        </a>
        <div class="place-body">
          <h2>${scene.title}</h2>
          <p>${scene.summary}</p>
          ${scene.evidence === "placeholder" ? `<p class="badge">Placeholder: no photo of the real café yet</p>` : `<p class="badge real">From real photos</p>`}
          <ul class="modes">${modes}</ul>
        </div>
      </article>`;
    })
    .join("\n");

  return page(
    "Places — Sound of a City",
    "explore",
    `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/archive">Archive</a> <a href="/about">About</a></nav>
</header>
<main class="explore-main">
  <h1>Choose a place</h1>
  <p class="lede">Each place starts silent. Whoever is there adds the everyday sounds that make it feel alive, and everyone in the place hears them.</p>
  ${
    user
      ? `<form method="post" action="/leave" class="you-are">${avatarMark(user.avatar)} You're <strong>${escapeHtml(user.nickname)}</strong>. <button class="link-btn" type="submit">Change</button></form>`
      : `<details class="join-box"${error ? " open" : ""}><summary>Join to add sounds (you can look around first)</summary>${joinForm("/explore", error)}</details>`
  }
  <div class="places">${cards}</div>
</main>
${footer}`,
  );
}

const shotStrip = (scene: Scene, current: string): string =>
  scene.shots.length < 2
    ? ""
    : `<nav class="shots" id="shots" aria-label="Views of this place">${scene.shots
        .map(
          (s) => `<a class="shot-thumb" href="?shot=${s.id}" data-shot="${s.id}"${s.id === current ? ' aria-current="true"' : ""}>
      ${s.thumb ? `<img src="${s.thumb}" alt="" loading="lazy" />` : ""}<span>${s.title}</span><span class="count" data-count="${s.id}"></span></a>`,
        )
        .join("")}</nav>`;

export function renderScene(scene: Scene, mode: Mode, shotId: string, snap: Snapshot, user: User | null): string {
  const shot = scene.shots.find((s) => s.id === shotId)!;
  const modeNav =
    scene.modes.length > 1
      ? `<nav class="mode-switch" aria-label="Time of day">${scene.modes
          .map((m) => `<a href="/scene/${scene.id}?mode=${m.id}"${m.id === mode.id ? ' aria-current="page"' : ""}>${m.label}</a>`)
          .join("")}</nav>`
      : "";
  const next = `/scene/${scene.id}?mode=${mode.id}`;
  const listed = snap.placements
    .map((p) => `<li>${escapeHtml(SOUNDS[p.soundId].label)} — ${escapeHtml(p.ownerName)}</li>`)
    .join("");

  return page(
    `${scene.title} · ${mode.label} — Sound of a City`,
    `scene-page scene-${scene.id} mode-${mode.id}`,
    `<header class="bar">
  <a class="back" href="/explore"><span aria-hidden="true">←</span> Places</a>
  <div class="where"><h1>${scene.title}</h1><span class="mode-name">${mode.label}</span></div>
  <div class="people" id="people" aria-live="polite"></div>
  <button type="button" class="sound-toggle" id="sound-toggle" aria-pressed="false" disabled>Enable sound</button>
</header>
${modeNav}
<main class="scene-main">
  <section class="stage-area" aria-label="The place">
    <div class="stage-frame" id="stage-frame">
      <div class="stage" id="stage" style="--aspect:${shot.aspect}">
        ${shot.image ? `<img class="photo" src="${shot.image}" alt="${escapeHtml(shot.evidence)}" />` : ""}
      </div>
    </div>
    <p class="hint" id="hint" aria-live="polite">${snap.placements.length === 0 ? "This place has its shape, but not yet its sound. Add the first everyday moment." : ""}</p>
    ${shotStrip(scene, shot.id)}
    <p class="evidence" id="evidence"><span class="label">Photo</span> <span id="evidence-text">${escapeHtml(shot.evidence)}</span></p>
    ${mode.note ? `<p class="mode-note">${escapeHtml(mode.note)}</p>` : ""}
    ${scene.evidence === "placeholder" ? `<p class="placeholder-note">Visual placeholder. This is not LAB ANU's real interior: no licensed photo yet.</p>` : ""}
    <p class="fine not-affiliated">${NOT_AFFILIATED} <a href="/about">Sources</a></p>
  </section>
  <aside class="panel" aria-label="Sounds here">
    <section class="session" id="session" aria-live="polite"></section>
    <section class="now-playing">
      <h2>Now playing</h2>
      <h3>Your sounds</h3>
      <ul class="sound-list" id="mine"></ul>
      <h3>Others' sounds</h3>
      <ul class="sound-list" id="theirs">${listed}</ul>
    </section>
    <label class="ambience"><input type="checkbox" id="ambience" disabled /> Background ${mode.ambience === "room" ? "room tone" : mode.ambience}</label>
  </aside>
</main>
<section class="tray${user ? "" : " tray-join"}" id="tray" aria-label="Add a sound">
  ${
    user
      ? `<div class="tray-head"><h2>Add a sound</h2><button type="button" class="link-btn" id="tray-toggle" aria-expanded="true">Hide</button></div>
  <div class="tray-body" id="tray-body"><div class="cats" id="cats" role="tablist" aria-label="Kinds of sound"></div><div class="chips" id="chips" role="tabpanel" aria-label="Sounds of this kind"></div></div>`
      : `<div class="tray-head"><h2>Join to add a sound</h2></div>${joinForm(next, null)}`
  }
</section>
<div class="status" id="status" role="status" aria-live="polite"></div>
<div class="toast" id="toast" aria-live="polite"></div>
<noscript><p class="noscript">This place needs JavaScript to show people and play sound.</p></noscript>
<script type="application/json" id="boot">${embed({ sceneId: scene.id, mode: mode.id, shotId: shot.id, snapshot: snap, joined: user !== null })}</script>
<script type="module" src="/client/scene.js"></script>`,
  );
}

const personList = (people: Person[]): string =>
  people.length === 0 ? "nobody" : people.map((p) => `${avatarMark(p.avatar)}${escapeHtml(p.name)}`).join(", ");

export function renderMemory(m: MemorySnapshot): string {
  const scene = SCENES.find((s) => s.id === m.sceneId);
  const sounds = m.placements
    .map((p) => {
      const shot = scene?.shots.find((s) => s.id === p.shotId);
      const anchor = shot?.anchors.find((a) => a.id === p.anchorId);
      return `<li><strong>${escapeHtml(SOUNDS[p.soundId]?.label ?? p.soundId)}</strong> at ${escapeHtml(anchor?.label ?? p.anchorId)}${
        shot ? ` (${escapeHtml(shot.title)})` : ""
      } — ${escapeHtml(p.ownerName)}, volume ${Math.round(p.gain * 100)}%</li>`;
    })
    .join("");
  const started = new Date(m.startedAt);
  const changes = m.timeline.filter((e) => e.t > 0).length;

  return page(
    `${m.title} — Sound of a City`,
    `memory-page scene-${m.sceneId} mode-${m.mode}`,
    `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/explore">Places</a> <a href="/archive">Archive</a></nav>
</header>
<main class="memory-main">
  <p class="kicker">A shared memory</p>
  <h1>${escapeHtml(m.title)}</h1>
  <p class="when"><time datetime="${m.startedAt}">${started.toISOString().slice(0, 16).replace("T", " ")} UTC</time>
    · <span id="local-time" data-iso="${m.startedAt}"></span> · ${Math.round(m.durationMs / 1000)} seconds</p>
  <div class="memory-layout">
    <section class="stage-area" aria-label="Replay">
      <div class="stage-frame"><div class="stage" id="stage"></div></div>
      <div class="replay-bar">
        <button type="button" class="btn primary" id="play" disabled>Play the memory</button>
        <button type="button" class="btn ghost" id="final" disabled>Hear how it ended</button>
        <input type="range" id="scrub" min="0" max="${m.durationMs}" value="${m.durationMs}" step="100" aria-label="Position in the memory" disabled />
        <span class="clock" id="clock"></span>
      </div>
      <nav class="shots" id="shots" aria-label="Views of this place"></nav>
      <p class="fine">${changes > 0 ? `Replay rebuilds the place from the ${changes} changes people made while it was recording, at the moments they made them.` : "Nobody changed anything while it was recording, so replay plays the sounds as they were."}</p>
    </section>
    <aside class="panel">
      <h2>Who made it</h2>
      <p class="people-line">${personList(m.contributors)}</p>
      ${m.listeners.length ? `<p class="fine">Also there, listening: ${personList(m.listeners)}</p>` : ""}
      <h2>Sounds as it ended</h2>
      <ul class="memory-sounds">${sounds || "<li>No sounds: this place stayed quiet.</li>"}</ul>
      <p class="fine">Every sound is synthesised in your browser by this app (original, no recordings). Nothing anyone said was recorded.</p>
      <p class="share"><a href="/memory/${m.memoryId}">Link to this memory</a></p>
    </aside>
  </div>
</main>
${footer}
<script type="application/json" id="boot">${embed(m)}</script>
<script type="module" src="/client/memory.js"></script>`,
  );
}

export function renderArchive(memories: MemorySummary[]): string {
  const cards = memories
    .map((m) => {
      const scene = SCENES.find((s) => s.id === m.sceneId);
      const thumb = scene?.shots[0].thumb;
      return `<li class="memory-card"><a href="/memory/${m.id}">
        ${thumb ? `<img src="${thumb}" alt="" loading="lazy" />` : `<span class="placeholder-art">LAB ANU</span>`}
        <span class="memory-title">${escapeHtml(m.title)}</span>
        <span class="memory-meta"><time datetime="${m.savedAt}">${m.savedAt.slice(0, 16).replace("T", " ")} UTC</time> · ${m.sounds} ${m.sounds === 1 ? "sound" : "sounds"}</span>
        <span class="memory-meta">${m.contributors.length ? `by ${m.contributors.map(escapeHtml).join(", ")}` : "nobody added a sound"}</span>
      </a></li>`;
    })
    .join("");
  return page(
    "Archive — Sound of a City",
    "archive",
    `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/explore">Places</a> <a href="/about">About</a></nav>
</header>
<main class="archive-main">
  <h1>Archive</h1>
  <p class="lede">Every visit leaves a different soundscape.</p>
  ${cards ? `<ul class="memory-grid">${cards}</ul>` : `<p class="empty">No memories yet. Go to a place, add a sound, and start a 3-minute memory.</p>`}
</main>
${footer}`,
  );
}

export function renderAbout(): string {
  return page(
    "Sources, sounds and privacy — Sound of a City",
    "about",
    `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/explore">Places</a> <a href="/archive">Archive</a></nav>
</header>
<main class="prose">
  <h1>Sources, sounds and privacy</h1>
  <p><strong>${NOT_AFFILIATED}</strong></p>

  <h2 id="how">How it works</h2>
  <ol>
    <li>Pick a place. It starts silent: the shape of a real ANU space, without its sound.</li>
    <li>Choose a name and a cat or a dog. No account.</li>
    <li>Pick an everyday sound and put it where it belongs: a lift chime at the lifts, a tap at the sink. A figure appears doing that thing, and everyone in the place sees and hears it within about a second.</li>
    <li>Anyone can start a 3-minute memory. The server keeps the clock, so everyone sees the same time. When it ends, the place is saved as it sounded, with everyone's names, and starts silent again.</li>
    <li>Saved memories are in the <a href="/archive">archive</a>; replay rebuilds them change by change.</li>
  </ol>
  <p>You can change or remove only your own sounds. Sound only starts after you press <em>Enable sound</em>.</p>

  <h2>Where the pictures come from</h2>
  <p>Every scene photo was taken by the project's author on the ANU campus (the Chifley bridge at night on 4 November 2026) and is published with their permission. Before publishing, everyone who appears in a photo, and a TV screen showing people, was blurred beyond recognition, and the photos' metadata (time, phone, location) was removed.</p>
  <ul>
    <li><strong>Marie Reay Teaching Centre, ground floor:</strong> six photos — the lift lobby, the lifts, the orange stair, the stair and tiered seats, the tea point, and the entrance from the Chifley bridge. The tea point faces the recycling bins (the author's own observation). The photos don't give distances or a floor plan, and none is implied: moving between views only changes which photo you're looking at.</li>
    <li><strong>Chifley bridge:</strong> one photo, taken at night after rain. <em>Rainy Dusk</em> is that photo with falling rain added. <em>Early Morning</em> and <em>Busy Weekday</em> are colour grades of the same photo, not photographs taken at those times.</li>
    <li><strong>LAB ANU:</strong> a placeholder drawing. There is no licensed photo of the café yet, so its real layout isn't shown or claimed.</li>
  </ul>
  <p>The people are drawn figures, not photographs, and are deliberately simple. They stand for the sounds people add, one figure per sound.</p>

  <h2>Where the sounds come from</h2>
  <p>Every sound is synthesised in your browser with the Web Audio API by this app's own code. There are no recordings, no music and no third-party audio. Nothing is recorded from your microphone.</p>

  <h2>What is stored</h2>
  <ul>
    <li>Your nickname, cat-or-dog choice, and a random session token (the server keeps only its hash). No email, no account, no location.</li>
    <li>Which sounds you placed, where, at what volume and when.</li>
    <li>Saved memories, with the nicknames of the people who made them, listed publicly in the archive.</li>
  </ul>
</main>
${footer}`,
  );
}

export function renderReadme(): string {
  return page(
    "About — Sound of a City",
    "about",
    `<header class="site-bar">
  <a class="brand" href="/">Sound of a City</a>
  <nav><a href="/explore">Places</a> <a href="/archive">Archive</a></nav>
</header>
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
