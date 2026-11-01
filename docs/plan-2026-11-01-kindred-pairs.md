# Copy plan: kindred pairs and persona link lines (next-stages 2b)

Docs only. Every line below is **PROPOSED**; the owner picks the words (next-stages
Decided 4: new lines stay proposals). Nothing here is built, and no code, server or save
changes. Sources: `plan-2026-10-31-next-stages.md` (2b, Decided 4 and 6),
`plan-2026-10-28-personality-types.md` ("Pets meeting each other", "Later"),
`plan-2026-10-29-device-charm.md` ("Left"), `plan-2026-10-28-phase5-baby-talk.md`,
`plan-2026-10-28-experience.md` §5 (the no-nagging scan).

Line numbers are for this branch (`origin/main` at `8fce6f53`, 0.39.0), file
`custom_components/virtual_pet/frontend/hatch-pet-card.js`.

## 1. What exists

### The link, today

- **Trigger:** `_linkTick` (7968) waits `LINK_AFTER_MS` (398: 10-25 min after load), then
  `_linkPick` (7951) takes a free neighbour slide (either side, random) once per day per
  pair (`oncePerDay("link-<pairId>")`), and calls `_linkStart` (7992).
- **Lines, all fixed copy, no type, no stage:**
  - host, queued 3.4 s on the host's bubble (8040): `hi, {guest}!` or `oh! {guest}! hello hello ♪`
  - guest, in the visit screen's `.vsay` (8046): `hi hi, {host}! ♪` or `*waves* hi, {host}!`
  - guest's own slide, a bare `♪` (8008).
  - Names come from `_linkName` (7938): the device's name, else "friend".
- **Nothing counted:** the once-a-day key is the only memory (Decided 6 keeps it so).
- **Calm** (reduced motion): no beam, shorter timings (`isCalm`, 7994-8003); the lines still show.
- Eggs never link (`_linkFree`, 7944). A baby or child host does link, and today says the
  same normal lines as everyone.

### Types and the voice routes

- Eight types, teen or adult only (`_persona` 4608; `PERSONA` 845): mellow, sweet, bouncy,
  starry, old_soul, fancy, charming, plucky. Babies and children have none.
- `_lines(s, key, normal, arg)` (4618): baby-talk set if the baby/child route has one
  (`_babySet` 4602, `BABY` 796), else a fair coin between the type's lines and the normal
  pick. A key a type lacks falls back to normal, so adding `PERSONA.<type>.link_*` needs
  no migration.
- Phase 5 already approved the visitor catch-up line for babies, "hi hi! ♪" (Decided 9);
  the baby link lines below follow its "hi hi" family.

### Which pairs are "kindred" (proposed rule)

The personality plan (line 615) already pairs the types, from Animal Crossing's
counterparts. The FM default was "same type". Proposal: **both**, as two tiers, with
no pair disliking another:

| Kindred pair | Why |
|---|---|
| mellow + sweet | the two gentle ones |
| bouncy + starry | the two lively ones |
| old_soul + fancy | the two with taste |
| charming + plucky | the two bold ones |
| same type (any) | "twins": a mirror line, the type's own |

Rule: pair of teen/adult pets, both with a type, where the types are partners above or
equal. A baby or child on either side makes the link a normal one (no type). The check is
a small table, `KINDRED = { mellow: "sweet", sweet: "mellow", ... }`, read at link start.

## 2. PROPOSED lines

Scan, applied to every line (experience §5, personality 279-283): no "!!", no word
repeated more than twice in a row, none of "still, again, why, never, pleas, sad, cry,
alone, forgot", no `?`, nothing that asks the person for something or hints at a duty.
`{guest}` / `{host}` are device names. Tone follows the shipped `hello`/`fell_asleep`
lines of each type.

### 2a. Link lines (new keys `link_host`, `link_guest`)

Three per type (two host lines, one guest reply). Each fires on the fair coin, like
`_lines`; otherwise the shipped normal line plays.

| Type | `link_host` (host greets, `{guest}`) | `link_guest` (guest replies, `{host}`) |
|---|---|---|
| mellow | PROPOSED: `oh hey, {guest}... ♪` / `{guest}... come sit a while ♥` | PROPOSED: `mm, hi, {host}... ♪` |
| sweet | PROPOSED: `{guest}! hi! so glad you came ♥` / `hello hello, {guest} ♥` | PROPOSED: `hi, {host}! ♥ hello ♥` |
| bouncy | PROPOSED: `{guest}! hup hup, hi!` / `hiya, {guest}! *bounce*` | PROPOSED: `hup! hi, {host}!` |
| starry | PROPOSED: `{guest}! my co-star ★` / `ah, {guest}! cue the music ★` | PROPOSED: `hello, {host}! ★ take a bow` |
| old_soul | PROPOSED: `hello, {guest}. come in.` / `{guest}. good to see you.` | PROPOSED: `hm. hello, {host}.` |
| fancy | PROPOSED: `{guest}, darling! how lovely ♥` / `oh, {guest}! welcome, welcome ♥` | PROPOSED: `{host}, darling! ♥` |
| charming | PROPOSED: `ah, {guest}! a delight ♥` / `{guest}! what an honour ♥` | PROPOSED: `{host}! how splendid ♥` |
| plucky | PROPOSED: `yo, {guest}! all clear here` / `{guest}! reporting in ♥` | PROPOSED: `hey, {host}! ♥ hi hi` |

Baby and child hosts (phase-5 route, `BABY["link_host"]` / `["link_guest"]`, no type, no
catchphrase):

| Stage | host | guest |
|---|---|---|
| baby | PROPOSED: `hi hi, {guest}! ♪` / `{guest}! yay yay!` | PROPOSED: `hi hi, {host}! ♪` |
| child | PROPOSED: `hi, {guest}! hello ♪` | PROPOSED: `hi hi, {host}! ♪` |

Line count: 3 per type x 8 types = **24 type lines** (3 each: mellow 3, sweet 3, bouncy
3, starry 3, old_soul 3, fancy 3, charming 3, plucky 3), plus 5 baby/child lines (baby 3, child 2); 45 lines with 2b.

### 2b. Kindred extras (new key `link_kindred`)

One extra line from the host, after the greeting, only when the pair is kindred.
Written in the host's type, so it works with either partner of the pair (and the "twin"
tier uses the first line). Two per type = **16 lines**.

| Type | PROPOSED kindred lines (to its partner, `{guest}`) |
|---|---|
| mellow | `{guest}, we do cosy well ♥` / `mm, a nap with you sounds nice ♪` |
| sweet | `{guest}, we think alike ♥` / `it's nice to meet a kind heart ♥` |
| bouncy | `{guest}! race you to the corner! hup` / `two of us, twice the hops!` |
| starry | `{guest}! a duet, you and me ★` / `we shine best together ★` |
| old_soul | `hm. {guest}. we understand each other.` / `good company, you.` |
| fancy | `{guest}, darling, we have such taste ♥` / `a fellow connoisseur ♥` |
| charming | `{guest}! two of a kind, you and I ♥` / `such a grand pair we make ♥` |
| plucky | `{guest}! good team, you and me ♥` / `we've got each other's backs ♥` |

Count: **2 per type, 16 in all.** Lines with `?` were avoided; "race you" is an invitation
between pets, not a request to the person.

### 2c. Scan notes

- No line carries a duty, a count, or a request of the person. I grepped the doc for the banned words, "!!" and `?`: only this prose matches, no proposed line.
- Run over all 45 lines by the copy test (see 3) before they ship.
- No catchphrase on baby lines. Teen/adult link lines may take it only through the
  normal `_speak` path (every third voiced line, `catch: true`); the host's bubble
  line does not pass `catch` today and the sketch keeps that.

## 3. Build sketch (the later ship, slice 1)

- **Where:** `_linkStart` only. Replace the two `_pick([...])` calls (8040, 8046) with
  `_linkLine(side, key, normal)` wrapping `_lines(...)`, with `host`/`guest` passed so
  each side speaks in its own type. Add a `link_kindred` step at `t0 + 2800` that
  queues the extra line on the host's bubble (`_queue(host, line, 1100)`), before the
  hide at `t0 + 4000`. The guest reply's `.vsay` timing is unchanged.
- **Tables:** add `link_host` / `link_guest` / `link_kindred` to each `PERSONA` type, add
  `BABY["link_host"|"link_guest"]` with `baby` and `child` sets, add `KINDRED`.
- **Odds:** the shipped half-coin for link lines. Kindred extra: 1 in 2 kindred links
  (Q3 below), and only once per pair per day, because the link itself already is.
  One extra line, never a second.
- **Card only, nothing counted** (Decided 6): no server call, no attribute, no save. The
  once-per-day link key is the only state, and the kindred roll is made at start, not
  stored.
- **Reduced motion / quiet:** calm keeps the lines (they are text) but skips the
  host/guest cheer pose; the extra line uses the same timing shift as calm
  (`t0 + 2000`). Quiet hours and sleep already end a link (`_linkTick`) and the chirp
  respects them. Screen readers get the lines through the host's `s.plain` the same as
  today; the `.vsay` stays `aria-hidden`.
- **card-check:** a new section `link-lines` (after `link`, in `card-check --list`):
  - each type's host/guest line, from a fake link at a pinned seed, passes the scan;
  - a kindred pair shows the extra line at odds 1.0 and none at 0.0; a non-kindred
    pair never does;
  - a baby/child host shows the phase-5 lines and no kindred line;
  - calm timing, and no `?`/"!!"/banned words across all 45 lines (copy test).
  - Screenshots from the **card bench** (AGENTS.md), not HA: the bench needs
    a pinned link state (if the bench can't pin a link yet, adding that goes in the slice).

## 4. Owner questions

1. **Kindred rule.** Recommend **both tiers**: the four counterpart pairs, plus same-type
   twins (the FM default as a floor). Reason: every pet gets a kindred neighbour more
   often, and none feel left out. Alternative: only same type, or only the four pairs.
2. **The lines.** Recommend approving the link lines (2a) first and trimming the kindred
   extras (2b) to one per type on the first ship. Reason: the link lines are the
   everyday ones; extras are the garnish. Which lines to cut or reword?
3. **Odds of the extra.** Recommend 1 in 2 on a kindred link. Reason: once a day per
   pair already keeps it rare. Alternative: 1 in 3, so it stays a small treat.
4. **Babies and children.** Recommend the plain "hi hi" family (2a, second table) and no
   kindred extra before teen. Reason: they have no type; matches phase 5.
5. **Who speaks the extra.** Recommend the host only. Reason: the guest already has the
   reply bubble and the screen is small. Alternative: both, one after the other.
