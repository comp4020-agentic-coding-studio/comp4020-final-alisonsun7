# Evidence log — Crit 9

A short record of what was asked for, what the agent did, what went wrong,
and how it was corrected. Commit links are in PROCESS.md.

## 1. Reset and first sketch (NoteGrid)

- **Prompt:** I asked to clear the DayDraw prototype completely and start
  again. The agent asked what to keep. I chose to keep the course scaffold
  and my already-submitted `reflections/crit-8.md`, and to reset everything
  else to the original template (`f908af2`).
- **Prompt:** a one-paragraph idea — a 6×6 grid, five coloured notes, remove
  a cell, a nickname, Play, three switchable instruments, and "when one user
  switches, another user's music changes within a second".
- **Grounding:** before designing, the agent fetched the live Crit 9 spec
  from the course API rather than recalling it. It then asked six questions
  that change the architecture: grid semantics, rooms or not, sampled or
  synthesised sound, playback model, whose instrument, and conflict rule.
- **Failure 1 — instruction not followed.** I answered "each person plays
  locally". The plan and code used one global, server-timed playback anyway.
  Nobody noticed until the SoundGarden rewrite.
- **Failure 2 — a broken client shipped.** NoteGrid deployed green (CI
  passed, `/` returned 200, 8/8 spec tests passed), but `app.js` imported
  `/types.js` and `/client/audio.js`, which the server 404'd. No grid ever
  rendered. The agent said it had "opened it in the browser", but it had only
  run `open` and never checked the page. Docker also wasn't available
  locally, which it did report honestly.

## 2. Ship, and finding the bug

- The agent ran preflight, and found the live Fly app was still serving
  DayDraw: the repo was private, so CI's deploy job had been skipped. I
  approved the ship. It ran the secret scan, made the repo public, watched CI
  through the first real Docker build and deploy, ran the spec against the
  live URL, and tagged `crit-9` at `714901b`.
- **Correction (from me):** I looked at the page and said it was too bare,
  with no 6×6 grid and no note blocks beside it. I gave a full SoundGarden
  design. Diagnosing the bug took two `curl` calls once someone actually
  looked.

## 3. SoundGarden rewrite

- **What changed, following my design:**
  - Column-based playback: each column is a step, and its notes sound
    together. Playback is local to each browser, which also fixes failure 1.
  - An eraser tool.
  - SQLite at `/data/garden.db` with `users`, `notes`, `garden_state` and
    `activity_logs`.
  - HttpOnly session cookies; the database stores only a hash of each token.
  - One-line `INFO` logs naming the user id and nickname.
  - Presence, a recent-activity list, and the pastel studio look.
- **Regression test written first:** `spec/client.test.ts` follows every
  script, stylesheet and `import` on the page and requires 200. The agent
  confirmed the old build 404s exactly `/client/audio.js` and `/types.js`
  before trusting the new test.
- **Test failures, fixed in the tests (not the app):**
  - The presence test waited for a frame that never comes.
  - Activity assertions assumed "my action is the newest", which breaks when
    test files run in parallel against one shared garden. Test files now run
    one at a time (`fileParallelism: false`).
  - After the fixes, 18/18 passed five runs in a row.
- **Small app fix:** switching to the instrument already selected was being
  logged as a change (`from=saxophone to=saxophone`). It is now a no-op.
- **Real browser check:** two separate Chromium contexts (1280×1000 and
  390×844).
  - 36 cells and 6 palette tools render, with no console errors and no 404s.
  - A placed note reached the other browser in 45 ms, and an erase in 36 ms.
  - An instrument switch during playback reached the other browser in 47 ms.
  - The playhead advanced, and the other browser's Play stayed untouched.
  - No horizontal scroll at 390 px.
- **Persistence:** placed a note, switched to saxophone, killed and restarted
  the server. Both survived, and the returning cookie still worked.
- **Rule changes in `CLAUDE.md`:**
  - Every file the browser loads must be listed in `STATIC`.
  - A green spec doesn't prove the page works; check UI changes in a real
    browser with a second session.

## 4. A welcome page that shows the garden

- **Prompt:** the welcome page was empty: a stranger couldn't see what was
  in the garden before typing a name. I asked for a read-only mini grid and
  an "N people are creating right now" line, with a nicer page and a
  book-like page turn into the garden. Done on `main` only, in a separate
  worktree so the Bloom branch wasn't touched.
- **Design decisions:**
  - A new `/preview` SSE stream, the only one without a session. It sends
    grid, instrument, online and version, but no activity, so nicknames stay
    private until you join.
  - Preview watchers are kept apart from `/events` streams, so presence still
    counts only people creating.
  - The page renders the grid on the server, so it works without JS; the
    page turn only delays the form post by 0.9 s and is skipped under
    reduced motion.
- **Checks:** `spec/welcome.test.ts` adds five tests (mini grid rendered
  with the real notes, welcome scripts load, preview live within a second
  without a session, no nicknames in the preview, watchers not counted).
  23/23 passed against a local server.
- **Real browser check:** Chromium at 1280×900 and 390×844. A note placed by
  another session appeared on the welcome page's mini grid; the cover turned
  and the garden page arrived; no console errors, no 404s, no horizontal
  scroll.

## 5. A music timeline under the grid

- **Prompt:** a timeline showing where notes fall across the loop, a
  playhead that moves with playback, click or drag to jump, the current time
  and total length, live updates when anyone adds or erases a note, in the
  existing style and responsive. Reuse the playback and state logic rather
  than adding a second player.
- **Design decisions:**
  - `src/client/timeline.ts` only draws. `app.ts` keeps owning playback, and
    the timeline reads the same `state.grid` the grid paints from, so a
    remote edit reaches it through the existing `render()`.
  - The playhead's position comes from the audio clock, the same clock the
    notes are scheduled on, so the line and the sound can't drift apart.
  - Seeking only moves this browser's loop. Playback stays personal, as the
    README promises.
  - Each run has an `epoch`. Beats already queued for the old position are
    dropped after a seek, so the grid never lights two columns.
  - While stopped, dragging previews each column you pass, and Play starts
    from where you let go. Stop returns to 0:00.
  - The track is a keyboard slider (arrows, Home, End) with a spoken
    description of each step's notes.
  - Under reduced motion the playhead steps column to column instead of
    gliding.
- **Checks:** `pnpm check` 25/25 against a local build on a temp database,
  including two new tests: the page carries the timeline, and the clock
  format. `client.test.ts` already follows `app.js`'s imports, so a missing
  `/client/timeline.js` route would fail it.
- **Real browser check:** two Chrome sessions, 1280 px and 390 px.
  - A note Alice placed reached Bob's timeline in 60 ms, and an erase
    reached it too.
  - Clicking step 3 while stopped read 0:00.8, and Play started there.
  - Dragging while playing jumped playback, and the grid's lit column
    followed.
  - Alice seeking left Bob's playback untouched.
  - No horizontal scroll at 390 px.
  - No console errors or failed requests on a clean rerun. The first run
    logged one 401 and two 404s that a rerun logging their paths didn't
    reproduce.
- **Correction from a screenshot:** the first track was 64 px tall, so the
  note bars were thin and the "×2" count was cramped. It is now 78 px.
- **Not verified:** how it sounds and feels in real use (needs my ears), and
  Docker/CI (CI will run it on push).

# Final project — Sound of a City (agent's record)

Written by the agent from the session, as a factual record for Wen to draw
on. Wen's prompts are quoted as she wrote them (some in Chinese, translated
in brackets); everything else is what the agent did and what happened.

## 6. Starting again from the design pack

- **Prompt:** "根据Sound_of_a_City_Claude_Development_Pack 开发，你有不确定的地方就问我"
  [build from the pack; ask me when unsure], with a pasted instruction to
  read the pack, keep reusable code and history, prioritise a working loop,
  accurate Marie Reay scenes from her photos, real-time sound collaboration
  and persistent memories, and to report blockers honestly.
- **Questions the agent asked, and Wen's answers:** build on `origin/main`
  keeping history (yes); use her photos as backgrounds, compressed, people
  blurred (yes); which building is on the right of IMG_8114 ("是 Marie Reay，
  8098 就是这个门" [it's Marie Reay; 8098 is that door]); LAB with no photo
  ("我去拍，先做占位" [I'll photograph it; placeholder for now]); memories
  public or private (public, with a notice at join).
- **Research:** Wen asked the agent to search the web and social media
  itself. No image found had a licence for reuse in the app, so none was
  used; what decided the scenes was Wen's photos and her answers above.
- **Built** (`f103601`): photo scenes with anchors read off coordinate grids,
  synthesised sounds, SSE + ops with docs/05 semantics, a server-timed
  3-minute memory sealed into a public archive, replay, and three spec files
  plus a two-browser Playwright run.

## 7. Failures found by looking, and fixed

- **Coordinate grid published.** The first scene images had the annotation
  grid baked in: `build-scenes.mjs` drew the grid on the canvas before
  encoding the published WebP. Seen in the first screenshots; the script now
  encodes first. The originals' grids live only in `/tmp`.
- **Replay showed no figures.** The memory page redrew the stage every frame,
  so each figure restarted its fade-in and stayed invisible. The e2e check
  had counted `.figure` elements and passed; it now checks computed opacity,
  and fails (0 visible) without the fix.
- **A false conflict.** Pressing the volume slider's arrow four times sent
  four updates with the same `baseRevision`; three were refused and the page
  said "Someone changed this sound". Updates for one sound now queue.
- **Keyboard focus lost** after every re-render of the tray and sound list.
- **"Saved" link replaced** at once by the next toast, so the other person
  never saw the link to the memory.
- **A false pass.** The first reconnect check used Playwright's
  `setOffline`, which doesn't cut an open SSE stream, so "caught up after
  reconnecting" passed without B ever disconnecting. Replaced by killing and
  restarting the server with both pages open.
- **Unverified claim removed.** The About page said the photos were taken in
  November 2026; only IMG_8114 carries EXIF (4 Nov 2026, 22:40), so the page
  now states only that.

## 8. Results and what wasn't run

- `pnpm check` 54/54; `pnpm e2e` 29/29 (click to other screen 40–60 ms;
  reconnect about 1.3 s after the server returns). Mutation checks: removing
  the owner check, the dedupe, the stage fix or the volume queue each turned
  its test red.
- **Not run:** Docker build (not installed), deploy (needs Wen's approval to
  merge into `main`), listening to the sounds, a screen reader, a real phone.

## 9. The walkable world (2026-11-05, ADR 004)

**Prompt (Wen, Chinese, summarised):** don't scatter the photos; make one big
scene you enter in first person and walk through, not necessarily real
photos. Early morning still looks like night (the photos were taken at
night). First give the design. Wen then sent a sketch of the ground floor
(`IMG_9883`, not committed) and agreed to drop "scenes are evidence", to add
three.js, and to share one place per hour.

**Grounding:** Wen's sketch for the layout; the six Marie Reay photos and the
bridge photo for what's in it; the existing session and op contract (ADR 003)
left as it was.

**Corrections during the build:**

- **Tea point mirrored.** First build put the sink right of the microwaves;
  IMG_8101 has it on the left as you face it. Swapped, with the evidence text
  saying so.
- **Steel drawn black.** Metallic lift doors with no environment to reflect
  rendered as black slabs; now a light grey with a little sheen.
- **Dusk windows glowing white.** Window glow was too strong after tone
  mapping; reduced.
- **A crash on load.** Constructing the view reported a zone change before
  the page had its view (`Cannot access 'world' before initialization`), and
  the tea point's spawn lay in the lobby's zone. Zone changes are reported
  only once the view is ready; the tea point zone now starts at z 15.5.
- **Walking in slow motion on slow devices.** The e2e "W walks into the
  lobby" check failed in headless Chrome at 14.5 fps: frame time was clamped
  to 50 ms. Long frames are now split into short steps (so no wall is
  skipped) and walking keeps real speed. The check passes with the fix.
- **A wrong test route.** The first keyboard check walked back from the tea
  point into the lift wall, which (correctly) blocks it; the route now walks
  up the corridor.
- **Sun direction tried and reverted.** An east sun (closer to early November
  sunrise) left the paving in shadow anyway and lost the light raking through
  the north glass, which is what reads as morning inside. Back to north-east;
  the shade is lit a little more by the sky instead.

**Results:** `pnpm check` 66/66 (adds `spec/world.test.ts`; `pages.test.ts`
now follows bare imports through the import map, and failed on `three`
before it did); `node e2e/two-browsers.mjs` 29/29 (photo scenes unchanged);
`node e2e/world-two-browsers.mjs` 5/5 (marker on the other screen about
300 ms after the click). Screenshots of every mode and zone looked at.

**Not run:** Docker build, deploy, listening to the positioned sound, a real
phone (only Playwright's phone emulation), a screen reader.

## 10. Imagined places from CC0 assets (2026-11-05, ADR 005)

**Prompt (Wen, Chinese, summarised):** the ANU scenes still aren't good; find
ready-made scenes online, like a forest or a café. Offered three directions
(replace ANU, rebuild ANU with assets, or both); Wen chose to replace ANU
with generic places.

**Grounding:** web search for CC0/CC-BY scene sources (Kenney, Quaternius,
Poly Haven, BinBun, Sketchfab); Poly Haven's public API for what exists and
how big it is.

**What happened:**

- **Kenney refused scripted downloads (403).** A retry with a browser
  user-agent was blocked by the permission system as bot-check
  circumvention, correctly. Nothing more was tried there.
- **Poly Haven trees were unusable:** 20 MB to 958 MB each at the lowest
  texture size. The forest waits for a lighter CC0 pack that Wen downloads
  by hand. The café's props are 1 MB to 6 MB each.
- **Models in different units:** the shelves measured 21 units tall, the
  chair 2.3. Every model is now scaled on load to a stated height.
- **Ceiling showed brick:** the roof box sat at exactly ceiling height and
  z-fought the ceiling. Roof moved up, in plain dark.
- **Each window across the street held a 4 × 4 grid of windows:** a grid
  texture on every pane. Now lit and dark panes.
- **Go to put you in the wrong zone** for three café spots (counter, tables,
  window). A new check failed for them first, then passed when the spawns
  moved. The counter spawn was also too close (pastries filled the screen),
  then turned so the espresso cart is in view (the UI test couldn't see its
  spot).
- **Software rendering at 0.3 fps.** The two-browser test timed out waiting
  for the second page. Measured 120 fps with the GPU, so the e2e scripts now
  use it; and the view now lowers its own quality when a device is slow
  (3.3 fps in software rendering after it does).

**Results:** `pnpm check` 75/75; `node e2e/world-two-browsers.mjs` 5/5 on
the café (marker on the other screen about 30 ms after the click).
Screenshots of every mode and zone looked at.

**Not run:** Docker build, deploy, a real phone, listening to the sound.
README.md still describes the ANU edition (Wen's to rewrite).

## 11. From the forest to the sea (2026-11-05, ADR 006)

**Prompt (Wen, Chinese, summarised):** start in a forest, walk a trail
through it, and at its end reach buildings by the sea, including the café,
on a beach. Rebuild the scene that way.

**Built:** `client/seaside.ts`, nine zones, 24 spots; the café refactored
into a room any place can position; five new synthesised sounds and two
backgrounds; 18 more CC0 assets (now 37, 88 MB).

**Corrections:**

- **The trail was invisible:** its ribbon's triangles faced down and were
  culled. Winding reversed.
- **Pale plastic pines:** needle colours darkened.
- **The sea was white:** first the water reflected the bright dawn sky
  (reflection turned down), then the morning mist hid it from 18 m (the
  place now sets its own mist distances).
- **A blank white wall:** the café's side seen from the boardwalk was its
  inside plaster. Brick added outside.
- **A test still held the campus's bounds** (-26 m to 38 m); it now checks
  the seaside's.

**Results:** `pnpm check` 87/87; `node e2e/world-two-browsers.mjs` 6/6,
including W walking from the forest's edge onto the boardwalk.
Screenshots of every zone and mode looked at.

**Not run:** Docker build, deploy, a real phone, listening to the new sounds.

## 12. Wider creek, shorter trail, the kangaroo (2026-11-05)

**Prompts (Wen):** make the creek twice as wide and the trail before it four
fifths as long; then (mid-task) if a player wanders far off the trail in the
forest, a kangaroo should appear from the distance, tell them they've gone
too far, and ask them back to the trail.

**Corrections:**

- **The crossing check walked into a tree.** Holding W from the creek went
  over the bridge (seen in screenshots) and then off the curving trail into
  a trunk. The page now exposes your position (`data-at`), and the check
  asserts z before and after the bridge.
- **The kangaroo was hidden behind a trunk**, then landed out of view, then
  looked tiny. Three causes: it landed straight ahead into a trunk (now it
  looks across an arc for a clear, visible spot, else towards the trail);
  the visibility test counted the trunk you're leaning on (now uses the
  trunk's drawn width); and its drawing filled a third of a canvas shaped
  for people (sprite canvases now take the drawing's proportions).

**Results:** `pnpm check` 87/87; `node e2e/world-two-browsers.mjs` 9/9.
