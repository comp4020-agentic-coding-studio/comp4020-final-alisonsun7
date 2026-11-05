// What a walkable place gives the world view: its shell and furniture, how
// to tell which zone you're in and whether you're indoors, where passers-by
// walk, where rain falls, and (optionally) a photographed sky per mode.
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
  // an HDR sky per mode, used as the background and to light the models
  skies?: Partial<Record<string, { url: string; intensity: number }>>;
}
