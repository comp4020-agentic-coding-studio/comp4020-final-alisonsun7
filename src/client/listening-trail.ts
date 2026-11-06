// Follow what other people have left, without moving or changing their sounds.
import type { PlacedSound } from "../shared/protocol.js";
import { FAMILIES, HEAR, findSound } from "../shared/sounds.js";

export class ListeningTrail {
  readonly element = document.createElement("details");
  private sounds = new Map<string, PlacedSound>();
  private count = document.createElement("span");
  private list = document.createElement("ul");
  private empty = document.createElement("p");
  private note = document.createElement("p");
  private signature = "";
  private last = -Infinity;

  constructor(private face: (sound: PlacedSound) => void) {
    this.element.className = "listening-trail";
    this.element.id = "listening-trail";
    const wide = matchMedia("(min-width: 1000px)");
    this.element.open = wide.matches;
    wide.addEventListener("change", (event) => { if (!event.matches) this.element.open = false; });
    const summary = document.createElement("summary");
    summary.innerHTML = '<span class="trail-symbol" aria-hidden="true"><i></i><i></i><i></i></span><span>Listen around you</span>';
    this.count.className = "trail-count";
    summary.append(this.count);
    const body = document.createElement("div");
    body.className = "trail-body";
    const intro = document.createElement("p");
    intro.className = "trail-intro";
    intro.textContent = "Little sounds, left by people. Turn towards one and walk closer.";
    this.list.className = "trail-sounds";
    this.empty.className = "trail-empty";
    this.note.className = "trail-note";
    body.append(intro, this.list, this.empty, this.note);
    this.element.append(summary, body);
  }

  setAll(sounds: PlacedSound[]): void {
    this.sounds = new Map(sounds.map((sound) => [sound.id, sound]));
    this.last = -Infinity;
  }

  add(sound: PlacedSound): void {
    this.sounds.set(sound.id, sound);
    this.last = -Infinity;
  }

  remove(id: string): void {
    this.sounds.delete(id);
    this.last = -Infinity;
  }

  frame(x: number, z: number, yaw: number, on: boolean): void {
    const now = performance.now();
    if (now - this.last < 500) return;
    this.last = now;
    const nearby = [...this.sounds.values()]
      .map((sound) => ({ sound, distance: Math.hypot(sound.x - x, sound.z - z) }))
      .filter(({ distance }) => distance <= HEAR)
      .sort((a, b) => a.distance - b.distance);
    this.count.textContent = nearby.length + " nearby";
    this.note.textContent = on ? "Closer sounds are louder. Every light is someone's contribution." : "Sound is off. Turn it on above to hear the place.";
    this.empty.hidden = nearby.length > 0;
    this.empty.textContent = this.sounds.size === 0
      ? "Quiet here, for now. Leave a sound and give someone something to find."
      : "No sounds within earshot. Walk a little further and see what you find.";
    const chosen = nearby.slice(0, 3);
    const signature = chosen.map(({ sound }) => sound.id).join("|");
    // Keep keyboard focus in a row while distances update around it.
    if (signature !== this.signature && !this.list.contains(document.activeElement)) {
      this.signature = signature;
      this.list.replaceChildren();
      for (const { sound } of chosen) {
        const kind = findSound(sound.soundId);
        if (!kind) continue;
        const row = document.createElement("li");
        row.dataset.id = sound.id;
        row.style.setProperty("--family", FAMILIES[kind.family].colour);
        const arrow = document.createElement("span");
        arrow.className = "trail-bearing";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↑";
        const text = document.createElement("div");
        text.className = "trail-text";
        const name = document.createElement("strong");
        name.textContent = kind.label;
        const detail = document.createElement("span");
        detail.className = "trail-detail";
        const by = document.createElement("span");
        by.className = "trail-by";
        by.textContent = sound.whileIn ? "For a little while" : "Left by " + sound.by;
        text.append(name, detail, by);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Face sound";
        button.setAttribute("aria-label", "Face " + kind.label);
        button.onclick = () => {
          const current = this.sounds.get(sound.id);
          if (current) this.face(current);
        };
        row.append(arrow, text, button);
        this.list.append(row);
      }
    }
    for (const row of this.list.querySelectorAll<HTMLLIElement>("li")) {
      const sound = this.sounds.get(row.dataset.id!);
      if (!sound) {
        row.remove();
        this.signature = "";
        continue;
      }
      const distance = Math.hypot(sound.x - x, sound.z - z);
      const bearing = Math.atan2(-(sound.x - x), -(sound.z - z)) - yaw;
      const relative = Math.atan2(Math.sin(bearing), Math.cos(bearing));
      const direction = Math.abs(relative) < Math.PI / 6 ? "Ahead" : Math.abs(relative) > Math.PI * 5 / 6 ? "Behind" : relative > 0 ? "To your left" : "To your right";
      row.querySelector<HTMLElement>(".trail-bearing")!.style.transform = "rotate(" + -relative + "rad)";
      row.querySelector<HTMLElement>(".trail-detail")!.textContent = distance < 1 ? "Beside you" : direction + " · " + Math.round(distance) + " m";
    }
  }
}
