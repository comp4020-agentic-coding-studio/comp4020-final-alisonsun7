# Little Chorus

## A place that remembers your answer

Little Chorus is a small sound world for two to six friends without musical training. My definition of good is recognizing my contribution, hearing what a friend answered, and finding a place changed by that relationship. A short visit should leave something we can recognize and continue together.

Open [Little Chorus](https://comp4020-final-alisonsun7.fly.dev/planet), join with a nickname, and choose sound or quiet browsing. At **Listening Green**, choose **Share a sound**, preview privately, then explicitly leave it. Suggestions marked **Changes the world** connect sounds with visible effects. Select a friend's contribution and choose **Answer**. Use separate browser profiles or devices: tabs sharing cookies count as one contributor. The [walkthrough](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/blob/4e6433e9d9dce2a942a363c2bb133d2218e8f554/docs/little-chorus.md) explains controls and continuing a work.

## Why make sounds together?

A reply becomes part of a common object. Water and birds grow a paper-bird canopy; melody and pulse form a beat flower; other combinations light a lantern. A live answer from a different contributor opens the shared form. Selecting a contribution identifies its author and the sound it answers. Withdrawing a sound removes its effect while retaining its history.

Walking changes what is nearby and audible. **Pocket Jam Stage** gives musical parts a common beat; **Reading Nook** supports quieter, closer listening. These places offer different ways to attend to a friend's contribution. Volume, mute, focus and previews remain personal. Nobody else's action can unmute me or publish my preview.

Labelled **World examples** demonstrate whales, frogs, a ferry and other responses before friends arrive. They can be paused locally, give priority to player contributions and never become authors, replies or saved works. These examples teach possibilities; inviting a friend makes possible an attributed answer that remains.

## Small enough to care about

I want a few friends to have a place worth returning to together. This fits [Robin Sloan's idea of a home-cooked app](https://www.robinsloan.com/notes/home-cooked-app/): a tiny audience is sufficient. Unlike his disappearing messages, I retain replies so friends can continue their work. Remembering may create obligation, so I omit rankings, streaks and daily demands rather than reward constant attendance.

Friends also need to understand each other's influence. The author record, sound and changed object should explain who answered whom and what happened, helping players choose their next response. This applies [Aurora Harley's system-status principle](https://www.nngroup.com/articles/visibility-system-status/) to shared creation.

I chose 3D for spatial listening and expressive inhabitants, accepting camera, occlusion and performance costs. Three connected activities take priority over nine equally developed games. The [asset manifest](https://comp4020-final-alisonsun7.fly.dev/assets-manifest.json) distinguishes original material from licensed recordings.

## What is checked, and how I judge the experience

[Identity checks](spec/chorus-state.test.ts) distinguish contributors; [restart checks](e2e/chorus-persistence.mjs) exercise saved work and identity recovery. [Publication checks](spec/planet-publication.test.ts) prevent delayed acknowledgements from reviving removed sounds. The [browser creation path](e2e/chorus-creation.mjs) checks that friends' actions preserve quiet browsing.

The recorded two-person feedback describes Mac use across Safari, Firefox, Chrome and DuckDuckGo. Participants used independent identities, left sounds, answered each other and chatted. They saw shared changes and retained sounds and replies after reopening and a next-day return. Initially, building through sound was difficult to understand, prompting clearer guidance and default examples. Changed creatures, neighbours and objects encouraged exploration; the replacement for the disliked synthetic frog was judged acceptable. These small-scale observations inform my criteria: recognizable contributions, enjoyable listening and a place worth continuing together. They provide formative feedback, rather than a comprehensive browser comparison or a guarantee that every player will understand the experience.
