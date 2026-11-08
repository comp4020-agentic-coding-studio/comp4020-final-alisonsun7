# Frog-sound correction evidence

Date: 8 November 2026. The author reported that the previous synthesized frog
sound was wrong. The current `pond-frogs` asset uses a verified real pond-frog
chorus instead. The sound ID, stored contributions and 18-second cycle remain
intact. This folder archives the audio slice; it is not an artistic acceptance.

## Source, processing and checks

The chosen recording is [Bad Waldliesborn — Brandscherenteich](https://commons.wikimedia.org/wiki/File:Bad_Waldliesborn_-_Brandscherenteich.oga)
by **Ath**, published under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The official Commons page/API metadata and downloaded original agree on SHA-1
`e482140e86da6d21fd145fff77bacffd6e1f84f1`. The 2.2 MB original FLAC-in-Ogg is
not duplicated here.

| Archived file | Scope |
| --- | --- |
| `commons-source-metadata.json` | Unmodified official Commons `imageinfo` record with author, description-page URL, source URL, SHA-1 and licence metadata |
| `processed-verification.json` | Processor record, source/output hashes, edge/filter/linear-gain parameters, event timing, PCM measurements, generated 100 ms RMS envelope and superseded original identity |
| `decoded-verification.json` | Actual ffprobe/ffmpeg MP3 decoding: mono 44.1 kHz, 793800 samples / 18 s, peak -10.34 dBFS and zero energy in the leading 0.7 s and after 4.1 s; includes the old-file hash negative control |
| `focused-unit-tests.log` | Unmodified raw output: 23 focused checks passed in 303 ms, including licence/provenance, phrase preservation, RMS cues and production audio-controller mute/preview/cancellation behaviour using controlled WebAudio nodes |

The source metadata, decoding record and raw 23-check log are unchanged copies
of their earlier `.cache/frog-voice/` files. Their original cache paths remain
as historical context. The processor record was refreshed after the cache
correction below: rerunning the processor reproduced identical audio/PCM/RMS
data and changed only its script fingerprint. No audio or audition file was
changed by that correction.

The same historical MP3 filename previously had a week-long asset cache life.
A browser retaining its old unversioned response could keep playing the
rejected synthetic bytes despite the source replacement. The processor now
generates `FROG_RECORDING_REVISION = "a1204d6d0d10"` from the current MP3 hash;
the shared URL helper requests `pond-frogs.mp3?v=a1204d6d0d10`. This corrects the
URL in freshly loaded client code; it does not hot-reload an already open older
application. The archived 23-check run and earlier 35-check browser report
predate this cache correction. They are historical scopes, not validation of
the new versioned request. The enclosing root evidence records fresh acceptance.

The natural 3.2-second source phrase starts at cycle time 0.8 s and ends at 4.0 s
inside the retained 4.5-second event window. It has no pitch, speed or internal
rhythm manipulation. Its RMS envelope follows chorus energy, not two purported
isolated frogs' calls. Bubbles and whale audio bytes were left unchanged.

## Direct audition files

- `frog-audition.wav`: the new 4.5-second event, mono 44.1 kHz PCM16, copied
  exactly from the prepared-PCM listening handoff. It omits the long inter-cycle
  quiet padding. The served MP3's separate real decoding is measured above;
  this WAV is the prepared PCM rather than an assertion of bit-identical lossy
  MP3 decoding.
- `rejected-synthetic-audition.wav`: the first five seconds decoded from the
  historical rejected synthetic MP3. Its full source hash is
  `91401f118d2f7423fa652511202ba8d9f6f755c03bcd32f2be225ae69b9327b4`.
  This is an A/B historical reference, not the active asset or an approved sound.

The new served MP3 has SHA-256
`a1204d6d0d102f47a4b63266a623442dcc6e5651700a5611499b68fdb52e880e`.
The old synthetic hash cannot pass its current asset check. The complete old
and new source recordings and redundant WAV intermediates are not included.

## Listening boundary

The root integration task separately reports a 35-check native browser path
that decoded the 18-second frog asset and measured output RMS around 0.017.
Those browser logs belong to the enclosing integration evidence, not this
focused unit/offline archive. Native browser decoding, node starts and a
nonzero rendered output signal demonstrate that the browser playback path ran.
They do not establish physical speaker output or comfortable sound.

The author's rejection is real feedback on the previous synthetic version.
**The replacement still requires the author's listening judgement.** Neither
machine measurements nor the use of a genuine field recording proves that
this particular timbre is recognizable, pleasant or appropriate to the scene.
No coding-agent ear-listening, physical speaker test, artistic approval or
unfamiliar-friend playtest is claimed.
