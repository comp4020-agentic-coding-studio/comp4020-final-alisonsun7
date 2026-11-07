// A small library for shaping the shared place: find, privately audition,
// then leave a sound at your feet. Nothing is placed by browsing or listening.
import { FAMILIES, SOUNDS, type Family, type SoundKind } from "../shared/sounds.js";
import { soundResponseFor } from "../shared/sound-response.js";
import type { SoundReference } from "../shared/protocol.js";

type Intention = "all" | "cozy" | "lively" | "wild";
const INTENTIONS: { id: Intention; label: string; note: string }[] = [
  { id: "all", label: "Every possibility", note: "Mix a quiet corner, a lively gathering, or something unexpected. Listen privately, then leave one sound where you stand." },
  { id: "cozy", label: "A cozy corner", note: "Try a gentle sound beside a friend's contribution. Nearby residents may pause, listen or sway; each card explains its response." },
  { id: "lively", label: "Bring it to life", note: "Try music, conversation or play. Nearby residents respond to one shared sound at a time; adding more does not make them louder." },
  { id: "wild", label: "Wild company", note: "Make room for birds, insects and the shore. Layer a wildlife sound beside water or a friend's answer." },
];

interface Options {
  zone: () => { id: string; title: string };
  listen: (id: string) => Promise<boolean>;
  stop: () => void;
  leave: (id: string) => Promise<string | null>;
  cancelReply: () => void;
  close: () => void;
}

export class SoundLibrary {
  readonly element = document.createElement("dialog");
  private list = document.createElement("ul");
  private search = document.createElement("input");
  private result = document.createElement("p");
  private feedback = document.createElement("p");
  private filters = document.createElement("div");
  private intentions = document.createElement("div");
  private intentionNote = document.createElement("p");
  private intention: Intention = "all";
  private family: Family | "all" = "all";
  private zone = { id: "", title: "" };
  private request = 0;
  private preview: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  private reply: SoundReference | null = null;
  private replyCard = document.createElement("div");
  private title = document.createElement("h2");
  private chosen: string | null = null;
  private context = 0;

  constructor(private opts: Options) {
    const dialog = this.element;
    dialog.id = "sound-palette";
    dialog.className = "sound-palette";
    dialog.hidden = true;
    dialog.setAttribute("aria-labelledby", "sound-library-title");
    dialog.setAttribute("aria-describedby", "sound-library-note");
    const head = document.createElement("div");
    head.className = "palette-head";
    const heading = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "library-kicker";
    kicker.textContent = "A world we shape together";
    const title = this.title;
    title.id = "sound-library-title";
    title.textContent = "Leave a little sound";
    heading.append(kicker, title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "library-close";
    close.textContent = "Close";
    close.onclick = () => this.close();
    head.append(heading, close);
    this.replyCard.id = "sound-library-reply";
    this.replyCard.className = "library-reply";
    this.replyCard.hidden = true;

    const ideas = document.createElement("section");
    ideas.className = "library-ideas";
    ideas.setAttribute("aria-labelledby", "library-ideas-title");
    const ideasTitle = document.createElement("h3");
    ideasTitle.id = "library-ideas-title";
    ideasTitle.textContent = "What would you make here?";
    this.intentions.className = "library-intentions";
    this.intentions.setAttribute("role", "group");
    this.intentions.setAttribute("aria-label", "Sound ideas");
    for (const idea of INTENTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.intention = idea.id;
      button.textContent = idea.label;
      button.setAttribute("aria-pressed", String(idea.id === this.intention));
      button.onclick = () => {
        this.intention = idea.id;
        this.family = "all";
        this.search.value = "";
        this.updateFilters();
        this.render();
      };
      this.intentions.append(button);
    }
    this.intentionNote.className = "library-intention-note";
    ideas.append(ideasTitle, this.intentions, this.intentionNote);

    const label = document.createElement("label");
    label.className = "library-search";
    label.textContent = "Find a sound";
    this.search.type = "search";
    this.search.placeholder = "Try birds, water, café…";
    this.search.autocomplete = "off";
    this.search.oninput = () => this.render();
    label.append(this.search);
    this.filters.className = "library-filters";
    this.filters.setAttribute("role", "group");
    this.filters.setAttribute("aria-label", "Sound families");
    for (const id of ["all", ...Object.keys(FAMILIES)] as (Family | "all")[]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.family = id;
      button.textContent = id === "all" ? "All sounds" : FAMILIES[id].label;
      button.setAttribute("aria-pressed", String(id === this.family));
      if (id !== "all") button.style.setProperty("--family", FAMILIES[id].colour);
      button.onclick = () => {
        this.family = id;
        // Families are another way in, rather than an invisible second filter.
        this.intention = "all";
        this.updateFilters();
        this.render();
      };
      this.filters.append(button);
    }
    this.result.className = "library-results";
    this.result.setAttribute("role", "status");
    this.list.className = "library-sounds";
    this.feedback.className = "library-feedback";
    this.feedback.setAttribute("role", "status");
    const note = document.createElement("p");
    note.className = "palette-note";
    note.id = "sound-library-note";
    note.textContent = "Listen is just for you. Leave it here shares a sound at your feet, until someone beside it removes it.";
    dialog.append(head, this.replyCard, ideas, label, this.filters, this.result, this.list, this.feedback, note);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener("close", () => {
      this.stopPreview();
      dialog.hidden = true;
      this.opts.close();
    });
  }

  open(): void {
    this.context++;
    this.zone = this.opts.zone();
    this.feedback.textContent = "";
    this.search.value = "";
    this.family = "all";
    this.intention = "all";
    this.updateFilters();
    this.render();
    this.element.hidden = false;
    this.element.showModal();
    this.search.focus();
  }

  close(): void {
    this.stopPreview();
    this.element.close();
  }

  setReply(sound: SoundReference | null): void {
    if (this.reply?.id !== sound?.id) { this.chosen = null; this.context++; }
    this.reply = sound;
    this.renderReply();
  }

  private renderReply(): void {
    this.title.textContent = this.reply ? "Reply with a sound" : "Leave a little sound";
    this.replyCard.hidden = !this.reply;
    this.replyCard.replaceChildren();
    if (!this.reply) return;
    const target = document.createElement("strong");
    target.textContent = "Replying to " + (SOUNDS.find((s) => s.id === this.reply!.soundId)?.label ?? "a sound") + " · left by " + this.reply.by;
    const note = document.createElement("p");
    note.textContent = this.reply.removedAt
      ? "That sound has been removed. Leave without a reply, or choose another sound to answer."
      : "Your answer will be left where you stand. Close this library to walk somewhere else; your reply will stay ready.";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link-btn";
    cancel.textContent = "Cancel reply";
    cancel.disabled = this.pending;
    cancel.onclick = () => this.opts.cancelReply();
    this.replyCard.append(target, note, cancel);
    if (this.reply.removedAt && this.chosen) {
      const leave = document.createElement("button");
      leave.type = "button";
      leave.className = "btn primary leave-without-reply";
      leave.textContent = "Leave without a reply";
      leave.disabled = this.pending;
      const chosen = this.chosen;
      leave.onclick = async () => {
        this.opts.cancelReply();
        await this.place(chosen, leave);
      };
      this.replyCard.append(leave);
    }
  }

  private async place(id: string, button: HTMLButtonElement): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    const context = this.context;
    this.chosen = id;
    for (const b of this.list.querySelectorAll<HTMLButtonElement>("[data-sound]")) b.disabled = true;
    button.textContent = "Leaving…";
    this.renderReply();
    try {
      const error = await this.opts.leave(id);
      if (error && context === this.context) this.feedback.textContent = error;
    } finally {
      this.pending = false;
      for (const b of this.list.querySelectorAll<HTMLButtonElement>("[data-sound]")) b.disabled = false;
      button.textContent = "Leave it here";
      this.renderReply();
    }
  }

  private stopPreview(): void {
    this.request++;
    this.preview = null;
    clearTimeout(this.timer);
    this.opts.stop();
  }

  private async audition(kind: SoundKind, button: HTMLButtonElement): Promise<void> {
    const wasPlaying = this.preview === kind.id;
    this.stopPreview();
    this.resetButtons();
    if (wasPlaying) {
      this.feedback.textContent = "Preview stopped.";
      return;
    }
    const request = this.request;
    this.preview = kind.id;
    button.textContent = "Loading…";
    button.setAttribute("aria-pressed", "true");
    this.feedback.textContent = "Loading " + kind.label + " for a private listen…";
    const started = await this.opts.listen(kind.id).catch(() => false);
    if (request !== this.request) return;
    if (!started) {
      this.preview = null;
      this.resetButtons();
      this.feedback.textContent = "This sound couldn't load. Try Listen again; nothing was placed.";
      return;
    }
    button.textContent = "Stop";
    this.feedback.textContent = "Just you, listening to " + kind.label + ".";
    this.timer = setTimeout(() => {
      if (request !== this.request) return;
      this.preview = null;
      this.resetButtons();
      this.feedback.textContent = "Preview finished. Leave it here to share it.";
    }, 5100);
  }

  private resetButtons(): void {
    for (const button of this.list.querySelectorAll<HTMLButtonElement>("[data-listen]")) {
      button.textContent = "Listen";
      button.setAttribute("aria-pressed", "false");
    }
  }

  private updateFilters(): void {
    for (const button of this.filters.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.family === this.family));
    for (const button of this.intentions.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.intention === this.intention));
    this.intentionNote.textContent = INTENTIONS.find(idea => idea.id === this.intention)!.note;
  }

  private render(): void {
    // Filtering cancels the private preview rather than hiding a playing control.
    this.stopPreview();
    this.feedback.textContent = "";
    this.list.replaceChildren();
    const query = this.search.value.trim().toLocaleLowerCase();
    const kinds = SOUNDS.filter((kind) => (this.family === "all" || kind.family === this.family)
      && (this.intention === "all" || soundResponseFor(kind.id)?.mood === this.intention)
      && (kind.label + " " + FAMILIES[kind.family].label + " " + (soundResponseFor(kind.id)?.label ?? "")).toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(b.zones.includes(this.zone.id)) - Number(a.zones.includes(this.zone.id)));
    this.result.textContent = kinds.length + (kinds.length === 1 ? " sound" : " sounds") + " · suited to " + this.zone.title + " first";
    for (const kind of kinds) {
      const li = document.createElement("li");
      li.style.setProperty("--family", FAMILIES[kind.family].colour);
      const text = document.createElement("div");
      text.className = "palette-text";
      const name = document.createElement("strong");
      name.textContent = kind.label;
      const family = document.createElement("span");
      family.className = "palette-family";
      family.textContent = FAMILIES[kind.family].label + (kind.zones.includes(this.zone.id) ? " · suits here" : "");
      text.append(name, family);
      const response = soundResponseFor(kind.id);
      if (response) {
        const hint = document.createElement("span");
        hint.className = "palette-response";
        hint.textContent = response.hint;
        text.append(hint);
      }
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "btn ghost library-listen";
      listen.textContent = "Listen";
      listen.dataset.listen = kind.id;
      listen.setAttribute("aria-label", "Listen to " + kind.label);
      listen.setAttribute("aria-pressed", "false");
      listen.onclick = () => void this.audition(kind, listen);
      const leave = document.createElement("button");
      leave.type = "button";
      leave.className = "btn primary";
      leave.dataset.sound = kind.id;
      leave.textContent = "Leave it here";
      leave.disabled = this.pending;
      leave.setAttribute("aria-label", "Leave " + kind.label + " here");
      leave.onclick = () => void this.place(kind.id, leave);
      li.append(text, listen, leave);
      this.list.append(li);
    }
    if (kinds.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No sounds match yet. Try another word, sound family, or Every possibility.";
      this.list.append(empty);
    }
  }
}
