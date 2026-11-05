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
| `scale` | Optional, per stage: how much bigger to draw it, feet fixed. Long adults fit the 256 px frame by coming out shorter than their teen; e.g. `{ "adult": 1.2 }` brings them back up. |
| `stage_fallback` | Which drawn stage to use for one that has none (e.g. adult → teen until adult forms exist) |
| `moods`, `frames` | Every stage has `{stage}_{mood}_{1..frames}.png` for each mood. A missing mood falls back to `content`. |
| `egg` | Optional. Frames for the world's egg: `idle`, `wiggle` (calling), `crack` (about to hatch). Only the first species on a world's roster needs it; the others hatch from that egg. |
| `extras` | Special poses used by home awareness (phase 3): one sprite name, or a list of frames |
| `reactions` | Optional. A care action (or `won` for a won game) → one of the `extras`, shown for 2.5 s after it. Child stage only, since extras are drawn for the child |
| `signature` | Optional. Stage (`teen`, `adult`; never `baby` or `child`) → a list of sprite names: the species' signature pose, the habit made visible (`"adult": ["adult_cache_1", "adult_cache_2"]`). An idle move plays it for 2.5 s, as a child plays its own `extras`; never a reaction. Kept near the stage's `head` point, so flair sits right. Sits before `waves` in the file. |
| `waves` | Optional. Stage (`baby`, `teen`, `adult`; never `child`) → a list of sprite names the infrared link greeting plays instead of the excited frames. Missing stage or a sprite that fails to load: excited, as before |
| `props` | Sprite for each care action, plus `blanket`, `attention`, `away` and three `poop`. A name with a slash, like `bird/medicine`, borrows another species' sprite. Optional: `broom`, `dust`, `net` and `bubbles`, each a list of two frames, replace the shared ones in `ui/` (`prop_broom_1`...) that the clean scene uses; they are trimmed, at 4 px per art pixel (the 64 world grid; creatures are on 2 px). |
| `acts` | Optional: the care scenes' own frames, when the art has them. `eat` (taking medicine) and `cheer` (after medicine or a clean) → the stages that have them, or `true` for all, drawn as `<stage>_eat_1`, `<stage>_eat_2`. Without them the scene leans the mood frame in, then cheers with `child_squint` (child) or `excited`. |
| `head` | Per stage, `[x, y]` in the 256 px frame: the middle of the head at its top, where trait flair floats above it. Measured with `scripts/art/heads.py` (its estimate, corrected where a tail, ear or wing rises higher than the head). |
| `face` | Optional, per stage, `[x, y, size]` in the 256 px frame: the middle of the face and the width of the window around it. The settings bubble and the status band crop the head to a 28 px box; by default that box shows 96 sprite px from just under `head`'s top, which reads as a face for most species. A species whose `head` is a shell, wing or back (hermitcrab, tarantula, tortoise, puffin, lunamoth, firefly) gives `face` and the box shows that window instead. Check it with a bench status shot (`view: "status"`) at each stage. |
| `hat` | Optional, per stage, `[x, y]`: where a seasonal hat sits (the top of the skull). For creatures whose head point is on an ear or antler tip or a shell top (the deer, fox, hamster, corgi, tortoise); otherwise the card finds the top of the head below the head point. A pose key (`"adult_dirty"`, `"child_watch_tv"`) overrides the stage where that pose carries the head well away from the stage's point (the opossum frets sitting up; every creature turns its back to watch TV). A pose key set to `null` means no hat fits it (frames that bounce between a leap and a crouch), so the costume waits for another pose. A third element, `[x, y, "exact"]`, seats the brim top at exactly `y`: no head scan and no lowering to the frames' head top, for a pose whose head sits higher than the scan finds (check both idle frames). Costumes only show in idle moods (content, cozy, bored, excited, sleepy, hungry, dirty) and the child's weather and TV poses, so only those need checking. |
| `perch` | Optional: a 256×256 sprite drawn under the pet's feet that moves and scales with it, for a creature whose scene puts it on open water (the tree frog's lily pad). |
| `murk` | Water worlds only (`"mess": "murk"` in `worlds.json`): a 512×384 overlay that clouds the scene instead of showing poop, stronger with each mess. Every creature in the world needs it (later ones borrow the first's, like `otter/murk`); without it the card shows poop. |
| `backgrounds` | `day`, `night`, `rain`, `dim` scenes, 512×384. Only `day` is required; missing scenes reuse it, dimmed by the card. |
| `words` | Optional flavour words for speech: `food`, `home`, and per-stage overrides (`"adult": {"home": "branch"}`) |
| `voice` | Optional: `sound` (one word, said at the start of a line now and then; unique in its world), `pitch` (the babble's base note, 330-1200 Hz), `pace` (typing speed, 25-45 characters a second), `likes` (2-3 foods; each pet picks its favourite snack from them at hatching). Without it the pet speaks plainly and never babbles |
| `nature` | Optional. Four facts that only colour how the species idles; no number changes. `clock` (`day`, `dusk`, `night`): the flavour of its sunset and morning lines. `sky` (`sun`, `rain`, `snow`, `fog`, `wind`, `fire`, `moon`): the weather it perks up in, once a day, as a body reaction. `company` (`social`, `solo`): how it meets a visitor (solo species peek first, then wave; a social deer, corgi and duckling have their own greeting). `habit` (`hoarder`, `builder`, `basker`, `groomer`, `explorer`, `watcher`, `performer`): which idle moves it favours. Pace is not a key: it is derived from `voice.pace` (40 or more quick, 29 or less slow, else steady) and sets the idle cadence. A missing block or an unknown value means no nature, never an error. |
| `field_note` | Optional. One line, `<clock> · <sky> · <species clause>`, at most 60 characters and different for every species: how this kind of creature is built, never a taste ("perks up in rain", not "loves rain"). The card's status page shows it as the "nature" row at every hatched stage (never the egg); Assist's status data carries it as `species_note`. Its clock and sky clauses must match the `nature` block (a test checks). Sits on the line right after `nature`. No note, no row. |

Sprites are 256×256 transparent PNGs with the feet on y=224; props are 128×128.
Every creature has a closed dark outline; `scripts/art/outline.py` closes gaps along
light edges in a generated set.
