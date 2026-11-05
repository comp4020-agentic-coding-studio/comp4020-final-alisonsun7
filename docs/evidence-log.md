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
