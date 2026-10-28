# Daily check-ins, 2026-10-28 (scope; wish, dream, away note, bond and seasons built)

The person who will play with the pet loves virtual pets, gets attached, and checks
on them every day. The journal matters less to them. What matters is that **every
check-in finds something**: something happened while they were away, the pet wants
something today, or the pet visibly knows them. The owner chose all of the
following on 2026-10-28:

- **finds and visitors**, different for each world;
- **a daily wish**;
- **a bond with each person**, separately;
- **cheap extras:** a dream in the morning, and a "while you were away" note;
- **visiting each other** (pets on the shelf), looked at again (below);
- **seasonal touches.** Halloween is built (0.28.0); the framework takes more seasons.

## Rules for all of it

- **Nothing is lost by missing a day.** No streaks, nothing that expires as a
  punishment, no guilt. A missed wish simply becomes tomorrow's new wish; a find
  waits in the basket.
- **Cosmetic, or gently positive.** As before: the house and these features never
  hurt the pet. A fulfilled wish or a visit may add a little happiness, within the
  existing `HOME_BONUS_CAP` thinking.
- **Not rare enough to cause fear of missing out.** The rarest find turns up every few
  weeks for an attentive player, not once a year.
- **Private by default.** Per-person data stays in HA's storage, is redacted from
  diagnostics, and is never shown to another person on the card.

## 1. Finds and visitors (the biggest hook; art-bound)

From Neko Atsume and Animal Crossing: while nobody is looking, the pet finds little
things, and visitors drop by.

### How it plays

- **Finds.** Every few hours the pet is awake (about every 4 h, jittered), it may
  find something, chosen from its world's list and weighted by what the house is
  doing (rain, frost, a full moon, sun). Finds wait in a small **basket** on the
  screen, up to 3. Opening the card shows the basket; a tap reveals each one ("a
  pine cone!") and adds it to the collection. A find left in the basket simply
  waits; a fourth find doesn't happen until there's room.
- **Visitors.** About once a day, a visitor from the pet's world stays for a few
  hours (drawn small at the edge of the scene). If someone opens the card while it's
  there, the pet introduces it, and it counts in the collection. When it leaves, it
  sometimes leaves a gift in the basket, so a missed visitor still says hello.
- **The collection.** A page next to the journal: each world's finds and visitors,
  found ones drawn, missing ones as silhouettes ("6 of 14"). Kept per pet and carried
  into the next generation (the device's collection, not the pet's), so it grows
  across generations.

### Per world (each device shell has its own)

Draft lists for the owner and Sol to change. Conditions use flags the house already
senses. Rare ones are marked ★.

| World (shell) | Finds | Visitors |
| --- | --- | --- |
| Woodland (orange egg) | pine cone, acorn, jay feather, smooth river stone, snail shell (after rain), frosted leaf (frost), chanterelle (fog or rain, autumn), ★ four-leaf clover (sun) | Steller's jay, banana slug (rain), chickadee |
| Terrarium (sandstone tank) | shed skin (the pet's own moult), cricket, shiny pebble, dried flower, dew drop (fog), ★ tiny fossil | the beetle (its shelved sprites, reused), a moth (night) |
| Hearth (little red house) | button, ribbon, lost sock, toy mouse, cookie crumb, pine sprig (snow), ★ marble | a mouse (night), a robin at the window, the neighbour's cat |
| Tidepool (porthole) | sea glass (green, blue), scallop shell, sand dollar, crab claw, ★ red sea glass, ★ message in a bottle (after a storm) | hermit crab, seagull, ★ harbour seal |
| Pond (lily pad) | lily flower, cattail fluff, water-snail shell, smooth pebble, dragonfly-shaped leaf, ★ golden koi scale | dragonfly, duckling, heron (from a distance) |
| Night Sky (crescent moon) | moonstone (full moon), comet dust, owl feather, firefly in a jar, constellation card, ★ fallen star (rare, clear nights) | owl, firefly swarm, ★ shooting star |

### Building it

- **Server** (`model.py`, persisted): `basket` (up to 3 finds), `visitor` (who and
  until when), and the device's `collection` (`{id: first found at}`). A
  `virtual_pet.collect` service (and a button entity) empties the basket, called by a
  tap on the card. The lists live in `worlds.json` (`finds`, `visitors`: id, name,
  weight, condition), so the card and the server read the same data.
- **Card:** the basket on screen, the reveal, the visitor at the scene's edge, and a
  collection page.
- **Art from Sol (one batch):** about 7 finds and 3 visitors per world, so 60
  sprites. Finds at the deco size (32 × 32 art pixels); visitors as two-frame
  sprites. I can draw stand-ins in code to try it first, as for Halloween.
- **Cost:** L. Model and service S–M, card M, art the long pole.

## 2. A daily wish (cheap; no art)

From Tamagotchi Pix and Finch. Each morning, at the good-morning moment (or when it
wakes), the pet wishes for one small thing. The card shows it on the status screen
and the pet mentions it now and then.

- **Wishes**, picked to suit the house: watch the sunset together (someone opens the
  card within the sunset moment), play a game with me (any game), a snack after lunch,
  some music (music playing while it's awake), a story at bedtime (lights out by
  hand), see the rain (rainy), a chore done (a to-do item, with chores mapped), "just
  say hi" (the card opened by anyone after noon).
- **Only wishes the house can grant:** no music wish without a music player mapped.
- **Fulfilled:** a sparkle, a happy line, a little happiness, and bond points for
  whoever granted it. **Missed:** nothing; tomorrow brings a new one.
- **Building it:** state `wish` (kind, day, granted by); checks run on the existing
  moments and care actions. **Cost:** S–M.

## 3. A bond with each person (cheap to start; grows)

**Built** (2026-10-28, after 0.30.0): as below, with these choices of mine for the
owner to change: points per visit 2 (once a day), care 1, a game 2, a granted wish 3;
care and games capped at 8 a day per person; levels at 0, 4, 10, 20, 34, 52, 75, 105,
145, 200 points; the unlocks at levels 2 (warmer hello), 3 (hop), 4 (nickname),
6 (favourite game, a line when played together) and 8 (hearts); bonds carry
into the next generation. The "come say hi" wish came with it.

**Second pass** (owner, 2026-10-28: flavour, not gameplay; no journal work now): the
favourite game lost its happiness, so a bond never changes the stats. Added: the
nickname on that person's phone notifications and in Assist; a cheer when a close
friend (level 3+) comes home, by their person entity, and "welcome home" at their
next look; and a wish now and then aimed at a close friend (35%, play, snack, bath,
praise or say hi; anyone can grant it). Declined: memories in the journal, and care
from a friend working better (a good bond is inevitable, so it would only make the
game easier).

**Third pass** (owner, 2026-10-28; declined: remembering each person's music):
"my day" (`wellbeing.py`, opt-in per person, positive only, gated by level, from
their own phones and HA's long-term statistics), the monthly friendship day, each
person's game records, goodnight and a morning thank-you for tucking it in, and
"how was your day?" (card only). Not yet seen on a real phone: which sensors the
players' phones report, and whether Android's step counter has statistics.

From Nintendogs and the Digimon bracelets: the pet knows each person, separately.

- **Who:** HA users. Care already records who did it (`coordinator._who`). Visits
  need one small new call: the card tells the server "this person looked in"
  (`virtual_pet.visit`, at most hourly per person).
- **Points**, which never go down: a visit (once a day counts), care actions, a
  granted wish, a game. **Levels** 1–10, slow at the top.
- **What a level unlocks** (all per person, on that person's screen):
  - a warmer greeting (the card already greets by first name);
  - a happy hop when they open the card;
  - a nickname for them ("hi, sunbeam!"), picked by the pet;
  - its favourite of their games (a mood boost when they play it);
  - at high levels, a special pose or flair only for them.
- **Status screen:** "you and Pip: ♥♥♥♡♡". Only the viewer's own bond is shown.
- **Building it:** state `bonds: {user_id: points}` (redacted in diagnostics), the
  visit service, the card's per-person lines. **Cost:** M.

## 4. Cheap extras

- **A dream in the morning** (S). When the pet wakes, it may say what it dreamed of,
  picked from yesterday's moments: "I dreamed about the rain…", "…about Bluey!",
  "…about the full moon", "…about my pine cone". Server-side, on the `woke_up`
  moment (`dream` field); the card says it at the first look of the morning.
- **"While you were away"** (S, card only). Opening the card after a few hours shows
  one short line built from the moments and care since this device last looked:
  "napped, watched the rain, found a shell!". Shown once, then gone. Not the journal,
  and not the declined diary.

## 5. Pets visiting each other (looked at again: recommended)

Earlier "not now". For daily check-ins it's one of the strongest hooks, if there will
be more than one pet.

- **How it plays:** now and then (about every two days per pair, both awake and
  home), one pet visits another's device for an hour or two. The visitor is drawn
  beside the host, a little smaller; both say a line ("Mochi came over!"). A visitor
  from another world is the fun part: the bunny in the tidepool, the octopus in the
  hearth. While visiting, the guest's own device shows a sign ("visiting Pip!"), like
  the sitter's sign.
- **Friendship:** each pair counts its visits; friends greet each other and, at a few
  visits, get a "best friends" line and a memory.
- **Care while visiting** works on both devices as normal (the guest is still that
  pet). Calls still reach the phone.
- **Building it:** a small registry of the loaded pets (`hass.data`), a pairing roll
  on the tick, `visiting` on both states; the card loads the guest's species to draw
  it. No new art, since every creature exists. **Cost:** M.
- **Only one pet?** Nothing changes, and the visitors from feature 1 fill the gap.

## 6. Seasons

**Built:** the framework and Halloween (0.28.0, card only): `SEASONS` in the card,
per-world parts, the costume moment and a treat day. Owner, 2026-10-28: "really
something we should jump into".

**Next seasons to choose from** (each about S with stand-in art, more with Sol's):

| Season | When | Touches |
| --- | --- | --- |
| First snow | the first snowy day (already sensed) to a week after | a scarf at the head point, snow on the device's top trim |
| Winter holidays | about 1–31 December | lights along the trim, a little tree or lantern, a gift on the morning of the 25th |
| New year | 31 Dec – 1 Jan | a party hat, confetti at midnight if awake |
| Valentine's | 14 Feb | hearts float up when cared for |
| Spring | equinox week | blossoms on the trims, a flower crown |
| Summer | solstice week | sunglasses on sunny days, a sunflower |

- Fixed dates follow the viewer's date (as Halloween does). Seasons of the year
  (spring, summer) depend on the hemisphere, so they need HA's latitude.
- Calendar celebrations were "not chosen" in the feature-gap plan; the owner now wants
  seasonal touches, so these are in, but each one is the owner's pick.
- Seasonal finds join feature 1 later (a conker in autumn, a snowflake in winter).

## Suggested order

1. **The daily wish, the dream and the "while you were away" note** (one release, no
   art). Quick to try, and they make every check-in say something.
2. **The bond with each person** (with the visit call, which the wish's "say hi"
   uses too).
3. **Finds and visitors**: stand-ins first to try the feel, Sol's batch in parallel,
   then the collection page.
4. **Pets visiting each other**, if there will be more than one pet.
5. **Seasons:** the next one before its date (winter holidays from 1 December).

## Open questions for the owner

- **How many pets will the player have?** Visiting each other needs two.
- **Do they use their own HA login?** The bond needs one per person; a shared wall
  tablet login would count as one person.
- **Finds per world:** are the lists right? Anything they'd love to find?
- **Which seasons**, and should the winter holidays be generic ("winter lights") or
  named?
- **Should Sol redraw the Halloween stand-ins** for next year, and draw the finds?
