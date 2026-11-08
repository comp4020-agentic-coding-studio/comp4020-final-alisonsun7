import { describe,it,expect } from "vitest";
import { activeWorldExamples,worldSoundExamples,soundLifeEffect } from "../src/shared/sound-life.ts";
import { chooseResidentResponse } from "../src/shared/sound-response.ts";
describe("world examples without invented contributors",()=>{
  it("gives the same room the same bounded discovery spots without an author",()=>{
    const a=worldSoundExamples("room-one"),b=worldSoundExamples("room-one");expect(a).toEqual(b);expect(a).toHaveLength(3);
    for(const example of a){expect(example.origin).toBe("example");expect(example).not.toHaveProperty("byId");expect(example).not.toHaveProperty("by");expect(example).not.toHaveProperty("replyToId");}
    expect(new Set(Array.from({length:8},(_,i)=>JSON.stringify(worldSoundExamples(String(i))))).size).toBeGreaterThan(1);
  });
  it("lets a real local contribution replace the example, while private and removed sources do not",()=>{
    const blueprints=worldSoundExamples("room"),coffee=blueprints[0];
    const real={id:"real",soundId:"cafe-music",x:coffee.x,z:coffee.z,at:coffee.at},frozen=JSON.stringify(real);
    expect(activeWorldExamples(blueprints,[real],true).map(s=>s.id)).not.toContain(coffee.id);
    expect(activeWorldExamples(blueprints,[{...real,whileIn:"private"}],true)).toHaveLength(3);
    expect(activeWorldExamples(blueprints,[{...real,removedAt:coffee.at}],true)).toHaveLength(3);
    expect(activeWorldExamples(blueprints,[real],false)).toEqual([]);expect(JSON.stringify(real)).toBe(frozen);
  });
  it("explains a supported actual response and preserves the example's origin",()=>{
    const example=worldSoundExamples("room")[0],home={id:"resident",x:example.x,z:example.z,preference:"lively" as const};
    expect(chooseResidentResponse(home,[example],Date.parse(example.at)+3000)).toMatchObject({sourceId:example.id,origin:"example",profile:{behavior:"chat"}});
    for(const id of ["chorus-chords","chorus-pulse","cafe-music"])expect(chooseResidentResponse(home,[{...example,id:"real",soundId:id,origin:undefined}],Date.parse(example.at)+3000)?.profile.behavior).toBe("sway");
    expect(soundLifeEffect("evening-forest")).toContain("Bird");expect(soundLifeEffect("coastal-gulls")).toContain("Gull");
  });
  it("lets an in-range real ingredient take the resident's attention before a closer example",()=>{
    const example=worldSoundExamples("room")[0],home={id:"resident",x:example.x,z:example.z,preference:"lively" as const};
    const real={id:"real-chords",soundId:"chorus-chords",x:home.x+5,z:home.z,at:example.at};
    const now=Date.parse(example.at)+3000;
    for(const order of [[example,real],[real,example]]){
      expect(chooseResidentResponse(home,order,now)).toMatchObject({sourceId:real.id,profile:{behavior:"sway"}});
      expect(chooseResidentResponse(home,order,now)).not.toHaveProperty("origin");
    }
  });
  it("returns to the example when the real ingredient is removed, private, unready or out of range",()=>{
    const example=worldSoundExamples("room")[0],home={id:"resident",x:example.x,z:example.z,preference:"lively" as const};
    const real={id:"real",soundId:"guitar",x:home.x+4,z:home.z,at:example.at};
    const now=Date.parse(example.at)+3000;
    for(const unavailable of [{...real,removedAt:example.at},{...real,whileIn:"planet-toilet"},{...real,at:new Date(now).toISOString()},{...real,x:home.x+19},{...real,soundId:"not-a-sound"}]){
      expect(chooseResidentResponse(home,[example,unavailable],now)).toMatchObject({sourceId:example.id,origin:"example"});
    }
    expect(chooseResidentResponse(home,[example,real,{...real,removedAt:example.at}],now)).toMatchObject({sourceId:example.id,origin:"example"});
  });
  it("keeps real-source distance, preference and oldest-first ties deterministic for late and reordered snapshots",()=>{
    const example=worldSoundExamples("room")[0],home={id:"resident",x:example.x,z:example.z,preference:"lively" as const};
    const older={id:"a-real",soundId:"guitar",x:home.x+4,z:home.z,at:example.at};
    const tied={...older,id:"z-real"},newer={...older,id:"newer",at:new Date(Date.parse(example.at)+1000).toISOString()};
    const distant={...older,id:"distant",x:home.x+10};
    const now=Date.parse(example.at)+4000;
    for(const order of [[example,distant,newer,tied,older],[older,tied,newer,distant,example],[newer,older,example,tied,distant]]){
      expect(chooseResidentResponse(home,order,now)?.sourceId).toBe(older.id);
      expect(chooseResidentResponse(home,order,now+60_000)?.sourceId).toBe(older.id);
    }
    const closer={...older,id:"closer",soundId:"trickle",x:home.x+.3};
    const farther={...older,x:home.x+7};
    expect(chooseResidentResponse(home,[example,farther,closer],now)?.sourceId).toBe(closer.id);
    const preferred={...older,id:"preferred",soundId:"guitar",x:home.x+1},sameBand={...closer,id:"same-band"};
    expect(chooseResidentResponse(home,[sameBand,example,preferred],now)?.sourceId).toBe(preferred.id);
  });
});
