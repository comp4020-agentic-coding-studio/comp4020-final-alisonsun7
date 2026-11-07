import {describe,expect,it} from "vitest";
import {findNearbyPlan,placementAvailability,type PlacementSource} from "../src/shared/chorus-placement.ts";
import {PLANET_HALF,planetDistance,planetStep} from "../src/shared/planet.ts";
import {CROWD_MAX,PLACE_MAX,REACH,SAME_APART} from "../src/shared/sounds.ts";
const origin={x:0,z:0,yaw:0}, clear=()=>true;
const source=(id:string,patch:Partial<PlacementSource>={}):PlacementSource=>({id,soundId:"trickle",by:"Ada",byId:"ada",x:0,z:0,at:"2026-11-08T00:00:00Z",...patch});
describe("advisory placement beside real sounds",()=>{
  it("finds room for the same sound using the server's strict spacing rule, without changing a source",()=>{
    const root=source("root"), rows=[root], frozen=JSON.stringify(rows);
    expect(placementAvailability("trickle",origin,null,rows,clear).code).toBe("too_close");
    const point=findNearbyPlan("trickle",origin,null,rows,clear)!;
    expect(point).not.toBeNull();expect(planetDistance(point,root)).toBeGreaterThan(SAME_APART+.1);
    expect(placementAvailability("trickle",point,null,rows,clear).allowed).toBe(true);
    expect(JSON.stringify(rows)).toBe(frozen);
    // The exact threshold is allowed, while a point one centimetre inside is not.
    expect(placementAvailability("trickle",{x:4,z:0},null,rows,clear).allowed).toBe(true);
    expect(placementAvailability("trickle",{x:3.99,z:0},null,rows,clear).code).toBe("too_close");
  });
  it("counts only live public sources, applies six-source corners and whole-world capacity",()=>{
    const crowd=Array.from({length:CROWD_MAX},(_,i)=>source(String(i),{soundId:"chorus-chords"}));
    expect(placementAvailability("trickle",origin,null,crowd,clear).code).toBe("crowded");
    expect(findNearbyPlan("trickle",origin,null,crowd,clear)).toBeNull();
    const inactive=[{...crowd[0],whileIn:"planet-shower"},{...crowd[1],removedAt:"2026-11-08T01:00:00Z"}];
    expect(placementAvailability("trickle",origin,null,inactive,clear).allowed).toBe(true);
    const full=Array.from({length:PLACE_MAX},(_,i)=>source(String(i),{x:50,soundId:"chorus-chords"}));
    expect(placementAvailability("trickle",origin,null,full,clear).code).toBe("place_full");
    expect(findNearbyPlan("trickle",origin,null,full,clear)).toBeNull();
  });
  it("keeps a reply beside its live parent and refuses withdrawn or private parents",()=>{
    const parent=source("parent",{soundId:"chorus-chords"}), same=source("same",{soundId:"trickle",x:1});
    const point=findNearbyPlan("trickle",origin,parent,[parent,same],clear)!;
    expect(point).not.toBeNull();expect(planetDistance(point,parent)).toBeLessThanOrEqual(REACH);
    expect(placementAvailability("trickle",{x:5,z:0},parent,[parent,same],clear).code).toBe("reply_too_far");
    const withdrawn={...parent,removedAt:"2026-11-08T01:00:00Z"};
    expect(findNearbyPlan("trickle",origin,withdrawn,[withdrawn,same],clear)).toBeNull();
    expect(placementAvailability("trickle",origin,{...parent,whileIn:"planet-shower"},[parent],clear).code).toBe("reply_private");
    expect(placementAvailability("trickle",origin,parent,[],clear).code).toBe("reply_gone");
  });
  it("checks every walking substep instead of jumping over a wall to a valid endpoint",()=>{
    const rows=[source("root")];
    // A closed ring is a stand-in for actual wall/water/private-room collision.
    const ring=(x:number,z:number)=>{const d=planetDistance(origin,{x,z});return d<1||d>1.3;};
    expect(placementAvailability("trickle",{x:4.5,z:0},null,rows,ring).allowed).toBe(true);
    expect(findNearbyPlan("trickle",origin,null,rows,ring)).toBeNull();
    expect(placementAvailability("trickle",origin,null,rows,()=>false).code).toBe("unsafe");
  });
  it("uses short great-circle distances across the seam and near a pole",()=>{
    const seam={x:PLANET_HALF-.2,z:0,yaw:Math.PI/2}, root=source("seam",seam);
    const point=findNearbyPlan("trickle",seam,null,[root],clear)!;
    expect(planetDistance(point,seam)).toBeLessThanOrEqual(10.001);expect(planetDistance(point,seam)).toBeGreaterThan(SAME_APART);
    const pole={x:32,z:PLANET_HALF/2-.4,yaw:0}, polar=source("polar",pole);
    const polarPoint=findNearbyPlan("trickle",pole,null,[polar],clear)!;
    expect(placementAvailability("trickle",polarPoint,null,[polar],clear).allowed).toBe(true);
    expect(planetDistance(planetStep(seam,1,0,2),seam)).toBeCloseTo(2,8);
  });

  it("reserves room for the actual walking stop tolerance in spacing, crowd and reply reach",()=>{
    const parent=source("parent",{soundId:"chorus-chords"}), same=source("same",{soundId:"trickle",x:1});
    const replyRows=[parent,same], replyPoint=findNearbyPlan("trickle",origin,parent,replyRows,clear)!;
    expect(replyPoint).not.toBeNull();expect(planetDistance(replyPoint,parent)).toBeLessThanOrEqual(REACH-.4);
    const crowdRows=Array.from({length:CROWD_MAX},(_,i)=>source(`edge-${i}`,{x:8,soundId:"chorus-chords"}));
    const crowdPoint=findNearbyPlan("trickle",origin,null,crowdRows,clear)!;expect(crowdPoint).not.toBeNull();
    for(let spoke=0;spoke<32;spoke++){
      const aroundReply=planetStep({...replyPoint,yaw:spoke/32*Math.PI*2},1,0,.34);
      expect(placementAvailability("trickle",aroundReply,parent,replyRows,clear).allowed).toBe(true);
      const aroundCrowd=planetStep({...crowdPoint,yaw:spoke/32*Math.PI*2},1,0,.34);
      expect(placementAvailability("trickle",aroundCrowd,null,crowdRows,clear).allowed).toBe(true);
    }
  });
});
