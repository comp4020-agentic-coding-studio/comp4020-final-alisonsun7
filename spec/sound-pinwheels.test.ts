import {expect,it} from "vitest";
import * as THREE from "three";
import {SoundPinwheels} from "../src/client/sound-pinwheels.js";
import type {PlacedSound} from "../src/shared/protocol.js";
const source=(id:string,extra:Partial<PlacedSound>={}):PlacedSound=>({id,soundId:"gentle-breeze",x:3,z:2,by:"Ada",byId:"ada",at:"2026-11-08T00:00:00Z",...extra});
const ground={heightAt:()=>0,canStand:()=>true};
it("real breeze authors own the prop; ended/private/unknown sources cannot retain or invent one",()=>{
 const wheels=new SoundPinwheels(new THREE.Scene(),ground);
 try{
  const real=source("one"),saved=structuredClone(real);
  wheels.setSources([real,source("private",{whileIn:"planet-toilet"}),source("gone"),source("gone",{removedAt:real.at}),source("music",{soundId:"guitar"}),{...source("demo"),origin:"example"} as PlacedSound]);
  expect(wheels.state).toHaveLength(1);expect(wheels.state[0]).toMatchObject({sourceId:"one",by:"Ada",byId:"ada",sourceX:3,sourceZ:2});
  expect(real).toEqual(saved);expect(wheels.root.children[0].userData).toMatchObject({sourceId:"one",byId:"ada"});
  wheels.setSources([{...real,removedAt:real.at}]);wheels.frame(Date.now());expect(wheels.state).toEqual([]);expect(wheels.root.children).toHaveLength(0);
 }finally{wheels.dispose();}
});
it("late arrivals and reordering share the same bounded rotation; reduced motion stays still",()=>{
 const a=new SoundPinwheels(new THREE.Scene(),ground),b=new SoundPinwheels(new THREE.Scene(),ground);
 try{
  const sources=Array.from({length:9},(_,i)=>source(String(i),{at:new Date(Date.parse(source("").at)+i*1000).toISOString()}));
  a.setSources(sources);b.setSources([...sources].reverse());a.frame(1800000000123);b.frame(1800000000123);
  expect(a.state).toEqual(b.state);expect(a.state.map(s=>s.sourceId)).toEqual(["8","7","6","5","4","3"]);
  const before=a.state;a.frame(1800000000923);expect(a.state[0].angle).not.toBe(before[0].angle);
  a.frame(1800000000923,true);const still=a.state;a.frame(1800000020923,true);expect(a.state).toEqual(still);
 }finally{a.dispose();b.dispose();}
});
it("cannot plant through blocked ground or revive disposed geometry",()=>{
 const scene=new THREE.Scene(),wheels=new SoundPinwheels(scene,{...ground,canStand:()=>false});
 wheels.setSources([source("one")]);expect(wheels.state).toEqual([]);wheels.dispose();wheels.dispose();wheels.setSources([source("new")]);
 expect(scene.children).toHaveLength(0);expect(wheels.state).toEqual([]);
});
