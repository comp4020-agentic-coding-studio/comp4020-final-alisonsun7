// Advisory local planning for an explicit public contribution. The server
// still commits identity, rate, source existence and exact room rules.
import { planetCoordsValid, planetDistance, planetStep } from "./planet.js";
import type { Position, SoundReference } from "./protocol.js";
import { CROWD_MAX, CROWD_RADIUS, PLACE_MAX, REACH, SAME_APART, findSound } from "./sounds.js";

type Point = { x: number; z: number; yaw?: number };
export type PlacementSource = SoundReference & { whileIn?: string };
export type PlacementCode = "ready" | "bad_sound" | "unsafe" | "reply_gone" | "reply_private" | "reply_too_far" | "place_full" | "too_close" | "crowded";
export interface PlacementAvailability { allowed: boolean; reason: string; code: PlacementCode }
type CanStand = (x: number, z: number) => boolean;
const blocked = (code: Exclude<PlacementCode, "ready">, reason: string): PlacementAvailability => ({allowed:false,code,reason});
const livePublic = (sources: readonly PlacementSource[]): PlacementSource[] => sources.filter(source=>!source.removedAt&&!source.whileIn);

export function placementAvailability(soundId: string, at: Point, parent: PlacementSource | null,
  sources: readonly PlacementSource[], canStand: CanStand): PlacementAvailability {
  const kind=findSound(soundId);
  if(!kind)return blocked("bad_sound","Choose a sound from the library.");
  const kept=livePublic(sources);
  if(parent) {
    if(parent.whileIn)return blocked("reply_private","A private room's sound stays private. Choose a sound outside to answer.");
    if(parent.removedAt||!kept.some(source=>source.id===parent.id))return blocked("reply_gone","That sound was withdrawn. Its story remains; choose a live sound to answer.");
    // REACH is the existing nearby interaction distance. The service checks
    // the real parent and room limits; this stricter contextual guard keeps a
    // proposed answer beside the sound the player actually chose.
    if(planetDistance(at,parent)>REACH)return blocked("reply_too_far","Move beside the sound you are answering first.");
  }
  if(!planetCoordsValid(at.x,at.z)||!canStand(at.x,at.z))return blocked("unsafe","Choose an open path outside the private rooms.");
  // Match sessions.ts: capacity, same sound strictly closer than SAME_APART,
  // then the inclusive CROWD_RADIUS count. Private stays never consume slots.
  if(kept.length>=PLACE_MAX)return blocked("place_full","This world is full of lasting sounds. Withdraw one nearby before adding another.");
  const near=kept.filter(source=>planetDistance(source,at)<=CROWD_RADIUS);
  if(near.some(source=>source.soundId===soundId&&planetDistance(source,at)<SAME_APART))return blocked("too_close",`Another ${kind.label} is too close. Find a little more room for this sound.`);
  if(near.length>=CROWD_MAX)return blocked("crowded","This corner already holds six sounds. Find a little room nearby, or begin a work in another place.");
  return {allowed:true,code:"ready",reason:""};
}

/** A single safe straight walk, never a teleport or implicit publication.
 * Try nearest rings first. Every substep and endpoint uses the caller's real
 * collision/privacy predicate; no path may cut through water or a locked hut.
 * Null honestly means no candidate in this bounded local search. */
export function findNearbyPlan(soundId: string, at: Point, parent: PlacementSource | null,
  sources: readonly PlacementSource[], canStand: CanStand): Position | null {
  const initial=placementAvailability(soundId,at,parent,sources,canStand);
  const yaw=Number.isFinite(at.yaw)?at.yaw!:0;
  if(initial.allowed)return {x:at.x,z:at.z,yaw};
  if(!planetCoordsValid(at.x,at.z)||["bad_sound","reply_gone","reply_private","place_full"].includes(initial.code))return null;
  const kept=livePublic(sources);
  for(let radius=2;radius<=10;radius+=.5) {
    for(let spoke=0;spoke<32;spoke++) {
      const start={x:at.x,z:at.z,yaw:yaw+spoke/32*Math.PI*2};
      const candidate=planetStep(start,1,0,radius);
      if(!placementAvailability(soundId,candidate,parent,sources,canStand).allowed)continue;
      // The controller may finish up to .34m short of its walking target.
      // Reserve .4m in all three spatial constraints, including an expanded
      // crowd circle: a smaller near circle would accidentally permit more.
      if(parent&&planetDistance(parent,candidate)>REACH-.4)continue;
      if(kept.some(source=>source.soundId===soundId&&planetDistance(source,candidate)<SAME_APART+.4))continue;
      if(kept.filter(source=>planetDistance(source,candidate)<=CROWD_RADIUS+.4).length>=CROWD_MAX)continue;
      let clear=true;
      for(let travelled=.1;travelled<radius;travelled+=.1) {
        const step=planetStep(start,1,0,travelled);
        if(!canStand(step.x,step.z)){clear=false;break;}
      }
      if(clear)return candidate;
    }
  }
  return null;
}
