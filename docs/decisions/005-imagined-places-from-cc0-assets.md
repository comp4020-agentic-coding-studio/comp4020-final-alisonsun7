# ADR 005: Imagined places built from CC0 assets, instead of ANU

## Status

Accepted, 2026-11-05. Replaces the ANU theme of ADR 003 and ADR 004. The
walkable view (ADR 004) and the server contract (ADR 003) are unchanged.

## Context

After walking the drawn campus, Wen decided the ANU scenes still weren't
good enough, and asked for ready-made scenes from the web instead, "like a
forest, or a café". Asked whether to keep ANU, Wen chose to replace it
entirely with generic places.

## Decisions

### 1. Places are imagined, and say so

Each place is invented, not a real location. Its page says what it is and
where its pieces come from (`Scene.about`). The first is **The Corner Café**:
a brick and plaster room with an espresso cart, a counter, round tables, a
bar along the shop window, and the street outside. A forest is next, once
assets for it are in hand.

### 2. Only CC0 assets, fetched by a script, each one recorded

The repo is public, so every model, surface and sky is CC0 (public domain).
They come from Poly Haven through its public API
(`scripts/fetch-assets.mjs`), are checked against the API's MD5, and each is
listed in `public/assets-manifest.json` with its author, link and licence.
Nothing is copied from sites that block scripted downloads: Kenney's site
refused the script, and nothing was done to get around that.

Poly Haven's trees are photogrammetry (20 MB to 950 MB each), far too heavy
for a page, so the forest waits for a lighter CC0 pack (Quaternius' Stylized
Nature MegaKit), which has to be downloaded by hand from its site.

### 3. Shapes for the room, models for the things in it

Walls, windows, the counter and tables are simple shapes covered in Poly
Haven surfaces (timber planks, brick, plaster, paving, asphalt), so the
room's layout and the spots' positions stay in our code. The furniture,
food, lamps, shelves and plants are models, each scaled on load to a set
height (the files don't share units: the shelves come in 21 units tall).

### 4. A photographed sky per hour

Each mode has an HDR sky (dawn, noon, overcast sunset) as the background
and as the light the models reflect. The drawn light (`sky.ts`) still sets
the sun, shadows, lamps and rain; a place can move the sun (`sunDirs`) so the
café's low morning sun comes in through its south-facing glass.

### 5. One engine, a kit per place

`client/world.ts` knows nothing about any one place. A `PlaceKit`
(`client/places.ts`) gives it a place's shell, its furniture loader, its
zones, where passers-by walk, where rain falls, and its skies. The campus
kit stays (`world-build.ts`) so its memories replay.

### 6. Slow devices get a lighter picture

Measured: 120 fps on an M5 Pro with a GPU; 0.3 fps in software rendering.
After the first four seconds (loading), if frames run under 24 a second the
view drops to one pixel per CSS pixel, then to half resolution without
shadows (3.3 fps in software rendering, ten times better). It never goes
back up, so it can't flicker.

### 7. ANU is retired, not deleted

`campus` and the photo scenes are `retired`: unlisted, but their pages and
memories still work. The not-affiliated notice stays in the footer, since
those pages still show ANU.

## Consequences

- About 44 MB of assets in the repo and the image (models 22 MB, skies
  11 MB, surfaces 9 MB). A first visit downloads the café's share (about
  25 MB); they're cached for a week.
- README.md still describes the ANU edition. It's Wen's to rewrite, and
  what "good" means for an imagined café is a different argument.
- The figures are still the flat cat and dog drawings, which sit less well
  among photoreal furniture than they did in the flat-shaded campus.

## How it is checked

- `spec/world.test.ts`: only walkable places are listed; each says what it
  is; Go to puts you in the zone it names (failed for three café spawns
  before they were moved); every Poly Haven asset is CC0 in the manifest and
  served; paths out of the asset folders are 404; a café spot is accepted,
  a sound at the wrong spot refused, and the café holds more than 12 sounds.
- `spec/pages.test.ts` follows `three/addons/` imports through the import
  map's prefix, so the loaders must be served.
- `e2e/world-two-browsers.mjs` (now on a GPU): Go to the counter, put the
  espresso machine on the cart, the other browser sees it (about 30 ms); S
  walks from the window to the counter.
