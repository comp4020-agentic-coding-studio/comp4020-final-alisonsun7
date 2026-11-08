# ADR 033 — Neighbours have a day

Date: 2026-11-08. Status: implementation in progress; not yet a release claim.

## Request and direct observation

The author asks to save the work to Alison's final repository without making
it public, and says residents remain stiff, without independent activities or
recognisable conversation. Direct inspection of the running 3D café confirms
the limitation: most figures stand around the source rather than behaving
together. The old controller approaches a source once, within 1.1 m over three
seconds, then holds that position indefinitely. Without a source it returns
home. Persistent sources suppress the small café idle layer, and the nearby
work layer can replace every walking pose with a standing pose.

The destination currently configured as origin is already public. Private
branches do not exist inside a public GitHub repository. Read-only SSH
authentication identifies Alisonsun7, but does not establish permission to
change repository visibility. No remote push or visibility change is inferred
from the ambiguous request; a concrete privacy clarification is pending while
local implementation continues.

## Decision

Reuse the existing named residents, three.js rigs, world, identity and sound
systems. Add short authored daily routes, stops and paired conversation. The
same server-time sample and source list must give the same activity to a late
arrival. No random local simulation, AI chat service, fabricated public source,
additional human identity or database migration is needed.

New real sounds retain their initial attention window. Longer-lived sounds
remain part of the resident's day rather than freezing their entire life:
periodic listening, swaying or watching alternates with ordinary activity.
Conversation has distinct speaking and listening turns, mutual orientation,
small hand gestures and nods. It does not emit invented player messages or
start background voices. Shared-work gestures must yield to actual walking
and conversation rather than making moving bodies glide in a standing pose.

Author café routes around the actual counter, tables, chairs, menu and wall
openings. Building admission alone does not detect furniture. NPC-specific
clearance supplements it without changing player collision or historical
sound coordinates. A blocked route must remain safely stationary; reduced
motion uses a still authored position and pose.

## Scope and tradeoffs

This is a small, legible behaviour vocabulary, not an autonomous needs or
dialogue simulation. Preserve the separate authoritative restroom routine and
shared lock; no new toilet visitors or queues are introduced. Keep the old
coastal resident controller unchanged unless its optional daily-life contract
is explicitly enabled. Prioritise 3D café readability and the existing core
sound interactions rather than adding more residents or destinations.

Actual candidate checks, visual captures, failures and local-preview delivery
will be appended after execution. Motion snapshots alone cannot establish
whether unfamiliar players find the world alive or understand its causality.
