# Correcting the gap from the selected D reference

Status: user chose to retain freely walkable 3D and rebuild toward D, 2026-11-07.
The reference is the previously generated D / Quiet Light image. It is an AI
concept, not a supplied 3D asset pack or a screenshot of this application.
The first build is preserved by `before-d-fidelity-2026-11-07` at `65c7a4f`;
its compiled output is copied to ignored `.cache/d-fidelity-baseline/`.
Do not restore an earlier database when comparing or reverting visuals.

## What failed

The previous acceptance criteria tested style consistency and functionality,
but did not establish similarity to the chosen image. The real view is a wide,
flat plaza with a complete cafe end wall, distant water and repeated thin tree
trunks. D is a narrow coastal promenade under spreading pines, with water just
below the left rail and a close, cropped glass cafe facade on the right.
Rounded cylinders and small clothing details do not reproduce its characters.
Calling the first version a completed D implementation was not justified.

## Required decisions and evidence

A fixed image can reuse the exact pixels, but is not a freely walkable 3D place.
A true 3D rebuild needs new geometry, material detail and composition; a single
generated view does not define every hidden surface or allow a promise of
pixel identity at arbitrary angles. The user explicitly chose the freely
walkable 3D rebuild. Do not replace the working 3D product with a flat image
or describe a further approximate implementation as an exact reproduction.

For the 3D option, first compare a locked hero camera to D at the same aspect:

- Sea fills the left third, with a narrow sloping sand/rock verge immediately
  beyond the rail, rather than a 28m-wide empty foreground beach.
- The promenade converges near (0.47W, 0.52H), with a substantial foreground
  rail on the left and legible transverse timber boards.
- The close cafe fills the right third to half and extends out of frame.
  Its glass frontage and low olive awning face the viewer; the entire end
  wall is not the main subject. No giant box brackets.
- Spreading, branching pines frame the top and form irregular canopy layers;
  no giant feather planes, repeated little leaf discs or bare pole forest.
- Two natural-scale animal people are near the cafe: a beige shirt/trousers,
  green scarf and satchel on the cat, and an olive jacket/white shirt on the
  seated guitarist dog. Continuous shoulders, hips and limbs replace tubes.
- Warm side light, cooler shadows, contact shading and reflected water light
  provide depth. Uniformly lit flat materials do not meet this criterion.
- Thin top chrome and a bottom-centre translucent action leave the world
  dominant; every existing setting and accessible action remains available.

The ratios are manually estimated art targets, not a measured similarity score.
Keep reference and actual screenshots side by side and report remaining gaps.
Review the actual hero camera before carrying its treatment through the rest
of the world. Passing behaviour tests does not establish visual acceptance.
Preserve the single room, contributions/replies, private-hut admission, sound
choices, shared weather/time protocol, and both pointer-direction preferences.
Any layout change must update physical floors/collision coherently and must not
move persisted contribution rows to make a screenshot look better.
