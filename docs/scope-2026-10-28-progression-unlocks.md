# Scope: a loose, optional progression for shells and pets (2026-10-28)

Options for the owner to choose from. Not a build plan: once an option is picked,
it gets a plan, an audit, and then the build, as usual.

The owner's words (2026-10-28): "Right now it's free to add but it could be nice to
have a loose, optional progression system, and only show the portrait of some of
the forms, like tamagotchi does."

## What exists now

- **Adding a pet is free.** Each device (shell) is one config entry. The setup
  screen (`config_flow.py`, `PetConfigFlow.async_step_user` via `_world_options`)
  lists every world that has at least one ready creature. Nothing gates it.
- **Worlds appear once a creature is ready.** `species.py:load_catalog` reads
  `frontend/worlds.json` and keeps only worlds with a ready species
  (`docs/design-worlds.md`, "Files"). On main that's Woodland (bird, squirrel, deer)
  and Terrarium (gecko, tarantula), with Hearth, Tidepool, Pond and Night Sky
  waiting on art.
- **The egg picks the species, preferring new ones.** `model.py` (the hatch step,
  around line 430): the owner's `egg_choice` if it's on the roster, otherwise a
  random creature that this device hasn't `raised` yet, otherwise any.
  `raised` is per device (`PetState.raised`), carried over to each new egg
  (`model.py`, `lay_egg`), and kept out of HA history
  (`sensor.py`, `_unrecorded_attributes`).
- **You can pick instead.** `select.<pet>_next_egg` (`select.py:NextEggSelect`)
  offers "Surprise me" or any creature of the egg's world, for one hatch.
- **Generations.** From a week into adulthood (day 21) the pet can lay an egg; the
  adult retires to `journal` and the egg inherits a trait.
- **The journal already has silhouettes.** `hatch-pet-card.js:_renderJournal`
  shows the world's roster as tiles; a creature that no device *on this card* in
  the same world has raised is drawn black at 30% (`.jtile.locked`) with "???".
  The tile is always the child portrait (`child_content_1.png`). Below that: the
  device's family line (last four generations), the photo row and memories
  (guide, "The journal").
- **Forms.** Every creature has four forms: baby, child, teen and adult, drawn
  for every mood. Upbringing (devoted, steady, scrappy) changes how an adult
  behaves, not how it looks, so there's one adult form per creature.
- **The roster is about to grow.** The art branch `claude/quirky-faraday-axugqq`
  adds 17 creatures and fills all six worlds: Woodland 5 (adds fox, banana slug),
  Terrarium 6 (tortoise, bearded dragon, ball python; beetle still shelved), and
  Hearth, Tidepool, Pond and Night Sky 5 each. That's about 30 creatures and 120
  forms. A book that size is where a collection starts to feel worth filling.

## What the references do

**Tamagotchi.** The original devices hide the adult you'll get: which child and
adult forms appear depends on care (care mistakes, happiness, sometimes a
particular food or toy), and fans keep growth charts to find them all. The
Tamagotchi On/Meets lists each form's condition in exactly these terms (for
example Mametchi: "0-1 care mistakes, or 2-3 care mistakes and play with VR Set
5+ times") [1]. Each shell version (Fairy, Magic, Sanrio, Sweets...) brings its
own characters and places, and some travel spots unlock "by doing special things
in the game", and the device keeps them after a restart ("you'll keep all the
places you've unlocked") [1]. The Pix keeps a notebook "Tama List": when a
character you've met is new, "it will be logged in their notebook under the Tama
List and their silhouette will be filled out" [2]. The Uni's TAMA SEARCH collects
stickers from 100 characters met nearby, with more added through updates [3].
The Connection V4 used Gotchi Points and TamaTown codes to unlock items [4].
Tamagotchi's collection is a real pull, but it also runs on care mistakes, so
the form you get is partly a judgement on how well you did.

**Animal Crossing.** The Critterpedia adds a creature only when you catch it, and
each entry shows when and where it turns up and whether it's been donated to the
museum [5]. Nothing is taken away, nothing is timed against you, and the museum
fills up at whatever pace you play. Seasonal creatures come back next year.

**Pokémon.** The Pokédex tracks "seen" (a black silhouette with only the name and
category) and "caught" (the full entry) [6]. Two levels of knowing: you can see
there's something there before you have it.

**What we borrow, soften and refuse.**

| | From | Here |
| --- | --- | --- |
| Borrow | Pix notebook, Pokédex "seen" | Silhouettes that fill in. We already do it per creature; extend it to forms. |
| Borrow | Animal Crossing | It fills at your own pace, never expires, and shows who and when ("raised by Pip, gen 2"). |
| Borrow | Tamagotchi shells | Each world is its own shell with its own cast, which we already have. |
| Soften | Tamagotchi growth charts | A form opens by **reaching** it (growing up), never by **how well** you cared. Upbringing stays a word on the page, not a hidden form. |
| Soften | Pokédex "seen" | A silhouette can carry a gentle hint ("grows up in about 5 days"), never a requirement list. |
| Refuse | Tamagotchi care mistakes deciding forms | That turns the book into a score of your care: guilt. |
| Refuse | Points, codes, Gotchi-Point shops | Gameplay pressure and a currency to manage. |
| Refuse | Completion percentages, ranking, "missing" counters | Ranking and nagging. A book that says "4 of 30" reads as homework. |
| Refuse | Anything you can lose or that times out | Never take anything away. |

## The question of "only show the portrait of some of the forms"

Today the journal shows one portrait per creature (the child), revealed once the
creature has hatched here. The owner's wish fits the forms, not just the
creatures: open a creature's page and see its baby, child, teen and adult, with
the ones nobody here has grown to yet as silhouettes.

- **Which are silhouettes:** a creature's forms that no pet in this home has
  reached. The baby always shows once it has hatched (you've seen it). The adult
  stays dark until one grows up, which takes 14 days, so it's the real surprise.
  A creature nobody has hatched stays fully dark, as now, with "???".
- **What reveals them:** reaching the stage, nothing else. Not care quality, not
  time spent, not a game. It can't be missed or lost: a form, once seen, stays.
- **Where:** in the journal (a creature's tile opens a strip of four forms), and on
  the card as a quiet moment the first time a form appears ("a new page in your
  journal", once, no phone message). Nothing on the device itself, and no new
  entity, so nothing lands in HA history.
- **Backfilling existing pets:** every species in `raised` reveals its baby and
  child; its teen and adult open if a retired pet of that species is in the
  `journal` (retired pets are always adults) or the current pet has reached them.
  So an existing home never sees fewer portraits than it does today.

## The options

All four keep the rule: nothing that already works is taken away, and anything that
changes HA history is opt-in. Sizes are in PRs, each with its own plan and audit.

### A. A nicer collection book (nothing locked)

- **What you see:** the journal's creature grid becomes a proper book: tap a
  creature to see its four forms, its name and a line about it, who raised it here
  and when ("Pip, gen 1, grew up devoted"). Unraised creatures stay silhouettes,
  exactly as today. All four forms of a raised creature show.
- **What's locked:** nothing new.
- **Existing installs:** the same book, built from `raised` and `journal`.
- **Multi-device, multi-person:** the book is the home's: it already merges every
  device on the card in that world. Who raised it is the device's name, not a
  person's, so it doesn't rank people.
- **Opt-out:** not needed; it's a page you open.
- **Save/schema:** none. Card only.
- **Size:** 1 PR (card and its checks; art reuses the existing `*_content_1.png`).
- **Risk to taste:** low. It doesn't give the "only some of the forms" feeling the
  owner asked for.

### B. A forms book that fills in as they grow (recommended)

- **What you see:** option A, plus the form silhouettes above. A new form appears
  in the book the first time any pet here reaches it; the card shows one quiet
  "new page in your journal" moment and a small dot on the journal link until you
  open it.
- **What's locked:** only portraits. Every creature can still hatch, and you can
  still pick any one with `select.<pet>_next_egg`. Picking a creature reveals its
  baby once it hatches, like any other.
- **Existing installs:** backfilled as above, so nothing goes dark.
- **Multi-device, multi-person:** seen forms are stored per device (like `raised`)
  and merged by the card, so a home with two Woodland devices shares one book.
  A device that isn't on the card doesn't add to it, as with `raised` today (the
  card can only read devices it holds). Everyone in the home sees the same book.
- **Opt-out:** a card option "show every form" (default off, so the silhouettes
  show; on for anyone who'd rather see everything). It's a display choice, so it
  can't lose anything.
- **Save/schema:** a new `PetState` field, e.g. `seen: {species: furthest stage}`,
  with a default and the backfill on load. Kept out of history like `raised`
  (`_unrecorded_attributes`). No storage migration beyond the default.
- **Size:** 2 PRs: (1) the state field, backfill, attribute and tests; (2) the
  card's book, the moment and the card checks.
- **Risk to taste:** low. A silhouette is a quiet hint, not a task. The one thing
  to watch is that a dark adult must never read as "you haven't done enough": the
  hint text should talk about time ("grows up in about two weeks"), not effort.

### C. Creatures come by surprise first (the egg picker opens as you go)

- **What you see:** B, plus `select.<pet>_next_egg` lists "Surprise me" and only
  the creatures someone here has already raised. A new creature arrives only as a
  surprise from the egg, which already prefers new ones, so meeting a new creature
  is always a hatching moment.
- **What's locked:** choosing a creature you haven't met. It opens when one hatches
  here. With the egg's preference for new creatures, a single device meets a
  five-creature world in five generations (about 21 days each, so roughly 3-4
  months), sooner with two devices in that world.
- **Existing installs:** every creature already in `raised` stays pickable. To keep
  "never take anything away", the gate starts only on homes that turn it on.
- **Multi-device, multi-person:** a creature raised on any device in the home opens
  it for every device in that world. That needs a home-wide view of `raised` on the
  server (today only the card merges it), so the select would read the other
  entries' coordinators.
- **Opt-out:** it's opt-in: a switch per device (`switch.<pet>_discover_by_surprise`,
  off by default, so today's free choice stays the default).
- **Save/schema:** none beyond B; one switch.
- **Size:** 3 PRs (B's two, plus the switch and home-wide raised set).
- **Risk to taste:** medium. It takes a choice away from people who turn it on, and
  someone who wants a squirrel for a child who loves squirrels shouldn't have to
  wait months. Off by default answers that, but it's still a gate.

### D. Worlds open by raising pets

- **What you see:** the setup screen offers a starter set (for example Woodland and
  Hearth); another world appears there each time a pet in the home grows up (a
  quiet "a new world is open" moment, once). Inside a world, B's book.
- **What's locked:** adding a device for a world you haven't opened yet.
- **Existing installs:** every world a device already uses stays open, and so does
  every world the home could see before (all ready worlds as of the update), so an
  existing home sees no change until new worlds' art ships.
- **Multi-device, multi-person:** opened worlds belong to the home, but there's no
  home-wide entry today (each device is its own config entry), so the opened set
  needs a place to live: a small shared store, or read from every entry's state
  in `_world_options`. A home that deletes its last device would lose it unless
  that store outlives the entries.
- **Opt-out:** a setup-screen choice "show every world" (and off for every home
  that already has a device).
- **Save/schema:** a new home-level store (the first thing that isn't per entry),
  plus B's field.
- **Size:** 4 PRs (B's two, the home store and setup gate, the moment and docs).
- **Risk to taste:** high. It gates the one thing that's free today, adding a pet,
  and puts a clock on it (14 days to the first adult). That's gameplay pressure,
  and for a household that set up the integration to get a frog for a child, it's
  a wall. It also adds the most new machinery.

## Summary

| Option | What it is | Size | Main risk |
| --- | --- | --- | --- |
| A. Collection book | Tap a creature for its four forms and who raised it; nothing new locked | 1 PR | Doesn't give the "only some forms" feeling |
| B. Forms book (recommended) | A; forms nobody here has reached yet are silhouettes and fill in as pets grow; card option shows all | 2 PRs | A dark adult could read as "not done enough" if the hint talks about effort |
| C. Surprise first | B; the egg picker lists only creatures met here, new ones come by surprise; opt-in switch | 3 PRs | Takes a choice away from people who turn it on; months to meet a world |
| D. Worlds open by raising | B; a starter set of worlds, another opens when a pet grows up; opt-out | 4 PRs | Gates adding a pet, puts a clock on it; new home-level store |

## Recommendation

**Option B.** It's what the owner described ("only show the portrait of some of the
forms"), it locks portraits rather than play, it can't take anything away, and it
leaves nothing in HA history. It's also the base the other three share, so C or D
can follow later if B feels too light once the 17 new creatures land. Build it
after the art branch merges, so the book is first seen with ~30 creatures, not 5.

## Questions for the owner

1. **Which option?** Recommendation: B.
2. **Which forms start dark for a creature that's hatched here?** Recommendation:
   only the ones not reached yet (baby always shows; teen and adult open as it
   grows). The other choice, only the adult dark, is simpler but less to discover.
3. **Hints on silhouettes?** Recommendation: yes, about time only ("grows up in
   about two weeks"); never what to do.
4. **A moment on the card when a new form appears?** Recommendation: yes, once, on
   the card only (no phone message, no event), with a dot on the journal link.
5. **Should the book show upbringing as a mark on the adult (devoted, steady,
   scrappy)?** Recommendation: as words beside "raised by", never as separate
   forms to collect, so the book never scores care.
6. **If C later: free choice by default?** Recommendation: yes, the surprise gate
   off by default.

## Sources

1. Tamagotchi On/Meets complete guide (forms by care, unlockable places, versions):
   <https://tamagotchipet.com/tamagotchi-on-meets/>
2. Tamagotchi Wiki, Tamagotchi Pix meetable characters (Tama List silhouettes):
   <https://tamagotchi.fandom.com/wiki/Tamagotchi_Pix/Meetable_Characters>
3. Bandai, Tamagotchi Uni TAMA SEARCH (100 characters, stickers):
   <https://tamagotchi-official.com/us/news/01_519/>
4. Wikipedia, Tamagotchi Connection (V4 Gotchi Points, TamaTown codes):
   <https://en.wikipedia.org/wiki/Tamagotchi_Connection>
5. Nookipedia, Critterpedia (entries added on catch, donated marker):
   <https://nookipedia.com/wiki/Critterpedia>
6. Bulbapedia, Pokédex (Pinball) (seen as a silhouette, caught as the full entry):
   <https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9dex_(Pinball)>

## Decided (owner, 2026-10-28)

- **Option B, the forms book.** Only portraits are locked, never play. Build it after
  the 17-creature art branch merges, from a build plan that is audited first.
- **No hints on silhouettes:** a dark form is a plain silhouette, with no text about
  when or how it appears.
- **A new page is marked once, on the card only:** one quiet "new page in your
  journal" moment and a dot on the journal link until it's opened. No phone message.
- First-mate defaults, which the owner may overrule: a hatched creature's baby form
  always shows, and only forms not yet reached here start dark (Q2). Upbringing shows
  as words beside "raised by" and is never a collectable form (Q5). Q6 doesn't apply.
