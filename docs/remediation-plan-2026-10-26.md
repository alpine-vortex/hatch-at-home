# Remediation plan, 2026-10-26 (after 0.16.0, unreleased)

**Status:** phases 1–3 are done, shipped in 0.16.0 with the upbringing tuning
(cost per miss 10 → 6). The owner approved the plan as written.
- Two changes from the plan:
  - 2.8: the egg pops in with a sparkle; the adult doesn't fade out first,
    because the state has already swapped by the time the card hears of it.
  - 2.1: the miss counter doesn't flash.
- Phase 4: the request is going to Sol.
- Phase 5: done in 0.17.0 and 0.18.0, except translations, which the owner doesn't need.

Covers everything the interaction-feedback review found. That review ran against
commit `348143f`; the findings were rechecked by hand on `3982a11`. The plan also
covers new gaps from weight, the game and chores, and the open items left from
the integration review earlier that day (phase 5).

Phases 1–3 need no new art. Phase 4 is an art request for Sol. Phase 5 is the
general backlog.

## Key design decision: a "moments" feed

The card only sees entity state, never the bus events. Today it reacts only to the
newest care-log entry. So a care miss, a hatching, a stage change or a new trait
changes state silently.

**Proposal:** the coordinator keeps the last 10 notable events as `moments`
(type, time, a few fields, no names). It publishes them as an unrecorded
attribute on `sensor.<pet>_last_care`. The card reacts to each moment once,
when it's under 15 s old, the same way it reacts to care entries now.

Why this and not the alternative:
- The alternative is the card diffing state, e.g. "care_misses went up".
  That breaks across page reloads and other devices, and it can't tell a
  missed call from an answered one.
- The feed is one small, testable server change, and every card reaction
  below builds on it.

Moments: `care_miss`, `discipline_miss`, `hatched`, `stage_changed` (with
`upbringing` at adult), `trait_learned`, `trait_deepened`, `egg_laid`,
`call_answered` with `reason: fake`, `woke_up`, `fell_asleep` (when it
dozed off by itself), `chore_treat` and `game_finished`. A fast-forward adds
none.

## Phase 1: bugs (small)

| # | Problem | Fix | Check |
| --- | --- | --- | --- |
| 1.1 | The egg's crack frames never show: `age_days` is rounded to 0.1 day and stays 0.0 for the 30-minute egg (card `_petFrames`, sensor `age_days`). | Time it from `hatches_at`: wiggle in the last 10 minutes, crack in the last 2. | Playwright on a new egg; screenshot each frame set. |
| 1.2 | The egg's wiggle frames never show: an egg can't call. | Covered by 1.1. Drop the `calling` condition. | As 1.1. |
| 1.3 | After the pet dozes off by itself, the lights button still says "sleep", and waking takes two taps. The first tap only sets the switch. | The card labels the button from `binary_sensor.asleep`. A tap while asleep turns the switch off, which already wakes it (`set_lights_out`). | Model test for the off-while-dozing path. Playwright: one tap wakes. |

## Phase 2: give every meaningful moment feedback (no new art)

Builds on the moments feed. Each reaction is a bubble line, plus an existing
animation (`hop`, `perk`, `shake`, the `burst` ring, `pop`) or an existing
sprite. All motion honours `prefers-reduced-motion`; the bubble line stays
either way.

| # | Moment | What the card shows |
| --- | --- | --- |
| 2.1 | Care miss | Sad bubble ("…nobody came"), a short shake, and the miss counter on the status screen flashes. Before this, a miss looked exactly like an answered call. |
| 2.2 | Discipline miss (an ignored fake call) | "…fine, I'll stop." Also show `discipline_misses` on the status screen; no entity exposes it today. |
| 2.3 | Scold during a fake call (correct) | "ok… sorry" and a small shake. Before this it was silent, while scolding unfairly had a line. |
| 2.4 | Praise (ok) | "♥" bubble and a burst ring (no prop exists; see 3.1). |
| 2.5 | Hatching | Crack frames (1.1), then the baby pops in with `pop` and "hello!". |
| 2.6 | Stage change | Hop and "I'm a teen now!". At adult: "all grown up: devoted" (with the upbringing). |
| 2.7 | Trait learned or deepened | Burst ring and a line ("I love music now ★★"). Today traits only appear on the status screen. |
| 2.8 | Egg laid | The adult fades out on the existing opacity transition, "see you in the journal!", then the egg. Today the swap is silent, and a lay-egg press writes nothing to the care log. |
| 2.9 | Woke up at wake time | "good morning!" and a stretch (`perk`). |
| 2.10 | Weight out of band | Mood reason lines for `heavy` ("feeling a bit round…") and `light` ("could use a proper meal"). Today they only show on the status screen. |
| 2.11 | Waking it at night (costs happiness) | "…so sleepy" instead of a neutral line, so the cost is visible. |

**Tests:**
- Model tests that each event lands in `moments` exactly once and that fast-forward adds none.
- A Playwright script that triggers each moment through the dev HA (`fast_forward`, button presses, the stand-in entities). It waits 15 s after the page loads, because the frontend reloads itself once, then screenshots every reaction.

## Phase 3: use the art we already have (no new art)

| # | Gap | Fix |
| --- | --- | --- |
| 3.1 | No `scold`, `praise` or `fan` prop in any species. | The card falls back to the shared UI pixel icons (`icon_scold`, `icon_praise`) drawn as a prop. The fan gets a CSS "breeze": the sprite sways and three wind lines cross the scene. Real props are in phase 4. |
| 3.2 | Every species' own child poses are unused: bunny binky/flop/thump, kitten zoomies/knead/loaf, squirrel cheeks/cache/chatter, tree frog tongue/croak/lily_sit, bat echo/hang/wing_wrap, luna moth glow/wing_spread, otter rock/hold_paws/kelp_wrap, octopus ink/jar/colour_shift, axolotl float/gill_flutter/smile, gecko eye_lick/shed/tail_wiggle, bird birdwatch. | Add a `reactions` map to each `species.json`, e.g. `{"play": "zoomies", "snack": "cheeks", "won": "binky"}`. The card shows the pose for 2.5 s after an ok action, child stage only. Mapping per species is a taste call; I'll propose one and screenshot it. Extend `tests/test_species.py` so every mapped pose exists. |
| 3.3 | House poses (dance, TV, squint, shiver, sweat, mask) are child-only. | For baby, teen and adult: dancing → a looping hop; shivering → a gentle shake loop; others → bubble only (already there). Proper art is in phase 4. |
| 3.4 | No rain scene for axolotl, bat, gecko, luna moth, octopus, otter or tree frog. Rain shows the plain day scene. | A CSS rain overlay (diagonal streaks, darker tint) when a species has no `rain` background. Water worlds get ripples instead of streaks. |
| 3.5 | Gecko has only a day scene. | Already darkened by the card for night and sleep. No change; listed in phase 4. |
| 3.6 | An egg with no egg sprite shows a blank screen (edge case: legacy pets). | Fall back to the world's first egg-bearing species, which the card already does for new eggs. |
| 3.7 | Missing props or sprites fail silently. | One `console.warn` per missing sprite, so a broken `species.json` is visible in the browser console. |

## Phase 4: art request for Sol (one batch, through the owner)

Still open from the handoff, plus what the review found:
1. Adult sheets for axolotl, bat and luna moth (they fall back to teen today).
2. `fan`, `scold` and `praise` props: either one shared set or per world, Sol's choice. Shared is cheaper.
3. Rain scenes for the 7 species in 3.4, and night and dim scenes for the gecko.
4. Optional, and expensive: the six house poses for baby, teen and adult. Only if phase 3.3's stand-ins feel thin.
5. The deer and the tarantula re-run, already requested, with adults.

When the art lands, it replaces the phase 3 stand-ins through `species.json` alone. The card prefers real props and scenes when they exist.

## Phase 5: other open items from the integration review

| Item | Size | Note |
| --- | --- | --- |
| README: still says "phase 3" and "editable from phase 3"; a duplicate "Updating" section; the "This house" column; a missing comma | S | Docs only. |
| Mark `docs/audit-2026-10-26.md` as describing v0.3.x | S | One line. |
| Diagnostics download (`diagnostics.py`) | S | Same data as the debug sensor, redacted. |
| Repair issues: a mapped entity that no longer exists; a world with no ready species | M | Uses HA's `issue_registry`. |
| Actionable notifications ("Feed" from the phone), and clearing a call notification once it's answered | M | Uses `mobile_app` actions and a tag to clear. |
| A card editor (choose pets without YAML) | M | Uses the frontend's entity picker. |
| Reconfigure flow: change world; rename a new generation | M | A world change only applies to the next egg. |
| Translations of the card and notifications | L | Move card strings into a table first. |
| Energy at 0: collapse into a nap | S | Fits "never hurts". |
| Upbringing tuning: 3 misses with no scolding makes a scrappy pet | S | The owner's call; `UPBRINGING_MISS_COST` 10 → 6? |
| Card tests: game, reactions | M | Playwright scripts in `scripts/`, run by hand (CI has no HA frontend). |

## Order and releases

1. **Phase 1 and the moments feed:** one commit; tests and screenshots.
2. **Phase 2:** card reactions; screenshot every moment.
3. **Phase 3:** reactions maps, stand-ins, rain overlay.
4. **Release 0.16.0** with the gameplay work that's already pushed, once the owner says go.
5. **Phase 4** whenever Sol's batch arrives (0.17.x).
6. **Phase 5:** items as the owner prioritises them.

## Decisions for the owner

- The moments feed design (above).
- Whether the species pose mappings (3.2) need sign-off before shipping, or just a contact sheet afterwards.
- Whether to send Sol the phase 4 batch now (one batch is cheaper than several).
- The upbringing tuning in phase 5.
