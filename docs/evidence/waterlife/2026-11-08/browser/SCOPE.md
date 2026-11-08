# Water-life browser evidence

Recorded on 2026-11-08. These are original browser captures and raw outputs,
copied byte-for-byte from `.cache/waterlife/`. Archiving did not rerun the
browser, change images, query a database or modify the application.

| Directory | Recorded scope | Result and interpretation |
| --- | --- | --- |
| [baseline](baseline/results.json) | Frozen `8f32290`, port 18940, anonymous GET-only observation; three original screenshots | Four checks pass because they detect the reported defect: contextual Green/pool cards hide Share. This is a reproduced baseline failure, not application acceptance. |
| [occluded](occluded/results.json) | Earlier candidate on independent port 18942; original report, raw log and both rejected phone images | Twenty checks report green, but visual review rejects the phone experience. Discovery and shower cards cover the fish, and the whale phone capture retains a desktop projection (`x=959.75`) and a repeated header. Numerical visibility/overflow checks were insufficient. The original report is retained without changing `passed: true`. |
| [final](final/results.json) | Coherent `3e367ee` candidate on independent port 18942; two actual browser identities, seven original screenshots, raw log | Twenty-nine recorded checks pass. Watch mode clears contextual cards, provides a reachable Back to exploring action and restores world focus. A fresh phone frame replaces the stale desktop projection. |

Each directory includes its raw browser log. The earlier harness did not have
all the final checks; do not compare their green totals as if they were the
same acceptance scope. The scratch writing path uses independent data, not
the user's preview at port 18861. No database files are included here.

## Final image review

Desktop captures are 1920×1080; phone captures are 390×844. The final images
were opened and visually reviewed after capture:

- [Fish and bubbles](final/fish-bubbles-desktop.png): fish are identifiable at
  the pond surface and a small bubble cluster is visible. The corresponding
  real source reports `action: bubbling`, `bubbles: 0.6511`.
- [Friends' frogs](final/friends-frogs-desktop.png): two frogs and their pads
  are unobstructed, with the calling throat inflated (`throat: 0.99998`).
  This is a calling pose, not a screenshot proving the entire hop animation.
- [Whale breath](final/whale-breath-desktop.png): droplets visibly rise above
  the whale's back (`spray: 0.42347`). Unlike the earlier `spray: 0` capture,
  this image establishes a rendered spray event.
- [Whale leap](final/whale-leap-desktop.png): the complete whale is clear of
  the water with its body, belly, flippers and tail identifiable.
- [Phone fish](final/friends-fish-phone.png) and
  [phone whale](final/whale-phone.png): the animals remain visible with a
  single header, accessible movement/Share controls and Back to exploring;
  discovery and private-room cards no longer cover the activity.

The final whale phone report has frame 1637, after desktop frame 1624, and
projects the watched whale to `(195.23, 340.40)` within the new 390-pixel-wide
view. The final phone fish projects to `(194.81, 343.77)`. These are fresh
phone samples, not the previous desktop `x≈960` values. Projection data and
the actual screenshots are both retained; neither substitutes for the other.

## What this establishes

The final run records explicit private audition without world unmute or
publication; three explicit Leave actions; a real cross-author reply; shared
animal identity for a late, quiet browser; source withdrawal and retained
history; scenery-only fish after withdrawal; no revival on return; actual
native GPU rendering and audio decoding without reported shader/page errors.
Its twenty-nine checks are listed verbatim in the report and raw log.

This is bounded developer-operated browser automation and image review.
It does not establish pleasant sound, exact natural-species calls, physical
phone performance, unfamiliar-player understanding, a next-day return or
public deployment. Fish intentionally skim the painted water surface; this
is not an underwater simulation. Still frames establish the captured poses,
not every intermediate frame of an animation. The code-only rollback and
promotion checks are recorded separately by the release owner.
