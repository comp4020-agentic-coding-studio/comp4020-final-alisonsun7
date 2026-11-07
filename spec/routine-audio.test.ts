import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutineAudio } from "../src/client/routine-audio.ts";
import type { NpcRoutineFrame } from "../src/shared/npc-routines.ts";

const start = Date.parse("2026-11-07T10:00:00Z");
const listener = { x: 0, z: 0, yaw: 0 };
const flush = (patch: Partial<NpcRoutineFrame> = {}): NpcRoutineFrame => ({
  id: "resident", label: "Rowan · NPC", avatar: "dog", x: 3, z: 0, yaw: 0,
  phase: "flushing", hutId: "mens-toilet", occupying: true,
  phaseStartedAt: new Date(start).toISOString(), flushId: "resident:visit-1", ...patch,
});
const parameter = () => {
  const value = { value: 1, setTargetAtTime: vi.fn() };
  value.setTargetAtTime.mockImplementation((next: number) => { value.value = next; });
  return value;
};
class FakeNode {
  gain = parameter(); pan = parameter(); buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn((other: FakeNode) => other);
  disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class FakeDocument extends EventTarget { hidden = false; }
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("the resident's short real flush audio", () => {
  let document: FakeDocument;
  let contexts: FakeContext[];
  let sources: FakeNode[];
  let gains: FakeNode[];
  let pans: FakeNode[];
  let decode: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<{ duration: number }>>>;
  let fetcher: ReturnType<typeof vi.fn>;
  let instances: RoutineAudio[];
  class FakeContext {
    currentTime = 0;
    state = "running";
    destination = new FakeNode();
    onstatechange: (() => void) | null = null;
    constructor() { contexts.push(this); }
    resume = vi.fn(async () => { this.state = "running"; });
    suspend = vi.fn(async () => { this.state = "suspended"; });
    close = vi.fn(async () => { this.state = "closed"; });
    decodeAudioData = (...args: unknown[]) => decode(...args);
    createBufferSource() { const node = new FakeNode(); sources.push(node); return node; }
    createGain() { const node = new FakeNode(); gains.push(node); return node; }
    createStereoPanner() { const node = new FakeNode(); pans.push(node); return node; }
  }
  function audio(options: ConstructorParameters<typeof RoutineAudio>[0] = {}) {
    const instance = new RoutineAudio(options); instances.push(instance); return instance;
  }
  beforeEach(() => {
    contexts = []; sources = []; gains = []; pans = []; instances = [];
    document = new FakeDocument();
    decode = vi.fn(async () => ({ duration: 12 }));
    fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("document", document);
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(performance, "now").mockReturnValue(0);
  });
  afterEach(() => {
    for (const instance of instances) instance.dispose();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("never creates a context or fetches a recording for Sound off, idle, hidden, invalid or distant phases", async () => {
    const instance = audio();
    instance.frame([flush()], listener, false, start);
    instance.frame([flush({ phase: "occupied", flushId: undefined })], listener, true, start);
    instance.frame([flush({ x: 19 })], listener, true, start);
    instance.frame([flush({ x: NaN })], listener, true, start);
    instance.frame([flush({ phaseStartedAt: "invalid" })], listener, true, start);
    document.hidden = true;
    instance.frame([flush()], listener, true, start);
    await settle();
    expect(contexts).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(instance.playing).toBe(0);
  });

  it("plays only the remaining shared phase once, stops on exit, and permits a new visit token", async () => {
    const report = vi.fn(), instance = audio({ report });
    instance.frame([flush()], listener, true, start + 1000);
    await settle();
    expect(fetcher).toHaveBeenCalledWith("/assets/sounds/toilet-flush.mp3", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalledWith(0, 1, 2.5);
    expect(instance.playing).toBe(1);
    instance.frame([flush()], listener, true, start + 1100);
    expect(sources).toHaveLength(1);
    instance.frame([flush({ phase: "leaving", flushId: undefined })], listener, true, start + 1200);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    expect(instance.playing).toBe(0);
    instance.frame([flush()], listener, true, start + 1300);
    await settle();
    expect(sources).toHaveLength(1);
    instance.frame([flush({ flushId: "resident:visit-2", phaseStartedAt: new Date(start + 4000).toISOString() })], listener, true, start + 4000);
    await settle();
    expect(sources).toHaveLength(2);
    expect(sources[1].start).toHaveBeenCalledWith(0, 0, 3.5);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(1);
  });

  it("rejects delayed fetch and decode completions after a phase change or Sound off", async () => {
    const delayedFetch = deferred<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>();
    fetcher.mockReturnValueOnce(delayedFetch.promise);
    const instance = audio();
    instance.frame([flush()], listener, true, start);
    await settle();
    instance.frame([], listener, true, start + 100);
    delayedFetch.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await settle();
    expect(sources).toHaveLength(0);

    const delayedDecode = deferred<{ duration: number }>();
    decode.mockReturnValueOnce(delayedDecode.promise);
    // A fresh instance ensures this branch performs a genuine new decode.
    const next = audio();
    next.frame([flush({ flushId: "resident:visit-2" })], listener, true, start);
    await settle();
    next.frame([flush({ flushId: "resident:visit-2" })], listener, false, start + 200);
    delayedDecode.resolve({ duration: 12 });
    await settle();
    expect(sources).toHaveLength(0);
    expect(next.playing).toBe(0);
  });

  it("silences a hidden page immediately and does not replay its token after return", async () => {
    const instance = audio();
    instance.frame([flush()], listener, true, start);
    await settle();
    expect(instance.playing).toBe(1);
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(instance.playing).toBe(0);
    document.hidden = false;
    instance.frame([flush()], listener, true, start + 500);
    await settle();
    expect(sources).toHaveLength(1);
    instance.dispose(); instance.dispose();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it("can use spherical proximity and an authored stereo bearing without changing source timing", async () => {
    const instance = audio({ distanceBetween: () => 1, panBetween: () => -.75 });
    instance.frame([flush({ x: 140 })], listener, true, start + 2000);
    await settle();
    expect(sources[0].start).toHaveBeenCalledWith(0, 2, 1.5);
    expect(pans[0].pan.setTargetAtTime).toHaveBeenCalledWith(-.75, 0, .04);
    expect(gains[0].gain.value).toBeGreaterThan(0);
    expect(gains[0].gain.value).toBeLessThan(.55);
  });

  it("never starts expired shared phases or a completion arriving after disposal", async () => {
    const delayed = deferred<{ duration: number }>();
    decode.mockReturnValueOnce(delayed.promise);
    const instance = audio();
    instance.frame([flush()], listener, true, start + 3000);
    await settle();
    instance.frame([flush()], listener, true, start + 3600);
    delayed.resolve({ duration: 12 });
    await settle();
    expect(sources).toHaveLength(0);
    const finalDecode = deferred<{ duration: number }>();
    decode.mockReturnValueOnce(finalDecode.promise);
    const final = audio();
    final.frame([flush()], listener, true, start);
    await settle(); final.dispose(); finalDecode.resolve({ duration: 12 }); await settle();
    expect(sources).toHaveLength(0);
    expect(final.playing).toBe(0);
  });
});
