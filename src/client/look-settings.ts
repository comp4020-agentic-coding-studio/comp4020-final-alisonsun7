// Two equally explicit pointer preferences, remembered in this browser only.
export type LookMode = "follow" | "scene";
const KEY = "soac-look-mode";

export function loadLookMode(): LookMode {
  try { return localStorage.getItem(KEY) === "scene" ? "scene" : "follow"; }
  catch { return "follow"; }
}

interface Options {
  change: (mode: LookMode) => void;
  open: () => void;
  close: () => void;
}

const MODES: { id: LookMode; label: string; hint: string }[] = [
  { id: "follow", label: "Follow pointer", hint: "Drag down to look down; left to look left." },
  { id: "scene", label: "Drag the scene", hint: "Drag down to look up; left to look right." },
];

export class LookSettings {
  readonly element = document.createElement("dialog");
  private mode = loadLookMode();
  private groups: HTMLFieldSetElement[] = [];

  constructor(private opts: Options) {
    const dialog = this.element;
    dialog.className = "look-settings";
    dialog.id = "look-settings-dialog";
    dialog.hidden = true;
    dialog.setAttribute("aria-labelledby", "look-settings-title");
    const title = document.createElement("h2");
    title.id = "look-settings-title";
    title.textContent = "Make the view feel right";
    const intro = document.createElement("p");
    intro.textContent = "Choose how mouse or trackpad dragging moves your view.";
    const note = document.createElement("p");
    note.className = "look-note";
    note.textContent = "Saved in this browser. You can change it at any time.";
    const done = document.createElement("button");
    done.type = "button";
    done.className = "btn primary";
    done.textContent = "Done";
    done.onclick = () => dialog.close();
    dialog.append(title, intro, this.choices("settings-look-mode"), note, done);
    dialog.addEventListener("close", () => {
      dialog.hidden = true;
      this.opts.close();
    });
  }

  choices(name: string): HTMLFieldSetElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "look-modes";
    const legend = document.createElement("legend");
    legend.textContent = "Look direction";
    fieldset.append(legend);
    for (const choice of MODES) {
      const label = document.createElement("label");
      label.className = "look-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = choice.id;
      input.checked = this.mode === choice.id;
      const text = document.createElement("span");
      const heading = document.createElement("strong");
      heading.textContent = choice.label;
      const hint = document.createElement("small");
      hint.textContent = choice.hint;
      text.append(heading, hint);
      label.append(input, text);
      fieldset.append(label);
      input.onchange = () => {
        this.mode = choice.id;
        for (const group of this.groups) {
          for (const radio of group.querySelectorAll<HTMLInputElement>("input")) radio.checked = radio.value === this.mode;
        }
        try { localStorage.setItem(KEY, this.mode); } catch { /* still works for this visit */ }
        this.opts.change(this.mode);
      };
    }
    this.groups.push(fieldset);
    return fieldset;
  }

  open(): void {
    this.opts.open();
    this.element.hidden = false;
    this.element.showModal();
    this.element.querySelector<HTMLInputElement>("input:checked")?.focus();
  }
}
