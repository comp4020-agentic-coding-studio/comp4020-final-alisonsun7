// A small library for shaping the shared place: find, privately audition,
// then leave a sound at your feet. Nothing is placed by browsing or listening.
import { FAMILIES, SOUNDS, type Family, type SoundKind } from "../shared/sounds.js";

interface Options {
  zone: () => { id: string; title: string };
  listen: (id: string) => Promise<boolean>;
  stop: () => void;
  leave: (id: string) => Promise<string | null>;
  close: () => void;
}

export class SoundLibrary {
  readonly element = document.createElement("dialog");
  private list = document.createElement("ul");
  private search = document.createElement("input");
  private result = document.createElement("p");
  private feedback = document.createElement("p");
  private filters = document.createElement("div");
  private family: Family | "all" = "all";
  private zone = { id: "", title: "" };
  private request = 0;
  private preview: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;

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
    kicker.textContent = "Make this place sound like life";
    const title = document.createElement("h2");
    title.id = "sound-library-title";
    title.textContent = "Leave a little sound";
    heading.append(kicker, title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "library-close";
    close.textContent = "Close";
    close.onclick = () => this.close();
    head.append(heading, close);

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
        for (const b of this.filters.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === button));
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
    dialog.append(head, label, this.filters, this.result, this.list, this.feedback, note);
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
    this.zone = this.opts.zone();
    this.feedback.textContent = "";
    this.search.value = "";
    this.family = "all";
    for (const b of this.filters.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.family === "all"));
    this.render();
    this.element.hidden = false;
    this.element.showModal();
    this.search.focus();
  }

  close(): void {
    this.stopPreview();
    this.element.close();
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

  private render(): void {
    // Filtering cancels the private preview rather than hiding a playing control.
    this.stopPreview();
    this.feedback.textContent = "";
    this.list.replaceChildren();
    const query = this.search.value.trim().toLocaleLowerCase();
    const kinds = SOUNDS.filter((kind) => (this.family === "all" || kind.family === this.family)
      && (kind.label + " " + FAMILIES[kind.family].label).toLocaleLowerCase().includes(query))
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
      leave.onclick = async () => {
        if (this.pending) return;
        this.pending = true;
        for (const b of this.list.querySelectorAll<HTMLButtonElement>("[data-sound]")) b.disabled = true;
        leave.textContent = "Leaving…";
        try {
          const error = await this.opts.leave(kind.id);
          if (error) this.feedback.textContent = error;
        } finally {
          this.pending = false;
          for (const b of this.list.querySelectorAll<HTMLButtonElement>("[data-sound]")) b.disabled = false;
          leave.textContent = "Leave it here";
        }
      };
      li.append(text, listen, leave);
      this.list.append(li);
    }
    if (kinds.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No sounds match yet. Try another word or sound family.";
      this.list.append(empty);
    }
  }
}
