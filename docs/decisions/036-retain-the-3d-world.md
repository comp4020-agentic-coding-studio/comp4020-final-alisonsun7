# ADR 036 — Retain the 3D world

Date: 2026-11-08. Status: the author explicitly withdraws the optional 2D and
2.5D versions. The removal is implemented in a candidate; fresh integrated
HTTP/browser checks remain separate from source checks.

## Request and historical boundary

The author now says that the 2D and 2.5D versions are unnecessary. Keep the
current 3D Little Chorus and concentrate its interaction and sound experience.
This supersedes ADR028's decision to offer three current presentations.

[ADR028](028-optional-paper-world-presentations.md) and the original comparison
evidence remain historical records. They record what was implemented and
tested at that time; they are not a promise that the comparison must remain
available forever. Do not delete or rewrite old screenshots, observations,
results, personal reflections or the historical database to make the current
scope appear inevitable. The original implementations remain recoverable in
Git history rather than as unused runtime choices in the product.

## One current renderer and clear old-link compatibility

- `/planet` constructs the existing Three.js `PlanetWorld` only. Keep first
  person, third person and the explicit 3D overview. They are cameras within
  the one existing world, not additional editions or modes.
- Remove the presentation pickers from both the header and Places & friends,
  and remove flat-view instructions and presentation-specific CSS. Keep the
  persistent Share entrance, local listening settings, chat, movement,
  authoritative private rooms, sound replies and the coastal-world link.
- Retire the unreferenced `flat-world`, `flat-art` and presentation-handoff
  implementations and their static endpoints. A browser cannot select a flat
  renderer by changing a boot value or an old query parameter. No unrelated
  coastal renderer or shared sound/coordinate code is removed.
- Old `?view=2d` / `?view=2.5d` URLs, `/2d`, `/2.5d`, `/planet/flat`,
  `/planet/2d` and `/planet/2.5d` answer a same-site 303 to `/planet`.
  Canonicalisation removes the retired `view` selector and preserves the
  remaining query context, including an existing work invitation and place.
  A view query on `/scene/planet` also finds `/planet`. The separate coastal
  route is not canonicalised by this helper.
- Joining returns to the canonical 3D route while retaining a valid work
  invitation. There is no cross-presentation handoff to save or consume. A
  leftover tab-local handoff value is ignored; no user storage migration,
  stored source-coordinate conversion or automatic player relocation occurs.

The room remains `planet:morning` with its existing identity cookie, participant
IDs, source positions, reply links, tombstones and shared sky. The original
`seaside:morning` room remains separate and available. Retiring a renderer does
not duplicate, delete or reseed either history. Source operations and local
listening consent keep their existing explicit permissions; a redirect or new
document never enables audio on another person's behalf.

## Verification and limits

Before implementation, two new focused checks fail against the actual current
catalogue and HTML: three presentations are still offered and two lens
navigations remain. The new source checks cover the retained controls and
canonical compatibility paths. Replacing flat-only runtime tests reflects the
removed feature scope; the existing spherical, source, room-admission and
publication invariants remain unchanged. Historical flat-view results are
retained as historical evidence, not added to current 3D acceptance totals.

HTTP checks require the old routes to redirect, retired modules to return 404,
the current document to expose no style picker and the same room/source history
to remain visible. `e2e/3d-only.mjs` replaces the current flat-version browser
script: it exercises actual 3D frames, retained cameras, a real cookie through
old links, ignored obsolete handoff state, quiet documents and a phone visitor.
These checks must run against a fresh coherent scratch package before claiming
the installed preview has changed. Application rollback keeps current data.

The author's choice establishes the requested product scope. Automated tests,
screenshots and removing alternatives do not establish a grade, pleasant audio,
physical-device performance or unfamiliar-player understanding. Human listening
and real friend-play observations retain their own unperformed or separately
recorded status. No deployment, data migration or public push is implied by
this decision.
