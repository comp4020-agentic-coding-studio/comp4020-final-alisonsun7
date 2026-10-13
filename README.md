# SoundGarden

## Everyone contributes a note

SoundGarden is one shared 6×6 music grid. Pick a name, choose one of five
coloured notes, and tap a square. Everyone who has the page open sees your
note appear within about a second, and anyone can press Play to hear what the
group has made so far. The grid plays as a six-step loop: each column is one
beat, and every note in that column sounds together, so the six rows let
several people stack notes into chords.

The five notes are the C major pentatonic scale — C, D, E, G and A — so
whatever ends up in the grid sounds reasonably consonant. Nobody needs to know
any music to take part.

## What good means here

I hold SoundGarden to three principles.

**Anyone can make music.** A first-time visitor should go from the link to
hearing their own note in four steps: type a name, pick a colour, tap a
square, press Play. No account, no instructions, no music theory.

**Music belongs to everyone.** There is one grid, and everyone on it can add,
change or erase any note and switch the instrument. That's the point: the
app is more interesting when someone else is there, because their edits
change the music you're listening to while you listen. When two people change
the same square at the same moment, the server decides one order and every
screen ends up showing the same result — see
[`docs/decisions/001-simultaneous-edits.md`](docs/decisions/001-simultaneous-edits.md).

**Every contribution leaves a trace.** Notes and the instrument are saved in
a database on the server, so closing the tab, coming back tomorrow, or the
server restarting doesn't wipe the music. The activity list says who did
what, and so does the server's own log.

## Why this scale

Robin Sloan's [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/)
argues for software made for a particular small group rather than for
growth. SoundGarden is that: one garden, a handful of people, no rooms, no
profiles. A single shared space keeps the collaboration visible: everyone is
always looking at, and changing, the same 36 squares.

Aurora Harley's [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/)
shapes the feedback. The grid shows your note the moment you tap; the
playhead lights up the column that is sounding; the corner says how many
people are actually connected right now, not how many have ever joined; and
the activity list explains why the music just changed.

## How it works

Your browser keeps one open connection to the server (server-sent events).
Every change — a note placed or erased, the instrument switched — goes to the
server, is saved, and is pushed to every open page as the full current state
of the garden. A page that loses its connection reconnects by itself and gets
that full state again, so it never shows a grid that's missing a change.

Playback runs in your own browser. Pressing Play starts your loop; it doesn't
start anyone else's. But the instrument is shared: if someone switches to
guitar while you're listening, your next beat is played on guitar. Likewise a
note someone adds is heard the next time your playhead reaches it — you
never have to press Play again to hear the group's latest edit.

The three instruments — piano, guitar and saxophone — are synthesised in the
browser with the Web Audio API. They are recognisably different, not
realistic: there are no recorded samples, which is also why a switch takes
effect on the very next note.

## Promises and judgement

The automated checks hold the promises above to account: a second person's
open page sees a placed note, an erased note and an instrument switch within
a second; two people writing the same square at once end up with the same
result; two people with the same name are still two people; a request can't
claim to be someone else; bad input is refused; every script the page loads
actually loads; and the garden survives a server restart.

Whether it *feels* like making music together — whether a stranger gets from
the link to a sound without help, whether Bob's instrument switch lands as a
pleasant surprise or an annoyance — is a judgement for people trying it side
by side.

## Deliberate limits

There are no accounts, passwords, rooms, chat, saved songs or undo. Your
identity is a random session cookie in this browser; clear it and you'll join
as someone new. Anyone with the link can change or erase any note, including
yours — that's the design, not an accident. Each person's playback runs on
their own clock, so two people pressing Play at different moments hear the
same music offset in time. Nicknames are visible to everyone, so don't use
anything you'd rather keep private.
