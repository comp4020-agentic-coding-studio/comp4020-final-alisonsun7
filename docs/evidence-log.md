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

## 13. More creek, less trail (2026-11-05)

**Prompt (Wen):** shorten the forest trail before the creek again and give
what's cut to the creek's width. No amount given: took 6 m (creek 6.4 m to
12.4 m, trail to the bank about 61 m to 55 m), said so, easy to change
(`CREEK_HALF` in `client/seaside.ts`). `pnpm check` 87/87; the UI test's
crossing check (banks now z -75.2 and -62.8) passes, -82 to -58.

## 14. A living place: kept sounds, people, talk (2026-11-05, ADR 007)

**Prompts (Wen, Chinese, summarised):** asked how to design labelled sound
spots with volume. Then stated the standard: playable together, keeps its
data so the next day shows the day before, and others' changes are visible.
Then: show where other people are; when two people meet, each can type, and
the words show until new words replace them or for 5 s; drop the 3-minute
recording.

**What the review found against the standard:** the recording sealed and
emptied the place; each time of day was its own room; others weren't in
the world. All three changed (ADR 007).

**Corrections:**

- **A refused message counted towards the talk rate limit**, so speaking
  right after "you're not anywhere yet" was refused as too fast. Found by
  the spec; the limit now counts only words actually sent.
- **A persistent world fills up under repeated tests.** The spec and both
  seaside UI scripts now remove what they add; the UI script ran four
  times in a row, 9/9 each.
- **"Background forest" on the beach:** the label named the mode's
  background; a living place now says "Background sounds".

**Results:** `pnpm check` 93/93 (twice in a row on one database);
`node e2e/meet-and-talk.mjs` 11/11; `node e2e/world-two-browsers.mjs` 9/9;
`node e2e/two-browsers.mjs` 29/29 (retired photo scenes unchanged).

**Not run:** Docker build, deploy, a real phone, two people on different
networks.

## 15. Spot labels and cards; hearing anything (2026-11-05)

**Prompt (Wen):** build the spot labels and the click-to-adjust card; "I
only see labels where there are sounds, I don't actually hear anything, and
after clicking a label I don't know how to add a sound where I want it."

**Causes found:** sound was off until a small top-right button; quiet spots
had no label; adding needed the tray first. Fixed as in ADR 007 §6.

**Checked:** `e2e/meet-and-talk.mjs` 19/19, including that the audio engine
is actually playing the added sound (`data-playing`), not only that the UI
shows it. `pnpm check` 93/93; `world-two-browsers` 9/9 (it now dismisses
the arrival card); `two-browsers` 29/29.

**Not run:** listening by ear (headless Chrome plays to no device).

## 16. Name and look before entering; the kangaroo's words cut off (2026-11-05)

**Prompts (Wen):** let people enter their name and choose how they look
before entering the world; the kangaroo's speech bubble was cut off at the
top of the view (screenshot).

**Done:** the arrival card asks for a name and a cat or a dog (with a
picture of each), then "Enter with sound" or "Enter quietly" joins without
leaving the page (`POST /join` answers JSON when asked), so the same click
still starts sound. Returning people see "Welcome back" and "Not you?". The
landing page now says what the place is and goes straight in. Bubbles (the
kangaroo's, and words over people's heads) are now kept wholly inside the
view, using their own size; when moved, their tail is hidden.

**Corrections:**

- **Cause of the cut-off bubble:** only its bottom edge was kept in view,
  never its height. The new check fails on the old code: the bubble's top
  went above the view when looking up at a close kangaroo.
- **Native `required` pre-empted the card's own message** for a blank name.
- **The card overflowed an 840 px window** (buttons half hidden); made
  compact, checked on desktop and phone sizes.
- **Removed the background-sounds switch by mistake** while replacing the
  arrival code (seen as an empty, dead checkbox in a screenshot). Restored,
  with a check that it's on and enabled.

**Results:** `pnpm check` 94/94; `meet-and-talk` 26/26;
`world-two-browsers` 11/11; `two-browsers` 29/29.

## 17. One sound per place (2026-11-05, ADR 008)

**Prompt (Wen):** the sound design has a lot of bugs; is it the idea? After
an analysis (rules from the 3-minute composing design fighting a lasting,
shared world), Wen agreed to "each place one sound, decided by everyone",
and will report specific bugs one by one next.

**Found while changing it:** a spec test chose birdsong at a place an
earlier test had already given birdsong: refused as `already_here`, the new
rule working; the test now picks another sound and finds the add among the
switch's events. A UI check for "Ada's sound after a reload" was outdated
once Bo switches the place first; it now checks the place's sound.

**Results:** `pnpm check` 94/94 (twice); `meet-and-talk` 31/31 (three
runs); `world-two-browsers` 12/12; `two-browsers` 29/29.

## 18. Footsteps as you walk (2026-11-05, ADR 009)

**Prompt (Wen):** choosing footsteps should play my steps as I walk, and
other people's as they pass, theirs quieter than mine.

**Results:** `meet-and-talk` 36/36 (Ada's own steps 5 while walking; Bo's
heard 7 at 0.087 against her 0.55; Bo with footsteps off, none);
`pnpm check` 94/94; `world-two-browsers` passes; `two-browsers` 29/29.

**Not run:** listening by ear to the step sounds on each ground.

## 19. Sound taken out (2026-11-05, ADR 010)

**Prompt (Wen):** delete everything to do with sound; Wen will give a new
design for it.

**Done:** the scope was stated first (what goes, what stays, no data
deleted, the old code tagged `before-sound-removal`). Removed the audio
engine and synthesis, spots, labels, cards, sound map, sound and footsteps
switches, sound ops, memories, archive and replay, the scenes that existed
only for sound, and their tests; rewrote the page script, templates,
catalogue, protocol and session module around what's left (the place,
people, talk, joining). The about page no longer describes sound.

**Corrections:** a join-form check still expected "public archive" in the
fine print; it now checks the new wording.

**Results:** `pnpm check` 37/37 (twice); `world-two-browsers` 9/9;
`meet-and-talk` 14/14, including "nothing about sound is offered"; a new
spec block checks the page has no sound controls and the sound routes are
404.

## 20. Sounds for the new design, from Wikimedia Commons (2026-11-05)

**Prompt (Wen, translated):** free placement; no background bed (Wen will
be the first person to add sounds); sounds don't fade; no recording yet,
so find the sounds on YouTube or other platforms.

**Done:** YouTube wasn't used: its audio is mostly copyrighted and its terms
forbid downloading, and the harness allows only free assets from sites that
permit scripted downloads. Searched Wikimedia Commons through its API for
each sound, kept only files whose licence field is CC0 or public domain,
and checked author, licence and length of each. `scripts/fetch-sounds.mjs`
downloads 21 of them (SHA-1 checked against Commons), cuts each with ffmpeg
into a mono MP3 (a loop with its last 2 s crossfaded into its start, or a
short clip for sounds heard now and then), brings each to -20 LUFS in two
passes, strips metadata, and records each in `public/assets-manifest.json`.
Originals stay in the gitignored `.cache/sounds/`.

**Results:** 21 files, 9.3 MB, all within 0.6 LU of -20 LUFS except
`trickle` (-26.9: its 19 s original is peak-limited). Not yet listened to
by ear: the cuts were chosen without listening. Nothing in the app plays
them yet.

**Correction (Wen, after listening):** kept 6 of the 21: café chatter,
evening forest, trickling stream, espresso machine, café music, someone
playing guitar. The other 15 were taken out of the script, their files
and manifest entries removed.

## 21. Sounds people leave where they stand (2026-11-05, ADR 011)

**Prompt (Wen, translated):** the asset rule can become CC0 or public
domain; start the code with these six sounds; more sounds later.

**Done:** ADR 011 records the design. Server: a new `placed_sounds` table
(removal sets `removed_at`, nothing deleted; the old sound tables untouched),
`POST /api/sessions/:id/sounds` (left where the server last saw you stand)
and `DELETE /api/sessions/:id/sounds/:sid` (only within 4 m), room rules
(same sound 4 m apart, 6 within 10 m, 150 in all, one change a second),
`sound-left` and `sound-removed` on the stream, sounds in every snapshot,
`sound_left` and `sound_removed` log lines. Client: `client/soundscape.ts`
(spatial loops of the nearest 12 within 40 m, muffled through the café's
walls, a limiter; a coloured light per sound by family), the "Leave a sound
here" palette, labels with Remove, the header's sound switch, notices of
others' changes. `shared/sounds.ts` holds the sounds and rules for both.

**Corrections:**
- Leaving a sound and the stream's copy of it race: whichever arrived first,
  the page could tell you "Ada left…" about yourself. Events now carry the
  participant id, and only others' changes are announced from the stream.
- Standing on a sound (just after leaving it) put its label behind the
  camera, so it couldn't be removed: found by the e2e, fixed by pinning the
  nearest sound's label low in the view.
- From far off the lights were barely visible in daylight (additive glow
  washed out, tone mapping dimmed them): the screenshot showed it. Now a
  solid core, a glow and a thin column, without fog or tone mapping.
- Labels of neighbouring sounds piled up: beyond 4 m only the name shows.
- Dates showed in the browser's language ("11月5日"); now English.
- A spec test removed sounds from 5 m away, which the 4 m rule refused, and
  left them behind for the next run: the test now stands beside them, and
  each test first clears what a failed run left.
- My `pkill -f dist/server.js` also stopped a server another session had
  running on port 8081. Servers are now stopped by their own PID only.

**Results:** `pnpm check` 41/41. With the reach and crowding checks taken
out, the two tests that cover them fail (`too_far`, `crowded`), and pass
again with them back. `pnpm e2e` 40/40 across the three scripts, on a
fresh database, including `leave-a-sound` (16 checks; Bo sees Ada's sound
within 1.5 s, his page plays it). Screenshots in `docs/screenshots/11-*`.
Not run: listening by ear, a real phone, a screen reader, Docker.

## 22. A busier café, and a guitarist by its door (2026-11-05)

**Prompt (Wen, translated, while trying the place):** more people in the
café, livelier; on the bench at the café's door, someone playing guitar.

**Done:** a place can now have regulars, people who stay put, per time of
day (`PlaceKit.regulars`). The café has a barista, a queue, people at the
tables and the window bar, two chatting by the door: 14 on a sunny day, 10
at rainy dusk, 4 early. A new bench by the café's door with a guitarist,
whose strumming hand goes up and down (two drawings swapped; he keeps
still with reduced motion). Like passers-by they have no names, so they can't be
taken for real people, and they make no sound: the guitar sound is still
one people leave themselves.

**Corrections:** seated figures were as tall as standing ones, so they
looked like people standing by the chairs; sitting is now drawn at 0.8 of
the height. The guitarist, put at the seat's front edge, looked from the
side like someone standing at the bench's end; he's now in the middle of
the seat. Both seen in screenshots (`docs/screenshots/12-*`).

**Results:** `pnpm check` 41/41, `pnpm e2e` 40/40.

## 23. Only the sunny day (2026-11-05, ADR 012)

**Prompt (Wen, translated):** keep only the Sunny Day mode.

**Done:** the place has one mode, `weekday`. The shared room was made under
`morning`, which is its name in `sessions`, with the sounds Wen had left
hanging off it; making Sunny Day the first mode would have opened a new,
empty room. So `Scene.room` keeps the name `morning`; retired modes'
pages answer 301 to `mode=weekday` (keeping the zone), and the stream takes
a retired mode as the sunny day so an old open page reconnects. The mode
switch isn't shown with one mode. The retired modes' sun, mist, skies and
regulars went from `seasideKit`.

**Results:** `pnpm check` 39/39 (two fewer: the page checks ran once per
mode); `pnpm e2e` 40/40, with Bo now arriving by an old rainy-dusk link.
On Wen's local app after a restart, the old link redirects and the three
sounds Wen left (trickle, evening forest, guitar) are still there.

## 24. Words reach people who can't see the speaker (2026-11-05)

**Prompt (Wen, translated):** when I meet someone and talk, they don't see
what I send.

**Found:** the server had sent both of Wen's lines (`said … heard=1` in the
log), so the words reached the other page. There they showed only in a
bubble over the speaker's head, hidden whenever the speaker was out of
view: beside you, behind you, or on the same spot (everyone arriving at a
zone starts on the same spot). The e2e passed because Bo walked in front
of Ada, and it checked the bubble's text, not that it could be seen.

**Done:** what others say also goes in a list low in the view ("Bo: …"),
8 s a line, at most four, whether or not the speaker is in sight. ADR 007
and the harness say so.

**Check:** `e2e/meet-and-talk.mjs` now turns Ada's back on Bo and needs his
words actually visible on her screen. It failed before the fix (with the
fix taken out, again) and passes with it. A first version of the check
picked the hidden bubble and failed with the fix in; it now accepts any
visible place the words are shown.

**Results:** `pnpm check` 39/39; `pnpm e2e` 42/42.

## 25. More layered trees and a softer coast (2026-11-05)

**Prompt (Wen):** 现在你帮我把画面设计的更漂亮一些，树啊 海啊 等。

**Done:** eight irregular bough layers per pine, seeded variations in shape
and green, slimmer trunks, instanced grass beside the trail and beach,
a gently varying trail width, warmer sand and sunlight. The sea now has
a shallow-to-deep colour gradient, procedural ripple normals and swells;
the creek uses quieter ripples. Wet sand and foam follow a gently curved
shore. Tree positions, collision rules, sound placement/removal, presence
and chat are unchanged. No new external assets or dependencies.

**Corrections:** the first water pass was too bright and regular, and the
wet-sand band too broad. Reduced those effects and checked forest, creek,
forest edge, beach, pier and boardwalk screenshots, plus forest and beach
at a mobile viewport. Browser captures reported no page errors. These
are viewport checks, not a real-phone performance test or listening test.

**Results:** build and typecheck pass; `git diff --check` clean. On a
separate local database, world and conversation browser checks passed.
Running the sound browser check concurrently with unit tests caused one
notification assertion to fail; its serial rerun passed all 17 checks.
The serial `pnpm check` result is 38/39: the sound lifecycle test at
`spec/world.test.ts:141` still exceeds its 5000 ms timeout. No timeout or
unrelated interaction code was changed to hide that failure. No deployment.

## 26. Waves moving toward the beach (2026-11-05)

**Prompt (Wen):** make the waves animated, and suggest more sounds.

**Done:** stronger swells travel toward shore; animated ripple normals;
three staggered whitewater fronts advance and dissolve, and the shore wash
runs farther up and down the sand. More mesh rows are concentrated near
shore without adding vertices. Reduced-motion preference freezes this
animation. Sound suggestions remain proposals: no audio added or played
automatically, and the six approved sounds and placement rules are intact.

**Checks:** build, typecheck and diff whitespace check pass. Inspected three
beach captures 1.5 seconds apart; wave highlights change, with no browser
or shader errors. A water-area screenshot crop stayed identical across
1.5 seconds with reduced motion enabled. Full interaction tests, real-phone
performance and listening tests were not rerun for this visual-only change.

**Rerun before committing (2026-11-06):** on a fresh scratch database,
serially, `pnpm check` 39/39 (the sound lifecycle test from entry 25 passed
within its timeout; the spec runs against the server only, so these
client-side visuals can't affect it) and `pnpm e2e` 42/42. Forest, boardwalk
and beach screenshots render with no page errors.

## 27. Bird sounds, and waves on the beach (2026-11-06)

**Prompt (Wen, translated):** rename "Evening forest" to "Bird sounds";
find sea waves, wind and leaves in the wind on YouTube or other platforms;
then, after listening, keep "Beach sounds South Carolina".

**Done:** the label is "Bird sounds"; its id stays `evening-forest`, since
placed sounds and the file are keyed by it. YouTube wasn't used (copyright,
and its terms forbid downloading). Searched Wikimedia Commons for CC0 and
public-domain recordings, compared each file's SHA-1 with the originals
in `.cache/sounds/` so the waves, forest wind and wharf Wen had already
turned down weren't offered again, and made 20 s previews of ten. Wen kept
one: "Beach sounds South Carolina.ogg" (public domain), now `beach-waves`,
"Waves on the beach", geophony, suiting the beach and the pier: 54 s from
4 s (the recording fades in), looped, -20.4 LUFS. The other six sounds
regenerated byte for byte.

**Failure and correction:** `e2e/leave-a-sound.mjs` against the server
already on :8080 failed twice ("its light goes from Ada's place too", "and
Ada's page stops playing it"), and also on the code before this change.
That server was an older process with its own database. Against a fresh
build on a fresh scratch database it passed 17/17, twice.

**Checks:** `pnpm check` 39/39; `e2e/leave-a-sound.mjs` 17/17 (seven
sounds in the palette). Not run: the other two e2e scripts; listening to
the loop's seam in the place.

## 28. The kiosk sells fish and chips (2026-11-06)

**Prompt (Wen, translated, with a screenshot of the plain kiosk):** this
should be a fish and chip shop; design it.

**Done:** `fishAndChips()` in `client/seaside.ts`, drawn from shapes and
canvas textures like the café (no new assets): a navy "FISH & CHIPS" sign
with two fish on the roof; a "Today's catch" menu in Australian dollars on
the back wall, replacing the dark panel; a steel fryer bench with two
wells of oil and baskets, wrapping paper and a roll; on the counter a
warmer of battered fish and chips under a glowing lamp, vinegar, salt,
tomato sauce, lemon wedges, three cones of chips and two wrapped parcels;
a chalkboard out front (solid, so you walk around it). Two regulars: one
frying behind the counter, one waiting at it. The place's descriptions
now say "fish and chip kiosk".

**Failure and correction:** the first screenshots showed the chalkboard's
words stretched (a wide canvas on a tall board) and the fryer baskets, in
wireframe, reading as two black outlines. The board helper now takes a
width, and the baskets are solid steel.

**Checks:** typecheck; `pnpm check` 39/39; on a fresh build and scratch
database, `e2e/world-two-browsers.mjs` 9/9, `meet-and-talk.mjs` 16/16,
`leave-a-sound.mjs` 17/17, each twice. Looked at four screenshots (front,
close at the counter, from the side, from the sand), with no page
errors; the viewpoints were set in a throwaway copy of the build, then
rebuilt. Not checked: a phone, and how it reads to people walking past.

## 29. People walk instead of sliding (2026-11-06)

**Prompt (Wen, translated):** all the NPCs slide when they walk; make them
more real.

**Cause:** the walking figure was one side-view drawing whose legs were
meant to swing by CSS, but as a sprite texture CSS never runs, so a still
picture slid along the path, always side on.

**Done:** `figures.ts` draws a stride in eight frames: each thigh turns at
the hip and each shin at the knee (bending as the leg swings through), the
arms swing against the legs, and the body dips so the standing foot stays
on the ground; the side view is drawn wider (80 × 200) so a long step isn't
cut off. Walking towards or away from you has its own frames: the leg
swinging through lifts, the arms swing, the weight shifts. `world.ts`
picks the frame by ground covered (a stride lengthens with speed), so the
feet keep pace with the ground, and the view by direction from where you
look (with some stickiness so it doesn't flicker); a frame is shown only
once its drawing has loaded. Passers-by stand 1.5 to 4 s at each end of
their path before turning back, each at their own pace. Everyone who stays
put breathes; talkers gesture and rest; the barista and the fish and chip
cook turn now and then to their work (`Regular.alt`). Other people in the
place use the same stride. Reduced motion still stills the passers-by and
regulars.

**Failure and correction:** the first side frames bent the knee 42°, so
the swinging shin kicked out almost flat, and the stride ran off the
60-wide drawing. The knee now bends at most 30° and the drawing is wider.

**Checks:** typecheck; `pnpm check` 39/39; on a fresh build and scratch
database, `e2e/world-two-browsers.mjs` 9/9, `meet-and-talk.mjs` 16/16,
`leave-a-sound.mjs` 17/17. Looked at every frame drawn flat (side, front
and back, cat and dog) and at 40 screenshots 120 ms apart from the sand
facing the boardwalk: a passer-by's legs change between frames, facing
the way they go. Not checked: a phone, and memory with many people
walking (each walker loads up to 24 frames).

## 30. Waves on the beach wouldn't stay (2026-11-06)

**Prompt (Wen, translated):** I can't leave Waves on the beach on the
sand; check the other sounds work too.

**Cause:** the local server on :8080 was started on 2026-11-05 at 21:07,
before `beach-waves` was added, so it still held six sounds; the page,
built later, offered seven. A probe that joins, stands on the beach and
leaves `beach-waves` got `400 bad_request` from it. The page then said
"Check your connection", which pointed the wrong way.

**Done:** against a fresh build and scratch database the same probe left
all seven sounds on the beach (201 each) and removed them (200 each). The
page now explains `bad_request` as the place not knowing that sound yet
and asks for a reload. Wen needs to restart the local server.

**Checks:** typecheck; the probe above, against the old and a fresh server.

## 31. Toilets, showers and a souvenir shop you can walk into (2026-11-06)

**Prompt (Wen, translated, with a screenshot of the five plain huts):** the
first two huts are men's and women's toilets, the third and fourth men's
and women's showers, the fifth a seaside souvenir shop; all five doors
open; redesign their materials and style.

**Done:** `client/huts.ts`. Each hut has painted weatherboards (canvas, its
own colour: blue, coral, mint, lemon, white), white corner boards, door
frame, skirting, fascia and bargeboards, a corrugated iron roof, gable
ends, a timber step and a sign with a pictogram (MEN / WOMEN, Toilets /
Showers; SEASIDE SOUVENIRS). Patterns keep their size on any box (UVs
from position). The door turns on its hinge and swings inwards when
anyone (you or someone else in the place) is within 2 m, and closes after
(`PlaceKit.animate` now gets where people stand). Inside, tiled and lit by
a ceiling panel: toilets with cubicles, doors ajar, toilets, urinals,
basins and mirrors, a hand dryer; showers with stalls, risers, heads,
curtains, drains, a slatted bench, towels on hooks and a mat; the shop with
shelves of beach balls, buckets and spades, shells and snow globes, sun
hats, T-shirts on the wall, a postcard stand, a counter with the CC0 till,
a display window, someone minding it, and beach balls and buckets out
front. Walls, partitions and fittings are solid; a hut counts as indoors,
so a sound left in one is heard through its walls.

**Failures and corrections:** the first screenshots 404ed on
`/client/huts.js` (not in `STATIC`); the shop window was first cut by
removing wall meshes, which left their collision and lining behind, so
the front wall is now built round the window; ceilings were dark, mirrors
reflected the sky, and T-shirts were plain squares.

**Correction to earlier entries:** `pnpm check` runs against `APP_URL`,
which defaults to :8080, the stale local server. So the "pnpm check
39/39" in entries 27 to 29 tested that old server, not the new code. The
e2e runs in those entries did use fresh servers. Against a fresh build
of this commit (which includes those changes) the spec passes 39/39.

**Checks:** typecheck; spec 39/39 and `e2e/world-two-browsers.mjs` 9/9,
`meet-and-talk.mjs` 16/16, `leave-a-sound.mjs` 17/17 against fresh
servers. Looked at the five huts from the boardwalk, from the shop's step,
and inside four of them.

## 32. Five children with a beach ball (2026-11-06)

**Prompt (Wen, translated):** five children playing with a beach ball on
the beach; find sounds of the ball being passed and of children playing.

**Done:** `kidSvg` in `figures.ts`: the same cats and dogs with a child's
bigger head for their height (scaled 1.5 about the neck), bright tops,
shorts and bare legs, 1.15 m tall; an `arms-up` pose, and for children the
raised hands reach above the bigger head. `PlaceKit.ballGame` places five
of them on the sand between the boardwalk and the lifeguard tower; the
world throws a beach ball (the shop's striped texture) from one to any
other on an arc that rises more for a longer throw, spinning; the catcher
reaches up before it lands and hops on the catch, holds it half a second
to a second and a half, and throws again. Its shadow on the sand shrinks
and fades with height. Reduced motion leaves the ball held.

**Sounds (offered, not added: Wen chooses by ear):** Commons has children
playing ("209901 foongaz city-playground-boxhagenerplatz-berlin.wav" CC0;
"Indoor swimming pool children.ogg" public domain; "Douzen kids on
playground" is the `children` Wen already turned down). It has no
recording of a ball being thrown, caught or bounced: searches for ball,
bounce, kick, catch, volleyball and beach ball found only spoken words and
music. Previews are in the scratchpad for Wen.

**Failure and correction:** at first the raised hands, drawn for an adult
head, stayed below the child's bigger head, and the held ball covered the
face.

**Checks:** spec 39/39 and e2e 9/9, 16/16, 17/17 against a fresh server;
the children drawn flat, standing and arms up; six screenshots 250 ms apart
from the boardwalk with the ball in flight and held.

## 33. A fuller picture: ambient occlusion, and wind in the plants (2026-11-06)

**Prompt (Wen, translated):** use three.js 3D to improve all the scenes
overall.

**Done:** the renderer already had ACES tone mapping, soft shadows, an HDR
sky lighting the models and fog. What the place drawn from simple shapes
lacked was the soft shade where things meet. The world view now draws
through an `EffectComposer`: the scene into a multisampled half-float
target (so edges stay smooth), `GTAOPass` ambient occlusion (radius 1.1 m),
then `OutputPass` for tone mapping. Figures (flat sprites), the drawn sky
and anything transparent are hidden from the occlusion pass, so they
don't shade what's around them. A slow device drops occlusion first,
before the existing steps. And the plants move: `sway()` in
`world-build.ts` leans a material's vertices with a shared wind clock, by
the square of their height, in gusts that pass across the place; pine
crowns (about 20 cm at the top of a 15 m tree), edge grass, grass, ferns
and shrubs. Reduced motion stills the wind.

**Failure and correction:** the first settings (radius 0.7 m, blend 0.85)
were too faint to see beside the same view without them; now stronger.

**Checks:** spec 39/39 and e2e 9/9, 16/16, 17/17 against a fresh server.
Screenshots of the boardwalk, forest, café, huts and a toilet, with no page
errors, compared with the same views from the commit before; two forest
frames a second apart differ in the crowns and the ground plants. Not
checked: frame rate on a phone (the quality fallback covers it, unproven).

## 34. Showers, a flushing toilet and children playing (2026-11-06)

**Prompt (Wen, translated, after listening to the previews):** keep
"Shower Sound Ambience", "Flushing the toilet" and
"209901 foongaz city-playground-boxhagenerplatz-berlin".

**Done:** three more sounds, all people's (orange): `children-playing`
("Children playing", CC0, 80 s from 6 s, suiting the beach),
`toilet-flush` ("Toilet flushing", public domain, 70 s from the start:
the flush begins at 2.1 s, just after the loop's 2 s fade in, then the
cistern refills, so it flushes about once every 70 s), and `shower`
("Someone showering", CC0, 60 s from 10 s). The toilet and shower suit
the boardwalk, the zone the huts are in. Each is -20.4 LUFS; the seven
earlier files regenerated byte for byte. No recording of a ball being
passed was found (entry 32).

**Checks:** spec 39/39; `meet-and-talk.mjs` 16/16, `leave-a-sound.mjs`
17/17 (ten sounds in the palette); a probe left and removed each new sound
on the beach. `world-two-browsers.mjs` failed one check once (8/9); the
run didn't record which, and three reruns on a fresh server passed 9/9.
The verify script now keeps each run's log.

## 35. Back to the sharper picture (2026-11-06)

**Prompt (Wen, translated):** the picture looks very blurry now; restore
the image quality from before.

**Done:** ambient occlusion is gone (entry 33): the scene draws straight
to the screen again, without the composer's intermediate target and the
occlusion's denoising, which softened it. `world.ts` is as it was before
that commit apart from the wind clock; the plants still sway.

**Checks:** spec and e2e against a fresh server (counts in the commit's
verify run).

## 36. Toilets and showers, one at a time (2026-11-06, ADR 013)

**Prompt (Wen, translated):** when a player goes into a toilet or shower,
the light outside turns red; when someone else comes near, a notice asks
them to wait; whoever is inside is asked whether to leave a flush or shower
sound there; when they come out, the sound goes by itself.

**Done:** ADR 013. Server: shared hut layout, `while_in` on
`placed_sounds`, `whileInside` sounds with their own refusals, ended on
moving out, leaving or going quiet, and on start. Page: a light by each
toilet and shower door, locked doors, a wait notice, a question on going in,
and quiet endings.

**Failures and corrections:** the question didn't appear for someone who
arrives already inside, since joining happened after the page saw them
enter; it now asks again on joining. And the door opened for anyone inside
within 2 m of it, which in a 3.9 m hut showed whoever was in to whoever
waited outside; now an occupied hut opens only for its person at the door.

**Checks:** spec 40/40 (the new test fails without the server ending the
sound on the way out); e2e against a fresh server; the two-browser run
in ADR 013, with screenshots of the shut door and red light, then the open
door and green light.

## 37. Mateo sits on his bench, and says who he is (2026-11-06)

**Prompt (Wen, translated):** the guitarist isn't sitting: the bench goes
through his body. Make him sit on it, as a busker, with a sign beside him
introducing himself (suggest what it says).

**Cause:** a figure is a flat picture turned to face you, and his stood at
z 1.86, inside the bench's seat (z 1.68 to 2.12), so the seat cut across
his legs. Café sitters had the same problem with chairs.

**Done:** anyone sitting is drawn up to 30 cm towards you from where they
sit, every frame (`placeSitters`), so the seat is behind them from any
side. The busker's pitch (`buskerPitch`): a chalkboard on an easel reading
"MATEO, on guitar. Catalan & Spanish folk by the sea. Now playing: El Noi
de la Mare (the recording his sound is). Requests welcome: just ask!
Thanks for listening", and his guitar case open on the ground, lined red,
with a few coins. Both are solid.

**Checks:** spec and e2e against a fresh server; screenshots from the
boardwalk, along it, and from the sand behind.

## 38. Staff walk about, and a wide throw gets fetched (2026-11-06)

**Prompt (Wen, translated):** let the café and fish and chip staff walk
about now and then, not only turn; let the children's ball sometimes fall
to the ground and be picked up, so it looks more natural.

**Done:** `Regular.roam`: the barista walks to the other end of the
counter, the cook to the fryers, the shopkeeper to the shelves, every 10
to 22 s; they stay 3 to 7 s turned to the work, then walk back, with the
stride frames (entry 29), so they don't slide. Children can now walk and
run: `kidSvg` draws side and front/back strides with shorts to the knee
and bare shins that move with the legs. About one throw in five goes wide:
the ball lands beyond the catcher, bounces lower each time, rolls to a
stop in the sand (turning by the distance it rolls); the child it was for
runs over (2.6 m/s), picks it up with a hop, runs back carrying it at the
chest, and throws again.

**Failure and correction:** the first version had the child carry the
ball home overhead, which used one still drawing, so the child slid; now
they carry it at the chest and the legs keep their stride.

**Checks:** spec and e2e against a fresh server; the child's strides drawn
flat; 24 screenshots 300 ms apart of a wide throw being fetched (with the
miss forced, in a throwaway build), and 10 of the cook going to the
fryers and back (with the wait shortened).

## 39. A guide for someone new (2026-11-06)

**Prompt (Wen, translated):** help people coming in for the first time get
to know the site: a few pop-ups in different places that guide them to use
the features and go into the different parts of the place.

**Done:** `client/guide.ts`. After the arrival card, a five-step tour, each
step outlining the control it's about: walking and looking, Go to, Leave a
sound (only once joined), the sound switch, meeting people. Skippable.
Then, the first time someone reaches each part of the place, a card at the
top of the view says what's there and what to try, with a button to the
next part (forest, creek, boardwalk, café, beach, pier and back to the
forest), and one for the souvenir shop. Cards don't block walking. What's
been seen is kept in this browser's localStorage, in a try/catch. The
boardwalk's description no longer says "beach huts".

**Checks:** spec and e2e against a fresh server (the guide's cards don't
get in their way); a new visitor in Chrome: the tour's five steps, each
outlining its control, then the boardwalk's card, whose button walks to
the café, where the café's card shows; after a reload, no tour.

## 40. A creek and a sea more like real ones (2026-11-06)

**Prompt (Wen, translated):** the creek and the sea still aren't natural
enough; look at real seas and creeks and redesign them, but keep the sea's
colour, which Wen likes.

**Done:** the creek was a straight, flat, 124 m canal between two brown
boards. Now (`buildCreek`, `creekBed`): its course wanders either side of
the old line and its width changes; the ground slopes down from the forest
floor to the water's edge and on to a bed 0.75 m down, darker and siltier
towards and under the water; the water is clear at the edges, where the
bed shows, and deeper and darker in the middle (per-vertex colour and
alpha), a forest stream's olive green that reflects the sky, its ripples
running downstream. Boulders sit in and beside it, pebbles along the
water's edge, grass up the banks (`creekStones`). The collision band and
footbridge are unchanged.

The sea keeps its colours. Its swell is four waves from different
directions rather than two; its ripples are a new normal map of 24 waves
of random direction and size (tiling), sampled where the water is at two
sizes and angles, each drifting its own way, and softening with distance.
The old map, three sines repeated 240 times, showed as rows of dots and
then, sampled at world scale, as a lattice. A swash now runs up the sand
behind the foam and slides back: a thin clear sheet with a wavy edge.

**Failures and corrections:** the first ripple change did nothing:
`onBeforeCompile` sees `#include <normal_fragment_maps>`, not the line I
replaced; it now replaces the include. The first creek was a bright,
pool-like teal; now olive. The first world-scale ripples made a diamond
lattice at mid distance; hence the irregular map and the distance fade.

**Checks:** spec and e2e against a fresh server; screenshots of the creek
from the edge of the forest and the bridge, the sea from the sand and the
pier, before and after each change, and of the swash in and out.

## 41. More sounds, and a way to find what people leave (2026-11-06, ADR 014)

**Prompt (user, translated):** add sound elements, improve the interface with
Three.js, and consider useful modules and experience improvements while keeping
the product focused. Asked about natural or everyday sounds, the user answered:
"Add both; a little more won't hurt."

**Done:** six source-verified Commons recordings (seagulls, breeze and birds,
cicadas, a bicycle bell, cups and dishes, a boat by the pier), bringing the
catalogue to sixteen. The original ten audio files and their provenance are
unchanged. The new source checksums, licences, cuts and measured outputs are
recorded in `docs/sound-library-2026-11-06.md`; the new assets total about
1.77 MiB. A targeted fetch script can rebuild selected recordings without
rewriting the others.

The native-dialog sound library (`client/sound-library.ts`) offers search,
family filters, local suggestions, private Listen/Stop, loading feedback,
empty results and inline placement errors. Modal browsing releases movement
already held, traps focus in the browser's native dialog, and returns to the
view without scrolling it. A cancelled or superseded download cannot start a
preview after the dialog is closed. The optional `client/listening-trail.ts`
shows the nearest three contributions, their authors, distances and directions;
Face sound turns the view without moving anyone. It collapses on small screens.

The Three.js sound lights gain shared-geometry anchor rings, and a small
spreading wave only for a nearby sound the listener is actually playing.
Reduced motion keeps the marks still; distant waves are hidden, and removal
releases individual materials. The surrounding interface uses a coastal green
frame with warm actions and larger touch targets. There is no automatic
background sound, new ownership rule or additional runtime dependency. UI/UX
Pro Max informed keyboard, contrast and responsive checks; its Three.js query
had no matching ready-made sound-marker pattern, so the geometry extends the
existing renderer directly.

**Failures and corrections:** an initial browser run encountered an old
running server which still knew only ten sounds while the browser catalogue
had been rebuilt. Its new-sound request was correctly refused. The server was
restarted from the complete sixteen-sound build before the final checks.
Another inspection found that the previous two-second audition offset skipped
the bicycle bell and played its quiet interval instead. Previews now start at
the beginning. Restoring the old offset in a throwaway compiled file made the
new short-call check fail as expected; the real build was restored afterwards.

**Checks run for this change:**

- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- App compilation with `tsc -p tsconfig.build.json` and stylesheet copy: PASS.
- Full Vitest suite against the fresh local service and a scratch SQLite DB:
  PASS, 40/40 in three files, including every offered audio resource and its
  licence manifest, imported modules, persistence snapshots and realtime rules.
- Four Chrome/Metal browser suites: `world-two-browsers.mjs`,
  `meet-and-talk.mjs`, `leave-a-sound.mjs`, and `sound-discovery.mjs`: PASS.
  The new suite has twenty checks, including delayed-preview cancellation,
  short-call preview offset, filters, keyboard behaviour, placement failure,
  another person's discovery list, turning without teleporting, and a 375 px
  reduced-motion viewport. The old sound suite now follows the actual catalogue
  size rather than assuming ten.
- `node scripts/check-evidence.ts`, JavaScript syntax and `git diff --check`:
  PASS. New recordings fully decoded and originals matched official SHA-1s.
- Desktop and phone screenshots were viewed. Final evidence is under
  `docs/screenshots/14-*`; intermediate runs are in gitignored `test-results/`.

**Local environment:** the shell has pnpm 10.33.2, below the required pnpm 11,
so the same compiler, test runner and evidence scripts were invoked directly.
The installed Rolldown native module stalled before test collection. A fresh
copy of the exact locked `@rolldown/binding-darwin-arm64@1.2.9` was downloaded
from npm, its SHA-512 matched both registry integrity and the lockfile, and a
process-local `NAPI_RS_NATIVE_LIBRARY_PATH` selected it for verification.
Neither original dependencies nor OS quarantine settings were changed.
The audio pipeline needed process-local IPv6 and dynamic-library settings,
as documented with its sources; no global settings were changed.

**Limits:** the recordings have technical checks, not human listening approval;
the breeze includes birds and the boat includes background voices. Real-phone
performance, a screen reader and the combined listening experience still need
people trying them. No production database was used. Changes were made on
`feat/sound-discovery-polish`; no merge, push or deployment was performed.

## 42. Looking follows the pointer (2026-11-06)

**Prompt (user, translated):** mouse/trackpad view control feels reversed:
moving down should look down, moving left should look left. Commit improvements
promptly.

**Done:** reversed the horizontal and vertical drag deltas in `world.ts`,
keeping the current sensitivity and pitch limits. Keyboard controls, walking
and Face sound keep their existing behaviour. The contract is recorded in
`CLAUDE.md`. A new browser check is included in `pnpm e2e`.

**Regression and checks:** `e2e/look-controls.mjs` creates an isolated client
view using the real WorldView and reads its public camera direction after
actual pointer drags. Against the old build it failed at "dragging down must
look down". Against the corrected build all six checks passed: down/up/left/
right look in that direction, looking does not move the camera's position,
and no page errors. It does not join a room or change shared data.
`tsc --noEmit`, application compilation and `git diff --check` passed.
The full HTTP and multiplayer suites from entry 41 were not rerun for this
pointer-only change.

## 43. Restore the seaside guitarist (2026-11-06)

**Prompt (user, translated):** the seaside guitar player's sound has gone.
Also requested configurable look direction, a multiplayer design first, and
checks for toilets, showers, flushing and occupied doors.

**Done:** Mateo's figure was still animated, but no audio source was connected
to it. His figure and a narrowly scoped local guitar voice now share one
position in `seaside.ts`. The voice is audible within 18 m, with HRTF, distance
attenuation and the existing indoor low-pass treatment. It respects Sound off
and page visibility. A selected nearby player guitar takes precedence so the
same recording does not double. There are no seeded sounds, marks, rows or
quota changes. The empty nearby guide now says no *shared* sounds are nearby,
since the NPC may be audible. This is Wen's explicit exception to silent NPCs,
not an automatic background bed.

**Checks:** TypeScript check and compilation passed. The new actual
Chrome/Metal `e2e/busker-sound.mjs` passed all 12 checks: one real source,
nonzero Analyser output, no contribution, distance exit/return, Sound off/on,
AudioContext suspension/resumption, player-guitar precedence/removal and no
page errors. Screenshots were viewed. Chrome automation kept multiple tabs
visible in both headed and headless runs; the bounded real-tab visibility
assertion failed. The final visibility test explicitly supplies only the
platform visibility event and checks the real AudioContext state and source;
it does not claim an actual tab switch or human listening approval.

**Environment:** optional native `fsevents` stalled during verification. A
process-local preload makes only that optional import report MODULE_NOT_FOUND,
using its existing fallback. Original dependencies and OS settings are untouched.
Tests ran against an isolated scratch service and DB; its service is stopped.

**Design only:** `docs/proposals/cooperative-play.md` proposes sound replies,
shared listening walks and optional nearby listening invitations. It states
that none is implemented; replies are recommended first to keep collaboration
about the sounds people leave. Committed separately as `8fe95d4`.

## 44. A remembered choice of look direction (2026-11-06)

**Prompt:** offer both mouse/trackpad directions as settings and explain them
when entering the place.

**Done:** the arrival card explains Follow pointer and Drag the scene with
explicit down/left examples. Follow pointer remains the default. Both axes
change together; the preference is saved in this browser and can be changed
later in Controls. The native dialog pauses movement and returns canvas focus
on Escape or Done. Walking, sensitivity and pitch limits are unchanged.

**Checks:** actual Chrome `e2e/look-controls.mjs` passed 15 checks, including
arrival selection, reload persistence, Controls changes, Escape focus and
camera direction for up/down/left/right in both modes without moving position.
A test-only intercepted world module that forced Follow pointer for both
preferences failed at the first Drag the scene direction assertion, as
expected; no product file was changed for this mutation.

The first screenshot showed the added choices pushing Enter below the stage's
edge. Arrival now uses the viewport, with scrolling on short screens. Desktop
1280×840 and phone 375×812 show all arrival actions without scrolling; 375×600
keeps the card in the viewport and scrolls to a usable action. Controls fits
the phone without horizontal overflow. Screenshots were viewed; evidence is
under `docs/screenshots/15-*`. Type checking and compilation passed.

## 45. Occupied huts stay private, including under latency (2026-11-06)

**Prompt:** include toilets and showers in testing: flushing and doors that
cannot open after someone occupies the room.

**Done:** the existing red light, door animation and collision now have a
server admission check behind them. Exactly one concurrent arrival is accepted;
a rejected move receives its previous valid position or a point outside the
door. A new stream receives existing positions immediately. Temporary sounds
remain outside permanent capacity/spacing/crowding rules, as ADR 013 intended.

**Review findings and corrections:** a delayed 409 could roll back a more
recently accepted move while its success response was still in flight. The
client now sends only one position command at a time, aborts a stuck request
after five seconds, and uses the current frame for its next report. A second
review found that a reconnect within the expiry sweep's 200 ms window could
revive an expired position inside someone else's occupied hut. Rejection now
discards expired/contested fallback positions, broadcasts their removal and
soft-ends their temporary sounds. No database rows are deleted.

**Targeted checks:** four added HTTP tests cover simultaneous admission,
rejected first arrival, current positions on new SSE, last-page disconnect,
multiple tabs, real 20-second inactivity and temporary sounds at the full
150 permanent-sound limit. The controlled-clock `spec/hut-admission.test.ts`
jumps 20,001 ms without running the sweep, proving the reconnect boundary:
without the correction it failed by returning inside; with it the original
sound row has removal attribution, only the current occupant is broadcast,
and the rejected person cannot leave another private sound.

Two actual Chrome identities passed all 21 `e2e/huts.mjs` checks, covering
both toilet and shower: red light/shut locked door, real W collision, server
refusal and client correction, real audio-source start, exit clearing the
sound, green light and entry by the waiting person. A real 409 held for 700 ms
while Q changes the view produces no overlapping move; after release, an
outside move is accepted again. Removing just the server admission check in
a throwaway compiled copy made the concurrent-entry assertion fail. A separate
restart fixture confirmed orphan temporary rows are soft removed on start.

**Full HTTP/local regression:** 45/45 passed across four files on the final
build and an isolated DB. The first full run found an old presence test using
any frame with three people; initial-position delivery now made that predicate
match earlier occupants. The test now checks this run's three participant IDs,
every position and successful move acknowledgements, and the full rerun passed.
No existing assertions were dropped. Browser-suite integration is in
`package.json`; final combined runs and screenshots are recorded below.

## 46. Combined final verification (2026-11-06)

After the code changes were committed, all seven Chrome/Metal suites passed
serially against the same final build and an isolated scratch SQLite DB:
`world-two-browsers`, `meet-and-talk`, `leave-a-sound`, `sound-discovery`,
`look-controls` (15 checks), `huts` (21) and `busker-sound` (12).
No page errors were reported. This follows the full 45/45 spec run in entry 45;
there were no further application-code changes. Final occupied/free hut and
busker screenshots were viewed and added under `docs/screenshots/15-*`.

Type checking, compilation, evidence-link checks and `git diff --check` passed.
The local pnpm version remains below the repository's required version, so the
same compiler and test executables were invoked directly, with the verified
locked Rolldown native and optional-fsevents fallback described above. Docker,
a physical phone, screen-reader use and human listening were not run.

The 18861 review service was restarted from this build with its existing
scratch review database preserved. The scene and new Controls module both
returned 200. Separate test services were stopped after verification. No
production database, global Git identity or remote branch was changed; no
push, merge or deployment occurred.

## 47. Durable sound replies and safe retries (2026-11-06)

**Prompt (user, translated):** the proposed multiplayer play is good; develop
it, and improve the scene's design and beauty. The first implementation is
Option A, Sounds answering sounds, as recommended in the proposal. The route
and gathering options remain later proposals.

**Backend step:** ordinary placements can name an ordinary parent contribution.
Two additive tables retain relationships and operation identities without
rewriting old sound rows. Snapshot/live messages include parent attribution;
a public, paged neighbourhood query includes removed endpoints as metadata.
A source removed before a fresh request commits yields reply_gone, not an
unlinked sound. Private-stay sounds cannot be parents or answers. Existing
position, spacing, crowding, rate and capacity checks apply to every new
placement. Replaying a committed operation for the same user returns that
original result without another row, broadcast or rate charge, including a
removedAt acknowledgement if it has since been removed.

**Checks:** seven controlled-SQLite tests and one real HTTP/SSE test passed
(8/8, 3.19 seconds). They cover branch attribution, same-operation concurrent
requests (201+200, one ID and one event), conflicting content, ordinary limits,
removed-source refusal, both private boundaries, restart/tombstone recovery,
50+1 pagination and an old database gaining tables without changing its rows.
The new test run with HEAD's former sessions implementation failed on missing
replyTo; the implementation passed. Type check and compilation passed. These
checks used isolated temporary databases; front-end and art verification follow.

## 48. A more considered coastal scene (2026-11-06, ADR 017)

**Done:** a warm paper frame and serif place title surround a larger view, with
quieter navigation and a smaller empty nearby panel. Dark local controls retain
readable contrast. The sky is drawn in coastal blue/cream with the existing
HDR kept for environmental lighting. Afternoon sunlight, softer shadow filtering
and haze join three distant headlands, green-blue water and gentler foam. Sand
and trail normals are quieter. Instanced beach grasses and irregular pine
crowns soften the outline; replacing eight cones with six icosahedral boughs
cuts crown triangles by about 40%. The cafe gains limewashed walls, timber
rhythm, a base, awning details and an original code-drawn pine-and-tide mark.

**Iteration:** the first visual pass still had hard triangular skirts on trees,
a blank cafe side wall and grey sky. Screenshots were viewed and those parts
were refined, then the boughs flattened and offset to avoid a stack of balls.
No collider, path, spawn or NPC audio position changed. No additional library,
asset download or sound was introduced.

UI/UX Pro Max supplied interaction, contrast and Three.js colour/shadow checks.
Its initial whole-system query returned a marketing layout and unrelated rose
palette; the narrower nature-game query had useful green/sun colours but still
suggested a marketing layout. That layout was not adopted. The actual art
composition and field-journal frame were designed for this existing world.
Version-specific shader and shadow behaviour was checked in installed Three.js
0.170 source, rather than copying the skill's newer-version API assumptions.

**Checks:** type check and compilation passed; the existing world walk suite
passed 9/9 (cafe, bridge, forest-to-boardwalk, kangaroo and return). Seven zone
screenshots and phone views were viewed with no page errors. Mac GPU rendering
was 60 fps at desktop and phone viewport sizes. A separate DPR2 touch renderer
measured beach 60 fps and forest 59 fps; real CDP touch joystick movement worked.
These are local desktop-GPU measurements, not a physical-phone claim. Metrics
are in `docs/evidence/coastal-rendering-2026-11-06.json`, selected screenshots in
`docs/screenshots/17-*`. The full HTTP/local suite also passed 53/53 in six files.

## 49. Compose by answering another person's sound (2026-11-06, ADR 016)

**Front-end step:** nearby ordinary sound labels offer Reply with a sound and
Conversation. The existing library names the source; closing keeps a cancellable
intent so a person can walk before choosing the answer. A confirmed placement
announces who answered whom; the conversation view shows a parent and paged
answers with attribution. Face only turns; removed nodes remain readable and
cannot play. Visitors can read without joining. Source removal before a reply
asks for an explicit Leave without a reply instead of silently changing intent.
Connection failures retain the key and target for explicit retry, never an
automatic reconnect submission. Private-stay sounds have neither reply action.

**Review corrections:** a successful but delayed original HTTP acknowledgement
could arrive after another person's removal and restart the removed sound.
The page now remembers observed removals, also inferred from a new snapshot,
and refuses that resurrection. Another review found a pending target A's error
could appear under a newly selected target B. Feedback now belongs to its
original library context; a current B error still appears normally. Modal
switching checks the current native dialog before resuming world movement.

**Targeted verification:** the two-contributor main flow passed its original
28 observations: ordinary placement, contextual reply, cancel, walking, aborted
POST, explicit retry with the same operation id, correct standing position,
both sides' attribution, reload, phone late arrival, public removal, removed
source recovery and explicit unlinked placement. The initial fixed 700 ms
movement check was too early under rendering load, so it now waits for actual
movement with a four-second bound. The first test tried to operate a non-nearest
label; it now uses the actual parent-to-answer conversation navigation. Three
simultaneous automated visible worlds overloaded actionability on this Mac;
the flow closes the original author's page before the late visitor arrives,
also checking that their contribution outlasts their connection. Assertions
and the third identity remain.

The separate ACK-race suite passed 12 observations using real HTTP, SSE and
removal, including a cut stream that really misses a removal and a reopened
stream delivering a fresh server snapshot. A response-only mutation removing
the tombstone guard failed exactly when the old ACK revived the sound. The
real SoundLibrary/native-dialog fixture passed five observations for A-to-B
context switching; removing only its feedback guard in the served response
made the stale-error assertion fail. No product file was changed for either
mutation.

**Phone iterations:** screenshots exposed chat over the duplicate source action
card, then a toast over pending buttons. During a pending reply, the contextual
card replaces duplicate floating labels and the exploration panel. Toasts are
now readable, non-interactive messages at the top of the view. Chat, heard words
and placement controls have distinct vertical space. The final phone-only run
passed 8/8, with a real nearby participant: no overflow, safe pending/chat/toast
actions, Cancel restoring source actions, and normal chat clear of Leave.
Desktop and phone images were viewed; selected evidence is in
`docs/screenshots/16-*`. Type, build and evidence-link checks passed. Both new
browser suites are included in the e2e chain; the combined run is recorded next.

## 50. Final integrated verification for replies and coastal art (2026-11-06)

All nine Chrome suites passed on the final application build: world walking,
meeting/talk, ordinary leaving/removing, sound discovery, look preferences,
huts, busker audio, cooperative play (33 observations) and the ACK race (12).
The sound-discovery run includes its five-observation library-context fixture.
The initial chain stopped because an old global `.library-close` locator now
matched both native dialogs. Those three existing checks now explicitly target
`#sound-palette`; no assertion was dropped. With no application-code change,
the remaining six suites were rerun and passed. The first three suites had
already passed. No page errors were reported.

This follows the 53/53 full spec run (six files), final type/build checks,
negative controls and phone/visual checks recorded above. Docker, a physical
phone, a screen reader and human collaborative listening were not run. Local
verification used the existing direct Node executables, exact-lock verified
Rolldown native and process-only optional-fsevents fallback; no global package,
OS or account settings were changed.

The scratch test database retained 178 historical sound rows with zero live
sounds and zero live private-stay sounds after the final browser cleanup. Test
services were stopped. The 18861 review service remains available with its
previous review database preserved, including the additive reply tables. Its
scene and new conversation module returned 200; the actual final review view
was captured and viewed. Source and tests were committed in verified steps on
`feat/sound-discovery-polish`. No push, merge or deployment was performed.

## 51. Repair macOS native dependency startup warnings (2026-11-06)

**Prompt:** Wen reported Apple's cannot-verify warning for `fsevents.node` at
startup. The copied `node_modules` tree carried Keka quarantine attributes on
both required fsevents versions (2.3.2 through Playwright, 2.3.3 through
Vitest/Vite), Rolldown, Lightning CSS and both esbuild executables. Its pnpm
metadata also pointed to the previous machine's store. This was an installation
problem; the four `.node` hashes matched fresh official locked packages.

**Repair:** downloaded the project-pinned pnpm 11.9.0 from the npm registry and
verified its SHA-512 integrity against the registry metadata. A staging install
used the existing manifest, frozen lockfile, esbuild build permission and an
empty store. After verifying the staging native modules, retained the old tree
as a temporary backup and rebuilt the real project offline from that verified
store. The final store is the ignored `.cache/pnpm-store`, configured only in
`pnpm-workspace.yaml`, so a later ordinary install does not depend on the repair
directory. A repeated frozen offline install with no store argument succeeded.
The manifest, lockfile and tool pins stayed byte-for-byte unchanged. No global
package, GitHub identity, OS security setting or user database was changed;
quarantine attributes were not removed. The old quarantined tree remains in
`/private/tmp/soac-native-repair-0ardo1zc/original-node_modules` for rollback.

**Verification:** both genuine fsevents versions received writes to disposable
probe files; Playwright, Vite and Vitest imported and esbuild transformed TS.
All commands explicitly unset the old `NODE_OPTIONS` preload and native-library
path override. The first watcher probe in the sandbox timed out; a canonical
path probe with real OS event access passed, including the actual changed file.
The initial Python xattr inspection lacked platform support and was replaced
with the native `xattr` reader; no file attributes were altered. The rebuilt
tree passed 53/53 tests in six files. After moving to the permanent project
store, typecheck and build passed again, all six native files were verified
without quarantine, both watchers started and stopped, and the existing Chrome
busker suite passed all 12 observations, including measurable guitar output,
with no page errors. Native checks and package hashes are recorded in
`docs/evidence/native-dependencies-2026-11-06.json`.

Checks used the locally available Node 24.10.0 and the verified pnpm 11.9.0;
the committed Node pin remains 24.21.0. Docker and the other eight browser suites
were not rerun for this installation repair; their previous results are above.
The temporary 18870 test service used a separate database and was stopped after
verification. The existing 18861
review service continued serving the scene, Three.js and conversation script
with HTTP 200. `docs/local-development.md` records fixed-version setup and a
backup-first repair recipe; its shell blocks passed sh and zsh syntax checks.
The evidence-link check and `git diff --check` also passed.

## 52. Keep one shared weather and clock (2026-11-06, ADR 018)

**Prompt:** Wen asked for weather, time and scene systems. The implementation
keeps one connected forest-to-sea world and the existing `morning` room, while
replacing the former Sunny Day-only presentation with a shared environment.
Weather is clear, cloudy, rain or mist; a persisted time anchor can stay paused
or advance through a day in 24 real minutes. A separate additive table leaves
sound and reply history intact. Cookie authorization, strict validation, an
independent one-second limit and transactional reviewed-revision checks protect
edits; snapshots and attributed SSE carry the committed result.

The seven isolated database/clock tests passed without native-module workarounds,
and the full typecheck passed. They cover wraparound, pause, concurrent edits,
bad input, independent limits, restart recovery and an additive migration with
pre-existing sounds. The first restart test mixed fake timer advancement with
module resets; it now verifies the persisted anchor at an explicit recovery
time. Removing only the revision guard in a separate copied source tree made
the stale-edit test fail: a competing old choice was incorrectly accepted.
The real repository was not mutated for that negative control. HTTP/SSE and
browser integration results follow in the next entry.

## 53. Light and weather throughout the coastal day (2026-11-06)

Continuous light keyframes now drive sky, sun, fog, warm night lamps, figure
tints, wet boardwalk materials and HDR intensity. A procedural moon and stars
need no new assets. Rain reuses at most 2,400 line particles (900 at a narrow
initial viewport); both endpoints avoid the cafe, shop and private hut roof
footprints. Runtime reduced motion hides rain and skips transitions. An
asynchronously loaded HDR respects the current environment, and later changes
cannot undo adaptive shadow reductions. The second existing outdoor light is
explicitly distinguished from cafe ceiling lights.

The actual renderer passed all 16 weather/time combinations, with 21 captures,
zero page errors, invalid rain vertices or rain vertices under roofs. Following
sun-shadow targets stayed 90 m from the target after scene travel. A sampled
5,760 minute/weather light profiles were finite and bounded; clear 14:00 still
matches the original afternoon. Desktop rain measured 60.12 fps and the 390px
viewport 60.29 fps over three seconds, with p95 frame intervals 16.8/16.7 ms.
These are local desktop-GPU measurements, not physical-phone results. Reduced
motion hide/restore, persistent quality reduction and clock resynchronization
also passed. Metrics are in `docs/evidence/environment-rendering-2026-11-06.json`;
viewed representative dawn, dusk and rainy-night images are in
`docs/screenshots/18-*`. The first Chrome launch lacked sandbox permission;
the same harness passed with scoped local browser/GPU access.

The integrated HTTP/local suite also passed 64/64 in eight files, including
cookie authorization, attributed environment SSE and stale-edit responses.
Review caught a same-revision acknowledgement resetting a running clock after
its SSE event had already arrived. HUD, panel and renderer now retain the
greater of the incoming server sample and the projected monotonic sample;
new revisions may deliberately reset time. Three real DOM/promise tests cover
that eight-second delayed ACK, a fresh sample after sleep, and a later edit
preceding an older success. Removing the panel guard in a copied source made
the delayed-ACK assertion fail (14:08 became 14:00). A direct renderer fixture
also verified a fresh same-revision sample catches up and an old one cannot
rewind. Full typecheck and build passed. Browser interaction checks follow.

## 54. Choose the shared sky and explore connected scenes (2026-11-06)

The new compact toolbar opens a native Weather & time / Scenes dialog. Weather
cards, time presets, a slider and a pauseable clock keep a private draft until
Apply for everyone. Visitors can browse and travel; shared editing requires
joining and a connection. Conflicting settings require explicit Use latest,
and interrupted requests retain choices without an automatic resend. The
live clock summary is not an assertive per-second screen-reader announcement.
Nine original vector postcards describe the existing zones; Go here moves only
the choosing visitor. Old direct zone links remain. The visible label is now
Shared world while its canonical route and historical room name stay the same.

The UI used `ui-ux-pro-max` guidance for Three.js colour management, labelled
controls, visible focus and native-dialog keyboard behaviour. No bitmap asset
or runtime dependency was added. The original broad progressive-disclosure
search returned an unrelated typography result; a narrower modal-focus query
returned relevant guidance and was used instead.

The new `e2e/environment.mjs` failed against the previous scratch build because
the weather control did not exist, before joining or writing any sound. On the
new scratch build it passed all 25 observations: two cookie identities in the
same room; no writes while choosing and no walking through a modal; real SSE
for applied rain/night; private-draft conflict review; clock advance and pause;
nine destinations with persistent contributions; one aborted request with no
automatic retry; runtime rain reduced-motion hide/restore; a held real HTTP
commit followed by a newer edit; and the old acknowledgement leaving both HUD
and draft current. The first two worlds close before the late phone visitor,
also proving a contribution remains after its author disconnects. At 375px and
in 812-by-375 landscape, the panel scrolls without horizontal overflow; tabs,
Escape, canvas focus, 44px scene controls and guest travel passed. There were
zero page errors. Isolated DOM interaction checks also passed for Apply,
pending deduplication, guest access, conflict review and retained drafts.

Desktop and phone panel/scene screenshots were viewed and selected captures
are in `docs/screenshots/18-*`. The new browser suite is included in the e2e
script. The nine existing browser suites are being checked together next.

## 55. Integrated environment checks and preview update (2026-11-06)

The final typecheck, build, evidence-link check and diff checks passed. The
64/64 HTTP/local tests and new 25-observation environment browser suite passed
as recorded above. Of the nine existing Chrome suites, eight passed: world
walking, meeting/talk, leaving/removing sounds, sound discovery (including the
five-observation context fixture), look preferences, authoritative private
huts, cooperative play (33 observations) and its ACK race (12). No assertion
was removed or relaxed. The new environment suite uses the same default
localhost:8080 as the existing chain, and all tests ran only on scratch data.

**Audio limitation:** the existing busker suite's first actual-source check
passed, but its real output-RMS assertion timed out. An isolated rerun and a
visible-Chrome diagnostic also timed out. Diagnostics showed a decoded
130-second nonempty buffer and a running, visible AudioContext whose clock
stayed at 0.005333 seconds after the 12-second wait, with zero output at every
instrumented stage. A blank Chrome page with no app code likewise stayed at
0.005333 seconds after a 1.5-second timer. This establishes an audio-clock stall
outside the application as well; the underlying device/browser cause remains
unknown. The file decoded completely with no sustained silence at -75 dB, and
the sound file, audio engine, listener and spawn coordinates were unchanged by
this feature. The initial ffmpeg inspection hit a local Homebrew dyld error;
the already documented process-local library path allowed read-only analysis.
No browser/OS audio setting was changed and no test threshold was lowered.
Guitar output verification remains **not passed for this run**; the two
remaining cooperative suites were then run separately and passed.

The review database was backed up through a read-only SQLite connection before
restarting the existing 18861 preview. Its 16 contribution rows, reply and
operation rows, and 25 user rows were then compared exactly with the backup
and were unchanged. The new environment row starts clear at 14:00, paused.
The scene and all three new browser modules returned 200. A separate unjoined
visitor viewed the actual preview at desktop and a fresh 375-by-812 touch
viewport, with zero page errors or horizontal overflow. The first capture
immediately after resizing had a transient compositing artifact; a fresh touch
context rendered correctly and was viewed. Its canvas ends at 799px, keeping
the touch stick inside the 812px viewport. The reviewed phone image is
`docs/screenshots/18-world-phone.png`.

Both scratch services were stopped; the updated 18861 preview remains running
against its preserved database. No push, deployment or production-data change
was performed. Docker, physical devices, a screen reader and human listening
were not run. Work was committed in separate persistence, rendering, interface
and final-verification steps.

## 56. Restore an unavailable local preview (2026-11-06)

Wen reported that the page was no longer accessible. Port 18861 had no listener
and a separate curl request returned connection refused. The compiled app and
existing review database were intact; Git was clean. The previous foreground
process had disappeared. Its exact exit reason was not recorded, so tool-session
cleanup is a possibility rather than a confirmed application failure.

Restarted Node directly in an independent session with stdin disconnected and
stdout/stderr appended to ignored `.cache/preview.log`. The ignored
`.cache/preview.json` records the new process, original database and port. A
subsequent independent tool call confirmed HTTP 200 for the scene and its client
module after the launcher exited. The process was reparented to PID 1, had its
own process group and no terminal. The original review database was reused,
without reseeding or resetting the environment; its existing contributions and
users remain. `docs/local-development.md` records this lifecycle requirement.
No application behaviour or dependency changed, so the earlier feature suites
were not rerun for this process-only recovery.

## 57. Compare four art directions before choosing (2026-11-06)

Wen said the current art was still insufficient and asked for several designs
to choose from. Reviewed the existing beach/boardwalk captures and ADRs 017/018.
The main mismatch is photographic sand/timber beside simple geometry and thin
animal figures; each direction therefore redesigns shapes, surfaces, people,
water, sound markers and interface together. No direction has been selected.

Used `ui-ux-pro-max` for a design pass and the built-in `image_gen` tool for four
original concepts: A Painted Coast (watercolour/gouache), B Clay Harbor (tactile
3D), C Graphic Tide (cel shading), D Quiet Light (atmospheric painterly 3D).
All four use comparable first-person compositions with sea on the left, a cafe
on the right, forest, animal visitors, a guitarist and family-coloured grounded
contribution rings. Each complete output was viewed: style distinctions, main
composition, labels and the shared soundscape motif were present. The first
broad UI design-system query returned an unsuitable corporate style; a narrower
organic/clay style query informed only relevant interface/shape guidance rather
than imposing that unrelated system on the game.

`docs/proposals/art-direction-options.md` explains the four directions and their
tradeoffs; `art-direction-prompts.json` preserves the full prompts. Built-in
originals remain in the generated-images directory; local review copies are in
the session's visualization workspace, with paths recorded in ignored cache.
These are explicitly AI-generated selection previews, not implemented runtime
screenshots or CC0 assets. No app code, public asset, database, sound behaviour
or running preview was changed. No runtime tests or performance measurements
were warranted for this proposal-only step. JSON parsing and diff checks passed.


## 58. Preserve the version before Quiet Light (2026-11-07)

Wen selected D and asked for a recoverable version. Git was clean at `0becc46`.
Created annotated tag `before-quiet-light-2026-11-07` and an isolated art
branch (subsequently named `codex/quiet-light-art` to follow the workspace
branch convention); the former branch remains at its original commit. A
read-only SQLite backup captured the existing review database in ignored cache.
Copied the existing compiled bundle before any candidate build, and prepared a
separate candidate output root. The 18861 preview continues using its old bundle
and original database while art is developed.

The preserved bundle started against a scratch database on 18875. Scene, world
module, CSS and Three.js each returned 200; the smoke service was then stopped.
The first smoke harness incorrectly expected a world-module reference directly
in HTML (it is imported by the scene module), so its assertion timed out. The
corrected check fetched each actual route and passed; application code did not
change to satisfy it. ADR 019 and the rollback guide distinguish app rollback
from data restoration. No art implementation is claimed verified at this step.


## 59. Give Quiet Light a consistent reading surface (2026-11-07)

Replaced the mixed end-of-file theme with warm ivory panels, mineral-blue
controls, sage selections and restrained amber reply states. Strong reading
surfaces preserve the sound names and actions over bright/night scenes. Kept
native dialogs, DOM hooks, keyboard behaviour and 44px primary targets. Removed
the existing external font links; system sans and Georgia require no downloads.

A single Chrome session reviewed arrival, world, controls, library, weather and
scenes at desktop/375px phone/812px landscape on candidate 18874, with zero page
errors or horizontal overflow. Fourteen captures and layout measurements are in
ignored `.cache/quiet-light-ui/`. Contrast calculations: primary text 10.53:1,
secondary 6.01:1, selected descriptions 4.92:1, focus 5.52:1. CSS parsed without
errors and typecheck passed. The phone world extended 3.55px beyond the viewport;
its height was then reduced by 8px. The primary-button rule had overridden the
intended ivory contribution action; specificity was corrected. Input focus now
uses the same blue outline. Those final small corrections await the integrated
visual pass. A just-resized landscape capture showed a compositor artifact;
DOM measurements showed one fitting, scrollable dialog. No test assertion or
behaviour changed. The candidate's original 64 HTTP/local checks also passed.


## 60. Original three-dimensional animal people (2026-11-07)

Built a shared-geometry cat/dog rig with adult proportions, actual depth, cloth
shapes and grounded feet. It includes distance-driven walking, gestures, seated
poses, a shaped acoustic guitar and an olive umbrella; it never creates a sound.
+Z is the figure's front, independent of the camera. Labels can follow a real
head anchor. Shared opaque materials avoid per-person resource duplication;
opacity clones are disposed without invalidating the next person.

The first in-world review showed hard shoulders and stick-like sleeves. A
second pass rounded shoulders, widened sleeves/trousers and added shared collar,
placket, pocket, button and cuff geometry. A three-person GPU close-up was
viewed in `/tmp/quiet-light-characters.png`; knee openings visible in a seated
pose were then closed. The final module has 26–33 visible meshes and at most
4,656 triangles per person. World integration receives a separate visual pass.

All five `spec/characters.test.ts` checks passed in an isolated Vitest config,
then were independently rerun by the main agent: all poses have finite transforms
and grounded shoes, 32 stride phases remain planted, repeated phases do not
accumulate motion, body yaw survives pose changes, seated/guitar visibility and
shared resources remain correct, and garment normals face outward. Two in-memory
mutations demonstrate sensitivity: removing the planted-foot solution produced
a 0.010482695-unit error (current source zero); skipping profile normalisation
produced 102 inward upper-sleeve normals (current source zero). Source was never
modified to run those mutations. Typecheck passed. The browser route for the new
module is explicitly registered; no runtime dependency or bitmap asset was added.


## 61. Rebuild coastal shapes and remove a wasted render pass (2026-11-07)

The forest now uses tapered trunks, real branch instances and original procedural
needle cards, with irregular crowns instead of stacked spheres. The first cards
were visibly stretched into giant feathers; after looking at the actual forest
and boardwalk, replaced them with many smaller folded needle tufts and a loose
cap. Trees still use three instanced draws. Rebuilt the cafe with a shallow
pitched roof, deep timber reveals, exposed joinery and an olive cloth awning;
the intersecting sign was moved below it. Curved grass, layered distant ridges,
wooden lamps, slatted benches and ceramic pots support the same palette. Muted
scan surfaces and calmer water keep existing CC0 provenance; no asset was added.
Explicit body facing leaves seated people facing their tables and the guitarist
facing the boardwalk without camera-dependent shifts.

The first GPU pass exposed 3,411 forest draws and 16.5M triangles. Investigation
of the exact installed Three 0.170 source found the full-scene transmission pass
triggered by two small existing lamp models. Their seven transmissive material
references now become zero: tiny glass uses ordinary alpha transparency, while
metal retains its maps/colour/metalness. One source asset had transmission on
brass, which was cleared without making the metal transparent. Loaded materials
are cloned before changes. The subsequent actual forest capture reported 1,790
draws and 9.87M triangles; boardwalk 767 and 9.67M. This is more draw work than
the old sprite scene but about half its triangle work; final timing is recorded
with the integrated rendering evidence, not inferred from these counts.

A geometry-only comparison used actual local glTF POSITION buffers and node
transforms for all furniture (canvas/image drawing mocked). All five walkable
rectangles, 102 build solids, 154 furnished solids, 520 collision circles and
110,805 zone/room/trail samples match the tagged baseline. NPC/ball/path positions
match after excluding the intentional new facing field. Source was transpiled
in memory so the running browser checks never saw a half-written bundle.
`docs/evidence/quiet-light-collision-2026-11-07.json` records counts and hashes.
Complete typecheck and the final 69-test suite passed. Final integrated visual
checks include the revised trees and zero-transmission actual WebGL materials.


## 62. Integrate the Quiet Light world and protect sound actions (2026-11-07)

Replaced all in-world cat/dog sprites with the original rigs: peers use server
yaw when still and movement direction while walking; labels follow their heads.
NPC seats have fixed physical positions/facing, without the old shift towards
the camera. Foot and marker anchors query existing floors, including raised
planks; the listener, player coordinates and all sound audio methods stay the
same. The illustrated kangaroo helper is retained. A softer shadow filter from
the installed Three 0.170, warm daylight/cool fill, lower HDR intensity and a
single-draw procedural cloud sky complete the visual pass. Reduced motion stops
cloud/plant/NPC movement, and later sky changes cannot restore disabled shadows.

Made source lights smaller and quieter, with rings just above their actual
floor rather than floating at a constant 0.55m. The first close review still
showed excessive glow, so its radius/opacity were reduced again. An aligned
three-source fixture exposed a distant title over the near action card. The
new `e2e/quiet-light.mjs` failed on that actual overlap before the layout fix.
Other titles now stack away from the nearest card. The next narrow check found
its near card at x=-42px; clamping the card to the visible world corrected it.
The same test then passed all seven observations, including 44px controls,
actual 3D bodies, grounded rings, zero transmissive lamp materials and no
automatic audio. No assertions were relaxed. It now runs in the normal chain.

All ten pre-existing Chrome suites passed on scratch 18874, including the full
busker output-RMS/lifecycle check that previously stalled outside the app. This
run does not identify the earlier browser/device cause. The final typecheck,
build, 69/69 HTTP/local/rig checks, collision comparison and evidence-link check
passed. After the label change, sound discovery and cooperative UI are rerun
separately; their final result is recorded below. Audio, hut admission, movement
controls, environment revisions and room logic were also compared by method and
left intact; visual add/draw and the new label-layout method are the only
Soundscape changes.

Sixteen weather/time combinations and nine zones were captured and viewed,
with the added mark checks covering bright sand, night, rain and mist. The final
matrix and bounded rain/reduced-motion checks passed. On this Mac's M5 Pro via
Chrome/Metal at DPR1: desktop rain 60.22fps, forest 60.17fps, narrow rain 60.08fps;
shadows remained on. These are desktop and simulated viewport measurements, not
physical-phone claims. The metric JSON records exact draws/triangles and
provenance; representative real runtime captures are in `docs/screenshots/19-*`.

Harness corrections: an initial marker test reused contribution IDs at new
positions, contrary to immutable source locations; separate IDs corrected the
fixture. Standalone captures also needed the actual scene-page CSS class. A
character-sheet helper loading the landing page exposed an unrelated legacy
photo URL returning 404; landing art is fixed in the next step, and the helper
now opens About before creating its isolated sheet. Failure logs were retained
locally; no app audio or assertion was replaced to obtain a pass.


## 63. Finish the entry page and close-camera review (2026-11-07)

Removed the landing page's legacy `/scenes/chifley-bridge.webp` CSS request
(the old photo files remain untouched). Replaced it with an original inline SVG
coast and a dark reading gradient, coordinated with Quiet Light's type and
colours. No downloaded image, external font, new resource route or concept
bitmap is used. CSS parsing and SVG XML checks passed; desktop and 375px captures
were viewed, and a browser response listener reported no failed resources.

After the sound-label changes, sound discovery and cooperative-play were rerun
and passed. The final native-dialog desktop/phone/short-landscape review had no
page/resource errors or horizontal overflow. The phone canvas ends at 807.55px
inside the 812px view, with 44px controls. Final metrics are saved with the UI
evidence. The initial night capture also showed an overlapping arrival's head
clipped inside the camera. Nearby bodies (within 0.65m) are now hidden locally
without removing their participant, changing the server position, changing audio
or disabling talk. Stepping apart restores the same body. The dedicated visual
suite was observed failing before this fix, then passed its added identity and
restore observations. NPC walkers use the same camera-clearance rule. No avatar
transparency materials or collision rule was introduced.

The art remains an original real-time interpretation of D, rather than importing
the AI concept image. The final runtime images and measured limitations are the
evidence of what was actually implemented. Docker, physical-phone tests, a
screen reader and human listening were not run. Local output audio was measured
by the real Chrome suite, not inferred from a playing badge.


## 64. Promote the reviewed build without rewinding the place (2026-11-07)

Promoted the candidate's compiled files to the original 18861 local preview.
Before stopping it, checked the recorded PID, command and actual listening port.
The complete old compiled output stays in ignored cache alongside the portable
Git rollback tag. A fresh read-only SQLite backup was made immediately before
promotion; startup and route checks were followed by an exact comparison of
all twelve user tables. Every row matched: 18 contributions, one reply, two
operation records and 25 users remain, including changes made during this art
work. The older 16-row backup was never restored. Environment state was not
reset, and no schema/migration or public asset changed.

The scene, new character/world modules, CSS and landing route returned 200.
An independent subsequent check confirmed PID 93350 still owned 18861, had
parent 1, its own process group and no terminal. Promoted server/world/character/
CSS files exactly matched the reviewed candidate. The verified scratch 18874
service was stopped. The stable review continues against its original database.

The in-app browser inventory still contained an earlier error tab. Acquiring
that tab to refresh it was rejected by the browser URL security policy. No
alternate browser surface or other workaround was used for that blocked action;
Wen is told to refresh manually. This limits the automatic handoff, not the
already completed HTTP and independent candidate visual checks.

Source work was committed in rollback, interface, rig, landscape, integration
and final-polish steps, followed by this verification record. The final visual
regression has nine observations and passed, in addition to all ten existing
suites; discovery/cooperation also passed again after label layout changed.
All 69 local/HTTP/rig checks, typecheck, candidate build, collision comparison,
evidence-link and diff checks passed. No assertion was weakened, no production
DB was used, and no push, merge or deployment was performed. The two version
tags and rollback guide retain the path back without losing later sound data.


## 65. Correct the rejected reference fidelity (2026-11-07)

Wen explicitly rejected the first art implementation because it differs too much
from D and requested an exact match. Reopened both the actual runtime capture
and original concept; the spatial, asset and lighting mismatch is substantial.
The earlier green tests establish behaviour, not visual equivalence. Preserved
that build with `before-d-fidelity-2026-11-07`, copied its compiled output and
started `codex/d-reference-fidelity`. The existing 18861 preview and current data
remain untouched during this clarification and composition audit.

Three independent reviews identify the same dominant gaps: shoreline spacing,
hero camera, close glass facade, spreading pine shapes, continuous character
anatomy/clothing, and excessive HUD. The new proposal records concrete reference
landmarks and distinguishes a fixed exact image from a freely walkable rebuild.
The user is asked which requirement takes priority; no further exactness claim
or silent switch to a static image is made.

Read the UI/UX skill and the image-generation skill; the latter is not used to
manufacture another concept as if it were an implemented result. Official Poly
Haven model pages were consulted for actual asset availability. The official
files API refused all four metadata requests with HTTP403; no download or
attempt to bypass that refusal was made. Existing licensed assets and original
geometry remain available. No source or public runtime asset has changed at
this checkpoint. Documentation diff checks passed.

## 66. Rebuild the freely walkable D composition (2026-11-07)

Wen chose the freely walkable 3D rebuild. An isolated compiled candidate on
18876 uses its own scratch database; 18861 and the current contribution history
remain untouched. The arrival camera now looks along the western promenade.
Added a linear-light contact-shadow render pass with one final ACES/sRGB output
and a device-quality fallback; no blur, static scene image or new dependency.
The first GPU capture at 1672x941 ran at 60.5fps with no browser errors. That
initial counter reported only the last postprocessing draw; renderer statistics
now accumulate the complete frame instead of implying a one-draw scene.

The first actual capture exposed broken jacket/inner-shirt intersections and
back-facing shore geometry, and still used unfinished HUD styles. These are
recorded failures being corrected, not accepted fidelity. The shoreline physical
probe passes promenade, cafe door, pier, western beach access and forest/bridge
routes; it also blocks newly submerged western sand. The existing 70 spec
checks passed on the scratch candidate. New rig tests replace tube-specific
geometry checks with continuous skinned-surface checks; the hero triangle budget
increases deliberately for this higher-fidelity rebuild, while pose, grounding,
facing and stability requirements remain. Visual acceptance is still pending.

## 67. Correct visual and interaction failures before promotion (2026-11-07)

The actual 1672x941 page now has the thin header and centred sound action.
Continuous figure geometry passes seven checks, including outward closed
surfaces, blended skeleton weights, distance levels and flat garment hems.
The same new skeleton/LOD checks fail against the preserved first art module;
node topology probes find one connected component and no open/nonmanifold edges
in each shirt/trousers surface. Hero geometry stays below the new 35K budget.

Ten original browser suites passed sequentially. The original walking suite
caught the bottom action intercepting the kangaroo's return button. Reserving
110px for that bubble fixed it; the complete walking suite then passed.
The new real-page UI suite caught native Chrome Tab focus briefly leaving the
Tools dialog for BODY, then an Escape/aria timing race. Explicit endpoint Tab
wrapping and synchronous expanded-state updates fixed both. All 47 UI checks
then passed, including 26 Tab/Shift+Tab actions, both modal handoffs, 375px and
short landscape layouts, Sources scrolling, and the real kangaroo return click.
Face sound adds no placement request or row; only the explicit Leave does.

A separate review found a health-window bug that permanently stopped adaptive
quality monitoring, and a missing fallback for devices without renderable
floating-point color targets. Both focused checks were observed failing before
the fix and passing afterwards. The complete spec suite now passes 73 checks.
An eastern shore probe likewise exposed walkable submerged sand at (31,30.65),
roughly 0.195m beyond the rendered coastline. Extending exclusion bounds along
the whole shore turns all six western/eastern water probes green while keeping
2916 route samples and five floor rays passing.

The latest actual picture still exposed sparse twig-like pine crowns. Rejected
that geometry despite its low draw count and started a solid layered crown
rebuild; this checkpoint is not visual acceptance or preview promotion.
The user's current four live contributions were read for reachability: all
remain on unchanged dry land. No persistent position or environment was edited.

## 68. Final visual corrections and verification (2026-11-07)

The sparse-crown attempt was replaced with closed irregular three-dimensional
branch pads and short surface needles; the 520-tree forest is spatially batched
in 24m cells for frustum culling. Timber UVs now sample one licensed plank with
grain along the real board, rather than compressing a nine-plank image into it.
The final reference-size page retains real movement, thin chrome, the glass
facade, nearby cove, clothed animal figures and the grounded sound action.

A final character sheet exposed small white garment cracks. Shared-edge winding
checks fail on the previous mesh and pass after adjacency-based orientation;
keeping the lower shirt outside the actual trouser surface also removes the
waist intersection. Single-sided materials and the original skeleton remain.
All seven rig and both rendering-quality checks pass after the correction.

The final sweep covers all nine destinations and 16 weather/time combinations,
with 36 captures, no browser errors, no rain under roofs, reduced-motion and
clock-revision checks passing. Desktop rain/forest and the narrow viewport are
about 60fps on the Apple M5 Pro GPU at DPR1; this is not a physical-phone result.
The sweep exposed overly white night clouds. Cloud highlights now derive from
the current horizon light. A new GPU check samples the cloud band rather than
the cloud-free zenith: daytime highlight 211.29/255, nighttime 111.84/255.
The daylight-white shader is an isolated negative control, restored after the
expected failure. Silent audio, shoreline exclusion and accessible source-card
actions pass in the same visual suite.

All 73 spec checks and the 12 browser suites have passed during this rebuild;
the walking and new UI suites were rerun after correcting the obstructed helper
and keyboard-focus failures. The final geometry/rendering checks were rerun
after their respective fixes. Docker, physical phones and human listening were
not run; measured audio output is covered by the busker browser test.

This is a reviewable freely walkable reconstruction, not user acceptance of
reference fidelity. The spatial composition is substantially closer to D;
foliage, character surfaces, water and indirect lighting still read as procedural
3D rather than the concept's photographic detail. No similarity percentage is
claimed. Current persisted weather/time is retained when promoting, so the
reference lighting is selected explicitly with Clear and Afternoon in Tools.

Retained actual captures: [reference-size boardwalk](screenshots/20-d-reference-boardwalk.png),
[character sheet](screenshots/20-d-reference-characters.png),
[forest](screenshots/20-d-reference-forest.png),
[phone](screenshots/20-d-reference-phone.png),
[Tools](screenshots/20-d-reference-tools.png) and
[corrected night sky](screenshots/20-d-reference-night-sky.png).
[Rendering evidence](evidence/d-reference-rendering-2026-11-07.json),
[real-page interface evidence](evidence/d-reference-ui-2026-11-07.json) and
[physical-route evidence](evidence/d-reference-physics-2026-11-07.json) retain the
measurements separately from the visual assessment.

## 69. Promote code without rewinding the shared place (2026-11-07)

Promoted the verified compiled candidate to 18861 at application commit
`e55340e`, retaining the exact current SQLite path. A fresh consistent backup
was taken after stopping the verified previous listener. All contents of all
12 persistent tables match before and after startup, including 18 sound rows,
one reply, two operations and the existing weather/clock anchor. No database
was restored or migrated. Five served modules/styles match the installed
compiled files byte for byte. The replacement process is detached with parent1
and no controlling terminal. [Preview evidence](evidence/d-reference-preview-2026-11-07.json)
records the verification without including private row content.

The previous compiled `dist` is retained in ignored promotion cache; the Git
rollback tag remains `before-d-fidelity-2026-11-07`. The completed rebuild is
marked `d-walkable-rebuild-2026-11-07`. No push, merge or deployment occurred.
# 2026-11-07 — Asset-led D correction

Prompt: Wen rejected the visual gap again and asked to use existing skills,
texture libraries and generation. Preserved `before-d-art-assets-2026-11-07`
at `e80f104`, with a separate build and scratch preview on port 18878.
Read external Three.js materials/graphics guidance and verified APIs against
installed r170. Used the Yughues/Nobiax branch pack's explicit CC0 readme;
recorded original and derived SHA256 hashes. Generated a short-fur material;
recorded it as original AI work under Wen's explicit instruction. Rejected
the generated pine cutout and broad-leaf #27 after inspection. See ADR 021.

First GPU review: 1672 × 941, Mac Chrome/Metal, 60.22 fps over a 2 s sample,
no console/page errors. Source typecheck passed. Failed visual items: trunk
occupies too much of the left view, porch plants hide the guitarist, rail
looks like flat brown boxes. These require another source/review iteration.
An initial scratch start failed for a missing README symlink; corrected the
isolated build links. Sandbox localhost bind then required the normal local
server escalation. Existing preview and persistent tables were untouched.

Second/third review corrections: moved the foreground trunk behind the camera,
kept a real overhanging bough, reduced porch flowers, moved the pitch board off
the guitarist, removed the closest obstructing lamp and kept the pier surface
above local swell. Needles now have lit translucency and normalized albedo;
rails use the existing CC0 timber scan with shallow eased edges. The narrow
physical route harness passed 2,884 route samples, six water exclusion points
and five floor rays. Existing full spec: 74 passed before the final cloth/sky
changes; final affected character/sky spec: 10 passed. The new float/half HDR
check first failed at unbounded luminance 18,824, then passed with solar energy
separated. The original source HDR remains unchanged.

The installed r170 renderer was inspected: there is no duplicate colour-space
conversion in Composer/OutputPass. The HDR has a bright solar disk contributing
unshadowed indirect light. Its loaded lighting data now limits only that peak,
preserving normal sky pixels, alpha and sun hue; the moving DirectionalLight
supplies the actual shadow-casting sun. The SSAO auxiliary pass now retains
the beauty pass's needle shadows and avoids redrawing the shadow map. Reviewed
at 1672 × 941, Chrome/Metal: 60.47 fps, 2,315 total render calls and 22.84M
submitted triangles across all passes, down from the first new review's 3,265
calls / 29.29M. Browser errors: none. This is a desktop measurement, not a
claim of performance on a physical phone. Final gameplay and weather review
are recorded separately before promotion.

Final verification: 76 tests in 11 spec files and all 12 end-to-end suites
passed at `056d054`, including real two-browser movement/talk, sound audio,
both look modes, all four huts, NPC guitar output, cooperative reply races,
shared weather and desktop/phone/landscape dialogs. A 16-case weather/time
matrix produced 36 screenshots, with no errors or roof-interior rain vertices;
desktop rain, forest and narrow-viewport rain measured approximately 60 fps
on the local M5 Pro/Metal GPU. Only desktop hardware was measured. Docker
was not run because it is not installed. See `d-art-verification-2026-11-07.json`.

The final full-page image revealed a passing figure standing immediately behind
the hero cat under reduced motion. A one-constant initial phase change spaces
that arrival out; the full desktop/phone/landscape D interface test and actual
desktop/phone screenshots were repeated, all passed, at `b1b0eec`. No walking
rules or persistent state changed. New actual screenshots use prefix `21-`.

Promoted `b1b0eec` to the original 18861 preview. Its original current DB was
compared across all 12 persistent tables before/after: every digest matched;
all 18 contribution rows, one reply, two operation rows and all 25 users were
retained. The four active ordinary sounds keep their positions. Cloudy/shared
clock/revision remain unchanged; Clear + Afternoon is used only in the scratch
reference screenshots. Verified nine served source modules/styles and three
new texture files byte-for-byte against the tested build/assets. The preview
runs detached without a TTY. No push/deploy. Prior compiled output is retained;
visual rollback uses the current DB, never an old copy.

# 2026-11-07 — A coherent identity around making sound together

Prompt: Wen clarified that consistent, harmonious and distinctive style matters
more than cinematic beauty, with shared sound-making and playful multiplayer
interaction at the centre. ADR 022 records this priority and supersedes the
visual-fidelity target. Preserved `before-shared-sound-focus-2026-11-07` at
`161ae1a`; developed on `codex/shared-sound-focus` with a separate compiled
candidate and scratch database on port 18879.

The homepage and arrival now invite people to listen, leave something for the
next visitor and answer another person's sound. Warm paper, timber, sea green
and the existing blue/green/orange sound families recur throughout the pages,
public contribution cards and world. The prominent Our soundscape entry shows
actual joined people and public sounds, opening the existing native drawer.
The drawer names authors, locations and replies, offers explicit listening and
safe focus handoffs, and records four deduplicated public changes received in
this visit. Initial/reconnect snapshots never masquerade as new activity.
Weather and scene travel remain available after the shared activity.

Real nearby public replies now have a low three-dimensional thread with ends
on the actual floor. A moving dot requires actual child playback; Sound off,
hidden pages and reduced motion suppress it. Removed endpoints and private hut
stays cannot create threads. The existing public sound rules, live chat,
authoritative huts, spatial guitar, shared weather, single room and persistence
remain intact. No new recording, schema or server protocol was needed.

Verification: TypeScript check/build passed, all 80 tests in 12 spec files
passed, and all 13 end-to-end suites passed. The new two-browser suite has
39 checks covering real counts/authorship, explicit audio, reply/connection,
private-stay exclusion, activity deduplication, removed-source persistence,
snapshot recovery, focus and phone controls. It failed against the previous
isolated interface before any placement, confirming the new entry is tested.
A temporary private-filter mutation also failed the focused connection test.
An independent read-only source review found no actionable issue; browser/GPU
verification was performed separately by the main agent.

Two test-harness faults were found during full regression. Cleanup after a
private stay could send the next move inside the server's 90ms window and
silently leave a scratch contribution. The existing removal suite correctly
failed because that contribution remained. It was soft-removed through the
normal API; cleanup now waits every iteration, validates responses and checks
the actual final snapshot. The existing suite passed again after the repaired
new suite. A held movement key also raced the queued native dialog close
handler; the test now waits for that handler to finish before holding the key.
Production movement and rate-limit rules were unchanged. These corrections
are committed separately as `02e9121`.

Viewed actual home, Explore and arrival pages on desktop and phone, plus the
real reply and phone drawer screenshots. No horizontal overflow or browser
errors were observed; primary actions measure at least 44px. The low thread
was additionally inspected in a silent synthetic visual fixture without a
join or database write. Phone views are desktop Chrome viewport emulations,
not physical-device performance results. Docker was not run because it is
not installed. [Verification](evidence/shared-sound-focus-2026-11-07.json)
retains the results and limits. Actual captures: [home](screenshots/22-shared-home.png),
[phone home](screenshots/22-shared-home-phone.png),
[phone arrival](screenshots/22-shared-arrival-phone.png),
[phone drawer](screenshots/22-shared-drawer-phone.png),
[real reply](screenshots/22-shared-reply.png) and the explicitly
[synthetic thread review](screenshots/22-shared-thread-fixture.png).

Promoted application commit `02e9121` to the original 18861 preview using its
current DB. Every digest in all 12 persistent tables matched before and after,
including all 20 sound rows, four operations, one reply and 25 users. Five
ordinary sounds remain active; the shared weather/clock anchor was retained.
Eleven served modules/styles match both the tested build and installed files
byte for byte. The preview is detached with parent 1 and no controlling TTY.
Prior compiled output is retained, and `shared-sound-focus-2026-11-07` marks
this verified version. A rollback keeps the current DB. No push or deployment
occurred, and user visual acceptance has not been claimed.

# 2026-11-07 — Friends shape a living world through sound

Prompt: learn the staged work in Little Ritual, Tidegarden and Stillwater, then
improve this project autonomously. Friends should shape cozy or lively places
with several suitable sounds, and different recordings should invite different
NPC behaviour. ADR 023 records the priority and permission for new ingredients.
Preserved `before-living-sound-world-2026-11-07` at `2486e70`; implementation
uses `codex/living-sound-world` and isolated build/database on port 18880.

The [walkthrough](living-sound-world.md) links the primary process references,
explains their different evidence limits and records our ordered implementation
briefs. Our models remain procedural Three.js; we did not copy showcase assets
or claim to reproduce their Blender work. Original rounded cat/dog figures,
matte coordinated clothing, volumetric pine crowns, restrained licensed surface
grain, sage joinery, honey timber and canvas stripes share one painted language.
An original generated café mural is an actual lit wall surface; its full
[prompt and provenance](assets/sound-world-mural.md) are retained.

Four authored residents now choose from actual live public sources near their
homes. Six reactions use real rig gestures: listen, watch, sway, join in, play
and wave. Selection, settling and phase use shared contribution/server time;
a late visitor and an existing visitor select the same source independently
of their own sound switch. Small bounded approaches check the real floor,
solids and private areas. Reduced motion stays static. No NPC chat, people,
contributions or database rows are fabricated; the guitarist retains his role.

The individual sound library offers cozy, lively and wild intentions with
honest per-sound response hints, while retaining search, family filters and
explicit preview/placement. The nearby corner summary derives its ingredients,
authors and actual NPC responses from current shared state. Cozy and rhythmic
corners coexist; no global mood setting or automatic preset overwrites friends.
Private stays, removed contributions and library previews do not drive public
responses or enter this public summary.

The catalogue contains 18 sounds, adding an optional rainstick and hand claps
from verified Commons PD/CC0 sources. All 16 former recordings and their asset
records remain unchanged. Independent decoded checks found finite mono 44.1 kHz
samples, -20.58 LUFS/-2.03 dBTP rainstick and -24.04 LUFS/-2.16 dBTP claps. The clap
target is not reported as its achieved loudness. Rainstick required source-only
35 Hz DC cleanup. Wind chimes were dropped after HTTP 429; a broken global FFmpeg was
left alone, using a checksum-verified task-local binary without install scripts
or dependency changes. [Audio evidence](evidence/living-world-audio-2026-11-07.json)
is technical verification, not an artistic listening verdict.

TypeScript check/build, all 88 tests in 13 spec files, all 13 existing browser
suites and the new 20-check real two-person suite passed. The new suite covers
actual decoded previews, private listening, shared reactions, late reload,
normal removal, a two-author mixed corner, private stays, phone controls and
confirmed final soft cleanup. It failed against the prior isolated interface
before publication. A private-filter mutant failed the unchanged exclusion
assertion; the old character module failed 3 current silhouette/material tests.
No invariant was weakened. Docker is absent and was not run.

Actual rendering exposed flattened crowns, a weather update overwriting the
new deck colour, and a wave crossing the face. These were corrected from the
running geometry. The dry/rain/dry check verifies exact base colour restoration.
A 16-case weather/time matrix produced 35 captures with no browser errors;
desktop forest/rain and narrow rain measured about 60 fps on the local M5 Pro/Metal
GPU. This predates the final dry-colour/tint refinements, which were checked
separately. The final outward wave was rebuilt and rechecked with 8 response
tests, the full new 20-check shared interaction and an actual eight-cell,
two-frame gesture review. Phone views emulate viewports, not physical devices.

Two initial test assumptions were corrected: explicit Leave retains the former
author Sound-on behaviour; a never-created audio context has no data-voices
attribute. The other visitor is now checked for Sound off, zero AudioContexts,
zero started recordings and absent-or-zero voice count. A visual fixture also
needed distinct immutable IDs for different sound types. The read-only source
review caught misleading idle-NPC marker copy; it now gives actual locations.

[Verification](evidence/living-sound-world-2026-11-07.json) distinguishes full
regression from the focused final pose checks. Viewed final actual
[desktop](screenshots/23-living-boardwalk.png),
[phone](screenshots/23-living-boardwalk-phone.png),
[sound ideas](screenshots/23-living-ideas-phone.png) and
[real shared mix](screenshots/23-living-shared-mix.png) captures. The
[gesture study](screenshots/23-living-responses-fixture.png) is explicitly a
silent synthetic fixture of real geometry/controller, not a populated session.

Promoted application commit `cd70c7a` to the original 18861 preview using its
current database. All 12 persistent table digests match before and after,
including 20 sound rows, four operations, one reply and 25 users. Five ordinary
sounds remain live; the entire shared weather/clock row is unchanged. All 30
served application modules/styles and three new assets match the tested
build/files byte for byte. The server is detached with parent 1 and no TTY.
The former compiled directory is retained. `living-sound-world-2026-11-07`
marks the verified version; rollback keeps the current DB. No push/deployment
or claim of user artistic acceptance is included.

# 2026-11-07 — Soundfolk, an inhabited little planet

Prompt: change the title to express the core, diversify people while clearly
distinguishing players from NPCs, add a third-person view, make NPCs use the
restroom and provide a practical lock test, illuminate people indoors after
dark, and develop a reversible Little Ritual–inspired small spherical world
with more meeting places. ADR 024 records the deliberate second edition;
`before-soundfolk-planet-2026-11-07` preserves `5afd955`. Development is on
`codex/soundfolk-planet`, using a scratch DB/build on port18881. The working
18861 preview was not driven by browser tests or populated with test sounds.

The title is **Soundfolk**, with the invitation “A little world, made together
through sound.” `/planet` provides freely walkable original Three.js geometry:
nine meeting destinations on a 22-metre sphere, a continuous promenade,
coordinated paper/sage UI, warm timber, rounded vegetation and separate
blue player/ochre NPC identification. The verified design skill's broad
entertainment and generic purple palettes did not fit this existing product;
we retained its established paper/sage language and used targeted keyboard
focus and 44px interaction guidance. No new dependency, external model,
recording or generated bitmap was needed for this edition. Little Ritual is
an inspiration for the inhabited globe, not a claim of copied or identical art.

Actual players have identity-seeded clothing/coats and a visible self model.
First/third person, idle orbit, wall-aware camera shortening and Near/Far zoom
operate on the real character. Both pointer conventions remain configurable.
The coast retains its original first-person default with a remembered optional
third-person view. Shared weather and clock remain explicit changes per room.
Night figures receive local warm indoor fill, while outdoors stays cooler.

The sphere uses great-circle movement and parallel-transported heading.
Server chat, spacing, crowding and removal use the same metric across seams
and poles. Buildings use tangent-plane collision coordinates. Initial flat
ground fans sank into the sphere; subdividing their vertices along the actual
surface fixed the running geometry. Nine places offer distinct settings for
sounds, replies and nearby conversation. Books, telescope and furniture remain
scenery, not unimplemented games or an editor. Actual public source families
colour lanterns and flower beds in canonical timestamp/id order. Sound-driven
residents use the shared source list and server time, independent of local
audio settings or computer-clock skew.

Rowan's restroom visit is authoritative transient server state: walk, wait,
reserve entry, close/lock, use, flush and leave. Humans and NPCs share the
same admission gate. NPCs never become joined users, inflate presence or
create public contribution rows. Nearby current flush tokens can play only
while Sound is on. Slow automatic visits run only while the room has listeners;
**Places & friends → Restrooms & doors → Test with a resident** starts a
visible real test immediately. [The walkthrough](soundfolk-planet.md) also
explains two-browser testing and human private-stay flush/shower actions.

Independent audio tests reproduced stale decoded starts, disposal resurrection,
an async voice-budget overrun and previews continuing beyond the library's
five-second duration. Wanted IDs and generations now guard every pending
decode; previews stop and disconnect after five seconds. Read-only review also
led to draft/audio generations for late placement ACKs, monotonic NPC timestamps
and snapshot reconciliation for a removed reply parent. The first real server
clock sample anchors the world even when a visitor's Date.now is an hour wrong.

TypeScript check/build and all **137 tests in 19 files** passed. That full run
predates only the final first-server-clock anchor and canonical source-order
refinements; the final 50-check real planet suite and coastal regression use
the final application source `e9988c0`. The planet suite checks two real human
identities, nine destinations, camera/self/zoom, great-circle seam interaction,
private decoded listening, actual contributions/replies/removal, nearby chat,
shared weather Apply/SSE, hour-skewed client time, keyboard focus and phone
controls. It verifies an actual server409 against an NPC-occupied room, a real
decoded flush voice, released admission, no fake NPC sounds and final ordinary
soft cleanup. Strict comparison confirms coastal sounds remain unchanged.

All fourteen existing coastal browser suites passed, with the last requiring
an unchanged standalone repeat after one locator-evaluation timeout during
the long sequence. Failure screenshots show the intact UI; the standalone
20-check run passed without errors. Resource pressure is a possible cause,
not a demonstrated one. The separate silent coastal third-person fixture
passed all15 checks with zero POSTs, including real wall collision, NPC privacy
and local night light. Ignored-copy mutations broke two NPC admission tests,
two flush-token tests and the wall/fill helper checks; production invariants
were not weakened. The old one-scene catalogue assertion was updated only to
the explicitly requested seaside-plus-planet list, citing ADR024.

Two test-harness failures are retained: direct Node TypeScript import could
not resolve its runtime .js dependency, so the planet suite now reads the
normal compiled shared module; and the first real planet run's strict coast
comparison caught the main agent simultaneously running HTTP-writing specs
against that scratch DB. No assertion was relaxed. After isolating runs,
all50 planet checks passed; the working preview was never affected.

Final solo rendering exercised all four weathers, a close front view, whole
globe, real tea-house night entry and narrow layout. Indoors reported local
fill0.17 versus0 outside at22:00; the actual self remains visible. Desktop rain,
whole globe and narrow rain each measured about60fps over2.5seconds on the
local M5 Pro/Metal GPU, with zero page errors. Narrow views are desktop viewport
emulations, not a physical phone benchmark. Reviewed and saved the actual
[globe](screenshots/24-planet-overview.png),
[self](screenshots/24-planet-self.png),
[night interior](screenshots/24-planet-night-tea.png),
[phone](screenshots/24-planet-phone.png),
[sound library](screenshots/24-planet-sound-library-phone.png) and
[occupied restroom](screenshots/24-planet-restroom.png).
The [structured verification](evidence/soundfolk-planet-2026-11-07.json)
keeps full-run scope, retries, negative controls and limits explicit.
Docker is absent and was not run. No user visual approval or final artistic
listening verdict is claimed. Preview promotion is recorded separately below.

Promoted application commit `b547227` to the original18861 preview with its
current database. All existing rows in all12 tables remain byte-equivalent,
including all20 sound rows, four operations, one reply,25 users and23
participants. Five ordinary sounds remain live and the original coastal
weather/clock anchor is unchanged. The precise allowed additions are one
`planet` scene, its `morning` session and its default environment; no other
rows or schema changes occurred. All38 served application modules/styles
match the tested candidate and installed files byte for byte, with no-cache
headers. The server is detached with parent1 and no TTY. Both `/planet` and
the original coast return200. The former compiled output is retained;
`soundfolk-planet-2026-11-07` marks the verified version. Rollback changes
application files while retaining the current database. No push or deployment
occurred.

## Little Chorus: restore the playable sound world

Wen rejected the first sphere's lost running/jumping, hidden sound responses,
missing sea and kangaroo, and sparse scenery. Wen selected **Little Chorus
(小小合鸣)**; [ADR025](decisions/025-little-chorus-play.md) replaces the public
Soundfolk name. The [walkthrough](little-chorus.md) describes the real controls
and sound loop. Source work is on `codex/little-chorus-play`; the previous
source is tagged `before-little-chorus-play-2026-11-07` at `a65cead`.

Running and radial jumping use the same collision and authoritative private
door admission as walking. Real remote players receive bounded transient
motion over movement SSE; stale poses land after450ms. The kangaroo is a
clearly labelled local companion: invite it along, jump together, play a
hopping game, then let it rest. It adds no joined people or public sounds.
Named public-source markers expose real authors and direct Respond actions.
Nearby responses open the private chooser; distant ones offer cancellable
travel. Explicit confirmation is still required. Real public replies draw
curved connections above the sphere and retain durable Conversation browsing.

The authored coast has actual curved blue water, dry/wet sand, animated foam,
a raised walkable pier, a sailboat and a tide-pool channel. Connected paths,
gabled porches/windows, a reading canopy, stage sail, conservatory beds and
grouped planting distinguish the nine existing destinations. All anchors and
the three existing planet sound coordinates remain accessible. Night indoor
fill and both camera/pointer modes remain available. No new dependencies,
external models, recordings or generated bitmaps were needed this turn.

We re-read the [Little Ritual primary process](https://developers.openai.com/showcase/little-ritual):
prioritize the playable central action, expressive movement, authored places,
camera/touch refinement, then optimization. Its cover is explicitly a generated
illustration, not gameplay proof; its website was not played this turn.
Our procedural Three.js geometry does not reproduce its Blender pipeline or
establish equivalent artistic quality. The local ui-ux-pro-max skill's generic
theme results did not fit; we retained the existing painted paper/sage palette
and applied its relevant keyboard-focus and44px action guidance.

Actual failures led to corrections rather than weaker assertions. Two motion
admission tests failed before bounded SSE poses and stale landing were added.
Ignored-copy locomotion mutations failed faster-run, real-jump and collision
checks. The previous18881 application fails the new Run preflight before
joining or publishing. Browser review found stacked source labels could hide
a reachable guitar marker; alternative placements now retain leader lines to
the real source. A quick key tap between frames failed to cancel reply travel;
keydown now cancels synchronously and a revision invalidates stale arrival.
Read-only review also corrected native dialog-close timing, stale Run state,
chat pause restoration and guarded E capture. The final33-check suite retains
the quick-tap assertion and passed on the actual application.

Actual initial-camera screenshots still showed a tree crown hiding the body.
A new test raycasts the real authored instanced geometry at legs, torso and
head. It failed with two crown intersections at leg height; widening only the
central planting gap made it pass. This changes no sound or doorway positions.
The16-suite regression's final planet run also exposed two harness issues:
stale12-frame camera samples allowed rapid test clicks to overshoot the6m
target, and the restored Conversation dialog introduced a second `.library-close`.
Each native zoom click now waits for its actual expected value, and Close is
scoped to the sound palette. The ≤6m and exact12m camera assertions remain.
Failure logs/screenshots and interrupted cleanup are retained in ignored cache.

Full specs passed **151 tests in21 files** in57.72seconds on the independent
18883 scratch database. That run precedes final UI/input refinements; the new
actual-geometry sightline test passed separately after the final planting edit.
The real two-person **33-check** play suite covers shared run/jump, kangaroo,
ocean, direct replies, native keyboard handoffs, immediate travel cancellation,
muted playback, missed removal/reconnection, reachable phone actions, strict
coastal preservation and authoritative soft cleanup. Its source predates only
the final planting-gap edit. Browser runs and HTTP-writing specs use separate
scratch databases; no browser test writes to the working18861 preview.

The headless browser did not emit native blur/visibility events when another
tab/window was opened, so that behavior is explicitly untested. A stale
position-sample wait was corrected without relaxing the no-movement/no-POST
assertions. Docker is absent and was not run. Physical-phone performance,
by-ear artistic sound approval, new furniture minigames, globally shared
kangaroo state and user visual acceptance are not claimed. Final visual,
legacy-regression and preview-preservation records follow in the structured
[verification](evidence/little-chorus-play-2026-11-07.json).

The final legacy outcome is15 passing suites plus a complete passing
**50-check planet repeat** after those two harness corrections. Final solo
captures include the widened planting gap: the actual self is unobscured in
the [default view](screenshots/25-chorus-default.png), the
[globe](screenshots/25-chorus-globe.png) shows the authored blue coast and pier,
and the [phone view](screenshots/25-chorus-phone.png) keeps movement, run/jump
and sharing reachable. The [real response card](screenshots/25-chorus-phone-response.png)
and [conversation](screenshots/25-chorus-conversation.png) are from the33-check
two-person run just before that final planting-only change. A real joined
[night interior](screenshots/25-chorus-night-interior.png) reports third person,
selfVisible true and local figure fill0.17. Final globe and narrow viewport
samples each measured about60fps over2.5seconds with zero page errors on
M5 Pro/Chrome Metal. This is not a physical-phone performance claim.

Promoted application commit `06c1ca9` to the original18861 preview using its
current database. Every row in all12 tables is preserved except the explicitly
requested planet title: `Soundfolk · a little world` becomes
`Little Chorus · a little world`. There are no new rows or schema changes.
The unchanged data includes23 placed sounds, seven operations, one reply,
25 users,24 participants and both shared environment anchors. All eight live
ordinary sounds remain, including the three planet contributions at their
original coordinates. All43 served application modules/styles match the
reviewed candidate and installed files byte for byte, with no-cache headers.
The detached server has parent1 and no TTY; both editions return200. The old
compiled output is retained and `little-chorus-play-2026-11-07` marks the
verified release. Rollback changes application files and retains the current
database. No remote push or deployment occurred.

## Chorus Garden: a shared consequence, not more destinations

The new full brief asks whether a friend changed the result, rather than how
many features exist. Before implementation, source7d40be6 and the running
06c1ca9 preview were checked; the working tree was clean. No AGENTS.md was
found in the repository or its workspace ancestors. A SQLite backup copy and
the current compiled application run separately at18884. Actual agent-operated
IAB actions completed Sound on → private Bird sounds preview → placement →
Respond → private Trickling stream preview → explicit placement → Conversation
→ close/reload. Both authors were the same cloned browser identity, so this
is a baseline flow review, not two-person evidence or human unfamiliarity.
The source and child remained after reload; Sound off remained explicit.
The default world showed a small player and stacked labels;18 choices and a
list/line result made the claimed shared consequence difficult to identify.
No artistic listening verdict is claimed from clicking playback.

[ADR026](decisions/026-a-world-that-remembers-an-answer.md) records keeping
the sphere/backend, using an activity camera and three source-born carriers,
and rejecting a new engine or nine shallow games. The UI skill's first broad
search returned storytelling/brutalism, which did not fit; a narrowed organic
biophilic style search returned an applicable earthy/rounded language. Existing
paper/wood/sage colours are retained rather than adopting the unrelated theme.
The Sites skill is used in its local-only existing-checkout mode. No Site is
registered, no remote push/deploy or public-access change is authorized.

Work proceeds on codex/chorus-garden, with
before-chorus-garden-2026-11-07 preserving the previous source. Candidate
port18885 uses another copied database. Old records and original sound
coordinates are not migrated. Authorised first-person submission drafts are
labelled for review and cannot invent private judgements. The official course
pages were read; evidence and writing gaps are tracked under docs/submission.


### A source-born common result, with separate acceptance evidence

The core now has three original kinetic carriers rather than only a reply
list/line. Commit `b3ad39c` derives stable works from existing public sources
and durable replies. A live direct reply between different cookie-derived
participants opens the shared form; a same-author answer still changes a work
without pretending to be two people. Removed endpoints remain attributed but
lose live effects. No schema, room or historical coordinate rewrite is needed.
Commit `8c96213` adds three original 72 BPM compatible musical roles, bar entry,
short-event intervals, local volume/focus, preview ducking and guarded playback.
Original score provenance is distinguished from the existing licensed recordings.
These are implementation claims, not a human verdict that the score is pleasant.

Commit `51cb210` integrates the curated studio, quiet/sounding invitation,
8-metre activity camera, canonical work choice, reachable sculptures and
contextual dock. The three places share the relationship model but differ in
purpose and sound reach: Green 14 m, Jam 18 m, Reading 6 m. Selecting a record
is local; the most recently changed living work is the common displayed result.
The companion can orient/hop near a work while remaining explicitly local.

Real UI inspection found a live journal withdrawal destroyed the focused
button on SSE rerender. The implementation now restores the surviving action
or Back button, and the focused assertion passes in the integrated browser
path. Native-close sequencing also keeps a distant saved-source answer walk
from being cancelled by the dialog's queued close event. An undefined display
font variable had left the scene title at 16 px; its scope now uses the actual
established font. These are agent-operated observations, not novice feedback.

The first current full source run passed 175 and failed one of 176 tests:
its old provenance assertion looked for a Commons entry for every sound. ADR026
explicitly authorizes original generated materials. The corrected check names
only the three original scores, requires original provenance, score metadata
and matching file/served SHA-256, while retaining the previous CC0/public-domain
requirements for every other external recording. This is a justified test
contract change, not an audible production fix or a general license exception.
The final run passes **184 tests in 26 files**, 62.10 s, against runtime source
`51cb210`. HTTP-writing specs use only independent 18887/spec.db; in-process
specs create temporary databases. It is separate from the GPU browser run.

The first integrated creation browser report contains **34 passing checks**.
The final expanded report contains **41**, not a sum of both runs. Two actual
independent cookie contexts use 1920×1080 and 390×844; one enters quietly. The
script auditions and explicitly contributes, names the friend/target, observes
actual additional rendered geometry and a bar-aligned derived harmony, reloads
real work/identity, and checks shared-cookie non-third-authorship. The accepted
reply is observed in the other browser in 36 ms in this local run. This is not
a remote latency guarantee or an unprompted two-human study. Real touch,
keyboard focus, phone first-screen Listen, cancellation, landscape resize,
held late acknowledgements, withdrawal and an actually missed final removal
followed by reconnect all pass. Normal API cleanup verifies no test sound is
left playing, while all pre-existing coastal and planetary sounds are preserved.

The expanded path had two retained harness failures. Its first attempt hit the
unchanged one-change-per-second rate limit; another attempted to reach a safe
Reading position by walking west across actual water. The corrected path uses
real north-then-west key movement and actual-position readback. It does not
teleport into the assertion, change old source coordinates or weaken spacing:
the final reply is 2.772 m from its parent and 4.322 m from the pre-existing
bird. The stage's real base stops the avatar 1.547 m from its centre. The same
friends make another ensemble on the actual stage and a water/bird habitat at
the actual nook; its playback range is 6 m versus the stage's 18 m. Both mute
preferences remain intact. The old failed logs are not treated as product bugs
that disappeared merely because a later script passed.

HTTP/SSE and process checks remain their own evidence category. Isolated 18886
uses two cookie jars and three real server PIDs, with two actual restarts and
one continuously preserved database. Thirteen assertions cover distinct versus
shared-cookie identity, same-author/duet results, duplicate delivery, reconnect,
idempotent retry after restart, table equality and removed-parent history without
revival. Four local server-to-stream samples are 1.97–2.71 ms. They exclude
browser presentation and cannot stand in for a real next-day return.

### Rollback needed a lifecycle correction too

The tracked preview utility in `af8fd98` was exercised in an isolated checkout
on 18888, using a copied scratch database and deliberately different candidate
bytes. Seventeen checks initially passed startup/switch/rollback, wrong-PID and
wrong-database refusal, all twelve unchanged tables and unchanged original
18861 metadata. Subsequent review found a missing case: an ordinary restart
without `--dist` discarded the prior application path/commit and could break a
later rollback. Commit `a3d6cf6` retains that pointer. The expanded **20-check**
fixture now includes normal restart before rollback, four verified listener
processes, unchanged application bytes on restart, restored old application
bytes on rollback and the same continuously preserved current database. The
fixture is evidence of the utility, not an actual 18861 promotion or database
restoration. Passing the first lifecycle did not justify claiming all later
sequences were protected.

### Writing and remaining release gates

The root README and PROCESS now describe Little Chorus, and root
research-note.md exists. All carry an upfront **Author review draft** notice.
The user's explicit drafting authority supersedes the older blanket prohibition;
it does not authorize fabricated reading, listening, private beliefs, friend
reactions or retrospective reflection. The research note combines the requested
two directions into a position that verification capacity must grow with
throughput, and addresses the counter-case that agents can expand verification.
The sources and their evidence limits are checked. Historical reflections are
unchanged. The writing packet records the initial stale SoundGarden gap as
history and the current root adoption separately.

Actual final-run desktop/phone images are exported without retouching under
`screenshots/26-chorus-*`. Reviewing them still found Reading's small carrier
hidden behind the local body, despite the operable scripted path. A later
art-only lateral porch offset and its focused desktop/phone/geometry checks
remain separate from the passing 41-check run; old sound positions are not
moved to fix a composition. The durable
[release record](evidence/chorus-garden-2026-11-07.json) identifies completed
artifacts, their hashes, later refinements and the remaining local promotion.
No full current legacy regression, final 18861 cutover or public deployment is
inferred here from the successful core. Root integration records their actual
results when available.

Still unperformed: the two unfamiliar pairs, by-ear artistic acceptance,
voluntary recombination, physical-phone performance and real next-day return.
The 60-second first-sound and three-minute first-response goals remain targets.
Automation, developer UI review, human judgement and deployment are distinct;
none is relabelled to fill a submission gap.


### Later audit found an uncovered late-acknowledgement state

After the 184-test and 41-browser-check successes, an actual-controller/audio
race diagnostic reproduced a different case from the held-ACK assertion already
in that browser path. While a new child POST was pending, the browser missed
both its created and removed SSE events. A reconnect supplied the child's
canonical tombstone, but the original delayed success response then reinserted
that unknown child into local live-source/audio maps. The canonical sculpture
was correct throughout: checking it alone would have missed the resurrected
sound and label. The ignored diagnostic records live IDs before/after and
`removedUnknownSourceRevived: true`; it executes the real controller functions
and PlanetAudio, with supplied race states, rather than pretending to be a
live browser test.

The proposed correction treats POST acknowledgement as a receipt and feeds
canonical work tombstones into local removal precedence. New source and real
browser checks, followed by the final build/repeat, are pending. The earlier
184/41 runs remain truthful but explicitly predate this guard. They must not be
presented as proving the newly discovered case or the eventual release source.
The [structured record](evidence/chorus-garden-2026-11-07.json) preserves that
boundary and the diagnostic instead of rewriting the successful earlier run
as if the race had already been covered.


The late-ACK correction is now committed in `92d706b` for both planet and
preserved coast: HTTP success is a receipt, while canonical accepted events
and snapshots own live-source selection. Six regression checks pass against
the actual current controller functions/handlers and all six fail against
frozen old implementations. Planet checks use actual PlanetAudio source
selection; coastal audio/render adapters expose requested IDs without claiming
acoustic playback. Work history present and outside the bounded archive are
both exercised. This focused result does not retroactively change the scope
of the previous full source/browser runs.

The first expanded browser attempt closed the only native stream before
forwarding its intercepted POST, and the server legitimately returned
`not_here`. The presence policy is retained. The revised fault fixture keeps
real presence while dropping the two real created/removed sound frames before
the production handler, then closes that transport and opens a new native
EventSource using the production handlers. Actual event data, server snapshot
and HTTP acknowledgement remain real; only delivery/order is controlled.
Its final result is pending. It must be described as logical frame-loss fault
injection, not an unmodified natural network outage or proof of automatic retry
timing. The earlier 41-check path separately covers actual close/reconnect when
no new POST is in flight.


The guarded candidate at `2c2f587` now passes the separate full **190-test,
28-file** source run in 63.48 s on independent 18887, and the expanded **43-check**
actual browser path on 18885. Earlier 184/41 results remain recorded as their
own narrower observations. The new race case proves the child is absent at
the production handler after the two actual sound frames are dropped, receives
its real tombstoned history through a new native connection, and then releases
the original held HTTP receipt. No source, pin, sculpture or real audio start
revives beyond the next bar. The separate actual stream-close/reconnect
withdrawal case still passes. This is explicit logical frame-loss injection,
not a fabricated server snapshot or a natural-network timing claim.

The latest local shared update sample is 43 ms; the reading reply is 2.816 m
from its target parent and 4.321 m from the pre-existing bird. These are the
new run's observations, not numbers silently reused from the earlier run.
Both canonical outcomes and local quiet preference remain consistent. Eight
actual captures from that run were reviewed; a later portrait-only camera
framing refinement and its focused phone review are still separate work.

The initial coastal regression used a cloned historical world. Its third
suite, leave-a-sound, assumed all marks/voices should be zero after removing
its test-owned sound, while the clone correctly retained five old coastal
sounds. The original assertions are unchanged. The full fifteen coastal
suites are moving to an independent empty database on 18890 with a frozen
compiled copy; the prior partial attempt and its fixture mismatch remain in
the record. This is not evidence that the application failed to remove the
test sound, and the original working preview is not a test target.


The coastal repeat now passes **all fifteen original suites**, each exit 0,
on the dedicated empty 18890 database and frozen `2c2f587` application copy.
The [structured record](evidence/chorus-garden-2026-11-07.json) preserves each
actual script timing, check count and local log scope. The first clone attempt
remains separate: two suites passed and leave-a-sound exited 1 with fifteen
successes and two zero-total assertions invalid for its five preserved old
coastal sources. No original assertion, historical source or database was
removed to manufacture the passing fresh-world outcome. This completes the
coastal regression gate, not the later portrait camera review or 18861 cutover.


The final portrait-only source `26805fb` now passes its **eight focused actual
checks**, separate from the 190/43 canonical-code runs. Two independent
browsers make the same real Reading water/bird canopy; touch Listen/Cancel
keeps quiet browsing and explicit publication distinct. All three areas retain
reachable 44 px work, sound and movement targets, and real touch movement,
place travel and jumping still work. Existing sources are preserved; normal
API cleanup leaves the completed test work archived, no source playing and no
browser or cleanup errors. The root agent reviewed all six unretouched actual
desktop/phone captures: full bodies/feet and work remain above the phone HUD.
This completes the final composition gate without relabelling the earlier
full-suite run or claiming physical-phone/author artistic acceptance.

The current ADR, walkthrough, acceptance map and structured record now agree:
canonical state/audio logic at `2c2f587` has 190 source tests, 43 integrated
browser checks and fifteen original coastal suite results; the later camera
composition at `26805fb` has its own eight-check touch/render result. The
20-check lifecycle fixture is separate again. The technical candidate is ready
for the original-preview switch; the actual 18861 all-table comparison,
listener/served-byte verification and release tag must come from that switch's
record. Human listening, two uncoached pairs, voluntary recombination, real
next-day return and public deployment are still not claimed.


### The actual local preview switch preserves current work

Application `28f1e5860b4d28ac46e53a658702e84885206c44` is now serving the original
`http://localhost:18861/planet` preview, including final runtime `26805fb`.
The tracked utility stopped only the recorded old process and retained its
compiled output (`06c1ca9`). The new listener is PID 65055, parent 1, no TTY.
It uses the same original `/private/tmp/soac-polish-review/review-final.db`.
Every row in all twelve persistent tables is exactly unchanged; no metadata
allowance, schema mutation, coordinate rewrite or historical DB restoration
was needed. The preserved counts include 25 users, 24 participants, 23 sounds,
seven operation records, one reply and both scenes/sessions/environment rows.

All 47 served client/shared modules and styles match the installed candidate
bytes with no-cache headers. Independent readback also verifies the actual
bytes/SHA-256 of all three original score derivatives, and all eight original
live sound IDs/coordinates: five coastal and three planetary. The previous
compiled application remains available for `python3 scripts/local-preview.py
--rollback`, which keeps the current database. No writing test targeted the
original preview. `/planet`, the original coast and `/readme/` return 200.
The structured record includes the actual switch and independent readback,
separate from the isolated 20-check utility fixture.

An already-open tab needs a refresh for the new client. Fresh-profile GET-only
main-preview smoke and the final annotated `chorus-garden-2026-11-07` tag are
still being completed by integration; no target hash is invented inside its
own evidence commit. This is local preview promotion only. No main push,
public deployment or access change occurred, and the human/listening/next-day
limitations remain unchanged.


The final original-preview entry smoke passes all **seven read-only checks**
in a fresh empty-cookie context. Its guard blocks every non-GET/HEAD request;
none was attempted. The actual nickname invitation and 1920×1020 world canvas
render, with no join, contribution, AudioContext, voice or playback start, and
no page/static/request errors. The root agent reviewed the unretouched
[promoted entry capture](screenshots/26-chorus-promoted-entry.png). A fresh
read-only SQLite recomparison after the browser closed matches every count
and SHA-256 in all twelve promotion tables. The original listener remains
PID 65055; owned review listeners on 18884/18885/18887/18890 were stopped after
verifying their recorded identity, while scratch databases/logs are retained.

The first smoke attempt waited for networkidle on the persistent-SSE page and
then hit an encoded-URL-path artifact write in the Chinese directory. The
harness now waits for DOMContentLoaded plus actual visible canvas/join state
and uses fileURLToPath. This correction and its first failure log are retained;
it is not relabelled as an application bug or concealed by the final pass.

No engineering acceptance gate remains open for the local candidate. The
final evidence commit and annotated `chorus-garden-2026-11-07` tag are release
orchestration; their target is resolved from Git after creation, not invented
inside a self-referential document. Application commit `28f1e58` includes code
`26805fb`. Public deployment/main push, human listening, two uncoached pairs,
voluntary recombination, physical-phone performance and real next-day return
remain unperformed and are not implied by the local release.

The final local release is identified by the annotated tag `chorus-garden-2026-11-07`; resolve its target with Git. Application `28f1e58` serves runtime `26805fb`, and the final evidence commit changes documentation only. The source rollback tag is `before-chorus-garden-2026-11-07`; the tracked preview utility switches compiled application files while retaining the current database. No main push or public deployment was performed.


## 2026-11-07 — Neighbours revision started (ADR 027)

- User reports seven concrete defects: fresh-profile nearby silence, hidden chat/private-room actions, unappealing source lighting, small shared changes, missing café and an undismissible card.
- Read-only observation of the live preview was followed by an isolated SQLite backup on port 18891. The original port 18861 and current database were left running during implementation. A manual browser visit on that clone entered the welcome, auditioned a recommended ingredient, cancelled without publishing, travelled to Restrooms and physically walked inside. No in-world Flush/exit action appeared; chat and room actions were buried in the tools drawer. This is developer self-test, not a novice study or an ear-based sound verdict.
- Actual destination audio probe: running context, one Reading Nook bell voice, four metres, -62.78 dBFS RMS before the fix. Explicit off returned exact zero. No autoplay bypass or database writes. Ignored raw artifacts: `.cache/neighbours/audio-output-before.json` and `audio-output-probe.mjs`. The near-field negative check fails with old attenuation. Nick's exact browser/device remains unobserved.
- Verified audio step committed as `6940d01`; 25 focused tests cover near-field, unchanged range, lifecycle and eight-part PCM headroom. Shared-work surrounds and café lifecycle have real geometry/filter/removal negative controls. Integration focused run: seven files, 41 checks passed; this is not artistic acceptance.
- In progress: integrate social actions, close/reopen panels, actual shared surrounds and café; then measure browser output and run independent-identity/phone paths before switching the player's preview. Rollback boundary: `before-chorus-neighbours-2026-11-07` at `a2bb8ad`; no database rollback.

- Integrated candidate compiles with TypeScript. Complete checks against a dedicated fresh database on port 18892: 32 files / 207 tests passed in 61.73 s. Browser candidate uses a different cloned database on 18891. No writing test targets 18861.
- Post-fix actual destination probe (trusted click, no autoplay bypass): Reading bells at four metres -43.78 dBFS RMS, +19.00 dB from baseline; explicit off exact zero. Six parts/default 70% volume: peak -9.28 dBFS; eight parts/maximum volume: peak -5.38 dBFS. These are sampled WebAudio outputs, not a hardware listening or musical-quality verdict. Raw `.cache/neighbours/audio-output-after.json` will be indexed in the final durable evidence.

- Actual two-cookie social/private-room automation on 18891 passed 30 checks with zero page errors. It includes real walking against an occupied door, authoritative rejection, actual decoded flush/shower nodes, quiet-browser preservation, 390×844 touch controls and the NPC occupied/flush/release cycle. Baseline ordinary source rows and coastal history matched after cleanup. This is developer automation, not a friend study.
- Screenshot review found an indoor phone back-of-head obstruction despite passing action checks. Commit `a6753f9` corrects the collision-shortened third-person visibility rule; the real roof/wall ray check fails on the old rule. Close-up browser review of Tide & Coffee found the open front, counter and several NPC regulars visible; a roof cutaway was considered and not needed for that arrival view.
- An independent read review reproduced keyboard focus loss when the work dock repainted (failed DOM probe), and found Enable listening did not recover an explicitly zeroed volume. Root corrected both, retained What changed? expansion through shared updates, and moved the desktop sound hint below the location card after actual screenshot overlap. Focused integration checks now 42/42; final browser review follows.

- Scene automation first hit the existing one-second write limit and its first cleanup did too. The exact orphan was removed through its own fixture identity and confirmed absent; fixture pacing and cleanup were corrected. The second run found a real 390×844 defect: Share a sound was behind Run (native touch hit Run, no forced tap). Root gave Share a separate lane and kept passive notices from intercepting input. Final scenes on 18893 passed 19 checks, including real zero-volume recovery, focus/details preservation after a friend reply, shared café state, phone Share/library targets and strict cleanup of all five fixture sources. Sources were authored by two independent cookie identities; no human study is implied.
- Screenshot review then found minimising the core work exposed the automatic nearby card underneath. Minimise now also dismisses that automatic card, while real source pins and explicit reopen remain usable. A further negative test reproduced a friend's closer new source reopening a dismissed card; dismissal now survives a nearest-source change. Focused integrated checks: 44/44 passed.
- The full creation regression initially completed its first 34 checks, then stopped because the fresh scratch DB lacked the persistent Reading Nook bird assumed by the old harness. Added a public-API-only fixture preparation, with no direct database edits. Its first attempt used Playwright's response-method convention on native fetch; corrected that test-only mistake. A complete rerun follows. No source result is reclassified as an app failure, and no partial run is called complete.

- Final source audio focus safeguard committed `06831cb`: an explicitly focused in-range source now reserves a seat before the seven/eight ordinary-voice limit. Restoring the previous selection fails both ordinary and duet crowded-mix cases. All 28 audio checks pass, including out-of-range focus, retained low harmony and withdrawal. The final complete source check is 32 files / 213 tests passed (66.59 s), using 18894, separate from all browser and player data.
- Complete three-place creation rerun passed 43 checks with zero page or cleanup errors on 18893. This includes real two-cookie authorship, shared-cookie exclusion, touch/keyboard, actual compatible nodes, bar entry, late acknowledgements after missed creation/removal, reconnect, durable authors/history, all three areas and exact pre-existing planet/coast sources. It uses an autoplay bypass for its multi-scenario audio instrumentation; the separate actual-output and social suites use trusted activation without that bypass. The later focus-priority change is additionally covered by the 28 focused audio checks.
- Final scene rerun exposed one more real collision: the newly dismissed source's Open pill intercepted the work's Open pill on desktop. Root kept only the work reopen when a work dock is present. Final scene run on the complete candidate: 23 checks passed, no page errors, exact preservation of the pre-existing Reading Nook fixture and cleanup of all five own sources. It verifies zero-volume recovery, focus/details preservation, minimising without another automatic card, shared café effects, phone Share/library hit targets and both actual indoor camera hide/outside restore paths.
- The separate first indoor script passed toilet hide/restore but raced the room switch for shower; its retry timed out waiting for welcome (no join-error evidence). These were not claimed as full indoor passes. The final stable scene script completed both rooms and supersedes that coverage gap. A report of duplicate Run/Jump controls was rejected after root inspected the screenshot and actual four-arrow-only touch markup; no functioning controls were removed.

- Local promotion completed on 2026-11-08: application `91ff33d` now serves original port 18861. The tracked utility retained application `28f1e58`, made a fresh stable backup after stopping only the verified listener, compared every row of all 12 current tables, and verified 48 served modules/styles with no-cache headers. At the switch, `placed_sounds` had 29 rows; no test writes targeted this DB. Visual rollback uses the retained application and the same current DB, never the backup.
- A fresh unjoined observer inspected the actual promoted 1920×1080 page: four destinations, visible Talk, Sound off, no page errors and zero non-GET/HEAD requests. It does not replace an existing player's position. Actual screenshot and raw report are indexed alongside the final 390×844 touch captures in `docs/evidence/neighbours-2026-11-08.json`.
- Final evidence check passes: all three historical reflections exist and the 11 PROCESS commit citations resolve. No personal narrative or human listening/playtest result was rewritten or invented for this revision. Annotated release `chorus-neighbours-2026-11-08` identifies the evidence commit; source rollback boundary remains `before-chorus-neighbours-2026-11-07`. No main push, public deployment or access change.


## 2026-11-08 — Optional 2D and 2.5D comparison (ADR 028)

- Wen asks for both a 2D and a 2.5D version to try. This explicitly reopens the previous deferral of flat rendering; the existing 3D route and data remain in scope. Working branch `codex/chorus-perspectives`, rollback boundary `before-chorus-perspectives-2026-11-08` at `69df456`.
- Chosen implementation: two original Canvas2D renderers/presentations over the existing planet controller, identity, SSE and spatial audio. They keep `planet:morning`, canonical source coordinates and history; no new room, dependency, schema or static concept background. 2D is a top-down storybook, 2.5D an isometric paper theatre. Visual preference is deliberately left for real comparison.
- Implementation checkpoints: `a89214f` defines the optional lenses and identity-bound, one-time local handoff; `88f0035` adds both actual renderers and eleven focused world checks. The original 3D renderer remains the default.
- Actual browser inspection of the isolated historical clone found artificial character colours, source-label clutter and crowding around the work. Natural fur, stable author-coloured clothes, compact named markers, non-overlapping name labels and a separate local-companion resting position address those observations. This is developer visual inspection, not an unfamiliar-player study or an artistic listening verdict.
- The first cross-view browser run passed creation, real decoded audition, a genuine second-author response, matching shared results, quiet preference, chat, view handoff and phone movement, then failed on phone chat. A bounded DOM probe showed the work card over the Say button. Hiding competing context cards directly in CSS removes the dependency on an animation frame. The first retry still served stale CSS because a TypeScript-only scratch build had not copied the stylesheet; the next retry exposed a second blocker, the retained reply-intent card. Both failures and cleanup records remain in ignored `.cache/perspectives/`; the final retry checks the actual button hit target immediately after chat opens. This was not treated as a successful test.
- The initial empty listening button is now hidden until synchronously populated. Final candidate builds explicitly copy the stylesheet as well as compile TypeScript.
- Before these final UI corrections, all 237 specifications in 35 files passed against isolated port 18898. The six new HTTP presentation checks failed against the frozen previous application on port 18899, as expected. Neither run wrote to the player's port 18861 database.
- Final browser run 4 passed 47 behaviour checks with zero page errors: two independent identities in the two flat views, actual decoded audition, live cross-author response and matching rendered forms, quiet preference, chat, identity/position handoff, 390×844 touch actions, actual restroom entry/flush/exit and server-enforced rejection of the second occupant. Strict cleanup soft-removed only its two ordinary sources, ended both private stays and verified earlier planet/coastal snapshots were unchanged. The two retries before it failed and are not counted as success.
- The final source passes type checking and a fresh 59-file compiled/style build matches the tested candidate byte for byte. Application `bdb59c6` was then promoted with the tracked local utility; all rows of all 12 current tables were preserved, with 29 `placed_sounds` rows at the switch and 52 served module/style byte checks. The preceding `91ff33d` compiled application is retained for rollback with the current DB.
- A fresh unjoined read-only observer opened 2D, 2.5D and the retained 3D at actual port 18861: same room and nine existing public sounds in each, Sound off, zero write requests and zero page errors. Its real screenshots and the final two-person desktop/phone captures are indexed in `docs/evidence/perspectives-2026-11-08.json`. Actual captures were visually inspected; no concept art is used as runtime evidence.
- Remaining limits: source pins sometimes obscure part of a nearby figure and foreground trees can cover characters in 2.5D. No unfamiliar-pair, physical-phone, next-day-return or human artistic-listening result is claimed. No personal submission narrative was rewritten, no main push/public deployment occurred, and no database was restored or coordinates converted.
- The first UI/UX skill gaming search returned hyperreal styling inappropriate to the request; a narrower organic-illustration search supplied relevant soft forms, contrast and low-cost rendering guidance. The existing Little Chorus palette/typography remains the main art constraint. No unverified design-system output was persisted.
- Presentation handoff checks: seven passed. The short, consumed handoff binds current identity/target and rejects stale, future and invalid positions. It stores no motion and never sends coordinates through URLs, logs or the database. Fresh documents retain explicit local sound entry. The earlier pending HTTP-route and cross-view browser status was subsequently completed by the 237-specification run and final 47-check browser run recorded above; their build scopes remain distinct.

## 2026-11-08 — Keep 3D; make everyday spaces credible (ADR 029)

- Wen chooses the 3D planet after the flat comparison. The new observations are visible jagged edges/stiffness, an odd player-facing resident lock-test invitation, missing bathroom fixtures, a small/sparse café and moving conservatory flicker. Working branch `codex/chorus-lived-in-3d`; rollback boundary `before-chorus-lived-in-3d-2026-11-08` at `6f1cf29`. The original 18861 preview and its DB are left untouched during scratch checks.
- Opened the frozen historical clone at 18896 in the actual in-app browser, visited Rain conservatory and walked there. The flower box used a full cream lid with top y=.52 and dark soil with the same top y=.52. The correction makes a real open rim and lower soil; it does not apply arbitrary material offsets. A duplicate coplanar Green patch was also removed.
- The existing 3D renderer already had MSAA. The refinement raises its 1.5× DPR ceiling to a bounded 1.25–2× drawing scale, resized with the viewport and capped at six million pixels. It preserves existing shadow setup and adds no post-processing dependency. Actual visual/performance comparison is separate from a pure pixel-budget check.
- `280d7fc` removes planet/coast player-facing lock-test invitations and their handlers, while retaining natural NPC visits, private-stay sounds and authoritative admission. The newly added no-invitation check failed with the actual old button, then passed. Existing browser fixtures schedule the same NPC through the scratch API explicitly; this is not presented as a real player's action or an unfamiliar-player study.
- `307cdf7` adds distinct toilet/shower fixtures, a wider café shell with six tables and matching walking height/walls, and six distinct café NPCs. Furniture and characters retain their scale, historical venue/source coordinates remain unchanged, and only real source/work state can select shared sound responses. Idle gestures yield to those responses and respect reduced motion.
- All three new geometry checks failed against the frozen previous compiled build: missing fixtures, missing separated planter surfaces and the previous wall envelope. The current full run passes 245 specifications in 37 files on isolated port 18897 (`.cache/lived-in/spec-run1.log`); browser writing flows use a different DB/port 18898. Type checking passes. This is a technical checkpoint, not artistic acceptance.
- An official-course audit is in `docs/final-quality-review-2026-11-08.md`. It reviews the preceding comparison candidate rather than claiming this new implementation was already verified. Core HD gaps remain human judgement, author-reviewed arguments and the actual course deployment. README/PROCESS/research-note/reflections were not rewritten as personal experience.
- The first scene browser run passed nineteen mechanical checks, but actual screenshot inspection found the café name board covering almost the entire walked interior view. This is a real visual failure, retained in `29-cafe-obstructed-before-correction.png`. `37e055b` moves the board onto the front gable, adds signs to camera avoidance and synchronises keyboard camera labels on a state change. A second attempt sampled the new label before its next render frame; the final assertion waits two actual animation frames, not the old 700ms clock. These failures are not hidden behind the passing mechanical checks.
- After the correction, the final full run again passes 245 specifications/37 files (`.cache/lived-in/spec-final.log`). The final scene run passes 21 real-page checks with zero page errors; its actual walked café now shows NPCs, tables, cups and counter. Its directed conservatory captures show the soil/rim in both movement positions, with the old overlap visible in the frozen baseline. Different historical source lists mean this is not a pixel-identical whole-state comparison.
- The furnished candidate's earlier private-room run passed 31 checks, and its neighbour/shared-work run passed 24; both use separate real browser identities and confirm their own public-API cleanup. They precede only the later sign/camera/header correction, and this scope is explicit in the final index. The final-source scene run additionally walks both furnished rooms. No physical phone or human artistic listening was claimed.
- Local application `37e055b` now serves original port 18861. The tracked switch utility compared all rows in all twelve current tables (29 source rows) and verified 52 served module/style bytes. The preceding `bdb59c6` application remains available for rollback with the current DB. A fresh unjoined observer then opened the actual promoted café at both viewport sizes: nine previous public sources, six NPCs, distinct fixture sets, Sound off, no write requests and no page errors. Reports and unmodified captures are indexed in `docs/evidence/lived-in-3d-2026-11-08.json`; there was no public deploy or main push.

## 2026-11-08 — Make an answer recognisable and reachable (ADR 030)

- Wen asks for a working revision directed at HD quality. The decision is to
  retain 3D and the reliable identity/audio/reply engine, and concentrate on
  one understandable joint creation rather than more destinations. Branch
  `codex/chorus-answers`; rollback tag `before-chorus-answers-2026-11-08`
  preserves `2c0a9cc`. The original 18861 world is not a write-test target.
- Before implementation, a real in-app-browser visit on a frozen historical
  clone selected nick's Warm chords, privately previewed Soft pulse and chose
  Leave. The real service returned `too_close`. This exposed a recommendation
  that a new player could hear but could not contribute. Existing state has
  nine live public planet sources, **five** belonging to Green works; these
  are different counts. Historical coordinates and sound limits remain intact.
- `0566fa3` makes outcome guidance depend on every live ingredient, shares
  true author colour/shape between record and leaf, and directs light along
  real live cross-author replies. Same-cookie tabs, NPCs and removed endpoints
  do not unlock the shared form. Frozen previous Studio code fails the three
  new behaviour targets; the native journal-close handoff also had a separate
  observed failure before correction. These are controller/UI checks, not
  listening or novice-playtest results.
- `2ca764f` adds persistent public work links through joining, private Listen
  when placement is blocked, and an explicit safe walk followed by a separate
  Leave. No new schema, dependencies, samples or rewritten coordinates are
  involved. README rendering also repairs localhost and four broken document
  links; Docker context excludes development databases. A 33-check actual
  Chrome path uses two independent identities without an autoplay bypass,
  then a shared-cookie control, canopy creation, withdrawal, lantern
  recomposition and phone return. No human listening verdict is inferred.
- Read-only review found three additional boundaries: an arrived but cancelled
  walk could steal modal/chat focus; SSE availability could read the old source
  map; a distant clicked leaf could fall back to a different nearby sound.
  `f557ade` fixes these. Its separate complete creation regression passes 43
  actual-browser checks across Green, Stage and Reading, including the real
  late-ACK/reconnect/audio lifecycle path. The independent process check passes
  13 checks across three server PIDs/two restarts, with row equivalence and
  preserved provenance. Its 26.82 ms maximum sample is HTTP/SSE observation,
  not a UI, remote-network or acoustic guarantee.
- `a68a642` gives a full old corner an explicit route to begin a new Stage
  work. Three placement-harness attempts first had incorrect fixture
  assumptions: nine planet sources were confused with Green membership, and
  a new identity's preferred source was assumed to match Alison's. The harness
  now reads actual counts and explicitly selects nick's live chord in the
  record. No application state was changed to satisfy those assumptions.
- The corrected historical browser path then exposed a **real application
  failure**: immediate travel opened a chooser using the preceding frame's
  position. Finding an already-valid spot created a zero-length walk that
  ended without reopening the chooser. The failed result and screenshot are
  retained. `5f1fc28` uses the controller's current position and refreshes the
  existing chooser when no walking is needed. This fix is being verified on
  the same historical clone, not a reset world.
- A full repeated specification run hit the legacy coastal workflow's 5 s
  overall timeout. That workflow deliberately waits 4.56 s for rate/movement
  limits before HTTP overhead. Its overall budget is now 10 s; each actual
  SSE requirement remains 1 s. A fresh isolated run passes all 275 checks in
  43 files (107.04 s). The failed run is retained; no application latency
  threshold was relaxed. Final exact-build scope belongs in the release index.
- Personal README/PROCESS/research claims remain labelled author-review
  drafts. Two unfamiliar pairs, named human listening, real next-day return,
  physical-phone checks and the authorized course deployment remain separate
  open gates. The submission checklist and URL-only pair protocol make those
  omissions actionable rather than inventing a success story.
- Final application `5f1fc28` passes the 33-check independent-browser answer
  path again and the 20-check historical-placement path. The latter observes
  real safe spacing of 4.48 m and automatic updates of the same open choice
  after a separate identity's add/remove (56/45 ms in this run). Two new actual
  controller checks pass; the frozen `a68a642` immediate-travel target fails.
  The final isolated suite passes 277 checks/44 files in 99.60 s. These
  independent runs are indexed with their actual source scopes, not combined
  into a quality score.
- A fresh release matches all 63 files of the browser-tested compilation.
  The local switch then preserves every row in all twelve current tables,
  including **31** sound rows at promotion, and verifies 56 served module/style
  bytes and cache policies. The starting 29 rows are not misreported as the
  later snapshot. `37e055b` is retained as the previous application with the
  current database. No database backup was restored.
- A fresh unjoined actual-18861 Chrome observer blocks all non-GET/HEAD
  requests: zero writes and zero page errors, Sound off, nine existing live
  public sources, author marks, 1920×1080 and 390×844 captures, four note routes
  returning 200, an unknown note returning 404 and no phone horizontal page
  overflow. Final raw records, observed failures and unmodified screenshots
  are in `docs/evidence/answers-2026-11-08.json`. This is local promotion,
  not an authorized public deployment or a completed unfamiliar-pair study.
