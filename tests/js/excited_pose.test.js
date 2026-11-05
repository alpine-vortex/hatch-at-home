// The excited pose is the celebration, not the 15 min mood (owner: "stuck in excite pose again"):
// node --test tests/js. The real _petFrames, _shownFrames and _excitedSettle run against a stub card
// with a fake clock and a switchable calm().
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

const env = { now: 1_000_000, calm: false, RealDate: Date };
const ctx = { env };
vm.runInNewContext([
  grab(/\nconst EXCITED_POSE_MS = [^\n]*\n/),
  grab(/\nconst excitedPosed = [^\n]*\n/),
  grab(/\nconst POSE_MOODS = [^\n]*\n/),
  "const POSES = {};",
  "const calm = () => env.calm;",
  "const Date = { now: () => env.now };",
  `class Card {${["_petFrames", "_shownFrames", "_excitedSettle"].map(method).join("")}}`,
  "this.out = { Card, EXCITED_POSE_MS };",
].join("\n"), ctx);
const { Card, EXCITED_POSE_MS } = ctx.out;

const sp = { stages: ["baby", "teen", "adult"], moods: ["content", "excited", "cozy", "bored"], frames: 2 };
const slide = (since) => {
  const s = { excitedSince: since };
  s.framesOf = (m) => card._petFrames(sp, "teen", m, false, null, []);
  return s;
};
const card = new Card();
const draw = (s, mood = "excited") => { s.frames = card._shownFrames(s, mood); return [...s.frames]; };
const EXCITED = ["teen_excited_1", "teen_excited_2"];
const CONTENT = ["teen_content_1", "teen_content_2"];

test("the excited frames show for 10 s from excitedSince, then the content frames", () => {
  env.calm = false;
  env.now = 1_000_000;
  const s = slide(env.now);
  assert.deepStrictEqual(draw(s), EXCITED);
  env.now += EXCITED_POSE_MS - 1;
  assert.deepStrictEqual(draw(s), EXCITED, "still in the window");
  env.now += 1;
  assert.deepStrictEqual(draw(s), CONTENT, "the window is over, the mood is still excited");
});

test("the tick redraws when the window ends, with no hass push", () => {
  env.calm = false;
  env.now = 2_000_000;
  const s = slide(env.now);
  draw(s);
  s.frame = 1;
  env.now += 5000;
  card._excitedSettle(s);
  assert.deepStrictEqual([...s.frames], EXCITED, "mid-window: left alone");
  assert.strictEqual(s.frame, 1);
  env.now += 5000;
  card._excitedSettle(s);
  assert.deepStrictEqual([...s.frames], CONTENT);
  assert.strictEqual(s.frame, 0);
  assert.strictEqual(s.framesKey, CONTENT.join(","));
  const again = s.frames;
  card._excitedSettle(s);
  assert.strictEqual(s.frames, again, "settled once: not redrawn on every tick");
});

test("calm never holds the excited peak, in the window or after it", () => {
  env.calm = true;
  env.now = 3_000_000;
  const s = slide(env.now);
  assert.deepStrictEqual(draw(s), CONTENT, "within the window");
  env.now += 60_000;
  assert.deepStrictEqual(draw(s), CONTENT, "after it");
  assert.ok(!s.frames.includes("teen_excited_1"));
});

test("calm switched on mid-window settles at the next tick", () => {
  env.calm = false;
  env.now = 4_000_000;
  const s = slide(env.now);
  draw(s);
  env.calm = true;
  card._excitedSettle(s);
  assert.deepStrictEqual([...s.frames], CONTENT);
  env.calm = false;
});

test("other moods and an unknown start draw as they did", () => {
  env.calm = false;
  env.now = 5_000_000;
  assert.deepStrictEqual(draw(slide(0), "bored"), ["teen_bored_1", "teen_bored_2"]);
  assert.deepStrictEqual(draw(slide(0), "content"), CONTENT);
  assert.deepStrictEqual(draw(slide(0)), CONTENT, "excited with no start seen is settled");
});

test("the layout starts the window on becoming excited; a card loaded into an excited pet is settled", () => {
  assert.match(src, /if \(excitedNow\) s\.excitedSince = s\.moodState === undefined \? Date\.now\(\) - EXCITED_POSE_MS : Date\.now\(\);/);
  assert.match(src, /s\.frames = this\._shownFrames\(s, mood\?\.state\);/);
  assert.match(src, /this\._excitedSettle\(s\);\n\s+const frames = this\._frames\(s\);/);
});

// The real _tick (every other method a no-op) on a fake clock: under normal motion the excited frames
// really alternate 1, 2, 1, 2 every tick (700 ms), they are not stuck on frame 1, and the content frames
// that follow alternate the same way.
const tickCtx = { env };
vm.runInNewContext([
  grab(/\nconst EXCITED_POSE_MS = [^\n]*\n/),
  grab(/\nconst excitedPosed = [^\n]*\n/),
  grab(/\nconst POSE_MOODS = [^\n]*\n/),
  "const POSES = {};",
  "const calm = () => env.calm;",
  "const document = { hidden: false };",
  "const Date = class extends env.RealDate { constructor(...a) { super(...(a.length ? a : [env.now])); } static now() { return env.now; } };",
  `class Base {${["_tick", "_frames", "_excitedSettle", "_shownFrames", "_petFrames"].map(method).join("")}}`,
  // Everything else the tick calls is a no-op.
  "const Card = new Proxy(Base, { construct(T, a) { return new Proxy(new T(...a), { get: (o, k) => (k in o || typeof k !== 'string' || !k.startsWith('_') ? o[k] : () => undefined) }); } });",
  "this.out = { Card };",
].join("\n"), tickCtx);

test("under normal motion the excited frames alternate every tick, then the content frames do", () => {
  env.calm = false;
  env.now = 6_000_000;
  const card = new tickCtx.out.Card();
  const pet = { src: null, getAttribute() { return this.src; }, setAttribute(_, v) { this.src = v; }, style: {} };
  const s = { excitedSince: env.now, frame: 0, pet, species: sp, speciesId: "bird", scene: null, poseUntil: 0, patPoseUntil: 0, bubble: { textContent: "" }, sayUntil: 1 };
  s.framesOf = (m) => card._petFrames(sp, "teen", m, false, null, []);
  s.frames = card._shownFrames(s, "excited");
  card._show = (_s, el, f) => { el.src = f; };
  card._slides = [s];
  card._index = 0;
  card._visible = true;
  Object.assign(card, { _director: null, _ticks: 0, _lookDay: new Date().toDateString(), _booting: false });
  card._show(s, pet, s.frames[0]);
  const seen = [pet.src];
  for (let i = 0; i < 20; i++) {
    env.now += 700;
    card._tick();
    seen.push(pet.src);
  }
  const at = (n) => seen[n]; // the picture after n ticks, 700 ms each
  for (let n = 0; n < 14; n++) assert.strictEqual(at(n), `teen_excited_${(n % 2) + 1}`, `tick ${n} (${n * 700} ms)`);
  assert.ok(new Set(seen.slice(0, 14)).size === 2, "both excited frames were shown");
  // 14 x 700 = 9.8 s is the last tick inside the window; the redraw comes on the first tick past 10 s.
  const after = seen.slice(15);
  assert.ok(after.every((f) => f.startsWith("teen_content_")), after.join());
  assert.ok(new Set(after).size === 2, "the content frames alternate too: " + after.join());
  after.forEach((f, i) => i && assert.notStrictEqual(f, after[i - 1], "never the same frame twice running"));
});
