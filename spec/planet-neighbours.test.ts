import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {buildPlanet} from "../src/client/planet-build.ts";
import {PLANET_RESIDENT_HOMES,CAFE_RESIDENT_HOMES,cafeNeighbourPoint,planetNpcFurnitureClearance} from "../src/client/planet-neighbours.ts";
import {safeResidentLifePath,sampleResidentLife} from "../src/client/resident-life.ts";
import {planetDistance,sceneHutAt} from "../src/shared/planet.ts";

describe("real authored neighbour routes",()=>{
    beforeAll(()=>vi.stubGlobal("document",{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}));
    afterAll(()=>vi.unstubAllGlobals());
    it("rejects actual tables, chairs, counter and menu even where building admission permits standing",()=>{
        const built=buildPlanet(),clear=planetNpcFurnitureClearance(built.root);
        try{
            for(const [x,z] of [[-2.2,.25],[-3.08,.43],[0,-1.9],[-.95,3.45]]){
                const p=cafeNeighbourPoint(x,z);
                expect(clear(p.x,p.z,built.heightAt(p.x,p.z))).toBe(false);
            }
            for(const [x,z] of [[0,1.2],[0,2.4],[-1.1,1.7],[1.1,1.7],[-2,-.85]]){
                const p=cafeNeighbourPoint(x,z);
                expect(clear(p.x,p.z,built.heightAt(p.x,p.z))).toBe(true);
            }
        }finally{built.dispose();}
    });

    it("keeps every complete authored day on actual floors and out of sea, walls, private huts and furniture",()=>{
        const built=buildPlanet(),clear=planetNpcFurnitureClearance(built.root);
        const geometry={surfaceHeight:built.heightAt,canStand:(x:number,z:number)=>built.canStand(x,z,new Set(["planet-toilet","planet-shower"]))&&!sceneHutAt("planet",x,z)&&clear(x,z,built.heightAt(x,z))};
        try{
            expect(PLANET_RESIDENT_HOMES).toHaveLength(12);
            for(const home of PLANET_RESIDENT_HOMES){
                const plan=home.life!;
                for(let i=0;i<plan.waypoints.length;i++)expect(safeResidentLifePath(plan.waypoints[i],plan.waypoints[(i+1)%plan.waypoints.length],geometry),home.id+" leg "+i).toBe(true);
                for(let t=0;t<60_000;t+=125){
                    const p=sampleResidentLife(plan,t)!;
                    expect(geometry.canStand(p.x,p.z),home.id+" at "+t).toBe(true);
                    expect(built.heightAt(p.x,p.z)).toBeGreaterThanOrEqual(0);
                }
            }
        }finally{built.dispose();}
    });

    it("uses two actual, separated café partners with a clear aisle and distinct existing roles",()=>{
        const a=CAFE_RESIDENT_HOMES.find(p=>p.id==="coffee-reader")!,b=CAFE_RESIDENT_HOMES.find(p=>p.id==="coffee-company")!;
        expect(a.life.partnerId).toBe(b.id);expect(b.life.partnerId).toBe(a.id);
        let reachableTalk=false;
        for(let time=0;time<48_000;time+=100){
            const x=sampleResidentLife(a.life,time)!,y=sampleResidentLife(b.life,time)!;
            if(x.action==="talk"&&!x.walking&&!y.walking){
                expect(planetDistance(x,y)).toBeGreaterThan(1.5);
                expect(planetDistance(x,y)).toBeLessThan(3);
                reachableTalk=true;
            }
        }
        expect(reachableTalk).toBe(true);
    });
});
