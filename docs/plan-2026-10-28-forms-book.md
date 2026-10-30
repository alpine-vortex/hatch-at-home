# The forms book (build plan, DRAFT 2)

**Deferred to a later release (owner, 2026-10-30)**, with Wave 4 PRs 4a, 4b, 4d, 4f and 4g.

Option B of `scope-2026-10-28-progression-unlocks.md`. Its "Decided (owner,
2026-10-28)" section is the authority, and this plan changes none of it. Draft 2
folds in the adversarial audit of draft 1 (19 findings) and the owner's answers of
2026-10-28; **the table at the end ("The audit of draft 1") wins over any older
wording that survives in the body.**

- Only portraits are locked, never play. Every creature can still hatch and be
  picked with `select.<pet>_next_egg` (`select.py:NextEggSelect`).
- A form nobody here has reached is a **plain silhouette with no text at all**: no
  hints, no stage label, nothing about when or how it appears (owner answer 3).
- A new page is marked **once, on the card only**: one quiet "new page in your
  journal" moment and a dot on the journal link until it's opened. No phone message,
  nothing in HA history.
- A hatched creature's baby form always shows; only forms not yet reached start dark.
- Upbringing is words beside "raised here", never a collectable form.
- Backfill from `raised` and `journal`, so no home ever sees fewer portraits than today.

## Decided (owner, 2026-10-28, after the draft 1 audit)

1. A creature's tile shows the **furthest form** seen.
2. A retired record **without** upbringing still counts as an adult (`adult` from any record).
3. **No stage labels under dark forms.** A dark form is a plain silhouette with no
   text at all.
4. "Show every form" also reveals unhatched creatures and turns off the dot and the
   new-page line.
5. Upbringing words are printed for **retired and current adults only**.
6. The new-page line comes **once per form**.
7. **Deleting a device offers a choice, and the default is to remove its pets from the
   book.** (First relayed wrongly as "they stay"; corrected by the owner, 2026-10-28.)
   A per-device option "keep this pet's family in the forms book if this device is
   removed", **off by default**; on, removal copies a summary into a small house-wide
   store the book also reads (see "Deleted devices").
8. The "raised here" list is capped at **four, then "and more"**.
9. Beetle: **nothing** (no art, no `species.json`, absent from the book).
10. The list includes pets from **every same-world device on the card**: pet names and
    generations only, **never people**.
11. **Personality words** sit beside a pet's name too, as the journal's family line
    does.
12. **"Show every form" ships as a card option, OFF by default.**
13. The label is **"raised here"** (not "raised by").
14. At teen, the new-page line comes **after** "I'm a teen now!" **and** the
    personality reveal.
15. A dark form's accessible name is **"not seen"** (no "yet"). The no-hint test regex
    is widened (see Card checks, C2).

Not asked, kept from draft 1's recommendations: on a **shared screen** the new-page
line still fires but the dot is hidden (a wall tablet nobody opens would carry it
forever).

## Privacy (a rule for this build)

A separate privacy-hardening plan is removing every per-person sensor attribute
(0.35.0b4 onward). This build must sit cleanly beside it:

- `PetState.seen` (the per-device furthest-stage map, species to stage) **carries
  nothing per-person and must be in `_unrecorded_attributes`.**
- Nothing in the book names a person. The page reads **only** `seen`, `journal`
  (`species`, `name`, `generation`, `upbringing`, `personality`), the live pet's
  `species`, `generation`, `upbringing`, `personality`, `world`, `roster`, its stage
  and its device name (the pet's name). It **never reads** `bonds`, `notify_users`,
  `wish` (`for_name`), `favourites`, any nickname, or `hass.user`, and it must keep
  working if the privacy plan has removed those attributes. A card-check injects a
  bond nickname and a `notify_users` id and asserts neither string appears (C14).
- Shared screens (`sharedScreen()`) show the book and the pets' names but no person.
- Pet names are pets, not people; but the label says "raised **here**" so a viewer
  can't read a pet's name as a person.

This is a draft for review; it contains no code. Every new player-facing word is in
the copy table ("Copy"): the owner approved the decisions above, the exact words are
**proposals**.

## What the scope's numbers miss (checked against main, 0.35.0b3)

Re-checked on `origin/main` (`0821baf`, 0.35.0b3, PR #38 merged, so the 17-creature
art is on main and the old "build after the art branch" precondition is met):

- `sprites/*/species.json`: **30 files, all ready, all with `"stages": ["baby",
  "child", "teen", "adult"]`.** No species has fewer than four forms, so the page is
  always four slots.
- `worlds.json`: woodland 5, terrarium 6 listed (gecko, tarantula, **beetle**,
  tortoise, beardeddragon, ballpython), hearth 5, tidepool 5, pond 5, nightsky 5.
  **`beetle` has no `species.json`**, so `species.py:load_catalog` never puts it in
  `Catalog.species` and `Catalog.roster` drops it: Terrarium shows **5**, total
  **30 creatures, 120 forms**. The card never sees `beetle` (its roster is
  `sensor.life_stage` attribute `roster`, `coordinator.roster`). Owner answer 9:
  nothing to do; if beetle's art lands with a `species.json` and four stages it
  appears as one more unhatched tile.
- `sprites/` holds **121** `*_content_1.png`: the 120 forms plus
  `sprites/beetle/baby_content_1.png`. (Draft 1 said 123 = 120 + 3 eggs; wrong: no
  egg file matches, and the other two beetle files are under `art/beetle/rejected-v1/`,
  not `sprites/`.) The book draws each form from `sprites/<id>/<stage>_content_1.png`.
  A data test (test 11) checks that every `species.json` species has all four files.
- A stage's length is `rates.STAGE_STARTS`: baby from 0.5 h, child 24 h, teen 120 h,
  adult 336 h of age (aging pauses while away). A new creature's four pages open over
  14 days of age.
- Performance is a non-issue: the grid shows one world's roster (5-6 tiles) and a page
  draws four images. The real costs are `_bookOf` on every `_update` (it loops slides
  and parses `localStorage` JSON) and the existing `[dict(r) for r in journal]` copy per
  sensor update. Parse the stored book **once per draw** and cache it (see Card).
- A dark form is **not a secret, a display rule**: the coloured png is still fetched
  and hidden by a CSS filter (as locked tiles are today), so anyone can open it in
  devtools. Nobody should add a build check for that.

## What the person gets

1. **The journal's grid is a book of creatures.** Open the journal (status screen,
   "journal ›"): the world's creatures as tiles, as today. A creature nobody here has
   hatched is a black "???" tile, as today (and not tappable). A hatched creature's tile
   shows its name and the **furthest form seen** (Card, "The tile").
2. **Tap a hatched creature: its page.** Four slots in a row: baby, child, teen,
   adult. Forms reached here show in colour. Forms not reached are **plain black
   silhouettes with no text at all**. Under the four slots: who raised it here, in
   words: "Pip · gen 2 · devoted · shy"; a pet still growing up shows
   "Pip · gen 3 · now". Nothing on the page is a number, a percentage, "missing" or
   "x of 4".
3. **A new page, once per form.** The first time any pet on the card's devices reaches
   a form this browser hasn't been shown (a creature hatches, or grows into its next
   form), the pet says one extra quiet line after its usual one(s) and the journal link
   on the status screen gets a small dot, until the journal is opened on this browser.
   At baby the bubbles are "hello!" then the new-page line; at child and adult, the stage
   line then the new-page line; **at teen, "I'm a teen now!", the personality reveal,
   then the new-page line** (three bubbles; draft 1 wrongly said two). Nothing goes to
   phones, Assist, the event bus, notifications or HA history.
4. **A card option "show every form"** (`show_all_forms`, **off by default**): every
   creature and form is drawn in colour, unhatched creatures get their names, and the dot
   and the new-page line are off. A display choice: changes nothing stored.
5. **Existing homes lose nothing.** Every creature a device has hatched shows its baby
   and child; teens and adults open from retired pets in `journal` and from the current
   pet's stage.

What stays exactly as it is: the egg, the roster, `select.<pet>_next_egg`, the way
forms are drawn on the pet itself, the family line and photos and memories below the
grid.

## Server (PR 1)

### The field: `PetState.seen`

`PetState` (`model.py:76`, the saved dataclass, next to `raised` at line 112) gets

    seen: dict[str, str] = field(default_factory=dict)  # species -> furthest stage reached

Why a furthest stage and not a set of (species, stage):
- Stages only go up (`life_stage` is derived from `age_hours`, which only grows;
  `catch_up` and `advance` never reduce it), so "furthest" loses nothing and is the
  smallest thing to store (at most 30 short pairs).
- `advance` steps in `R.MAX_STEP_SECONDS` (300 s) bites, so a live step cannot cross
  two stages, but a hand-edited store or a later change could. "Furthest" is right
  regardless: reaching adult means the earlier forms were
  reached. Compare by index in `model.LIFE_STAGES` (`model.py:44`), never by string.
- It is per device, like `raised` (the scope's decision): the device is the unit that
  has a store (`coordinator.py:161`, `PetStore`).

Values are only `baby`, `child`, `teen`, `adult`. `egg` is never stored: an unhatched
creature is not in `seen`.

### Where it's set

A small pure function `mark_seen(state)` in `model.py`: if `state.species` is set and
`life_stage(state)` is not `egg`, set `state.seen[species]` to the later of the
existing value and the current stage (by `LIFE_STAGES` index). Called:

1. In `model._step` (`model.py:409`, the `if stage != was_stage:` branch), **after**
   `_hatch` has run for the egg to baby step and after the `stage_changed` event is
   built, on every stage change. This covers hatching (egg to baby; `_hatch` sets
   `state.species` and appends `state.raised`, `model.py:458`) and each later stage.
   Not in `_hatch` itself: `_hatch` doesn't know the stage the step lands on, and
   `_step` is the one place a stage changes.
2. In `PetState.from_dict` and by the coordinator after its old-species fix-up (below).
3. In `lay_egg` (`model.py:1021`): see "The next generation".

It adds **no model `Event`**. This is deliberate: `coordinator._fire`
(`coordinator.py:783`) fires `hass.bus.async_fire("virtual_pet_<type>")` and calls
`self._notify` for every event, and puts any type in `MOMENTS` into `sensor.last_care`'s
`moments`. A "new form" event would land in HA's event stream (where an automation, or
a notify blueprint, could pick it up) and could reach a phone. Both break the owner's
decision. Newness is worked out on the card from `seen` alone (see Card, "The new
page").

### The next generation

`lay_egg` builds a fresh `PetState.new(...)` and copies fields **by hand**
(`egg.raised = list(state.raised)`, `egg.journal = [...]`, `egg.firsts`,
`egg.memories`, `model.py:1041-1048`). Anything not listed there resets. So: add
`egg.seen = dict(state.seen)` beside `egg.raised`. Without it the book empties at
every generation. This is the likeliest bug in the build, so it has its own test.

### Load: validation and backfill

In `PetState.from_dict` (`model.py:153`), after the existing per-field validation
and before `cls(**kwargs)`:

- **Name the local `book`, not `seen`**: `from_dict` already has a local `seen`
  (`model.py:161`, `seen = dict(kwargs.get("trait_hours") ...)`) that a careless
  `seen = kwargs.get("seen")` would clobber.
- `book` (the `seen` kwarg) not a dict: `{}`. Keep only items whose key is a non-empty `str` and whose
  value is one of `baby`, `child`, `teen`, `adult` (drops `"egg"`, unknown stages,
  non-strings). Species not in today's catalog are **kept** (a shelved species can
  return; `raised` does the same, `from_dict` doesn't filter it).

After `state = cls(**kwargs)`, a helper `backfill_seen(state, legacy)` (a module
function in `model.py`, so the coordinator can call it too) raises `state.seen`
to at least the rows below. `legacy` is `"seen" not in data`: the store was written
before this field existed. **The `raised` row runs only when `legacy` is true.** The
other two rows run on every load.

| Source | Raises `seen[species]` to |
| --- | --- |
| each species in `state.raised` (`str`), **legacy stores only** | `child` (the scope's "reveals its baby and child"; today's tile is the child portrait, so this is what keeps the portrait) |
| each `state.journal` record's `species` (`str`; retired pets are always adults, `model.lay_egg` only lays after `can_lay_egg`) | `adult` |
| the current pet: `state.species` and `life_stage(state)` is not `egg` | its current stage |

**The legacy `raised` row is capped for the current pet.** If the legacy `raised` row
would raise the *current* pet's species above its actual stage (a baby hatched during a
downgrade, a restored backup, a store with the field stripped: all look "legacy"), the
cap is the current stage, which row 3 already knows. Two lines of code that remove the
case of a child page for a baby. Species the current pet is *not* is unaffected: retired
species in `raised` still get `child` ("never fewer portraits"). The known remaining
exception to "only forms not yet reached start dark" is therefore only those retired
species, whose child the old tile already showed.

Why the `raised` row cannot run on every load: `_hatch` appends the species to
`raised` at hatch (`model.py:458`), so a live baby is in `raised` with only `baby`
seen. A restart in its first day would otherwise raise it to `child` early, breaking
"only forms not yet reached start dark", the plan's own "a creature that hatched live
has only the baby seen", and sending a false new-page line to an open card. The
`journal` and current-stage rows are always true, so they are safe every load. The
marker for "legacy" is the key's absence, so there is no flag, no migration, no
storage version bump (the project's `STORE_VERSION`
stays; `from_dict` already "ignores unknown keys and defaults new ones", `model.py:155`).

**Ordering trap.** `coordinator.py:340-344` appends `old_species` to `raised` *after*
`from_dict` (a pet set up before worlds existed). A backfill that lives only in
`from_dict` misses that species. So the coordinator calls
`model.backfill_seen(self.state, "seen" not in data)` once more right after that
block (`data` is the loaded dict, still in hand at `coordinator.py:334`); in the
`data is None` branch (a brand-new pet) nothing is needed. A legacy store with an
old species and no `seen` therefore gets that species at `child` too.

A home that has never had the field gets it filled on the first load after the
update, and the first `async_save` stores it. Before that save the card still gets
the attribute (it reads live state), so nothing waits for a write.

A downgrade then upgrade: an older build saves without `seen`, so the next upgrade is
"legacy" again; the cap above keeps that harmless. A newer-version-written store loaded by an older version: the unknown key is ignored
(`known` filter) and the data is not lost when it's saved back by the newer version
(the older one drops it on its save; that is the same rollback behaviour as every
field and is accepted).

### Exposure to the card

`sensor.py:LifeStageSensor.extra_state_attributes` (`sensor.py:~196`, the same
attribute dict that carries `raised`, `journal`, `roster`) gets

    "seen": dict(self.pet.seen),

a **copy**, per the comment at the top of that property (the model mutates in place;
HA sends only attributes that differ from the last state). Nothing else changes:
no new entity, no new service, no websocket command, no options.

**Kept unrecorded.** Add `"seen"` to that sensor's `_unrecorded_attributes` frozenset
(`sensor.py:145`, beside `raised`, `journal`, `memories`). The sensor's *state* (the
stage) is what lands in the recorder, as today; the attributes are excluded, so a
new page writes nothing to history. A test asserts `"seen"` is in the set (`tests/test_init.py` ~840
already loops over the attribute keys that must stay unrecorded; add `seen` there).

`diagnostics.py` dumps `pet.to_dict()` (line ~78, redacted by `REDACT_STATE`), so
`seen` appears there automatically. It's species and stage names only (the same as
`raised`), nothing personal: no change, noted so the auditor doesn't hunt for it.

Not exposed: to Assist, the LLM prompt (`llm.py`), `intent.py`, notifications
(`notify.py`) or the `sensor.mood` attributes.

### Multi-device homes

Each device keeps its own `seen`. The card merges: the max stage per species over
**the devices the card holds** in the same world (the same rule `_renderJournal`
uses for `raised`: it loops `this._slides` and keeps `st.world === stage.world`).
Consequences, stated so the owner isn't surprised:

- Two Woodland devices on one card share one book. Pip (device A) reaching teen
  fills the fox's teen page for the dashboard that shows both.
- A device not on the card adds nothing to that card's book (same as `raised`).
  Two dashboards showing different devices can show different books. This is the
  scope's stated behaviour; no home-wide store is added (that is option D's).
- A device deleted from HA: **by default its `seen`, `raised` and `journal` go with it**
  (as today, and owner answer 7). Only when that device's "keep" option was on do its
  pets stay: see "Deleted devices" below.
- No cross-person state: `seen` is the device's, not a person's, so the book can't
  rank anyone and is the same for everyone looking at the same card.
- The new-page marker is per browser (below), not per person and not on the server.

### Deleted devices (owner answer 7: remove by default, keep by choice)

**Real hook?** Home Assistant shows no dialog when an integration entry is deleted and
offers integrations no "ask at deletion time" hook: `async_remove_entry`
(`__init__.py:435`) runs after the user has confirmed, with nothing to ask. The only way
to give the choice is **before** deletion, so it is a per-device option. (If the build
finds a real ask-at-delete hook in the HA version in use, prefer it and say so; none is
known.)

- **The option:** `keep_in_book` (boolean, **default off**) in `PetOptionsFlow`
  (`config_flow.py:228`, `OptionsFlowWithReload`), in `entry.options`, with a label and
  helper in `strings.json` / `translations/en.json` (copy table, proposals). Off: removal
  works exactly as today (`async_remove_entry` deletes the pet's `PetStore` and issues).
- **When on,** `async_remove_entry`, **before** removing the pet's store, loads that
  store with `PetState.from_dict` (so validation and backfill apply) and writes a summary
  into the house-wide `Store` `virtual_pet.book` under a key per entry id: `world`,
  `seen` (species to stage), and per pet `species`, `name`, `generation`, `upbringing`,
  `personality`, from `journal` plus the current pet (its species at its current stage).
  **Nothing per-person:** no `bonds`, `notify_users`, `wish`, `favourites`, user ids or
  nicknames, and the summary is built by an explicit allow-list of those keys, not by
  copying the dict. If the load fails, remove as today and keep nothing.
- **Reading it:** every `LifeStageSensor` of the same world exposes the kept entries of
  its world as one more attribute, `kept` (same shape as the summary, **in
  `_unrecorded_attributes`**), and `_bookOf` takes the union: stage maxima into `forms`,
  pets into `raisers`, de-duplicated on (species, name, generation). Nothing else in HA
  reads the store. A card whose server lacks `kept` simply shows less.
- A world with no remaining device shows no card, so its kept entries have nothing to
  show them until a device of that world exists again.
- Removing the *last* entry leaves the house-wide store (it is small, names and stages
  only). Removing the integration entirely: the store is deleted with it (the last
  `async_remove_entry`), so uninstalling leaves nothing behind.
- This is a house-wide store, which the scope called option D's. It is the smallest piece
  of it and is **only written when the owner turns the option on for a device**.

Tests (PR 1, with 12-13 in the server list): option off, remove: nothing kept and the
store is gone as today; option on, remove an adult-reached pet: the surviving same-world
device exposes the species at `adult` and the pet's line in `kept`, with none of the
forbidden keys present; a different-world device does not see it; the summary is
allow-listed (inject a `bonds` key into the store and assert it is absent); a failed
load removes as today; the option is off by default for a new entry and an existing one.

## Card

All in `custom_components/virtual_pet/frontend/hatch-pet-card.js`. Line numbers are
0.35.0b3 and drift: **find things by function name** (`_renderJournal`, `_journalLink`,
`_setStatus`, `_moment`, `_queue`, `_lines`, `_update`, `sharedScreen`).

### Reading the book (one helper, cached per draw)

`_bookOf(s)` (new, beside `_renderJournal`) returns, for the world of slide `s`:

- `forms`: `{species: furthest stage}`, the max by stage index over every slide in
  `this._slides` with `sensor.life_stage` attribute `world === stage.world` of its
  `seen`. **Fallback when `seen` is absent** (an older server, a cached card newer than
  the integration): derive from that slide's attributes the way the server backfill
  does: `raised` to `child` (capped at the slide's own stage for its own species),
  each `journal` record's `species` to `adult`, and the slide's own species to its
  `sensor.life_stage` state if not `egg`. A card newer than its server never shows
  fewer portraits.
- `raisers`: per species, a list built from every same-world slide's `stage.journal`
  records (`{name, generation, upbringing, personality}`; **all** records, not the
  family line's last four) plus each slide's current pet (`generation`, device name via
  `this._hass.devices[s.ids.device]`, `name_by_user || name`, `personality` where it
  has one, and `upbringing` only if the stage is `adult`). **Privacy rule:** this reads
  no other attribute (see "Privacy").
- `showAll`: `this._config.show_all_forms === true`.

Cache the parsed result (and the parsed `localStorage` book) once per `_update`; do not
re-parse per tile.

### The tile (what the grid shows)

Today `_renderJournal` hard-codes `child_content_1.png` and `known = raised.has(id)`.
Change `tiles` so a tile is:

- **Unhatched** (not in `forms`, and not `showAll`): `.jtile.locked`, the child image
  as now (`.jtile.locked img { filter: brightness(0); opacity: .3 }`), label `???`, not
  a button. Identical to today.
- **Hatched**: a `<button class="jtile">` showing the **furthest form seen**
  (`<stage>_content_1.png` for `forms[id]`; owner answer 1) and the lower-cased name. A
  creature that hatched live has only the baby seen, so its tile shows the baby and
  never contradicts the page it opens. A creature backfilled from `raised` has `child`
  at least, so existing homes see at least today's portrait. The tile gets a **button
  reset** in CSS (the grid and `.jtile` rules have none today).
- A **dot** on a tile whose page has an unacknowledged form, as a child `<span>`
  (never a class on the button: `_setStatus` restores focus by the focused element's
  class string, so a class that appears and disappears loses the focus).
- With `showAll` on: every creature is a hatched-style tile with its name, no dot.

Tapping a hatched tile sets `s.page = id` and redraws. `s.page` is a new slide field
reset in the same two places `s.journal = false` is reset (builder re-finds them by
that text).

### The journal is re-rendered: how the page must fit it

`_renderJournal` is **not built for a page that re-renders** (draft 1 missed this):
it first paints an "opening…" loading view on every call, then awaits `species.json`,
and it is called again on every photo/state update (`if (s.journal) this._renderJournal(s)`).
Also `_journalLink` binds `s.status.querySelector(".jlink")`, the **first** `.jlink`
only. So:

- The grid and the page are two render modes of `_renderJournal`. Skip the loading view
  whenever `s.page` is set or the species names are already cached (cache `names` on
  the slide after the first load), so tapping a tile or a state update never flashes
  "Gathering your pet's memories…".
- The page's "‹ journal" back link gets **its own class** (say `.jback`) and its own
  handler; the grid's "‹ status" keeps `.jlink`. Never two `.jlink`s in one view.
- `names` must cover **every species in `raisers` and `forms`**, not only `roster` plus
  the last four `past` records (otherwise a name reads "undefined").
- If a species' `species.json` fails, the header falls back to the id.

### The creature page

Header: the creature's name (`species.json` `name`). Then four slots in `STAGES` order,
each a plain `<figure>` (nothing to open):

- Reached (or `showAll`): the colour portrait, `alt` = "<name>, <stage>", and the stage
  label under it **only for reached forms** (copy table).
- Not reached: the same image with the `locked` filter (a new `.jform.locked img` rule,
  copying `.jtile.locked img`), `alt=""` and `aria-label="not seen"` on the figure.
  **No text at all, not even a stage label** (owner answer 3). A dark form is a plain
  silhouette; the stage label is not drawn for it.

Below, a "raised here" section from `raisers[id]`: **the newest four generations,
shown oldest first** (the family line is also oldest first, one order throughout), with
"and more" ahead of them when there are older ones. Each line: `<name> · gen <n>` then
words beside the name, as the family line does: **upbringing for retired pets and
current adults only** (owner answer 5; never beside a pet still growing up) and the
**personality** word where the record or the pet has one (owner answer 11). A pet still
growing up shows "now" in place of upbringing. Upbringing is never a slot, a badge, a
different portrait or a count. A species with fewer than four `stages` in its
`species.json` (none today) draws only its listed stages.

### The new page and the dot

The marker is **per browser**, in `localStorage` (like `hatch-seen-<device>` and the
once-a-day keys):

- Key `hatch-book-<world>`: JSON `{species: stage}`, the forms **this browser has been
  shown**. A world, not a device, because the book is the world's on this card. **Never
  write a key for an undefined world** (`hatch-book-undefined`).
- **Seeding waits for every slide.** Seed the key silently only when the key is absent
  **and** every slide in `this._slides` has a `sensor.life_stage` state that carries a
  `world`. Seeding on a first draw where one of two same-world devices hasn't arrived
  would later show a dot for the whole backfilled book when it does (audit finding 1).
  Until seeded: no dot, no line.
- **The dot** is pending when any species' current stage is later than its stored one.
  Computed in `_update` from `_bookOf`, so it survives a reload and needs no server push.
  It sits on the journal link (as a child `<span aria-label="new page">`, not a class on
  the button) and on the tile of each creature with a new form. **Opening the journal
  clears it**: write `forms` to the key. With `showAll` on, the dot is off (owner
  answer 4).
- **The moment** (the extra line), once per form (owner answer 6), is hooked to the live
  events the card already gets (`hatched` and `stage_changed` in `sensor.last_care`
  `moments`, already in `coordinator.MOMENTS`, so no new event), not to a diff of the
  merged book. **Ordering is specified**, because `sensor.life_stage` `seen` and
  `sensor.last_care` `moments` can arrive in the *same* hass update and `_update` runs the
  moments in a `forEach`:
  1. Read the **cached book from before this update** (the previous draw's `forms`)
     *before* calling this update's `_bookOf`.
  2. In the moments loop, for each fresh moment (those past `s.lastMoment`, and
     `recent(m.at)`, 15 s of `last_care.last_updated`), compare its (species, stage)
     against the cached book. If absent, queue the line and **add it to the cached
     book at once**, so a second fresh moment in the same batch (`hatched` + a quick
     `stage_changed`) compares against an up-to-date book.
  3. After the loop, refresh the cache from this update's `_bookOf`.
  Draft 1's "take it from the last draw's cache" left both failure modes: refreshing
  before the loop means the hook never fires; after it with no per-moment update means a
  stale compare.
- **The line follows the stage lines and goes through `_lines`.** The extra line is
  queued with `_queue` after `_moment`'s `say(...)`. At teen `_moment` already queues the
  personality reveal; the hook runs after the whole `switch` for that moment, so the
  order is "I'm a teen now!", the reveal, the new-page line (owner answer 14). It is
  routed through `this._lines(s, "newpage", fallback)` so baby talk and the pet's voice
  apply as for every other queued line (the baby-talk plan's mechanism); the copy table
  has a baby-talk proposal.
- **A shared screen** (`sharedScreen()`): the moment fires (no name or person in it);
  the **dot does not show**; the pages still fill in.
- **`showAll` on:** neither the dot nor the line (owner answer 4).
- It uses no bond, no nickname and no `hass.user`, so it is the same for every viewer.
  It adds no sound beyond what `_speak` already does and no vibration.

### "Show every form" (a card option, off by default)

Card option `show_all_forms: true` (the card's other options are `seasonal` and
`experimental_catch`), read in `_bookOf`. On: every creature of the world is tappable
and every form is in colour, **including creatures nobody has hatched** (the `???`
becomes the name), and the dot and the line are off. Off (the default) changes nothing.
It shows **no** new words beyond the names already shown. The editor
(`hatch-pet-card-editor`) has one field, `devices`, and a constant `computeLabel`; the
checkbox means a per-name `computeLabel`/`computeHelper`, a `boolean` selector and
`_changed` writing/removing the key (it already keeps other keys). The builder confirms
on the dev HA. This ships as its own PR (2c), off the critical path.

### A missing image

If a form's png fails to load, the `<img>` gets an `onerror` that hides it and leaves
the slot as an empty silhouette box, never a broken-image icon.

### Nothing is lost, and nothing nags

The page never says "locked", "missing", "x of y" or a percentage and has no counter.
The merge only takes maxima, so a form once seen stays on the server side
(`backfill_seen` only raises) and the card only reads. Clearing a browser's
`localStorage` can only re-seed silently.

## Tests

### Server (`tests/test_model.py`, `tests/test_init.py`)

pytest, the existing style (`model.advance(pet, start + HOUR, settings,
random.Random(1), max_gap=None)`).

1. Hatching sets `seen[species] == "baby"`; a day later `child`; 120 h `teen`; 336 h
   `adult`. A single `advance` that crosses two stages leaves the later one.
2. `seen` never goes down: `mark_seen` with a lower stage keeps the higher.
3. `lay_egg` carries `seen` to the egg, **as a copy, not the same dict** (an explicit
   alias assertion), and the new species hatching adds to it.
4. `from_dict` with no `seen` backfills: `raised=["bird","fox"]` both `child`; a
   `journal` record for `fox` (with **no** `upbringing`, owner answer 2) gives `adult`; a
   current teen `squirrel` gives `teen`; `raised=[]` and no journal gives `{}`.
5. `from_dict` validation: `seen` a list, string, `None` gives `{}`; `{"bird":"egg"}`,
   `{"bird":"giant"}`, `{"":"baby"}` dropped; unknown species kept; round trip
   `from_dict(pet.to_dict()) == pet`. (`{1:"baby"}` is only reachable by calling
   `from_dict` with a Python dict, not from a JSON store: keep it for that path.)
6. A restart doesn't promote a live baby: hatch, `from_dict(pet.to_dict())` keeps
   `{species: "baby"}`. Backfill never lowers (`adult` stays). **A legacy store plus a
   live baby survives two restarts unchanged.**
7. **Legacy cap:** a store without `seen`, `raised=[current]`, current pet a baby: the
   baby is `baby`, not `child`; a retired species in `raised` is `child`.
8. Coordinator ordering: a store with `species=None`, an old species and no `raised`
   ends with that species in `seen` after setup.
9. The sensor exposes a copy (mutating the model's dict doesn't change an earlier read).
10. `"seen"` is in `LifeStageSensor._unrecorded_attributes` (add it to the key loop in
    `tests/test_init.py`, around line 840), **and no per-person key ever appears in
    `seen`** (only species keys and stage values).
11. No new event: advancing across a stage fires the same types as before and
    `coordinator.MOMENTS` is unchanged. Use `fast_forward` for state (it is `simulated`,
    so no moment, see Card checks).
12. Data test (`tests/test_species.py`): for every species with a `species.json`, all
    four `<stage>_content_1.png` exist, and `stages` is the four the card draws.
13. Deleted devices (owner answer 7): the `keep_in_book` cases listed under "Deleted devices" (off by default; on keeps an allow-listed summary; `kept` is unrecorded and per-world).

### Card (`scripts/card-check.js`, `scripts/card-check`)

The existing harness (needs `scripts/develop` and Playwright). `inject(entity, patch)`
patches an entity in the page; **a server update overwrites an injected attribute**, so
each check injects, waits for the result and re-injects until it shows (as the memories
check does).

How tests get a stage and a line: `fast_forward` (`services.yaml`, max 168 h per call)
crosses stages on the dev HA but runs `_advance(simulated=True)`, which **skips
`MOMENTS`** and fires events with `simulated: true`. So `fast_forward` gives the state
and the **dot**; the **line** can only come from an **injected moment** in
`sensor.last_care` `moments`, whose `at` must be within `recent()` (15 s of
`last_care.last_updated`: the check sets both).

- C1. **No `seen` on an old server** (inject without it): `raised: ["bird"]` shows one
  coloured tile, the others `.jtile.locked`; a tile is a button; `.jtile.locked` count =
  roster minus raised.
- C2. **Silhouettes, no text:** inject `seen: {bird: "child"}`, tap the bird: four
  `.jform` figures, two coloured and two `.locked`. A **dark figure contains no text node
  and no stage label**, and its accessible name is exactly "not seen". The whole page
  text matches none of `/in about|days?|weeks?|soon|grow|hint|yet|later|locked|missing|\?|
  still|until|unlock|need|reach/i`.
- C3. **Tile shows the furthest form:** `img` src ends in `baby_content_1.png`,
  `child_...`, `teen_...` for the matching `seen`.
- C4. **Backfill parity:** `raised: ["bird","squirrel"]`, `seen` absent: two unlocked tiles
  as before.
- C5. **Two-device merge:** both dev pets' `world` the same, `seen` `{bird:"baby"}` and
  `{bird:"teen"}`: the bird page shows three coloured forms, and the raised-here list has
  both pets (names, generations only).
- C6. **Another world adds nothing:** one pet's `world` different, `seen:
  {squirrel:"adult"}`: the squirrel stays dark.
- C7. **The new page:** seed (clear the key, load; no dot, no line); inject `seen` and a
  `stage_changed` moment in the **same update**: the dot, one queued line **after** the stage
  line; a second identical inject says nothing; opening the journal clears the dot and
  rewrites the key. At teen the order is stage line, reveal, new-page line. In baby talk
  the line is the baby-talk variant.
- C8. **A browser that wasn't looking** (moment already in the list at load): dot yes,
  line no. A second same-world device's `seen` arriving **late**: no dot and no line, and
  the seed key is not written until both slides have a `world` (no `hatch-book-undefined`).
- C9. **Shared screen:** line yes, dot no, no person on the page.
- C10. **`show_all_forms: true`** (`setConfig`): no `.locked` anywhere, unhatched tiles
  show names, no dot, no line; **off by default** (no option, behaves as C1).
- C11. **Unrecorded** (only if the dev config has the recorder): history for the sensor has
  no `seen`; else server test 10 is the guard and the PR says so.
- C12. **No new event:** subscribe to the event stream across a `fast_forward` stage
  change; only existing `virtual_pet_*` types fire.
- C13. **A broken image:** inject a species with no teen art: the slot is a silhouette
  box, no broken `<img>`.
- C14. **Privacy:** inject a bond nickname and a `notify_users` id; neither string appears
  anywhere on the grid or a page, on a shared screen or off.
- C15. **Re-render:** tapping a tile or a state update on the page never shows
  "Gathering your pet's memories…", and "‹ journal" and "‹ status" each work (separate
  handlers); focus survives the dot appearing.
- Screenshots to `dev/card-check/` at 330 px and compact for pages with **0, 2 and 4
  forms** and for the dot, for the owner's sample sheet. Downscale before reading.

The look of a real 5-6 creature grid is checked by injecting `roster` and `seen`, not by
real hatches. A real hatch-to-adult needs 14 days of age; `fast_forward` gets there in two
calls but is simulated.

## Phases and PRs

Versions: **0.35.0b4 onward is the privacy-hardening work** (a separate plan). The forms
book's versions are **decided at build time**, on top of whatever has shipped then; the
bump goes last in each PR (as in the baby-talk plan). The builds are not blocked on the
art (merged in 0.35.0b3).

1. **PR 1: the state.** `model.py` (`seen`, `mark_seen`, `backfill_seen` with the legacy
   cap, `from_dict` validation, `_step` call, `lay_egg` carry-over), `coordinator.py`
   (second `backfill_seen` call), `sensor.py` (the attribute and its
   `_unrecorded_attributes` entry), the `keep_in_book` option and house-wide `virtual_pet.book` store (`config_flow.py`, `__init__.py`, `strings.json`, `translations/en.json`), the `kept` attribute, `docs/guide.md` (the
   `sensor.<pet>_life_stage` row), tests 1-13.
   **Done =** pytest passes; a dev HA's sensor shows `seen` after a restart on an old store;
   history shows no `seen`; `lay_egg` keeps the book and is not aliased; a legacy store
   plus a live baby survives two restarts; no new event types; nothing per-person in
   `seen`; on a shared screen nothing changes yet. Nothing visible to the person.
2. **PR 2a: the book.** `_bookOf` (cached), tile (button + reset), page, silhouettes,
   the `_renderJournal` render modes and back link, card-check C1-C6, C13-C15.
   **Done =** card-check passes; an old-server run (C1, C4) shows no fewer portraits; the
   screenshots exist (330 px and compact; a page with 0, 2 and 4 forms) and the owner has
   seen the sample sheet: no text on any dark form, no broken image, no "undefined".
3. **PR 2b: the dot and the line.** Seeding, dot, moment hook with its ordering, shared
   screen, `_lines` and baby talk, C7-C9, C12.
   **Done =** C7-C9 and C12 pass, including the same-update and late-device cases; shared
   screen shows the line, not the dot, and no person.
4. **PR 2c: `show_all_forms` and the editor field,** off by default, C10. Off the critical
   path; can ship after 2b.

Guide: the "The journal" bullet describes the book, the silhouettes, the dot and the option
(owner reviews at the PR 2a audit).

## Copy (proposals; the owner approved the decisions, not the exact words)

| Where | Proposed words | Notes |
| --- | --- | --- |
| New-page line, normal | a new page in your journal ♥ | Once per form; no name, same on a shared screen. Through `_lines` |
| New-page line, baby talk | new page! journal! ♥ | Proposal for the baby-talk variant (`_lines`) |
| Unhatched tile label | ??? | As today |
| Dark form: visible text | (none) | Owner answer 3: a plain silhouette |
| Dark form: accessible name | not seen | Owner answer 15; no "yet" |
| Reached form: stage label | baby / child / teen / adult | Under reached forms only |
| Journal link when a page is waiting | journal › plus a dot | Dot `aria-label="new page"` |
| Page: back link | ‹ journal | Own class, matches "‹ status" |
| Page: section label | raised here | Owner answer 13 |
| Line | Pip · gen 2 · devoted · shy | Upbringing for retired and current adults only; personality where known |
| A pet still growing up | Pip · gen 3 · now | |
| More than four | and more | Ahead of the newest four |
| Device option: label | Keep this pet's family in the forms book | Per-device options flow (`keep_in_book`), **off by default**, because HA asks nothing when a device is deleted |
| Device option: helper | If you remove this device later, its pets stay in the forms book. Left off, they go with it. | Also the only text about the choice; names no person |
| Card option label / helper | Show every form / Draw every creature and form in colour | Editor checkbox, off by default |

Nothing here counts, scores or names a requirement. Existing stage lines ("I'm a teen
now!", "all grown up! ♥") are unchanged.

## Out of scope

Code; another audit; hints or text on dark forms; points, percentages, "missing" counts;
gating eggs or worlds (options C, D); anything on phones, in Assist, in the LLM prompt or
on the event bus; anything per-person.

## The audit of draft 1 (19 findings) and what changed

**This table wins over any older wording in the body.** Each claim was checked against
`origin/main` (0.35.0b3, `0821baf`) before folding. All 19 held; one needed a correction (#10).

| # | Finding | Change |
| --- | --- | --- |
| 1 | The dot's first-load seeding races the slides (false dot for the whole book; key `hatch-book-undefined`). Confirmed. | Seed only when every slide has a `world`; never write an undefined-world key; C8 covers a late device. |
| 2 | `_renderJournal` repaints "opening…" on every call and re-renders on updates; `_journalLink` binds only the first `.jlink`; `_setStatus` restores focus by class. Confirmed (`_renderJournal`, `_journalLink`, `_setStatus`). | Page is a render mode that skips the loading view; own back-link class and handler; dot on a child `<span>`; C15. |
| 3 | "not seen yet" is a hint; C2 regex too narrow. Confirmed. | Owner 15: accessible name "not seen"; owner 3: no text at all on a dark form; regex widened; C2 asserts no text node. |
| 4 | "Two lines" is false at teen (`_moment` queues the personality reveal). Confirmed. | Owner 14: line after the stage line and the reveal; routed through `_lines`; wording fixed to three bubbles at teen. |
| 5 | The moment hook's "book before this event" was under-specified (same-update, same-batch moments). Confirmed. | Explicit three-step ordering (read before, update per moment, refresh after); C7 changes both in one update. |
| 6 | `from_dict` already has a local `seen` (trait_hours). Confirmed (`model.py:161`). | The validated local is `book`. |
| 7 | A downgrade/restore re-triggers the legacy `raised` row. Confirmed. | Cap the legacy row for the current pet at its actual stage; test 7. |
| 8 | "Raised by" lists pets, not people; merges other devices' journals; personality words not decided; bonds one careless read away. Confirmed. | Owners 10, 11, 13 decided; "raised here"; a Privacy section of what the page may read; C14 injects a bond nickname and a `notify_users` id. |
| 9 | Code references were stale. Confirmed. | Refer by function name; line numbers refreshed where kept; version 0.35.0b3; the "after the art branch" precondition dropped. |
| 10 | Art facts wrong (123 = 120 + 3 eggs). Confirmed and corrected: main has **121** under `sprites/` (120 + `beetle/baby_content_1.png`); the other two are `art/beetle/rejected-v1/`; audit said extras = one in sprites plus two in art, which matches. | Sentence fixed; test 12 checks the four files per species. |
| 11 | `fast_forward` is simulated and skips `MOMENTS`. Confirmed (`_advance(simulated=True)`, `_fire`). | State and dot via `fast_forward`; the line via an injected moment with `at` in `recent()`; C12 uses `fast_forward`. |
| 12 | Tile/page edge cases (no-op sentence; button reset; `names` coverage; ordering; species.json failure). Confirmed. | Sentence deleted; button reset; names cover raisers and forms; one order (newest four, oldest first); id fallback. |
| 13 | `show_all_forms` is new scope. | Owner 12: ships, off by default, as PR 2c. |
| 14 | Dark forms still fetch the coloured png. | One sentence: a display rule, not a secret. |
| 15 | Legacy `raised` row gives `child` to a legacy baby. | Fixed for the current pet by the #7 cap; stated as the one remaining exception for retired species. |
| 16 | `{1:"baby"}` unreachable from a JSON store. | Kept for the Python-dict path, noted in test 5. |
| 17 | Performance non-issue; real cost is `_bookOf` per `_update` and the localStorage parse. | One paragraph; cache per draw. |
| 18 | PR 2 too big. | Split into 2a, 2b, 2c. |
| 19 | Acceptance gaps. | "Done =" for each PR now includes the two-restart test, the alias test, screenshot criteria, and shared-screen conditions. |

Also folded from the owner's 15 answers: all now under "Decided" above.

**Update (owner, 2026-10-28, answer 7 corrected).** The first mate relayed 7 wrongly
("they stay"). The real decision: deleting a device offers a choice and the **default is
to remove the pets from the book**. HA has no delete-time dialog, so it is a per-device
option in the options flow, off by default, and `async_remove_entry` copies an
allow-listed summary to a house-wide store only when it is on. Changes: Decided 7, the
Multi-device bullet, the "Deleted devices" section, server test 13, PR 1's scope, one
copy row (two words rows). **Nothing in this audit table's findings changes.**

**Copy approved (owner, 2026-10-28):** the copy table above as written, including the
two option labels and helpers. On a shared screen the new-page line shows and the dot
doesn't (first-mate default, shown to the owner).
