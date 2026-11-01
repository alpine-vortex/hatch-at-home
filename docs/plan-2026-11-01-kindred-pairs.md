# Copy plan: kindred pairs and persona link lines (next-stages 2b)

**Status: built** (2026-11-01, branch `crew/hatch-at-home-s2577-2b-kindred-pairs-persona-link`).
The owner approved all 45 lines verbatim and answered the questions (§4) on 2026-11-01;
the build follows the plan review's fixes (§3, as built), not the first sketch. Card
only: no server, save or schema change. Sources: `plan-2026-10-31-next-stages.md` (2b, Decided 4 and 6),
`plan-2026-10-28-personality-types.md` ("Pets meeting each other", "Later"),
`plan-2026-10-29-device-charm.md` ("Left"), `plan-2026-10-28-phase5-baby-talk.md`,
`plan-2026-10-28-experience.md` §5 (the no-nagging scan).

Code is named by function, file `custom_components/virtual_pet/frontend/hatch-pet-card.js`.

## 1. What exists

### The link, today

- **Trigger:** `_linkTick` waits `LINK_AFTER_MS` (10-25 min after load), then
  `_linkPick` takes a free neighbour slide (either side, random) once per day per
  pair (`oncePerDay("link-<pairId>")`), and calls `_linkStart`.
- **Lines, all fixed copy, no type, no stage:**
  - host, queued 3.4 s on the host's bubble: `hi, {guest}!` or `oh! {guest}! hello hello ♪`
  - guest, in the visit screen's `.vsay`: `hi hi, {host}! ♪` or `*waves* hi, {host}!`
  - guest's own slide, a bare `♪`.
  - Names come from `_linkName`: the device's name, else "friend".
- **Nothing counted:** the once-a-day key is the only memory (Decided 6 keeps it so).
- **Calm** (reduced motion): no beam, shorter timings (`isCalm`); the lines still show.
- Eggs never link (`_linkFree`). A baby or child host does link, and today says the
  same normal lines as everyone.

### Types and the voice routes

- Eight types, teen or adult only (`_persona`; `PERSONA`): mellow, sweet, bouncy,
  starry, old_soul, fancy, charming, plucky. Babies and children have none.
- `_lines(s, key, normal, arg)`: baby-talk set if the baby/child route has one
  (`_babySet`, `BABY`), else a fair coin between the type's lines and the normal
  pick. A key a type lacks falls back to normal, so adding `PERSONA.<type>.link_*` needs
  no migration.
- Phase 5 already approved the visitor catch-up line for babies, "hi hi! ♪" (Decided 9);
  the baby link lines below follow its "hi hi" family.

### Which pairs are "kindred" (owner: both tiers)

The personality plan (line 615) already pairs the types, from Animal Crossing's
counterparts. The FM default was "same type". The owner chose **both**, as two tiers,
with no pair disliking another:

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

## 2. The lines (approved verbatim, owner 2026-11-01)

Scan, applied to every line (experience §5, personality 279-283): no "!!", no word
repeated more than twice in a row, none of "still, again, why, never, pleas, sad, cry,
alone, forgot", no `?`, nothing that asks the person for something or hints at a duty.
`{guest}` / `{host}` are device names; in the card the lines are `(n) =>` functions
(like the rest of `PERSONA`/`BABY`), never a literal `{guest}`. Tone follows the shipped `hello`/`fell_asleep`
lines of each type.

### 2a. Link lines (new keys `link_host`, `link_guest`)

Three per type (two host lines, one guest reply). Each fires on the fair coin, like
`_lines`; otherwise the shipped normal line plays.

| Type | `link_host` (host greets, `{guest}`) | `link_guest` (guest replies, `{host}`) |
|---|---|---|
| mellow | `oh hey, {guest}... ♪` / `{guest}... come sit a while ♥` | `mm, hi, {host}... ♪` |
| sweet | `{guest}! hi! so glad you came ♥` / `hello hello, {guest} ♥` | `hi, {host}! ♥ hello ♥` |
| bouncy | `{guest}! hup hup, hi!` / `hiya, {guest}! *bounce*` | `hup! hi, {host}!` |
| starry | `{guest}! my co-star ★` / `ah, {guest}! cue the music ★` | `hello, {host}! ★ take a bow` |
| old_soul | `hello, {guest}. come in.` / `{guest}. good to see you.` | `hm. hello, {host}.` |
| fancy | `{guest}, darling! how lovely ♥` / `oh, {guest}! welcome, welcome ♥` | `{host}, darling! ♥` |
| charming | `ah, {guest}! a delight ♥` / `{guest}! what an honour ♥` | `{host}! how splendid ♥` |
| plucky | `yo, {guest}! all clear here` / `{guest}! reporting in ♥` | `hey, {host}! ♥ hi hi` |

Baby and child hosts (phase-5 route, `BABY["link_host"]` / `["link_guest"]`, no type, no
catchphrase):

| Stage | host | guest |
|---|---|---|
| baby | `hi hi, {guest}! ♪` / `{guest}! yay yay!` | `hi hi, {host}! ♪` |
| child | `hi, {guest}! hello ♪` | `hi hi, {host}! ♪` |

Line count: 3 per type x 8 types = **24 type lines** (3 each: mellow 3, sweet 3, bouncy
3, starry 3, old_soul 3, fancy 3, charming 3, plucky 3), plus 5 baby/child lines (baby 3, child 2); 45 lines with 2b.

### 2b. Kindred extras (new key `link_kindred`)

One extra line from the host, after the greeting, only when the pair is kindred.
Written in the host's type, so it works with either partner of the pair; twins pick from
the same two lines (an open question in the build report: the first sketch meant twins to
use the first line). Two per type = **16 lines**.

| Type | Kindred lines (to its partner, `{guest}`) |
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
- Run over all 45 lines by the copy test, `tests/js/link_lines.test.js`.
- No catchphrase on baby lines. Teen/adult link lines may take it only through the
  normal `_speak` path (every third voiced line, `catch: true`); the host's bubble
  line does not pass `catch` today and the sketch keeps that.

## 3. As built

The plan review (s2576) found the first sketch's timing and test names wrong; this is the
build, with its fixes.

- **Where:** `_linkStart`. Every roll is made at the start, before any timer:
  - host line `_lines(host, "link_host", normal, guestName)`, guest reply
    `_lines(guest, "link_guest", normal, hostName)`: each pet speaks as itself (its baby
    talk, its type on the fair coin, or the shipped normal line). Mixed voices are fine
    (FM, review #15): a child host with an adult guest gets a baby line and a typed reply.
  - kindred: `_typeKey(s)` is the personality key of a teen/adult that `PERSONA` knows, else
    null; `_kindred(a, b)` is both non-null and equal or `KINDRED[a] === b`.
  - the extra: its own roll, `Math.random() < KINDRED_ODDS` (0.5), then a pick from the
    host type's `link_kindred`. Not through `_lines` (it has no normal line). Host only,
    and never for a baby or child (no type).
- **Timing:** no fixed offset for the extra. At `t0` both host lines are queued in order:
  the greeting for 2200 ms, then the extra for 1600 ms (no extra: the greeting alone, 3400
  ms, as before). Only when the extra rolled, the hide and `_linkEnd` move ~1000 ms later
  (calm too). When the extra is said (`then`), the guest's reply bubble hides (the two
  would overlap), and if its typing runs past the planned end, the end waits for it.
- **Never after the visit:** both queued host lines carry `still: () => this._link === L`,
  so a line not said by the end (or after a swipe) is dropped. `_queue` now passes
  `still` and `then` through.
- **Card only, nothing counted** (Decided 6): no server call, no attribute, no save. The
  once-per-day link key is the only state; the kindred roll is not stored.
- **Reduced motion / quiet:** calm keeps the lines and the extra, skips the cheer and
  the hops. Quiet hours do **not** end a link (only sleep, a call, a game, a scene or the
  status do, `_linkTick`): a link at 22:00 plays, silent, as quiet hours only gate
  sound. Screen readers: the host's lines, the extra included, are announced through
  `_speak`'s status region (without the symbols); the guest's reply stays visual only
  (the visit screen is `aria-hidden`), as before.
- **Baby talk:** the baby/child sets show only with the viewer's baby talk on; off, a
  baby or child says the normal lines.
- **Checks:**
  - `tests/js/link_lines.test.js`: 8 types x (2 host + 1 guest + 2 kindred), the baby
    and child sets, 45 lines in all, the scan (no `?`, `!!`, banned words or raw
    placeholder), the names said, `KINDRED` symmetric and the four pairs.
  - card-check `infrared`: a mellow host and sweet guest with every roll 0: the type
    greeting, the extra said and announced inside the visit (normal and calm), none
    after a swipe away and back. The "both pets speak" check now asks only for the names.
  - bench: `link.rolls` (what `Math.random` gives `_linkStart` first) and `link.say`
    (`"host"` / `"extra"`, said through the card's own `_sayQueued`, the visit held).

## 4. Owner questions (answered 2026-11-01)

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

Answers (owner, 2026-11-01): 1 both tiers; 2 all 45 lines approved verbatim, none cut;
3 one in two; 4 the "hi hi" family for babies and children, no extra before teen; 5 the
host only.
