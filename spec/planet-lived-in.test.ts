import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANET_PLACES, PLANET_RADIUS, planetStep } from "../src/shared/planet.ts";

// The optional frozen build provides a real negative comparison without
// replacing source or touching any database. Only sign canvas text is stubbed.
const { buildPlanet } = await import(process.env.PLANET_BUILD_UNDER_TEST ?? "../src/client/planet-build.ts");
describe("a furnished, stable and walkable 3D village", () => {
 let scene: ReturnType<typeof buildPlanet>;
 beforeEach(() => {vi.stubGlobal("document",{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})});scene=buildPlanet();});
 afterEach(()=>{scene.dispose();vi.unstubAllGlobals();});
 it("gives each private room its own recognisable, distinct usable fixtures",()=>{
  for(const name of ["restroom-toilet","restroom-toilet-seat","restroom-cistern","restroom-washbasin","restroom-mirror","shower-tray","shower-head","shower-drain","shower-changing-bench","shower-towel"])
   expect(scene.root.getObjectByName(name),name).toBeTruthy();
  const toilet=scene.root.getObjectByName("restroom-fixtures")!,shower=scene.root.getObjectByName("shower-fixtures")!;
  expect(toilet.getObjectByName("shower-head")).toBeUndefined();expect(shower.getObjectByName("restroom-toilet")).toBeUndefined();
  expect(scene.canStand(13.5,5.55,new Set())).toBe(true);
  expect(scene.canStand(18,5.55,new Set())).toBe(true);
  expect(scene.canStand(13.5,5.55,new Set(["planet-toilet"]))).toBe(false);
  expect(scene.canStand(18,5.55,new Set(["planet-shower"]))).toBe(false);
 });
 it("separates real planter soil from the open rim instead of layering coplanar lids",()=>{
  const soil:THREE.Mesh[]=[],rims:THREE.Mesh[]=[];
  scene.root.traverse((o:THREE.Object3D)=>{if(o.name==="conservatory-planter-soil")soil.push(o as THREE.Mesh);if(o.name==="conservatory-planter-rim")rims.push(o as THREE.Mesh);});
  expect(soil).toHaveLength(2);expect(rims).toHaveLength(8);
  const top=(o:THREE.Mesh)=>{o.geometry.computeBoundingBox();return o.position.y+o.geometry.boundingBox!.max.y;};
  for(const s of soil)for(const rim of rims)expect(top(rim)-top(s)).toBeGreaterThan(.04);
 });
 it("expands the actual cafe walking envelope and terrace at the same historical venue",()=>{
  const cafe=PLANET_PLACES.find(p=>p.kind==="tea")!;
  expect(cafe).toMatchObject({x:-9,z:-7});
  const at=(x:number,z:number)=>planetStep({...cafe,yaw:Math.atan2(x,z)},1,0,PLANET_RADIUS*Math.asin(Math.hypot(x,z)/PLANET_RADIUS));
  const expanded=at(3,0),wall=at(3.6,0),terrace=at(4.5,2.3);
  expect(scene.canStand(expanded.x,expanded.z,new Set())).toBe(true);
  expect(scene.canStand(wall.x,wall.z,new Set())).toBe(false);
  expect(scene.heightAt(terrace.x,terrace.z)).toBeGreaterThan(.5);
  const tables:THREE.Object3D[]=[];scene.root.traverse((o:THREE.Object3D)=>{if(o.name==="cafe-company-table")tables.push(o);});
  expect(tables).toHaveLength(6);expect(scene.root.getObjectByName("cafe-terrace-floor")).toBeTruthy();
 });
});
