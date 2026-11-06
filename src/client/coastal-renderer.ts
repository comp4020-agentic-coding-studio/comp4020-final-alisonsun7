// Contact shade belongs to the real geometry: it follows people and furniture
// as the visitor walks, rather than painting a dark vignette over the view.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

// r170's normal override does not sample a mesh's alpha cutout. Hide only
// foliage during this auxiliary pass, then restore its previous visibility;
// the beauty pass and alpha-tested sun shadows still draw every needle.
class ContactPass extends SSAOPass {
  override renderOverride(renderer: THREE.WebGLRenderer, material: THREE.Material,
    target: THREE.WebGLRenderTarget, clearColor?: THREE.ColorRepresentation, clearAlpha?: number): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse(object => {
      if (object.visible && object.userData.skipContactAO === true) {
        hidden.push(object); object.visible = false;
      }
    });
    // The beauty pass has already drawn alpha-tested sun shadows. Do not
    // overwrite that map with the auxiliary normal pass's hidden foliage.
    const autoShadows = renderer.shadowMap.autoUpdate;
    const updateShadows = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    try { super.renderOverride(renderer, material, target, clearColor, clearAlpha); }
    finally {
      renderer.shadowMap.autoUpdate = autoShadows;
      renderer.shadowMap.needsUpdate = updateShadows;
      for (const object of hidden) object.visible = true;
    }
  }
}

export class CoastalRenderer {
  private composer?: EffectComposer;
  private contacts?: SSAOPass;
  private edges?: SMAAPass;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    // WebGL2 alone does not guarantee renderable floating-point targets.
    // Retain the ordinary ACES-lit renderer on those devices.
    if (!renderer.extensions.has("EXT_color_buffer_float") && !renderer.extensions.has("EXT_color_buffer_half_float")) return;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.contacts = new ContactPass(scene, camera, 1, 1, 12);
    this.contacts.kernelRadius = 0.38;
    this.contacts.minDistance = 0.00008;
    this.contacts.maxDistance = 0.009;
    this.composer.addPass(this.contacts);
    // OutputPass applies the renderer's exposure, ACES and sRGB conversion
    // once, after the linear-light contact shading.
    this.composer.addPass(new OutputPass());
    this.edges = new SMAAPass(1, 1);
    this.composer.addPass(this.edges);
  }

  resize(width: number, height: number): void {
    if (!this.composer) return;
    const ratio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    // The broad contact shadows need fewer pixels than the final picture.
    this.contacts!.setSize(Math.max(1, Math.round(width * ratio * 0.6)), Math.max(1, Math.round(height * ratio * 0.6)));
  }

  setQuality(full: boolean): void {
    if (this.contacts) this.contacts.enabled = full;
    if (this.edges) this.edges.enabled = full;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
