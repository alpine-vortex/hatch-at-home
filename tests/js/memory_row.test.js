// Memory's settings row, "remember me" (docs/plan-2026-11-02-memory.md M1a; first-mate copy
// 2026-11-02): node --test tests/js
// The row's words and aria are the approved ones; off is a two-tap confirm; the switch is a
// websocket command with shared: false, never a service; a shared screen, or a pet that
// doesn't allow memory, has no row; a failed call puts it back.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

function load() {
  const store = new Map();
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  vm.runInNewContext([
    grab(/\nconst SETTINGS_AGAIN = \{[\s\S]*?\n\};\n/),
    grab(/\nconst CONFIRM_ARIA = \{[\s\S]*?\n\};\n/),
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    grab(/\nfunction memoryRow\([\s\S]*?\n\}\n/),
    `function makeCard(fail) {
      const card = {
        calls: [], said: [], services: [],
        _slides: [{ mine: { memory_on: false } }],
        _hass: {
          callWS(msg) { card.calls.push(msg); return fail ? Promise.reject(new Error("x")) : Promise.resolve(null); },
          callService(...args) { card.services.push(args); return Promise.resolve(); },
        },
        _statusMessage(s, text) { card.said.push(text); },
        _setMine(key, value) { for (const slide of this._slides) if (slide.mine) slide.mine[key] = value; },
        ${method("_setMemory")},
      };
      return card;
    }`,
    "function makeButton() { const attrs = {}; return { attrs, textContent: '', classList: { add() {}, remove() {}, contains() { return false; } }, setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; } }; }",
    "this.out = { SETTINGS_AGAIN, CONFIRM_ARIA, memoryRow, makeCard, makeButton, SHARED_KEY };",
  ].join("\n"), ctx);
  return { ...ctx.out, store };
}

test("the row has the approved label, aria and switch words", () => {
  const { memoryRow, CONFIRM_ARIA } = load();
  const off = memoryRow(false, false);
  assert.match(off, /<span>remember me<\/span>/);
  assert.match(off, /aria-label="remember me: the pets keep what you tell them, off, change"/);
  assert.match(off, /aria-pressed="false">off</);
  const on = memoryRow(true, false);
  assert.match(on, /aria-label="remember me: the pets keep what you tell them, on, change"/);
  assert.match(on, /aria-pressed="true">on</);
  const armed = memoryRow(true, true);
  assert.equal(CONFIRM_ARIA.memory_off, "Sure? Press again to forget what the pets remember about you");
  assert.match(armed, /aria-label="Sure\? Press again to forget what the pets remember about you"/);
  assert.match(armed, />sure\? tap again</);
});

test("the status lines are the approved ones", () => {
  const { SETTINGS_AGAIN } = load();
  assert.equal(SETTINGS_AGAIN.memoryOn, "the pets will remember what you tell them ♪");
  assert.equal(SETTINGS_AGAIN.memoryOff, "forgotten. the pets keep nothing you told them");
});

test("on and off are a websocket command with shared: false, and say so", async () => {
  const { makeCard, makeButton, SETTINGS_AGAIN } = load();
  const card = makeCard(false);
  const s = { ids: { "sensor.life_stage": "sensor.pip_life_stage" } };
  const button = makeButton();
  await card._setMemory(s, true, button);
  assert.deepEqual(JSON.parse(JSON.stringify(card.calls)), [
    { type: "virtual_pet/memory", entity_id: "sensor.pip_life_stage", enabled: true, shared: false },
  ]);
  assert.equal(card.services.length, 0); // never a service (it would record who)
  assert.equal(card._memoryOn, true);
  assert.equal(card._slides[0].mine.memory_on, true);
  assert.equal(button.textContent, "on");
  assert.equal(button.attrs["aria-pressed"], "true");
  assert.deepEqual(card.said, [SETTINGS_AGAIN.memoryOn]);
  await card._setMemory(s, false, button);
  assert.equal(card.calls[1].enabled, false);
  assert.equal(card.calls[1].shared, false);
  assert.equal(button.attrs["aria-label"], "remember me: the pets keep what you tell them, off, change");
  assert.deepEqual(card.said, [SETTINGS_AGAIN.memoryOn, SETTINGS_AGAIN.memoryOff]);
});

test("a failed call puts the switch back", async () => {
  const { makeCard, makeButton, SETTINGS_AGAIN } = load();
  const card = makeCard(true);
  const button = makeButton();
  await card._setMemory({ ids: { "sensor.life_stage": "sensor.pip_life_stage" } }, true, button);
  assert.equal(card._slides[0].mine.memory_on, false);
  assert.equal(button.textContent, "off");
  assert.deepEqual(card.said, [SETTINGS_AGAIN.failed]);
});

test("a shared screen sends nothing", async () => {
  const { makeCard, makeButton, store, SHARED_KEY } = load();
  store.set(SHARED_KEY, "on");
  const card = makeCard(false);
  await card._setMemory({ ids: { "sensor.life_stage": "x" } }, true, makeButton());
  assert.equal(card.calls.length, 0);
});

test("the row is drawn only on a personal screen, where the pet allows it, and off confirms", () => {
  const settings = method("_renderSettings");
  assert.match(settings, /const memory = !sharedScreen\(\) && \(memoryOn \|\| memoryAllowed\) && memoryAllowed !== undefined && memoryOn !== undefined/);
  // the fallback is this pet's own visit reply, never a shared card-wide value
  assert.match(settings, /_mineSwitch\(s, "memory_allowed", s\.memoryAllowed\)/);
  assert.doesNotMatch(src, /this\._memoryAllowed/);
  assert.match(src, /s\.memoryAllowed = reply\.memory_allowed/);
  assert.match(settings, /\$\{memory\}/);
  assert.match(settings, /if \(!enabled && !this\._confirmed\(s, "memory_off", button, redrawStatus\)\) return;/);
});

// The row's rule, run on its own: shown where the pet allows memory or where it is on (the
// server always lets a person turn it off); hidden until this pet's own option is known.
test("the row shows when on or allowed, and hides until this pet's option is known", () => {
  const settings = method("_renderSettings");
  const cond = settings.match(/const memory = ([^\n]*)\n/)[1].replace(/\s*\?$/, "");
  const show = (memoryOn, memoryAllowed, shared = false) =>
    vm.runInNewContext(`(${cond})`, { sharedScreen: () => shared, memoryOn, memoryAllowed });
  assert.equal(show(false, true), true);
  assert.equal(show(true, true), true);
  assert.equal(show(true, false), true); // on, but this pet doesn't allow it: can only be turned off
  assert.equal(show(false, false), false);
  assert.equal(show(true, undefined), false); // this pet's mine hasn't arrived
  assert.equal(show(undefined, true), false);
  assert.equal(show(true, true, true), false); // a shared screen
});
