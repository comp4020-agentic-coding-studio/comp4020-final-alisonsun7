import { describe, expect, it } from "vitest";
import { DataUtils } from "three";
import { separateSkySun } from "../src/client/sky.ts";

describe("the HDR sky supplies ambient light separately from the moving sun", () => {
  for (const half of [false, true]) it(`retains normal sky radiance and sun hue without unshadowed solar energy (${half ? "half" : "float"})`, () => {
    const original = [0.08, 0.17, 0.32, 1, 32000, 16000, 8000, 0.7];
    const pixels = half ? new Uint16Array(original.map(DataUtils.toHalfFloat)) : new Float32Array(original);
    const before = pixels.slice();
    separateSkySun(pixels);
    const values = Array.from(pixels, v => half ? DataUtils.fromHalfFloat(v) : v);
    expect(Array.from(pixels.slice(0, 4))).toEqual(Array.from(before.slice(0, 4)));
    expect(pixels[7]).toBe(before[7]);
    const luminance = values[4] * 0.2126 + values[5] * 0.7152 + values[6] * 0.0722;
    expect(luminance).toBeGreaterThan(2);
    expect(luminance).toBeLessThan(33);
    expect(values[4] / values[5]).toBeCloseTo(2, 2);
    expect(values[5] / values[6]).toBeCloseTo(2, 2);
    expect(values.every(Number.isFinite)).toBe(true);
  });
});
