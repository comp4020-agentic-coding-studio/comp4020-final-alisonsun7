// Contact shade belongs to the real geometry: it follows people and furniture
// as the visitor walks, rather than painting a dark vignette over the view.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class CoastalRenderer {
  private composer: EffectComposer;
  private contacts: SSAOPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.contacts = new SSAOPass(scene, camera, 1, 1, 12);
    this.contacts.kernelRadius = 0.38;
    this.contacts.minDistance = 0.00008;
    this.contacts.maxDistance = 0.009;
    this.composer.addPass(this.contacts);
    // OutputPass applies the renderer's exposure, ACES and sRGB conversion
    // once, after the linear-light contact shading.
    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number): void {
    const ratio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    // The broad contact shadows need fewer pixels than the final picture.
    this.contacts.setSize(Math.max(1, Math.round(width * ratio * 0.6)), Math.max(1, Math.round(height * ratio * 0.6)));
  }

  setQuality(full: boolean): void {
    this.contacts.enabled = full;
  }

  render(): void {
    this.composer.render();
  }
}
