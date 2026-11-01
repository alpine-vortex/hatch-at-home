# Visitors v2, 2026-11-01 (plan: finds, a basket, a collection, gifts)

**Status: PLAN, docs only. Reviewed + folded 2026-11-01** (tier-2 review s2580, findings
#1-#23, and the owner's answers; see "Decided" in §13). **V-A built 2026-10-31** (s2582,
branch `crew/hatch-at-home-s2582-v-a-the-server-owns-the-day-s`; see "V-A as built" under
§11). **V-B built 2026-11-01** (s2591, branch
`crew/hatch-at-home-s2591-visitors-v2-v-b-finds-and-the`; its adversarial review s2590,
findings #1-#21, is folded in, marked "V-B review #n"; see "V-B as built" under §11). V-C
(s2595) and V-D0 (s2594) are built. **V-E1 built 2026-11-01** (s2597, gifts, server; the
V-E review s2596, findings #1-#21, is folded in, marked "V-E review #n"; see "V-E1 as
built" under §11). V-D's card and V-E2 (gifts, card) are next; owner Q1 and Q2 are open
(§13).
Next-stages slice 2d (`plan-2026-10-31-next-stages.md`).
This plan is the server half of daily check-ins item 1 (`plan-2026-10-28-daily-checkins.md`).
It builds on visitors v1 as built (`plan-2026-10-31-visitors.md`: 18 visitors, final art,
card only, nothing saved). The adversarial review is done and folded in. Every player line
here is **PROPOSED**. The owner picks the words. Line numbers are from `db5ff051`; names
win over numbers.

The rules it keeps (experience plan, "The owner's taste"; check-ins, "Rules for all of it"):

- Animal Crossing flavour.
- Nothing is lost by missing a day: no streaks, no expiry, no guilt.
- Cosmetic only. Finds are never spent, and there is no shop or currency.
- Not rare enough to cause fear of missing out.
- Private things go only to their person.
- **No counts that nag.** The basket shows no number. The collection has no "6 of 14" and
  no progress bar.

## 0. Summary

| Piece | What | Where it lives |
|---|---|---|
| The day's visit | The server picks the day's visitor and window once, saves them, and publishes them. The card plays the visit as v1 does. | `PetState.visit`, `_house_view` |
| Finds | Now and then the pet finds a small thing from its world (10 per world, 60 in all). It rolls while awake; Night Sky also rolls asleep. Some depend on the weather. | `PetState.basket` |
| The basket | Up to 3 finds wait at the scene's edge. A tap reveals them one at a time. Rolls go on while it is full; a find with no room goes straight to the collection, unseen. | the card. The tap is the `virtual_pet/collect` websocket command. |
| The collection | Each world's finds and visitors. Ones already met are drawn; the rest are silhouettes, with no count. It is kept by the device, across generations. | `PetState.collection`, `virtual_pet/collection` (read) |
| Gifts | Now and then the pet saves a find for one friend. Only that person sees it, on their own screen. | `bonds[user].gift` / `.gifts`, `mine` only |

## 1. First design point: the server owns the day's visit (FM, Q10)

v1 picks the visitor on the card with `visitorDay(date, device)`, keyed by the HA device id
and the browser's local date. Nothing is saved. A collection can't credit a visit that only
a browser knows about, so v2 moves the pick to the server.

### The seed and the save

- **Pick once, then save.** A new `_daily_visit(now)` next to `_daily_wish`
  (`coordinator.py:1033`) runs on the first tick of each local day. It writes
  `state.visit = {day, world, id, hours, from, until, credited}`:
  - `day`: the local ISO date.
  - `world`: the world the pick was made in. A `visit` whose `world` isn't the device's
    current world is treated as no visit, on load and in `_house_view` (finding #9: the
    coordinator switches `CONF_WORLD` after `lay_egg`, so for a moment `visit` names an
    old-world visitor).
  - `id`: the visitor's id. With no visit today, `visit = {day, id: null}`.
  - `hours`: `day` or `night`.
  - `from` and `until`: the 3-hour window, as epoch seconds.
- **The pick is saved, not re-derived.** A restart mid-day reads the saved plan, so it can't
  re-roll the visitor. A later version can weight the pick by weather.
- **What is random (finding #11).** `self.rng` is unseeded (`coordinator.py:203`), so
  nothing the guarantees below depend on may use it. The cycle position, the visit/no-visit
  call and the turn (which of the three) come from the day index plus the `entry_id` hash,
  as `visitorDay` does (card:671). Only the window's start hour comes from `self.rng`
  (inside the allowed range), and it is saved with the pick.
- **v1's guarantees, kept on the server.** These are the same rules as `visitorDay`:
  - 4 visit days in every 7 (a position in a 7-day cycle);
  - the three visitors take turns over the visit days;
  - day windows start between 09 and 15, night windows at 19 or 20.

  The cycle position comes from the day index plus a per-pet offset taken from `entry_id`
  (the device's identifier, `entity.py:25`). The turn order is deterministic, so "any 21
  days hold every visitor" stays a property that a pytest checks over 365 days, whatever
  the rng gives.
- **The day boundary is HA's time zone** (`_today`, `coordinator.py:1014`), as for the
  wish, the dream and the birthday. The window travels as absolute timestamps. A browser in
  another time zone therefore plays it at the same instant as every other screen. v1's
  edge case (each browser used its own `toDateString()`) is gone.
- **Multiple browsers agree by construction.** Every screen reads one saved plan. The card
  keeps v1's `oncePerDay("visit-<device>")` flag, but only to mean "this screen already
  played it". That is a browser flag, not a save. **The flag is keyed by
  `house.visit.day`** (finding #22), not by the browser's `toDateString()` (card:693), which
  would reset mid-HA-day in another time zone and could play the visit twice. With no
  `house.visit` (the fallback), v1's key stays.
- **Day or night on screen stays on the card.** The server's `hours` says which kind of
  visitor it is. The card still plays a night visitor only on a `night`/`dim` scene
  (v1 rule).

### Crediting a visit (Q1)

**Recommended:** the server credits the visitor when its window **ends**, whether anyone
saw it or not.

- At the first tick past `until`, it writes `collection[world].visitors[id]`, if that entry
  isn't there yet, and sets `visit.credited`.
- **Order on rollover (finding #10).** If HA was down across `until` and midnight, the new
  day's `_daily_visit` first credits an uncredited past `visit` (whose `until` has passed),
  and only then picks today's. The pick never overwrites an uncredited visit.
- **Credited in every stage (R4).** The visit is credited while the pet is an egg and while
  it is away, because crediting is the server's, not the pet's. v1 shows no visit then; the
  catch-up line already says "came by" whatever the pet's state.
- **No card call says "I saw it."** There is no write path, so no race between screens, and
  no person is recorded.
- Being away costs nothing. That is the rule "nothing missed by being away", taken literally.
- v1's catch-up line ("a <name> came by today ♪") already tells a person who missed it.

**The visitor's gift** (check-ins: "a missed visitor still says hello"):

- On about 1 visit in 3 (`R.VISIT_LEAVES_FIND` 0.33), the visitor leaves a find in the
  basket when its window ends. It is the visitor's `leaves` find if it has one, else picked
  uniformly from that world's plain commons (weight 10, `when: null`, not gift-only; Night
  Sky's moonflower is a common with a condition, so it is never left), and the basket entry
  carries `from: <visitor id>`. It is credited to the collection then, like a rolled find.
- **Where (V-B review #6):** in `model.daily_visit`, right after `credit_visit` returns
  True (it has the rng); `credit_visit` itself is unchanged. **A left find fires no
  `found`** (owner Q4, 2026-11-02): "found a jay feather" would misreport the jay's gift.
- A visitor with a `leaves` id in `worlds.json` leaves that find (finding #5): the
  Steller's jay its jay feather, the gull its gull feather, the heron its heron feather,
  the nighthawk its nighthawk feather. Any other visitor leaves a common find.
  The feathers are uncommon in the pool too, so they can also be found.
- If the basket is full, the find goes straight to the collection (R1), like a rolled
  one, not to the basket. Nobody is told.

### Where the card reads it

- **`_house_view` gains `visit: {day, id, hours, from, until}`** (`coordinator.py:2003`), but
  only for today, only while `id` is set and only when `visit.world` is the current world. It names nobody, so shared screens get it too.
- It is not in `mine` because it is the same for everyone.
- It is not a sensor attribute because it changes daily. The channel pushes it, and the
  house view doesn't go into the history database.
- **`visitorDay` stays as the fallback**, for a true old server only: the channel is up
  and its `house` has no `visit` key (V-A audit #3, owner 2026-11-01). With the channel not
  up yet or failed (HA starting or reloading), the card says and plays no visitor and leaves
  the day's flag unused: v1's pick hashes the device, the server's the entry, so they differ.
  The bench plays visitors through `_visitorStart` directly.
  - A new card with an old server behaves as v1.
  - An old card (a cached browser) with a new server keeps its own pick. The server still
    credits from its own plan, so the collection is right either way.
- **Upgrade day:** the server's pick replaces the browser's, so that day's visitor may
  change once. This is accepted. The plan does not try to match v1's hash: it is keyed by
  a different id and by the browser's date.
- **`VISITORS` moves to `worlds.json`** (`visitors: [{id, name, hours}]` per world), so the
  server and the card share one roster, plus an optional `leaves` (a find id). The card keeps the play data (`walk`, `cross`,
  `in`, `stay`, `lines`, `catchup`) in a JS table keyed by id. That is v1's own stated next
  step (§4 "Data").

## 2. Finds

### How they come

- **A roll every ~4 hours** while the pet is awake and home, and not an egg. The basket
  being full doesn't stop it (R1).
  - `R.FIND_EVERY_HOURS` is (3, 5): the gap is `rng.uniform(3, 5)` hours (V-B review #19).
  - `R.FIND_CHANCE` is 0.6, so about 2-3 finds on a normal day.
  - **Where it runs (V-B review #5):** `home.find_flags(...)` reads the tokens in
    `_sense_home`, kept as `self._find_flags`; the pure `model.roll_find(state, now, day,
    world, finds, flags, known, rng)` runs in `_tick` **after** `_sense_home`, outside
    `advance`, so catch-up and `fast_forward` never roll. It saves `state.next_find_at`.
  - **Nothing rolls before the house has been read once** (`_home_started` and a first
    reading, V-B review #3): `_find_flags` is None until then.
- **Asleep, away or an egg: no roll,** with one exception (R2): **only Night Sky rolls
  while the pet sleeps** (its finds are of the night). Away is no roll for Night Sky too.
- **The find clock (V-B review #8, owner Q2 2026-11-02).** A nap, the night's sleep, away
  and the egg **pause** the clock; they don't reset it:
  - while the pet can't roll, `next_find_at` is left as it is;
  - on a tick it can roll with `next_find_at` None (a new save, an old one, a salvaged
    one, a fresh egg's), the next roll is scheduled `now + uniform(3, 5) h`, with no roll;
  - once `now >= next_find_at`, **one** roll, however long it was due (a nap, downtime,
    an upgrade back from V-A, `fast_forward`), and the next is scheduled from now;
  - `lay_egg` sets None (the egg can't roll; the hatchling starts fresh);
  - **a `next_find_at` further ahead than `FIND_EVERY_HOURS[1]` (5 h)**, on a tick the pet
    can roll, means the clock went back (an RTC ahead before NTP, a restored snapshot):
    it is scheduled again from now, with no roll (V-B audit #2, first mate). It is not in
    `shift_times`, which would also move it over downtime and break "one roll after
    downtime".
  So a nap costs no roll, and the 2.4 a day the bound assumes holds. (The review's line
  "set `next_find_at = None` while it can't roll" would make every nap a reset, which Q2
  rules out; "paused" is built as "left alone".)
- **A find is credited when it is rolled (or left), whether or not it goes in the basket**
  (V-B review #1, owner Q1): `collection[world].finds[id]` gets the day if it is new, and the
  basket entry stores `new` (first of its kind then). The reveal reads it; the ×0.5 and a
  weekly tapper's collection never wait for a tap. A find still in the basket already shows
  as met on the collection page.
- **A full basket (R1).** Rolls continue. A find that has no room goes **straight to the
  collection** (`collection[world].finds[id]`, if new), unseen, with no `found` moment and
  no line. Nothing waits on a tap, so emptying the basket is never a chore. The find rate
  is the same for a daily tapper and a weekly one; only what they get to *see* differs.
- **The pick is weighted from the world's list.**
  - Common weight 10, uncommon 4, rare (★) 1.
  - A condition find counts at its tier weight while its condition is true. They use
    flags the house already senses (`home.py`): `rainy`, `snowy`, `sunny`, `foggy`, plus
    `night`, `full_moon` and the season, defined here for finds. There is no frost flag, so
    frost finds use `snowy`.
    - **`night` (finding #1) is the sun being down**: `sun_up is False` from the house's sun
      entity; with no sun entity, 20:00-06:00 local. It does **not** mean the sleep hours
      (`Readings.night`, `home.py:51`), which the awake pet sees for only 1-2 hours.
    - **`full_moon`** is the moon phase alone, with the sun down. Finds don't use
      `home.py:232`'s extra gate on the sleep hours, so moonstone works.
    - **`autumn` / `winter`** (finding #4, R5) come from `people.py` `season(day,
      latitude)` (`people.py:277`, used at `coordinator.py:1522`), so they follow the
      hemisphere. It returns None in the tropics: no season is then set.
    - **The fallback (R5), per token (V-B review #2).** Each token is true, false or
      **missing**. Missing comes from the **configuration** (V-B review #3), never from a
      reading that is None for now (a restart, an entity briefly unavailable reads false):
      `rainy` is missing with no weather entity and no rain gauge; `sunny` with no weather
      entity and no solar sensor; `snowy` and `foggy` with no weather entity; `autumn` and
      `winter` where `season()` is None (the tropics). `night` and `full_moon` are never
      missing. A missing token, `!` ones included, drops out of its AND. A clause with every
      token present and true gets the tier weight; one true only because tokens dropped
      out gets **weight 1**; a false token makes it 0. The best clause wins. So chanterelle
      in the tropics is weight 1 on a rainy or foggy day and 0 on a dry one; a fallen star
      with no weather entity is weight 1 at night; four-leaf clover is weight 1 when sunny,
      0 when not, and 1 with no sun signal at all. A home *with* a weather entity that
      never sees a condition is Open question 2.
    - **The moon (V-B review #4, owner Q3; V-B audit #1, first mate):** for finds,
      `full_moon` is the sun down and **either** a mapped `moon_phase` or
      `moon_illumination` entity saying full **or** the date's window (a mean synodic
      month; within ±1.5 days of mid-cycle, `R.FIND_FULL_MOON_DAYS`, so 3 nights a
      month). So moonstone happens everywhere. HA's phase sensor says full for only
      about a day, which alone would make moonstone ~178 days. The house's own
      `full_moon` mood flag is unchanged (the entity wins there).
- **Finds already in the collection are weighted ×0.5**, never 0, so new ones come a little
  sooner, but repeats still happen and still delight.
- **Rare enough to be special, never a worry.** A pytest works out each find's expected
  wait from the weights at an **explicit rate of 2.4 finds a day** (awake ~16 h, a roll
  every 4 h, 0.6 chance: 4 × 0.6). The **acceptance bound: from a
  fresh collection, each world's rarest unconditional find has an expected wait of at most
  30 days** at that rate. Terrarium and Hearth are tightest (about 53 of unconditional
  weight, so about 22 days; the ×0.5 on met finds only shortens it). The bound
  holds **whether or not anyone taps the basket** (R1): rolls and the collection credit
  don't wait for a tap. Only what is *seen* depends on tapping.
- **The guarantee is analytic (V-B review #7).** `tests/test_finds.py` works out each
  find's expected wait at 2.4 a day (Night Sky 3.6: it rolls asleep too):
  - every world's rarest **unconditional** find, with every condition find in the pool
    (the worst case): at most **30 days** (Terrarium, Hearth, Pond 23.8; Tidepool 22.5);
  - **condition finds** at a stated frequency (sunny 1 roll in 3, rain 1 in 4, fog and snow
    1 in 10, a season 1 in 4, night 1 in 2, full moon `2 × FIND_FULL_MOON_DAYS` days a
    month at night, derived from the constant): at most
    **45 days** (owner, 2026-11-02; first built at 100). Six weights were raised for it (in
    `worlds.json`; commons untouched): chanterelle 4→6, frosted leaf 4→5, four-leaf clover
    1→3, dew drop 4→6, message in a bottle 1→3, moonstone 4→6. As built: moonstone ~42,
    frosted leaf ~39, chanterelle ~37, dew drop ~37, fallen star ~34, bottle ~30, snail
    shell ~20, four-leaf clover ~20, frogbit ~17, pine sprig ~16. Their tiles stay hidden
    until met (§13b #2). The rarest unconditional find is still within 30 days (Terrarium
    ~24.6). Gifts weigh a find by tier (`model.gift_weight`: commons at 10 as they are, every rarer weight doubled, retuned ones included); a
    raised weight not in that map counts as itself there.
- **The coverage run (finding #1, #21) is a regression snapshot**, not the guarantee
  (V-B review #7). A fixed-seed **90-day** run from a **pinned start, 2026-10-15** (it
  crosses into winter), on a **pinned weather schedule** (a 10-day cycle: sunny, cloudy,
  rainy, sunny, fog, cloudy, rainy, sunny, partly cloudy, snowy; from mid-November every
  other rainy day is snowy), latitude 45, the **real sleep hours** (22:00-07:00, the sun
  down by the real day length, Night Sky rolling asleep), no moon entity (the moon from the
  date). It runs twice per world: with weather, and with **no weather entity at latitude
  10** (the fallbacks). Seed 2026 sees every non-gift find in both. Over seeds 0-19, the
  weather run misses something for Tidepool in 10 (the bottle), Night Sky in 6 and Woodland
  in 2, and the no-weather run for Night Sky in 7 (moonstone); after the 45-day cap
  (2026-11-02) only Woodland in 1 (weather) and Night Sky in 2 (no weather) of 20: it is pinned, so it can't
  flake, but a change in what the rng is asked for can move it; check the waits, then
  re-pin.
- **A moment, `found`** `{id, world}`, with no user. It is in `MOMENTS` (V-B review #13),
  so it goes to the moments and the bus, like other house moments (`moments` is
  unrecorded, `sensor.py:299`); on the bus it carries only `{id, world, pet_id}`. The away note can then say "found a pine cone"
  (`MOMENT_BITS.found`). No consumer yet beyond the away note; it is on the bus like the
  other house moments, for later. A find that went straight to a full basket's collection
  fires none, nor does a visitor's left find (owner Q4).

### The finds (10 per world, 60 in all; PROPOSED lists, Q6)

The rules for the lists:

- No find is a creature on the roster or a v1 visitor.
- Feathers are left by their visitor through its `leaves` id (Steller's jay, gull,
  heron, nighthawk), as well as being found.
- No two finds in a world read as the same blob at 16 cells (finding #18). The pebble and
  dust near-duplicates are replaced with distinct shapes. Replacements are **PROPOSED
  copy** (marked ⟲): wild strawberry, tiny mushroom, crystal cluster, brass key, cork
  float, heron feather, paper star, tiny rocket, little lantern.
- "Gift" finds come only as gifts (§5).

| World | Common (weight 10) | Uncommon (weight 4) | Rare ★ (weight 1) | Gift only |
|---|---|---|---|---|
| Woodland | pine cone, acorn, maple seed, wild strawberry ⟲ | jay feather, snail shell (rainy), chanterelle (autumn, rainy or foggy), frosted leaf (snowy) | four-leaf clover (sunny) | acorn-cap cup |
| Terrarium | tiny mushroom ⟲, dried flower, curled bark, seed pod | a shed skin, crystal cluster ⟲, dew drop (foggy), pressed moss | tiny fossil | pressed fern |
| Hearth | button, ribbon, spool of thread, cookie | lost sock, toy mouse, thimble, pine sprig (snowy or winter) | brass key ⟲ | tiny knitted heart |
| Tidepool | green sea glass, scallop shell, periwinkle shell, sand dollar | blue sea glass, gull feather, sea urchin shell | red sea glass, message in a bottle (rainy) | pearl |
| Pond | lily flower, cattail fluff, cork float ⟲, water-snail shell | heron feather ⟲, willow leaf, reed whistle, frogbit leaf (sunny) | golden koi scale | paper boat |
| Night Sky | stardust, paper star ⟲, moonflower (night), constellation card | nighthawk feather, tiny rocket ⟲, moonstone (full moon), little lantern ⟲ (night) | fallen star (night, not rainy) | tiny telescope |

Each world has 10 finds: one gift-only, and nine found in the basket. The duck feather is
swapped for a heron feather (a duck hinted at the player's own duckling; the heron is a
Pond visitor and leaves it). ⟲ marks PROPOSED replacements for the owner to pick.

### Data

`worlds.json` gains, per world:

```json
"finds": [{"id": "pinecone", "name": "pine cone", "a": "a pine cone", "weight": 10, "when": null},
          {"id": "stardust", "name": "stardust", "a": "some stardust", …}, …]
```

- `when` is null, or a **list of lists: an OR of ANDs** (finding #3). `[["autumn","rainy"],
  ["autumn","foggy"]]` is "autumn and (rainy or foggy)" written out; `[["snowy"],["winter"]]`
  is "snowy or winter"; `[["night","!rainy"]]` is "night and not rainy". A `!` prefix is
  NOT. Tokens: `rainy snowy sunny foggy night full_moon autumn winter`. `null` means
  always; `[]` and `[[]]` are invalid (V-B review #19), as is an unknown token: the catalog
  skips such a find with a warning, and the tests fail it.
  **A pytest and a Node test check that every `when` token is a known flag** (a typo would
  otherwise be a find that never comes).
- `leaves` (on a visitor, not a find): the find id it leaves (finding #5). The same test
  checks that it names a find of that world.
- `gift_only: true` marks a gift-only find.
- `a` is the name with its article ("an acorn", "some stardust", "some cattail fluff").
  Lines use `<a find>`, so none says "a acorn" or "a stardust". A Node test checks that
  every find has an `a`, and that it starts with "a ", "an " or "some ".

The server reads it in `species.py` beside the roster: **`Catalog.finds` reads every world
in `worlds.json`, ready or not, as `visitors` does** (V-B review #14), so a world gone
not-ready keeps its finds known. **Find ids are unique across worlds** (a test holds it,
V-B review #10). The card reads names and art from the same file.

## 3. The basket (card)

- **Where it sits.** A small basket at the scene's bottom edge, on the side away from the
  pet's spot. It sits on the deco's line (`bottom: 6%`) and is drawn **12 world cells**
  wide (`calc(var(--px) * 12)`). (Its canvas is 48 px, a 12-cell grid: one basket drawing,
  not a find, so finding #18/#23 doesn't touch it.)
  - It shows only when the basket has something in it.
  - **No number.** The art shows 1, 2 or 3 things peeking out (`basket_<n>.png`), which is
    a picture, not a count.
  - Compact layout: **shown too** (owner, 2026-11-02; it was hidden, as `.compact .deco` is).
    Same basket and same tap rules, drawn at the compact card's own `--px`; the 44 px tap box
    still holds. It sits at the screen's bottom right, clear of the buttons and the pet's spot.
- **Open the card** with something in the basket: nothing is said, and the basket sits
  there. (A "look!" line would turn it into a chore.)
- **A tap on the basket** sends `virtual_pet/collect {entity_id}`. The reply is
  `{finds: [...]}`, in order, each `{id, world, new, from?}` (V-B review #10: an old world's
  find shows that world's art and line). The card reveals them one by one, 2.5 s each:
  - the find pops up over the basket, drawn **16 cells wide** (its art is drawn at 16 cells,
    so the scale is 1:1, finding #23);
  - the pet says its line (§7);
  - a first-ever find gets a small sparkle.

  Calm (reduced motion): the find appears still, with no pop.
- **Under the 2a classes** the reveal is **flavour started by a person**. It runs only when
  the queue is free (`_mayInterrupt`). A care line that arrives mid-reveal wins, and the
  rest of the reveal is shown without lines.
- **A pat** while revealing: the wiggle only (the v1 rule).
- **Two screens tapping at once.** The server reads and clears the basket with **no `await`
  between** (atomic on the event loop; there is no coordinator-wide lock, only
  `_chores_locks`, finding #13), so the first tap gets the finds and the second gets `[]`.
  The second screen's basket just goes, without a line.
  - **As built (V-B review #11, #18):** the sync `PetCoordinator.collect()` reads and clears
    (only known entries, V-B review #9) and `_publish()`es, so every screen's
    `house.basket` drops at once; no `_advance` first. The ws handler awaits nothing before
    it, sends the reply, then **saves at once** (`async_save_now`), so a crash can't bring
    the basket back.
  - **`house.basket`** (V-B review #12) is always a key: an int 0-3, the known entries
    waiting. `house.basket` has no ids (the `found` moment does name each find, §8, and a
    find in the basket already counts as met, V-D; review C9). V-C picks
    `basket_<n>.png` from it; 0 hides the basket.
- **The tap target** is a `<button>` with `aria-label` "the basket". It is not a pet tap,
  so it never counts as a pat.

## 4. The collection (card page)

- **Where:** a "finds ›" link at the foot of the journal (`_renderJournal`,
  `hatch-pet-card.js:6595`), next to "‹ status". The page has its own `jhead`: "finds · <world>".
- **Content: this world only.**
  - **Visitors:** 3 tiles, each the `_1` frame.
  - **Finds:** a tile per find in `worlds.json` order. A met one is drawn with its name; an
    unmet one is a dark silhouette (CSS `filter: brightness(0) opacity(.3)`, no new art), with
    no name and no "???". **A find with any `when`** (weather, season, night, full moon) has
    no tile at all until met, as the gift-only one (owner, 2026-11-02; §13b #2), so 5-8
    silhouettes show per world.
  - **Gift-only finds** (§5) are **never in the house collection** (R3, finding #7). They
    appear only on the receiver's own screen, from their own `gifts` list, with the ♥.
    Before that, no tile and no silhouette, so there is no hole to fill. A shared screen
    never shows one.
  - **No total, no "x of y", no bar.**
  - On the viewer's own screen only, gifts get a small ♥ on their tiles (§5). **This is
    V-D's card** (V-E review #20: there is no separate ♥ page): it reads `gifts` when the
    reply has it and draws nothing extra when it doesn't, so V-E has no third card touch.
    Any ordinary find received as a gift also gets the ♥, but is a tile in the house
    collection only if it was *found* (a gift alone never credits the house).
  - **Decided, owner Q2 (V-E review #19; 2026-11-02):** an ordinary find this person got
    *only* as a gift is drawn with a ♥ on their own (unshared) page; the house's page, a
    shared screen and everyone else's show it unmet until it is found. A gift-only find they
    received is drawn with a ♥, on their screen only.
- **Read on open:** `virtual_pet/collection {entity_id, shared}` (a websocket command).
  - **`vol.Required("shared"): bool`, as `subscribe` has** (finding #6): the client sends
    it per subscription (`__init__.py:481,498`), so the server can't tell otherwise.
  - It returns `{world, visitors: [id], finds: {id: first_on}}` (found finds only, never a
    gift), plus `gifts: [id]` for the caller **only when `shared` is false** (V-E review
    #17, built in V-E1): `collection_view(user, shared)`; the key is absent when shared,
    else `[]` or the ids of this world's known finds in the caller's own `gifts` (the
    same per-world scope as `finds`; the gift-only one included).
  - The data stays out of sensor attributes: it only grows.
- **Kept by the device**, like `bonds` and `firsts` in `lay_egg` (`model.py:1665`), so it
  grows across generations.
  - It is keyed by world (`{world: {visitors: {id: day}, finds: {id: day}}}`), because the
    next egg may change worlds.
  - Each world's page shows only its own entries. A device that changed worlds keeps both.
  - The dates are local days, and no user is stored.
  - Unknown ids (a world, visitor or find no `worlds.json` knows, e.g. a later version's
    before a downgrade) are **kept in the save** and skipped wherever the collection is
    counted or shown (finding #12; V-A audit #1, owner 2026-11-01), so an upgrade back
    loses nothing. Only the day's `visit` is checked at load (it only affects play).

## 5. Gifts (per person, private)

From check-ins item 1: "I saved this pine cone for you! ♥", with "good variety" (owner,
2026-10-28). The V-E review (s2596, findings #1-#21, "V-E review #n" below) is folded in;
the server half is **built as V-E1** (see "V-E1 as built" under §11), the card half is
V-E2.

- **To whom (Q2).** Every friend at **bond level 3 or more** (`R.BOND_FRIEND_LEVEL`), each
  on their own clock, never ranked.
  - About once every 6-8 days per person (`R.GIFT_EVERY_DAYS` (6, 8), jittered), the pet
    sets aside one find for that person.
  - It is not "the person it's closest to". Picking one person would rank people (the
    taste rule) and would show who ranks first.
  - Two friends each get their own gifts, on their own days.
- **The clock (V-E review #8, first mate: as recommended).**
  - (a) `model.gift_tick(state, now, world, finds, flags, rng)` runs in `_tick` after
    `_roll_find`, outside `advance`, and only once the house has been read
    (`_find_flags` set; the conditions need it).
  - (b) It runs on the wall clock in every stage but the egg. A nap, the night and away
    don't pause it: "every 6-8 days" are calendar days, and a gift just waits.
  - (c) None on a level-3+ bond schedules `now + uniform(6, 8)` days with no gift, so an
    upgrade or reaching level 3 brings no burst.
  - (d) While a gift waits the clock is left alone. **On the take**, `next_gift_at = now
    + uniform(6, 8)` days.
  - (e) More than 8 days ahead means the clock went back: scheduled again, no gift.
  - (f) One gift per due clock, never caught up.
  - (g) Not in `shift_times`.
- **What (V-E review #9, first mate: as recommended).** `model.pick_gift`, never
  `pick_find` and **never `add_find`** (that would credit the house page: the R3 leak).
  - First, the world's gift-only find, at 1 in 6 (`R.GIFT_ONLY_CHANCE`), only while this
    person hasn't had it, and never again after.
  - Otherwise the world's other finds by `find_weight(f, flags)` (conditions apply, with
    the R5 fallback at weight 1), with the rarer tiers doubled (`model.gift_weight`, was `GIFT_TIER_WEIGHTS`:
    10, 4, 1 → 10, 8, 2), and ×0.2 (`R.GIFT_HAD_WEIGHT`) for a find this person was
    already given. **No** house ×0.5: the house's collection plays no part.
  - `gifts` gains an id only if it's absent (so at most 60). The gift-only finds'
    placeholder `weight: 1` in `worlds.json` stays unread.
  - Variety is per person, so each friend can get their own one-of-a-kind.
- **Given at their next look**, on **their own** screen (V-E2, the card):
  - V5 "saved this <find> for you ♥" (V6 for a gift-only find, V7 for a baby; §7);
  - the find pops up **by the pet's head**, a gift variant of the reveal (V-E review #5):
    `.reveal.gift`, with no basket picture (`.rb`), the basket left as it is, no `burst`;
    the pop is the queued line's `then` (`_queue` `opts.then`), so picture and line
    arrive together. (Planned "above the pet"; built up on the pet's right, since the
    space straight above is the bubble's: see "V-E2 as built".)
  - **First-look order (V-E review #6).** `_firstLook` is synchronous and the reply is
    async. So: the existing lines, then **reserve the gift's slot** (only if
    `s.mine?.gift && !sharedScreen() && lines.length < FIRST_LOOK_LINES`), then the
    missed visitor only if room remains. **The gift wins over the missed-visitor line**
    when there is room for one (review Q3; first mate, 2026-11-01: the missed visitor is
    house flavour said again in the away note, the gift a one-time personal line). Then
    `collect {gift: true, shared: false}`; on a non-empty reply `_queue` V5/V6/V7 as
    **KEPT** (said once; waits through a nap like other kept lines). Empty or an error
    (an older server): nothing, and the slot goes unused.
  - **A gift that arrives while the card is open (V-E review #7; owner Q1, 2026-11-02:
    as recommended).** Said at the next first look, or when the tab comes back after
    being hidden at least `AWAY_NOTE_AFTER_MS`; never an interruption while you watch.
  - Not on a shared screen; there it waits. Nothing expires: a gift waits as long as it
    has to, and a second gift doesn't come until the first is taken.
  - **Two screens (finding #14).** A person may have two screens (phone and laptop), and
    both get `mine.gift`. The card calls `collect {gift: true}` **first** and speaks and
    pops **only if the reply is non-empty**; the second screen gets `{gift: null}` and
    stays quiet.
- **`collect` for a gift (V-E review #1, #2, #18).**
  - Schema: `vol.Optional("gift", default=False): bool`, `vol.Optional("shared"): bool`
    (no default: HA rejects extra keys, and V-C's tap sends only `{type, entity_id}`).
  - `gift: true` is refused with error `shared` unless `shared: false` was sent
    outright (absent or true). Without `gift`, the basket path is unchanged and `shared`
    is ignored. The gift path never touches the basket, and the basket path never
    touches the gift.
  - The reply is `{"gift": {id, world}}` or `{"gift": null}` (not `finds`, so the basket
    parser can never pick it up).
  - The take is read-and-clear with no await, then `_push_watchers()` only (the caller's
    own `mine` changes, so only their screens are sent anything), then `async_save_now`.
    No `_advance`, no `_publish`, no `_fire`.
- **Saved in the bond (V-E review #4):** `bonds[user].gift = {id, world}` (waiting; the
  world is the one it came from, so a gift that waited across a world change still
  shows its own art, V-B review #10), `bonds[user].gifts = [id, …]` (received, **ids
  only, no dates**, R6; ids are unique across worlds), and `bonds[user].next_gift_at`.
  No `day` in the gift: nothing read it, and it would be a date in the bond.
  - Bonds already carry into the next generation and are redacted whole in diagnostics
    (`REDACT_STATE` has `bonds`).
  - **Unknown ≠ bad (V-E review #14).** A waiting gift, or a `gifts` id, that no
    `worlds.json` knows (a later version's, after a downgrade) is kept. `mine.gift` is
    null for it, `collect {gift}` returns null and leaves it (it blocks that person's
    next gift: acceptable, it is the later version's), and `gifts` replies skip it.
  - **A taken gift never enters the house collection** (R3, finding #7). It shows only on
    the receiver's own screen, as ♥ on their tiles on **the collection page (V-D's card)**
    (V-E review #20), from `bonds[u].gifts`. A house-wide `finds` map would otherwise
    tell the household that someone got a gift that day (with two friends at level 3+,
    it names them).
- **Privacy, the bar (privacy plan F1; V-E review #12, #13, #21).**
  - The gift reaches the person only through `mine` (`_mine`): `mine.gift = {id, world}`
    or null, and the `collection` reply's `gifts` when `shared` is false.
  - **No event of any kind**: no `gift_*` event, no `found` for a gift, no moment, so no
    bus, no `_notify` push, no `debug["last_events"]`, and no personal moment
    (`_private`, which would also notify and which `forget_me` wipes while the bond keeps
    the gift).
  - Never on a sensor, never in `_house_view`, never in `bond_for` (the voice/LLM
    context), no `debug` key, never named on a shared screen.
  - On the card: never written to `localStorage`, and the ♥ state is dropped on a
    `SHARED_EVENT` flip, as `_dropPhotos` does.
  - **`forget_me` is unchanged.** It erases the people store and leaves bonds
    (`__init__.py:386`, privacy plan FB). Gift data lives in the bond, so it stays with the
    bond, as the nickname and photos already do. If the owner wants gifts erased too, that
    is a change to FB, so it is part of Q2.
- **Bonds: none (Q7).** A gift is a *result* of the bond. Taking it gives no points,
  otherwise a waiting gift would become a reason to log in.

## 6. Save, schema, migration

| Field | Shape | Carried by `lay_egg` | Validation (F5) |
|---|---|---|---|
| `visit` | `{day, world, id, hours, from, until, credited}` or null | yes; a `world` that isn't the current one counts as no visit (on load too), so no special case in `lay_egg` | dict with str `day` and `world`. Else null, and the next tick re-picks. |
| `basket` | list of `{id, world, new, from?}`: up to 3 known entries, plus any unknown ones | yes (finds wait, even across a world change) | list of dicts with str `id` and `world`; `new` is `is True`; a `from` that isn't a str is dropped; a later version's keys are kept. **At load the first 3 known entries and every unknown one are kept** (V-B review #9, `trim_basket`); unknown entries don't count toward the 3, aren't counted in `house.basket`, and `collect` leaves them in place. No `at` (V-B review #17: nothing read it). |
| `next_find_at` | float or null | **no: `lay_egg` sets None** (V-B review #8 e) | `_float`, else None; lifecycle in §2 "The find clock" |
| `collection` | `{world: {visitors: {id: day}, finds: {id: day}}}` | yes | the world key is a str, the inner maps are str→str; a bad world is dropped, the rest kept |
| `bonds[u].gift` | `{id, world}` or absent (V-E review #4) | (bonds already) | kept only if a dict with str `id` and `world` (a later version's keys in it kept), else deleted alone. **`_bond` must never raise**: `bonds_from` drops the whole bond on an exception (V-E review #3). An unknown id is kept (#14). |
| `bonds[u].gifts` | `[id, …]` (ids only, R6) | (bonds already) | a list, filtered to str, each once; not a list: deleted. Unknown ids kept (#14). |
| `bonds[u].next_gift_at` | float | (bonds already) | `_num`, else deleted; lifecycle in §5 "The clock" |

- **A world change (the next egg in another world).**
  - Each basket entry also stores its `world`. A find from the old world stays in the
    basket and is revealed with the old world's art and line, and credited to that world's
    page. A find is never dropped for being from another world.
  - An id that no world in `worlds.json` knows is kept in the save and skipped where it
    would be counted or shown (finding #12, V-A audit #1); nothing is dropped at load.
  - The day's `visit` carries its `world` (finding #9). If the egg brings a new world, the
    mismatch makes it no visit, so `lay_egg` doesn't need to know the world; the next day
    picks from the new world. v1's catch-up line then has nothing to say that day.
- **No migrate function.**
  - `PetState.from_dict` already defaults missing keys and keeps unknown ones
    (`model.py:401`), so an old save loads with an empty basket and collection.
  - A downgrade keeps the new keys for the next upgrade (the `unknown` dict).
  - `PetStore._async_migrate_func` stays a no-op.
- **`STORE_MINOR_VERSION` stays 1** (finding #19). The bump would only make HA call the
  no-op migrate and save again, and nothing reads the marker. Bump it later if a
  migration needs it (that consumer would name it).
- **Salvage (finding #8).** `model.py:567-591` `salvage` keeps only name, generation,
  species, raised, journal, memories and bonds. It gains **`collection`** and the day's `visit` (V-A audit #4), and `basket` (V-B),
  so a damaged save doesn't wipe the device's lifelong collection. Tested under F5.
- **Seeding the collection on upgrade:** none. It starts empty. (v1 saved nothing, so
  there's nothing to credit.)
- **pytest** (`tests/test_model.py`, `tests/test_init.py`):
  - the round trip of each field;
  - a damaged value of each field loads, with the rest kept; `salvage` keeps `collection`
    and `basket` (finding #8);
  - an old v1 save loads empty;
  - `lay_egg` carries `collection`, `basket` and `visit`, and sets `next_find_at` None;
  - the day plan survives a restart (no re-roll);
  - a `visit` with another `world` counts as no visit, on load and in `_house_view`;
  - the 4-in-7 and 21-day properties over 365 days (with an unseeded `self.rng`, finding #11);
  - crediting at window end, seen or not, in the egg stage and away (R4);
  - HA down 22:00 to 08:00 next day: the old visit is credited, then today's picked
    (finding #10);
  - the visitor's left find; basket full: the find goes to the collection, not the basket
    (V-B review #6);
  - the find roll: none away or egg; none asleep except Night Sky (R2); a full basket still
    rolls and the extra goes to the collection (R1); the 90-day coverage run on the real
    sleep hours, and with no weather entity and a tropical latitude (findings #1, #21);
    every `when` token is a known flag; a `leaves` id names a find of its world;
    gift-only never rolled or left (moved from V-E, V-B review #15);
  - `collect`: the ws handler driven twice back to back gives `[…]` and `[]` (V-B review #11);
  - gift (built in V-E1, `tests/test_gifts.py`): a bad `gift`/`gifts`/`next_gift_at`
    each dropped with `points`/`nickname`/`photos` intact, and `salvage` and `lay_egg`
    keep them (V-E review #3); unknown ids kept, never shown or taken (#14); the clock's
    rules (a)-(g) one by one, and level 3 and level 10 at the same rate over a year
    (#8); the weighting and the gift-only draw (#9); a taken gift never enters the house
    `collection` or `finds` map (#9 a, R3); `gifts` holds ids only, once each (R6);
    `collection {shared: true}` has no `gifts` (#17; `test_finds`'s V-D0 sameness test
    rewritten); `collect {gift: true}` with `shared` absent or true is refused, V-C's
    `{type, entity_id}` still opens the basket and leaves the gift (#1); the take pushes
    only the taker's `mine`, publishes nothing and saves at once (#2);
  - a gift is never on the sensor, the bus, `_house_view`, `bond_for`, a push, `debug`,
    `_private`, the moments, the shared collection reply, another user's `mine` or the
    shared snapshot; every check uses the gift-only id `acorncup` (V-E review #11, #12,
    #21), and `test_public`'s scripted day has a set-aside and a take;
  - `forget_me` leaves the bond and its gifts (FB as decided);
  - diagnostics redact it.

## 7. Copy (all PROPOSED; the owner picks)

Every line passes the no-nagging scan (experience plan §5), which now **names the new
table** (finding #16): the loops at `card-check.js:3604` and `:4250` walk `BABY` (:3590) and
`PERSONA` (:4240) only, so V-C extends them to the V1-V11 table. :4250 also caps a line at
40 characters; V5 with "message in a bottle" is 43 and V6 with "tiny telescope" is 42, so
the length check runs on the **longest find name**. Settled by §13b #3: the lines were
shortened and the 40-character cap stays (V5 with "message in a bottle" is exactly 40,
which passes `> 40` with no margin; V-E review #10). Every line: no "!!!", no word repeated
more than twice in a row, none of "still", "again", "why", "never", "pleas", "sad", "cry",
"alone", "forgot", and no `?` that asks the person for something. Lines name no person,
except the gift's "you" on the receiver's own screen. Route `_lines` (baby talk where
noted), `catch` off.

| # | Where | Proposal |
|---|---|---|
| V1 | Reveal, a find | "<a find>! ♪" · "look, <a find> ♪" · "ooh, <a find>~" (one, by `dailyPick`) |
| V2 | Reveal, a first-ever find | "<a find>! a new one ✦" |
| V3 | Reveal, a find a visitor left | "the <visitor> left <a find> ♪" |
| V4 | Reveal, baby | `BABY.visit`'s own babbles ("yay yay!", "hehe!"), as a new key `BABY.find` reusing them; no new words |
| V5 | A gift, first look on the receiver's screen | "saved this <find> for you ♥" (approved, §13b #3; the scan runs it over every non-gift-only find, ≤ 40) |
| V6 | A gift-only find given | "made this for you ♥" (`acorncup`, `knittedheart`, `paperboat`) · "found this for you ♥" (`pressedfern`, `pearl`, `telescope`); no find name (approved, §13b #3). The made ones are a card constant `GIFT_MADE`, with a Node test that its ids are gift-only ones (V-E review #10). |
| V7 | A gift, baby | `BABY.gift = ["for you! ♥"]` |
| V8 | Away note bit (`MOMENT_BITS.found`) | "found <a find>" (joins "napped, watched the rain, …") |
| V9 | Collection page head / link | "finds · <world>" / "finds ›" |
| V10 | Collection, a visitor tile's caption | its `name` (v1 roster) |
| V11 | Basket `aria-label` | "the basket" |

V5-V7 have no personality variants and no `withName` nickname (V-E review #10): the
V-E2 worker invents none.

Cut on purpose (they nag or ask): "the basket is full!", "come see what I found",
"<n> new finds", "collect them all", "you have a gift waiting" on a push.

## 8. Privacy summary (privacy-hardening ground rules)

| Data | Who sees it | Channel | Recorded? |
|---|---|---|---|
| Today's visit plan | every screen | `_house_view` | no |
| Basket contents | every screen: `house.basket` is **how many** (0-3), with no ids; the `found` moment does name each find that went in (for the away note, below) | `_house_view` (`house.basket`, an int, V-B) | no |
| `found` moment | every screen, the away note | moments + bus (no user) | the bus, like other house moments |
| Collect (tap) | the caller | **websocket** `virtual_pet/collect` (not a service and not a button, because a service's `call_service` row records `context_user_id`, rows M/O) | no |
| Collection | the person who opens it | websocket `virtual_pet/collection` | no |
| Collection read (V-D0, built) | any login, read-only too; the same reply for `shared` true or false until V-E1 | `virtual_pet/collection {entity_id, shared}` reply: ids and local days, no user, no gift; a pure read (no advance, save or publish) | no |
| Collection read (V-E1, built) | as above, plus the caller's own `gifts` when `shared` is false | `virtual_pet/collection` reply | no |
| Waiting gift, gift list | **only that person, own screen** | `mine.gift` (`{id, world}` or null), the `collection` reply's `gifts` (only when `shared` is false), the `collect {gift: true, shared: false}` reply | no; ids only, no dates; redacted in diagnostics; kept with the bond by `forget_me`, as FB decided (Q2); no event, push, debug, `_private` or `bond_for` (V-E review #12) |

- A shared screen shows the visit, the basket, finds and the collection without gifts. A
  gift stays waiting.
- **What "own screen" means (V-E review #13).** The bar is the person's own login, on a
  screen not switched to shared: the same as `mine`. `shared` is the client's own claim
  (a per-browser `localStorage` switch, as on `subscribe`), so the server's refusal of
  `collect {gift: true}` without `shared: false` is defence in depth against a card bug,
  not against the account holder. A family account used as a personal login sees that
  account's gifts, as it sees its bond.
- **Read-only logins can open the basket.** It changes nothing but the basket, like a pat.
  The next-egg pick (C13) needs control because it changes the pet's future; this doesn't.
- No `context=` on any new `_fire`.

## 9. Art

| Set | Count | Canvas | Path | Notes |
|---|---|---|---|---|
| Finds | **60** (10 × 6) | **64 × 64** = 16 × 16 world cells at 4 px (`WORLD_GRID` 64) | `frontend/ui/find_<world>_<id>.png` | One frame each, centred, transparent, the 128 sprites' dark outline, the world's palette (`scripts/art/palette.py`). Read alone at 16 cells (finding #18: 12 cells made the pebbles and dusts near-identical blobs). Shown **16 cells wide in the reveal and in the collection**, a 1:1 whole-pixel scale via `--px` (finding #23: 16/12 was not whole). v1's visitors are 18 × 18. |
| Basket | **3** (1, 2, 3 things peeking) | 48 × 48 | `frontend/ui/basket_<1\|2\|3>.png` | One shared basket, neutral wicker; no per-world variants (Q8 could add them). The peeking things are generic, not the actual finds. |
| Silhouettes | 0 | — | — | A CSS filter on the find's own art |
| Visitors | 0 | — | — | v1's final 36 are reused; a collection tile uses `_1` |

- **Stand-ins first:** `art/finds/make_finds.py` writes simple shapes in code, as
  `art/visitors/make_visitors.py` did, so slices V-B and V-C can ship and be felt on a phone.
- **The real batch:** 63 images is one request through the art coordinator to the Hatch
  API Art session (Luna or Sol). Prompts and runs stay in gitignored `private-content/`,
  inside the Codex image budget (about 100 per 5 h).
  - It queues **after** stage 1's poses, the wave and winter (the Luna queue order, owner
    Q7).
  - Each world's art merges with its stand-in swap.
  - The ⟲ replacements (§2) are settled before the request, so no pebble or dust blob is
    drawn twice.

## 10. What stays card-only

- The visit's look:
  - the walk and flap;
  - the edge stop and the side coin;
  - the greet pose (`acts.cheer`, later `acts.wave`) and its line;
  - the calm still;
  - the 10 s on show, the 20 s look, and the 2 min apart from links and seasons.
- The night/dim scene check, and "this screen already played it" (`oncePerDay`).
- v1's catch-up line, now fed by the server's plan.
- The reveal's pop, sparkle and lines; the basket's picture; the silhouettes.
- Which line is said (`dailyPick`) and baby talk.

## 11. Slices

**Anything touching the save is tier 2.** Order: V-A first. V-B and V-C, then V-D, can
follow in either order. V-E comes last, split by the V-E review: **V-E1** (server, built)
needs nothing from V-D's card, and V-C's card ignores `mine.gift`; **V-E2** (card) needs
V-C only.

| # | Slice | Size | Tier | Art | Needs |
|---|---|---|---|---|---|
| V-A ✅ | **Built** (s2582; "V-A as built" below). **The server owns the day's visit**: `worlds.json` `visitors` (with `leaves`); `PetState.visit` with `world` (#9); `_daily_visit` (rng only for the window hour, #11; credit-then-pick on rollover, #10); crediting at window end into `collection[world].visitors`, in every stage (R4); `_house_view.visit`; the card plays from `house.visit`, with the `visitorDay` fallback and the once-a-day flag keyed by `visit.day` (#22); `salvage` keeps `collection` and `visit` (#8, audit #4); unknown ids kept in the save, skipped where counted or shown (#12, audit #1); F5 validators, `lay_egg` carry; **no `STORE_MINOR_VERSION` bump** (#19); pytest; card-check `visitors` extended (crossing the browser's midnight) | M | **2** | none | Q1-Q8 decided |
| V-B ✅ | **Built** (s2591; "V-B as built" below). **Finds and the basket, server**: `worlds.json` `finds` (the `when` grammar, #3; the ⟲ lists, #18; `leaves` ids, #5: V-A already wrote `jayfeather`, `gullfeather`, `heronfeather`, `nighthawkfeather` on the visitors, so the feathers take those ids); unknown find ids in `collection[w].finds` and the basket kept in the save, skipped where counted or shown (V-A's rule, audit #1: no drop at load); the roll with `night`, `full_moon`, `P.season` and the rare fallback (#1, #4, #21, R5); rolls continue while full, extras to the collection (#2, R1); Night Sky rolls asleep (R2); `basket`, `next_find_at`; the visitor's left find; the `found` moment (no consumer yet, #20); `_house_view.basket` (#20); `virtual_pet/collect` (ws; read-and-clear with no `await`, #13); `salvage` keeps `basket`; validators; the stand-in script and 60 finds at 64 px + 3 baskets at 48 px (#23, V-B review #16); pytest incl. the real-sleep-hours 90-day run and the `when` token check | M | **2** | stand-ins | V-A |
| V-C | **The basket and the reveal, card**: the basket button, the reveal queue, lines V1-V4 and V8, calm, compact; the reveal at 16 cells (#23); the no-nagging scan extended to the V1-V11 table, with the longest-name length check (#16); the bench `house` fixture (extending `--mine`, #15) plus `--preset finds`; card-check `finds` (ws spy, not a DB read, #17) | M | 1 | stand-ins | V-B |
| V-D ✅ | **Built** (s2600; "V-D as built" below). **The collection page**: `virtual_pet/collection {entity_id, shared}` ws read (#6); no gift in the house `finds` map (#7, R3); the journal's "finds ›" link; tiles at 16 cells and silhouettes; **the ♥ on the viewer's own gift tiles, read from `gifts` when the reply has it (moved here from V-E, V-E review #20; a gift-only-received ordinary find is drawn, owner Q2)**; the bench `--collection` fixture; card-check | M | 1 | stand-ins | V-B |
| V-E1 ✅ | **Built** (s2597; "V-E1 as built" below). **Gifts, server**: bond `gift {id, world}`/`gifts` (ids only, R6)/`next_gift_at`, never raising in `_bond` (V-E review #3, #4, #14); the per-person clock (#8); `pick_gift` (#9); `mine.gift`; `collect {gift: true, shared: false}` (#1, #2, #18); `collection` `gifts` (#17); no event, push or debug (#12, #21); the privacy pytest with the gift-only id (#11) | M | **2** | none | V-B, V-D0 |
| V-E2 ✅ | **Built** (s2601; "V-E2 as built" below). **Gifts, card**: the first look V5-V7 with the reserved slot (V-E review #6), `.reveal.gift` above the pet (#5), `GIFT_MADE` and `BABY.gift` (#10), the ♥ state dropped on a shared flip (#12), the error reply swallowed (#1); the bench `gift` field and `--preset gifts` (#16); card-check `gifts` (#15); owner Q1 decides when a gift arriving while the card is open is said (#7) | M | 1 | none new | V-C, V-E1 |
| V-F | **Final art**: 60 finds (64 × 64, #18) + 3 baskets, one world per commit, each swapping its stand-ins | M (art-bound) | 1 | 63 | V-C; the Luna queue; the ⟲ picks |

**V-A as built (s2582, for V-B onwards):**

- `worlds.json` `visitors: [{id, name, hours, leaves?}]` per world, in v1's order (the
  fallback's turn is an index). `species.Catalog.visitors` reads it from **all** of
  `worlds.json`, ready or not, so a world whose species go not-ready keeps its page.
- `model.py`: `PetState.visit` and `collection`; `_visit` and `collection_from` (F5:
  `collection_from` keeps each page's `finds` map and any later keys, so a V-B→V-A
  downgrade loses nothing); `visit_turn` (the day index plus the 31-hash of
  `visit|<entry_id>`, no rng), `live_visit`, `credit_visit`, `daily_visit`. `lay_egg`
  deep-copies `visit` and `collection`; `salvage` reads `collection` and `visit` (V-B adds
  `basket`).
  Rates: `R.VISIT_CYCLE_DAYS`, `VISIT_DAYS`, `VISIT_HOURS`, `VISIT_DAY_STARTS`,
  `VISIT_NIGHT_STARTS`.
- **The visitor's left find (V-B)** was planned to hook into `model.credit_visit`; V-B put
  it in `daily_visit` right after `credit_visit` returns True instead (V-B review #6), and
  `credit_visit` is unchanged.
- Coordinator: `_daily_visit` runs on **every** tick (no awake or sleep-hours gate, R4).
  `_check_visits` runs after load and checks only the visit: a saved visit from another
  world, or by a visitor this world lacks, becomes a no-visit record
  `{day, world: <current>, id: null}` for the same day, so that day has no visit
  and the next day picks from the current world (§1, §6).
- The collection keeps every world and id as saved, known or not (V-A audit #1); whatever
  counts or shows it (V-C's `virtual_pet/collection`) skips the ones `known_visitors` (and
  V-B's find catalog) lack.
- A pick never overwrites a visit still waiting for its credit, even on a new day (a
  time-zone change): it waits while `until - now <= VISIT_HOURS*3600 + 1 day`. A visit
  further ahead was picked by a clock that ran ahead (a bad RTC before NTP, a snapshot): it
  is dropped, not credited, and today's is picked (V-A audit #2).
- `_house_view.visit` is sent while `from <= now < until` whatever its day (HA's zone
  moving east across midnight mid-window, audit #5), else only on its own day.
- **`house.visit` is always a key**: `null` on a day with no visit, from another world, or
  not today. The card falls back to `visitorDay` only when the channel is up and the key is
  absent (a true old server, audit #3). With no channel it plays and says nothing.
  Otherwise a no-visit day would play v1's pick.
- Accepted as is (audit #6, #7): an egg laid into a new world mid-window loses the old
  world's uncredited visit (§6); a night visitor plays only on a `night`/`dim` screen, a
  day visitor only on a day screen, though both are credited.
- Card: `VISITORS` became `VISITOR_PLAY` (play data by id) plus `visitorList(world)`. The
  bench (`scripts/bench.js`, `dev/bench/page.js`), card-check and `tests/js` read the roster
  from `worlds.json`. The window is compared with `serverNow()`. The flag key is
  `hatch-visit-<device>-<toDateString of house.visit.day>`, so `DATED_KEY` still prunes it.
- Tests: `tests/test_visit.py` (28 cases); `tests/js/visitor_day.test.js` checks that the
  play table and the roster match one for one. card-check `visitors`: the plan, a second
  card in another time zone, the browser's midnight, and no v1 pick without a channel; `restart` seeds today's visit and
  checks it survives a restart.

**V-B as built (s2591, for V-C and V-D):**

- `worlds.json` `finds: [{id, name, a, weight, when, gift_only?}]` per world, 10 each, in
  §2's order (commons, uncommons, rares, then the gift-only one last). Ids (unique across
  worlds): woodland `pinecone acorn mapleseed wildstrawberry jayfeather snailshell
  chanterelle frostedleaf fourleafclover acorncup`; terrarium `tinymushroom driedflower
  curledbark seedpod shedskin crystalcluster dewdrop pressedmoss tinyfossil pressedfern`;
  hearth `button ribbon spool cookie lostsock toymouse thimble pinesprig brasskey
  knittedheart`; tidepool `greenseaglass scallopshell periwinkle sanddollar blueseaglass
  gullfeather urchinshell redseaglass bottle pearl`; pond `lilyflower cattailfluff
  corkfloat watersnailshell heronfeather willowleaf reedwhistle frogbit koiscale paperboat`;
  nightsky `stardust paperstar moonflower constellation nighthawkfeather tinyrocket
  moonstone lantern fallenstar telescope`. Gift-only finds carry `weight: 1` as a
  placeholder (nothing rolls them; V-E sets the gift weighting). `a` uses "some" for the
  sea glasses, curled bark, pressed moss, cattail fluff and stardust.
- Server: `species.Catalog.finds` (every world, `valid_find`/`valid_when`);
  `home.FIND_TOKENS`, `home.find_flags`, `home.full_moon_by_date`; `model.basket_from`,
  `find_weight`, `can_find`, `basket_known`, `trim_basket`, `add_find`, `pick_find`,
  `roll_find`, `leave_find`, `collect_basket`, `FINDS_ASLEEP = {"nightsky"}`;
  `daily_visit(..., finds=, known=)` (keywords, so V-A's calls stand). Rates:
  `VISIT_LEAVES_FIND`, `FIND_EVERY_HOURS`, `FIND_CHANCE`, `FIND_MET_WEIGHT`,
  `FIND_MISSING_WEIGHT`, `FIND_NIGHT_HOURS`, `FIND_FULL_MOON_DAYS`, `BASKET_SIZE`.
- Coordinator: `self.finds` (this world's), `self.known_finds` (every world's ids),
  `self._find_flags`; `_roll_find` in `_tick` after `_sense_home` and `_daily_visit`;
  `trim_basket` after `_check_visits` at load; `collect()` and `async_save_now()`;
  `_house_view()["basket"]`; `found` in `MOMENTS`.
- **For V-C:** `virtual_pet/collect {entity_id}` replies `{finds: [{id, world, new,
  from?}]}`, `[]` when empty; any login (shared and read-only too). `house.basket` is an
  int, always present (an older server sends no key: show no basket). The card's
  `MOMENT_CLASS` has `found: FLAVOUR` with no line yet (card-check's "every moment type
  has a class"); `MOMENT_BITS.found` (V8) is V-C's. Stand-ins: `frontend/ui/find_<world>_
  <id>.png` (64 px, 16 cells) and `basket_<1|2|3>.png` (48 px), from
  `art/finds/make_finds.py`.
- **For V-D:** `collection[world].finds` is `{id: first day}`, credited when rolled or left
  (a find still in the basket is already met). Skip ids `known_finds` lacks, and
  gift-only ids (V-E puts gifts only on the receiver's own tiles, as ♥, V-E review #20).
- A V-B save round-trips through 0.40.0 and back (checked by hand against its
  `model.py`): `basket` and `next_find_at` sit in V-A's `unknown`, and V-A's `lay_egg`
  copies them; its egg carries a stale `next_find_at`, which on the upgrade back is one
  roll at once, never more.
- Tests: `tests/test_finds.py` (97 cases); `tests/js/finds.test.js`; `test_channel` and
  `test_init`'s send-off no longer lean on the rng's order. No card-check section (V-B
  review #21); card-check runs only to show nothing regressed.

**V-C as built (s2595, for V-D and V-E):** card only, no server change. The review's C1-C12
and P1-P2 fixes, with the first mate's picks:

- **Card** (`hatch-pet-card.js`): `FIND_LINES` (`find` V1, `fresh` V2, `left` V3; functions
  over the find's `a`, V3 also the visitor's roster `name` as is), exported as
  `HatchPetCard.findLines`; `findOf(worlds, world, id)`, `foundBit`, `FIND_STEP_MS` 2500,
  `FIND_LINE_MS` 2200, `FOUND_BITS` 3; `BABY.find` = "yay yay!", "hehe!" (C5). The card keeps
  every world's data as `this._worlds` (a find is shown by its own world, V-B review #10).
- **The basket** is a `<button class="basket" aria-label="the basket">` in each slide's
  screen: 12 cells wide, `bottom: 6%`, **bottom right** inside the porthole's corners
  (`right: calc(5% + var(--edge))`), z-index 3 over the pat box, a 44 px tap box by a
  `::before` (C8). The deco sits outside the device on both sides, so "opposite the deco"
  (C7) couldn't pick a side; right clears the first two poops (left 6% and 18%) and the
  prop; it can sit over the third poop and the season lantern. `_basketSync` (each tick and
  on a house push) shows it when `house.basket` > 0 and there is no reveal, egg, away, game
  or scene; hidden under the status by CSS (compact shows it, owner 2026-11-02). It is **live** (`_basketLive`)
  only when `_visitorLive` holds, out of the egg, not booting, no tap in flight (C1);
  otherwise it carries `.idle` (`pointer-events: none`) and a tap falls through to the
  screen (the status). A sleeping pet's basket shows but can't be tapped.
- **The tap** (`_basketTap`): stopPropagation (never a pat, never the status), the
  re-entry guard `s.collecting`, one `virtual_pet/collect` by `callWS`. While it waits, the
  basket's picture is held (the server's publish of 0 can come first, C2). An error keeps
  the basket; an empty reply shows nothing and says nothing. Finds this card doesn't know
  are skipped, at most 3. A slide that is another pet by the reply drops it.
- **The reveal** (`_revealStart`, `_revealFind`, `_revealEnd`): its own `.reveal` element
  (the basket drawn once as `basket_<n>` and a `.rf` find image 16 cells wide over it), one
  find each 2.5 s, a `.burst` sparkle for `new`, the `pop` animation unless calm. The line
  is `_findLine`: V3 when `from` names a roster visitor (a new one adds only the sparkle,
  C3), else V2 when `new`, else V1 by `dailyPick` salted `world|id` (C4); routed through
  `_lines(s, "find", …)` for baby talk. Flavour by `_line`: the reveal's own line still up
  doesn't hold the next; once anyone else's holds the bubble (`_mayInterrupt` false), the
  rest of the reveal goes without lines. `flairUntil`/`visitUntil` cover it, so a pat only
  wiggles and nothing else starts. Each beat checks `_visitorLive`, else the reveal ends.
- **Visitors wait** while the basket shows (`_basketShows` in `_visitorFree`; and the
  seasonal walker), C7.
- **Away note (V8)**: in `_awayNote`, one "found <a find>" bit per `found` moment, newest
  first, at most `FOUND_BITS` (3), unknown finds skipped; the note still keeps its first
  two bits overall, so the cap of 3 never shows more than 2.
- **Bench**: shot fields `house` (an object over the house view), `basket` (0-3) and
  `reveal` (`{id, world?, new?, from?}` or `{finds: [...], at}`); `--preset finds` (60
  finds at reveal size, the three baskets, porthole, night, the pat box, a sparkle, V3, an
  old world's find, the second of three, baby, calm, compact). No collection shots (C11).
- **Card-check**: `finds` runs after `restart` (it needs restart's seed; `NEEDS.finds =
  ["restart"]`), so it sits between `restart` and `oldcard` in `SECTIONS` rather than after
  `visitors` (P2), which would have put it in another shard than its seed. `restart`'s
  bounce seeds `data.basket` (a met find, a new one, the leaver's own find with `from`) and
  `data.collection[world]` part met (two visitors, three finds, the gift-only id and
  `laterfind`, an id no worlds.json knows) for V-D (P1), and `unseed` puts both back. The
  find lines' scan (V1-V3 over every non-gift find and each leaver's own find, 40 at most)
  joins the personality scan; `find` joins the baby scan's keys.
- **Tests**: `tests/js/find_lines.test.js` (the lines' words, scan and cap; `BABY.find`;
  `foundBit`).
- **For V-D**: the seeded collection page is restart's; `this._worlds` and `findOf` are
  there to use. **For V-E**: the gift's first look can reuse `_revealStart` with one find. (Superseded by
  V-E review #5: `_revealStart` is a basket reveal; V-E2 adds a `.reveal.gift` variant
  above the pet, §5.)

**V-D0 as built (s2594, for the V-D card worker):**

- `virtual_pet/collection {entity_id, shared}`, `shared` `vol.Required` bool (accepted and
  ignored until V-E). Any login, read-only too. Errors: `no_pet` for an unknown entity.
- Reply, exactly: `{"world": "<pet's current world>", "visitors": ["id", ...], "finds":
  {"id": "YYYY-MM-DD", ...}}`. `visitors` is in save order (not roster order: sort by
  `worlds.json` on the card); `finds` is `{id: first day}`. An empty page is `visitors:
  []`, `finds: {}`. The same reply for `shared` true or false (until V-E1, which adds
  `gifts` when `shared` is false).
- Filtered to `known_visitors[world]` / `known_finds[world]`, minus this world's
  `gift_only` finds. Unknown and wrong-world ids are skipped, never dropped from the save.
- Pure read: `PetCoordinator.collection_view()` (sync); no advance, save or publish. Works on an
  egg. V-E adds `gifts: [id]` to this reply, only when `shared` is false.
- Tests: `tests/test_finds.py` (`test_collection_*`).

**V-E1 as built (s2597, for V-E2 and V-D):** server only, no card change.

- `rates.py`: `GIFT_EVERY_DAYS` (6, 8) days, `GIFT_ONLY_CHANCE` 1/6, `GIFT_HAD_WEIGHT`
  0.2, `gift_weight` (10 as is, rarer x2; FM 2026-11-02 after the rarity retune); the level is `BOND_FRIEND_LEVEL` (3).
- `model.py`: `_bond` checks `next_gift_at` (`_num`), `gift` (dict with str `id` and
  `world`, extra keys kept) and `gifts` (list, str only, deduplicated), deleting a bad
  value alone and never raising; `pick_gift(bond, finds, flags, rng)`;
  `gift_tick(state, now, world, finds, flags, rng)` → bool (bonds in sorted user order,
  so the rng's use is stable); `known_gift(bond, known)` → `{id, world}` or None;
  `take_gift(state, user, now, known, rng)` (reads `state.bonds.get`, never creates a
  bond). `salvage` and `lay_egg` needed no change (bonds already).
- Coordinator: `_gift_tick` in `_tick` after `_roll_find` (saves on a change, fires
  nothing; the tick's own update pushes `mine.gift`); `take_gift(user)` (then
  `_push_watchers()` only); `_mine(user)["gift"]` is **always a key**, `{id, world}` or
  null; `collection_view(user, shared)`.
- `__init__.py`: `collect` schema per §5; the gift path replies `{"gift": …}` and saves
  at once on a non-null reply; error `shared`. `collection` passes `connection.user.id`.
- **For V-E2:** call `virtual_pet/collect {entity_id, gift: true, shared: false}` only
  when `mine.gift` is set and the screen isn't shared; treat any error (`shared`, or
  `invalid_format` from a pre-V-E1 server) as "no gift". `mine.gift.world` names the art
  (`find_<world>_<id>.png`), which may be another world's.
- **For V-D:** the reply has `gifts` only when `shared` is false; draw ♥ from it.
- A V-E1 save round-trips through main before V-E1 (`44cb24ba`, checked by hand against
  its `model.py`, V-E review #14): its `_bond` starts from `dict(bond)` and deletes only
  the keys it checks, so `gift`, `gifts` and `next_gift_at` are kept as they are, and
  `lay_egg` deep-copies bonds. Its card ignores `mine.gift`, never stores `mine`, and
  card-check asserts no exact `mine` shape.
- Tests: `tests/test_gifts.py` (20 cases); `test_finds`' V-D0 collection tests rewritten
  for `gifts` (#17); `test_channel`'s `mine` shape gains `gift: null`; `test_public`'s
  scripted day sets aside and takes `acorncup` and scans for it.

**V-D as built (s2600, for V-E2 and V-F):** card only, no server change. The V-C/V-D
review's D2-D8 and P2, and the V-E review's #19 and #20.

- **Card** (`hatch-pet-card.js`): `collectionTiles(world, reply, own)`, pure, exported as
  `HatchPetCard.collectionTiles`: the world's visitors (`visitorList` order), then its
  finds (`worlds.json` order), each `{kind, id, name, met, heart}`. `own` (an unshared
  screen) is the only way `gifts` is read. A gift sets `met` and `heart`; a gift-only id in
  the house `finds` map is never met (D7); a find with a `when` or a gift-only one that
  isn't met has no tile; ids `worlds.json` lacks are skipped.
- **The page**: "finds ›" (`.flink`) in the journal's new foot (`.jfoot`: "‹ status"
  left, "finds ›" right). A separate `s.finds` flag (D3), cleared wherever `s.journal` is;
  `_renderStatus` routes to `_renderFinds` first; `_fetchPhotos` and the journal's own
  late render never draw over the page. Each open drops the last reply and reads
  `virtual_pet/collection {entity_id, shared: sharedScreen()}` once (`_loadFinds`, one read
  in flight); the reply is kept as `s.findsData` only while the page is, and dropped
  (`_dropFinds`) with the photos: a new pet, a shared-screen flip (V-E review #12), the
  card going. Never in `localStorage`. `_goPersonal` reads an open page again. A reply
  for another pet or from before a flip is dropped; an error goes back to the journal with
  no text.
- **Tiles** (`.fgrid`, `.ftile`): a visitor's `_1` frame at 18 cells and a find at 16 (`--px`
  a cell, both 1:1), a 62 px minimum width for the caption. Two grids (visitors, finds)
  with a dotted rule between, no heading. Unmet: `.locked` (the journal's silhouette
  filter), `alt=""`, no caption, no label (D5); on mono the silhouette's opacity is .5.
  The ♥ is a `.fheart` in the tile's corner.
- **Unmet visitors are silhouettes** too (§13 #5 read as "unmet ones"; not quoted for
  visitors in §4: a question in the s2600 report).
- **Bench**: the `collection` shot field (`true` part met with three gifts, `"empty"`,
  `"error"`, or `{visitors, finds, gifts}`; gifts only to an unshared screen, as the server)
  and `view: "collection"` (`--collection`); `scrollEnd`; `--preset collection` (21 shots).
- **Card-check `collection`** (after `finds`, `NEEDS.collection = ["restart"]`): the real
  reply (D7: the gift-only id and `laterfind` absent; `gifts` only when not shared), one
  `virtual_pet/collection {shared: false}` and no `call_service`, head and links, tiles and
  silhouettes against the reply, D8's no-count scan, D6's fit at 420 and 330, D3's photo
  load; then with gifts added to the reply on the card's side: the ♥ tiles, a shared flip
  dropping them (and no `localStorage` key), a shared screen's `shared: true` with no ♥
  even when the reply carries gifts, and an error staying on the journal.
- **Tests**: `tests/js/collection.test.js` (per world: empty, met/hidden/D7, the ♥ own and
  shared; a bad reply).

**V-E2 as built (s2601, for V-F):** card only, no server change.

- **Card** (`hatch-pet-card.js`): `GIFT_MADE` (`acorncup`, `knittedheart`, `paperboat`),
  `GIFT_LINES` (`find` V5 over the find's `name`, `made`/`found` V6), `GIFT_LINE_MS` 5000,
  `BABY.gift` = "for you! ♥" (V7, baby stage only); exported as `HatchPetCard.giftLines`
  and `.giftMade`. No personality variants, no nickname (V5-V7 go through `_babySet`
  only, not `_lines`).
- **First look** (`_firstLook`): after the upbringing line, `_giftDue(s)` (`mine.gift`, not
  a shared screen, no take in flight) with room reserves the slot; the missed visitor
  needs room past it. After the sync lines are queued, `_giftTake(s)`: one
  `virtual_pet/collect {entity_id, gift: true, shared: false}`. **The reply alone
  decides** (V-E1 audit #1: the server's push of `mine.gift = null` comes first); a
  `{gift: null}`, an error or a find this card doesn't know says nothing. A non-empty
  reply is `_queue`d as KEPT, `type: "gift"`, with **no `at`** (so `_markSaid` writes
  nothing) and `then` = `_giftPop`. A reply that lands after another pet came onto the
  slide, or after a shared flip (`s.giftEpoch`), is dropped.
- **The pop** (`_giftPop`/`_giftPopEnd`): `<div class="reveal gift"><img class="rf">`, the
  find's art from `gift.world` (`find_<world>_<id>.png`), the `pop` animation unless calm,
  no basket, no `burst`, `s.basket` untouched; for `GIFT_LINE_MS` with `flairUntil` and
  `visitUntil` held as the reveal does. **Placed up on the pet's right** (`right: 6% +
  edge`, `bottom: 46%`, 16 cells), not straight above: the bubble (left-anchored, up to 69%
  wide) covers the space over the pet's head, and the first bench render hid the find
  under V5's two-line bubble. Shown in compact too, as the basket and its reveal are
  since a7965007 (no compact rule hides any of them); hidden under the status like the
  reveal.
- **Dropped** (`_dropGift`: the pop, a queued gift line, a take in flight) on `_goShared`
  (any `SHARED_EVENT` flip or storage event) and in `_forget`; `disconnectedCallback`
  ends only the pop (a take or line still waiting is said on return). Nothing gift-related
  is stored anywhere. A gift taken but dropped unsaid by a shared flip is gone (the server
  has cleared it): privacy wins over the one line.
- **Owner Q1** (`_onHidden`, `_giftReturn`): a `visibilitychange` back to visible after
  `AWAY_NOTE_AFTER_MS` hidden sets `s.giftAgain` on every slide; the tick takes a waiting
  gift for the slide on show once the first look's conditions hold (channel heard, species,
  awake, home, hatched). A first look uses the flag up. Nothing else is re-run on return.
- **Bench**: shot field `gift: {id, world}` (and `--gift world/id`) through the real
  `_firstLook` with a fake `callWS` answering only `collect {gift: true, shared: false}`;
  writes `{lookedFirst, said, pop}` beside the PNG. `--preset gifts`: 11 shots (V5 with
  "message in a bottle" in the porthole and at 330, V5 day/night, V6 made ×2 and found
  from another world, V7 baby, calm, compact, asleep: nothing taken).
- **Card-check `gifts`** sits right after `restart` (`NEEDS.gifts = ["restart"]`, the same
  shard; V-D's `collection` follows `finds`). It seeds dev's gift **in its own bounce**
  (review #15's first option; restart's `bounce` is kept for it): the world's **gift-only**
  find, with every card on the page a shared screen meanwhile, then personal again with
  every slide's first look done. (Seeding in restart's bounce failed in a wide run: after
  a restart a card can see its slides' pets anew, run a first look again and take the
  gift before `gifts` runs.) `unseed` puts the bond back whole. With a gift-only id the
  line checked is **V6**, not V5 (V5's words are the Node test's and the bench's). Checks:
  the open card holds `mine.gift` and says nothing (no interruption); a shared flip drops a
  pop and its line; a shared first look sends no collect; `collect {gift}` without
  `shared: false` (and with `shared: true`) is refused `shared`; a shared `collection` has
  no `gifts`; two fresh tabs: exactly one non-empty take, at most one empty, exactly one
  gift line (the losing tab usually gets the push of `mine.gift = null` before its look
  and sends nothing); after it the house `finds` map has no gift and dev's `gifts` has it;
  no entity state or bus event carries it; Q1 on the card with the take stubbed (a short
  absence takes nothing, a long one takes and says it). `finds`' second tab counts only
  basket collects. The second login (`other`) isn't re-checked here: by `oldcard` the gift
  is taken (V-E1's pytest covers other users).
- **Tests**: `tests/js/gift_lines.test.js` (GIFT_MADE ⊂ gift-only ids, made + found = all
  six; V5 over every ordinary find ≤ 40 with "message in a bottle" exactly 40; V6/V7
  words; the scan); `gift` joins card-check's baby-scan keys.

**Which slice owns each review finding:** V-A #8 #9 #10 #11 #12 #19 #22; V-B #1 #2 #3 #4 #5
#13 #18 (lists) #20 #21 and the salvage of `basket`; V-C #15 #16 #17 #23; V-D #6 #7; V-E #6 #7 #14; V-F #18 #23. Review blockers: before V-A, #9 #10 #11
#22 (all in V-A); before V-B, #1 #2 #3 #4 #8 #12 #21; before V-C/V-F, #23 #18; before V-E, #6
#7 #14. **V-E review (s2596):** V-E1 #1 #2 #3 #4 #8 #9 #11 #12 #13 (the §8 wording) #14 #17
#18 #21; V-E2 #5 #6 #7 (after owner Q1) #10 #12 (card half) #15 #16; V-D #19 (after
owner Q2) #20.

The whole build is **L**, as next-stages 2d says. V-B to V-E each touch about one module
on each side.

## 12. Tests

- **Bench** (`dev/bench/`; looks only, per AGENTS.md):
  - a `house` fixture for the channel (`visit`, `basket`): the bench README (line 60)
    already has a `mine` fixture (`--mine`), so this extends that path with `house`;
  - a `basket: [ids]` shot field and a `reveal: {id, new, from?}` pin;
  - a `--collection` fixture like `--journal` (part met, one gift ♥; V-D);
  - (V-E2, V-E review #16) a shot field `gift: {id, world}` (via `mine.gift` plus a forced
    first look) and `--preset gifts`: V5 with the longest name, V6 made and found, V7
    baby, calm, compact, and a gift on an asleep pet showing nothing;
  - `--preset finds`: all 60 finds at reveal size on each world's backdrop, the three
    baskets, a collection page per world, and a calm and a compact shot.
- **Card-check** (behaviour, a scratch HA through `scripts/gate -- --only …`):
  - `visitors` (extended):
    - the card plays the server's plan;
    - two card instances, and a browser in another time zone (`timezoneId`), agree; one
      case **crosses the browser's own midnight** while the HA day is the same, and the
      visit plays once, because the once-a-day flag is keyed by `house.visit.day`
      (finding #22);
    - a restart keeps the day's pick;
    - with no `house.visit`, v1's fallback still plays.
  - `finds` (new):
    - a seeded basket (via the `HA_CONFIG` storage edit, as `restart` seeds the bond)
      shows its picture with no number;
    - a tap reveals, and the basket empties on a second card at once;
    - the finds and collection survive `restart`;
    - no `call_service` is sent for a collect: the ws spy (`card-check.js:5883`) sees one
      `virtual_pet/collect` and no `call_service` (finding #17; there is no DB read);
    - calm and compact behave.
  - `gifts` (new, V-E2):
    - seeds `bonds[dev].gift` **in `gifts`' own step**, or `gifts` sits right after
      `restart` with `NEEDS.gifts = ["restart"]` in the same shard (V-E review #15: a
      gift seeded in restart's bounce could be taken by a later section's fresh load).
      The dev pet must be awake, home and hatched at that first look; dev's personal
      card says V5 and takes it;
    - two tabs of dev: assert **exactly one** V5 across both and one non-empty `collect`
      reply in the ws spy (which tab wins is a race; finding #14);
    - a shared card's collection reply has no `gifts`; a shared `collect {gift}` is refused;
    - the house `finds` map has no gift (finding #7);
    - a shared screen and the second user (`other`, card-check 8384) see nothing;
    - the sensor attributes and the bus carry no `gift`.

## 13. Decided (owner, 2026-11-01)

The original questions Q1-Q8: **all as recommended.**

1. **Credit a visitor seen or not?** The server credits it when its window ends, seen or
   not. No card call, nothing missed by being away, and v1's catch-up line tells you it
   came.
2. **Gifts: to whom?** Each friend at bond level 3+, on their own clock, about once a week;
   never "the closest one". Gifts live in the bond; `forget_me` leaves them as it leaves
   bonds (FB as decided; erasing gifts would change FB).
3. **One-of-a-kind gift finds:** one per world that only a gift brings (acorn-cap cup,
   pressed fern, knitted heart, pearl, paper boat, tiny telescope). No tile until the
   receiver has one.
4. **The basket is the household's:** the first tap opens it, on any screen, shared and
   read-only logins too.
5. **The collection:** silhouettes for unmet ones, no count, kept by the device across
   generations, one page per world.
6. **The finds lists** (§2): as listed, with the ⟲ replacements below still to pick.
7. **Nothing for the pet or the bond** when a find is opened or a gift taken.
8. **Basket art:** one shared basket now (3 images); per-world later if it looks plain.

The review's questions, **all as recommended:**

- **R1** Rolls continue while the basket is full; extras go straight to the collection
  (the rare-wait bound restated in §2: it holds for weekly tappers too).
- **R2** Only Night Sky rolls while the pet sleeps; `night` is defined (§2: the sun down,
  not the sleep hours).
- **R3** Gifts never appear in the house collection; only on the receiver's own ♥ page.
- **R4** Visits are credited during the egg stage and while away.
- **R5** Seasonal finds use `people.py` `season(day, latitude)`; tropics or no weather
  entity get the rare unconditional fallback for seasonal and weather finds (no permanent
  silhouette).
- **R6** `bonds[u].gifts` stores ids only, no dates.

Also settled by the first mate: finds are drawn and revealed at 16 cells (64 px); the
visitor leaves its own feather via a per-visitor `leaves` id; `STORE_MINOR_VERSION` is not
bumped (no consumer); the `when` grammar is a list of lists with `!`.

The V-B review's questions (s2590), **all as recommended** (owner, 2026-11-02):

1. **A find waiting in the basket already counts as met** in the collection: it is
   credited when rolled, and its basket entry stores `new`.
2. **A nap, the night's sleep, away and the egg pause the find clock**; a roll that came
   due rolls once on waking, never more. Built as "left alone while it can't roll" (§2
   "The find clock"): the review's "`next_find_at` None while it can't roll" would reset
   the clock on every nap, which this answer rules out.
3. **The moon phase comes from the date** with no moon sensor (V-B review #4 a).
4. **A visitor's left find fires no `found`.**

The V-B audit (s2592, FIX FIRST), decided by the first mate (2026-11-01) as it recommended:

- **#1** For finds, full moon = a mapped entity says full **or** the date's window, now
  ±1.5 days (3 nights); the analytic test's full-moon frequency comes from the constant.
- **#2** A `next_find_at` more than 5 h ahead (a clock that went back) is scheduled again
  from now, with no roll.
- #3-#5 (nits): `find_weight` compares by value; `valid_find` needs a str `name`; a known
  id under the wrong world counts as unknown (a comment says so, for V-D).

The V-E review (s2596, FIX FIRST, plan edits only), decided by the first mate
(2026-11-01): #1-#4, #8, #9, #11-#14, #17, #18, #21 accepted with their fixes (§5, §6,
§8; built in V-E1); #5, #6, #10, #12 (card half), #15, #16, #20 accepted for V-E2 and V-D
(§5, §7, §11, §12). #8 and #9 take the recommended rules (a)-(g) and weights as written.
Review Q3 (missed visitor or gift, room for one): **the gift** (§5).

**Q1 (V-E review #7), answered by the owner (2026-11-02): as recommended.** A gift that
arrives while your card is already open is said at the next first look, or when the tab
comes back after being hidden at least `AWAY_NOTE_AFTER_MS`; never as an interruption
while you watch. With it, the first mate's pick for review Q3 stands: at the first look
the gift's slot is reserved before the missed-visitor line (the gift wins). Built in V-E2.

**Still OPEN for the owner (do not decide in a slice):**

- None. Q1 is answered above; Q2 below (the V-D brief's answers).

The V-D brief's answers (owner, 2026-11-02):

- **Hidden until met:** any find with a `when` (weather, season, night, full moon) and
  every gift-only find has no tile at all until met; the rest show a silhouette until met
  (V-C/V-D review D2, owner Q1 there).
- **Page copy:** back link "‹ journal", loading "opening…" (the journal's own string), on
  an error stay on the journal with no text (D4). Title "finds · <world>" and link
  "finds ›" (§7 V9).
- **V-E review Q2 (#19):** an ordinary find this person got only as a gift is drawn (not a
  silhouette) with a ♥ on their own unshared screen; the house, a shared screen and
  everyone else's treat it as unmet. A gift-only find they received: drawn with a ♥, on
  their screen only.

## 13b. Answered (owner, 2026-11-01): all four as recommended

1. **The nine ⟲ replacements are approved as listed:** wild strawberry, tiny mushroom, crystal cluster,
   brass key, cork float, heron feather, paper star, tiny rocket, little lantern.
2. **A weather or season find's tile is hidden, silhouette included, until it is met** (as gift-only
   finds are). The rare fallback stays only where the signal is missing (R5).
3. **V5 = "saved this <find> for you ♥"; V6 = "made this for you ♥" / "found this for you ♥"**
   (approved); the 40-character cap stays.
4. **Sea glass: three different shapes** (a chip, a round, a shard) in V-F.

## 13c. Answered (owner, 2026-11-02)

1. **The basket shows in the compact card too** (it was hidden under 280 px). Same basket, same
   tap rules (`_visitorLive` etc.), a 44 px tap box. §3 changed; card-check `finds` asserts it
   shows and is tappable at 330; the bench's compact shot shows it.
2. **A rarity cap: no find takes more than ~45 days on average** at the stated condition
   frequencies (was 89 / 62 / 58 d for bottle, moonstone, clover). §2 changed; six weights
   raised in `worlds.json`; the analytic test's bound is 45 days. Gift-only finds stay out.

## 14. Later (not in v2)

- Weather visitors (a snail after rain): the server's saved pick makes them possible.
- "I dreamed about my pine cone": a `find` dream seed.
- More seasonal finds (a conker in autumn, a snowflake in winter), through
  `people.py` `season()` as in §2.
