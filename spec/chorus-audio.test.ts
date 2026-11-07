import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanetAudio, planetHearingRadius } from "../src/client/planet-audio.ts";
import { CHORUS_BAR_SECONDS, nextChorusBar, renderChorusPart, seamlessRecording } from "../src/client/chorus-instrument.ts";
import { deriveChorusWorks } from "../src/shared/chorus.ts";
import { planetStep } from "../src/shared/planet.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";
const origin = Date.parse("2026-11-07T10:00:00Z"), camera = new THREE.PerspectiveCamera();
const listener = { x: 0, z: 0, yaw: 0 };
const sound = (id: string, soundId = "chorus-chords", patch: Partial<PlacedSound> = {}): PlacedSound => ({
  id, soundId, x: 1, z: 0, at: new Date(origin).toISOString(), byId: "person-a", by: "Ada", ...patch,
});
function parameter(value = 0) {
  const result = { value, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() };
  result.setTargetAtTime.mockImplementation((next: number) => { result.value = next; });
  result.setValueAtTime.mockImplementation((next: number) => { result.value = next; });
  return result;
}
class Node {
  gain = parameter(); positionX = parameter(); positionY = parameter(); positionZ = parameter();
  threshold = parameter(); knee = parameter(); ratio = parameter(); attack = parameter(); release = parameter();
  playbackRate = parameter(1); buffer: AudioBuffer | null = null; loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn((next: Node) => next); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Doc extends EventTarget { hidden = false; }
function buffer(length: number, sampleRate: number, channels = 1) {
  const pcm = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: (channel: number) => pcm[channel] } as AudioBuffer;
}
const settle = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("the original shared score and recording seams", () => {
  it("renders deterministic, finite, zero-ended compatible bars with headroom", () => {
    for (const id of ["chorus-chords", "chorus-pulse", "chorus-bells", "chorus-harmony"]) {
      const a = renderChorusPart(id, 12000), b = renderChorusPart(id, 12000);
      expect(a).toEqual(b); expect(a.length).toBe(Math.round(CHORUS_BAR_SECONDS * 12000));
      expect(a[0]).toBe(0); expect(a.at(-1)).toBe(0);
      let peak = 0, power = 0;
      for (const value of a) { expect(Number.isFinite(value)).toBe(true); peak = Math.max(peak, Math.abs(value)); power += value * value; }
      expect(peak).toBeLessThanOrEqual(.48); expect(peak).toBeGreaterThan(.05); expect(power / a.length).toBeGreaterThan(.00001);
    }
  });
  it("aligns delayed joins to the same absolute server-time bar", () => {
    for (const skew of [0, 271, 983, 2210]) {
      const at = origin + skew, delay = nextChorusBar(at);
      expect(delay).toBeGreaterThanOrEqual(.05);
      expect(delay).toBeLessThanOrEqual(CHORUS_BAR_SECONDS + .05);
      expect((at / 1000 + delay) / CHORUS_BAR_SECONDS).toBeCloseTo(Math.round((at / 1000 + delay) / CHORUS_BAR_SECONDS), 4);
    }
    expect(origin / 1000 + nextChorusBar(origin)).toBeCloseTo((origin + 271) / 1000 + nextChorusBar(origin + 271), 5);
  });
  it("overlaps a recording tail into its head without imposing a musical grid", () => {
    const input = buffer(1000, 1000), pcm = input.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) pcm[i] = i / 1000;
    const context = { createBuffer: (channels: number, length: number, rate: number) => buffer(length, rate, channels) } as AudioContext;
    const result = seamlessRecording(context, input), output = result.getChannelData(0);
    expect(result.duration).toBe(.92);
    expect(Math.abs(output[0] - output.at(-1)!)).toBeLessThan(.002);
    expect(output[80]).toBeCloseTo(.08);
  });
  it("gives the reading nook an intimate range and the stage room for gathering", () => {
    expect(planetHearingRadius({ x: -13, z: 7 })).toBe(6);
    expect(planetHearingRadius({ x: 10, z: -9 })).toBe(18);
    expect(planetHearingRadius(listener)).toBe(14);
  });
});

describe("local listening and the shared musical consequence", () => {
  let document: Doc, contexts: Context[], sources: Node[], gains: Node[], instances: PlanetAudio[];
  let fetcher: ReturnType<typeof vi.fn>, decode: ReturnType<typeof vi.fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>>;
  class Context {
    currentTime = 10; sampleRate = 12000; state: AudioContextState = "running";
    destination = new Node();
    listener = Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(key => [key, parameter()]));
    constructor() { contexts.push(this); }
    resume = vi.fn(async () => {}); close = vi.fn(async () => {});
    decodeAudioData = (bytes: ArrayBuffer) => decode(bytes);
    createBuffer = (channels: number, length: number, rate: number) => buffer(length, rate, channels);
    createBufferSource() { const node = new Node(); sources.push(node); return node; }
    createGain() { const node = new Node(); gains.push(node); return node; }
    createPanner() { return new Node(); }
    createDynamicsCompressor() { return new Node(); }
  }
  const audio = () => { const instance = new PlanetAudio(vi.fn()); instances.push(instance); return instance; };
  beforeEach(() => {
    document = new Doc(); contexts = []; sources = []; gains = []; instances = [];
    decode = vi.fn(async () => buffer(12000 * 12, 12000));
    fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("document", document); vi.stubGlobal("AudioContext", Context); vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => { for (const instance of instances) instance.dispose(); vi.unstubAllGlobals(); });

  it("renders musical sources without downloads and enters on the same bar for late listeners", async () => {
    const a = audio(), b = audio(), row = sound("seed"); a.setAll([row]); b.setAll([row]);
    a.setOn(true); b.setOn(true); a.frame(listener, camera, origin); b.frame(listener, camera, origin + 271); await settle();
    expect(fetcher).not.toHaveBeenCalled(); expect(sources).toHaveLength(2);
    expect(sources.every(source => source.loop)).toBe(true);
    expect(sources[0].start.mock.calls[0][0] - 10).toBeCloseTo(nextChorusBar(origin));
    expect(sources[1].start.mock.calls[0][0] - 10).toBeCloseTo(nextChorusBar(origin + 271));
    expect(sources[0].buffer!.duration / sources[0].playbackRate.value).toBeCloseTo(CHORUS_BAR_SECONDS, 10);
  });
  it("adds a low answer only for an actual different-identity live reply, and retracts it with its endpoint", async () => {
    const root = sound("root"), own = sound("own", "chorus-pulse", { replyToId: root.id });
    const instance = audio(); instance.setAll([root, own]); instance.setWorks(deriveChorusWorks([root, own]));
    instance.setOn(true); instance.frame(listener, camera, origin); await settle(); expect(sources).toHaveLength(2);
    // Even a stale/inconsistent result flag cannot turn one cookie identity
    // into two contributors; both current endpoints are checked again.
    instance.setWorks(deriveChorusWorks([root, own]).map(work => ({ ...work, duet: true })));
    instance.frame(listener, camera, origin + 10); await settle(); expect(sources).toHaveLength(2);
    const friend = sound("friend", "chorus-pulse", { replyToId: root.id, byId: "person-b", by: "Bo" });
    instance.setAll([root, own, friend]); instance.setWorks(deriveChorusWorks([root, own, friend]));
    instance.frame(listener, camera, origin + 500); await settle(); expect(sources).toHaveLength(4);
    const harmony = sources[3];
    instance.remove(friend.id); expect(harmony.stop).toHaveBeenCalledOnce();
    instance.setWorks(deriveChorusWorks([root, own, { ...friend, removedAt: new Date(origin + 1000).toISOString() }]));
    instance.frame(listener, camera, origin + 1500); await settle(); expect(sources).toHaveLength(4);
  });
  it("keeps a friend's new result silent while this listener has Sound off", async () => {
    const root = sound("root"), friend = sound("friend", "chorus-pulse", { replyToId: root.id, byId: "b" });
    const instance = audio(); instance.setAll([root, friend]); instance.setWorks(deriveChorusWorks([root, friend]));
    instance.frame(listener, camera, origin); await settle(); expect(contexts).toHaveLength(0); expect(sources).toHaveLength(0);
  });
  it("distinguishes the listener's enabled preference from a suspended context and zero local volume", async () => {
    const instance = audio();
    expect(instance.playbackState).toBe("off"); expect(contexts).toHaveLength(0);
    instance.setOn(true); expect(instance.on).toBe(true); expect(instance.playbackState).toBe("running");
    contexts[0].state = "suspended";
    expect(instance.on).toBe(true); expect(instance.playbackState).toBe("suspended");
    instance.setVolume(0); expect(instance.volumeLevel).toBe(0);
    instance.setOn(false); expect(instance.playbackState).toBe("off");
    expect(instance.volumeLevel).toBe(0);
  });
  it("keeps a nearby reading source clear through the normal reply distance, then fades to its quiet boundary", async () => {
    const instance = audio(), position = { x: -13, z: 7, yaw: 0 };
    instance.setAll([sound("reading-bells", "chorus-bells", position)]);
    instance.setOn(true); instance.frame(position, camera, origin); await settle();
    const voice = gains[2], beside = voice.gain.value;
    instance.frame(planetStep(position, 1, 0, 1.5), camera, origin + 100);
    expect(voice.gain.value / beside).toBeCloseTo(1, 5);
    instance.frame(planetStep(position, 1, 0, 4), camera, origin + 200);
    expect(voice.gain.value / beside).toBeGreaterThanOrEqual(.25);
    instance.frame(planetStep(position, 1, 0, 5.9), camera, origin + 300);
    expect(voice.gain.value / beside).toBeLessThan(.01);
    instance.frame(planetStep(position, 1, 0, 6.1), camera, origin + 400);
    expect(sources[0].stop).toHaveBeenCalledOnce();
  });
  it("retains sample headroom for eight synchronized original parts even before the output compressor", async () => {
    const arrangements = [
      Array(8).fill("chorus-chords"), Array(8).fill("chorus-pulse"), Array(8).fill("chorus-bells"),
      ["chorus-chords", "chorus-chords", "chorus-chords", "chorus-pulse", "chorus-pulse", "chorus-bells", "chorus-bells", "chorus-bells"],
    ];
    for (const arrangement of arrangements) {
      const gainIndex = gains.length, sourceIndex = sources.length, instance = audio();
      instance.setAll(arrangement.map((id, i) => sound("part-" + i, id, { x: 0 })));
      instance.setVolume(1); instance.setOn(true); instance.frame(listener, camera, origin); await settle();
      const mix = sources.slice(sourceIndex), master = gains[gainIndex].gain.value;
      expect(mix).toHaveLength(8);
      let peak = 0;
      for (let sample = 0; sample < mix[0].buffer!.length; sample++) {
        const sum = mix.reduce((total, voice, i) => total + voice.buffer!.getChannelData(0)[sample] * gains[gainIndex + 2 + i].gain.value, 0) * master;
        expect(Number.isFinite(sum)).toBe(true); peak = Math.max(peak, Math.abs(sum));
      }
      expect(peak).toBeGreaterThan(.05); expect(peak).toBeLessThan(.85);
      instance.dispose();
    }
  });
  it("ducks the world for private audition, restores it, and keeps volume and focus local", async () => {
    const instance = audio(), rows = [sound("a", "guitar"), sound("b", "trickle", { x: 2 })];
    instance.setVolume(.5); instance.setAll(rows); instance.setOn(true); instance.frame(listener, camera, origin); await settle();
    expect(gains[0].gain.value).toBe(.35); expect(gains[1].gain.value).toBe(1);
    const before = gains[3].gain.value;
    instance.setFocus("a"); instance.frame(listener, camera, origin + 10); expect(gains[3].gain.value).toBeCloseTo(before * .12);
    expect(await instance.preview("chorus-bells")).toBe(true); expect(gains[1].gain.value).toBe(.18);
    instance.stopPreview(); expect(gains[1].gain.value).toBe(1); expect(instance.on).toBe(true);
    instance.setVolume(0); expect(gains[0].gain.value).toBe(0); expect(rows).toEqual([sound("a", "guitar"), sound("b", "trickle", { x: 2 })]);
  });
  it.each(["removal event", "reconnect snapshot"])("releases a withdrawn local focus through a %s without leaving all remaining voices ducked", async mode => {
    const instance = audio(), rows = [sound("a", "guitar"), sound("b", "trickle", { x: 2 })];
    instance.setAll(rows); instance.setOn(true); instance.frame(listener, camera, origin); await settle();
    const normal = gains[3].gain.value;
    instance.setFocus("a"); instance.frame(listener, camera, origin + 10);
    expect(gains[3].gain.value).toBeCloseTo(normal * .12);
    if (mode === "removal event") instance.remove("a");
    else instance.setAll([rows[1]]);
    instance.frame(listener, camera, origin + 20);
    expect(gains[3].gain.value).toBeCloseTo(normal);
    expect(instance.on).toBe(true);
  });
  it("schedules a bell as a bounded one-shot after its quiet interval", async () => {
    const instance = audio(); instance.setAll([sound("bell", "bicycle-bell")]); instance.setOn(true);
    instance.frame(listener, camera, origin + 5000); await settle(); expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(false); expect(sources[0].start).toHaveBeenCalledWith(21, 0, 1.3);
    instance.setOn(false); expect(sources[0].stop).toHaveBeenCalledOnce();
  });
  it("blocks a delayed decode after hide/reappear until a new visible selection", async () => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = audio(); instance.setAll([sound("stream", "trickle")]); instance.setOn(true); instance.frame(listener, camera, origin);
    await settle(); document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); document.hidden = false;
    instance.frame(listener, camera, origin + 50);
    waiting.resolve(buffer(12000 * 12, 12000)); await settle(); expect(sources).toHaveLength(0);
    instance.frame(listener, camera, origin + 100); await settle(); expect(sources).toHaveLength(1);
  });
  it("caps the full mix including a duet's derived answer at eight", async () => {
    const root = sound("root"), friend = sound("friend", "chorus-pulse", { replyToId: root.id, byId: "b" });
    const rows = [root, friend, ...Array.from({ length: 9 }, (_, i) => sound("extra-" + i, "chorus-bells", { x: 1 + i * .1 }))];
    const instance = audio(); instance.setAll(rows); instance.setWorks(deriveChorusWorks(rows)); instance.setOn(true);
    instance.frame(listener, camera, origin); await settle(); expect(sources).toHaveLength(8);
  });
});
