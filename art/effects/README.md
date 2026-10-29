# Shared effects art pack

Creature-agnostic pixel-art effects for care actions, emotional reactions, ambient
flair and weather. These are draft art assets; they are **not installed in the
Lovelace card or wired to behavior**.

Each effect has four consecutive frames, numbered `_1.png` through `_4.png`, in
`frames/`. Frames use a transparent 256×256 canvas with nearest-neighbour scaling.
The source atlases in `source/` are retained; `build_frames.py` reproduces the cuts
and writes `manifest.json`.

## Effects

- **Emotions:** calm, happy, sad, scared, hungry, surprised, tired, stressed, proud,
  frustrated.
- **Flair:** sparkle, shimmer, swirl.
- **Care actions:** feed, snack, play, clean, medicine, praise, scold, tuck in.
- **Weather:** sunny, drizzle, rain, heavy rain, thunderstorm, hail, snow, sleet,
  fog, wind, hot, cold, overcast and rainbow.

The Home Assistant weather states map naturally to these shared loops: `sunny`,
`rainy`/`pouring`, `lightning`/`lightning-rainy`, `hail`, `snowy`/`snowy-rainy`,
`fog`, and `windy`/`windy-variant`. Rain and wind can be layered together; hot and
cold are the integration's comfort flags. `overcast` and `rainbow` are optional
variants for future use. Frame timing and placement remain an integration decision.

## Preview

Open `preview.html` in a browser to see each four-frame loop animate. The atlas row
order is recorded in `manifest.json`.

## Provenance

Drawn on 2026-10-28 by an OpenAI Codex desktop session (the model wasn't recorded),
as speculative drafts for future use. The source atlases in `source/` are the raw
generated images; `frames/` and `manifest.json` are cut from them by `build_frames.py`.
