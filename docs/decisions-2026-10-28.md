# Decisions taken up front (owner, 2026-10-28)

Answers to the decisions the remaining work was expected to need, so the crew can
build without stopping. The plans they belong to stay the source of detail; where a
plan's open question is answered here, this file wins.

## Releases
- The phone test is no longer a release gate. It's a running list of things to try on
  the iPhone and Android apps (the owner's tududi task), followed up later.
- **0.35.0** ships as a full release once privacy P1 is merged.
- No beta per merged PR; one release at the end of the current work (owner,
  2026-10-28, replacing "each merged PR a beta").
- The photo dialog's Android line ("you can save it from a computer") ships now
  rather than waiting for the phone test.

## Balance (experience plan, Wave 0)
- A daytime nap needs tiredness (energy below the nap threshold) or to be within an
  hour of bedtime; otherwise "not sleepy yet ♪". The house still puts it to bed at night.
- A missed need calls again after 4 hours, only to people with "notify me" on. How the
  re-call reaches phones (owner, Wave 0 Q1): one bundled normal push at most every
  4 hours per person, naming every pet still asking ("Pip and Mochi would like a visit").
- Poop calls stay on the card and the sensors but send no phone push (owner, Wave 0 Q4).
- Upbringing rework: pets that are babies or children when it lands blend from now
  (their averaging starts from today's discipline and care); no pet drops a grade
  because the rules changed.
- Snacks are refused when the pet is full, with the existing "I'm full!".

## The pet, games and settings
- A pat gives one light haptic buzz where supported.
- Catch rewards like the other games (happiness and energy scaled by the score) and
  keeps a per-pet best score in the journal.
- The slower game is **memory pairs** (flip cards to match the pet's things, limited
  flips). A design note comes to the owner before it's built; best play wins 70-80%.
- Settings open from a gear button on the status screen.

## Diets, art, README
- "No mammals" is a per-pet option in the integration's options, on by default.
  Realistic favourite snacks when it's off: owl mice, voles, moths; ball python mice,
  rats, quail eggs; fox mice, blackberries, beetles. Others unchanged.
- The optional 12-frame adult-reactions art slice is drawn for the Douglas squirrel first.
- The README redo (Tamagotchi box style, no spoilers) happens at the very end.

## Privacy and the card
- Q11: the last zone is kept only while "my day" is on (owner: first mate's
  recommendation).
- The discipline bar keeps its label (owner: first mate's recommendation; the guide
  says it's today's).

## How the crew works with the owner
- The first mate approves all wording, the pet's lines included, in the existing
  voice and rules (positive or quiet, no guilt or nagging, no ranking, wishes credit
  nobody) (owner, 2026-10-28, revised the same day). A PR that adds many new pet
  lines gets a short summary for the owner to skim afterwards; nothing waits on it.
  Art (probes and look) still goes to the owner.
- Balance: fake-call disguise accepted as unsure only while happiness is 25-40 (the
  guide says whines and real pleas "often look alike"); hours lived before the
  upbringing rework count at half weight. Re-call phone notifications: decided after the several-pet evaluation (bundled, above); the
  owner asked for an evaluation with several pets before choosing.
- Audit findings with a clear fix that matches recorded decisions are fixed without
  asking; only genuinely new design choices go to the owner.
- The remaining personality pieces (P2b idle and mood lines, P3 idle manner, P4
  Assist) build after Wave 2.
- Push notifications to the owner for: art probes to approve, full releases, and
  questions that block work.
