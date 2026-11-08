# Original water-life sound illustrations

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
