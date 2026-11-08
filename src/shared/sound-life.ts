import { planetDistance } from "./planet.js";
import type { SoundSignal } from "./sound-response.js";

export type ExampleKind = "coffee" | "birds" | "gulls";
export interface WorldSoundExample extends SoundSignal {
  origin: "example";
  kind: ExampleKind;
  placeId: string;
  title: string;
  effect: string;
}
const epoch="2026-11-08T00:00:00Z";
/** A few authored discovery spots, varied by stable room seed rather than
 * each browser's random draw. No fake user, database row or response chain. */
export function worldSoundExamples(seed: string): WorldSoundExample[] {
  let hash=2166136261;for(const letter of seed)hash=Math.imul(hash^letter.charCodeAt(0),16777619);
  const n=(hash>>>0)%3;
  return [
    {id:"@world:coffee",origin:"example",kind:"coffee",placeId:"tea",soundId:"espresso",x:-9.4,z:-8.8,at:epoch,title:"Coffee brings company",effect:"The machine steams and neighbours turn to chat."},
    {id:"@world:birds",origin:"example",kind:"birds",placeId:"conservatory",soundId:"evening-forest",x:-3.8+n*.45,z:14.1+n*.35,at:epoch,title:"A call, then a visitor",effect:"Bird calls invite little birds to circle nearby."},
    {id:"@world:gulls",origin:"example",kind:"gulls",placeId:"pool",soundId:"coastal-gulls",x:18.3+n*.25,z:14.8-n*.3,at:epoch,title:"The shore answers",effect:"Gull calls bring a small flock above the tide pools."},
  ];
}
/** Real local contributions take the teaching prop's place. Turning examples
 * off affects only this visitor; actual friends' sources always remain. */
export function activeWorldExamples(examples: readonly WorldSoundExample[], sources: readonly SoundSignal[], enabled: boolean): WorldSoundExample[] {
  if(!enabled)return [];
  const live=sources.filter(source=>!source.removedAt&&!source.whileIn&&!source.origin);
  return examples.filter(example=>!live.some(source=>planetDistance(source,example)<=8 &&
    (example.kind==="coffee" ? ["espresso","cafe-chatter","cafe-dishes","cafe-music","guitar","chorus-chords","chorus-pulse","chorus-bells"].includes(source.soundId)
      : example.kind==="birds" ? source.soundId==="evening-forest" : source.soundId==="coastal-gulls")));
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
