// Mateo is an explicitly authored seaside performer, never a contribution or
// joined friend. His guitar and figure share one fixed place on the old globe.
import * as THREE from "three";
import { AnimalFigure } from "./characters.js";
import { coastlineAt } from "./planet-coast.js";
import type { Position } from "../shared/protocol.js";

export const PLANET_BUSKER = Object.freeze({
    id: "@npc:mateo", name: "Mateo", label: "Mateo · guitarist · NPC",
    soundId: "guitar", x: 9.5, z: coastlineAt(9.5) - 2.5, yaw: 1.9,
    hear: 12, height: .8, at: "2026-01-01T00:00:00.000Z",
});

export class PlanetBusker {
    readonly figure = new AnimalFigure({avatar:"dog",seed:"mateo-coastal-guitar",role:"npc",pose:"guitar"});
    readonly seat = new THREE.Group();
    readonly at: Position = {x:PLANET_BUSKER.x,z:PLANET_BUSKER.z,yaw:PLANET_BUSKER.yaw};
    private geometry = new THREE.CylinderGeometry(.3,.34,1,12);
    private material = new THREE.MeshStandardMaterial({color:0xa98c68,roughness:.95});
    private disposed = false;
    constructor(parent:THREE.Object3D) {
        this.figure.name="mateo-seaside-guitarist";this.figure.userData.localPerformer=true;
        this.figure.setPose("guitar");this.figure.setMotion(0,false);
        this.seat.name="mateo-grounded-stool";
        this.figure.updateMatrixWorld(true);
        // The seated rig keeps its soles at zero. Build the little stool up to
        // its actual hip, instead of floating the sitter above a guessed bench.
        const hip=this.figure.getObjectByName("hip-rig")!.getWorldPosition(new THREE.Vector3());
        const normalised=this.figure.getObjectByName("normalised-person")!;
        const height=hip.y-.045*this.figure.scale.y*normalised.scale.y;
        const body=new THREE.Mesh(this.geometry,this.material);
        body.name="mateo-stool-body";body.scale.y=height;body.position.y=height/2;
        body.castShadow=true;body.receiveShadow=true;this.seat.add(body);
        parent.add(this.figure,this.seat);
    }
    frame(serverNow:number,reducedMotion=false):void {
        if(this.disposed||!Number.isFinite(serverNow))return;
        const phase=reducedMotion?0:((serverNow-Date.parse(PLANET_BUSKER.at))/520)%1;
        this.figure.setPose(!reducedMotion&&phase>.5?"strum":"guitar");
        this.figure.setMotion(phase,false);
    }
    get state() {return {id:PLANET_BUSKER.id,label:PLANET_BUSKER.label,origin:"npc",...this.at,soundId:PLANET_BUSKER.soundId,
        pose:this.figure.pose,guitarVisible:!!this.figure.getObjectByName("acoustic-guitar")?.visible};}
    dispose():void {if(this.disposed)return;this.disposed=true;this.figure.dispose();this.seat.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
