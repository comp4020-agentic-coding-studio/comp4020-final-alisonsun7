import * as THREE from "three";
import type { Rect } from "./world-build.js";

export type ViewMode = "first" | "third";
const KEY = "soac-view-mode";

export function loadViewMode(): ViewMode {
  try { return localStorage.getItem(KEY) === "third" ? "third" : "first"; }
  catch { return "first"; }
}

export function rememberViewMode(mode: ViewMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* remains available this visit */ }
}

interface CameraCollision {
  occluders: THREE.Object3D[];
  solids: readonly Rect[];
  circles?: readonly { x: number; z: number; r: number }[];
  floorHeight: (x: number, z: number) => number;
}

const ray = new THREE.Raycaster();

/** A camera boom, not a player move: never changes coordinates or admission. */
export function thirdPersonCamera(anchor: THREE.Vector3, yaw: number, pitch: number, collision: CameraCollision, distance = 3.4): { position: THREE.Vector3; distance: number } {
  const orbitPitch = THREE.MathUtils.clamp(pitch, -0.85, 0.45);
  const desired = anchor.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(orbitPitch), -Math.sin(orbitPitch), Math.cos(yaw) * Math.cos(orbitPitch)).multiplyScalar(distance));
  desired.y = Math.max(collision.floorHeight(desired.x, desired.z) + 0.28, desired.y);
  const direction = desired.clone().sub(anchor);
  let available = direction.length();
  direction.normalize();
  for (const object of collision.occluders) object.updateWorldMatrix(true, true);
  // Centre and near-plane corners prevent a wall clipping the picture's edge.
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.16);
  for (const offset of [new THREE.Vector3(), right, right.clone().negate(), new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(0, -0.13, 0)]) {
    ray.set(anchor.clone().add(offset), direction);
    ray.near = 0.01; ray.far = available + 0.16;
    const hit = ray.intersectObjects(collision.occluders, true)[0];
    if (hit) available = Math.min(available, Math.max(0.12, hit.distance - 0.18));
  }
  // Collision rectangles also cover solid doorway inserts that have no mesh.
  // They conservatively stop the boom even if its centre ray misses an edge.
  for (let d = 0.08; d <= available; d += 0.08) {
    const p = anchor.clone().addScaledVector(direction, d);
    const blocked = collision.solids.some(s => p.x > s.x0 - 0.16 && p.x < s.x1 + 0.16 && p.z > s.z0 - 0.16 && p.z < s.z1 + 0.16)
      || collision.circles?.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.16);
    if (blocked) { available = Math.max(0.12, d - 0.12); break; }
  }
  return { position: anchor.clone().addScaledVector(direction, available), distance: available };
}

/** Local warm readability under existing room lights; outside remains dark. */
export function interiorFigureFill(inside: boolean, stars: number, environment: number): number {
  if (!inside) return 0;
  const night = Math.max(THREE.MathUtils.clamp(stars, 0, 1), 1 - THREE.MathUtils.clamp(environment / 0.5, 0, 1));
  return 0.025 + night * 0.155;
}
