import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChorusStudio } from "../src/client/chorus-studio.ts";
import { PlanetWorld } from "../src/client/planet-world.ts";
import type { ChorusWork } from "../src/shared/chorus.ts";
import type { SoundReference } from "../src/shared/protocol.ts";

const source = (id: string, patch: Partial<SoundReference> = {}): SoundReference => ({
  id, soundId: "trickle", by: "Ada", byId: "ada", x: 0, z: 0,
  at: "2026-11-07T12:00:00Z", ...patch,
});
const work = (sources: SoundReference[]): ChorusWork => ({
  id: sources[0].id, placeId: "green", x: 0, z: 0, title: "Ada's little chorus", variant: "lantern", duet: false,
  sources, liveSources: sources.filter(row => !row.removedAt), contributors: [{ id: "ada", name: "Ada" }],
  at: sources[0].at, lastAt: sources.at(-1)!.removedAt ?? sources.at(-1)!.at,
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("studio dialog handoffs and interrupted choices", () => {
  let dom: JSDOM, studio: ChorusStudio, actor: PlanetWorld;
  let opts: ConstructorParameters<typeof ChorusStudio>[1];
  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<!doctype html><main id="host"></main><form id="planet-chat" hidden></form>', { url: "http://localhost/" });
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLDialogElement", dom.window.HTMLDialogElement);
    vi.stubGlobal("CSS", { escape: (text: string) => text.replaceAll('"', '\\"') });
    // JSDOM has no native modal top layer. Model only the relevant browser
    // contract: close removes `open` now and queues its event for a later task.
    // Real browser focus trapping and touch layout have separate UI checks.
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      setTimeout(() => this.dispatchEvent(new dom.window.Event("close")), 0);
    } });
    // Exercise the actual world methods without constructing a GPU renderer.
    actor = Object.create(PlanetWorld.prototype) as PlanetWorld;
    Object.assign(actor, { paused: false, keys: new Set(), walkingTarget: null, walkingRevision: 0 });
    opts = {
      at: () => ({ x: 20, z: 0 }), you: () => ({ id: "visitor", name: "You", avatar: "cat" }), ready: () => true,
      preview: vi.fn(async () => true), stop: vi.fn(), publish: vi.fn(async () => null),
      respond: vi.fn(row => { actor.walkToward(row, 2.4); }), create: vi.fn(), remove: vi.fn(), visit: vi.fn(), full: vi.fn(),
      pause: () => actor.setPaused(true), resume: () => actor.setPaused(false), closeDraft: vi.fn(), sound: vi.fn(), focus: vi.fn(),
    };
    studio = new ChorusStudio(dom.window.document.getElementById("host")!, opts);
  });
  afterEach(() => { studio.dispose(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); dom.window.close(); });

  it("offers local coastal ingredients through ordinary Share, without needing an example shortcut",()=>{
    opts.at=()=>({x:16,z:14});studio.open(null);
    expect([...studio.element.querySelectorAll<HTMLElement>("[data-leave]")].map(button=>button.dataset.leave)).toEqual(["pond-bubbles","pond-frogs","whale-song"]);
    expect(studio.element.querySelector('[data-sound="whale-song"] .chorus-choice-outcome')?.textContent).toContain("whale");
    expect(studio.element.textContent).not.toContain("A glowing petal will mark");expect(opts.publish).not.toHaveBeenCalled();
  });

  it("resumes the actual world before answering a distant saved source, so the walking intent survives the close event", async () => {
    const target = source("target"); studio.setWorks([work([target])]); studio.showJournal();
    const answer = studio.journal.querySelector<HTMLButtonElement>('[data-record-action="reply:target"]')!;
    answer.click();
    expect(opts.respond).not.toHaveBeenCalled();
    expect(actor.walkingIntent).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.respond).toHaveBeenCalledExactlyOnceWith(target);
    expect(actor.walkingIntent).toBe(true);
    expect(studio.journal.open).toBe(false);
  });

  it("preserves a journal action's focus on live updates and keeps it inside the dialog when that sound is withdrawn", () => {
    const a = source("a"), b = source("b", { by: "Bo", byId: "bo", replyToId: a.id, soundId: "evening-forest" });
    studio.setWorks([work([a, b])]); studio.showJournal();
    studio.journal.querySelector<HTMLButtonElement>('[data-record-action="reply:b"]')!.focus();
    studio.setWorks([work([a, b])]);
    expect((document.activeElement as HTMLElement).dataset.recordAction).toBe("reply:b");
    studio.setWorks([work([a, { ...b, removedAt: "2026-11-07T12:00:05Z" }])]);
    expect(studio.journal.querySelector('[data-record-action="reply:b"]')).toBeNull();
    expect(studio.journal.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(studio.journal.querySelector("button"));
    expect(opts.respond).not.toHaveBeenCalled();
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("keeps local listening focus visible when the active work changes and clears it when its source is withdrawn", () => {
    opts.at = () => ({ x: 0, z: 0 });
    const a = work([source("a")]), b = work([source("b", { by: "Bo", byId: "bo" })]);
    studio.setWorks([a]);
    document.getElementById("chorus-focus")!.click(); studio.frame();
    expect(opts.focus).toHaveBeenLastCalledWith("a");
    studio.setWorks([b, a]);
    expect(document.getElementById("chorus-focus")!.textContent).toBe("Hear the whole place");
    expect(document.getElementById("chorus-focus")!.getAttribute("aria-pressed")).toBe("true");
    document.getElementById("chorus-focus")!.click(); studio.frame();
    expect(opts.focus).toHaveBeenLastCalledWith(null);
    document.getElementById("chorus-focus")!.click(); studio.frame();
    expect(opts.focus).toHaveBeenLastCalledWith("b");
    studio.setWorks([a, work([{ ...b.sources[0], removedAt: "2026-11-07T12:00:05Z" }])]);
    expect(opts.focus).toHaveBeenLastCalledWith(null);
    expect(document.getElementById("chorus-focus")!.textContent).toBe("Listen closely");
    expect(document.getElementById("chorus-focus")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the work panel minimised through shared updates until explicitly reopened", () => {
    opts.at = () => ({ x: 0, z: 0 });
    studio.setWorks([work([source("a")])]);
    document.getElementById("chorus-minimise")!.click();
    expect(document.getElementById("chorus-primary")).toBeNull();
    studio.setWorks([work([source("a"), source("b", {by: "Bo", byId: "bo", replyToId: "a"})])]);
    expect(document.getElementById("chorus-primary")).toBeNull();
    expect(document.getElementById("chorus-reopen")).not.toBeNull();
    document.getElementById("chorus-reopen")!.click();
    expect(document.getElementById("chorus-primary")!.textContent).toContain("Answer");
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("makes enabling sound an explicit local action before focusing a nearby work", () => {
    opts.at = () => ({ x: 0, z: 0 });opts.listening = () => false;
    studio.setWorks([work([source("a")])]);
    expect(opts.sound).not.toHaveBeenCalled();
    expect(document.getElementById("chorus-focus")!.textContent).toBe("Enable listening");
    document.getElementById("chorus-focus")!.click();
    expect(opts.sound).toHaveBeenCalledExactlyOnceWith(true);
    expect(opts.focus).toHaveBeenCalledExactlyOnceWith("a");
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("keeps keyboard focus and an expanded explanation through local and remote work updates", () => {
    opts.at = () => ({ x: 0, z: 0 });const a = work([source("a")]);studio.setWorks([a]);
    const focus = document.getElementById("chorus-focus")!;focus.focus();focus.click();studio.frame();
    expect(document.activeElement?.id).toBe("chorus-focus");
    studio.dock.querySelector("details")!.open = true;
    document.getElementById("chorus-primary")!.focus();studio.setWorks([a]);
    expect(document.activeElement?.id).toBe("chorus-primary");expect(studio.dock.querySelector("details")!.open).toBe(true);
  });

  it("does not close or publish a newer chooser when an older explicit publication finishes", async () => {
    const pending = deferred<string | null>();
    opts.publish = vi.fn(() => pending.promise);
    studio.open(source("first"));
    studio.element.querySelector<HTMLButtonElement>('[data-leave="evening-forest"]')!.click();
    expect(opts.publish).toHaveBeenCalledExactlyOnceWith("evening-forest");
    studio.close(); await vi.advanceTimersByTimeAsync(0);
    studio.open(source("second", { by: "Second friend", soundId: "guitar" }));
    pending.resolve(null); await settle();
    expect(studio.element.open).toBe(true);
    expect(studio.element.querySelector("#chorus-answering")!.textContent).toContain("Second friend");
    expect(studio.element.querySelector(".chorus-feedback")!.textContent).toBe("");
    expect(opts.publish).toHaveBeenCalledTimes(1);
    expect(opts.closeDraft).toHaveBeenCalledTimes(1);
    expect([...studio.element.querySelectorAll<HTMLButtonElement>("[data-leave]")].every(button => !button.disabled)).toBe(true);
  });

  it("ignores a cancelled private preview's delayed result after a new chooser opens", async () => {
    const pending = deferred<boolean>(); opts.preview = vi.fn(() => pending.promise);
    studio.open(source("first"));
    studio.element.querySelector<HTMLButtonElement>('[data-listen="evening-forest"]')!.click();
    studio.close(); await vi.advanceTimersByTimeAsync(0);
    studio.open(source("second", { by: "Second friend", soundId: "guitar" }));
    pending.resolve(true); await settle();
    expect(studio.element.open).toBe(true);
    expect(studio.element.querySelector(".chorus-feedback")!.textContent).toBe("");
    expect(studio.element.querySelector('[data-listen][aria-pressed="true"]')).toBeNull();
    expect(opts.stop).toHaveBeenCalled();
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("explains a choice's actual response before publishing and distinguishes a same-person layer", () => {
    const parent = source("water");studio.setWorks([work([parent])]);studio.open(parent);
    const forecast = studio.element.querySelector('[data-sound="evening-forest"] .chorus-choice-outcome')!;
    expect(forecast?.textContent).toContain("Ada");
    expect(forecast?.textContent).toContain("Watersong canopy");
    expect(forecast?.textContent).toContain("together");
    studio.close();opts.you = () => ({id:"ada",name:"Ada",avatar:"cat"});studio.open(parent);
    expect(studio.element.querySelector('[data-sound="evening-forest"] .chorus-choice-outcome')?.textContent).toContain("another layer of your own");
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("offers an own-source layer and a separate real friend invitation without treating the owner as a duet", () => {
    opts.at = () => ({x:0,z:0});opts.you = () => ({id:"ada",name:"Ada",avatar:"cat"});
    opts.invite = vi.fn();const ownWork=work([source("own")]);studio.setWorks([ownWork]);
    expect(document.getElementById("chorus-primary")?.textContent).toBe("Add another layer");
    expect(document.getElementById("chorus-step")?.textContent).toContain("friend");
    document.getElementById("chorus-invite")!.click();
    expect(opts.invite).toHaveBeenCalledExactlyOnceWith(ownWork);
    expect(opts.respond).not.toHaveBeenCalled();expect(opts.publish).not.toHaveBeenCalled();
  });

  it("records withdrawn ancestry without claiming it still opens the shared result", () => {
    const a=source("parent", {removedAt:"2026-11-07T12:01:00Z"}), b=source("answer", {by:"Bo",byId:"bo",soundId:"evening-forest",replyToId:a.id});
    studio.setWorks([work([a,b])]);studio.showJournal();
    const record=studio.journal.querySelector('[data-work="parent"]')!;
    expect(record.querySelector('[data-source="parent"] .chorus-source-state')?.textContent).toContain("Withdrawn");
    expect(record.querySelector('[data-source="answer"]')?.textContent).toContain("withdrawn");
    expect(record.querySelector(".chorus-record-result")?.textContent).toContain("live");
    expect(record.querySelector('[data-record-action="reply:parent"]')).toBeNull();
    expect(opts.publish).not.toHaveBeenCalled();
  });

  it("waits for the journal's close before opening a new creation, and updates forecasts without stealing focus", async () => {
    studio.showJournal();
    opts.create=vi.fn(()=>{studio.open(null);});
    document.getElementById("chorus-new-work")!.click();
    expect(opts.create).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.create).toHaveBeenCalledTimes(1);expect(studio.element.open).toBe(true);expect((actor as unknown as {paused:boolean}).paused).toBe(true);
    const parent=source("parent");studio.close();await vi.advanceTimersByTimeAsync(0);studio.setWorks([work([parent])]);studio.open(parent);
    const listen=studio.element.querySelector<HTMLButtonElement>('[data-listen="evening-forest"]')!;listen.focus();
    studio.setWorks([work([{...parent,removedAt:"2026-11-07T12:01:00Z"}])]);
    expect(studio.element.querySelector('[data-sound="evening-forest"] .chorus-choice-outcome')?.textContent).toContain("withdrawn");
    expect(document.activeElement).toBe(listen);expect(opts.publish).not.toHaveBeenCalled();
  });

  it("keeps a blocked choice privately audible and offers an explicit move without publishing", () => {
    const parent=source("root");opts.availability=()=>({allowed:false,reason:"This corner needs a little more room."});opts.makeRoom=vi.fn();
    studio.open(parent);const card=studio.element.querySelector<HTMLElement>('[data-sound="evening-forest"]')!;
    expect(card.querySelector<HTMLButtonElement>("[data-leave]")!.disabled).toBe(true);
    expect(card.querySelector<HTMLButtonElement>("[data-listen]")!.disabled).toBe(false);
    expect(card.querySelector(".chorus-room-reason")?.textContent).toContain("more room");
    card.querySelector<HTMLButtonElement>("[data-find-room]")!.click();
    expect(opts.makeRoom).toHaveBeenCalledExactlyOnceWith("evening-forest",parent);expect(opts.publish).not.toHaveBeenCalled();
    opts.availability=()=>({allowed:true,reason:""});studio.setWorks([work([parent])]);
    expect(card.querySelector<HTMLButtonElement>("[data-leave]")!.disabled).toBe(false);
    expect(card.querySelector<HTMLButtonElement>("[data-find-room]")!.hidden).toBe(true);
  });
});
