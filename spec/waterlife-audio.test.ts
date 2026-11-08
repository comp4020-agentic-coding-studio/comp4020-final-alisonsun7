import * as THREE from "three";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanetAudio } from "../src/client/planet-audio.ts";
import { findSound } from "../src/shared/sounds.ts";
import { FROG_CALL_ENVELOPE } from "../src/shared/frog-call.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const renderer = await import(new URL("../scripts/render-waterlife-sounds.mjs", import.meta.url).href) as {
  WATERLIFE_SOUNDS: { id: string; label: string; family: string; zones: string[]; length: number; interval: number; seed: number; peak: number }[];
  renderWaterlifeSound(id: string, sampleRate?: number): Float32Array;
  measureWaterlifePcm(samples: Float32Array, rate: number, length: number): Record<string, number>;
};
const recording = await import(new URL("../scripts/process-pond-frogs.mjs", import.meta.url).href) as {
  FROG_RECORDING: { id: string; label: string; family: string; zones: string[]; length: number; interval: number;
    from: number; seconds: number; at: number; peak: number; sourceSha1: string; sourceUrl: string; licenseUrl: string };
  prepareFrogCycle(source: Float32Array, sampleRate?: number): Float32Array;
  frogCallEnvelope(samples: Float32Array, sampleRate?: number): {stepSeconds:number;interval:number;values:number[]};
};
const definitions = [...renderer.WATERLIFE_SOUNDS, recording.FROG_RECORDING];
const origin = Date.parse("2026-11-08T09:00:00Z"), camera = new THREE.PerspectiveCamera();
const listener = { x: 0, z: 0, yaw: 0 };
const contribution = (id: string): PlacedSound => ({ id: `water-${id}`, soundId: id, x: 1, z: 0,
  at: new Date(origin).toISOString(), by: "Ada", byId: "person-a" });
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function rms(samples: Float32Array, rate: number, from: number, to: number): number {
  let sum = 0, count = 0;
  for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) { sum += samples[i] ** 2; count++; }
  return Math.sqrt(sum / count);
}

describe("the sparse water-life assets and their honest sources", () => {
  it.each(renderer.WATERLIFE_SOUNDS)("reproduces bounded, zero-ended $id PCM with a real quiet interval", definition => {
    const rate = 12000, a = renderer.renderWaterlifeSound(definition.id, rate), b = renderer.renderWaterlifeSound(definition.id, rate);
    expect(createHash("sha256").update(new Uint8Array(a.buffer)).digest("hex"))
      .toBe(createHash("sha256").update(new Uint8Array(b.buffer)).digest("hex"));
    const measured = renderer.measureWaterlifePcm(a, rate, definition.length);
    expect(a.length).toBe(definition.interval * rate);
    expect(a[0]).toBe(0); expect(a.at(-1)).toBe(0);
    expect(measured.peakDbFS).toBeLessThan(-8); expect(measured.peakDbFS).toBeGreaterThan(-15);
    expect(measured.largestStep).toBeLessThan(.2); expect(Math.abs(measured.mean)).toBeLessThan(.00001);
    expect(measured.activeFraction).toBeGreaterThan(.02); expect(measured.activeFraction).toBeLessThan(.3);
    expect(rms(a, rate, 0, definition.length)).toBeGreaterThan(.015);
    expect(rms(a, rate, definition.length, definition.interval)).toBe(0);
    expect(findSound(definition.id)).toMatchObject({ label: definition.label, family: definition.family,
      zones: definition.zones, playback: { length: definition.length, interval: definition.interval } });
  });

  it("preserves a recorded phrase's timing and relative waveform rather than rebuilding synthetic croaks", () => {
    const rate = 12000, input = Float32Array.from({ length: rate * 5 }, (_, i) => Math.sin(i * .137) * .05 + Math.sin(i * .023) * .02);
    const samples = recording.prepareFrogCycle(input, rate), definition = recording.FROG_RECORDING;
    expect(samples.length).toBe(rate * 18); expect(rms(samples, rate, 0, .8)).toBe(0);
    expect(rms(samples, rate, .9, 3.8)).toBeGreaterThan(.05); expect(rms(samples, rate, 4, 18)).toBe(0);
    const offset = Math.round(definition.at * rate), sourceOffset = Math.round(definition.from * rate);
    const gain = samples[offset + 4000] / input[sourceOffset + 4000];
    for (const i of [5000, 9000, 15000, 22000, 30000])
      expect(samples[offset + i]).toBeCloseTo(input[sourceOffset + i] * gain, 7);
    expect(() => renderer.renderWaterlifeSound("pond-frogs", rate)).toThrow();
  });

  it("derives bounded 100 ms visual energy from the actual recorded phrase, with silent edges", () => {
    const manifest = JSON.parse(readFileSync("public/assets-manifest.json", "utf8"));
    const entry = manifest.assets.find((asset: { id: string }) => asset.id === "commons-pond-frogs");
    expect(FROG_CALL_ENVELOPE).toEqual(entry.callEnvelope);
    expect(FROG_CALL_ENVELOPE.stepSeconds).toBe(.1); expect(FROG_CALL_ENVELOPE.interval).toBe(18);
    expect(FROG_CALL_ENVELOPE.values).toHaveLength(46);
    expect(FROG_CALL_ENVELOPE.values.slice(0, 8)).toEqual(Array(8).fill(0));
    expect(FROG_CALL_ENVELOPE.values.slice(40)).toEqual(Array(6).fill(0));
    expect(Math.max(...FROG_CALL_ENVELOPE.values)).toBe(1);
    expect(FROG_CALL_ENVELOPE.values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const rate = 12000, fixture = new Float32Array(18 * rate); fixture.fill(.1, rate, rate * 2);
    const energy = recording.frogCallEnvelope(fixture, rate);
    expect(energy.values.slice(10, 20)).toEqual(Array(10).fill(1));
    expect(energy.values.slice(20)).toEqual(Array(26).fill(0));
  });

  it("keeps bubbles sparse, audible in a short preview, and never calls them fish vocal recordings", () => {
    const rate = 12000, samples = renderer.renderWaterlifeSound("pond-bubbles", rate);
    expect(rms(samples, rate, 0, .19)).toBe(0);
    for (const [from, to] of [[.2, .45], [.92, 1.42], [1.92, 2.61]])
      expect(rms(samples, rate, from, to)).toBeGreaterThan(.025);
    expect(rms(samples, rate, .65, .91)).toBeLessThan(.00001);
    expect(findSound("pond-bubbles")!.label.toLowerCase()).toContain("bubbles");
  });

  it("rejects invalid identifiers and rates rather than creating arbitrary assets", () => {
    expect(() => renderer.renderWaterlifeSound("unknown-waterlife")).toThrow();
    for (const rate of [0, 7999, 96001, NaN, Infinity, 44100.5])
      expect(() => renderer.renderWaterlifeSound("pond-bubbles", rate)).toThrow();
    expect(() => recording.prepareFrogCycle(new Float32Array(100))).toThrow();
  });

  it.each(renderer.WATERLIFE_SOUNDS)("ships $id with exact output bytes and transparent original provenance", definition => {
    const manifest = JSON.parse(readFileSync("public/assets-manifest.json", "utf8"));
    const entry = manifest.assets.find((asset: { id: string }) => asset.id === `original-${definition.id}`);
    expect(entry).toMatchObject({ path: `public/assets/sounds/${definition.id}.mp3`, publicAllowed: true,
      rights: "Original project-generated sound; not a third-party CC0 asset",
      generator: { script: "scripts/render-waterlife-sounds.mjs", version: 1, seed: definition.seed,
        sampleRate: 44100, peakAmplitude: definition.peak, externalSamples: false },
      playback: { length: definition.length, interval: definition.interval } });
    expect(entry.source).toContain("no wildlife recordings");
    expect(entry.listeningStatus).toContain("human listening remains pending");
    expect(entry.generator.sourceSha256).toBe(createHash("sha256")
      .update(readFileSync("scripts/render-waterlife-sounds.mjs")).digest("hex"));
    const bytes = readFileSync(entry.path);
    expect(bytes.length).toBeGreaterThan(1000); expect(bytes.length).toBeLessThan(180000);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    const samples = renderer.renderWaterlifeSound(definition.id, 44100);
    expect(createHash("sha256").update(new Uint8Array(samples.buffer)).digest("hex")).toBe(entry.pcmSha256);
    const indexed = JSON.parse(readFileSync("public/assets/sounds/sounds.json", "utf8"))
      .find((sound: { id: string }) => sound.id === definition.id);
    expect(indexed).toMatchObject({ kind: "now-and-then", seconds: definition.length,
      interval: definition.interval, pause: definition.interval - definition.length, provenance: "original-stylized-synthesis" });
  });

  it("ships real frogs with verified CC0 source identity and preserves the rejected original as history only", () => {
    const manifest = JSON.parse(readFileSync("public/assets-manifest.json", "utf8"));
    const entry = manifest.assets.find((asset: { id: string }) => asset.id === "commons-pond-frogs");
    expect(manifest.assets.some((asset: { id: string }) => asset.id === "original-pond-frogs")).toBe(false);
    expect(entry).toMatchObject({ publicAllowed: true, rights: "CC0 1.0 (public domain dedication)",
      sourceSha1: recording.FROG_RECORDING.sourceSha1, licenseUrl: recording.FROG_RECORDING.licenseUrl,
      playback: { length: 4.5, interval: 18 }, processor: { script: "scripts/process-pond-frogs.mjs", sampleRate: 44100,
        from: .4, seconds: 3.2, at: .8, pitchOrSpeedChanged: false },
      superseded: { id: "original-pond-frogs", sha256: "91401f118d2f7423fa652511202ba8d9f6f755c03bcd32f2be225ae69b9327b4" } });
    expect(entry.source).toContain("Bad Waldliesborn - Brandscherenteich.oga"); expect(entry.source).toContain("by Ath");
    expect(entry.processor.sourceSha256).toBe(createHash("sha256").update(readFileSync("scripts/process-pond-frogs.mjs")).digest("hex"));
    const bytes = readFileSync(entry.path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect(entry.sha256).not.toBe(entry.superseded.sha256); expect(bytes.length).toBeLessThan(180000);
    const indexed = JSON.parse(readFileSync("public/assets/sounds/sounds.json", "utf8")).find((sound: {id:string}) => sound.id === "pond-frogs");
    expect(indexed.provenance).toBe("commons-cc0-field-recording");
  });
});

function parameter() {
  const result = { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  result.setTargetAtTime.mockImplementation((value: number) => { result.value = value; });
  result.setValueAtTime.mockImplementation((value: number) => { result.value = value; });
  return result;
}
class AudioNodeFake {
  gain = parameter(); positionX = parameter(); positionY = parameter(); positionZ = parameter();
  buffer: AudioBuffer | null = null; loop = false; onended: (() => void) | null = null;
  connect = vi.fn((node: AudioNodeFake) => node); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class DocumentFake extends EventTarget { hidden = false; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("water-life assets through the real planet audio controller", () => {
  let document: DocumentFake, contexts: ContextFake[], sources: AudioNodeFake[], instances: PlanetAudio[];
  let decode: ReturnType<typeof vi.fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>>;
  let fetcher: ReturnType<typeof vi.fn>;
  class ContextFake {
    currentTime = 10; state = "running"; destination = new AudioNodeFake();
    listener = Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(key => [key, parameter()]));
    constructor() { contexts.push(this); }
    resume = vi.fn(async () => { this.state = "running"; }); suspend = vi.fn(async () => { this.state = "suspended"; });
    close = vi.fn(async () => { this.state = "closed"; });
    decodeAudioData = (bytes: ArrayBuffer) => decode(bytes);
    createBufferSource() { const source = new AudioNodeFake(); sources.push(source); return source; }
    createGain() { return new AudioNodeFake(); } createPanner() { return new AudioNodeFake(); }
  }
  function player() { const instance = new PlanetAudio(vi.fn()); instances.push(instance); return instance; }
  beforeEach(() => {
    document = new DocumentFake(); contexts = []; sources = []; instances = [];
    decode = vi.fn(async () => ({ duration: 32 } as AudioBuffer));
    fetcher = vi.fn(async (url: string) => {
      const id = url.split("/").at(-1)!.replace(/\.mp3$/, "");
      const bytes = readFileSync(`public/assets/sounds/${id}.mp3`);
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    });
    vi.stubGlobal("document", document); vi.stubGlobal("AudioContext", ContextFake); vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => { for (const instance of instances) instance.dispose(); vi.unstubAllGlobals(); });

  it("does not fetch or enable any new source when this listener chose Sound off", async () => {
    const instance = player(); instance.setAll(definitions.map(sound => contribution(sound.id)));
    instance.frame(listener, camera, origin); await settle();
    expect(contexts).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled(); expect(instance.on).toBe(false);
  });

  it.each(definitions)("auditions real local $id bytes privately for at most five seconds", async definition => {
    const instance = player(); expect(await instance.preview(definition.id)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(`/assets/sounds/${definition.id}.mp3`);
    const decodedBytes = decode.mock.calls[0][0];
    expect(createHash("sha256").update(new Uint8Array(decodedBytes)).digest("hex"))
      .toBe(createHash("sha256").update(readFileSync(`public/assets/sounds/${definition.id}.mp3`)).digest("hex"));
    expect(instance.on).toBe(false); expect(sources[0].loop).toBe(false);
    expect(sources[0].start).toHaveBeenCalledWith(0, 0, 5);
    instance.stopPreview(); expect(sources[0].stop).toHaveBeenCalledOnce();
  });

  it("softens the five-second whale preview cut while its second call is still sounding", async () => {
    const instance = player(); expect(await instance.preview("whale-song")).toBe(true);
    const gain = sources[0].connect.mock.calls[0][0].gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(.28, 14.955);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 15);
    expect(sources[0].start).toHaveBeenCalledWith(0, 0, 5);
    expect(instance.on).toBe(false);
  });

  it.each(definitions)("schedules $id as a bounded server-phase event, including its quiet interval", async definition => {
    const instance = player(), sound = contribution(definition.id);
    instance.setAll([sound]); instance.setOn(true);
    const phase = definition.length + 1;
    instance.frame(listener, camera, origin + phase * 1000); await settle();
    expect(sources).toHaveLength(1); expect(sources[0].loop).toBe(false);
    expect(sources[0].start).toHaveBeenCalledWith(10 + definition.interval - phase, 0, definition.length);
    instance.remove(sound.id); expect(sources[0].stop).toHaveBeenCalledOnce();
    instance.frame(listener, camera, origin + definition.interval * 1000); await settle();
    expect(sources).toHaveLength(1);
  });

  it.each(definitions)("a late $id decode stays silent after Sound off", async definition => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = player(); instance.setAll([contribution(definition.id)]); instance.setOn(true);
    instance.frame(listener, camera, origin); await settle(); instance.setOn(false);
    waiting.resolve({ duration: definition.interval } as AudioBuffer); await settle();
    expect(sources).toHaveLength(0); expect(instance.on).toBe(false);
  });

  it.each(["cancel", "hidden", "disposed"])("a delayed private preview respects %s", async mode => {
    const waiting = deferred<AudioBuffer>(); decode.mockReturnValueOnce(waiting.promise);
    const instance = player(), preview = instance.preview("pond-frogs"); await settle();
    if (mode === "cancel") instance.stopPreview();
    else if (mode === "hidden") { document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); }
    else instance.dispose();
    waiting.resolve({ duration: 18 } as AudioBuffer);
    expect(await preview).toBe(false); expect(sources).toHaveLength(0); expect(instance.on).toBe(false);
  });
});
