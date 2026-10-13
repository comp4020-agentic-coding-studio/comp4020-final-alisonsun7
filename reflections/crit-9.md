# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was looking at the deployed page myself instead of trusting
the green checks. The first version passed CI, answered 200, and passed every
test. The agent told me it had opened it in a browser, and the page showed no
grid at all: two JavaScript files it depended on were 404ing. Every test
checked what the server sent, and none checked what a browser could actually
run. Once I said "the grid isn't there", the cause took two commands to find.

That moment also changed how I directed the rest of the work. I stopped
handing over a one-line idea and wrote a full design: which way the grid
plays, which state is shared and which is personal, how identity works. That
exposed a second problem I'd missed. I had chosen "each person plays
locally", but the first build ran one global clock. A more precise brief made
the mismatch visible.

## What did this work change about who I want to be as a software developer?

I used to read a green check as "done". Now I read it as "the things I
thought to test are fine". The broken client wasn't a hard bug. It sat in
exactly the gap between what the tests looked at and what a person sees. I
want to be the developer who opens the thing and uses it before saying it
works, and who turns each miss into a test, so the same gap can't open twice.

I also want to own my answers. When I say "local playback", that decision
should survive into the code. Checking the build against the decisions I
actually made is my job, not the agent's.
