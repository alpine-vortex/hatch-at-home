// Leak guard (scout s2925): a card that leaves the page leaves nothing running. Mounts the real card
// on the bench page (dev/bench, a fake hass), removes it, and asserts no live interval, no
// requestAnimationFrame loop and no window/document listener is left, after one visit and after
// three. Then the page's AudioContext (a fake one) is suspended after the last card leaves and
// after the page is hidden, and the next sound resumes it.
// Needs Playwright (NODE_PATH, as the bench does); skipped without it. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
let chromium = null;
try {
  ({ chromium } = require("playwright"));
} catch (err) {
  // no Playwright here
}
const skip = chromium ? false : "Playwright is not installed (set NODE_PATH as scripts/bench.js does)";

// In the page before any script: count what a card could leave behind, and stand in for the
// AudioContext (a headless browser has no audio device).
const probe = () => {
  const intervals = new Set();
  const setI = window.setInterval.bind(window);
  const clearI = window.clearInterval.bind(window);
  window.setInterval = (...a) => { const id = setI(...a); intervals.add(id); return id; };
  window.clearInterval = (id) => { intervals.delete(id); return clearI(id); };
  let rafCalls = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { rafCalls++; return raf(cb); };
  const listeners = new Map(); // "target type" -> a set of [fn, capture]
  const key = (t, type) => `${t === window ? "window" : "document"} ${type}`;
  const cap = (o) => (typeof o === "object" ? !!o?.capture : !!o);
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    const rem = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, o) => {
      if (fn && !(typeof o === "object" && (o?.once || o?.signal))) {
        const k = key(target, type);
        if (!listeners.has(k)) listeners.set(k, new Map());
        listeners.get(k).set(`${cap(o)}`, (listeners.get(k).get(`${cap(o)}`) || new Set()).add(fn));
      }
      return add(type, fn, o);
    };
    target.removeEventListener = (type, fn, o) => {
      listeners.get(key(target, type))?.get(`${cap(o)}`)?.delete(fn);
      return rem(type, fn, o);
    };
  }
  window.__probe = {
    intervals: () => intervals.size,
    rafCalls: () => rafCalls,
    listeners: () => {
      const out = {};
      for (const [k, byCap] of listeners) {
        const n = [...byCap.values()].reduce((sum, set) => sum + set.size, 0);
        if (n) out[k] = n;
      }
      return out;
    },
  };
  class FakeAudioContext {
    constructor() {
      this.state = "running"; // a context made inside a tap starts running
      this.currentTime = 0;
      this.destination = {};
      (window.__ctxs ||= []).push(this);
    }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() { return { frequency: {}, connect: (n) => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
    createBiquadFilter() { return { frequency: {}, connect: (n) => n }; }
  }
  window.AudioContext = FakeAudioContext;
};

const shot = (pets) => ({
  stage: "adult", mood: "content", world: "woodland", scene: "day", season: false, width: 420, dpr: 1,
  time: new Date().toISOString(), booted: true, clip: "card", view: "card", name: "m", seed: 7,
  pets: Array.from({ length: pets }, (_, i) => ({ species: ["fox", "bunny", "hedgehog"][i % 3], stage: i ? "child" : "adult", mood: "content", world: "woodland" })),
});

async function withPage(run) {
  const { startServer } = require(path.join(ROOT, "dev/bench/server"));
  require(path.join(ROOT, "scripts/build-card.js")).ensureBuilt({ quiet: true });
  const { server, url } = await startServer(0);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 460, height: 900 } })).newPage();
    await page.addInitScript(probe);
    await page.goto(`${url}/`);
    const worlds = await page.evaluate(async () => (await (await fetch("/virtual_pet/frontend/worlds.json")).json()));
    const roster = worlds.woodland.roster;
    const mount = (pets) => page.evaluate(async (s) => {
      await window.bench.mount(s);
      const c = document.querySelector("hatch-pet-card");
      clearInterval(c._timer); // the bench holds the clock still; run the card's own tick as a page does
      c._timer = setInterval(() => c._tick(), 700);
    }, { ...shot(pets), pets: shot(pets).pets.map((p, i) => ({ ...p, species: roster[i % roster.length] })) });
    await run({ page, mount });
  } finally {
    await browser.close();
    server.close();
  }
}

const state = (page) => page.evaluate(() => ({ intervals: window.__probe.intervals(), listeners: window.__probe.listeners() }));

test("a card that leaves leaves no interval, no rAF loop and no window/document listener (1 and 3 visits)", { skip, timeout: 120000 }, async () => {
  await withPage(async ({ page, mount }) => {
    const base = await state(page);
    for (let visit = 1; visit <= 3; visit++) {
      await mount(3);
      await page.waitForTimeout(1500);
      const during = await state(page);
      assert.ok(during.intervals > base.intervals, "the card runs its tick while it is on the page");
      await page.evaluate(() => document.querySelector("hatch-pet-card").remove());
      const calls = await page.evaluate(() => window.__probe.rafCalls());
      await page.waitForTimeout(1000);
      const after = await state(page);
      assert.strictEqual(await page.evaluate(() => window.__probe.rafCalls()), calls, `visit ${visit}: no rAF loop runs after the card is gone`);
      assert.strictEqual(after.intervals, base.intervals, `visit ${visit}: no interval left`);
      assert.deepStrictEqual(after.listeners, base.listeners, `visit ${visit}: no window/document listener left`);
    }
  });
});

// Slice 12 (plan 5.12, N11): a visit's swap (700 ms) and head flap (200 ms) are intervals on the ledger; the card leaving while the link is
// on ends it (disconnectedCallback's _linkEnd), and nothing is left once the visit's longest due time (7.1 s) is past.
test("a card that leaves mid-link leaves no interval, measured after the visit's longest due time", { skip, timeout: 120000 }, async () => {
  await withPage(async ({ page, mount }) => {
    const base = await state(page);
    await mount(3);
    await page.evaluate(() => {
      const c = document.querySelector("hatch-pet-card");
      c._tick = () => {}; // the page's tick would end or start visits of its own
      window.__started = c._linkStart(c._slides[0], c._slides[1]);
    });
    assert.strictEqual(await page.evaluate(() => window.__started), true);
    await page.waitForTimeout(2800); // past the pose (2.5 s): the swap and the flap both run
    const during = await state(page);
    assert.ok(during.intervals >= base.intervals + 3, "the card's tick, the head flap and the guest's swap");
    assert.strictEqual(await page.evaluate(() => document.querySelector("hatch-pet-card")._director.inspect(document.querySelector("hatch-pet-card")._dirCard)?.timers.some((t) => t.group === "link")), true);
    await page.evaluate(() => document.querySelector("hatch-pet-card").remove());
    await page.waitForTimeout(7500);
    const after = await state(page);
    assert.strictEqual(after.intervals, base.intervals, "no interval left after the longest due time");
    assert.deepStrictEqual(after.listeners, base.listeners);
  });
});

test("the page's AudioContext is suspended after the last card leaves and after the page is hidden, and a sound resumes it", { skip, timeout: 120000 }, async () => {
  await withPage(async ({ page, mount }) => {
    const ctxState = () => page.evaluate(() => (window.__ctxs || []).map((c) => c.state));
    const hide = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

    await page.evaluate(() => localStorage.setItem("hatch-sounds", "on"));
    await mount(2);
    await page.evaluate(() => unlockAudio()); // a tap with sounds on
    assert.deepStrictEqual(await ctxState(), ["running"]);

    await hide(true);
    assert.deepStrictEqual(await ctxState(), ["suspended"], "hidden page: suspended");
    await hide(false);
    assert.deepStrictEqual(await ctxState(), ["running"], "back on the page: running as before");

    await page.evaluate(() => document.querySelector("hatch-pet-card").remove());
    assert.deepStrictEqual(await ctxState(), ["suspended"], "the last card gone: suspended");

    await page.evaluate(() => playChirp("click")); // the next sound
    assert.deepStrictEqual(await ctxState(), ["running"], "a sound resumes it");
    assert.strictEqual((await ctxState()).length, 1, "still the one context");
  });
});

test("sounds off (the default): the power-on tap and a tap on the card make no AudioContext; on, the boot tap makes one", { skip, timeout: 120000 }, async () => {
  for (const sounds of [false, true]) {
    await withPage(async ({ page, mount }) => {
      if (sounds) await page.evaluate(() => localStorage.setItem("hatch-sounds", "on"));
      await mount(1); // a fresh browser: the power-on screen waits for a tap
      assert.ok(await page.evaluate(() => document.querySelector("hatch-pet-card")._booting), "the boot screen is up");
      await page.evaluate(() => document.querySelector("hatch-pet-card")._slides[0].boot.click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector("hatch-pet-card")._card.click()); // a tap on the card
      const made = await page.evaluate(() => (window.__ctxs || []).length);
      assert.strictEqual(made, sounds ? 1 : 0, sounds ? "sounds on: the one context" : "sounds off: none");
    });
  }
});
