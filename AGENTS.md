# Notes for coding agents

## Screenshots: use the card bench, not Home Assistant

The default for any screenshot, render, contact sheet or visual review of the card
is the **card bench** (owner, 2026-10-29). It runs the real `hatch-pet-card.js`
with a fake `hass`, with no Home Assistant, and pins every state exactly:

    NODE_PATH=/home/poe/github/relink/node_modules node scripts/bench.js --preset shells
    # --preset species | ui, or one-off shots by flags or a JSON shot list

See `dev/bench/README.md`. A preset takes seconds. A throwaway HA takes minutes and
its dev pets drift.

Use a real HA (`scripts/develop`, `scripts/card-check`) only for **behaviour**: the
card-check gate, server calls, the private channel and privacy, restarts and
reloads, subscriptions, and anything the bench's README lists under Limits. If a
look needs a state the bench can't pin yet, add it to the bench rather than
falling back to HA.

## Running card-check on your own HA

`scripts/gate` does all of the below for you: lint and tests, then a throwaway HA
from `dev/config` with a fresh `.storage` on a free port (never 8123), card-check with
`HA_URL`/`HA_CONFIG`/`HA_START` set, the costume previews, and cleanup. Arguments after
`--` go to card-check. Prefer it over a hand-built scratch HA. To have commits refuse
unformatted Python, run `git config core.hooksPath scripts/hooks` once.

The manual route, if you need it:

- Never use port 8123, or another worker's port. Copy `dev/config` to a scratch
  dir. Start HA once, stop it, then set `data.stable.server_port` and
  `data.pending = null` in `<config>/.storage/http` and start it again. The yaml
  `http:` port alone reverts to 8123 after 5 minutes.
- Use a fresh `.storage` for a full run, because long-lived dev pets drift.
- With `HA_URL`, also set `HA_CONFIG=<scratch>` and
  `HA_START="exec <main>/.venv/bin/hass --config <scratch>"`. Card-check stops and
  restarts that HA to seed dev's bond and an aimed wish (section 8). Without them
  those checks FAIL. With no `HA_URL` they default to `dev/config` and
  `scripts/develop`.
- Playwright resolves with `NODE_PATH=/home/poe/github/relink/node_modules`.
- The venv is the main checkout's `.venv`. Symlink it into a worktree, and never
  commit the link.

## Partial card-check runs

`scripts/card-check.js --list` prints its section names; `--only a,b` runs just those.
Ship workers run `scripts/gate -- --only <the sections their slice touches>` (or
`card-check --only ...` on their own scratch HA, as above). A partial run skips the
costume previews and writes no gate marker. The full `scripts/gate` is the first mate's,
once per merged batch. Login, the dashboard, stubs and the pet-finding prelude always
run, and `restart` puts dev's seeded bond and wish back. Sections lean on state their
predecessors leave (the open sheet, the bond, the slide on show), so a lone section may
need its neighbour in `--only`; `oldcard` pulls in `restart` by itself.
