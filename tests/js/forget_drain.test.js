// B1, global (docs/plan-2026-11-06-director-migration.md 5.14, 7.3): `_forget(s)` is one `detach` plus the named
// closers. On the timer_trace.js sandbox (fake clock, the real director and the card's own _forget and ledger
// adapters; every other card method a silent stub). It pins: (1) the four keys that used to have a dead
// clear in _forget (breezy, lit, flair, status.note) are gone with their class or node and pending(s) is 0;
// (2) the card scope is untouched by the forget; (3) the manual closers (_layDrop, _clearNameTimers,
// _shellSettled) clear the fields the ledger cannot see; (4) after the longest delay of the trace nothing
// changes on the next pet; (5) the one disclosed exception, the answer resend (_keepAnswer, R78), is not on the
// ledger and still fires after a forget. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const SPEC = { methods: ["_forget", "_layDrop", "_clearNameTimers", "_shellSettled"], screen: true };

// A slide with a status page note, as _statusMessage's hide sees it.
function withNote(w) {
  const note = w.el("note");
  note.hidden = false;
  note.textContent = "saved";
  const status = w.el("status");
  status.querySelector = (q) => (q === ".status-feedback" ? note : null);
  w.slide.status = status;
  return note;
}

// The arming each key has in its own part (card-moment fan, card-tick _backlight, card-flair, card-journal _statusMessage).
function arm(w) {
  const { card, slide: s } = w;
  const note = withNote(w);
  const hide = () => { note.hidden = true; note.textContent = ""; };
  card._hold(s, s.screen, ["breezy"], 2600, { key: "breezy" });
  card._hold(s, s.screen, ["lit"], 3000, { key: "lit" });
  const box = w.el("flairbox");
  box.cls.add("flair");
  s.screen.append(box);
  card._later(s, 4200, () => box.remove(), { key: "flair", undo: () => box.remove() });
  card._later(s, 3500, hide, { key: "status.note", undo: hide });
  return { note, box };
}

test("a forget takes the four keyed leftovers away at once and leaves the ledger empty for the slide", () => {
  const w = world(SPEC);
  const { card, slide: s, director } = w;
  const { note, box } = arm(w);
  assert.strictEqual(director.pending(s), 4);
  card._forget(s);
  assert.strictEqual(director.pending(s), 0);
  assert.ok(!s.screen.cls.has("breezy"), "breezy off");
  assert.ok(!s.screen.cls.has("lit"), "lit off");
  assert.strictEqual(box.parent, null, "the flair box is removed");
  assert.strictEqual(note.hidden, true);
  assert.strictEqual(note.textContent, "");
});

test("a forget leaves the card scope as it was (boot waits, holds on the card, the head)", () => {
  const w = world(SPEC);
  const { card, slide: s, director } = w;
  card._later(card._dirCard, 5000, () => {}, { key: "boot.wait" });
  card._later(card._dirCard, 900, () => {}, { key: "head" });
  arm(w);
  const before = director.pending(card._dirCard);
  assert.strictEqual(before, 2);
  card._forget(s);
  assert.strictEqual(director.pending(card._dirCard), before);
});

test("the manual closers clear what the ledger cannot see", () => {
  const w = world(SPEC);
  const { card, slide: s, director } = w;
  const { setTimeout } = w.sandbox;
  let fired = 0;
  s.layAt = { generation: 1 };
  s.layTimer = setTimeout(() => fired++, 5000);
  s.nameRetry = setTimeout(() => fired++, 2000);
  s.nameBusy = true;
  s.shellPending = { finish: "x" };
  s.shellPendingTimer = setTimeout(() => fired++, 8000);
  assert.strictEqual(director.pending(s), 0, "they are not on the ledger");
  card._forget(s);
  assert.strictEqual(s.layAt, null);
  assert.strictEqual(s.nameRetry, null);
  assert.strictEqual(s.nameBusy, false);
  assert.strictEqual(s.shellPending, undefined);
  w.run(10000);
  assert.strictEqual(fired, 0, "none of the three waits fires after the forget");
});

test("after the longest delay of the trace nothing changes on the next pet", () => {
  const w = world(SPEC);
  const { card, slide: s, director } = w;
  const { setTimeout } = w.sandbox;
  arm(w);
  s.reloading = true;
  s.layTimer = setTimeout(() => {}, 5000); // the lay wait re-arms every 5 s while reloading, to NAME_WAIT_MAX_MS
  card._forget(s);
  const snap = () => JSON.stringify([[...s.screen.cls].sort(), s.screen.children.length, s.screen.style, w.log.length]);
  const before = snap();
  const longest = Math.max(4200, 8000, 5000) + 500; // the flair 4.2 s, the shell wait, the lay wait
  w.run(longest);
  assert.strictEqual(snap(), before, "no class, style, child or log line after the forget");
  assert.strictEqual(director.pending(s), 0);
});

test("the disclosed exception: the answer resend is not on the ledger, so a forget does not stop it (R78)", () => {
  const w = world(SPEC);
  const { card, slide: s, director } = w;
  const { setTimeout } = w.sandbox;
  let line = 0;
  setTimeout(() => line++, 1500); // _keepAnswer's retry closure: a bare setTimeout that uses `s`
  assert.strictEqual(director.pending(), 0);
  card._forget(s);
  w.run(2000);
  assert.strictEqual(line, 1, "today's behaviour: the line appears after the forget (a known hole, not guarded)");
});
