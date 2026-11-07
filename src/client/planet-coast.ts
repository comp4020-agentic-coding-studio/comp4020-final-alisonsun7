// Original painted coast, built on the same sphere as the people. The sea is
// scenery, not another room or a new coordinate system. No downloaded assets.
import * as THREE from "three";
import { PLANET_RADIUS as R, planetBasis, planetPoint } from "../shared/planet.js";

const HALF = Math.PI * R;
const wrap = (x: number): number => ((x + HALF) % (HALF * 2) + HALF * 2) % (HALF * 2) - HALF;

// Inland peninsulas preserve every existing venue, including the conservatory
// and tide pools. Between them the beach comes close to the village paths.
export function coastlineAt(x: number): number {
  return 11 + 8 * Math.exp(-((wrap(x + 2) / 10) ** 2))
    + 7 * Math.exp(-((wrap(x - 16) / 8) ** 2)) + 3 * Math.sin(x / R * 2 + .5);
}

// The short pier is the sole walking surface over the open sea. Longitude
// narrows towards the pole, so its width is measured in actual tangent metres.
export function planetPierHeightAt(x: number, z: number): number | null {
  const start = coastlineAt(7) - 1.5, end = start + 8;
  const dx = Math.abs(wrap(x - 7) * Math.cos(z / R));
  const width = z > end - .3 ? 1.5 : 1.12;
  return z >= start - .2 && z <= end + 1.15 && dx <= width ? .125 + dx * dx / (2 * R) : null;
}

export interface PlanetCoast {
  root: THREE.Group;
  animate(seconds: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createPlanetCoast(): PlanetCoast {
  const root = new THREE.Group();
  root.name = "soundfolk-coast";
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const clock = { value: 0 };
  const material = (color: number, roughness = .85): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    materials.add(m);
    return m;
  };
  const wood = material(0xb59165), rail = material(0x78664c), cream = material(0xf5e8c8);
  const blue = material(0x547f88), coral = material(0xc88c6b), pebble = material(0xaeb5a2);
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = root): THREE.Mesh => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh => {
    const o = mesh(new THREE.BoxGeometry(w, h, d), mat, parent);
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const frame = (object: THREE.Object3D, x: number, z: number, height = 0): void => {
    const p = planetPoint(x, z, height), b = planetBasis(x, z);
    object.position.set(p.x, p.y, p.z);
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(b.east.x, b.east.y, b.east.z), new THREE.Vector3(b.up.x, b.up.y, b.up.z), new THREE.Vector3(b.south.x, b.south.y, b.south.z)));
  };
  const point = (out: number[], x: number, z: number, height: number): void => {
    const lon = x / R, lat = z / R, radius = R + height;
    out.push(Math.sin(lon) * Math.cos(lat) * radius, -Math.sin(lat) * radius, Math.cos(lon) * Math.cos(lat) * radius);
  };
  // The southern hemisphere faces the green ground-fill light. A restrained
  // blue floor keeps painted water legible there, without another live light.
  const water = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .35, metalness: .06, emissive: 0x286f91, emissiveIntensity: .24 });
  materials.add(water);
  water.onBeforeCompile = shader => {
    shader.uniforms.coastTime = clock;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float coastTime; varying vec3 coastPosition;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        coastPosition = position;
        float wave = sin(position.x * 1.1 + position.z * .8 + coastTime * .7) * .018
          + sin(position.y * 1.9 - position.x * .6 + coastTime * .9) * .012;
        transformed += normalize(position) * wave;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float coastTime; varying vec3 coastPosition;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float ripple = sin(coastPosition.x * 4.0 + coastPosition.z * 2.8 + coastTime * .5)
          * sin(coastPosition.y * 4.4 - coastPosition.x * 1.9 - coastTime * .35);
        diffuseColor.rgb *= 1.0 + ripple * .055;`);
  };
  water.customProgramCacheKey = () => "soundfolk-curved-coast-v1";
  const waterVertices: number[] = [], waterColors: number[] = [], waterIndices: number[] = [];
  const columns = 192, rows = 40;
  const shallow = new THREE.Color(0x6bb7ad), middle = new THREE.Color(0x3c959c), deep = new THREE.Color(0x28677e);
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const x = -HALF + col / columns * HALF * 2, edge = coastlineAt(x);
    const z = edge + (HALF / 2 - edge) * row / rows;
    point(waterVertices, x, z, .055);
    const depth = Math.min(1, (z - edge) / 8);
    const color = depth < .45 ? shallow.clone().lerp(middle, depth / .45) : middle.clone().lerp(deep, (depth - .45) / .55);
    waterColors.push(color.r, color.g, color.b);
    if (row < rows && col < columns) {
      const a = row * (columns + 1) + col, b = a + columns + 1;
      waterIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const oceanGeometry = new THREE.BufferGeometry();
  oceanGeometry.setAttribute("position", new THREE.Float32BufferAttribute(waterVertices, 3));
  oceanGeometry.setAttribute("color", new THREE.Float32BufferAttribute(waterColors, 3));
  oceanGeometry.setIndex(waterIndices);
  oceanGeometry.computeVertexNormals();
  oceanGeometry.userData.coastalWater = true;
  const ocean = mesh(oceanGeometry, water);
  ocean.name = "soundfolk-ocean";

  // A broad curved sand ribbon, with an irregular grass edge and a darker
  // strip of damp sand. Its height remains the original walkable sphere.
  const sandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 });
  materials.add(sandMaterial);
  const sandVertices: number[] = [], sandColors: number[] = [], sandIndices: number[] = [];
  const dry = new THREE.Color(0xe5d5ae), wet = new THREE.Color(0xc3bd98), inland = new THREE.Color(0xaab17e);
  for (let row = 0; row <= 8; row++) for (let col = 0; col <= columns; col++) {
    const x = -HALF + col / columns * HALF * 2, edge = coastlineAt(x), t = row / 8;
    const width = 3.2 + Math.sin(x * .48) * .45 + Math.sin(x * 1.3) * .16;
    point(sandVertices, x, edge - width + t * (width + .22), .032);
    const c = t < .16 ? inland.clone().lerp(dry, t / .16) : dry.clone().lerp(wet, Math.max(0, (t - .76) / .24));
    sandColors.push(c.r, c.g, c.b);
    if (row < 8 && col < columns) {
      const a = row * (columns + 1) + col, b = a + columns + 1;
      sandIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const sandGeometry = new THREE.BufferGeometry();
  sandGeometry.setAttribute("position", new THREE.Float32BufferAttribute(sandVertices, 3));
  sandGeometry.setAttribute("color", new THREE.Float32BufferAttribute(sandColors, 3));
  sandGeometry.setIndex(sandIndices);
  sandGeometry.computeVertexNormals();
  mesh(sandGeometry, sandMaterial).name = "soundfolk-beach";

  const foamMaterial = new THREE.MeshStandardMaterial({ color: 0xeaf0d8, emissive: 0x7b978d, emissiveIntensity: .12, roughness: .9, transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide });
  materials.add(foamMaterial);
  const foamBands: { geometry: THREE.BufferGeometry; offset: number }[] = [];
  for (let band = 0; band < 3; band++) {
    const vertices: number[] = [], indices: number[] = [];
    for (let col = 0; col <= columns; col++) {
      const x = -HALF + col / columns * HALF * 2, edge = coastlineAt(x) + .12 + band * .65;
      point(vertices, x, edge, .11);
      point(vertices, x, edge + .12 + band * .035, .11);
      // Broken scallops rather than one hard outline around the globe.
      if (col < columns && Math.sin(col * .48 + band * 1.7) > -.3) {
        const a = col * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const object = mesh(geometry, foamMaterial);
    object.name = `soundfolk-surf-${band}`;
    foamBands.push({ geometry, offset: band * .65 });
  }

  // The little jetty is wide enough to recognise and visit at eye level.
  // Individual planks and posts follow the surface instead of a floating slab.
  const pier = new THREE.Group();
  pier.name = "soundfolk-pier";
  root.add(pier);
  const pierX = 7, pierStart = coastlineAt(pierX) - 1.5, pierLength = 8;
  for (let i = 0; i <= 24; i++) {
    const section = new THREE.Group();
    frame(section, pierX, pierStart + i * pierLength / 24, .075);
    pier.add(section);
    box(2.35, .09, .29, i % 4 === 0 ? rail : wood, section, 0, 0, 0);
    if (i % 4 === 0) for (const x of [-1.08, 1.08]) {
      box(.1, 1.05, .1, rail, section, x, .5, 0);
      box(.16, .08, .16, cream, section, x, 1.05, 0);
    }
    if (i < 24) for (const x of [-1.08, 1.08]) box(.06, .07, .36, wood, section, x, .88, .18);
  }
  const pierEnd = new THREE.Group();
  frame(pierEnd, pierX, pierStart + pierLength, .07);
  pier.add(pierEnd);
  box(3.1, .1, 1.5, wood, pierEnd, 0, 0, .5);
  box(1.5, .12, .42, wood, pierEnd, 0, .49, .8);
  box(1.5, .42, .08, blue, pierEnd, 0, .8, 1.01);
  for (const x of [-.55, .55]) box(.09, .48, .35, rail, pierEnd, x, .24, .8);

  const boatAnchor = new THREE.Group();
  frame(boatAnchor, pierX + 4.1, pierStart + 5.5, .13);
  root.add(boatAnchor);
  const boat = new THREE.Group();
  boat.name = "soundfolk-sailboat";
  boat.rotation.y = -.5;
  boatAnchor.add(boat);
  const hull = mesh(new THREE.SphereGeometry(1, 16, 8), cream, boat);
  hull.scale.set(.66, .3, 1.55);
  const rim = mesh(new THREE.TorusGeometry(1, .055, 5, 32), wood, boat);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(.6, 1.45, 1);
  rim.position.y = .19;
  box(.06, 2.6, .06, rail, boat, 0, 1.35, 0);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(.08, .4); sailShape.lineTo(1.15, .6); sailShape.lineTo(.08, 2.55); sailShape.closePath();
  const sailMaterial = material(0xf0dbaf);
  sailMaterial.side = THREE.DoubleSide;
  mesh(new THREE.ShapeGeometry(sailShape), sailMaterial, boat);
  const jibShape = new THREE.Shape();
  jibShape.moveTo(-.1, .4); jibShape.lineTo(-.7, .55); jibShape.lineTo(-.1, 1.95); jibShape.closePath();
  const jibMaterial = material(0x6f9996);
  jibMaterial.side = THREE.DoubleSide;
  mesh(new THREE.ShapeGeometry(jibShape), jibMaterial, boat);
  box(.5, .06, .16, coral, boat, 0, 2.6, 0).rotation.z = -.15;

  // A shallow runnel links the original tide-pool anchor to its actual sea.
  const channelVertices: number[] = [], channelIndices: number[] = [];
  for (let i = 0; i <= 30; i++) {
    const z = 14 + i / 30 * (coastlineAt(16) - 13), x = 16 + Math.sin(i / 30 * Math.PI * 2) * .55;
    point(channelVertices, x - .45, z, .055); point(channelVertices, x + .45, z, .055);
    if (i < 30) { const a = i * 2; channelIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const channelGeometry = new THREE.BufferGeometry();
  channelGeometry.setAttribute("position", new THREE.Float32BufferAttribute(channelVertices, 3));
  channelGeometry.setIndex(channelIndices);
  channelGeometry.computeVertexNormals();
  const channelMaterial = material(0x78b5ba, .35);
  channelMaterial.emissive.setHex(0x286f91); channelMaterial.emissiveIntensity = .18;
  mesh(channelGeometry, channelMaterial).name = "soundfolk-tide-channel";

  // A few grouped stones and sea grass give the tideline a human scale.
  const stoneGeometry = new THREE.IcosahedronGeometry(1, 1);
  const stones = new THREE.InstancedMesh(stoneGeometry, pebble, 90);
  geometries.add(stoneGeometry);
  stones.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 90; i++) {
    const x = -HALF + i / 90 * HALF * 2 + Math.sin(i * 3.7) * .6;
    frame(dummy, x, coastlineAt(x) - 1.8 + Math.sin(i * 2.1) * .6, .05);
    const size = .09 + (i % 5) * .035;
    dummy.scale.set(size * 1.4, size * .6, size);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  root.add(stones);
  let lastFoamTime = -1;
  return {
    root,
    animate(seconds, reducedMotion) {
      const t = reducedMotion ? 0 : seconds;
      clock.value = t;
      boat.rotation.z = reducedMotion ? 0 : Math.sin(t * .65) * .045;
      boat.position.y = reducedMotion ? 0 : Math.sin(t * .8) * .045;
      // Geometry updates at 8 Hz are ample for this slow wash; GPU ripples
      // stay smooth. No per-frame arrays or vectors are allocated.
      if (Math.floor(t * 8) === lastFoamTime) return;
      lastFoamTime = Math.floor(t * 8);
      for (const { geometry, offset } of foamBands) {
        const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
        const array = attribute.array as Float32Array;
        for (let col = 0; col <= columns; col++) {
          const x = -HALF + col / columns * HALF * 2;
          const edge = coastlineAt(x) + .15 + offset + Math.sin(t * .55 + x * .2 - offset) * .22;
          for (let side = 0; side < 2; side++) {
            const lat = (edge + side * .14) / R, lon = x / R, radius = R + .11, index = (col * 2 + side) * 3;
            array[index] = Math.sin(lon) * Math.cos(lat) * radius;
            array[index + 1] = -Math.sin(lat) * radius;
            array[index + 2] = Math.cos(lon) * Math.cos(lat) * radius;
          }
        }
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
      root.removeFromParent();
    },
  };
}
