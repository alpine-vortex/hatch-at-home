# hatch-at-home to-do

Current as of 2026-11-07 against `origin/main` (v0.48.0 + director slices 6-9).
Plans in `docs/plan-*.md` explain why; this file is the one list of what is left.
Format: `~/dotfiles/claude/docs/todos.md`.

## Open

### Now: the director migration (the active build)

- [ ] Director slice 10: games (R22-R24) — `docs/plan-2026-11-06-director-migration.md`
- [ ] Director slice 11: visitors, reveal, swipe grace (R14, R85-R87) — med-high risk
- [ ] Director slice 12: the infrared link (R29-R33) — high risk
- [ ] Director slice 13: channel waits, memory page, confirm (R8, R9, R38, R39, R56) — high risk
- [ ] Director slice 14: close-out, final allowlist, `_forget` becomes one drain, docs

### Features with a plan, partly built

- [ ] Hop of the Day ships 4b and 5 — `docs/plan-2026-11-02-hop-of-the-day.md` (check against 0.48.0 first)
- [ ] Device charm: the wave pose (Q6): `acts.wave` plus one `STAGE_POSES` hook; its art is fifth in the Luna queue
- [ ] Device charm Part 4: per-pet shell picker (needs the settings gear) and earned-by-stage shells
- [ ] Memory M3b stickers — `docs/plan-2026-11-02-memory.md` (confirm M3a/M3b state; 0.48.0 notes say "memory M3")
- [ ] Spring and summer seasonal sets (8) — plan due in Feb [waiting]

### Art

- [ ] Wire the drafted art: effects pack (35 x 4), world visitor studies (24 x 4), seasonal/props/conservation/item sheets — inventory in `docs/art-wiring-status.md` once the art agent lands it
- [ ] Art reviews plan phases 1-3 — `docs/plan-2026-10-28-art-reviews.md` (its status says "plan only"; check what already landed)

### Dev and housekeeping

- [ ] Dev utility: restore or reset a test pet (dev pets drift after many `card-check` runs)
- [ ] Reconcile docs: `docs/HANDOFF.md` says 0.40.0, the `docs/guide.md` Roadmap stops at 0.2x, and the device-charm plan body still carries stale line numbers (its review: `docs/review-device-charm.md`)

### Needs the owner

- [ ] Tuning review of rates: send each pet's diagnostics download (was due about 2026-11-03) [owner]
- [ ] Try Assist (LLM agent and the sentences file) and report what it says [owner]
- [ ] Phone test: notification buttons, and Pass 1 press feel [owner]

### Parked

- [ ] Links between separate cards (device charm Q5) [someday]
- [ ] Forms book Wave 4 PRs 4a, 4b, 4d, 4f, 4g (deferred by owner 2026-10-30) [someday]
- [ ] Device-alive slice 7 (FM14) [someday]

## Done

- [x] Device charm Parts 1-3: LCD grid, ghosting, backlight, infrared link, boot screen (0.36.0)
- [x] Visitors v1 and v2, care reactions A-E, species nature N1-N4, favourite and resting R1-R3, sitter visits S1-S4, shell modes, card split (all on main by 2026-11-06)
- [x] Director migration slices 0-9 (2026-11-06/07)
- [x] Re-enable Virtual Pet in HA after the 2026-11-05 slow-app scare — cause was Tailscale (2026-11-05)
