// Perf s2933: every card adopts one constructed stylesheet; no per-card <style> where supported.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const src = require("./card-source");

const fn = src.match(/\nlet cardSheet;\nfunction sharedSheet\(\) \{[\s\S]*?\n\}\n/)[0];
const run = (g) => vm.runInNewContext(`${fn}\nthis.sharedSheet = sharedSheet;`, { STYLE: "a{}", SCENE_STYLE: "b{}", ...g });
const out = (g) => { const c = { STYLE: "a{}", SCENE_STYLE: "b{}", ...g }; vm.runInNewContext(`${fn}\nthis.f = sharedSheet;`, c); return c.f; };

test("two cards get the same sheet, built once", () => {
  let made = 0;
  const f = out({ CSSStyleSheet: class { constructor() { made++; } replaceSync(t) { this.t = t; } }, Document: { prototype: { adoptedStyleSheets: [] } } });
  const a = f(), b = f();
  assert.strictEqual(a, b);
  assert.strictEqual(made, 1);
  assert.strictEqual(a.t, "a{}b{}");
});

test("no constructable sheets: null, the card writes its own <style>", () => {
  assert.strictEqual(out({ Document: { prototype: {} } })(), null);
  assert.strictEqual(out({ CSSStyleSheet: class { replaceSync() { throw new Error("x"); } }, Document: { prototype: { adoptedStyleSheets: [] } } })(), null);
});

test("_build adopts it and drops the <style> only when it has one", () => {
  assert.match(src, /root\.adoptedStyleSheets = \[sheet\]/);
  assert.match(src, /sheet \? "" : `<style>\$\{STYLE\}\$\{SCENE_STYLE\}<\/style>`/);
});
