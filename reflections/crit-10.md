# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was separating what is shared from what is mine, in the
repo and in the code. This week I tried a much bigger idea, Bloom, a 3D
floating garden, on its own branch while SoundGarden stayed live on `main`.
Bloom could fail safely. Every spec passed while its rock and soil were
invisible, and its click tests passed only because they clicked 34 px low.
None of that reached the people using the app.

On `main` I added two smaller things, and both came down to the question
this crit asks: who may see and change what? The welcome page shows a
visitor the live grid before they join, but no nicknames, and never counts
them as present. The new timeline lets anyone drag the playhead, but seeking
moves only their own loop. The grid and the instrument stay the only things
everyone changes. Once I had said which state was shared and which was
personal, the code followed, and the logs only have to record the shared
changes.

## What did this work change about who I want to be as a software developer?

I have started this project over three times, and I used to treat the
deployed app as a draft I could always replace. Now I see it as a promise to
the people using it, and to the logs that have to explain what they did. I
want to explore boldly, but behind a branch, and merge only what I can check
end to end: the tests, a real browser with a second person in it, and my own
eyes. The timeline passed every test with its note bars too cramped to read
well; only a screenshot showed that. I also want to decide who can see and
change what before I build a feature, not discover it afterwards.
