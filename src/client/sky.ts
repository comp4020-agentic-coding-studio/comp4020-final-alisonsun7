// The light for each time of day. The world is drawn, not photographed, so
// the hour is in the light itself: where the sun is, how long and what colour
// the shadows are, whether the lamps are on, how much haze there is.
//
// What makes early morning read as morning (and the old colour grade over a
// night photo couldn't do): the sky is the brightest thing in view, the sun
// is low and warm so shadows are long and blue, the lamps are off, and the
// distance is soft with mist.
import type { Weather } from "../shared/environment.js";

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
  environment: number;
  stars: number;
  cloudCover: number;
  wetness: number;
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
    environment: 0.28,
    stars: 0,
    cloudCover: 0,
    wetness: 0,
  },
  // A clear coastal afternoon: warm light, blue shade and a pale sea horizon.
  weekday: {
    skyTop: 0x4d95d4,
    skyHorizon: 0xc3d8e6,
    skyBottom: 0xadc7cf,
    sunDir: [0.62, 0.48, 0.58],
    sunColor: 0xffdfad,
    sunIntensity: 3.0,
    sunGlow: 0.12,
    shadows: true,
    hemiSky: 0xcbdcde,
    hemiGround: 0x949780,
    hemiIntensity: 1.1,
    fog: 0xc7d5d2,
    fogNear: 65,
    fogFar: 380,
    ceiling: 0xffdfa5,
    ceilingIntensity: 0.65,
    lamp: 0x000000,
    lampIntensity: 0,
    windowGlow: 0,
    wet: false,
    figureTint: 0xffffff,
    exposure: 1.08,
    environment: 0.28,
    stars: 0,
    cloudCover: 0,
    wetness: 0,
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
    environment: 0.08,
    stars: 0.7,
    cloudCover: 0.8,
    wetness: 1,
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
  environment: 0.04,
  stars: 0.8,
  cloudCover: 0,
  wetness: 0,
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
    environment: n(a.environment, b.environment),
    stars: n(a.stars, b.stars),
    cloudCover: n(a.cloudCover, b.cloudCover),
    wetness: n(a.wetness, b.wetness),
  };
}

// One coastal place throughout the day. The former route modes are not
// revived: this is a continuous light clock shared by the existing room.
const NIGHT: Light = {
  ...LIGHTS.weekday,
  skyTop: 0x101b35, skyHorizon: 0x53647e, skyBottom: 0x283b51,
  sunDir: [0.38, 0.62, -0.69], sunColor: 0xb9d3ef,
  sunIntensity: 0.2, sunGlow: 0, shadows: false,
  hemiSky: 0x8199b7, hemiGround: 0x46525a, hemiIntensity: 0.85,
  fog: 0x344b61, fogNear: 45, fogFar: 310,
  ceiling: 0xffddb2, ceilingIntensity: 1.15,
  lamp: 0xffcf8a, lampIntensity: 32, windowGlow: 0.75,
  figureTint: 0xbbcee0, exposure: 1.08, environment: 0.035, stars: 1,
};
const DAWN: Light = {
  ...LIGHTS.morning,
  skyTop: 0x667da8, skyHorizon: 0xf4bb99, skyBottom: 0xb2aaa7,
  sunDir: [0.82, 0.12, -0.5], sunIntensity: 1.45, sunGlow: 0.42,
  fogNear: 45, fogFar: 310, hemiIntensity: 1.1,
  lamp: 0xffcf8a, lampIntensity: 12, ceilingIntensity: 0.85,
  windowGlow: 0.3, environment: 0.16, stars: 0.08,
};
const SUNSET: Light = {
  ...LIGHTS.weekday,
  skyTop: 0x526d98, skyHorizon: 0xf2b88f, skyBottom: 0xbba49c,
  sunDir: [-0.82, 0.1, 0.5], sunColor: 0xffbc7d,
  sunIntensity: 1.3, sunGlow: 0.5,
  hemiSky: 0xaebcd3, hemiGround: 0x9b7c69, hemiIntensity: 1.1,
  fog: 0xb3b9c6, fogNear: 60, fogFar: 380,
  ceiling: 0xffdfb5, ceilingIntensity: 1,
  lamp: 0xffcf8a, lampIntensity: 16, windowGlow: 0.4,
  figureTint: 0xf0d5c3, environment: 0.14, stars: 0.02,
};
const HOURS: [number, Light][] = [
  [0, NIGHT], [285, NIGHT], [360, DAWN],
  [480, { ...LIGHTS.morning, sunDir: [0.8, 0.4, -0.3], fogNear: 65, fogFar: 400 }],
  [840, LIGHTS.weekday],
  [1020, { ...LIGHTS.weekday, sunDir: [-0.65, 0.4, 0.58], sunColor: 0xffd5a4, sunGlow: 0.2 }],
  [1110, SUNSET], [1200, NIGHT], [1440, NIGHT],
];

export function environmentLight(minuteOfDay: number, weather: Weather): Light {
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  const next = HOURS.findIndex(([at]) => at > minute);
  const [aTime, a] = HOURS[Math.max(0, next - 1)];
  const [bTime, b] = HOURS[next < 0 ? HOURS.length - 1 : next];
  const t = Math.max(0, Math.min(1, (minute - aTime) / Math.max(1, bTime - aTime)));
  const light = mixLight(a, b, t * t * (3 - 2 * t));
  if (weather === "clear") return light;
  const night = light.stars;
  const palette = mixLight({
    ...light, skyTop: 0x8b9eaa, skyHorizon: 0xc8cecc,
    skyBottom: 0xb0bfbd, hemiSky: 0xc3d0d4, fog: 0xb4c4c7,
  }, {
    ...light, skyTop: 0x24334b, skyHorizon: 0x596779,
    skyBottom: 0x344457, hemiSky: 0x7a8ca5, fog: 0x405269,
  }, night);
  const overcast: Light = {
    ...palette,
    sunIntensity: light.sunIntensity * 0.32,
    sunGlow: light.sunGlow * 0.08,
    shadows: false,
    hemiIntensity: light.hemiIntensity * 0.92,
    environment: light.environment * 0.55,
    stars: 0,
    cloudCover: 0.9,
  };
  if (weather === "cloudy") return mixLight(light, overcast, 0.82);
  if (weather === "rain") return {
    ...overcast, fogNear: 20, fogFar: 190,
    wet: true, wetness: 1, exposure: light.exposure * 0.96,
    lamp: 0xffcf8a, lampIntensity: Math.max(8, light.lampIntensity),
    ceilingIntensity: Math.max(0.95, light.ceilingIntensity),
  };
  // A low, luminous sea mist; enough range remains to follow the path and
  // recognise nearby people. It does not create indoor particles.
  return {
    ...mixLight(light, overcast, 0.6),
    fogNear: 9, fogFar: 105, sunGlow: light.sunGlow * 0.2,
    sunIntensity: light.sunIntensity * 0.58,
    environment: light.environment * 0.65, stars: 0,
    cloudCover: 0.58,
  };
}
