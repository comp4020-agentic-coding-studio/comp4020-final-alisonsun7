// Authored small days for the existing NPCs. These never become players,
// contributions or chat messages; the same server clock drives every visit.
import * as THREE from "three";
import { PLANET_PLACES, PLANET_RADIUS, planetPoint, planetStep } from "../shared/planet.js";
import type { ResidentDefinition } from "./sound-residents.js";
import type { ResidentLifePlan } from "./resident-life.js";

const cafe = PLANET_PLACES.find(place => place.kind === "tea")!;
export function cafeNeighbourPoint(x: number, z: number): {x:number;z:number} {
    return planetStep({x:cafe.x,z:cafe.z,yaw:Math.atan2(x,z)},1,0,PLANET_RADIUS*Math.asin(Math.hypot(x,z)/PLANET_RADIUS));
}
const cafePlan = (group:string, points: readonly (readonly [number,number])[], action:"work"|"talk"|"rest", partnerId?:string, talkStops:readonly number[]=[1,2]): ResidentLifePlan => ({
    group, periodSeconds:48, pauseFraction:.6, partnerId,
    waypoints:points.map(([x,z],index)=>({...cafeNeighbourPoint(x,z),action:action==="talk"&&!talkStops.includes(index)?"rest":action})),
});

export const CAFE_RESIDENT_HOMES = [
    {id:"coffee-barista",local:[-2,-.85],avatar:"cat",preference:"lively",facing:0,label:"Bean · barista · NPC",
        life:cafePlan("coffee-work",[[-2,-.85],[-.5,-.85]],"work")},
    {id:"coffee-server",local:[0,1.2],avatar:"dog",preference:"lively",facing:-.8,label:"Jun · café staff · NPC",
        life:cafePlan("coffee-rounds",[[0,1.2],[0,2.4],[.5,3.8]],"work")},
    {id:"coffee-reader",local:[-2.2,1.25],avatar:"dog",preference:"cozy",facing:.85,label:"Coco · café regular · NPC",
        life:cafePlan("coffee-company",[[-2.2,1.25],[-.15,2.2],[-.15,4.2],[-.78,4.2],[-.15,4.2],[-.15,2.2]],"talk","coffee-company",[3])},
    {id:"coffee-company",local:[2.2,1.25],avatar:"cat",preference:"lively",facing:-.85,label:"Maple · café regular · NPC",
        life:cafePlan("coffee-company",[[2.2,1.25],[.7,2.2],[.7,4.2],[.78,4.2],[.7,4.2],[.7,2.2]],"talk","coffee-reader",[3])},
    {id:"coffee-visitor",local:[-4.5,2.3],avatar:"cat",preference:"cozy",facing:.9,label:"Wren · café regular · NPC",
        life:cafePlan("coffee-porch-west",[[-4.5,2.3],[-4.5,3.1],[-4.5,4.15]],"rest")},
    {id:"coffee-listener",local:[4.5,2.3],avatar:"dog",preference:"lively",facing:-.9,label:"Sol · café regular · NPC",
        life:cafePlan("coffee-porch-east",[[4.5,2.3],[4.5,3.1],[4.5,4.15]],"rest")},
].map(home=>({...home,...cafeNeighbourPoint(home.local[0],home.local[1]),avatar:home.avatar as "cat"|"dog",preference:home.preference as "cozy"|"lively"}));

const stroll = (group:string, points:readonly (readonly [number,number])[], periodSeconds=48):ResidentLifePlan => ({
    group,periodSeconds,pauseFraction:.58,waypoints:points.map(([x,z])=>({x,z,action:"rest"})),
});
export const PLANET_RESIDENT_HOMES: readonly (ResidentDefinition & {avatar:"cat"|"dog"})[] = [
    {id:"green-neighbour",x:-3,z:1,avatar:"cat",preference:"cozy",label:"Fern · green neighbour · NPC",facing:.8,
        life:stroll("green-walk",[[-3,1],[-2.5,1.7],[-1.7,2.5]])},
    {id:"jam-neighbour",x:9,z:-6.8,avatar:"dog",preference:"lively",label:"Pip · stage neighbour · NPC",facing:Math.PI,
        life:stroll("stage-walk",[[9,-6.8],[10,-6.8],[11,-6.8]],42)},
    {id:"reading-neighbour",x:-12,z:8.5,avatar:"cat",preference:"cozy",label:"Sage · reader · NPC",facing:Math.PI,
        life:stroll("reading-walk",[[-12,8.5],[-12,9.0],[-13.4,9.0]],54)},
    {id:"garden-neighbour",x:-.5,z:14.5,avatar:"dog",preference:"wild",label:"Moss · gardener · NPC",facing:0,
        life:stroll("garden-walk",[[-.5,14.5],[-.1,13.5],[.6,13.8]],46)},
    {id:"tea-neighbour",...cafeNeighbourPoint(1,-.85),avatar:"dog",preference:"lively",label:"Café neighbour · NPC",facing:0,
        life:cafePlan("coffee-window",[[1,-.85],[2.5,-.85]],"rest")},
    {id:"lantern-neighbour",x:-20,z:-14,avatar:"cat",preference:"lively",label:"Lumi · lantern keeper · NPC",facing:Math.PI,
        life:stroll("lantern-walk",[[-20,-14],[-20,-13.1],[-21,-13.05]],52)},
    ...CAFE_RESIDENT_HOMES,
];

/** Conservative NPC body clearance from the actual authored furniture. The
 * user's walking rules and source coordinates are deliberately unchanged. */
export function planetNpcFurnitureClearance(root:THREE.Object3D): (x:number,z:number,height:number)=>boolean {
    root.updateMatrixWorld(true);
    const names=new Set(["cafe-table-top","cafe-chair","cafe-coffee-counter","cafe-menu-board","green-bench","green-fountain"]);
    const obstacles:{inverse:THREE.Matrix4;box:THREE.Box3;scale:number}[]=[];
    root.traverse(object=>{
        if(!names.has(object.name))return;
        const inverse=object.matrixWorld.clone().invert(),box=new THREE.Box3();
        object.traverse(child=>{
            if(!(child instanceof THREE.Mesh))return;
            child.geometry.computeBoundingBox();const bounds=child.geometry.boundingBox;if(!bounds)return;
            const transform=inverse.clone().multiply(child.matrixWorld);
            for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])box.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(transform));
        });
        if(!box.isEmpty())obstacles.push({inverse,box,scale:Math.min(...object.getWorldScale(new THREE.Vector3()).toArray())});
    });
    const point=new THREE.Vector3();
    return (x,z,height)=>{
        const world=planetPoint(x,z,height);
        for(const obstacle of obstacles){
            point.set(world.x,world.y,world.z).applyMatrix4(obstacle.inverse);
            // Reject back-of-globe projection aliases before local footprints.
            if(point.y < -3 || point.y > 3)continue;
            const radius=.25/Math.max(.01,obstacle.scale),b=obstacle.box;
            if(point.x>b.min.x-radius&&point.x<b.max.x+radius&&point.z>b.min.z-radius&&point.z<b.max.z+radius)return false;
        }
        return true;
    };
}
