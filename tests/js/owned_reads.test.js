// Who owns the screen (docs/plan-2026-11-04-shell-modes.md 3.7, slice 1 acceptance 3): "may this
// happen now" asks the card's _owned(s), a game or a shell mode, never s.game alone, so a mode that is
// not a game keeps moments, visitors, wander, scenes and the link off too. Every read of a `.game` field
// outside the game parts is on the list below, with its reason. node --test tests/js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "..", "src", "card");
// The game parts read their own state as they like. So does shell-modes.js, but only its game entries
// (shellGame, slice 2: a slot function is the game's copy of its own state, plan 3.1); the node test in
// shell_modes.test.js holds the rest of that part to "no game words".
const GAME_PARTS = new Set(["card-games.js", "card-board.js", "card-flair.js", "shell-modes.js"]);

// [file, a snippet of the line, why it stays a game read]
const ALLOWED = [
  ["card-base.js", "return !!s?.game ||", "_owned itself"],
  ["card-base.js", "if (s.game) this._endGame(s, null);", "an exit site: the card's teardown ends the game (3.5)"],
  ["card-build.js", "else if (s.game) this._quitGame(s, this._quitLine(s));", "an exit site: Escape quits a game or the picker (3.5)"],
  ["card-build.js", "this._pickGame(s, b.dataset.game)", "the picker button's data attribute, not the slide"],
  ["card-build.js", "if (s.game?.picking) {", "the picker's own exit: a tap outside its list closes it (3.5; the picker is not a mode)"],
  ["card-build.js", "if (s.game?.picking) this._hopRowRefresh(s)", "the picker's own Hop row (D2: the picker is not a mode)"],
  ["card-build.js", "if (s.game) this._endGame(s, null);", "an exit site: _forget ends the last pet's game (3.5)"],
  ["card-build.js", "if (x.game && i !== to) this._quitGame(x, null);", "an exit site: a slide change quits the game (3.5)"],
  ["card-layout.js", "if (s.game?.picking) this._fitPicker(s);", "the picker's own fit (D2)"],
  ["card-layout.js", "if (s.game && (asleep || egg)) this._endGame(s, null);", "an exit site: asleep and egg end a game (3.5); the sitter does not (6.1)"],
  ["card-layout.js", "if (s.game?.prompt) this._write(s, s.game.prompt", "the game's prompt: it needs the game object"],
  ["card-layout.js", "if (open && s.game) this._quitGame(s, null);", "an exit site: the status sheet ends a game (D8)"],
  ["card-moment.js", "g.key === m.game", "a moment record's game key, not the slide"],
  ["card-moment.js", "m.game === \"dig\"", "a moment record's game key, not the slide"],
  ["card-tick.js", "const prompt = s.game?.prompt;", "the game's prompt: it needs the game object"],
  ["interaction-director.js", "{ name: \"game\", busy: (s) => !!s.game }", "the director's own game owner (mode is its own row)"],
];
// The reads slice 1 replaced with _owned (3.7); there are at least this many calls.
const REPLACED = 32;

// Comments go (a word in a comment is no read); strings stay out of the match on their own, since a
// read is `<name>.game` and a selector is `".game"`.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const READ = /\b[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.game\b(?![\w$-])/g;

// Every `.game` read in `parts` ({file: text}) that the list does not hold, as messages.
function strays(parts, allowed = ALLOWED) {
  const out = [];
  const used = new Set();
  for (const [file, text] of Object.entries(parts)) {
    if (GAME_PARTS.has(file)) continue;
    code(text).split("\n").forEach((line, i) => {
      if (!READ.test(line)) return;
      READ.lastIndex = 0;
      const hit = allowed.findIndex(([f, snippet]) => f === file && line.includes(snippet));
      if (hit < 0) out.push(`${file}:${i + 1}: ${line.trim()}: use \`_owned(s)\` or list it with a reason`);
      else used.add(hit);
    });
    READ.lastIndex = 0;
  }
  return { out, unused: allowed.filter((_, i) => !used.has(i)) };
}

const parts = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith(".js")).map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")]));

test("every .game read outside the game parts is on the list, and every listed one is still there", () => {
  const { out, unused } = strays(parts);
  assert.deepStrictEqual(out, []);
  assert.deepStrictEqual(unused.map(([f, s]) => `${f}: ${s}`), [], "a listed read is gone: take it off the list");
  for (const [, , why] of ALLOWED) assert.ok(why.length > 8, "each listed read has a reason");
});

test("the reads slice 1 replaced ask _owned(s)", () => {
  const all = Object.entries(parts).filter(([f]) => !GAME_PARTS.has(f)).map(([, t]) => code(t)).join("\n");
  const calls = (all.match(/this\._owned\(/g) || []).length;
  assert.ok(calls >= REPLACED, `${calls} _owned calls, ${REPLACED} expected`);
  assert.match(parts["card-base.js"], /\n  _owned\(s\) \{\n    return !!s\?\.game \|\| !!\(s\?\.mode && s\.mode\.owns !== false\);\n  \}/);
});

test("a new s.game read outside the list fails with the rule", () => {
  const probe = { ...parts, "card-tick.js": `${parts["card-tick.js"]}\n  _probe(s) {\n    if (s.game) return;\n  }\n` };
  const { out } = strays(probe);
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /^card-tick\.js:\d+: if \(s\.game\) return;: use `_owned\(s\)` or list it with a reason$/);
  // optional chaining and another slide's name count too; a selector string and a comment do not
  const more = strays({ "card-x.js": "a = x?.game;\nb = L.host.game\nq(\".game\")\n// s.game\nc = s.gameBox;" }).out;
  assert.strictEqual(more.length, 2, more.join("\n"));
});

test("the game parts themselves are not scanned, and card-mode has no read at all", () => {
  assert.ok(/s\.game/.test(parts["card-games.js"]) && /s\.game/.test(parts["card-board.js"]));
  assert.doesNotMatch(code(parts["card-mode.js"]), READ);
});
