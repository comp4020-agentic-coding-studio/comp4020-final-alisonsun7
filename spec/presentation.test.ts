import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { PRESENTATIONS, presentation, presentationHref, presentationLabel, retiredPresentationHref } from "../src/shared/presentation.ts";
import { renderPlanet } from "../src/html.ts";
import { createDefaultEnvironment } from "../src/shared/environment.ts";
import type { Snapshot } from "../src/shared/protocol.ts";

describe("one retained 3D presentation",()=>{
  it("offers only the author's retained 3D world",()=>{
    expect(PRESENTATIONS).toEqual(["3d"]);
    for(const old of ["2d","2.5d","flat","unrecognised",null,undefined])expect(presentation(old)).toBe("3d");
    expect(presentationHref("3d")).toBe("/planet");expect(presentationLabel("3d")).toBe("3D Little planet");
  });

  it.each(["/2d","/2.5d","/planet/flat","/planet/2d","/planet/2.5d"])("takes retired %s links to 3D while preserving public work/place context",path=>{
    expect(retiredPresentationHref(new URL(path+"?view=2d&zone=tea&work=snd_old", "https://local.invalid"))).toBe("/planet?zone=tea&work=snd_old");
    expect(retiredPresentationHref(new URL(path,"https://local.invalid"))).toBe("/planet");
  });

  it("canonicalises old view queries without changing coast links or accepting an external redirect target",()=>{
    for(const view of ["2d","2.5d","3d","unknown"])expect(retiredPresentationHref(new URL("/planet?view="+view+"&zone=pool","https://local.invalid"))).toBe("/planet?zone=pool");
    expect(retiredPresentationHref(new URL("/scene/planet?mode=weekday&view=2d&work=snd_old","https://local.invalid"))).toBe("/planet?mode=weekday&work=snd_old");
    expect(retiredPresentationHref(new URL("/planet","https://local.invalid"))).toBeNull();
    expect(retiredPresentationHref(new URL("/scene/seaside?view=2d","https://local.invalid"))).toBeNull();
    expect(retiredPresentationHref(new URL("//other.invalid/2d","https://local.invalid"))).toBe("/planet");
  });

  it("keeps Share, listening, camera and movement controls while removing both lens navigations",()=>{
    const snapshot:Snapshot={type:"snapshot",sessionId:"ses_retained",sceneId:"planet",serverNow:"2026-11-08T00:00:00Z",you:null,online:[],sounds:[],environment:createDefaultEnvironment("2026-11-08T00:00:00Z")};
    const dom=new JSDOM(renderPlanet(snapshot,false));
    try{
      const doc=dom.window.document,boot=JSON.parse(doc.getElementById("planet-boot")!.textContent!);
      expect(doc.querySelectorAll("#planet-presentations,#planet-presentations-settings,.planet-presentations")).toHaveLength(0);
      expect(doc.body.textContent).not.toMatch(/2D Storybook|2\.5D Paper theatre|Choose world style/);
      expect(doc.getElementById("planet-stage")!.dataset.presentation).toBe("3d");expect(boot.view).toBe("3d");
      for(const id of ["planet-place","planet-listening-settings","planet-sound","planet-view","planet-run","planet-jump","planet-chat"])expect(doc.getElementById(id),id).not.toBeNull();
      expect(doc.querySelector<HTMLInputElement>('input[name="next"]')!.value).toBe("/planet");
    }finally{dom.window.close();}
  });
});
