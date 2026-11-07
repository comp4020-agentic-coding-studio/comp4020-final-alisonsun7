// Human-readable, directly actionable real contributions in the world.
import type { PlacedSound } from "../shared/protocol.js";
import { planetDistance } from "../shared/planet.js";
import { FAMILIES, findSound } from "../shared/sounds.js";
interface Options {
  at: () => { x: number; z: number };
  project: (x: number, z: number, height: number) => { x: number; y: number; visible: boolean };
  available: () => boolean;
  respond: (sound: PlacedSound) => void;
  conversation: (id: string) => void;
  remove: (sound: PlacedSound) => void;
  reaction: (id: string) => string;
}
export class PlanetSoundInteractions {
  private sounds: PlacedSound[] = [];
  private selected: string | null = null;
  private current: PlacedSound | null = null;
  private pins = new Map<string, HTMLButtonElement>();
  private layer = document.createElement("div");
  private card = document.createElement("aside");
  private title = document.createElement("strong");
  private by = document.createElement("p");
  private response = document.createElement("p");
  private answer = document.createElement("button");
  private conversation = document.createElement("button");
  private remove = document.createElement("button");
  private last = -Infinity;
  constructor(private host: HTMLElement, private opts: Options) {
    this.layer.className = "planet-sound-pins";
    this.layer.setAttribute("aria-label", "Sounds in this place");
    this.card.id = "planet-nearby-sound";
    this.card.className = "planet-nearby-sound";
    this.card.hidden = true;
    this.card.setAttribute("aria-label", "Nearby sound actions");
    const kicker = document.createElement("span");kicker.className = "planet-kicker";kicker.textContent = "A sound someone left";
    const actions = document.createElement("div");actions.className = "planet-nearby-actions";
    this.answer.type = this.conversation.type = this.remove.type = "button";
    this.answer.dataset.respond = "";this.answer.className = "btn primary";
    this.answer.onclick = () => { if (this.current) this.opts.respond(this.current); };
    this.conversation.id = "planet-conversation";this.conversation.className = "btn ghost";this.conversation.textContent = "Conversation";
    this.conversation.onclick = () => { if (this.current) this.opts.conversation(this.current.id); };
    this.remove.className = "btn ghost";this.remove.textContent = "Remove";
    this.remove.onclick = () => { if (this.current) this.opts.remove(this.current); };
    actions.append(this.answer, this.conversation, this.remove);
    this.response.className = "planet-sound-response";
    this.card.append(kicker, this.title, this.by, this.response, actions);
    this.host.append(this.layer, this.card);
  }
  setAll(sounds: readonly PlacedSound[]): void {
    this.sounds = sounds.filter(s => !s.whileIn && !s.removedAt && findSound(s.soundId));
    for (const [id, pin] of this.pins) if (!this.sounds.some(s => s.id === id)) { pin.remove();this.pins.delete(id); }
    if (this.selected && !this.sounds.some(s => s.id === this.selected)) this.selected = null;
    this.last = -Infinity;
    this.frame();
  }
  respondNearest(): boolean {
    if (!this.current || this.card.hidden || !this.opts.available() || document.querySelector("dialog:modal") || !document.getElementById("planet-chat")?.hidden) return false;
    this.opts.respond(this.current);return true;
  }
  frame(): void {
    const now = performance.now();if (now - this.last < 90) return;this.last = now;
    const hidden = !!document.querySelector("dialog:modal") || !document.getElementById("planet-chat")?.hidden;
    this.layer.hidden = hidden;this.card.hidden = hidden;
    if (hidden) return;
    const at = this.opts.at(), ordered = [...this.sounds].sort((a, b) => planetDistance(at, a) - planetDistance(at, b) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const selected = ordered.find(s => s.id === this.selected && planetDistance(at, s) <= 18);
    this.current = selected ?? ordered.find(s => planetDistance(at, s) <= 4) ?? null;
    this.card.hidden = !this.current;
    if (this.current) {
      const s = this.current, distance = planetDistance(at, s), replies = this.sounds.filter(child => child.replyToId === s.id || child.replyTo?.id === s.id).length;
      this.card.dataset.id = s.id;
      this.title.textContent = findSound(s.soundId)!.label;
      this.by.textContent = `Left by ${s.by} · ${distance < 1 ? "beside you" : Math.round(distance) + " m away"}${replies ? ` · ${replies} ${replies === 1 ? "answer" : "answers"}` : ""}`;
      const reaction = this.opts.reaction(s.id);this.response.textContent = reaction;this.response.hidden = !reaction;
      this.answer.textContent = distance <= 4 ? "Respond to sound" : "Walk closer to respond";
      this.answer.disabled = !this.opts.available();
      this.remove.disabled = !this.opts.available() || distance > 4;
      const kind = findSound(s.soundId)!;this.card.style.setProperty("--family", FAMILIES[kind.family].colour);
    }
    for (const pin of this.pins.values()) pin.hidden = true;
    const occupied: { x: number; y: number }[] = [];
    let count = 0;
    for (const s of ordered) {
      if (count >= 4 || planetDistance(at, s) > 16) break;
      const point = this.opts.project(s.x, s.z, .75);
      if (!point.visible || point.y < 190 || point.y > this.host.clientHeight - 250) continue;
      let y = point.y;
      for (let i = 0; i < 4 && occupied.some(p => Math.abs(point.x - p.x) < 185 && Math.abs(y - p.y) < 49); i++) y -= 50;
      if (y < 190) continue;
      let pin = this.pins.get(s.id);
      if (!pin) {
        pin = document.createElement("button");pin.type = "button";pin.className = "planet-sound-pin";pin.dataset.id = s.id;
        const name = document.createElement("strong"), author = document.createElement("span");
        name.textContent = findSound(s.soundId)!.label;author.textContent = "by " + s.by;
        pin.append(name, author);
        pin.onclick = () => { this.selected = s.id;this.last = -Infinity;this.frame(); };
        this.pins.set(s.id, pin);this.layer.append(pin);
      }
      pin.hidden = false;pin.setAttribute("aria-pressed", String(this.current?.id === s.id));
      pin.style.left = `${Math.max(95, Math.min(this.host.clientWidth - 95, point.x))}px`;pin.style.top = `${y}px`;
      occupied.push({ x: point.x, y });count++;
    }
  }
  dispose(): void { this.layer.remove();this.card.remove();this.pins.clear();this.sounds = []; }
}
