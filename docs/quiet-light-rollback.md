# Quiet Light rollback

The pre-art application is preserved by annotated tag
`before-quiet-light-2026-11-07`, pointing to
`0becc46dd87348fd7226783a09eea7621b966ec1`. The new work is on
`codex/quiet-light-art`; `feat/sound-discovery-polish` stays at the old version.
No push or deployment is part of this change.

## Recover source in a separate checkout

From the repository root, inspect `git status` first. Keep any uncommitted work
on the current branch. These commands make a separate detached checkout and
build the preserved version without resetting or deleting the new history:

```sh
git worktree add --detach ../comp4020-before-quiet-light before-quiet-light-2026-11-07
cd ../comp4020-before-quiet-light
mise exec -- pnpm install --frozen-lockfile --registry=https://registry.npmjs.org/
mise exec -- pnpm build
```

Start that build with an explicit port and the **current** database path (see
[local development](local-development.md)). Stop an existing listener only after
checking its PID and command. Never run two application servers against the same
database for this rollback. New art commits can also be selectively reverted
with ordinary Git revert after reviewing the commit list; no hard reset is
required.

## Local fast path

On the development Mac, ignored `.cache/quiet-light-baseline/` contains the old
compiled `dist` and links to this checkout's unchanged dependencies/public
assets. It was smoke-tested independently with a scratch database: the scene,
world module, stylesheet and Three.js returned HTTP 200. This is a convenience,
not a substitute for the portable Git tag. Candidate builds are isolated in
`.cache/quiet-light-build/`; they do not overwrite the stable preview during
implementation.

The existing preview's database location is recorded in `.cache/preview.json`.
Before work, a read-only SQLite backup was saved to
`.cache/quiet-light-review-before.db`. That backup is recovery evidence only:
**do not restore it for a visual rollback**, because it would rewind later
people, contributions and shared settings. This art change adds no database
schema. Keep using the live database when returning to the old application.


## Reviewed Quiet Light version

`quiet-light-v1-2026-11-07` marks the completed, verified art version. The
source history has separate rollback, interface, character, landscape,
integration and polish commits; use `git log --oneline
before-quiet-light-2026-11-07..quiet-light-v1-2026-11-07` to compare them.
The local 18861 preview uses the updated build with its original current DB.
The ignored `.cache/quiet-light-promotion.json` records the retained previous
compiled directory and the exact table comparison. Both visual directions
can use the same current schema and persistent contribution history.

## D reference rebuild

Wen rejected the first build's resemblance to D and chose a substantial rebuild
that retains free 3D movement. `before-d-fidelity-2026-11-07` preserves that first
build at `65c7a4f`; `.cache/d-fidelity-baseline/` holds its compiled fast path.
The rebuild is developed on `codex/d-reference-fidelity`, with isolated output
in `.cache/d-fidelity-build/` and a scratch review on port 18876. Use the same
clean-checkout method above with this tag to recover the first art version.
Keep the current database: western landscape changes do not migrate or move
stored contribution rows.

`d-walkable-rebuild-2026-11-07` marks the reconstructed 3D version. The local
18861 preview serves it with the original current database, verified across all
12 persistent tables. `.cache/d-fidelity-promotion.json` records the previous
compiled output and table comparison. Use Clear + Afternoon explicitly for the
reference lighting; promotion does not reset the shared clock or weather.

## Asset-led correction after the second rejection

`before-d-art-assets-2026-11-07` preserves `e80f104`, before the next art pass.
The new branch is `codex/d-art-assets`; the isolated candidate uses
`.cache/d-art-build/dist`, port 18878 and its own scratch DB. A convenience
copy of the former stable compiled output is `.cache/d-art-baseline/dist`.
Use the separate-checkout method above with this new rollback tag to recover
that visual version. Keep the current database, including later player sounds
and shared time/weather. The source correction, original generated material,
external CC0 needle source and review are recorded in ADR 021.

`d-asset-rebuild-2026-11-07` marks this verified asset/lighting pass. The 18861
preview serves application source commit `b1b0eec` with the same current DB;
all 12 tables matched at promotion. The old compiled directory is recorded in
ignored `.cache/d-art-promotion.json`. The shared sky was not reset. Actual
reference screenshots use Clear + Afternoon; choose that explicitly to compare
with D. The visual reference remains more detailed than this real-time 3D
reconstruction; the tag records a tested version, not user visual acceptance.

## Shared sound identity

Wen clarified that a coherent, harmonious and distinctive place supporting
shared sound-making and playful interaction is the priority (ADR 022).
`before-shared-sound-focus-2026-11-07` preserves the previous source at
`161ae1a`. Work is on `codex/shared-sound-focus`; the isolated candidate uses
`.cache/sound-focus-build/dist` and a scratch DB on port 18879.
`.cache/sound-focus-baseline/dist` retains the former compiled application.

`shared-sound-focus-2026-11-07` marks the verified new invitation, public
contribution drawer and nearby reply threads. The original 18861 preview
serves application commit `02e9121`. Its **current** database was retained:
all 12 persistent tables matched across promotion, including 20 sound rows,
four operations and one reply. The shared environment anchor also matched.
The ignored `.cache/sound-focus-promotion.json` records the old compiled
directory. Use the separate-checkout method above with the new rollback tag
and the current DB; never restore a historical DB to change interface styles.
There is no schema change, push or deployment.

## A living world shaped through sound

`before-living-sound-world-2026-11-07` preserves `2486e70`, before the painted
character/material pass, optional new recordings and sound-driven residents.
Work is on `codex/living-sound-world`. The isolated candidate is
`.cache/living-world-build/dist` on port18880 with its own scratch database;
`.cache/living-world-baseline/dist` retains the former compiled application.

Use the separate-checkout method above with this rollback tag and the current
database. No schema change is required. The older catalogue cannot offer the
two new sound types, but their contribution rows must remain in the database;
never delete them or restore an older database to roll the art back.
The [production walkthrough](living-sound-world.md) records the new direction,
process references and reproducible briefs. Preview promotion is recorded
separately in the evidence log and ignored `.cache/living-world-promotion.json`.

`living-sound-world-2026-11-07` marks this verified implementation. The original
18861 preview serves application commit `cd70c7a`, with every digest in all
12 persistent tables unchanged at promotion. All 30 served modules/styles and
three new assets match the reviewed build. The shared environment anchor and
five live ordinary sounds remain intact. The ignored promotion record retains
the former compiled directory; switching applications must keep the current DB.

## Soundfolk little planet

`before-soundfolk-planet-2026-11-07` preserves `5afd955`, the complete prior
living-world source. Development uses `codex/soundfolk-planet`, isolated
`.cache/planet-build/dist` and a separate scratch database on port18881.
`.cache/planet-baseline/dist` retains the former compiled application.

The new edition is `/planet`, with a deliberately separate `planet:morning`
room; the original `/scene/seaside?mode=weekday` keeps its coordinates,
ordinary sounds, replies and weather/clock anchor. No schema migration is
required. Startup adds the new scene catalogue row; opening its page creates
only its own session and default environment. The previous source simply
does not offer the planet. Its catalogue upsert does not delete extra rows.

Use the separate-checkout method above with this tag and the **current** DB.
Never restore a historical DB to change applications, and never delete the
new scene, users, contributions or relationships during rollback. The ignored
`.cache/planet-promotion.json` will record the previous compiled directory,
every persistent-table comparison and the precise allowed new-edition rows.
The [walkthrough](soundfolk-planet.md) describes camera, identity, night light
and the real resident restroom test. No push or deployment is authorized.

`soundfolk-planet-2026-11-07` marks the verified new edition. The18861 preview
serves application commit `b547227`; all38 modules/styles match the reviewed
candidate. Every existing row in all12 tables was preserved. Only the new
scene, its session and environment were added; the old coast's five live
ordinary sounds and exact weather/clock anchor remain intact. The promotion
record retains the former compiled output. No remote push or deployment took
place.

## Little Chorus: coastal play and direct sound responses

`before-little-chorus-play-2026-11-07` preserves the prior source at `a65cead`.
Development uses `codex/little-chorus-play`, isolated
`.cache/chorus-build/dist` and a scratch database on18882. HTTP-writing specs
use a second database on18883. `.cache/chorus-baseline/dist` retains the former
compiled application. [ADR025](decisions/025-little-chorus-play.md) records the
requested name and correction of the first planet's lost play.

Use the separate-checkout method above and retain the **current database**.
Users, contributions, replies, operations, rooms, coordinates and shared
weather/clock anchors must not be restored from a historical backup. No schema
change is required. The only intended persistent edit is the existing planet
catalogue title from `Soundfolk · a little world` to
`Little Chorus · a little world`; it creates no new room. The older application
may display its previous title after rollback. This is a catalogue label, not
a reason to delete or recreate any sound data.

The ignored `.cache/chorus-promotion.json` records the exact application commit,
previous compiled directory, current database, all12 table digests, title-only
row allowance and43 served module/style hashes. Switching applications must
retain the current DB. The [walkthrough](little-chorus.md) covers the restored
run/jump controls, source responses, companion and real shoreline. Final
preview verification and release tag are recorded after the cutover checks.
