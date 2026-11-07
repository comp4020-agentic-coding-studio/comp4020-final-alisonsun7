// The work is a projection of real durable contributions, never a second
// editable copy. Private stays and unknown recordings cannot grow a work.
import type { SoundReference } from "./protocol.js";
import { findSound } from "./sounds.js";
import { PLANET_PLACES, planetDistance } from "./planet.js";

export type ChorusPlace = "green" | "stage" | "reading";
export type ChorusVariant = "habitat" | "ensemble" | "lantern";
export interface ChorusWork {
  id: string;
  placeId: ChorusPlace;
  x: number;
  z: number;
  title: string;
  variant: ChorusVariant;
  duet: boolean;
  sources: SoundReference[];
  liveSources: SoundReference[];
  contributors: { id: string; name: string }[];
  at: string;
  lastAt: string;
}
export const CHORUS_PLACES: ChorusPlace[] = ["green", "stage", "reading"];
export const CHORUS_BPM = 72;
export const CHORUS_BAR_MS = 60_000 / CHORUS_BPM * 4;
export const MUSICAL_IDS = ["chorus-chords", "chorus-pulse", "chorus-bells"];
const order = (a: SoundReference, b: SoundReference): number => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
export function chorusPlaceAt(point: { x: number; z: number }): ChorusPlace | null {
  const place = PLANET_PLACES.filter(p => CHORUS_PLACES.includes(p.id as ChorusPlace))
    .map(p => ({ p, distance: planetDistance(p, point) })).sort((a, b) => a.distance - b.distance || a.p.id.localeCompare(b.p.id))[0];
  return place && place.distance <= 8 ? place.p.id as ChorusPlace : null;
}
export function chorusVariant(sources: readonly SoundReference[]): ChorusVariant {
  const ids = new Set(sources.map(s => s.soundId));
  const water = ["trickle", "beach-waves", "rainstick"].some(id => ids.has(id));
  const birds = ["evening-forest", "coastal-gulls", "gentle-breeze"].some(id => ids.has(id));
  if (water && birds) return "habitat";
  if (["chorus-chords", "chorus-bells", "guitar", "cafe-music"].some(id => ids.has(id)) && ["chorus-pulse", "hand-claps"].some(id => ids.has(id))) return "ensemble";
  return "lantern";
}
export const VARIANT_COPY: Record<ChorusVariant, { title: string; solo: string; together: string }> = {
  habitat: { title: "Watersong canopy", solo: "Water and birds unfurl the leaves. A friend's answer opens the canopy.", together: "Your water-and-bird answers opened the canopy. Paper birds trace the ripples together." },
  ensemble: { title: "Pocket chorus", solo: "A melody and a pulse turn the petals. A friend's answer brings in the low harmony.", together: "Your melody-and-rhythm answers opened the beat flower. A shared low harmony joins on the next bar." },
  lantern: { title: "Firefly lantern", solo: "Each ingredient lights a petal. A friend's answer lets the lights travel between them.", together: "Your answers opened the lantern. Light now travels between the petals you each brought." },
};

export function deriveChorusWorks(input: readonly (SoundReference & { whileIn?: string })[]): ChorusWork[] {
  const rows = new Map(input.filter(s => !s.whileIn && !!findSound(s.soundId)).map(s => [s.id, { ...s }]));
  const groups = new Map<string, SoundReference[]>();
  for (const source of rows.values()) {
    let root = source; const seen = new Set([source.id]);
    while (root.replyToId && rows.has(root.replyToId) && !seen.has(root.replyToId)) {
      root = rows.get(root.replyToId)!; seen.add(root.id);
    }
    const group = groups.get(root.id) ?? []; group.push(source); groups.set(root.id, group);
  }
  const works: ChorusWork[] = [];
  for (const [id, sources] of groups) {
    sources.sort(order); const root = rows.get(id)!, placeId = chorusPlaceAt(root);
    if (!placeId) continue;
    const liveSources = sources.filter(s => !s.removedAt), live = new Map(liveSources.map(s => [s.id, s]));
    const duet = liveSources.some(s => { const parent = s.replyToId && live.get(s.replyToId);return parent && parent.byId !== s.byId; });
    const contributors = [...new Map(sources.map(s => [s.byId, { id: s.byId, name: s.by }])).values()];
    const variant = chorusVariant(liveSources);
    works.push({ id, placeId, x: root.x, z: root.z, title: `${root.by}'s little chorus`, variant, duet,
      sources, liveSources, contributors, at: root.at,
      lastAt: sources.flatMap(s => [s.at, s.removedAt ?? s.at]).sort().at(-1)! });
  }
  // All living works remain available. Keep a bounded recent archive without
  // deleting any source or changing the older conversation endpoint.
  works.sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.id.localeCompare(b.id));
  let archived = 0;
  return works.filter(w => w.liveSources.length || archived++ < 12);
}

export function recommendedSounds(parent?: SoundReference | null, place: string = "green"): string[] {
  if (parent) {
    if (["chorus-chords", "chorus-bells", "guitar", "cafe-music"].includes(parent.soundId)) return ["chorus-pulse", "chorus-bells", "trickle"];
    if (["chorus-pulse", "hand-claps"].includes(parent.soundId)) return ["chorus-chords", "chorus-bells", "evening-forest"];
    if (["trickle", "rainstick", "beach-waves"].includes(parent.soundId)) return ["evening-forest", "chorus-bells", "gentle-breeze"];
    if (["evening-forest", "coastal-gulls", "gentle-breeze"].includes(parent.soundId)) return ["trickle", "chorus-bells", "chorus-chords"];
  }
  return place === "stage" ? ["chorus-chords", "chorus-pulse", "chorus-bells"] : place === "reading" ? ["trickle", "evening-forest", "chorus-bells"] : ["trickle", "chorus-chords", "chorus-bells"];
}
