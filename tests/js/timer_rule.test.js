// The timer allowlist (docs/plan-2026-11-06-director-migration.md 7.1, Appendix B). A card timer goes through
// the director's ledger (this._later, _hold, _waapi, _stop; plan 1.4), not a bare one. In src/card/*.js the bare
// identifiers setTimeout, setInterval, requestAnimationFrame, clearTimeout, clearInterval, cancelAnimationFrame
// and the member `.animate(` (comments stripped, tests/js/timer_count.js; the bare word, so `forEach(clearTimeout)`
// and an alias count) are allowed only in the entries below: one per part and method, each with a reason and a
// count. A count that differs fails, an entry nothing uses fails, a bare timer elsewhere fails. Nothing here
// is lowered by a slice any more: a new entry needs a reason a reviewer accepts. `node tests/js/timer_count.js`
// prints the live table per part. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { countParts, countByFunction, countText, stripComments, COLUMNS } = require("./timer_count");

const [ST, SI, RAF, CT, CI, CAF, AN] = COLUMNS;
// file -> method -> { counts, why }
const ALLOWED = {
  "card-actions": {
    _sceneStart: { [RAF]: 2, why: "the care scene's frame loop; it does not move through frame() (Q4); its handle is sc.raf" },
    _sceneEnd: { [CAF]: 1, why: "cancels that loop (sc.raf)" },
  },
  "card-base": {
    connectedCallback: { [SI]: 1, why: "the card's own _tick interval (this._timer), the director's injection point" },
    disconnectedCallback: { [CI]: 1, why: "stops that _tick interval" },
    _waapi: { [AN]: 1, why: "the one `.animate(` call: the ledger's WAAPI adapter" },
  },
  "card-build": {
    _build: { [ST]: 1, [SI]: 1, [RAF]: 1, [CT]: 1, [CI]: 1, [CAF]: 1,
      why: "the director's three injected wrappers (schedule, repeat, frame) and their cancels" },
  },
  "card-layout": {
    _shellSettled: { [CT]: 1, why: "R52: clears s.shellPendingTimer (a network wait, not on the ledger); no timer started here" },
  },
  "card-sheets": {
    _saveShell: { [ST]: 2, [CT]: 2, why: "R51/R52: the 10 s race against the shell save and s.shellPendingTimer; promise waits, off the ledger (Q4)" },
    _layWatch: { [ST]: 2, why: "R53: s.layTimer, the lay wait that re-arms every 5 s while reloading" },
    _nameSave: { [ST]: 1, why: "R54: s.nameRetry, the name save's retry pause inside an awaited promise" },
    _layDrop: { [CT]: 1, why: "the manual closer for s.layTimer (_forget calls it)" },
    _clearNameTimers: { [CT]: 1, why: "the manual closer for s.nameRetry (_forget calls it)" },
  },
  "card-tick": {
    _speak: { [SI]: 1, why: "the typing interval (job.timer), per line, ended by _stopTyping" },
    _stopTyping: { [CI]: 1, why: "stops the typing interval" },
  },
  "card-visit": {
    _keepAnswer: { [ST]: 1, why: "R78: the answer resend; disclosed exception, not guarded by a forget (5.14, forget_drain.test.js)" },
  },
};
// Fields that hold an allowlisted handle: assigned only in the parts named (the false positives are pinned below).
const NAMED_FIELDS = {
  layTimer: ["card-sheets"], shellPendingTimer: ["card-sheets"], nameRetry: ["card-sheets"],
  raf: ["card-actions"], timer: ["card-tick"], _timer: ["card-base"],
};
const fieldAssigns = (text) => {
  const code = stripComments(text).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
  return Object.keys(NAMED_FIELDS).filter((f) => new RegExp(`\\.${f}\\s*=(?![=>])`).test(code));
};

test("the counter: comments go, strings, templates and regex literals stay whole", () => {
  assert.deepStrictEqual(countText("// setTimeout(x)\n/* clearTimeout */ a();"), {});
  assert.deepStrictEqual(countText("list.forEach(clearTimeout); const t = setTimeout;"), { [CT]: 1, [ST]: 1 });
  assert.deepStrictEqual(countText("x.mySetTimeout(); setTimeouts; $setTimeout; el.animate(k, 9); a.animated"),
    { [AN]: 1 });
  assert.deepStrictEqual(countText('const u = "http://x"; setInterval(f, 1);'), { [SI]: 1 });
  assert.deepStrictEqual(countText("const r = /a\\/\\/b|[/]/g; requestAnimationFrame(f); // setTimeout"), { [RAF]: 1 });
  assert.deepStrictEqual(countText("const s = `a ${b ? `//c` : 'd'} e`; cancelAnimationFrame(i); // clearInterval"),
    { [CAF]: 1 });
  assert.deepStrictEqual(countText("const half = a / 2; setTimeout(f, b / 2); // setTimeout"), { [ST]: 1 });
  assert.strictEqual(stripComments("a // b\nc /* d\ne */ f").split("\n").length, 3, "line breaks kept");
});

test("the allowlist: every bare timer is in an entry, with its count, and every entry is used", () => {
  const live = countByFunction();
  const off = [];
  const keys = new Set();
  for (const f of Object.keys({ ...live, ...ALLOWED })) {
    for (const m of new Set([...Object.keys(live[f] || {}), ...Object.keys(ALLOWED[f] || {})])) {
      const entry = ALLOWED[f]?.[m];
      if (entry && !entry.why) off.push(`${f}.js ${m}: an entry needs a reason`);
      if (entry && !live[f]?.[m]) off.push(`${f}.js ${m}: unused entry (remove it)`);
      for (const k of COLUMNS) {
        const want = entry?.[k] || 0;
        const got = live[f]?.[m]?.[k] || 0;
        if (want !== got) off.push(`${f}.js ${m} ${k}: ${got} (allowed ${want})`);
      }
      keys.add(`${f}.${m}`);
    }
  }
  assert.deepStrictEqual(off, [], [
    "A bare timer is outside the allowlist, or an entry is stale. A new timer goes through the director's ledger",
    "(this._later, _hold, _waapi; docs/plan-2026-11-06-director-migration.md 1.4), not a bare one. Off:", ...off,
  ].join("\n"));
});

test("the per-part count agrees with the per-method count", () => {
  const parts = countParts();
  const byFn = countByFunction();
  for (const f of Object.keys(parts)) {
    for (const k of COLUMNS) {
      const sum = Object.values(byFn[f] || {}).reduce((n, row) => n + (row[k] || 0), 0);
      assert.strictEqual(sum, parts[f][k] || 0, `${f} ${k}`);
    }
  }
});

test("the named fields are assigned only in their allowlisted part", () => {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(__dirname, "..", "..", "src", "card");
  const off = [];
  for (const file of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "style.js")) {
    for (const f of fieldAssigns(fs.readFileSync(path.join(dir, file), "utf8"))) {
      if (!NAMED_FIELDS[f].includes(file.replace(/\.js$/, ""))) off.push(`${file}: .${f} = ...`);
    }
  }
  assert.deepStrictEqual(off, []);
  // Every named field is still assigned somewhere it is allowed (a stale name fails like an unused entry).
  const all = fs.readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "style.js")
    .flatMap((file) => fieldAssigns(fs.readFileSync(path.join(dir, file), "utf8")));
  for (const f of Object.keys(NAMED_FIELDS)) assert.ok(all.includes(f), `${f} is no longer assigned anywhere`);
});

test("the named-field rule: false positives stay out, a stray assignment is caught", () => {
  assert.deepStrictEqual(fieldAssigns("if (x.layTimer == y) {}"), []);
  assert.deepStrictEqual(fieldAssigns("if (x.layTimer === y) {}"), []);
  assert.deepStrictEqual(fieldAssigns("// s.layTimer = 1"), []);
  assert.deepStrictEqual(fieldAssigns("/* s.layTimer = 1 */ a();"), []);
  assert.deepStrictEqual(fieldAssigns("const timer = setTimeout(f, 1);"), []);
  assert.deepStrictEqual(fieldAssigns('const m = "s.layTimer = 1";'), []);
  assert.deepStrictEqual(fieldAssigns("const f = (s) => s.layTimer => 1;"), []);
  assert.deepStrictEqual(fieldAssigns("s.nameRetry = setTimeout(f, 1);"), ["nameRetry"]);
  assert.deepStrictEqual(fieldAssigns("sc.raf  =  x; this._timer = 0;"), ["raf", "_timer"]);
});
