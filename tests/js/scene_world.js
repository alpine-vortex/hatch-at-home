// The clean scene and the drape on the fake clock, shared by scene_stragglers.test.js (the trace) and scene_ledger.test.js (the
// ledger after the move): the real SCENES.clean render and clear, the real _sceneEnd, _go and the drape's timers. node --test tests/js
const vm = require("node:vm");
const { world } = require("./timer_trace");
const src = require("./card-source");

const SCENES_BLOCK = src.slice(src.indexOf("const SCENES = {"), src.indexOf("\n};\n", src.indexOf("const SCENES = {")) + 4);
const GO = src.match(/\n  _go\(index[^\n]*\n[\s\S]*?\n  \}\n/)[0];
const SPEC = {
  methods: ["_sceneEnd", "_drapeStop", "_drapeSync"],
  consts: ["SCENE_OWE_MS", "DRAPE_FALL_MS", "DRAPE_SLIDE_PX"],
  screen: true,
  watch: ["_drapeShow", "_drapeHide"],
  returns: { _drapeInfo: { size: "l" } },
  slide: (el) => ({ poops: [], murk: el("murk"), perch: el("perch"), drape: el("drape"), drapeImg: el("drapeImg") }),
};

function sceneWorld({ pets = 1 } = {}) {
  const w = world(SPEC);
  vm.runInContext(`${SCENES_BLOCK}\nthis.SCENES = SCENES;`, w.sandbox);
  // _go's head line ends in a comment, which the harness's method reader does not take: loaded here, onto the card's own object.
  vm.runInContext(`this.go = {${GO}};`, w.sandbox);
  w.card._go = w.sandbox.go._go;
  w.slides = [w.slide];
  for (let i = 1; i < pets; i++) {
    const x = { ...w.slide, pet: w.el(`pet${i}`), murk: w.el(`murk${i}`), perch: w.el(`perch${i}`), ids: { device: `dev${i}` } };
    w.slides.push(x);
  }
  w.card._slides = w.slides;
  return w;
}
// A clean scene as _sceneStart leaves it (the boxes are the browser's), at the world's now.
const begin = (w, s = w.slide, { murk = false } = {}) => {
  const sc = { kind: "clean", start: w.now, els: [], mess: [], tool: w.el("tool"), toolArt: ["broom"], water: false, murk, petX: 0, answered: false };
  s.scene = sc;
  return sc;
};
// The render at scene time t: from 1800 on it adds rock2 once.
const render = (w, s, sc, t) => {
  const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  w.sandbox.SCENES.clean.render.call(w.card, s, sc, t, { sw: 400, sh: 300, ramp });
};
const rock = (w, name = "pet") => w.log.filter((x) => x.el === name && x.arg === "rock2").map((x) => [x.op, x.t]);
// A clean scene played to `t` (rendered at 1800 so rock2 goes on), then ended by `end(w, s)`.
function played(opts, end, at = 1900) {
  const w = sceneWorld(opts);
  const sc = begin(w, w.slide, { murk: opts?.murk });
  w.run(1800);
  render(w, w.slide, sc, 1800);
  w.run(at - 1800);
  end(w, w.slide);
  return w;
}
const murk = (w) => w.slide.murk.style.transition;

module.exports = { sceneWorld, begin, render, rock, played, murk };
