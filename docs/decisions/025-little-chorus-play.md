# 025 — Little Chorus keeps the coast and the playable sound loop

Wen rejected the first Soundfolk sphere: running and jumping were absent,
Respond to sound had become undiscoverable, the sea and kangaroo encounter
were missing, and the scene and play fell far short of Little Ritual.
Wen selected **Little Chorus (小小合鸣)** on 2026-11-07. This replaces the
public Soundfolk name in ADR024. Existing cookie, storage keys, account,
scene IDs, room IDs, coordinates and persistent contributions are retained.
Only the planet catalogue title changes as brand metadata.

Restore play before calling another art pass complete:

- Shift running and Space jumping on the spherical controller, with touch
  equivalents. Share bounded transient running/jump pose through existing
  movement SSE; never bypass walls or the authoritative restroom gate.
- Real sound pins show authorship and a direct **Respond to sound** action.
  Restore conversation browsing and spherical reply connections. Approaching
  a contribution never publishes or teleports the person through architecture.
  Preserve explicit placement, operation IDs and removed-source precedence.
- Restore an actual coastal water/beach/pier composition and an interactive
  kangaroo companion, keeping the nine existing destination anchors. Its
  local companion behaviour must not masquerade as shared human activity.
- Author clear building silhouettes, connected paths, planting groups and
  layered coastal geometry in the established painted palette. Inspect actual
  first/third-person and phone rendering, rather than using a concept cover
  as proof of the running result.

Little Ritual's [official process](https://developers.openai.com/showcase/little-ritual)
informs the order: playable central action, expressive inhabitants, authored
places, movement/camera refinement, then optimization. Its generated cover
illustration is not gameplay evidence. We do not claim to duplicate its
Blender asset pipeline or attain identical artwork.

The old coast remains available and its existing interactions and history stay
intact. Develop on `codex/little-chorus-play` with a separate build/database on
port18882. `before-little-chorus-play-2026-11-07` preserves the rejected first
sphere at `a65cead`; ignored `.cache/chorus-baseline/dist` retains the compiled
previous preview. Rollback keeps the current database. No push or deployment.
