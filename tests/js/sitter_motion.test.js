// The sitter's motion is held to the composition rule (AGENTS.md "Motion on the card"; sitter plan
// S3a, F10). motion_rule.test.js only reads `.pet.<cls>` rules, so the sitter's own element needs
// its own test. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");

const src = require("./card-source");

const css = src.slice(src.indexOf("const STYLE = `"), src.indexOf("const SCENE_STYLE")).replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const sitterRules = rules.filter((r) => /\.sitter\b/.test(r.sel));
const part = src.slice(src.indexOf("class HatchPetCardSitter"), src.indexOf("class HatchPetCardTick"));

test("the reduced-motion rule at the top stills every animation and transition, the sitter's too", () => {
  const top = css.slice(0, css.indexOf("ha-card"));
  assert.match(top, /prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
});

test("the sitter has its rules, and every animation on one is a one-shot", () => {
  assert.ok(sitterRules.length > 5);
  const animated = sitterRules.filter((r) => /\banimation\s*:/.test(r.body));
  assert.ok(animated.length >= 2, "the fade and the fade-out");
  for (const r of animated) assert.doesNotMatch(r.body, /infinite/, `${r.sel} loops`);
  for (const r of rules) {
    if (/\binfinite\b/.test(r.body)) assert.doesNotMatch(r.sel, /\.sitter/, `${r.sel} loops`);
  }
});

test("no rule for the sitter targets the pet, and no .pet rule is the sitter's", () => {
  for (const r of sitterRules) assert.doesNotMatch(r.sel, /\.pet\b/, r.sel);
  assert.ok(!/\.pet\.(?:fade|fade-out|walk|wave)\b/.test(css));
});

test("the sitter never moves by `transform`: translate slides it, scale mirrors it", () => {
  for (const r of sitterRules) assert.doesNotMatch(r.body, /(?<![-\w])transform\s*:/, `${r.sel} sets transform`);
  assert.match(css, /\.sitter \{[^}]*transition: translate /);
  assert.doesNotMatch(part, /style\.transform|\.transform\s*=/);
  assert.match(part, /style\.scale = "-1 1"/);
  assert.match(part, /style\.translate = /);
});

test("the card code never sets .pet's transform for the sitter", () => {
  assert.doesNotMatch(part, /s\.pet\.style\.(?:transform|translate|scale)/);
  assert.doesNotMatch(part, /s\.pet\.animate\(/);
});

test("its frames and steps run on the one timer, _tick's, and the card has no timer of its own", () => {
  assert.doesNotMatch(part, /\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(/);
  assert.match(src, /if \(seen\) this\._sitterTick\(s\)/);
  const forget = src.slice(src.indexOf("  _forget(s) {"), src.indexOf("  _forget(s) {") + 3000);
  assert.match(forget, /this\._sitterReset\(s\);/);
  assert.match(forget, /s\.sit = null;/);
});

test("a beat is JS-started behind calm(): a reduced-motion user gets no walk, wave or idle", () => {
  const sync = part.slice(part.indexOf("  _sitterSync("), part.indexOf("  _sitterPose("));
  assert.match(sync, /const play = this\._sitterOnScreen\(s\) && !calm\(\)/);
  assert.match(sync, /if \(play\) this\._sitterArrive/);
  assert.match(sync, /if \(play && !s\.egg && !night\) this\._sitterCue/);
  assert.match(part, /!busy && !calm\(\) && this\._sitterOnScreen\(s\)/);
  assert.match(part, /if \(frames\.length > 1 && !calm\(\)/);
});
