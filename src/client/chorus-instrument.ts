// Original Little Chorus score. No sampled music, synthesizer dependency or
// network request: the same bounded PCM is rendered in every browser.
import { CHORUS_BAR_MS, CHORUS_BPM, MUSICAL_IDS } from "../shared/chorus.js";

export const CHORUS_BAR_SECONDS = CHORUS_BAR_MS / 1000;
export const isChorusInstrument = (id: string): boolean => MUSICAL_IDS.includes(id) || id === "chorus-harmony";
const BEAT = 60 / CHORUS_BPM;
const TAU = Math.PI * 2;
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Quantize to the next server-time bar, allowing a short scheduling lead.
 * Epoch zero never changes when an old contribution is removed or added.
 * The listener's wall clock is deliberately absent from this calculation. */
export function nextChorusBar(serverNow: number, leadSeconds = .05): number {
  const next = Math.ceil((serverNow + leadSeconds * 1000) / CHORUS_BAR_MS) * CHORUS_BAR_MS;
  return Math.max(leadSeconds, (next - serverNow) / 1000);
}

/** A deterministic mono four-beat phrase. Voices share C major pentatonic
 * (C,D,E,G,A); the short release leaves genuine quiet at the loop seam. */
export function renderChorusPart(id: string, sampleRate = 44100): Float32Array {
  if (!isChorusInstrument(id) || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new Error("Unknown score or unsupported sample rate");
  const result = new Float32Array(Math.round(CHORUS_BAR_SECONDS * sampleRate));
  const tone = (midi: number, beat: number, length: number, level: number, timbre: "pad" | "pluck" | "bass"): void => {
    const from = Math.round(beat * BEAT * sampleRate), duration = length * BEAT;
    const count = Math.min(Math.round(duration * sampleRate), result.length - from - Math.round(.018 * sampleRate));
    const frequency = hz(midi);
    for (let i = 0; i < count; i++) {
      const time = i / sampleRate, progress = i / Math.max(1, count - 1);
      const attack = Math.min(1, time / (timbre === "pad" ? .12 : .008));
      const release = Math.min(1, (1 - progress) * duration / (timbre === "pad" ? .28 : .06));
      const decay = timbre === "pad" ? 1 - progress * .32 : Math.exp(-time * (timbre === "bass" ? 3 : 4.5));
      const fundamental = Math.sin(TAU * frequency * time);
      const colour = timbre === "pad" ? .18 * Math.sin(TAU * frequency * 2 * time)
        : timbre === "pluck" ? .19 * Math.sin(TAU * frequency * 3 * time) * Math.exp(-time * 7) : 0;
      result[from + i] += level * attack * release * decay * (fundamental + colour);
    }
  };
  const drum = (beat: number, level: number): void => {
    const from = Math.round(beat * BEAT * sampleRate), count = Math.round(.26 * sampleRate);
    for (let i = 0; i < count && from + i < result.length; i++) {
      const t = i / sampleRate;
      const phase = TAU * (47 * t + 53 * .035 * (1 - Math.exp(-t / .035)));
      result[from + i] += level * Math.min(1, t / .004) * Math.exp(-t * 20) * Math.sin(phase);
    }
  };
  if (id === "chorus-chords") {
    // A soft C add9 bed leaves the pluck's upper register clear.
    for (const note of [48, 55, 62, 64]) tone(note, 0, 3.85, .067, "pad");
  } else if (id === "chorus-pulse") {
    drum(0, .33); drum(2, .27);
    tone(67, 1, .15, .055, "pluck"); tone(67, 3, .15, .045, "pluck");
  } else if (id === "chorus-bells") {
    tone(79, .25, .72, .24, "pluck");
    tone(76, 1.75, .65, .20, "pluck");
    tone(81, 3, .72, .16, "pluck");
  } else {
    // This low answer is a derived result, not another person's contribution.
    tone(36, 0, 1.5, .17, "bass"); tone(43, 2, 1.5, .13, "bass");
  }
  // Remove tiny numerical DC, bound every sample, and preserve zero endpoints.
  let total = 0;
  for (const sample of result) total += sample;
  const mean = total / result.length;
  for (let i = 0; i < result.length; i++) {
    const fade = Math.min(1, i / (sampleRate * .004), (result.length - i - 1) / (sampleRate * .004));
    result[i] = Math.max(-.48, Math.min(.48, (result[i] - mean) * fade));
  }
  result[0] = 0; result[result.length - 1] = 0;
  return result;
}

export function chorusBuffer(context: AudioContext, id: string): AudioBuffer {
  const samples = renderChorusPart(id, context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** MP3 metadata includes an offline crossfade already; this small overlap also
 * removes encoder-padding seams. Never changes the timing of musical parts. */
export function seamlessRecording(context: AudioContext, input: AudioBuffer): AudioBuffer {
  if (typeof context.createBuffer !== "function" || typeof input.getChannelData !== "function" || !input.length || input.duration < .5)
    return input;
  const overlap = Math.min(Math.round(input.sampleRate * .08), Math.floor(input.length / 8));
  const length = input.length - overlap;
  const output = context.createBuffer(input.numberOfChannels, length, input.sampleRate);
  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const source = input.getChannelData(channel), target = output.getChannelData(channel);
    target.set(source.subarray(0, length));
    for (let i = 0; i < overlap; i++) {
      const t = i / overlap;
      target[i] = source[length + i] * (1 - t) + source[i] * t;
    }
  }
  return output;
}
