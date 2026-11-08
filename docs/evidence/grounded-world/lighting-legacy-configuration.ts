// Configuration mutation, not a frozen old application or a browser run.
import * as THREE from "three";
import { PlanetLighting as Candidate, planetGlobalLightDirection } from "./candidate-frozen.ts";
export { planetGlobalLightDirection };
export class PlanetLighting extends Candidate {
  override get state() {
    const state=super.state,camera=this.sun.shadow.camera;
    return {...state,span:camera.right-camera.left,texelMetres:(camera.right-camera.left)/this.sun.shadow.mapSize.x};
  }
  override update(input: Parameters<Candidate["update"]>[0]): void {
    super.update(input);
    const minute=((input.minute%1440)+1440)%1440;
    const day=Math.max(0,Math.sin((minute-360)/1440*Math.PI*2));
    this.sun.position.set(Math.cos(minute/1440*Math.PI*2)*45,45,20+day*45);
    this.target.position.set(0,0,0);
    this.hemi.position.set(0,1,0);
    const camera=this.sun.shadow.camera;
    camera.left=camera.bottom=-35;camera.right=camera.top=35;camera.near=1;camera.far=150;
    this.sun.shadow.bias=-.0006;this.sun.shadow.normalBias=.035;
    camera.updateProjectionMatrix();this.sun.updateMatrixWorld();this.target.updateMatrixWorld();this.hemi.updateMatrixWorld();this.sun.shadow.updateMatrices(this.sun);
  }
}
