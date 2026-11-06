# ADR 014: Find, listen to, and follow people's sounds

## Status

Accepted, 2026-11-06. The project owner requested more sounds, a more polished
Three.js interface, and useful additions that keep the product focused. When
asked about natural or everyday sounds, they asked for both.

## Decisions

1. **The sound library serves the same action.** Search and sound-family
   filters help people find a recording. Sounds suited to the current zone
   appear first, but every sound can still be left anywhere. Listening is
   private; only choosing Leave it here writes to the shared place.
2. **Browsing has one focus scope.** A native dialog contains the library,
   closes with Escape or Close, and exposes search, selected filters, loading,
   Stop, empty results and inline placement failures. Opening releases held
   movement and click-to-walk targets; the world keeps rendering while the
   person browses. Closing returns to the view without scrolling the page.
3. **A late preview cannot surprise someone.** Switching, closing, filtering,
   or hiding the tab invalidates a preview that is still loading. Short calls
   preview from their beginning, so the bicycle bell's quiet interval does
   not hide its call. Rapid duplicate placement clicks are disabled while the
   server is answering; failures stay visible inside the dialog.
4. **Following a sound is an invitation to explore.** The optional Listen
   around you panel lists the nearest three contributions within the existing
   hearing distance, with their names, authors, distance and relative
   direction. Face sound turns the view without moving the person. It is
   collapsed on small screens, and neither adds a new server API nor stores
   additional data. Private-stay sounds do not expose an author in this panel.
5. **Motion says something about sound.** Shared ring geometry adds a floating
   anchor to nearby sound lights. A small spreading ring means that this
   listener is actually playing that sound; it is not an audio amplitude
   meter. Distant waves are hidden, reduced motion keeps the marks still,
   and removing a mark releases its individual materials. No postprocessing
   pipeline or additional runtime dependency is needed.
6. **The world remains the main surface.** A coastal green frame, warm primary
   action and clearer light labels surround the existing place. The existing
   family colours have matching text labels. The library and its controls
   fit phone screens and retain visible keyboard focus.

## Sounds and existing contracts

Six CC0 or public-domain recordings extend the existing ten; their provenance,
checksums and processing are in `public/assets-manifest.json` and
`docs/sound-library-2026-11-06.md`. The bell includes a quiet interval so it
does not ring rapidly when the ordinary spatial player loops it. These are
choices for people to leave, not an automatically populated background bed.

ADR 011's placement, reach, crowding and persistence rules remain in force,
as do ADR 012's single Sunny Day / database room named `morning` and ADR 013's
private-stay behaviour. No score, ownership system, weather mode or recording
feature is added.

## Checks

- Existing HTTP specs cover static module imports, audio files and source
  licences, server validation, persistence snapshots and real-time changes.
- `e2e/sound-discovery.mjs` covers search and filters, focus containment,
  movement while browsing, preview cancellation during a delayed download,
  Stop, short-call preview offset, placement failures, another person's
  discovery list, turning without teleporting, and a 375 px phone layout.
- `e2e/leave-a-sound.mjs` follows the catalogue's actual size rather than
  assuming that there will always be ten sounds.
- Desktop and phone screenshots must be viewed. Technical audio checks do
  not establish whether the recordings sound good together to a person.
