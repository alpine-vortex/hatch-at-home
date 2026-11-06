# Dev fixtures

`dev/config` is the throwaway Home Assistant (`scripts/develop`, `scripts/gate`).
Its stand-in entities (`fake_*`) are in `configuration.yaml`.

## Device pass: a scratch HA reachable from ReDroid

Recipe used by the Pass G runs. Nothing here is committed state; keep it in a scratch dir.

1. Copy `dev/config` to a scratch dir. Start HA once, stop it, then set
   `data.stable.server_port` to a free port (never 8123, never another worker's) and
   `data.pending = null` in `<scratch>/.storage/http`. Start it with
   `.venv/bin/hass --config <scratch>`; it listens on all interfaces.
2. Open it at `http://<this machine's LAN IP>:<port>` from the ReDroid VM (not `localhost`,
   which is the VM itself). Onboard (`scripts/card-check` does this: user `dev`,
   password `devdevdev`), create a pet, and map its options (weather, room light,
   fireplace, TV, music, heating, cooling) to the fakes through the options flow.
3. Drive it in the WebView shell (`org.chromium.webview_shell`; the image has no Chrome).
4. Read the DOM over a raw CDP socket:
   `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`
   (pid from `adb shell cat /proc/net/unix | grep webview_devtools`), then
   `http://localhost:9222/json`.
5. ReDroid has system animations off, so the WebView reports reduced motion. For looks
   set `adb shell settings put global animator_duration_scale 1`, relaunch the WebView,
   and put it back to 0 afterwards.
6. Two traps. `adb shell am start` with no URL opens `about:blank`, and CDP then reads a
   hidden stale page that looks frozen: always launch with the URL, and check
   `document.visibilityState == "visible"` before you trust a log. Local port 9222 may be held
   by another session's adb: pick a free one (`adb forward tcp:9422 ...`) and leave theirs.

## Dev seed: two pets in a known state

`scripts/dev-seed` builds the scratch HA of "Device pass" for you (run it with the main
checkout's venv python, which has aiohttp: `.venv/bin/python scripts/dev-seed --keep`).
It copies `dev/config`, picks a free port in 8400-8499 (never 8123), onboards `dev` /
`devdevdev` and drives the real flows. `--dir` names a fresh scratch dir, `--keep` leaves
HA up on the printed port (otherwise it stops after printing the proof).

State it leaves:

- Two pets: Pip (woodland, baby) and Mew (hearth, fast-forwarded to teen so the dark finish unlocks;
  its hunger is 0, feed it first if the pass needs it).
- Both pets' options map to the fakes: weather, rain, room light, fireplace, TV, music, heating,
  cooling, motion (`binary_sensor.fake_motion_sensor`, held by the `bedtime` options topic). Bedtime starts 6 h from the run and wakes 14 h later, so Pip is awake for about 6 h.
- Pip's hunger is 77 (under 95). Finishes: Pip `dune` (light), Mew `smoke` (dark).
- Memory is on for the `dev` user, with four tagged days (exam, match, trip, show), a game
  and a dream pick, and a "great" day; Pip has today's Hop of the Day pinned (not played).

The memory entries are the one hand-written part: the pet takes a big-day answer only after it
asked, and it asks on Sundays and Mondays, so no API can plant them on other days. The script
stops HA, adds the entries to `.storage/virtual_pet.people` through the integration's own
validator (`people._memory_entry_ok`), and starts HA again.

## Wall tablet (shared screen)

The dashboard's second view, `Wall tablet` (`/pet-bench/wall`; the old `dashboard-pet-bench` slug 404s), is a panel view
with the card alone. "Shared screen" is not a card config key. It is a per-browser switch,
`localStorage["hatch-shared-screen"] = "on"` (`src/card/prefs.js:373`, `sharedScreen()` at
`:382`). Turn it on with the shared-screen bell on the status page
(`src/card/card-status.js:408`), or over CDP:
`localStorage.setItem("hatch-shared-screen","on")`, then reload. For the tablet size:
`adb shell wm size 1280x800` and `adb shell wm density 160`. Size alone gives a 488 px
phone-like viewport at density 420; with both it is 1280 px wide. Reset both after
(`wm size reset`, `wm density reset`).

Before any pass, clear a stale `localStorage["hatch-shared-screen"]`. The WebView profile
keeps it between runs, and it hides the "things you told me" link on the status page.

## Guest clock (ReDroid `--clock` slot)

To move the device clock, run `adb root` first (the shell user cannot set it), then
`adb shell date MMDDhhmmYYYY.ss`. Only the guest clock moves; HA's host clock does not.
`adb root` restarts adbd and drops every `adb forward`, so forward the CDP port again.
Set the guest back to the host time when done.

## Rain echo helper

`scripts/echo-rain` flips `input_number.fake_rain_rate` through the REST API and prints the
time (needs `HA_URL` and a long-lived token in `HA_TOKEN` from the scratch HA's profile page).

    HA_URL=http://<lan-ip>:<port> HA_TOKEN=... scripts/echo-rain        # rain on
    HA_URL=... HA_TOKEN=... scripts/echo-rain off

Timing: the server refreshes about every 30 s, and the onset reaches the glass 0-10 s
after that, so a flip shows 5-30 s later. The echo window is 20 s. Have two pets, sit on
the first, flip, and swipe to the second slide within 20 s of the rain appearing on the
first; check it echoes once and does not replay. A second onset of the same kind inside
about 90 s plays nothing. Verified end to end on a device (Passes 2 and 3).

`fake_rain_rate` has `initial: 0`, so every HA restart comes up dry. Set it again after a
restart if the pass needs rain.
