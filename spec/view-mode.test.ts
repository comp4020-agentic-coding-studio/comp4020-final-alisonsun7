import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalFigure } from "../src/client/characters.ts";
import { interiorFigureFill, loadViewMode, rememberViewMode, thirdPersonCamera } from "../src/client/view-mode.ts";

afterEach(() => vi.unstubAllGlobals());

describe("view choice and a collision-safe third-person camera", () => {
  it("defaults to first person and remembers a valid explicit choice when storage works", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    expect(loadViewMode()).toBe("first");
    rememberViewMode("third");
    expect(loadViewMode()).toBe("third");
    rememberViewMode("first");
    expect(loadViewMode()).toBe("first");
    values.set("soac-view-mode", "untrusted");
    expect(loadViewMode()).toBe("first");
  });

  it("still loads safely when this browser denies local storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
    expect(loadViewMode()).toBe("first");
    expect(() => rememberViewMode("third")).not.toThrow();
  });

  it("orbits behind the same movement heading without moving the anchor and remains above the floor", () => {
    const anchor = new THREE.Vector3(0, 1.08, 0);
    const collision = { occluders: [], solids: [], floorHeight: () => 0 };
    const behind = thirdPersonCamera(anchor, 0, 0, collision);
    const side = thirdPersonCamera(anchor, Math.PI / 2, -0.3, collision);
    expect(behind.position.z).toBeCloseTo(3.4);
    expect(behind.position.x).toBeCloseTo(0);
    expect(side.position.x).toBeGreaterThan(3);
    expect(side.position.y).toBeGreaterThan(anchor.y);
    expect(anchor.toArray()).toEqual([0, 1.08, 0]);
    expect(thirdPersonCamera(anchor, 0, 0.75, collision).position.y).toBeGreaterThanOrEqual(0.28 - 1e-9);
  });

  it("shortens against actual wall geometry and solid door inserts instead of crossing them", () => {
    const anchor = new THREE.Vector3(0, 1.08, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.5, 2);
    const geometryHit = thirdPersonCamera(anchor, 0, 0, { occluders: [wall], solids: [], floorHeight: () => 0 });
    expect(geometryHit.position.z).toBeLessThan(1.9);
    expect(geometryHit.position.z).toBeGreaterThan(1.5);
    const doorHit = thirdPersonCamera(anchor, 0, 0, { occluders: [], solids: [{ x0: -0.5, x1: 0.5, z0: 1, z1: 1.1 }], floorHeight: () => 0 });
    expect(doorHit.position.z).toBeLessThan(0.9);
    expect(doorHit.position.z).toBeGreaterThan(0.1);
    expect(anchor.toArray()).toEqual([0, 1.08, 0]);
    wall.geometry.dispose(); (wall.material as THREE.Material).dispose();
  });
});

describe("players, residents and local interior light", () => {
  it("uses a blue player scarf and pin distinct from an ochre NPC without changing identity or grounded height", () => {
    const player = new AnimalFigure({ avatar: "dog", seed: "same-seed", height: 1, role: "player" });
    const npc = new AnimalFigure({ avatar: "dog", seed: "same-seed", height: 1, role: "npc" });
    const pin = (figure: AnimalFigure) => figure.getObjectByName("identity-pin") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(pin(player).material.color.getHex()).not.toBe(pin(npc).material.color.getHex());
    expect(player.getObjectByName("folded-olive-scarf")?.visible).toBe(true);
    expect(player.userData.figure.seed).toBe(npc.userData.figure.seed);
    for (const figure of [player, npc]) {
      const box = new THREE.Box3().setFromObject(figure);
      expect(box.min.y).toBeCloseTo(0, 5); expect(box.max.y).toBeCloseTo(1, 5);
    }
    npc.setRole("player");
    expect(pin(npc).material.color.getHex()).toBe(pin(player).material.color.getHex());
    expect(npc.getObjectByName("folded-olive-scarf")?.visible).toBe(true);
    player.dispose(); npc.dispose();
  });

  it("provides deterministic coat and wardrobe variety within one palette", () => {
    const variants = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const figure = new AnimalFigure({ avatar: "cat", seed: `wardrobe-${i}`, height: 1 });
      variants.add(`${figure.userData.figure.coat}:${figure.userData.figure.outfit}`);
      expect(figure.userData.figure.outfit).toBeLessThan(12);
      expect(figure.userData.figure.coat).toBeLessThan(10);
      figure.dispose();
    }
    expect(variants.size).toBeGreaterThan(12);
  });

  it("fills only interior figures at night and never changes another figure's shared material", () => {
    expect(interiorFigureFill(false, 1, 0.04)).toBe(0);
    expect(interiorFigureFill(true, 1, 0.04)).toBeGreaterThan(interiorFigureFill(true, 0, 1));
    const inside = new AnimalFigure({ avatar: "cat", seed: "local-light" });
    const outside = new AnimalFigure({ avatar: "cat", seed: "local-light" });
    const shirt = (figure: AnimalFigure) => (figure.getObjectByName("linen-shirt") as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(shirt(inside)).toBe(shirt(outside));
    inside.setInteriorLight(interiorFigureFill(true, 1, 0.04));
    expect(shirt(inside)).not.toBe(shirt(outside));
    expect(shirt(inside).emissive.getHex()).not.toBe(0);
    expect(shirt(outside).emissive.getHex()).toBe(0);
    inside.setInteriorLight(0);
    expect(shirt(inside).emissive.getHex()).toBe(0);
    expect(shirt(outside).emissive.getHex()).toBe(0);
    inside.dispose(); outside.dispose();
  });
});
