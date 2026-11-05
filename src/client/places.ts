// What a walkable place gives the world view: its shell and furniture, how
// to tell which zone you're in and whether you're indoors, where passers-by
// walk, where rain falls, and (optionally) a photographed sky per mode.
import type { Light } from "./sky.js";
import type { Ambience } from "./synth.js";
import type { Built } from "./world-build.js";

export interface PlaceKit {
  // walls, floors and anything drawn from shapes: ready at once
  build(): Built;
  // models loaded afterwards; `progress` goes from 0 to 1
  furnish?(built: Built, progress: (done: number) => void): Promise<void>;
  zoneAt(x: number, z: number): string;
  isInside(x: number, z: number): boolean;
  // each a walk there and back, in metres on the floor
  passerPaths: [number, number][][];
  // a random point that rain falls on (nowhere with a roof)
  rainAt(random: () => number): [number, number];
  // what the sun's shadows are centred on, and (per mode) where the sun is
  // if not where sky.ts puts it
  sunTarget: [number, number, number];
  sunDirs?: Partial<Record<string, [number, number, number]>>;
  // other changes to a mode's light for this place (a place with a far
  // horizon wants its mist further off)
  light?: Partial<Record<string, Partial<Light>>>;
  // an HDR sky per mode, used as the background and to light the models
  skies?: Partial<Record<string, { url: string; intensity: number }>>;
  // how many raindrops (default 2400), for a place bigger than a street
  rainCount?: number;
  // the background where you stand, if it changes across the place (the
  // forest, the sea, the café); undefined keeps the mode's own
  ambienceAt?(x: number, z: number, mode: string): Ambience | undefined;
  // moving water and the like, every frame (seconds since the page opened)
  animate?(seconds: number): void;
}
