# ADR 013: Toilets and showers, one person at a time, with their sound

## Status

Accepted, 2026-11-06. Adds to ADR 011 a second kind of sound: one that
lasts only while its person is inside a toilet or shower.

## Context

Wen asked that when someone goes into a toilet or shower, the light outside
turns red; that someone else coming up is told it's taken and to wait; that
whoever is inside is asked whether to leave a flush or shower sound there;
and that the sound goes by itself when they come out.

ADR 011's sounds stay until someone removes them, and nothing fades. A
flush that outlived the person who pulled it would make no sense, so this
sound is tied to being inside, not to anyone removing it.

## Decisions

1. **The huts are shared.** `src/shared/huts.ts` holds where the five huts
   and their doors are, so the server can tell who is inside which
   (`hutAt`). Toilets and showers are private; the shop isn't.
2. **Taken is seen by everyone, from where people stand.** Positions are
   already shared (ADR 007), so each page works out who is inside each
   hut. A private hut with anyone inside shows a red light by its door
   (green when free) and stays shut, so nobody sees in; it opens only when
   whoever is inside comes within 0.9 m of the door to leave. To anyone
   else it's locked: the doorway is solid.
3. **Waiting is told, once.** Coming within 2.3 m of the door of a private
   hut someone else is in says so, and to wait for the green light. It
   isn't said again until you've walked off (3.5 m).
4. **Inside, you're asked.** Going into a toilet or shower (or arriving
   already inside) asks whether to leave its sound (toilet flushing,
   someone showering) while you're in. `POST /api/sessions/:id/sounds`
   with `whileInside: true` is refused unless you're standing inside a
   private hut (`not_inside`), for any but that hut's sound
   (`bad_request`), or if you already have one (`already`). ADR 011's room
   rules don't apply: it can't outstay you.
5. **It goes when you do.** The row records the hut (`placed_sounds.while_in`,
   a column added to the existing table; no row changed). The server ends
   it, for everyone, as soon as you are no longer in that hut: a move
   outside it, leaving the place, or 20 s without a move. After a restart
   nobody is inside, so any left over are ended on start. Ending sets
   `removed_by` and `removed_at` like any removal; nothing is deleted. The
   stream's `sound-removed` carries `left: true`; only its person is told
   ("Toilet flushing stopped as you came out"), and others aren't told when
   such a sound starts either.

## How it is checked

- `spec/world.test.ts` ("a toilet's flush lasts only while you're
  inside"): refused outside, refused for the shower's sound, refused a
  second time; kept while moving about inside; ended for a watcher, with
  `left: true`, on coming out. Without the server ending it on the way out
  the test fails.
- Two browsers (not yet a committed e2e): Ada, arriving inside, is asked
  and leaves a flush; Bo at the door is asked to wait and hears it, with a
  red light and a shut door; when Ada goes, it goes from Bo's page, the
  light turns green and the door opens for him.
