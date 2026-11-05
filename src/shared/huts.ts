// The five huts on the boardwalk (client/huts.ts draws them), shared with
// the server so it can tell who is inside the toilets and showers (ADR 013).
// Metres: x east, z south. Each is 3.2 m wide and 3.9 m deep, its door on
// the boardwalk side (+z).

export type HutKind = "mens-toilet" | "womens-toilet" | "mens-shower" | "womens-shower" | "shop";

export interface Hut {
  id: string;
  kind: HutKind;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  // where its door is, along x
  door: { x0: number; x1: number };
  // a window in the front wall, if it has one
  window?: { x0: number; x1: number; y0: number; y1: number };
}

export const HUT_W = 3.2;
export const HUT_WALL = 0.1;

const KINDS: { kind: HutKind; name: string; door: number }[] = [
  { kind: "mens-toilet", name: "the men's toilets", door: 1.1 },
  { kind: "womens-toilet", name: "the women's toilets", door: 1.1 },
  { kind: "mens-shower", name: "the men's showers", door: 1.1 },
  { kind: "womens-shower", name: "the women's showers", door: 1.1 },
  { kind: "shop", name: "the souvenir shop", door: 0.4 },
];

export const HUTS: Hut[] = KINDS.map((k, i) => {
  const x0 = 15 + i * 4.2;
  const door = { x0: x0 + k.door, x1: x0 + k.door + 1.0 };
  const window = k.kind === "shop" ? { x0: door.x1 + 0.4, x1: x0 + HUT_W - 0.3, y0: 0.9, y1: 1.95 } : undefined;
  return { id: k.kind, kind: k.kind, name: k.name, x0, x1: x0 + HUT_W, z0: -8.5, z1: -4.6, door, window };
});

// The hut whose walls (x, z) is inside, if any.
export const hutAt = (x: number, z: number): Hut | undefined => HUTS.find((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);

// Toilets and showers are private: one sound each for whoever is inside,
// which goes when they come out.
export const isPrivate = (h: Hut): boolean => h.kind !== "shop";
export const privateSound = (h: Hut): string | undefined => (h.kind.endsWith("toilet") ? "toilet-flush" : h.kind.endsWith("shower") ? "shower" : undefined);
