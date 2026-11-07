# ADR 028 — Two paper views on the same world

Date: 2026-11-08. Status: implementing; actual browser comparison follows.

## Request

Wen asks to try both a 2D and a 2.5D version alongside the current 3D Little
Chorus. This explicitly reopens ADR026's decision to defer a flat renderer.
It does not request a replacement of identity, sound relationships or data.

## Decision

Offer a top-down illustrated **2D Storybook**, an isometric **2.5D Paper theatre**,
and the retained **3D Little planet**. They are local presentations of the same
`planet:morning`, not separate worlds. Canonical coordinates, sound authors,
response chains, removals, shared clock and occupancy admission remain unchanged.
2D and 2.5D use original procedural Canvas2D art; 2.5D has depth ordering and
upright paper silhouettes, rather than a Three.js scene with its camera tilted.
The existing controller, spatial audio, SSE, studio, chat and private-room UI
remain in use. No runtime dependency, image asset or schema migration is added.

The existing warm cream/sage/terracotta palette gives a fair comparison. The
UI/UX skill's first generic gaming recommendation was hyperreal 3D and did not
fit this request; an explicit organic-illustration search supported soft shapes,
readable contrast, low rendering cost and reduced-motion alternatives. This is
inspiration, not evidence that either new visual style succeeds.

`/planet?view=2d` and `/planet?view=2.5d` select a lens; `/2d` and `/2.5d` are
short redirects. `/planet` retains 3D. Desktop links live in the header; mobile
links are the first section in Places & friends so no extra HUD layer obscures
the world. Joining keeps the selected view. Switching views may consume a
15-second, identity-bound tab-local position handoff; it never puts coordinates
in URLs or rewrites stored source positions. A fresh document remains silent
until explicit local listening. Private stay sounds retain the normal leave
semantics rather than being revived across document reload.

## Tradeoffs and verification

The flat lenses project spherical coordinates onto a navigable map while
preserving the great-circle movement, distance and seam rules. This can distort
map scale at distant latitudes; it is a presentation cost, not a coordinate
migration. Keep close activity framing by default; an explicit overview fits
more places. A phone must show a recognisable character and reachable actions.

New checks should target inverse projection, canonical movement and collision,
one-time handoff, same-world identity/response consistency across lenses,
quiet preference, modal movement pause and real touch targets. Actual running
screenshots at 1920×1080 and 390×844 are required before calling the comparison
complete. A green check is not a verdict on visual appeal, fun or pleasantness.
The original preview/database stays untouched while writing tests use isolated
ports and databases. Application rollback always keeps the current database.
