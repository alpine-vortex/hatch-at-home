// Device-alive slice 2 (docs/plan-2026-11-03-device-alive-interactions.md section 7): the cap's press feel is CSS
// on the cap only. Source tests: no card, no DOM.
const test = require("node:test");
const assert = require("node:assert");

const src = require("./card-source");

// The rules in STYLE whose selector names `.cap` and a press state.
const rule = (selector) => {
  const at = src.indexOf(`  ${selector} {`);
  assert.ok(at >= 0, `no rule ${selector}`);
  return src.slice(at, src.indexOf("}", at) + 1);
};

test("pending and failed are the existing _call classes, restyled, not duplicated", () => {
  assert.strictEqual((src.match(/\.toy\.pending \.cap \{/g) || []).length, 1);
  assert.strictEqual((src.match(/\.toy\.failed \.cap \{/g) || []).length, 1);
  assert.match(src, /button\.classList\.add\("pending"\)/);
  assert.match(src, /this\._hold\(this\._dirCard, button, "failed", 400\)/); // adds it, takes it off at 400
});

test("no cap rule animates or sets transform: the pressed offset is translate", () => {
  for (const sel of [".toy .cap", ".toy:active .cap, .toy.pressed .cap", ".toy.pending .cap", ".toy.failed .cap"]) {
    assert.doesNotMatch(rule(sel), /(^|[^-])transform:/, `${sel} uses transform`);
  }
  assert.match(rule(".toy:active .cap, .toy.pressed .cap"), /translate: 0 /);
  assert.doesNotMatch(src, /@keyframes shake/); // the old failed shake (it moved transform, and read as a refusal)
  // The only keyframes the cap states use touch filter, never transform.
  assert.match(src, /@keyframes waiting \{ 50% \{ filter: [^}]*\} \}/);
});

test("pending and failed have a still value (reduced motion drops animation and transition); failed wins", () => {
  assert.match(rule(".toy.pending .cap"), /filter: brightness/);
  const failed = rule(".toy.failed .cap");
  assert.match(failed, /filter: saturate/);
  assert.match(failed, /animation: none/);
  assert.ok(src.indexOf(".toy.failed .cap {") > src.indexOf(".toy.pending .cap {"), "failed is after pending");
  assert.match(src, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
});

test("the release is the cap's own transition (an overshoot curve), per action through --rebound", () => {
  assert.match(rule(".toy .cap"), /transition: translate var\(--rebound-ms, \.1\d?s\) var\(--rebound, cubic-bezier\(/);
  const ACTIONS = [...src.match(/const ACTIONS = \[[\s\S]*?\n\];/)[0].matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  assert.ok(ACTIONS.includes("snack") && ACTIONS.includes("scold") && ACTIONS.includes("praise"));
  const styled = [...src.matchAll(/\.toy\[data-action="(\w+)"\] \.cap \{ --rebound: cubic-bezier\([^)]*\); --rebound-ms: \.(\d+)s; \}/g)];
  assert.deepStrictEqual(styled.map((m) => m[1]).sort(), ["clean", "feed", "lights", "medicine", "play"]);
  for (const m of styled) {
    const ms = Number(`.${m[2]}`) * 1000;
    assert.ok(ms >= 90 && ms <= 140, `${m[1]} rebound ${ms} ms`); // the plan's 90-140 ms
  }
  // Snack, scold and praise take the default (FM6): no rule of their own.
  for (const k of ["snack", "scold", "praise"]) assert.doesNotMatch(src, new RegExp(`data-action="${k}"`));
  // The data attribute is set on the action toys and on the lights toy.
  assert.match(src, /b\.dataset\.action = action\.key;/);
  assert.match(src, /lights\.dataset\.action = "lights";/);
});

test("every state class a press adds has a removal, and the passing ones stay out of the focus selector", () => {
  const actions = src.slice(src.indexOf("class HatchPetCardActions"), src.indexOf("  _press(s, action)"));
  // _tapped adds both and the ledger takes them off (director migration slice 1): pressed at 160, tapped at 400
  assert.match(actions, /classList\.add\("tap-feedback"\);\s*this\._hold\(this\._dirCard, button, "tapped", 400\);\s*this\._hold\(this\._dirCard, button, "pressed", 160\);/);
  assert.match(actions, /finally \{[^}]*classList\.remove\("pending"\)/);
  assert.match(actions, /this\._hold\(this\._dirCard, button, "failed", 400\)/);
  const passing = src.match(/const PASSING_CLASSES = new Set\(\[([^\]]*)\]\)/)[1];
  for (const c of ["tap-feedback", "tapped", "pressed", "pending", "failed"]) assert.ok(passing.includes(`"${c}"`), `${c} not in PASSING_CLASSES`);
});

test("the slice stays CSS on the cap: no director call, no new .pet class", () => {
  const actions = src.slice(src.indexOf("class HatchPetCardActions"), src.indexOf("  _press(s, action)"));
  assert.doesNotMatch(actions, /HATCH_DIRECTOR|shellImpulse|canRender/);
});

test("a shell mode leaves data-action as built, so the rebound stays the care's, and its router plays no rim cue", () => {
  // shell modes plan 3.3, review P21: card-mode writes the slot's icon, caption and labels, never data-action
  const mode = src.slice(src.indexOf("class HatchPetCardMode"), src.indexOf("class HatchPetCardCare"));
  assert.ok(mode.length > 1000, "card-mode is in the card");
  assert.doesNotMatch(mode, /dataset\.action\s*=|setAttribute\("data-action"|removeAttribute\("data-action"|delete \w+\.dataset\.action/);
  assert.doesNotMatch(mode, /_rimCue/);
  // the only data-action writes in the card are the two at build
  assert.strictEqual((src.match(/dataset\.action = /g) || []).length, 2);
  // the router hands an accepted press to the slot's act only
  const click = mode.slice(mode.indexOf("  _modeClick(s, i) {"), mode.indexOf("\n  }\n", mode.indexOf("  _modeClick(s, i) {")));
  assert.match(click, /slot\.act\(this, s\);/);
  assert.doesNotMatch(click, /_press|_call\(/);
});
