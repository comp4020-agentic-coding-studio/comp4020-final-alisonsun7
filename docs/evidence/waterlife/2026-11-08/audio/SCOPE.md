# Water-life audio evidence scope

This is the audio subtask archive for the 8 November 2026 water-life change.
The three files below are byte-for-byte copies of the previously generated
local evidence, archived after integration checkpoint `bc7199b`. No audio was
regenerated, and no application code, asset or manifest was changed to create
this archive. WAV intermediates and redundant generated files are not included.

| File | What it establishes |
| --- | --- |
| `verification.json` | Actual offline ffprobe/ffmpeg decoding, file hashes, decoded peaks, encoding SNR, silent tails and renderer fingerprint for the three original synthesized assets; includes a recorded earlier 23-test focused run lasting 304 ms |
| `focused-unit-tests.log` | Unmodified raw merged stdout/stderr from a later fresh focused Vitest run: 23 passed, 0 failed, 257 ms, using the real production PlanetAudio controller with controlled WebAudio test nodes |
| `index-upsert-verification.json` | Offline execution of the actual Commons index-write code against temporary fixtures: preserves existing original entries, updates stale Commons metadata, leaves project index bytes unchanged and makes zero network/download calls |

The temporary index fixture used the actual 21-entry index plus three chorus
score entries constructed from the real shared catalogue. Those historical
chorus entries were absent from the existing project index; the probe tested
their preservation without adding them to that index. All six original fixture
entries survived unchanged. The two 23-test durations above are distinct runs,
not inconsistent measurements of one run.

The JSON retains its original cache and temporary paths as historical context.
Its referenced index result is archived here as
`index-upsert-verification.json`. The initial HTTP global-setup failure executed
zero tests, and the whale-preview regression initially produced 22 passes and
one failure before the soft-cut fix. Their original tool outputs were not
saved as raw files; they are reports, not additional archived execution logs.

This folder does not contain the complete integration suite or GPU browser-run
logs. The root integration task reports those separately for `bc7199b` and
maintains the enclosing evidence index. Native browser AudioContext decoding
and a successful source `start` demonstrate browser playback-path execution;
they do not prove that a physical speaker emitted sound.

**Human listening and artistic approval remain pending.** Neither the unit
nodes, waveform measurements, complete test count nor native browser start
establish pleasantness, comfort, speaker output, real wildlife fidelity or a
successful friend playtest. These assets remain transparently documented as
original stylized synthesis, not animal field recordings or third-party CC0.
