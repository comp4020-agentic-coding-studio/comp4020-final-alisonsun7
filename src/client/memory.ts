// Replaying a saved memory. It rebuilds the place from what was saved (which
// sounds, where, how loud, and when each change happened), not from a
// recording: the same synthesis runs again, so it sounds like the place did.
import { findScene, findShot } from "../shared/catalog.js";
import type { MemorySnapshot, Placement } from "../shared/protocol.js";
import { formatClock, placementsAt } from "../shared/state.js";
import { AudioEngine } from "./audio.js";
import { drawShot, drawWeather, pulse } from "./stage.js";

const memory = JSON.parse(document.getElementById("boot")!.textContent!) as MemorySnapshot;
const scene = findScene(memory.sceneId)!;
const mode = scene.modes.find((m) => m.id === memory.mode) ?? scene.modes[0];
const stage = document.getElementById("stage")!;
const play = document.getElementById("play") as HTMLButtonElement;
const final = document.getElementById("final") as HTMLButtonElement;
const scrub = document.getElementById("scrub") as HTMLInputElement;
const clock = document.getElementById("clock")!;
const shotsNav = document.getElementById("shots")!;

const local = document.getElementById("local-time");
if (local) local.textContent = `${new Date(memory.startedAt).toLocaleString()} your time`;

// Start on the view with the most sounds in it.
const counts = new Map<string, number>();
for (const p of memory.placements) counts.set(p.shotId, (counts.get(p.shotId) ?? 0) + 1);
let shotId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? scene.shots[0].id;

const audio = new AudioEngine(mode.ambience);
let t = memory.durationMs;
let playing = false;
let startedAt = 0;
let raf = 0;

function current(): Placement[] {
  return t >= memory.durationMs ? memory.placements : placementsAt(memory.timeline, t);
}

function draw(): void {
  const shot = findShot(scene, shotId)!;
  drawShot(stage, scene, shot, current(), { interactive: false, mineId: null, choosing: null, selected: null, onLink: (to) => !to.includes("/") && go(to) });
  if (stage.dataset.shot !== shotId) {
    drawWeather(stage, mode.id, shot);
    stage.dataset.shot = shotId;
  }
  clock.textContent = `${formatClock(Math.min(t, memory.durationMs))} / ${formatClock(memory.durationMs)}`;
  scrub.value = String(Math.round(t));
  shotsNav.textContent = "";
  if (scene.shots.length > 1) {
    for (const s of scene.shots) {
      const n = current().filter((p) => p.shotId === s.id).length;
      const a = document.createElement("a");
      a.href = "#";
      a.className = "shot-thumb";
      if (s.id === shotId) a.setAttribute("aria-current", "true");
      a.innerHTML = s.thumb ? `<img src="${s.thumb}" alt="" />` : "";
      const label = document.createElement("span");
      label.textContent = s.title;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = n ? String(n) : "";
      a.append(label, count);
      a.onclick = (e) => {
        e.preventDefault();
        go(s.id);
      };
      shotsNav.append(a);
    }
  }
  if (audio.enabled) {
    const sources = new Map<string, { soundId: Placement["soundId"]; gain: number; pan: number; away: boolean; onPlay?: () => void }>();
    for (const p of current()) {
      const away = p.shotId !== shotId;
      sources.set(p.id, { soundId: p.soundId, gain: p.gain, pan: p.pan, away, onPlay: away ? undefined : () => pulse(stage, p.id) });
    }
    audio.sync(sources);
  }
}

function go(id: string): void {
  shotId = id;
  draw();
}

function frame(): void {
  t = performance.now() - startedAt;
  if (t >= memory.durationMs) {
    t = memory.durationMs;
    playing = false;
    play.textContent = "Play the memory again";
  }
  draw();
  if (playing) raf = requestAnimationFrame(frame);
}

play.onclick = async () => {
  if (playing) {
    playing = false;
    cancelAnimationFrame(raf);
    play.textContent = "Resume";
    await audio.disable();
    return;
  }
  if (!(await audio.enable())) {
    clock.textContent = "This browser wouldn't start audio; replay shows the changes silently.";
  }
  if (t >= memory.durationMs) t = 0;
  startedAt = performance.now() - t;
  playing = true;
  play.textContent = "Pause";
  frame();
};

final.onclick = async () => {
  playing = false;
  cancelAnimationFrame(raf);
  t = memory.durationMs;
  play.textContent = "Play the memory";
  await audio.enable();
  draw();
};

scrub.oninput = () => {
  t = Number(scrub.value);
  if (playing) startedAt = performance.now() - t;
  draw();
};

for (const el of [play, final, scrub]) el.disabled = false;
document.addEventListener("visibilitychange", () => void audio.visibility(document.hidden));
draw();
