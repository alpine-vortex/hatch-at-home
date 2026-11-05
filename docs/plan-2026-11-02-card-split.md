# Plan: split the card into `src/` parts joined into the same file (2026-11-02)

Status: plan only; no code changes. The move itself is ONE later ship (tier 1).
Direction (from the task brief; the first mate records the owner decision): option (c) of
the options note. Split `custom_components/virtual_pet/frontend/hatch-pet-card.js`
(12,822 lines, 394 commits touching it in the last month) into parts under `src/`, joined
by a small no-dependency node script into the SAME shipped file: unminified, same name,
same `?v=` URL, built file gitignored. esbuild may come later without re-splitting.

Evidence below was read from this tree (`origin/main` at 99e1deb2) and from a throwaway
prototype (scratchpad, not committed) that cut the file as in section 1: all 25 parts
pass `node --check`, the joined file passes it, and the joined file equals the old file
once the 15 wrapper pairs are stripped (checked byte for byte). `scripts/bench.js --preset
ui` renders all 16 shots with the joined file; 7 PNGs differ from the old card's, but the
old card differs from itself the same way on a second run (animation timing), so that is
noise. Behaviour proof is the move ship's gate, not this plan.

## 1. Parts, in join order

Class: ~540 methods, no `super`, no constructor, no `this.constructor`, no `#private`, no
prototype tricks. Only `static getStubConfig/getConfigElement` (3984-3991), one `set hass`
in the card class (4015; the editor class has its own at 12722, in part 24) and 6 arrow
fields (`_onHidden`, `_onReady`, `_onSharedEvent`, `_onSharedStorage`, `_onMono`,
`_onMonoStorage`). Statics are
set after the class (12785-12797: `HatchPetCard.findsShown = ...`), and top-level code
names the class twice (784 `HatchPetCard.findsShown`, 12806 `customElements.define`).

**Decision: extends-chain** (`class HatchPetCardBuild extends HatchPetCardBase`, ..., the
last link named `HatchPetCard`), not mixins. Why:
- A cut at a method boundary adds two lines per seam and changes no method. A mixin
  (`Object.assign(proto, { m() {}, ... })`) needs a comma after every method, so each part
  is rewritten, not cut, and the "byte-identical" review is lost.
- `Object.assign` copies the `set hass` accessor by calling it. It needs
  `defineProperties` and special cases. A chain inherits accessors and statics as they are.
- Arrow fields (`_onHidden = () => ...`) are initialised per instance by the class that
  declares them. A mixin has no constructor to run, so they would move into `connectedCallback`.
- `customElements.define("hatch-pet-card", HatchPetCard)` keeps working: only the last link
  is defined and instantiated. The earlier links are never used alone.
- Cost: 16 links deep. V8 caches prototype lookups; the card is not a hot loop. Stack
  traces show `HatchPetCardLayout._x` (a plus: they name the area).

Seams were taken from the file's own `// ---` markers and method groups, snapped up over
the comment block above the method. Ranges are in the OLD file.

| # | part (`src/card/...js`) | old lines | size | holds |
|---|---|---|---|---|
| 1 | prefs | 1-433 | 433 | VERSION, icons, actions, games, sound/lcd/mono/shared prefs, chirps |
| 2 | world | 434-970 | 537 | odds, ms, flair, SEASONS, hanukkah, turn/visitor day, once-per-day, season helpers |
| 3 | lines | 971-1309 | 339 | poses, wishes, BABY, PERSONA |
| 4 | lines-fresh | 1310-1723 | 414 | the "fresh-expand copy" block (has its own end marker) |
| 5 | ui-copy | 1724-2383 | 660 | screen copy, kindred, follow text, QUESTIONS, notes, dreams, moment consts, helpers |
| 6 | shell-data | 2384-2688 | 305 | moulded shell, finishes, traits, server clock, `timeAgo` |
| 7 | style | 2689-3982 | 1294 | `STYLE`, `SCENE_STYLE` (CSS strings) |
| 8 | card-base | 3983-4405 | 423 | setConfig, hass, connect, channel, finding pets |
| 9 | card-build | 4406-5303 | 898 | `_build`, `_buildSlide`, low battery, power-on, `_update`, `_forget`, `_go` |
| 10 | card-layout | 5304-6147 | 844 | `_layout`, `_mould`, `_renderShelf`, `_dress`, `_renderSlide`, `_say`, frames |
| 11 | card-tick | 6148-6998 | 851 | `_tick`, ghosting, idle, tricks, promise, `_speak`, `_pat`, `_sayLine` |
| 12 | card-looks | 6999-7507 | 509 | `_firstLook`, follow-ups, gifts, welcome, wishes |
| 13 | card-visit | 7508-8100 | 593 | `_catchUp`, greet, `_visit`, `_ask`, hearts, chirp, fx |
| 14 | card-moment | 8101-8706 | 606 | `_moment`, `_care`, dreams, night/meal, `_react` |
| 15 | card-status | 8707-9218 | 512 | `_renderStatus`, `_renderSettings` |
| 16 | card-sheets | 9219-9821 | 603 | shell picker, lay sheet, name sheet, `_set*` |
| 17 | card-journal | 9822-10441 | 620 | journal, photos, every world, finds page |
| 18 | card-actions | 10442-10787 | 346 | actions, care scenes |
| 19 | card-games | 10788-11296 | 509 | games, dig |
| 20 | card-season | 11297-11691 | 395 | seasons, party, costume |
| 21 | card-visitors | 11692-12175 | 484 | world visitors, basket, reveal |
| 22 | card-link | 12176-12497 | 322 | infrared link |
| 23 | card-flair | 12498-12719 | 222 | trait flair, quit/end game; ends the class (`HatchPetCard`) |
| 24 | editor | 12720-12783 | 64 | `HatchPetCardEditor` |
| 25 | boot | 12784-12822 | 39 | statics on the card, `customElements.define`, `customCards`, banner |

Only `style` is over 1,000: one CSS template literal, which cannot be cut without editing
code. Accept it as the one exception; a later ship may split it into `STYLE_A + STYLE_B`.
Class parts keep their class lines inside the part: `class HatchPetCardBuild extends
HatchPetCardBase {` first, `}` last, so each part is valid JS for `node --check`.
Part names are stable; the migration script holds the anchors (section 6), the repo
holds only parts. Parts can be merged later at no cost.

## 2. Where it lives and the join script

- `src/card/` at the repo root, plus `src/card/manifest.txt` (one filename per line, join
  order). Not under `custom_components/`: that tree is the release zip, and sources there
  would ship (~700 KB twice). `.github/` and hassfest never look at `src/`.
- `scripts/build-card.js`, plain node, no dependencies, ~60 lines. It:
  1. reads the manifest and fails if a listed file is missing or a `src/card/*.js` file is
     not listed (a forgotten part must not drop silently);
  2. fails if a part does not end with `\n` (concatenating "as they are" would glue a
     comment line to the next part's first line without a sound);
  3. writes `// GENERATED by scripts/build-card.js from src/card/. Edit src/, not this
     file.` plus a blank line, then the parts concatenated as they are, `\n` endings;
  4. writes to a temp file and renames it (two scripts building at once never leave half a
     file), and leaves the file alone if the bytes are unchanged;
  5. exports `join()` (the text, no file) and `ensureBuilt()`, so other scripts and tests
     call it. `ensureBuilt()` **always joins and byte-compares with the built file; it never
     looks at mtime.** If the file differs it is rewritten, and when the old content is not
     an older join of the parts (someone edited the built file by hand) it prints
     `built file was edited by hand; overwritten` to stderr. Why not mtime: a hand edit to the
     gitignored output is newer than the parts, would never be rebuilt, tests and card-check
     would pass on it, `git status` stays clean, and the gate marker (keyed on
     `HEAD^{tree}`, i.e. the parts) would vouch for a card that is not their join. The same
     goes for switching a worktree between a pre-move and a post-move branch, which restores
     an old card with a newer mtime. A join plus compare is cheap.
  The per-part `node --check` runs only when the output is rewritten (or use
  `new vm.Script(text)` in process), not on every call: 25 spawns cost about a second.
- `build-card.js --where <line>` prints the part and offset for a line of the BUILT file
  (the "GENERATED" header adds 2 lines, so console stacks and card-check failures point at
  the built file, not at a part). `split-card.js --where` (section 6) is for the old file
  only and goes away with it.
- The header is static: no date, no sha. The output is deterministic (needed by section 4;
  acceptance check 8 verifies it).
- `--watch` (fs.watch, no dependency) for development; HA still needs a restart, as today.
- `.gitignore`: the built path, and the move commit also runs `git rm --cached` on it (an
  ignore entry alone leaves the old file tracked). Git history keeps the old file: `git show v0.37.0:...`
  in card-check's `oldcard` section is untouched.

## 3. Everything that needs the built file

Rule: every entry point that reads or serves the card calls `ensureBuilt()` (cheap when
nothing changed), so a fresh worktree or a forgotten build never gives a stale or missing
card. Python and shell entry points run `node scripts/build-card.js` first.

| Place | Today | Change |
|---|---|---|
| `scripts/test` | ruff, pytest, `node --test` | build first line (`scripts/test "$@"` hands args to pytest, so a filter that deselects everything skips the conftest fixture; the explicit line removes that dependency) |
| `tests/conftest.py` | none | session autouse fixture runs the build (bare `pytest`, `test_init.py:285,381`, `test_shell.py:60`). pytest now needs `node` on PATH: fail with "node required to build the card", not a confusing error (CI and spacer have node) |
| `tests/js/*.test.js` (13 files read the source by regex: collection, dream_lines, find_lines, finds_shown, fresh_copy, gift_lines, grows_up, link_lines, promise, sleep_line, turn_pick, visitor_day, winter_lights; `finds.test.js` reads only worlds.json; `scripts/copy-scan.js` takes the text as an argument, so only `fresh_copy.test.js` feeds it the card) | `fs.readFileSync(card)` | decision in section 5 |
| `scripts/gate` | runs `scripts/test`, then starts `$HASS` directly (never `scripts/develop`), then card-check | add an explicit `node scripts/build-card.js` line before starting HA; today the build would only happen as a side effect of the pytest fixture |
| `scripts/ci-gate` | triggers the Validate workflow | no change; the workflow builds |
| `.github/workflows/validate.yml` | `node --check card` (line 43) | `tests` job: `scripts/test` (line 42) already builds via conftest; `node scripts/build-card.js` replaces line 43 (it checks). `card` job: `scripts/develop` builds before `exec hass`; card-check's own `ensureBuilt()` may race it on the first write, and the atomic rename covers that. `hacs` and `hassfest` jobs do not need the build |
| `.github/workflows/release.yml` | zips `custom_components/virtual_pet` | build before "Zip"; then fail if the zip lacks the card. The zip is made from inside the component dir (`cd custom_components/virtual_pet && zip -qr ...`), so the entry is `frontend/hatch-pet-card.js`: `unzip -p virtual_pet.zip frontend/hatch-pet-card.js > card.js && node --check card.js && test $(wc -c < card.js) -gt 100000` (a temp file, not `/dev/stdin`; a wrong entry name emits nothing and an empty input passes `--check`, so the size test is what bites) |
| `scripts/develop` | symlinks the component dir, starts HA | build before `exec hass` (the symlink makes each worktree serve its own build) |
| `scripts/bench.js`, `dev/bench/server.js`, `index.html:27` | serve `frontend/hatch-pet-card.js` | `ensureBuilt()` at the start of `bench.js` |
| `scripts/card-check.js` | reads the card source at 15 sites (:1126, 3258, 3528, 3792, 4625, 4885, 4963, 5308, 6254, 6927, 7060, 9619, 9994, 10224, 11707, and the served-file route at 13489); `:13475` is `git show ${tag}:...` (old release card, untouched) | one `ensureBuilt()` at the start covers all of them |
| `scripts/costume-preview.js` (:25, :40), `scripts/readme/shots.js` (:68) | read the file | `ensureBuilt()` at the start |
| `scripts/pick-sections` (:23, :73) | diffs the card file by line number | see below |
| `.github/`, `art/`, `docs/` prose | `art/shell-parts/*`, `dev/bench/page.js` and `bench.js` mention the file name in comments only | none; step 3 of the acceptance checks greps all of them |
| hassfest, `hacs/action` | not seen to read the card | none expected; the move's CI run confirms |

`pick-sections` must read the parts: take the changed `src/card/*.js` files from the diff,
compute `method_at` per part (a method sits inside one part), and search callers in the
joined text. Sections get better targeted, since a part is an area. Details (the script
sends any file it does not know to `all`, "unknown to the map"):
- `src/card/*.js` gets its own branch; `src/card/manifest.txt`, `.gitignore` and
  `.git-blame-ignore-revs` are non-card (no section); `scripts/build-card.js` is already
  covered by the `scripts/` branch.
- `changed_lines(f)` gives line numbers of the PART, so `method_at` and the `used`-name scan
  of the changed line read that part, while the callers search (`this.name(`) reads the
  joined text.
- The move ship's own pick is `all` anyway, so this is tested on the next ship (acceptance 9).

**Git-branch installs get no card.** HACS installs the release asset only (`hacs.json`:
`zip_release: true`, `filename: virtual_pet.zip`; README step 1 says "download in HACS"),
and `release.yml` zips after the build, so HACS users are safe. A user who copies
`custom_components/` from a branch, a git clone, or GitHub's "Source code" archive gets
no card (404 on the dashboard). Answer, no committed build:
- `async_setup` logs one `_LOGGER.error` when the card file is absent, naming
  `node scripts/build-card.js`. This is a separate small edit in the move ship: s2700's
  `_card_hash()` catches the missing file but logs it at `debug` only, so the ship worker
  must not assume s2700 already warns;
- the release guard above, so a release can never ship without the card;
- one line in `docs/guide.md`'s dev section; README stays HACS-only.
The owner's own HA gets the card from the release zip only (open question 2), so it is not a
caller of the build. Committing the build on release tags only was rejected: it needs a bot commit and a
second tag, and the zip already carries the build.

## 4. Content-hash URL (s2700, `crew/hatch-at-home-s2700-card-url-carries-a-content-has`)

Unmerged; it touches `__init__.py` and `tests/test_init.py` only. `_card_hash()` takes the
first 8 hex of the sha256 of `frontend/hatch-pet-card.js` once, in `async_setup`, and puts
`?v=VERSION-hash` on the URL. It hashes bytes on disk, so it works on the built file
unchanged, provided the build is deterministic (section 2) and the file exists when HA
starts (`scripts/develop`, the test fixture and the release build all build first). A part
change changes the hash, so dev gets a fresh card without a version bump. Its tests fetch
the card, so they need the conftest build. No conflict with the move: merge s2700 first.

## 5. JS tests: read the joined text, not the files

The 13 tests slice the source by regex (`promise.test.js:9-14`) and run it in `vm`. Pick:
**the joined text, via `tests/js/card-source.js`** (`module.exports =
require("../../scripts/build-card.js").join()`). Each test changes one line (`const src =
require("./card-source")`). Why: the regexes keep matching, with the same multi-part
patterns, so only the one line changes; the tests exercise the exact bytes that ship; no
build or file state is needed. Reading single parts would tie each test to a part name
that may move. `tests/test_shell.py:60` reads the built file (conftest builds it).

## 6. Migration: one mechanical ship

Preconditions:
- List the live card branches. **"Live" = branches of crew workers still open on the board
  at move time, plus any branch the first mate names.** The board is the authority for
  running ships. Test each such branch with a patch-id check, not ancestry:
  `git cherry origin/main <branch>`; a branch with no `+` line is already in main (rebuilt,
  cherry-picked or squash-merged work counts as merged), a `+` line is a commit still to
  land. Do NOT use `git branch -r --merged origin/main` or `git merge-base --is-ancestor`:
  crew branches are squash/ff-merged, so ancestry never clears them (run on this repo it
  left about 20 stale `crew/...-s2446...s2586`, `fm-*`, `ccr-*` branches). To find which
  of the named branches touch the card at all:
  `git diff --quiet "$(git merge-base origin/main $b)" $b -- custom_components/virtual_pet/frontend/hatch-pet-card.js || echo $b`.
  s2700 does not touch the card.
- `origin/main` gated (marker present), so the baseline is known good.
- Not mandatory: stragglers can be ported with the recipe below.

The cut is a script, `scripts/split-card.js`, kept in the repo until the last in-flight
branch is ported, then deleted. It holds the seam anchors **by text, not line number** (e.g.
`/^  \/\/ --- Building/`, `/^  _layout\(/`, `/^const FEED_FULL_AT/`), so it works on any
version of the file. It cuts, snaps each seam up over the comment block above it, wraps
the class parts, and writes `src/card/*.js` and `manifest.txt`. Nobody edits parts by hand
in the move.

Acceptance checks (the reviewer can rerun each):
1. `scripts/split-card.js --verify <old-sha>`: rebuilds, strips the wrappers
   (`/\n\}\n\nclass \w+ extends \w+ \{\n/g` becomes `\n\n`, the first class name goes back
   to `HatchPetCard`, the header line goes) and prints `identical` for the old file at
   `<old-sha>`. The only differences from the old file are the header, 15 wrapper
   pairs and one class name.
2. `scripts/build-card.js` passes `node --check` for every part and the output; 25 parts;
   all under 1,000 lines except `style`.
3. `git grep -n 'hatch-pet-card.js' scripts tests dev .github art docs`: every hit is in a
   file section 3 names, each handled (card-check alone has 17 hits in one file; prose hits
   in `art/` and `docs/` are harmless).
4. `scripts/test` green from a fresh worktree with no built file (proves `ensureBuilt`).
5. `scripts/ci-gate` full: hassfest, HACS, tests, all five card-check shards. Bench
   presets `shells`, `ui`, `species` render; compare shots by eye or with tolerance
   (byte-compare is noisy).
6. The release steps run locally (build, zip, guard): the zip holds the card.
7. `.git-blame-ignore-revs` gets the move commit (`git config blame.ignoreRevsFile`),
   so `git blame` on the parts looks through the move.
8. Determinism: build twice, and in two worktrees, and compare sha256; they match. Also
   hand-edit the built file and run `scripts/test`: it is overwritten with the stderr
   warning (the F2 guarantee).
9. After the move, on the next ship: edit one method in a part and run
   `scripts/pick-sections`; it prints a narrow list, not `all`.

**Porting an in-flight branch B** (merge-base M with the pre-move main):
`scripts/split-card.js --port M B` splits the old card at M and at B with the same
anchors into two temp trees, diffs them part by part, and applies each diff to
`src/card/<part>` with `git apply --3way`. Hand version: `git show M:<card>` and
`git show B:<card>` into two files, run `scripts/split-card.js --out dirM fileM` and `--out
dirB fileB`, then `git diff --no-index dirM/<part> dirB/<part> | git apply --3way
--directory=src/card -p...` per part. An old-file hunk at line N belongs to the part whose
range in section 1 contains N (for any base, `split-card.js --where <file> <line>` prints
part and method). Then rebase B onto the move commit with its card edit already ported,
and drop B's edit to the old path.

## 7. Doc updates (in the move ship)

- `AGENTS.md`: a "The card is built" section: the card is `src/card/*.js` joined by
  `scripts/build-card.js`; edit parts, never the built file; add a new part to
  `manifest.txt`; the order in `manifest.txt` is load order (a reorder can hit a TDZ error that
  only card-check shows, since `node --check` sees syntax only); the build runs from test, gate, develop, bench and card-check by itself,
  and by hand for a quick look: `node scripts/build-card.js`; the area-to-part table from
  section 1 (this is the "where does X live" map). The existing card-check and bench
  paragraphs stay.
- `docs/guide.md:1116` (release: "bump ... `frontend/hatch-pet-card.js`" becomes `src/card/prefs.js`;
  VERSION and BOOT_VERSION live there) and its dev section (git installs need the build).
- `docs/features.md:12` (shorthand "card" = `src/card/`), `docs/HANDOFF.md:567`,
  `dev/bench/README.md`. Older plans cite `hatch-pet-card.js:NNN`; leave them, they are
  history. `README.md` is player-facing and needs nothing.

## Open questions: answered (owner/FM 2026-11-02)

1. **Merge s2700 (content-hash URL) before the move?** Decided: yes, merge s2700 first. It
   is independent, Python-only, and works on the built file unchanged.
2. **How does your own HA get the card?** Decided: from the release zip only (HACS). A branch
   copy would need one build command (the error log in `async_setup` names it).
3. **`style.js` at ~1,300 lines as the one oversize part?** Decided: OK for now; split the
   CSS in a later small ship if it bites.
4. **Freeze card branches for the move, or port stragglers?** Decided: no freeze; run the move
   right after a merged batch and port stragglers with `--port` (live branches are listed as
   in section 6).
5. **Keep `scripts/split-card.js` after the move?** Decided: keep it until every branch open
   at the move is ported or merged, then delete it in a cleanup commit.
6. **Minify in release later?** Decided: no minify now. esbuild can minify the built file as
   it is (a plain script), in `release.yml` only, with no further split, if ever wanted.

## Review (adversarial, s2704) folded in 2026-11-02

Findings F1-F6, F8 and nits N1-N3 are in sections 2, 3 and 6 above; F7 is the live-branch
rule in section 6. N4 (`git rm --cached`) and N7 (manifest order is load order) went in as
one-liners; N5 and N6 confirm the plan and need no change.
