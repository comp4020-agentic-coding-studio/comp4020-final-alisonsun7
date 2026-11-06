# 021 — Asset-led correction after the second D rejection

2026-11-07. Wen rejected the resemblance again and explicitly asked to borrow
useful skills, texture libraries and generation. Free movement in real 3D
remains the chosen implementation. No image is used as a scene backdrop.

## Resources and scope

The original project rules admit only CC0/public-domain external assets. The
new original generated fur texture is separately authorized by Wen's current
instruction; it is not mislabeled CC0. Its prompt and SHA256 are in the asset
manifest. A generated pine atlas was evaluated and rejected for its edges.
Yughues/Nobiax's CC0 branch #28 is used instead, with the archive's licence
retained in `docs/asset-licenses/`. Its native TGA-to-PNG conversion preserves
the real alpha channel. #27 was inspected and rejected for the hero pines:
its broad leaves do not resemble needles. Only #28 ships.

Read and adapted the public [Three.js materials and lighting skill](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/web-engines/threejs-materials-lighting/SKILL.md)
and [Three.js game director / graphics guidance](https://github.com/majidmanzarpour/threejs-game-skills).
These are reference instructions, not new runtime dependencies. Their newer
Three.js examples are checked against this project's installed r170 source;
the engine stays at 0.170.0. No third-party installer scripts are executed.
Refused download endpoints are not bypassed. No paid 3D generation API is
configured, so no generated 3D model is claimed.

## Visual implementation and review

Needle-bearing cutout twigs bend and grow at different orientations around
real woody branches. No billboard stands for a complete tree. Alpha-tested
depth/distance materials preserve needle-shaped shadows. The r170 SSAO
normal override does not respect each leaf's alpha; those leaves are hidden
only during this auxiliary pass to avoid opaque rectangular contact shade.

The western deck, rail, bank, shoreline, water shader and pedestrian route
are narrowed together. Eastern beach play, huts and forest bridge stay in
the same place. Stored contribution coordinates are never moved. The cafe
uses its original scanned PBR surfaces without a global desaturating shader,
with small eased timber edges, single-layer glass and warm paper lamps.
Original 3D character anatomy and materials are reviewed in the actual scene.

The first new GPU screenshot exposed an oversized foreground trunk and a
planter obscuring the musician. Those are failures to correct, not acceptance
evidence. Compare the actual 1672 × 941 camera with D before promoting. A
frame-rate result and green behavioural checks do not establish fidelity.

## Rollback and persistence

`before-d-art-assets-2026-11-07` preserves `e80f104` before this pass. Work is
on `codex/d-art-assets`. Stable compiled output is copied to ignored
`.cache/d-art-baseline/dist`; candidate output is isolated in
`.cache/d-art-build/dist`, with a scratch database on port 18878. The live
18861 preview and its database remain in place until promotion. Retain the
current database for every visual rollback; do not rewind player history or
shared time/weather. No deployment or push is authorized by this change.
