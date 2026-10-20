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
