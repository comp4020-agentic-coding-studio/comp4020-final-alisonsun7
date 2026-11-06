// What a walkable place gives the world view: its shell and furniture, how
// to tell which zone you're in and whether you're indoors, where passers-by
// walk, where rain falls, and (optionally) a photographed sky per mode.
import type { Light } from "./sky.js";
import type { Pose } from "./figures.js";
import type { Built } from "./world-build.js";

// A room within a place. A private one (a toilet or shower) is for one
// person at a time, who may leave its `sound` for while they're in (ADR 013).
export interface Room {
  id: string;
  name: string;
  private: boolean;
  sound?: string;
  door: { x: number; z: number };
}

export interface Regular {
  x: number;
  z: number;
  pose: Pose;
  // Body yaw in radians, with +Z as the figure's front. Independent of the visitor.
  facing?: number;
  // a pose they turn to now and then, like a barista to the machine
  alt?: Pose;
  // somewhere else they walk to now and then, and back (staff at work)
  roam?: [number, number];
}

export interface PlaceKit {
  // walls, floors and anything drawn from shapes: ready at once
  build(): Built;
  // models loaded afterwards; `progress` goes from 0 to 1
  furnish?(built: Built, progress: (done: number) => void): Promise<void>;
  zoneAt(x: number, z: number): string;
  isInside(x: number, z: number): boolean;
  // each a walk there and back, in metres on the floor
  passerPaths: [number, number][][];
  // people who stay put (sitting, queuing, chatting), per mode; like
  // passers-by they have no names. Mateo's guitar is the sole sound exception.
  regulars?: Partial<Record<string, Regular[]>>;
  // where children stand passing a beach ball between them, if anywhere
  ballGame?: [number, number][];
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
  // moving water, doors and the like, every frame (seconds since the page
  // opened, and where the people in the place are standing; `me` is you)
  animate?(seconds: number, people: { x: number; z: number; me?: boolean }[]): void;
  // a room with a door inside the place (a toilet, a shower, a shop) that
  // (x, z) is in, if any
  roomAt?(x: number, z: number): Room | undefined;
  // If you've wandered too far from where you're meant to walk, the nearest
  // point back on it, and which way to face there; otherwise null.
  offTrail?(x: number, z: number): { x: number; z: number; yaw: number } | null;
  // close enough again for whoever came to find you to leave
  onTrail?(x: number, z: number): boolean;
}
