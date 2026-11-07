// A public mark belongs to a real participant ID, not a nickname, avatar,
// browser tab or NPC. It is a reading aid, never a second identity system.
import type { ChorusWork } from "./chorus.js";
import type { SoundReference } from "./protocol.js";

export type AuthorMarkShape = "round" | "diamond" | "petal" | "triangle";
export interface AuthorMark { color: string; shape: AuthorMarkShape; label: string }
const SHAPES: readonly AuthorMarkShape[] = ["round", "diamond", "petal", "triangle"];
const LABELS: Record<AuthorMarkShape, string> = { round: "circle", diamond: "diamond", petal: "leaf", triangle: "triangle" };
function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
function colour(hue: number): string {
  // Muted paper colours remain distinct from the green/timber carrier. A full
  // hue circle avoids assigning everyone to only three or four swatches.
  const saturation = .48, lightness = .57;
  const channel = (offset: number): number => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[channel(0), channel(8), channel(4)].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
export function authorMark(id: string): AuthorMark {
  const value = hash(id), shape = SHAPES[(value >>> 16) % SHAPES.length]!;
  return { color: colour(value % 360), shape, label: LABELS[shape] };
}
// Colour-spelling alias for the source-card painter. Both use the same mark.
export function chorusAuthorSignature(id: string): AuthorMark & { colour: string } {
  const mark = authorMark(id); return { ...mark, colour: mark.color };
}

export interface ChorusAnswer { sourceId: string; parentId: string; fromAuthorId: string; toAuthorId: string }
export function liveChorusAnswers(work: Pick<ChorusWork, "liveSources">): ChorusAnswer[] {
  const live = new Map(work.liveSources.filter(source => !source.removedAt).map(source => [source.id, source]));
  return [...live.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).flatMap(source => {
    const parent = source.replyToId && live.get(source.replyToId);
    return parent && parent.byId !== source.byId ? [{ sourceId: source.id, parentId: parent.id,
      fromAuthorId: parent.byId, toAuthorId: source.byId }] : [];
  });
}
export function workSignature(work: Pick<ChorusWork, "id" | "variant" | "liveSources">): string {
  // Withdrawal changes the visible signature, while an ended source retained
  // only in history cannot add marks or unlock the shared form.
  const live = work.liveSources.filter(source => !source.removedAt)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const ids = new Set(live.map(source => source.id));
  return hash(JSON.stringify([work.id, work.variant, live.map(source => [source.id, source.byId, source.soundId,
    source.replyToId && ids.has(source.replyToId) ? source.replyToId : null])])).toString(36).padStart(7, "0");
}

/** Keep the close-camera display legible without hiding a friend's answer
 * behind six older ingredients. All sources remain in the canonical work and
 * in its accessible record; these are just the carrier's six physical slots. */
export function visibleChorusSources(work: Pick<ChorusWork, "liveSources">): SoundReference[] {
  const ordered = work.liveSources.filter(source => !source.removedAt)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  if (ordered.length <= 6) return ordered;
  const chosen = new Map<string, SoundReference>(), byId = new Map(ordered.map(source => [source.id, source]));
  const lastAnswer = liveChorusAnswers(work).at(-1);
  if (lastAnswer) {
    chosen.set(lastAnswer.parentId, byId.get(lastAnswer.parentId)!);
    chosen.set(lastAnswer.sourceId, byId.get(lastAnswer.sourceId)!);
  }
  // First give every real author a visible ingredient (up to the six-person
  // intended group). Repeated sounds by one person never occupy every slot.
  const represented = new Set([...chosen.values()].map(source => source.byId));
  for (const source of [...ordered].reverse()) {
    if (chosen.size >= 6) break;
    if (!represented.has(source.byId)) { chosen.set(source.id, source); represented.add(source.byId); }
  }
  for (const source of [...ordered].reverse()) {
    if (chosen.size >= 6) break;
    chosen.set(source.id, source);
  }
  return [...chosen.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
