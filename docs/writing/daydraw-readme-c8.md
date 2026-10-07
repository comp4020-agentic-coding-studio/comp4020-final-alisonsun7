# DayDraw

## A shared starting point

DayDraw helps a small group of friends begin planning an outing. A group chat can contain many suggestions while leaving one person to collect and organise them. This project distributes that initial thinking across WHERE, EAT and DO. It is intended for two to twelve people, with a useful first contribution possible before anyone else joins.

## What good means

Good means participation is lightweight, contribution is visible, and shared work is recoverable. A newcomer should understand the purpose, enter a room using a nickname, and add an idea without creating an account. A responsibility card encourages them to think about one category. It does not prevent them from reading or contributing to the others. With only two people, the remaining category is a shared responsibility rather than an unavailable part of the app.

This is also a standard for honest feedback. “Saved” must mean the server has stored the idea. A failed request should preserve what someone typed and offer a useful next step. A saved suggestion is a contribution, not evidence that everyone has agreed to it.

## Sources and alternatives

Robin Sloan’s [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/) argues through a family application that software can be worthwhile at a very small scale. DayDraw adopts that scale as a design constraint: success would be helping one group make progress, rather than attracting more users or adding reasons to remain on the site. Its audience differs from Sloan’s known family, however. Someone invited for the first time still needs clear instructions and an understandable way in.

Aurora Harley’s [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) informs the distinction between sending and saving an action. I apply that principle to the idea form, room stage and return path. A playful card should help someone begin; its appearance should not obscure whether their work exists. These sources support a direction, but they do not establish that this particular interface is useful. That remains something to inspect with people.

## Using the current version

Create a room, share its code, or join using a code and nickname. Receive a responsibility card when you join, then add suggestions to any of the three categories. This first version collects ideas. Another participant refreshes the board to see the latest changes; it does not yet promise live voting or a finished itinerary.

Returning in the same browser should offer a route to the existing room and identity. The browser remembers access; the server database stores the work. Clearing browser data can lose automatic identity recovery. Room codes are invitations, not a guarantee of strong confidentiality, so avoid sensitive information.

## Checks, judgement and limits

Behaviour checks should protect capacity, separate identities, stable balanced roles, category access, retry-safe suggestions and data surviving storage restart. The full argument should appear at `/readme/`. Whether a newcomer understands the next step, enjoys the card and finds the board useful requires human judgement; passing tests alone cannot answer that.

There is no chat, account system, map or venue recommendation service. Keeping the first contribution small makes the group’s own ideas central, while preserving room for a later shared decision.
