# Winter lights, 2026-10-31 (plan; card only, date-based, art-gated)

**Owner decided 2026-10-31:** the next Luna seasonal set is **winter lights**: generic
December lights and trim, **by date, not weather**, built the way Halloween (0.28.0) and
Thanksgiving (0.30.0) were. This plan is the card side. Art comes from the art coordinator
after the reaction poses (about 15–25 images; Luna, Sol for tiny pieces). Closes the
"winter holidays: generic or named?" question in `plan-2026-10-28-daily-checkins.md` §6.

Rules kept (HANDOFF, experience plan "The owner's taste"): Animal Crossing flavour,
positive or quiet, no guilt, nothing missed by being away, **no person named on a shared
screen**, no religion-specific wording or pieces (no tree, no gift, no named holiday).

## 1. Dates

- **1 Dec – 31 Dec**, inclusive, by the viewer's own date: `from: [12, 1], to: [12, 31]`.
  Both sit in one year, so `seasonNow` needs no change. 1 Jan is a later "new year" season.
- **Overlap:** Thanksgiving runs to the Sunday after, which is 1 Dec in years when it falls
  on 28 Nov (2024, 2030). **Thanksgiving wins**: `seasonNow` takes the first match, so winter
  goes *after* it in `SEASONS`. No code; a unit check in card-check pins it (section 6).
- `seasonal: "winter"` previews it, `seasonal: false` turns it off, as for the others.

## 2. What changes per world (`SEASONS` entry, key `winter`)

| World | Part | Notes |
| --- | --- | --- |
| all (`"*"`) | `lantern: "ground"`, `corners: ["right"]`, `dayFlyers: false`, `sweets: false` | A lit lamp of the day by the pet's side; frost corner top right; the light string (bunting) across the top. |
| tidepool, pond | `lantern: "float"` | The lamp floats and bobs, as Halloween's pumpkin does. |
| hearth | `sweets: true` | A mug by the door (popped at the pet's feet on the treat day). |
| terrarium | `corners: ["left","right"]` | Both corners, as for Halloween's web. |
| nightsky | `nightFlyer: true` | A slow drift of tiny lights; the lamp glows brighter at night. |

- **Pieces:** `lanterns` (a new one daily via `dailyPick`): paper lantern, star lamp,
  snow lantern. `corner: "frost"`, `sweet: "mug"`, `snack: "cookie"`, `bunting: true`,
  deco `season_winter_deco` replaces the right-hand world deco in season (as for the others).
- **Flyer:** `flyer: { art: ["twinkle_1","twinkle_2"], cls: "stwinkle", ms: 6500 }`, crossing
  at night only (`dayFlyers` false, like Halloween's bats). **No snow, no falling flakes, no
  weather**: the look stays the same on a hot day. (Falling leaves are Thanksgiving's; winter
  sets `leaves` off.)
- **Glow:** a `.s-winter` night rule like `.s-halloween` (CSS only, a soft warm drop-shadow on
  the lamp at `night`/`dim`). Thanksgiving left the glow to Halloween; winter takes it too.
- **Chirp:** reuse an existing sound (`harvest`) unless the owner wants a new bell (Q6).
- **No season `visitor` in v1** (Q5). Halloween's ghost and Thanksgiving's turkey are
  season-specific; a December one would need more art. The world visitors
  (`plan-2026-10-31-visitors.md`) come as on any day.
- **Countdown:** none (nothing to count down to; avoids "N sleeps" pressure). **Treat day:**
  21 Dec (the longest night), `treatLine` below; quiet and secular. Optional (Q3).

## 3. Costumes (the hats)

Yes: four, on the same machinery as Halloween/Thanksgiving (`costumes`, `sink`, `width`,
`skip`). All on the 64×48 / 76×40 hat canvases, brim on the bottom edge.

| art | canvas | sink | width | skip |
| --- | --- | --- | --- | --- |
| `knit_cap` (bobble hat) | 64×48 | 8 | 64 | none |
| `earmuffs` | 76×40 | 9 | 76 | to be set after the preview (creatures without a head top) |
| `light_wreath` (a circlet of tiny lights) | 76×40 | 9 | 76 | none |
| `star_cap` | 64×48 | 8 | 60 | none |

- **Costume-preview cost:** `scripts/costume-preview.js winter` dresses every creature at
  every stage in every costume: 13 creatures × 4 stages × 4 hats = **208 shots**, the same run
  Thanksgiving had. Run once per art batch; read only the contact sheet, then fix `sink`/`skip`.
  Dropping to three hats saves a quarter. (Q4)

## 4. Art list (canvas / size / name, `ui/season_winter_<name>.png`, same sizes as Thanksgiving)

| # | Name | Canvas | Tool |
| --- | --- | --- | --- |
| 1–3 | `paper_lantern`, `star_lamp`, `snow_lantern` | 120×104 | Luna |
| 4 | `bunting` (light string, tiles across the top) | 96×32 | Luna |
| 5 | `deco` (replaces the right deco) | 128×128 | Luna |
| 6 | `frost` (corner) | 72×64 | Luna |
| 7 | `mug` (by Hearth's door) | 48×24 | Sol |
| 8 | `cookie` (snack prop) | 128×128 | Luna |
| 9–10 | `twinkle_1`, `twinkle_2` (night drift, faces right) | 68×40 | Sol |
| 11–14 | `knit_cap`, `earmuffs`, `light_wreath`, `star_cap` | see §3 | Luna |

**14 images** (16 with a visitor pair, Q5). Stand-ins first from a `make_winter.py` beside
`art/seasonal/make_thanksgiving.py` (same style: dark brown outline, 2–3 tones, 4 px pixels;
`out/` never overwrites `frontend/ui`), so the card ships before the final art.

## 5. Copy (PROPOSED; owner picks one set per row; none names a person)

| Slot | A (positive) | B (quiet) |
| --- | --- | --- |
| `lines` (costume bubble, random) | "so many lights!", "twinkle twinkle ♪", "happy winter!", "cozy lights~" | "soft lights...", "so warm in here", "glowing~", "shh, pretty" |
| `treatLine` (21 Dec) | "the longest night, and so many lights! ♥" | "the longest night... all lit up" |
| `snackLines` | "cookie!! ♪", "a star cookie, yay!" | "mmm, warm ♪", "a little treat ♪" |
| baby (`season.winter`) | "pretty! pretty!", "lights!", "cozy cozy~", "yum yum" | "ooh...", "lights~", "warm warm" |
| first look in season | "the lights are up!" | "it's all glowy" |

Recommendation: **set A for lines and treat, B for the first look**. Both avoid "holiday",
"merry", any greeting that names a festival, and "thank you"-to-someone (Thanksgiving's
`thanks` stays off). Lines are plain strings, so none can name a pet's person.

## 6. Interactions

- **`calm()`:** the pieces are still images and stay; the light-string twinkle (CSS) and the
  twinkle flyer are switched off under reduced motion as the other seasons' flyers are; the
  hat moment still shows (frame 1 only). Nothing moves.
- **Shared screen:** the lines carry no names; no `thanks`; the season is by the viewer's
  device date, so two screens in different time zones may differ by a day (as now).
- **Visitors:** the season has no visitor of its own, so the `flairUntil` ordering in the
  visitors plan (§2: seasonal waits 2 min after a world visitor) is never hit; world
  visitors keep their own seed and timers. The twinkle flyer uses `SEASON_FLYER_MS`, which
  `flairUntil` already holds back while a visit runs.
- **Line classes ("2a"):** I could not find a doc defining "2a line classes"; read as the
  card's line layers, the season bubble is the same class as Halloween's: it uses `lines`,
  the baby override (`LINES["season.winter"].baby`), `OPENERS` for sounds (none of the
  proposals opens with a sound word), and the bubble cap of
  `VOICE_MAX`. If 2a means something else, name it before building.
- **Pet moods:** unchanged; winter adds no state. A sleeping or away pet gets the scene
  pieces only.

## 7. Tests

- **Bench** (`dev/bench`, no HA): `season: "winter"` per world (6 shots) at day and night,
  `--preset shells` for the string and frost, one costume shot per hat via `costume`;
  pinned `time` for a December date to check `season: "auto"` (the bench `Date` is fixed).
- **card-check:** a `winter` section mirroring the Thanksgiving one (≈ 10 checks): pieces
  present per world, lamp floats in tidepool/pond, mug only at Hearth, snack is the cookie,
  costume art path `season_winter_*`, `seasonal: false` removes it, no `thanks`. A pure
  date check: 30 Nov and 1 Jan have no winter; 1 Dec and 31 Dec do; **1 Dec 2030
  (Thanksgiving 28 Nov) is Thanksgiving**. Run `--only` that section plus `restart`.
- **Costume preview:** `scripts/costume-preview.js winter` (208 shots), per §3.
- Full `scripts/gate` is the first mate's once per merged batch.

## 8. Size and tier

- **Card:** about S–M, ~70 lines: the `SEASONS` entry, `.s-winter` CSS, `.stwinkle` flyer
  class, one `LINES` baby entry, the `notify`/first-look wording if the season line at
  `season:` (card line ~854) names the holiday (it picks Halloween/Thanksgiving by name:
  needs a third case, "winter lights").
- **Docs:** HANDOFF paragraph, `docs/guide.md` seasons list, CHANGELOG, plus `make_winter.py`.
- **Tier 1** (card only, no server, no saved state), gated on the art. Ship before 1 Dec.
  Stand-ins unblock the code now; the final art only swaps files.

## 9. Owner questions (each with a recommendation)

1. **Dates?** *Recommend 1–31 Dec.* (Alternative: to 6 Jan; then new year can't have its own.)
2. **Name?** *Recommend "winter lights" in all copy, key `winter`.*
3. **A 21 Dec treat day?** *Recommend yes* (quiet, secular); no gift on the 25th.
4. **Four hats or three?** *Recommend four*; drop `star_cap` if art is short.
5. **A season visitor (a small creature at the edge)?** *Recommend no for v1*; keep the
   world visitors apart and add one next year with Sol.
6. **A new chirp?** *Recommend reuse* (`harvest`) for now.
7. **Copy set A or B** (section 5)? *Recommend A for lines, B for the first look.*
8. **Glow at night on the lamp?** *Recommend yes* (CSS only, free).
