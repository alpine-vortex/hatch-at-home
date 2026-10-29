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

- Never use port 8123, or another worker's port. Copy `dev/config` to a scratch
  dir. Start HA once, stop it, then set `data.stable.server_port` and
  `data.pending = null` in `<config>/.storage/http` and start it again. The yaml
  `http:` port alone reverts to 8123 after 5 minutes.
- Use a fresh `.storage` for a full run, because long-lived dev pets drift.
- Playwright resolves with `NODE_PATH=/home/poe/github/relink/node_modules`.
- The venv is the main checkout's `.venv`. Symlink it into a worktree, and never
  commit the link.
