import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import ts from "typescript";
import { buildPlanet as buildOld } from "../support-review/before-dist/client/planet-build.js";
import { buildPlanet } from "../support-review/after-dist/client/planet-build.js";
import { moveOnPlanet, bearingToward } from "../support-review/after-dist/client/planet-locomotion.js";
import { PLANET_PLACES, PLANET_RADIUS as R, planetBasis, planetPoint } from "../support-review/after-dist/shared/planet.js";

const clean = text => text.replace(/\r\n/g, "\n").trim();
const compiledChecks = [];
for (const [commit, folder, paths] of [
  ["40ed231", "before-dist", ["client/planet-build", "client/planet-surface-safety", "client/planet-coast", "shared/planet"]],
  ["8f32290", "after-dist", ["client/planet-build", "client/planet-support", "client/planet-coast", "client/planet-locomotion", "shared/planet"]],
]) for (const path of paths) {
  const source = execFileSync("git", ["show", `${commit}:src/${path}.ts`], { encoding: "utf8" });
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
  const matches = clean(compiled) === clean(readFileSync(new URL(`../support-review/${folder}/${path}.js`, import.meta.url), "utf8"));
  compiledChecks.push({ commit, path, matches });assert.ok(matches, `${commit} ${path} must match the CPU probe's compiled component`);
}
// Sign text rasterisation alone is stubbed. No browser, GPU, server or database.
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) };
const old = buildOld(), world = buildPlanet();
try {
  const outside = { x: -7.830898611031357, z: -2.0616035259021035 }, inside = { x: -7.835781102195635, z: -2.061627669947289 };
  const support = at => world.supportAt(at.x, at.z);
  const measure = at => ({ position: at, old: { height: old.heightAt(at.x, at.z), canStand: old.canStand(at.x, at.z, new Set()) },
    candidate: { ...support(at), canStand: world.canStand(at.x, at.z, new Set()) } });
  const moved = moveOnPlanet({ ...outside, yaw: bearingToward({ ...outside, yaw: 0 }, inside) }, 1, 0, .012, (x, z) => world.canStand(x, z, new Set()));
  const vector = point => new THREE.Vector3(point.x, point.y, point.z);
  const origin = vector(planetPoint(outside.x, outside.z, .265)), destination = vector(planetPoint(inside.x, inside.z, .265)), delta = destination.clone().sub(origin);
  world.root.updateMatrixWorld(true);
  const side = new THREE.Raycaster(origin, delta.clone().normalize(), 0, delta.length()).intersectObject(world.root, true)[0];
  const cafe = PLANET_PLACES.find(place => place.kind === "tea"), basis = planetBasis(cafe.x, cafe.z);
  const atLocal = z => { const p = vector(basis.up).multiplyScalar(R).addScaledVector(vector(basis.south), z);
    return { x: Math.atan2(p.x, p.z) * R, z: -Math.asin(p.y / p.length()) * R }; };
  let prior, historicalEdge;
  for (let z = 4.5; z <= 5.3; z += .001) {
    const point = atLocal(z), height = old.heightAt(point.x, point.z), canStand = old.canStand(point.x, point.z, new Set());
    if (prior && canStand && prior.canStand && Math.abs(height - prior.height) > (historicalEdge?.difference ?? 0))
      historicalEdge = { difference: Math.abs(height - prior.height), from: prior, to: { localZ: z, point, height, canStand } };
    prior = { localZ: z, point, height, canStand };
  }
  console.log(JSON.stringify({ type: "read-only-cpu-boundary-audit", sourceCommit: "8f32290", priorCommit: "40ed231", compiledChecks,
    scope: "Exact compiled component correspondence; real Three geometry and original movement function, sign canvas only stubbed. No GPU, browser, service or database.",
    samePoints: [measure(outside), measure(inside)], difference: support(inside).height - support(outside).height,
    acceptedSideMove: { ...moved, support: support(moved.position) }, opaqueFoundationSide: side ? { name: side.object.name, distance: side.distance } : null,
    historicalDeckBoundary: historicalEdge,
    interpretation: "The new stairs extend the stepped footprint at these points. Both versions permit the coordinates; the old tangent deck already has a larger height discontinuity at its own front edge. No gravity/step-height restriction is implemented or claimed.",
  }, null, 2));
} finally { old.dispose();world.dispose(); }
