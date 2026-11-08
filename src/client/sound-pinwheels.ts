// Small paper instruments answer real breeze contributions. They are props,
// never people or additional sounds, and use the source's original identity.
import * as THREE from "three";
import { planetBasis, planetCoordsValid, planetPoint, planetStep } from "../shared/planet.js";
import type { PlacedSound } from "../shared/protocol.js";
import { authorMark } from "../shared/chorus-signature.js";

interface Ground { heightAt:(x:number,z:number)=>number; canStand:(x:number,z:number)=>boolean }
export interface PinwheelState {sourceId:string;byId:string;by:string;x:number;z:number;sourceX:number;sourceZ:number;angle:number}
interface Wheel {state:PinwheelState;root:THREE.Group;rotor:THREE.Group;phase:number}
const MAX_WHEELS=6;
export class SoundPinwheels {
  readonly root=new THREE.Group();
  private wheels:Wheel[]=[];
  private signature="";
  private disposed=false;
  private geometry=new Set<THREE.BufferGeometry>();
  private materials=new Set<THREE.Material>();
  constructor(parent:THREE.Object3D,private ground:Ground){this.root.name="sound-pinwheels";parent.add(this.root);}
  get state():PinwheelState[]{return this.wheels.map(wheel=>({...wheel.state}));}
  setSources(sources:readonly PlacedSound[]):void{
    if(this.disposed)return;
    const ended=new Set(sources.filter(source=>source.whileIn||source.removedAt).map(source=>source.id));
    const seen=new Set<string>();
    const eligible=sources.filter(source=>source.soundId==="gentle-breeze"&&!ended.has(source.id)&&
      !(source as PlacedSound&{origin?:string}).origin&&!!source.byId&&planetCoordsValid(source.x,source.z)&&Number.isFinite(Date.parse(source.at)))
      .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||a.id.localeCompare(b.id)).filter(source=>{if(seen.has(source.id))return false;seen.add(source.id);return true;}).slice(0,MAX_WHEELS);
    const signature=JSON.stringify(eligible.map(({id,byId,by,x,z,at})=>({id,byId,by,x,z,at})));
    if(signature===this.signature)return;this.signature=signature;this.clear();
    for(const source of eligible){
      // Put a tiny stick beside the source, never through a sculpture or wall.
      const candidates=[0,Math.PI/2,Math.PI,-Math.PI/2].map(yaw=>planetStep({x:source.x,z:source.z,yaw},1,0,1.05));
      const at=candidates.find(p=>this.ground.canStand(p.x,p.z));if(!at)continue;
      const group=new THREE.Group(),rotor=new THREE.Group();group.name="breeze-paper-pinwheel";
      const color=authorMark(source.byId).color;
      const mat=(color:THREE.ColorRepresentation)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.9});this.materials.add(m);return m;};
      const timber=mat(0x8a7656),paper=mat(new THREE.Color(color).lerp(new THREE.Color(0xf7ebce),.4)),cream=mat(0xf4e4ba);
      const mesh=(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D)=>{this.geometry.add(g);const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
      mesh(new THREE.CylinderGeometry(.035,.045,1.35,6),timber,group).position.y=.675;
      const foot=mesh(new THREE.CylinderGeometry(.16,.2,.06,10),cream,group);foot.position.y=.03;
      rotor.position.set(0,1.4,.07);group.add(rotor);
      for(let i=0;i<3;i++){
        const blade=new THREE.Group();blade.rotation.z=i*Math.PI*2/3;rotor.add(blade);
        const leaf=mesh(new THREE.BoxGeometry(.22,.46,.035),paper,blade);leaf.position.set(.08,.25,0);leaf.rotation.z=-.23;leaf.rotation.y=.18;
        const fold=mesh(new THREE.BoxGeometry(.08,.27,.045),cream,blade);fold.position.set(-.015,.12,.025);fold.rotation.z=-.43;
      }
      const hub=mesh(new THREE.SphereGeometry(.075,8,5),cream,rotor);hub.position.z=.04;
      const p=planetPoint(at.x,at.z,this.ground.heightAt(at.x,at.z)),b=planetBasis(at.x,at.z);
      group.position.set(p.x,p.y,p.z);group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(b.east.x,b.east.y,b.east.z),new THREE.Vector3(b.up.x,b.up.y,b.up.z),new THREE.Vector3(b.south.x,b.south.y,b.south.z)));
      group.userData={sourceId:source.id,byId:source.byId,by:source.by};this.root.add(group);
      let hash=2166136261;for(const letter of source.id)hash=Math.imul(hash^letter.charCodeAt(0),16777619);
      this.wheels.push({root:group,rotor,phase:(hash>>>0)/0x100000000*Math.PI*2,state:{sourceId:source.id,byId:source.byId,by:source.by,x:at.x,z:at.z,sourceX:source.x,sourceZ:source.z,angle:0}});
    }
    this.frame(0,true);
  }
  frame(serverNow:number,reducedMotion=false):void{
    if(this.disposed||!Number.isFinite(serverNow))return;
    for(const wheel of this.wheels){
      const angle=reducedMotion?wheel.phase:((serverNow/1000*.92+wheel.phase)%(Math.PI*2));
      wheel.rotor.rotation.z=angle;wheel.state.angle=angle;
    }
  }
  private clear():void{this.root.clear();for(const geometry of this.geometry)geometry.dispose();for(const material of this.materials)material.dispose();this.geometry.clear();this.materials.clear();this.wheels=[];}
  dispose():void{if(this.disposed)return;this.disposed=true;this.clear();this.root.removeFromParent();}
}
