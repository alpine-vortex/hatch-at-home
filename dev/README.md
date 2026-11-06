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

## Wall tablet (shared screen)

The dashboard's second view, `Wall tablet` (`/dashboard-pet-bench/wall`), is a panel view
with the card alone. "Shared screen" is not a card config key. It is a per-browser switch,
`localStorage["hatch-shared-screen"] = "on"` (`src/card/prefs.js:373`, `sharedScreen()` at
`:382`). Turn it on with the shared-screen bell on the status page
(`src/card/card-status.js:408`), or over CDP:
`localStorage.setItem("hatch-shared-screen","on")`, then reload. For the tablet size:
`adb shell wm size 1280x800` (undo with `wm size reset`).

## Rain echo helper

`scripts/echo-rain` flips `input_number.fake_rain_rate` through the REST API and prints the
time (needs `HA_URL` and a long-lived token in `HA_TOKEN` from the scratch HA's profile page).

    HA_URL=http://<lan-ip>:<port> HA_TOKEN=... scripts/echo-rain        # rain on
    HA_URL=... HA_TOKEN=... scripts/echo-rain off

Timing: the server refreshes about every 30 s, and the onset reaches the glass 0-10 s
after that, so a flip shows 5-30 s later. The echo window is 20 s. Have two pets, sit on
the first, flip, and swipe to the second slide within 20 s of the rain appearing on the
first; check it echoes once and does not replay. A second onset of the same kind inside
about 90 s plays nothing. Not yet verified end to end on a device.
