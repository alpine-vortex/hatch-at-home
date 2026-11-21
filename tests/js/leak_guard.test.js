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
      this.notes = [];
      (window.__ctxs ||= []).push(this);
    }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() {
      const frequency = {
        value: 0,
        setValueAtTime(value) { this.value = value; },
        exponentialRampToValueAtTime() {},
      };
      return { frequency, connect: (n) => n, start: () => this.notes.push(frequency.value), stop() {} };
    }
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

async function withPage(run, { hasTouch = false } = {}) {
  const { startServer } = require(path.join(ROOT, "dev/bench/server"));
  require(path.join(ROOT, "scripts/build-card.js")).ensureBuilt({ quiet: true });
  const { server, url } = await startServer(0);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 460, height: 900 }, hasTouch })).newPage();
    await page.addInitScript(probe);
    await page.goto(`${url}/`);
    const worlds = await page.evaluate(async () => (await (await fetch("/virtual_pet/frontend/worlds.json")).json()));
    const roster = worlds.woodland.roster;
    const mount = (pets, options = {}) => page.evaluate(async (s) => {
      await window.bench.mount(s);
      const c = document.querySelector("hatch-pet-card");
      clearInterval(c._timer); // the bench holds the clock still; run the card's own tick as a page does
      c._timer = setInterval(() => c._tick(), 700);
    }, { ...shot(pets), ...options, pets: shot(pets).pets.map((p, i) => ({ ...p, species: roster[i % roster.length] })) });
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

// Slice 14 (plan 5.14, 7.4): the card as a whole, not the link (the case above is slice 12's N11). Several of the migrated
// one-shots are started on a slide (the backlight, a pat, a care action's hold, a reaction), the card leaves, and once the longest
// due time is past the ledger is empty, card-scope entries included (a disconnect keeps entries running, G9, so the
// check is after the wait, never at the leave).
test("a card that leaves with one-shots running has an empty ledger after their longest due time", { skip, timeout: 120000 }, async () => {
  await withPage(async ({ page, mount }) => {
    const base = await state(page);
    await mount(3);
    await page.evaluate(() => {
      const c = document.querySelector("hatch-pet-card");
      c._tick = () => {};
      const s = c._slides[0];
      c._backlight(s); // lit, 3 s
      c._hold(s, s.screen, ["breezy"], 2600, { key: "breezy" });
      c._pat?.(s);
      c._perk?.(s);
      window.__card = c; // kept: the element leaves the page, its ledger is still readable
      window.__armed = c._director.pending();
    });
    assert.ok(await page.evaluate(() => window.__armed) > 0, "the triggers made ledger entries");
    await page.evaluate(() => document.querySelector("hatch-pet-card").remove());
    await page.waitForTimeout(6500); // past the longest of these (3 s) and the card's 5 s boot wait
    const left = await page.evaluate(() => window.__card._director.pending());
    const after = await state(page);
    assert.strictEqual(after.intervals, base.intervals);
    assert.deepStrictEqual(after.listeners, base.listeners);
    assert.strictEqual(left, 0, "director.pending() is 0 (unscoped: the card scope counts)");
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

test("trusted touches click on controls and the pet, with one immediate sound for a board move", { skip, timeout: 120000 }, async () => {
  await withPage(async ({ page, mount }) => {
    await mount(1);
    await page.evaluate(() => {
      Date.prototype.getHours = () => 12;
      localStorage.setItem("hatch-sounds", "on");
    });
    const notes = () => page.evaluate(() => (window.__ctxs || []).flatMap((ctx) => ctx.notes));
    const status = page.locator(".statusbtn");
    await status.tap();
    await page.locator(".gear").tap();
    await page.locator(".sback").tap();
    await status.tap();
    await page.locator(".pat").tap();
    assert.deepStrictEqual(await notes(), [775, 775, 775, 775, 775]);
    await page.locator(".backlight").tap();
    assert.deepStrictEqual((await notes()).slice(5), [1760]);

    await mount(1, { view: "crate", crate: { level: "easy" } });
    const before = (await notes()).length;
    const left = page.locator('button.toy[aria-label="Push left"]');
    await left.tap();
    assert.deepStrictEqual((await notes()).slice(before), [1319, 1568], "the move already has its own chirp");

    await page.evaluate(() => { Date.prototype.getHours = () => 22; });
    await status.tap();
    assert.equal((await notes()).length, before + 2, "quiet hours");
    await page.evaluate(() => {
      Date.prototype.getHours = () => 12;
      localStorage.setItem("hatch-sounds", "off");
    });
    await status.tap();
    assert.equal((await notes()).length, before + 2, "sounds off");

    await mount(2);
    await page.evaluate(() => { localStorage.setItem("hatch-sounds", "on"); });
    const afterMount = (await notes()).length;
    const viewport = await page.locator(".viewport").boundingBox();
    const x = viewport.x + viewport.width * 0.6;
    const y = viewport.y + 30;
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 85, y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(await page.evaluate(() => document.querySelector("hatch-pet-card")._index), 1);
    assert.deepStrictEqual((await notes()).slice(afterMount), [775], "one click for the shelf swipe");
  }, { hasTouch: true });
});
