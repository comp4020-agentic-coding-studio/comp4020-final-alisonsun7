import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundConnections } from "../src/client/sound-connections.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";

const source = (id: string, x: number, patch: Partial<PlacedSound> = {}): PlacedSound => ({ id, soundId: "beach-waves", x, z: 0, by: "Ada", byId: "person-a", at: "2026-11-07T01:00:00.000Z", ...patch });
const parent = source("parent", 0);
const child = source("child", 6, { soundId: "coastal-gulls", replyToId: parent.id, replyTo: parent });
const listener = { x: 3, z: 0 };
const silent = new Set<string>();
const threads = (root: THREE.Object3D): THREE.LineSegments => root.getObjectByName("sound-reply-threads") as THREE.LineSegments;
const beads = (root: THREE.Object3D): THREE.InstancedMesh => root.getObjectByName("sound-reply-playing") as THREE.InstancedMesh;

afterEach(() => vi.unstubAllGlobals());

describe("reply threads in the shared place", () => {
  it("binds both ends to actual raised floor surfaces without changing sound positions", () => {
    const root = new THREE.Group();
    const floors = [0, 6].map((x, i) => {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, i ? 1.2 : 0.4, 0);
      floor.updateMatrixWorld(true);
      return floor;
    });
    const surface = (x: number, z: number): number => new THREE.Raycaster(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0)).intersectObjects(floors)[0]!.point.y;
    const connections = new SoundConnections(root, surface);
    const before = JSON.stringify([parent, child]);
    connections.setAll([parent, child]);
    expect(connections.frame(listener, false, silent)).toBe(1);
    const line = threads(root);
    const points = line.geometry.getAttribute("position");
    const last = line.geometry.drawRange.count - 1;
    expect([points.getX(0), points.getZ(0)]).toEqual([parent.x, parent.z]);
    expect(points.getY(0)).toBeCloseTo(0.46);
    expect([points.getX(last), points.getZ(last)]).toEqual([child.x, child.z]);
    expect(points.getY(last)).toBeCloseTo(1.26);
    let risesAboveFloorEnds = false;
    for (let i = 0; i <= last; i++) {
      expect([points.getX(i), points.getY(i), points.getZ(i)].every(Number.isFinite)).toBe(true);
      if (points.getY(i) > 0.46 + (1.26 - 0.46) * points.getX(i) / 6 + 0.05) risesAboveFloorEnds = true;
    }
    expect(risesAboveFloorEnds).toBe(true);
    expect((line.material as THREE.LineBasicMaterial).depthTest).toBe(true);
    expect((line.material as THREE.LineBasicMaterial).depthWrite).toBe(false);
    expect(JSON.stringify([parent, child])).toBe(before);
    connections.dispose();
    for (const floor of floors) { floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); }
  });

  it("requires two live ordinary endpoints, and removes the relation when a parent goes away", () => {
    const root = new THREE.Group();
    const connections = new SoundConnections(root, () => 0);
    const removedAt = "2026-11-07T01:01:00.000Z";
    const excluded: PlacedSound[][] = [
      [child],
      [parent, { ...child, whileIn: "toilet" }],
      [{ ...parent, whileIn: "shower" }, child],
      [parent, { ...child, removedAt }],
      [{ ...parent, removedAt }, child],
      [parent, { ...child, replyTo: { ...parent, removedAt } }],
      [parent, { ...child, x: 70 }],
    ];
    for (const sounds of excluded) {
      connections.setAll([parent, child]);
      expect(connections.frame(listener, false, silent)).toBe(1);
      connections.setAll(sounds);
      expect(connections.frame(listener, false, silent)).toBe(0);
      expect(threads(root).visible).toBe(false);
      expect(threads(root).geometry.drawRange.count).toBe(0);
    }
    connections.setAll([parent, child]);
    expect(connections.frame({ x: 200, z: 200 }, true, new Set([child.id]))).toBe(0);
    expect(beads(root).count).toBe(0);
    connections.dispose();
  });

  it("only animates an actually playing child in a visible, unmuted, ordinary-motion page", () => {
    const root = new THREE.Group();
    const connections = new SoundConnections(root, () => 0);
    let reduce = false, pageHidden = false;
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
    vi.stubGlobal("document", { get hidden() { return pageHidden; } });
    connections.setAll([parent, child]);
    connections.frame(listener, true, silent, 0);
    expect(beads(root).count).toBe(0);
    connections.frame(listener, true, new Set([parent.id]), 0);
    expect(beads(root).count).toBe(0);
    connections.frame(listener, true, new Set([child.id]), 0);
    expect(beads(root).count).toBe(1);
    const before = new THREE.Matrix4();
    beads(root).getMatrixAt(0, before);
    connections.frame(listener, true, new Set([child.id]), 1200);
    const after = new THREE.Matrix4();
    beads(root).getMatrixAt(0, after);
    expect(after.elements).not.toEqual(before.elements);
    connections.frame(listener, false, new Set([child.id]));
    expect(beads(root).count).toBe(0);
    reduce = true;
    expect(connections.frame(listener, true, new Set([child.id]))).toBe(1);
    expect(beads(root).count).toBe(0);
    reduce = false; pageHidden = true;
    expect(connections.frame(listener, true, new Set([child.id]))).toBe(1);
    expect(beads(root).count).toBe(0);
    connections.dispose();
  });

  it("refreshes a moved endpoint and releases its batched resources exactly once", () => {
    const root = new THREE.Group();
    const connections = new SoundConnections(root, (x) => x / 10);
    connections.setAll([parent, child]);
    connections.frame(listener, false, silent);
    connections.setAll([parent, { ...child, x: 9 }]);
    connections.frame(listener, false, silent);
    const line = threads(root), dots = beads(root);
    const end = line.geometry.drawRange.count - 1;
    expect(line.geometry.getAttribute("position").getX(end)).toBe(9);
    expect(line.geometry.getAttribute("position").getY(end)).toBeCloseTo(0.96);
    const disposed = [line.geometry, line.material, dots.geometry, dots.material, dots].map((resource) => {
      const spy = vi.fn();
      (resource as unknown as THREE.EventDispatcher<{ dispose: {} }>).addEventListener("dispose", spy);
      return spy;
    });
    connections.dispose(); connections.dispose();
    expect(root.children).toHaveLength(0);
    for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
    connections.setAll([parent, child]);
    expect(connections.frame(listener, true, new Set([child.id]))).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});
