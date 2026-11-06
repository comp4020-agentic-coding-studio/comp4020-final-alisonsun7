# Additional sound choices, 6 November 2026

The project owner requested more nature and everyday sounds. These six
recordings extend the sounds people can listen to and leave where they stand.
They add no automatic background sound, placement rules or persistence changes.
The original ten recordings and their manifest entries are unchanged.

## Sources

Commons' official `imageinfo` API supplied the author, licence, original URL and
SHA-1 before download. Each original matched that SHA-1 before ffmpeg ran.
`public/assets-manifest.json` retains those URLs, checksums and processing steps.

| ID | Label | Suggested zones | Recording / author | Licence |
| --- | --- | --- | --- | --- |
| `coastal-gulls` | Seagulls | beach, pier | [Gull 1.ogg](https://commons.wikimedia.org/wiki/File:Gull_1.ogg), avphillips | Public domain, released by the author |
| `gentle-breeze` | Breeze and birds | forest, forest edge, creek | [Gentle breeze and birds singing.ogg](https://commons.wikimedia.org/wiki/File:Gentle_breeze_and_birds_singing.ogg), ezwa | Public domain, released by the author |
| `summer-cicadas` | Summer cicadas | forest, forest edge | [HyalessaFuscata KR.flac](https://commons.wikimedia.org/wiki/File:HyalessaFuscata_KR.flac), 金旻秀 (kim.min.su) | CC0 1.0 |
| `bicycle-bell` | Bicycle bell | boardwalk, forest edge | [Rotating-bicycle-bell.wav](https://commons.wikimedia.org/wiki/File:Rotating-bicycle-bell.wav), AntumDeluge | CC0 1.0 |
| `cafe-dishes` | Cups and dishes | counter, tables, window | [Kitchen tidy up.ogg](https://commons.wikimedia.org/wiki/File:Kitchen_tidy_up.ogg), starlite | Public domain, released by the author |
| `harbour-boat` | Boat by the pier | pier, beach | [Boat by a wharf 1.ogg](https://commons.wikimedia.org/wiki/File:Boat_by_a_wharf_1.ogg), ezwa | Public domain, released by the author |

These are recordings used in an imagined place, not claims that these species
or activities were recorded at the fictional location. The breeze includes
birdsong; the boat recording includes incidental voices. Suggested zones affect
the palette order only, and do not restrict where a sound can be left.

## Processing and checks

The existing two-pass ffmpeg pipeline produces mono 44.1 kHz, 96 kbps MP3s,
targets -20 LUFS and removes source metadata. Continuous sounds use the existing
two-second tail-to-head crossfade. The bell uses a 1.3-second clip with short
fades followed by 14.7 seconds of silence, so the spatial player's normal loop
does not ring it continuously.

| ID | Output duration | Bytes | Measured output LUFS | Measured true peak dBTP |
| --- | ---: | ---: | ---: | ---: |
| `coastal-gulls` | 16 s | 192827 | -20.66 | -11.86 |
| `gentle-breeze` | 28 s | 336710 | -22.08 | -2.31 |
| `summer-cicadas` | 36 s | 432945 | -20.41 | -3.84 |
| `bicycle-bell` | 16 s including silence | 192827 | -20.44 | -14.04 |
| `cafe-dishes` | 32 s | 384670 | -20.16 | -1.85 |
| `harbour-boat` | 26 s | 312886 | -20.44 | -2.25 |

Total added audio: 1,852,865 bytes (about 1.77 MiB). `ffprobe` identified all
six as mono MP3 at 44.1 kHz, and ffmpeg fully decoded each without errors. Output
loudness and true peak were measured after MP3 encoding; a normalization target
is not an exact measurement of the resulting compressed file.

Checks compared every original manifest entry to `HEAD` and every original MP3
to its Git object hash: all were unchanged. The generated `sounds.json` and
shared TypeScript catalogue contain the same sixteen IDs.

These are technical checks. The owner should use Listen to judge the cuts,
balance, background voices and whether the recordings suit the place; no human
listening approval is claimed here.

## Rebuilding only these recordings

```sh
node scripts/fetch-sounds.mjs --only coastal-gulls,gentle-breeze,summer-cicadas,bicycle-bell,cafe-dishes,harbour-boat
```

`--only=id,id` is also supported. Unknown IDs fail before network or file writes.
The selected run preserves unselected audio and manifest entries. Originals stay
in the existing gitignored `.cache/sounds/` directory.

On this development machine, IPv4 requests timed out while IPv6 worked. Node
used `--dns-result-order=ipv6first --no-network-family-autoselection`; for
intermittently failing original downloads, `curl -6` retrieved the exact official
URLs and the source SHA-1 was checked before caching. The local Homebrew ffmpeg
needed the following environment variable for that process only:

```sh
DYLD_LIBRARY_PATH=/opt/homebrew/lib:/opt/homebrew/opt/freetype/lib:/opt/homebrew/opt/gettext/lib
```

No system library, global configuration or project dependency was changed.
