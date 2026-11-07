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
});
