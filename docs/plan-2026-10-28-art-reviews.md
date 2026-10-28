# Art reviews: recommendations and plan (2026-10-28)

**Status:** plan only; nothing below is built yet. Phase 1 is for the next session.

Two reviews of the live character frames came in on 2026-10-28. They disagree, so
this plan reconciles them, says which suggestions to take, and orders the work.

- **Review A:** `docs/art-review-2026-10-27.md` (PR #19, merged). It fixed three
  frames (bird `adult_asleep_2`, deer `teen_sick_1`, moth `baby_asleep_2`), made
  `scripts/art/check.py` palette-aware, and found nothing else worth changing.
- **Review B:** `art/redraw-2026-10-28.md`, with fixes, on the unmerged branch
  `claude/elegant-pascal-44cy2y` (commit `2598fec`, no PR yet). It found broken adult
  outlines (axolotl, moth), frames at the wrong size for their stage, and a redraw list.

Both were rechecked on 2026-10-28 against `main` (`8560aa5`) and that branch, with
contact sheets at native size and `check.py` over every live folder. The branch
merges into `main` cleanly; it touches none of the files PR #19 or 0.29.1 changed.

## Recommendations, item by item

### Review A

| Item | Verdict | Why |
| --- | --- | --- |
| Bird `adult_asleep_2` sleep marks clipped | **Accept (done)** | On `main`; `check.py` reports no top-edge contact. |
| Deer `teen_sick_1` ear clipped | **Accept (done)** | On `main`; clear margin above the ear. |
| Moth `baby_asleep_2` weak silhouette | **Accept (done)** | On `main`. |
| Squirrel six legs, left unchanged | **Closed** | Fixed separately in 0.29.1 and `7ca7696` (cheeks, `hungry_2`, `shiver`). Note it in the review. |
| "No other live species needs changes" | **Reject** | Review B's axolotl and moth outlines, and the deer, kitten, gecko and squirrel size faults, are visible on a contact sheet. |
| `check.py` palette-aware, crop checks on character frames only | **Accept (done)** | Fewer false positives. |

### Review B: fixes already made on the branch

| Item | Verdict | Why |
| --- | --- | --- |
| Axolotl and moth adults: outer outline closed (`art/adults/outline_fix.py`) | **Accept** | Side by side, the outline now matches the teen's weight; silhouette and y=224 feet unchanged. Interim only; the redraw below is the real fix. |
| Gecko `baby_sick`, `child_sick` shrunk ×0.83 / ×0.78 | **Accept** | The child sick gecko was visibly a teen-sized animal; after the shrink it sits with the other child frames. |
| Squirrel `baby_cozy`, `baby_sleepy` shrunk ×0.82 / ×0.85 | **Accept** | The same fault; now matches `baby_content_1`. |
| `scripts/art/rescale.py` | **Accept** | Small, reusable, keeps the feet fixed. |
| "Bird and deer fixes never reached the repo" | **Correct the doc** | Stale: PR #19 landed them. Change that paragraph when merging. |

### Review B: redraw requests

| Item | Verdict | Priority |
| --- | --- | --- |
| Axolotl adult, all 20 frames | **Accept** | 1. Interior noise and smudged faces remain after the outline fix. Ask first whether the raw sheets can simply be re-cut (cheaper than a redraw). |
| Luna moth adult, all 20 frames | **Accept** | 1. Same as the axolotl. |
| Deer `calling`, `dirty`, teen and adult (8) | **Accept** | 2. Confirmed: a leaner, smaller deer, so the adult reads as a teen. |
| Kitten `adult_calling`, `adult_dirty` (4) | **Accept** | 2. Confirmed: leaner and taller, lighter outline. |
| Kitten `baby_calling`, `baby_dirty` (4) | **Accept** | 3. Too small, so it needs an upscale, which blurs pixel art: redraw. |
| Squirrel `teen_excited_2` smaller than frame 1 | **Accept, low** | 4. Frame 2 is a crouch, so some change is intended, but the size drop reads as a pulse. Fold into the same batch. |
| Octopus baby `content`/`excited` too saturated | **Accept, do here** | A palette remap to the pale salmon of the other baby moods. No new art needed. |
| Octopus `child_colour_shift` shows no change | **Accept, do here** | The two frames differ only slightly in tone. Shift frame 2's hue (a palette remap, or a CSS `hue-rotate` on that reaction) so praise and winning visibly change colour. |
| Tarantula on a 2 px grid | **Reject** | Sol drew it that way on purpose (v2, 0.21.0) and it reads fine at card size; a full redraw costs more than it buys. |
| Tarantula dark face: content, bored and sleepy hard to tell apart | **Accept, do here first** | Lighten the eye pixels by hand on the adult and teen frames; send it to the art batch only if that doesn't read. |
| Bat adult: fuzzy fur, outline drops at the ears | **Accept, low** | 4. Try `outline_fix.py` on the bat adult first; add to the batch if needed. |
| Gecko `teen_calling` "!" is a brown blob | **Accept, do here** | Repaint the mark in the shared "!" colour. |
| `child_mask` faint (deer, moth, tree frog) | **Accept, low** | 4. Cosmetic, and the `masked` pose is rare. Add to the batch. |

### Not taken from either review

- **`check.py` pair-jump noise.** It flags many idle pairs whose size changes on
  purpose (sleep marks, head turns). Leave it; it's a review aid, not a CI check.

## Plan

### Phase 1: land what's done (next session, about an hour)

1. Open a PR from `claude/elegant-pascal-44cy2y` to `main` (or merge it into the
   session branch). Before merging, edit `art/redraw-2026-10-28.md`:
   - drop the "still open from the 2026-10-27 review" paragraph (PR #19 fixed both);
   - mark the octopus, tarantula face and gecko "!" items "doing here" (phase 2).
2. Add a short note to `docs/art-review-2026-10-27.md`: the squirrel item was fixed in
   0.29.1, and review B found more (link this plan).
3. Run `check.py` over all live folders and `pytest`; look at a contact sheet of every
   changed frame next to its pair.
4. Release as a patch (sprites only). Take the next free version: if PR #18
   (Thanksgiving) has merged and taken 0.30.0, this rides in it or follows it.
   Bump `const.py`, `manifest.json` and the card's `VERSION`, and add a HANDOFF line.

### Phase 2: small fixes without new art (same session or the next)

1. Octopus baby `content_1/2` and `excited_1/2`: remap to the other baby moods' palette.
   Script it under `art/octopus/` so it can be re-run.
2. Octopus `child_colour_shift_2`: a visible hue shift. Prefer a sprite change (it
   travels with the art); CSS only if the sprite route looks wrong.
3. Tarantula teen and adult: lighter eyes on `content`, `bored` and `sleepy`. Check
   at 330 px card width.
4. Gecko `teen_calling_1/2`: repaint the "!".
5. Bat adult: try `outline_fix.py`; keep the result only if it's clearly better.
6. Check each in the card with `scripts/card-check.js` at 420 and 330 px; release.

### Phase 3: one art batch (after phase 1 lands)

Send one batch to the **Hatch API Art** session (it chooses Luna or Sol; see HANDOFF
"How to"), in this order, each item naming the frame to match:

1. Axolotl adult (20) and luna moth adult (20): ask first whether the raw sheets can be
   re-cut; otherwise a redraw matching `teen_content_1`.
2. Deer teen and adult `calling` and `dirty` (8), matching `*_content_1`, antlers in frame.
3. Kitten `adult_calling`, `adult_dirty` (4) and `baby_calling`, `baby_dirty` (4).
4. Squirrel `teen_excited_2`; bat adult (if phase 2 didn't fix it); `child_mask`
   for the deer, moth and tree frog.

When it arrives: keep file names, 256×256 canvases and the y=224 baseline; run
`check.py`, a contact sheet per species against the current frames, and
`card-check.js`; then release and mark `art/redraw-2026-10-28.md` done.

## Open questions for the owner

- Phase 3 is about 60 frames. Send it all at once, or the axolotl and moth first
  (the most visible)? The plan assumes one batch.
