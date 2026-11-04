# Implementation Report — Sound of a City

Branch `feat/sound-of-a-city`, built on `origin/main` (`e664fc4`, SoundGarden
at Crit 10), 2026-11-05. Follows `design/sound-of-a-city/templates/IMPLEMENTATION_REPORT_TEMPLATE.md`.
Results below are from runs on this machine (macOS, Node 24.21.0, Google
Chrome via Playwright). **Not deployed**: the branch hasn't been merged, and
pushing to `main` deploys over the live SoundGarden.

## What was implemented

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Scene navigation | DONE | `spec/pages.test.ts` (every scene, mode and shot answers 200); e2e screenshots | Landing → places → scene. Six Marie Reay shots linked by labelled arrows; the entry shot links to the Chifley bridge and back. Links are navigation only, no floor plan implied. |
| Marie Reay visual | DONE | `public/scenes/marie-*.webp`, anchors in `src/shared/catalog.ts`; `docs/screenshots/03–05*.jpg` | Six of Wen's photos (IMG_8098, 8100, 8101, 8104, 8106, 8113), people blurred. Every anchor read off a coordinate grid of its photo. Figures sized from each photo's horizon line. |
| Chifley three modes | PARTIAL | `spec/pages.test.ts` checks each mode's honesty note is on the page | One real photo (IMG_8114, night, after rain). Rainy dusk = the photo plus drawn rain. Early morning and busy weekday are **colour grades of the night photo**, and the page says so. Different ambience and passers-by per mode. |
| LAB café | PARTIAL | `spec/pages.test.ts` (placeholder says so); `docs/screenshots/07-lab.jpg` | Drawn placeholder, labelled on the stage and below it. Sounds work. Waiting on Wen's photos. |
| Audio engine | DONE (not judged by ear here) | `src/client/audio.ts`, `synth.ts`; no page errors in e2e | 20 sounds and 5 ambiences synthesised in Web Audio; starts only after Enable sound; per-sound gain, pan and a softer filter when the sound is in another view; limiter; separate ambience toggle; suspends in hidden tabs. Whether it *sounds* right needs a person listening. |
| NPCs | DONE | e2e: figures visible in live view and replay | One cat or dog figure per placed sound, doing that sound's activity, depth-sorted. Decorative passers-by on the Chifley bridge. |
| Realtime sync | DONE | `spec/live.test.ts`; e2e 40–60 ms click-to-other-screen | SSE + JSON ops with the pack's docs/05 semantics (ADR 003). |
| Memory & persistence | DONE | `spec/lifecycle.test.ts`; e2e memory and archive | Server-timed 3 minutes; sealed into a public memory with names; replay with play, scrub and "how it ended"; archive; survives restart; clocks resume or seal on start. |
| Accessibility | PARTIAL | e2e keyboard and phone checks; reduced-motion probe | Keyboard: tablist with arrows, Enter places, Delete removes your sound, focus kept across re-renders. Phone 390 px: no sideways scroll, targets ≥ 32 px. Reduced motion stops rain and passers-by. **Not run:** a screen reader. |

## How to run

- Setup: `mise install && pnpm install`
- Scene images (only if the originals are in `design/sound-of-a-city/references/`, which is gitignored): `pnpm scenes`
- Dev: `pnpm dev` (builds, then serves on `PORT`, default 8080, DB at `.data/sound-of-a-city.db`)
- Test: start the app, then `APP_URL=http://localhost:8080 pnpm check`. `spec/lifecycle.test.ts` builds and starts its own copy.
- Two-browser run: `pnpm build && pnpm e2e` (starts its own app on a temp DB; needs Google Chrome)
- Deployment: unchanged from the course template. A push to `main` runs CI (Docker build, spec against the container) and `flyctl deploy`.
- Environment variables (names only): `PORT`, `NODE_ENV`, `DB_PATH` (optional), `SOAC_SESSION_MS` (tests only), `SOAC_TEST_HOOKS` (tests only), `FLY_API_TOKEN` (deploy, kept in gitignored `mise.local.toml` / CI secret).

## Test evidence

| Command / scenario | Result | Notes |
|---|---|---|
| `pnpm typecheck` | PASS | exit 0 |
| `pnpm check` against the app on :8090 | PASS, 54/54 | 4 files: invariants (2), pages (32), live (12), lifecycle (8) |
| Do the new checks fail without their fix? | PASS | Removing the owner check and the dedupe made 2 live tests fail; reverting the stage fix made "replay shows the figures" fail (0 visible); reverting the volume queue made the slider check fail ("Someone changed this sound", stuck at 75%). Each fix restored afterwards. |
| Two-browser realtime (`pnpm e2e`) | PASS, 29/29 | A desktop and a 390 px phone session. Click to render on the other screen: 48 ms and 61 ms; a removal: 14 ms. |
| Disconnect and reconnect | PASS | e2e kills the server with both pages open: both show "Connection lost", a change attempted offline is refused with that message, the page reconnects by itself (≈1.3 s after the server returns) with every sound still there. |
| DB process restart | PASS | `spec/lifecycle.test.ts`: SIGKILL and restart keeps sounds, memories and the session cookie; an expired clock is sealed on start; a running one resumes. |
| 3-minute clock and save | PASS (with a 3 s clock) | The real 180 s clock wasn't waited out; the same code path runs with `SOAC_SESSION_MS=3000`. The e2e saves early with the real clock. |
| Failed save | PASS | Test hook makes the next memory write throw: `session.failed` is broadcast, the snapshot says failed, sounds stay, archive unchanged, retry saves it. |
| Mobile and keyboard | PASS (automated) | See the Accessibility row. Not tried on a real phone or with a screen reader. |
| Docker image build | NOT RUN | Docker isn't installed here; CI builds it on push. |
| Deploy to Fly | NOT RUN | Needs Wen's approval to merge into `main`. |
| Audio quality by ear | NOT RUN | Needs a person. |

## Sources and licensing

Full list in `public/assets-manifest.json`.

| Asset | Creator/source | License or permission | Published? |
|---|---|---|---|
| 7 scene photos (Marie Reay ×6, Chifley ×1) | Wen (project author) | Her own photos; she approved publication | Yes, as processed WebP: people blurred, metadata removed. Originals never committed. |
| LAB placeholder drawing | This project (code) | Original | Yes, labelled as a placeholder |
| Cat and dog figures | This project (SVG in code) | Original | Yes |
| All sounds | This project (Web Audio synthesis) | Original | Yes |
| Inter font | Google Fonts | SIL OFL 1.1 | Loaded from Google Fonts |
| LAB ANU gallery, Wikimedia Commons, social media | Various | Not used | No: consulted for facts only |

## Open issues and genuine limitations

- **Not deployed.** Merging to `main` replaces the live SoundGarden; waiting on Wen.
- **LAB ANU has no real photo.** Placeholder until Wen photographs it.
- **Chifley morning and weekday aren't real photos** of those times, only grades of a night photo, and they say so.
- **Docker build unverified locally**; CI is the first place it will run.
- **Offline changes aren't queued.** While disconnected the page refuses changes and says so (nothing is lost, nothing is falsely saved), but it doesn't hold them to send later, which the pack's docs/04 suggests.
- **Sound markers overlap figures** in the lift lobby on narrow screens: the marker sits on the source (lift, table), the figure stands in front of it. Readable but busy.
- **No screen-reader pass**, and no test on a real phone.
- Original photos have no EXIF date except IMG_8114 (4 Nov 2026, 22:40), so only that date is stated on the About page.

## Summary of reused code and new architecture decisions

- Reused: the `node:http` + SSE server shape, `node:sqlite` on the Fly volume, HttpOnly hashed session cookie, one-line logs, `marked` for `/readme/`, Dockerfile, `fly.toml`, CI, spec harness and `spec/invariants.test.ts`.
- Replaced: the 6×6 grid, its client and its tests.
- New decisions (ADR 003): SSE + POST instead of WebSocket, keeping docs/05's semantics; one open session per scene and mode, rolled over on save; owner-only edits with `baseRevision`; failed saves reported and retryable; clocks recovered on start. ADR 003 supersedes ADR 001 and 002 for this product.

## Authenticity notes

- **Verified from Wen's photos:** the three lifts in the timber wall, high table and stools, recycling bins, the orange stair and tiered seats, the tea point (microwaves, sink), the entrance mat off the Chifley bridge, the Chifley bridge with its railings and lamp post, and the library entrance. Wen confirmed the tea point faces the bins, that IMG_8114's right-hand building is Marie Reay, and that IMG_8098 is through that door.
- **Placeholder:** LAB ANU, entirely. Chifley morning and weekday lighting.
- **Reconstructed camera shots:** none. Every view is one photo as taken; nothing was composited or extended. Figures, rain and passers-by are drawn over the photos.
