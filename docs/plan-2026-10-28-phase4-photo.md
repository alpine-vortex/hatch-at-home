# Phase 4: a photo, for best friends (build plan, draft 1)

Phase 4 of `plan-2026-10-28-voices-and-lines.md`: A7. That plan's second audit,
row 3, wins over part A: photos keyed by generation; delivered only by the visit's
response; shown only to that person, never on a shared screen; a canvas with its
own fixed layout that waits for the Tiny5 font, no smoothing; saving by the share
sheet where there is one, else the image shown for a long-press save; **tried on
both companion apps before release**. So it ships first as a beta (0.34.0b1) for
the owner to try, then as 0.34.0.

## What the person gets

At bond level 10 (their best friend), once per generation, the pet makes them a
photo: a framed portrait of the pet as it was that day. "I made you something!
it's in your journal ♥" at their next look. In their journal (theirs only), a
"photos" row: one small print per generation, oldest first, each with "save".

## Server

- **The snapshot**, in the bond: `bond["photos"][str(generation)] = {name, species,
  stage, traits, world, since, on}`: the pet's name, creature and life stage then,
  its traits (at most `TRAIT_CAP`), the world, the day they became friends (`since`)
  and the day it was taken. Small, no image. Bonds carry into the next generation,
  so earlier generations' photos stay; a new pet adds its own at level 10.
- **When:** `model.take_photo(state, user, today, world)` on a visit, when the bond
  is level 10, the pet has hatched and this generation has none. (A visit, not the
  level-up, so a bond that was already 10 before 0.34 gets one too.) Returns the
  note `photo` (pet scope, once), said like the other notes.
- **Delivered:** the visit's response gains `photos` (that person's, newest
  generation last). Never on a sensor (the life stage `bonds` attribute keeps only
  level, nickname, favourite), never an event; diagnostics already redact bonds.

## Card

- `s.photos` from the visit (only the viewer's; cleared on `_forget`, never on a
  shared screen, which makes no visit).
- **The journal:** a "photos" row when there are any: a print per generation (a small
  `<img>` of the rendered canvas) and "save" under each.
- **Rendering** (`renderPhoto(photo)`, a fixed 300 x 380 canvas, drawn at 2x):
  - a cream frame with a thicker bottom edge (a print);
  - the creature's day backdrop (`species.json` `backgrounds.day`), cropped square;
  - its `content` frame for that stage (its drawn stage: `stage_fallback` as the
    shelf does), centred, `imageSmoothingEnabled = false`;
  - the flair of its traits (`ui/flair_*`, the first frame) around it, as the shelf
    places them (head, air, ground), at most one per place;
  - in Tiny5 (after `document.fonts.load`), its name and "best friends since
    <since>" (`toLocaleDateString`, month and year), and the date it was taken.
  - Images load through `loadImage` (same origin, so the canvas isn't tainted).
- **Saving:** `canvas.toBlob` → `File("<name>-best-friends.png")`. If
  `navigator.canShare?.({files})`, `navigator.share({files, title})`. Otherwise an
  overlay with the image full size, "press and hold the picture to save it", a
  download link (for desktop browsers) and "close". The overlay stops every tap.
- No photo on a shared screen, in the live region (the journal row has
  `alt="photo of Pip, best friends since March 2027"`), or on phones.

## Tests

- model: `take_photo` once per generation, not as an egg, keeps earlier
  generations', snapshot fields; `from_dict` keeps `photos` in bonds.
- coordinator: the visit returns only the caller's photos; the note once; the
  sensor's `bonds` carries no photo; diagnostics carry none.
- card checks: an injected visit reply with two photos shows two prints in the
  journal; the canvas has the sprite (a pixel sampled in the middle is opaque) and
  the backdrop; "save" without `navigator.share` opens the overlay with a
  download link; nothing on a shared screen; the note's line.
- Screenshots of a print for three creatures with traits.

## Release

0.34.0b1 as a GitHub pre-release from the PR's branch (the owner turns on beta
versions in HACS), with a short ask: on the iPhone app and the Android app, open
the journal, tap "save" on a photo, and say what happened. Then fix and release
0.34.0 from `main`.
