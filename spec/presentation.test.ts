import { describe, expect, it } from "vitest";
import { presentation, presentationHref } from "../src/shared/presentation.ts";
import { enterPresentation, leavePresentation } from "../src/client/presentation-handoff.ts";
const storage = () => {const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};
describe("local presentation handoff",()=>{
 it("accepts only known lenses and keeps the existing 3D route as default",()=>{
  expect(presentation("2.5d")).toBe("2.5d");expect(presentation("2d")).toBe("2d");expect(presentation("other-room")).toBe("3d");expect(presentationHref("3d")).toBe("/planet");
 });
 it("consumes one short identity-bound handoff without storing jump or running state",()=>{
  const cache=storage();leavePresentation(cache,"2.5d",{x:4,z:3,yaw:1,motion:{running:true,jump:.7}},"alice",1000);
  expect(enterPresentation(cache,"2.5d","alice",2000)).toEqual({x:4,z:3,yaw:1});expect(enterPresentation(cache,"2.5d","alice",2001)).toBeNull();
 });
 it.each(["different identity","different target","expired","clock reversed","invalid coordinates"])("rejects a %s handoff",reason=>{
  const cache=storage();leavePresentation(cache,"2d",{x:reason==="invalid coordinates"?999:4,z:3,yaw:0},"alice",1000);
  expect(enterPresentation(cache,reason==="different target"?"3d":"2d",reason==="different identity"?"bob":"alice",reason==="expired"?17000:reason==="clock reversed"?999:2000)).toBeNull();
  expect(enterPresentation(cache,"2d","alice",2000)).toBeNull();
 });
});
