import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AnimalFigure } from "../src/client/characters.ts";
import type { Pose } from "../src/client/figures.ts";

const POSES: Pose[] = ["stand", "walk", "walk-front", "walk-back", "back", "sit", "talk", "lean", "guitar", "strum", "umbrella", "arms-up"];
const box = (object: THREE.Object3D): THREE.Box3 => {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
};
const part = (figure: AnimalFigure, name: string): THREE.Mesh => figure.getObjectByName(name) as THREE.Mesh;
const material = (mesh: THREE.Mesh): THREE.Material => mesh.material as THREE.Material;

describe("the original Quiet Light people", () => {
  it("has grounded three-dimensional adult bodies, a small head, and a finite rig in every pose", () => {
    for (const avatar of ["cat", "dog"] as const) for (const child of [false, true]) {
      const figure = new AnimalFigure({ avatar, seed: "quiet-light", height: 1, child });
      expect(box(figure).max.y).toBeCloseTo(1, 5);
      expect(box(figure).min.y).toBeCloseTo(0, 5);
      const head = box(part(figure, "head-fur")).getSize(new THREE.Vector3());
      expect(head.z).toBeGreaterThan(0.09);
      expect(head.y).toBeLessThan(0.19);
      let triangles = 0;
      let meshes = 0;
      figure.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++;
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
        expect(object.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      });
      expect(meshes).toBeLessThan(35);
      // The selected fidelity rebuild explicitly budgets up to 35K per hero.
      expect(triangles).toBeLessThan(35000);
      for (const pose of POSES) {
        figure.setPose(pose);
        figure.setMotion(0.23, pose.startsWith("walk"));
        figure.updateMatrixWorld(true);
        figure.traverse((object) => expect(object.matrixWorld.elements.every(Number.isFinite), `${avatar}/${pose}/${object.name}`).toBe(true));
        expect(Math.min(box(part(figure, "left-shoe")).min.y, box(part(figure, "right-shoe")).min.y), `${avatar}/${pose} sole`).toBeCloseTo(0, 5);
      }
      figure.dispose();
    }
  });

  it("keeps a shoe planted during a stride and does not accumulate motion at a repeated phase", () => {
    const figure = new AnimalFigure({ avatar: "dog", seed: "walking", height: 1 });
    for (let step = 0; step < 32; step++) {
      figure.setMotion(step / 32, true);
      expect(Math.min(box(part(figure, "left-shoe")).min.y, box(part(figure, "right-shoe")).min.y)).toBeCloseTo(0, 5);
    }
    figure.setMotion(0.21, true);
    figure.updateMatrixWorld(true);
    const before = new Map<string, number[]>();
    figure.traverse((object) => before.set(object.name, [...object.matrixWorld.elements]));
    for (let i = 0; i < 100; i++) figure.setMotion(0.21, true);
    figure.updateMatrixWorld(true);
    figure.traverse((object) => expect(object.matrixWorld.elements).toEqual(before.get(object.name)));
    const shoeAtFirstStep = part(figure, "left-shoe").getWorldPosition(new THREE.Vector3());
    figure.setMotion(0.71, true);
    const shoeAtNextStep = part(figure, "left-shoe").getWorldPosition(new THREE.Vector3());
    expect(shoeAtFirstStep.distanceTo(shoeAtNextStep)).toBeGreaterThan(0.1);
    figure.setFacing(Math.PI / 2);
    figure.setPose("back");
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(figure.quaternion).x).toBeCloseTo(1);
    expect(figure.rotation.y).toBeCloseTo(Math.PI / 2);
    figure.dispose();
  });

  it("lights the outside of clothing rather than showing reversed hollow sleeves and trousers", () => {
    const figure = new AnimalFigure({ avatar: "cat", seed: "linen" });
    for (const name of ["linen-shirt", "continuous-trousers"]) {
      const g = part(figure, name).geometry;
      const positions = g.getAttribute("position");
      const normals = g.getAttribute("normal");
      expect(g.userData.closedGarment, name).toBe(true);
      const indices = g.index!;
      let volume = 0;
      // A closed surface with outward winding has positive signed volume.
      // Unlike radial tube checks, this also covers the armpits and crotch.
      for (let i = 0; i < indices.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 2));
        volume += a.dot(b.cross(c)) / 6;
      }
      expect(volume, name).toBeGreaterThan(0.001);
      for (let i = 0; i < positions.count; i++) {
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)), name).toBeCloseTo(1, 4);
      }
      expect(part(figure, name)).toBeInstanceOf(THREE.SkinnedMesh);
    }
    figure.dispose();
  });

  it("blends shoulder, elbow and knee deformation through one continuous garment and simplifies at distance", () => {
    const figure = new AnimalFigure({ avatar: "dog", seed: "fidelity", height: 1 });
    for (const name of ["linen-shirt", "continuous-trousers"]) {
      const mesh = part(figure, name) as THREE.SkinnedMesh;
      const weights = mesh.geometry.getAttribute("skinWeight");
      const boneIndices = mesh.geometry.getAttribute("skinIndex");
      let blendedVertices = 0;
      for (let i = 0; i < weights.count; i++) {
        const w = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
        expect(w.every((v) => v >= 0 && v <= 1)).toBe(true);
        if (w.filter((v) => v > 0.1).length > 1) blendedVertices++;
        for (const n of [boneIndices.getX(i), boneIndices.getY(i), boneIndices.getZ(i), boneIndices.getW(i)]) expect(n).toBeLessThan(mesh.skeleton.bones.length);
      }
      expect(blendedVertices, name).toBeGreaterThan(100);
      const lod = mesh.parent as THREE.LOD;
      expect(lod).toBeInstanceOf(THREE.LOD);
      const camera = new THREE.PerspectiveCamera(); camera.position.z = 30; camera.updateMatrixWorld();
      lod.update(camera);
      expect(lod.levels[2].object.visible).toBe(true);
      expect(lod.levels[0].object.visible).toBe(false);
      const distant = lod.levels[2].object as THREE.Mesh;
      expect(distant.geometry.index!.count).toBeLessThan(mesh.geometry.index!.count / 4);
    }
    figure.dispose();
  });

  it("keeps a flat, torso-bound garment hem when the arms rise and confines the dog's white shirt to the front", () => {
    for (const avatar of ["cat", "dog"] as const) {
      const figure = new AnimalFigure({ avatar, seed: "finished-hem", height: 1 });
      const mesh = part(figure, "linen-shirt") as THREE.SkinnedMesh;
      const hem = mesh.geometry.userData.hemVertices as number[];
      expect(hem.length).toBeGreaterThan(20);
      const p = mesh.geometry.getAttribute("position"), w = mesh.geometry.getAttribute("skinWeight"), b = mesh.geometry.getAttribute("skinIndex");
      for (const i of hem) {
        expect(p.getY(i)).toBeCloseTo(-0.035, 6);
        expect(w.getX(i)).toBe(1);
        expect(b.getX(i)).toBe(1);
      }
      figure.setPose("arms-up"); figure.updateMatrixWorld(true);
      const heights = hem.map((i) => mesh.getVertexPosition(i, new THREE.Vector3()).y);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.00001);
      if (avatar === "dog") {
        const g = part(figure, "linen-under-shirt").geometry;
        const normal = g.getAttribute("normal"), p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          expect(p.getZ(i)).toBeGreaterThan(0.02);
          expect(normal.getZ(i)).toBeGreaterThan(0.9);
        }
      }
      figure.dispose();
    }
  });

  it("sits over grounded feet and only shows the guitar while playing", () => {
    const figure = new AnimalFigure({ avatar: "cat", seed: "guitar", height: 1 });
    const standingHead = figure.headAnchor.getWorldPosition(new THREE.Vector3()).y;
    figure.setPose("guitar");
    expect(figure.headAnchor.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(standingHead - 0.2);
    expect(figure.getObjectByName("acoustic-guitar")?.visible).toBe(true);
    for (const name of ["left-shoe", "right-shoe"]) expect(box(part(figure, name)).min.y).toBeCloseTo(0, 5);
    const firstHand = part(figure, "right-hand").getWorldPosition(new THREE.Vector3());
    figure.setPose("strum");
    expect(figure.getObjectByName("acoustic-guitar")?.visible).toBe(true);
    expect(part(figure, "right-hand").getWorldPosition(new THREE.Vector3()).distanceTo(firstHand)).toBeGreaterThan(0.015);
    figure.setPose("stand");
    expect(figure.getObjectByName("acoustic-guitar")?.visible).toBe(false);
    expect(figure.headAnchor.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(standingHead);
    figure.dispose();
  });

  it("shares shapes and opaque materials without leaking opacity or disposing another visitor's resources", () => {
    const a = new AnimalFigure({ avatar: "cat", seed: "shared" });
    const b = new AnimalFigure({ avatar: "cat", seed: "shared" });
    const aShirt = part(a, "linen-shirt");
    const bShirt = part(b, "linen-shirt");
    expect(aShirt.geometry).toBe(bShirt.geometry);
    expect(material(aShirt)).toBe(material(bShirt));
    let sharedDisposed = false;
    aShirt.geometry.addEventListener("dispose", () => { sharedDisposed = true; });
    material(bShirt).addEventListener("dispose", () => { sharedDisposed = true; });
    a.setOpacity(0.35);
    expect(material(aShirt)).not.toBe(material(bShirt));
    expect(material(aShirt).opacity).toBe(0.35);
    expect(material(bShirt).opacity).toBe(1);
    a.setPose("guitar");
    expect(material(part(a, "guitar-wood-body")).opacity).toBe(0.35);
    a.dispose();
    expect(sharedDisposed).toBe(false);
    b.setMotion(0.7, true);
    expect(Number.isFinite(box(b).max.y)).toBe(true);
    b.dispose();
  });
});
