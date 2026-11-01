# Visitors v2, 2026-11-01 (plan: finds, a basket, a collection, gifts)

**Status: PLAN, docs only. Reviewed + folded 2026-11-01** (tier-2 review s2580, findings
#1-#23, and the owner's answers; see "Decided" in §13). **V-A built 2026-10-31** (s2582,
branch `crew/hatch-at-home-s2582-v-a-the-server-owns-the-day-s`; see "V-A as built" under
§11). **V-B built 2026-11-01** (s2591, branch
`crew/hatch-at-home-s2591-visitors-v2-v-b-finds-and-the`; its adversarial review s2590,
findings #1-#21, is folded in, marked "V-B review #n"; see "V-B as built" under §11). V-C
and V-D are next.
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
  - `lay_egg` sets None (the egg can't roll; the hatchling starts fresh).
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
    - **The moon with no moon sensor (V-B review #4, owner Q3):** worked out from the date
      (a mean synodic month; "full" within ±1 day of mid-cycle, `R.FIND_FULL_MOON_DAYS`),
      so moonstone happens everywhere. A mapped `moon_phase` or `moon_illumination`
      entity wins.
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
    1 in 10, a season 1 in 4, night 1 in 2, full moon 3 days a month at night): at most
    **100 days**. As built: message in a bottle ~89, moonstone ~62, four-leaf clover ~58,
    dew drop ~56, chanterelle ~55, frosted leaf ~48, fallen star ~34, snail shell ~19,
    frogbit ~17, pine sprig ~16. Their tiles stay hidden until met (§13b #2).
- **The coverage run (finding #1, #21) is a regression snapshot**, not the guarantee
  (V-B review #7). A fixed-seed **90-day** run from a **pinned start, 2026-10-15** (it
  crosses into winter), on a **pinned weather schedule** (a 10-day cycle: sunny, cloudy,
  rainy, sunny, fog, cloudy, rainy, sunny, partly cloudy, snowy; from mid-November every
  other rainy day is snowy), latitude 45, the **real sleep hours** (22:00-07:00, the sun
  down by the real day length, Night Sky rolling asleep), no moon entity (the moon from the
  date). It runs twice per world: with weather, and with **no weather entity at latitude
  10** (the fallbacks). Seed 2026 sees every non-gift find in both. Over seeds 0-19, the
  weather run misses something for Tidepool in 10 (the bottle), Night Sky in 6 and Woodland
  in 2, and the no-weather run for Night Sky in 7 (moonstone): it is pinned, so it can't
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
  - Compact layout: hidden, as `.compact .deco` is. The finds just wait.
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
    waiting, no ids (so no screen sees what's inside before the tap). V-C picks
    `basket_<n>.png` from it; 0 hides the basket.
- **The tap target** is a `<button>` with `aria-label` "the basket". It is not a pet tap,
  so it never counts as a pat.

## 4. The collection (card page)

- **Where:** a "finds ›" link at the foot of the journal (`_renderJournal`,
  `hatch-pet-card.js:6595`), next to "‹ status". The page has its own `jhead`: "finds · <world>".
- **Content: this world only.**
  - **Visitors:** 3 tiles, each the `_1` frame.
  - **Finds:** 9 tiles, plus the gift-only one for a person who has it. For each find, a met one is drawn with its name; an unmet one is a
    dark silhouette (CSS `filter: brightness(0) opacity(.3)`, no new art), with no name and
    no "???".
  - **Gift-only finds** (§5) are **never in the house collection** (R3, finding #7). They
    appear only on the receiver's own screen, from their own `gifts` list, with the ♥.
    Before that, no tile and no silhouette, so there is no hole to fill. A shared screen
    never shows one.
  - **No total, no "x of y", no bar.**
  - On the viewer's own screen only, gifts get a small ♥ on their tiles (§5). Any
    ordinary find received as a gift also gets the ♥, but is a tile in the house
    collection only if it was *found* (a gift alone never credits the house).
- **Read on open:** `virtual_pet/collection {entity_id, shared}` (a websocket command).
  - **`vol.Required("shared"): bool`, as `subscribe` has** (finding #6): the client sends
    it per subscription (`__init__.py:481,498`), so the server can't tell otherwise.
  - It returns `{world, visitors: [id], finds: {id: first_on}}` (found finds only, never a
    gift), plus `gifts: [id]` for the caller **only when `shared` is false**.
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
2026-10-28).

- **To whom (Q2).** *Recommended:* every friend at **bond level 3 or more**, each on their
  own clock, never ranked.
  - About once every 6-8 days per person (`R.GIFT_EVERY_DAYS` (6, 8), jittered), the pet
    sets aside one find for that person.
  - It is not "the person it's closest to". Picking one person would rank people (the
    taste rule) and would show who ranks first.
  - Two friends each get their own gifts, on their own days.
- **What.**
  - The pet picks from the world's finds, weighted away from what this person already got
    (`gifts` ×0.2).
  - Rarer finds are weighted 2× compared with the basket's weights.
  - The world's gift-only find has a 1-in-6 chance on any gift until this person has it.
    It never comes as a basket find. Variety is per person, so each friend can get their
    own one-of-a-kind.
- **Given at their next look**, on **their own** screen. It is a first-look line, last in
  the list and only if there is room (as the catch-up line):
  - "I saved this <find> for you! ♥"
  - the find pops up above the pet, as a reveal does;
  - `virtual_pet/collect {entity_id, gift: true}` takes it.
  - Not on a shared screen; there it waits. Nothing expires: a gift waits as long as it
    has to, and a second gift doesn't come until the first is taken.
  - **Order (finding #14).** A person may have two screens (phone and laptop), and both get
    `mine.gift`. The card calls `collect {gift: true}` **first** and speaks V5 and pops the
    find **only if the reply is non-empty**; the second screen gets `[]` and stays quiet.
    Same order as the basket. The server refuses `collect {gift: true}` when the client
    says `shared: true` (finding #6), so `collect` takes `shared` too.
- **Saved in the bond:** `bonds[user].gift = {id, day}` (waiting; the day is when it was
  set aside), and `bonds[user].gifts = [id, …]` (received, **ids only, no dates**, R6):
  a dated log of when someone opened their card would survive `forget_me`, and FB's "your
  bonds stay" doesn't cover that.
  - Bonds already carry into the next generation and are redacted whole in diagnostics
    (`REDACT_STATE` has `bonds`).
  - **A taken gift never enters the house collection** (R3, finding #7). It shows only on
    the receiver's own ♥ page, from `bonds[u].gifts`. A house-wide `finds` map would
    otherwise tell the household that someone got a gift that day (with two friends at
    level 3+, it names them).
- **Privacy, the bar (privacy plan F1).**
  - The gift reaches the person only through `mine` (`_mine`, `coordinator.py:1981`):
    `mine.gift = {id}` while one waits.
  - It is never on a sensor and never on the bus (no `gift_*` event, no moment with a
    user).
  - It is never in `_house_view`, and never named on a shared screen.
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
| `bonds[u].gift` | `{id, day}` or absent | (bonds already) | the bond loader (`model.py:239` area) drops a bad one and keeps the bond |
| `bonds[u].gifts` | `[id, …]` (ids only, R6) | (bonds already) | a list of str; bad entries dropped |
| `bonds[u].next_gift_at` | float | (bonds already) | `_float` |

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
  - gift: level 3+ only, per-person clocks, the weighting;
    a taken gift never enters the house `collection` or `finds` map; `gifts` holds ids
    only; `collection {shared: true}` has no `gifts`; `collect {gift: true, shared: true}`
    is refused (findings #6, #7, R3, R6);
  - a gift is never on the sensor, the bus, `_house_view` or another user's `mine`;
  - `forget_me` leaves the bond and its gifts (FB as decided);
  - diagnostics redact it.

## 7. Copy (all PROPOSED; the owner picks)

Every line passes the no-nagging scan (experience plan §5), which now **names the new
table** (finding #16): the loops at `card-check.js:3604` and `:4250` walk `BABY` (:3590) and
`PERSONA` (:4240) only, so V-C extends them to the V1-V11 table. :4250 also caps a line at
40 characters; V5 with "message in a bottle" is 43 and V6 with "tiny telescope" is 42, so
the length check runs on the **longest find name** and the lines are shortened if needed
(e.g. "saved this <find> for you ♥"), or the cap is raised for this table. Every line: no "!!!", no word repeated
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
| V5 | A gift, first look on the receiver's screen | "I saved this <find> for you! ♥" (owner's own example, check-ins item 1) |
| V6 | A gift-only find given | "I made this <find> for you ♥" (for the "made" ones: acorn-cap cup, knitted heart, paper boat) · "I found this <find> just for you ♥" (pearl, pressed fern, tiny telescope) |
| V7 | A gift, baby | "for you! ♥" |
| V8 | Away note bit (`MOMENT_BITS.found`) | "found <a find>" (joins "napped, watched the rain, …") |
| V9 | Collection page head / link | "finds · <world>" / "finds ›" |
| V10 | Collection, a visitor tile's caption | its `name` (v1 roster) |
| V11 | Basket `aria-label` | "the basket" |

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
| Waiting gift, gift list | **only that person, own screen** | `mine.gift`, the `collection` reply's `gifts` (only when `shared` is false) | no; ids only, no dates; redacted in diagnostics; kept with the bond by `forget_me`, as FB decided (Q2) |

- A shared screen shows the visit, the basket, finds and the collection without gifts. A
  gift stays waiting.
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
follow in either order. V-E comes last.

| # | Slice | Size | Tier | Art | Needs |
|---|---|---|---|---|---|
| V-A ✅ | **Built** (s2582; "V-A as built" below). **The server owns the day's visit**: `worlds.json` `visitors` (with `leaves`); `PetState.visit` with `world` (#9); `_daily_visit` (rng only for the window hour, #11; credit-then-pick on rollover, #10); crediting at window end into `collection[world].visitors`, in every stage (R4); `_house_view.visit`; the card plays from `house.visit`, with the `visitorDay` fallback and the once-a-day flag keyed by `visit.day` (#22); `salvage` keeps `collection` and `visit` (#8, audit #4); unknown ids kept in the save, skipped where counted or shown (#12, audit #1); F5 validators, `lay_egg` carry; **no `STORE_MINOR_VERSION` bump** (#19); pytest; card-check `visitors` extended (crossing the browser's midnight) | M | **2** | none | Q1-Q8 decided |
| V-B ✅ | **Built** (s2591; "V-B as built" below). **Finds and the basket, server**: `worlds.json` `finds` (the `when` grammar, #3; the ⟲ lists, #18; `leaves` ids, #5: V-A already wrote `jayfeather`, `gullfeather`, `heronfeather`, `nighthawkfeather` on the visitors, so the feathers take those ids); unknown find ids in `collection[w].finds` and the basket kept in the save, skipped where counted or shown (V-A's rule, audit #1: no drop at load); the roll with `night`, `full_moon`, `P.season` and the rare fallback (#1, #4, #21, R5); rolls continue while full, extras to the collection (#2, R1); Night Sky rolls asleep (R2); `basket`, `next_find_at`; the visitor's left find; the `found` moment (no consumer yet, #20); `_house_view.basket` (#20); `virtual_pet/collect` (ws; read-and-clear with no `await`, #13); `salvage` keeps `basket`; validators; the stand-in script and 60 finds at 64 px + 3 baskets at 48 px (#23, V-B review #16); pytest incl. the real-sleep-hours 90-day run and the `when` token check | M | **2** | stand-ins | V-A |
| V-C | **The basket and the reveal, card**: the basket button, the reveal queue, lines V1-V4 and V8, calm, compact; the reveal at 16 cells (#23); the no-nagging scan extended to the V1-V11 table, with the longest-name length check (#16); the bench `house` fixture (extending `--mine`, #15) plus `--preset finds`; card-check `finds` (ws spy, not a DB read, #17) | M | 1 | stand-ins | V-B |
| V-D | **The collection page**: `virtual_pet/collection {entity_id, shared}` ws read (#6); no gift in the house `finds` map (#7, R3); the journal's "finds ›" link; tiles at 16 cells and silhouettes; the bench `--collection` fixture; card-check | M | 1 | stand-ins | V-B |
| V-E | **Gifts**: bond `gift`/`gifts` (ids only, R6)/`next_gift_at`; the per-person clock; the weighting and gift-only finds; `mine.gift`; the first-look line V5-V7 (collect first, speak on non-empty, #14); `collect {gift: true, shared}` refused when shared (#6); gifts only on the receiver's ♥ page (#7, R3); diagnostics; the privacy pytest and card-check (two tabs) | M | **2** | none new | V-B, V-D |
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
  gift-only ids (V-E puts gifts on the ♥ page only).
- A V-B save round-trips through 0.40.0 and back (checked by hand against its
  `model.py`): `basket` and `next_find_at` sit in V-A's `unknown`, and V-A's `lay_egg`
  copies them; its egg carries a stale `next_find_at`, which on the upgrade back is one
  roll at once, never more.
- Tests: `tests/test_finds.py` (95 cases); `tests/js/finds.test.js`; `test_channel` and
  `test_init`'s send-off no longer lean on the rng's order. No card-check section (V-B
  review #21); card-check runs only to show nothing regressed.

**Which slice owns each review finding:** V-A #8 #9 #10 #11 #12 #19 #22; V-B #1 #2 #3 #4 #5
#13 #18 (lists) #20 #21 and the salvage of `basket`; V-C #15 #16 #17 #23; V-D #6 #7; V-E #6 #7 #14; V-F #18 #23. Review blockers: before V-A, #9 #10 #11
#22 (all in V-A); before V-B, #1 #2 #3 #4 #8 #12 #21; before V-C/V-F, #23 #18; before V-E, #6
#7 #14.

The whole build is **L**, as next-stages 2d says. V-B to V-E each touch about one module
on each side.

## 12. Tests

- **Bench** (`dev/bench/`; looks only, per AGENTS.md):
  - a `house` fixture for the channel (`visit`, `basket`): the bench README (line 60)
    already has a `mine` fixture (`--mine`), so this extends that path with `house`;
  - a `basket: [ids]` shot field and a `reveal: {id, new, from?}` pin;
  - a `--collection` fixture like `--journal` (part met, one gift ♥);
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
  - `gifts` (new):
    - seeds `bonds[dev].gift`; dev's personal card says V5 and takes it;
    - two tabs of dev: one says V5, the other stays quiet (finding #14);
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

## 13b. Answered (owner, 2026-11-01): all four as recommended

1. **The nine ⟲ replacements are approved as listed:** wild strawberry, tiny mushroom, crystal cluster,
   brass key, cork float, heron feather, paper star, tiny rocket, little lantern.
2. **A weather or season find's tile is hidden, silhouette included, until it is met** (as gift-only
   finds are). The rare fallback stays only where the signal is missing (R5).
3. **V5 = "saved this <find> for you ♥"; V6 = "made this for you ♥" / "found this for you ♥"**
   (approved); the 40-character cap stays.
4. **Sea glass: three different shapes** (a chip, a round, a shard) in V-F.

## 14. Later (not in v2)

- Weather visitors (a snail after rain): the server's saved pick makes them possible.
- "I dreamed about my pine cone": a `find` dream seed.
- More seasonal finds (a conker in autumn, a snowflake in winter), through
  `people.py` `season()` as in §2.
