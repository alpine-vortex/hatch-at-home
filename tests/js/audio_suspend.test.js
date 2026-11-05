// The page's one AudioContext (src/card/prefs.js) is suspended while nobody can hear it: the last
// hatch card leaving the page, or the page hidden. The next sound resumes it. A running context
// keeps an audio thread and session alive on a phone's WebView for the life of the page.
// The real card with a fake context in a browser is leak_guard.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const prefs = fs.readFileSync(path.join(__dirname, "..", "..", "src", "card", "prefs.js"), "utf8");

// A context that follows the Web Audio states: suspend() and resume() settle at once.
const fakeContext = () => {
  const made = [];
  return class FakeContext {
    constructor() {
      this.state = "running"; // a context made inside a tap starts running
      this.currentTime = 0;
      this.destination = {};
      made.push(this);
    }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() { return { frequency: {}, connect: (n) => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
    createBiquadFilter() { return { frequency: {}, connect: (n) => n }; }
    static get made() { return made; }
  };
};

const load = () => {
  const FakeContext = fakeContext();
  const document = { hidden: false };
  const sandbox = { window: { AudioContext: FakeContext, matchMedia: () => ({ matches: false }) }, document, localStorage: { getItem: (k) => (k === "hatch-sounds" ? "on" : null), setItem() {} }, console, Math, Date, JSON };
  vm.runInNewContext(`${prefs}\nthis.api = { unlockAudio, playChirp, audioJoin, audioLeave, audioPark, audioWake, babble };`, sandbox);
  return { ...sandbox.api, document, made: FakeContext.made };
};

test("nothing is made until a sound, and a park with no context is a no-op", () => {
  const a = load();
  a.audioJoin();
  a.audioLeave();
  assert.strictEqual(a.made.length, 0);
});

test("the last card leaving suspends it; one of two leaving does not", () => {
  const a = load();
  a.audioJoin();
  a.audioJoin();
  a.unlockAudio();
  const ctx = a.made[0];
  assert.strictEqual(ctx.state, "running");
  a.audioLeave();
  assert.strictEqual(ctx.state, "running", "a card is still on the page");
  a.audioLeave();
  assert.strictEqual(ctx.state, "suspended");
  assert.strictEqual(a.made.length, 1, "one context for the page, never a second");
});

test("a hidden page suspends it; a visible one wakes only what it suspended", () => {
  const a = load();
  a.audioJoin();
  a.unlockAudio();
  const ctx = a.made[0];
  a.document.hidden = true;
  a.audioPark();
  assert.strictEqual(ctx.state, "suspended");
  a.audioWake();
  assert.strictEqual(ctx.state, "suspended", "still hidden: stays suspended");
  a.document.hidden = false;
  a.audioWake();
  assert.strictEqual(ctx.state, "running", "back on the page: sound works as before");
});

test("a context the page never had running is not woken by a return", () => {
  const a = load();
  a.audioJoin();
  a.unlockAudio();
  const ctx = a.made[0];
  ctx.state = "suspended"; // the browser's own suspend (autoplay policy), not ours
  a.audioWake();
  assert.strictEqual(ctx.state, "suspended");
});

test("the next sound resumes it after a suspend", () => {
  const a = load();
  a.audioJoin();
  a.playChirp("click");
  const ctx = a.made[0];
  a.audioLeave();
  assert.strictEqual(ctx.state, "suspended");
  a.audioJoin(); // the card is back (hidden page: no wake)
  a.document.hidden = true;
  a.playChirp("click");
  assert.strictEqual(ctx.state, "running");
  assert.strictEqual(a.made.length, 1);
});

test("a babble plays after a wake, and not on a suspended context (no sound out of turn)", () => {
  const a = load();
  a.audioJoin();
  a.unlockAudio();
  const voice = { pace: 10, pitch: 440 };
  assert.ok(a.babble("hi", voice), "running: it plays");
  a.audioLeave();
  assert.strictEqual(a.babble("hi", voice), null, "suspended: it waits for a tap");
  a.audioJoin();
  assert.ok(a.babble("hi", voice), "the card back on a visible page: it plays again");
});

test("the card wires it: connect joins, disconnect leaves, hidden parks, visible wakes", () => {
  const method = (name) => {
    const at = src.indexOf(`\n  ${name}(`);
    const at2 = at >= 0 ? at : src.indexOf(`\n  ${name} =`);
    assert.ok(at2 >= 0, `${name} is in the card`);
    return src.slice(at2, src.indexOf("\n  }", at2));
  };
  assert.match(method("connectedCallback"), /audioJoin\(\)/);
  assert.match(method("disconnectedCallback"), /audioLeave\(\)/);
  const hidden = method("_onHidden");
  assert.match(hidden, /if \(document\.hidden\) \{[\s\S]*audioPark\(\)[\s\S]*return;\s*\}\s*audioWake\(\)/);
});
