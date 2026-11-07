import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanetAudio } from "../src/client/planet-audio.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const at = Date.parse("2026-11-07T10:00:00Z");
const listener = { x: 0, z: 0, yaw: 0 };
const sound = (id = "source-a", patch: Partial<PlacedSound> = {}): PlacedSound => ({
  id, soundId: "guitar", x: 2, z: 0, at: new Date(at).toISOString(), by: "Ada", byId: "person-a", ...patch,
});
function parameter() {
  const result = { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() };
  result.setTargetAtTime.mockImplementation((value: number) => { result.value = value; });
  result.setValueAtTime.mockImplementation((value: number) => { result.value = value; });
  return result;
}
class Node {
  gain = parameter(); positionX = parameter(); positionY = parameter(); positionZ = parameter();
  buffer: AudioBuffer | null = null; loop = false;
  panningModel = ""; distanceModel = ""; refDistance = 0; maxDistance = 0; rolloffFactor = 0;
  connect = vi.fn((next: Node) => next); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Document extends EventTarget { hidden = false; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };

describe("the new planet's optional shared recording playback", () => {
  let document: Document, contexts: Context[], sources: Node[], pans: Node[], instances: PlanetAudio[];
  let fetcher: ReturnType<typeof vi.fn>;
  let decode: ReturnType<typeof vi.fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>>;
  let encoded: ArrayBuffer, decoded: AudioBuffer;
  const camera = new THREE.PerspectiveCamera();
  class Context {
    currentTime = 0; state = "running";
    destination = new Node();
    listener = Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(key => [key, parameter()]));
    constructor() { contexts.push(this); }
    resume = vi.fn(async () => { this.state = "running"; });
    suspend = vi.fn(async () => { this.state = "suspended"; });
    close = vi.fn(async () => { this.state = "closed"; });
    decodeAudioData = (bytes: ArrayBuffer) => decode(bytes);
    createBufferSource() { const node = new Node(); sources.push(node); return node; }
    createGain() { return new Node(); }
    createPanner() { const node = new Node(); pans.push(node); return node; }
  }
  function audio(report = vi.fn()) { const instance = new PlanetAudio(report); instances.push(instance); return instance; }
  beforeEach(() => {
    document = new Document(); contexts = []; sources = []; pans = []; instances = [];
    encoded = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]).buffer;
    decoded = { duration: 12 } as AudioBuffer;
    decode = vi.fn(async () => decoded);
    fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => encoded }));
    vi.stubGlobal("document", document); vi.stubGlobal("AudioContext", Context); vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => { for (const instance of instances) instance.dispose(); vi.unstubAllGlobals(); });

  it("does not create audio contexts or fetch recordings while Sound off", async () => {
    const instance = audio(); instance.setAll([sound()]);
    instance.frame(listener, camera, at + 1000); instance.setOn(false);
    await settle();
    expect(instance.on).toBe(false); expect(contexts).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled();
  });

  it("decodes the requested recording bytes and feeds the real buffer to one spatial source", async () => {
    const report = vi.fn(), instance = audio(report);
    instance.setAll([sound()]); instance.setOn(true); instance.frame(listener, camera, at + 1000);
    await settle();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/assets/sounds/guitar.mp3");
    expect(decode).toHaveBeenCalledWith(encoded);
    expect(sources).toHaveLength(1); expect(sources[0].buffer).toBe(decoded);
    expect(sources[0].start).toHaveBeenCalledWith(0, 1);
    expect(sources[0].loop).toBe(true); expect(pans[0].panningModel).toBe("HRTF");
    instance.frame(listener, camera, at + 1100); await settle();
    expect(sources).toHaveLength(1); expect(report).toHaveBeenCalledWith(1);
    instance.setOn(false); expect(sources[0].stop).toHaveBeenCalledOnce();
  });

  it("cannot start a decode that completes after Sound off", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(); instance.setAll([sound()]); instance.setOn(true); instance.frame(listener, camera, at);
    await settle(); instance.setOn(false); waiting.resolve(decoded); await settle();
    expect(sources).toHaveLength(0);
  });

  it("removal cancels a pending source and a stale placement acknowledgement cannot revive it", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(); instance.setAll([sound()]); instance.setOn(true); instance.frame(listener, camera, at);
    await settle(); instance.remove("source-a"); instance.setAll([sound()]);
    waiting.resolve(decoded); await settle(); instance.frame(listener, camera, at + 500); await settle();
    expect(sources).toHaveLength(0);
    instance.setAll([sound("already-ended", { removedAt: new Date(at + 1000).toISOString() })]);
    instance.frame(listener, camera, at + 2000); await settle(); expect(sources).toHaveLength(0);
  });

  it("cancels a delayed private preview without enabling shared sound or creating a source", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(), preview = instance.preview("guitar");
    await settle(); instance.stopPreview(); waiting.resolve(decoded);
    expect(await preview).toBe(false); expect(instance.on).toBe(false); expect(sources).toHaveLength(0);
  });

  it("ends a private preview within the library's five-second audition instead of looping after its UI finishes", async () => {
    const instance = audio();
    expect(await instance.preview("guitar")).toBe(true);
    expect(instance.on).toBe(false);
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(false);
    expect(sources[0].start).toHaveBeenCalledWith(0, 0, 5);
    instance.stopPreview();
    expect(sources[0].stop).toHaveBeenCalledOnce();
  });

  it("disposal blocks pending recordings and all later enables from creating audio contexts", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(); instance.setAll([sound()]); instance.setOn(true); instance.frame(listener, camera, at);
    await settle(); instance.dispose(); waiting.resolve(decoded); await settle();
    expect(sources).toHaveLength(0); expect(contexts[0].close).toHaveBeenCalledOnce();
    const neverEnabled = audio(); neverEnabled.dispose(); const count = contexts.length;
    neverEnabled.setOn(true); neverEnabled.frame(listener, camera, at);
    expect(contexts).toHaveLength(count); expect(neverEnabled.on).toBe(false);
  });

  it("invalidates a cancelled pending generation until a fresh visible frame selects it again", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(); instance.setAll([sound()]); instance.setOn(true); instance.frame(listener, camera, at);
    await settle(); instance.setOn(false); instance.setOn(true);
    waiting.resolve(decoded); await settle();
    expect(sources).toHaveLength(0);
    instance.frame(listener, camera, at + 1000); await settle(); expect(sources).toHaveLength(1);
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    expect(sources[0].stop).toHaveBeenCalledOnce();
  });

  it("keeps the nearest-eight budget when a pending recording loses its selected place", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValue(waiting.promise);
    const report = vi.fn(), instance = audio(report);
    const old = sound("old-farther", { soundId: "beach-waves", x: 0, z: 17 });
    instance.setAll([old]); instance.setOn(true); instance.frame(listener, camera, at);
    await settle();
    const nearer = Array.from({ length: 8 }, (_, i) => sound("near-" + i, { x: Math.cos(i * Math.PI / 4) * 15, z: Math.sin(i * Math.PI / 4) * 15 }));
    instance.setAll([old, ...nearer]); instance.frame(listener, camera, at + 1000);
    await settle(); waiting.resolve(decoded); await settle();
    expect(sources.filter(source => source.start.mock.calls.length)).toHaveLength(8);
    expect(Math.max(...report.mock.calls.map(([count]) => count))).toBeLessThanOrEqual(8);
  });
});
