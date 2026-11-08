import * as THREE from "three";
import {afterEach,expect,it,vi} from "vitest";
import {AnimalFigure} from "../src/client/characters.ts";
import {NpcConversationCues} from "../src/client/npc-conversation-cues.ts";

afterEach(()=>vi.unstubAllGlobals());
it("anchors the actual speaking cue just above the animated head at a fixed readable world size",()=>{
    vi.stubGlobal("document",{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})});
    const cues=new NpcConversationCues();
    try{for(const height of [1,1.65,2]){
        const figure=new AnimalFigure({avatar:"cat",seed:"turn",height});
        figure.rotation.set(.2,.6,-.25);figure.position.set(2,4,-3);cues.add(figure);
        figure.userData.residentLife={role:"speaking",walking:false};
        figure.setConversation("speaking",.3);cues.update(figure,1000,false);
        const cue=figure.getObjectByName("npc-conversation-turn")!;
        expect(cue.visible).toBe(true);
        const gap=cue.getWorldPosition(new THREE.Vector3()).distanceTo(figure.headAnchor.getWorldPosition(new THREE.Vector3()));
        expect(gap).toBeGreaterThan(.1);expect(gap).toBeLessThan(.4);
        const size=cue.getWorldScale(new THREE.Vector3());expect(size.x).toBeCloseTo(.62);expect(size.y).toBeCloseTo(.31);
        figure.dispose();
    }}finally{cues.dispose();}
});
