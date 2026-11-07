import { chorusPlaceAt, recommendedSounds, VARIANT_COPY, type ChorusWork } from "../shared/chorus.js";
import { PLANET_PLACES, planetDistance } from "../shared/planet.js";
import { findSound } from "../shared/sounds.js";
import type { Person, SoundReference } from "../shared/protocol.js";
import { choiceConsequence, nextSource, soundName, workNextStep, workResult } from "../shared/chorus-guidance.js";
import { authorMark } from "../shared/chorus-signature.js";

interface Options {
  at: () => { x: number; z: number };
  you: () => Person | null;
  ready: () => boolean;
  preview: (id: string) => Promise<boolean>;
  stop: () => void;
  publish: (id: string) => Promise<string | null>;
  respond: (sound: SoundReference) => void;
  create: () => void;
  remove: (sound: SoundReference) => void;
  visit: (work: ChorusWork) => void;
  full: () => void;
  pause: () => void;
  resume: () => void;
  closeDraft: () => void;
  sound: (on: boolean) => void;
  listening?: () => boolean;
  minimise?: () => void;
  invite?: (work: ChorusWork) => void;
  availability?: (id: string) => { allowed: boolean; reason: string };
  makeRoom?: (id: string, parent: SoundReference | null) => void;
  focus: (id: string | null) => void;
}
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);if (text) e.textContent = text;if (className) e.className = className;return e;
};
const action = (text: string, run: () => void, primary = false): HTMLButtonElement => {
  const b = node("button", text, primary ? "btn primary" : "btn ghost");b.type = "button";b.onclick = run;return b;
};
function author(id: string, name: string): HTMLElement {
  const wrapper = node("span", undefined, "chorus-source-author"), signature = authorMark(id);
  const mark = node("i", undefined, "chorus-author-mark");mark.setAttribute("aria-hidden", "true");mark.dataset.shape = signature.shape;mark.style.setProperty("--author-color", signature.color);
  wrapper.dataset.author = id;wrapper.title = `${name}'s ${signature.label} mark`;wrapper.append(mark, document.createTextNode(name));return wrapper;
}
function authors(work: ChorusWork): HTMLElement {
  const line = node("p", "Made by ", "chorus-authors");
  work.contributors.forEach((person, index) => {
    if (index) line.append(document.createTextNode(" & "));
    const label = author(person.id, person.name);label.dataset.active = String(work.liveSources.some(source => source.byId === person.id));line.append(label);
  });return line;
}
function trap(dialog: HTMLDialogElement): void {
  dialog.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const targets = [...dialog.querySelectorAll<HTMLElement>("button,input,select,a[href]")].filter(b => !b.matches(":disabled") && b.getClientRects().length);
    if (e.shiftKey && document.activeElement === targets[0]) { e.preventDefault();targets.at(-1)?.focus(); }
    else if (!e.shiftKey && document.activeElement === targets.at(-1)) { e.preventDefault();targets[0]?.focus(); }
  });
}
export class ChorusStudio {
  readonly element = node("dialog", undefined, "chorus-dialog chorus-studio");
  readonly journal = node("dialog", undefined, "chorus-dialog chorus-journal");
  readonly welcome = node("dialog", undefined, "chorus-dialog chorus-welcome");
  readonly dock = node("aside", undefined, "chorus-dock");
  private works: ChorusWork[] = [];
  private focusId: string | null = null;
  private signature = "";
  private collapsed = false;
  private explanationOpen = false;
  private previewRevision = 0;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private publishing = false;
  private viewRevision = 0;
  private parent: SoundReference | null = null;
  private title = node("h2");
  private context = node("p", undefined, "chorus-context");
  private choices = node("div", undefined, "chorus-choices");
  private feedback = node("p", undefined, "chorus-feedback");
  private records = node("div", undefined, "chorus-records");
  constructor(private host: HTMLElement, private opts: Options) {
    this.element.id = "chorus-studio";this.title.id = "chorus-studio-title";this.element.setAttribute("aria-labelledby", this.title.id);
    const head = node("div", undefined, "chorus-dialog-heading");head.append(this.title, action("Cancel", () => this.close()));
    this.context.id = "chorus-answering";this.feedback.setAttribute("role", "status");
    this.element.append(node("p", "A LITTLE INGREDIENT, A DIFFERENT WORLD", "planet-kicker"), head, this.context, this.choices, this.feedback,
      action("Explore every sound", () => { this.close();this.opts.full(); }));
    this.element.addEventListener("close", () => { this.previewRevision++;this.opts.stop();this.opts.closeDraft();this.opts.resume(); });
    this.element.addEventListener("cancel", () => this.opts.stop());
    this.journal.id = "chorus-journal";this.journal.setAttribute("aria-labelledby", "chorus-journal-title");
    const journalHead = node("div", undefined, "chorus-dialog-heading"), title = node("h2", "What we left here");title.id = "chorus-journal-title";
    journalHead.append(title, action("Back to the world", () => this.journal.close()));
    const beginning=action("Begin a new work here",()=>{this.journal.addEventListener("close",()=>this.opts.create(),{once:true});this.journal.close();});beginning.id="chorus-new-work";
    this.journal.append(node("p", "OUR LITTLE WORKS", "planet-kicker"), journalHead, node("p", "Find your mark beside each sound and on its leaf in the world. Answer a live sound to keep its work growing; the most recently changed work takes the stage."),beginning, this.records);
    this.journal.addEventListener("close", () => { this.opts.stop();this.opts.resume(); });
    this.welcome.id = "chorus-welcome";this.welcome.setAttribute("aria-labelledby", "chorus-welcome-title");
    const welcomeTitle = node("h2", "A place that remembers your answer.");welcomeTitle.id = "chorus-welcome-title";
    const mark = node("div", undefined, "chorus-welcome-mark");mark.setAttribute("aria-hidden", "true");for (let i = 0; i < 5; i++) mark.append(node("i"));
    this.welcome.append(node("p", "LITTLE CHORUS", "planet-kicker"), mark, welcomeTitle,
      node("p", "Leave a little sound. Answer a friend. Grow something neither of you could make alone."),
      node("p", "Start at the Listening Green. Water and birds grow a canopy; melody and rhythm turn a beat flower. Other pairings make their own light.", "chorus-welcome-note"),
      action("Enter with sound", () => this.arrive(true), true), action("Explore quietly", () => this.arrive(false)),
      node("p", "No musical knowledge needed. Listening is private; leaving a sound changes the shared place.", "chorus-welcome-note"));
    this.welcome.addEventListener("cancel", () => this.arrive(false));
    this.welcome.addEventListener("close", () => this.opts.resume());
    this.dock.id = "chorus-work";this.dock.setAttribute("aria-label", "The work in this place");
    this.host.append(this.element, this.journal, this.welcome, this.dock);
    [this.element, this.journal, this.welcome].forEach(trap);
  }
  private arrive(sound: boolean): void {
    try { localStorage.setItem("chorus-welcome-v1", "seen"); } catch { }
    this.opts.sound(sound);this.welcome.close();this.opts.resume();
  }
  showWelcome(): void { this.opts.pause();this.welcome.showModal(); }
  open(parent: SoundReference | null): void {
    this.viewRevision++;
    this.parent = parent;this.previewRevision++;this.opts.stop();this.feedback.textContent = "";
    const cafe = PLANET_PLACES.find(p => p.id === "tea")!;
    const inCafe = planetDistance(this.opts.at(), cafe) <= 8;
    const place = chorusPlaceAt(this.opts.at()) ?? "green";
    this.title.textContent = parent ? "What would you answer?" : "What will you bring?";
    this.context.textContent = parent ? `Answering ${parent.by}'s ${soundName(parent)}. Listen privately, then choose the change you want to bring. Your answer keeps both names.` : inCafe ? "Make this café your kind of company. Coffee brings steam, conversation warms the tables, music sets the record spinning. Listen is private; Leave it here is shared." : "Listen to one ingredient, then leave the one you like. A glowing petal will mark your sound; a friend's answer can open it into a shared place.";
    this.renderChoices(inCafe && !parent ? ["espresso", "cafe-chatter", "cafe-music"] : recommendedSounds(parent, place));this.opts.pause();this.element.showModal();
  }
  close(): void { this.viewRevision++;this.previewRevision++;this.opts.stop();this.element.close(); }
  private renderChoices(ids: string[]): void {
    this.choices.replaceChildren(...ids.map(id => {
      const s = findSound(id)!;const card = node("article", undefined, "chorus-choice");card.dataset.sound = id;
      const symbol = node("span", undefined, `chorus-tone ${id.includes("pulse") ? "pulse" : id.includes("trickle") ? "water" : id.includes("forest") ? "bird" : "notes"}`);symbol.setAttribute("aria-hidden", "true");
      const title = node("h3", s.label);
      const copy = id === "espresso" ? "A short burst of coffee-making; the machine comes to life." : id === "cafe-chatter" ? "Soft company at the tables. Residents gather around conversation." : id === "cafe-music" ? "An easy café tune; watch the record turn." : id === "chorus-pulse" ? "A soft steady heartbeat. Give a melody somewhere to land." : id === "chorus-chords" ? "Warm, unhurried harmony. A little room for a friend's rhythm." : id === "chorus-bells" ? "A few bright notes with space between them." : id === "trickle" ? "A small stream. A bird's answer can open a canopy." : id === "evening-forest" ? "A bird call. Let it settle beside water." : "A quiet texture with room for another voice.";
      const listen = action("Listen", () => {
        if(listen.getAttribute("aria-pressed")==="true"){this.previewRevision++;clearTimeout(this.previewTimer);this.opts.stop();listen.setAttribute("aria-pressed","false");listen.textContent="Listen";this.feedback.textContent="Private listen stopped.";return;}
        const revision = ++this.previewRevision;this.opts.stop();
        clearTimeout(this.previewTimer);this.choices.querySelectorAll("[aria-pressed]").forEach(b => {b.setAttribute("aria-pressed", "false");b.textContent="Listen";});
        listen.setAttribute("aria-pressed", "true");this.feedback.textContent = "Loading your private listen…";
        void this.opts.preview(id).then(ok => { if (revision !== this.previewRevision || !this.element.open) return;this.feedback.textContent = ok ? "Just you, listening. Nothing has been shared." : "This sound could not load. Try Listen again.";listen.textContent=ok?"Stop":"Listen";listen.setAttribute("aria-pressed", String(ok));if(ok)this.previewTimer=setTimeout(()=>{listen.setAttribute("aria-pressed","false");listen.textContent="Listen";},5000); });
      });listen.setAttribute("aria-label", `Listen to ${s.label}`);listen.setAttribute("aria-pressed", "false");listen.dataset.listen = id;
      const leave = action("Leave it here", () => {
        if (this.publishing) return;const view = this.viewRevision;this.publishing = true;leave.disabled = true;this.feedback.textContent = "Bringing your ingredient into the world…";
        void this.opts.publish(id).then(error => {
          this.publishing = false;
          for (const current of this.choices.querySelectorAll<HTMLElement>("[data-sound]")) this.updateAvailability(current, current.dataset.sound!);
          if (view !== this.viewRevision || !this.element.open) return;
          if (error) this.feedback.textContent = error;else this.close();
        });
      }, true);leave.dataset.leave = id;leave.setAttribute("aria-label", `Leave ${s.label} here`);
      const work = this.parent ? this.works.find(work => work.sources.some(source => source.id === this.parent!.id)) : undefined;
      const cafe = ["espresso", "cafe-chatter", "cafe-music"].includes(id) && !this.parent;
      card.append(symbol, title, node("p", copy));
      if (!cafe) card.append(node("p", choiceConsequence(id, this.parent, work, this.opts.you()?.id), "chorus-choice-outcome"));
      card.append(listen, leave);
      if (this.opts.makeRoom) {
        const reason = node("p", undefined, "chorus-room-reason");
        const find = action("Find a nearby spot", () => this.opts.makeRoom!(id, this.parent));find.dataset.findRoom=id;find.classList.add("chorus-find-room");find.setAttribute("aria-label",`Find a nearby spot for ${s.label}`);
        card.append(reason, find);
      }
      this.updateAvailability(card, id);return card;
    }));
  }
  private updateAvailability(card: HTMLElement, id: string): void {
    const availability = this.opts.makeRoom ? this.opts.availability?.(id) : undefined;
    const blocked = availability?.allowed === false;
    const leave = card.querySelector<HTMLButtonElement>("[data-leave]");if(leave)leave.disabled=this.publishing || blocked;
    const reason = card.querySelector<HTMLElement>(".chorus-room-reason");if(reason){reason.hidden=!blocked;reason.textContent=blocked?availability!.reason:"";}
    const find = card.querySelector<HTMLButtonElement>("[data-find-room]");if(find){find.hidden=!blocked;find.disabled=this.publishing;}
  }
  setWorks(works: readonly ChorusWork[]): void {
    this.works = [...works];
    if(this.focusId&&!works.some(work=>work.liveSources.some(source=>source.id===this.focusId))){this.focusId=null;this.opts.focus(null);}
    this.signature = "";this.frame();if (this.journal.open) this.renderRecords();
    // Remote additions/withdrawals can change a forecast while someone listens.
    // Update text in place: do not stop their private preview or replace focus.
    if (this.element.open) {
      const work = this.parent ? this.works.find(work=>work.sources.some(source=>source.id===this.parent!.id)) : undefined;
      for (const card of this.choices.querySelectorAll<HTMLElement>("[data-sound]")) {
        const outcome = card.querySelector(".chorus-choice-outcome");
        if (outcome) outcome.textContent = choiceConsequence(card.dataset.sound!, this.parent, work, this.opts.you()?.id);
        this.updateAvailability(card, card.dataset.sound!);
      }
    }
  }
  showJournal(id?: string): void { this.renderRecords();this.opts.pause();this.journal.showModal();if(id)this.records.querySelector<HTMLElement>(`[data-work="${CSS.escape(id)}"]`)?.scrollIntoView({block:"start"}); }
  frame(): void {
    const placeId = chorusPlaceAt(this.opts.at());this.dock.hidden = !placeId || !!document.querySelector("dialog:modal") || !document.getElementById("planet-chat")?.hidden;
    if (!placeId) return;
    const here = this.works.filter(w => w.placeId === placeId && w.liveSources.length);
    // Match the sculpture's canonical latest work. Looking at an older record
    // is local; only an accepted contribution changes which work takes stage.
    const work = here[0];
    const signature = JSON.stringify([placeId, work?.id, work?.lastAt, work?.duet, this.opts.you()?.id, this.opts.ready(), this.focusId, this.collapsed, this.opts.listening?.()]);
    if (signature === this.signature) return;this.signature = signature;
    this.dock.dataset.work = work?.id ?? "";this.dock.dataset.variant = work?.variant ?? "dormant";this.dock.dataset.duet = String(work?.duet ?? false);
    this.dock.dataset.collapsed = String(this.collapsed);
    if (this.collapsed) {
      const reopen = action(work ? `Open ${VARIANT_COPY[work.variant].title}` : "Make a little sound", () => {this.collapsed = false;this.signature = "";this.frame();});
      reopen.id = "chorus-reopen";reopen.setAttribute("aria-expanded", "false");this.replaceDock(reopen);return;
    }
    const carrier = placeId === "green" ? "THE CHORUS TREE" : placeId === "stage" ? "THE BEAT FLOWER" : "THE QUIET LIGHTS";
    const title = node("strong", work ? VARIANT_COPY[work.variant].title : (placeId === "green" ? "One sound can start this." : placeId === "stage" ? "Leave room for a rhythm." : "A softer kind of together."));
    const detail = node("p", work ? workResult(work) : "Listen is just for you. Leave a sound to grow your first petal. Answering a different friend's live sound opens the shared form.");
    detail.id = "chorus-cause";detail.setAttribute("role", "status");
    const credits = work ? authors(work) : node("p", "Your work stays here when you leave.", "chorus-authors");
    const step = node("p", workNextStep(work, this.opts.you()?.id), "chorus-step");step.id = "chorus-step";
    const source = nextSource(work, this.opts.you()?.id);
    const primary = action(source ? (source.byId === this.opts.you()?.id ? "Add another layer" : `Answer ${source.by}`) : "Make a first sound", () => source ? this.opts.respond(source) : this.opts.create(), true);primary.id = "chorus-primary";primary.disabled = !this.opts.ready();
    const journal = action("Our works", () => this.showJournal());journal.id = "chorus-our-works";
    const buttons = node("div", undefined, "chorus-dock-actions");buttons.append(primary, journal);
    if (work && this.opts.invite) {const invite = action("Invite a friend", () => this.opts.invite!(work));invite.id = "chorus-invite";buttons.append(invite);}
    if (source) { const focus = action(this.opts.listening?.() === false ? "Enable listening" : this.focusId ? "Hear the whole place" : "Listen closely", () => { if(this.opts.listening?.() === false)this.opts.sound(true);this.focusId = this.focusId ? null : source.id;this.opts.focus(this.focusId);this.signature = ""; });focus.setAttribute("aria-pressed", String(!!this.focusId));focus.id = "chorus-focus";buttons.append(focus); }
    const head = node("div", undefined, "chorus-dock-heading"), close = action("×", () => {this.opts.minimise?.();this.collapsed = true;this.signature = "";this.frame();this.dock.querySelector<HTMLButtonElement>("button")?.focus();});
    close.id = "chorus-minimise";close.setAttribute("aria-label", "Minimise work panel");close.title = "Minimise work panel";head.append(node("span", carrier, "planet-kicker"), close);
    const explanation = node("details", undefined, "chorus-explanation");
    this.explanationOpen = this.dock.querySelector("details")?.open ?? this.explanationOpen;
    explanation.open = this.explanationOpen;explanation.ontoggle = () => {this.explanationOpen = explanation.open;};
    explanation.append(node("summary", "What changed?"), detail);
    this.replaceDock(head, title, step, credits, explanation, buttons);
  }
  private replaceDock(...children: HTMLElement[]): void {
    const active = document.activeElement, focused = active instanceof HTMLElement && this.dock.contains(active) ? active.id : null;
    this.dock.replaceChildren(...children);
    if(focused)(this.dock.querySelector<HTMLElement>(`#${CSS.escape(focused)}`) ?? this.dock.querySelector<HTMLElement>("button"))?.focus({preventScroll:true});
  }
  private renderRecords(): void {
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.recordAction : undefined;
    this.records.replaceChildren(...this.works.map(work => {
      const card = node("article", undefined, "chorus-record");card.dataset.work = work.id;card.dataset.duet = String(work.duet);
      card.append(node("span", `${PLANET_PLACES.find(p => p.id === work.placeId)!.title} · ${work.liveSources.length ? work.duet ? "opened together" : "ready for a friend" : "resting"}`, "planet-kicker"), node("h3", work.title), authors(work), node("p", `${VARIANT_COPY[work.variant].title}. ${workResult(work)}`, "chorus-record-result"));
      const list = node("ol");
      for (const source of work.sources) {
        const parent = work.sources.find(s => s.id === source.replyToId), item = node("li");item.dataset.source = source.id;
        const line = node("p");line.append(author(source.byId, source.by), document.createTextNode(` brought ${soundName(source)}${parent ? ` → answering ${parent.by}'s ${soundName(parent)}${parent.removedAt ? " (now withdrawn)" : ""}` : " → began this work"}`));
        const state = node("span", source.removedAt ? "Withdrawn · remembered here" : "Live · shaping this place", "chorus-source-state");state.dataset.live = String(!source.removedAt);
        const time = node("time", new Date(source.at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));time.dateTime = source.at;
        item.append(line, state, time);
        if (!source.removedAt) {
          const reply = action(`Answer ${source.by}`, () => { this.journal.addEventListener("close",()=>this.opts.respond(source),{once:true});this.journal.close(); });reply.dataset.recordAction = `reply:${source.id}`;reply.disabled = !this.opts.ready();item.append(reply);
          const remove = action("Withdraw this sound", () => this.opts.remove(source));remove.disabled = !this.opts.ready() || planetDistance(source, this.opts.at()) > 4;remove.dataset.recordAction = `remove:${source.id}`;item.append(remove);
        }
        list.append(item);
      }
      const visit = action(`Visit ${PLANET_PLACES.find(p=>p.id===work.placeId)!.title}`, () => { this.journal.close();this.opts.visit(work); });visit.dataset.recordAction = `visit:${work.id}`;
      card.append(list, visit);
      if (work.liveSources.length && this.opts.invite) {const invite = action("Invite a friend to this work", () => this.opts.invite!(work));invite.dataset.recordAction = `invite:${work.id}`;card.append(invite);}
      return card;
    }));
    if (!this.works.length) this.records.append(node("p", "Your first ingredient will begin a work here. Nothing is pre-filled: this place is waiting for you."));
    if (focus) (this.records.querySelector<HTMLElement>(`[data-record-action="${CSS.escape(focus)}"]`) ?? this.journal.querySelector<HTMLButtonElement>("button"))?.focus();
  }
  dispose(): void { this.opts.stop();this.element.remove();this.journal.remove();this.welcome.remove();this.dock.remove(); }
}
