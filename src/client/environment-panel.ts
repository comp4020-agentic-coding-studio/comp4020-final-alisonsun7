// Browse scenery privately; change the shared weather and clock only on Apply.
import type { Scene } from "../shared/catalog.js";
import { LANDSCAPES } from "../shared/landscapes.js";
import { formatTime, minuteAt, TIME_PRESETS, WEATHERS, WEATHER_LABELS, type Environment, type Weather } from "../shared/environment.js";

export type EnvironmentDraft = Pick<Environment, "weather" | "minuteOfDay" | "clockRunning">;
export type ApplyEnvironmentResult =
  | { ok: true; environment: Environment; serverNow: string }
  | { ok: false; code: string; environment?: Environment; serverNow?: string };

interface Options {
  scene: Scene;
  apply: (draft: EnvironmentDraft, revision: number) => Promise<ApplyEnvironmentResult>;
  goTo: (zone: string) => void;
  open: () => void;
  close: () => void;
}

type Tab = "environment" | "scenes";

const WEATHER_NOTES: Record<Weather, string> = {
  clear: "Open skies, crisp light",
  cloudy: "Soft light, a silver horizon",
  rain: "Falling rain, a wet boardwalk",
  mist: "A quiet, hazy distance",
};

const WEATHER_PATHS: Record<Weather, string> = {
  clear: '<circle cx="16" cy="16" r="5"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3M7 7l2 2m14 14 2 2M7 25l2-2M23 9l2-2"/>',
  cloudy: '<path d="M9 23a5 5 0 0 1-1-10 8 8 0 0 1 15-1 6 6 0 0 1 0 11Z"/>',
  rain: '<path d="M9 19a5 5 0 0 1-1-10 8 8 0 0 1 15-1 6 6 0 0 1 0 11ZM10 23l-2 4m9-4-2 4m9-4-2 4"/>',
  mist: '<path d="M7 10h18M3 16h20M9 22h20M5 28h14"/>',
};

function weatherIcon(weather: Weather): string {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WEATHER_PATHS[weather]}</svg>`;
}

// Small original vector postcards: no photos, downloads or additional assets.
function postcard(zone: string): string {
  const sea = '<path d="M0 48Q50 37 105 48T240 44V100H0Z" fill="#93b6b2"/><path d="M0 68Q70 56 134 66T240 63" fill="none" stroke="#dce4d1" stroke-width="2"/>';
  const tree = (x: number, y: number, s = 1): string => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 6v51" stroke="#735e44" stroke-width="4"/><path d="M0 0-16 24h8l-15 19h46L8 24h8Z" fill="#375e4b"/></g>`;
  const horizon = '<path d="m0 47 35-13 22 9 33-17 40 19 35-8 45 9 30-6v15H0Z" fill="#9fb5a0"/>';
  let drawing: string;
  if (zone === "forest") drawing = `<path d="M0 51Q120 23 240 57V100H0Z" fill="#a9b78b"/><path d="m99 100 24-62h9l27 62" fill="#d5c3a0"/>${tree(29, 9, 1.5)}${tree(73, 22)}${tree(194, 5, 1.5)}${tree(160, 21, .85)}`;
  else if (zone === "creek") drawing = `<path d="M0 44Q120 31 240 49V100H0Z" fill="#9eae83"/><path d="M0 75Q95 44 240 66V100Q100 75 0 97Z" fill="#86aaa4"/>${tree(26, 8, 1.1)}${tree(213, 11)}<path d="m62 69 99-13 22 10-99 17Z" fill="#ae8656"/><path d="m63 58 98-13 22 10M67 59v14m92-26v13m20-4v14" fill="none" stroke="#6b6849" stroke-width="3"/>`;
  else if (zone === "forest-edge") drawing = `${horizon}${sea}<path d="M0 67Q70 50 120 70L157 100H0Z" fill="#b6ba8d"/><path d="m80 100 23-43 8 1-6 42" fill="#ded0ac"/>${tree(20, 8, 1.4)}${tree(61, 23, .8)}`;
  else if (zone === "boardwalk") drawing = `${horizon}${sea}<path d="M0 77 240 67v33H0Z" fill="#bfaa83"/><path d="m0 91 240-11M55 75l-8 25m70-29-3 29m67-31 4 31" stroke="#a38b6d" fill="none"/><path d="M24 69V30h72v39M128 68V39h49v29" fill="#e7dfbd" stroke="#718771"/><path d="m19 30 41-17 42 17m22 9 29-13 28 13" fill="#477360"/><path d="M36 68V45h16v23m16-23h17v14m72 8V49h11v18" fill="#557b6d"/>`;
  else if (zone === "pier") drawing = `${horizon}${sea}<path d="m67 100 44-62h18l43 62" fill="#b59a75"/><path d="m99 54 42 0m-52 16h62m-76 17h91M109 43l-35 57m53-57 36 57" stroke="#8c795d" stroke-width="1.5" fill="none"/><path d="m88 96 25-54m18 0 25 54M91 86v-20m62 20V66" stroke="#716c51" stroke-width="3"/>`;
  else if (zone === "beach") drawing = `${horizon}${sea}<path d="M0 75Q110 65 240 90v10H0Z" fill="#e6d3a8"/><path d="M0 71Q100 67 240 85" fill="none" stroke="#f3ead4" stroke-width="3"/><path d="m181 82 9-26h15l8 27M186 58V42h23v16Z" fill="#b98c6d"/><path d="m183 43 14-9 15 9" fill="#587967"/>`;
  else {
    const room = `<path d="M0 0h240v100H0Z" fill="#d9d4b6"/><path d="M0 77h240v23H0Z" fill="#a6916f"/><path d="M136 13h87v53h-87Z" fill="#9fbbb3"/><path d="M139 44h81v19h-81Z" fill="#739e9a"/><path d="M179 14v51" stroke="#6b806b" stroke-width="3"/>`;
    if (zone === "counter") drawing = `${room}<path d="M15 59h121v10H15Z" fill="#8c7250"/><path d="M20 69h111v31H20Z" fill="#5e7961"/><path d="M38 31h38v29H38Z" fill="#75918b"/><path d="M43 37h28v13H43Z" fill="#d8ddc7"/><path d="M87 55q9-15 18 0m5 0q9-15 18 0" fill="#c39b62"/>`;
    else if (zone === "tables") drawing = `${room}<path d="M59 0v24m49-24v17" stroke="#7e7657" stroke-width="2"/><path d="m45 29 14-10 14 10m22-7 13-10 13 10" fill="#b68f58"/><ellipse cx="73" cy="67" rx="40" ry="11" fill="#b3976c"/><path d="M73 73v26m-51-38v29m102-29v29m-110-29h17m85 0h17" stroke="#62745b" stroke-width="5"/>`;
    else drawing = `${room}<path d="M20 12h200v58H20Z" fill="#a9c3b9"/>${sea}<path d="M20 12h200v58H20Zm64 0v58m71-58v58M16 73h208" fill="none" stroke="#68816a" stroke-width="5"/><path d="M0 81h240v19H0Z" fill="#ac926e"/><path d="M40 81v19m160-19v19" stroke="#6a7557" stroke-width="5"/>`;
  }
  return `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="240" height="100" fill="#dbe2cd"/><circle cx="182" cy="21" r="13" fill="#eee4bc"/>${drawing}</svg>`;
}

export class EnvironmentPanel {
  readonly element = document.createElement("dialog");
  private environment: Environment | null = null;
  private draft: EnvironmentDraft | null = null;
  private draftRevision = 0;
  private draftAnchor = 0;
  private serverAnchor = { time: Date.now(), performance: performance.now() };
  private joined = false;
  private connected = false;
  private dirty = false;
  private pending = false;
  private conflict = false;
  private zone = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private current = document.createElement("p");
  private feedback = document.createElement("p");
  private access = document.createElement("p");
  private latest = document.createElement("button");
  private applyButton = document.createElement("button");
  private time = document.createElement("input");
  private timeLabel = document.createElement("output");
  private running = document.createElement("input");
  private form = document.createElement("form");
  private tabs = new Map<Tab, HTMLButtonElement>();
  private panels = new Map<Tab, HTMLElement>();

  constructor(private opts: Options) {
    const dialog = this.element;
    dialog.id = "environment-dialog";
    dialog.className = "environment-panel";
    dialog.hidden = true;
    dialog.setAttribute("aria-labelledby", "environment-title");
    const head = document.createElement("div");
    head.className = "environment-heading";
    head.innerHTML = '<div><p class="environment-kicker">From the forest to the sea</p><h2 id="environment-title">A place that changes</h2></div>';
    const close = document.createElement("button");
    close.type = "button";
    close.className = "environment-close";
    close.textContent = "Close";
    close.onclick = () => dialog.close();
    head.append(close);
    const tabs = document.createElement("div");
    tabs.className = "environment-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Explore the place");
    for (const [id, label] of [["environment", "Weather & time"], ["scenes", "Scenes"]] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `${id}-tab`;
      button.textContent = label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `${id}-content`);
      button.onclick = () => this.selectTab(id);
      button.onkeydown = (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "environment" : event.key === "End" ? "scenes" : id === "environment" ? "scenes" : "environment";
        this.selectTab(next);
        this.tabs.get(next)!.focus();
      };
      this.tabs.set(id, button);
      const panel = document.createElement("section");
      panel.id = `${id}-content`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      this.panels.set(id, panel);
      tabs.append(button);
    }
    this.buildEnvironment();
    this.buildScenes();
    dialog.append(head, tabs, ...this.panels.values());
    dialog.addEventListener("close", () => {
      clearInterval(this.timer);
      this.timer = undefined;
      dialog.hidden = true;
      this.opts.close();
    });
    this.selectTab("environment");
    this.renderAvailability();
  }

  private buildEnvironment(): void {
    const panel = this.panels.get("environment")!;
    const note = document.createElement("p");
    note.className = "environment-intro";
    note.textContent = "Shape the light around everyone's sounds. Weather and time are shared with everyone here.";
    this.current.className = "environment-current";
    this.current.id = "environment-current";
    const weather = document.createElement("fieldset");
    weather.className = "environment-weather";
    weather.innerHTML = "<legend>Weather</legend>";
    for (const id of WEATHERS) {
      const label = document.createElement("label");
      label.className = "environment-weather-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "environment-weather";
      input.value = id;
      const icon = document.createElement("span");
      icon.className = "environment-weather-icon";
      icon.innerHTML = weatherIcon(id);
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = WEATHER_LABELS[id];
      const detail = document.createElement("small");
      detail.textContent = WEATHER_NOTES[id];
      text.append(title, detail);
      label.append(input, icon, text);
      weather.append(label);
      input.onchange = () => {
        if (!this.draft) return;
        this.draft.weather = id;
        this.changed();
      };
    }
    const time = document.createElement("fieldset");
    time.className = "environment-time";
    time.innerHTML = '<legend>Time in this place</legend>';
    const timeHead = document.createElement("label");
    timeHead.className = "environment-time-label";
    timeHead.htmlFor = "environment-time";
    timeHead.append("Choose the light", this.timeLabel);
    this.timeLabel.setAttribute("for", "environment-time");
    this.timeLabel.setAttribute("aria-live", "off");
    this.time.id = "environment-time";
    this.time.name = "minuteOfDay";
    this.time.type = "range";
    this.time.min = "0";
    this.time.max = "1425";
    this.time.step = "15";
    this.time.oninput = () => {
      if (!this.draft) return;
      this.draft.minuteOfDay = Number(this.time.value);
      this.draftAnchor = this.now();
      this.changed();
    };
    const presets = document.createElement("div");
    presets.className = "environment-time-presets";
    for (const preset of TIME_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.time = preset.id;
      button.textContent = preset.label;
      button.onclick = () => {
        if (!this.draft) return;
        this.draft.minuteOfDay = preset.minuteOfDay;
        this.draftAnchor = this.now();
        this.changed();
        this.renderDraft();
      };
      presets.append(button);
    }
    const running = document.createElement("label");
    running.className = "environment-clock";
    this.running.type = "checkbox";
    this.running.id = "environment-running";
    const text = document.createElement("span");
    text.innerHTML = "<strong>Let time move</strong><small>A whole day in 24 minutes. Turn off to hold this moment.</small>";
    running.append(this.running, text);
    this.running.onchange = () => {
      if (!this.draft) return;
      this.draft.minuteOfDay = this.draftMinute();
      this.draft.clockRunning = this.running.checked;
      this.draftAnchor = this.now();
      this.changed();
    };
    time.append(timeHead, this.time, presets, running);
    this.feedback.className = "environment-feedback";
    this.feedback.id = "environment-feedback";
    this.feedback.setAttribute("role", "status");
    this.latest.type = "button";
    this.latest.className = "environment-latest";
    this.latest.textContent = "Use latest shared settings";
    this.latest.hidden = true;
    this.latest.onclick = () => {
      this.resetDraft();
      this.feedback.textContent = "Loaded the latest settings. Choose what you would like to change.";
    };
    const footer = document.createElement("div");
    footer.className = "environment-footer";
    this.access.className = "environment-access";
    this.applyButton.id = "environment-apply";
    this.applyButton.type = "submit";
    this.applyButton.className = "btn primary";
    this.applyButton.textContent = "Apply for everyone";
    footer.append(this.access, this.applyButton);
    this.form.append(weather, time, this.feedback, this.latest, footer);
    this.form.onsubmit = (event) => { event.preventDefault(); void this.apply(); };
    panel.append(note, this.current, this.form);
  }

  private buildScenes(): void {
    const panel = this.panels.get("scenes")!;
    const intro = document.createElement("p");
    intro.className = "environment-intro";
    intro.textContent = "Find a new view in the same shared place. Your sounds and the people here stay with you.";
    const cards = document.createElement("div");
    cards.className = "environment-scenes";
    for (const destination of LANDSCAPES.filter((entry) => this.opts.scene.zones.some((zone) => zone.id === entry.zoneId))) {
      const card = document.createElement("article");
      card.className = "environment-scene";
      card.dataset.zone = destination.zoneId;
      const art = document.createElement("div");
      art.className = "environment-postcard";
      art.innerHTML = postcard(destination.zoneId);
      const body = document.createElement("div");
      body.className = "environment-scene-body";
      const kind = document.createElement("p");
      kind.className = "environment-scene-kind";
      kind.textContent = destination.kind;
      const title = document.createElement("h3");
      title.textContent = destination.label;
      const detail = document.createElement("p");
      detail.textContent = destination.detail;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.destination = destination.zoneId;
      button.textContent = "Go here";
      button.setAttribute("aria-label", "Go to " + destination.label);
      button.onclick = () => {
        this.opts.goTo(destination.zoneId);
        this.element.close();
      };
      body.append(kind, title, detail, button);
      card.append(art, body);
      cards.append(card);
    }
    panel.append(intro, cards);
  }

  setEnvironment(environment: Environment, serverNow: string): void {
    if (this.environment && environment.revision < this.environment.revision) return;
    const sameRevision = environment.revision === this.environment?.revision;
    const previousNow = this.now();
    this.environment = environment;
    const time = Date.parse(serverNow);
    if (Number.isFinite(time)) this.serverAnchor = { time: sameRevision ? Math.max(time, previousNow) : time, performance: performance.now() };
    if (!this.dirty && !this.pending) this.resetDraft();
    else if (environment.revision > this.draftRevision && !this.pending) {
      this.conflict = true;
      this.feedback.textContent = "The shared weather or time changed while you were choosing. Your choices have not been applied. Load the latest settings to continue.";
    }
    this.tick();
    this.renderAvailability();
  }

  setAvailability({ joined, connected }: { joined: boolean; connected: boolean }): void {
    this.joined = joined;
    this.connected = connected;
    this.renderAvailability();
  }

  setZone(zone: string): void {
    this.zone = zone;
    for (const card of this.element.querySelectorAll<HTMLElement>(".environment-scene")) {
      const here = card.dataset.zone === zone;
      card.classList.toggle("is-here", here);
      const button = card.querySelector<HTMLButtonElement>("button")!;
      button.textContent = here ? "You are here" : "Go here";
      if (here) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
      button.disabled = here;
    }
  }

  open(tab: Tab = "environment"): void {
    if (!this.dirty && !this.pending) {
      this.resetDraft();
      this.feedback.textContent = "";
    }
    this.selectTab(tab);
    this.setZone(this.zone);
    if (!this.element.open) {
      this.opts.open();
      this.element.hidden = false;
      this.element.showModal();
      this.timer = setInterval(() => this.tick(), 1000);
    }
    this.tick();
    this.tabs.get(tab)!.focus();
  }

  private selectTab(tab: Tab): void {
    for (const [id, button] of this.tabs) {
      button.setAttribute("aria-selected", String(id === tab));
      button.tabIndex = id === tab ? 0 : -1;
      this.panels.get(id)!.hidden = id !== tab;
    }
  }

  private now(): number {
    return this.serverAnchor.time + performance.now() - this.serverAnchor.performance;
  }

  private draftMinute(): number {
    if (!this.draft) return 840;
    return minuteAt({ ...this.draft, revision: this.draftRevision, updatedAt: new Date(this.draftAnchor).toISOString() }, this.now());
  }

  private resetDraft(): void {
    if (!this.environment) return;
    this.draft = { weather: this.environment.weather, minuteOfDay: minuteAt(this.environment, this.now()), clockRunning: this.environment.clockRunning };
    this.draftAnchor = this.now();
    this.draftRevision = this.environment.revision;
    this.dirty = false;
    this.conflict = false;
    this.renderDraft();
    this.renderAvailability();
  }

  private renderDraft(): void {
    if (!this.draft) return;
    for (const input of this.form.querySelectorAll<HTMLInputElement>('input[name="environment-weather"]')) input.checked = input.value === this.draft.weather;
    this.time.value = String(Math.min(1425, Math.round(this.draftMinute() / 15) * 15));
    this.running.checked = this.draft.clockRunning;
    this.tick();
  }

  private changed(): void {
    this.dirty = true;
    if (!this.conflict) this.feedback.textContent = "Only you can see these choices until you apply them.";
    this.tick();
    this.renderAvailability();
  }

  private tick(): void {
    if (this.environment) this.current.textContent = "Shared now · " + WEATHER_LABELS[this.environment.weather] + " · " + formatTime(minuteAt(this.environment, this.now())) + (this.environment.clockRunning ? " · Time is moving" : " · Time paused");
    const minute = this.draftMinute();
    this.timeLabel.textContent = formatTime(minute);
    this.time.setAttribute("aria-valuetext", formatTime(minute));
  }

  private renderAvailability(): void {
    this.access.textContent = !this.joined
      ? "Join with a name to change the shared weather and time. You can explore every scene."
      : !this.connected ? "Reconnecting. Your choices stay here; apply them when you are back online."
      : "Selections stay private until you apply. Everyone here sees the change.";
    this.applyButton.disabled = !this.environment || !this.joined || !this.connected || !this.dirty || this.pending || this.conflict;
    this.applyButton.textContent = this.pending ? "Applying…" : "Apply for everyone";
    this.latest.hidden = !this.conflict;
    for (const control of this.form.querySelectorAll<HTMLInputElement | HTMLFieldSetElement | HTMLButtonElement>("fieldset, input, button[data-time]")) control.disabled = this.pending;
    this.latest.disabled = this.pending;
  }

  private async apply(): Promise<void> {
    if (!this.draft || this.applyButton.disabled) return;
    const draft = { ...this.draft, minuteOfDay: Math.floor(this.draftMinute()) };
    this.pending = true;
    this.feedback.textContent = "Applying to the shared place…";
    this.renderAvailability();
    const result = await this.opts.apply(draft, this.draftRevision).catch((): ApplyEnvironmentResult => ({ ok: false, code: "offline" }));
    this.pending = false;
    if (result.environment && result.serverNow) this.setEnvironment(result.environment, result.serverNow);
    if (result.ok) {
      this.resetDraft();
      this.feedback.textContent = this.environment && this.environment.revision > result.environment.revision
        ? "Your change was applied, then someone changed the shared settings again. The latest settings are shown here."
        : "Applied. Everyone here shares this weather and time.";
    } else if (result.code === "stale") {
      this.conflict = true;
      this.feedback.textContent = "Someone changed the weather or time first. Your choices are still here. Use the latest shared settings, then choose again.";
    } else {
      this.feedback.textContent = result.code === "no_session" || result.code === "forbidden"
        ? "Join with a name before changing the shared weather and time. Your choices are still here."
        : result.code === "slow_down" ? "Please wait a moment, then press Apply again. Your choices are still here."
        : result.code === "offline" ? "The connection was interrupted. Your choices are still here. Check the shared settings before trying again."
        : "That change could not be applied. Your choices are still here; please try again.";
    }
    this.renderAvailability();
  }
}
