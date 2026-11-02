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
`HA_URL`/`HA_CONFIG`/`HA_START` set, and cleanup. Arguments after `--` go to
card-check. Prefer it over a hand-built scratch HA. It prints card-check's seconds per
section, and a range that changes only Markdown and `docs/` since a gated tree skips HA
and card-check. To have commits refuse unformatted Python, run
`git config core.hooksPath scripts/hooks` once.

`scripts/ci-gate` runs the same checks on GitHub instead (push, the Validate workflow,
wait) and writes the same gate-passed marker on a pass. Prefer it for the batch gate:
it takes none of this machine's CPU, so workers aren't slowed while it runs.

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
Ship workers run `scripts/gate --auto`: `scripts/pick-sections` reads the diff against
origin/main (the card methods and constants it changes, the card-check lines it
edits, art) and runs just the sections that use them, printing why. Add a neighbour
with `scripts/gate -- --only <list>` when a section needs one. If it picks `all`
(server code), use `scripts/ci-gate`. A partial run writes no gate marker. The full
gate is the first mate's, once per merged batch, through `scripts/ci-gate`; CI runs
card-check as four parallel shards (`--shard k/4`), about 5-6 min. Login, the dashboard, stubs and the pet-finding prelude always
run, and `restart` puts dev's seeded bond and wish back. Sections lean on state their
predecessors leave (the open sheet, the bond, the slide on show), so a lone section may
need its neighbour in `--only`; `oldcard` pulls in `restart` by itself.

## Standing rules (moved from Claude memory 2026-11-02)

- **Commit author:** this is a public repo. Commit, cherry-pick and merge as
  `git -c user.name="Claude" -c user.email="noreply@anthropic.com" ...`, never
  under the local git username (the `-c` flags set the committer too).
- **Owner's Codex files:** the owner runs Codex in the main checkout and leaves
  uncommitted files there (box art, finishes, effect packs). Don't move, revert
  or commit them; mention them and act only when asked.
- **Image calls (Sol / Luna via `codex exec`):** run them through
  `~/github/hatch-art/tools/queue2.sh`, which paces to the image cap (about 100
  images per 5 h, well under 300 per day), one call at a time. Luna
  (`gpt-5.6-luna`) by default for poses and simple art, Sol for the misses.
  Run dirs and the call log stay in gitignored `private-content/art/`; never
  commit prompts, run logs or recipe detail. Recipe and lessons:
  `~/github/hatch-art/SOL.md` (local, not in git).
