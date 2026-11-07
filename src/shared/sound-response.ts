// Shared, deterministic visual responses to the sounds people actually leave.
// No listener, audio switch, random value or browser-arrival time participates.
import type { PlacedSound } from "./protocol.js";

export type SoundMood = "cozy" | "lively" | "wild";
export type SoundBehavior = "sway" | "chat" | "play" | "listen" | "watch" | "wave";

export interface SoundResponseProfile {
  mood: SoundMood;
  behavior: SoundBehavior;
  label: string;
  hint: string;
}

const profiles: Record<SoundBehavior, SoundResponseProfile> = {
  sway: { mood: "lively", behavior: "sway", label: "Swaying", hint: "Nearby neighbours can gather and sway to the rhythm." },
  chat: { mood: "lively", behavior: "chat", label: "Joining in", hint: "Nearby neighbours can turn, gather and gesture together." },
  play: { mood: "lively", behavior: "play", label: "Playing", hint: "Nearby neighbours can answer with playful steps and a wave." },
  listen: { mood: "cozy", behavior: "listen", label: "Listening", hint: "Nearby neighbours can settle down and listen quietly." },
  watch: { mood: "wild", behavior: "watch", label: "Watching", hint: "Nearby neighbours can turn, look around and follow the call." },
  wave: { mood: "lively", behavior: "wave", label: "Waving", hint: "Nearby neighbours can perk up and answer with a wave." },
};

const behaviors: Readonly<Record<string, SoundBehavior>> = {
  "evening-forest": "watch", "trickle": "listen", "beach-waves": "listen",
  "children-playing": "play", "cafe-chatter": "chat", "espresso": "chat",
  "cafe-music": "sway", "guitar": "sway", "coastal-gulls": "watch",
  "gentle-breeze": "listen", "summer-cicadas": "watch", "bicycle-bell": "wave",
  "cafe-dishes": "chat", "harbour-boat": "watch", "wind-chimes": "listen",
  "rainstick": "listen", "hand-claps": "sway",
};

export function soundResponseFor(soundId: string): SoundResponseProfile | null {
  const behavior = Object.hasOwn(behaviors, soundId) ? behaviors[soundId] : undefined;
  if (soundId === "harbour-boat") return { ...profiles.watch, mood: "lively" };
  return behavior ? profiles[behavior] : null;
}

export interface ResidentHome {
  id: string;
  x: number;
  z: number;
  preference: SoundMood;
}

export interface ResidentResponse {
  sourceId: string;
  soundId: string;
  x: number;
  z: number;
  at: number;
  profile: SoundResponseProfile;
}

export const RESIDENT_HEAR = 18;
// New ingredients settle for a moment. Updating a library preview cannot
// change a resident; every page reaches this boundary at the same server time.
export const RESIDENT_SETTLE_MS = 2000;

/**
 * Fixed home positions, three-metre priority bands and oldest-first ties keep
 * a chosen source steady as the figure walks or the contribution list reorders.
 * A neighbour's preference is one band, so a substantially nearer sound wins.
 * This is deliberately stateless: a late arrival picks the same source as a
 * long-running page, unlike an incumbent-dependent local hysteresis rule.
 */
export function chooseResidentResponse(home: ResidentHome, sounds: readonly PlacedSound[], serverNowMs: number): ResidentResponse | null {
  if (![home.x, home.z, serverNowMs].every(Number.isFinite)) return null;
  let selected: ResidentResponse | null = null;
  let selectedPriority = Infinity;
  const seen = new Set<string>();
  const ended = new Set(sounds.filter((sound) => sound.whileIn || sound.removedAt).map((sound) => sound.id));
  for (const sound of sounds) {
    if (seen.has(sound.id) || ended.has(sound.id) || ![sound.x, sound.z].every(Number.isFinite)) continue;
    seen.add(sound.id);
    const profile = soundResponseFor(sound.soundId);
    const at = Date.parse(sound.at);
    if (!profile || !Number.isFinite(at) || serverNowMs - at < RESIDENT_SETTLE_MS) continue;
    const distance = Math.hypot(sound.x - home.x, sound.z - home.z);
    if (distance > RESIDENT_HEAR) continue;
    const priority = Math.floor(distance / 3) + (profile.mood === home.preference ? 0 : 1);
    if (selected && (priority > selectedPriority || (priority === selectedPriority && (at > selected.at || (at === selected.at && sound.id >= selected.sourceId))))) continue;
    selected = { sourceId: sound.id, soundId: sound.soundId, x: sound.x, z: sound.z, at, profile };
    selectedPriority = priority;
  }
  return selected;
}

/** A reproducible per-resident phase; it never depends on the visitor. */
export function residentPhase(id: string, serverNowMs: number, periodSeconds = 3.2): number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  const offset = (seed >>> 0) / 0x100000000;
  return ((serverNowMs / (periodSeconds * 1000) + offset) % 1 + 1) % 1;
}
