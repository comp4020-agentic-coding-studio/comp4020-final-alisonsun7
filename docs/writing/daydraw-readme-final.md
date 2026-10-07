# DayDraw

## Plan a day together

DayDraw is for two to twelve friends choosing an outing. Group chat can hold suggestions while leaving one person to organise them and press for a decision. DayDraw distributes the initial thinking across WHERE, EAT and DO, then gives the group a finite route from ideas to a saved plan. Its purpose is a useful shared decision, rather than a longer conversation.

## What good means

Good means participation is lightweight, progress is visible, and decisions are recoverable. Join by room code and nickname. A responsibility card encourages attention to one category without restricting anyone’s view or contribution. Two people can cover all three categories; empty seats never become a reason to wait for twelve.

Everyone can see the shared board changing. Saving, failure and reconnecting have distinct meanings, so an unfinished request does not appear completed. Returning should recover the room, confirmed choices and current stage, including a finished itinerary. The browser remembers access; the server retains the actual work.

## Sources and a position

Robin Sloan’s [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/) makes small-group usefulness a credible measure of software’s value. DayDraw adopts that scale while needing clearer onboarding than an application for a known family. A stranger invited to one outing should still understand where to begin.

Aurora Harley’s [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) informs the feedback around saving and progress. I extend that direction to visible vote totals: the group can see where a decision stands. Visibility also has costs. Totals may encourage conformity, and hiding voter labels cannot prevent inference in a two-person room. The interface limits public attribution; it does not establish that social pressure has disappeared.

## A finite shared decision

Members suggest and support ideas. Each category enters voting with two to four candidates; when more exist, support totals choose four, with earlier proposals breaking equal support counts. That rule is simple and inspectable but favours early contributions when support is equal.

Voting proceeds through WHERE, EAT and DO. A participant can change their confirmed choice until a round closes. Totals are public; names attached to choices are not. Any eligible member can close when everyone has voted. After sixty seconds, a member may explicitly close with missing votes if at least one vote exists; the result is labelled partial. This prevents an abandoned session stopping the group, at the cost of completeness.

A tie receives one revote among tied options. A repeated tie is resolved by one saved draw, identified in the result. Once finished, the plan is read-only. These limits favour reaching an honest, recoverable outcome over endless rounds.

## Promises and judgement

Checks should enforce distinct identities, capacity, durable data, live updates, one vote per round attempt, bounded transitions and immutable results. Keyboard, mobile, slow-network and reconnect behaviour need actual verification. Whether the task feels welcoming and the resulting plan is worth using requires human judgement, not a green test count.

There is no chat, venue recommendation engine or account system. Room codes invite access rather than guarantee confidentiality; clearing browser data may lose identity recovery. Avoid sensitive information. The app helps friends decide, while leaving the meaning of a good outing to them.
