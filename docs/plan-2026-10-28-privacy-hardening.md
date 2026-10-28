# Plan: privacy hardening (outside audit findings 1, 2, 3, 5, 6, and follow-up A, B)

**Draft 1, 2026-10-28.** A build plan only: no code changes here. An adversarial audit by a
separate scout comes next. The build is review tier 2.

The outside audit of 2026-10-28 (at `53ee630`, `0.35.0b1`) made six findings. This plan
fixes five of them:

- **F1 (high):** per-person data reaches the whole house.
- **F2 (high):** show and song titles end up in recorded events.
- **F3 (medium):** the welcome goes to every phone.
- **F5 (medium):** a damaged save can stop a pet loading.
- **F6 (low):** the card's observer and slide teardown leak.

**F4** (a downgrade round trip can change a settled personality) is accepted by the owner
and stays out of this plan.

A follow-up outside audit, the same day and also at `53ee630`, found two more. Both are in
this plan:

- **FA (high):** switching to a shared screen leaves a personal line showing.
- **FB (medium):** removing the last pet keeps the people store, and the guide doesn't
  say so.

Line numbers are for `origin/main` at `0821baf` (0.35.0b3; P2a, PR #37, and the seventeen
new creatures, PR #38, are merged).

- **Python is unchanged since the audit's `53ee630`**, except `const.py`'s version.
- **The card has moved.** Its references give the function name as well.
- **`tests/test_init.py` has moved too.** The lines given here are current.

## Owner decisions (2026-10-28)

- **F1, bonds fully private.** Nicknames, favourites, levels and HA user IDs reach only
  their own person: on their own card, through caller-scoped replies or websocket
  commands.
  - `sensor.<pet>_life_stage` keeps nothing per person.
  - No event or moment carries a user ID or a person's name.
  - A shared screen never names anyone. An aimed wish on a shared screen is suppressed
    or nameless.
- **F2.** Show and song titles and artists never go into bus events or globally readable
  attributes without an explicit opt-in. This plan recommends one of the two (Q1). The
  card's watching and listening reactions keep working.
- **F3, sidebar only.** The one-time persistent (sidebar) welcome stays. Phones get it
  only for people with "notify me" on. The welcome event carries no names or private
  data.
- **F5.** Validate the `PetState` root, every nested field and the people store, so a
  damaged but JSON-valid save never stops a pet loading.
- **F6.** The card keeps its `IntersectionObserver` and disconnects it. `_dropSlide` tears
  a slide down the way `_forget` does: game, timers, photos, dialog.
- **FA.** On the switch to a shared screen, clear or replace every slide's bubble and live
  region, and stop typing and babble. A card check starts from a personal bubble.
- **FB, keep the people store.** It survives removing the last pet, so personal settings
  survive a reinstall.
  - The guide says so.
  - Each person gets a "forget my data" control that erases only their own record in the
    people store.
  - Its placement and wording are copy proposals.

## Ground rules for this plan

- **Anything on an entity's state is household-readable, live.**
  - `_unrecorded_attributes` only keeps an attribute out of the history database.
  - Every attribute still goes to every signed-in user's websocket in `state_changed`.
  - Home Assistant has no per-user read permission on states.
- **Anything on the bus is recorded.**
  - The recorder stores custom bus events (`virtual_pet_*`) in its `events` table by
    default, with their `event_data`.
  - Live, they reach admins only. `handle_subscribe_events`
    (`homeassistant/components/websocket_api/commands.py`) refuses a non-admin any event
    type outside `SUBSCRIBE_ALLOWLIST`, and `virtual_pet_*` is not on it.
  - So the threat model is:
    - **Attributes (A–C, J, K)** are readable live by every signed-in user.
    - **Bus events (D–I)** reach admins live, and anyone with history or database access
      through the recorder.
- **Caller-scoped means a reply or a pushed message on one authenticated connection,
  addressed by `connection.user.id`.**
  - The existing examples:
    - `websocket_photos`, `__init__.py:395-414`;
    - `websocket_answer`, `__init__.py:288-320`;
    - `virtual_pet.visit`'s service response, `__init__.py:188-192` and
      `coordinator.py:async_visit`, `1062-1142`.
  - A service response goes only to the caller. The `call_service` event that Home
    Assistant records carries the service data, which is `{entity_id, queued}` for
    `visit`, but never the response.
  - The recorded `call_service` row also carries the caller's `context_user_id`.
    - For `visit`, that tells the database who looked in and when, but carries no bond
      data. Accepted, and noted here.
    - For `notify_me`, it records who opted in (`enabled` plus the user). That is the same
      fact as `notify_users`, so it needs a fix (row M).
- **`_fire`'s events carry no `Context`.** `_fire` (`coordinator.py:783-811`) calls
  `hass.bus.async_fire(type, data)` with none, so the recorded event's `context_user_id`
  is empty.
  - That has to stay true. No new `context=` on a bus event may carry the actor's user ID.

## What leaves the server today (the inventory)

Each row is something per-person, or a title, that a household member or the recorder
can read today. The **Reads** column names every consumer found by grepping
`custom_components/`, `scripts/card-check.js`, `tests/` and `blueprints/`.

| # | Where | Field | Set in | Reads |
|---|---|---|---|---|
| A | `sensor.life_stage` attr | `bonds` `{user_id: {level, nickname?, favourite?}}` | `sensor.py:LifeStageSensor.extra_state_attributes` 231-237 | Card `_bond(s)` 2651-2655. It has 6 callers: `_firstLook` 2476, `_wishLine` 2521, `_greet` 2601 (P2a hellos too), `_note` "your_birthday" 2700, `case "tucked_in"` 3028, status `you two` row 3150. card-check injects it at 303 and 390 (11 stub sites in all, with C and E). `tests/test_init.py:1784` and `1961`. |
| B | `sensor.life_stage` attr | `notify_users` (list of HA user IDs) | `sensor.py` 216 | Card status "notify me" bell, 3160. card-check 222-230 area. Server-side readers use `state.notify_users`, not the sensor. |
| C | `sensor.life_stage` attr | `wish.for` (user ID), `wish.for_name` (first name) | `sensor.py:_wish` 179-189, from `model.pick_wish` 1436-1439 | Card `_wishLine` 2516-2524 (names the friend to **every other viewer**, shared or not), `_wishSaid` 2527-2530, status wish row 3177. card-check 409-410 and 1618. |
| D | bus + moments | `bond_up` `{user, level, nickname?, favourite?}` | `model.add_bond` 1679-1690 | Card `case "bond_up"` 2986. `tests/test_init.py:1812`. Guide 642-643. |
| E | bus + moments | `bond_record` `{user, game, wins}`, `bond_favourite` `{user, game}` | `model.game_record` 1644, `model.favourite_game` 1704 | Card `case "bond_record"` 3017, `case "bond_favourite"` 3035. card-check 377 and 675. |
| F | bus + moments | `friend_home` `{user, weather?}` | `coordinator._friends_home` 967-980 | Card `case "friend_home"` 3000: on another viewer's personal card it names them through `_personName(m.user)` 2636. `_firstLook` 2471-2478. card-check 377, 729, 763. |
| G | bus + moments | `tucked_in` `{user}` | `coordinator.async_set_lights_out` 1780 | Card `case "tucked_in"` 3025. card-check 677. |
| H | bus | `wish_made` `{kind, for?}` | `model.pick_wish` 1439, fired by `_daily_wish` 841-855 | No consumer in the repo. Automations may use it. |
| I | bus + moments | `watching` `{title}`, `listening` `{title, artist?}` | `home.py:HouseMoments.update` 327-341 | Card `case "watching"` 2914, `case "listening"` 2920. `tests/test_init.py:1266-1283`. Guide 636. |
| J | `sensor.life_stage` attr | `dream.title` (a show or song it dreamed of) | `coordinator._check_ins` 903-904 seeds it; `model.dream_on_waking` copies the seed; `sensor.py` 228 | Card `DREAMS.watching` / `DREAMS.listening` 713-715, said in `_firstLook`. card-check 1160. |
| K | `sensor.last_care` attr | `log[].by` (HA user's display name) | `model._log` 1102, 1242, 1332; `coordinator._who` 1809-1814 | Card status log lines (`by …`, hidden on a shared screen). `tests/test_init.py:168, 1096`, `tests/test_assist.py:134`. **Not in the owner's F1 list: Q4.** |
| M | recorder (`call_service`) | `notify_me` service data `{entity_id, enabled}` plus `context_user_id` | The card's `_setNotify` 3353-3374 calls `callService("virtual_pet", "notify_me", …)` | The recorder's `events` table. It is the same fact as B, kept in history. |
| L | bus | `virtual_pet_welcomed` `{pet_id}` | `coordinator._welcome` 1597-1608 | Already clean. Kept. |

**Checked, needing no change:**

- **intent.py.**
  - `StatusIntent.async_handle`, 170-203, reads `pet.bond_for(intent_obj.context.user_id)`
    on the server. Its `bond` and `nickname` speech slots answer the caller only.
  - `CareIntent.async_handle`, 216-245, does the same for "Thanks, sunbeam!".
  - Neither reads the sensor.
  - A voice satellite has no `context.user_id`, so `bond_for(None)` returns `(0, None)`:
    no nickname is spoken to the room.
- **llm.py.** It only wraps intent.py's handlers (`llm.py:62`).
- **notify.py.** It never reads the sensor.
  - `coordinator._notify`, 1554-1581, and `_birthday_morning`, 1500-1539, read
    `state.notify_users` and `bond_for` on the server.
  - Each phone gets its own nickname (`by_nickname`, 1571-1581).
- **`notify.message` (`notify.py:130`) has no text for D–G.** None of `bond_up`,
  `bond_record`, `bond_favourite`, `friend_home` or `tucked_in` appears in `notify.py`.
  So `_notify` sending to every `notify_users` member never carries one person's bond
  moment to another's phone.
  - The build keeps it that way: a test sends each of the five and asserts that no notify
    call follows.
- **diagnostics.py.** It already redacts `by`, `notify_users`, `bonds`, `user`, `for` and
  `for_name` (61), plus moments' `user` and `nickname` (98-100). After this plan, the
  redaction stays as a belt-and-braces measure.
- **The `dreamed` event is never fired.**
  - `model.dream_on_waking` returns one with `**state.dream` (title, or `pick`), but
    `coordinator._dream`, 865-872, uses the return value only as a boolean.
  - The plan still strips that return value (Server, F2), so a later `_fire` of it can't
    leak.
- **A picked dream's `pick`** reaches other people's visits as a note (`_notes`,
  1235-1240, `yours: false`). It is a choice from a fixed menu (`QUESTIONS.dream`) and
  names nobody. Kept.
- **The blueprint** (`blueprints/automation/virtual_pet/call_response.yaml`) reads only
  `virtual_pet_call_started` and `simulated`. It is unaffected.
- **`virtual_pet_news.headline`** is what an automation chose to share. Out of scope.

## The design: one caller-scoped channel, `virtual_pet/subscribe`

`visit` can't carry this alone.

- The card throttles it to hourly (`VISIT_EVERY_MS`, `_visit` 2658) and skips it on a
  shared screen.
- The card reads `_bond(s)` on every render.
- The card reacts live to D–G.
- Care, games and lights-out come in through buttons and services that return nothing
  to the card.

So the plan adds a **websocket subscription**, the pattern Home Assistant uses for
per-connection pushes:

```
→ {"type": "virtual_pet/subscribe", "entity_id": "sensor.pip_life_stage", "shared": false}
← result (success), then event messages on the same id:
← {"mine": {...} | null, "house": {...}, "moments": [...]}   # the full snapshot, first
← {"moment": {...}}                                         # each new one, as it happens
← {"mine": {...}} / {"house": {...}}                          # when either changes
```

### Server (`__init__.py`, `coordinator.py`)

- **`websocket_subscribe` in `__init__.py`.**
  - It resolves the pet from `entity_id` the way `websocket_photos` does (`404-410`), with
    the same `no_pet` error.
  - It registers a watcher on the coordinator:
    `pet.async_watch(connection.user.id, msg["shared"], send)`, where `send` wraps
    `connection.send_message(websocket_api.event_message(msg["id"], payload))`.
  - It stores the returned unsubscribe in `connection.subscriptions[msg["id"]]`, so Home
    Assistant removes it when the socket closes.
  - Then it calls `send_result` and sends the snapshot.
  - Any signed-in user may subscribe (read-only users too, as with `photos`). No admin
    check.
- **`PetCoordinator._watchers`**, `{token: (user, shared, send)}`, is kept in memory only.
- **`PetCoordinator._private`**, `{user: deque(maxlen=MOMENTS_KEPT)}`, holds each person's
  recent private moments, in memory, with `at`.
  - It is lost on restart, like `self.moments` today.
- **`PetCoordinator._house`** holds the latest media moment `{type, title, artist?, at}`
  and today's media dream title. It is in memory only.
- **The snapshot.**
  - `mine` is `{"bond": {level, nickname?, favourite?} | null, "notify_me": bool,
    "wish_for_you": bool}`.
    - It is built from `state.bonds[user]` (the same shape `sensor.py` builds today),
      `user in state.notify_users`, and `state.wish.get("for") == user` on today's open
      wish.
    - **`mine` is `null` when `shared` is true** (server-side, as defence in depth; the
      card also drops it).
  - `house` is `{"media": {...} | null, "dream": {"kind", "title"} | null}`.
  - `moments` is `_private[user]` (empty when shared) plus the current `house.media`, for
    `_firstLook`'s "friend came home while the card was closed" welcome.
- **The `_fire` split** (`coordinator.py:783-811`), driven by one table in `const.py`:
  - `PERSONAL_EVENTS = {"bond_up", "bond_record", "bond_favourite", "friend_home",
    "tucked_in"}`.
    - These are never fired on the bus and never put in `self.moments`.
    - They go to `_private[event["user"]]` (without `user`) and are pushed to that user's
      watchers whose `shared` is false.
    - `_notify` still sees them, as now: `notify.message` is written for the phone's owner.
  - `wish_made` is fired with `kind` only. `for` stays on `state.wish`.
  - `watching` and `listening` are fired on the bus with no `title` or `artist`, and are
    **not** put in `self.moments`. The full event (with title) goes to `_house["media"]`
    and is pushed to every watcher, shared or not (Q2).
  - `PRIVATE_EVENT_FIELDS = {"user", "for", "for_name", "nickname", "favourite", "title",
    "artist"}` is a final scrub of `data`, applied before `async_fire` and before
    `self.moments.insert`. Then a missed case leaks nothing.
- **`websocket_notify_me`, a new `virtual_pet/notify_me` command** (`{entity_id,
  enabled}`).
  - It calls `pet.async_set_notify(connection.user.id, enabled)`, like
    `websocket_baby_talk` (`__init__.py:370-392`), so nothing goes on the bus (row M).
  - The `virtual_pet.notify_me` service stays for automations and scripts.
- **Push on change.** `_publish()` (`coordinator.py:1635`) also calls `_push_watchers()`.
  - It rebuilds each watcher's `mine` and `house` and sends only what changed since that
    watcher's last send. This covers `async_set_notify`, bond points from care and games,
    and a new wish.
  - New moments are pushed straight from `_fire`.
- **A `@callback` and no awaits on the send path.** `connection.send_message` is
  thread-safe from the event loop. A closed connection is already unsubscribed, so a
  send needs no try or except.

### `sensor.py`

- **`LifeStageSensor.extra_state_attributes` drops `bonds` and `notify_users`.**
  - Remove them from `_unrecorded_attributes` as well (145-167).
- **`_wish` keeps `("kind", "granted")` plus `open`.** It drops `for` and `for_name`
  (183).
- **`dream`:**
  - `_today_only(self.pet.dream, ("kind",))`, which drops `title`.
  - For `kind in ("watching", "listening")` it returns `None`, so an old card doesn't say
    "I dreamed about undefined!" (`short(undefined)` returns `undefined`, card 508-511).
  - The new card gets that dream from `house.dream`.
- **`LastCareSensor.moments` needs nothing in `sensor.py`.** `_fire` no longer puts D–G or
  I there.

### `model.py`

- **`pick_wish`, 1436-1439.**
  - The event becomes `{"type": "wish_made", "kind": kind}` in both branches.
  - It keeps `state.wish["for"]`.
  - It stops storing `for_name`: the name was only for the sensor. A save that has one
    keeps it harmlessly until the next day's wish replaces it.
- **`dream_on_waking`, 1495-1502.** The returned event is `{"type": "dreamed", "kind": …}`,
  with no `title`, `pick` or `user`.
- **Events D–G keep `user`**, because `_fire` needs it to route them. The scrub happens in
  `_fire`, not here, so `notify` and the tests can still see who.

### Card (`hatch-pet-card.js`)

- **Subscribe per slide when `s.ids["sensor.life_stage"]` is set.**
  - The call is `this._hass.connection.subscribeMessage(cb, {type: "virtual_pet/subscribe",
    entity_id, shared: sharedScreen()})`. It keeps the unsubscribe promise on
    `s.unsub`.
  - `subscribeMessage` resubscribes by itself after a reconnect.
  - Resubscribe (unsub, then subscribe again):
    - when the slide's pet changes (`_forget`);
    - when the shared-screen toggle flips;
    - when the card reconnects (`connectedCallback`).
  - Unsubscribe in `_dropSlide` and `disconnectedCallback`.
- **On the snapshot:**
  - It sets `s.mine` (`null` on a shared screen even if the server sent one) and
    `s.house`.
  - It records private moments' `at` keys in `s.privateSeen`, so a replayed snapshot
    after a reconnect doesn't repeat them.
  - Then `s.subscribed = true`, then `this._redraw(s)`.
- **`_bond(s)` returns `sharedScreen() ? null : s.mine?.bond || null`.** All six callers
  stay as they are.
- **The first look waits for the snapshot.**
  - `_firstLook` (2460) returns early while `!s.subscribed && !s.subscribeFailed`.
  - Otherwise the nickname hello, `_firstLook`'s welcome-home and the aimed wish would be
    said before the bond arrives. A 3 s timeout sets `s.subscribeFailed`, so a slow
    server doesn't block the look for good.
  - `_greet` (P2a's warm and hearts hellos read `_bond`) has the same gate.
- **Moments.** Private and house moments go through the existing `_moment(s, m)` (2838).
  - `m.user` checks are dropped. A private moment is the viewer's by construction.
  - The `if (sharedScreen()) break;` guards stay.
  - `case "friend_home"` keeps only the "you're home!!" branch. The `_personName` branch
    ("Sam's home!!" / "someone's home!! ♥") goes, and `_personName` (2636) is deleted.
    See Q3.
  - `_firstLook`'s welcome-home reads `s.mine`'s private moments, not
    `attributes.moments` (2471-2478).
  - `case "watching"` and `case "listening"` are unchanged. They now get `m.title` from
    the house push.
  - Add a guard: `if (!m.title) break;`.
- **`_wishLine` (2516).**
  - When `s.mine?.wish_for_you && !sharedScreen()`, it returns
    `[withName(aimed[1], nickname), aimed[2]("you")]`.
  - Otherwise it returns `WISHES[wish.kind]`, the plain wish, for everyone else and for
    every shared screen.
  - `WISHES_FOR[k][0]` ("I hope Sam plays…") becomes unused: delete it.
  - `_wishSaid` tests `s.mine?.wish_for_you` instead of `wish.for && wish.for_name`.
- **The "notify me" bell** (3160) reads `s.mine?.notify_me`.
  - `_setNotify` calls `callWS({type: "virtual_pet/notify_me", …})` instead of the service,
    as `_setBabyTalk` (3323) does.
  - On `unknown_command` (a stale page against an older server) it falls back to the
    service.
  - `_setNotify` (3353-3374) already flips the button optimistically and calls the
    `notify_me` service. It keeps doing that, and also sets `s.mine.notify_me = enabled`
    at once, so a redraw before the push doesn't flip it back.
  - The `mine` push that follows `async_set_notify`'s `_publish()` confirms it.
- **Dream.** `_firstLook` uses `s.house?.dream || stage.dream`.

### Compatibility: old card with new server, and the reverse

The card is shipped inside the integration and loaded as `…/hatch-pet-card.js?v=VERSION`
(`__init__.py:118-121`). So a mismatch only lasts until the browser reloads. A dashboard
left open across the upgrade, a wall tablet above all, is the realistic case.

- **Old card, new server.**
  - `attributes.bonds` and `notify_users` are gone. `_bond` returns `null`: no bond row, no
    nickname, plain hellos. The bell shows "off".
  - Aimed wishes show plain, because `for` and `for_name` are gone.
  - D–G and the media moments no longer appear in `moments`, so there is nothing to
    mis-say.
  - A media dream shows as no dream (`dream: null`).
  - **No "undefined" line anywhere, and no error.**
  - The release note says to reload a wall tablet. See Release.
- **New card, old server** (a downgrade, which ships the old card too, so only a stale
  page).
  - `subscribeMessage` rejects with `unknown_command`. The card sets `s.subscribeFailed`
    and runs with no bond, as a shared screen does.
  - It does **not** fall back to reading `attributes.bonds`. A fallback would re-create the
    leak's consumer, for a case that lasts one reload.
- **Existing installs, server side.** The saved `PetState` is unchanged: `bonds`,
  `notify_users` and `wish.for` stay in the store. Nothing migrates.

## F2: titles and artists

**Recommendation: drop them from every bus event and attribute, with no opt-in setting**
(Q1).

The card keeps its "ooh, Bluey!" lines through `house.media` on the subscription.

- **Who can see a title.** Anyone who can open the card can already read
  `media_player.*` attributes (`media_title`, `media_artist`). So the subscription shows
  titles to no new audience.
- **What changes is where a title ends up.** It no longer becomes a second copy in the
  recorder's `events` table or in a `virtual_pet` entity's state.
- **Why not an opt-in.** It is a settings row and a translation for a single beneficiary:
  an automation that wants "the pet noticed Bluey". That automation can trigger on
  `virtual_pet_watching` and read the media player itself.
- **What changes, by place:**
  - **Bus.** `virtual_pet_watching` and `virtual_pet_listening` still fire, with
    `pet_id` only (plus `simulated`). The `_fire` scrub enforces this.
  - **Moments.** These two events are no longer in `MOMENTS` (89-118) for the public list.
    They go only to `_house`.
  - **`sensor.life_stage` `dream`.** No `title`, and `None` for media dreams (above).
  - **`dream_seeds`.** They keep `title` in the store (`_check_ins` 903-904). It is
    server-side and redacted in diagnostics already (`PRIVATE_READINGS`, `const.py:58-64`).
  - **The debug sensor's `calculation`.** It shows `tv_title`, `music_title` and
    `music_artist` when the pet's privacy option is off (`sensor.py:337-339`).
    - That is a globally readable attribute on an entity that is disabled by default.
    - **Recommendation: redact `PRIVATE_READINGS` always**, not only when `privacy` is on.
      The readings' titles stay in diagnostics' own redaction path.
    - This is also Q1: whoever turns the debug sensor on is debugging, and "is a title
      being read?" can show as `"tv_title": "**REDACTED**"`, which is still informative.

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

### `model.PetState.from_dict` (152-241), field by field

- **Root.** `from_dict` takes `Any`.
  - A non-`dict` raises a new `model.DamagedSave`.
  - The coordinator handles it (below). It must **not** fall into the `data is None`
    branch, which writes a new egg over the file and fires the welcome (325-332).
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
- **`bonds`** (213-221) already skips non-dict bonds. Add the following:
  - a non-dict `bonds` root becomes `{}`;
  - `points` comes from `_int`, since `int("x")` raises today;
  - `nickname` and `favourite` must be str or are dropped;
  - `games` and `best` become str → int dicts;
  - `since`, `day` and `noted` are typed or dropped;
  - `tucked_at` comes from `_float`.

### `coordinator.async_load` (325-357)

- **Only for a non-dict root (`DamagedSave`)** (the scope is Q9):
  1. Copy the raw data into a sibling store,
     `Store(hass, 1, f"{DOMAIN}.{entry_id}.damaged")`, before anything else is saved.
  2. Raise a repair issue `save_damaged` (`self._issue`, 384-398, is_fixable False) that
     names the pet and the backup file.
  3. Start a fresh egg **without** `_welcome()`. It isn't a new pet in the house.
  4. Set up as normal.
- **Any other exception from `from_dict`** is a bug in the validation, not damaged data.
  It is logged and raises a `save_damaged` repair issue, and setup fails
  (`ConfigEntryNotReady` is wrong here: retrying won't help, so raise `ConfigEntryError`).
  - The save file is untouched, and the next release can load it.
  - It never resets the pet. See Q9.
- **`async_remove_entry`** (`__init__.py:432-438`) also removes the `.damaged` store and
  deletes the `save_damaged` issue, as it does for `missing_entities` and
  `world_not_ready`.

### `people.People.async_load` (`people.py:90-96`) and readers

- **The root.** `people` and `weather` must each be a `dict`, else `{}`.
  - `dict(loaded.get("people") or {})` raises today on a list of pairs gone wrong, or on a
    string.
- **Each person record.** It must be a `dict`, else it is dropped.
  - Inside it, check each field the readers index: `noted` (dict str → str),
    `birthday`, `zone` (`{"name": str, "at": number}`, coordinator 455), `arrived`
    (number), `guess`, `my_day`, `baby_talk` and `birthday_phone` (bool).
  - Use one `_person(record)` sanitiser, next to the module's existing helpers. Grep
    `people.py` for every `.get(` on a person to finish the list in the build.
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
8. P3: `slide.mine = null`, then resubscribe with `shared: true` (as in the design
   section).

**What it keeps.** The game (a game's prompt names nobody), sounds, and the slide's pet.

**Turning a shared screen back to personal** needs only the resubscribe (P3) and the
status redraw. Nothing personal is waiting to be restored.

**The status message itself** ("Nothing personal on this screen now.") is shown by
`_statusMessage` in the status screen, not in the bubble. It stays as it is.

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
  - the `hatch-welcomed-<user>` key in `localStorage`.
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

## Tests (pytest, `scripts/test`)

Existing tests that assert the leak, and must be rewritten:

- `tests/test_init.py:1784` (`bonds` on the sensor);
- `tests/test_init.py:1961` (`my_day` absent from `bonds[me.id]`: it becomes "absent
  from every state");
- `tests/test_init.py:1812` (`bond_up` with `user` in moments);
- `tests/test_init.py:1266-1283` (title in moments);
- `tests/test_welcome.py:58` `test_a_new_pet_is_welcomed_on_every_phone`.

Grep `tests/` for `"for_name"`, `"notify_users"`, `attributes["bonds"]` and
`["moments"]` to catch the rest.

New tests:

1. **Two people, one non-admin** (`hass.auth.async_create_user("Other", group_ids=
   ["system-users"])`; a read-only one with `hass_read_only_access_token`, as
   `test_init.py:2457-2470` does).
   - Build bonds for both, nickname and favourite included.
   - Each one's `virtual_pet/subscribe` snapshot carries only their own `mine`.
   - The other user's sees `mine.bond` of their own or `null`, and never the first
     user's ID or nickname anywhere in the payload (assert on `json.dumps(payload)`).
   - Use the `hass_ws_client` pattern of `test_init.py:2151-2184`.
2. **Shared subscribe.** `shared: true` gives `mine: null` and no private moments, but
   still gets `house.media`.
3. **Live pushes.**
   - A care press by user A sends A a `moment` `bond_up`.
   - User B's subscription receives nothing for it.
   - `notify_me` sends A a new `mine.notify_me`.
4. **Nothing personal on the bus.**
   - Use `async_capture_events(hass, MATCH_ALL)`, or one capture per `virtual_pet_*` type.
   - Run a scripted day: visit, care, game record, favourite game, lights-out tuck-in, a
     friend's person entity coming home, an aimed wish, TV and music.
   - Assert that no event's `data` has any key in `PRIVATE_EVENT_FIELDS`.
   - Assert that no value equals a user ID, a person's first name, a nickname or the
     title "Bluey".
   - Assert that no `virtual_pet_*` event's `context.user_id` is set. Scope this to the
     pet's own events: `call_service` and `button.press` state changes rightly carry the
     caller's context.
   - Assert that the card's `virtual_pet/notify_me` command fires no `call_service`.
   - Fire each of D–G with someone in `notify_users`: no `notify.*` call follows.
5. **Nothing personal on states.**
   - After the same day, walk `hass.states.async_all()` for the pet's entities and
     `json.dumps` their attributes.
   - None of the IDs, names, nicknames or titles above may appear.
   - Catch `wish.for`, `notify_users`, `dream.title` and `moments`.
6. **Recorder.**
   - Put this in its own module, `tests/test_recorded.py`, with the `recorder_db_url`
     fixture override that `tests/test_wellbeing.py:31` has. The recorder's database must
     be ready before Home Assistant starts.
   - With `recorder_mock` (as `tests/test_wellbeing.py:84`), run the
     scripted day and call `async_wait_recording_done`.
   - Query the `events` table (`EventData.shared_data`) and `state_attributes`
     (`StateAttributes.shared_attrs`) for the same strings.
   - This test owns the "recorded events" claim. Bus capture alone doesn't prove what
     reached the database.
7. **Welcome (F3).**
   - The first pet, with no one opted in, makes a persistent notification and sends no
     `notify.mobile_app_*` call.
   - A second pet, with user A opted in on the first, sends to A's phones only.
   - The `welcomed` event's data is exactly `{"pet_id"}`.
8. **Damaged saves (F5).**
   - Seed `hass_storage[STORE_KEY]` and run full setup, then assert:
     - `entry.state is ConfigEntryState.LOADED`;
     - one `freezer` tick;
     - every `sensor.pip_*` renders.
   - Use one parametrized case per shape:
     - the audit's three (`call: "bad"`, `latched: null`, a non-object root);
     - missing `name`, `born` and `last_updated`;
     - a string stat;
     - `care_log: [{}]`, `journal: ["x"]`, `bonds: []`, `bonds: {"u": {"points": "x"}}`;
     - `dream_seeds: [{}]`, `trait_hours: 3`, `wish: "x"`.
   - The non-object root also asserts that the `.damaged` store holds the raw value, that
     the `save_damaged` issue exists, and that no welcome was sent.
   - **People:**
     - `people: "x"`;
     - `people: {"u": "x"}`;
     - `people: {"u": {"zone": 3, "noted": []}}`;
     - `weather: []`;
     - then a visit by `u` succeeds.
   - `tests/test_model.py` gets the pure `from_dict` cases. `tests/test_people.py` gets
     the people ones.
9. **Diagnostics.** The existing diagnostics test still passes. Add the debug sensor's
   `calculation` with privacy **off**: titles are redacted (F2, Q1).
10. **The people store is kept (FB).** Seed records for two users.
    - Remove the only pet (`hass.config_entries.async_remove`). `hass_storage` still has
      `virtual_pet.people`, and the pet's own key is gone.
    - Add a pet again. User A's birthday comes back in the visit reply (`birthday_kept`).
    - Repeat with two pets, removing one. The people store is untouched.
11. **"Forget my data" (FB).**
    - A, a non-admin, sends `virtual_pet/forget_me` over `hass_ws_client`. Then:
      - A's record is gone from `people.data["people"]` and from the saved store at once,
        with no `freezer` tick;
      - B's record and `weather` are unchanged;
      - every pet's `bonds[A]` and `notify_users` are unchanged;
      - A's next visit reply has `birthday_kept: false`, `my_day: false` and
        `baby_talk: false`;
      - an `async_capture_events(hass, MATCH_ALL)` around the command captured nothing
        about it.
    - A read-only user can forget their own record.
    - A visit still running when `forget_me` arrives finishes first, under the lock: no
      half-written record survives.

## Card checks (`scripts/card-check`)

A builder can run these. `scripts/develop` starts the throwaway HA at `localhost:8123`.
Then `scripts/card-check` drives Chromium through Playwright, logged in as `dev` /
`devdevdev` (`scripts/card-check.js:4,17`). The audit's sandbox couldn't open the port;
the crew host can.

- **Move the 11 stubs to the new channel.** They are the stubs that inject
  `attributes.bonds`, build moments with `user`, or pass `for` and `for_name` (lines 303,
  377, 390, 409-410, 675, 677, 729, 763, 1618; dream title 1160).
  - Add a card test hook: `el._mineFor(s, mine)` and `el._houseFor(s, house)` set
    `s.mine` and `s.house` and redraw.
  - Moments are passed to `el._moment(s, m)` without `user`.
- **A second, non-admin login.**
  - With the admin token, create the user over the websocket: `config/auth/create`
    (`{name: "Other", group_ids: ["system-users"]}`), then
    `config/auth_provider/homeassistant/create`
    (`{user_id, username: "other", password: …}`).
  - Open a second browser context on the same dashboard.
  - Build a bond for `dev` through real visits and fast-forward. Then check:
    - **Other's card shows no bond row, no nickname, no "you two".**
    - **Other's card shows the plain wish when dev's wish is aimed.**
    - **The "notify me" bell reflects Other's own setting.**
    - **Other's page holds no string of dev's anywhere.** Run `JSON.stringify`
      over `hass.states` for the pet's entities, looking for dev's ID and nickname.
- **Shared screen, aimed wish** (the audit's missing check).
  - Turn the shared screen on, with today's wish aimed at `dev`.
  - The status wish row and the first-look bubble show the plain wish (`WISHES[kind]`)
    and no name.
- **The media moment from the house.**
  - Set `media_player.dev_tv` playing with a title through the REST API.
  - Wait for the bubble: "ooh, <title>!" (or one of its lines).
  - Then assert that the life-stage and last-care attributes don't contain the title.
- **An old card against the new server** (stale tablet).
  - Load the card from the previous release's file, `git show v0.35.0b2:…/hatch-pet-card.js`,
    served with `page.route`, against the new dev server.
  - Assert there are no console errors and no "undefined" in the bubble or status across
    a TV moment, a media dream and an aimed wish.
- **F6.**
  - Build the card with two pets and open a best-friend journal photo on slide 2.
  - Shrink the card config to one device.
  - Assert, by wrapping `URL.revokeObjectURL` and `IntersectionObserver.prototype` in
    the page:
    - the slide's photo object URLs were revoked;
    - the dialog is closed;
    - `s.game` is null;
    - `s.unsub` was called.
  - Remove the card from the DOM: `disconnect` was called. Re-insert it: `observe` was
    called again.

- **FA: starting from a personal bubble** (the follow-up audit's repro).
  - Personal screen, with a bond of level 8 and the nickname "sunbeam" stubbed (P1:
    `inject` as today; after P3: `_mineFor`).
  - Make the pet say a named line with `_speak`, "hi, sunbeam!", with a long `ms`. Assert
    that the bubble and `s.live` contain "sunbeam".
  - Also leave a second slide with its status rendered personally ("you two"), and its
    bond hearts showing.
  - Open the status and press "shared screen", while the line is **still typing** (a run
    with babble on) and again once it has finished.
  - Then, for every slide, assert that neither `bubble.textContent` nor
    `live.textContent` contains "sunbeam" or `USER.name`.
  - Also assert:
    - `s.typing` and `s.babbling` are null;
    - there are no `.bondhearts`;
    - no status contains "you two", "my day" or "notify me";
    - the bubble after the next tick is the idle line.
  - Close the status: the same assertions hold.
- **FB: "forget my data".**
  - The row is absent on a shared screen.
  - One tap shows "sure? tap again" and sends nothing (wrap `callWS`).
  - The second tap sends `virtual_pet/forget_me`. After it:
    - the birthday rows are gone;
    - "baby talk" and "my day" show off;
    - `localStorage` has no `hatch-welcomed-<id>`.
  - Then do a real visit after a fast-forward hour: `birthday_kept` is false.

## Phases and PRs

All of it goes in the 0.35.0 beta series. HANDOFF: there is no 0.34.0, and the next full
release is 0.35.0. That needs the owner's say, Q6.

| PR | Contents | Why this order |
|---|---|---|
| **P1: F5 + F6 + FA** | `from_dict` hardening and the helpers, `DamagedSave` handling with a repair issue and backup, the `People` sanitiser, the observer and `_dropSlide`, and `_goShared`. Tests 8, plus the F6 and FA card checks. | Independent of the channel, and the lowest risk. It makes the later moment and storage tests stand on a loader that can't crash. |
| **P2: F3 + FB** | `_welcome` recipients, the `notify.py` docstring, `People.forget`, the `virtual_pet/forget_me` command, the card's "forget my data" row, and the guide (welcome, and what the pets remember). Tests 7, 10 and 11, plus the FB card check. | Small. FB's row joins the status screen's person rows and is independent of the channel. It can ride with P1 if the reviewer prefers. |
| **P3: F1 + F2** | The `virtual_pet/subscribe` and `virtual_pet/notify_me` commands, `_watchers` and `_private` and `_house`, the `_fire` split and scrub, `sensor.py` attribute removals, `model.pick_wish` and `dream_on_waking`, the card on `s.mine` and `s.house`, the `_wishLine` rewrite, the debug-sensor redaction, guide and release note. Tests 1–6 and 9, plus the card checks above. | One PR. Both change what `moments` and the bus carry, and both depend on the same channel. Splitting them would ship a card that half-reads the old attributes. |

Each PR runs `scripts/test` and `scripts/card-check`. P3 is the tier-2 build.

## Release note (draft, for P3's version)

> **Privacy: your bond with a pet is now yours alone.**
>
> Until now, other people in your home could read a few personal things through the
> pet's sensors or events, if they went looking: each person's bond level, nickname and
> favourite game, who gets notifications, and a day's wish aimed at a friend. The same
> was true of the show or song the pet noticed, which Home Assistant's history also kept.
> Now each person's card fetches only their own, privately, and none of it is on a sensor
> or an event any more.
>
> **If an automation of yours reads any of these, it stops working:**
>
> - On the life stage sensor, the attributes `bonds` and `notify_users` are gone. `wish`
>   no longer has `for` or `for_name`. `dream` no longer has `title`, and a dream about a
>   show or song shows as no dream.
> - The events `virtual_pet_bond_up`, `virtual_pet_bond_record`,
>   `virtual_pet_bond_favourite`, `virtual_pet_friend_home` and `virtual_pet_tucked_in`
>   are no longer fired.
> - `virtual_pet_wish_made` no longer has `for`.
> - `virtual_pet_watching` and `virtual_pet_listening` still fire, without `title` or
>   `artist`. Read your media player for those.
>
> **Already recorded history.** Events recorded before this update stay in Home
> Assistant's history until the recorder purges them (after `purge_keep_days`, 10 days by
> default). To remove them sooner, add the event types under `recorder: exclude:
> event_types:` and run the **Recorder: Purge** action with **Apply filter** on.
>
> **After updating, reload any dashboard that stays open** (a wall tablet, say). Until it
> reloads, it shows no bond hearts or nicknames, but nothing breaks.
>
> **Also in this update:**
>
> - The welcome for a new pet goes to the sidebar, and to the phones of people who turned
>   on "notify me" for another pet. It no longer goes to every phone.
> - A damaged save file no longer stops a pet loading: what can be kept is kept, and
>   anything unreadable is backed up with a note under Settings → Repairs.
> - Turning on "shared screen" now clears anything personal the pet was saying at that
>   moment.
> - **New: "forget my data"** on the status screen erases what the pets remember about
>   you: your birthday, your answers, and your baby talk and "my day" settings. Your bond
>   with each pet stays. Removing the integration keeps these, so they're there if you
>   set it up again.

The **Apply filter** behaviour was checked in Home Assistant's `recorder/services.yaml`
and `strings.json`: "Apply `entity_id` and `event_type` filters in addition to time-based
purge". It is in the same uv-cached Home Assistant that `scripts/setup` installs.

## Copy (proposals, for the owner)

| Where | Now | Proposed |
|---|---|---|
| Repair issue `save_damaged`, title | (new) | "{pet}'s save file was damaged" |
| Repair issue `save_damaged`, description | (new) | "Home Assistant couldn't read {pet}'s save file, so {pet} started again as a new egg. The old file is kept as `.storage/virtual_pet.{entry_id}.damaged`, in case you want to look at it." |
| `guide.md` 553-557 (welcome) | "…It goes to every phone with the Home Assistant app, whether or not anyone tapped "notify me", and to the notifications in the sidebar…" | "**A welcome for every new pet.** Adding a pet puts a note in the sidebar's notifications: "Pip, a new virtual pet, just moved in! Say hi ♥". It also goes to the phones of anyone who has "notify me" on for another pet in the house. A new generation laid as an egg isn't a new pet, and restarts never welcome again." |
| `notify.py:5` docstring | "The one exception is the welcome when a pet is added, which goes to every phone." | "The welcome when a pet is added goes to the sidebar, and to the phones of people who get another pet's notifications." |
| `guide.md` 122-125 (bonds) | "…cheers when you come home ("Sam's home!!", and "welcome home!" when you next look in…) …some days its wish is for you ("I hope Sam plays a game with me today!"; anyone can still grant it)." | "…cheers when you come home ("you're home!!", on your own card; this needs your person entity linked to your login), and some days its wish is for you ("will you play a game with me today?", on your card; everyone else sees the plain wish, and anyone can still grant it)." |
| `guide.md` 629-650 (events) | the list with `user`, `title`, `artist` and `for` | Drop the five personal events, and `title`, `artist` and `for`. Add: "Nothing about a person, nor what's playing, is ever on an event or a sensor: each person's card gets its own over a private websocket subscription." |
| `guide.md` Recorder (684-695) | "Long attributes … are already kept out of the history database." | Add: "Its events are recorded like any other; none carries a person or a title. To keep them out of history altogether: `recorder: exclude: event_types: [virtual_pet_care, …]`." |
| Card status row, label (FB) | (new) | "my data" |
| Card status row, button (FB) | (new) | "forget" (armed: "sure? tap again") |
| Card status row, `aria-label` (FB) | (new) | "forget my data: your birthday, answers and settings for every pet; your bonds stay" |
| Card status message, done (FB) | (new) | "Forgotten. The pets start fresh with you ♥" |
| Card status message, failed (FB) | (existing) | "That didn't work. Try again." |
| `guide.md` `### Privacy` (FB), after the table | (new) | "**What the pets remember about you.** Your birthday, your answers to its questions, your alarm times, the last zone you came back from, and your "baby talk", "my day" and "birthday on my phone" switches are kept for you alone, for every pet. They stay when you remove a pet, even the last one, so they're there if you set it up again. **"forget my data"** on the status screen (not on a shared screen) erases all of that, for you only, at once. Your bond with each pet, its photos and its nickname for you stay. So does whether you get notifications: turn "notify me" off for that. The pets start fresh with you, and they note again when you next come home. To erase everyone's, an admin can stop Home Assistant and delete `.storage/virtual_pet.people`." |
| `guide.md` 539-540 (birthday) | ""forget my birthday" on the status screen forgets it and stops asking." | "…forgets it and stops asking; "forget my data" forgets everything the pets remember about you (see Privacy)." |
| Card (removed) | "Sam's home!!" / "ooh, Sam is back!" / "someone's home!! ♥" on others' cards | (no line; Q3) |
| Card (removed) | `WISHES_FOR[k][0]`, e.g. "I hope Sam plays a game with me today!" | (no line: the plain `WISHES[k][0]`) |

No new pet lines. The aimed wish's "to you" lines (`WISHES_FOR[k][1]`) and every
bond-moment line are unchanged.

## Open questions (each with a recommendation)

1. **F2: opt-in or drop?**
   - **Recommendation: drop.** No opt-in setting.
   - Titles reach the card over the subscription. Automations read the media player. The
     debug sensor always redacts `PRIVATE_READINGS`.
   - An opt-in would add a settings row whose only user is an automation that can get the
     title elsewhere.
2. **Titles on a shared screen.**
   - Today a kitchen tablet says "ooh, Bluey!". After this plan the house push goes to
     shared subscriptions too, so it still does.
   - **Recommendation: keep.** It is the TV in the room, not a person. Say no to strip
     `house.media` when `shared` is true.
3. **"Sam's home!!" on other people's cards.** Once `friend_home` carries no user, other
   viewers can't be told who.
   - A nameless public "someone's home" tied to a close bond would still tell the house
     that the person whose `person.*` just changed is a close friend. That person's level
     is private (owner, F1).
   - **Recommendation: drop it.** Only the friend's own card says "you're home!!".
   - Possible later: a nameless "someone's home!" for any person arriving, not tied to
     bonds, as a house moment. Not in this plan.
4. **The care log's `by` (`sensor.last_care` `log`).**
   - It is not in the owner's F1 list, but it is a person's name in a globally readable
     attribute, sent live to every signed-in user. It is `_unrecorded`, so it isn't kept
     in history.
   - It is the guide's "who fed it" log, and the card already hides it on shared screens.
   - **Recommendation: keep it** for this plan, as the one documented household-shared
     trace, and add one sentence to the guide saying so.
   - If the owner wants it private too, the same subscription can carry `mine.log`
     (entries by the viewer) and the public log can drop `by`. That would be a small P3
     addition.
5. **Who gets the welcome on their phone.**
   - **Recommendation: the union of `notify_users` over the house's other pets.** For the
     first pet, the sidebar only.
   - The stricter alternative is sidebar only, always. It is simpler, but a house that
     adds a second pet wouldn't hear about it on the phones of people who asked for pet
     news.
6. **Version.**
   - **Recommendation: P1 and P2 as 0.35.0b3, P3 as 0.35.0b4.** All before the 0.35.0
     release, which still waits on the photo phone test.
   - The privacy fix should not ship after a full release that announced bonds as
     personal.
7. **Existing `wish.for_name` in saves.**
   - **Recommendation: leave it.** It is server-only, it is replaced at the next day's
     wish, and diagnostics already redact it.
   - The alternative, popping it in `from_dict`, is a two-line addition if the scout
     prefers.
8. **Should `virtual_pet/subscribe` refuse a user with no person entity?**
   - **Recommendation: no.** Bonds key on the HA user, not the person entity
     (`_person`, 1820-1826). A system user never subscribes from a browser, and a system
     user's bond is never built (`_person` filters `system_generated`).
9. **F5: what happens when validation itself fails?**
   - A fresh egg is the only way forward when the root isn't an object: there is nothing
     to keep, and the raw value is backed up.
   - For any other exception during load (a bug in the new checks, say), resetting would
     turn every pet into an egg on an upgrade.
   - **Recommendation: the egg reset only for a non-dict root.** Anything else fails
     setup with a repair issue and leaves the save file untouched. A pet that doesn't load
     until a fix ships is better than a pet that is quietly replaced.
   - The alternative, a reset on any error, needs the owner's say: it loses a pet.
10. **FB: should "forget my data" also clear the bonds?**
    - The owner said the people store only, so it doesn't. A person who wants a clean
      slate keeps their bond points, nickname and photos with every pet.
    - **Recommendation: keep it to the people store,** as decided, and say so on the
      button's label and in the guide (copy table).
    - A later "forget me everywhere" could remove `bonds[user]`, `notify_users` and
      `dream_picks` from every pet too. That loses photos, so it needs its own wording.
11. **FB: presence is kept with "my day" off.**
    - `person_moved` (`coordinator.py:438-463`) stores `zone` for every linked person.
      Its use in the visit's notes is behind "my day" (`_notes` 1272-1275).
      `_came_home` (1164-1170) also reads it, to choose a question.
    - **Recommendation: store `zone` only while "my day" is on,** as a small change in
      P2. `arrived` and `left` are timestamps that the welcome home and the send-off need,
      and they stay.
    - Say no to leave it as it is: the guide paragraph above already discloses it.
12. **FB: placement.**
    - **Recommendation: the "my data" row goes last among the person's own rows** (after
      "baby talk"), with the two-tap arm.
    - The alternative is a link in the journal. The journal is the pet's, not the
      person's, so the status screen fits better.
