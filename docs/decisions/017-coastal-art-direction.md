# ADR 017: A coherent coastal place

## Status and intent

Accepted, 2026-11-06. Wen asked for stronger scene design and beauty alongside
the approved cooperative play. Keep the same walkable forest-to-sea place and
Sunny Day. Art should give it depth, a consistent palette and recognisable
buildings while leaving people's sounds as the shared creative material.

## Decisions

- Use warm sand, sea green, muted pine and cream. Keep the existing CC0 HDR
  for environmental lighting; draw a coherent pale-blue-to-cream sky instead
  of using its photograph as the background. The sky shader uses the installed
  Three.js 0.170 tone-mapping and colour-space chunks. Softer afternoon light,
  blue shade and distance haze separate nearby objects from the far shore.
- Three lightweight headlands frame an open middle distance. They are scenery
  beyond the walkable shore and create no collision or destinations. Water,
  foam and swash use softer contrasts; existing sand/path normal maps are
  quieter. Small instanced grass clusters frame the open beach.
- Pines use irregular, overlapping needle masses with smooth normals. Their
  six shared icosahedral boughs replace eight cones, reducing crown triangles
  by about 40%. Tree positions and trunk collision stay the same. Grass uses
  narrower blades and muted colour rather than large hard triangles.
- The cafe has a limewashed exterior, timber rhythm, a low base, green/cream
  awning and a small original pine-and-tide mark drawn in code. The existing
  entrance, interior, windows and collision remain. Kiosk/tower accents use
  warm terracotta rather than unrelated saturated red.
- A warm paper frame, dark sea-green controls, serif place title and smaller
  empty listening panel give the view more room. Native dialogs keep their
  readable dark surfaces. Contextual reply information appears only when it
  is useful; pending reply actions replace duplicate floating source actions.

No new asset download, runtime dependency, route, mode or audio is introduced.
Existing licensed materials remain recorded in the asset manifest; the new
geometry, gradients and cafe mark are source-code drawings. This remains an
imagined place. Geometry changes do not alter spawn points or walking rules.

## Verification and limits

Seven desktop zones and phone views were rendered and viewed, with a second
art pass correcting overly hard tree silhouettes, a blank cafe wall and a
grey sky. Existing walking, bridge crossing, forest exit and off-trail return
checks passed. Mac GPU measurements, including a DPR2 touch viewport and real
CDP touch movement, are recorded with screenshots and the evidence log. They
are desktop measurements, not a physical-phone performance claim.
