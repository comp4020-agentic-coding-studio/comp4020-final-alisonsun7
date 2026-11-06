// The light for each time of day. The world is drawn, not photographed, so
// the hour is in the light itself: where the sun is, how long and what colour
// the shadows are, whether the lamps are on, how much haze there is.
//
// What makes early morning read as morning (and the old colour grade over a
// night photo couldn't do): the sky is the brightest thing in view, the sun
// is low and warm so shadows are long and blue, the lamps are off, and the
// distance is soft with mist.

export interface Light {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  // direction the sunlight comes FROM (x east, y up, z south), and its glow
  // on the sky
  sunDir: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  sunGlow: number;
  shadows: boolean;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  // indoor ceiling lights and the outdoor lamp
  ceiling: number;
  ceilingIntensity: number;
  lamp: number;
  lampIntensity: number;
  // glass and paving
  windowGlow: number;
  wet: boolean;
  // unlit figures are tinted so they sit in the light rather than glow
  figureTint: number;
  exposure: number;
}

export const LIGHTS: Record<string, Light> = {
  // About 6:45 in spring. The sun is low in the north-east: it lights the
  // library's front and the bridge, rakes in through Marie Reay's north
  // glass, and leaves the paving by the door in the building's long shadow.
  morning: {
    skyTop: 0x8fb9df,
    skyHorizon: 0xf8d2a8,
    skyBottom: 0xe9c7a6,
    sunDir: [0.5, 0.26, -0.82],
    sunColor: 0xffcf94,
    sunIntensity: 3.1,
    sunGlow: 0.85,
    shadows: true,
    hemiSky: 0xc9dcef,
    hemiGround: 0x9a8268,
    hemiIntensity: 1.3,
    fog: 0xecd6c0,
    fogNear: 18,
    fogFar: 110,
    ceiling: 0xfff1dc,
    ceilingIntensity: 0.25,
    lamp: 0x000000,
    lampIntensity: 0,
    windowGlow: 0.05,
    wet: false,
    figureTint: 0xfff0e0,
    exposure: 1.05,
  },
  // A clear coastal afternoon: warm light, blue shade and a pale sea horizon.
  weekday: {
    skyTop: 0x528eb5,
    skyHorizon: 0xf1e9d7,
    skyBottom: 0xc8d7ce,
    sunDir: [0.62, 0.48, 0.58],
    sunColor: 0xffe8c5,
    sunIntensity: 2.3,
    sunGlow: 0.12,
    shadows: true,
    hemiSky: 0xd4e7e4,
    hemiGround: 0x9d9d7d,
    hemiIntensity: 1.6,
    fog: 0xd0dfe0,
    fogNear: 75,
    fogFar: 440,
    ceiling: 0xffffff,
    ceilingIntensity: 0.9,
    lamp: 0x000000,
    lampIntensity: 0,
    windowGlow: 0,
    wet: false,
    figureTint: 0xffffff,
    exposure: 1,
  },
  // After rain at dusk: no sun, dark blue air, lamps and windows on, wet
  // paving that shines.
  "rainy-dusk": {
    skyTop: 0x1d2738,
    skyHorizon: 0x55607a,
    skyBottom: 0x2a3140,
    sunDir: [-0.7, 0.35, 0.2],
    sunColor: 0x8a9cc0,
    sunIntensity: 0.35,
    sunGlow: 0,
    shadows: false,
    hemiSky: 0x5a6a8c,
    hemiGround: 0x2a2a30,
    hemiIntensity: 0.75,
    fog: 0x3a4459,
    fogNear: 8,
    fogFar: 75,
    ceiling: 0xffe2b8,
    ceilingIntensity: 1.1,
    lamp: 0xffcf8a,
    lampIntensity: 40,
    windowGlow: 1,
    wet: true,
    figureTint: 0xa9b3c8,
    exposure: 1.1,
  },
};

// The light just before dawn, which morning rises out of when you arrive.
export const BEFORE_DAWN: Light = {
  ...LIGHTS["rainy-dusk"],
  skyTop: 0x1a2440,
  skyHorizon: 0x4a5272,
  sunDir: [0.55, 0.02, -0.83],
  sunColor: 0xff9c6a,
  sunIntensity: 0.2,
  sunGlow: 0.3,
  shadows: true,
  lamp: 0xffcf8a,
  lampIntensity: 25,
  wet: false,
  fog: 0x4a5068,
};

export function lightFor(mode: string): Light {
  return LIGHTS[mode] ?? LIGHTS.weekday;
}

// Blend two lights (t from 0 to 1), for the sunrise on arrival.
export function mixLight(a: Light, b: Light, t: number): Light {
  const c = (x: number, y: number): number => {
    const ch = (s: number): number => {
      const p = (x >> s) & 255;
      const q = (y >> s) & 255;
      return Math.round(p + (q - p) * t) << s;
    };
    return ch(16) | ch(8) | ch(0);
  };
  const n = (x: number, y: number): number => x + (y - x) * t;
  return {
    skyTop: c(a.skyTop, b.skyTop),
    skyHorizon: c(a.skyHorizon, b.skyHorizon),
    skyBottom: c(a.skyBottom, b.skyBottom),
    sunDir: [n(a.sunDir[0], b.sunDir[0]), n(a.sunDir[1], b.sunDir[1]), n(a.sunDir[2], b.sunDir[2])],
    sunColor: c(a.sunColor, b.sunColor),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    sunGlow: n(a.sunGlow, b.sunGlow),
    shadows: b.shadows,
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiGround: c(a.hemiGround, b.hemiGround),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    fog: c(a.fog, b.fog),
    fogNear: n(a.fogNear, b.fogNear),
    fogFar: n(a.fogFar, b.fogFar),
    ceiling: c(a.ceiling, b.ceiling),
    ceilingIntensity: n(a.ceilingIntensity, b.ceilingIntensity),
    lamp: c(a.lamp, b.lamp),
    lampIntensity: n(a.lampIntensity, b.lampIntensity),
    windowGlow: n(a.windowGlow, b.windowGlow),
    wet: t < 0.5 ? a.wet : b.wet,
    figureTint: c(a.figureTint, b.figureTint),
    exposure: n(a.exposure, b.exposure),
  };
}
