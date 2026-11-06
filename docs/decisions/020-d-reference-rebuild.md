# ADR 020: Rebuild the walkable D reference composition

Accepted, 2026-11-07, after Wen rejected ADR 019's first visual result.
Wen explicitly chose freely walkable real 3D over an exact static image.
The D concept remains a reference, not a runtime background or a claim of
pixel-identical reproduction.

The western boardwalk arrival looks along the shore, with a nearby sea on the
left, spreading pines above and the cafe's close glass frontage on the right.
The western beach narrows into a cove. Its floor, underwater exclusion and NPC
routes change together; eastern beach activities, the pier entrance, forest
trail, bridge and private huts retain their routes. This is an intentional
exception to ADR 019's unchanged-terrain scope. Persisted contribution positions
are not moved to suit the new camera.

Original continuous skinned garments, sculpted animal heads and layered clothing
replace the earlier segmented figures. The hero budget rises to 35K triangles;
distant garment/head levels reduce detail. Grounded source lights, contact
shade and linear-light output support the real geometry. The quality fallback
can disable contact shade and edge antialiasing on a slow device. All shared
weather/clock state and sound playback rules stay independent of these effects.

A 52px header, bottom sound action and native Tools drawer leave the scene in
view. Secondary actions retain their names and keyboard access. Real browser
tests navigate through Tools; they do not force-click hidden controls. The
helper's return action must remain clear of the bottom sound button.

The old application is tagged `before-d-fidelity-2026-11-07` at `65c7a4f`.
Implementation uses `codex/d-reference-fidelity` and separate candidate output
and scratch data. Rollback restores code while retaining the current database.
The [fidelity proposal](../proposals/d-reference-fidelity.md) records the actual
reference landmarks; screenshots and test outcomes belong in the evidence log.
