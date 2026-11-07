# Your harness

# Little Chorus agent rules

The design pack in `design/sound-of-a-city/` (start with its `CLAUDE.md` and
`START_HERE.md`) was the starting point. The decisions in `docs/decisions/`
record where the build went from there: 004 to 007 the walkable place, the
CC0 assets, the forest and sea, seeing each other and talk; 010 took the old
sound out; 011 is Wen's new sound design; 012 keeps only the sunny day;
013 makes the toilets and showers one person at a time, with a sound for
while they're in; 014 adds the searchable sound library and nearby listening
  guide; 015 records configurable look, authoritative hut admission and the
  explicitly requested local guitarist; 016 adds durable sound replies and
  017 records the coastal art direction; 018 adds shared weather, a clock and
  scenic destinations; 019 develops Wen's selected Quiet Light art direction
with an explicit rollback point; 020 rebuilds the D reference composition
after the first art result was rejected; 021 records the asset-led correction
after the second rejection (003, 008 and 009 are history).
ADR 022 records Wen's current priority: coherent, harmonious and distinctive
style serving shared sound-making and playful human interaction. D remains an
atmosphere reference; cinematic fidelity is no longer the product goal.
ADR 023 develops the current request: friends shape cozy and lively corners
through multiple suitable sounds, with deterministic visible NPC responses and
a cohesive painted world. It authorizes new optional recordings and replaces
the original design-pack priority for realistic adult character proportions.
Read them before changing behaviour. Explain progress to Wen in Chinese; the
UI, code, commits and repo docs are English. README.md, PROCESS.md,
reflections and the research note remain Wen's personal account. The explicit
2026-11-07 brief (ADR026) now permits clearly labelled evidence-bound drafts;
never invent beliefs, listening verdicts, playtest observations or retrospective
reflections. Preserve original historical reflections and mark author inputs.

ADR 024 records the explicitly requested Soundfolk planet edition. Its `/planet`
route has one new `planet:morning` room, spherical movement and distances, while
the original `seaside:morning` room and its entire history remain unchanged.
Camera modes and mood filters never create rooms. The product-facing title is
Little Chorus (Wen's selection in ADR 025); existing storage paths, cookie/account setup and deployment identity
are retained. NPC restroom visits use the same authoritative occupancy gate as
players, but never create users, presence counts or ordinary sound rows.

## What it is

ADR026 is the current priority: two to six friends without musical training
answer real sounds to grow a recognisable lasting work. Finish Listening Green
before expanding scope. Pocket Jam and Reading Nook have distinct purposes;
the other destinations remain exploration. The activity camera, curated three
choices, original72BPM compatible parts and source-derived kinetic sculptures
supersede old UI/catalogue/raw-loop assumptions. They never supersede identity,
explicit placement, durable replies, tombstones or original coordinates.
`shared/chorus.ts` projects works from real public contribution history.
`sessions.chorusWorks` sends authoritative works in snapshots and sound events.
Distinct participant IDs on a live cross-author reply unlock the shared form;
same-cookie tabs, NPCs and the local companion cannot. Removed endpoints stay
in records but lose live effects. No separate mutable work store or schema is
required. `client/chorus-studio.ts` provides invitation, recommendations and
source-complete works; `client/chorus-garden.ts` draws actual kinetic carriers.
Local sound/volume/focus never changes the shared work or automatically unmutes.
Original musical PCM and licensed recording sources must remain documented.
Automated timing/peak checks cannot establish pleasantness. Keep developer
self-test, automation, real unfamiliar pairs and artistic judgement separate.

Little Chorus. Friends shape little places together through sounds. The new
`/planet` edition is a freely walkable sphere with first-/third-person views,
nine meeting destinations and one independent `planet:morning` room. The
original coastal edition remains available in its original room, From
the Forest to the Sea: a forest trail, a creek and footbridge, a boardwalk
with a café, fish and chip kiosk and beach huts, the beach and a pier. Built from CC0 assets, with original three-dimensional cat and dog figures for
the people in it, who see each other and can talk when they meet, and
leave sounds where they stand for everyone to hear (ADR 011).

The original place (`seaside`, three.js, shared weather and clock: ADR 018) keeps its history. Its
`PlaceKit` is in `client/seaside.ts` (the café's room in `client/cafe.ts`);
the toolkit in `client/world-build.ts`; original people in `client/characters.ts`;
the view in `client/world.ts`; the
sounds people leave in `client/soundscape.ts`, with the sounds on offer and
their rules in `shared/sounds.ts`. The library is in
`client/sound-library.ts`, and the optional nearby guide in
`client/listening-trail.ts`; browsing and turning towards a sound never
place it or move the person.

Sound replies (ADR 016) connect new ordinary contributions, with a contextual
library, a cancellable walking intent and `client/sound-conversations.ts`.
Relationships and operation keys persist in additive tables; removing a sound
keeps its relation metadata and never revives either endpoint. Private-stay
sounds cannot join public conversations. Never automatically resend a draft;
reuse its operation key on explicit retry. Observed removals outrank late ACKs.

The shared sound entry and public contribution drawer are in
`client/shared-sound-place.ts` (ADR 022); nearby live public reply threads are
in `client/sound-connections.ts`. Public counts/activity exclude private stays.

Sound-driven NPC choices are in `shared/sound-response.ts`, their safe movements
in `client/sound-residents.ts`, and integration in `client/world.ts`. Feed them
the canonical contribution list; use anchored server time for selection/phase.
Local sound preference and the viewer's position must never select a different
resident response. The busker, staff and existing children's game keep their
roles; reacting residents are clearly NPCs, never counted as joined people.

The planet controller is `client/planet.ts`, spherical view/camera in
`client/planet-world.ts`, original geometry in `client/planet-build.ts`, and
optional playback in `client/planet-audio.ts`. `shared/planet.ts` is the same
great-circle metric used by server chat, spacing and removal. Never replace it
with a raw longitude difference: proximity must work across seams and poles.
Every source-derived shared decoration uses canonical timestamp/id order.
Anchor time from the first real server sample, independent of client Date.now.
NPC restroom state is in `npc-routines.ts`, wire types in
`shared/npc-routines.ts`. `client/routine-audio.ts` plays only the actual
server-timed flush token, near the listener, with Sound off/visibility guards.

ADR 025 records Wen's rejection of the first sphere's lost play and sparse art.
Keep Shift running, Space jumping, touch equivalents and the interactive
kangaroo. `client/planet-locomotion.ts` uses collision substeps; optional
`Position.motion` shares bounded transient poses, never contribution positions.
The server lands stale poses after 450ms without new samples. The kangaroo
in `client/planet-wildlife.ts` is a clearly identified local companion, not a
shared human or a fabricated source of public sounds.

`client/planet-sound-interactions.ts` exposes real authors and direct Respond
actions in the world. Pins must retain reachable alternative placements when
labels collide. `client/planet-connections.ts` draws actual public reply arcs
over the sphere. Conversation browsing reuses `client/sound-conversations.ts`.
Wait for native dialog close handlers before starting a walk; manual movement
or cancellation must not reopen a chooser later. A paused chat remains paused
after other dialogs close. No interaction automatically publishes a sound.
`client/planet-coast.ts` provides the real ocean, beach and raised pier.
The land loop remains continuous; water has a genuine walking boundary.
Preserve existing source positions and access when authoring shorelines.

## Product invariants

- **The standard (Wen):** suits people playing together; keeps what they do,
  so tomorrow shows today's changes; what others change, you see.
- **Sound is Wen's design (ADR 011).** Sounds are left where you stand and
  removed from beside them; only the room rules in ADR 011, no owners or
  quotas; no background bed; nothing fades. Wen now explicitly requests more
  suitable optional sounds and resident responses (ADR 023); keep every sound
  individually auditionable and explicitly placed. Wen explicitly requested
  restoring Mateo's nearby guitar: that one NPC has local spatial audio,
  respects Sound off, and yields to a nearby player guitar; it never creates
  a contribution or database row. ADR 024 also authorizes a nearby transient
  NPC flush, only during its real server-timed restroom visit. The tables from before
  ADR 010 stay untouched (`before-sound-removal` tag); `placed_sounds` rows
  are never deleted (removing sets `removed_at`).
- **Toilets and showers are one at a time (ADR 013).** A red light and a
  shut, locked door while anyone is in; the sound left for a stay
  (`whileInside`, `placed_sounds.while_in`) is ended by the server as soon
  as its person isn't inside, never by the page. The hut layout lives in
  `shared/huts.ts` and `shared/planet.ts` for both sides. The server admits
  only one occupant, including NPC reservations;
  rejected moves return a safe position. Expired positions cannot be revived
  inside an occupied hut. Temporary sounds do not consume permanent slots.
- **Imagined places say so (ADR 005).** The place's page shows its `about`
  text: not a real place, and where its pieces come from.
- **Only CC0 or public-domain assets, all recorded.** Models, surfaces and
  skies come from Poly Haven via `scripts/fetch-assets.mjs` (MD5-checked);
  sounds from Wikimedia Commons via `scripts/fetch-sounds.mjs` (SHA-1
  checked, needs ffmpeg); each is in `public/assets-manifest.json`. Never
  add an asset that isn't CC0 or public domain, or whose site refuses
  scripted downloads; never get around such a refusal (so not YouTube).
  Wen explicitly authorized original generated materials on 2026-11-07.
  Record their prompt and provenance as original AI-generated work, never
  describe them as third-party CC0. External assets still follow this rule.
- **Published images are processed derivatives only.** `public/scenes/`
  (Wen's photos, blurred, no metadata) is unused now but stays. The
  originals are gitignored and must never be committed: this repo is public.
- **One room per edition (ADR 007, 012, 018, 024).** The explicitly requested
  planet edition adds only `planet:morning`; the original `seaside:morning`
  retains its history. Weather and time are shared within each edition,
  persisted visual state; the room keeps its database name `morning`
  (`Scene.room`), so never change it. The canonical route remains `weekday`;
  retired modes redirect there. Scenic destinations move only the visitor who
  chooses Go here. They do not split people or sound history into new rooms.
- **The shared sky (ADR 018).** `shared/environment.ts` defines four weathers
  and the server-anchored 24-minute clock. Apply is explicit and revision-checked;
  dirty drafts survive interruptions without automatic retries. Same-revision
  acknowledgements never rewind running clocks. No weather audio starts by
  itself. `client/environment-panel.ts` controls it and offers scene destinations.
- **People see each other and talk when they meet (ADR 007).** Positions and
  words live in memory only; words go only to people within 12 m, appear
  over the speaker for 5 s or until replaced, and low in each listener's
  view for 8 s (the speaker may be out of sight), and are never stored or
  logged (the log has who spoke and how many characters).
- **Joining:** a name and a cat or a dog, from the arrival card (in place,
  `POST /join` answering JSON) or the explore page's form. Identity comes
  from the HttpOnly `soac_session` cookie (DB stores its SHA-256 hash),
  never the body.
- **Persistence.** `/data/sound-of-a-city.db` on the Fly volume. The old
  SoundGarden `garden.db` is left alone. Never delete or reseed on start.
- **Logged.** One `[time] INFO event key=value` line per action, with user
  id and nickname.

## Engineering constraints

Plain `node:http`, `node:sqlite`, SSE, TypeScript compiled with `tsc`; two
runtime dependencies: `marked` (for `/readme/`) and `three` (served from
`node_modules` at `/vendor/three.module.min.js`, loaders at
`/vendor/addons/`, both via the import map). Assets are served only from
`public/assets/{models,textures,skies,sounds}` by pattern. Validate what people
send on the server (positions finite and bounded, words cleaned and cut to
120, rate limits). Escape nicknames in HTML and in embedded JSON; set them
with `textContent` in the client.

Pointer dragging defaults to Follow pointer: down looks down, left looks left.
Arrival offers that and Drag the scene, which reverses both axes. Controls can
change the preference, stored in this browser. Keep both axes consistent and
release movement while Controls is open (`e2e/look-controls.mjs`).

Every file the browser loads must be in `STATIC` in `src/server.ts`;
`spec/pages.test.ts` follows every import from every page script.

Keep the Fly app, single machine, 256 MB and `/data` volume as configured.
Pushing to `main` deploys (the repo is public): don't merge or push to main
without Wen's go-ahead.

## Checks and evidence

- `pnpm check` runs `spec/` against the app at `APP_URL`.
- `pnpm build && pnpm e2e` runs `e2e/world-two-browsers.mjs` (Go to,
  walking, the footbridge, the kangaroo) and `e2e/meet-and-talk.mjs`
  (seeing each other, talk, joining from the arrival card) and
  `e2e/leave-a-sound.mjs` (leaving, hearing and removing sounds), each
  in two Chrome sessions on the GPU (`--use-angle=metal`): in software
  rendering the place runs at well under 1 fps.
- `e2e/sound-discovery.mjs` checks library search, filters, modal keyboard
  behaviour, delayed-preview cancellation, short-call previews, nearby
  contributions, turning without moving, and the phone layout. It also
  runs as part of `pnpm e2e`.
- `e2e/look-controls.mjs` checks both axes in both remembered look modes,
  arrival choices and Controls focus. `e2e/huts.mjs` uses two browsers for
  locked doors, delayed rejection recovery, flush/shower playback and release.
  `e2e/busker-sound.mjs` checks actual NPC audio output and its lifecycle.
  All three run in `pnpm e2e`; use a scratch database for browser tests.
- `e2e/cooperative-play.mjs` exercises two contributors, walking with a reply
  intent, explicit retry, late arrival, removed-source recovery and phone HUD
  layout. `e2e/cooperative-ack-race.mjs` checks visitor reads and delayed ACKs,
  including a genuinely missed removal recovered through a new SSE snapshot.
- `e2e/environment.mjs` checks shared weather and clock SSE, explicit Apply,
  dirty/conflicting drafts, interrupted requests without automatic retries,
  late acknowledgements, same-room scene travel with lasting contributions,
  reduced motion and phone/landscape keyboard layout. It is part of `pnpm e2e`.
- `e2e/quiet-light.mjs` checks the actual 3D rigs, grounded sound cues, lamp
  rendering and aligned-source labels (including reachable phone actions) in a
  silent fixture with no database writes. It is part of `pnpm e2e`.
- `e2e/shared-sound-focus.mjs` uses two real identities for the shared entry,
  public counts/authorship, explicit listening, reply threads, private-stay
  exclusion, visit-scoped activity, removal/reconnect and phone/focus handoffs.
  Its cleanup verifies the actual snapshot contains none of its live ordinary
  sounds. It is part of `pnpm e2e`; never run it on the working 18861 preview.
- `e2e/living-sound-world.mjs` checks the eighteen individual sound choices,
  decoded private previews, actual two-person resident reactions, late arrival,
  removal, mixed corners, Sound off, phone controls and private-stay exclusion.
  It soft-removes its ordinary contributions and confirms the final snapshot.
  Use an isolated scratch database; it runs in `pnpm e2e`.
- `e2e/view-mode.mjs` checks the real coastal self model, camera memory,
  idle body orientation, wall avoidance, indoor night fill and NPC privacy
  in a silent fixture. `e2e/planet.mjs` checks the real two-person sphere,
  nine destinations, camera/phone controls, replies, clock skew, shared weather
  and authoritative resident restroom visits. Both run in `pnpm e2e`.
- `e2e/chorus-play.mjs` covers real two-person running/jumping, a kangaroo
  encounter, visible author pins, direct responses and spherical threads,
  native conversation-to-walk handoff, travel cancellation, missed removals
  and reachable phone actions. It uses scratch data and verifies soft cleanup.
- `spec/planet-audio.test.ts` tests actual WebAudio lifecycles with fake nodes:
  cancelled decodes, off/on generations, removal, the eight-voice limit,
  five-second private previews and disposal. NPC admission and routine audio
  also have focused clock-controlled tests. Never run HTTP-writing specs and
  browser suites concurrently against the same scratch database.
- `SCENE=seaside SHOTS=forest,creek,forest-edge,boardwalk,beach,pier,counter node e2e/look-world.mjs <dir>`
  saves screenshots of those zones (`MODES=` for others).
- Keep `spec/invariants.test.ts` as shipped. Never weaken a test to get
  green. A new check should be seen to fail without its fix.

A green spec is not proof the page works: look at the screenshots before
calling UI work done. Commit continually as you develop (Wen's rule): each
verified step gets its own commit, never one large commit at the end, so
the history shows the work as it grew. Log prompts, failures and
corrections in `docs/evidence-log.md`. Report what wasn't run as not run
(Docker isn't installed locally). Keep secrets out of git and logs.
