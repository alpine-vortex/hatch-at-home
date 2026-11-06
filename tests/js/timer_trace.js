// The fake-clock trace harness (docs/plan-2026-11-06-director-migration.md 5.0, 6.1). It runs the card's own
// methods (pulled out of the built text, as sitter_life.test.js does) in a vm sandbox over a fake clock and a
// tiny DOM, with the real HATCH_DIRECTOR and the slice-0 adapters always loaded, so the same trace runs before
// a site moves (bare timers on the fake clock) and after (the ledger over the same clock). A trace is the
// ordered list of what the player could see: `{ t, el, op, arg }`, op one of `class+`, `class-`, `reflow`,
// `remove`, `append`, `animate`, `anim-cancel`, `call` (a watched method), `mark` (the test's own).
//
//   const { trace, world } = require("./timer_trace");
//   trace({ methods: ["_perk"] }, (card, s) => card._perk(s), { calm: false });
//
// `world(spec)` gives the parts for a hand-driven test: `card`, `slide`, `advance(ms)`, `t()`, `log`,
// `disconnect()`, `reconnect()` (disconnectedCallback's and connectedCallback's bodies over the sandbox),
// `director`, `pendingTimers()`. spec: `methods` (card methods to load), `consts` (one-line top-level consts),
// `globals` (more sandbox globals), `watch` (stubbed method names whose calls go in the log), `fields` (own
// card fields), `slide(el)` (more slide fields). Any other card method is a silent stub.
const vm = require("vm");
const src = require("./card-source");

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`timer_trace: not in the card: ${what || re}`);
  return m[0];
};
const methodText = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`), name);
const constText = (name) => grab(new RegExp(`\\nconst ${name} = [^\\n]*\\n`), name);
const DIRECTOR = grab(/\nconst HATCH_DIRECTOR = Object\.freeze\([\s\S]*?\n {2}\}\)\(\)\n\);\n/, "HATCH_DIRECTOR");
// Every method name the card has: a call to one that is not loaded is a stub; any other `this._x` read
// stays undefined (a stub must never pass for a flag).
const CARD_METHODS = new Set([...src.matchAll(/\n {2}(_\w+)(?:\(| = \()/g)].map((m) => m[1]));
// The slice-0 adapters, loaded into every world (F2): a trace never needs the move to exist.
const ADAPTERS = ["_later", "_hold", "_waapi", "_stop", "_drain", "_has", "_dirPause"];
const LIFECYCLE = ["disconnectedCallback", "connectedCallback"];

function world(spec = {}) {
  const w = { calm: false, log: [], calls: [], seq: 0, timers: [], base: 1767225600000, now: 0 };
  const watch = new Set(spec.watch || []);
  const at = () => w.now;
  const push = (el, op, arg) => w.log.push(arg === undefined ? { t: at(), el, op } : { t: at(), el, op, arg });

  // ---- the fake clock: every timer is due at an exact ms; equal times fire in creation order ----
  const delay = (ms) => {
    const n = Number(ms);
    return Number.isFinite(n) && n > 0 ? n : 0; // setTimeout's own reading of NaN and negatives
  };
  const arm = (kind, ms, fn, args) => {
    const timer = { id: ++w.seq, kind, at: w.now + delay(ms), every: kind === "interval" ? Math.max(delay(ms), 1) : 0,
      fn, args, live: true, seq: w.seq };
    w.timers.push(timer);
    return timer.id;
  };
  const disarm = (id) => {
    const timer = w.timers.find((x) => x.id === id);
    if (timer) timer.live = false;
  };
  const clock = {
    setTimeout: (fn, ms, ...args) => arm("timeout", ms, fn, args),
    setInterval: (fn, ms, ...args) => arm("interval", ms, fn, args),
    requestAnimationFrame: (fn) => arm("frame", 16, fn, []),
    clearTimeout: disarm,
    clearInterval: disarm,
    cancelAnimationFrame: disarm,
  };
  const next = (to) => {
    let best = null;
    for (const x of w.timers) {
      if (!x.live || x.at > to) continue;
      if (!best || x.at < best.at || (x.at === best.at && x.seq < best.seq)) best = x;
    }
    return best;
  };
  // Moves the clock to now + ms, firing each due timer at its own time.
  w.advance = (ms) => {
    const to = w.now + ms;
    for (let x = next(to); x; x = next(to)) {
      w.now = x.at;
      if (x.kind === "interval") {
        x.at += x.every;
        x.seq = ++w.seq; // an interval's next turn queues behind what is already due then
      } else {
        x.live = false;
      }
      x.fn(...(x.kind === "frame" ? [w.now] : x.args));
    }
    w.now = to;
  };
  w.t = () => w.now;
  w.pendingTimers = () => w.timers.filter((x) => x.live && x.kind !== "interval").length;
  // The latest due time of any one-shot made so far, fired or not (an interval does not stretch a trace).
  w.horizon = () => Math.max(0, ...w.timers.filter((x) => x.kind !== "interval").map((x) => x.at));

  class FakeDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [w.base + w.now]));
    }
    static now() {
      return w.base + w.now;
    }
  }

  // ---- the tiny DOM ----
  const animations = new Set();
  const el = (name, over = {}) => {
    const cls = new Set();
    const listeners = {};
    const node = {
      name, style: {}, hidden: false, disabled: false, children: [], parent: null,
      classList: {
        add: (...c) => c.forEach((x) => { cls.add(x); push(name, "class+", x); }),
        remove: (...c) => c.forEach((x) => { cls.delete(x); push(name, "class-", x); }),
        contains: (x) => cls.has(x),
        toggle: (x, on) => {
          const want = on === undefined ? !cls.has(x) : !!on;
          node.classList[want ? "add" : "remove"](x);
          return want;
        },
      },
      get className() {
        return [...cls].join(" ");
      },
      set className(v) {
        cls.clear();
        String(v).split(/\s+/).filter(Boolean).forEach((x) => cls.add(x));
      },
      get offsetWidth() {
        push(name, "reflow");
        return 0;
      },
      cls,
      append: (...kids) => kids.forEach((k) => { node.children.push(k); k.parent = node; push(name, "append", k.name); }),
      remove: () => {
        if (node.parent) node.parent.children = node.parent.children.filter((k) => k !== node);
        node.parent = null;
        push(name, "remove");
      },
      getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
      dispatch: (type, ev = {}) => (listeners[type] || []).slice().forEach((f) => f(ev)),
      getAnimations: () => [...animations].filter((a) => a.el === node),
      // A WAAPI stub: `finish` at its duration on the fake clock, `cancel` when cancelled.
      animate: (frames, timing) => {
        const ms = typeof timing === "number" ? timing : timing?.duration || 0;
        const a = { el: node, frames, timing, playState: "running", listeners: {} };
        a.addEventListener = (type, fn) => (a.listeners[type] ||= []).push(fn);
        const fire = (type) => (a.listeners[type] || []).slice().forEach((f) => f({ type }));
        const end = (state, type) => {
          if (a.playState !== "running") return;
          a.playState = state;
          animations.delete(a);
          clock.clearTimeout(a.timer);
          fire(type);
        };
        a.cancel = () => {
          if (a.playState !== "running") return;
          push(name, "anim-cancel");
          end("idle", "cancel");
        };
        a.finish = () => end("finished", "finish");
        a.timer = clock.setTimeout(() => end("finished", "finish"), ms);
        animations.add(a);
        push(name, "animate", ms);
        return a;
      },
      ...over,
    };
    return node;
  };
  w.el = el;
  w.mark = (what) => push("test", "mark", what);

  const noop = () => {};
  const document = {
    hidden: false,
    createElement: (tag) => el(tag),
    querySelector: () => ({}), // the font is "already there"
    addEventListener: noop,
    removeEventListener: noop,
    head: el("head"),
  };
  const sandbox = {
    ...clock,
    Date: FakeDate,
    performance: { now: () => w.now },
    calm: () => w.calm,
    document,
    window: { addEventListener: noop, removeEventListener: noop },
    navigator: {},
    audioJoin: noop, audioLeave: noop, followTextSweep: noop,
    SHARED_EVENT: "hatch-shared", MONO_EVENT: "hatch-mono",
    sharedScreen: () => false, monoOn: () => false, bigOn: () => false,
    BASE: "/b", VERSION: "t",
    console,
    ...(spec.globals || {}),
    out: null,
  };
  const names = [...new Set([...ADAPTERS, ...LIFECYCLE, ...(spec.methods || [])])];
  vm.runInNewContext([
    DIRECTOR,
    ...(spec.consts || []).map(constText),
    `const o = {${names.map(methodText).join(",\n")}};`,
    "this.out = { o, HATCH_DIRECTOR };",
  ].join("\n"), sandbox);
  const { o, HATCH_DIRECTOR } = sandbox.out;
  w.HATCH_DIRECTOR = HATCH_DIRECTOR;
  w.sandbox = sandbox;

  // Any card method not loaded is a stub (a watched one goes in the log); a loaded one is the card's own.
  const stubs = new Proxy({}, {
    get(_t, k) {
      if (typeof k !== "string" || !CARD_METHODS.has(k)) return undefined;
      return (...args) => {
        w.calls.push({ t: w.now, name: k, args });
        if (watch.has(k)) push("card", "call", k);
        return spec.returns?.[k];
      };
    },
  });
  const card = Object.assign(Object.create(Object.assign(Object.create(stubs), o)), {
    _hass: undefined, _card: undefined, _resize: undefined, _io: undefined, _viewport: undefined,
    _timer: 0, _headTimer: 0, _sharedSeen: false, _visible: true, _index: 0, _booting: false,
    ...(spec.fields || {}),
  });
  // As _build makes them (card-build.js): the card's own scope, and the director with the three wrappers.
  card._dirCard = Object.freeze({ card: true });
  card._director = HATCH_DIRECTOR.create({
    now: () => w.base + w.now, deviceNow: () => w.base + w.now, trusted: () => true, canRender: () => true,
    schedule: (ms, fn) => {
      const timer = clock.setTimeout(fn, ms);
      return () => clock.clearTimeout(timer);
    },
    repeat: (ms, fn) => {
      const timer = clock.setInterval(fn, ms);
      return () => clock.clearInterval(timer);
    },
    frame: (fn) => {
      const id = clock.requestAnimationFrame(fn);
      return () => clock.cancelAnimationFrame(id);
    },
    recipes: {},
  });
  w.director = card._director;
  const slide = { pet: el("pet"), el: el("slide"), ids: { device: "dev" }, ...(spec.slide ? spec.slide(el) : {}) };
  card._slides = [slide];
  w.card = card;
  w.slide = slide;
  // G9: the card leaves the page and (maybe) comes back; the element and its slides are kept.
  w.disconnect = () => card.disconnectedCallback();
  w.reconnect = () => card.connectedCallback();
  return w;
}

// Runs `site(card, slide, w)` (with no slide for `noSlide`), then advances in 10 ms steps to the latest
// due time plus 500 ms (or `until` ms). Returns `{ log, threw, w }`; `log` is what the tests assert.
function trace(spec, site, { calm = false, noSlide = false, until } = {}) {
  const w = world(spec);
  w.calm = calm;
  let threw = null;
  try {
    site(w.card, noSlide ? undefined : w.slide, w);
  } catch (err) {
    threw = err;
  }
  if (until !== undefined) {
    while (w.now < until) w.advance(Math.min(10, until - w.now));
  } else {
    while (w.now < w.horizon() + 500) w.advance(10);
  }
  return { log: w.log, threw, w };
}

module.exports = { world, trace, methodText, CARD_METHODS, ADAPTERS };
