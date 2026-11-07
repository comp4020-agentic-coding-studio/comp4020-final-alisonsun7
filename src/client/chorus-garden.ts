// Original kinetic paper-and-timber sculptures. Their ingredients are real
// durable sounds; hearing preferences never decide a sculpture's shared form.
import * as THREE from "three";
import type { ChorusPlace, ChorusWork } from "../shared/chorus.js";
import { CHORUS_BPM, CHORUS_PLACES } from "../shared/chorus.js";
import { FAMILIES, findSound } from "../shared/sounds.js";
import { PLANET_PLACES, PLANET_RADIUS, planetDistance } from "../shared/planet.js";
import { authorMark, liveChorusAnswers, visibleChorusSources, workSignature } from "../shared/chorus-signature.js";
import type { AuthorMark, ChorusAnswer } from "../shared/chorus-signature.js";
import { onPlanet } from "./planet-build.js";

const TAU = Math.PI * 2;
const BEAT_MS = 60_000 / CHORUS_BPM;
const INK = 0x3f6658, TIMBER = 0xaf825b, PAPER = 0xf0dfb7;
const colourOf = (soundId: string): THREE.ColorRepresentation => {
  const sound = findSound(soundId);
  return sound ? FAMILIES[sound.family].colour : PAPER;
};
const hash = (text: string): number => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
};
interface Slot {
  sourceId: string;
  authorId: string;
  mark: AuthorMark;
  branch: THREE.Group;
  leaf: THREE.Mesh;
  seed: THREE.Mesh;
  angle: number;
}
interface Answer extends ChorusAnswer {
  curve: THREE.QuadraticBezierCurve3;
  light: THREE.Mesh;
  fromColor: THREE.Color;
  toColor: THREE.Color;
}
interface Installation {
  group: THREE.Group;
  body: THREE.Group;
  halo: THREE.Mesh;
  slots: Slot[];
  birds: THREE.Group[];
  ripples: THREE.Mesh[];
  rotors: THREE.Group[];
  sparks: THREE.Mesh[];
  surround: THREE.Group | null;
  canopy: THREE.Group[];
  score: THREE.InstancedMesh | null;
  arrival: THREE.Mesh | null;
  answers: Answer[];
  work: ChorusWork | null;
  signature: string;
  fingerprint: string | null;
  resources: { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> };
}

export interface ChorusGardenState {
  placeId: ChorusPlace;
  workId: string | null;
  variant: ChorusWork["variant"] | null;
  duet: boolean;
  sourceIds: string[];
  contributors: string[];
  open: number;
  phase: number;
  focused: boolean;
  signature: string | null;
  marks: { sourceId: string; authorId: string; color: string; shape: AuthorMark["shape"] }[];
  answers: ChorusAnswer[];
}

export class ChorusGarden {
  readonly root = new THREE.Group();
  private installations = new Map<ChorusPlace, Installation>();
  private focused: string | null = null;
  private disposed = false;
  private phase = 0;
  constructor(parent: THREE.Object3D) {
    this.root.name = "little-chorus-gardens";
    parent.add(this.root);
    for (const placeId of CHORUS_PLACES) this.install(placeId, null);
  }

  setWorks(works: readonly ChorusWork[]): void {
    if (this.disposed) return;
    // A reordered SSE snapshot must choose precisely the same living work.
    const ordered = [...works].filter(work => work.liveSources.some(source => !source.removedAt))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.id.localeCompare(b.id));
    for (const placeId of CHORUS_PLACES) {
      const work = ordered.find(candidate => candidate.placeId === placeId) ?? null;
      const signature = work ? JSON.stringify([work.id, work.variant, work.duet,
        [...work.liveSources].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
          .map(source => [source.id, source.soundId, source.byId, source.replyToId, source.removedAt]), work.lastAt]) : "dormant";
      if (this.installations.get(placeId)?.signature === signature) continue;
      this.install(placeId, work, signature);
    }
  }

  focusWork(workId: string | null): void { this.focused = workId; }

  /** Permanent bases stay solid even while a work is dormant. This only
   * guards new local walking; no stored source or authoritative hut moves. */
  canStand(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return !PLANET_PLACES.some(place => (place.id === "green" || place.id === "stage") &&
      planetDistance({ x, z }, place) < (place.id === "green" ? 1.05 : 1.5));
  }

  /** A real mesh hit, with the same great-circle reach used by the world. */
  pick(ray: THREE.Raycaster, visitor: { x: number; z: number }): { workId: string | null; placeId: ChorusPlace; distance: number; sourceId?: string } | null {
    if (this.disposed) return null;
    this.root.updateMatrixWorld(true);
    for (const hit of ray.intersectObject(this.root, true)) {
      let ancestor: THREE.Object3D | null = hit.object;
      let sourceId: string | undefined;
      while (ancestor && ancestor !== this.root && !ancestor.userData.placeId) {
        if (!sourceId && typeof ancestor.userData.sourceId === "string") sourceId = ancestor.userData.sourceId;
        ancestor = ancestor.parent;
      }
      const placeId = ancestor?.userData.placeId as ChorusPlace | undefined;
      if (!placeId || !CHORUS_PLACES.includes(placeId)) continue;
      const anchor = PLANET_PLACES.find(place => place.id === placeId)!;
      if (planetDistance(visitor, anchor) > 8) continue;
      return { workId: this.installations.get(placeId)?.work?.id ?? null, placeId, distance: hit.distance, ...(sourceId ? { sourceId } : {}) };
    }
    return null;
  }

  /** This only selects a shared result near an actor; it never invents people. */
  workNear(point: { x: number; z: number }, radius = 6, duetOnly = true): ChorusWork | null {
    return [...this.installations.values()].map(item => item.work)
      .filter((work): work is ChorusWork => !!work && (!duetOnly || work.duet) &&
        planetDistance(point, PLANET_PLACES.find(place => place.id === work.placeId)!) <= radius)
      .sort((a, b) => planetDistance(point, a) - planetDistance(point, b) || a.id.localeCompare(b.id))[0] ?? null;
  }

  get state(): ChorusGardenState[] {
    return [...this.installations].map(([placeId, item]) => ({ placeId,
      workId: item.work?.id ?? null, variant: item.work?.variant ?? null,
      duet: item.work?.duet ?? false, sourceIds: item.slots.map(slot => slot.sourceId),
      contributors: item.work?.contributors.map(person => person.id) ?? [],
      open: item.work?.duet ? 1 : 0, phase: this.phase,
      focused: !!item.work && item.work.id === this.focused,
      signature: item.fingerprint,
      marks: item.slots.map(slot => ({ sourceId: slot.sourceId, authorId: slot.authorId, color: slot.mark.color, shape: slot.mark.shape })),
      answers: item.answers.map(({ sourceId, parentId, fromAuthorId, toAuthorId }) => ({ sourceId, parentId, fromAuthorId, toAuthorId })) }));
  }

  frame(serverNow: number, reducedMotion = false): void {
    if (this.disposed || !Number.isFinite(serverNow)) return;
    // The same timestamp gives an identical pose to a late arrival or a muted
    // visitor. Reduced motion retains the final topology and source colours.
    const beats = serverNow / BEAT_MS;
    this.phase = (beats % 4 + 4) % 4;
    for (const item of this.installations.values()) {
      const work = item.work, duet = !!work?.duet;
      const movement = reducedMotion || !work ? 0 : 1;
      const seedPhase = item.fingerprint ? hash(item.fingerprint) % 997 / 997 * TAU : 0;
      const t = movement ? beats * Math.PI / 2 + seedPhase : seedPhase;
      const open = duet ? 1 : .32;
      const arrivalAge = work ? Math.max(0, serverNow - Date.parse(work.lastAt)) : Infinity;
      item.group.userData.chorus = {
        workId: work?.id ?? null, placeId: item.group.userData.placeId,
        variant: work?.variant ?? null, duet, sourceIds: item.slots.map(slot => slot.sourceId),
        participants: work?.contributors.map(person => person.id) ?? [],
        signature: item.fingerprint,
      };
      const haloMat = item.halo.material as THREE.MeshStandardMaterial;
      haloMat.emissiveIntensity = work ? .2 + (work.id === this.focused ? .45 : 0) : 0;
      item.halo.scale.setScalar(work?.id === this.focused ? 1.06 : 1);
      for (let i = 0; i < item.slots.length; i++) {
        const slot = item.slots[i];
        slot.branch.rotation.z = .33 + open * .75 + Math.sin(t + i * .8) * .035 * movement;
        slot.leaf.scale.set(1, .24 + open * .08, .6);
        slot.seed.position.y = .72 + Math.sin(t * 1.3 + i) * .06 * movement;
        (slot.seed.material as THREE.MeshStandardMaterial).emissiveIntensity = .18 +
          (duet ? (.5 + Math.sin(t - i / Math.max(1, item.slots.length) * TAU) * .5) * .38 * movement : 0);
      }
      item.body.rotation.y = work?.variant === "ensemble" ? (movement ? beats / 16 * TAU : 0) : 0;
      for (let i = 0; i < item.rotors.length; i++) {
        const rotor = item.rotors[i];
        rotor.rotation.y = movement ? t * (i % 2 ? -.3 : .3) : i * .4;
        rotor.position.y = .72 + i * .34 + Math.sin(beats * TAU - i * .8) * .05 * movement;
      }
      for (let i = 0; i < item.birds.length; i++) {
        const bird = item.birds[i], angle = t * .35 + i * TAU / item.birds.length;
        bird.position.set(Math.sin(angle) * 2.05, 2.8 + Math.sin(angle * 2 + i) * .22 * movement, Math.cos(angle) * 1.7);
        bird.rotation.y = angle + Math.PI / 2;
        for (let wing = 0; wing < bird.children.length; wing++)
          bird.children[wing].rotation.z = (wing % 2 ? -1 : 1) * (.3 + Math.sin(t * 4 + i) * .24 * movement);
      }
      for (let i = 0; i < item.ripples.length; i++) {
        const progress = movement ? ((beats / 4 + i / item.ripples.length) % 1 + 1) % 1 : (i + 1) / (item.ripples.length + 1);
        const ripple = item.ripples[i];
        ripple.scale.setScalar(.8 + progress * (duet ? 3.2 : 1.2));
        (ripple.material as THREE.MeshBasicMaterial).opacity = .12 + (1 - progress) * .3;
      }
      for (let i = 0; i < item.sparks.length; i++) {
        const angle = t * .45 + i * TAU / item.sparks.length;
        item.sparks[i].position.set(Math.sin(angle) * (duet ? 2.15 : .5),
          1.7 + Math.sin(angle * 2 + i) * .65, Math.cos(angle) * (duet ? 1.8 : .5));
      }
      for (let i = 0; i < item.canopy.length; i++) {
        const rib = item.canopy[i];
        rib.rotation.y = rib.userData.restAngle + Math.sin(t / 3 + i) * .035 * movement;
        rib.rotation.z = Math.sin(t / 2 + i) * .035 * movement;
      }
      for (let i = 0; i < item.answers.length; i++) {
        const answer = item.answers[i];
        // Each four-beat journey is a visible parent -> answer, rather than
        // particles invented independently of the actual relationship. A late
        // arrival gets the exact same phase; quiet preference never alters it.
        const progress = movement ? ((beats / 4 - i * .35) % 1 + 1) % 1 : .65;
        answer.light.position.copy(answer.curve.getPoint(progress));
        answer.light.scale.setScalar(.8 + Math.sin(progress * Math.PI) * .65);
        const m = answer.light.material as THREE.MeshStandardMaterial;
        m.color.copy(answer.fromColor).lerp(answer.toColor, progress);
        m.emissive.copy(m.color); m.emissiveIntensity = .6;
      }
      if (item.score) {
        const colour = new THREE.Color(), sourceColours = item.slots.map(slot => new THREE.Color(slot.mark.color));
        for (let i = 0; i < item.score.count; i++) {
          colour.copy(sourceColours[i % sourceColours.length]);
          // The whole floor, rather than just a tiny flower, gives a slow
          // four-step answer. No flicker or audio preference changes the pose.
          if (work!.variant === "ensemble" && (!movement || Math.floor(this.phase) === i % 4)) colour.lerp(new THREE.Color(PAPER), .48);
          item.score.setColorAt(i, colour);
        }
        item.score.instanceColor!.needsUpdate = true;
      }
      if (item.arrival) {
        const duration = 3800, age = arrivalAge / duration;
        item.arrival.visible = !reducedMotion && age >= 0 && age < 1;
        item.arrival.scale.setScalar(.55 + Math.min(1, age) * 3.5);
        (item.arrival.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age) * .55;
      }
    }
  }

  private install(placeId: ChorusPlace, sourceWork: ChorusWork | null, signature = "dormant"): void {
    const previous = this.installations.get(placeId);
    if (previous) this.release(previous);
    // Snapshot the server projection so later controller ACK bookkeeping cannot
    // silently mutate the sculpture between explicit setWorks calls.
    const work: ChorusWork | null = sourceWork ? { ...sourceWork,
      sources: sourceWork.sources.map(source => ({ ...source })),
      liveSources: sourceWork.liveSources.filter(source => !source.removedAt).map(source => ({ ...source }))
        .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      contributors: sourceWork.contributors.map(person => ({ ...person })) } : null;
    // Server projection remains authoritative. Defensively require its real
    // live endpoints too, so a stale duet flag cannot keep a withdrawn form.
    if (work) work.duet = work.duet && liveChorusAnswers(work).length > 0;
    const group = new THREE.Group(), body = new THREE.Group();
    group.name = `chorus-garden-${placeId}`; group.userData.placeId = placeId;
    const anchor = PLANET_PLACES.find(place => place.id === placeId)!;
    // Green grows from the existing well. Reading's smaller mobile floats at
    // the open porch, outside its solid roof; no source coordinates are moved.
    onPlanet(group, anchor.x, anchor.z, placeId === "green" ? .52 : placeId === "stage" ? .24 : .08);
    if (placeId === "reading") {
      const porch = new THREE.Group(); group.add(porch); porch.position.set(-1.35, 0, 3.25);
      porch.add(body); body.scale.setScalar(.72);
    } else group.add(body);
    this.root.add(group);
    const resources: Installation["resources"] = { geometries: new Set(), materials: new Set() };
    const material = (colour: THREE.ColorRepresentation, glowing = false): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color: colour, roughness: .93, metalness: 0,
        emissive: glowing ? colour : 0x000000, emissiveIntensity: glowing ? .25 : 0 });
      resources.materials.add(m); return m;
    };
    const paper = material(PAPER), wood = material(TIMBER), green = material(0x779c77), dark = material(INK), warm = material(0xedc985, true);
    const add = (geometry: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = body): THREE.Mesh => {
      resources.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, m); mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh); return mesh;
    };
    const sphere = (radius: number, m: THREE.Material, parent: THREE.Object3D = body): THREE.Mesh => add(new THREE.SphereGeometry(radius, 12, 8), m, parent);
    const stem = (parent: THREE.Object3D, length: number, radius: number, m: THREE.Material): THREE.Mesh => {
      const mesh = add(new THREE.CylinderGeometry(radius * .7, radius, length, 7), m, parent); mesh.position.y = length / 2; return mesh;
    };
    const halo = add(new THREE.TorusGeometry(placeId === "green" ? .82 : .63, .035, 5, 40), warm);
    halo.name = "chorus-source-ring"; halo.rotation.x = Math.PI / 2; halo.position.y = .06;
    if (placeId === "stage") {
      // The permanent low display boundary makes the collision footprint
      // visible even before a visitor has grown the first kinetic flower.
      const display = new THREE.Group(); display.name = "chorus-stage-display"; group.add(display);
      for (const [height, radius, m] of [[.06, .055, dark], [.61, .025, paper]] as const) {
        const ring = add(new THREE.TorusGeometry(1.2, radius, 6, 40), m, display);
        ring.rotation.x = Math.PI / 2; ring.position.y = height;
      }
      const postGeometry = new THREE.CylinderGeometry(.045, .06, .6, 7);
      for (let i = 0; i < 4; i++) {
        const angle = Math.PI / 4 + i * Math.PI / 2;
        const post = add(postGeometry, wood, display); post.position.set(Math.sin(angle) * 1.2, .31, Math.cos(angle) * 1.2);
      }
    }
    const foundation = add(new THREE.CylinderGeometry(.22, .28, .16, 12), dark); foundation.position.y = .08;
    const core = sphere(.15, work ? material(colourOf(work.liveSources[0].soundId), true) : paper);
    core.position.y = work ? 1.37 : .28; core.name = "chorus-seed";
    if (work) stem(body, 1.4, .065, wood);
    else {
      // A seed holder invites a contribution without fabricating a sound,
      // author or shared achievement before someone has actually published.
      const leaf = sphere(.17, green); leaf.position.set(.12, .27, 0); leaf.scale.set(1.6, .35, .75); leaf.rotation.z = -.4;
    }
    const fingerprint = work ? workSignature(work) : null;
    const item: Installation = { group, body, halo, work, signature, fingerprint, slots: [], birds: [], rotors: [], sparks: [], ripples: [],
      surround: null, canopy: [], score: null, arrival: null, answers: [], resources };
    const orderedSources = work ? visibleChorusSources(work) : [];
    const turn = fingerprint ? hash(fingerprint) % 997 / 997 * .45 : 0;
    for (let i = 0; i < orderedSources.length; i++) {
      const source = orderedSources[i], angle = i / Math.max(3, orderedSources.length) * TAU + turn, mark = authorMark(source.byId);
      const orbit = new THREE.Group(); orbit.rotation.y = angle; orbit.position.y = 1.15; body.add(orbit);
      const branch = new THREE.Group(); orbit.add(branch);
      branch.userData.sourceId = source.id; branch.rotation.z = .33 + (work!.duet ? 1 : .32) * .75;
      stem(branch, .96, .025, wood);
      const colour = material(colourOf(source.soundId), true);
      const geometry = mark.shape === "round" ? new THREE.SphereGeometry(.29, 12, 8)
        : mark.shape === "diamond" ? new THREE.OctahedronGeometry(.34, 0)
          : mark.shape === "triangle" ? new THREE.ConeGeometry(.32, .52, 3)
            : new THREE.SphereGeometry(.29, 9, 6);
      if (mark.shape === "petal") geometry.scale(1.6, 1, .8);
      if (mark.shape === "triangle") geometry.rotateZ(Math.PI / 2);
      const leaf = add(geometry, material(mark.color), branch); leaf.position.y = .8;
      leaf.scale.set(1, .32, .6); leaf.rotation.z = -.25;
      leaf.name = "chorus-author-mark"; leaf.userData = { sourceId: source.id, authorId: source.byId, color: mark.color, shape: mark.shape };
      const seed = sphere(.11, colour, branch); seed.position.set(.06, .72, .16);
      seed.name = "chorus-source-pendant"; seed.userData.sourceId = source.id; seed.userData.authorId = source.byId;
      item.slots.push({ sourceId: source.id, authorId: source.byId, mark, branch, seed, leaf, angle });
    }
    if (work?.duet) {
      body.updateWorldMatrix(true, true);
      const inverseBody = body.matrixWorld.clone().invert();
      for (const answer of liveChorusAnswers(work)) {
        const parent = item.slots.find(slot => slot.sourceId === answer.parentId), child = item.slots.find(slot => slot.sourceId === answer.sourceId);
        // At most six visible ingredients. A relation outside this display
        // budget remains in the work record and is never fabricated as a slot.
        if (!parent || !child) continue;
        const start = parent.seed.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseBody);
        const end = child.seed.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseBody);
        const crest = start.clone().add(end).multiplyScalar(.5); crest.y = Math.max(start.y, end.y) + .6;
        const curve = new THREE.QuadraticBezierCurve3(start, crest, end);
        const pathMaterial = new THREE.MeshBasicMaterial({ color: authorMark(answer.toAuthorId).color, transparent: true,
          opacity: .62, depthWrite: false }); resources.materials.add(pathMaterial);
        const path = add(new THREE.TubeGeometry(curve, 18, .018, 4, false), pathMaterial);
        path.name = "chorus-answer-path"; path.userData = { ...answer }; path.castShadow = false;
        const light = sphere(.085, material(authorMark(answer.toAuthorId).color, true));
        light.name = "chorus-answer-light"; light.userData = { ...answer }; light.castShadow = false;
        item.answers.push({ ...answer, curve, light, fromColor: new THREE.Color(authorMark(answer.fromAuthorId).color),
          toColor: new THREE.Color(authorMark(answer.toAuthorId).color) });
      }
    }
    if (work?.variant === "habitat") {
      const water = material(0x83b5ad, true);
      const bowl = add(new THREE.SphereGeometry(.55, 20, 10, 0, TAU, 0, Math.PI / 2), water);
      bowl.scale.y = .2; bowl.position.y = .14;
      if (work.duet) for (let i = 0; i < 3; i++) {
        const bird = new THREE.Group(); bird.name = "chorus-paper-bird"; body.add(bird); item.birds.push(bird);
        bird.scale.setScalar(1.5);
        for (const side of [-1, 1]) {
          const wing = add(new THREE.ConeGeometry(.13, .38, 3), i % 2 ? material(authorMark(orderedSources[i % orderedSources.length].byId).color) : paper, bird);
          wing.geometry.rotateZ(-side * Math.PI / 2); wing.position.x = side * .13; wing.scale.z = .2;
        }
      }
      for (let i = 0; i < (work.duet ? 3 : 1); i++) {
        const m = new THREE.MeshBasicMaterial({ color: 0xc3e0c3, transparent: true, opacity: .3, depthWrite: false });
        resources.materials.add(m);
        const ripple = add(new THREE.TorusGeometry(.65, .015, 4, 40), m); ripple.rotation.x = Math.PI / 2; ripple.position.y = .12;
        item.ripples.push(ripple);
      }
    } else if (work?.variant === "ensemble") {
      for (let level = 0; level < (work.duet ? 2 : 1); level++) {
        const rotor = new THREE.Group(); rotor.name = "chorus-beat-flower"; body.add(rotor); item.rotors.push(rotor);
        const wheel = add(new THREE.TorusGeometry(.62 + level * .23, .022, 5, 36), wood, rotor); wheel.rotation.x = Math.PI / 2;
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * TAU;
          const petal = sphere(.21, i % 2 ? paper : warm, rotor);
          petal.scale.set(.7, .23, 1.65); petal.position.set(Math.sin(angle) * (.62 + level * .23), 0, Math.cos(angle) * (.62 + level * .23));
          petal.rotation.y = angle;
        }
      }
    } else if (work) {
      const lanternPaper = material(PAPER, true);
      lanternPaper.transparent = true; lanternPaper.opacity = .72; lanternPaper.depthWrite = false;
      const cage = add(new THREE.IcosahedronGeometry(.49, 0), lanternPaper); cage.name = "chorus-paper-lantern";
      cage.position.y = 1.76; cage.scale.set(.62, .95, .62);
      const window = sphere(.25, warm); window.position.y = 1.76;
      for (let i = 0; i < (work.duet ? 6 : 1); i++) {
        const spark = sphere(work.duet ? .075 : .045, warm); spark.name = "chorus-travelling-light"; spark.castShadow = false; item.sparks.push(spark);
      }
    }
    if (work?.duet) {
      // A duet changes the occupied place: a canopy above heads, a broad
      // rhythmic floor, or a warm lantern garland. The original seed remains
      // recognisable, while the silhouettes can be read at the activity camera.
      // These are effects of the same server work, never extra people/sounds.
      const surround = new THREE.Group(); surround.name = "chorus-shared-place";
      surround.userData.workId = work.id; group.add(surround); item.surround = surround;
      if (placeId === "reading") surround.position.set(-1.35, .05, 3.25);
      const width = placeId === "reading" ? .72 : 1;
      const baseHeight = placeId === "green" ? -.47 : placeId === "stage" ? -.04 : -.04;
      const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3,
        side: THREE.DoubleSide, depthWrite: false }); resources.materials.add(floorMaterial);
      const shape = new THREE.Shape(); shape.moveTo(0, .55);
      shape.bezierCurveTo(-.62, .8, -.66, 1.7, 0, 2.45);
      shape.bezierCurveTo(.66, 1.7, .62, .8, 0, .55);
      const floorGeometry = new THREE.ShapeGeometry(shape, 14); resources.geometries.add(floorGeometry);
      // Bend the painted pattern onto the sphere. The stage has a flat deck.
      const positions = floorGeometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = -positions.getY(i), radius = Math.hypot(x, z);
        positions.setXYZ(i, x, placeId === "stage" ? baseHeight : baseHeight + Math.sqrt(PLANET_RADIUS ** 2 - radius ** 2) - PLANET_RADIUS, z);
      }
      floorGeometry.computeVertexNormals();
      const score = new THREE.InstancedMesh(floorGeometry, floorMaterial, 12);
      score.name = "chorus-place-score"; score.castShadow = false; score.receiveShadow = false; surround.add(score); item.score = score;
      const pose = new THREE.Object3D(), colour = new THREE.Color();
      for (let i = 0; i < score.count; i++) {
        pose.rotation.y = i / score.count * TAU; pose.scale.setScalar(width); pose.updateMatrix(); score.setMatrixAt(i, pose.matrix);
        score.setColorAt(i, colour.set(authorMark(orderedSources[i % orderedSources.length].byId).color));
      }
      if (work.variant === "habitat") {
        const leafGeometry = new THREE.SphereGeometry(.33, 9, 5); leafGeometry.scale(1.85, .11, .75); resources.geometries.add(leafGeometry);
        const ribs = Math.min(6, Math.max(3, orderedSources.length + 2));
        for (let i = 0; i < ribs; i++) {
          const rib = new THREE.Group(); rib.name = "chorus-canopy-rib"; rib.userData.restAngle = i / ribs * TAU + Math.PI / 4 + turn;
          rib.rotation.y = rib.userData.restAngle; surround.add(rib); item.canopy.push(rib);
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.55, 0), new THREE.Vector3(.7, 2.65, 0),
            new THREE.Vector3(1.55, 3.1, 0), new THREE.Vector3(2.2, 2.85, 0)]);
          const stalk = add(new THREE.TubeGeometry(curve, 14, .035, 5, false), wood, rib); stalk.name = "chorus-overhead-stem";
          const leaves = new THREE.InstancedMesh(leafGeometry, material(i % 2 ? 0x8fae81 : 0xc2c594), 5);
          leaves.castShadow = true; leaves.receiveShadow = true; leaves.name = "chorus-canopy-leaves"; rib.add(leaves);
          for (let j = 0; j < 5; j++) {
            const point = curve.getPoint(.35 + j * .145);
            pose.position.copy(point); pose.rotation.set(j % 2 ? .2 : -.2, j % 2 ? -.65 : .65, -.2);
            pose.scale.setScalar(.9 + (j % 2) * .25); pose.updateMatrix(); leaves.setMatrixAt(j, pose.matrix);
          }
        }
      } else {
        const garland = new THREE.Group(); garland.name = "chorus-answer-garland"; surround.add(garland);
        const cord = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.3, 2.75, -1.1), new THREE.Vector3(0, 2.28, -1.3), new THREE.Vector3(2.3, 2.75, -1.1)]);
        add(new THREE.TubeGeometry(cord, 24, .018, 4, false), dark, garland);
        for (let i = 0; i < orderedSources.length; i++) {
          const point = cord.getPoint((i + 1) / (orderedSources.length + 1)), source = orderedSources[i];
          const paperColour = material(authorMark(source.byId).color, work.variant === "lantern");
          if (work.variant === "ensemble") {
            const flag = add(new THREE.ConeGeometry(.22, .44, 3), paperColour, garland); flag.position.copy(point).add(new THREE.Vector3(0, -.2, 0));
            flag.rotation.z = Math.PI; flag.scale.z = .12; flag.name = "chorus-answer-pennant";
            flag.userData = { sourceId: source.id, authorId: source.byId };
          } else {
            const lantern = add(new THREE.IcosahedronGeometry(.22, 0), paperColour, garland);
            lantern.position.copy(point).add(new THREE.Vector3(0, -.23, 0)); lantern.scale.set(.8, 1.1, .8); lantern.name = "chorus-answer-lantern";
            lantern.userData = { sourceId: source.id, authorId: source.byId };
            stem(garland, .22, .013, dark).position.copy(point).add(new THREE.Vector3(0, -.22, 0));
          }
        }
        // Anchor the cord within the existing guarded display, rather than
        // introducing invisible ground obstacles around people's contributions.
        for (const sign of [-1, 1]) {
          const support = new THREE.CatmullRomCurve3([new THREE.Vector3(sign * .15, 1.35, 0),
            new THREE.Vector3(sign * 1.15, 2.6, -.6), new THREE.Vector3(sign * 2.3, 2.75, -1.1)]);
          add(new THREE.TubeGeometry(support, 16, .027, 5, false), wood, garland);
        }
      }
      if (placeId === "reading") {
        // A small porch mobile stays outside the roof and leaves the approach
        // open; its canopy is lifted so the reduced width does not lower it.
        for (const object of item.canopy) object.scale.set(width, 1, width);
        const garland = surround.getObjectByName("chorus-answer-garland"); if (garland) garland.scale.set(width, 1, width);
      }
    }
    if (work) {
      const arrivalMaterial = new THREE.MeshBasicMaterial({ color: colourOf(orderedSources.at(-1)!.soundId), transparent: true,
        opacity: .5, depthWrite: false, side: THREE.DoubleSide }); resources.materials.add(arrivalMaterial);
      const arrival = add(new THREE.TorusGeometry(.8, .035, 4, 48), arrivalMaterial, group);
      arrival.name = "chorus-answer-ripple"; arrival.rotation.x = Math.PI / 2;
      arrival.position.set(placeId === "reading" ? -1.35 : 0, placeId === "green" ? -.4 : .06, placeId === "reading" ? 3.25 : 0);
      arrival.castShadow = false; arrival.receiveShadow = false; item.arrival = arrival;
    }
    this.installations.set(placeId, item);
  }

  private release(item: Installation): void {
    item.group.removeFromParent();
    item.group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    for (const geometry of item.resources.geometries) geometry.dispose();
    for (const material of item.resources.materials) material.dispose();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.installations.values()) this.release(item);
    this.installations.clear(); this.root.removeFromParent();
  }
}
