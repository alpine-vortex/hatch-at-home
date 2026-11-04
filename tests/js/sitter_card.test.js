// Sitter visits S2 (docs/plan-2026-11-04-sitter-visits.md 6.1, 6.2, S2): the card reads house.sitter
// through _state, draws Pip with its real mood and a placeholder sitter, never the old sign, and
// the care and games stay on. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`));
const ctx = {};
vm.runInNewContext([
  grab(/\nconst GONE_STATES = [^\n]*\n/),
  grab(/\nconst SITTER_LABEL = [^\n]*\n/),
  grab(/\nconst SITTER_BLIND = [^\n]*\n/),
  `const o = {${["_state", "_sitter", "_live"].map(method).join(",\n")}};`,
  "this.out = { o, SITTER_LABEL, SITTER_BLIND };",
].join("\n"), ctx);
const { o, SITTER_LABEL } = ctx.out;

const ids = { "sensor.mood": "m", "binary_sensor.asleep": "a", "switch.lights_out": "l" };
const raw = (mood, asleep) => ({
  m: { state: mood, attributes: { flags: mood === "away" ? ["away"] : [], reason: "zzz", reason_key: "asleep", requests: ["feed"] } },
  a: { state: asleep, attributes: {} },
  l: { state: "off", attributes: {} },
});
const card = (states) => Object.assign(Object.create(o), { _hass: { states } });
const view = { mood: "hungry", key: "hungry", reason: "i'm hungry", reason_key: "hungry", flags: ["away", "rainy"], asleep: false, lights_out: false, last: null };

test("the label is the approved line", () => {
  assert.strictEqual(SITTER_LABEL, "sitter's here");
});

test("privacy on: the sensors say asleep, the view says hungry; every read follows the view", () => {
  const self = card(raw("asleep", "on"));
  const s = { ids, house: { sitter: view } };
  const mood = self._state(s, "sensor.mood");
  assert.strictEqual(mood.state, "hungry");
  assert.deepStrictEqual([...mood.attributes.flags], ["away", "rainy"]);
  assert.strictEqual(mood.attributes.reason, "i'm hungry");
  assert.strictEqual(mood.attributes.reason_key, "hungry");
  assert.deepStrictEqual([...mood.attributes.requests], ["feed"], "the rest of the sensor's attributes stay");
  assert.strictEqual(self._state(s, "binary_sensor.asleep").state, "off");
  assert.strictEqual(self._state(s, "switch.lights_out").state, "off", "other entities are untouched");
});

test("privacy on or off draws the same: the view decides, whatever the sensors say", () => {
  const on = card(raw("asleep", "on"));
  const off = card(raw("away", "off"));
  const s = { ids, house: { sitter: view } };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(on._state(s, "sensor.mood"))), JSON.parse(JSON.stringify(off._state(s, "sensor.mood"))));
  assert.strictEqual(on._state(s, "binary_sensor.asleep").state, off._state(s, "binary_sensor.asleep").state);
});

test("the view's asleep wins over the masked binary sensor", () => {
  const self = card(raw("asleep", "on"));
  const s = { ids, house: { sitter: { ...view, mood: "asleep", asleep: true } } };
  assert.strictEqual(self._state(s, "binary_sensor.asleep").state, "on");
});

test("no sitter: the sensors as built", () => {
  const states = raw("content", "off");
  const self = card(states);
  const s = { ids, house: { sitter: null } };
  assert.strictEqual(self._sitter(s), null);
  assert.strictEqual(self._state(s, "sensor.mood"), states.m);
  assert.strictEqual(self._state({ ids, house: null }, "sensor.mood"), states.m);
});

test("no channel, privacy off: the sensor's away is the sitter in the generic mood, never the away state", () => {
  const self = card(raw("away", "off"));
  for (const house of [null, {}, { media: null }]) { // not subscribed, or an older server with no sitter key
    const s = { ids, house };
    assert.ok(self._sitter(s), "the sitter is known");
    assert.strictEqual(self._state(s, "sensor.mood").state, "content");
    assert.strictEqual(self._state(s, "binary_sensor.asleep").state, "off", "the sensor's own asleep");
  }
});

test("no channel, privacy on: a napping pet and no sitter (the one case that hides it)", () => {
  const self = card(raw("asleep", "on"));
  const s = { ids, house: null };
  assert.strictEqual(self._sitter(s), null);
  assert.strictEqual(self._state(s, "sensor.mood").state, "asleep");
});

test("a channel that said sitter: null is trusted over a stale away sensor, and the away state never leaks", () => {
  const self = card(raw("away", "off"));
  const s = { ids, house: { sitter: null } };
  assert.strictEqual(self._sitter(s), null);
  assert.strictEqual(self._state(s, "sensor.mood").state, "content");
});

test("a reloading pet (unavailable) is left as it is", () => {
  const states = raw("unavailable", "unavailable");
  const self = card(states);
  const s = { ids, house: { sitter: view } };
  assert.strictEqual(self._state(s, "sensor.mood"), states.m);
  assert.strictEqual(self._state(s, "binary_sensor.asleep"), states.a);
});

test("a care scene's held copy is the view's (the tap's pet), and the lights' live read is too", () => {
  const self = card(raw("asleep", "on"));
  const s = { ids, house: { sitter: view } };
  const held = { "sensor.mood": self._live(s, "sensor.mood") };
  s.scene = { held };
  assert.strictEqual(self._state(s, "sensor.mood").state, "hungry");
  assert.strictEqual(self._state(s, "binary_sensor.asleep").state, "off", "not held: the live one");
  assert.match(grab(/_sceneStart\(s, kind\) \{[\s\S]*?\n  \}\n/), /held\[key\] = this\._live\(s, key\)/);
  assert.match(method("_lightsLive"), /this\._live\(s, id\)/);
});

test("_renderSlide: the sitter and the label are drawn, the sign is not, and every away term is gone", () => {
  const render = grab(/\n  _renderSlide\(s\) \{[\s\S]*?\n  \}\n/);
  assert.match(render, /const sitter = this\._sitter\(s\);/);
  assert.match(render, /s\.sitterEl\.hidden = !sitter;/);
  assert.match(render, /s\.sitterEl\.classList\.toggle\("doze", scene === "night" \|\| scene === "dim"\)/);
  assert.match(render, /this\._show\(s, s\.awaysign, null\)/);
  assert.doesNotMatch(render, /props\?\.away|"at the sitter's"|\baway\b[^\n]*\?|!away|\|\| away/);
  assert.doesNotMatch(render, /s\.away\b/);
});

test("no card part reads s.away or the away mood any more", () => {
  assert.doesNotMatch(src, /\bs\.away\b|\bx\.away\b/);
  assert.strictEqual(src.match(/state === "away"/g).length, 2, "only _sitter and _live read the sensor's away");
  assert.doesNotMatch(src, /i'm at the sitter's/);
});

test("the house channel redraws the slide on every house push, so a sitter that arrives alone shows", () => {
  const channel = method("_channel");
  assert.match(channel, /if \("house" in msg\) \{\s*s\.house = msg\.house \|\| null;/);
  assert.match(channel, /s\.statusHtml = null;\s*this\._redraw\(s\);/);
  assert.match(method("_redraw"), /if \(s\) s\.drawnSig = null;[\s\S]*this\._update\(\);/);
});

test("games and care run on during a visit: the shell modes list no away exit", () => {
  assert.doesNotMatch(grab(/const SHELL_EXIT_ON = [^\n]*/), /away/);
  assert.doesNotMatch(grab(/\nconst SHELL_MODES = [\s\S]*?\n\}\);?\n/), /away/);
});
