// A short, consumed tab-local handoff keeps a view change at the same place.
// No coordinates enter URLs, shared storage, logs or database records.
import { planetCoordsValid } from "../shared/planet.js";
import type { Position } from "../shared/protocol.js";
import type { Presentation } from "../shared/presentation.js";
const KEY = "chorus-presentation-handoff";
type LocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function leavePresentation(storage: LocalStorage, view: Presentation, at: Position, who: string | null, now: number): void {
  try {storage.setItem(KEY, JSON.stringify({view, at:{x:at.x,z:at.z,yaw:at.yaw}, who, now}));} catch { /* The view still works if local storage is unavailable. */ }
}
export function enterPresentation(storage: LocalStorage, view: Presentation, who: string | null, now: number): Position | null {
  try {
    const raw = storage.getItem(KEY);storage.removeItem(KEY);if(!raw)return null;
    const handoff=JSON.parse(raw),at=handoff.at;
    if(handoff.view!==view || handoff.who!==who || !Number.isFinite(handoff.now) || now<handoff.now || now-handoff.now>15_000 || !at || !planetCoordsValid(at.x,at.z) || !Number.isFinite(at.yaw))return null;
    return {x:at.x,z:at.z,yaw:Math.atan2(Math.sin(at.yaw),Math.cos(at.yaw))};
  } catch {return null;}
}
