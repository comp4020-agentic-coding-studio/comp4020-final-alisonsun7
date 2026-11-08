import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import * as THREE from "three";
import {PlanetAudio} from "../src/client/planet-audio.ts";
import {PlanetBusker,PLANET_BUSKER} from "../src/client/planet-busker.ts";
import {planetPoint} from "../src/shared/planet.ts";
import type {PlacedSound} from "../src/shared/protocol.ts";

const parameter=()=>({value:0,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
class Node {
    gain=parameter();positionX=parameter();positionY=parameter();positionZ=parameter();
    buffer:AudioBuffer|null=null;loop=false;
    connect=vi.fn((next:Node)=>next);disconnect=vi.fn();start=vi.fn();stop=vi.fn();
}
class Page extends EventTarget {hidden=false;}
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const at=Date.parse(PLANET_BUSKER.at)+5000,near={...PLANET_BUSKER},camera=new THREE.PerspectiveCamera();
const guitar:PlacedSound={id:"snd_real",soundId:"guitar",byId:"friend",by:"Ada",at:new Date(at).toISOString(),x:near.x,z:near.z};

describe("Mateo's requested local seaside guitar",()=>{
    let sources:Node[],panners:Node[],page:Page,instances:PlanetAudio[],fetcher:ReturnType<typeof vi.fn>;
    class Context {
        currentTime=0;state="running";destination=new Node();
        listener=Object.fromEntries(["positionX","positionY","positionZ","forwardX","forwardY","forwardZ","upX","upY","upZ"].map(key=>[key,parameter()]));
        resume=vi.fn(async()=>{});close=vi.fn(async()=>{});
        decodeAudioData=vi.fn(async()=>({duration:12}) as AudioBuffer);
        createGain(){return new Node();}
        createPanner(){const node=new Node();panners.push(node);return node;}
        createBufferSource(){const node=new Node();sources.push(node);return node;}
    }
    const make=()=>{const instance=new PlanetAudio(vi.fn(),{busker:true});instances.push(instance);return instance;};
    beforeEach(()=>{sources=[];panners=[];instances=[];page=new Page();fetcher=vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));vi.stubGlobal("document",page);vi.stubGlobal("AudioContext",Context);vi.stubGlobal("fetch",fetcher);});
    afterEach(()=>{instances.forEach(instance=>instance.dispose());vi.unstubAllGlobals();});
    it("keeps the actual seated rig, stool and original guitar, with finite changing strumming poses",()=>{
        const performer=new PlanetBusker(new THREE.Scene());
        try{
            const hand=performer.figure.getObjectByName("right-hand")!;
            performer.frame(at+50);performer.figure.updateMatrixWorld(true);const first=hand.getWorldPosition(new THREE.Vector3());
            performer.frame(at+300);performer.figure.updateMatrixWorld(true);const next=hand.getWorldPosition(new THREE.Vector3());
            expect(first.distanceTo(next)).toBeGreaterThan(.003);
            expect(performer.state).toMatchObject({origin:"npc",guitarVisible:true});expect(performer.state).not.toHaveProperty("byId");
            for(const name of ["left-shoe","right-shoe"]){const box=new THREE.Box3().setFromObject(performer.figure.getObjectByName(name)!);expect(box.min.y).toBeCloseTo(0,5);}
            const seat=new THREE.Box3().setFromObject(performer.seat);expect(seat.min.y).toBeCloseTo(0,5);expect(seat.max.y).toBeGreaterThan(.3);expect(seat.max.y).toBeLessThan(.6);
            performer.frame(at,true);performer.figure.updateMatrixWorld(true);const still=hand.getWorldPosition(new THREE.Vector3());
            performer.frame(at+8000,true);performer.figure.updateMatrixWorld(true);expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(still)).toBeLessThan(1e-8);
        }finally{performer.dispose();}
    });
    it("requires local consent and places one existing recording at the performer's actual spherical position",async()=>{
        const audio=make();audio.frame(near,camera,at);await settle();expect(fetcher).not.toHaveBeenCalled();
        audio.setOn(true);audio.frame(near,camera,at);await settle();
        expect(fetcher).toHaveBeenCalledWith("/assets/sounds/guitar.mp3");expect(sources).toHaveLength(1);expect(audio.buskerPlaying).toBe(true);
        const p=planetPoint(near.x,near.z,PLANET_BUSKER.height);expect(panners[0].positionX.value).toBeCloseTo(p.x);expect(panners[0].positionY.value).toBeCloseTo(p.y);expect(panners[0].positionZ.value).toBeCloseTo(p.z);
        expect(sources[0].loop).toBe(true);expect(sources[0].start).toHaveBeenCalledWith(0,5);
        audio.frame({x:0,z:0,yaw:0},camera,at+100);expect(audio.buskerPlaying).toBe(false);expect(sources[0].stop).toHaveBeenCalledOnce();
    });
    it("yields to an actual friend's public guitar and returns on withdrawal without turning listening on",async()=>{
        const audio=make();audio.setOn(true);audio.frame(near,camera,at);await settle();expect(audio.buskerPlaying).toBe(true);
        audio.setAll([guitar]);audio.frame(near,camera,at+100);await settle();expect(audio.buskerPlaying).toBe(false);expect(sources).toHaveLength(2);expect(sources[0].stop).toHaveBeenCalledOnce();
        audio.remove(guitar.id);audio.frame(near,camera,at+200);await settle();expect(audio.buskerPlaying).toBe(true);expect(sources).toHaveLength(3);
        audio.setOn(false);audio.setAll([{...guitar,id:"snd_another"}]);audio.frame(near,camera,at+300);await settle();expect(audio.on).toBe(false);expect(audio.buskerPlaying).toBe(false);expect(sources).toHaveLength(3);
    });
    it.each(["off","far","hidden","dispose"])("cannot resurrect a pending guitar after %s",async reason=>{
        let resolve!:(value:unknown)=>void;const delayed=new Promise(done=>{resolve=done;});fetcher.mockReturnValueOnce(delayed);
        const audio=make();audio.setOn(true);audio.frame(near,camera,at);await settle();
        if(reason==="off")audio.setOn(false);
        if(reason==="far")audio.frame({x:0,z:0,yaw:0},camera,at+100);
        if(reason==="hidden"){page.hidden=true;page.dispatchEvent(new Event("visibilitychange"));}
        if(reason==="dispose")audio.dispose();
        resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await settle();expect(sources).toHaveLength(0);expect(audio.buskerPlaying).toBe(false);
    });
    it("keeps all eight real in-range sources before the performer within the same voice limit",async()=>{
        const audio=make();audio.setAll(Array.from({length:8},(_,i)=>({...guitar,id:"snd_"+i,soundId:"beach-waves"})));audio.setOn(true);audio.frame(near,camera,at);await settle();
        expect(sources).toHaveLength(8);expect(audio.buskerPlaying).toBe(false);
    });
});
