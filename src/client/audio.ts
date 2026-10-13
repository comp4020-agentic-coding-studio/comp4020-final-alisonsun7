import type { Instrument, Note } from "../types.js";

// A believably different timbre per instrument, not a real instrument
// model: one oscillator type plus a short filter/envelope shape per preset,
// built on OscillatorNode + GainNode (+ BiquadFilterNode for guitar). No
// samples, no network fetch — the whole engine is synchronous and local, so
// switching instruments can take effect on the very next note with no load
// delay.
const PITCHES: Record<Note, number> = {
  // C major pentatonic: no combination of these five notes is dissonant,
  // whatever gets placed in the grid.
  do: 261.63, // C4
  re: 293.66, // D4
  mi: 329.63, // E4
  fa: 392.0, // G4 (skips the fourth, keeping the scale pentatonic)
  so: 440.0, // A4
};

let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

// Call from a user gesture (e.g. the Play button) before the first note, so
// browsers that start an AudioContext suspended actually produce sound.
export function resumeAudio(): void {
  void audioContext().resume();
}

export function playNote(note: Note, instrument: Instrument, when: number): void {
  const audio = audioContext();
  const freq = PITCHES[note];
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  switch (instrument) {
    case "piano": {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.3, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
      osc.connect(gain).connect(audio.destination);
      osc.start(when);
      osc.stop(when + 0.45);
      break;
    }
    case "guitar": {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, when);
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, when);
      filter.frequency.exponentialRampToValueAtTime(400, when + 0.3);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.25, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
      osc.connect(filter).connect(gain).connect(audio.destination);
      osc.start(when);
      osc.stop(when + 0.55);
      break;
    }
    case "sax": {
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, when);
      const vibrato = audio.createOscillator();
      const vibratoGain = audio.createGain();
      vibrato.frequency.setValueAtTime(5.5, when);
      vibratoGain.gain.setValueAtTime(6, when);
      vibrato.connect(vibratoGain).connect(osc.frequency);
      vibrato.start(when);
      vibrato.stop(when + 0.35);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.22, when + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.32);
      osc.connect(gain).connect(audio.destination);
      osc.start(when);
      osc.stop(when + 0.35);
      break;
    }
  }
}

export function audioNow(): number {
  return audioContext().currentTime;
}
