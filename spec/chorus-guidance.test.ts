import { describe, expect, it } from "vitest";
import { deriveChorusWorks } from "../src/shared/chorus.ts";
import { choiceConsequence, nextSource, workNextStep, workResult } from "../src/shared/chorus-guidance.ts";
import type { SoundReference } from "../src/shared/protocol.ts";

const source=(id:string,patch:Partial<SoundReference>={}):SoundReference=>({id,by:"Ada",byId:"ada",soundId:"trickle",x:0,z:0,at:"2026-11-08T00:00:00Z",...patch});
describe("source-bound creation guidance",()=>{
  it("predicts the actual current work rather than the isolated parent pair",()=>{
    const root=source("root"), bird=source("bird",{by:"Bo",byId:"bo",soundId:"evening-forest",replyToId:root.id});
    const work=deriveChorusWorks([root,bird])[0];
    expect(choiceConsequence("chorus-pulse",root,work,"cy")).toContain("Watersong canopy");
    expect(choiceConsequence("chorus-pulse",root,undefined,"cy")).toContain("Firefly lantern");
  });
  it("never promotes own layers or an unidentified visitor into a friend",()=>{
    const root=source("root"), work=deriveChorusWorks([root])[0];
    expect(choiceConsequence("evening-forest",root,work,"ada")).toContain("another layer of your own");
    expect(choiceConsequence("evening-forest",root,work)).toContain("Join with your own name");
    expect(workNextStep(work,"ada")).toContain("Invite a friend");
    expect(workNextStep(work,"bo")).toContain("Ada");
  });
  it("offers an actual foreign source, and an own source for solo experimentation",()=>{
    const root=source("root"), own=source("own",{replyToId:root.id,soundId:"chorus-chords",at:"2026-11-08T00:01:00Z"});
    const solo=deriveChorusWorks([root,own])[0];
    expect(nextSource(solo,"ada")?.id).toBe("own");
    expect(nextSource(solo,"bo")?.id).toBe("own");
    expect(nextSource(undefined,"bo")).toBeUndefined();
  });
  it("uses a live cross-author cause even after a later self-layer, and stops claiming it after withdrawal",()=>{
    const root=source("root"), reply=source("reply",{by:"Bo",byId:"bo",replyToId:root.id,soundId:"evening-forest"}), layer=source("layer",{by:"Bo",byId:"bo",replyToId:reply.id,soundId:"chorus-bells"});
    expect(workResult(deriveChorusWorks([root,reply,layer])[0])).toContain("Bo answered Ada");
    const withdrawn={...root,removedAt:"2026-11-08T00:02:00Z"};
    const work=deriveChorusWorks([withdrawn,reply,layer])[0];
    expect(workResult(work)).not.toContain("Bo answered Ada");
    expect(workResult(work)).toContain("Only live sounds");
    expect(choiceConsequence("trickle",withdrawn,work,"cy")).toContain("withdrawn");
    expect(workResult(deriveChorusWorks([{...root,removedAt:"2026-11-08T00:02:00Z"}])[0])).toContain("resting");
  });
});
