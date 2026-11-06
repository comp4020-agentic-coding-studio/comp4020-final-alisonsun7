import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { WorldView } from "../src/client/world.ts";
import { CoastalRenderer } from "../src/client/coastal-renderer.ts";

describe("rendering on a changing or limited device", () => {
  it("continues monitoring after a healthy view so a later heavy view can lower quality", () => {
    const view = {
      bornAt: 0, perf: { frames: 60, since: 5000, lowered: 0 },
      renderer: { setPixelRatio: vi.fn(), shadowMap: { enabled: true } },
      picture: { setQuality: vi.fn() }, sun: { castShadow: true },
      qualityShadows: true, resize: vi.fn(),
    };
    const adapt = (WorldView.prototype as unknown as { adaptQuality(now: number): void }).adaptQuality;
    adapt.call(view, 7001);
    expect(view.perf.lowered).toBe(0);
    view.perf.frames = 1;
    adapt.call(view, 9202);
    expect(view.picture.setQuality).toHaveBeenCalledWith(false);
    expect(view.renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(view.resize).toHaveBeenCalledOnce();
    view.perf.frames = 1;
    adapt.call(view, 11403);
    expect(view.renderer.setPixelRatio).toHaveBeenLastCalledWith(0.5);
    expect(view.renderer.shadowMap.enabled).toBe(false);
    expect(view.qualityShadows).toBe(false);
  });

  it("keeps the ordinary lit renderer when floating-point color targets are unavailable", () => {
    const renderer = { extensions: { has: vi.fn(() => false) }, render: vi.fn() };
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const picture = new CoastalRenderer(renderer as unknown as THREE.WebGLRenderer, scene, camera);
    picture.resize(375, 812);
    picture.setQuality(false);
    picture.render();
    expect(renderer.extensions.has).toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledExactlyOnceWith(scene, camera);
  });
});
