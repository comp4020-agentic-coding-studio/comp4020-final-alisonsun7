# Water-life audio sources and illustrations

## Frog correction requested by the author, 8 November 2026

The author reported that the synthesized frog sound was wrong. The earlier
bounded peaks, deterministic waveform and automated playback checks did not
establish a recognizable or satisfactory frog timbre. That synthesized voice
has been removed from the active renderer and replaced with an actual pond-frog
chorus. No claim is made that another numerical synthesis adjustment solved the
author's listening objection.

The replacement comes from [Bad Waldliesborn — Brandscherenteich](https://commons.wikimedia.org/wiki/File:Bad_Waldliesborn_-_Brandscherenteich.oga),
recorded by **Ath** on 14 June 2021 and explicitly dedicated under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Commons' official
page and `imageinfo` metadata both identify the recording and its source SHA-1:
`e482140e86da6d21fd145fff77bacffd6e1f84f1`. The downloaded 2,205,406-byte
48 kHz stereo FLAC-in-Ogg original matched that checksum before processing.
This is a real frog chorus in a recorded pond, not a claim that the fictional
world or its individual stylized frogs were recorded there. No species is
invented from the source's general description.

A natural 3.2-second phrase from source time 0.4 seconds now begins at cycle
time 0.8 seconds and ends at 4.0 seconds. Its internal rhythm and pitch remain
unchanged. Processing uses mono 44.1 kHz, gentle 70 Hz high-pass and 6500 Hz
low-pass filters, 35/150 ms edge fades and a single linear peak scale to 0.30.
The existing 4.5-second event window and 18-second cycle stay unchanged, with
real silence after the phrase. The revised MP3 is **92,104 bytes**, with SHA-256
`a1204d6d0d102f47a4b63266a623442dcc6e5651700a5611499b68fdb52e880e`.

The natural chorus is not sliced into the earlier invented two-call pattern.
`src/shared/frog-call.ts` contains the processed recording's normalized 100 ms
RMS envelope, including silence, so the 3D response can follow source energy.
It does not identify two isolated animal vocalizations.

Reproduce from the verified original using:

```sh
node scripts/process-pond-frogs.mjs .cache/frog-voice/pond-chorus.oga
```

The processor verifies the original SHA-1 before decoding, records its licence,
source and processing parameters in `commons-pond-frogs`, and regenerates the
matching visual-energy envelope. The retired `original-pond-frogs` hash remains
under `superseded` with the author's rejection reason; it is not advertised as
the current file. The public sound ID `pond-frogs`, existing contributions and
their coordinates/history remain intact. Bubble and whale audio bytes are
unchanged. Their synthesis module no longer generates or overwrites frogs.

Other evaluated sources were not shipped: Rabe19's public-domain common-frog
file decoded with peaks over full scale, and the public-domain Leptopelis
recording was lower-rate material. Freesound had official CC0 candidates, but
its original downloads require login; no login or download restriction was
bypassed. The chosen Commons source was directly available with a published
checksum and an explicit CC0 dedication.

The coding agent has **not heard or artistically approved this replacement**.
The author's earlier rejection is actual listening feedback; the replacement
still needs their audition. Real source identity, successful decoding and
waveform measurements cannot guarantee that its timbre suits the intended
experience. The source original and processed WAV/MP3 are retained locally for
that comparison in `.cache/frog-voice/` and `public/assets/sounds/pond-frogs.mp3`.

Current machine verification fully decoded the replacement as mono 44.1 kHz
MP3: exactly 793800 samples / 18 seconds, decoded peak -10.34 dBFS, and zero
energy in the leading 0.7 seconds and after 4.1 seconds. The revised focused
audio suite passed 23 checks in 303 ms, including real-file hashes, licence
identity, transparent supersession, waveform-preserving phrase preparation,
matching RMS cues and the existing mute/preview/load-cancellation contracts.
The cached rejected synthetic file fails the new asset's hash check, providing
an offline regression control without mutating the active file. These results
do not turn the pending author audition into a passing listening verdict.
Raw records are `.cache/frog-voice/focused-unit-tests.log` and
`.cache/frog-voice/decoded-verification.json`. A short local listening handoff is
`.cache/frog-voice/frog-audition.wav` (the 4.5-second event without its long
inter-cycle padding). Earlier evidence below concerns the retired first version.

## Initial procedural version: historical record, frog superseded

The requested direction is fish releasing bubbles, frog croaks and whale sounds
connected to environmental changes. These three assets are original procedural
sound illustrations made for Little Chorus with coding-agent assistance.
They contain no downloaded samples, third-party music or wildlife recordings.
The frog and whale timbres are stylized; neither identifies a real species,
reproduces a documented animal call, nor claims a field-recording origin.
**Pond bubbles** illustrates air leaving the water, not a fish vocalization.

The author authorized original generated materials in ADR026 and explicitly
requested these water-life sounds. They are recorded as **original project
generated audio**, never relabelled as external CC0/public-domain assets.

## Authored phrases

| Sound ID | Construction | Audible event | Cycle |
| --- | --- | ---: | ---: |
| `pond-bubbles` | Eight damped rising resonances in three small groups, subtle generated filtered noise; first pop at 0.2 s | 3 s | 12 s |
| `pond-frogs` | Two short vowel-like harmonic croaks with gentle pitch drop, pulsed roughness and generated filtered noise; onsets 0.8 / 1.55 s and durations 0.44 / 0.48 s | 4.5 s | 18 s |
| `whale-song` | Two smooth low/mid-register vowel contours beginning at 0.18 / 4.1 s, sparse harmonics, subtle generated breath and short reflections | 7.5 s | 32 s |

These are independent unquantized nature-like events, not additional 72 BPM
score parts. They add no background bed or automatic public contribution.
Each remains privately auditionable and requires explicit Leave to become a
public source. The planet's normal local audio permission, range, generation,
removal and visibility guards apply to them.

`SoundKind.playback` describes the event window and interval in seconds. The
planet schedules only the audible event with the existing server-time phase
mechanism. Its source is not an endless texture loop, and the event window does
not occupy a continuously playing silent voice through the rest of the cycle.
The file includes quiet padding to the complete cycle so the older coastal
player, which loops whole files, also leaves genuine gaps. File duration and
event duration intentionally differ.

## Reproduction and provenance

```sh
node scripts/render-waterlife-sounds.mjs
```

The renderer uses deterministic integer-seeded noise and authored oscillator
envelopes. It removes DC with a gentle 35 Hz high-pass, linearly scales to
bounded peaks and sets silent tails and endpoints to exact zero. It then writes
mono 44.1 kHz, 16-bit PCM WAVs into the existing gitignored cache and uses the
already installed LAME 3.100 encoder at VBR quality 4 to produce the MP3s.
No network, package installation, browser synthesis, musical sample or system
configuration change is needed. Source metadata is not copied into the files.

The renderer upserts only these three `original-*` manifest records and their
sound index entries. It preserves all other asset entries and existing audio.
The Commons fetcher's index write also updates by ID and preserves any existing
original entries, so refreshing licensed recordings cannot erase these choices.
Manifest entries retain the renderer's SHA-256, version, fixed seed, sample
rate, normalization peak, output/PCM SHA-256, event metadata and measured PCM.
The transparent source record and pending listening status travel with each
asset rather than implying a Commons licence or a human performance.

## Machine checks, 8 November 2026

| Sound | MP3 bytes | PCM peak dBFS | Event-window RMS dBFS | Decoded peak dBFS | Encoding SNR dB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pond bubbles | 53314 | -9.90 | -28.82 | -9.91 | 36.13 |
| Pond frogs | 84914 | -10.46 | -32.44 | -10.48 | 42.13 |
| Whale song | 145399 | -11.70 | -20.82 | -11.67 | 46.53 |

Total: **283,627 bytes**, about **277 KiB**. ffprobe identified all as mono MP3
at 44.1 kHz. Full ffmpeg decoding returned exactly 529200 / 793800 / 1411200
samples (12 / 18 / 32 s), finite values and zero RMS for each final second.
No input metadata tags were present. Decoded peaks remained below -9.9 dBFS;
the encoder's waveform error relative to original PCM was measured rather than
assuming that an encoder invocation establishes quality.

The focused spec checks deterministic output, source/output hashes, bounded
peaks, small DC, waveform continuity, actual gaps, authored croak/pop timings,
catalogue/manifest agreement and the real PlanetAudio controller's event,
private audition, local mute and asynchronous cancellation paths. Its audio
nodes are controlled test doubles; this establishes scheduling and lifecycle
behaviour, not a physical speaker-output result.

The initial isolated Vitest command was blocked by the repository's HTTP
global setup because no app was running on its default port; no tests ran in
that attempt. A temporary unit-only configuration ran the focused tests
without starting a server or touching a database.

The final focused run passed **23 tests**. A newly added whale-preview check
first failed because five seconds cut through the second call without a soft
release; the production preview now applies a 45 ms gain ramp only when it
truncates a longer declared event, and that check passes. TypeScript and the
targeted whitespace check also passed. Existing audio Git hashes and every
pre-existing manifest entry were compared to `HEAD` and remained unchanged.

Human listening is still pending. Use modest headphone volume, then laptop or
phone speakers, and judge whether the bubbles feel gentle, the short croaks are
recognizable, the whale timbre avoids an alarm-like quality, and the three have
comfortable relative levels. Automated checks do not establish pleasantness,
realistic wildlife reproduction or successful friend playtesting.
