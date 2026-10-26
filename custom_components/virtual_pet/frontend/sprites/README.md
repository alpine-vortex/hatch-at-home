# Species

Each folder here is one species a pet can hatch into. Species belong to worlds
through the rosters in `../worlds.json`. A species only counts once it has a
`species.json` with `"ready": true`, and a world shows up in the setup screen once
at least one species on its roster is ready. The beetle has no `species.json` yet,
while its adult sprites are being redrawn.

`species.json`:

| Key | Meaning |
| --- | --- |
| `name` | Shown in the setup screen and on the card |
| `stages` | Stages that have sprites, besides the egg |
| `stage_fallback` | Which drawn stage to use for one that has none (e.g. adult → teen until adult forms exist) |
| `moods`, `frames` | Every stage has `{stage}_{mood}_{1..frames}.png` for each mood. A missing mood falls back to `content`. |
| `egg` | Frames for the egg: `idle`, `wiggle` (calling or nearly hatched), `crack` |
| `extras` | Single-frame special poses, used by home awareness (phase 3) |
| `props` | Sprite for each care action, plus `blanket`, `attention`, `away` and three `poop` |
| `backgrounds` | `day`, `night`, `rain`, `dim` scenes, 512×384 |
| `words` | Optional flavour words for speech |

Sprites are 256×256 transparent PNGs with the feet on y=224; props are 128×128.
