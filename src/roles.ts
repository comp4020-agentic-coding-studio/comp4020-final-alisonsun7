import { CATEGORIES, type Category } from "./validation.js";

export type RoleCounts = Record<Category, number>;

export const emptyRoleCounts = (): RoleCounts => ({ WHERE: 0, EAT: 0, DO: 0 });

// Least-populated category, ties broken randomly — used both when a
// participant joins and when a migration backfills roles for rows that
// predate the role column, so both paths balance the same way.
export function pickLeastPopulated(counts: RoleCounts, random: () => number = Math.random): Category {
  const min = Math.min(...CATEGORIES.map((c) => counts[c]));
  const candidates = CATEGORIES.filter((c) => counts[c] === min);
  return candidates[Math.floor(random() * candidates.length)];
}
