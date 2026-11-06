// Original, low-poly animal people for Quiet Light. No external character
// models or textures: broad linen shapes, small animal heads and real depth.
import * as THREE from "three";
import type { Avatar } from "../shared/protocol.js";
import type { Pose } from "./figures.js";

export interface AnimalFigureOptions {
  avatar: Avatar;
  seed: string;
  /** Standing height in metres, including the ears. The origin is the soles. */
  height?: number;
  pose?: Pose;
  child?: boolean;
}

const TAU = Math.PI * 2;
const DOWN = new THREE.Vector3(0, -1, 0);
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();

function geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    g.name = `Quiet Light / ${key}`;
    geometries.set(key, g);
  }
  return g;
}

function material(colour: number, name: string, roughness = 0.92, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${colour}:${roughness}:${side}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, side });
    m.name = `Quiet Light / ${name}`;
    materials.set(key, m);
  }
  return m;
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Each row is an outfit, so seeded variety never becomes random colour noise.
const OUTFITS = [
  { shirt: 0xc8c1a6, trousers: 0x646b53, collar: 0xe4dcc6 },
  { shirt: 0x76816b, trousers: 0xaba28b, collar: 0xdcd6c4 },
  { shirt: 0xa59c86, trousers: 0x525d61, collar: 0xe2d8c1 },
  { shirt: 0x88979a, trousers: 0x686852, collar: 0xe6dec9 },
  { shirt: 0x9e7961, trousers: 0x5d6658, collar: 0xdfd5bc },
  { shirt: 0xcfc8b2, trousers: 0x756955, collar: 0xa7aa91 },
];
const FURS = [
  { coat: 0xd7c9ad, muzzle: 0xeadfc8, ear: 0xb29a85 },
  { coat: 0xb79774, muzzle: 0xddd0b7, ear: 0x98775e },
  { coat: 0x96938a, muzzle: 0xd0cabe, ear: 0x78776e },
  { coat: 0xeee1c8, muzzle: 0xf1e9d6, ear: 0xcbb29d },
  { coat: 0x8a7764, muzzle: 0xc2b29a, ear: 0x756352 },
  { coat: 0xc1ae90, muzzle: 0xe2d7bf, ear: 0xa4917b },
];

const ellipsoid = geometry("soft ellipsoid", () => new THREE.SphereGeometry(1, 12, 8));

function tapered(key: string, top: number, bottom: number, length: number, segments = 10): THREE.BufferGeometry {
  return geometry(key, () => new THREE.CylinderGeometry(top, bottom, length, segments).translate(0, -length / 2, 0));
}

function clothShape(key: string, profile: number[][], depth = 1): THREE.BufferGeometry {
  return geometry(key, () => {
    const ordered = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
    const g = new THREE.LatheGeometry(ordered.map(([r, y]) => new THREE.Vector2(r, y)), 16).scale(1, 1, depth);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i) / depth, p.getX(i));
      const fold = 1 + 0.016 * Math.sin(a * 5 + p.getY(i) * 22) + 0.009 * Math.sin(a * 9 - p.getY(i) * 34);
      p.setXYZ(i, p.getX(i) * fold, p.getY(i), p.getZ(i) * fold);
    }
    g.computeVertexNormals();
    return g;
  });
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const source of parts) {
    const part = source.index ? source.toNonIndexed() : source;
    positions.push(...Array.from(part.getAttribute("position").array));
    normals.push(...Array.from(part.getAttribute("normal").array));
    if (part !== source) part.dispose();
    source.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

function catEar(inner: boolean): THREE.BufferGeometry {
  return geometry(inner ? "cat inner ear" : "cat ear", () => {
    const s = new THREE.Shape();
    if (inner) {
      s.moveTo(-0.012, 0.012);
      s.quadraticCurveTo(-0.003, 0.032, 0.006, 0.046);
      s.quadraticCurveTo(0.014, 0.028, 0.015, 0.011);
    } else {
      s.moveTo(-0.022, 0);
      s.quadraticCurveTo(-0.01, 0.038, 0.007, 0.06);
      s.quadraticCurveTo(0.025, 0.033, 0.024, 0);
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: inner ? 0.001 : 0.018, bevelEnabled: false, curveSegments: 3 });
  });
}

function torsoGeometry(): THREE.BufferGeometry {
  return clothShape("linen overshirt", [[0.092, -0.027], [0.096, -0.021], [0.094, 0.018], [0.092, 0.08], [0.105, 0.17], [0.113, 0.213], [0.109, 0.232], [0.091, 0.257], [0.049, 0.276], [0.046, 0.28]], 0.68);
}

function shirtDetails(): THREE.BufferGeometry {
  return geometry("collar and shirt placket", () => {
    const pieces: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const collar = new THREE.BoxGeometry(0.033, 0.047, 0.008);
      collar.rotateZ(side * -0.43).translate(side * 0.026, 0.252, 0.046);
      pieces.push(collar);
    }
    pieces.push(new THREE.BoxGeometry(0.008, 0.185, 0.004).translate(0, 0.136, 0.069));
    // A quiet breast-pocket opening reads as clothing at conversational range.
    pieces.push(new THREE.BoxGeometry(0.04, 0.006, 0.003).translate(-0.047, 0.171, 0.065));
    for (const y of [0.066, 0.12, 0.174, 0.224]) pieces.push(new THREE.SphereGeometry(0.003, 6, 4).scale(1, 1, 0.45).translate(0, y, 0.073));
    return merge(pieces);
  });
}

function shoeGeometry(): THREE.BufferGeometry {
  return geometry("rounded walking shoe", () => {
    const g = new THREE.SphereGeometry(1, 12, 6).scale(0.035, 0.03, 0.067).translate(0, -0.015, 0.025);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.044, p.getY(i)));
    g.computeVertexNormals();
    return g;
  });
}

interface Arm {
  upper: THREE.Group;
  fore: THREE.Group;
  side: number;
}

interface Leg {
  thigh: THREE.Group;
  shin: THREE.Group;
  foot: THREE.Group;
}

/**
 * A lit, fully three-dimensional person, facing +Z. Standing geometry is
 * normalised to one unit; the public scale is uniformly set to `height`.
 * `headAnchor` follows sitting, leaning and gait for world-space labels.
 */
export class AnimalFigure extends THREE.Group {
  readonly height: number;
  readonly headAnchor = new THREE.Object3D();
  pose: Pose;
  private readonly rig = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly upperBody = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly arms: [Arm, Arm];
  private readonly legs: [Leg, Leg];
  private readonly thighLength: number;
  private readonly shinLength: number;
  private readonly hipHeight: number;
  private readonly phaseOffset: number;
  private guitar: THREE.Group | null = null;
  private umbrella: THREE.Group | null = null;
  private lastPhase = 0;
  private lastWalking = false;
  private ownsMaterials = false;
  private opacity = 1;
  private readonly materialCopies = new Map<THREE.Material, THREE.Material>();

  constructor(options: AnimalFigureOptions) {
    super();
    const { avatar, seed, child = false } = options;
    const h = hash(seed);
    const outfit = OUTFITS[(h >>> 3) % OUTFITS.length];
    const fur = FURS[h % FURS.length];
    const furMat = material(fur.coat, "soft fur");
    const muzzleMat = material(fur.muzzle, "warm muzzle");
    const earMat = material(fur.ear, "ear interior");
    const cloth = material(outfit.shirt, "linen shirt");
    const trousers = material(outfit.trousers, "cotton trousers");
    const collar = material(outfit.collar, "open linen collar");
    const shoes = material(0x504c43, "worn leather shoes", 0.86);
    this.name = `${avatar}-person-${seed}`;
    this.userData.figure = { avatar, seed, child, source: "original procedural geometry" };
    this.pose = options.pose ?? "stand";
    this.height = options.height ?? (child ? 1.15 : 1.75);
    this.thighLength = child ? 0.224 : 0.234;
    this.shinLength = child ? 0.232 : 0.242;
    this.hipHeight = this.thighLength + this.shinLength + 0.044;
    this.phaseOffset = ((h >>> 16) % 997) / 997 * TAU;
    this.scale.setScalar(this.height);
    this.rig.name = "normalised-person";
    this.hips.name = "hip-rig";
    this.upperBody.name = "upper-body-rig";
    this.add(this.rig);
    this.rig.add(this.hips);
    this.hips.add(this.upperBody);

    this.part(this.upperBody, "linen-shirt", torsoGeometry(), cloth);
    this.part(this.upperBody, "shirt-collar-and-placket", shirtDetails(), collar, false);
    this.part(this.hips, "trouser-seat", ellipsoid, trousers).scale.set(0.085, 0.062, 0.059);
    const neck = this.part(this.upperBody, "neck", tapered("neck", 0.024, 0.026, 0.054), furMat);
    neck.position.y = 0.322;
    this.head.name = "head-rig";
    this.head.position.set(0, child ? 0.362 : 0.375, 0);
    this.head.scale.setScalar(child ? 1.1 : 1);
    this.upperBody.add(this.head);
    const skull = this.part(this.head, "head-fur", ellipsoid, furMat);
    skull.scale.set(avatar === "cat" ? 0.061 : 0.064, 0.074, 0.054);
    const muzzle = this.part(this.head, `${avatar}-muzzle`, ellipsoid, muzzleMat);
    muzzle.position.set(0, -0.022, avatar === "dog" ? 0.058 : 0.045);
    muzzle.scale.set(avatar === "dog" ? 0.035 : 0.036, avatar === "dog" ? 0.025 : 0.022, avatar === "dog" ? 0.047 : 0.027);
    const nose = this.part(this.head, "nose", ellipsoid, material(0x393a34, "nose and eyes", 0.68), false);
    nose.position.set(0, -0.016, avatar === "dog" ? 0.103 : 0.072);
    nose.scale.set(avatar === "dog" ? 0.014 : 0.009, 0.0075, 0.008);
    for (const side of [-1, 1]) {
      const eye = this.part(this.head, side < 0 ? "left-eye" : "right-eye", ellipsoid, material(0x30342e, "eyes", 0.52), false);
      eye.position.set(side * 0.028, 0.014, 0.048);
      eye.scale.set(0.0047, 0.0062, 0.0038);
      if (avatar === "cat") {
        const ear = this.part(this.head, side < 0 ? "left-cat-ear" : "right-cat-ear", catEar(false), furMat);
        ear.position.set(side * 0.042, 0.045, -0.012);
        ear.scale.x = side;
        const inner = this.part(this.head, side < 0 ? "left-inner-ear" : "right-inner-ear", catEar(true), earMat, false);
        inner.position.set(side * 0.042, 0.045, 0.007);
        inner.scale.x = side;
      } else {
        const ear = this.part(this.head, side < 0 ? "left-dog-ear" : "right-dog-ear", ellipsoid, earMat);
        ear.position.set(side * 0.065, -0.006, -0.004);
        ear.rotation.z = side * 0.14;
        ear.scale.set(0.021, 0.049, 0.021);
      }
    }
    this.headAnchor.name = "head-label-anchor";
    this.headAnchor.position.set(0, avatar === "cat" ? 0.115 : 0.086, 0);
    this.head.add(this.headAnchor);

    this.arms = [-1, 1].map((side) => this.buildArm(side, cloth, collar, furMat)) as [Arm, Arm];
    this.legs = [-1, 1].map((side) => this.buildLeg(side, trousers, shoes)) as [Leg, Leg];
    const tail = this.part(this.hips, `${avatar}-tail`, geometry(`${avatar} tail`, () => {
      const points = avatar === "cat"
        ? [[0, 0.018, -0.05], [0.025, -0.055, -0.12], [0.06, -0.105, -0.17], [0.095, -0.09, -0.18], [0.107, -0.055, -0.165]]
        : [[0, 0.018, -0.05], [0.03, 0.025, -0.10], [0.057, 0.062, -0.135]];
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 10, avatar === "cat" ? 0.0095 : 0.014, 6, false);
    }), furMat);
    tail.name = `${avatar}-tail`;

    // Cats include their ears; dogs include their crown. All feet remain at
    // Y=0 after this scale, including children with their subtly larger head.
    const crown = this.hipHeight + this.head.position.y + (avatar === "cat" ? 0.105 : 0.074) * this.head.scale.y;
    this.rig.scale.setScalar(1 / crown);
    this.setPose(this.pose);
  }

  private part(parent: THREE.Object3D, name: string, g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(g, this.ownsMaterials ? this.privateMaterial(m) : m);
    mesh.name = name;
    mesh.userData.figurePart = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  private buildArm(side: number, cloth: THREE.Material, cuff: THREE.Material, fur: THREE.Material): Arm {
    const label = side < 0 ? "left" : "right";
    const upper = new THREE.Group();
    upper.name = `${label}-shoulder`;
    upper.position.set(side * 0.108, 0.242, 0);
    this.upperBody.add(upper);
    this.part(upper, `${label}-upper-sleeve`, clothShape("rounded upper sleeve", [[0, 0.027], [0.022, 0.022], [0.036, 0.008], [0.038, -0.02], [0.035, -0.07], [0.031, -0.12], [0.028, -0.16], [0.02, -0.18], [0, -0.188]], 0.96), cloth);
    const fore = new THREE.Group();
    fore.name = `${label}-elbow`;
    fore.position.y = -0.16;
    upper.add(fore);
    this.part(fore, `${label}-lower-sleeve`, clothShape("loose lower sleeve", [[0, 0.03], [0.022, 0.022], [0.031, 0], [0.03, -0.035], [0.028, -0.082], [0.023, -0.126], [0.021, -0.15]]), cloth);
    const sleeveCuff = this.part(fore, `${label}-shirt-cuff`, tapered("linen sleeve cuff", 0.023, 0.022, 0.018), cuff, false);
    sleeveCuff.position.y = -0.132;
    const hand = this.part(fore, `${label}-hand`, ellipsoid, fur);
    hand.position.y = -0.166;
    hand.scale.set(0.017, 0.026, 0.014);
    return { upper, fore, side };
  }

  private buildLeg(side: number, trousers: THREE.Material, shoes: THREE.Material): Leg {
    const label = side < 0 ? "left" : "right";
    const thigh = new THREE.Group();
    thigh.name = `${label}-hip`;
    thigh.position.set(side * 0.049, 0, 0);
    this.hips.add(thigh);
    this.part(thigh, `${label}-trouser-thigh`, clothShape(`loose trouser thigh ${this.thighLength}`, [[0.04, 0], [0.045, -0.042], [0.043, -0.11], [0.037, -this.thighLength + 0.026], [0.034, -this.thighLength], [0.024, -this.thighLength - 0.026], [0, -this.thighLength - 0.035]], 0.97), trousers);
    const shin = new THREE.Group();
    shin.name = `${label}-knee`;
    shin.position.y = -this.thighLength;
    thigh.add(shin);
    this.part(shin, `${label}-trouser-shin`, clothShape(`loose trouser shin ${this.shinLength}`, [[0, 0.035], [0.025, 0.025], [0.035, 0], [0.037, -0.025], [0.035, -0.09], [0.031, -this.shinLength + 0.03], [0.029, -this.shinLength]]), trousers);
    const foot = new THREE.Group();
    foot.name = `${label}-ankle`;
    foot.position.y = -this.shinLength;
    shin.add(foot);
    this.part(foot, `${label}-shoe`, shoeGeometry(), shoes);
    return { thigh, shin, foot };
  }

  setFacing(yaw: number): void {
    if (Number.isFinite(yaw)) this.rotation.y = yaw;
  }

  setPose(pose: Pose): void {
    this.pose = pose;
    if ((pose === "guitar" || pose === "strum") && !this.guitar) this.guitar = this.buildGuitar();
    if (pose === "umbrella" && !this.umbrella) this.umbrella = this.buildUmbrella();
    if (this.guitar) this.guitar.visible = pose === "guitar" || pose === "strum";
    if (this.umbrella) this.umbrella.visible = pose === "umbrella";
    this.setMotion(this.lastPhase, this.lastWalking);
  }

  /** Phase is a complete 0..1 stride, independent of refresh rate. */
  setMotion(phase: number, walking: boolean): void {
    this.lastPhase = Number.isFinite(phase) ? phase : 0;
    this.lastWalking = walking;
    const q = this.lastPhase * TAU;
    const seated = this.pose === "sit" || this.pose === "guitar" || this.pose === "strum";
    const strides = walking && !seated;
    this.hips.position.set(0, seated ? this.shinLength + 0.044 : this.hipHeight, 0);
    this.upperBody.rotation.set(0, 0, this.pose === "lean" ? 0.065 : 0);
    this.head.rotation.set(0, this.pose === "talk" ? -0.09 : 0, 0);
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const a = q + i * Math.PI;
      leg.thigh.rotation.set(seated ? -Math.PI / 2 : strides ? -0.32 * Math.sin(a) : 0, 0, 0);
      leg.shin.rotation.set(seated ? Math.PI / 2 : strides ? 0.025 + 0.55 * Math.max(0, Math.cos(a)) ** 1.5 : 0, 0, 0);
      leg.foot.rotation.set(seated ? 0 : -(leg.thigh.rotation.x + leg.shin.rotation.x), 0, 0);
      const arm = this.arms[i];
      arm.upper.rotation.set(strides ? 0.24 * Math.sin(a) : -0.025, 0, arm.side * 0.075);
      arm.fore.rotation.set(-0.10, 0, 0);
    }
    if (strides) {
      // Solve the planted shoe's height, instead of letting the whole body
      // bounce through the floor as the straight stance leg swings.
      this.hips.position.y = Math.max(...this.legs.map((leg) => this.thighLength * Math.cos(leg.thigh.rotation.x)
        + this.shinLength * Math.cos(leg.thigh.rotation.x + leg.shin.rotation.x))) + 0.044;
      this.upperBody.rotation.z += 0.012 * Math.sin(q);
    }
    if (seated) {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.085, 0.025, 0.188), new THREE.Vector3(-1, -1, 0));
      this.aimArm(this.arms[1], new THREE.Vector3(0.085, 0.025, 0.188), new THREE.Vector3(1, -1, 0));
    }
    if (this.pose === "talk") {
      this.aimArm(this.arms[1], new THREE.Vector3(0.21, 0.20, 0.14), new THREE.Vector3(1, -1, 0));
      this.head.rotation.y = -0.09 + 0.025 * Math.sin(q + this.phaseOffset);
    } else if (this.pose === "arms-up") {
      for (const arm of this.arms) {
        arm.upper.rotation.set(-Math.PI + 0.1, 0, arm.side * -0.24);
        arm.fore.rotation.set(-0.12, 0, 0);
      }
    } else if (this.pose === "lean") {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.195, -0.025, 0.01), new THREE.Vector3(-1, -1, 0));
      this.arms[1].fore.rotation.x = -0.4;
    } else if (this.pose === "umbrella") {
      this.aimArm(this.arms[1], new THREE.Vector3(0.18, 0.16, 0.095), new THREE.Vector3(1, -1, 0));
    } else if (this.pose === "guitar" || this.pose === "strum") {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.205, 0.225, 0.17), new THREE.Vector3(-1, -1, 0));
      const stroke = this.pose === "strum" ? -0.012 : 0.012;
      this.aimArm(this.arms[1], new THREE.Vector3(0.052, 0.085 + stroke + 0.012 * Math.sin(q), 0.177), new THREE.Vector3(1, -0.7, 0.2));
    }
  }

  private aimArm(arm: Arm, target: THREE.Vector3, pole: THREE.Vector3): void {
    const shoulder = arm.upper.position;
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), 0.015, 0.309);
    direction.normalize();
    const along = (0.16 ** 2 - 0.15 ** 2 + distance ** 2) / (2 * distance);
    const normal = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(normal, Math.sqrt(Math.max(0, 0.16 ** 2 - along ** 2)));
    arm.upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().sub(shoulder).normalize());
    const foreRotation = new THREE.Quaternion().setFromUnitVectors(DOWN, target.clone().sub(elbow).normalize());
    arm.fore.quaternion.copy(arm.upper.quaternion).invert().multiply(foreRotation);
  }

  /** Standard materials already receive the shared sky, sun and room lights. */
  setTint(_hex: number): void {
    // Deliberately no legacy sprite tint: multiplying it here darkens fur twice.
  }

  setOpacity(alpha: number): void {
    const opacity = THREE.MathUtils.clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    this.opacity = opacity;
    if (!this.ownsMaterials && opacity !== 1) {
      this.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.material = this.privateMaterial(object.material as THREE.Material);
      });
      this.ownsMaterials = true;
    }
    if (this.ownsMaterials) this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const m = object.material as THREE.Material;
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.depthWrite = opacity >= 1;
    });
  }

  private privateMaterial(source: THREE.Material): THREE.Material {
    let copy = this.materialCopies.get(source);
    if (!copy) {
      copy = source.clone();
      copy.opacity = this.opacity;
      copy.transparent = this.opacity < 1;
      copy.depthWrite = this.opacity >= 1;
      this.materialCopies.set(source, copy);
    }
    return copy;
  }

  /** Shared shapes and opaque materials remain available for the next visitor. */
  dispose(): void {
    for (const m of this.materialCopies.values()) m.dispose();
    this.materialCopies.clear();
    this.removeFromParent();
  }

  private buildGuitar(): THREE.Group {
    const guitar = new THREE.Group();
    guitar.name = "acoustic-guitar";
    guitar.position.set(0.035, 0.09, 0.132);
    guitar.rotation.z = 0.98;
    this.upperBody.add(guitar);
    const body = geometry("original acoustic guitar body", () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.117);
      s.bezierCurveTo(-0.1, -0.117, -0.105, -0.032, -0.059, 0.006);
      s.bezierCurveTo(-0.037, 0.028, -0.088, 0.06, -0.049, 0.098);
      s.bezierCurveTo(-0.029, 0.117, 0.029, 0.117, 0.049, 0.098);
      s.bezierCurveTo(0.088, 0.06, 0.037, 0.028, 0.059, 0.006);
      s.bezierCurveTo(0.105, -0.032, 0.1, -0.117, 0, -0.117);
      return new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.004, bevelThickness: 0.004, curveSegments: 5 });
    });
    this.part(guitar, "guitar-wood-body", body, material(0xb58b50, "warm guitar wood", 0.77));
    const neck = this.part(guitar, "guitar-neck-and-headstock", geometry("guitar neck and headstock", () => merge([
      new THREE.BoxGeometry(0.026, 0.213, 0.017).translate(0, 0.201, 0.023),
      new THREE.BoxGeometry(0.038, 0.052, 0.019).translate(0, 0.331, 0.023),
    ])), material(0x61503c, "guitar fingerboard", 0.8));
    neck.name = "guitar-neck-and-headstock";
    const hole = this.part(guitar, "guitar-sound-hole", geometry("guitar sound hole", () => new THREE.CircleGeometry(0.025, 16)), material(0x4b4234, "guitar sound hole"), false);
    hole.position.set(0, 0.025, 0.0396);
    const rosette = this.part(guitar, "guitar-rosette", geometry("guitar rosette", () => new THREE.RingGeometry(0.026, 0.029, 16)), material(0xd6b87a, "guitar rosette"), false);
    rosette.position.set(0, 0.025, 0.0398);
    this.part(guitar, "guitar-bridge-and-strings", geometry("guitar bridge and strings", () => {
      const pieces = [new THREE.BoxGeometry(0.06, 0.012, 0.007).translate(0, -0.053, 0.04)];
      for (let i = 0; i < 6; i++) pieces.push(new THREE.BoxGeometry(0.0007, 0.385, 0.0006).translate((i - 2.5) * 0.0033, 0.137, 0.043));
      return merge(pieces);
    }), material(0xc2b69a, "guitar strings", 0.63), false);
    return guitar;
  }

  private buildUmbrella(): THREE.Group {
    const umbrella = new THREE.Group();
    umbrella.name = "olive-umbrella";
    umbrella.position.set(0.18, 0.16, 0.095);
    this.upperBody.add(umbrella);
    const shaft = this.part(umbrella, "umbrella-shaft", tapered("umbrella shaft", 0.0025, 0.0025, 0.50, 6), material(0x655f4d, "umbrella shaft", 0.67), false);
    shaft.position.y = 0.50;
    const canopy = this.part(umbrella, "umbrella-canopy", geometry("umbrella canopy", () => {
      const points = [[0.245, 0], [0.228, 0.025], [0.179, 0.073], [0.105, 0.105], [0.005, 0.118]];
      return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 12);
    }), material(0x6d7764, "olive umbrella canvas", 0.98, THREE.DoubleSide));
    canopy.position.y = 0.49;
    return umbrella;
  }
}
