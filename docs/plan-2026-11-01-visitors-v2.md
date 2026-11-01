# Visitors v2, 2026-11-01 (plan: finds, a basket, a collection, gifts)

**Status: PLAN, docs only.** Next-stages slice 2d (`plan-2026-10-31-next-stages.md`).
This plan is the server half of daily check-ins item 1 (`plan-2026-10-28-daily-checkins.md`).
It builds on visitors v1 as built (`plan-2026-10-31-visitors.md`: 18 visitors, final art,
card only, nothing saved). An adversarial review comes before any build. Every player line
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
| Finds | While it's awake, the pet now and then finds a small thing from its world (10 per world, 60 in all). Some depend on the weather. | `PetState.basket` |
| The basket | Up to 3 finds wait at the scene's edge. A tap reveals them one at a time. A 4th find waits until there's room. | the card. The tap is the `virtual_pet/collect` websocket command. |
| The collection | Each world's finds and visitors. Ones already met are drawn; the rest are silhouettes, with no count. It is kept by the device, across generations. | `PetState.collection`, `virtual_pet/collection` (read) |
| Gifts | Now and then the pet saves a find for one friend. Only that person sees it, on their own screen. | `bonds[user].gift` / `.gifts`, `mine` only |

## 1. First design point: the server owns the day's visit (FM, Q10)

v1 picks the visitor on the card with `visitorDay(date, device)`, keyed by the HA device id
and the browser's local date. Nothing is saved. A collection can't credit a visit that only
a browser knows about, so v2 moves the pick to the server.

### The seed and the save

- **Pick once, then save.** A new `_daily_visit(now)` next to `_daily_wish`
  (`coordinator.py:1033`) runs on the first tick of each local day. It writes
  `state.visit = {day, id, hours, from, until, credited}`:
  - `day`: the local ISO date.
  - `id`: the visitor's id. With no visit today, `visit = {day, id: null}`.
  - `hours`: `day` or `night`.
  - `from` and `until`: the 3-hour window, as epoch seconds.
- **The pick is saved, not re-derived.** A restart mid-day reads the saved plan, so it can't
  re-roll the visitor. A later version can weight the pick by weather. The pick uses
  `self.rng`, as the wish does.
- **v1's guarantees, kept on the server.** These are the same rules as `visitorDay`:
  - 4 visit days in every 7 (a position in a 7-day cycle);
  - the three visitors take turns over the visit days;
  - day windows start between 09 and 15, night windows at 19 or 20.

  The cycle position comes from the day index plus a per-pet offset taken from `entry_id`
  (the device's identifier, `entity.py:25`). The turn order is deterministic, so "any 21
  days hold every visitor" stays a property that a pytest checks over 365 days.
- **The day boundary is HA's time zone** (`_today`, `coordinator.py:1014`), as for the
  wish, the dream and the birthday. The window travels as absolute timestamps. A browser in
  another time zone therefore plays it at the same instant as every other screen. v1's
  edge case (each browser used its own `toDateString()`) is gone.
- **Multiple browsers agree by construction.** Every screen reads one saved plan. The card
  keeps v1's `oncePerDay("visit-<device>")` flag, but only to mean "this screen already
  played it". That is a browser flag, not a save.
- **Day or night on screen stays on the card.** The server's `hours` says which kind of
  visitor it is. The card still plays a night visitor only on a `night`/`dim` scene
  (v1 rule).

### Crediting a visit (Q1)

**Recommended:** the server credits the visitor when its window **ends**, whether anyone
saw it or not.

- At the first tick past `until`, it writes `collection[world].visitors[id]`, if that entry
  isn't there yet, and sets `visit.credited`.
- **No card call says "I saw it."** There is no write path, so no race between screens, and
  no person is recorded.
- Being away costs nothing. That is the rule "nothing missed by being away", taken literally.
- v1's catch-up line ("a <name> came by today ♪") already tells a person who missed it.

**The visitor's gift** (check-ins: "a missed visitor still says hello"):

- On about 1 visit in 3 (`R.VISIT_LEAVES_FIND` 0.33), the visitor leaves a find in the
  basket when its window ends. It is picked from that world's common finds, and the basket
  entry carries `from: <visitor id>`.
- If the basket is full, nothing is left. Nobody is told.

### Where the card reads it

- **`_house_view` gains `visit: {id, hours, from, until}`** (`coordinator.py:2003`), but
  only for today and only while `id` is set. It names nobody, so shared screens get it too.
- It is not in `mine` because it is the same for everyone.
- It is not a sensor attribute because it changes daily. The channel pushes it, and the
  house view doesn't go into the history database.
- **`visitorDay` stays as the fallback.** It is used when the channel has no `house.visit`:
  an old server, the channel not up yet, or the bench.
  - A new card with an old server behaves as v1.
  - An old card (a cached browser) with a new server keeps its own pick. The server still
    credits from its own plan, so the collection is right either way.
- **Upgrade day:** the server's pick replaces the browser's, so that day's visitor may
  change once. This is accepted. The plan does not try to match v1's hash: it is keyed by
  a different id and by the browser's date.
- **`VISITORS` moves to `worlds.json`** (`visitors: [{id, name, hours}]` per world), so the
  server and the card share one roster. The card keeps the play data (`walk`, `cross`,
  `in`, `stay`, `lines`, `catchup`) in a JS table keyed by id. That is v1's own stated next
  step (§4 "Data").

## 2. Finds

### How they come

- **A roll every ~4 hours** while the pet is awake and home, not an egg, and the basket has
  room.
  - `R.FIND_EVERY_HOURS` is 4, jittered ±1 h.
  - `R.FIND_CHANCE` is 0.6, so about 2-3 finds on a normal day.
  - The roll runs on the tick and saves `state.next_find_at`.
- **Asleep, away, an egg, or a full basket: no roll.** Time doesn't pile up: the next roll
  is scheduled from when the pet is free again, never caught up.
- **The pick is weighted from the world's list.**
  - Common weight 10, uncommon 4, rare (★) 1.
  - Condition finds count only while their condition is true. They use flags the house
    already senses (`home.py`): `rainy`, `snowy`, `sunny`, `foggy`, `full_moon`, plus the
    clock (`night`) and the month (`autumn` = Sep-Nov, `winter` = Dec-Feb). There is no
    frost flag, so frost finds use `snowy`.
- **Finds already in the collection are weighted ×0.5**, never 0, so new ones come a little
  sooner, but repeats still happen and still delight.
- **Rare enough to be special, never a worry.** A pytest works out each find's expected
  wait from the weights at the normal rate (about 2.4 finds a day). The rarest unconditional
  find must be under about 3 weeks. A fixed-seed 90-day run must then see every non-gift
  find, with each condition held true on half the days. The run is seeded, so it can't flake.
- **A moment, `found`** `{id, world}`, with no user. It goes to the moments and the bus,
  like other house moments. The away note can then say "found a pine cone"
  (`MOMENT_BITS.found`). Automations may use it.

### The finds (10 per world, 60 in all; PROPOSED lists, Q6)

The rules for the lists:

- No find is a creature on the roster or a v1 visitor.
- Feathers are left by visitors (jay, gull, nighthawk).
- "Gift" finds come only as gifts (§5).

| World | Common (weight 10) | Uncommon (weight 4) | Rare ★ (weight 1) | Gift only |
|---|---|---|---|---|
| Woodland | pine cone, acorn, maple seed, smooth river stone | jay feather, snail shell (rainy), chanterelle (autumn, rainy or foggy), frosted leaf (snowy) | four-leaf clover (sunny) | acorn-cap cup |
| Terrarium | shiny pebble, dried flower, curled bark, seed pod | a shed skin, quartz chip, dew drop (foggy), pressed moss | tiny fossil | pressed fern |
| Hearth | button, ribbon, spool of thread, cookie | lost sock, toy mouse, thimble, pine sprig (snowy or winter) | marble | tiny knitted heart |
| Tidepool | green sea glass, scallop shell, periwinkle shell, sand dollar | blue sea glass, gull feather, sea urchin shell | red sea glass, message in a bottle (rainy) | pearl |
| Pond | lily flower, cattail fluff, skipping stone, water-snail shell | duck feather, willow leaf, reed whistle, frogbit leaf (sunny) | golden koi scale | paper boat |
| Night Sky | stardust, comet dust, moonflower (night), constellation card | nighthawk feather, meteorite pebble, moonstone (full moon), glow pebble (night) | fallen star (night, not rainy) | tiny telescope |

Each world has 10 finds: one gift-only, and nine found in the basket.

### Data

`worlds.json` gains, per world:

```json
"finds": [{"id": "pinecone", "name": "pine cone", "weight": 10, "when": null}, …]
```

- `when` is null, or a list of conditions that are ANDed.
- `gift_only: true` marks a gift-only find.

The server reads it in `species.py` beside the roster. The card reads names and art from
the same file.

## 3. The basket (card)

- **Where it sits.** A small basket at the scene's bottom edge, on the side away from the
  pet's spot. It sits on the deco's line (`bottom: 6%`) and is drawn **12 world cells**
  wide (`calc(var(--px) * 12)`).
  - It shows only when the basket has something in it.
  - **No number.** The art shows 1, 2 or 3 things peeking out (`basket_<n>.png`), which is
    a picture, not a count.
  - Compact layout: hidden, as `.compact .deco` is. The finds just wait.
- **Open the card** with something in the basket: nothing is said, and the basket sits
  there. (A "look!" line would turn it into a chore.)
- **A tap on the basket** sends `virtual_pet/collect {entity_id}`. The reply lists the finds
  in order, each `{id, new, from?}`. The card reveals them one by one, 2.5 s each:
  - the find pops up over the basket, drawn 16 cells wide;
  - the pet says its line (§7);
  - a first-ever find gets a small sparkle.

  Calm (reduced motion): the find appears still, with no pop.
- **Under the 2a classes** the reveal is **flavour started by a person**. It runs only when
  the queue is free (`_mayInterrupt`). A care line that arrives mid-reveal wins, and the
  rest of the reveal is shown without lines.
- **A pat** while revealing: the wiggle only (the v1 rule).
- **Two screens tapping at once.** The server empties the basket under the coordinator's
  lock, so the first tap gets the finds and the second gets `[]`. The second screen's
  basket just goes, without a line.
- **The tap target** is a `<button>` with `aria-label` "the basket". It is not a pet tap,
  so it never counts as a pat.

## 4. The collection (card page)

- **Where:** a "finds ›" link at the foot of the journal (`_renderJournal`,
  `hatch-pet-card.js:6595`), next to "‹ status". The page has its own `jhead`: "finds · <world>".
- **Content: this world only.**
  - **Visitors:** 3 tiles, each the `_1` frame.
  - **Finds:** 10 tiles. For each find, a met one is drawn with its name; an unmet one is a
    dark silhouette (CSS `filter: brightness(0) opacity(.3)`, no new art), with no name and
    no "???".
  - **Gift-only finds** (§5) show only once someone has one. Before that, no tile and no
    silhouette, so there is no hole to fill.
  - **No total, no "x of y", no bar.**
  - On the viewer's own screen only, "from <pet> to you" gifts get a small ♥ on their
    tiles (§5).
- **Read on open:** `virtual_pet/collection {entity_id}` (a websocket command). It returns
  `{world, visitors: [id], finds: {id: first_on}}`, plus `gifts: [id]` for the caller, but
  never on a shared screen. The data stays out of sensor attributes: it only grows.
- **Kept by the device**, like `bonds` and `firsts` in `lay_egg` (`model.py:1665`), so it
  grows across generations.
  - It is keyed by world (`{world: {visitors: {id: day}, finds: {id: day}}}`), because the
    next egg may change worlds.
  - Each world's page shows only its own entries. A device that changed worlds keeps both.
  - The dates are local days, and no user is stored.

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
- **Saved in the bond:** `bonds[user].gift = {id, day}` (waiting), and
  `bonds[user].gifts = {id: day}` (received).
  - Bonds already carry into the next generation and are redacted whole in diagnostics
    (`REDACT_STATE` has `bonds`).
  - A taken gift also enters the house collection with no name (§4). Whose it is shows
    only as the ♥ on the receiver's own page.
- **Privacy, the bar (privacy plan F1).**
  - The gift reaches the person only through `mine` (`_mine`, `coordinator.py:1981`):
    `mine.gift = {id}` while one waits.
  - It is never on a sensor and never on the bus (no `gift_*` event, no moment with a
    user).
  - It is never in `_house_view`, and never named on a shared screen.
  - `forget_me` (`__init__.py:386`) leaves bonds. It is extended to drop `gift` and
    `gifts` from every pet's bond for that person, because those are theirs alone. The
    guide's "forget my data" text says so.
- **Bonds: none (Q7).** A gift is a *result* of the bond. Taking it gives no points,
  otherwise a waiting gift would become a reason to log in.

## 6. Save, schema, migration

| Field | Shape | Carried by `lay_egg` | Validation (F5) |
|---|---|---|---|
| `visit` | `{day, id, hours, from, until, credited}` or null | yes (today's plan stays) | dict with str `day`. Else null, and the next tick re-picks. |
| `basket` | list of up to 3 `{id, from?, at}` | yes (finds wait) | list of dicts with str `id`, cut to 3. An id no longer in the world's list is dropped at load. |
| `next_find_at` | float or null | yes | `_float` |
| `collection` | `{world: {visitors: {id: day}, finds: {id: day}}}` | yes | the world key is a str, the inner maps are str→str; a bad world is dropped, the rest kept |
| `bonds[u].gift` | `{id, day}` or absent | (bonds already) | the bond loader (`model.py:239` area) drops a bad one and keeps the bond |
| `bonds[u].gifts` | `{id: day}` | (bonds already) | as `collection`'s inner map |
| `bonds[u].next_gift_at` | float | (bonds already) | `_float` |

- **No migrate function.**
  - `PetState.from_dict` already defaults missing keys and keeps unknown ones
    (`model.py:401`), so an old save loads with an empty basket and collection.
  - A downgrade keeps the new keys for the next upgrade (the `unknown` dict).
  - `PetStore._async_migrate_func` stays a no-op.
- **Bump `STORE_MINOR_VERSION` 1 → 2** (`const.py:17`) to mark the new fields.
  `_async_migrate_func` accepts 1 unchanged.
- **Seeding the collection on upgrade:** none. It starts empty. (v1 saved nothing, so
  there's nothing to credit.)
- **pytest** (`tests/test_model.py`, `tests/test_init.py`):
  - the round trip of each field;
  - a damaged value of each field loads, with the rest kept;
  - an old v1 save loads empty;
  - `lay_egg` carries `collection`, `basket` and `visit`;
  - the day plan survives a restart (no re-roll);
  - the 4-in-7 and 21-day properties over 365 days;
  - crediting at window end, seen or not;
  - the visitor's left find, and none when the basket is full;
  - the find roll: none asleep, away, egg or full; a 4th waits; the 60-day coverage run;
  - `collect`: two concurrent calls give `[…]` and `[]`;
  - gift: level 3+ only, per-person clocks, the weighting, gift-only never in a basket;
  - a gift is never on the sensor, the bus, `_house_view` or another user's `mine`;
  - `forget_me` drops gift data and keeps the bond;
  - diagnostics redact it.

## 7. Copy (all PROPOSED; the owner picks)

Every line passes the no-nagging scan (experience plan §5): no "!!!", no word repeated
more than twice in a row, none of "still", "again", "why", "never", "pleas", "sad", "cry",
"alone", "forgot", and no `?` that asks the person for something. Lines name no person,
except the gift's "you" on the receiver's own screen. Route `_lines` (baby talk where
noted), `catch` off.

| # | Where | Proposal |
|---|---|---|
| V1 | Reveal, a find | "a <find>! ♪" · "look, a <find> ♪" · "ooh, a <find>~" (one, by `dailyPick`) |
| V2 | Reveal, a first-ever find | "a <find>! a new one ✦" |
| V3 | Reveal, a find a visitor left | "the <visitor> left a <find> ♪" |
| V4 | Reveal, baby | "ooh! ♪" · "mine? hehe ♥" (words already in `BABY`) |
| V5 | A gift, first look on the receiver's screen | "I saved this <find> for you! ♥" (owner's own example, check-ins item 1) |
| V6 | A gift-only find given | "I made this <find> for you ♥" (for the "made" ones: acorn-cap cup, knitted heart, paper boat) · "I found this <find> just for you ♥" (pearl, pressed fern, tiny telescope) |
| V7 | A gift, baby | "for you! ♥" |
| V8 | Away note bit (`MOMENT_BITS.found`) | "found a <find>" (joins "napped, watched the rain, …") |
| V9 | Collection page head / link | "finds · <world>" / "finds ›" |
| V10 | Collection, a visitor tile's caption | its `name` (v1 roster) |
| V11 | Basket `aria-label` | "the basket" |

Cut on purpose (they nag or ask): "the basket is full!", "come see what I found",
"<n> new finds", "collect them all", "you have a gift waiting" on a push.

## 8. Privacy summary (privacy-hardening ground rules)

| Data | Who sees it | Channel | Recorded? |
|---|---|---|---|
| Today's visit plan | every screen | `_house_view` | no |
| Basket contents | every screen | `_house_view` | no |
| `found` moment | every screen, the away note | moments + bus (no user) | the bus, like other house moments |
| Collect (tap) | the caller | **websocket** `virtual_pet/collect` (not a service and not a button, because a service's `call_service` row records `context_user_id`, rows M/O) | no |
| Collection | the person who opens it | websocket `virtual_pet/collection` | no |
| Waiting gift, gift list | **only that person, own screen** | `mine.gift`, the `collection` reply's `gifts` | no; redacted in diagnostics; erased by `forget_me` |

- A shared screen shows the visit, the basket, finds and the collection without gifts. A
  gift stays waiting.
- **Read-only logins can open the basket.** It changes nothing but the basket, like a pat.
  The next-egg pick (C13) needs control because it changes the pet's future; this doesn't.
- No `context=` on any new `_fire`.

## 9. Art

| Set | Count | Canvas | Path | Notes |
|---|---|---|---|---|
| Finds | **60** (10 × 6) | **48 × 48** = 12 × 12 world cells at 4 px (`WORLD_GRID` 64) | `frontend/ui/find_<world>_<id>.png` | One frame each, centred, transparent, the 128 sprites' dark outline, the world's palette (`scripts/art/palette.py`). Read alone at 12 cells. Shown 12 cells wide in the collection and 16 in the reveal (a whole-pixel scale of the grid via `--px`). |
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
| V-A | **The server owns the day's visit**: `worlds.json` `visitors`; `PetState.visit`; `_daily_visit`; crediting at window end into `collection[world].visitors`; `_house_view.visit`; the card plays from `house.visit` with the `visitorDay` fallback; `STORE_MINOR_VERSION` 2, F5 validators, `lay_egg` carry; pytest; card-check `visitors` extended | M | **2** | none | the owner's Q1 |
| V-B | **Finds and the basket, server**: `worlds.json` `finds`; the roll; `basket`, `next_find_at`; the visitor's left find; the `found` moment; `virtual_pet/collect` (ws); validators; the stand-in script and 60 + 3 stand-ins; pytest | M | **2** | stand-ins | V-A; Q6 lists |
| V-C | **The basket and the reveal, card**: the basket button, the reveal queue, lines V1-V4 and V8, calm, compact; the bench `house.basket` fixture plus `--preset finds`; card-check `finds` | M | 1 | stand-ins | V-B |
| V-D | **The collection page**: the `virtual_pet/collection` ws read; the journal's "finds ›" link; tiles and silhouettes; the bench `--collection` fixture; card-check | M | 1 | stand-ins | V-B |
| V-E | **Gifts**: bond `gift`/`gifts`/`next_gift_at`; the per-person clock; the weighting and gift-only finds; `mine.gift`; the first-look line V5-V7; `collect {gift: true}`; `forget_me`; diagnostics; the ♥ tiles; the privacy pytest and card-check | M | **2** | none new | V-B, V-D; Q2, Q3 |
| V-F | **Final art**: 60 finds + 3 baskets, one world per commit, each swapping its stand-ins | M (art-bound) | 1 | 63 | V-C; the Luna queue |

The whole build is **L**, as next-stages 2d says. V-B to V-E each touch about one module
on each side.

## 12. Tests

- **Bench** (`dev/bench/`; looks only, per AGENTS.md):
  - a `house` fixture for the channel (`visit`, `basket`): the bench doesn't drive the
    private channel today, so this is the needed addition;
  - a `basket: [ids]` shot field and a `reveal: {id, new, from?}` pin;
  - a `--collection` fixture like `--journal` (part met, one gift ♥);
  - `--preset finds`: all 60 finds at reveal size on each world's backdrop, the three
    baskets, a collection page per world, and a calm and a compact shot.
- **Card-check** (behaviour, a scratch HA through `scripts/gate -- --only …`):
  - `visitors` (extended):
    - the card plays the server's plan;
    - two card instances, and a browser in another time zone (`timezoneId`), agree;
    - a restart keeps the day's pick;
    - with no `house.visit`, v1's fallback still plays.
  - `finds` (new):
    - a seeded basket (via the `HA_CONFIG` storage edit, as `restart` seeds the bond)
      shows its picture with no number;
    - a tap reveals, and the basket empties on a second card at once;
    - the finds and collection survive `restart`;
    - no `call_service` row is written for a collect (the recorder's `events` table);
    - calm and compact behave.
  - `gifts` (new):
    - seeds `bonds[dev].gift`; dev's personal card says V5 and takes it;
    - a shared screen and the second user (`other`, card-check 8384) see nothing;
    - the sensor attributes and the bus carry no `gift`;
    - `forget_me` drops it.

## 13. Owner questions (8; recommendation first)

1. **Credit a visitor seen or not?** *Rec: the server credits it when its window ends,
   seen or not.* No card call, nothing missed by being away, and v1's catch-up line
   already tells you it came. (The alternative is crediting only when a screen plays it:
   a write from the card, and a visitor you never see stays a silhouette.)
2. **Gifts: to whom?** *Rec: each friend at bond level 3+, on their own clock, about once a
   week; never "the closest one".* Picking one person would rank people and show who's
   first.
3. **One-of-a-kind gift finds:** one per world that only a gift brings? *Rec: yes, six (the
   acorn-cap cup, pressed fern, knitted heart, pearl, paper boat and tiny telescope). No
   silhouette for them until someone has one, so there's no hole to fill.*
4. **The basket is the household's:** the first person to tap opens it, on any screen,
   shared and read-only logins too? *Rec: yes.* Finds name nobody. Gifts are the personal
   part.
5. **The collection:** silhouettes for unmet ones, no count, kept by the device across
   generations, one page per world? *Rec: yes, as §4.*
6. **The finds lists** (§2): pick, cut or swap. *Rec: as listed; the art session may adjust
   a shape that won't read at 12 cells.*
7. **Anything for the pet or the bond** when a find is opened or a gift taken? *Rec: none.*
   Points or happiness would make the basket a daily chore.
8. **Basket art:** one shared basket, or one per world (a woodland basket, a tidepool
   bucket…)? *Rec: one shared basket now (3 images); per-world later if it looks plain.*

## 14. Later (not in v2)

- Weather visitors (a snail after rain): the server's saved pick makes them possible.
- "I dreamed about my pine cone": a `find` dream seed.
- Seasonal finds (a conker in autumn, a snowflake in winter), through the seasons table.
