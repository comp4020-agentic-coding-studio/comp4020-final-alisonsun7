# DayDraw

## Plan a day together

DayDraw is for a small group of friends trying to organise an outing. A group chat can hold many suggestions while leaving one person to turn them into a plan. My aim is to distribute that initial thinking without requiring everyone to become an organiser. The intended group is two to twelve people: large enough for different preferences, small enough for each contribution to matter.

## What good means here

For DayDraw, good means participation is lightweight, contribution is visible, and shared work is recoverable. A visitor should understand the purpose, enter a room and leave a useful suggestion without creating an account. The room divides ideas into WHERE, EAT and DO. A drawn card names the category someone is encouraged to think about; it does not restrict what they can see or suggest. This distinction matters when one category needs help, particularly with only two people.

Good also means making modest promises honestly. An unfinished decision process should not masquerade as a completed itinerary. The first version collects and remembers suggestions. Its visible board gives a group something to discuss, but saving an idea does not mean the group has agreed to it.

## Why this scale and feedback

Robin Sloan’s [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/) describes software made around the needs of a particular small group. I take this as an argument for judging DayDraw by how it helps one gathering, rather than by growth, engagement or an expanding feature list. Unlike Sloan’s family app, DayDraw must also welcome someone who has never used it before. Its small scale therefore needs explicit invitations and understandable instructions.

Aurora Harley’s [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) informs my treatment of saving and returning. DayDraw should distinguish a request being sent from an idea actually stored. A returning visitor should find their room and contribution, not wonder whether the last action counted. The card can add playfulness, but clear feedback matters more than its animation.

## This first version

Create a named room, share its code, and join using a nickname. Draw a responsibility card and add suggestions to any of the three categories. Saved ideas belong to the shared board. Another visitor joining, adding an idea, or starting the room now reaches your screen on its own, through a background connection the page labels Live or Reconnecting — only while it is actually open, never claimed ahead of one. A plain reload still works the same as before, with or without that connection. Returning in the same browser should offer a route back to the room. Browser storage remembers your room credential; the server database stores the actual work. Clearing browser storage loses that automatic identity recovery.

## Promises and judgement

Checks should enforce the twelve-person limit, separate participant identities, stable balanced roles, saved suggestions after restarting storage, and access to every category. Manual review must establish whether a newcomer understands their next action, whether mobile and keyboard use feel clear, and whether the card invites participation rather than pressure. Passing automated checks alone cannot establish those qualities.

## Deliberate limits

There is no chat, account system, venue recommendation engine or completed voting flow in this version. Nicknames and suggestions are visible to room members; the room code is an invitation, not a promise of strong confidentiality. Do not submit sensitive information. Keeping this first step small lets the group’s own ideas remain the point of the app.
