# Little Chorus: a small, compatible score

This is an implementation and listening handoff, not an artistic approval. The
coding agent can inspect PCM, scheduling and WebAudio graphs; it has not heard
these sounds. The project author and friend-playtest groups still need to judge
comfort, clarity and whether they want to try another combination.

## Decision and scope

The first shared score uses three original parts rather than trying to make the
existing unrelated music recordings play in tune. Warm chords, Soft pulse and
Little bell notes share 72 BPM, four-beat bars and C major pentatonic pitches
(C, D, E, G, A). The chord bed occupies the middle register; the soft drum leaves
space between beats; the pluck makes a sparse, higher answer. They are offered
individually. None is a background soundtrack or automatically placed source.

`src/client/chorus-instrument.ts` renders deterministic mono PCM with short
attacks/releases and zero endpoints. Browser sample-rounding is corrected with
playback rate so the loop remains exactly 10/3 seconds. These are original
project-generated sounds with coding-agent assistance, not downloaded samples,
third-party CC0 work or a claim of human performance. Three small MP3 derivatives
keep the older coastal library's existing URL/playback contract working.

Reproduce the fallback files after building:

```sh
node scripts/render-chorus-sounds.mjs
```

The script uses an already-installed LAME encoder, records SHA-256 hashes and
PCM measurements in `public/assets-manifest.json`, and preserves all prior
manifest entries. An initial ffmpeg attempt failed locally with the installed
fontconfig/freetype `_FT_Done_Face` dynamic-link error; no system packages were
changed. Existing LAME 3.100 successfully encoded the exact score instead.

## What a real friend changes

Only a canonical live `ensemble` work marked `duet`, with a live direct reply
between different authenticated contributor IDs, gains a low C/G answer. The
player sees this as part of the work; it never creates a user, ordinary sound,
authorship record or synthetic friend. The audio engine independently requires
both public endpoints to remain present. Removing an endpoint silences the
answer immediately, before the next work snapshot. One nearest qualifying work
can supply this answer; it occupies a seat inside the eight-voice budget.

Musical entry uses the next 72 BPM server-time bar with at least 50 ms scheduling
lead. The epoch is fixed rather than chosen by the first still-living sound, so
deleting a parent does not reset everybody's beat. The caller supplies anchored
server time; the client's wall clock does not select phase. Late visitors wait
at most one bar before joining the same phase. Different devices are reasonably
aligned, not sample-locked: network-clock uncertainty, output latency and browser
audio scheduling remain real limits. Nature recordings are not quantized.

## Audit of existing material

The eighteen existing derivatives retain their recorded Commons rights/source
checksums and files. Their manifest records a -20 LUFS processing target, with
2-second tail/head crossfades for textures. This is a processing record, not a
new measurement of every file. Rainstick and hand claps have prior measured
-20.58/-24.04 LUFS and -2.03/-2.16 dBTP respectively. The new three PCM peaks are
-11.30/-11.00/-13.96 dBFS; RMS values are -22.29/-31.94/-27.06 dBFS. Their roles
intentionally have different densities; equal RMS would make the pulse too loud.

| Material | Planet playback role |
| --- | --- |
| Forest, stream, waves, breeze, cicadas, gulls | Spatial, unquantized textures |
| Rainstick, chatter, dishes, boat, shower, children | Spatial natural or social texture; retain natural duration |
| Old guitar and café music | Optional legacy recordings; not promised to share tempo/key with the score |
| Bicycle bell | Up to 1.3-second one-shot, with 16-second cycle/quiet interval |
| Hand claps | Up to 1.8-second recorded event every 14 seconds; not the 72 BPM jam pulse |
| Toilet flush | One bounded event up to 12 seconds in a 70-second cycle; separate authoritative NPC routine audio remains unchanged |
| Espresso | One bounded event up to 8 seconds every 30 seconds |
| Three chorus parts | Compatible exact-bar original musical voices |

Real decoded non-event recordings get a further 80 ms tail/head overlap to
reduce MP3 encoder-padding seams; their natural timelines remain independent.
The original files and contribution positions are unchanged.

## Local listening boundaries and safety

Reading Nook sources carry 6 m, stage sources 18 m, and other sources 14 m.
Great-circle distance controls a squared gain falloff and real HRTF position.
Moving changes the mix without editing the work. At most eight sources,
including the derived answer, are selected; density reduces per-source level.
A .7 master headroom gain and a compressor (where supported) protect overlaps.
This does not replace listening for fatigue or clipping on physical hardware.

`setVolume(0..1)` and `setFocus(soundId|null)` are local only. Private auditions
duck the world to 18% and restore it when stopped or naturally ended. They do
not enable shared sound. Sound off, hidden pages, cancelled previews, removal,
new snapshots and disposal all block delayed loading from reviving playback.
A friend's contribution cannot set the local enabled preference or volume.

## Checks and their limits

- `spec/chorus-audio.test.ts` exercises deterministic bounded score PCM, real
  seam data, absolute bar scheduling, late entry, spatial ranges, duet identity,
  endpoint removal, off, preview duck/restore, local focus/volume, event cadence,
  visibility generation and the inclusive eight-voice budget using fake audio
  nodes. It does not demonstrate that a speaker emitted pleasant audio.
- The initial new score check exposed signed negative-zero endpoints. These
  were normalized explicitly; this was a numerical cleanliness correction,
  not an audible defect or evidence of improved musical quality.
- A copied, ignored negative-control module with its async generation guard
  removed failed the hide/reappear/decode check (one unwanted source started).
  Production source was never mutated for this experiment.
- The old eight-voice fixture placed its sources at 15 m under the old 18 m
  range. The new normal 14 m boundary intentionally invalidates those positions;
  moving the pending/far source to 13 m and the eight replacements to 8 m
  preserves the original voice-budget assertion within the current contract.
- Real-browser output/lifecycle checks and UI routing belong to the integrated
  candidate evidence. They must be reported separately from these unit checks.

## Human listening checklist — pending

ADR031 adds three optional local teaching signals using the existing espresso,
bird and gull recordings and their existing playback roles. They have a 6 m
range, half-level gain and yield the eight-voice budget to real contributions.
Clearing or re-enabling them invalidates stale loads; they never unmute a page.
The discovery path verifies actual decoded private playback under a gesture,
not speaker output or an artistic verdict. See the
[scoped release evidence](evidence/living-discovery-2026-11-08.json).

Use headphones first at modest volume, then phone/laptop speakers. For each row,
record device, volume, first impression and one concrete requested change.

| Audition | Listen for |
| --- | --- |
| Warm chords alone for 30 seconds | Warmth, loop seam, repeated-note fatigue, immediate intelligibility |
| Pulse alone, then add chords | Pulse sufficiently audible without an abrupt kick; compatible entry |
| Bell notes, then all three | Upper register not piercing; each role distinguishable; useful quiet gaps |
| Two real people create the ensemble | Low answer heard as a consequence; it adds warmth without mud |
| Six real contributions nearby | Level, density and clipping; can each friend find their contribution? |
| Stream + birds in Reading Nook | Natural, quieter boundary; approach helps listening |
| Preview while a work plays | Audition clear, world politely ducks, restoration smooth |
| Remove/focus/mute during a note | No alarming click; cancellation understandable; no delayed restart |
| Headphones vs phone speaker | Bass not essential to understanding the shared result |
| Café example, then an actual coffee contribution | Example is unobtrusive; real source takes over clearly; NPC/steam consequence understandable |
| Bird and gull examples near and far | Natural pacing and spatial falloff; species and visible visitors feel connected |
| Pause examples while a real friend's source plays | Only demonstration audio/effects stop; friend's source remains identifiable |

No human listening result, successful friend test or next-day return is claimed
in this document. Those remain evidence to collect, not prose to fill in.
