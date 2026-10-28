# Phase 4: a photo, for best friends (build plan, draft 2)

**Status (2026-10-28): built as 0.34.0b1, awaiting the beta try on both
companion apps.** Reconcile for phase 5: the snapshot keeps `{name, species,
stage, traits, on}` (no `since`, no `world`); `take_photo` runs only on a
counted visit (awake), and the note is derived in `_notes` right after the
celebration. The quoted alt text lost "since" with the caption ("photo of Pip,
best friends, <day>"); the download link's text is the file name. The card
gained `loadImage` (cached, for canvases) and `spriteSrc` (the sprite path
helper `_show` uses), which baby talk or moths may reuse.

Phase 4 of `plan-2026-10-28-voices-and-lines.md`: A7. That plan's second audit,
row 3, wins over part A: photos keyed by generation; delivered only by the visit's
response; shown only to that person, never on a shared screen; a canvas with its
own fixed layout that waits for the Tiny5 font, no smoothing; saving by the share
sheet where there is one, else the image shown for a long-press save; **tried on
both companion apps before release**. So it ships first as a beta (0.34.0b1) for
the owner to try, then as 0.34.0. **Draft 2: the audit table at the end wins over
the sections above it where they differ.**

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

## The audit of draft 1 (14 findings) and what changed

| # | Finding | Change |
| --- | --- | --- |
| 1 | Photos come back only on a counted visit: after a reload, at night and on a second device the row is empty | A websocket command `virtual_pet/photos` returns the caller's photos for one pet; the card fetches it when the journal opens. Not in the visit reply |
| 2 | An overlay inside the slide is clipped (`overflow: hidden`, the track's transform) | A `<dialog>` opened with `showModal()`: above everything, focus trapped, Escape, `::backdrop`; sized `min(300px, 90vw)` |
| 3 | From generation 2 the photo would be of a 30-minute-old baby (the bond is inherited at 10); "since" is from an older generation | Taken when the bond is 10 and this pet is a teen or older. The caption says "best friends ♥" and the day it was taken (no "since") |
| 4 | A note handed back once can be lost in a full look; a fixed `noted` key would silence the next generation's | A derived note in `_notes`: `("pet", "photo", str(generation), …)` while this generation's photo exists and isn't noted; after the celebration. `take_photo` only writes the snapshot |
| 5 | Turning "shared screen" on mid-session leaves photos visible | The journal checks `sharedScreen()` when it renders; the switch clears every slide's photos and revokes their URLs |
| 6 | Data URLs in the status HTML are re-rendered and compared often | One render per generation, cached as a Blob with an object URL (short `blob:` strings in the HTML); revoked on `_forget` and on shared screen |
| 7 | `navigator.share` after an awaited `toBlob` loses the gesture on WebKit | The File is made when the print renders; the tap calls `share` straight away. `AbortError` (cancelled) is done, not a failure |
| 8 | The companion apps: Android WebView likely has no `share`, nor a long-press save; downloads need app support | Order: share if `canShare`; else the dialog with "press and hold the picture to save it" (no `user-select: none`, no `touch-callout` block on it); the download link only outside the companion apps (user agent without "Home Assistant/"). If the beta shows Android can't save at all, the dialog says so honestly ("you can save it from a computer") |
| 9 | "A pixel in the middle is opaque" passes with no sprite | The check renders with and without the sprite and compares the sprite's area; and waits for every image (`naturalWidth`) and the font (`document.fonts.check`) |
| 10 | ISO dates read as UTC (a day early west of UTC) | Parsed by parts: `new Date(y, m - 1, d)`, the month from `hass.locale` |
| 11 | Drawing must follow `_renderSlide`: `scale`, the tree frog's `perch`, head points in 256-px space, borrowed paths | One helper for sprite paths (from `_show`), a cached `loadImage`; scale and perch as the shelf; flair from `head` points in sprite space. A tainted canvas (a Cast receiver) shows no print |
| 12 | Canvas text is antialiased; Tiny5 is Latin only | Accepted; the month from `hass.locale`; non-Latin names fall back |
| 13 | Many identical "save" buttons; focus after a rebuild | `aria-label="save the photo of Pip, generation 2"`, `data-gen`; focus returns to it when the dialog closes; "saved"/"shared" announced in `.status-feedback` |
| 14 | `from_dict` doesn't check `photos`; growth; wording; `world` unused; untested fixes after b1 | `photos` checked as a dict of dicts; the row scrolls (newest last); "never in notifications"; `world` dropped; b2 if b1 needs save changes |
