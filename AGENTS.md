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

## The repo is public

Keep the owner's personal details out of it: real entity IDs, location, hostnames,
session and trigger IDs, people's names. Scan anything from an art session or the owner
for such details before committing it.

## Card-check gotchas

- The HA frontend reloads itself once, about 10 s after the first page load. Wait 15 s
  before driving the card.
- The card lives in HA's shadow DOM, so use Playwright locators, not `querySelector`.
- HA keeps its sign-in tokens in `localStorage`. Never clear all of it.
- To inject a state for a quick check, run `hass.callApi("POST", "states/<id>", …)` from
  the page. The integration overwrites it on its next update.
- Stopping a test HA: a `pkill -f`/`pgrep -f` pattern also matches the shell running it,
  and kills that shell (exit 144). Match `/proc/*/cmdline` from a small Python script.
- **Dev pets drift.** After many runs the dev pets in `dev/config` get sick and checks
  like idle life fail. Stop HA, then in `dev/config/.storage/virtual_pet.0*` set `sick`
  false, `recent_misses` [], `health` 100, `energy` 90, `hunger` 80, `weight` 50, `call`
  null, `latched` [], and start it again.

## Tests

`async_block_till_done(wait_background_tasks=True)` when background tasks matter
(chores). The shopping list writes into the shared testing config, so give such tests
their own `hass.config.config_dir`. `OptionsFlowWithReload` forbids update listeners.
Use `async_get_device_by_identifier`, not the deprecated `async_get_device`.

## Releases

Bump the version in `const.py`, `manifest.json` and `frontend/hatch-pet-card.js` (the
card URL's `?v=` busts the service-worker cache). Push, wait for Validate to go green,
then run the Release workflow (`release.yml`, ref `main`). A version like `0.26.0b1` is
published as a GitHub pre-release, which HACS offers only to people who turned on beta
versions. Run the workflow with a PR's branch as the ref to let the owner try unmerged
work.
