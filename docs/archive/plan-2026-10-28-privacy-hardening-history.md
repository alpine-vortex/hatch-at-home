# Privacy hardening plan: history (archived 2026-10-31)

Moved out of `docs/plan-2026-10-28-privacy-hardening.md` to cut what each worker reads.
P1 (F5, F6, FA, D1) shipped in 0.35.0; P2 (F3, FB) and P3a in 0.36.0. Read-only.

## F3: the welcome

- **`coordinator._welcome`, 1597-1608.**
  - Keep the persistent notification (sidebar) as it is.
  - Replace `self._send(None, …)` with `self._send(users, …)` only when `users` is
    non-empty. `users` is the union of `notify_users` over the **other loaded pets**
    (`hass.data[DOMAIN]["pets"]`, as `_closest_pet` iterates them, 999-1011).
    - A brand-new pet has no `notify_users` of its own, so these are the people who asked
      to hear about this house's pets.
    - The first pet in a house therefore welcomes in the sidebar only.
  - Q5 asks whether even this union is too broad.
- **`virtual_pet_welcomed` keeps `{pet_id}`** (1608). It is already free of names. A test
  asserts its `data` keys.
- **`notify.py:5`'s docstring and `guide.md:553-557`** get rewritten (copy table).


## F5: damaged saves

`async_load` (`coordinator.py:276-357`) runs inside `async_setup_entry` (`__init__.py:417`).
After it, `async_config_entry_first_refresh` ticks the pet (`_advance`), and the sensors
render.

So validation must make a state that **survives a tick and every sensor's attributes**,
not just one that `PetState(**kwargs)` accepts.

**Owner, 2026-10-28: salvage** (audit #5, #8; Q9). On any unexpected load error, the pet's
file is backed up, what can be read is kept, the rest is defaulted, and a repair issue
gives the restore steps. **The pet always loads, and a damaged pet is never welcomed as
new.** The tick must not wedge setup either.

There are four kinds of damage, handled differently:

| Kind | What `Store.async_load` returns | What the pet keeps |
|---|---|---|
| **Undecodable file** (invalid JSON) | `None`. HA has already renamed the file to `virtual_pet.<entry_id>.corrupt.<time>` and raised its own `storage_corruption` repair (`helpers/storage.py:367-420`). | Nothing can be read. A fresh egg with the entry title as its name. |
| **An empty wrapper**: inner `"data": null`, or an outer `{}` | `None` (`storage.py:423-436`) | Nothing. A fresh egg, as above. |
| **A wrapper with no `version` or `data`** (a hand edit) | Raises `KeyError` inside `Store.async_load` (`storage.py:433-436`) | Nothing readable through `Store`. A fresh egg. The raw file is still on disk and is copied to the backup. |
| **JSON that parses but is wrong inside** (a non-object root, wrong types, missing keys) | The value | Everything that can be read (salvage, below). |

### Telling a damaged pet from a new one

Today `async_load` treats `None` as a brand-new pet: a new egg, saved over the key, and
`_welcome()` (`coordinator.py:325-332`). So the sidebar and phones would announce "Pip, a
new virtual pet, just moved in!" for a pet that was lost. That needs a marker.

- **The config flow sets `new_pet: true` in a new entry's data.** `async_load` welcomes only
  when the store is empty **and** `new_pet` is set. After the first save it removes the key
  (`async_update_entry`, which doesn't reload).
- Inverted on purpose: no entry has a marker today. A "saved: true set at first save"
  marker would miss an existing pet whose save is damaged before its first load on the new
  version. With `new_pet`, every existing entry lacks the flag and so is never welcomed
  again. Each was welcomed at its own first load already.
- The world move (`coordinator.py:1745-1752`) copies `dict(self.config_entry.data)`, so it
  keeps any key. It can't meet `new_pet` anyway: the key is gone after the first save.
- Store empty and no `new_pet` (damaged, or the file was deleted by hand): a fresh egg, **no
  welcome**, a `save_damaged` repair (below), and the egg is saved at once.

### `model.PetState.from_dict` (152-241), field by field

**The rule (audit #7): keep unknown keys, type-check or drop known ones, never
whitelist.** A whitelist would drop live keys this list misses, and a downgrade from a later
version would lose its new fields.

- **Root.** `from_dict` takes `Any`.
  - A `dict` is validated field by field (below).
  - A `list` holding exactly one `dict` is unwrapped and validated (salvage; audit #6).
  - Anything else raises `model.DamagedSave`. The coordinator handles it (below). It must
    **not** fall into the `data is None` branch.
- **Required keys.**
  - `name`: if not a `str`, use the config entry title. The coordinator passes it in as
    `from_dict(data, default_name=…)`.
  - `last_updated`: if not finite numeric, `now`. That means no catch-up for the gap.
    `now` is passed in.
  - `born`: if not finite numeric, `last_updated - age_hours * 3600`.
    - It only seeds personality and `hatched_on`.
    - An already settled `personality` is kept, so nothing visible changes.
- **Scalars.** Each one is coerced to its field's type or set to the default.
  - **Floats:** `age_hours`, the five stats and `weight`, all clamped to their ranges.
    Also `kept_up_until`, `cozy_until`, `cool_until`, `last_praise` and `last_excite`.
  - **Ints:** `care_misses`, `discipline_misses`, `generation` (≥1) and `treats_waiting`
    (≥0).
  - **Bools:** `sick`, `asleep`, `napping`, `lights_out` and `away`.
  - **Optional floats:** `lights_before_away`, `stayed_up_since` and `wake_at`.
  - **Optional strings:** `species`, `inherited_from`, and the others the loader already
    checks.
  - **`species` and each of `raised` get a `str` check only, never catalog membership.**
    A downgrade from 0.35.0b3 would otherwise wipe the seventeen new creatures' species.
  - One helper per type keeps this short: `_float(v, default, lo, hi)`, `_int`, `_bool`,
    `_opt_str`.
- **Lists of numbers:** `poops`, `digesting`, `recent_misses` and `chore_treats`. Keep the
  finite numbers, drop the rest. A non-list becomes `[]`.
- **Lists of strings:** `raised`, `traits` (also `in TRAITS`, which is what
  `trait_level` assumes), `latched` (fixes `latched: null`, 159) and `notify_users`.
- **Lists of records.** Keep only `dict`s that carry what readers index:
  - `care_log[]` needs a numeric `at` and a str `action` (`LastCareSensor` reads
    `entry["at"]`);
  - `journal[]` and `memories[]` need numeric `at` and str `kind`
    (`card _memories` and `model.season_first`);
  - `dream_seeds[]` needs a numeric `at` (`dream_on_waking` 1475);
  - `dream_picks[]` needs a str `user`, a str `pick` and a numeric `at` (1463, 1476).
- **Dicts.**
  - `trait_hours` (also fixes 161-164 on a non-dict) is str → finite float.
  - `inherited` is trait → int.
  - `firsts` is str → str.
  - `call` and `game`: a non-dict is `None`. This fixes `call: "bad"`, 165-168, and
    `game` the same way.
  - `wish` and `dream`: a dict with a str `kind` and str `day`, else `None`.
- **`bonds`** (213-221) already skips non-dict bonds. A non-dict `bonds` root becomes `{}`.
  Inside each bond, every key in use, with its type:

  | Key | Type | Note |
  |---|---|---|
  | `points` | int (`_int`) | `int("x")` raises today |
  | `nickname`, `favourite` | str | else dropped |
  | `games`, `best` | str → int dict | |
  | `since`, `day` | str | |
  | `noted` | str → str dict | |
  | `tucked_at` | float (`_float`) | |
  | `today` | int ≥ 0 | `model.py:1670-1673` adds to it |
  | `visited` | bool | `model.py:1666-1668` |
  | `photos` | dict, through the existing `_photos` (`model.py:216`, 1614) | phase 4; must survive |
  | `catchphrase` | the question dict (`coordinator.py:1416-1445`), else dropped | a `catchphrase: "x"` would crash `.get` at 1445 |

  Unknown bond keys are kept as they are.

### `coordinator.async_load` (325-357)

The two `store.async_load()` calls (the pet's here, the people store's in the domain
`async_setup`) are each wrapped, so a wrapper-level error (`KeyError`, `TypeError`,
`ValueError`) is handled like a damaged root. **Every path below ends with a loaded pet.**

1. **Back up first**, before anything is saved over the key: the raw file's bytes (read
   from `.storage/virtual_pet.<entry_id>` directly, since `Store` may have failed on it) go
   to `.storage/virtual_pet.<entry_id>.damaged.<timestamp>`, with the timestamp as
   `YYYYMMDD-HHMMSS` (audit #6). A timestamped name means a second incident never
   overwrites the first. An undecodable file has no bytes left to copy: HA's own
   `.corrupt.<time>` file is the backup, and the repair names it.
2. **Salvage.** On `DamagedSave`, or on **any other exception** from `from_dict` (a bug in
   the checks, say), a second, minimal pass reads only the fields that matter, each in its
   own `try`, and starts every other field at its default:
   - `name`, `generation`, `species`, `raised`;
   - `journal` and `memories`;
   - `bonds`, photos included (each bond through the same per-key checks; a bond that
     still fails is dropped alone).

   If even that fails, or there was nothing to read (the `None` cases with no `new_pet`),
   the pet is a fresh egg with the entry title as its name.
3. **A `save_damaged` repair issue** (`self._issue`, 384-398, `is_fixable: False`) names the
   pet and the backup, and gives the restore steps (copy table). There is one wording for a
   salvaged pet and one for a fresh egg.
4. **No `_welcome()`** on any of these paths.
5. Save the salvaged or new state, and set up as normal.

**The tick must not wedge setup.** An exception in `_async_update_data` makes
`async_config_entry_first_refresh` raise `ConfigEntryNotReady`, and HA retries setup
forever.

- The first tick after a load is wrapped. On an exception it logs it, raises
  `save_damaged` (salvaged wording) if it isn't raised already, and returns the loaded
  state unchanged. The first refresh then succeeds, and the sensors render.
- If the next regular tick fails the same way, the coordinator's own `UpdateFailed`
  handling applies: the entities go unavailable, but setup is done and the repair is
  showing.
- **The people store's load in the domain `async_setup`** (`__init__.py:123-125`) is
  wrapped the same way. A wrapper that is damaged starts an empty people store, backs the
  file up to `.storage/virtual_pet.people.damaged.<timestamp>`, and raises a
  `people_damaged` repair. A raise there would otherwise stop **every** pet.

**`async_remove_entry`** (`__init__.py:432-438`) also deletes the `save_damaged` issue, as
it does for `missing_entities` and `world_not_ready`. The `.damaged.*` backups are kept:
they are the owner's to delete, and the repair said where they are.

### `people.People.async_load` (`people.py:90-96`) and readers

- **The root.** `people` and `weather` must each be a `dict`, else `{}`.
  - `dict(loaded.get("people") or {})` raises today on a list of pairs gone wrong, or on a
    string.
- **Each person record.** It must be a `dict`, else it is dropped. Unknown keys are kept
  (the same rule as bonds).
- **Every key in use, with its type** (from a grep of `coordinator.py` and `people.py` for
  `person[...]`, `.get(…)`, `.setdefault(…)` and `.pop(…)`; audit #7):

  | Key | Type |
  |---|---|
  | `noted` | str → str dict |
  | `birthday` | the existing birthday dict, else dropped |
  | `zone` | `{"name": str, "at": number}` (coordinator 455) |
  | `arrived`, `left` | number |
  | `guess` | `{"day": str, "guess": str}` (1250-1267, 1465) |
  | `my_day`, `baby_talk`, `birthday_phone`, `birthday_skipped` | bool (1432, 1488) |
  | `birthday_sent` | the year, as `_birthday_morning` writes it (1518-1520) |
  | `alarms` | list of `[day str, minute int]` pairs (1337, 1361-1363) |
  | `likes` | str → str dict (1193, 1463) |
  | `likes_asked` | str → list of str days (`people.py:261`, 278) |
  | `asked` | str → list of str days (`people.py:221`, 293-297) |
  | `once_last` | str, a day (`people.py:255`, 279) |
  | `sendoffs` | list of str days (1031-1037) |

  The builder confirms each type against its reader while writing `_person(record)`; a
  key whose reader disagrees takes the reader's type.
- **`weather`.** Each `str` day maps to a list of str.


## F6: card lifecycle

- **The observer.**
  - Keep it as `this._io = new IntersectionObserver(…)` (`_build` 1473, at 1542-1547), with
    `this._io.observe(this._card)`.
  - `disconnectedCallback` (1417) calls `this._io?.disconnect()`.
  - `connectedCallback` (1402) re-observes, `if (this._io && this._card)
    this._io.observe(this._card)`, mirroring `_resize`, 1405.
- **`_dropSlide(s)` (1781)** becomes `this._forget(s); s.unsub?.(); s.el.remove();`.
  - `_forget` (1788-1810) already ends the game, stops typing, calls `_clearAsk`
    (`askTimer`) and `_dropPhotos`. `_dropPhotos` revokes URLs and closes the photo dialog
    when `this._photoFor?.s === s` (3700-3706).
  - Add the slide's other timers to `_forget`: `clearTimeout(s.breezeTimer)` (set at 3085),
    `s.statusMessageTimer` (3383) and `s.flairTimer` (4325). These are all the slide timers
    that `grep -n "s\.\w*Timer = setTimeout"` finds besides `askTimer`.
- **`disconnectedCallback`'s per-slide loop** gets `s.unsub?.()` as well.


## FA: switching to a shared screen

**What happens today.**

- The shared-screen toggle's handler in `_renderStatus` (`hatch-pet-card.js:3219-3232`)
  does three things when it turns on, for every slide: `_clearAsk`, `queue = []` and
  `_dropPhotos`.
- It leaves untouched what is already on screen:
  - **each slide's bubble** (`s.bubble`, written by `_write` 2334-2339 and `_speak`
    2345-2405), which can hold "hi, sunbeam!", a birthday line or a bond moment;
  - **its typing job and babble** (`s.typing` and `s.babbling`, stopped only by
    `_stopTyping` 2423-2435);
  - **the live region** (`s.live`), set by `_speak` (2402) and by the bubble's
    `MutationObserver` in `_buildSlide` (1617-1623);
  - **the bond hearts** (`.bondhearts`, from `_bondHearts` 2782);
  - **the other slides' status screens.** `_renderStatus` is called only for the slide
    whose toggle was pressed (3231). The other slides keep their cached `s.statusHtml`
    (`_setStatus` 3391-3398), "you two" row included.
  - **an open journal** (`s.journal`). Its photos are dropped, but the open view isn't
    redrawn.
- Then the status says "Nothing personal on this screen now." When it closes, the stale
  line is still in the bubble.

**The fix: a `_goShared()` method, called from the toggle when `on` is true.** It replaces
the inline `forEach` at 3229. For every slide in `this._slides`:

1. `this._clearAsk(slide)`, `slide.queue = []` and `this._dropPhotos(slide)`, as now.
2. `this._stopTyping(slide)` (hush on).
   - Its `job.finish()` writes the whole personal line into the bubble, so step 3 has to
     come **after** it.
3. `slide.bubble.textContent = ""`, `slide.plain = undefined`, `slide.sayUntil = 0`.
   - The next `_tick` (2093) writes the mood's idle line (`_say`, 2132), which is the
     server's nameless sentence.
   - Writing `""` rather than a new line keeps the bubble's `MutationObserver` from
     copying anything into the live region: it copies only while `sayUntil` is set.
4. `slide.live.textContent = ""`.
5. `slide.screen.querySelector(".bondhearts")?.remove()`.
6. If `slide.journal` is open, close it (`s.journal = false`, as `_forget` 1797 does).
7. `slide.statusHtml = null` and `slide.drawnSig = null`, then `this._redraw()` once after
   the loop.
   - Every slide's status is rebuilt without its personal rows, not only the slide whose
     toggle was pressed.
8. From P3a: `slide.mine = null`, then resubscribe with `shared: true` (as in the design
   section).

**Every card, every tab** (audit #10). `sharedScreen()` is one per-browser `localStorage`
key (`hatch-pet-card.js:180-185`), but `_goShared` loops only its own `this._slides`. A
dashboard with two hatch cards, or a second tab, would keep its personal bubble, hearts,
status and `shared: false` subscription. The card has no `storage` listener today.

- The toggle, after writing the key, dispatches
  `window.dispatchEvent(new CustomEvent("hatch-shared-changed", {detail: {on}}))`.
- Every card instance listens for it (same page), and for `window`'s `storage` event on
  `SHARED_KEY` (other tabs; the browser fires it only in the tabs that didn't write).
- On either, the instance runs `_goShared()` when on, or the turn-back below when off,
  including the resubscribe. The card that was tapped has already run it, so it ignores
  its own event (a `detail.from === this` check).
- Both listeners are added in `connectedCallback` and removed in `disconnectedCallback`.

**What it keeps.** The game (a game's prompt names nobody), sounds, and the slide's pet.

**Turning a shared screen back to personal** needs only the resubscribe (from P3a) and the
status redraw. Nothing personal is waiting to be restored.

**The status message itself** ("Nothing personal on this screen now.") is shown by
`_statusMessage` in the status screen, not in the bubble. It stays as it is.


## D1: no personality before the teen stage (P1)

The personality settles on becoming a teen (`model.py:124`, 239-241, 417-420), and the
card's own lines use it only for a teen or an adult (`_persona`, card:2259-2263). The
status screen and the journal don't check. A pet whose save carries a personality while
it is younger (a downgrade round trip, F4, or a hand edit) shows it in two places:

- **The status row** (card:3193): `stageAttrs.personality ? row(…"personality"…) : ""`.
  It gains the stage test: shown only when `sensor.life_stage`'s state is `teen` or
  `adult`.
- **The journal's family line** for the current generation (card:3434,
  `personality: stage.personality`). It is gated the way `upbringing` is on the line
  above (3433): `personality: teenOrAdult ? stage.personality : null`.
  - Not in the shared renderer at card:3455: that line also draws past generations, which
    grew up, and their personalities stay.

A card check: a child with a stubbed `personality` shows no "personality" row and no
personality on the current generation's journal line. A teen shows both.


## FB: the people store survives removal; "forget my data"

**What is stored.**

- `people.People` (`people.py:78-136`) keeps one record per HA user, in
  `.storage/virtual_pet.people` (`STORE_KEY`, `people.py:28`). It is shared by every pet.
  - It is loaded once, in `async_setup` (`__init__.py:123-125`).
  - It is saved on shutdown (`coordinator.async_shutdown`, 1828-1833).
- `async_remove_entry` (`__init__.py:435-440`) deletes only that pet's
  `virtual_pet.<entry_id>`. So removing the last pet leaves the people store, and a later
  setup loads it again.
  - **Owner, 2026-10-28: that is the intended behaviour.** It is now documented, and no
    code changes it.
- A record's keys, from a grep of `coordinator.py` and `people.py` for `person[...]`,
  `.get(...)`, `.pop(...)` and `.setdefault(...)`:
  - `birthday`, `birthday_phone`, `birthday_skipped` and `birthday_sent`;
  - `baby_talk` and `my_day`;
  - `likes` and `likes_asked`, its once-only questions' answers;
  - `guess`, `asked` and `once_last`;
  - `alarms` (their usual alarm times);
  - presence: `arrived`, `left` and `zone`, the last named zone;
  - `sendoffs`;
  - `noted`, which lines it has already said to them.
- The store also has a household `weather` list (`saw_weather`, 122-130). It is no
  person's, and it stays.

**What stays elsewhere** (not in the people store, so "forget my data" doesn't touch it,
as the owner decided):

- each pet's `bonds[user]`: points, nickname, favourite game, photos, `noted`,
  `tucked_at`, `best` and `games`;
- `notify_users`;
- `wish.for` and `wish.by`;
- `dream_picks[].user`;
- the care log's `by`.

The wording below says so plainly ("your bonds stay"), and Q10 asks whether that is still
what the owner wants.

**Server.**

- **`People.forget(user)`** runs `self.data["people"].pop(user, None)`, then
  `await self.async_save_now()`, not the delayed `save()`.
  - A restart inside the 60-second save delay must not bring the record back.
  - The per-user `asyncio.Lock` in `_locks` is not removed: a visit may be holding it.
- **A `virtual_pet/forget_me` websocket command** (`{type}` only; the people store is not
  per pet).
  - It runs `people.forget(connection.user.id)`, under `people.lock(user)`, so a visit
    that is running finishes first.
  - Then it calls `pet.async_set_updated_data(pet.state)` for every loaded pet, as
    `async_set_my_day` does (`coordinator.py:1491-1498`).
  - It is a websocket command, not a service, so nothing is on the bus or in the
    recorder's `call_service` rows. It is the same reason `forget_birthday` is one
    (`__init__.py:324-343`).
  - Any signed-in user, read-only included, can forget only their own record.
- **Presence comes back.** `person_moved` (`coordinator.py:438-463`) writes `arrived`,
  `left` and `zone` for every person whose person entity is linked to a login, whatever
  their settings. A record forgotten now gets those three again at the next arrival or
  departure.
  - The copy says "start fresh", not "nothing is kept".
  - Whether `zone` should be kept only with "my day" on is Q11.
- **The coordinators' in-memory per-user state** (`_visits`, `_cheered`) is not cleared.
  It holds timings, not personal settings, and it is lost on restart.

**Card.**

- **One new status row, personal screens only**, below "baby talk" and above "sounds
  here" (`_renderStatus`, after the baby-talk row at about 3199). That is the last of the
  person's own rows, before the device's own ("sounds here", "babble", "shared screen").
- **Two taps.** The first arms it: "sure? tap again", the `lay_egg` pattern with
  `CONFIRM_MS` (1645-1653), kept on the button. The second sends the command.
- **On success it clears the card's own copies:**
  - `setBabyTalk(user, false)`;
  - `this._myDay = false`;
  - `this._birthdayKept = false`;
  - `this._birthdayPhone = false`;
  - the `hatch-welcomed-<user>` key in `localStorage`;
  - every `hatch-greet-<user>-<device>` key (card:2607), found by prefix (audit #20). It is
    only a timestamp, but it is theirs.
  - Then it re-renders the status, with a status message (copy table).
- **On failure:** "That didn't work. Try again." (the existing line).
- **On an older server**, the command is unknown. The card shows the failure line. The
  row only exists in the new card, so this is a stale page only.

**Guide.** A short "What the pets remember about you" paragraph goes under `### Privacy`
(`docs/guide.md:349-357`). It is in the copy table.
- It says the people store is kept when pets are removed.
- It says what "forget my data" erases and what it leaves.
- It says how an admin can erase everyone's records: stop Home Assistant and delete
  `.storage/virtual_pet.people`.
- It says that with no pets left there is no card, and so no "forget my data" button. An
  admin can delete the people store then (owner, 2026-10-28: accepted, audit OQ2).


## Decisions of the P3a plan review (2026-10-28)

The owner delegated these to the first mate, who took the scout's recommendations.
Review #N is the scout's finding number; all 18 proposed fixes are applied above.

- **Q1: yes.** `mine` carries the person's own switches (`my_day`, `baby_talk`,
  `birthday_phone`, `birthday_kept`), pushed on change. The experience plan's Wave 1 1c
  section notes that the channel supersedes 1c's visit-reply fields once P3a-card lands
  (1c still ships first).
- **Q2: split P3a.** P3a-server (commands, registry, `_private`/`_house`, dual write,
  listener push, snapshot, `gone`; Tests 1–3 plus the command tests; no card change) and
  P3a-card (the consumer, the `ready` resubscribe with `resubscribe: false`, the `_forget`
  reset, the public filter including `watching`/`listening`, the `_visit` gate, the
  card-check migration moved from P3b). P3b and P3c stay.
- **#6:** `someone_home` moves into P3a (additive), so the shared screen keeps its arrival
  line.
- **#10:** no per-PR version bumps; one release at the end. P1 and P2 are merged (#45,
  #48). The old-card check serves `git show v0.35.0:…/hatch-pet-card.js`.
- **#12:** the second-login bond is staged by seeding dev's bond and a `person.dev` with
  `user_id` in `dev/config/.storage` before start.
- **#13:** stale line numbers get one rule, "re-grep at build; names win over numbers".
