# Plan: privacy hardening (outside audit findings 1, 2, 3, 5, 6, and follow-up A, B)

**DRAFT 2, 2026-10-28.** A build plan only: no code changes here. The build is review tier 2.

**Status:** P1 (F5, F6, FA, D1) built as 0.35.0b4 on crew branch
`crew/hatch-at-home-s2434-privacy-p1-damaged-saves-salva` (2026-10-28), awaiting its tier-2
audit and PR. P2, P3a, P3b and P3c not started.

**Draft 2** folds in the adversarial audit of draft 1 (scout `hatch-at-home-s2430`, 20
findings) and the owner's answers of 2026-10-28. Every audit claim was checked against
`origin/main` at `0821baf` before it was folded in. All 20 held, with small corrections
noted in their rows. The sections below are fixed in place. **The table at the end ("The
audit of draft 1") wins where it differs from them.**

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

**Owner answers to draft 1 and its audit (2026-10-28).** All of them are folded into the
sections below. The full list, with how the owner's question numbers map to this plan's,
is in "Decided (2026-10-28) and still open".

- **Phone messages keep the nickname** (audit #1). The guide says that phone messages are
  kept in Home Assistant's history.
- **Damaged saves are salvaged** (audit #5, #8, Q9). The pet always loads and is never
  welcomed as new. See F5.
- **Shared screens keep a nameless "someone's home!! ♥"** for any signed-in person's
  arrival, whatever the bond (audit #11).
- **"my day" becomes a websocket command**, like "notify me" (audit #9).
- **P3 is split in three** (audit #13), and the versions run from 0.35.0b4 (audit #12, Q6).
- **P1 also hides the personality before the teen stage** (functional check D1).

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
      fact as `notify_users`, so it needs a fix (row M). `my_day` is the same (row O).
  - **Phone notifications are service calls too** (row N). `notify.send`
    (`notify.py:245-250`) calls `notify.mobile_app_*` with `{"message": text, …}`, and
    Home Assistant fires `call_service` with the full `service_data` for every call
    (`homeassistant/core.py:2945-2949`). The recorder keeps it unless the user excludes
    `call_service`. So a phone message's text, nickname included, is in history against
    a phone service that is usually named after its owner.
    - **Owner, 2026-10-28: keep the nickname on phone messages.** The guide's Recorder
      section discloses that phone messages are kept in history. No code changes.
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
| F | bus + moments | `friend_home` `{user, weather?}` | `coordinator._friends_home` 967-980 | Card `case "friend_home"` 3000: on another viewer's personal card it names them through `_personName(m.user)` 2636, and a shared screen says a nameless "someone's home!! ♥" (3013; card-check 398 asserts it). `_firstLook` 2471-2478. card-check 392, 398, 742, 776. |
| G | bus + moments | `tucked_in` `{user}` | `coordinator.async_set_lights_out` 1780 | Card `case "tucked_in"` 3025. card-check 677. |
| H | bus | `wish_made` `{kind, for?}` | `model.pick_wish` 1439, fired by `_daily_wish` 841-855 | No consumer in the repo. Automations may use it. |
| I | bus + moments | `watching` `{title}`, `listening` `{title, artist?}` | `home.py:HouseMoments.update` 327-341 | Card `case "watching"` 2914, `case "listening"` 2920, **and the recap `_awayNote` 2566-2587** ("while you were out, I watched TV", `MOMENT_BITS.watching`/`listening`, shipped since 0.29.0, `guide.md:111`). `_check_ins` 903-904 seeds media dreams from the event's `title`. `tests/test_init.py:1266-1283`. Guide 636. |
| J | `sensor.life_stage` attr | `dream.title` (a show or song it dreamed of) | `coordinator._check_ins` 903-904 seeds it; `model.dream_on_waking` copies the seed; `sensor.py` 228 | Card `DREAMS.watching` / `DREAMS.listening` 713-715, said in `_firstLook`. card-check 1160. |
| K | `sensor.last_care` attr | `log[].by` (HA user's display name) | `model._log` 1102, 1242, 1332; `coordinator._who` 1809-1814 | Card status log lines (`by …`, hidden on a shared screen). `tests/test_init.py:168, 1096`, `tests/test_assist.py:134`. **Not in the owner's F1 list: Q4.** |
| M | recorder (`call_service`) | `notify_me` service data `{entity_id, enabled}` plus `context_user_id` | The card's `_setNotify` 3353-3374 calls `callService("virtual_pet", "notify_me", …)` | The recorder's `events` table. It is the same fact as B, kept in history. |
| N | recorder (`call_service`) | `notify.mobile_app_*` service data `{message, data}`: the text carries the person's nickname (`notify.to_friend`, 159-164), and a birthday or "my day" send-off says whose day it is | `coordinator._notify` 1571-1581, `_birthday_morning` 1500-1539, `notify.send_off` 176; sent by `notify.send` 245-250 | The recorder's `events` table. **Kept, disclosed in the guide** (owner, 2026-10-28). |
| O | recorder (`call_service`) | `my_day` service data `{entity_id, enabled}` plus `context_user_id` | The card's "my day" button calls `callService("virtual_pet", "my_day", …)` (card:3309) | The recorder's `events` table: who turned on presence-based day tracking. Fixed like M. |
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
  - It registers a watcher **in the domain's registry, not on the coordinator**:
    `watchers.add(entry_id, connection.user.id, msg["shared"], send)`, where `send` wraps
    `connection.send_message(websocket_api.event_message(msg["id"], payload))`.
  - It stores the returned unsubscribe in `connection.subscriptions[msg["id"]]`, so Home
    Assistant removes it when the socket closes.
  - Then it calls `send_result` and sends the snapshot.
  - Any signed-in user may subscribe (read-only users too, as with `photos`). No admin
    check.
- **The watcher registry outlives a coordinator** (audit #2).
  - An options save reloads the entry (`OptionsFlowWithReload`, `config_flow.py:228`), and
    so does a new world's egg (`async_schedule_reload`, `coordinator.py:1753`).
    `async_unload_entry` pops the pet (`__init__.py:427-430`). A watcher kept on the old
    `PetCoordinator` would stop getting pushes, and its closure would keep the old
    coordinator alive until the socket closed.
  - So `hass.data[DOMAIN]["watchers"]` holds `{entry_id: {token: (user, shared, send)}}`,
    in memory only, set up in the domain `async_setup` next to `people`.
  - The coordinator reads its own entry's watchers from there. It holds no reference to
    a watcher.
  - `async_setup_entry`, once the new coordinator is in `hass.data[DOMAIN]["pets"]`, sends
    every watcher of that entry a fresh full snapshot. A card open across an options save
    keeps its bond with no action of its own.
  - `async_remove_entry` sends each of the entry's watchers `{"gone": true}` and drops the
    entry's key. The card then unsubscribes that slide (its pet is gone).
  - A subscribe that arrives while the entry is unloaded (mid-reload) gets `no_pet`. The
    card retries it (Card, below).
- **`PetCoordinator._private`**, `{user: deque(maxlen=MOMENTS_KEPT)}`, holds each person's
  recent private moments, in memory, with `at`.
  - It is lost on restart, like `self.moments` today.
- **`PetCoordinator._house`** holds the latest media moment `{type, title, artist?, at}`
  and today's media dream title. It is in memory only.
  - The card dedupes `house.media` by its `at` (audit #18). A snapshot replays the current
    one on every resubscribe (toggle, reconnect, reload), and the card must not say
    "ooh, Bluey!" again for one it has already said.
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
  - `now` is the server's time (ISO), so the card's `recent()` (`hatch-pet-card.js:2068-2088`)
    still judges a pushed moment's `at` against the server clock, not the browser's
    (audit #18).
- **The `_fire` split** (`coordinator.py:783-811`), driven by one table in `const.py`.
  It lands in two steps (Phases):
  - **P3a dual-writes.** `_fire` copies each D–G event (without `user`) into
    `_private[user]` and pushes it, and copies the titled media event into
    `_house["media"]` and pushes it. The public path (bus, `self.moments`, attributes) is
    untouched. The new card reads only the private copies, so nothing visible changes.
  - **P3b removes the public half** for D–G (the `PERSONAL_EVENTS` gate and the scrub),
    and **P3c** for titles (the bus's `title`/`artist`, `tv_on`/`music_on`).

  The end state:
  - `PERSONAL_EVENTS = {"bond_up", "bond_record", "bond_favourite", "friend_home",
    "tucked_in"}`.
    - These are never fired on the bus and never put in `self.moments`.
    - They go to `_private[event["user"]]` (without `user`) and are pushed to that user's
      watchers whose `shared` is false.
    - `_notify` still sees them, as now: `notify.message` is written for the phone's owner.
  - `wish_made` is fired with `kind` only. `for` stays on `state.wish`.
  - `watching` and `listening` are fired on the bus with no `title` or `artist`. The full
    event (with title) goes to `_house["media"]` and is pushed to every watcher, shared or
    not (Q2).
  - **The recap keeps its TV and music bits** (audit #4). `_awayNote` (card:2566-2587)
    builds "while you were out, I watched TV and listened to music!" from public
    `moments`. So `self.moments` keeps a title-less record of each, under **new types**,
    `tv_on` and `music_on` (`{type, at}` and nothing else).
    - Why new types and not title-less `watching`/`listening`: an old card's
      `case "watching"` speaks `short(m.title)` unguarded (card:2914-2918), so a stale
      tablet would say "ooh, undefined!". An old card has no case for `tv_on`, and its
      `_moment` ignores an unknown type.
    - The new card's `MOMENT_BITS` gains `tv_on: "watched TV"` and `music_on: "listened to
      music"`. `_moment` has no case for them: the live line comes from `house.media`.
  - **`someone_home`, a new public moment** (owner, 2026-10-28; audit #11).
    - `person_moved` (`coordinator.py:438-463`) already sees every arrival of a person
      entity linked to a login. Each arrival also makes `{"type": "someone_home"}`: no
      user, no name, no weather, whatever the bond. It is debounced like `friend_home`
      (`FRIEND_HOME_EVERY_MINUTES`, but one shared timer, not per user).
    - It goes into `self.moments` and on the bus with `pet_id` only. It is not in
      `PERSONAL_EVENTS`, and the scrub leaves it alone: it has nothing to scrub.
    - The person entity's own state history already says who came home and when, so it
      tells the house nothing new.
    - `notify.message` has no text for it, so phones are never told.
  - `PRIVATE_EVENT_FIELDS = {"user", "for", "for_name", "nickname", "favourite", "title",
    "artist"}` is a final scrub of `data`, applied before `async_fire` and before
    `self.moments.insert`. Then a missed case leaks nothing.
    - **The scrub builds a new dict** (audit #17). The event objects are untouched:
      `_check_ins` reads `e["title"]` after the fire loop to seed media dreams
      (`coordinator.py:903-904`), and `_notify` reads `user` from the same dict (790).
- **`websocket_notify_me`, a new `virtual_pet/notify_me` command** (`{entity_id,
  enabled}`).
  - It calls `pet.async_set_notify(connection.user.id, enabled)`, like
    `websocket_baby_talk` (`__init__.py:370-392`), so nothing goes on the bus (row M).
  - The `virtual_pet.notify_me` service stays for automations and scripts.
- **`websocket_my_day`, a new `virtual_pet/my_day` command** (`{entity_id, enabled}`),
  the same shape (audit #9, row O). It calls the coordinator's existing my-day setter
  for `connection.user.id`. The `virtual_pet.my_day` service stays for automations.
- **Push on change, from a coordinator listener** (audit #3).
  `self.async_add_listener(self._push_watchers)` in the coordinator's setup, not a call in
  `_publish()`.
  - A listener runs on every update: the regular tick (`_async_update_data`,
    `coordinator.py:359-367`, which makes the daily wish and, at a morning wake, the
    dream, and never calls `_publish()`), `async_set_updated_data` (which `forget_me` and
    `async_set_my_day` use) and `_publish()` alike. Midnight's new wish is covered by the
    next tick.
  - `_push_watchers` rebuilds each watcher's `mine` and `house` and sends only what
    changed since that watcher's last send. This covers `async_set_notify`, bond points
    from care and games, a new wish and a new dream.
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
    - when the card reconnects (`connectedCallback`);
    - when the shared-screen switch changes in another card or tab (FA, below).
  - Unsubscribe in `_dropSlide` and `disconnectedCallback`.
  - **Retry, never give up** (audit #2). A subscribe that fails with `no_pet` or
    `unknown_command` (mid-reload, or the websocket back before `virtual_pet` is set up
    after an HA restart) is retried after 2 s, 5 s and 15 s, then every 60 s, while the
    slide exists. `s.subscribeFailed` still lets the first look go ahead meanwhile.
  - `{"gone": true}` (the entry was removed) unsubscribes and stops retrying.
  - A full snapshot can arrive at any time (after a reload): the card treats each one as
    a reset of `s.mine` and `s.house`, not only the first.
- **On the snapshot:**
  - It sets `s.mine` (`null` on a shared screen even if the server sent one) and
    `s.house`.
  - It records private moments' `at` keys in `s.privateSeen`, and `house.media.at` in
    `s.mediaSeen`, so a replayed snapshot after a reconnect or reload doesn't repeat them
    (audit #18).
  - It keeps the snapshot's server `now` as the clock offset that `recent()` uses for
    pushed moments.
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
    ("Sam's home!!" / "someone's home!! ♥", card:3012-3013) goes, and `_personName` (2636)
    is deleted. See Q3.
  - **A new `case "someone_home"`, shared screens only** (owner, 2026-10-28): "someone's
    home!! ♥" and the `perk` animation, as card:3013-3014 do today. On a personal card it
    says nothing. The arriver's own card says "you're home!!" from their private
    `friend_home` only (if they are a close friend), so nobody hears both lines.
  - `MOMENT_BITS` (in `_awayNote`) gains `tv_on: "watched TV"` and
    `music_on: "listened to music"`. The `watching` and `listening` keys stay for house
    moments.
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
- **"my day"** (card:3309) does the same: `callWS({type: "virtual_pet/my_day", entity_id,
  enabled})`, with the same `unknown_command` fallback to the service (audit #9).
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
    mis-say. The new `tv_on`, `music_on` and `someone_home` moments have no case in the
    old card, so it ignores them. Its recap loses "watched TV" until it reloads, and its
    shared screen loses "someone's home!! ♥".
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
    The titled event goes only to `_house`. The public list gets a title-less `tv_on` or
    `music_on` instead, for the recap (audit #4; design section).
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

## Tests (pytest, `scripts/test`)

Existing tests that assert the leak, and must be rewritten:

- `tests/test_init.py:1784` (`bonds` on the sensor);
- `tests/test_init.py:1961` (`my_day` absent from `bonds[me.id]`: it becomes "absent
  from every state");
- `tests/test_init.py:1812` (`bond_up` with `user` in moments);
- `tests/test_init.py:1266-1283` (title in moments);
- `tests/test_init.py:695` and `715` (`notify_users` on the sensor);
- `tests/test_init.py:1746` (`dream == {"kind": "watching", "title": "Bluey"}` on the
  sensor; the grep below misses it);
- `tests/test_init.py:1911` (`friend_home` with `user` in moments), `1985` (`tucked_in`)
  and `2017` (`bond_record`);
- `tests/test_init.py:2900` (the phase-4 photos test indexes `attributes["bonds"]`, which
  will `KeyError`). Keep its intent, "photos are never on a sensor or the bus",
  re-expressed as "not in any state";
- `tests/test_welcome.py:58` `test_a_new_pet_is_welcomed_on_every_phone`.

Grep `tests/` for `"for_name"`, `"notify_users"`, `attributes["bonds"]`, `"title"` and
`["moments"]` to catch the rest (audit #15).

**The `new_pet` marker and the existing fixtures (P1).** At `0821baf` the tests make 24
`MockConfigEntry`s across five modules (the shared `entry()` fixture is
`test_init.py:44`), none with `new_pet`. Under the new rule, each of those with an empty
`hass_storage` would load as a damaged save: a `save_damaged` issue and no welcome. So P1
gives the shared fixture and every fresh-pet entry `data={…, "new_pet": True}`, and a
test asserts the key is gone after setup. `scripts/develop` only starts HA on
`dev/config`: its existing pets are existing entries (no welcome is due), and a pet added
in its UI goes through the config flow, which sets the key.

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
   - Seed A's bond one point short of a level (`bond_up` fires only on a level-up,
     `model.add_bond` 1679). A care press by A then sends A a `moment` `bond_up`.
   - User B's subscription receives nothing for it.
   - `notify_me` sends A a new `mine.notify_me`, and `virtual_pet/my_day` a `mine` push.
   - **The tick pushes** (audit #3): a morning tick that aims the daily wish at A pushes
     `mine.wish_for_you: true` to A only, and a morning wake with a media seed pushes
     `house.dream` to both.
   - A replayed snapshot carries the same `house.media.at`, and the snapshot has `now`.
   - **Reload** (audit #2). With A subscribed, save the options (an entry reload). A's
     subscription gets a fresh full snapshot with A's bond, with no new subscribe. A
     subscribe sent while the entry is unloaded gets `no_pet`. Remove the entry: the
     subscription gets `{"gone": true}`. `hass.data[DOMAIN]["watchers"]` holds only
     `(user, shared, send)` tuples, never a coordinator.
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
   - Assert that the card's `virtual_pet/notify_me` and `virtual_pet/my_day` commands
     fire no `call_service` (audit #9).
   - A TV moment still seeds a media dream (`dream_seeds` gets the title): the scrub
     copied, it didn't mutate (audit #17).
   - *(P3c)* Public `moments` hold `tv_on` and `music_on` with no key but `type` and `at`.
   - *(P3b)* A person entity linked to a login, with no bond, coming home puts
     `someone_home` in `moments` with no key but `type` and `at`.
   - Tests 4–6 land in P3b with the title cases (`title`, `artist`, "Bluey") marked to
     join in P3c, so P3b's run doesn't fail on what P3c removes.
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
   - **Phone messages** (row N, audit #1). The scripted day includes an opted-in user with
     a nickname, a notifying event, a birthday morning and a send-off, with a mocked
     `notify.mobile_app_*` service. The nickname is found **only** in `call_service` rows
     whose `domain` is `notify` (kept, by the owner's decision, and disclosed). It is in no
     `virtual_pet_*` event and no state attribute.
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
   - The non-object root also asserts that a `.damaged.<timestamp>` file holds the raw
     value, that the `save_damaged` issue exists, and that no welcome was sent.
   - **The `None` shapes** (audit #5): an undecodable file, `data: null`, an outer `{}`,
     and a wrapper missing `data`. Each one, on an entry without `new_pet`: the pet loads
     as an egg, no persistent welcome and no `notify` call, and `save_damaged` exists.
     The same empty store on an entry **with** `new_pet` welcomes once, and the key is
     gone from the entry afterwards.
   - **Salvage**: a root with a valid `name`, `generation`, `species`, `journal` and a bond
     with photos, plus a field that makes `from_dict` raise (patched to raise, standing in
     for a bug in the checks). The pet loads with those five kept and the rest defaulted.
   - A bond with photos plus a junk `catchphrase: "x"`: photos kept, the question dropped.
   - A `species` id not in the catalog is kept (audit #7).
   - An unknown root key and an unknown bond key survive a load and a save.
   - A `[{…}]` root (one dict in a list) is unwrapped and kept.
   - Two incidents leave two `.damaged.*` files.
   - **The tick**: `_async_update_data` patched to raise once on the first refresh. The
     entry is `LOADED`, not `SETUP_RETRY`, and `save_damaged` exists.
   - **People:**
     - `people: "x"`;
     - `people: {"u": "x"}`;
     - `people: {"u": {"zone": 3, "noted": []}}`;
     - `weather: []`;
     - then a visit by `u` succeeds.
   - **A damaged people wrapper with two pets set up**: both pets load, the people store
     starts empty, a `people.damaged.*` file exists and `people_damaged` is raised.
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
      half-written record survives. **Staging** (audit #19): patch the visit's people
      write to `await` an `asyncio.Event` while holding `people.lock(A)`. Start the visit
      as a task, send `forget_me` (it blocks on the lock), assert A's record is still
      there, set the event, then assert the visit returned and A's record is gone.

## Card checks (`scripts/card-check`)

A builder can run these. `scripts/develop` starts the throwaway HA at `localhost:8123`.
Then `scripts/card-check` drives Chromium through Playwright, logged in as `dev` /
`devdevdev` (`scripts/card-check.js:4,17`). The audit's sandbox couldn't open the port;
the crew host can.

- **Move every `bonds`, `user:`, `for:`/`for_name` and `title` stub in `card-check.js`
  to the new channel** (audit #14). At `0821baf` they are at 308, 316, 390, 392, 398, 403,
  422-423, 454, 688-690, 742, 776, 950, 1173, 1609-1615 and 1631, and three easily missed
  ones:
  - **1858**, the baby-talk screenshot (`tucked_in` with `user`);
  - **1997**, the P2a personality hellos, which inject `bonds` per level;
  - **2190**, the personality checks (`bonds: {}`).

  Re-grep at build time: the list is a floor, not the scope.
  - Add a card test hook: `el._mineFor(s, mine)` and `el._houseFor(s, house)` set
    `s.mine` and `s.house` and redraw. **`_mineFor` drives the P2a bond-level hellos**
    (1997): left on `bonds`, those checks would pass vacuously or fail.
  - Moments are passed to `el._moment(s, m)` without `user`.
- **Shared screens' arrival line** (card-check 398, rewritten, not deleted; audit #11).
  On a shared screen, `el._moment(s, {type: "someone_home", at})` queues exactly
  "someone's home!! ♥". On a personal screen it queues nothing. A private `friend_home`
  on the arriver's own card queues "you're home!!" and no "someone's home".
- **The recap keeps TV and music** (audit #4). With public moments holding a `tv_on` and a
  `music_on` since the last look, `_awayNote` says "while you were out, I watched TV and
  listened to music!".
- **An options save keeps the bond** (audit #2). Open the card (bond row "you two"
  showing), save the pet's options over the websocket, and wait: "you two" is back
  within 5 s, with no page reload.
- **An HA restart keeps the bond** (audit #2's unverified variant). With the card open,
  restart the dev HA. Once it is back, "you two" returns within 90 s with no page reload
  (the retry's 60 s step plus start-up). If home-assistant-js-websocket's own
  resubscribe on reconnect gets `unknown_command` and drops the subscription, this
  check is what finds it; the card's retry must cover it.
- **D1: personality** (P1). A child with a stubbed `personality` shows no "personality"
  status row and no personality on the current generation's journal line. A teen shows
  both.
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
  - Load **the last card before the channel**, P2's tag (`git show v0.35.0b5:…/hatch-pet-card.js`),
    served with `page.route`, against P3b's dev server, and again against P3c's (audit
    #12).
  - Assert there are no console errors and no "undefined" in the bubble or status across
    a TV moment (with its `tv_on`), a music moment, a media dream, an aimed wish, and a
    `someone_home` on a shared screen.
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
    `inject` as today; from P3a: `_mineFor`).
  - Make the pet say a named line with `_speak`, "hi, sunbeam!", with a long `ms`. Assert
    that the bubble and `s.live` contain "sunbeam".
  - Also leave a second slide with its status rendered personally ("you two"), and its
    bond hearts showing.
  - Open the status and press "shared screen", while the line is **still typing** and
    again once it has finished.
    - "Still typing" is staged with babble **off** (audit #19): babble needs audio in
      headless Chromium, which isn't reliable. The typing job runs either way. Run it with
      babble on too when the host's Chromium has audio, and record which ran.
  - Then, for every slide, assert that neither `bubble.textContent` nor
    `live.textContent` contains "sunbeam" or `USER.name`.
  - Also assert:
    - `s.typing` and `s.babbling` are null;
    - there are no `.bondhearts`;
    - no status contains "you two", "my day" or "notify me";
    - the bubble after the next tick is the idle line.
  - Close the status: the same assertions hold.
  - **Two cards, two tabs** (audit #10). Repeat with a second hatch card on the same
    dashboard and a second tab (same context, so the same `localStorage`). Press "shared
    screen" on the first card only. Within a second, the second card and the second tab
    meet the same assertions, and their subscriptions were resent with `shared: true`
    (wrap `subscribeMessage`).
- **FB: "forget my data".**
  - The row is absent on a shared screen.
  - One tap shows "sure? tap again" and sends nothing (wrap `callWS`).
  - The second tap sends `virtual_pet/forget_me`. After it:
    - the birthday rows are gone;
    - "baby talk" and "my day" show off;
    - `localStorage` has no `hatch-welcomed-<id>` and no `hatch-greet-<id>-*`.
  - Then do a real visit after a fast-forward hour: `birthday_kept` is false.

## Phases and PRs

All of it goes in the 0.35.0 beta series, from **0.35.0b4** (owner, 2026-10-28; audit #12:
b3 is already tagged and released). Each PR bumps `const.py` and `manifest.json` together
(a test checks they match), as its last commit.

P3 is split in three (owner, 2026-10-28, "or the audit's split"; audit #13). This plan
uses the audit's split, in which **each PR carries its own tests and docs**, rather than a
separate tests-and-docs PR: that would ship P3b's removals untested for a release.

| PR | Version | Contents | Why this order |
|---|---|---|---|
| **P1: F5 + F6 + FA + D1** | 0.35.0b4 | `from_dict` hardening and the helpers, the salvage path, the `new_pet` marker, `DamagedSave` handling with the repair issue and timestamped backup, the first-tick wrap, the `People` sanitiser and its load wrap, the observer and `_dropSlide`, `_goShared` with the cross-card broadcast, the personality gate (D1). Tests 8, plus the F6, FA (two cards, two tabs) and D1 card checks. | Independent of the channel, and the lowest risk. It makes the later moment and storage tests stand on a loader that can't crash. |
| **P2: F3 + FB** | 0.35.0b5 | `_welcome` recipients, the `notify.py` docstring, `People.forget`, the `virtual_pet/forget_me` command, the card's "forget my data" row, and the guide (welcome, what the pets remember, the people store with no pets left). Tests 7, 10 and 11, plus the FB card check. | Small. FB's row joins the status screen's person rows and is independent of the channel. It can ride with P1 if the reviewer prefers; then P1+P2 is b4, every later version moves down one, and the old-card check uses b4. |
| **P3a: the channel** | 0.35.0b6 | `virtual_pet/subscribe`, `virtual_pet/notify_me` and `virtual_pet/my_day`; the watcher registry in `hass.data`, `_private` and `_house`, **filled by a dual write in `_fire`** (D–G and the titled media event also go to the channel; the public path stays); the coordinator-listener push; the reload snapshot and `gone`; the card reading **only** the channel (`s.mine`, `s.house`), with retry and dedupe, `_wishLine` and the bell on `mine`, and the card's own handling of D–G only from private moments (it ignores them in public `moments`, which the server still fills). The old attributes and events are still published, but no card reads them, so nothing visible changes. Tests 1–3, plus the second-login, reload and restart card checks. | Additive. It can sit on a wall tablet for a day before P3b removes the old path. |
| **P3b: the removals** | 0.35.0b7 | `sensor.py` drops `bonds`, `notify_users`, `wish.for`/`for_name`; the `_fire` split, `PERSONAL_EVENTS`, the copying scrub; `someone_home`; `model.pick_wish`; the stub migration in `card-check.js`; the rewrites of the tests that asserted the leak. Docs: `guide.md` (bonds, events, Recorder, phone messages in history) and **HANDOFF's bonds paragraph** (`HANDOFF.md:238-268`; audit #16). The release note. Tests 4–6, plus the shared-screen aimed-wish, arrival and old-card checks. | Where automations break, so the release note heads this version. |
| **P3c: F2 titles** | 0.35.0b8 | `watching`/`listening` off public `moments` and off the bus's `title`/`artist`, `tv_on`/`music_on` for the recap, `house.media` carrying the title, `dream` without `title` (`dream_on_waking` too), the debug-sensor redaction. Test 9 and test 4–6's title cases, plus the media-moment, recap and old-card (again) checks. The release note gains its titles paragraph. | Its own surface (media), reviewable alone. |

Each PR runs `scripts/test` and `scripts/card-check`. The P3 PRs are the tier-2 builds.

## Release note (draft, for P3b's version; P3c adds its titles paragraph)

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
>   `artist`. Read your media player for those. *(P3c's paragraph.)*
>
> **Phone messages are still personal.** A notification to your phone can still call you
> by your nickname, and Home Assistant keeps every message it sends in its history, as it
> does for any integration.
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
> - A damaged save file no longer stops a pet loading: its name, family, journal,
>   memories and bonds are kept when they can be read, the file is backed up, and a note
>   under Settings → Repairs says how to restore it. A damaged pet is never welcomed as a
>   new one.
> - A child's personality no longer shows before it has settled (it settles in the teens).
> - Turning on "shared screen" now clears anything personal the pet was saying at that
>   moment, on every hatch card in that browser.
> - New: `virtual_pet_someone_home` fires when anyone signed in comes home, with no name.
>   A shared screen says "someone's home!! ♥" for it, whoever it is.
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
| Repair issue `save_damaged`, description, **salvaged** | (new) | "Part of {pet}'s save file couldn't be read. {pet} kept its name, family, journal, memories and bonds where they could be read, and started the rest fresh. The file as it was is kept as `.storage/{backup}`. To go back to it: stop Home Assistant, fix the file, rename it to `.storage/virtual_pet.{entry_id}`, and start Home Assistant again." |
| Repair issue `save_damaged`, description, **fresh egg** | (new) | "{pet}'s save file couldn't be read at all, so {pet} started again as an egg. The file as it was is kept as `.storage/{backup}` (Home Assistant names an unreadable file `….corrupt.<time>`). To go back to it: stop Home Assistant, fix the file, rename it to `.storage/virtual_pet.{entry_id}`, and start Home Assistant again." |
| Repair issue `people_damaged`, title | (new) | "The pets' memories of people were damaged" |
| Repair issue `people_damaged`, description | (new) | "The file where the pets keep what they know about each person (birthdays, answers, settings) couldn't be read, so they start fresh with everyone. Your pets and your bonds with them are fine. The file as it was is kept as `.storage/{backup}`. To go back to it: stop Home Assistant, fix the file, rename it to `.storage/virtual_pet.people`, and start Home Assistant again." |
| Card, shared screen, anyone arriving (`someone_home`) | "someone's home!! ♥" (close friends only, from `friend_home`) | "someone's home!! ♥", for anyone signed in, any bond (the same line, a new trigger) |
| `guide.md` 553-557 (welcome) | "…It goes to every phone with the Home Assistant app, whether or not anyone tapped "notify me", and to the notifications in the sidebar…" | "**A welcome for every new pet.** Adding a pet puts a note in the sidebar's notifications: "Pip, a new virtual pet, just moved in! Say hi ♥". It also goes to the phones of anyone who has "notify me" on for another pet in the house. A new generation laid as an egg isn't a new pet, and restarts never welcome again." |
| `notify.py:5` docstring | "The one exception is the welcome when a pet is added, which goes to every phone." | "The welcome when a pet is added goes to the sidebar, and to the phones of people who get another pet's notifications." |
| `guide.md` 122-125 (bonds) | "…cheers when you come home ("Sam's home!!", and "welcome home!" when you next look in…) …some days its wish is for you ("I hope Sam plays a game with me today!"; anyone can still grant it)." | "…cheers when you come home ("you're home!!", on your own card; this needs your person entity linked to your login), and some days its wish is for you ("will you play a game with me today?", on your card; everyone else sees the plain wish, and anyone can still grant it)." |
| `guide.md` 629-650 (events) | the list with `user`, `title`, `artist` and `for` | Drop the five personal events, and `title`, `artist` and `for`. Add: "Nothing about a person, nor what's playing, is ever on an event or a sensor: each person's card gets its own over a private websocket subscription." |
| `guide.md` Recorder (684-695) | "Long attributes … are already kept out of the history database." | Add: "Its events are recorded like any other; none carries a person or a title. To keep them out of history altogether: `recorder: exclude: event_types: [virtual_pet_care, …]`. **Phone messages are kept in history.** Home Assistant records every message it sends to a phone, as a `call_service` event with the message text, for every integration. A pet's message to your phone can call you by your nickname, or say it's your birthday, so that text is in the history database, where an admin can read it. Recording can be turned off for all of them (`recorder: exclude: event_types: [call_service]`), but that hides every integration's service history." |
| `guide.md` `### Privacy` (FB), the people store with no pets | (new) | "With no pets left there's no card, so no "forget my data" button. An admin can delete `.storage/virtual_pet.people` then, with Home Assistant stopped." |
| `guide.md` 111 (recap) | "while you were out, I watched TV…" | Unchanged. It keeps working (audit #4). |
| `guide.md` arrival line | (part of the bonds paragraph) | Add: "A shared screen says "someone's home!! ♥" when anyone signed in comes home, without saying who." |
| Card status row "personality" | shown whenever the sensor has one | Shown for a teen or an adult only (D1); no new words |
| Card status row, label (FB) | (new) | "my data" |
| Card status row, button (FB) | (new) | "forget" (armed: "sure? tap again") |
| Card status row, `aria-label` (FB) | (new) | "forget my data: your birthday, answers and settings for every pet; your bonds stay" |
| Card status message, done (FB) | (new) | "Forgotten. The pets start fresh with you ♥" |
| Card status message, failed (FB) | (existing) | "That didn't work. Try again." |
| `guide.md` `### Privacy` (FB), after the table | (new) | "**What the pets remember about you.** Your birthday, your answers to its questions, your alarm times, the last zone you came back from, and your "baby talk", "my day" and "birthday on my phone" switches are kept for you alone, for every pet. They stay when you remove a pet, even the last one, so they're there if you set it up again. **"forget my data"** on the status screen (not on a shared screen) erases all of that, for you only, at once. Your bond with each pet, its photos and its nickname for you stay. So does whether you get notifications: turn "notify me" off for that. The pets start fresh with you, and they note again when you next come home. To erase everyone's, an admin can stop Home Assistant and delete `.storage/virtual_pet.people`." |
| `guide.md` 539-540 (birthday) | ""forget my birthday" on the status screen forgets it and stops asking." | "…forgets it and stops asking; "forget my data" forgets everything the pets remember about you (see Privacy)." |
| Card (removed) | "Sam's home!!" / "ooh, Sam is back!" on others' personal cards | (no line; Q3). Shared screens keep "someone's home!! ♥", from `someone_home` |
| Card (removed) | `WISHES_FOR[k][0]`, e.g. "I hope Sam plays a game with me today!" | (no line: the plain `WISHES[k][0]`) |

No new pet lines. The aimed wish's "to you" lines (`WISHES_FOR[k][1]`) and every
bond-moment line are unchanged.

## Decided (2026-10-28) and still open

The owner answered draft 1's questions and the audit's on 2026-10-28. Draft 1's questions
are kept by number. **The owner's numbers for the last two differ from draft 1's**, so
each answer is matched by what it says. The mapping is in the table at the end; check it
if an answer looks misplaced.

1. **F2: opt-in or drop? Decided: drop, no opt-in.** Titles reach the card over the
   subscription, automations read the media player, and the debug sensor always redacts
   `PRIVATE_READINGS`.
2. **Titles on a shared screen. Decided: keep**, through the house channel. It is the TV
   in the room, not a person.
3. **"Sam's home!!" on other people's personal cards. Decided: drop.** Only the friend's
   own card says "you're home!!".
   - **Shared screens keep a nameless "someone's home!! ♥"** for any signed-in person's
     arrival, whatever the bond (owner, audit #11). It is the new `someone_home` moment,
     which is tied to no bond, so it says nothing about who is a close friend.
   - Other people's **personal** cards say nothing for an arrival. The owner's answer
     names shared screens only; this plan reads it that way.
4. **The care log's `by`. Decided: keep it**, as the one documented household-shared
   trace. The guide says so in one sentence.
5. **Who gets the welcome on their phone. Decided: the union of `notify_users` over the
   house's other pets.** The first pet welcomes in the sidebar only.
6. **Version. Decided: 0.35.0b4 onward** (audit #12). P1 b4, P2 b5, P3a b6, P3b b7, P3c
   b8. See Phases.
7. **Existing `wish.for_name` in saves. Decided: leave it.**
8. **Should `virtual_pet/subscribe` refuse a user with no person entity? Decided: no.**
9. **F5: what happens when validation itself fails? Decided: salvage** (audit #5, #8). See
   F5. The pet always loads and is never welcomed as new, and the first tick can't wedge
   setup.
10. **FB: should "forget my data" also clear the bonds? Decided: no.** It erases the people
    store record only. The label and the guide say the bonds stay.
11. **FB: presence is kept with "my day" off. Still open.** The owner's answers have no
    answer for this one (their Q11 is the placement, draft 1's Q12).
    - `person_moved` (`coordinator.py:438-463`) stores `zone` for every linked person. Its
      use in the visit's notes is behind "my day" (`_notes` 1272-1275). `_came_home`
      (1164-1170) also reads it, to choose a question.
    - **Recommendation: store `zone` only while "my day" is on,** as a small change in P2.
      `arrived` and `left` are timestamps that the welcome home and the send-off need, and
      they stay.
    - Say no to leave it as it is: the guide paragraph already discloses it.
    - The build of P1 doesn't wait on it. P2's builder asks if it is still open then.
12. **FB: placement. Decided: the "forget my data" row goes last among the person's own
    rows** (after "baby talk"), with the two-tap arm. (The owner's Q11.)

**From the audit's own questions:**

- **OQ1, nicknames in recorded phone messages (#1). Decided: keep the nickname,** and the
  guide discloses that phone messages are kept in HA history. Not the audit's
  recommendation (b, drop the nickname); the owner chose (a).
- **OQ2, no "forget my data" once the last pet is gone. Decided: accept.** The guide notes
  that an admin can delete the people store once no pets remain. (The owner's Q12.)
- **OQ3, Q9 against the owner rule (#8). Decided: salvage** (Q9 above).
- **OQ4, shared screens' "someone's home!! ♥" (#11). Decided: keep**, nameless, any
  arrival (Q3 above).
- **OQ5, "my day" as a websocket command (#9). Decided: yes.**
- **OQ6, versions and the PR split (#12, #13). Decided: b4 onward, P3 in three** (the
  audit's split; see Phases).

**Added by the owner:** P1 hides the personality unless the life stage is teen or adult
(functional check D1). See D1.

## The audit of draft 1 (20 findings) and what changed

This table wins where it differs from the sections above. Every finding was checked
against `origin/main` at `0821baf` (and Home Assistant 2026.10.4's source in the main
checkout's `.venv`) before it was folded in. **All 20 held; none is rejected.** Small
corrections are noted in their rows.

| # | Finding | Change |
| --- | --- | --- |
| 1 | Phone notifications put nicknames into the recorder: `notify.send` is a service call (`notify.py:245-250`), HA records `call_service` with its `service_data` (`core.py:2945-2949`), and `_notify` personalises the text (`to_friend`, 159-164). Birthday mornings and send-offs too. Verified | **Owner: keep the nickname.** Inventory row N and a ground-rule bullet. The guide's Recorder section discloses that phone messages are kept in history and names `call_service` (copy table). Test 6 asserts the nickname is only in `notify` `call_service` rows. The release note says so |
| 2 | Subscriptions die on entry reload (`OptionsFlowWithReload`, `config_flow.py:228`; world egg `async_schedule_reload`, `coordinator.py:1753`; `async_unload_entry` pops the pet, `__init__.py:427-430`), and the card never retries. Verified; the HA-restart variant is still unverified | The watcher registry lives in `hass.data[DOMAIN]["watchers"]` by entry ID; `async_setup_entry` sends a fresh snapshot; `async_remove_entry` sends `gone`. The card retries `no_pet`/`unknown_command` at 2, 5, 15 s, then every 60 s. Test 3 reload cases; card checks for an options save and **an HA restart** (the unverified variant becomes a builder check) |
| 3 | The push hook in `_publish()` misses the tick (`_async_update_data`, `coordinator.py:359-367`: the daily wish and the morning dream) and `async_set_updated_data`. Verified | Push from a coordinator listener (`async_add_listener`). Test 3: a morning tick pushes the aimed wish to A only, and the dream to both |
| 4 | The recap "while you were out, I watched TV / listened to music" (`_awayNote`, card:2566-2587) loses its bits when media leaves public moments. Verified | **Changed shape from the audit's proposal:** the public list keeps a title-less record under new types `tv_on` / `music_on`, not title-less `watching` / `listening`. An old card's `case "watching"` speaks `short(m.title)` unguarded (card:2914-2918), so title-less `watching` would make a stale tablet say "ooh, undefined!". `MOMENT_BITS` gains the two types. Card check for the recap |
| 5 | Invalid JSON, `data: null` and `{}` return `None` from `Store` and become a new egg that is **welcomed** (`coordinator.py:325-332`); a wrapper missing `data` raises `KeyError` in `Store`; a raise in the people store's load (domain `async_setup`, `__init__.py:123-125`) stops every pet. Verified (`helpers/storage.py:367-436`) | **A marker, inverted:** the config flow sets `new_pet: true` on a new entry, removed after the first save. Empty store without it: an egg, no welcome, `save_damaged`. Inverted because no entry has a marker today, so a "set at first save" marker would miss an existing pet damaged before its first load on b4. Both `store.async_load()` calls are wrapped; a damaged people wrapper starts empty with `people_damaged`. Undecodable JSON is kept apart from salvage: HA's `.corrupt.<time>` file is the backup. Test 8's `None` shapes and two-pet people case. P1 adds `new_pet: True` to the 24 test `MockConfigEntry`s that make a fresh pet |
| 6 | A fresh egg on a non-object root is a real loss, the repair has no restore steps, and a second incident overwrites the `.damaged` key. Verified | Backups are `….damaged.<timestamp>`; the repair gives restore steps (copy table, two wordings); a one-dict list root is unwrapped. Owner's salvage (#8) keeps the rest |
| 7 | The sanitiser's field lists omit live keys (bond `photos`, `catchphrase`, `today`, `visited`; person `alarms`, `likes`, `likes_asked`, `asked`, `once_last`, `sendoffs`, `birthday_sent`, `birthday_skipped`, `left`), and a catalog check on species would wipe the new creatures on a downgrade. Verified (`model.py:216`, 1614, 1666-1673; `coordinator.py:1416-1445`) | The rule: keep unknown keys, type-check or drop known ones, never whitelist. Both key lists are written out with types, read from their readers (correction: `asked` and `likes_asked` are dicts of day lists, `once_last` a day string, `alarms` a list of pairs, `sendoffs` a list of days). `species` and `raised` get a `str` check only. Test cases for photos plus a junk catchphrase, an unknown species, unknown keys |
| 8 | Q9's recommendation (fail setup on a non-`DamagedSave` exception) contradicts "damaged saves never stop a pet loading", and a raising first tick makes HA retry setup forever. Verified | **Owner: salvage.** Back up, keep name, generation, species, raised, journal, memories and bonds (photos included), default the rest, raise the repair. The first tick is wrapped: it logs, raises the repair and returns the loaded state, so the first refresh can't raise `ConfigEntryNotReady` |
| 9 | `my_day` is a recorded `call_service` with `context_user_id`, like `notify_me` (card:3309). Verified | **Owner: yes.** `virtual_pet/my_day` websocket command with the `unknown_command` fallback; inventory row O; test 4 asserts no `call_service` |
| 10 | The shared-screen switch reaches only the card that was tapped; other cards and tabs keep personal lines (`sharedScreen()` is per browser, card:180-185; no `storage` listener). Verified | A `hatch-shared-changed` window event for the same page and a `storage` listener for other tabs; every instance runs `_goShared` and resubscribes. Two-card, two-tab FA card check |
| 11 | Q3's drop also silences shared screens' "someone's home!! ♥" (card:3013, not 3012), which `card-check.js:398` asserts. Verified | **Owner: keep it, nameless, for any signed-in person's arrival, whatever the bond.** A new public `someone_home` moment from `person_moved`, debounced on one shared timer, on shared screens only. Check 398 is rewritten to it |
| 12 | The versions are stale: b3 is tagged and released (`const.py:8`). The old-card check should use the tag just before the channel. Verified (`git tag`: v0.35.0b1-b3; `manifest.json` 0.35.0b3) | **Owner: 0.35.0b4 onward.** P1 b4, P2 b5, P3a b6, P3b b7, P3c b8; `const.py` and `manifest.json` together; the old-card check serves P2's tag (b5) against P3b and P3c |
| 13 | P3 is too big for one PR, and "a split ships a card that half-reads the old attributes" is false for an additive split. Verified | **Owner: split** ("P3a/P3b/P3c or the audit's split"). The audit's split, each PR with its own tests and docs: P3a the channel and commands (card reads only the channel), P3b the removals and scrub, P3c titles. Not a separate tests-and-docs PR, which would ship P3b untested for a release |
| 14 | The card-check stub list is stale and incomplete; 1858, 1997 and 2190 are missing. Verified (a grep at `0821baf`, and 1605-1616 and 1855-1860 read) | The list is replaced with the current lines, named as a floor; 1858, 1997 and 2190 called out; `_mineFor` drives the P2a hellos |
| 15 | The test-rewrite list misses `test_init.py:695/715`, 1746, 1911, 1985, 2017 and 2900. Verified | All listed; the photos test keeps its intent as "not in any state"; `"title"` added to the grep |
| 16 | The doc list misses HANDOFF's bonds paragraph (`HANDOFF.md:238-268`). Verified | Added to P3b's docs |
| 17 | The scrub must copy, not mutate: `_check_ins` reads `e["title"]` after the fire loop (`coordinator.py:903-904`). Verified | One sentence in the design; test 4: a TV moment still seeds a dream |
| 18 | The snapshot replays `house.media` on every resubscribe, and pushed moments lose the server-clock recency check (card:2068-2088). Verified: `recent()` compares `at` with `sensor.last_care`'s `last_updated`, which a pushed moment doesn't have | The card dedupes `house.media` by `at` (`s.mediaSeen`); the snapshot carries the server's `now` |
| 19 | Vague acceptance criteria: `bond_up` fires only on a level-up; test 11's staging; FA's typing case depends on audio. Verified (`model.add_bond` 1679) | Test 3 seeds points one short of a level; test 11 is staged with an `asyncio.Event`; the FA typing case runs with babble off, and on too when audio works |
| 20 | "forget my data" leaves `hatch-greet-<user>-<device>` (card:2607). Verified | Cleared too, by prefix; the FB card check asserts it |

### The owner's other answers (2026-10-28), folded in

| Owner's question | This plan's | Change |
| --- | --- | --- |
| Q1 drop titles, no opt-in | Q1 | Recorded as decided |
| Q2 titles stay on shared screens via the house channel | Q2 | Recorded as decided |
| Q3 drop "<name>'s home!!" on other people's personal cards | Q3 | Recorded as decided; the shared-screen line stays (#11) |
| Q4 keep the care log's by-names, documented | Q4 | Recorded as decided |
| Q5 welcome phones = union of other pets' notify-me lists, first pet sidebar only | Q5 | Recorded as decided |
| Q6 / audit #12 versions 0.35.0b4 onward | Q6 | Phases table |
| Q7 leave old `for_name` | Q7 | Recorded as decided |
| Q8 no person entity required | Q8 | Recorded as decided |
| Q9 salvage | Q9 | F5 rewritten |
| Q10 forget-my-data doesn't clear bonds | Q10 | Recorded as decided |
| Q11 forget row last among own rows, two-tap | **Q12** (placement) | Recorded as decided |
| Q12 accept; the guide notes an admin can delete the people store once no pets remain | **audit OQ2** | A guide sentence (FB, copy table) |
| (no answer) | **Q11** (`zone` only with "my day" on) | **Still open**, with its recommendation; P2's builder asks |
| D1 personality hidden before teen | new section D1 | P1: card:3193 and card:3434 (not 3455, the shared renderer for past generations) |

**Copy approved (owner, 2026-10-28):** the copy table above as written.
