# The forms book (build plan, DRAFT 1)

Option B of `scope-2026-10-28-progression-unlocks.md`. Its "Decided (owner,
2026-10-28)" section is the authority, and this plan changes none of it:

- Only portraits are locked, never play. Every creature can still hatch and be
  picked with `select.<pet>_next_egg` (`select.py:NextEggSelect`).
- A form nobody here has reached is a **plain silhouette: no hints**, no text about
  when or how it appears.
- A new page is marked **once, on the card only**: one quiet "new page in your
  journal" moment and a dot on the journal link until it's opened. No phone message,
  nothing in HA history.
- A hatched creature's baby form always shows; only forms not yet reached start dark.
- Upbringing is words beside "raised by", never a collectable form.
- Backfill from `raised` and `journal`, so no home ever sees fewer portraits than today.

**Build after the 17-creature art branch (`claude/quirky-faraday-axugqq`) merges**,
so the book is first seen with the full cast. This is a draft for an adversarial
audit; it contains no code. Every new player-facing word is in the copy table
("Copy") and is **a proposal for the owner**, not approved copy.

## What the scope's numbers miss (checked against the art branch)

Read with `git show origin/claude/quirky-faraday-axugqq:...`:

- `sprites/*/species.json` on the branch: **30 files, all `"ready"` (or default
  ready), all with `"stages": ["baby", "child", "teen", "adult"]`.** There is no
  species with fewer than four forms, so the page is always four slots.
- `worlds.json` on the branch: woodland 5 (bird, squirrel, deer, fox, bananaslug),
  terrarium 6 listed (gecko, tarantula, **beetle**, tortoise, beardeddragon,
  ballpython), hearth 5, tidepool 5, pond 5, nightsky 5 = 31 names. **`beetle` has no
  `species.json`**, so `species.py:load_catalog` never puts it in `Catalog.species`
  (ready species with non-empty `stages` and `moods` only) and `Catalog.roster` drops it and Terrarium shows **5**, total **30 creatures, 120 forms**.
  The card never sees `beetle`: its roster is `sensor.life_stage` attribute `roster`,
  which is `coordinator.roster` (`coordinator.py:289`, `catalog.roster(self.world)`).
  If beetle's art lands later, the book picks it up with no change.
- The branch has 123 `*_content_1.png` files: the 120 forms plus 3 others (eggs).
  The book draws each form from `sprites/<id>/<stage>_content_1.png`, the file
  `_renderJournal` already uses for the child (`child_content_1.png`). The builder
  re-checks that all 120 exist when the branch has merged (a missing one is a broken
  image; the card falls back, see Card, "A missing image").
- A stage's length is `rates.STAGE_STARTS`: baby from 0.5 h, child 24 h, teen 120 h,
  adult 336 h of age (aging pauses while away). So a new creature's four pages open
  over 14 days of age.

## What the person gets

1. **The journal's grid is a book of creatures.** Open the journal (status screen,
   "journal ›"): the world's creatures as tiles, as today. A creature nobody here has
   hatched is a black "???" tile, as today (and not tappable: there is nothing to
   open). A hatched creature's tile shows its name and the **furthest form seen**
   (see Card, "The tile").
2. **Tap a hatched creature: its page.** Four slots in a row: baby, child, teen,
   adult. Forms reached here show in colour. Forms not reached are **plain
   black silhouettes with no text** about when or how (owner, 2026-10-28). Under the
   four slots: who raised it here, in words: "Pip · gen 2 · devoted"; a pet still
   growing up shows "Pip · gen 3 · now". Nothing on the page is a number, a
   percentage, "missing" or "x of 4".
3. **A new page, once.** The first time any pet on the card's devices reaches a form
   this browser hasn't been shown (a creature hatches, or grows into its next form),
   the pet says one extra quiet line after its usual one ("a new page in your
   journal ♥") and the journal link on the status screen gets a small dot, until the
   journal is opened on this browser. Nothing goes to phones, Assist, the event bus,
   notifications or HA history.
4. **A card option "show every form"** (YAML key proposed below; default off). On:
   every form is drawn in colour, for anyone who'd rather see everything. It is a
   display choice: it changes nothing stored and takes nothing away.
5. **Existing homes lose nothing.** Every creature a device has hatched shows its baby
   and child (today's tile is the child, so the child must stay visible); teens and
   adults open from retired pets in `journal` and from the current pet's stage.

What stays exactly as it is: the egg, the roster, `select.<pet>_next_egg`, the way
forms are drawn on the pet itself (a pet always draws its own current form), the
family line and photos and memories below the grid.

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

1. In `model._step` (`model.py:~398`, the `if stage != was_stage:` branch), **after**
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

- `seen` not a dict: `{}`. Keep only items whose key is a non-empty `str` and whose
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

A newer-version-written store loaded by an older version: the unknown key is ignored
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
new page writes nothing to history. A test asserts `"seen"` is in the set (`tests/test_init.py:839`
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
- A device deleted from HA takes its `seen` with it (same as `raised`, `journal`).
- No cross-person state: `seen` is the device's, not a person's, so the book can't
  rank anyone and is the same for everyone looking at the same card.
- The new-page marker is per browser (below), not per person and not on the server.

## Card (PR 2)

All in `custom_components/virtual_pet/frontend/hatch-pet-card.js`.

### Reading the book (one helper)

`_bookOf(s)` (new, beside `_renderJournal`) returns, for the world of slide `s`:

- `forms`: `{species: furthest stage}`, the max by stage index over every slide in
  `this._slides` with `sensor.life_stage` attribute `world === stage.world` of
  its `seen`. **Fallback when `seen` is absent** (an older server, a cached card
  newer than the integration): derive from that slide's attributes the way the
  server backfill does: `raised` to `child`, each `journal` record's `species` to
  `adult`, and the slide's own species to its `sensor.life_stage` state if not
  `egg`. So a card newer than its server never shows fewer portraits.
- `raisers`: per species, a list built from every same-world slide's `stage.journal`
  records (`{name, generation, upbringing, personality}`; **all** records, not the
  family line's last four: `past = [...].slice(-4)` in `_renderJournal` only limits
  that list) plus each slide's current pet (`generation`, device name via
  `this._hass.devices[s.ids.device]`, `name_by_user || name`, and `upbringing` only
  if the stage is `adult`, as `_renderJournal` already does for `now`).
- `showAll`: `this._config.show_all_forms === true`.

### The tile (what the grid shows)

Today `_renderJournal` hard-codes `child_content_1.png` and `known = raised.has(id)`.
Change `tiles` so a tile is:

- **Unhatched** (not in `forms`, and not `showAll`): `.jtile.locked`, the child
  image as now (`filter: brightness(0); opacity: .3` from the existing
  `.jtile.locked img` rule, `hatch-pet-card.js:1179`), label `???`, not a button.
  Identical to today.
- **Hatched**: a `<button class="jtile">` (focusable; the grid is plain divs today)
  showing the **furthest form seen** (`<stage>_content_1.png` for `forms[id]`) and
  the lower-cased name. A creature that hatched *live* has only the baby seen, so
  its tile shows the baby: a hard-coded child tile would contradict the page it opens
  (it would show a form the page draws as a silhouette). A creature backfilled from
  `raised` has `child` at least, so existing homes see the same child portrait as
  today unless a later form has since been reached, in which case the tile has
  grown up (this is "never fewer portraits": the tile shows at least what it showed).
  Where the hatched creature is on the card's own pet, the tile is not highlighted.
- A **dot** on a tile whose page has an unacknowledged form (below), so the thing
  to open is findable; cleared when that page opens.

Tapping a hatched tile sets `s.page = id` and redraws `_renderJournal`; the page
has its own "‹ journal" link, which clears it. A new state field on the slide, like
`s.journal`, reset in the same two places `s.journal = false` is reset
(`hatch-pet-card.js:1695` and `:2048`; the builder re-finds them).

### The creature page

Header: the creature's name (from `sprites/<id>/species.json` `name`, already loaded
for `names` in `_renderJournal`). Then four slots in `STAGES` order:

- Reached (or `showAll`): the colour portrait, `alt` = "<name>, <stage>", and the
  stage label under it.
- Not reached: the same image with the `locked` filter (a new rule
  `.jform.locked img`, copying `.jtile.locked img`), `alt=""`, and the stage label.
  **No hint text.** The stage label is the structure of the page, the same on
  every creature, and says nothing about when; whether to show it at all is open
  question 3.
- Each slot is a plain `<figure>`, not a button (nothing to open).

Below, "raised by" lines from `raisers[id]`, newest generation first, at most four
(then "and more"), each: `<name> · gen <n>` then upbringing/personality words **beside**
the name when the record has them, like the family line does today
(`${p.upbringing ? ` · ${escape(p.upbringing)}` : ""}`): the same words, the same
place. A pet still growing up has no upbringing yet (as `_renderJournal` does for
`now`): "now" instead. Upbringing is never a slot, a badge, a different portrait or a
count. It is words, because the adult is drawn the same whatever the upbringing
(`scope`, "Forms"), and a word like "scrappy" is only the record's own label (open
question 5 asks whether the book should print it at all).

### The new page and the dot

The marker is **per browser**, in `localStorage`, like the card's other "seen"
state (`hatch-seen-<device>` at `hatch-pet-card.js:2372`, the once-a-day keys at
`:369-374`):

- Key `hatch-book-<world>`: JSON `{species: stage}`, the forms **this browser has been
  shown**. (A world, not a device, because the book is the world's on this card.)
- **First load seeds it silently**: if the key is absent, store the current `forms`
  and show nothing. Otherwise every existing home would get a dot for the whole
  backfilled book, and every new browser would too. (Precedent: `s.lastMoment` is
  seeded from the newest moment "not old ones", `:1977`.)
- **The dot** is pending when any species' current stage is later than its stored one.
  It's computed on each draw (`_update`) from `_bookOf`, so it survives a reload and
  needs no server push. It sits on the journal link ("journal ›") on the status
  screen and on the tile of each creature with a new form. **Opening the journal
  clears it**: write `forms` to the key (the whole book, not per page: "opened" means
  seen). This also happens when `showAll` is on (the dot is suppressed with it; open
  question 4).
- **The moment** (the extra line) is hooked to the live events the card already
  gets, not to a diff of the merged book between draws (a diff gives false
  positives: `this._slides` and their states don't all arrive on the first draw, a
  reconnect can briefly drop states, and when a second same-world device's `seen`
  shows up the merged value rises for nothing). The `hatched` and `stage_changed`
  cases of `_moment` (`:2740-2752`) arrive through `sensor.last_care` `moments`
  (unrecorded, already in `coordinator.MOMENTS`, so no new event), and old moments
  are already skipped by the `s.lastMoment` seeding (`:1977`). On one of them, queue
  the line **only if that (species, stage) wasn't in the merged book before this
  event** (the book read just before the state update is applied is the draw's
  `forms`; the builder takes it from the last draw's cache). A browser that wasn't
  looking gets the dot, not the line, since it sees no live moment. The dot stays the
  localStorage diff above. The line is `_queue`d (`hatch-pet-card.js:2327`), not said through `_moment`'s `say`,
  so it follows "I'm a teen now!" / "hello!" rather than overwriting it: those come
  from `_moment`'s `stage_changed` and `hatched` cases (`:2740-2752`), which `say`
  immediately; `_sayQueued` then speaks the queued line when nothing is being said
  (and the status screen is closed). Nothing server-side.
- **A shared screen** (`sharedScreen()`, `:181`): the moment fires (the pet is the
  home's; the line has no name in it). The **dot does not show** (a wall tablet nobody
  opens would carry it forever, which reads as nagging); the pages still fill in. Open
  question 4.
- It doesn't use a bond, a name, or `hass.user`, so it is the same for every viewer.
- It never plays a sound beyond what `_speak` already does for a line, and adds no
  vibration.

### "Show every form"

A card option `show_all_forms: true` (proposed name; the card's other option is
`seasonal`, `:264`, and `experimental_catch`): read in `_bookOf`. On: every creature of
the world is tappable and every form is in colour, **including creatures nobody has
hatched** (so the tile's `???` becomes the name), and the dot and moment are off.
Open question 4 asks whether show-all should reveal unhatched creatures; the
recommendation is yes, because "show everything" that still hides a creature is a
half-measure, and nothing is lost (a display choice, never stored).

The editor (`hatch-pet-card-editor`, `:~4471`) has one field, `devices`, and a
constant `computeLabel` (`() => "Pets on this shelf"`). Adding the checkbox means a
per-name `computeLabel` (and `computeHelper`), a `boolean` selector in the schema,
and `_changed` writing/removing the key (it already keeps other keys:
`{ ...this._config }`). The builder confirms that on the dev HA.

### A missing image

If a form's png fails to load (a species whose art is partial, or a cached card),
the `<img>` gets an `onerror` that hides it and leaves the slot as an empty
silhouette box, never a broken-image icon. A species with fewer than four `stages`
in its `species.json` (none today) draws only its listed stages (the page reads
`names[id]`'s `species.json` `stages`, already fetched by `loadJson`).

### Nothing is lost, and nothing nags

The page never says "locked", "missing", "x of y" or a percentage, and has no
header counter. The merge only takes maxima, so a form once seen stays (the server
never lowers `seen`, `backfill_seen` only raises, and the card only reads). Deleting
a browser's `localStorage` can only re-show a dot (re-seeded silently on the next
load, so not even that).

## Tests

### Server (`tests/test_model.py`, `tests/test_init.py`)

pytest, the existing style (`test_hatching_prefers_a_species_not_raised_yet`,
`model.advance(pet, start + HOUR, settings, random.Random(1), max_gap=None)`).

1. Hatching sets `seen[species] == "baby"`; advancing a day sets `child`; to 120 h
   `teen`; to 336 h `adult`. A big single `advance` that crosses two stages leaves the
   later one.
2. `seen` never goes down: `mark_seen` with a lower stage keeps the higher.
3. `lay_egg` carries `seen` to the egg (and the egg's `seen` is a copy, not the
   same dict), and the new species hatching adds to it.
4. `from_dict` with no `seen` (an old store) backfills: `raised=["bird","fox"]`
   gives both `child`; a `journal` record for `fox` gives `adult`; a current teen
   `squirrel` gives `teen`. A store with `raised=[]` and no journal gives `{}`.
5. `from_dict` validation: `seen` a list, a string, `None` → `{}`; `{"bird":"egg"}`,
   `{"bird":"giant"}`, `{1:"baby"}`, `{"":"baby"}` are dropped; unknown species kept;
   round trip `from_dict(pet.to_dict()) == pet` (the existing pattern at line 353).
6. A restart doesn't promote a live baby: hatch, `from_dict(pet.to_dict())` keeps
   `seen == {species: "baby"}` (the key is present, so the `raised` row is skipped).
   Backfill never lowers also: a stored `seen` of `adult` for a species in `raised`
   stays `adult`.
7. Coordinator ordering (`tests/test_init.py`): a store with `species=None`, an old
   species and no `raised` ends with that species in `seen` after setup.
8. The sensor exposes a copy: mutating the model's dict after reading the attribute
   doesn't change the attribute read earlier.
9. `"seen"` is in `LifeStageSensor._unrecorded_attributes`.
10. No new event: advancing across a stage fires the same event types as before
    (hatched, stage_changed), and `coordinator.MOMENTS` is unchanged.
11. The whole 30-creature case: for every species in a catalog built from the merged
    branch's files, `species.json` has the four stages the card draws (a data test
    in `tests/test_species.py`, run after the art branch merges).

### Card (`scripts/card-check.js`, `scripts/card-check`)

The existing harness (needs `scripts/develop` running, Playwright). Pattern: `inject
(entity, patch)` (`card-check.js:169`) patches an entity's state/attributes in the
page; **a server update overwrites an injected attribute** (the file says so at
`:389` and `:1241`), so each check injects, waits for the result to show, and
re-injects until it does (the way `:1241-1254` does for memories).

Checks the builder can actually run on the dev HA (two pets):

- C1. **No `seen` on an old server** (inject without it): `raised: ["bird"]` shows
  one coloured tile, the others `.jtile.locked`; a tile is a button; the count of
  `.jtile.locked` equals roster minus raised.
- C2. **Silhouettes and no hints**: inject `seen: {bird: "child"}`, open the journal,
  tap the bird: four `.jform` figures, two coloured and two with `.locked`; the page
  text matches none of `/in about|days?|weeks?|soon|grow|hint/` (the no-hint rule is
  a regex check on the whole page text, not a visual one).
- C3. **Tile shows the furthest form**: tile `img` src ends in `baby_content_1.png`
  for `seen: {bird:"baby"}`, `child_content_1.png` for `child`, `teen_...` for `teen`.
- C4. **Backfill parity**: with `raised: ["bird","squirrel"]` and `seen` absent the
  tiles show the same two coloured as before this change (run the same inject on the
  old build's expectation: two unlocked `.jtile`).
- C5. **Two-device merge**: inject both dev pets' `world` to the same value and
  `seen` to `{bird:"baby"}` and `{bird:"teen"}`; the bird page shows three coloured
  forms. (The dev pets may not share a world; inject `world` if not.)
- C6. **A pet in another world doesn't add to this book.** Inject one pet's `world`
  to a different value with `seen: {squirrel: "adult"}`: the squirrel stays dark.
- C7. **The new page**: seed (clear the key, load: no dot, no line); inject a
  `stage_changed` moment into `sensor.last_care` `moments` together with the raised
  `seen`; the journal link has the dot
  (`.jlink.new` or the chosen class), the queued line appears once after the
  stage line, a second identical inject says nothing again; opening the journal clears
  the dot and rewrites `hatch-book-<world>`.
- C8. **A browser that wasn't looking** (reload the page after injecting `seen`,
  with the moment already in the list at load): dot yes, line no. Also: a second
  same-world device's `seen` arriving later raises the merged book but fires no line
  (the false positive the moment hook avoids).
- C9. **Shared screen**: set `SHARED_KEY` on (`hatch-shared-screen`,
  `:180`): line yes, dot no.
- C10. **`show_all_forms: true`** (`setConfig` in-page): no `.locked` anywhere,
  unhatched tiles show names, no dot.
- C11. **Unrecorded** (may not be runnable): `card-check.js` has no history check
  today, so this is new: its `api()` helper (`:33`) could `GET
  /api/history/period/...?filter_entity_id=sensor.<pet>_life_stage` and assert no
  `seen` key in any row, but only if the dev config has the recorder on. If it
  doesn't, server test 9 is the guard and C11 is dropped; the PR says so.
- C12. **No phone message / no event**: subscribe to the dev HA's event stream
  (`/api/events` websocket `subscribe_events`) across a stage change and assert no
  `virtual_pet_*` type outside the existing ones fires.
- C13. A broken image (inject `species` to one with no teen art): the slot is a
  silhouette box, no `<img>` naturalWidth 0 left visible.
- Screenshots to `dev/card-check/` (`shot()` at `:238` is the model) at 330 px and
  compact for the page with two reached forms and for the new-page dot, for the
  owner's sample sheet. Downscale before reading.

What can't be checked on the dev HA: the 30-creature grid (the dev has two pets and
the roster comes from the installed files) until the art branch has merged; `inject`
only patches states, so the **look** of a real 6-creature Terrarium or a 5-creature
Woodland in the grid is checked by injecting `roster` and `seen` (C3's mechanism)
and a screenshot, not by real hatches.

## Phases and PRs

Two PRs, as the scope sized B, **after the art branch merges**, in this order (PR 2
reads PR 1's attribute, but is built to survive its absence).

### PR 1: the state

- `model.py`: `seen` field, `mark_seen`, `backfill_seen`, `from_dict` validation,
  `_step` call, `lay_egg` carry-over.
- `coordinator.py`: the second `backfill_seen` call after the old-species fix-up.
- `sensor.py`: the `seen` attribute and its `_unrecorded_attributes` entry.
- `docs/guide.md`: `seen` in the `sensor.<pet>_life_stage` attributes row
  (guide, the `sensor.<pet>_life_stage` row, line 246) and one line saying it's unrecorded.
- Tests 1-11 above.
- **Done =** the pytest suite passes with the new tests; an installed dev HA's
  `sensor.<pet>_life_stage` shows `seen` after a restart with an old store
  (backfilled, one species per `raised`); the history query for it shows no `seen`;
  `lay_egg` on the dev pet keeps the book; no new event types. Nothing visible changes
  to the person yet.

### PR 2: the book

- `hatch-pet-card.js`: `_bookOf`, the tile and its dot, `s.page` and the creature
  page, the `.jform` rules, the new-page key and moment, `show_all_forms`, the editor
  field, a `VERSION` bump last.
- `scripts/card-check.js`: C1-C13.
- `docs/guide.md`: "The journal" bullet (line ~490) now describes the book, the
  silhouettes, the dot, the option.
- Copy table below, once the owner has answered.
- **Done =** `scripts/card-check` passes with the new checks; the screenshots exist;
  an old-server run (C1/C4) shows no fewer portraits than the previous card; the
  owner has seen the sample sheet (two or three creatures through `inject`).

Version and changelog: the project ships `0.35.0b1` (card `VERSION`,
`manifest.json`); the build numbers on top at build time and the version bump goes
last (as in the baby-talk plan). A beta for the companion-app reason is not needed.

## Copy (proposals for the owner; none is approved)

| Where | Proposed words | Notes |
| --- | --- | --- |
| The new-page line, in the pet's bubble | a new page in your journal ♥ | Once, after the stage line. No name in it, so it is the same on a shared screen |
| Unhatched tile label | ??? | As today |
| A dark form: stage label under it | baby / child / teen / adult | Structure, not a hint; open question 3 |
| A dark form: accessible name | not seen yet | Screen readers only (`aria-label`); no time, no how |
| Journal link when a page is waiting | journal › (a dot, no text) | The dot has `aria-label="new page"` (proposal) |
| Page: back link | ‹ journal | Matches "‹ status" |
| Page: raised by | raised by | Section label; lines are "Pip · gen 2 · devoted" |
| A pet still growing up | now | In place of upbringing words |
| More than four raisers | and more | |
| Card option label / helper | Show every form / Draw every creature and form in colour | The editor's checkbox |
| Guide, journal bullet | (the owner reviews at the PR 2 audit) | Not drafted here |

Nothing here counts, scores or names a requirement. The stage-line words that
already exist ("I'm a teen now!", "all grown up! ♥") are not changed.

## Open questions (each with a recommendation)

1. **Does a creature's tile show the furthest form, or stay the child?**
   Recommendation: the furthest form seen. It matches what the page opens to and
   can't contradict it; backfilled homes still see the child at least.
2. **Is a retired pet's adult enough to show the adult of that creature, even when the
   record has no upbringing?** (`journal` records always carry `species`; an old record
   may lack `upbringing`.) Recommendation: yes; `adult` from any record, the upbringing
   words only where present.
3. **Do dark forms carry a stage label?** The owner said no text about when or how.
   A fixed "baby / child / teen / adult" label isn't either, and a page of four
   unlabelled shapes is hard to read. Recommendation: labels shown; if the owner reads
   it as a hint, drop them and keep the accessible name only.
4. **Show-all and the dot:** does "show every form" also reveal unhatched creatures
   and switch off the dot and moment? On a shared screen is the dot hidden?
   Recommendations: yes to both; hidden on a shared screen, the moment still shown.
5. **Where do the upbringing words sit?** (The owner decided they are words beside
   "raised by"; that stands.) "Scrappy" could read as a verdict on a person's care.
   Recommendation: print them for retired adults and for a current adult, never
   next to a pet still growing up (it has none yet), as `_renderJournal` already
   does for `now`.
6. **Is the new-page line per form, or once per creature?** Recommendation: per form
   (baby of a new creature, then each later stage): there are at most four a
   creature, 120 over the whole cast, and each is the pet's own growing-up. The line
   follows the stage line, so one growth event gives two short lines, no more.
7. **A device not on the card, or a deleted device, takes its pages with it.**
   Recommendation: accept, as `raised` does; a home-wide store is option D's cost.
8. **Cap on the raised-by list** (four, then "and more"). Recommendation: keep; a
   home with two devices and many generations stays short.
9. **Beetle.** Terrarium's roster has `beetle` with no `species.json`, so it is absent
   from the book. Recommendation: nothing to do; when its art is added (with a
   `species.json` and four stages) it appears as one more unhatched tile.

## Out of scope

Code; the audit (a separate scout follows); hints or text on dark forms; points,
percentages, "missing" counts; a home-wide store; gating eggs or worlds (options C, D);
anything on phones, in Assist, in the LLM prompt or on the event bus.
