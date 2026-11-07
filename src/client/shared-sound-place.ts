// A small doorway into the sounds people are making together. The existing
// native Tools drawer owns focus; this view never moves or publishes a sound.
import type { Person, PlacedSound } from "../shared/protocol.js";
import { FAMILIES, REACH, findSound } from "../shared/sounds.js";
import { soundResponseFor } from "../shared/sound-response.js";

interface ResidentResponse {
  residentId: string;
  label: string;
  sourceId: string;
  soundId: string;
  behavior: string;
  x: number;
  z: number;
}

interface Options {
  open: () => void;
  add: () => void;
  face: (sound: PlacedSound) => void;
  reply: (sound: PlacedSound) => void;
  conversation: (sound: PlacedSound) => void;
  toggleSound: () => void;
  zone: (x: number, z: number) => string;
  responses: () => readonly ResidentResponse[];
}

interface State {
  sounds: PlacedSound[];
  people: Person[];
  you: string | null;
  joined: boolean;
  connected: boolean;
  soundOn: boolean;
}

const label = (id: string): string => findSound(id)?.label ?? "A sound";
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export class SharedSoundPlace {
  readonly trigger = node("button", "shared-sound-toggle");
  readonly element = node("section", "shared-sound-place");
  private summary = node("span", "shared-sound-summary");
  private stats = node("p", "shared-sound-stats");
  private note = node("p", "shared-sound-note");
  private listen = node("button", "btn ghost shared-sound-listen");
  private add = node("button", "btn primary shared-sound-add");
  private list = node("div", "shared-sound-list");
  private empty = node("p", "shared-sound-empty");
  private more = node("button", "btn ghost shared-show-all", "Show all sounds");
  private corner = node("section", "shared-corner");
  private cornerSummary = node("p", "shared-corner-summary");
  private ingredients = node("ul", "shared-corner-ingredients");
  private residents = node("ul", "shared-resident-responses");
  private residentEmpty = node("p", "shared-resident-empty");
  private changes = node("ol", "shared-changes");
  private changeEmpty = node("p", "shared-changes-empty", "New sounds and replies will appear here while you explore.");
  private sounds = new Map<string, PlacedSound>();
  private state: State = { sounds: [], people: [], you: null, joined: false, connected: false, soundOn: false };
  private x = 0;
  private z = 0;
  private expanded = false;
  private signature = "";
  private lastFrame = -Infinity;
  private seenChanges = new Set<string>();

  constructor(private opts: Options) {
    this.trigger.type = "button";
    this.trigger.id = "shared-sound-toggle";
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-controls", "world-tools-panel");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.innerHTML = '<svg viewBox="0 0 32 32" fill="none" stroke-width="1.5" aria-hidden="true"><circle cx="16" cy="16" r="13" stroke="#5aa9e6"/><circle cx="16" cy="16" r="8" stroke="#7bd389"/><circle cx="16" cy="16" r="3" fill="#f2a65a" stroke="#f2a65a"/></svg>';
    const text = node("span", "shared-sound-toggle-text");
    text.append(node("strong", "", "Our soundscape"), this.summary);
    this.trigger.append(text);
    this.trigger.onclick = () => this.opts.open();

    this.element.setAttribute("aria-label", "Sounds made together");
    const intro = node("p", "shared-sound-intro", "Make a cozy corner or bring this place to life, together. Leave a sound, hear a friend's answer, and see nearby residents respond. Sounds stay until someone removes them.");
    const actions = node("div", "shared-sound-main-actions");
    this.add.type = this.listen.type = this.more.type = "button";
    this.add.onclick = () => this.opts.add();
    this.listen.onclick = () => this.opts.toggleSound();
    actions.append(this.add, this.listen);
    const legend = node("div", "shared-sound-legend");
    legend.setAttribute("aria-label", "Sound colours");
    for (const family of Object.values(FAMILIES)) {
      const item = node("span", "", family.label);
      item.style.setProperty("--family", family.colour);
      const dot = node("i", "");
      dot.setAttribute("aria-hidden", "true");
      item.prepend(dot);
      legend.append(item);
    }
    const heading = node("h3", "shared-sound-list-heading", "Sounds left here");
    const cornerHeading = node("h3", "shared-corner-heading", "This corner, made together");
    cornerHeading.id = "shared-corner-title";
    this.corner.setAttribute("aria-labelledby", cornerHeading.id);
    this.ingredients.setAttribute("aria-label", "Nearby sound ingredients");
    this.residents.setAttribute("aria-label", "Residents responding nearby");
    this.residentEmpty.textContent = "No resident is responding nearby yet. Try a sound near the locals outside the café, on the beach, or at the forest edge.";
    this.corner.append(cornerHeading, this.cornerSummary, this.ingredients, this.residentEmpty, this.residents);
    this.more.onclick = () => { this.expanded = !this.expanded; this.renderList(); };
    const changesHeading = node("h3", "shared-changes-heading", "While you’re here");
    this.changes.setAttribute("aria-label", "Shared changes during this visit");
    this.element.append(intro, this.stats, this.note, actions, this.corner, legend, heading,
      this.empty, this.list, this.more, changesHeading, this.changeEmpty, this.changes);
    this.setState(this.state);
  }

  setExpanded(open: boolean): void { this.trigger.setAttribute("aria-expanded", String(open)); }

  setState(state: State): void {
    this.state = state;
    this.sounds = new Map(state.sounds.filter(sound => !sound.whileIn && !sound.removedAt).map(sound => [sound.id, sound]));
    const people = new Map(state.people.map(person => [person.id, person]));
    const count = people.size;
    const sounds = this.sounds.size;
    this.summary.dataset.people = String(count);
    this.summary.dataset.sounds = String(sounds);
    this.summary.textContent = state.connected ? `${count} here · ${sounds} ${sounds === 1 ? "sound" : "sounds"}` : "Reconnecting…";
    this.trigger.setAttribute("aria-label", state.connected
      ? `Our soundscape: ${count} ${count === 1 ? "person" : "people"} here, ${sounds} shared ${sounds === 1 ? "sound" : "sounds"}`
      : "Our soundscape: reconnecting, showing the last shared state");
    this.stats.textContent = `${sounds} shared ${sounds === 1 ? "sound" : "sounds"} · ${count} ${count === 1 ? "person" : "people"} here`;
    this.note.textContent = !state.connected ? "Connection lost. Showing the last shared state. You can browse while we reconnect."
      : count <= (state.you ? 1 : 0) ? "On your own right now? What people left is still here for you to discover."
        : "Named figures are other visitors. Walk up to someone to talk and listen together.";
    this.listen.textContent = state.soundOn ? "Sound on · Turn off" : "Turn sound on";
    this.listen.setAttribute("aria-pressed", String(state.soundOn));
    this.add.textContent = state.joined ? "Leave a sound" : "Enter to add a sound";
    this.add.disabled = state.joined && !state.connected;
    const signature = JSON.stringify([state.joined, state.connected, [...people.keys()],
      [...this.sounds.values()].map(sound => [sound.id, sound.replyTo?.removedAt])]);
    if (signature !== this.signature) { this.signature = signature; this.renderList(); }
    else this.updateDistances();
    this.renderCorner();
  }

  frame(x: number, z: number): void {
    this.x = x; this.z = z;
    const now = performance.now();
    if (now - this.lastFrame < 400 || !this.element.closest("dialog[open]")) return;
    this.lastFrame = now;
    this.updateDistances();
    this.renderCorner();
  }

  // This is activity received in this visit, never an invented historical feed.
  changed(sound: PlacedSound, action: "left" | "removed", by: string): void {
    if (sound.whileIn) return;
    const key = action + ":" + sound.id;
    if (this.seenChanges.has(key)) return;
    this.seenChanges.add(key);
    const row = node("li", "shared-change");
    row.dataset.id = sound.id;
    row.dataset.action = action;
    row.textContent = action === "removed" ? `${by} removed ${label(sound.soundId)}.`
      : sound.replyTo ? `${by} answered ${sound.replyTo.by}'s ${label(sound.replyTo.soundId)} with ${label(sound.soundId)}.`
        : `${by} left ${label(sound.soundId)} at ${this.opts.zone(sound.x, sound.z)}.`;
    this.changes.prepend(row);
    while (this.changes.children.length > 4) this.changes.lastElementChild!.remove();
    this.changeEmpty.hidden = true;
  }

  private renderList(): void {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedId = focused?.closest<HTMLElement>(".shared-sound-card")?.dataset.id;
    const action = focused?.dataset.action;
    const sounds = [...this.sounds.values()].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    this.list.replaceChildren();
    for (const sound of sounds.slice(0, this.expanded ? sounds.length : 6)) this.list.append(this.card(sound));
    this.empty.hidden = sounds.length > 0;
    this.empty.textContent = "No shared sounds are here right now. Leave a sound for the next person to discover.";
    this.more.hidden = sounds.length <= 6;
    this.more.textContent = this.expanded ? "Show recent sounds" : `Show all ${sounds.length} sounds`;
    this.more.setAttribute("aria-expanded", String(this.expanded));
    this.updateDistances();
    if (focusedId && action) {
      const row = [...this.list.querySelectorAll<HTMLElement>(".shared-sound-card")].find(row => row.dataset.id === focusedId);
      const next = row?.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
      if (next && !next.disabled) next.focus();
      else if (focused && !focused.isConnected) this.add.focus();
    }
  }

  private card(sound: PlacedSound): HTMLElement {
    const kind = findSound(sound.soundId);
    const row = node("article", "shared-sound-card");
    row.dataset.id = sound.id;
    row.style.setProperty("--family", kind ? FAMILIES[kind.family].colour : "#82918b");
    const name = node("h3", "", label(sound.soundId));
    const online = this.state.people.some(person => person.id === sound.byId);
    const by = node("p", "shared-sound-by", `Left by ${sound.by}${online ? " · here now" : ""}`);
    const position = node("p", "shared-sound-position");
    row.append(name, by, position);
    if (sound.replyTo) row.append(node("p", "shared-sound-relation",
      `Answering ${sound.replyTo.by}'s ${label(sound.replyTo.soundId)}${sound.replyTo.removedAt ? " (removed)" : ""}`));
    const actions = node("div", "shared-sound-actions");
    const button = (text: string, action: string, run: () => void, primary = false): HTMLButtonElement => {
      const b = node("button", `btn ${primary ? "primary" : "ghost"}`, text);
      b.type = "button"; b.dataset.action = action; b.onclick = run;
      return b;
    };
    actions.append(button("Face sound", "face", () => this.opts.face(sound)),
      button("Conversation", "conversation", () => this.opts.conversation(sound)));
    if (this.state.joined) actions.append(button("Reply with a sound", "reply", () => {
      const live = this.sounds.get(sound.id);
      if (live && this.state.connected && this.distance(live) <= REACH) this.opts.reply(live);
    }, true));
    row.append(actions);
    return row;
  }

  private distance(sound: PlacedSound): number { return Math.hypot(sound.x - this.x, sound.z - this.z); }

  private renderCorner(): void {
    const nearby = [...this.sounds.values()].filter(sound => this.distance(sound) <= 18);
    const contributors = new Set(nearby.map(sound => sound.byId)).size;
    this.cornerSummary.textContent = nearby.length
      ? `${nearby.length} public ${nearby.length === 1 ? "sound" : "sounds"} within 18 m · made by ${contributors} ${contributors === 1 ? "person" : "people"}`
      : "There are no public sounds within 18 m. What would you and a friend make here?";
    this.corner.dataset.sounds = String(nearby.length);
    this.ingredients.replaceChildren();
    for (const [mood, title] of [["cozy", "Cozy"], ["lively", "Lively"], ["wild", "Wildlife"]] as const) {
      const count = nearby.filter(sound => soundResponseFor(sound.soundId)?.mood === mood).length;
      if (!count) continue;
      const item = node("li", "", `${title} · ${count}`);
      item.dataset.mood = mood;
      this.ingredients.append(item);
    }
    this.ingredients.hidden = !this.ingredients.children.length;
    this.residents.replaceChildren();
    const verbs: Record<string, string> = {
      sway: "swaying to", chat: "chatting beside", play: "playing beside",
      listen: "pausing to listen to", watch: "looking toward", wave: "waving beside",
    };
    // The world controller reports its actual selected source after settling.
    // We do not infer a resident response merely because a sound was placed.
    for (const response of this.opts.responses()) {
      const source = this.sounds.get(response.sourceId);
      if (!source || Math.hypot(response.x - this.x, response.z - this.z) > 28) continue;
      const row = node("li", "shared-resident-response");
      row.dataset.resident = response.residentId;
      row.dataset.source = response.sourceId;
      row.dataset.behavior = response.behavior;
      row.append(node("strong", "", response.label), node("span", "",
        `${verbs[response.behavior] ?? "responding to"} ${source.by}'s ${label(source.soundId)}.`));
      this.residents.append(row);
    }
    this.residentEmpty.hidden = this.residents.children.length > 0;
    this.residents.hidden = !this.residents.children.length;
  }

  private updateDistances(): void {
    for (const row of this.list.querySelectorAll<HTMLElement>(".shared-sound-card")) {
      const sound = this.sounds.get(row.dataset.id!);
      if (!sound) continue;
      const distance = this.distance(sound);
      row.querySelector(".shared-sound-position")!.textContent = `${this.opts.zone(sound.x, sound.z)} · ${Math.round(distance)} m away`;
      const reply = row.querySelector<HTMLButtonElement>('[data-action="reply"]');
      if (reply) {
        reply.disabled = !this.state.connected || distance > REACH;
        reply.textContent = distance > REACH ? "Walk closer to reply" : "Reply with a sound";
      }
    }
  }
}
