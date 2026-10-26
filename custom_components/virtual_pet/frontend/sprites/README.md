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
| `egg` | Optional. Frames for the world's egg: `idle`, `wiggle` (calling), `crack` (about to hatch). Only the first species on a world's roster needs it; the others hatch from that egg. |
| `extras` | Special poses used by home awareness (phase 3): one sprite name, or a list of frames |
| `props` | Sprite for each care action, plus `blanket`, `attention`, `away` and three `poop`. A name with a slash, like `bird/medicine`, borrows another species' sprite. |
| `backgrounds` | `day`, `night`, `rain`, `dim` scenes, 512×384. Only `day` is required; missing scenes reuse it, dimmed by the card. |
| `words` | Optional flavour words for speech |

Sprites are 256×256 transparent PNGs with the feet on y=224; props are 128×128.
