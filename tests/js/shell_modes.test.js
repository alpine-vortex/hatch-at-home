// Shell modes slice 1 (docs/plan-2026-11-04-shell-modes.md section 6, acceptance 1, 2 and the tint's
// specificity in 3.3): the table's schema, the engine part's "no game words" rule, and the engine run on
// a fake shell with probe modes that link no game. The DOM side is card-check's `shellmode` section.
// node --test tests/js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const src = require("./card-source");
const dataPart = read("src/card/shell-modes.js");
const enginePart = read("src/card/card-mode.js");
const konst = (name) => src.match(new RegExp(`\\nconst ${name} = [\\s\\S]*?\\n\\};?\\n`))[0];

// The data part and the engine part, run with the few card names they use.
function load({ calm = false } = {}) {
  const ctx = { console, calm: () => calm, Date, setTimeout: () => 0, clearTimeout: () => {} };
  const prefs = ["ICON_PATHS", "ACTION_ICONS", "GAME_COPY"].map(konst).join("") + src.match(/\nconst GAME_IDLE_MS = .*\n/)[0] + src.match(/\nconst ACTIONS = \[[\s\S]*?\n\];\n/)[0];
  const helpers = ["pixelIcon", "icon"].map((n) => src.match(new RegExp(`\\nfunction ${n}\\([\\s\\S]*?\\n\\}\\n`))[0]).join("");
  const owned = src.match(/\n {2}_owned\(s\) \{[\s\S]*?\n {2}\}\n/)[0];
  vm.runInNewContext(`const BASE = "/b"; const VERSION = "t";${prefs}${helpers}${dataPart}
    class HatchPetCardActions {
      _tapped(b) { (this.log ||= []).push(["tapped", b.dataset.action]); }
      _sceneEnd(s) { s.scene = null; (this.log ||= []).push(["sceneEnd"]); }
      _toggleStatus(s) { s.statusOpen = !s.statusOpen; (this.log ||= []).push(["status"]); }
      _rimCue() { (this.log ||= []).push(["rim"]); }
      ${owned}
    }
    ${enginePart}
    this.out = { SHELL_MODES, SHELL_TINTS, SHELL_SLOTS, SHELL_EXIT_ON, shellCheck, shellFreeze, shellIcon, shellText,
      ACTIONS, GAME_COPY, Card: HatchPetCardMode };`, ctx);
  return ctx.out;
}
const M = load();

// ---- a fake shell: eight buttons with what _paintCaps writes ----

function fakeButton(action, root) {
  const attrs = new Map();
  const classes = new Set();
  const cap = { innerHTML: "" };
  const caption = { textContent: "" };
  return {
    dataset: { action }, disabled: false, cap, caption, attrs, classes,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    children: [cap, caption], querySelector: () => cap,
    focus() { root.activeElement = this; },
  };
}

function shell() {
  const root = { activeElement: null };
  const card = new M.Card();
  card.shadowRoot = root;
  const keys = [...M.ACTIONS.map((a) => a.key), "lights"];
  const buttons = Object.fromEntries(keys.map((k) => [k, fakeButton(k, root)]));
  const devClasses = new Set();
  const props = {};
  const all = Object.values(buttons);
  const s = {
    buttons, careTaps: keys.map((k) => () => (card.log ||= []).push(["care", k])),
    device: { classList: { add: (c) => devClasses.add(c), remove: (c) => devClasses.delete(c), contains: (c) => devClasses.has(c) },
      style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } },
    devClasses, props, modeLive: { textContent: "" }, el: { contains: (x) => all.includes(x) },
    screen: { classList: { contains: (c) => c === "show-status" && !!s.statusOpen } },
  };
  card._paintCaps(s, card._careRest());
  return { card, s, root, all };
}

// A care state as _update builds it (feed unavailable, clean wanted, the lights out).
function care(card, patch = {}) {
  const c = card._careRest();
  c.clean = { ...c.clean, wanted: true, desc: "wanted now" };
  c.lights = { ...c.lights, on: true, icon: "icon_lights_on", cap: "wake", title: "Lights on: wake the pet" };
  for (const [k, v] of Object.entries(patch)) c[k] = { ...c[k], ...v };
  return c;
}

// The probes: no game linked to any of them (the test supplies them; the table names only shipped modes).
const exits = [];
function probe(over = {}) {
  const act = (name) => (card, s) => exits.push(["act", name]);
  return {
    id: "probe", tint: "game", announce: "probe on",
    slots: [
      { icon: "icon_mode_left", cap: "back", aria: "go back", act: act("back") },
      null,
      { icon: "✦", cap: (s) => `star ${s.stars || 0}`, aria: (s) => `star, ${s.stars || 0} left`, act: act("star"), on: (s) => !!s.armed },
      { icon: "icon_mode_right", cap: "next", aria: "go on", act: act("next"), enabled: (s) => !s.blocked },
      null, null, null,
      { icon: "✕", cap: "done", aria: "done", act: (card, s) => card._modeExit(s, "quit") },
    ],
    exit: { slot: 8, escape: true, status: "end", idleMs: 60000, on: ["asleep", "egg"] },
    onExit: (card, s, reason) => exits.push(["exit", reason]),
    ...over,
  };
}
const state = (b) => ({
  disabled: b.disabled, label: b.getAttribute("aria-label"), title: b.getAttribute("title"), hidden: b.getAttribute("aria-hidden"),
  blocked: b.getAttribute("aria-disabled"), pressed: b.getAttribute("aria-pressed"), desc: b.getAttribute("aria-description"),
  cap: b.caption.textContent, icon: b.dataset.icon, wanted: b.classes.has("wanted"), on: b.classes.has("on"),
  armed: b.classes.has("armed"), tinted: b.classes.has("tinted"),
});

// ---- acceptance 1: the table ----

const sample = { stars: 2 };
function entryProblems(m) {
  const bad = [...M.shellCheck(m)];
  const caps = m.slots.filter(Boolean).map((slot) => M.shellText(slot.cap, sample).trim());
  if (caps.some((c) => !c)) bad.push("a resolved caption is empty");
  if (new Set(caps).size !== caps.length) bad.push("resolved captions repeat");
  for (const slot of m.slots.filter(Boolean)) if (!M.shellText(slot.aria, sample).trim()) bad.push("an aria resolves empty");
  return bad;
}

test("every SHELL_MODES entry: 8 slots, captions and labels, functions, exit fields, a known tint, frozen deep", () => {
  assert.ok(Object.isFrozen(M.SHELL_MODES) && Object.isFrozen(M.SHELL_TINTS) && Object.isFrozen(M.SHELL_EXIT_ON));
  assert.strictEqual(M.SHELL_SLOTS, 8);
  for (const [id, m] of Object.entries(M.SHELL_MODES)) {
    assert.strictEqual(m.id, id);
    assert.deepStrictEqual(entryProblems(m), [], id);
    assert.ok(Object.isFrozen(m) && Object.isFrozen(m.slots) && m.slots.every((x) => x === null || Object.isFrozen(x)), `${id} frozen`);
    if (m.exit) assert.ok(Object.isFrozen(m.exit) && (!m.exit.on || Object.isFrozen(m.exit.on)), `${id} exit frozen`);
  }
  // slice 2: the three server games; slice 3: hop
  assert.deepStrictEqual(Object.keys(M.SHELL_MODES), ["left_right", "higher_lower", "dig", "hop"]);
  assert.deepStrictEqual(Object.keys(M.SHELL_TINTS), ["game"]);
  assert.match(M.SHELL_TINTS.game, /^#[0-9a-f]{6}$/);
});

test("acceptance 2: probes with no game linked pass the schema: plain, owns false, exit.status keep", () => {
  for (const p of [probe(), probe({ owns: false }), probe({ exit: { slot: 8, escape: true, status: "keep" } }), probe({ exit: undefined })]) {
    assert.deepStrictEqual(entryProblems(p), [], JSON.stringify(Object.keys(p)));
  }
  const frozen = M.shellFreeze(probe());
  assert.ok(Object.isFrozen(frozen.slots[0]) && Object.isFrozen(frozen.exit.on));
});

test("the schema names what is wrong", () => {
  const bad = (over, why) => assert.ok(entryProblems(probe(over)).some((r) => r.includes(why)), `${why}: ${entryProblems(probe(over))}`);
  bad({ slots: probe().slots.slice(0, 7) }, "slots is not 8");
  bad({ tint: "accent" }, "tint");
  bad({ exit: { slot: 2 } }, "exit.slot");
  bad({ exit: { status: "maybe" } }, "exit.status");
  bad({ exit: { on: ["rain"] } }, "exit.on");
  bad({ exit: { idleAt: 3 } }, "idleAt");
  bad({ onExit: "x" }, "onExit");
  const slots = probe().slots.slice();
  slots[1] = { cap: "back", aria: "again", act: () => {} };
  bad({ slots }, "captions repeat");
  const noAct = probe().slots.slice();
  noAct[4] = { cap: "x", aria: "x" };
  bad({ slots: noAct }, "slot 5 has no act");
  const noAria = probe().slots.slice();
  noAria[4] = { cap: "y", aria: "", act: () => {} };
  bad({ slots: noAria }, "no aria");
  const fnOn = probe().slots.slice();
  fnOn[4] = { cap: "z", aria: "z", act: () => {}, on: true };
  bad({ slots: fnOn }, "on is not a function");
});

test("acceptance 2: the engine part has no game words; the data part is pure", () => {
  for (const word of ["s.game", "_endGame", "GAMES"]) assert.ok(!enginePart.includes(word), `card-mode names ${word}`);
  // The data part's schema and helpers name no game; its game entries (shellGame, shellHop and the table below them)
  // read `s.game` and call the game's own methods, as plan 3.1 says a slot function may.
  const at = dataPart.indexOf("// The game entries");
  const rest = dataPart.slice(0, at) + dataPart.slice(dataPart.indexOf("// A cap's icon:"));
  assert.ok(at > 0 && rest.length < dataPart.length, "the comment above shellGame marks where the game entries are");
  for (const word of ["s.game", "_endGame", "GAMES"]) assert.ok(!rest.includes(word), `shell-modes names ${word} outside its game entries`);
  const code = dataPart.replace(/^\s*\/\/.*$/gm, "");
  for (const word of ["this", "document", "window", "querySelector"]) assert.ok(!new RegExp(`\\b${word}\\b`).test(code), `shell-modes names ${word}`);
  // the parts are in the manifest, data after ui-copy, the engine between card-actions and card-care
  const man = read("src/card/manifest.txt").split("\n");
  assert.ok(man.indexOf("shell-modes.js") > man.indexOf("ui-copy.js"));
  assert.strictEqual(man.indexOf("card-mode.js"), man.indexOf("card-actions.js") + 1);
  assert.strictEqual(man.indexOf("card-care.js"), man.indexOf("card-mode.js") + 1);
  assert.match(src, /class HatchPetCardCare extends HatchPetCardMode \{/);
  for (const part of ["shell-modes", "card-mode"]) assert.match(read("AGENTS.md"), new RegExp(`\\| ${part} \\|`));
});

// ---- the engine on a fake shell ----

test("enter: all eight show the slots, off slots are disabled, hidden and unlabelled, the tint and one announcement", () => {
  const { card, s, all, root } = shell();
  root.activeElement = s.buttons.play; // a press brought it on
  assert.strictEqual(card._modeEnter(s, probe(), { from: s.buttons.play }), true);
  const st = all.map(state);
  assert.deepStrictEqual(st.map((x) => x.cap), ["back", "", "star 0", "next", "", "", "", "done"]);
  assert.deepStrictEqual(st.map((x) => x.label), ["go back", "", "star, 0 left", "go on", "", "", "", "done"]);
  assert.deepStrictEqual(st.map((x) => x.title), ["go back", null, "star, 0 left", "go on", null, null, null, "done"]);
  assert.deepStrictEqual(st.map((x) => x.disabled), [false, true, false, false, true, true, true, false]);
  assert.deepStrictEqual(st.map((x) => x.hidden), [null, "true", null, null, "true", "true", "true", null]);
  assert.deepStrictEqual(st.map((x) => x.pressed), [null, null, "false", null, null, null, null, null]);
  assert.ok(st.every((x) => x.tinted && !x.wanted && !x.on && x.desc === null));
  assert.deepStrictEqual(st.map((x) => x.icon), ["icon_mode_left", "", "✦", "icon_mode_right", "", "", "", "✕"]);
  assert.match(all[0].cap.innerHTML, /<img class="picon" src="\/b\/ui\/icon_mode_left\.png\?v=t" width="24" height="24"/);
  assert.match(all[2].cap.innerHTML, /<b class="glyph" aria-hidden="true">✦<\/b>/);
  assert.strictEqual(all[1].cap.innerHTML, "");
  assert.ok(s.devClasses.has("moded"));
  assert.strictEqual(s.props["--mode-tint"], M.SHELL_TINTS.game);
  assert.strictEqual(s.modeLive.textContent, "probe on: back, star 0, next, done");
  assert.strictEqual(root.activeElement, s.buttons.feed, "the focus is on the first live slot");
  // data-action is never the mode's: the rebound curve stays the care's (review P21)
  assert.deepStrictEqual(all.map((b) => b.dataset.action), [...M.ACTIONS.map((a) => a.key), "lights"]);
  // a blocked slot is not in the announcement (only the live ones are said)
  card._modeExit(s, "quit");
  s.blocked = true;
  card._modeEnter(s, probe(), { from: s.buttons.play });
  assert.strictEqual(s.modeLive.textContent, "probe on: back, star 0, done");
  assert.strictEqual(all[3].getAttribute("aria-disabled"), "true");
  s.blocked = false;
});

test("a hass push under a mode paints nothing; the exit restores the care of the last push, and the focus", () => {
  const { card, s, all, root } = shell();
  card._paintCaps(s, care(card));
  const before = all.map(state);
  root.activeElement = s.buttons.play;
  exits.length = 0;
  card._modeEnter(s, probe(), { from: s.buttons.play });
  const during = all.map(state);
  // the feed and the lights go unavailable, the pet wants feeding: nothing on the swapped caps moves
  card._paintCaps(s, care(card, { feed: { disabled: true }, lights: { disabled: true, on: false, cap: "sleep", icon: "icon_lights_out" }, play: { wanted: true, desc: "wanted now" } }));
  assert.deepStrictEqual(all.map(state), during);
  assert.ok(!all.some((b) => b.classes.has("wanted") || b.getAttribute("aria-description")));
  card._modeExit(s, "quit");
  assert.deepStrictEqual(exits, [["exit", "quit"]]);
  const after = all.map(state);
  assert.strictEqual(after[0].disabled, true, "feed is unavailable now");
  assert.deepStrictEqual([after[7].cap, after[7].on, after[7].disabled], ["sleep", false, true], "the lights show the new state");
  assert.ok(after[2].wanted && after[2].desc === "wanted now", "the wanted ring is back");
  assert.deepStrictEqual(after[3], before[3], "clean as it was");
  assert.ok(!s.devClasses.has("moded") && !("--mode-tint" in s.props) && s.modeLive.textContent === "");
  assert.ok(after.every((x) => !x.tinted && x.hidden === null && x.blocked === null && x.pressed === null));
  assert.strictEqual(root.activeElement, s.buttons.play, "back on from");
  // idempotent
  assert.strictEqual(card._modeExit(s, "quit"), false);
  assert.deepStrictEqual(exits, [["exit", "quit"]]);
});

test("the focus goes to the first live care button when from is dead, and stays put when it was elsewhere", () => {
  const { card, s, root } = shell();
  root.activeElement = s.buttons.play;
  card._modeEnter(s, probe(), { from: s.buttons.play });
  card._paintCaps(s, care(card, { play: { disabled: true }, feed: { disabled: true } }));
  card._modeExit(s, "quit");
  assert.strictEqual(root.activeElement, s.buttons.snack);
  const other = { focus() {} };
  card._modeEnter(s, probe(), { from: s.buttons.play });
  root.activeElement = other;
  card._modeExit(s, "quit");
  assert.strictEqual(root.activeElement, other);
  // a mode that comes on by itself takes no focus from the page
  card._modeEnter(s, probe());
  assert.strictEqual(root.activeElement, other);
});

test("the same id only repaints; another id replaces, its onExit hears replace, from stays the care button", () => {
  const { card, s, root } = shell();
  exits.length = 0;
  root.activeElement = s.buttons.play;
  card._modeEnter(s, probe(), { from: s.buttons.play });
  s.modeLive.textContent = "read";
  s.stars = 3;
  card._modeEnter(s, probe(), { from: s.buttons.feed });
  assert.deepStrictEqual(exits, []);
  assert.strictEqual(s.modeLive.textContent, "read", "no second announcement");
  assert.strictEqual(s.buttons.play.caption.textContent, "star 3", "repainted");
  assert.strictEqual(s.modeFrom, s.buttons.play);
  card._modeEnter(s, probe({ id: "other", announce: "other on" }), { from: s.buttons.feed });
  assert.deepStrictEqual(exits, [["exit", "replace"]]);
  assert.strictEqual(s.mode.id, "other");
  assert.strictEqual(s.modeFrom, s.buttons.play);
  assert.match(s.modeLive.textContent, /^other on: /);
});

test("a care scene ends at the enter, as a press ends one", () => {
  const { card, s } = shell();
  s.scene = { kind: "feed" };
  card._modeEnter(s, probe());
  assert.strictEqual(s.scene, null);
});

test("the router: at rest the care tap; a live slot runs act after closing the sheet; blocked and off do nothing, no rim cue", () => {
  const { card, s } = shell();
  card.log = [];
  card._modeClick(s, 2);
  assert.strictEqual(JSON.stringify(card.log), '[["care","play"]]');
  card._modeEnter(s, probe());
  card.log = [];
  exits.length = 0;
  s.modeAt = 0;
  s.statusOpen = true;
  card._modeClick(s, 0);
  assert.strictEqual(JSON.stringify(card.log), '[["status"],["tapped","feed"]]');
  assert.deepStrictEqual(exits, [["act", "back"]]);
  assert.ok(s.modeAt > 0, "an accepted press stamps modeAt");
  s.blocked = true;
  card._modeSync(s);
  assert.strictEqual(s.buttons.clean.getAttribute("aria-disabled"), "true");
  assert.strictEqual(s.buttons.clean.disabled, false, "blocked is still focusable");
  card.log = [];
  exits.length = 0;
  card._modeClick(s, 3); // blocked
  card._modeClick(s, 1); // off
  assert.strictEqual(JSON.stringify([card.log, exits]), "[[],[]]");
  s.armed = true;
  card._modeSync(s);
  assert.ok(s.buttons.play.classes.has("armed") && s.buttons.play.getAttribute("aria-pressed") === "true");
  assert.ok(!s.buttons.play.classes.has("on"), "pressed is .armed, never the lights' .on");
});

test("Escape runs the exit slot when the mode takes it; not otherwise", () => {
  const { card, s } = shell();
  assert.strictEqual(card._modeEscape(s), false);
  card._modeEnter(s, probe());
  exits.length = 0;
  assert.strictEqual(card._modeEscape(s), true);
  assert.deepStrictEqual(exits, [["exit", "quit"]]);
  assert.strictEqual(s.mode, null);
  card._modeEnter(s, probe({ exit: { slot: 8, escape: false } }));
  assert.strictEqual(card._modeEscape(s), false);
  assert.ok(s.mode);
});

test("_modeGuard: asleep and egg when listed; idle after idleMs unless idleHold", () => {
  const { card, s } = shell();
  for (const reason of ["asleep", "egg"]) {
    card._modeEnter(s, probe());
    exits.length = 0;
    s[reason] = true;
    card._modeGuard(s);
    assert.deepStrictEqual(exits, [["exit", reason]]);
    s[reason] = false;
  }
  s.asleep = true;
  card._modeEnter(s, probe({ exit: { slot: 8, on: ["egg"] } }));
  card._modeGuard(s);
  assert.ok(s.mode, "an unlisted reason keeps it");
  s.asleep = false;
  card._modeExit(s, "quit");
  let hold = true;
  card._modeEnter(s, probe({ exit: { slot: 8, idleMs: 1000, idleHold: () => hold } }));
  exits.length = 0;
  const t = s.modeAt;
  card._modeGuard(s, t + 5000);
  assert.ok(s.mode, "held");
  hold = false;
  card._modeGuard(s, t + 999);
  assert.ok(s.mode, "not yet");
  card._modeGuard(s, t + 1000);
  assert.deepStrictEqual(exits, [["exit", "idle"]]);
  card._modeEnter(s, probe({ exit: { slot: 8, idleMs: 1000, idleAt: () => 50 } }));
  card._modeGuard(s, 1049);
  assert.ok(s.mode);
  card._modeGuard(s, 1050);
  assert.strictEqual(s.mode, null);
});

test("_owned: a game, or a mode that owns the screen", () => {
  const { card } = shell();
  assert.strictEqual(card._owned({}), false);
  assert.strictEqual(card._owned({ game: { picking: true } }), true);
  assert.strictEqual(card._owned({ mode: probe() }), true);
  assert.strictEqual(card._owned({ mode: probe({ owns: false }) }), false);
});

test("a bad entry is refused, and nothing is painted", () => {
  const { card, s, all } = shell();
  const warn = console.warn;
  let said = "";
  console.warn = (...a) => { said = a.join(" "); };
  try {
    assert.strictEqual(card._modeEnter(s, probe({ tint: "accent" })), false);
  } finally {
    console.warn = warn;
  }
  assert.match(said, /tint accent/);
  assert.strictEqual(s.mode, undefined);
  assert.ok(all.every((b) => !b.classes.has("tinted")));
});

test("the director counts a mode as busy unless it opts out", () => {
  const part = read("src/card/interaction-director.js");
  const ctx = {};
  vm.runInNewContext(`${part}\nthis.D = HATCH_DIRECTOR;`, ctx);
  assert.deepStrictEqual([...ctx.D.busyOwners({ mode: probe() }, 0)], ["mode"]);
  assert.strictEqual(ctx.D.isBusy({ mode: probe() }, 0), true);
  assert.strictEqual(ctx.D.isBusy({ mode: probe({ busy: false }) }, 0), false);
});

// ---- 3.3: the tint outranks every rule that colours a cap ----

const specificity = (sel) => {
  let s = sel.replace(/::?[\w-]+\(([^()]*)\)/g, (m, arg) => (m.startsWith(":nth") ? ".x" : arg)).replace(/"[^"]*"/g, "");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const els = (s.replace(/\[[^\]]+\]/g, "").match(/(^|[\s>+~])[a-z][\w-]*/g) || []).length;
  return ids * 10000 + cls * 100 + els;
};

test("the .moded tint rule is at least as specific as every cap colour rule, and comes after them", () => {
  const style = src.slice(src.indexOf("const STYLE = `"), src.indexOf("`;", src.indexOf("const STYLE = `")));
  const tintSel = ".device.moded .buttons > .toy.tinted .cap";
  const tintAt = style.indexOf(`  ${tintSel} {`);
  assert.ok(tintAt > 0, "the tint rule");
  assert.match(style.slice(tintAt, style.indexOf("}", tintAt)), /background: var\(--mode-tint/);
  const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const capRules = rules.flatMap((r) => {
    if (!/(^|[\s;{])background(-color)?:/.test(r[2])) return [];
    return r[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((x) => x.trim()).filter((x) => /\.cap$/.test(x) && x !== tintSel)
      .map((sel) => ({ sel, at: r.index }));
  });
  assert.ok(capRules.length >= 20, `${capRules.length} cap colour rules`); // the finishes, wanted, on
  for (const sel of ['.finish-aqua .toy:nth-child(4n + 1) .cap', '.device[class*="finish-"] .toy.on .cap', ".finish-clear .toy .cap", ".finish-smoke .toy .cap"]) {
    assert.ok(capRules.some((r) => r.sel === sel), `found ${sel}`);
  }
  const mine = specificity(tintSel);
  for (const r of capRules) {
    assert.ok(mine >= specificity(r.sel), `${r.sel} (${specificity(r.sel)}) outranks the tint (${mine})`);
    assert.ok(r.at < tintAt, `${r.sel} comes after the tint`);
  }
  assert.strictEqual(specificity('.device[class*="finish-"] .toy.on .cap'), 500);
  assert.strictEqual(specificity(".finish-aqua .toy:nth-child(4n + 1) .cap"), 400);
  assert.strictEqual(mine, 600);
});

test("the swap is translate only, and the engine skips it under reduced motion", () => {
  const style = src.slice(src.indexOf("const STYLE = `"));
  for (const sel of [".toy.swap .cap", ".toy.armed .cap"]) {
    const at = style.indexOf(`  ${sel} {`);
    assert.ok(at > 0, sel);
    const body = style.slice(at, style.indexOf("}", at));
    assert.doesNotMatch(body, /(^|[^-])transform|animation/);
    assert.match(body, /translate: 0 /);
  }
  const calmCard = load({ calm: true });
  const { s } = (() => {
    const out = shell();
    return out;
  })();
  const c = new calmCard.Card();
  c.shadowRoot = { activeElement: null };
  c._modeSwap(s);
  assert.ok(Object.values(s.buttons).every((b) => !b.classes.has("swap")), "no rebound class when calm");
  const moving = shell();
  moving.card._modeSwap(moving.s);
  assert.ok(Object.values(moving.s.buttons).every((b) => b.classes.has("swap")));
});

// ---- slice 2 acceptance 6: the three server games' entries ----

test("slice 2: the three games' entries: slots 1, 4 and 8 only, the study's captions, exits, Tab order", () => {
  const want = {
    left_right: ["left", "right"], higher_lower: ["lo", "hi"], dig: ["keep", "dig"],
  };
  for (const [id, [one, four]] of Object.entries(want)) {
    const m = M.SHELL_MODES[id];
    assert.deepStrictEqual([...m.slots].map((x) => (x ? x.cap : null)), [one, null, null, four, null, null, null, "quit"], id);
    assert.strictEqual(new Set(m.slots.filter(Boolean).map((x) => x.cap)).size, 3, `${id} captions are unique`);
    assert.strictEqual(m.tint, "game");
    assert.strictEqual(m.announce, "game buttons on");
    assert.strictEqual(m.exit.slot, 8);
    assert.strictEqual(m.exit.escape, true);
    assert.strictEqual(m.exit.status, "end");
    assert.deepStrictEqual([...m.exit.on], ["asleep", "egg"]);
    assert.strictEqual(m.exit.idleMs, 3 * 60 * 1000);
    // the Tab order: live and blocked slots are focusable, off slots are native disabled
    const { card, s } = shell();
    s.game = { kind: id, busy: false, basket: 1 };
    card._modeEnter(s, m);
    const tab = [...card._modeButtons(s)].map((b, i) => (b.disabled ? null : i + 1)).filter(Boolean);
    assert.deepStrictEqual(tab, [1, 4, 8], id);
    assert.strictEqual(s.modeLive.textContent, `game buttons on: ${one}, ${four}, quit`);
    // while a request is out, every slot but quit is blocked (aria-disabled, still focusable)
    s.game.busy = true;
    card._modeSync(s);
    const [b1, b4, b8] = [0, 3, 7].map((i) => card._modeButtons(s)[i]);
    assert.deepStrictEqual([b1, b4, b8].map((b) => b.getAttribute("aria-disabled")), ["true", "true", null], id);
    assert.ok(!b1.disabled && !b4.disabled);
  }
});

test("slice 2: the dig's keep is blocked on an empty basket, and the idle and outside exits end the game with no server call", () => {
  const { card, s } = shell();
  const ended = [];
  card._endGame = (sl, line) => { ended.push(line); sl.game = null; card._modeExit(sl, "game"); };
  card._quitGame = () => ended.push("quit call");
  card._quitLine = () => "maybe later!";
  const dig = M.SHELL_MODES.dig;
  s.game = { kind: "dig", busy: false, basket: 0, lastAt: 1000 };
  card._modeEnter(s, dig);
  assert.strictEqual(card._modeButtons(s)[0].getAttribute("aria-disabled"), "true", "keep blocked on an empty basket");
  assert.ok(!card._modeButtons(s)[0].disabled);
  s.game.basket = 2;
  card._modeSync(s);
  assert.strictEqual(card._modeButtons(s)[0].getAttribute("aria-disabled"), null);
  // idle: held while a request is out, then the dig's idle line; the other games say nothing
  s.game.busy = true;
  card._modeGuard(s, 1000 + 3 * 60 * 1000 + 1);
  assert.ok(s.mode, "idleHold while busy");
  s.game.busy = false;
  card._modeGuard(s, 1000 + 3 * 60 * 1000 - 1);
  assert.ok(s.mode, "not idle yet");
  card._modeGuard(s, 1000 + 3 * 60 * 1000);
  assert.deepStrictEqual([s.mode, ended], [null, [M.GAME_COPY.idle]]);
  // a game that never answered (no lastAt) never idles, as before
  const lr = shell();
  lr.s.game = { kind: "left_right", busy: false };
  lr.card._modeEnter(lr.s, M.SHELL_MODES.left_right);
  lr.card._modeGuard(lr.s, 9e12);
  assert.ok(lr.s.mode);
  // another reason ends the game with null; "game" and "replace" never end it
  lr.card._endGame = (sl, line) => { ended.push(line); };
  lr.card._modeExit(lr.s, "reload");
  assert.strictEqual(ended.at(-1), null);
  const again = shell();
  again.s.game = { kind: "left_right", busy: false };
  again.card._endGame = () => ended.push("wrong");
  again.card._modeEnter(again.s, M.SHELL_MODES.left_right);
  again.card._modeEnter(again.s, M.SHELL_MODES.dig);
  again.card._modeExit(again.s, "game");
  assert.ok(!ended.includes("wrong"));
  // the quit slot and Escape run the game's own quit path
  const q = shell();
  q.s.game = { kind: "dig", busy: true };
  q.card._quitGame = (sl, line) => ended.push(["quit", line]);
  q.card._quitLine = () => "maybe later!";
  q.card._modeEnter(q.s, M.SHELL_MODES.dig);
  q.card._modeClick(q.s, 7);
  assert.deepStrictEqual(ended.at(-1), ["quit", "maybe later!"], "quit is live while busy");
  q.card._modeEscape(q.s);
  assert.deepStrictEqual(ended.at(-1), ["quit", "maybe later!"]);
});

// ---- slice 3: the hop entry ----

test("slice 3: the hop entry: all eight slots, the plan's order, one tint, quit on 8, the idle exit of D7", () => {
  const m = M.SHELL_MODES.hop;
  assert.deepStrictEqual(entryProblems(m), []);
  assert.deepStrictEqual([...m.slots].map((x) => (typeof x.cap === "string" ? x.cap : "special")),
    ["left", "up", "down", "right", "special", "undo", "restart", "quit"]);
  assert.strictEqual(m.tint, "game");
  assert.deepStrictEqual([m.exit.slot, m.exit.escape, m.exit.status, m.exit.idleMs], [8, true, "end", 3 * 60 * 1000]);
  assert.deepStrictEqual([...m.exit.on], ["asleep", "egg"]);
  // idle counts from the last accepted input; a settle, a load or a request holds it
  const g = { lastAt: 5 };
  assert.strictEqual(m.exit.idleAt({ game: g }), 5);
  assert.deepStrictEqual([{}, { busy: true }, { settling: true }, { hopLoading: true }].map((x) => m.exit.idleHold({ game: x })),
    [false, true, true, true]);
  // the special's cap is the bare count (4A, FM2); it is pressed while armed
  const s = { game: { keys: { special: { count: 2, enabled: true } }, special: true } };
  assert.strictEqual(m.slots[4].cap(s), "2");
  assert.strictEqual(M.shellText(m.slots[4].aria, s), "special"); // the label still says it (no key label yet)
  assert.strictEqual(m.slots[4].on(s), true);
});

test("slice 3: hop's slots read the keys the board wrote; a press runs _hopKey; every other exit ends the board", () => {
  const m = M.SHELL_MODES.hop;
  const { card, s } = shell();
  const keys = { left: { enabled: true, label: "Step left" }, up: { enabled: false, label: "Step up, blocked" },
    down: { enabled: true, label: "Step down" }, right: { enabled: false, label: "Step right, sunk" },
    special: { enabled: false, label: "Special move, 0 left", count: 0 }, undo: { enabled: false, label: "Take back the last move" },
    restart: { enabled: false, label: "Start the board again" } };
  s.game = { kind: "hop", keys, special: false };
  const pressed = [];
  card._hopKey = (sl, k) => pressed.push(k);
  card._modeEnter(s, m);
  const b = [...card._modeButtons(s)];
  assert.deepStrictEqual(b.map((x) => x.getAttribute("aria-label")),
    ["Step left", "Step up, blocked", "Step down", "Step right, sunk", "Special move, 0 left", "Take back the last move", "Start the board again", "Stop the game"]);
  assert.deepStrictEqual(b.map((x) => x.getAttribute("aria-disabled")), [null, "true", null, "true", "true", "true", "true", null]);
  assert.ok(b.every((x) => !x.disabled), "no slot of hop is off: all eight are focusable");
  assert.deepStrictEqual(b.map((x) => x.getAttribute("aria-pressed")), [null, null, null, null, "false", null, null, null]);
  assert.strictEqual(b[4].caption.textContent, "0");
  card._modeClick(s, 0);
  card._modeClick(s, 1); // blocked: nothing
  card._modeClick(s, 2);
  assert.deepStrictEqual([...pressed], ["left", "down"]);
  // exits other than the game's own end the board with no line; a restart through "game" or "replace" does not
  const ended = [];
  card._endGame = (sl, line) => { ended.push(line); sl.game = null; card._modeExit(sl, "game"); };
  card._modeExit(s, "idle");
  assert.deepStrictEqual([s.mode, [...ended]], [null, [null]]);
});

// ---- slice 4A: the pixel icons ----

const MODE_ICONS = ["left", "right", "up", "down", "keep", "dig", "special", "undo", "restart", "quit"].map((n) => `icon_mode_${n}`);
const pngSize = (file) => {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.subarray(1, 4).toString(), "PNG", file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("4A acceptance 1: every slot of every table mode names an icon_mode_* key whose PNG exists and is 96x96; the table uses exactly the ten", () => {
  const used = new Set();
  for (const [id, m] of Object.entries(M.SHELL_MODES)) {
    m.slots.forEach((slot, i) => {
      if (!slot) return;
      assert.match(slot.icon, /^icon_mode_\w+$/, `${id} slot ${i + 1}: no glyph, no SVG name, not empty`);
      const file = path.join(ROOT, "custom_components/virtual_pet/frontend/ui", `${slot.icon}.png`);
      assert.ok(fs.existsSync(file), `${slot.icon}.png exists`);
      assert.deepStrictEqual(pngSize(file), [96, 96], `${slot.icon}.png is 96x96`);
      used.add(slot.icon);
    });
  }
  assert.deepStrictEqual([...used].sort(), [...MODE_ICONS].sort());
  // the plan's table, slot by slot
  const icons = (id) => Array.from(M.SHELL_MODES[id].slots, (x) => x && x.icon.replace("icon_mode_", ""));
  assert.deepStrictEqual(icons("left_right"), ["left", null, null, "right", null, null, null, "quit"]);
  assert.deepStrictEqual(icons("higher_lower"), ["down", null, null, "up", null, null, null, "quit"]);
  assert.deepStrictEqual(icons("dig"), ["keep", null, null, "dig", null, null, null, "quit"]);
  assert.deepStrictEqual(icons("hop"), ["left", "up", "down", "right", "special", "undo", "restart", "quit"]);
});

test("4A: shellIcon draws a pixel icon at 24 px; no SVG branch (a shelf arrow name is a glyph now); a probe's glyph stays", () => {
  assert.strictEqual(M.shellIcon("icon_mode_up"), '<img class="picon" src="/b/ui/icon_mode_up.png?v=t" width="24" height="24" alt="">');
  assert.doesNotMatch(M.shellIcon("prev"), /<svg/);
  assert.match(M.shellIcon("prev"), /class="glyph"/);
  assert.match(M.shellIcon("✦"), /<b class="glyph" aria-hidden="true">✦<\/b>/);
  assert.strictEqual(M.shellIcon(""), "");
  // the carousel arrows keep ICON_PATHS and icon()
  assert.match(src, /icon\("prev", 20\)/);
  assert.match(src, /const ICON_PATHS = /);
  assert.doesNotMatch(dataPart.match(/function shellIcon[\s\S]*?\n\}\n/)[0], /ICON_PATHS/);
});

test("4A: hop's special caption is the bare count, its label keeps 'special'", () => {
  const m = M.SHELL_MODES.hop;
  for (const count of [0, 1, 2, 3]) assert.strictEqual(m.slots[4].cap({ game: { keys: { special: { count } } } }), String(count));
  assert.strictEqual(m.slots[4].cap({}), "0");
  assert.match(M.shellText(m.slots[4].aria, { game: { keys: { special: { label: "Special move, 2 left" } } } }), /special/i);
  assert.match(M.shellText(m.slots[4].aria, {}), /special/);
  // the other seven captions are unchanged table copy
  assert.deepStrictEqual(Array.from(m.slots).filter((x, i) => i !== 4).map((x) => x.cap), ["left", "up", "down", "right", "undo", "restart", "quit"]);
});

test("4A acceptance 7: every table mode quits on slot 8 and on Escape", () => {
  for (const [id, m] of Object.entries(M.SHELL_MODES)) {
    assert.strictEqual(m.exit.escape, true, `${id} exit.escape`);
    assert.strictEqual(m.exit.slot, 8, `${id} exit.slot`);
  }
});
