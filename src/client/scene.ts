// The live place. Shows the server's state and nothing else: a sound appears
// as placed only when the server has committed it, so the page never claims
// a change that wasn't saved.
import { CATEGORIES, SOUNDS, checkPlace, findScene, findShot, soundsIn, type Scene, type SoundId } from "../shared/catalog.js";
import { REJECT_MESSAGES, type Committed, type Person, type Placement, type ServerMessage, type Snapshot } from "../shared/protocol.js";
import { applyCommitted, formatClock, remainingMs, type LiveState } from "../shared/state.js";
import { AudioEngine } from "./audio.js";
import { newOperationId, sendOp, type OpBody } from "./ops.js";
import { drawShot, drawWeather, pulse } from "./stage.js";
import { WorldView } from "./world.js";

interface Boot {
  sceneId: string;
  mode: string;
  shotId: string;
  snapshot: Snapshot;
  joined: boolean;
}

const boot = JSON.parse(document.getElementById("boot")!.textContent!) as Boot;
const scene = findScene(boot.sceneId) as Scene;
const mode = scene.modes.find((m) => m.id === boot.mode)!;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $("stage");
const status = $("status");
const toast = $("toast");
const hint = $("hint");

let live: LiveState = { snapshot: boot.snapshot, gap: false };
let shotId = boot.shotId;
// offset between the server's clock and this browser's, so the countdown is
// the server's time, not whatever this machine thinks
let skewMs = Date.parse(boot.snapshot.serverNow) - Date.now();
let connected = false;
let choosing: SoundId | null = null;
let selected: string | null = null;
let category = CATEGORIES[0];
const pending = new Set<string>();

const audio = new AudioEngine(mode.ambience);
audio.indoorAmbience = scene.indoorAmbience ?? "room";
const me = (): Person | null => live.snapshot.you;

// The walkable world (ADR 004) instead of a photo: the zone you're standing
// in plays the part of the shot you're looking at.
const world =
  scene.view === "world"
    ? new WorldView(stage, scene, mode.id, {
        startZone: shotId,
        onZone: (zone) => {
          shotId = zone;
          history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&shot=${zone}`);
          render();
        },
        onListen: (l) => audio.listen(l.x, l.y, l.z, l.yaw, l.inside, l.ambience),
      })
    : null;

// ---- server messages ----------------------------------------------------

function onSnapshot(snap: Snapshot): void {
  const sessionChanged = snap.sessionId !== live.snapshot.sessionId;
  live = { snapshot: snap, gap: false };
  skewMs = Date.parse(snap.serverNow) - Date.now();
  if (selected && !snap.placements.some((p) => p.id === selected)) selected = null;
  // The new, empty session arrives right after "saved": keep the link to
  // the memory in what people read, rather than replacing it.
  if (sessionChanged && snap.status === "idle") {
    say(
      "A place, made alive together. It's silent again, ready for the next memory.",
      snap.lastMemoryId ? `/memory/${snap.lastMemoryId}` : undefined,
    );
  }
  render();
}

function onCommitted(ev: Committed): void {
  const before = live.snapshot;
  live = applyCommitted(live, ev);
  if (live.gap) {
    // We missed something: never guess, refetch the whole state.
    void refetch();
    return;
  }
  if (live.snapshot === before) return;
  skewMs = Date.parse(ev.serverAt) - Date.now();
  const mine = ev.by !== null && ev.by === me()?.id;
  const p = ev.payload;
  if (!mine) {
    const who = live.snapshot.online.find((x) => x.id === ev.by)?.name ?? before.placements.find((x) => x.ownerId === ev.by)?.ownerName ?? "Someone";
    if (p.kind === "sound.add") say(`${p.placement.ownerName} added ${SOUNDS[p.placement.soundId].label.toLowerCase()} at ${anchorLabel(p.placement)}.`);
    if (p.kind === "sound.remove") say(`${who} removed a sound.`);
    if (p.kind === "session.start") say(`${who} started a 3-minute memory.`);
  }
  if (p.kind === "session.saved") say("A place, made alive together.", `/memory/${p.memoryId}`);
  if (p.kind === "session.failed") say(p.error);
  render();
}

async function refetch(): Promise<void> {
  try {
    const res = await fetch(`/api/sessions/${live.snapshot.sessionId}`);
    if (res.ok) onSnapshot((await res.json()) as Snapshot);
  } catch {
    // the stream's reconnect will bring a snapshot
  }
}

let source: EventSource | null = null;

function connect(): void {
  source?.close();
  source = new EventSource(`/api/stream?scene=${encodeURIComponent(scene.id)}&mode=${encodeURIComponent(mode.id)}`);
  source.onopen = () => {
    connected = true;
    renderStatus();
  };
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    if (msg.type === "snapshot") onSnapshot(msg);
    else if (msg.type === "committed") onCommitted(msg);
    else if (msg.type === "presence" && msg.sessionId === live.snapshot.sessionId) {
      live = { ...live, snapshot: { ...live.snapshot, online: msg.online } };
      renderPeople();
    }
    if (!connected) {
      connected = true;
      renderStatus();
    }
  };
  // EventSource reconnects by itself; every reconnect starts with a fresh
  // snapshot from the server, so nothing missed is replayed or lost.
  source.onerror = () => {
    connected = false;
    renderStatus();
  };
}

// ---- sending ------------------------------------------------------------

async function send(body: OpBody, waiting: string): Promise<boolean> {
  if (!connected) {
    say("Connection lost. New changes aren't saved yet.");
    return false;
  }
  const id = newOperationId();
  pending.add(id);
  renderStatus(waiting);
  const result = await sendOp(live.snapshot.sessionId, body, id);
  pending.delete(id);
  if (!result.ok) {
    if (result.code === "stale" && result.placement) await refetch();
    say(REJECT_MESSAGES[result.code] ?? result.message);
    renderStatus();
    return false;
  }
  // Apply what the server committed now, rather than waiting for the echo on
  // the stream; the echo is then ignored as already seen.
  for (const c of result.committed) onCommitted(c);
  renderStatus();
  return true;
}

// A volume slider sends on every step, and a step sent before the last one
// came back would carry an old revision and be refused as someone else's
// change. So steps for one sound wait their turn, and only the latest waiting
// value is sent, with the revision the previous step produced.
const volumeWaiting = new Map<string, number>();

async function setVolume(placementId: string, gain: number): Promise<void> {
  const sending = volumeWaiting.has(placementId);
  volumeWaiting.set(placementId, gain);
  if (sending) return;
  while (volumeWaiting.has(placementId)) {
    const next = volumeWaiting.get(placementId)!;
    const p = live.snapshot.placements.find((x) => x.id === placementId);
    if (!p) break;
    const ok = await send({ type: "sound.update", placementId, baseRevision: p.revision, gain: next }, "Saving…");
    if (!ok || volumeWaiting.get(placementId) === next) break;
  }
  volumeWaiting.delete(placementId);
}

async function place(anchorId: string, inShot = shotId): Promise<void> {
  if (!choosing) {
    say("Choose a sound below first, then a spot for it.");
    document.querySelector<HTMLElement>(".chip")?.focus();
    return;
  }
  const check = checkPlace(scene.id, inShot, anchorId, choosing);
  if (!check.ok) {
    say(REJECT_MESSAGES[check.code]);
    return;
  }
  const soundId = choosing;
  const ok = await send({ type: "sound.add", soundId, shotId: inShot, anchorId, gain: 0.7 }, "Saving your sound…");
  if (ok) {
    choosing = null;
    say(`Sound saved. Everyone here can hear it.${audio.enabled ? "" : " Enable sound to hear it too."}`);
    render();
  }
}

// ---- rendering ----------------------------------------------------------

function anchorLabel(p: Pick<Placement, "shotId" | "anchorId">): string {
  const shot = findShot(scene, p.shotId);
  const a = shot?.anchors.find((x) => x.id === p.anchorId);
  return `${a?.label.toLowerCase() ?? p.anchorId}${shot && shot.id !== shotId ? ` (${shot.title})` : ""}`;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string, link?: string): void {
  toast.textContent = "";
  const p = document.createElement("p");
  p.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.textContent = "View memory";
    p.append(" ", a);
  }
  toast.append(p);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), link ? 12000 : 4500);
}

function renderStatus(waiting?: string): void {
  status.className = `status${connected ? "" : " offline"}`;
  status.textContent = !connected
    ? "Connection lost. New changes aren't saved yet."
    : pending.size > 0
      ? (waiting ?? "Saving…")
      : "";
}

function renderPeople(): void {
  const online = live.snapshot.online;
  const box = $("people");
  box.textContent = "";
  const n = document.createElement("span");
  n.className = "online-count";
  n.textContent = online.length === 0 ? "Nobody here yet" : `${online.length} here`;
  box.append(n);
  for (const p of online.slice(0, 6)) {
    const chip = document.createElement("span");
    chip.className = `person avatar-${p.avatar}${p.id === me()?.id ? " is-you" : ""}`;
    chip.textContent = p.id === me()?.id ? `${p.name} (you)` : p.name;
    box.append(chip);
  }
}

function soundRow(p: Placement, mine: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `sound-row${p.id === selected ? " selected" : ""}`;
  li.dataset.placement = p.id;
  const name = document.createElement("button");
  name.type = "button";
  name.dataset.focusKey = `name:${p.id}`;
  name.className = "sound-name";
  name.textContent = SOUNDS[p.soundId].label;
  name.onclick = () => {
    selected = p.id;
    if (p.shotId !== shotId) goShot(p.shotId);
    else render();
  };
  const where = document.createElement("span");
  where.className = "where";
  where.textContent = mine ? anchorLabel(p) : `${p.ownerName} · ${anchorLabel(p)}`;
  li.append(name, where);

  if (mine) {
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.step = "5";
    vol.value = String(Math.round((volumeWaiting.get(p.id) ?? p.gain) * 100));
    vol.setAttribute("aria-label", `Volume of your ${SOUNDS[p.soundId].label.toLowerCase()}`);
    vol.dataset.focusKey = `vol:${p.id}`;
    vol.onchange = () => void setVolume(p.id, Number(vol.value) / 100);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.focusKey = `remove:${p.id}`;
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove your ${SOUNDS[p.soundId].label.toLowerCase()}`);
    remove.onclick = async () => {
      if (await send({ type: "sound.remove", placementId: p.id, baseRevision: p.revision }, "Removing…")) say("Sound removed.");
    };
    li.append(vol, remove);
  } else {
    const vol = document.createElement("span");
    vol.className = "vol";
    vol.textContent = `${Math.round(p.gain * 100)}%`;
    li.append(vol);
  }
  return li;
}

function renderLists(): void {
  const mine = $("mine");
  const theirs = $("theirs");
  mine.textContent = "";
  theirs.textContent = "";
  const myId = me()?.id;
  const ps = live.snapshot.placements;
  for (const p of ps) (p.ownerId === myId ? mine : theirs).append(soundRow(p, p.ownerId === myId));
  if (!mine.children.length) mine.innerHTML = `<li class="empty">${boot.joined ? "None yet." : "Join to add sounds."}</li>`;
  if (!theirs.children.length) theirs.innerHTML = `<li class="empty">None yet.</li>`;

  for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
    const n = ps.filter((p) => p.shotId === el.dataset.count).length;
    el.textContent = n ? String(n) : "";
  }
}

function renderSession(): void {
  const box = $("session");
  const s = live.snapshot;
  box.textContent = "";
  const h = document.createElement("h2");
  const p = document.createElement("p");
  p.className = "fine";
  box.append(h);

  if (s.status === "idle") {
    h.textContent = "Start a 3-minute memory";
    p.textContent = "When it starts, everyone here gets the same three minutes. At the end the place is saved as it sounds, with everyone's names, and starts silent again.";
    box.append(p);
    if (boot.joined) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn primary";
      b.textContent = "Start a 3-minute memory";
      b.onclick = async () => {
        if (await send({ type: "session.start" }, "Starting…")) say(s.online.length < 2 ? "Recording. It's better with someone else here: send them this page's link." : "Recording. Everyone here has three minutes.");
      };
      box.append(b);
    }
  } else if (s.status === "active") {
    h.innerHTML = `Time remaining <span class="clock" id="clock"></span>`;
    const starter = s.online.find((x) => x.id === s.startedBy)?.name;
    p.textContent = starter ? `${starter} started this memory. It saves itself at the end.` : "It saves itself at the end.";
    box.append(p);
    const bar = document.createElement("div");
    bar.className = "progress";
    bar.innerHTML = `<span id="progress"></span>`;
    box.append(bar);
    if (s.startedBy && s.startedBy === me()?.id) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn ghost";
      b.textContent = "Save this memory now";
      b.onclick = () => void send({ type: "session.finish" }, "Saving the memory…");
      box.append(b);
    }
    tickClock();
  } else if (s.status === "ending") {
    h.textContent = "Saving this memory…";
  } else if (s.status === "failed") {
    h.textContent = "The memory wasn't saved";
    p.textContent = s.error ?? REJECT_MESSAGES.save_failed;
    box.append(p);
    if (boot.joined) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn primary";
      b.textContent = "Try saving again";
      b.onclick = () => void send({ type: "session.finish" }, "Saving the memory…");
      box.append(b);
    }
  } else {
    h.textContent = "Saved";
  }

  if (s.lastMemoryId && s.status !== "saved") {
    const a = document.createElement("a");
    a.href = `/memory/${s.lastMemoryId}`;
    a.className = "last-memory";
    a.textContent = "View the last memory made here";
    box.append(a);
  }
}

function tickClock(): void {
  const clock = document.getElementById("clock");
  const bar = document.getElementById("progress");
  const s = live.snapshot;
  if (!clock || s.status !== "active") return;
  const left = remainingMs(s, Date.now() + skewMs);
  clock.textContent = formatClock(left);
  if (bar) bar.style.width = `${(100 * (1 - left / s.durationMs)).toFixed(1)}%`;
}
setInterval(tickClock, 250);

function renderTray(): void {
  const cats = document.getElementById("cats");
  const chips = document.getElementById("chips");
  if (!cats || !chips) return;
  const available = soundsIn(scene);
  const shot = findShot(scene, shotId)!;
  const hereOk = new Set(shot.anchors.flatMap((a) => a.sounds));
  // in the world, say which part of it a sound belongs in
  const whereElse = (id: SoundId): string =>
    world
      ? `at ${scene.shots
          .filter((s) => s.anchors.some((a) => a.sounds.includes(id)))
          .map((s) => s.title.toLowerCase())
          .slice(0, 2)
          .join(" or ")}`
      : "in another view";
  const usedCats = CATEGORIES.filter((c) => available.some((id) => SOUNDS[id].category === c));
  if (!usedCats.includes(category)) category = usedCats[0];

  cats.textContent = "";
  for (const c of usedCats) {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "tab";
    b.dataset.focusKey = `cat:${c}`;
    b.className = "cat";
    b.textContent = c;
    b.setAttribute("aria-selected", String(c === category));
    b.setAttribute("aria-controls", "chips");
    // One tab stop for the whole list: arrows move between kinds, Tab goes
    // on to the sounds.
    b.tabIndex = c === category ? 0 : -1;
    b.onclick = () => {
      category = c;
      keepingFocus(renderTray);
    };
    b.onkeydown = (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      category = usedCats[(usedCats.indexOf(c) + step + usedCats.length) % usedCats.length];
      renderTray();
      document.querySelector<HTMLElement>(`[data-focus-key="cat:${category}"]`)?.focus();
    };
    cats.append(b);
  }

  chips.textContent = "";
  for (const id of available.filter((x) => SOUNDS[x].category === category)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.focusKey = `chip:${id}`;
    b.className = `chip${choosing === id ? " active" : ""}${hereOk.has(id) ? "" : " elsewhere"}`;
    b.setAttribute("aria-pressed", String(choosing === id));
    b.innerHTML = `<span class="chip-name"></span><span class="chip-where"></span>`;
    b.querySelector(".chip-name")!.textContent = SOUNDS[id].label;
    b.querySelector(".chip-where")!.textContent = hereOk.has(id) ? "" : whereElse(id);
    b.onclick = () => {
      choosing = choosing === id ? null : id;
      selected = null;
      render();
      if (choosing) {
        const first = stage.querySelector<HTMLButtonElement>(".anchor.accepts:not([hidden])");
        if (world) say(first ? "Click a glowing spot to put it there." : `Walk to a glowing spot ${whereElse(choosing)}, or use Go to.`);
        else say(first ? "Choose a place for this sound." : "That sound belongs in another part of this scene. Try another view below.");
        first?.focus();
      }
    };
    chips.append(b);
  }
}

function renderHint(): void {
  const s = live.snapshot;
  if (choosing) hint.textContent = `Choose a place for ${SOUNDS[choosing].label.toLowerCase()}. Highlighted spots accept it. Esc to cancel.`;
  else if (s.placements.length === 0) hint.textContent = "This place has its shape, but not yet its sound. Add the first everyday moment.";
  else if (!audio.enabled) hint.textContent = "Tap to enable sound.";
  else hint.textContent = "";
}

function syncAudio(): void {
  const sources = new Map<string, { soundId: SoundId; gain: number; pan: number; away: boolean; pos?: [number, number, number]; inside?: boolean; onPlay?: () => void }>();
  for (const p of live.snapshot.placements) {
    const at = world?.where(p);
    if (world && at) {
      sources.set(p.id, { soundId: p.soundId, gain: p.gain, pan: p.pan, away: false, pos: at.pos, inside: at.inside, onPlay: () => world.pulse(p.id) });
      continue;
    }
    const away = p.shotId !== shotId;
    sources.set(p.id, { soundId: p.soundId, gain: p.gain, pan: p.pan, away, onPlay: away ? undefined : () => pulse(stage, p.id) });
  }
  audio.sync(sources);
}

// Rebuilding the lists and tray replaces their controls; put focus back on
// the same control, so a keyboard user's next key still means something.
function keepingFocus(rebuild: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active?.dataset.focusKey ?? (active?.dataset.anchor ? `anchor:${active.dataset.anchor}` : undefined);
  rebuild();
  if (key && !document.contains(active)) {
    const again = key.startsWith("anchor:")
      ? stage.querySelector<HTMLElement>(`.anchor[data-anchor="${CSS.escape(key.slice(7))}"]`)
      : document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
    again?.focus();
  }
}

function render(): void {
  keepingFocus(draw);
}

function draw(): void {
  const shot = findShot(scene, shotId)!;
  if (world) {
    world.draw(live.snapshot.placements, {
      interactive: boot.joined,
      mineId: me()?.id ?? null,
      choosing,
      selected,
      onAnchor: (zone, id) => void place(id, zone),
      onMarker: (id) => {
        selected = selected === id ? null : id;
        render();
        document.querySelector<HTMLElement>(`.sound-row[data-placement="${id}"] .sound-name`)?.focus();
      },
    });
  } else drawShot(stage, scene, shot, live.snapshot.placements, {
    interactive: boot.joined,
    mineId: me()?.id ?? null,
    choosing,
    selected,
    onAnchor: (id) => void place(id),
    onLink: (to) => goLink(to),
    onMarker: (id) => {
      selected = selected === id ? null : id;
      render();
      document.querySelector<HTMLElement>(`.sound-row[data-placement="${id}"] .sound-name`)?.focus();
    },
  });
  if (!world && (!stage.querySelector(".weather, .passers") || stage.dataset.mode !== mode.id)) {
    drawWeather(stage, mode.id, shot);
    stage.dataset.mode = mode.id;
  }
  $("evidence-text").textContent = shot.evidence;
  const postcard = document.getElementById("postcard") as HTMLAnchorElement | null;
  if (postcard && shot.thumb && postcard.dataset.shot !== shot.id) {
    postcard.dataset.shot = shot.id;
    postcard.href = shot.thumb.replace("-thumb", "");
    postcard.querySelector("img")!.src = shot.thumb;
    postcard.querySelector(".postcard-title")!.textContent = shot.title;
  }
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#shots a")) {
    if (a.dataset.shot === shotId) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
  renderPeople();
  renderLists();
  renderSession();
  renderTray();
  renderHint();
  renderStatus();
  syncAudio();
}

// ---- navigation ---------------------------------------------------------

function goShot(id: string): void {
  if (!findShot(scene, id)) return;
  if (world) {
    world.goTo(id);
    return;
  }
  shotId = id;
  history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&shot=${id}`);
  stage.querySelector(".weather")?.remove();
  stage.querySelector(".passers")?.remove();
  render();
}

function goLink(to: string): void {
  if (!to.includes("/")) return goShot(to);
  const [sceneId, shot] = to.split("/");
  const target = findScene(sceneId);
  if (!target) return;
  const m = target.modes.find((x) => x.id === mode.id) ?? target.modes[0];
  // Leaving through a door: fade the place out, then go.
  document.body.classList.add("leaving");
  setTimeout(() => (location.href = `/scene/${sceneId}?mode=${m.id}&shot=${shot}`), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
}

for (const a of document.querySelectorAll<HTMLAnchorElement>("#shots a")) {
  a.onclick = (e) => {
    e.preventDefault();
    goShot(a.dataset.shot!);
  };
}

// ---- controls -----------------------------------------------------------

const toggle = $<HTMLButtonElement>("sound-toggle");
toggle.disabled = false;
toggle.onclick = async () => {
  if (audio.enabled) {
    await audio.disable();
    toggle.textContent = "Enable sound";
    toggle.setAttribute("aria-pressed", "false");
  } else if (await audio.enable()) {
    toggle.textContent = "Mute";
    toggle.setAttribute("aria-pressed", "true");
    syncAudio();
  } else say("This browser wouldn't start audio. Everything else still works.");
  renderHint();
};

const ambience = $<HTMLInputElement>("ambience");
ambience.disabled = false;
ambience.checked = true;
ambience.onchange = () => audio.setAmbience(ambience.checked);

const trayToggle = document.getElementById("tray-toggle");
if (trayToggle) {
  trayToggle.onclick = () => {
    const open = trayToggle.getAttribute("aria-expanded") !== "true";
    trayToggle.setAttribute("aria-expanded", String(open));
    trayToggle.textContent = open ? "Hide" : "Show";
    $("tray-body").hidden = !open;
  };
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && choosing) {
    choosing = null;
    render();
    say("Cancelled.");
  }
  // Delete removes your selected sound, when focus isn't in a text field
  if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target instanceof HTMLInputElement)) {
    const p = live.snapshot.placements.find((x) => x.id === selected);
    if (p && p.ownerId === me()?.id) {
      e.preventDefault();
      void send({ type: "sound.remove", placementId: p.id, baseRevision: p.revision }, "Removing…").then((ok) => ok && say("Sound removed."));
    }
  }
});

document.addEventListener("visibilitychange", () => void audio.visibility(document.hidden));

render();
connect();
