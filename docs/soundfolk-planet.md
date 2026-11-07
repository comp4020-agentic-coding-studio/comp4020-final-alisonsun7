# Soundfolk: a little world made through sound

The new edition is `/planet`. The coastal edition remains at
`/scene/seaside?mode=weekday`. Both use the same browser identity and database,
but each has one separate room and coordinate system. Old sounds are never
copied or reinterpreted on the globe. The name, architecture and controls follow
ADR [024](decisions/024-soundfolk-planet.md).

## What people do together

| Place | Actual interaction |
| --- | --- |
| Listening green | Meet, talk within 12 metres, leave a sound and answer a friend's contribution. |
| Pocket jam stage | Combine chosen guitar, music and hand claps; nearby residents sway to actual public sources. |
| Tea house | Gather around cups and conversation, with warm local light after dark. |
| Reading nook | Make a quieter sound corner beside books and a bench. |
| Rain conservatory | Combine water, birds and rainstick; public source families colour the flower beds. |
| Tide pools | Mix optional waves, gulls and a passing boat. |
| Lantern workshop | Nearby public sources colour individual lanterns. Removal changes the real shared mix. |
| Restrooms and showers | One occupant at a time; human stay sounds end on exit. Invite a resident for a visible lock/flush test. |
| Other-side lookout | Visit the far side, then walk back around a world without edges. |

These activities use chosen sounds, replies, conversation and movement. The
books, telescope and furniture are authored scenery, not separate multiplayer
minigames or a furniture editor. No automatic preset fills the world.

## Looking and walking

Third person shows the real joined player with a blue scarf/pin and YOU label.
Other players retain their names and blue role styling; original residents use
ochre identification and NPC labels. Clothing and coats have coordinated seeded
variation. Stand still and drag to inspect your own character, including its
front. Use the plus/minus camera controls to get closer or see the globe.

Switch first/third person in the header or press V on the focused world.
WASD/arrows walk, dragging looks, and clicking ground sets a cancellable walking
target. Phone arrow controls offer the same movement without a keyboard. Native
dialogs pause movement and retain focus. Both remembered pointer conventions
remain available at arrival and under Help. Camera mode does not change sound,
position, room or contribution history.

The old coast also offers a remembered third-person view under its Tools.
Both cameras shorten their boom against solid architecture. Night figures use
local indoor warm fill rather than a second whole-world dark tint; outdoors
remains cooler and darker. Weather and time are explicit shared edits per room.

## Test the restroom without a second person

1. Open **Places & friends**, expand **Restrooms & doors**, then choose
   **Test with a resident**. The coastal edition has the same action in Tools.
2. The page takes you to a safe observation point. Rowan visibly walks to the
   room, reserves entry, closes the door, uses it, flushes and leaves.
3. During the red light, try to walk through the door. Both local collision
   and the server reject a second occupant. Watch the live occupancy readout.
4. Wait for the green light, then enter. The private room offers its stay sound
   in the coast; on the planet the restroom section has **Flush for this stay**
   or **Run shower for this stay** while you are inside.

For two humans, use another browser or an incognito window with a different
nickname. One enters; the other waits outside. Two tabs sharing one cookie are
the same player. Leave the first player inside while the second tries the door,
then leave and verify the second can enter. The server resolves simultaneous
entry, expired positions and NPC reservations. An NPC waits if a human is inside.

NPC routines are transient server state, never joined people, public sounds or
database rows. Only an actual near, current flush token can play the existing
recording; Sound off and hidden pages stay silent. Automatic visits happen
slowly while the room has listeners. The explicit invitation avoids waiting.

## Geometry, synchronization and rollback

This is original procedural Three.js geometry. The Little Ritual example
inspired the small inhabited sphere, not copied models or a claim of identical
art. A 22-metre sphere uses great-circle movement with heading transport;
server chat, spacing, crowding and removal use the same spherical distance.
The longitude seam and poles are traversable. Architecture uses tangent-plane
collision coordinates; curved ground patches are subdivided above the surface.

Shared decorations sort sources by server timestamp/id. Resident choices and
phases use a real server time anchor, even if a visitor's computer clock is
wrong. Explicit audio supports at most eight nearby sources; pending decodes
cannot bypass this budget or revive removed sounds. Private previews stop at
five seconds. Delayed placement confirmations preserve newer drafts and manual
sound choices. No new runtime dependency or external asset was required.

`before-soundfolk-planet-2026-11-07` preserves the previous source; ignored
`.cache/planet-baseline/dist` preserves its compiled output. Rollback replaces
application files with the **current** database, never an older database copy.
The older catalogue simply does not offer the planet room; its rows stay intact.
See the evidence log for the actual test, rendering and preview checks completed.

Reviewed captures of the actual running edition:
[globe](screenshots/24-planet-overview.png),
[your character](screenshots/24-planet-self.png),
[indoor night light](screenshots/24-planet-night-tea.png),
[phone](screenshots/24-planet-phone.png),
[individual sound ideas](screenshots/24-planet-sound-library-phone.png) and
[occupied restroom](screenshots/24-planet-restroom.png).
These are scratch sessions; no demonstration sounds were planted in the
working preview. The [verification record](evidence/soundfolk-planet-2026-11-07.json)
distinguishes the real two-person checks from the coastal silent view fixture.
