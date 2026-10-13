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
