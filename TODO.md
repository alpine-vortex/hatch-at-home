# hatch-at-home to-do

## Open

- [ ] Fix the card making the whole HA app slow on 0.47.2 — owner disabled the integration 2026-11-05
  - Symptom: on the phone app every HA screen is sluggish, Settings included (entity settings
    dialog stays blank). Server idle: load 0.06, memory 29%. Disabling Virtual Pet fixed it at once.
  - Began with the 0.47.0 install (same time as a HAOS update). 0.47.2's mould fix
    (355 -> 18 MB per mount) did not cure it; HA was restarted and on 0.47.2.
  - Suspects: `add_extra_js_url` loads the card on every HA page, not just pet dashboards; the
    700 ms `setInterval` tick and `subscribeEvents` may run with no card on screen; IMAGES map.
  - Check: profile the app webview (chrome://inspect) on a non-pet page with the card loaded.
- [ ] Re-enable Virtual Pet in HA once the fix ships [owner]
