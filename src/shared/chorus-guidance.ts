// Readable consequences of the existing source projection. This module never
// creates a contribution or decides whether a publication is accepted.
import { chorusVariant, VARIANT_COPY, type ChorusVariant, type ChorusWork } from "./chorus.js";
import type { SoundReference } from "./protocol.js";
import { findSound } from "./sounds.js";

export const RESULT_DETAIL: Record<ChorusVariant, string> = {
  habitat: "Water ripples spread beneath a leaf canopy, and paper birds circle above.",
  ensemble: "Melody and rhythm open the turning beat flower. A shared low harmony joins the next bar.",
  lantern: "The lantern opens, and light travels between the petals each person brought.",
};
export const soundName = (source: Pick<SoundReference, "soundId">): string => findSound(source.soundId)?.label ?? "sound";
function liveAnswer(work: ChorusWork): { answer: SoundReference; parent: SoundReference } | null {
  const live = new Map(work.liveSources.map(source => [source.id, source]));
  for (const answer of [...work.liveSources].reverse()) {
    const parent = answer.replyToId && live.get(answer.replyToId);
    if (parent && parent.byId !== answer.byId) return { answer, parent };
  }
  return null;
}
const answerSentence = ({ answer, parent }: { answer: SoundReference; parent: SoundReference }): string => `${answer.by} answered ${parent.by}'s ${soundName(parent)} with ${soundName(answer)}.`;

/** Describe a possible addition, including every still-live ingredient in the
 * actual work, rather than promising a recipe from the parent alone. */
export function choiceConsequence(soundId: string, parent: SoundReference | null, work?: ChorusWork, viewerId?: string): string {
  if (!parent) {
    const invitation = ["trickle", "rainstick", "beach-waves"].includes(soundId) ? "A friend's bird or breeze answer can open a Watersong canopy."
      : ["chorus-chords", "chorus-bells", "guitar", "cafe-music"].includes(soundId) ? "A friend's rhythm can turn this into a Pocket chorus."
      : ["chorus-pulse", "hand-claps"].includes(soundId) ? "A friend's melody can turn this into a Pocket chorus."
      : ["evening-forest", "coastal-gulls", "gentle-breeze"].includes(soundId) ? "A friend's water answer can open a Watersong canopy."
      : "A friend's answer can open a Firefly lantern.";
    return `Start one glowing petal. ${invitation}`;
  }
  const living = work?.liveSources ?? (parent.removedAt ? [] : [parent]);
  const variant = chorusVariant([...living, { ...parent, soundId }]);
  const title = VARIANT_COPY[variant].title;
  const context = `With ${parent.by}'s ${soundName(parent)}: ${title}.`;
  const parentLives = !parent.removedAt && (!work || living.some(source => source.id === parent.id));
  if (!parentLives) return `The original sound was withdrawn. Its link is remembered; a new live answer can keep the work growing.`;
  if (parent.byId === viewerId && !work?.duet) return `${context} Add another layer of your own; a friend's live answer opens the shared form.`;
  if (!viewerId && !work?.duet) return `${context} Join with your own name to answer. Different friends' live answers open it together.`;
  return `${context} ${work?.duet ? "Keep changing this shared work." : "Your answer opens it together."} ${RESULT_DETAIL[variant]}`;
}

/** The latest real source that can be answered: prefer another identity, while
 * allowing a solo creator to experiment without inventing a second player. */
export function nextSource(work: ChorusWork | undefined, viewerId?: string): SoundReference | undefined {
  if (!work) return;
  return [...work.liveSources].reverse().find(source => source.byId !== viewerId) ?? work.liveSources.at(-1);
}

export function workNextStep(work: ChorusWork | undefined, viewerId?: string): string {
  if (!work) return "Begin here: listen to a sound, then leave the one you like.";
  if (!work.liveSources.length) return "This work is resting. Begin again, or remember how it grew.";
  const source = nextSource(work, viewerId)!;
  const relation = work.duet && liveAnswer(work);
  if (relation) return `${answerSentence(relation)} Try another answer, or return to it later.`;
  return source.byId === viewerId ? "Your sound is here. Invite a friend, or try another layer."
    : `Your answer matters: respond to ${source.by}'s ${soundName(source)} to open this work together.`;
}

/** Describe only a live, cross-author relation as the cause of the shared form.
 * Withdrawn parents remain readable history, never a still-playing duet. */
export function workResult(work: ChorusWork): string {
  if (!work.liveSources.length) return "All sounds were withdrawn. This record remembers the authors and their answers; the sculpture is resting.";
  const relation = work.duet && liveAnswer(work);
  if (relation) return `${answerSentence(relation)} The answering light travels from ${relation.parent.by}'s leaf to ${relation.answer.by}'s. ${RESULT_DETAIL[work.variant]}`;
  const withdrawn = work.sources.some(source => source.removedAt);
  return `${VARIANT_COPY[work.variant].solo}${withdrawn ? " Only live sounds shape what you see and hear now; withdrawn sounds remain in the story below." : " Your own layers are welcome; a live answer from a different friend opens the shared form."}`;
}
