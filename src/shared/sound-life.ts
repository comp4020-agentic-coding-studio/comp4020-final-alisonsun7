import { PLANET_PLACES, planetDistance } from "./planet.js";
import type { SoundSignal } from "./sound-response.js";

export type ExampleKind = "coffee" | "birds" | "gulls" | "whale" | "frogs" | "boat" | "guitar";
export interface WorldSoundExample extends SoundSignal {
  origin: "example";
  kind: ExampleKind;
  placeId: string;
  title: string;
  effect: string;
}
const epoch="2026-11-08T00:00:00Z";
/** How a world example is named where something must show an author: it is
 * the world's, never a person's, and never sent to the server. */
export const EXAMPLE_ID="@world",EXAMPLE_BY="World example";
/** Authored discovery spots, varied by stable room seed rather than each
 * browser's random draw. No fake user, database row or response chain.
 * Wen asked for sounds that change the world to be in place from the start
 * (ADR 038): the whale, frogs, a ferry and a guitar join the first three. */
export function worldSoundExamples(seed: string): WorldSoundExample[] {
  let hash=2166136261;for(const letter of seed)hash=Math.imul(hash^letter.charCodeAt(0),16777619);
  const n=(hash>>>0)%3;
  return [
    {id:"@world:coffee",origin:"example",kind:"coffee",placeId:"tea",soundId:"espresso",x:-9.4,z:-8.8,at:epoch,title:"Coffee brings company",effect:"The machine steams and neighbours turn to chat."},
    {id:"@world:birds",origin:"example",kind:"birds",placeId:"conservatory",soundId:"evening-forest",x:-3.8+n*.45,z:14.1+n*.35,at:epoch,title:"A call, then a visitor",effect:"Bird calls invite little birds to circle nearby."},
    {id:"@world:gulls",origin:"example",kind:"gulls",placeId:"pool",soundId:"coastal-gulls",x:18.3+n*.25,z:14.8-n*.3,at:epoch,title:"The shore answers",effect:"Gull calls bring a small flock above the tide pools."},
    {id:"@world:whale",origin:"example",kind:"whale",placeId:"pool",soundId:"whale-song",x:21.5+n*.3,z:16.2,at:epoch,title:"A song from the sea",effect:"Whale song brings a whale to the coast to breathe and leap."},
    {id:"@world:frogs",origin:"example",kind:"frogs",placeId:"pool",soundId:"pond-frogs",x:13.1,z:15.4+n*.2,at:epoch,title:"The pool croaks back",effect:"Frog calls bring frogs onto the lily pads, puffing and hopping."},
    {id:"@world:boat",origin:"example",kind:"boat",placeId:"pool",soundId:"harbour-boat",x:4.6-n*.3,z:17.4,at:epoch,title:"A horn, then a ferry",effect:"A boat's horn sets a little ferry sailing along the coast."},
    {id:"@world:guitar",origin:"example",kind:"guitar",placeId:"stage",soundId:"guitar",x:10.8+n*.3,z:-8.2,at:epoch,title:"Music on the stage",effect:"Guitar gives nearby neighbours a rhythm to sway to."},
  ];
}
/** Real local contributions take the teaching prop's place. Turning examples
 * off affects only this visitor; actual friends' sources always remain. */
export function activeWorldExamples(examples: readonly WorldSoundExample[], sources: readonly SoundSignal[], enabled: boolean): WorldSoundExample[] {
  if(!enabled)return [];
  const live=sources.filter(source=>!source.removedAt&&!source.whileIn&&!source.origin);
  return examples.filter(example=>!live.some(source=>planetDistance(source,example)<=8 &&
    (example.kind==="coffee" ? ["espresso","cafe-chatter","cafe-dishes","cafe-music","guitar","chorus-chords","chorus-pulse","chorus-bells"].includes(source.soundId)
      : example.kind==="guitar" ? ["guitar","hand-claps","cafe-music","chorus-chords","chorus-pulse","chorus-bells"].includes(source.soundId)
      : source.soundId===example.soundId)));
}

export function wildlifeKind(soundId: string): "bird" | "gull" | null {
  return soundId==="evening-forest"?"bird":soundId==="coastal-gulls"?"gull":null;
}

export function soundLifeEffect(soundId: string): string | null {
  return soundId==="evening-forest" ? "Bird calls invite little birds to circle nearby."
    : soundId==="coastal-gulls" ? "Gull calls bring a small flock above the shore."
    : soundId==="espresso" ? "The coffee machine steams; nearby neighbours turn to chat."
    : soundId==="harbour-boat" ? "A little ferry sails the nearest coast. The horn stays where it was left."
    : soundId==="gentle-breeze" ? "A little paper pinwheel turns beside your breeze."
    : soundId==="pond-bubbles" ? "Bubbles gather a little shoal at nearby water. Try them beside the pool or shore."
    : soundId==="pond-frogs" ? "At the tide pools, frogs answer with puffed cheeks, little hops and ripples."
    : soundId==="whale-song" ? "Near the coast, a whale surfaces, breathes and sometimes leaps."
    : ["cafe-chatter","cafe-dishes"].includes(soundId) ? "Company brings neighbours into conversation."
    : ["cafe-music","guitar","chorus-chords","chorus-pulse"].includes(soundId) ? "Music gives nearby neighbours a rhythm to sway to."
    : soundId==="chorus-bells" ? "Little notes invite a wave from nearby neighbours." : null;
}

/** Sounds that visibly change the world come first (ADR 038), keeping the
 * given order within each group. When fewer than `count` do, the nearest
 * places' world-changing sounds fill in, so the first choices are ones whose
 * effect a visitor can see. `pinned` stays first whatever it is. */
export function worldChangingFirst(ids: readonly string[], at: { x: number; z: number }, count = 3, pinned?: string,
  effect: (soundId: string) => string | null = soundLifeEffect): string[] {
  const changes = (id: string): boolean => !!effect(id);
  const nearby = [...PLANET_PLACES].sort((a, b) => planetDistance(a, at) - planetDistance(b, at)).flatMap(place => place.sounds.filter(changes));
  const rest = [...new Set(ids)].filter(id => id !== pinned);
  const ordered = [...rest.filter(changes), ...nearby.filter(id => !rest.includes(id) && id !== pinned), ...rest.filter(id => !changes(id))];
  return [...new Set([...(pinned ? [pinned] : []), ...ordered])].slice(0, count);
}
