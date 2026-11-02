// Drive the pet shelf card in the throwaway HA and check what players see.
//
// Start `scripts/develop` first, then run `scripts/card-check`. On a fresh
// dev/config it onboards the `dev` / `devdevdev` user and creates two pets.
// Screenshots go to dev/card-check/. Exits non-zero if any check fails.
// Needs Playwright with Chromium (preinstalled in the cloud sessions).
//
// Environment: HA_URL (default http://127.0.0.1:8123); SCALE=2 for sharp
// screenshots (the README art uses them). HA_CONFIG and HA_START: the
// instance's config dir and the command that starts it, for the restart and
// the seeded second login (section 8). Without HA_URL they default to
// dev/config and scripts/develop: card-check stops your dev HA there and
// starts it again in the background (its log: dev/card-check/ha-restart.log).
// With HA_URL and without them, section 8 fails rather than skip.
//
// --list prints the section names; --only a,b (or --only a --only b) runs just
// those, in file order. The login, the dashboard, the stubs and the pet-finding
// prelude always run, and a section's own teardown still runs (restart puts
// dev's seeded bond and wish back). Sections lean on the state their
// predecessors leave (the open sheet, the bond, the slide on show), so a lone
// one may need its neighbour: add it to --only. oldcard pulls in restart.
// --shard k/4 runs the k-th of four contiguous runs (see SHARD_STARTS).

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// 127.0.0.1, not localhost: HA registers a service worker on localhost, and page.route
// never sees what it serves (the sprite and old-card stand-ins would not apply).
const HA = process.env.HA_URL || "http://127.0.0.1:8123";
if (!process.env.HA_URL && !process.env.HA_CONFIG && !process.env.HA_START) {
  process.env.HA_CONFIG = path.join(__dirname, "..", "dev", "config");
  process.env.HA_START = `exec ${JSON.stringify(path.join(__dirname, "develop"))}`;
}
const CLIENT = `${HA}/`;
const USER = { username: "dev", password: "devdevdev", name: "Dev" };
const OUT = path.join(__dirname, "..", "dev", "card-check");
const results = [];

// The gated sections of main(), in file order.
const SECTIONS = ["shelf", "shell", "play", "resume", "moments", "photos", "personality", "types",
  "egg", "sharedscreen", "forget", "prefs", "channel", "lcd", "mono", "ghost", "backlight", "pat", "react", "visitors", "winter", "care",
  "editor", "boot", "infrared", "lowbattery", "restart", "gifts", "finds", "collection", "oldcard"];
// oldcard asserts restart's seeded bond; finds taps the basket restart seeds; collection
// opens the finds page on the collection restart seeds; gifts uses restart's bounce (and
// seeded bond) to seed dev's gift in its own restart.
const NEEDS = { oldcard: ["restart"], finds: ["restart"], collection: ["restart"], gifts: ["restart"] };
const argv = process.argv.slice(2);
if (argv.includes("--list")) {
  console.log(SECTIONS.join("\n"));
  process.exit(0);
}
// --shard k/4 runs one of four contiguous runs of sections, split where these
// start (CI runs them side by side). A new section lands in whichever run it
// falls in, so none is skipped. Balanced by CI's seconds per section (2026-11-01:
// about 225, 225, 200 and 175 s each, plus the prelude).
const SHARD_STARTS = ["shelf", "moments", "backlight", "infrared"];
let ONLY = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--shard") {
    const n = SHARD_STARTS.length;
    const m = /^(\d+)\/(\d+)$/.exec(argv[++i] || "");
    const k = Number(m?.[1]);
    if (!m || Number(m[2]) !== n || !(k >= 1 && k <= n)) {
      console.error(`card-check: --shard needs k/${n}, k from 1 to ${n}`);
      process.exit(2);
    }
    const from = SECTIONS.indexOf(SHARD_STARTS[k - 1]);
    const to = k < n ? SECTIONS.indexOf(SHARD_STARTS[k]) : SECTIONS.length;
    ONLY ||= new Set();
    for (const n of SECTIONS.slice(from, to)) ONLY.add(n);
    continue;
  }
  if (argv[i] !== "--only") {
    console.error(`card-check: unknown argument ${argv[i]} (--list, --only <name>[,<name>...], --shard k/4)`);
    process.exit(2);
  }
  ONLY ||= new Set();
  for (const n of (argv[++i] || "").split(",").filter(Boolean)) ONLY.add(n);
}
if (ONLY) {
  const bad = [...ONLY].filter((n) => !SECTIONS.includes(n));
  if (bad.length || !ONLY.size) {
    console.error(`card-check: ${bad.length ? `unknown section ${bad.join(", ")}` : "--only needs a name"}; sections: ${SECTIONS.join(", ")}`);
    process.exit(2);
  }
  for (const n of [...ONLY]) for (const need of NEEDS[n] || []) {
    if (!ONLY.has(need)) console.log(`note: ${n} needs ${need}; running it too`);
    ONLY.add(need);
  }
}
const want = (name) => !ONLY || ONLY.has(name);
// Seconds per section (and the prelude before the first), printed at the end.
const T0 = Date.now();
const timings = [];
const enter = (name) => {
  if (!want(name)) return false;
  timings.push({ name, at: Date.now() });
  return true;
};

// Keep dev pets awake for a section (they go to bed at night, and `_apply` re-sets
// `asleep` from binary_sensor.asleep on every hass push). Overrides el._state for
// asleep / lights_out to "off" while el.__pinAwake is set, and clears the slides'
// leftovers. A server-side call (a fresh hatchling's whine, ~3% of runs after the 1 h
// fast-forward) is read as not calling too, as calm() would have it: no section tests a
// real server call (call lines are driven on the card). `unpinAwake` turns it all off.
function pinAwakeFn(el) {
  const hour = new Date().getHours();
  const was = !!el._slides[el._index]?.asleep;
  if (!el.__pinAwakeInstalled) {
    el.__pinAwakeInstalled = true;
    const real = el._state;
    el._state = function (slide, key) {
      const st = real.call(this, slide, key);
      if (!el.__pinAwake || !st) return st;
      if (key === "binary_sensor.asleep" || key === "switch.lights_out" || key === "binary_sensor.calling") {
        return { ...st, state: "off" };
      }
      if (key === "sensor.mood" && st.state === "calling") {
        return { ...st, state: "content", attributes: { ...st.attributes, reason: "all good", reason_key: "content", flags: [], requests: [] } };
      }
      return st;
    };
  }
  el.__pinAwake = true;
  for (const s of el._slides) {
    Object.assign(s, { asleep: false, lightsOut: false, game: null, power: null, queue: [], sayUntil: 0 });
  }
  el._booting = false;
  return { hour, asleep: was };
}
async function pinAwake(card, section) {
  if (process.env.CARD_CHECK_NIGHT) {
    await card.evaluate((el) => Promise.all(el._slides.map((s) => {
      const id = s.ids?.["binary_sensor.asleep"];
      const st = id && el._hass.states[id];
      return st && el._hass.callApi("POST", `states/${id}`, { state: "on", attributes: st.attributes });
    })));
    await card.page().waitForTimeout(500);
  }
  const r = await card.evaluate(pinAwakeFn);
  if (r.asleep) console.log(`NOTE: dev pet asleep at ${r.hour}:00 in ${section}`);
}
async function unpinAwake(card) {
  // (night mode: put the server's asleep sensors back to "off" for the sections that don't pin)
  await card.evaluate((el, night) => {
    el.__pinAwake = false;
    if (!night) return null;
    return Promise.all(el._slides.map((s) => {
      const id = s.ids?.["binary_sensor.asleep"];
      const st = id && el._hass.states[id];
      return st && el._hass.callApi("POST", `states/${id}`, { state: "off", attributes: st.attributes });
    }));
  }, !!process.env.CARD_CHECK_NIGHT).catch(() => {});
}

// The frontend may reload itself once after a page opens: wait until the page has
// gone `quiet` ms without a navigation (at most `max`), not a fixed 16 s. A fresh
// HA on 127.0.0.1 doesn't reload at all, so this is usually 3 s.
async function settle(pg, quiet = 3000, max = 16000) {
  let last = Date.now();
  const start = last;
  const on = (f) => { if (f === pg.mainFrame()) last = Date.now(); };
  pg.on("framenavigated", on);
  while (Date.now() - last < quiet && Date.now() - start < max) await pg.waitForTimeout(250);
  pg.off("framenavigated", on);
}

// Wait out the card's own timers (a line clearing, a pose or class ending) at once:
// run the page's fake clock `ms` on, firing every timer due, then set its Date back
// to real time, so the card's stamps don't drift from the server's (a 60 s skew
// broke care's timing checks). Only for waits on the card's timers: never for the
// server, image loads, or a CSS animation mid-flight (the clock doesn't drive CSS).
async function skip(pg, ms) {
  await pg.clock.runFor(ms);
  await pg.clock.setSystemTime(new Date());
}

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function api(method, url, token, body, form = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${HA}${url}`, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function waitForHa() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`${HA}/manifest.json`);
      if (res.ok) return;
    } catch (err) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Home Assistant isn't answering at ${HA}; start scripts/develop first`);
}

const token = (code) =>
  api("POST", "/auth/token", null, { grant_type: "authorization_code", code, client_id: CLIENT }, true)
    .then((t) => t.access_token);

// Onboard a fresh instance, or log in to an onboarded one; returns an access token.
async function signIn() {
  // Once onboarding is finished, HA removes this endpoint (404).
  const steps = await api("GET", "/api/onboarding").catch(() => []);
  const userStep = steps.find((s) => s.step === "user");
  if (userStep && !userStep.done) {
    const { auth_code } = await api("POST", "/api/onboarding/users", null, {
      client_id: CLIENT, name: USER.name, username: USER.username, password: USER.password,
      language: "en",
    });
    const access = await token(auth_code);
    for (const step of steps.filter((s) => !s.done && s.step !== "user")) {
      const body = step.step === "integration" ? { client_id: CLIENT, redirect_uri: CLIENT } : {};
      await api("POST", `/api/onboarding/${step.step}`, access, body).catch(() => {});
    }
    console.log("Onboarded a fresh instance as dev/devdevdev");
    return access;
  }
  const flow = await api("POST", "/auth/login_flow", null, {
    client_id: CLIENT, handler: ["homeassistant", null], redirect_uri: CLIENT,
  });
  const done = await api("POST", `/auth/login_flow/${flow.flow_id}`, null, {
    client_id: CLIENT, username: USER.username, password: USER.password,
  });
  if (!done.result) throw new Error("Login failed: is the dev user dev/devdevdev?");
  return token(done.result);
}

// Two pets in different worlds, hatched (fast-forward) so they can play.
async function ensurePets(access) {
  let entries = await api("GET", "/api/config/config_entries/entry?domain=virtual_pet", access);
  for (const [name, world] of [["Checkpip", "woodland"], ["Checkmew", "hearth"]]) {
    if (entries.length >= 2) break;
    const flow = await api("POST", "/api/config/config_entries/flow", access, { handler: "virtual_pet" });
    await api("POST", `/api/config/config_entries/flow/${flow.flow_id}`, access, { name, world });
    entries = await api("GET", "/api/config/config_entries/entry?domain=virtual_pet", access);
  }
  await api("POST", "/api/services/virtual_pet/fast_forward", access, { hours: 1 });
}

// Reload once HA's frontend has finished loading, then wait for `sel`. A reload while
// the frontend is still fetching its code can leave the page on a failed module import
// ("Failed to fetch dynamically imported module"), so the card never appears; seen in
// four gate runs on 2026-10-29. When that happens, reload once more.
async function reloadFor(p, sel, timeout = 60000) {
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await p.reload();
  try {
    await p.waitForSelector(sel, { state: "visible", timeout });
  } catch (err) {
    console.log(`note: ${sel} didn't show after a reload, reloading once more`);
    await p.reload();
    await p.waitForSelector(sel, { state: "visible", timeout });
  }
}

// 2b. The pet's shell (the settings sheet's FOR <PET> row and its picker): the row,
// locked tiles, the live preview and every way out of it, saving and a reload, a
// second pet, a shared screen, an older server and each error line. Every test ends
// on the world's own shell and checks it.
async function shellChecks({ page, context, check, cur, evaluate, inject, shot, after }) {
  const card = page.locator("hatch-pet-card");
  // The pet on show: its name, stage, world and life stage sensor.
  const onShow = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    const st = el._hass.states[s.ids["sensor.life_stage"]];
    return { name: el._linkName(s), stage: st.state, own: s.world.shell?.finish ?? null, world: el._worldName(s).toLowerCase(),
      entity: s.ids["sensor.life_stage"], options: st.attributes.shell_finish_options, locked: st.attributes.shell_locked };
  });
  // What the shell and the picker show, on the slide with this sensor (default: on show).
  const look = (entity = null) => card.evaluate((el, e) => {
    const s = e ? el._slides.find((x) => x.ids?.["sensor.life_stage"] === e) : el._slides[el._index];
    return { finish: [...s.device.classList].find((c) => c.startsWith("finish-")) || null, picker: !!s.picker,
      preview: s.previewFinish === undefined ? "none" : s.previewFinish, tiles: s.status.querySelectorAll(".tile").length,
      locked: [...s.status.querySelectorAll(".tile.locked")].map((t) => t.getAttribute("aria-label")),
      sel: s.status.querySelector(".tile.sel")?.dataset.finish ?? null, now: s.status.querySelector(".tile.now")?.dataset.finish ?? null,
      note: s.status.querySelector(".status-feedback:not([hidden])")?.textContent || "", open: s.screen.classList.contains("show-status"),
      sheet: !!s.status.querySelector(".sback:not(.pback)"), scroll: s.status.scrollTop,
      inkTop: s.device.style.getPropertyValue("--d-ink-top") };
  }, entity);
  const brief = (l) => JSON.stringify({ ...l, locked: l.locked?.length }); // a detail line, not the whole list
  const setShell = (entity, finish) => evaluate(({ entity, finish }) => document.querySelector("home-assistant").hass
    .callWS({ type: "virtual_pet/set_shell", entity_id: entity, finish }).then(() => null, (e) => e.code || String(e)), { entity, finish });
  const attrOf = (entity, key = "shell_finish") => evaluate(({ e, key }) =>
    document.querySelector("home-assistant").hass.states[e].attributes[key] ?? null, { e: entity, key });
  const waitAttr = async (entity, want) => {
    for (let i = 0; i < 50 && (await attrOf(entity)) !== want; i++) await page.waitForTimeout(100);
    return attrOf(entity);
  };
  const ownClass = (pet) => (pet.own ? `finish-${pet.own}` : null);
  const statusUp = async () => (await cur().locator(".screen.show-status").count()) > 0;
  const openSheet = async () => {
    if (!(await statusUp())) await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(250);
    if (await cur().locator(".status .pback").count()) await cur().locator(".status .pback").click();
    if (await cur().locator(".status .gear").count()) await cur().locator(".status .gear").click();
    await page.waitForTimeout(250);
  };
  const openPicker = async () => {
    await openSheet();
    await cur().locator(".status .shellrow").click();
    await page.waitForTimeout(300);
  };
  const closeStatus = async () => {
    if (await statusUp()) await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(250);
  };
  const tap = async (key) => {
    await cur().locator(`.status .tile[data-finish="${key}"]`).click();
    await page.waitForTimeout(200);
  };
  const showPet = (entity) => card.evaluate((el, e) => el._go(el._slides.findIndex((x) => x.ids?.["sensor.life_stage"] === e)), entity);
  // End on the world's own: cleared through the server, then checked on the shell.
  const backToDefault = async (label, pet) => {
    const err = await setShell(pet.entity, null);
    const attr = await waitAttr(pet.entity, null);
    await page.waitForTimeout(300);
    const l = await look(pet.entity);
    check(`shell: ${label} ends on ${pet.name}'s world's own shell`, err === null && attr === null && l.finish === ownClass(pet),
      JSON.stringify({ err, attr, finish: l.finish }));
  };

  await closeStatus();
  const a = await onShow();
  const who = `${a.name} (${a.stage}, ${a.world})`;

  // The row: the pet's own heading, its swatch and name, a button that opens the picker.
  await openSheet();
  const row = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const b = s.status.querySelector(".bell.shellrow");
    return { aria: b?.getAttribute("aria-label"), text: b?.textContent.trim(), swatch: !!b?.querySelector(".sw") };
  });
  check(`shell: ${who}'s row names its shell and opens the picker`,
    row.aria === `shell: ${a.world} (default), change` && row.text === `${a.world} (default)` && row.swatch, JSON.stringify(row));
  await cur().locator(".status .shellrow").click();
  await page.waitForTimeout(300);
  const opened = await look();
  const focus = await card.evaluate((el) => el.shadowRoot.activeElement?.className || "");
  const finishes = 24 - (a.own ? 1 : 0) + 1; // the world's own once, first
  check(`shell: the picker lists every finish, the world's own first and marked now (${who})`,
    opened.picker && opened.tiles === finishes && opened.now === "" && opened.sel === "" && /pback/.test(focus),
    brief({ ...opened, focus }));
  await shot("02d-shell-picker");

  // 4c-rest: every control in the status, the settings sheet and the picker is a real 44x44
  // target at 330 and 420 (.pat is hidden while the status is open), plus the slide dots and
  // the answer buttons, no two overlap, the status shows its wish and meters without
  // scrolling, and the tab order is the page order with no positive tabindex.
  const measure = (view) => card.evaluate((el, view) => {
    const s = el._slides[el._index];
    const sr = s.status.getBoundingClientRect();
    const ctl = [...s.status.querySelectorAll("button, a[href], [tabindex]")]
      .filter((b) => b.getClientRects().length && !b.closest("[hidden]"))
      .map((b) => { const r = b.getBoundingClientRect(); return { name: b.className || b.tagName, w: r.width, h: r.height,
        l: r.left, t: r.top, r: r.right, b: r.bottom, tab: b.getAttribute("tabindex") }; });
    const small = ctl.filter((c) => c.w < 43.5 || c.h < 43.5).map((c) => `${c.name} ${c.w.toFixed(0)}x${c.h.toFixed(0)}`);
    const overlap = [];
    if (view !== "picker") for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      const x = Math.min(ctl[i].r, ctl[j].r) - Math.max(ctl[i].l, ctl[j].l);
      const y = Math.min(ctl[i].b, ctl[j].b) - Math.max(ctl[i].t, ctl[j].t);
      if (x > 1 && y > 1) overlap.push(`${ctl[i].name}/${ctl[j].name}`);
    }
    const seen = view === "status" ? [...s.status.querySelectorAll(".row")]
      .filter((r) => /^(would like|wish|hunger|happy|energy)/.test(r.children[1]?.textContent || ""))
      .map((r) => ({ k: `${r.children[1].textContent} ${Math.round(r.getBoundingClientRect().bottom)}>${Math.round(sr.bottom)}`,
        ok: r.getBoundingClientRect().bottom <= sr.bottom + 1 })) : [];
    return { n: ctl.length, small, overlap, hidden: seen.filter((x) => !x.ok).map((x) => x.k), rows: seen.length,
      posTab: ctl.filter((c) => Number(c.tab) > 0).length, scroll: s.status.scrollTop };
  }, view);
  // A fresh hatchling's server-side call (the status's "would like" row) takes a row of
  // this 158 px box at 330 and pushes the energy meter off it: measure the pet not calling,
  // as the pinned sections do, and draw the status again so it shows.
  await pinAwake(card, "shell 4c");
  await card.evaluate((el) => { for (const s of el._slides) { s.statusHtml = null; s.drawnSig = null; } el._redraw(); });
  const boxIssues = [];
  const boxCounts = {};
  for (const width of [330, 420]) {
    await page.setViewportSize({ width, height: 860 });
    await page.waitForTimeout(500);
    // The slide dots and the compact answer buttons (330 is the compact layout): 44x44 hit
    // boxes, the dots edge to edge so none steals a neighbour's tap, the dot itself still 10 px.
    const tapBoxes = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const dots = [...el.shadowRoot.querySelectorAll(".dots .dot")];
      const dr = dots.map((d) => d.getBoundingClientRect());
      const out = { compact: el._card.classList.contains("compact"), dots: dots.length, small: [], overlap: 0,
        mark: dots.length ? parseFloat(getComputedStyle(dots[0], "::before").height) : 0 };
      dr.forEach((r, i) => {
        if (r.width < 43.5 || r.height < 43.5) out.small.push(`dot ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
        for (let j = i + 1; j < dr.length; j++) {
          if (Math.min(r.right, dr[j].right) - Math.max(r.left, dr[j].left) > 1
            && Math.min(r.bottom, dr[j].bottom) - Math.max(r.top, dr[j].top) > 1) out.overlap++;
        }
      });
      // The sheets hide the screen: look at it for a moment as it is with no sheet open.
      const wasOpen = s.screen.classList.contains("show-status");
      s.screen.classList.remove("show-status");
      await new Promise((r) => setTimeout(r, 60));
      el._ask(s, "catchphrase");
      const bs = [...s.screen.querySelectorAll(".askday button")];
      out.answers = bs.length;
      for (const b of bs) {
        const r = b.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) out.small.push(`answer ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
      }
      el._clearAsk(s);
      if (wasOpen) s.screen.classList.add("show-status");
      return out;
    });
    if (tapBoxes.dots < 2 || tapBoxes.answers < 2 || tapBoxes.small.length || tapBoxes.overlap || tapBoxes.mark !== 10
      || tapBoxes.compact !== (width === 330)) boxIssues.push(`${width} dots/answers: ${JSON.stringify(tapBoxes)}`);
    boxCounts[`${width}-tapBoxes`] = tapBoxes.dots + "d" + tapBoxes.answers + "a";
    for (const view of ["picker", "settings", "status"]) {
      if (view === "settings") await cur().locator(".status .pback").click();
      if (view === "status") await cur().locator(".status .sback").click();
      await page.waitForTimeout(300);
      const m = await measure(view);
      boxCounts[`${width}-${view}`] = m.n;
      if (m.small.length || m.overlap.length || m.hidden.length || m.posTab || m.n < 2) boxIssues.push(`${width} ${view}: ${JSON.stringify(m)}`);
      if (view === "status" && m.rows < 3) boxIssues.push(`${width} status: only ${m.rows} meter rows found`);
      if (view === "status") { await cur().locator(".status .gear").click(); await page.waitForTimeout(250); }
      if (view === "settings") {
        // Tab from the back row visits the buttons in page order.
        await cur().locator(".status .sback").focus();
        const order = [];
        for (let i = 0; i < 4; i++) {
          order.push(await card.evaluate((el) => el.shadowRoot.activeElement?.className.split(" ").slice(0, 2).join(" ")));
          await page.keyboard.press("Tab");
        }
        const dom = await card.evaluate((el) => [...el._slides[el._index].status.querySelectorAll("button")].slice(0, 4)
          .map((b) => b.className.split(" ").slice(0, 2).join(" ")));
        if (order.join() !== dom.join()) boxIssues.push(`${width} tab order ${order} vs ${dom}`);
        await cur().locator(".status .shellrow").click(); // and into the picker's turn
        await page.waitForTimeout(250);
        await cur().locator(".status .pback").click();
        await page.waitForTimeout(250);
      }
    }
    // Settings, shared screen: the person's rows hide. Misses and whines are on the
    // status page (top10 4a), shared screens included, and no longer in the sheet.
    const shared = await card.evaluate((el) => {
      const s = el._slides[el._index];
      localStorage.setItem("hatch-shared-screen", "on");
      el._renderStatus(s, []);
      const t = s.status.textContent;
      const out = { inSheet: /missed calls|ignored whines/.test(t), personal: /notify me|my data|baby talk/.test(t),
        group: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent).join("|") };
      s.settings = false;
      // The two rows come with the first miss (UX fix 4, F12): give this pet one.
      const missId = s.ids["sensor.care_misses"];
      const realHass = el._hass;
      const was = realHass.states[missId];
      el._hass = { ...realHass, states: { ...realHass.states, [missId]: { ...was, state: "2", attributes: { ...was?.attributes, discipline_misses: 1 } } } };
      el._renderStatus(s, []);
      out.onStatus = /missed calls/.test(s.status.textContent) && /ignored whines/.test(s.status.textContent);
      el._hass = realHass;
      s.settings = true;
      localStorage.setItem("hatch-shared-screen", "off");
      el._renderStatus(s, []);
      return out;
    });
    if (shared.inSheet || !shared.onStatus || shared.personal) boxIssues.push(`${width} shared ${JSON.stringify(shared)}`);
    // Back to the picker for the checks that follow.
    await cur().locator(".status .shellrow").click();
    await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(400);
  check("4c: every status, settings and picker control is 44x44 at 330 and 420, none overlap, the wish and meters show unscrolled, tab order is page order, a shared screen's status has misses/whines",
    boxIssues.length === 0, boxIssues.join(" ; ") || JSON.stringify(boxCounts));
  await unpinAwake(card);

  // Locked tiles (a pet below teen): shown dimmed with their stage, never hidden; a tap
  // says when, saves nothing and leaves the shell as it is.
  const lockedKeys = Object.keys(a.locked || {});
  check(`shell: ${who} is below teen, so the show-offs are locked`, lockedKeys.length === 6, JSON.stringify(a.locked));
  check("shell: never hidden: every locked finish has a tile saying the stage that opens it",
    lockedKeys.every((k) => opened.locked.includes(`${k === "twotone" ? "two-tone" : k} shell, opens at ${a.locked[k]}`)) &&
      opened.locked.length === lockedKeys.length, JSON.stringify(opened.locked));
  if (lockedKeys.length) {
    await cur().locator(`.status .tile[data-finish="${lockedKeys[0]}"]`).scrollIntoViewIfNeeded();
    await tap(lockedKeys[0]);
    const l = await look();
    check("shell: a locked tile says when and changes nothing",
      l.note === "I get this one as a teen ♪" && l.finish === ownClass(a) && l.preview === "none" &&
        (await attrOf(a.entity)) === null, brief(l));
    await shot("02e-shell-locked");
  }
  // The server refuses a locked one too (the card never asks it for one).
  check("shell: the server refuses a shell the pet hasn't grown into", (await setShell(a.entity, lockedKeys[0] || "glitter")) === "shell_locked");

  // The live preview: a tap dresses the shell, saves nothing, keeps the list where it is.
  await tap("twotone");
  const two = await look();
  await tap("camo");
  const camo = await look();
  check("shell: a tap previews on the live shell, unsaved, and the mark moves to it",
    two.finish === "finish-twotone" && two.inkTop !== "" && camo.finish === "finish-camo" && camo.sel === "camo" &&
      camo.now === "" && (await attrOf(a.entity)) === null, JSON.stringify({ two: two.finish, camo: camo.finish, sel: camo.sel }));
  check("shell: a finish without a top colour clears the last one's (--d-ink-top)", camo.inkTop === "", camo.inkTop);
  // `use` names what it saves; on the world's own tile, the world's own.
  const useAria = () => cur().locator(".status .puse").getAttribute("aria-label");
  const camoAria = await useAria();
  await tap("");
  const ownAria = await useAria();
  const useOffOnOwn = await cur().locator(".status .puse").getAttribute("aria-disabled"); // nothing new to save (F7)
  await tap("camo");
  const useOnOnCamo = await cur().locator(".status .puse").getAttribute("aria-disabled");
  check("shell: use is dimmed until the preview differs from the saved pick (settings UX F7)",
    useOffOnOwn === "true" && useOnOnCamo === "false", JSON.stringify([useOffOnOwn, useOnOnCamo]));
  check("shell: use is labelled for the tile on the shell, the world's own as such",
    camoAria === "use camo shell" && ownAria === "use the world's own shell", JSON.stringify([camoAria, ownAria]));
  // ...and survives a hass update: a mood tick, then the sun going down and up.
  const preTick = await look(); // the list's scroll now (the taps above moved it)
  const sun = await evaluate(() => { const st = document.querySelector("home-assistant").hass.states["sun.sun"]; return { state: st.state, attributes: st.attributes }; });
  await inject(a.entity.replace("life_stage", "mood"), { attributes: { cc_tick: Date.now() } });
  await page.waitForTimeout(500);
  const ticked = await look();
  await inject("sun.sun", { state: sun.state === "below_horizon" ? "above_horizon" : "below_horizon" });
  await page.waitForTimeout(500);
  const sunned = await look();
  await inject("sun.sun", sun);
  await page.waitForTimeout(300);
  check("shell: the preview survives a mood tick and the sun's change, and the list doesn't redraw",
    [ticked, sunned].every((l) => l.finish === "finish-camo" && l.sel === "camo" && l.picker && l.scroll === preTick.scroll),
    JSON.stringify({ ticked: ticked.finish, sunned: sunned.finish, scroll: [preTick.scroll, ticked.scroll, sunned.scroll] }));

  // Leaving without saving puts the shell back, by every way out.
  const reverted = (l) => l.finish === ownClass(a) && !l.picker && l.preview === "none";
  await cur().locator(".status .pback").click();
  await page.waitForTimeout(250);
  let l = await look();
  const backFocus = await card.evaluate((el) => el.shadowRoot.activeElement?.className || "");
  check("shell: back (‹ settings) reverts the preview, keeps the sheet and focuses the row",
    reverted(l) && l.sheet && /shellrow/.test(backFocus), brief({ ...l, backFocus }));
  await openPicker();
  await tap("camo");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(250);
  l = await look();
  check("shell: the Status chip reverts the preview", reverted(l) && !l.open, brief(l));
  await openPicker();
  await tap("camo");
  l = await card.evaluate((el) => { // the slide getting another pet (_forget), then drawn again
    const s = el._slides[el._index];
    el._forget(s);
    el._redraw(s);
    return null;
  });
  await page.waitForTimeout(600);
  l = await look();
  check("shell: another pet in the slide (_forget) reverts the preview", reverted(l), brief(l));
  await closeStatus();
  // A swipe to another pet: the picker it leaves closes, back to the sheet.
  await openPicker();
  await tap("camo");
  const next = await card.evaluate((el, e) => el._slides.findIndex((x) => x.ids?.["sensor.life_stage"] && x.ids["sensor.life_stage"] !== e), a.entity);
  await card.evaluate((el, i) => el._go(i), next);
  await page.waitForTimeout(500);
  l = await look(a.entity);
  check("shell: a swipe to another pet reverts the preview and leaves the sheet up", reverted(l) && l.sheet && l.tiles === 0, brief(l));
  await showPet(a.entity);
  await page.waitForTimeout(500);
  await closeStatus();
  // A shared screen turned on by another card here (its event) or in another tab
  // (storage): the picker closes, the shell goes back, the sheet shows it read-only.
  await openPicker();
  await tap("camo");
  await evaluate(() => {
    localStorage.setItem("hatch-shared-screen", "on");
    window.dispatchEvent(new CustomEvent("hatch-shared-changed", { detail: { on: true } }));
  });
  await page.waitForTimeout(500);
  l = await look();
  const shared = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const out = { heads: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent), button: !!s.status.querySelector(".shellrow"),
      ro: s.status.querySelector(".shellro")?.textContent.trim(), note: s.status.querySelector(".shellnote")?.textContent };
    s.picker = true; // the picker can't be reached, even asked for directly
    el._renderStatus(s, []);
    out.tiles = s.status.querySelectorAll(".tile").length;
    out.picker = !!s.picker;
    return out;
  });
  check("shell: a shared screen turned on here reverts the preview and closes the picker", reverted(l) && l.sheet, brief(l));
  check("shell: on a shared screen the row is read-only, named for no one, with its note; the picker is unreachable",
    shared.heads[0] === "for the pet" && !shared.heads.some((h) => h.includes(a.name.toLowerCase()) || h.includes(a.name)) &&
      !shared.button && shared.ro === `${a.world} (default)` && shared.note === "ask a grown-up to change it" &&
      shared.tiles === 0 && !shared.picker, JSON.stringify(shared));
  await shot("02f-shell-shared");
  await evaluate(() => {
    localStorage.setItem("hatch-shared-screen", "off");
    window.dispatchEvent(new CustomEvent("hatch-shared-changed", { detail: { on: false } }));
  });
  await page.waitForTimeout(500);
  await openPicker();
  await tap("camo");
  const tab = await context.newPage();
  await tab.goto(after.url);
  await tab.evaluate(() => localStorage.setItem("hatch-shared-screen", "on"));
  await page.waitForTimeout(700);
  l = await look();
  check("shell: a shared screen turned on in a second tab reverts the preview here", reverted(l), brief(l));
  await tab.evaluate(() => localStorage.setItem("hatch-shared-screen", "off"));
  await page.waitForTimeout(500);
  await tab.close();
  await backToDefault("the ways out", a);

  // Pick, use, and a reload keeps it; the world's own tile + `use` clears it (F6: no `world default` button).
  await openPicker();
  await cur().locator('.status .tile[data-finish="stripes"]').scrollIntoViewIfNeeded();
  await tap("stripes");
  await cur().locator(".status .puse").click();
  const savedAttr = await waitAttr(a.entity, "stripes");
  await page.waitForTimeout(300);
  l = await look();
  check("shell: use saves it: the line, the sensor, `now` and the shell",
    savedAttr === "stripes" && l.note === "shell saved ♪" && l.now === "stripes" && l.finish === "finish-stripes" && l.picker,
    brief({ savedAttr, ...l }));
  await after.reload();
  await showPet(a.entity);
  await page.waitForTimeout(500);
  l = await look(a.entity);
  check("shell: a reload keeps the saved shell", l.finish === "finish-stripes", brief(l));
  await openPicker();
  await tap("");
  await cur().locator(".status .puse").click();
  const cleared = await waitAttr(a.entity, null);
  await page.waitForTimeout(300);
  l = await look();
  check("shell: the world's own tile and use clear it: the line, the sensor, `now` and the shell",
    cleared === null && l.note === "back to the world's own ♪" && l.now === "" && l.finish === ownClass(a), brief({ cleared, ...l }));
  await backToDefault("save and reload", a);

  // Closing right after `use` doesn't flicker back to the old shell before the push.
  await openPicker();
  await cur().locator('.status .tile[data-finish="dots"]').scrollIntoViewIfNeeded();
  await tap("dots");
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    window.__shellSeen = [];
    window.__shellObs = new MutationObserver(() => window.__shellSeen.push(s.device.className));
    window.__shellObs.observe(s.device, { attributes: true, attributeFilter: ["class"] });
  });
  await cur().locator(".status .puse").click();
  await page.locator("hatch-pet-card .statusbtn").click(); // closed before the reply
  await waitAttr(a.entity, "dots");
  await page.waitForTimeout(800);
  const seen = await evaluate(() => { window.__shellObs.disconnect(); return window.__shellSeen; });
  l = await look();
  check("shell: closing right after use doesn't flicker",
    seen.every((c) => c.includes("finish-dots")) && l.finish === "finish-dots", JSON.stringify({ seen: [...new Set(seen)], finish: l.finish }));
  // The fresh pick holds until the sensor agrees, or 5 s (here the reply never reaches the server).
  await openPicker();
  await cur().locator('.status .tile[data-finish="waves"]').scrollIntoViewIfNeeded();
  await tap("waves");
  await card.evaluate((el) => {
    const real = el._hass.callWS;
    el.__realWS = real;
    el._hass.callWS = (msg) => (msg.type === "virtual_pet/set_shell" ? Promise.resolve(null) : real(msg));
  });
  await cur().locator(".status .puse").click();
  await closeStatus();
  await page.waitForTimeout(1000);
  const held = await look();
  await page.waitForTimeout(5000);
  const lapsed = await look();
  await card.evaluate((el) => { el._hass.callWS = el.__realWS; });
  check("shell: a fresh pick holds until the sensor agrees, then 5 s at most",
    held.finish === "finish-waves" && lapsed.finish === "finish-dots", JSON.stringify({ held: held.finish, lapsed: lapsed.finish }));
  await backToDefault("closing after use", a);

  // A second pet keeps its own.
  const other = await card.evaluate((el, e) => el._slides.findIndex((x) => x.ids?.["sensor.life_stage"] && x.ids["sensor.life_stage"] !== e), a.entity);
  await card.evaluate((el, i) => el._go(i), other);
  await page.waitForTimeout(500);
  const b = await onShow();
  await setShell(a.entity, "stripes");
  await waitAttr(a.entity, "stripes");
  await openPicker();
  await cur().locator('.status .tile[data-finish="dots"]').scrollIntoViewIfNeeded();
  await tap("dots");
  await cur().locator(".status .puse").click();
  await waitAttr(b.entity, "dots");
  await page.waitForTimeout(300);
  const [la, lb] = [await look(a.entity), await look(b.entity)];
  check(`shell: ${a.name} (${a.stage}) and ${b.name} (${b.stage}, ${b.world}) each keep their own`,
    (await attrOf(a.entity)) === "stripes" && (await attrOf(b.entity)) === "dots" && la.finish === "finish-stripes" && lb.finish === "finish-dots",
    JSON.stringify({ a: la.finish, b: lb.finish }));
  await closeStatus();
  await backToDefault("a second pet", b);
  await backToDefault("a second pet", a);
  await showPet(a.entity);
  await page.waitForTimeout(400);

  // An older server (no shell_finish_options): no row, no pet heading, no picker.
  await openSheet();
  const older = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const real = el._state;
    el._state = function (slide, key) {
      const st = real.call(this, slide, key);
      if (key !== "sensor.life_stage" || !st) return st;
      const { shell_finish_options, shell_locked, senses, ...rest } = st.attributes;
      return { ...st, attributes: rest };
    };
    s.statusHtml = null;
    el._renderStatus(s, []);
    const out = { heads: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent), row: !!s.status.querySelector(".shellrow, .shellro") };
    s.picker = true;
    el._renderStatus(s, []);
    out.tiles = s.status.querySelectorAll(".tile").length;
    el._state = real;
    s.statusHtml = null;
    el._renderStatus(s, []);
    return out;
  });
  check("shell: an older server's sheet has no shell row, no picker and no pet group (misses and whines are on status, top10 4a)",
    /^for you\|this screen$/.test(older.heads.join("|")) && !older.row && older.tiles === 0, JSON.stringify(older));

  // Each error line: the shell goes back to its pick and the picker stays open.
  await openPicker();
  const errors = [["no_pet", "can't find this pet"], ["shell_locked", "not grown into that one yet"],
    ["invalid_format", "that didn't work, try later"], [null, "that didn't work, try later"],
    ["unknown_command", "can't change the shell here"]];
  const lines = [];
  for (const [code, line] of errors) {
    await card.evaluate((el, c) => {
      const real = el.__realWS || el._hass.callWS;
      el.__realWS = real;
      el._hass.callWS = (msg) => (msg.type === "virtual_pet/set_shell" ? Promise.reject(c ? { code: c, message: c } : new Error("gone")) : real(msg));
    }, code);
    await tap("camo");
    await cur().locator(".status .puse").click();
    await page.waitForTimeout(300);
    const e = await look();
    lines.push({ code, note: e.note, finish: e.finish, picker: e.picker });
    check(`shell: a ${code || "codeless"} failure says "${line}", puts the shell back and stays open`,
      e.note === line && e.finish === ownClass(a) && e.picker && e.preview === "none", brief(e));
  }
  await card.evaluate((el) => { el._hass.callWS = el.__realWS; delete el.__realWS; });
  // ...and the real server's refusal: a show-off offered by a stale list.
  await inject(a.entity, { attributes: { shell_finish_options: [...a.options, ...lockedKeys] } });
  await page.waitForTimeout(400);
  await openPicker();
  if (lockedKeys.length) {
    await cur().locator(`.status .tile[data-finish="${lockedKeys[0]}"]`).scrollIntoViewIfNeeded();
    await tap(lockedKeys[0]);
    await cur().locator(".status .puse").click();
    await page.waitForTimeout(800);
    l = await look();
    check("shell: the server's own refusal of a locked shell says so and puts the shell back",
      l.note === "not grown into that one yet" && l.finish === ownClass(a) && l.picker && (await attrOf(a.entity)) === null, brief(l));
  }
  await closeStatus();
  await backToDefault("the error lines", a);
  const restored = await attrOf(a.entity, "shell_finish_options");
  check("shell: the stale list is gone again", JSON.stringify(restored) === JSON.stringify(a.options), JSON.stringify(restored));
}

// 2d. Big text (top10 4b): the "big text" row in THIS SCREEN, per browser, off by
// default. On, the status box's words grow (16 px) and no page runs off the box
// sideways at 330 (status, settings, journal); another tab's change is followed; off
// puts it back.
async function bigTextChecks({ page, check, cur, shot }) {
  const card = page.locator("hatch-pet-card");
  const state = () => card.first().evaluate((el) => {
    const s = el._slides[el._index];
    const bell = s.status.querySelector(".bell.bigtext");
    return { on: el._card.classList.contains("bigtext"), stored: localStorage.getItem("hatch-big-text"),
      row: bell && { text: bell.textContent, pressed: bell.getAttribute("aria-pressed"), label: bell.getAttribute("aria-label") },
      size: getComputedStyle(s.status).fontSize };
  });
  const openSheet = async () => {
    await card.evaluate((el) => {
      const s = el._slides[el._index];
      if (!s.screen.classList.contains("show-status")) el._toggleStatus(s);
    });
    await page.waitForTimeout(300);
    if (await cur().locator(".status .gear").count()) await cur().locator(".status .gear").click();
    await page.waitForTimeout(300);
  };
  await card.evaluate((el) => { localStorage.removeItem("hatch-big-text"); el._card.classList.remove("bigtext"); });
  await openSheet();
  const off = await state();
  check("big text: a row in this screen, off by default, 13 px",
    !off.on && off.stored === null && off.row?.text === "off" && off.row.pressed === "false" &&
    off.row.label === "big text: larger words on this screen's pages" && off.size === "13px", JSON.stringify(off));
  await cur().locator(".bell.bigtext").click();
  await page.waitForTimeout(300);
  const on = await state();
  check("big text: on stores \"on\", the row says so and the words are 16 px",
    on.on && on.stored === "on" && on.row?.text === "on" && on.row.pressed === "true" && on.size === "16px", JSON.stringify(on));
  // Nothing runs off the box sideways at 330: status, settings, journal.
  const vp = page.viewportSize();
  await page.setViewportSize({ width: 330, height: 860 });
  await page.waitForTimeout(400);
  const fits = await card.first().evaluate(async (el) => {
    const s = el._slides[el._index];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fit = () => s.status.scrollWidth <= s.status.clientWidth + 1;
    // What sticks out, when something does: the innermost elements past the box's right
    // edge (fm-batch-043 failed here on CI only; this names the culprit next time).
    const wide = () => {
      const edge = s.status.getBoundingClientRect().right + 1;
      return [...s.status.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > edge &&
        ![...e.children].some((c) => c.getBoundingClientRect().right > edge))
        .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} ${Math.round(e.getBoundingClientRect().right - edge)}px "${(e.textContent || "").trim().slice(0, 50)}"`);
    };
    const out = {};
    s.settings = true; s.journal = false; s.finds = false;
    el._renderStatus(s, []); await wait(200); out.settings = fit();
    s.settings = false;
    el._renderStatus(s, []); await wait(200); out.status = fit();
    if (!out.status) out.statusWide = wide();
    // The widest "learning" row (fm-batch-043's CI failure: a longer trait than this
    // machine's pet had pushed its bar 3 px out): the longest trait name, learning.
    const realState = el._state;
    el._state = function (sl, k) {
      const st = realState.call(this, sl, k);
      return k === "sensor.life_stage" && st && sl === s
        ? { ...st, attributes: { ...st.attributes, traits: [], trait_progress: { social_butterfly: 0.5 } } } : st;
    };
    try {
      el._renderStatus(s, []); await wait(200);
      out.learning = !!s.status.querySelector(".tnext") && fit();
      if (!out.learning) out.learningWide = wide();
    } finally {
      el._state = realState;
    }
    s.journal = true;
    el._renderStatus(s, []); await wait(1500); out.journal = fit();
    s.journal = false;
    el._renderStatus(s, []);
    return out;
  });
  await shot("d3-bigtext-330");
  check("big text at 330: status, settings and the journal fit the box's width", fits.status && fits.settings && fits.journal, JSON.stringify(fits));
  check("big text at 330: the status page learning the longest trait fits the box's width", fits.learning, JSON.stringify(fits));
  await page.setViewportSize(vp);
  // Another tab's change arrives as a storage event (the mono listener reads it too).
  const kept = await card.first().evaluate((el) => {
    el._card.classList.remove("bigtext");
    window.dispatchEvent(new StorageEvent("storage", { key: "hatch-big-text" }));
    return el._card.classList.contains("bigtext");
  });
  check("big text: another tab's change (a storage event) is followed", kept, String(kept));
  await openSheet();
  await cur().locator(".bell.bigtext").click();
  await page.waitForTimeout(300);
  const back = await state();
  check("big text: off removes the key and the words are 13 px again", !back.on && back.stored === null && back.size === "13px", JSON.stringify(back));
  await card.evaluate((el) => { const s = el._slides[el._index]; if (s.screen.classList.contains("show-status")) el._toggleStatus(s); });
  await page.waitForTimeout(300);
}

// 2c. The mono screen (gear slice 5): the "mono screen" row in THIS SCREEN, per
// browser. The screen and the IR beam take the 4-tone filter, the plastic keeps its
// colour, the grid moves to .mono-grid (only with screen effects on, never with more
// contrast), a reload keeps it, a second tab follows, and no storage leaves it off.
async function monoChecks({ page, context, check, cur, evaluate, shot, errors }) {
  const card = page.locator("hatch-pet-card");
  const redraw = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    s.statusHtml = null;
    el._renderStatus(s, el._state(s, "sensor.last_care")?.attributes.log || []);
  });
  const look = (p = page) => p.locator("hatch-pet-card").first().evaluate((el) => {
    const s = el._slides[el._index];
    const css = (n) => (n ? getComputedStyle(n) : null);
    const bell = s.status.querySelector(".bell.mono");
    const grid = s.el.querySelector(".mono-grid");
    const a = grid.getBoundingClientRect();
    const b = s.screen.getBoundingClientRect();
    // A beam image of the card's own kind, to read the rule that reaches it.
    const beam = document.createElement("div");
    beam.className = "irbeam";
    beam.innerHTML = "<img alt=''>";
    el._track.append(beam);
    const beamFilter = css(beam.firstChild).filter;
    beam.remove();
    // A filter on any ancestor of the plastic would tint it too: walk up to ha-card.
    const filterUp = (n) => { for (; n && n !== el._card; n = n.parentElement) if (css(n).filter !== "none") return true; return false; };
    return {
      ancestorFilter: [s.request, s.el.querySelector(".buttons"), s.label].some(filterUp),
      on: el._card.classList.contains("mono"), stored: localStorage.getItem("hatch-mono"),
      row: bell && { text: bell.textContent, pressed: bell.getAttribute("aria-pressed"), label: bell.getAttribute("aria-label") },
      screen: css(s.screen).filter, beam: beamFilter, request: css(s.request).filter,
      buttons: css(s.el.querySelector(".buttons")).filter, label: css(s.label).filter,
      glow: css(s.screen.querySelector(".glow")).display, lcd: css(s.screen.querySelector(".lcd")).display,
      ghost: css(s.ghost).display, grid: css(grid).display,
      fits: Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1,
    };
  });
  const tap = async () => {
    await cur().locator(".bell.mono").click();
    await page.waitForTimeout(300);
  };
  const filtered = (f) => /url\(.*hatch-mono4/.test(f || "");
  const plain = (m) => m.request === "none" && m.buttons === "none" && m.label === "none" && !m.ancestorFilter;

  await card.evaluate((el) => { localStorage.removeItem("hatch-mono"); el._card.classList.remove("mono"); });
  await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
  await page.waitForTimeout(400);
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  const off = await look();
  check("mono screen: a row in this screen, off by default",
    !off.on && off.stored === null && off.row?.text === "off" && off.row.pressed === "false" &&
    off.row.label === "mono screen: off, change" && !filtered(off.screen) &&
    await cur().locator(".status .sec", { hasText: "this screen" }).count() === 1,
    JSON.stringify(off));
  await tap();
  const on = await look();
  await cur().locator(".status .row", { hasText: "mono screen" }).scrollIntoViewIfNeeded();
  await shot("d2-mono-row");
  check("mono screen: on stores \"4\" and the screen and beam take the 4-tone filter, the plastic keeps its colour",
    on.on && on.stored === "4" && on.row?.text === "on" && on.row.pressed === "true" && on.row.label === "mono screen: on, change" &&
    filtered(on.screen) && filtered(on.beam) && plain(on),
    JSON.stringify(on));
  // The request button: hidden over the sheet (the rule reaches it past .mono-grid).
  const request = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const had = s.request.classList.contains("show");
    s.request.classList.add("show");
    const over = getComputedStyle(s.request).display;
    el._toggleStatus(s);
    await new Promise((r) => setTimeout(r, 400));
    const after = getComputedStyle(s.request).display;
    if (!had) s.request.classList.remove("show");
    return { over, after };
  });
  check("the wants-attention button stays hidden over the sheet and shows without it",
    request.over === "none" && request.after !== "none", JSON.stringify(request));
  // Screen effects off: no grid at all; on: .mono-grid over the screen, the
  // in-screen grid, ghost and glow hidden. Put back as they were after.
  const setLcd = (on) => card.evaluate((el, on) => { localStorage.setItem("hatch-lcd", on ? "on" : "off"); el._card.classList.toggle("lcd-on", on); }, on);
  const lcdWas = await card.evaluate((el) => el._card.classList.contains("lcd-on"));
  await setLcd(false);
  await page.waitForTimeout(300);
  const fxOff = await look();
  check("mono with screen effects off: filtered, no grid, glow and ghost hidden",
    fxOff.on && filtered(fxOff.screen) && fxOff.grid === "none" && fxOff.lcd === "none" && fxOff.glow === "none" && fxOff.ghost === "none",
    JSON.stringify(fxOff));
  const sheet = async (open) => {
    const now = await card.evaluate((el) => el._slides[el._index].screen.classList.contains("show-status"));
    if (now !== open) {
      await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
      await page.waitForTimeout(400);
    }
  };
  await setLcd(true);
  await sheet(true);
  await page.waitForTimeout(300);
  const fxOn = await look();
  await shot("d2-mono-on");
  check("mono with screen effects on, sheet open: .mono-grid hidden over the sheet, the in-screen grid, ghost and glow hidden",
    fxOn.grid === "none" && fxOn.lcd === "none" && fxOn.ghost === "none" && fxOn.glow === "none" && filtered(fxOn.screen),
    JSON.stringify(fxOn));
  await sheet(false);
  const fxClosed = await look();
  await shot("d2-mono-on");
  check("mono with screen effects on, sheet closed: the grid drawn over the screen by .mono-grid",
    fxClosed.grid === "block" && fxClosed.fits && fxClosed.lcd === "none", JSON.stringify(fxClosed));
  // Boot screen and an open game cover the grid, as they cover .lcd in colour.
  const covered = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const grid = getComputedStyle(s.el.querySelector(".mono-grid"));
    const was = [s.boot.hidden, s.el.querySelector(".game").hidden];
    s.boot.hidden = false;
    const boot = grid.display;
    s.boot.hidden = was[0];
    s.el.querySelector(".game").hidden = false;
    const game = grid.display;
    s.el.querySelector(".game").hidden = was[1];
    return { boot, game, after: grid.display };
  });
  check("mono grid: hidden over the boot screen and an open game, back after",
    covered.boot === "none" && covered.game === "none" && covered.after === "block", JSON.stringify(covered));
  await page.emulateMedia({ contrast: "more" });
  await page.waitForTimeout(300);
  const contrast = await look();
  await page.emulateMedia({ contrast: null });
  check("mono with prefers-contrast: more: still filtered, no grid",
    contrast.on && filtered(contrast.screen) && contrast.grid === "none" && contrast.lcd === "none" && plain(contrast),
    JSON.stringify(contrast));
  await setLcd(lcdWas);

  // A reload keeps it (a second tab opens on the same storage), and that tab
  // follows the first through the storage event, off and on again.
  const tab = await context.newPage();
  tab.on("pageerror", (e) => errors.push(`mono tab: ${e}`));
  await tab.goto(`${HA}/pet-bench/pet`);
  await tab.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
  await settle(tab); // the frontend may reload itself once
  await tab.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 }).catch(() => reloadFor(tab, "hatch-pet-card .statusbtn", 30000));
  const opened = await tab.locator("hatch-pet-card").first().evaluate((el) => el._card.classList.contains("mono"));
  await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
  await page.waitForTimeout(400);
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  await tap();
  await tab.waitForTimeout(500);
  const followedOff = await tab.locator("hatch-pet-card").first().evaluate((el) => el._card.classList.contains("mono"));
  await tap();
  await tab.waitForTimeout(500);
  const followedOn = await tab.locator("hatch-pet-card").first().evaluate((el) => el._card.classList.contains("mono"));
  await tab.close();
  check("mono screen: a fresh load keeps it, and a second tab follows off and on",
    opened === true && followedOff === false && followedOn === true, JSON.stringify({ opened, followedOff, followedOn }));

  // Off again: the key goes, not "off".
  await tap();
  const offAgain = await look();
  check("mono screen: off removes the key and the filter",
    !offAgain.on && offAgain.stored === null && offAgain.row?.text === "off" && !filtered(offAgain.screen), JSON.stringify(offAgain));

  // No storage (for this key, so the rest of the card runs on): the row reads off
  // and a tap changes nothing.
  await card.evaluate((el) => {
    el.__storage = ["getItem", "setItem", "removeItem"].map((k) => [k, Storage.prototype[k]]);
    for (const [k, f] of el.__storage) {
      Storage.prototype[k] = function (key, ...rest) {
        if (key === "hatch-mono") throw new Error("no storage");
        return f.call(this, key, ...rest);
      };
    }
  });
  await redraw();
  await page.waitForTimeout(300);
  await tap();
  const none = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const bell = s.status.querySelector(".bell.mono");
    const out = { on: el._card.classList.contains("mono"), text: bell?.textContent, pressed: bell?.getAttribute("aria-pressed") };
    for (const [k, f] of el.__storage) Storage.prototype[k] = f;
    delete el.__storage;
    return { ...out, stored: localStorage.getItem("hatch-mono") };
  });
  check("mono screen: with no storage it stays off and a tap changes nothing",
    !none.on && none.text === "off" && none.pressed === "false" && none.stored === null, JSON.stringify(none));
  await redraw();
  await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
  await page.waitForTimeout(400);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await waitForHa();
  const access = await signIn();
  // The frontend only settles once HA has finished starting.
  for (let i = 0; i < 60; i++) {
    if ((await api("GET", "/api/config", access)).state === "RUNNING") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await ensurePets(access);

  // Audio may start without a tap here, so the babble checks can hear it play.
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  // A context of its own, so a check can open a second tab on the same storage.
  const context = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: Number(process.env.SCALE || 1) });
  // Playwright's clock on every page, flowing in real time: skip() moves it on
  // past the card's own timers instead of sleeping (see skip below).
  await context.clock.install();
  // CARD_CHECK_NIGHT=1 plays a night: the browser's hour reads 2 (Date.now stays honest, so
  // the waits still add up) and every pet's server-side asleep sensor is put "on" whenever a
  // section pins the pets awake (pinAwake), so the pin is what keeps them up.
  if (process.env.CARD_CHECK_NIGHT) await context.addInitScript(() => { Date.prototype.getHours = () => 2; });
  // CARD_CHECK_DAY_SHIFT=n: the card's turn-taking lines (turnPick, dailyPick, the promise)
  // stand n days on, so a run can prove its checks hold on any day (fresh-expand).
  if (process.env.CARD_CHECK_DAY_SHIFT) {
    await context.addInitScript((n) => { window.__hatchDayShift = n; }, Number(process.env.CARD_CHECK_DAY_SHIFT));
  }
  // The boot screen shows once per browser: every page here starts as if it had
  // been shown, except the boot checks' (they set the session flag and clear it).
  const bootVersion = /const BOOT_VERSION = "([^"]*)"/.exec(
    fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8"))?.[1];
  await context.addInitScript((v) => {
    try {
      if (!sessionStorage.getItem("cc-boot-test") && v) localStorage.setItem("hatch-booted", v);
      for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-power-")) localStorage.removeItem(k);
      // Today's infrared link counts as done, so a page with taps never starts the day's
      // first one by itself (gaps-seams 5a); the link checks clear it.
      localStorage.setItem(`hatch-link-cardcheck-${new Date().toDateString()}`, "1");
    } catch (err) {
      // no storage
    }
  }, bootVersion);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const missingSprites = []; // the card warns on the console, never in the bubble (UX fix 4, F11)
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    if (m.type() === "warning" && /missing sprites/.test(m.text())) missingSprites.push(m.text());
  });
  await page.goto(CLIENT);
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
  await page.locator('input[autocomplete="username"]').first().fill(USER.username);
  await page.locator('input[type="password"]').first().fill(USER.password);
  await page.keyboard.press("Enter");
  // Signed in once the frontend knows the user (the token is stored by then).
  const signedIn = () => page.waitForFunction(
    () => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
  await signedIn();
  // Screen effects (the LCD grid, ghosting) are on by default; the checks run
  // with them off so their screenshots and pixel samples don't drift. Only the
  // device-charm steps near the end turn them on.
  await page.evaluate(() => localStorage.setItem("hatch-lcd", "off"));
  await page.goto(`${HA}/pet-bench/pet`);
  await signedIn();
  await settle(page); // the frontend may reload itself once
  try {
    await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, "00-no-card.png") });
    throw new Error(`The card never appeared; see ${path.join(OUT, "00-no-card.png")}`);
  }

  // No seasonal touches until their own check: a costume moment would take the
  // bubble in the middle of another check.
  const seasonsOff = () => page.locator("hatch-pet-card").evaluate((el) => {
    el.setConfig({ ...el._config, seasonal: false }); el.hass = el._hass;
  });
  await seasonsOff();
  // Pets speak with their sound now and then; checks of exact lines keep it
  // off (as if one was just said), and the voice checks turn it back on.
  // A dev pet that has grown into a teen has a personality, which would swap
  // exact lines half the time: the pets have none here unless a check stubs
  // one in (4c, 4d). Installed once per card, so again after a reload.
  const hush = () => page.locator("hatch-pet-card").evaluate((el) => {
    el._slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; });
    if (el.__typeless) return;
    el.__typeless = true;
    // Rolls by device and day (a fresh .storage is a new device on every run), off unless
    // a check turns one on (audit 2026-11-01b A1-A3): the lucky number (0: never a game's),
    // the rare pair and guest days, the promise's looks and practice, a guest's start.
    // A check that needs one calls the prototype's (protoCall) or sets its own.
    Object.assign(el, { _lucky: () => 0, _rareDay: () => false, _promiseLook: () => null,
      _promisePractice: () => false, _visitorGuest: () => null });
    const realState = el._state;
    const typeless = new WeakMap(); // one copy per state, so a check can still edit what it's given
    el._state = function (slide, key) {
      const st = realState.call(this, slide, key);
      if (key !== "sensor.life_stage" || !st?.attributes?.personality) return st;
      if (!typeless.has(st)) typeless.set(st, { ...st, attributes: { ...st.attributes, personality: null } });
      return typeless.get(st);
    };
  });
  await hush();
  const cur = () => page.locator("hatch-pet-card .slide:not(.away-slide)");
  const shot = (name) => cur().locator(".device").screenshot({ path: path.join(OUT, `${name}.png`) });
  // The bubble's words once typed out (a typed line is laid out whole first).
  const bubble = async () => {
    await cur().locator(".bubble:not([data-typing])").waitFor({ timeout: 10000 }).catch(() => {});
    return cur().locator(".bubble").innerText();
  };
  const button = (i) => cur().locator(".toy").nth(i);
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  // The card keeps its entity map private; rebuild it for the pet on show.
  const ids = async () => evaluate((title) => {
    const hass = document.querySelector("home-assistant").hass;
    const device = Object.values(hass.devices).find((d) => (d.name_by_user || d.name) === title);
    const out = {};
    for (const e of Object.values(hass.entities)) {
      if (e.device_id === device?.id) out[`${e.entity_id.split(".")[0]}.${e.translation_key}`] = e.entity_id;
    }
    return out;
  }, (await page.locator("hatch-pet-card .title").innerText()).trim());
  const inject = (entity, patch) => evaluate(async ({ entity, patch }) => {
    const hass = document.querySelector("home-assistant").hass;
    const st = hass.states[entity];
    await hass.callApi("POST", `states/${entity}`, {
      state: patch.state ?? st.state, attributes: { ...st.attributes, ...(patch.attributes || {}) },
    });
  }, { entity, patch });

  // The sections below are gated with `if (enter(...)) {` lines, left unindented on
  // purpose: re-indenting ~5000 lines would conflict with every branch that edits a check.
  // What a section hands to a later one is declared here or in the ungated lines between.
  const slides = await page.locator("hatch-pet-card .slide").count();
  const card = page.locator("hatch-pet-card");
  if (enter("shelf")) {
  // 1. The shelf draws its devices.
  check("shelf shows the pets", slides >= 2, `${slides} devices`);
  // UX fix 4, F1: while a pet's states are `unavailable` (an Options reload, an HA restart) it stays in
  // its own world's device, says one line and has no live buttons; back, the real bubble returns.
  const gone = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const real = el._hass;
    const out = { world: s.worldKey, shape: s.device.className };
    try {
      const now = new Date().toISOString();
      const states = { ...real.states };
      for (const id of Object.values(s.ids)) {
        if (states[id] && id !== "sun.sun") states[id] = { ...states[id], state: "unavailable", attributes: { restored: true }, last_updated: now };
      }
      el._hass = { ...real, states };
      el._sig = null;
      await el._update();
      out.worldDuring = s.worldKey;
      out.shapeDuring = s.device.className;
      out.bubble = s.bubble.textContent;
      out.buttonsOff = Object.values(s.buttons).every((b) => b.disabled);
      out.patOn = el._patOn(s);
    } finally {
      el._hass = real;
      el._sig = null;
      await el._update();
    }
    out.bubbleBack = s.bubble.textContent;
    return out;
  });
  check("UX4 F1: an unavailable pet keeps its world's device, says one line, has its buttons and pat off",
    gone.worldDuring === gone.world && gone.shapeDuring === gone.shape && gone.bubble === "one moment... ♪" &&
    gone.buttonsOff && !gone.patOn && gone.bubbleBack !== "one moment... ♪", JSON.stringify(gone));
  check("sprites load", !missingSprites.length && !(await bubble()).startsWith("missing sprites"), missingSprites[0]);
  await shot("01-shelf");

  // 2. Status and journal.
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(600);
  const status = await cur().locator(".status").innerText();
  // A new pet's page has no zero counters (UX fix 4, F12): the rows come with the first miss (top10 4a).
  const missRows = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const none = /missed calls|ignored whines/.test(s.status.textContent);
    const missId = s.ids["sensor.care_misses"];
    const realHass = el._hass;
    const was = realHass.states[missId];
    const zero = Number.parseFloat(was?.state) || Number(was?.attributes?.discipline_misses) || 0;
    el._hass = { ...realHass, states: { ...realHass.states, [missId]: { ...was, state: "2", attributes: { ...was?.attributes, discipline_misses: 1 } } } };
    el._renderStatus(s, []);
    const both = /missed calls/.test(s.status.textContent) && /ignored whines/.test(s.status.textContent);
    el._hass = realHass;
    el._renderStatus(s, []);
    return { zero, none, both };
  });
  check("status screen opens; missed calls and ignored whines show with a miss, not at zero (top10 4a, UX fix 4 F12)",
    /weight/.test(status) && missRows.both && (missRows.zero ? missRows.none : !missRows.none), JSON.stringify(missRows));
  await shot("02-status");
  // The next egg's creature, picked through its select, shows on the status screen.
  const eggChoice = (await ids())["select.next_egg"];
  const options = await evaluate((e) =>
    document.querySelector("home-assistant").hass.states[e].attributes.options, eggChoice);
  const pickEgg = (option) => evaluate(({ e, option }) => document.querySelector("home-assistant").hass
    .callService("select", "select_option", { entity_id: e, option }), { e: eggChoice, option });
  await pickEgg(options[1]);
  await page.waitForTimeout(800);
  // Only an offered creature (raised in the egg's world) is named; any other pick reads "surprise" (settings S2, F22).
  const named = await page.locator("hatch-pet-card").evaluate((el) => el._eggOffer(el._slides[el._index])?.choice?.name);
  check("the next egg's creature shows, or a surprise when it is not offered",
    (await cur().locator(".status .row", { hasText: /next egg|hatching/ }).innerText()).toLowerCase()
      .includes((named || "surprise").toLowerCase()),
    `${options[1]} -> ${named || "surprise"}`);
  await cur().locator(".status .row", { hasText: /next egg|hatching/ }).scrollIntoViewIfNeeded();
  await shot("02b-next-egg");
  await pickEgg(options[0]); // back to a surprise
  await page.waitForTimeout(400);
  // The gear opens the settings sheet in the same screen: the status stays up, the
  // switches are there and the stats are not, and focus lands on its back row.
  const statusRows = /weight/.test(await cur().locator(".status").innerText()) && !await cur().locator(".status .bell:not(.namechange)").count(); // the first day's name row has its own "change" (S3)
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  const sheet = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    return { open: s.screen.classList.contains("show-status"), back: !!s.status.querySelector(".sback"),
      focus: el.shadowRoot.activeElement?.className, sound: !!s.status.querySelector(".bell.sound"),
      stats: /weight/.test(s.status.textContent), pet0: /missed calls|ignored whines|misses|whines/.test(s.status.textContent), heads: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent),
      pet: el._linkName(s) };
  });
  check("the status screen has a gear and no switches; the gear opens the settings sheet over it",
    statusRows && sheet.open && sheet.back && sheet.sound && !sheet.stats, JSON.stringify(sheet));
  check("the settings sheet no longer holds misses and whines (on status now, top10 4a)", !sheet.pet0, JSON.stringify(sheet));
  check("the gear moves focus to the sheet's back row", sheet.focus === "sback", sheet.focus);
  // top10 2b: "notices" in the pet's group lists the kinds the server sends (never an
  // entity), "just the clock" with none; an admin gets "connect more ›" (never on a
  // shared screen), which opens the integration's page in HA.
  const noticesRow = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const real = el._state;
    const read = (senses, shared) => {
      el._state = (x, key) => {
        const st = real.call(el, x, key);
        return key === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, senses } } : st;
      };
      if (shared) localStorage.setItem("hatch-shared-screen", "on");
      s.statusHtml = null;
      el._renderSettings(s);
      const row = [...s.status.querySelectorAll(".row")].find((r) => /notices/.test(r.textContent));
      const out = { value: row?.querySelector(".senses")?.textContent ?? null, link: s.status.querySelector(".connect")?.textContent ?? null };
      if (shared) localStorage.setItem("hatch-shared-screen", "off");
      return out;
    };
    try {
      return { admin: !!el._hass.user?.is_admin, some: read(["weather", "tv"], false), none: read([], false), shared: read(["weather"], true),
        server: real.call(el, s, "sensor.life_stage")?.attributes.senses };
    } finally {
      el._state = real;
      s.statusHtml = null;
      el._renderSettings(s);
    }
  });
  check("top10 2b: \"notices\" lists the kinds (\"just the clock\" with none); an admin's \"connect more ›\", none on a shared screen",
    Array.isArray(noticesRow.server) && noticesRow.some.value === "weather · tv" && noticesRow.none.value === "just the clock" &&
    noticesRow.shared.value === "weather" && noticesRow.shared.link === null &&
    noticesRow.some.link === (noticesRow.admin ? "connect more ›" : null), JSON.stringify(noticesRow));
  if (noticesRow.admin) {
    const went = await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      const real = history.pushState;
      let to = null;
      history.pushState = (st, t, url) => { to = url; }; // stubbed: the check stays on its page
      try {
        s.status.querySelector(".connect")?.click();
      } finally {
        history.pushState = real;
      }
      return to;
    });
    check("top10 2b: \"connect more ›\" goes to the integration's page", went === "/config/integrations/integration/virtual_pet", String(went));
  }
  // top10 3a: the family-tablet note sits right under the "shared screen" switch.
  const tabletNote = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const row = s.status.querySelector(".bell.shared")?.closest(".row");
    const next = row?.nextElementSibling;
    return { next: next?.className || null, text: next?.textContent || null };
  });
  check("top10 3a: the family-tablet note follows the shared screen switch",
    /sharednote/.test(tabletNote.next || "") && tabletNote.text === "a family tablet? give it its own login, and we'll make friends ♥",
    JSON.stringify(tabletNote));
  check("the sheet heads the pet's rows, the viewer's and this screen's",
    sheet.heads.join("|") === `for ${sheet.pet}|for you|this screen`, sheet.heads.join("|"));
  await shot("02c-settings");
  // A heading is not a button: tapping it leaves the sheet up.
  await cur().locator(".status .sec").first().click();
  await page.waitForTimeout(300);
  const headBox = await cur().locator(".status .shead").boundingBox();
  await page.mouse.click(headBox.x + headBox.width - 6, headBox.y + headBox.height / 2); // beside the back row
  await page.waitForTimeout(300);
  check("tapping a heading or the back row's empty end leaves the sheet open",
    await cur().locator(".screen.show-status .sback").count() === 1);
  // Settings UX fix 1: the sheet keeps the player's place (F1), Escape is a way out (F8), a toggle keeps keyboard
  // focus (F4), the note is the pet's bubble under the back row and lets taps through (F2/F13), and the pet
  // has a word when the sheet closes after a change (F14).
  {
    const rowBox = await cur().locator(".status .row.srow").first().boundingBox();
    await page.mouse.click(rowBox.x + 6, rowBox.y + rowBox.height / 2); // a row's label
    await page.waitForTimeout(250);
    const afterLabel = await cur().locator(".screen.show-status .sback").count() === 1;
    await page.mouse.click(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2); // the gap in the row
    await page.waitForTimeout(250);
    const afterGap = await cur().locator(".screen.show-status .sback").count() === 1;
    check("settings UX F1: a tap on a row's label or the gap in it leaves the sheet open", afterLabel && afterGap, JSON.stringify({ afterLabel, afterGap }));
    await cur().locator(".status .bell.named").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const kept = await card.evaluate((el) => el.shadowRoot.activeElement?.className || "");
    await page.keyboard.press("Enter"); // back to what it was
    await page.waitForTimeout(250);
    check("settings UX F4: a toggle pressed by keyboard keeps focus through its redraw", /\bnamed\b/.test(kept), kept);
    const bubble = await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.status.scrollTop = 0;
      el._tapRect = null;
      el._statusMessage(s, "no phone pings, ok ♪");
      const note = s.status.querySelector(".status-feedback");
      const head = s.status.querySelector(".shead").getBoundingClientRect();
      const box = note.getBoundingClientRect();
      const out = { shown: !note.hidden, text: note.textContent, under: box.top >= head.bottom - 1, tapsThrough: getComputedStyle(note).pointerEvents === "none",
        head: getComputedStyle(note, "::before").backgroundImage.includes("sprites/") };
      clearTimeout(s.statusMessageTimer);
      note.hidden = true;
      note.textContent = "";
      return out;
    });
    check("settings UX F13: a note is the pet's bubble with its head, under the back row, and taps go through it",
      bubble.shown && bubble.under && bubble.tapsThrough && bubble.head, JSON.stringify(bubble));
    // A tap under the bubble's place: the note drops to the foot of the box, still clear of it, never over the row (F13).
    const low = await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.status.scrollTop = 0;
      const head = s.status.querySelector(".shead").getBoundingClientRect();
      el._tapRect = { top: head.bottom + 4, bottom: head.bottom + 40, at: Date.now() };
      el._statusMessage(s, "no phone pings, ok ♪");
      const note = s.status.querySelector(".status-feedback");
      const box = note.getBoundingClientRect();
      const foot = s.status.getBoundingClientRect();
      const out = { atFoot: Math.abs(foot.bottom - 4 - box.bottom) < 3, clear: box.top > head.bottom + 40 };
      clearTimeout(s.statusMessageTimer);
      note.hidden = true;
      note.textContent = "";
      note.style.top = "";
      el._tapRect = null;
      return out;
    });
    check("settings UX F13: when the row just tapped sits under the bubble, it drops to the foot of the box", low.atFoot && low.clear, JSON.stringify(low));
    await cur().locator(".status .sback").focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const escaped = { gear: await cur().locator(".screen.show-status .gear").count(), sback: await cur().locator(".status .sback").count() };
    check("settings UX F8: Escape on the sheet goes back to the status", escaped.gear === 1 && escaped.sback === 0, JSON.stringify(escaped));
    await cur().locator(".status .gear").click();
    await page.waitForTimeout(250);
    const react = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const real = Date.prototype.getHours;
      const out = {};
      const close = async (key, hour) => {
        Date.prototype.getHours = () => hour;
        Object.assign(s, { asleep: false, lightsOut: false });
        s.bubble.textContent = "";
        el._settingsChanged(s, key);
        el._toggleStatus(s); // the status closes from the sheet
        await new Promise((r) => setTimeout(r, 1500)); // typed out
        const said = s.bubble.textContent;
        Date.prototype.getHours = real;
        el._toggleStatus(s);
        s.status.querySelector(".gear")?.click();
        return said;
      };
      s.settings = true;
      out.day = await close("monoOn", 12);
      out.night = await close("monoOff", 23);
      out.none = await close("effectsOn", 12); // no such line: nothing said
      return out; // the sheet is open again
    });
    check("settings UX F14: the pet says its line for the last change when the sheet closes, not at night",
      /all green/.test(react.day) && react.night === "" && react.none === "", JSON.stringify(react));
  }
  // Sounds start off and turn on for this browser only.
  const sound = cur().locator(".bell.sound");
  const soundBefore = await sound.getAttribute("aria-pressed");
  await sound.click();
  await page.waitForTimeout(300);
  check("sounds start off and turn on here",
    soundBefore === "false" && await cur().locator(".bell.sound").getAttribute("aria-pressed") === "true" &&
    await evaluate(() => localStorage.getItem("hatch-sounds")) === "on");
  await cur().locator(".bell.sound").click(); // off again for the rest of the run
  await page.waitForTimeout(300);
  const babbleBefore = await cur().locator(".bell.babble").getAttribute("aria-pressed");
  await cur().locator(".bell.babble").click();
  await page.waitForTimeout(300);
  check("babble starts off and turns on here",
    babbleBefore === "false" && await cur().locator(".bell.babble").getAttribute("aria-pressed") === "true" &&
    await evaluate(() => localStorage.getItem("hatch-babble")) === "on");
  await cur().locator(".bell.babble").click(); // off again
  await page.waitForTimeout(300);
  // "notify me" has its own switch; a shared screen has none, and babble is still babble.
  const bells = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index]; // the settings sheet is open
    const count = () => [".bell.notify", ".bell.babble"].map((q) => s.status.querySelectorAll(q).length).join("/");
    const personal = count();
    localStorage.setItem("hatch-shared-screen", "on");
    el._renderStatus(s, []);
    const shared = count();
    localStorage.setItem("hatch-shared-screen", "off");
    el._renderStatus(s, []);
    return { personal, shared };
  });
  check("each switch is found by its own name", bells.personal === "1/1" && bells.shared === "0/1", JSON.stringify(bells));
  // Back to the status: focus returns to the gear.
  await cur().locator(".status .sback").click();
  await page.waitForTimeout(300);
  const back = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    return { open: s.screen.classList.contains("show-status"), stats: /weight/.test(s.status.textContent),
      focus: el.shadowRoot.activeElement?.className };
  });
  check("the sheet's back row returns to the status, focus on the gear",
    back.open && back.stats && back.focus === "gear", JSON.stringify(back));
  // The Status chip closes the sheet too, and opens on the status next time.
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  const chipClosed = await cur().locator(".screen.show-status").count() === 0;
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);
  check("the Status chip closes the settings sheet; it opens on the status again",
    chipClosed && /weight/.test(await cur().locator(".status").innerText()) && !await cur().locator(".status .sback").count());
  await cur().locator(".jlink").click();
  await page.waitForTimeout(1200);
  check("journal opens", /journal/.test(await cur().locator(".status").innerText()));
  await shot("03-journal");
  // top10 8a: "every world ›" under the journal's grid opens one row per world, each
  // creature drawn if a pet on this card raised it and "???" if not; no count; no tile
  // for a creature that isn't ready; "‹ journal" goes back; nothing runs off at 330.
  const W8 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
  const ready8 = (id) => fs.existsSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "sprites", id, "species.json"));
  await cur().locator(".status .wlink").click();
  await page.locator("hatch-pet-card").first().evaluate(async (el) => {
    const s = el._slides[el._index];
    for (const t = Date.now(); !s.status.querySelector(".jgrid") && Date.now() - t < 10000;) await new Promise((r) => setTimeout(r, 50));
  });
  const every = await page.locator("hatch-pet-card").first().evaluate((el) => {
    const s = el._slides[el._index];
    const raised = new Set(el._slides.flatMap((x) => el._state(x, "sensor.life_stage")?.attributes.raised || []));
    return {
      head: s.status.querySelector(".shead .stitle")?.textContent.trim(), own: s.worldKey,
      worlds: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent),
      tiles: [...s.status.querySelectorAll(".jtile")].map((t) => ({ id: (t.querySelector("img")?.getAttribute("src") || "").match(/sprites\/([^/]+)\//)?.[1],
        locked: t.classList.contains("locked"), text: t.textContent })),
      raised: [...raised], back: s.status.querySelector(".shead .sback")?.textContent, text: s.status.textContent,
      fit: s.status.scrollWidth <= s.status.clientWidth + 1, journal: s.journal, everyWorld: s.everyWorld,
    };
  });
  // The pet's own world first, then the rest in catalog order; the names lowercase (UX fix 2, F11, F16).
  const order8 = Object.entries(W8).sort(([a], [b]) => (b === every.own) - (a === every.own)).map(([, w]) => w);
  const want8 = order8.flatMap((w) => w.roster.filter(ready8));
  check("top10 8a: \"every world\" has a row per world and a tile per ready creature, raised ones named, the rest ???",
    every.head === "every world" && JSON.stringify(every.worlds) === JSON.stringify(order8.map((w) => w.name.toLowerCase())) &&
    JSON.stringify(every.tiles.map((t) => t.id)) === JSON.stringify(want8) &&
    every.tiles.every((t) => (every.raised.includes(t.id) ? !t.locked && t.text !== "???" : t.locked && t.text === "???")) &&
    every.everyWorld && !every.journal, JSON.stringify(every));
  check("top10 8a: no count on the page, \"‹ journal\" in the top band, nothing runs off sideways",
    !/\d+\s*(of|\/)\s*\d+|%/.test(every.text) && every.back === "‹ journal" && every.fit, JSON.stringify({ back: every.back, fit: every.fit }));
  await shot("03c-every-world");
  await cur().locator(".status .shead .sback").click();
  await page.waitForTimeout(1200);
  check("top10 8a: \"‹ journal\" goes back to the journal",
    await cur().locator(".status .jgrid").count() > 0 && /journal ·/.test(await cur().locator(".status").innerText()));
  // Status UX fix 2 (review 2). The journal keeps the player's place: a tap on a tile does not close the
  // status (F1) and the pet says one line, once (F14); a state push keeps the scroll (F2); the top band
  // carries the way back (F3, F5); Escape steps back a page and then closes (F4).
  const ux2 = () => page.locator("hatch-pet-card").first().evaluate((el) => {
    const s = el._slides[el._index];
    const note = s.status.querySelector(".status-feedback");
    return { open: s.screen.classList.contains("show-status"), journal: s.journal, every: s.everyWorld, finds: s.finds,
      say: note && !note.hidden ? note.textContent : "", scroll: Math.round(s.status.scrollTop),
      room: s.status.scrollHeight - s.status.clientHeight, back: s.status.querySelector(".shead .sback")?.textContent || "",
      focus: el.shadowRoot.activeElement?.className || "", gear: !!s.status.querySelector(".gear") };
  });
  await cur().locator(".status .jtile").first().scrollIntoViewIfNeeded();
  await cur().locator(".status .jtile").first().click();
  await page.waitForTimeout(300);
  const tile1 = await ux2();
  check("UX2 F1/F14: a tap on a journal tile keeps the journal open, and the pet says one line about it",
    tile1.open && tile1.journal && /^(.+! my old pal ♥|not met one of those yet)$/.test(tile1.say), JSON.stringify(tile1));
  await page.waitForTimeout(100);
  await cur().locator(".status .jtile").first().click();
  const tile2 = await ux2();
  check("UX2 F1: a second tap on the same tile keeps the journal open", tile2.open && tile2.journal, JSON.stringify(tile2));
  await card.first().evaluate((el) => { const s = el._slides[el._index]; s.status.scrollTop = Math.min(60, s.status.scrollHeight - s.status.clientHeight); });
  const before2 = await ux2();
  await card.first().evaluate((el) => { // a pet update: the energy moves, as at every server tick
    const s = el._slides[el._index];
    const id = s.ids["sensor.energy"];
    const st = el._hass.states[id];
    el.hass = { ...el._hass, states: { ...el._hass.states, [id]: { ...st, state: String(Number(st.state || 50) - 1), last_updated: new Date().toISOString() } } };
  });
  await page.waitForTimeout(600);
  const after2 = await ux2();
  check("UX2 F2: a pet update leaves the journal where it was scrolled", before2.scroll > 0 && after2.journal && after2.scroll === before2.scroll,
    JSON.stringify({ before2, after2 }));
  check("UX2 F3: the journal's way back is in a top band: \"‹ status\"", after2.back === "‹ status", after2.back);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const esc1 = await ux2();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const esc2 = await ux2();
  check("UX2 F4: Escape on the journal goes back to the status, and on the status closes it", esc1.open && !esc1.journal && esc1.gear && !esc2.open,
    JSON.stringify({ esc1, esc2 }));
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);
  await cur().locator(".jlink").click();
  await page.waitForTimeout(800);
  const opened = await ux2();
  check("UX2 F5: opening the journal puts keyboard focus on its top back link", /sback/.test(opened.focus), JSON.stringify(opened));
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);
  // F6: a mostly vertical drag over the card is not a swipe; a sideways one is. F8: the pet on show is kept per browser.
  // F7: a care tap with the status open closes it first.
  const drag = async (dx, dy) => {
    const vp = await card.first().evaluate((el) => { const r = el._viewport.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 10]; });
    await card.first().evaluate((el) => { el._swiped = false; });
    await page.mouse.move(vp[0], vp[1]);
    await page.mouse.down();
    await page.mouse.move(vp[0] + dx, vp[1] + dy, { steps: 5 });
    await page.mouse.up();
    return card.first().evaluate((el) => ({ swiped: el._swiped, index: el._index }));
  };
  const vert = await drag(-50, 90);
  check("UX2 F6: a mostly vertical drag does not switch pets", !vert.swiped, JSON.stringify(vert));
  const side = await drag(-80, 10);
  check("UX2 F6: a sideways drag still does", side.swiped, JSON.stringify(side));
  const kept = await card.first().evaluate((el) => ({ key: localStorage.getItem(`hatch-shelf-${el._slides[0].ids.device}`), now: el._slides[el._index].ids.device, n: el._slides.length }));
  check("UX2 F8: the pet on show is kept for a reload (hatch-shelf-<first device>)", kept.key === kept.now, JSON.stringify(kept));
  await card.first().evaluate((el) => el._go(0));
  await page.waitForTimeout(600);
  const care = await card.first().evaluate((el) => {
    const s = el._slides[el._index];
    const call = el._call;
    const calls = [];
    el._call = (...a) => { calls.push(a[3] + "." + a[4]); };
    try {
      if (!s.screen.classList.contains("show-status")) el._toggleStatus(s);
      const was = s.screen.classList.contains("show-status");
      el._press(s, "feed");
      return { was, after: s.screen.classList.contains("show-status"), calls };
    } finally {
      el._call = call;
    }
  });
  check("UX2 F7: a care tap with the status open closes it first, then goes out", care.was && !care.after && care.calls.length === 1, JSON.stringify(care));

  }
  if (enter("shell")) {
  // 2b. The pet's shell picker.
  await shellChecks({ page, context, check, cur, evaluate, inject, shot, after: {
    url: CLIENT,
    reload: async () => {
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.reload();
      await signedIn();
      await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
      await seasonsOff();
      await hush();
    },
  } });

  }
  // 3. Find a pet with the energy to play (each game costs some), wake it if
  // it's asleep (one tap), then play a whole game.
  const energyOf = async () => {
    const id = (await ids())["sensor.energy"];
    return Number(await evaluate((e) => document.querySelector("home-assistant").hass.states[e].state, id));
  };
  // Two games ahead, each costing 10 energy and needing 15 to start.
  for (let i = 0; i < slides && (await energyOf()) < 30; i++) {
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(700);
  }
  if ((await energyOf()) < 30) console.log("note: no pet has energy to play; let them rest or nap");
  if ((await button(7).innerText()).includes("wake")) {
    await button(7).click();
    await page.waitForTimeout(1500);
    check("one tap wakes a sleeping pet", (await button(7).innerText()).includes("sleep"));
  }
  const pet = await ids();
  const petName = (await page.locator("hatch-pet-card .title").innerText()).trim();

  // A content pet that isn't calling: a calling pet is never greeted and has no
  // idle life, and a freshly hatched one may well be calling.
  // The card's FINDS_SHOWN release switch ships on. gifts, finds and collection still call
  // showFinds, which sets it true (HatchPetCard.findsShown) on this page and in every tab
  // the context opens after (an init script), so they hold even after the off-path checks
  // below set it false and put it back.
  let findsInit = false;
  const showFinds = async () => {
    if (!findsInit) {
      findsInit = true;
      await context.addInitScript(() => customElements.whenDefined("hatch-pet-card").then(() => {
        customElements.get("hatch-pet-card").findsShown = true;
      }));
    }
    await card.evaluateAll((els) => {
      customElements.get("hatch-pet-card").findsShown = true;
      els.forEach((el) => el._slides.forEach((x) => el._basketSync(x)));
    });
  };
  const calm = async () => {
    await inject(pet["binary_sensor.calling"], { state: "off" });
    await inject(pet["sensor.mood"], { state: "content", attributes: { flags: [], requests: [] } });
  };

  const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
  // No natural world visitor during the run (it would silence pats and block idle life
  // for ~7 s in its window): every pet's day is marked used. localStorage, so it holds
  // over reloads; the visitors section clears it for its own cases and sets it back.
  // Both days: the browser's (v1's fallback) and HA's (house.visit.day keys the flag, v2).
  const holdVisits = () => card.evaluate((el) => {
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: el._hass?.config?.time_zone || undefined }).format(new Date());
    const [y, m, d] = iso.split("-").map(Number);
    const days = new Set([new Date().toDateString(), new Date(y, m - 1, d).toDateString()]);
    for (const s of el._slides || []) {
      if (s.house?.visit?.day) days.add(el._visitDay(s).toDateString());
      for (const day of days) localStorage.setItem(`hatch-visit-${s.ids?.device}-${day}`, "1");
    }
  });
  await holdVisits();
  if (enter("play")) {
  // Greeted by first name: forget past greetings, reload, come back to this pet.
  await evaluate(() => Object.keys(localStorage)
    .filter((k) => k.startsWith("hatch-greet-")).forEach((k) => localStorage.removeItem(k)));
  await calm();
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.reload();
  await signedIn();
  await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  await seasonsOff(); // the reload brought the card back with its own config
  await hush(); // new slides: no sound unless a check asks for one
  // Record every line the card speaks from the reload on, for every slide: with the pet
  // pinned awake the hello can come while this check is still walking to the pet, before
  // a hook installed after the walk (a sample of the bubble would then find a call line).
  await card.evaluate((el) => {
    el.__spoken = [];
    const speak = el._speak;
    el._speak = function (slide, line, ...rest) { el.__spoken.push([slide, String(line)]); return speak.call(this, slide, line, ...rest); };
  });
  await pinAwake(card, "play");
  for (let i = 0; i < slides; i++) {
    if ((await page.locator("hatch-pet-card .title").innerText()).trim() === petName) break;
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(700);
  }
  await calm();
  // Idle chatter ("all good!") can take the bubble before or after the hello, and a
  // sample of the bubble can miss a 4 s line: hold idle life and keep every line said.
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.nextIdle = Date.now() + 600000;
    el.__said = el.__spoken.filter(([slide]) => slide === s).map(([, line]) => line);
    const speak = el._speak;
    el._speak = function (slide, line, ...rest) { if (slide === s) el.__said.push(String(line)); return speak.call(this, slide, line, ...rest); };
  });
  let greeting = "";
  for (let i = 0; i < 30 && !greeting.includes(USER.name); i++) {
    await page.waitForTimeout(500);
    const said = await card.evaluate((el) => el.__said);
    greeting = said.find((l) => l.includes(USER.name)) || await bubble();
  }
  await card.evaluate((el) => { delete el._speak; delete el.__said; delete el.__spoken; el._slides[el._index].nextIdle = 0; }); // idle life back
  check("greets the viewer by first name", greeting.includes(USER.name), greeting);
  await shot("04a-greeting");

  // The bond: looking in starts one for the viewer (virtual_pet.visit), and
  // the private channel brings it to this card alone.
  const bondOf = () => page.locator("hatch-pet-card").evaluate((el) => el._slides[el._index].mine?.bond);
  // What the channel would have said: this viewer's bond (and switches) on the slide on show.
  const mineFor = (patch) => page.locator("hatch-pet-card").evaluate((el, patch) => {
    const s = el._slides[el._index];
    el._mineFor(s, { ...(s.mine || {}), ...patch });
  }, patch);
  let bond = null;
  for (let i = 0; i < 20 && !bond; i++) {
    await page.waitForTimeout(500);
    bond = await bondOf();
  }
  check("looking in starts a bond", bond?.level >= 1, JSON.stringify(bond));
  // A close bond: the nickname, a hop and hearts, and five hearts on the status screen.
  await mineFor({ bond: { level: 8, nickname: "sunbeam" } });
  await evaluate(() => Object.keys(localStorage)
    .filter((k) => k.startsWith("hatch-greet-")).forEach((k) => localStorage.removeItem(k)));
  await calm();
  await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    window.__greetHop = false; // the hop is short: watch for it rather than poll
    new MutationObserver(() => {
      if (s.pet.classList.contains("greethop")) window.__greetHop = true;
    }).observe(s.pet, { attributes: true, attributeFilter: ["class"] });
    s.greeted = false;
    s.sayUntil = 0;
  });
  let close = {};
  for (let i = 0; i < 20 && !close.hearts; i++) {
    await page.waitForTimeout(150);
    close = await cur().evaluate((slide) => ({
      hearts: slide.querySelectorAll(".bondhearts img").length,
      hop: window.__greetHop,
      said: slide.querySelector(".bubble").textContent,
    }));
  }
  check("a close bond greets with a hop and hearts", close.hearts === 4 && close.hop &&
    (close.said.includes("sunbeam") || close.said.includes(USER.name)), JSON.stringify(close));
  await shot("04b-close-bond");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  const bondRow = cur().locator(".status .row", { hasText: "you two" });
  check("the status screen shows the viewer's bond",
    await bondRow.count() === 1 && await bondRow.locator(".hearts").getAttribute("aria-label") === "bond level 8 of 10",
    await bondRow.count() ? await bondRow.innerText() : "no row");
  await shot("04c-bond-status");
  // "My day" is each person's own switch, in the settings sheet.
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  await cur().locator(".bell.myday").click();
  await page.waitForTimeout(1200);
  const myDay = await page.locator("hatch-pet-card").evaluate((el) => el._myDay);
  // Theirs alone: never on the life stage sensor every user can read.
  check("my day turns on for this person, privately",
    myDay === true && !("my_day" in ((await bondOf()) || {})));
  await cur().locator(".bell.myday").click(); // off again
  await page.waitForTimeout(800);
  // A shared screen shows nothing personal: no bond row, no "my day", no visit,
  // a greeting without a name.
  const PERSONAL_BELLS = [".bell.notify", ".bell.myday", ".bell.babytalk", ".bell.forgetme", ".bell.forgetbday", ".bell.bdayphone"]
    .map((q) => `.status ${q}`).join(", ");
  const personalSheet = await cur().evaluate((sl) => !!sl.querySelector(".status .bell.notify") &&
    !!sl.querySelector(".status .bell.myday"));
  await cur().locator(".bell.shared").click();
  await page.waitForTimeout(400);
  const sharedView = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    let visited = false;
    const real = el._hass.callService.bind(el._hass);
    el._hass.callService = (d, svc, ...rest) => { if (svc === "visit") visited = true; return real(d, svc, ...rest); };
    s.visitedAt = 0;
    el._visit(s);
    el._hass.callService = real;
    for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-greet-")) localStorage.removeItem(k);
    s.greeted = false; s.sayUntil = 0;
    const free = el._free;
    el._free = () => true;
    el._greet(s);
    el._free = free;
    // The sheet stays open with it on; the status behind it, drawn the same way.
    const sheet = s.status.innerText;
    s.settings = false;
    el._renderStatus(s, []);
    const status = s.status.innerText;
    s.settings = true;
    el._renderStatus(s, []);
    return { visited, said: s.bubble.textContent, sheetUp: /shared screen/.test(sheet), statusUp: /weight/.test(status),
      bondRow: /you two/.test(status) || /my day/.test(sheet) };
  });
  // The sheet still works with it on (no "notify me" row to wire up).
  const sharedSheet = await cur().evaluate((sl, q) => ({ open: sl.querySelector(".screen").classList.contains("show-status"),
    sheet: !!sl.querySelector(".sback"), shared: !!sl.querySelector(".bell.shared"),
    personal: [...sl.querySelectorAll(q)].map((b) => b.className) }), PERSONAL_BELLS);
  const sharedStatus = sharedSheet.open && sharedSheet.sheet && sharedSheet.shared;
  check("the settings sheet on a shared screen keeps this screen's rows and has none of the viewer's switches",
    personalSheet && sharedStatus && sharedSheet.personal.length === 0, JSON.stringify({ personalSheet, ...sharedSheet }));
  await cur().locator(".bell.shared").click(); // personal again
  await page.waitForTimeout(400);
  // On a shared screen the bond's moments say nothing personal either, and an
  // arrival is the house's nameless "someone's home" (a personal card says
  // nothing for it; the arriver's own card has "you're home!!").
  const sharedMoments = await page.locator("hatch-pet-card").evaluate((el) => {
    localStorage.setItem("hatch-shared-screen", "on");
    const s = el._slides[el._index];
    // 2a: a line is said at once when the bubble is free, else queued: both count.
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
    let before = s.bubble.textContent;
    const said = () => [...(s.bubble.textContent !== before ? [s.bubble.textContent] : []), ...s.queue.map((q) => q.text)];
    for (const type of ["bond_up", "bond_record", "tucked_in", "bond_favourite", "friend_home"]) {
      el._moment(s, { type, level: 4, nickname: "sunbeam", game: "left_right", wins: 4, at: new Date().toISOString() });
    }
    const out = { personalOnShared: said(), before };
    el._moment(s, { type: "someone_home", at: new Date().toISOString() });
    out.queued = said();
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
    localStorage.setItem("hatch-shared-screen", "off");
    before = s.bubble.textContent;
    el._moment(s, { type: "someone_home", at: new Date().toISOString() });
    out.personal = said();
    s.queue = [];
    return out;
  });
  check("a shared screen's moments name nobody", sharedMoments.queued.join() === "someone's home!! ♥" &&
    sharedMoments.personalOnShared.length === 0 && sharedMoments.personal.length === 0, JSON.stringify(sharedMoments));
  check("a shared screen shows nothing personal", sharedStatus && sharedView.sheetUp && sharedView.statusUp &&
    !sharedView.visited && !sharedView.bondRow &&
    !sharedView.said.includes(USER.name) && !sharedView.said.includes("sunbeam"), JSON.stringify(sharedView));
  // A push from the server may have replaced the close bond set above: again.
  await mineFor({ bond: { level: 8, nickname: "sunbeam" } });
  await page.waitForTimeout(300);
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  // A level-up is said only to the person whose bond grew: from their own
  // channel. Someone else's (a stub: an old server's public list) says nothing.
  const mine = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    s.queue = [];
    s.sayUntil = 0;
    el._moment(s, { type: "bond_up", level: 4, nickname: "sunbeam" });
    const out = [s.bubble.textContent, ...s.queue.map((q) => q.text)]; // said at once (2a), or queued
    s.queue = [];
    s.sayUntil = 0;
    s.bubble.textContent = ""; // so the check below sees only what comes next
    return out;
  });
  const publicMoments = await evaluate((e) =>
    document.querySelector("home-assistant").hass.states[e].attributes.moments || [], pet["sensor.last_care"]);
  await inject(pet["sensor.last_care"], { attributes: { moments: [
    { type: "bond_up", user: "someone-else", level: 4, nickname: "pumpkin", at: new Date().toISOString() },
    ...publicMoments] } });
  await page.waitForTimeout(800);
  const theirs = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    return [...(s.queue || []).map((q) => q.text), s.bubble.textContent].filter((t) => /pumpkin|call you/.test(t));
  });
  check("a bond level-up is said only to its person",
    mine.includes("I'll call you sunbeam now ♥") && theirs.length === 0, `${mine} / ${theirs}`);
  // A wish aimed at a close friend: spoken to them; anyone else sees the plain wish.
  const aimed = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const was = s.mine;
    s.mine = { ...was, wish_for_you: true };
    const toMe = el._wishLine({ kind: "play" }, s);
    s.mine = { ...was, wish_for_you: false };
    const ofThem = el._wishLine({ kind: "play", for: "someone-else", for_name: "Sam" }, s);
    s.mine = was;
    return [toMe[0], toMe[1], ofThem[0], ofThem[1]];
  });
  check("a wish can be aimed at a close friend", aimed.join(" | ") ===
    "will you play a game with me today, sunbeam? | play a game with you | " +
    "I wish we could play a game today! | play a game together", aimed.join(" | "));
  // A question gives way to a game.
  const gaveWay = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    el._ask(s, "how_day");
    const before = !!s.screen.querySelector(".askday");
    el._clearAsk(s); // what starting a game does
    return before && !s.screen.querySelector(".askday") && !s.asking;
  });
  check("a question gives way to a game", gaveWay);
  // top10 1a: the phone question. "yes ♥" turns on "notify me" for this pet (stubbed
  // here: nothing reaches the server) and the pet answers; "not now" changes nothing.
  const phoneAsk = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const realOwn = el._callOwn;
    const realWS = el._hass.callWS;
    const calls = [];
    const acks = [];
    el._callOwn = async (type, data) => { calls.push({ type, ...data }); };
    el._hass.callWS = (msg) => { acks.push(msg); return Promise.resolve(null); }; // the "shown" ack
    const wasMine = s.mine ? s.mine.notify_me : undefined;
    const run = async (answer) => {
      Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0, asking: false });
      el._ask(s, "phone");
      const box = s.screen.querySelector(".askday");
      const labels = [...(box?.querySelectorAll("button") || [])].map((b) => b.textContent);
      box?.querySelector(`button[data-answer="${answer}"]`)?.click();
      await new Promise((r) => setTimeout(r, 200));
      return { labels, aria: box?.getAttribute("aria-label"), said: s.bubble.textContent || s.say || "" };
    };
    try {
      const no = await run("not now");
      const callsAfterNo = calls.length;
      const yes = await run("yes");
      return { no, yes, callsAfterNo, calls, acks: acks.filter((m) => m.type === "virtual_pet/answer") };
    } finally {
      el._callOwn = realOwn;
      el._hass.callWS = realWS;
      if (s.mine) s.mine.notify_me = wasMine;
      el._clearAsk(s);
    }
  });
  check("top10 1a: the phone question asks with \"yes ♥\" / \"not now\"; not now calls nothing; yes turns notify me on",
    phoneAsk.yes.aria === "can i call your phone when i need you?" &&
    JSON.stringify(phoneAsk.yes.labels) === JSON.stringify(["yes ♥", "not now"]) && phoneAsk.callsAfterNo === 0 &&
    phoneAsk.calls.length === 1 && phoneAsk.calls[0].type === "notify_me" && phoneAsk.calls[0].enabled === true,
    JSON.stringify(phoneAsk));
  check("top10 1a (audit #1): each time it's shown, the card tells the server (answer \"shown\")",
    phoneAsk.acks.length === 2 && phoneAsk.acks.every((m) => m.question === "phone" && m.answer === "shown"), JSON.stringify(phoneAsk.acks));
  // top10 6b: the social meter. "friends" on the status page from the server's
  // social_level (hidden at 0, aria "friends this week: n of 10"); a link reports
  // virtual_pet/linked with both pets; full hearts queue "so many friends this week! ♥"
  // once a week on this device.
  const social = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const real = el._state;
    const withLevel = (lvl) => {
      el._state = (x, key) => {
        const st = real.call(el, x, key);
        return key === "sensor.life_stage" && st && x === s ? { ...st, attributes: { ...st.attributes, social_level: lvl } } : st;
      };
    };
    const rowOf = () => [...s.status.querySelectorAll(".row")].find((r) => /friends/.test(r.textContent));
    const out = {};
    const wasSettings = s.settings;
    s.settings = false; s.journal = false; s.finds = false; s.everyWorld = false;
    try {
      withLevel(0);
      s.statusHtml = null;
      el._renderStatus(s, []);
      out.zero = !!rowOf();
      withLevel(5);
      s.statusHtml = null;
      el._renderStatus(s, []);
      out.five = { aria: rowOf()?.querySelector(".hearts")?.getAttribute("aria-label") || null,
        full: rowOf()?.querySelectorAll("img[src*='stat_heart_full']").length, half: rowOf()?.querySelectorAll("img[src*='stat_heart_half']").length };
      // The weekly line: once, then not again this week.
      withLevel(10);
      const monday = new Date();
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      localStorage.removeItem(`hatch-social-full-${s.ids.device}-${monday.toDateString()}`);
      const keep = { queue: s.queue, sayUntil: s.sayUntil, asleep: s.asleep, game: s.game };
      Object.assign(s, { queue: [], sayUntil: 0, asleep: false, game: null });
      el._socialFull(s);
      out.first = s.queue.map((q) => q.text);
      s.queue = [];
      el._socialFull(s);
      out.again = s.queue.length;
      Object.assign(s, keep);
      localStorage.removeItem(`hatch-social-full-${s.ids.device}-${monday.toDateString()}`);
    } finally {
      el._state = real;
      s.settings = wasSettings;
      s.statusHtml = null;
    }
    // The link's report, with the websocket stubbed.
    const realWS = el._hass.callWS;
    const sent = [];
    el._hass.callWS = (msg) => { sent.push(msg); return Promise.resolve(null); };
    try {
      const other = el._slides.find((x) => x !== s && x.ids?.["sensor.life_stage"]);
      if (other) el._linkReport(s, other);
      out.report = sent.filter((m) => m.type === "virtual_pet/linked");
      out.want = other ? [s.ids["sensor.life_stage"], other.ids["sensor.life_stage"]] : null;
    } finally {
      el._hass.callWS = realWS;
    }
    return out;
  });
  check("top10 6b: \"friends\" hidden at 0; at 5, two and a half hearts with its aria",
    !social.zero && social.five.aria === "friends this week: 5 of 10" && social.five.full === 2 && social.five.half === 1, JSON.stringify(social));
  check("top10 6b: full hearts say \"so many friends this week! ♥\" once a week",
    JSON.stringify(social.first) === JSON.stringify(["so many friends this week! ♥"]) && social.again === 0, JSON.stringify(social));
  if (social.want) {
    check("top10 6b: a link reports virtual_pet/linked with both pets",
      social.report.length === 1 && social.report[0].entity_id === social.want[0] && social.report[0].other === social.want[1], JSON.stringify(social.report));
  }
  // Screen readers hear plain words: no hearts or notes; a bare heart is "thank you!".
  const heard = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const out = [];
    for (const line of ["you're the best ♥", "♥", "♪ la la la ♪"]) {
      s.sayUntil = Date.now() + 3000;
      s.bubble.textContent = line;
      await new Promise((r) => setTimeout(r, 50));
      out.push(s.live.textContent);
    }
    return out;
  });
  check("screen readers hear plain words", heard.join("|") === "you're the best|thank you!|la la la", heard.join("|"));
  // A long title is cut to fit.
  const cut = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 }); // flavour: only into a free bubble (2a)
    el._moment(s, { type: "watching", title: "The Great British Bake Off: Christmas Special", at: new Date().toISOString() });
    return s.bubble.textContent;
  });
  check("long titles are cut to fit the bubble", cut.length <= 48 && cut.includes("…"), `${cut} (${cut.length})`);

  // Voices: now and then a line opens with the creature's sound (hidden from
  // screen readers), once per burst; typed out without the bubble growing.
  const voices = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { sound: s.species.voice.sound };
    s.queue = [];
    s.voicedAt = 0;
    s.live.textContent = "";
    out.announced = 0;
    const counter = new MutationObserver(() => { out.announced++; });
    counter.observe(s.live, { childList: true, characterData: true, subtree: true });
    el._speak(s, "hi, Dev!", 3000);
    out.typing = !!s.bubble.dataset.typing;
    const w0 = s.bubble.getBoundingClientRect().width;
    out.hidden = s.bubble.querySelector(".snd")?.getAttribute("aria-hidden");
    await wait(60);
    out.steady = Math.abs(s.bubble.getBoundingClientRect().width - w0) < 0.5;
    for (let i = 0; i < 100 && s.bubble.dataset.typing; i++) await wait(50);
    out.done = !s.bubble.dataset.typing;
    out.voiced = s.bubble.textContent;
    out.live = s.live.textContent;
    counter.disconnect();
    // Babble (on for this check) never while asleep, in a game or behind the status.
    localStorage.setItem("hatch-babble", "on");
    el._card.dispatchEvent(new Event("touchend")); // a tap unlocks audio
    await wait(300);
    const hour = new Date().getHours();
    out.late = hour >= 21 || hour < 8; // quiet hours: no babble at all
    const babbles = (setup) => {
      const saved = { asleep: s.asleep, game: s.game, lightsOut: s.lightsOut };
      setup();
      s.voicedAt = 0;
      el._speak(s, "hello hello", 300);
      const on = !!s.babbling;
      el._stopTyping(s);
      Object.assign(s, saved);
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      return on;
    };
    out.babbleAwake = babbles(() => { s.asleep = false; s.lightsOut = false; s.game = null; });
    out.babbleAsleep = babbles(() => { s.asleep = true; });
    out.babbleGame = babbles(() => { s.game = { kind: "left_right" }; });
    out.babbleStatus = babbles(() => el._toggleStatus(s));
    localStorage.setItem("hatch-babble", "off");
    // A burst: three queued lines, said one after another; only the first voiced.
    s.voicedAt = 0;
    out.burst = [];
    for (const line of ["morning!", "I dreamed I could fly!", "how was your day?"]) el._queue(s, line, 300);
    for (let i = 0; i < 3; i++) {
      s.sayUntil = 0;
      el._sayQueued(s);
      out.burst.push(s.bubble.textContent);
    }
    // A sad line and one with its own opener stay plain.
    s.voicedAt = 0;
    s.sayUntil = 0; // the burst's last line (kept) would hold it back (2a)
    el._moment(s, { type: "discipline_miss", at: new Date().toISOString() }); // said plain (care_miss is catch-up only)
    out.miss = s.bubble.textContent;
    el._speak(s, "hmm... sleepy", 300);
    out.opener = s.bubble.textContent;
    // Opening the status screen says the line whole.
    el._speak(s, "this line is long enough to still be typing", 300);
    el._toggleStatus(s);
    out.finished = !s.bubble.dataset.typing && !s.bubble.querySelector(".untyped")?.textContent;
    el._toggleStatus(s);
    // Its favourite snack (the server says so at most once a day).
    s.queue = [];
    s.voicedAt = Date.now() + 1e9;
    el._moment(s, { type: "favourite_snack", food: "hazelnuts", at: new Date().toISOString() });
    // Kept: over the line on show at once (2a), or queued behind a kept one.
    out.favourite = [s.bubble.textContent, ...s.queue.map((q) => q.text)].filter((t) => /hazelnuts/.test(t));
    s.queue = [];
    s.sayUntil = 0;
    // A kept line for a slide that is NOT on show waits in its queue, unspent and unmarked.
    const off = el._slides.find((x) => x !== s);
    if (off) {
      off.queue = [];
      off.sayUntil = 0;
      const marked = [];
      const markWas = el._markSaid;
      el._markSaid = (...a) => { marked.push(a[1]); };
      el._line(off, 3, "off-show kept line", 300, { at: new Date().toISOString() });
      out.offShow = { said: off.sayUntil > 0, queued: off.queue.length, marked: marked.length };
      el._index = el._slides.indexOf(off);
      el._sayQueued(off);
      out.offShow.after = { queued: off.queue.length, marked: marked.length, bubble: off.bubble.textContent };
      el._index = el._slides.indexOf(s);
      el._markSaid = markWas;
      off.queue = [];
      off.sayUntil = 0;
    }
    // Per-day keys: the card's own, older than 14 days, go; newer ones and others stay.
    const day = (n) => new Date(Date.now() - n * 86400000).toDateString();
    const keys = [`hatch-visit-x-${day(30)}`, `hatch-treat-a-x-${day(20)}`, `hatch-wish-x-${day(2)}`,
      `hatch-seen-x`, `other-thing-${day(30)}`, `hatch-upbringing-x`];
    keys.forEach((k) => localStorage.setItem(k, "1"));
    el._pruneKeys();
    out.prune = keys.map((k) => !!localStorage.getItem(k));
    keys.forEach((k) => localStorage.removeItem(k));
    s.voicedAt = Date.now() + 1e9; // hushed again for the checks after
    return out;
  });
  const snd = voices.sound;
  check("a line can open with the creature's sound, hidden from screen readers",
    voices.voiced === `${snd}! hi, Dev!` && voices.hidden === "true" && voices.live === "hi, Dev!", JSON.stringify(voices));
  check("a line types out without the bubble growing", voices.typing && voices.steady && voices.done, JSON.stringify(voices));
  check("screen readers hear a spoken line once", voices.announced === 1, `${voices.announced} announcements`);
  check("babble plays, but never while asleep, in a game or behind the status",
    (voices.late ? !voices.babbleAwake : voices.babbleAwake) &&
    !voices.babbleAsleep && !voices.babbleGame && !voices.babbleStatus, JSON.stringify(voices));
  check("a burst of lines carries the sound once",
    voices.burst.join("|") === `${snd}! morning!|I dreamed I could fly!|how was your day?`, voices.burst.join("|"));
  check("sad lines and lines with their own opener stay plain",
    voices.miss === "ok, ok... ♪" && voices.opener === "hmm... sleepy", `${voices.miss} | ${voices.opener}`);
  check("opening the status screen finishes the line", voices.finished);
  check("a kept line for a slide off show waits, then is said and marked when it is on show",
    !voices.offShow || (!voices.offShow.said && voices.offShow.queued === 1 && voices.offShow.marked === 0 &&
      voices.offShow.after.queued === 0 && voices.offShow.after.marked === 1 && /off-show kept line/.test(voices.offShow.after.bubble)),
    JSON.stringify(voices.offShow));
  check("old per-day keys are pruned, newer and foreign keys stay",
    voices.prune.join() === "false,false,true,true,true,true", voices.prune.join());
  check("its favourite snack is said", voices.favourite.length === 1 && voices.favourite[0].startsWith("hazelnuts, my favourite!!"),
    voices.favourite.join());
  // Reduced motion: no typing.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    el._speak(s, "no typing here", 300);
    return { typing: !!s.bubble.dataset.typing, said: s.bubble.textContent };
  });
  await page.emulateMedia({ reducedMotion: null });
  check("reduced motion: lines show whole", !still.typing && still.said === "no typing here", JSON.stringify(still));
  // Its catchphrase ends every third voiced line that names nobody, never a
  // question; a close friend can give it a new one (the box wraps, three a row).
  const catchy = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const out = { phrase: el._state(s, "sensor.life_stage")?.attributes.catchphrase, said: [] };
    s.catchCount = 0;
    for (const line of ["the sun's up!", "is this Bluey?", "pretty sky tonight", "the rain stopped!"]) {
      s.voicedAt = 0;
      el._speak(s, line, 300, { catch: true });
      el._stopTyping(s);
      out.said.push(s.bubble.textContent);
    }
    el._ask(s, "catchphrase");
    const buttons = [...s.screen.querySelectorAll(".askday button")];
    out.labels = buttons.map((b) => b.textContent);
    out.rows = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size;
    const box = s.screen.querySelector(".askday").getBoundingClientRect();
    out.inside = box.left >= s.screen.getBoundingClientRect().left && box.right <= s.screen.getBoundingClientRect().right;
    el._clearAsk(s);
    s.voicedAt = Date.now() + 1e9;
    s.sayUntil = 0;
    return out;
  });
  // Every creature's own catchphrase fits the same two rows (the longest,
  // "slow and steady", made "keep" wrap onto a third).
  const sprites = path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "sprites");
  const allPhrases = fs.readdirSync(sprites)
    .filter((id) => fs.existsSync(path.join(sprites, id, "species.json")))
    .map((id) => [id, JSON.parse(fs.readFileSync(path.join(sprites, id, "species.json"), "utf8")).voice?.catchphrase]);
  const everyPhrase = await page.locator("hatch-pet-card").evaluate(async (el, phrases) => {
    const s = el._slides[el._index];
    const real = el._state;
    const bad = [];
    // At full size, then compact (a narrow phone column).
    const measure = (layout) => {
      const area = s.screen.getBoundingClientRect();
      for (const [id, phrase] of phrases.filter(([, p]) => p)) {
        el._state = function (slide, key) {
          const st = real.call(this, slide, key);
          return key === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, catchphrase: phrase } } : st;
        };
        el._ask(s, "catchphrase");
        const buttons = [...s.screen.querySelectorAll(".askday button")];
        const rows = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size;
        const box = s.screen.querySelector(".askday").getBoundingClientRect();
        const keep = buttons.at(-1).getBoundingClientRect();
        const inside = box.left >= area.left && box.right <= area.right && keep.right <= area.right;
        if (rows !== 2 || !inside || buttons.at(-1).textContent !== `keep "${phrase}"`) {
          bad.push({ layout, id, phrase, rows, inside, widths: buttons.map((b) => Math.round(b.getBoundingClientRect().width)), area: Math.round(area.width) });
        }
        el._clearAsk(s);
      }
      return Math.round(area.width);
    };
    const widths = {};
    const width = el.style.width;
    try {
      widths.full = measure("full");
      el.style.width = "300px";
      await new Promise((r) => setTimeout(r, 300));
      el._layout();
      await new Promise((r) => setTimeout(r, 300));
      const compact = el._card.classList.contains("compact");
      widths.compact = compact ? measure("compact") : `not compact (${el._slideW})`;
    } finally {
      el._state = real;
      el.style.width = width;
      await new Promise((r) => setTimeout(r, 300));
      el._layout();
      await new Promise((r) => setTimeout(r, 300));
    }
    s.asking = false;
    return { count: phrases.filter(([, p]) => p).length, longest: phrases.map(([, p]) => p || "").sort((a, b) => b.length - a.length)[0], widths, bad };
  }, allPhrases);
  check("every creature's catchphrase keeps the five choices in two rows, full size and compact",
    everyPhrase.count >= 30 && typeof everyPhrase.widths.compact === "number" && everyPhrase.bad.length === 0,
    JSON.stringify(everyPhrase));
  // A picture of the longest one's box.
  await page.locator("hatch-pet-card").evaluate((el, phrase) => {
    const s = el._slides[el._index];
    const real = el._state;
    el._state = function (slide, key) {
      const st = real.call(this, slide, key);
      return key === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, catchphrase: phrase } } : st;
    };
    try { el._ask(s, "catchphrase"); } finally { el._state = real; }
  }, everyPhrase.longest);
  await shot("04f-catchphrase-longest");
  await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    el._clearAsk(s);
    s.asking = false;
  });
  const p = catchy.phrase;
  check("its catchphrase ends every third line that names nobody, never a question",
    !!p && catchy.said[0] === `${snd}! the sun's up!` && catchy.said[1] === `${snd}? is this Bluey?` &&
    catchy.said[2] === `${snd}! pretty sky tonight` && catchy.said[3] === `${snd}! the rain stopped! ${p}`,
    catchy.said.join(" | "));
  check("a friend can give it a catchphrase: five choices in two rows on the screen",
    catchy.labels.join("|") === `hehe|yay|and stuff|la la|keep "${p}"` && catchy.rows === 2 && catchy.inside,
    JSON.stringify(catchy));
  // Birthdays: yours, picked in the question box (a tap on a picker stays in the
  // box); a celebration takes the away note's place; the pet's party; forgetting.
  const bday = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    el._ask(s, "birthday");
    const box = s.screen.querySelector(".askday");
    // Steppers, "‹ Feb ›" and "‹ 29 ›" (UX 3 F10): the day wraps, a month change keeps it inside.
    const step = (which, dir) => box.querySelector(`[data-step="${which}"][data-dir="${dir}"]`).click();
    out.stepperKeys = [...box.querySelectorAll(".stepb")].map((b) => Math.round(b.getBoundingClientRect().height));
    step("day", -1); // 1 -> 31
    out.wrap31 = box.querySelector(".bday").dataset.v;
    step("month", 1); // Jan -> Feb, 31 -> 29
    out.febDays = Number(box.querySelector(".bday").dataset.v);
    out.febName = box.querySelector(".bmonth").textContent;
    step("day", 1); // 29 -> 1
    step("day", -1); // back to 29
    out.statusAfterPick = s.screen.classList.contains("show-status");
    for (let i = 0; i < 15; i++) step("day", -1); // 29 -> 14
    out.day14 = box.querySelector(".bday").textContent;
    box.querySelector(".bmonth").click();
    box.querySelector('[data-answer="ok"]').click();
    for (let i = 0; i < 100 && s.bubble.dataset.typing; i++) await wait(50);
    out.reply = s.bubble.textContent;
    s.queue = [{ text: "a", ms: 300 }, { text: "while you were out...", ms: 300, opts: { away: true } }, { text: "c", ms: 300 }];
    el._note(s, { kind: "pet_birthday", months: 3 }, true); // the server made room for it
    out.queue = s.queue.map((q) => q.text);
    s.queue = [];
    el._note(s, { kind: "your_birthday", quiet: false });
    el._note(s, { kind: "birthday_friends", months: 11 });
    out.yours = s.queue.map((q) => q.text);
    s.queue = [];
    // The pet's yearly birthday: confetti and the party hat.
    const free = el._free;
    el._free = () => true;
    for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-party-")) localStorage.removeItem(k);
    const stage = el._state(s, "sensor.life_stage");
    const attrs = stage.attributes;
    stage.attributes = { ...attrs, birthday: { years: 1 } };
    el._partyTick(s);
    stage.attributes = attrs;
    el._free = free;
    out.confetti = !!s.screen.querySelector(".confetti i");
    out.hat = s.screen.querySelector(".costume img")?.getAttribute("src") || "";
    out.said = s.bubble.textContent;
    s.screen.querySelector(".costume")?.remove();
    s.sayUntil = 0;
    s.flairUntil = 0;
    // "forget my birthday": only when one is kept, never on a shared screen.
    el._birthdayKept = true;
    if (s.mine) s.mine.birthday_kept = true; // the channel's copy, which the card reads first
    el._birthdayPhone = false;
    if (s.mine) s.mine.birthday_phone = false;
    s.settings = true; // the rows live in the settings sheet
    el._renderStatus(s, []);
    out.forget = !!s.status.querySelector(".bell.forgetbday");
    out.phoneOff = s.status.querySelector(".bell.bdayphone")?.getAttribute("aria-pressed");
    s.status.querySelector(".bell.bdayphone").click();
    for (let i = 0; i < 40 && !el._birthdayPhone; i++) await wait(50);
    out.phoneOn = s.status.querySelector(".bell.bdayphone")?.getAttribute("aria-pressed");
    localStorage.setItem("hatch-shared-screen", "on");
    el._renderStatus(s, []);
    out.forgetShared = !!s.status.querySelector(".bell.forgetbday, .bell.bdayphone");
    out.sharedSheet = !!s.status.querySelector(".bell.shared"); // the same sheet, not an empty one
    localStorage.setItem("hatch-shared-screen", "off");
    el._renderStatus(s, []);
    // Two taps (the confirm guard): the first arms it, a fast second is the
    // same tap, and one after a pause confirms.
    const sent = [];
    const realWS = el._hass.callWS.bind(el._hass);
    el._hass.callWS = (msg) => { sent.push(msg.type); return realWS(msg); };
    s.status.querySelector(".bell.forgetbday").click();
    out.armed = s.status.querySelector(".bell.forgetbday")?.textContent;
    await wait(100);
    s.status.querySelector(".bell.forgetbday").click();
    await wait(300);
    out.fastDouble = { kept: el._birthdayKept, sent: sent.length };
    await wait(400); // 700 ms after the last tap
    s.status.querySelector(".bell.forgetbday").click();
    for (let i = 0; i < 40 && el._birthdayKept; i++) await wait(50);
    el._hass.callWS = realWS;
    out.forgotten = !el._birthdayKept && sent.join() === "virtual_pet/forget_birthday";
    s.settings = false;
    el._renderStatus(s, []);
    s.voicedAt = Date.now() + 1e9;
    return out;
  });
  check("your birthday is picked in the box, and a tap on a picker stays there",
    bday.febDays === 29 && bday.febName === "Feb" && bday.wrap31 === "31" && bday.day14 === "14" &&
    bday.stepperKeys.every((h) => h >= 44) && !bday.statusAfterPick && /Feb 14! i'll remember ♥$/.test(bday.reply), JSON.stringify(bday));
  check("a celebration takes the away note's place; yours is by name",
    bday.queue.join("|") === "a|c|i'm 3 months old today! ♥" &&
    /^happy birthday, \S+!! ♥$/.test(bday.yours[0]) &&
    bday.yours[1] === "i'm 11 months old! friends from day one ♥", JSON.stringify(bday));
  check("its birthday brings confetti and a party hat",
    bday.confetti && /season_party_hat/.test(bday.hat) && /party hat on! ♪$/.test(bday.said), JSON.stringify(bday));
  check("your birthday can be forgotten, never shown on a shared screen",
    bday.forget && bday.sharedSheet && !bday.forgetShared && bday.forgotten, JSON.stringify(bday));
  check("forgetting takes two taps, and a fast double tap is one",
    bday.armed === "sure? tap again" && bday.fastDouble.kept && bday.fastDouble.sent === 0, JSON.stringify(bday));
  check("the birthday phone message is off until you turn it on",
    bday.phoneOff === "false" && bday.phoneOn === "true", JSON.stringify(bday));
  // Laying an egg shares the guard: a fast double tap lays nothing.
  const egg = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const pressed = [];
    const press = el._press;
    const redraw = el._redraw;
    el._press = (slide, key) => pressed.push(key);
    el._redraw = () => {};
    const was = s.request.dataset.key;
    s.request.dataset.key = "lay_egg";
    s.confirm = null;
    s.request.click();
    const armed = s.request.textContent;
    await wait(150);
    s.request.click();
    const fast = pressed.length;
    await wait(700);
    s.request.click();
    el._press = press;
    el._redraw = redraw;
    s.request.dataset.key = was ?? "";
    if (!was) delete s.request.dataset.key;
    return { armed, fast, pressed };
  });
  check("laying an egg takes two taps, with a pause between",
    egg.armed === "sure? tap again" && egg.fast === 0 && egg.pressed.join() === "lay_egg", JSON.stringify(egg));
  // Taps coalesce: a second tap while a call is pending does nothing.
  const taps = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const real = el._hass.callService;
    const sent = [];
    el._hass.callService = async (d, svc, data) => { sent.push(`${d}.${svc}`); await wait(300); };
    try {
      const feed = s.buttons.feed;
      feed.click();
      await wait(30);
      feed.click();
      await wait(450);
      const feeds = sent.filter((x) => x === "button.press").length;
      feed.click(); // free again once the first call is done
      await wait(450);
      const again = sent.filter((x) => x === "button.press").length;
      sent.length = 0;
      s.buttons.lights.click();
      await wait(30);
      s.buttons.lights.click();
      await wait(450);
      return { feeds, again, lights: sent.filter((x) => x.startsWith("switch.")).length };
    } finally {
      el._hass.callService = real;
    }
  });
  check("a double tap on feed sends one press, and the button is free again after",
    taps.feeds === 1 && taps.again === 2, JSON.stringify(taps));
  check("lights tapped twice send one service call", taps.lights === 1, JSON.stringify(taps));
  // The confirm guard: a second tap a second after the first confirms (all three controls).
  const slow = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const out = {};
    const realWS = el._hass.callWS;
    const sent = [];
    el._hass.callWS = async (msg) => { sent.push(msg.type); return null; };
    try {
      el._birthdayKept = true;
      if (s.mine) s.mine.birthday_kept = true; // the channel's copy, which the card reads first
      el._birthdayPhone = false;
      if (s.mine) s.mine.birthday_phone = false;
      s.confirm = null;
      s.settings = true; // the forget rows live in the settings sheet
      el._renderStatus(s, []);
      for (const [cls, type] of [["forgetbday", "virtual_pet/forget_birthday"], ["forgetme", "virtual_pet/forget_me"]]) {
        s.status.querySelector(`.bell.${cls}`).click();
        await wait(1000);
        s.status.querySelector(`.bell.${cls}`).click();
        await wait(150);
        out[cls] = sent.includes(type);
        el._birthdayKept = true;
        if (s.mine) s.mine.birthday_kept = true; // the channel's copy, which the card reads first
        el._renderStatus(s, []);
      }
      const pressed = [];
      const press = el._press;
      const redraw = el._redraw;
      el._press = (slide, key) => pressed.push(key);
      el._redraw = () => {};
      const was = s.request.dataset.key;
      s.request.dataset.key = "lay_egg";
      s.confirm = null;
      s.request.click();
      await wait(1000);
      s.request.click();
      el._press = press;
      el._redraw = redraw;
      s.request.dataset.key = was ?? "";
      if (!was) delete s.request.dataset.key;
      out.egg = pressed.join();
    } finally {
      el._hass.callWS = realWS;
      s.confirm = null;
      s.settings = false;
    }
    return out;
  });
  check("on all three guarded controls a second tap a second later confirms",
    slow.forgetbday && slow.forgetme && slow.egg === "lay_egg", JSON.stringify(slow));
  // The lay sheet (settings S2): the next egg chosen in the lay confirm. The server's egg_roster is
  // real; the pet's raised creatures, its stage and the calls are stubbed on this card's own hass
  // (a copy, put back at the end), so each state is pinned.
  const lay = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const realHass = el._hass;
    const realPress = el._press;
    const lifeId = s.ids["sensor.life_stage"], selId = s.ids["select.next_egg"], moodId = s.ids["sensor.mood"];
    const life = realHass.states[lifeId], sel = realHass.states[selId], mood = realHass.states[moodId];
    const roster = life.attributes.egg_roster || [];
    const out = { rosterNames: Array.isArray(roster) && roster.length >= 3
      && roster.map((r) => r.name).join("|") === sel.attributes.options.slice(1).join("|") };
    const calls = [], pressed = [];
    let fail = null;
    const was = s.request.dataset.key;
    // The state this pet would send: stage, its raised creatures, its pick, a waiting world, the requests.
    const put = ({ stage = "adult", raised, pick = null, nextWorld = null, eggRoster = roster, requests = ["lay_egg"], others = {} }) => {
      const states = { ...realHass.states,
        [lifeId]: { ...life, state: stage, attributes: { ...life.attributes, raised, egg_roster: eggRoster, next_egg: pick, next_world: nextWorld } },
        [moodId]: { ...mood, attributes: { ...mood.attributes, requests } },
        [selId]: { ...sel, state: pick || sel.attributes.options[0] } };
      for (const [i, attrs] of Object.entries(others)) {
        const other = el._slides[i], id = other.ids["sensor.life_stage"];
        states[id] = { ...realHass.states[id], attributes: { ...realHass.states[id].attributes, ...attrs } };
      }
      el._hass = { ...realHass, states, callService: async (d, svc, data) => {
        calls.push(`${d}.${svc}:${data.option ?? data.entity_id}`);
        if (fail) throw fail;
      } };
      s.drawnSig = null;
    };
    const ids = (offer) => offer?.offered.map((r) => r.id).join();
    const rows = () => [...s.status.querySelectorAll(".layrow")].map((b) => b.textContent);
    const open = async () => {
      s.request.dataset.key = "lay_egg";
      s.request.click();
      await wait(30);
      return s.laySheet && s.screen.classList.contains("show-status") && !!s.status.querySelector(".laygo");
    };
    const closed = () => !s.laySheet && !s.screen.classList.contains("show-status");
    const shut = () => { if (s.laySheet) el._closeLay(s); };
    el._press = (slide, key) => pressed.push(key);
    const a = roster[0], b = roster[1], c = roster[2];
    try {
      // The offer: raised creatures of the egg's world, in egg_roster order; another world's id is dropped.
      put({ raised: [c.id, a.id, "not-in-this-roster"] });
      out.offer = ids(el._eggOffer(s)) === `${a.id},${c.id}`;
      // Two or more offered: the first tap opens the sheet and presses nothing.
      out.opens = await open() && pressed.length === 0 && s.confirm == null;
      out.listed = rows().join("|") === ["surprise me", a.name, c.name].map((x) => x.toLowerCase()).join("|")
        && s.status.querySelector(".layrow[aria-pressed=true]")?.textContent === "surprise me";
      out.lines = s.status.querySelector(".sec").textContent === "a new egg"
        && s.status.querySelector(".shellnote").textContent === "pick who hatches"
        && s.status.querySelector(".laygo").textContent === "lay the egg"
        && s.status.querySelector(".layback").textContent === "‹ not yet"
        && /^lay the egg: .+ retires to the journal and a new egg takes its place$/.test(s.status.querySelector(".laygo").getAttribute("aria-label"));
      // A creature row sends the select's own option string; the surprise row options[0], case and all.
      s.status.querySelector(`.layrow[data-id="${c.id}"]`).click();
      await wait(30);
      s.status.querySelector('.layrow[data-id=""]').click();
      await wait(30);
      out.calls = calls.join("|") === `select.select_option:${c.name}|select.select_option:${sel.attributes.options[0]}`
        && calls[1].endsWith(":Surprise me") === (sel.attributes.options[0] === "Surprise me");
      // The row marks follow the state, and a pick outside the offer is read-only (N25), never named.
      put({ raised: [a.id, c.id], pick: c.name });
      el._renderStatus(s, []);
      out.marked = s.status.querySelector(".layrow[aria-pressed=true]")?.textContent === c.name.toLowerCase();
      put({ raised: [a.id, c.id], pick: b.name });
      el._renderStatus(s, []);
      out.outside = s.status.querySelector(".layrow.ro")?.textContent === "set in home assistant"
        && !s.status.textContent.toLowerCase().includes(b.name.toLowerCase())
        && s.status.querySelector(".layrow[aria-pressed=true]") === null;
      // A refused select_option (a read-only login): C13', the sheet stays.
      put({ raised: [a.id, c.id] });
      fail = { code: "unauthorized", message: "Unauthorized" };
      el._renderStatus(s, []);
      s.status.querySelector(`.layrow[data-id="${a.id}"]`).click();
      await wait(60);
      out.refused = s.status.querySelector(".status-feedback")?.textContent === "this login can't choose, sorry" && s.laySheet;
      fail = null;
      // "‹ not yet" lays nothing and closes; the guard keeps a fast second tap from laying.
      s.status.querySelector(".layback").click();
      out.back = closed() && pressed.length === 0;
      await open();
      s.status.querySelector(".laygo").click(); // inside the guard window: the tap that opened it
      out.fast = pressed.length === 0 && s.laySheet;
      await wait(700);
      s.status.querySelector(".laygo").click();
      out.lays = pressed.join() === "lay_egg" && closed();
      pressed.length = 0;
      // Every other exit: the status chip, the pet leaving (a swipe), the shared-screen switch, a pet that
      // can no longer lay, a world change that leaves one raised creature, the lay itself (above).
      await open();
      el._toggleStatus(s);
      out.chip = closed();
      const n = el._slides.length;
      if (n > 1) {
        await open();
        el._go((el._index + 1) % n);
        const gone = closed();
        el._go(el._slides.indexOf(s));
        out.swipe = gone;
      } else out.swipe = true;
      await open();
      localStorage.setItem("hatch-shared-screen", "on");
      el._goShared();
      out.sharedExit = closed();
      // Shared screens may lay: the sheet opens and lays there too.
      put({ raised: [a.id, c.id] });
      out.sharedOpens = await open();
      await wait(700);
      s.status.querySelector(".laygo").click();
      out.sharedLays = pressed.join() === "lay_egg" && closed();
      pressed.length = 0;
      localStorage.setItem("hatch-shared-screen", "off");
      el._goPersonal();
      put({ raised: [a.id, c.id] });
      await open();
      put({ raised: [a.id, c.id], requests: [] });
      el._redraw(s);
      await wait(300); // _update is async
      out.cannotLay = closed();
      put({ raised: [a.id, c.id] });
      await open();
      put({ raised: [a.id] });
      el._redraw(s);
      await wait(300); // _update is async
      out.oneLeft = closed();
      // Fewer than two offered (one, none, or a state without `raised`): the old two taps, no sheet.
      for (const raised of [[a.id], [], undefined]) {
        put({ raised });
        s.request.dataset.key = "lay_egg";
        s.confirm = null;
        s.request.click();
        await wait(30);
        out[`twoTaps${raised?.length ?? "none"}`] = closed() && s.request.textContent === "sure? tap again" && pressed.length === 0;
        s.confirm = null;
      }
      // A waiting world change: the offer is that world's, raised by this card's pets there.
      const worlds = el._worlds, own = life.attributes.world;
      const other = Object.keys(worlds).find((k) => k !== own);
      const theirs = worlds[other].roster.slice(0, 3).map((id) => ({ id, name: id }));
      put({ raised: [a.id, b.id, c.id], nextWorld: worlds[other].name, eggRoster: theirs });
      out.nextWorldNone = ids(el._eggOffer(s)) === "";
      if (el._slides.length > 1) {
        const second = el._slides.findIndex((x) => x !== s);
        put({ raised: [a.id, b.id, c.id], nextWorld: worlds[other].name, eggRoster: theirs,
          others: { [second]: { world: other, raised: theirs.map((t) => t.id).slice(0, 2).concat([a.id]) } } });
        out.nextWorld = ids(el._eggOffer(s)) === theirs.slice(0, 2).map((t) => t.id).join();
      } else out.nextWorld = true;
      // The status row: "surprise" for an adult with nothing picked or a pick outside the offer; the
      // offered pick by name. The egg's first look: once, only for an offered pick.
      const statusRow = () => {
        if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
        el._toggleStatus(s);
        return [...s.status.querySelectorAll(".row")].find((r) => /next egg|hatching/.test(r.textContent))?.textContent || "";
      };
      put({ raised: [a.id, c.id] });
      out.rowNone = /next egg\s*surprise$/.test(statusRow());
      put({ raised: [a.id, c.id], pick: c.name });
      out.rowPick = statusRow().endsWith(c.name.toLowerCase());
      put({ raised: [a.id, c.id], pick: b.name });
      out.rowOutside = /next egg\s*surprise$/.test(statusRow());
      el._toggleStatus(s);
      const key = `hatch-eggcoming-${s.ids.device}-${life.attributes.generation ?? 1}`;
      localStorage.removeItem(key);
      put({ stage: "egg", raised: [a.id, c.id], pick: b.name });
      out.comingOutside = el._eggComing(s) === null;
      put({ stage: "egg", raised: [a.id, c.id], pick: c.name });
      out.coming = el._eggComing(s) === `a ${c.name.toLowerCase()} is coming` && el._eggComing(s) === null;
      localStorage.removeItem(key);
    } finally {
      el._press = realPress;
      el._hass = realHass;
      localStorage.setItem("hatch-shared-screen", "off");
      shut();
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      s.request.dataset.key = was ?? "";
      if (!was) delete s.request.dataset.key;
      s.confirm = null;
      s.drawnSig = null;
    }
    return out;
  });
  for (const [name, ok] of Object.entries(lay)) check(`settings S2 lay sheet: ${name}`, ok === true, JSON.stringify(lay));
  // Answers that wait: a failed save is retried once, then kept on this device.
  const waits = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const user = el._hass.user.id;
    const key = `hatch-answers-${user}`;
    const realWS = el._hass.callWS;
    const out = {};
    let mode = "fail"; // fail | lost | ok
    const sent = [];
    el._hass.callWS = async (msg) => {
      if (msg.type !== "virtual_pet/answer") return realWS.call(el._hass, msg);
      sent.push(`${msg.question}=${msg.answer}`);
      if (mode === "fail") throw { code: "unknown_error" };
      if (mode === "notasked") throw { code: "not_asked" };
      return null;
    };
    const answerAs = async (kind, button) => {
      localStorage.removeItem(key);
      sent.length = 0;
      el._ask(s, kind);
      s.screen.querySelector(`.askday button[data-answer="${button}"]`).click();
      await wait(3600);
    };
    try {
      localStorage.removeItem("hatch-shared-screen");
      await answerAs("fav_weather", "snow");
      out.tries = sent.length;
      out.bubble = s.bubble.textContent;
      out.stash = JSON.parse(localStorage.getItem(key) || "[]").map((a) => `${a.question}=${a.answer}`).join();
      // Not yet resendable on a transport error; a later hass sends it.
      mode = "ok";
      sent.length = 0;
      el._resendAfter = 0;
      el.hass = el._hass;
      await wait(200);
      out.resent = sent.join();
      out.cleared = localStorage.getItem(key);
      // A stashed answer the server did not ask for is dropped.
      mode = "notasked";
      localStorage.setItem(key, JSON.stringify([{ question: "fav_season", answer: "winter", at: Date.now(), entity: s.ids["sensor.life_stage"] }]));
      el._resendAfter = 0;
      el.hass = el._hass;
      await wait(200);
      out.dropped = localStorage.getItem(key);
      // A transport error keeps it.
      mode = "fail";
      localStorage.setItem(key, JSON.stringify([{ question: "fav_season", answer: "winter", at: Date.now(), entity: s.ids["sensor.life_stage"] }]));
      el._resendAfter = 0;
      el.hass = el._hass;
      await wait(200);
      out.kept = !!localStorage.getItem(key);
      // Dream, birthday: never stashed.
      await answerAs("dream", "sea");
      out.dream = localStorage.getItem(key);
      out.dreamBubble = s.bubble.textContent; // not stashed, so lost: the pet says so
      // The server will not take it (not_asked): the pet said it will remember, and says nothing more (UX 3 F6).
      mode = "notasked";
      await answerAs("dream", "stars");
      out.notAskedBubble = s.bubble.textContent;
      mode = "fail";
      await answerAs("birthday", "skip");
      out.birthday = localStorage.getItem(key);
      // A shared screen stores nothing.
      localStorage.setItem("hatch-shared-screen", "on");
      await answerAs("fav_weather", "snow");
      out.shared = localStorage.getItem(key);
      localStorage.setItem("hatch-shared-screen", "off");
      // forget_me removes the key.
      localStorage.setItem(key, JSON.stringify([{ question: "fav_season", answer: "winter", at: Date.now(), entity: "x" }]));
      mode = "ok";
      el._hass.callWS = async () => null;
      el._birthdayKept = true;
      if (s.mine) s.mine.birthday_kept = true; // the channel's copy, which the card reads first
      s.confirm = null;
      s.settings = true; // the forget row lives in the settings sheet
      el._renderStatus(s, []);
      s.status.querySelector(".bell.forgetme").click();
      await wait(700);
      s.status.querySelector(".bell.forgetme").click();
      await wait(300);
      out.forgotten = localStorage.getItem(key);
      s.settings = false;
      // A retry that fires after the slide moved on writes no bubble.
      el._hass.callWS = async (msg) => { throw { code: "unknown_error" }; };
      localStorage.removeItem(key);
      el._ask(s, "fav_weather");
      const id = s.ids["sensor.life_stage"];
      s.screen.querySelector('.askday button[data-answer="snow"]').click();
      s.bubble.textContent = "";
      s.ids = { ...s.ids, "sensor.life_stage": "sensor.someone_else_life_stage" };
      await wait(3600);
      s.ids = { ...s.ids, "sensor.life_stage": id };
      out.late = s.bubble.textContent;
    } finally {
      el._hass.callWS = realWS;
      localStorage.setItem("hatch-shared-screen", "off");
      localStorage.removeItem(key);
    }
    return out;
  });
  check("a failed save of a stashed kind is retried once, kept for this person and the pet stays quiet (UX 3 F6)",
    waits.tries === 2 && waits.bubble === "snow!! ❄ i'll remember" && waits.stash === "fav_weather=snow", JSON.stringify(waits));
  check("a failed save of a kind that is not stashed says it slipped away; a refused one (not_asked) says nothing",
    waits.dreamBubble === "hm, that one slipped away ♪" && waits.notAskedBubble === "ooh, the stars. ok! ★", JSON.stringify(waits));
  check("a kept answer is sent when the card next gets hass with a user, and cleared",
    waits.resent === "fav_weather=snow" && waits.cleared === null, JSON.stringify(waits));
  check("a kept answer the server did not ask for is dropped, a transport error keeps it",
    waits.dropped === null && waits.kept === true, JSON.stringify(waits));
  check("a dream, a birthday and a shared screen store nothing",
    waits.dream === null && waits.birthday === null && waits.shared === null, JSON.stringify(waits));
  check("forgetting my data removes kept answers", waits.forgotten === null, JSON.stringify(waits));
  check("a retry after the slide changed writes no bubble", waits.late === "", JSON.stringify(waits));
  // UX fix 3 (review 3): talking with the pet, by real pointer taps where a tap is the point.
  const card3 = page.locator("hatch-pet-card");
  const talkSetup = (kind, pill = false) => card3.evaluate((el, [kind, pill]) => {
    const s = el._slides[el._index];
    el.scrollIntoView({ block: "center" });
    s.queue = []; s.sayUntil = 0; s.sayClass = 0; s.game = null; s.confirm = null; s.answeredAt = 0;
    s.screen.classList.remove("show-status");
    el._ask(s, kind);
    if (pill) {
      s.request.dataset.key = "lay_egg";
      s.request.textContent = "lay an egg?";
      s.request.classList.add("show");
    }
    const r = (node) => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    return { chips: [...s.screen.querySelectorAll(".askday button")].map((b) => ({ a: b.dataset.answer, ...r(b) })),
      screen: r(s.screen), pill: getComputedStyle(s.request).display };
  }, [kind, pill]);
  const talkAfter = () => card3.evaluate((el) => {
    const s = el._slides[el._index];
    return { asking: !!s.screen.querySelector(".askday"), status: s.screen.classList.contains("show-status"),
      said: s.sayEntry?.text ?? s.bubble.textContent, bubble: s.bubble.textContent, confirm: s.confirm?.key || null,
      pill: s.request.textContent, until: s.sayUntil - Date.now() };
  });
  // F1: the lay pill is hidden under a question, so the third chip's right edge answers it.
  let t3 = await talkSetup("how_day", true);
  const third = t3.chips[2];
  await page.mouse.click(third.x + third.w - 4, third.y + third.h / 2);
  let a3 = await talkAfter();
  check("UX3 F1: the lay pill is hidden while a question is open, and a tap on the third chip's edge answers it",
    t3.pill === "none" && !a3.asking && a3.confirm === null && a3.pill === "lay an egg?", JSON.stringify([t3.pill, a3]));
  // F2: a double tap on an answer leaves the pet's reply on show, not the status.
  t3 = await talkSetup("how_day");
  const ok = t3.chips[1];
  await page.mouse.click(ok.x + ok.w / 2, ok.y + ok.h / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(ok.x + ok.w / 2, ok.y + ok.h / 2);
  await page.waitForTimeout(200);
  a3 = await talkAfter();
  check("UX3 F2: a double tap on an answer opens no status, and the reply is on show", !a3.status && !a3.asking && a3.bubble.length > 0, JSON.stringify(a3));
  // F3: a tap beside the chips during a question opens no status; the question stays.
  t3 = await talkSetup("how_day");
  await page.mouse.click(t3.screen.x + t3.screen.w / 2, t3.screen.y + t3.screen.h * 0.5);
  await page.waitForTimeout(150);
  a3 = await talkAfter();
  check("UX3 F3: a tap on the screen during a question does not open the status", !a3.status && a3.asking, JSON.stringify(a3));
  // F8: the pet steps back while it asks, and is back after.
  const step = () => card3.evaluate(async (el) => {
    await new Promise((r) => setTimeout(r, 500));
    const s = el._slides[el._index];
    const cs = getComputedStyle(s.pet);
    return { translate: cs.translate, scale: cs.scale, base: s.pet.style.scale };
  });
  const stepIn = await step();
  await card3.evaluate((el) => el._slides[el._index].screen.querySelector(".askday")?.remove());
  const stepOut = await step();
  check("UX3 F8: the pet steps back while a question is open (smaller and up), and returns after",
    stepIn.translate !== "none" && stepOut.translate === "none" && Number(stepIn.scale) < Number(stepOut.scale),
    JSON.stringify({ stepIn, stepOut }));
  // F8, measured: the pet's feet stand on the chips' top, and its head is not under the chip block.
  const stood = {};
  for (const kind of ["how_day", "catchphrase", "birthday", "big_day_day"]) {
    await talkSetup(kind);
    await page.waitForTimeout(450);
    stood[kind] = await card3.evaluate((el) => {
      const s = el._slides[el._index];
      const p = s.pet.getBoundingClientRect();
      const c = s.screen.querySelector(".askday").getBoundingClientRect();
      return { petBottom: Math.round(p.bottom), chipsTop: Math.round(c.top), petTop: Math.round(p.top), petH: Math.round(p.height),
        chips: s.screen.querySelectorAll(".askday button").length };
    });
    await card3.evaluate((el) => el._slides[el._index].screen.querySelector(".askday")?.remove());
  }
  check("UX3 F8: with any question open, the pet stands above the chips (feet at their top, at least 20 px tall)",
    Object.values(stood).every((r) => r.petBottom <= r.chipsTop + 3 && r.petH >= 20), JSON.stringify(stood));
  // F4: "yes" to the big day gives the day chips at once, not after the question's minute.
  t3 = await talkSetup("big_day");
  await card3.evaluate((el) => {
    const s = el._slides[el._index];
    s.queue.push({ text: "anything big this week?", ms: 60000, ask: true, cls: 3 });
    el._sayQueued(s);
  });
  await page.mouse.click(t3.chips[0].x + t3.chips[0].w / 2, t3.chips[0].y + t3.chips[0].h / 2);
  await page.waitForTimeout(1200);
  const days = await card3.evaluate((el) => {
    const s = el._slides[el._index];
    return { chips: [...s.screen.querySelectorAll(".askday button")].map((b) => b.textContent), said: s.bubble.textContent,
      first: s.screen.querySelector(".askday button")?.dataset.answer };
  });
  check("UX3 F4/F14: after \"yes\", the day chips show within 1.2 s, and the first is \"today\"",
    days.chips.length === 7 && days.chips[0] === "today" && /which day/.test(days.said) &&
    /^\d{4}-\d\d-\d\d$/.test(days.first), JSON.stringify(days));
  // F5: the reply to an answer is kept: a flavour line and a beat don't replace it.
  await talkSetup("how_day");
  const kept5 = await card3.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.screen.querySelector('.askday button[data-answer="tough"]').click();
    const reply = s.sayEntry?.text;
    el._line(s, 1, "flavour line", 4500);
    el._line(s, 2, "a beat", 4500);
    await new Promise((r) => setTimeout(r, 300));
    return { reply, bubbleHasOther: /flavour line|a beat/.test(s.bubble.textContent), cls: s.sayClass, queued: s.queue.map((q) => q.text) };
  });
  check("UX3 F5: an answer's reply is the viewer's own line: no flavour line or beat replaces it",
    !!kept5.reply && kept5.cls === 4 && !kept5.bubbleHasOther, JSON.stringify(kept5));
  // F15: a care press that cuts the question line brings it back for what is left, and only while the question is open.
  const f15 = await card3.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.queue = []; s.sayUntil = 0; s.sayClass = 0; s.game = null;
    el._ask(s, "how_day");
    s.queue.push({ text: "how was your day?", ms: 60000, ask: true, cls: 3 });
    el._sayQueued(s);
    await new Promise((r) => setTimeout(r, 300));
    el._line(s, 4, "a care line", 3000);
    const open = s.queue.map((q) => q.ms);
    s.screen.querySelector(".askday")?.remove();
    s.queue = [];
    s.sayEntry = { text: "how was your day?", ms: 60000, ask: true, cls: 3, shownAt: Date.now() - 300 };
    s.sayUntil = Date.now() + 59000;
    el._line(s, 4, "another care line", 3000);
    return { open, closed: s.queue.length };
  });
  check("UX3 F15: a cut question comes back for the time left only while open", f15.open.length === 1 && f15.open[0] < 60000 &&
    f15.open[0] > 58000 && f15.closed === 0, JSON.stringify(f15));
  // F9: big text reaches the bubble and the chips, and lines stay longer.
  const f9 = await card3.evaluate(async (el) => {
    const s = el._slides[el._index];
    const speak = (ms) => { s.sayUntil = 0; el._speak(s, "ok", ms); return s.sayUntil - Date.now(); };
    localStorage.setItem("hatch-big-text", "off");
    el._card.classList.remove("bigtext");
    const normal = speak(4500);
    const fontOff = getComputedStyle(s.bubble).fontSize;
    localStorage.setItem("hatch-big-text", "on");
    el._card.classList.add("bigtext");
    const big = speak(4500);
    const fontOn = getComputedStyle(s.bubble).fontSize;
    el._ask(s, "how_day");
    const chip = getComputedStyle(s.screen.querySelector(".askday button")).fontSize;
    s.screen.querySelector(".askday")?.remove();
    localStorage.setItem("hatch-big-text", "off");
    el._card.classList.remove("bigtext");
    return { normal, big, fontOff, fontOn, chip };
  });
  check("UX3 F9: big text makes the bubble 16 px and the chips 15 px, and holds a line 1.5 times as long",
    f9.fontOff === "14px" && f9.fontOn === "16px" && f9.chip === "15px" && f9.big - f9.normal > 2000 && f9.big - f9.normal < 2500, JSON.stringify(f9));
  // F12: the lay's first tap is answered by the pet itself.
  const f12 = await card3.evaluate((el) => {
    const s = el._slides[el._index];
    const press = el._press;
    el._press = () => {};
    s.queue = []; s.sayUntil = 0; s.sayClass = 0; s.confirm = null; s.game = null;
    s.screen.querySelector(".askday")?.remove();
    s.request.dataset.key = "lay_egg";
    s.request.click();
    const out = { said: s.sayEntry?.text, cls: s.sayClass, armed: s.request.textContent };
    el._press = press;
    s.confirm = null;
    s.request.dataset.key = "";
    delete s.request.dataset.key;
    return out;
  });
  check("UX3 F12: the lay's \"sure?\" is also said by the pet, once",
    f12.said === "i'll wait for you in the journal ♥" && f12.cls === 4 && f12.armed === "sure? tap again", JSON.stringify(f12));
  // A close friend coming home: "you're home!!" to them (their own channel's
  // friend_home), and nothing for anyone else's arrival on a personal card.
  await evaluate((me) => localStorage.removeItem(`hatch-welcomed-${me}`), me);
  const cheers = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const out = [];
    const at = new Date().toISOString(); // the same arrival twice: cheered once
    for (const type of ["friend_home", "friend_home", "someone_home"]) {
      Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
      s.bubble.textContent = "";
      el._moment(s, { type, at });
      out.push(s.queue[0]?.text || s.bubble.textContent); // queued, or said at once (2a)
    }
    s.queue = [];
    return { out };
  });
  // What the pet tells only you: a friendship month, last night's tuck-in, a
  // busy day; a record and a goodnight, to their person only. (A real push may
  // have replaced the close bond set above.)
  await mineFor({ bond: { level: 8, nickname: "sunbeam" } });
  const secret = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    s.queue = [];
    el._nightLine = () => null; // E4 S-b's callback after a visitor or sunset: checked in moments
    el._note(s, { kind: "friends_for", months: 1 });
    el._note(s, { kind: "steps", steps: 11000 });
    el._note(s, { kind: "stairs", floors: 12 });
    el._moment(s, { type: "bond_record", game: "left_right", wins: 4, at: "x" });
    el._moment(s, { type: "tucked_in", at: "z" });
    const out = s.queue.map((q) => q.text); // kept: each waits its turn (2a)
    // The goodnight on show (a beat) is replaced by the tuck-in, not followed by it.
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
    el._moment(s, { type: "fell_asleep", how: "house", at: "y" });
    const night = s.bubble.textContent;
    el._moment(s, { type: "tucked_in", at: "z" });
    out.push(night, s.bubble.textContent, s.queue.length);
    s.queue = [];
    delete el._nightLine;
    return out;
  }, me);
  check("private notes, records and goodnights are said to their person",
    secret[0] === "we've been friends for a month! ♥" && secret[1] === "wow, 11,000 steps! you've been busy!" &&
    secret[2] === "12 floors of stairs! what a climber!" && secret[3] === "new best at left or right! 4/5 ♥" &&
    secret[4] === "thank you for tucking me in, sunbeam ♥" && /night|sleep/.test(secret[5]) &&
    secret[6] === "thank you for tucking me in, sunbeam ♥" && secret[7] === 0 && secret.length === 8,
    secret.join(" | "));
  // "How was your day?": three answers, a warm reply, and it goes away.
  const askBox = cur().locator(".askday");
  await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    s.bubble.textContent = "how was your day?";
    s.sayUntil = Date.now() + 20000;
    el._ask(s, "how_day");
  });
  const answers = await askBox.locator("button").allInnerTexts();
  await shot("04d-ask-day");
  await askBox.locator('button[data-answer="tough"]').click();
  await page.waitForTimeout(300);
  const reply = await bubble();
  // E7 Q-a: a typed teen or adult says its own reply half the time.
  const TOUGH = [...fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"),
    "utf8").matchAll(/reply_tough: \[("[^"]*")\]/g)].map((m) => JSON.parse(m[1]));
  check("it asks how your day was, and answers kindly", answers.join() === "great,ok,tough" &&
    (/snuggle|cuddle/.test(reply) || TOUGH.includes(reply)) && await askBox.count() === 0, `${answers.join()} -> ${reply}`);
  await shot("04e-ask-day-answer");
  // A remembered answer goes to the server as a websocket command, not a service.
  const kept = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const sent = [];
    const real = el._hass.callWS.bind(el._hass);
    el._hass.callWS = (msg) => { sent.push(msg); return real(msg); };
    el._ask(s, "fav_weather");
    s.screen.querySelector('.askday button[data-answer="snow"]').click();
    await new Promise((r) => setTimeout(r, 600));
    el._hass.callWS = real;
    return { sent, said: s.bubble.textContent };
  });
  check("a favourite is kept through the answer command",
    kept.sent.length === 1 && kept.sent[0].type === "virtual_pet/answer" && kept.sent[0].question === "fav_weather" &&
    kept.sent[0].answer === "snow" && kept.said === "snow!! ❄ i'll remember", JSON.stringify(kept));
  // The new lines: a dream someone picked, a guess, a zone, the season, coming home wet.
  const lines = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    s.queue = [];
    el._note(s, { kind: "dream", pick: "sea", yours: true });
    el._note(s, { kind: "dream", pick: "sea", yours: false });
    el._note(s, { kind: "guess", guess: "rain", outcome: "wrong" });
    el._note(s, { kind: "back_from", place: "gym" });
    el._note(s, { kind: "season", season: "autumn", holiday: "thanksgiving" });
    el._note(s, { kind: "rain_walk", steps: 8000 });
    localStorage.removeItem(`hatch-welcomed-${me}`);
    el._moment(s, { type: "friend_home", weather: "wet", at: new Date().toISOString() });
    const out = s.queue.map((q) => q.text);
    s.queue = [];
    return out;
  }, me);
  // Asleep, queued lines wait (they're said once on the server's side); only a
  // question is dropped. The sleepy hello is said straight away.
  const asleepQueue = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const was = s.asleep;
    s.asleep = true;
    s.queue = [{ text: "can I call you sunbeam? ♥", ms: 4000 }];
    s.sayUntil = 0;
    el._sayQueued(s);
    const kept = s.queue.length;
    el._note(s, { kind: "up_early" });
    const hello = s.bubble.textContent;
    s.asleep = was;
    s.queue = [];
    return { kept, hello };
  });
  check("asleep, lines wait and the sleepy hello is said", asleepQueue.kept === 1 &&
    asleepQueue.hello === "mmh... you're up before the sun... zzz ♥", JSON.stringify(asleepQueue));
  // The first look: welcome home first, three lines at most; a closed wish isn't said.
  const look = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    const stageId = s.ids["sensor.life_stage"];
    const careId = s.ids["sensor.last_care"];
    const real = el._hass.states;
    const now = new Date().toISOString();
    const fake = { ...real,
      [stageId]: { ...real[stageId], attributes: { ...real[stageId].attributes,
        dream: { kind: "flying" }, wish: { kind: "play", granted: false, open: false } } },
      [careId]: real[careId] };
    el._hass = { ...el._hass, states: fake };
    // The arrival came over the channel while the card was closed.
    const kept = { moments: s.privateMoments, seen: s.privateSeen };
    s.privateMoments = [];
    s.privateSeen = new Set();
    el._keepMoment(s, { type: "friend_home", weather: "cold", at: now });
    for (const k of Object.keys(localStorage)) {
      if (/^hatch-(dream|wish|welcomed)-/.test(k)) localStorage.removeItem(k);
    }
    localStorage.setItem(`hatch-seen-${s.ids.device}`, String(Date.now() - 5 * 3600 * 1000));
    s.lookedFirst = false; s.queue = [];
    el._firstLook(s);
    const out = s.queue.map((q) => q.text);
    s.queue = [];
    el._hass = { ...el._hass, states: real };
    s.privateMoments = kept.moments;
    s.privateSeen = kept.seen;
    return out;
  }, me);
  check("the first look: welcome first, three lines at most, no closed wish",
    look.length === 3 && look[0].startsWith("welcome home") && look[1] === "brr, it looks cold out there!" &&
    !look.some((l) => /play a game/.test(l)), look.join(" | "));
  check("the new private lines read right", lines[0] === "i dreamed about the sea, like you said! ♥" &&
    lines[1] === "i dreamed about the sea..." && lines[2] === "oh, sunny after all! good guess though ♥" &&
    lines[3] === "back from the gym! so strong!" && lines[4] === "Thanksgiving in your favourite season! ♥" &&
    /rain/.test(lines[5]) && lines[7] === "it's wet out there! come get cozy ☂", lines.join(" | "));
  check("a friend coming home is cheered, and nobody else's arrival on a personal card",
    /^(you're home!! ♥|yay, you're back! ♥)$/.test(cheers.out[0]) && cheers.out[1] === "" && cheers.out[2] === "",
    cheers.out.join(" | "));

  // Idle life: something small happens on its own within a minute.
  const idleSign = () => cur().evaluate((slide) => {
    const pet = slide.querySelector(".pet");
    return ["look", "wander-l", "wander-r", "perk"].find((c) => pet.classList.contains(c)) ||
      (slide.querySelector(".speck") && "speck") ||
      (/_(?!content|excited|cozy|bored|sleepy|hungry|dirty|sick|asleep|calling)[a-z_]+_\d\.png/
        .test(pet.getAttribute("src") || "") && "pose") || "";
  });
  // A question from the visit holds the bubble for a minute (no idle chatter over
  // it): note it, and take it away for this check.
  const hadQuestion = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const asked = !!s.screen.querySelector(".askday") || (s.queue || []).some((q) => q.then);
    el._clearAsk(s);
    s.sayUntil = 0;
    return asked;
  });
  console.log(`note: a question was ${hadQuestion ? "" : "not "}open before the idle check`);
  // A call (a need, a whine, the lonely call at low happiness) keeps idle life
  // away by design, and the card reads it from binary_sensor.calling, not the
  // mood: whatever the pet's stats have drifted to by now, show it content and
  // not calling for this check, as if it had been answered (the integration's
  // next update, minutes away, puts the real state back).
  await calm();
  await page.waitForTimeout(800);
  const quietBubble = await bubble();
  let idle = "";
  // The first idle move is due 10-35 s in, but it's skipped if the pet is busy
  // then (the greeting's bubble, a call), and the next is 20-45 s later: allow
  // 90 s rather than the 56 s that a skipped first move could overrun.
  for (let i = 0; i < 225 && !idle; i++) {
    await page.waitForTimeout(400);
    idle = await idleSign();
    const said = await bubble();
    const reason = await evaluate((id) =>
      document.querySelector("home-assistant").hass.states[id].attributes.reason, pet["sensor.mood"]);
    // A new line that isn't the greeting or the pet's usual mood line.
    if (!idle && said && said !== quietBubble && said !== reason && !said.includes(USER.name)) {
      idle = `says "${said}"`;
    }
  }
  // If not: why the pet wasn't free for it.
  const busy = idle ? "" : await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const left = (at) => Math.round(((at || 0) - Date.now()) / 1000);
    return JSON.stringify({ mood: s.moodState, asleep: s.asleep, calling: s.calling, game: !!s.game,
      say: left(s.sayUntil), pose: left(s.poseUntil), prop: left(s.propUntil), flair: left(s.flairUntil),
      moving: left(s.movingUntil), next: left(s.nextIdle), status: s.screen.classList.contains("show-status"),
      queue: (s.queue || []).length, bubble: s.bubble.textContent });
  });
  check("idle life happens by itself", !!idle, idle || busy);
  await shot("04b-idle");
  await button(2).click();
  await page.waitForTimeout(600);
  check("play offers a choice of games",
    (await cur().locator(".gpick button").count()) === 3 && await cur().locator(".gpick").isVisible());
  await shot("04a-pick");
  await cur().locator('.gpick [data-game="left_right"]').click();
  await page.waitForTimeout(400);
  let rounds = 0;
  const gameSaid = [];
  for (let r = 0; r < 5 && !(await cur().locator(".game").isHidden()); r++) {
    gameSaid.push(await cur().locator(".bubble").textContent());
    await cur().locator(r % 2 ? ".gr" : ".gl").click();
    if (r === 0) {
      // UX fix 6 (F4, F1): while the pet shows where it went the guess buttons are faded, and
      // the result is still in the bubble 1.5 s after the guess (the prompt waits for 2.5 s).
      await page.waitForTimeout(350);
      const faded = await cur().locator(".gl").evaluate((el) => Number(getComputedStyle(el).opacity));
      await page.waitForTimeout(1150);
      const held = await cur().locator(".bubble").textContent();
      check("left or right: the guess buttons fade while the pet shows where it went, and the result stays readable",
        faded <= 0.2 && /yes|nope/.test(held), `opacity ${faded}, bubble ${held}`);
      await page.waitForTimeout(400);
    } else {
      await page.waitForTimeout(1400);
    }
    rounds++;
  }
  const moodLine = await evaluate((id) => document.querySelector("home-assistant").hass.states[id]?.attributes.reason || "",
    pet["sensor.mood"]);
  check("a game keeps the bubble for its own lines",
    gameSaid.length === 5 && gameSaid.every((x) => x && x !== moodLine && /left|right|yes|nope|again/.test(x)),
    gameSaid.join(" | "));
  await page.waitForTimeout(800);
  const log = await evaluate((id) => document.querySelector("home-assistant").hass.states[id].attributes.log, pet["sensor.last_care"]);
  check("the game plays five rounds", rounds === 5 && log?.[0]?.action === "game",
    `${rounds} rounds, last care ${log?.[0]?.action}/${log?.[0]?.result}`);
  await shot("04-game-over");

  // Higher or Lower: guess from the number on show, the odds way round.
  await skip(page, 3500); // let the last game's line clear
  await button(2).click();
  await page.waitForTimeout(600);
  await cur().locator('.gpick [data-game="higher_lower"]').click();
  await page.waitForTimeout(1200);
  let hlRounds = 0;
  const numbers = [];
  for (let r = 0; r < 5 && !(await cur().locator(".game").isHidden()); r++) {
    const shown = Number(await cur().locator(".gnum").getAttribute("data-n"));
    numbers.push(shown);
    if (r === 2) {
      await shot("04c-higher-lower");
      // UX fix 6 (F2): the number card sits clear of the pet, so its face shows all game.
      const clear = await cur().locator(".gnum").evaluate((num) => {
        const a = num.getBoundingClientRect();
        const b = num.getRootNode().querySelector(".pet").getBoundingClientRect();
        return { clear: a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
          num: [a.left, a.top, a.right, a.bottom].map(Math.round), pet: [b.left, b.top, b.right, b.bottom].map(Math.round) };
      });
      check("higher or lower: the number card doesn't cover the pet", clear.clear, JSON.stringify(clear));
    }
    await cur().locator(shown > 5 ? ".gl" : ".gr").click();
    await page.waitForTimeout(1400);
    hlRounds++;
  }
  await page.waitForTimeout(800);
  const hlLog = await evaluate((id) => document.querySelector("home-assistant").hass.states[id].attributes.log, pet["sensor.last_care"]);
  check("higher or lower plays five rounds from a number",
    hlRounds === 5 && numbers.every((n) => n >= 1 && n <= 9) && hlLog?.[0]?.game === "higher_lower",
    `${hlRounds} rounds, numbers ${numbers.join(" ")}, last care ${hlLog?.[0]?.game}/${hlLog?.[0]?.result} ${hlLog?.[0]?.score}`);
  check("the picker remembers the last game",
    await evaluate(() => localStorage.getItem("hatch-last-game")) === "higher_lower");

  // Catch is gone: a YAML experimental_catch: true in an old card config is ignored
  // harmlessly. It stays on for the sections below, which must not notice.
  await skip(page, 3500);
  await page.locator("hatch-pet-card").evaluate((el) => el.setConfig({ ...el._config, experimental_catch: true }));
  await inject(pet["sensor.energy"], { state: "80" }); // the card turns play down when tired
  await page.waitForTimeout(800);
  await button(2).click();
  await page.waitForTimeout(600);
  check("experimental_catch: true is ignored: the picker keeps its three games, no catch",
    (await cur().locator(".gpick button").count()) === 3 && (await cur().locator('.gpick [data-game="catch"]').count()) === 0);
  await cur().locator(".gx").click();
  await page.waitForTimeout(300);
  // 3a. Reduced motion: the pet's src stays one still picture, even in a game. Time is
  // moved, never waited for.
  {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await skip(page, 4500); // the last result line clears
    await inject(pet["sensor.energy"], { state: "80" });
    await page.waitForTimeout(500);
    await button(2).click();
    await page.waitForTimeout(500);
    await cur().locator('.gpick [data-game="left_right"]').click();
    await page.waitForTimeout(600);
    check("3a: a game under reduced motion opens with no prop showing",
      await card.evaluate((el) => { const s = el._slides[el._index]; return s.game?.kind === "left_right" && s.propEl.hidden; }));
    await page.locator("hatch-pet-card").evaluate((el) => {
      el._endGame(el._slides[el._index], "");
    });
    // A still picture: src stable over 5 ticks, one swap on a mood change, ending _1.
    await page.waitForTimeout(1500);
    const srcOf = () => card.evaluate((el) => el._slides[el._index].pet.getAttribute("src"));
    const ticks = async (n) => {
      const out = [];
      for (let i = 0; i < n; i++) { await card.evaluate((el) => el._tick()); out.push(await srcOf()); }
      return out;
    };
    const still = await ticks(5);
    check("3a: with reduced motion the pet's src is the same over 5 ticks",
      new Set(still).size === 1 && /_1\.png/.test(still[0]), JSON.stringify(still));
    await inject(pet["sensor.mood"], { state: "hungry", attributes: { flags: ["hungry"], requests: [] } });
    await page.waitForTimeout(1200);
    const moved = await ticks(5);
    check("3a: a mood change swaps the still frame once, and it ends in _1",
      new Set(moved).size === 1 && moved[0] !== still[0] && /_1\.png/.test(moved[0]), JSON.stringify({ still: still[0], moved }));
    await inject(pet["sensor.mood"], { state: "content", attributes: { flags: [], requests: [] } });
    await page.waitForTimeout(1200);
    const calmAfter = await card.evaluate((el) => {
      const s = el._slides[el._index];
      return { frames: el._frames(s).length };
    });
    check("3a: calm _frames() returns one frame", calmAfter.frames === 1, JSON.stringify(calmAfter));
    const guard = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8")
      .split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("prefers-reduced-motion"));
    check("3a: 'prefers-reduced-motion' appears only in calm() and CSS @media rules",
      guard.length >= 2 && /matchMedia/.test(guard[0][1]) && guard.slice(1).every(([, l]) => /^\s*@media/.test(l)), JSON.stringify(guard));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(1000);
  }

  await unpinAwake(card);
  }
  if (enter("resume")) {
  // 3a. Games carry on (Wave 1 PR 1a): stopping a game and reopening it within
  // the server's window picks up the same round and wins; old timers die with
  // their game.
  {
    const score = () => cur().locator(".gscore").innerText();
    const open = async (kind) => {
      await inject(pet["sensor.energy"], { state: "80" });
      await page.waitForTimeout(500);
      await button(2).click();
      await page.waitForTimeout(500);
      await cur().locator(`.gpick [data-game="${kind}"]`).click();
      await page.waitForTimeout(1000);
    };
    const stop = async () => {
      await cur().locator(".gx").click();
      await page.waitForTimeout(300);
    };
    await skip(page, 4500); // let the result line clear
    for (const kind of ["left_right", "higher_lower"]) {
      await open(kind);
      const fresh = await score();
      await cur().locator(".gl").click();
      await page.waitForTimeout(1400);
      const played = await score();
      const number = await cur().locator(".gnum").getAttribute("data-n");
      await stop();
      await open(kind);
      const back = await score();
      check(`${kind}: a fresh game reads round 1 of 5`, /^round 1\/5/.test(fresh), fresh);
      // The x ends the game on the server too (play_game end): reopened, it is
      // a fresh game, and the next guess is round 1 with no "someone else".
      check(`${kind}: after the x, reopening starts a fresh game (round 1 of 5)`,
        /^round 1\/5/.test(back) && back === fresh, `${played} -> ${back}`);
      await cur().locator(".gl").click();
      await page.waitForTimeout(1400);
      const again = await score();
      check(`${kind}: the first guess after the x is round 1 of the new game, no blame`,
        /^round 2\/5/.test(again) && !/someone else/.test(await page.locator("hatch-pet-card").evaluate((el) => el._slides[el._index].bubble.textContent)),
        again);
      await stop();
    }

    // Stop inside the 900 ms window and start again: the new game is untouched.
    await open("higher_lower");
    await cur().locator(".gl").click();
    await page.waitForTimeout(300);
    await stop();
    check("stopping a game clears its timers",
      await page.locator("hatch-pet-card").evaluate((el) => el._slides[el._index].gameTimers.size === 0));
    await button(2).click();
    await page.waitForTimeout(400);
    await cur().locator('.gpick [data-game="higher_lower"]').click();
    await page.waitForTimeout(1500);
    const fresh2 = await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      return { busy: s.game?.busy, score: s.gameScore.textContent, timers: s.gameTimers.size };
    });
    check("a game started inside the old window is untouched",
      fresh2.busy === false && /^round \d\/5 · \d right$/.test(fresh2.score) && fresh2.timers === 0,
      JSON.stringify(fresh2));
    await stop();

    // A game closed during a pending guess throws nothing.
    const errorsBefore = errors.length;
    await open("left_right");
    await cur().locator(".gl").click();
    await page.locator("hatch-pet-card").evaluate((el) => { const s = el._slides[el._index]; el._endGame(s, null); });
    await page.waitForTimeout(1600);
    check("a game closed during a pending guess throws nothing", errors.length === errorsBefore,
      errors.slice(errorsBefore).join(" | "));

    // Close and reopen inside 900 ms (left or right): the old game's guess timer dies
    // with it, so nothing fires on the new game and nothing throws.
    const errorsReopen = errors.length;
    await open("left_right");
    await cur().locator(".gl").click();
    const timersLeft = await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      const before = s.gameTimers?.size || 0;
      el._endGame(s, null);
      return { before, after: s.gameTimers?.size || 0 };
    });
    await page.waitForTimeout(100);
    await button(2).click();
    await page.waitForTimeout(300);
    await cur().locator('.gpick [data-game="left_right"]').click();
    await page.waitForTimeout(1500);
    check("a game reopened inside 900 ms: the old guess timer died and nothing throws",
      timersLeft.after === 0 && errors.length === errorsReopen, JSON.stringify(timersLeft) + errors.slice(errorsReopen).join(" | "));
    await stop();

    // Fresh eyes #1+#2: a game the server dropped for idling. Left/Right: the guess
    // began a new game (restarted: true), adopted as its round 1, no blame. Higher or
    // Lower: no_game (never logged), said by the card itself. Replies stubbed.
    const idle = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const hass = el._hass;
      const real = hass.callService;
      const reply = (response) => { hass.callService = async () => ({ response }); };
      const out = {};
      try {
        s.game = { kind: "left_right", round: 2, wins: 1, busy: false };
        el._gameView(s, "left_right");
        reply({ result: "ok", game: "left_right", round: 1, rounds: 5, wins: 1, done: false,
          went: "left", correct: true, restarted: true });
        await el._guess(s, "left");
        out.lr = { live: !!s.game, round: s.game?.round, wins: s.game?.wins, said: s.bubble.textContent,
          score: s.gameScore.textContent };
        el._endGame(s, null);
        s.game = { kind: "higher_lower", round: 1, wins: 0, busy: false };
        el._gameView(s, "higher_lower");
        reply({ result: "no_game" });
        await el._guess(s, "right");
        out.hl = { live: !!s.game, said: s.bubble.textContent, busy: s.game?.busy };
        // F13: the line comes true: a new game of the same kind starts after it.
        reply({ result: "ok", game: "higher_lower", round: 0, rounds: 5, wins: 0, number: 4, done: false });
        await new Promise((r) => setTimeout(r, 1900));
        out.hl2 = { kind: s.game?.kind, round: s.game?.round, number: s.gameNum.dataset.n, busy: s.game?.busy };
      } finally {
        hass.callService = real;
        if (s.game) el._endGame(s, null);
      }
      return out;
    });
    check("idle drop, Left/Right: a restarted game is adopted as its round 1, no someone-else line",
      idle.lr.live && idle.lr.round === 1 && idle.lr.wins === 1 && idle.lr.said === "yes! you found me" &&
        idle.lr.score === "round 1/5 · 1 right", JSON.stringify(idle.lr));
    check("idle drop, Higher/Lower: no_game says let's start over, ignores taps, then starts a new game",
      idle.hl.live && idle.hl.busy && idle.hl.said === "let's start over" &&
        idle.hl2.kind === "higher_lower" && idle.hl2.round === 0 && idle.hl2.number === "4" && !idle.hl2.busy,
      JSON.stringify(idle.hl) + JSON.stringify(idle.hl2));

    // Berry dig (playtime 2a): the per-tap contract, with stubbed replies (the
    // pytest owns the odds). A berry isn't a round; a bee and a keep end one; keep
    // is disabled on an empty basket and sends nothing; a reply out of step is
    // someone else; the x sends end (which parks it on the server). The card's own
    // _playCall is stubbed on the instance: the waits between taps let HA hand the
    // card a fresh hass, which would bring back the real callService.
    const dig = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const sent = [];
      const base = { result: "ok", game: "dig", rounds: 5, win_at: 5, done: false };
      const queue = [];
      el._playCall = async (x, data) => {
        sent.push(data);
        const info = queue.shift();
        if (x.game && info?.result !== "ok") el._endGame(x, "not now");
        return x.game && info?.result === "ok" ? info : null;
      };
      const keep = () => s.gameBox.querySelector(".gl").getAttribute("aria-disabled");
      const out = {};
      // The plain lines here: no watcher (E5 D-a), no shiny berry (D-b), no type line (G-c).
      const realSeen = el._visitSeen;
      const realRandom = Math.random;
      el._visitSeen = () => null;
      Math.random = () => 0.5;
      try {
        s.game = { picking: true };
        queue.push({ ...base, round: 0, wins: 0, basket: 0, leaves: 8 });
        await el._pickGame(s, "dig");
        out.start = { keep: keep(), num: s.gameNum.dataset.n, score: s.gameScore.textContent, said: s.bubble.textContent,
          labels: [...s.gameBox.querySelectorAll(".gl, .gr")].map((b) => b.getAttribute("aria-label")) };
        await el._guess(s, "left"); // keep on an empty basket: nothing sent
        out.emptyKeep = sent.length;
        out.emptySaid = s.bubble.textContent; // F12: it says so, then asks again after 2 s
        await new Promise((r) => setTimeout(r, 2100));
        out.emptyAfter = s.bubble.textContent;
        queue.push({ ...base, round: 0, wins: 0, basket: 1, leaves: 7, found: "berry", round_over: false });
        await el._guess(s, "right");
        out.berry = { round: s.game.round, basket: s.game.basket, num: s.gameNum.dataset.n, said: s.bubble.textContent,
          score: s.gameScore.textContent, guess: sent.at(-1)?.guess };
        await new Promise((r) => setTimeout(r, 400));
        out.berryKeep = keep();
        // F1: the result is still in the bubble at 1.5 s, and the prompt is back by 2.8 s.
        await new Promise((r) => setTimeout(r, 1100));
        out.berryHeld = s.bubble.textContent;
        await new Promise((r) => setTimeout(r, 1300));
        out.berryPrompt = s.bubble.textContent;
        queue.push({ ...base, round: 1, wins: 1, basket: 0, leaves: 8, found: "kept", round_over: true });
        await el._guess(s, "left");
        out.kept = { round: s.game.round, wins: s.game.wins, said: s.bubble.textContent, guess: sent.at(-1)?.guess };
        await new Promise((r) => setTimeout(r, 1000));
        queue.push({ ...base, round: 2, wins: 1, basket: 0, leaves: 8, found: "bee", round_over: true });
        await el._guess(s, "right");
        out.bee = { round: s.game.round, wins: s.game.wins, said: s.bubble.textContent, prop: !s.propEl.hidden };
        await new Promise((r) => setTimeout(r, 1000));
        out.afterBee = { prop: !s.propEl.hidden, said: s.bubble.textContent, keep: keep() };
        await new Promise((r) => setTimeout(r, 1700));
        out.beePrompt = s.bubble.textContent;
        out.quitLine = [el._quitLine(s), el._quitLine({ game: { kind: "dig", round: 0, wins: 0, basket: 0 } }),
          el._quitLine({ game: { kind: "left_right", round: 2, wins: 1 } })];
        const hass = el._hass;
        const real = hass.callService;
        hass.callService = async (d, svc, data) => { out.end = data; return { response: {} }; };
        try {
          el._quitGame(s, null);
        } finally {
          hass.callService = real;
        }
        out.numLabel = s.gameNum.getAttribute("aria-label");
        // A reply out of step (a berry while we think the basket holds 0, banked 2).
        s.game = { picking: true };
        queue.push({ ...base, round: 2, wins: 1, basket: 0, leaves: 8 });
        s.greeted = false; // F7: playing together is the hello
        await el._pickGame(s, "dig");
        out.resume = s.bubble.textContent; // F8: a parked dig carried on says so
        out.greeted = s.greeted;
        queue.push({ ...base, round: 2, wins: 1, basket: 3, leaves: 5, found: "berry", round_over: false });
        await el._guess(s, "right");
        out.stray = { live: !!s.game, said: s.bubble.textContent };
        // A won game ends with the berries banked, no "/5".
        s.game = { picking: true };
        queue.push({ ...base, round: 2, wins: 3, basket: 1, leaves: 7 });
        await el._pickGame(s, "dig");
        queue.push({ ...base, round: 3, wins: 4, basket: 0, leaves: 8, found: "kept", round_over: true });
        await el._guess(s, "left");
        await new Promise((r) => setTimeout(r, 1000));
        queue.push({ ...base, round: 3, wins: 4, basket: 1, leaves: 7, found: "berry", round_over: false });
        await el._guess(s, "right");
        await new Promise((r) => setTimeout(r, 400));
        queue.push({ ...base, round: 4, wins: 5, basket: 0, leaves: 8, found: "kept", round_over: true, done: true, won: true });
        await el._guess(s, "left");
        await new Promise((r) => setTimeout(r, 2100)); // the last result is read first (1.8 s)
        out.won = { live: !!s.game, said: s.bubble.textContent };
      } finally {
        delete el._playCall;
        if (s.game) el._endGame(s, null);
        el._visitSeen = realSeen;
        Math.random = realRandom;
      }
      return out;
    });
    check("dig: a fresh pile reads 8 leaves, round 1, keep disabled, its prompt and labels",
      dig.start.keep === "true" && dig.start.num === "8" && dig.start.score === "round 1/5\n0 banked · basket 0" &&
        dig.start.said === "dig or keep?" && dig.start.labels.join("|") === "Keep the basket|Dig a leaf",
      JSON.stringify(dig.start));
    check("dig: keep on an empty basket sends nothing", dig.emptyKeep === 1, String(dig.emptyKeep));
    check("dig: keep on an empty basket says dig first, then asks again",
      dig.emptySaid === "dig first! the basket's empty" && dig.emptyAfter === "dig or keep?", JSON.stringify([dig.emptySaid, dig.emptyAfter]));
    check("dig: the result stays in the bubble at 1.5 s, the prompt is back after",
      dig.berryHeld === "a berry!" && dig.berryPrompt === "dig or keep?", JSON.stringify([dig.berryHeld, dig.berryPrompt]));
    check("dig: a ✕ that parks says so; a fresh pile or another game says maybe later; the resume says it's back; playing is the hello",
      dig.quitLine.join("|") === "ok! i'll keep our pile safe ♪|maybe later!|maybe later!" &&
        dig.resume === "we're back! dig or keep ♪" && dig.greeted === true, JSON.stringify([dig.quitLine, dig.resume, dig.greeted]));
    check("dig: a berry is not a round (round 0, basket 1, 7 leaves), keep enabled after",
      dig.berry.round === 0 && dig.berry.basket === 1 && dig.berry.num === "7" && dig.berry.guess === "dig" &&
        dig.berry.said === "a berry!" && dig.berryKeep === "false", JSON.stringify(dig.berry) + dig.berryKeep);
    check("dig: a keep banks the basket and ends the round",
      dig.kept.round === 1 && dig.kept.wins === 1 && dig.kept.guess === "keep" && dig.kept.said === "safe in the basket ♪",
      JSON.stringify(dig.kept));
    // Fresh-expand E5: the lucky number (G-b), the type's line after the count (G-c), the
    // shiny berry (D-b), the dig's watcher (D-a) and the game of the day leading (G-a).
    {
      const src5 = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
      const lit = (name) => require("vm").runInNewContext(src5.match(new RegExp(`\\nconst ${name} = ("[^"\\n]*");`))[1]);
      const [LUCKY, SHINY] = [lit("LUCKY_LINE"), lit("SHINY_LINE")];
      const play5 = require("vm").runInNewContext(`(${src5.match(/\nconst VISITOR_PLAY = (\{[\s\S]*?\n\});/)[1]})`);
      const worlds5 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
      // Each world's first walking day visitor (by name), for D-a.
      const walkers = Object.fromEntries(Object.entries(worlds5).map(([w, x]) =>
        [w, (x.visitors || []).find((v) => play5[v.id]?.walk && v.hours !== "night")?.name || null]));
      const e5 = await card.evaluate(async (el, walkers) => {
        const s = el._slides[el._index];
        const base = { result: "ok", rounds: 5, win_at: 5, done: false };
        const queue = [];
        el._playCall = async (x) => (x.game ? queue.shift() : null);
        const real = { seen: el._visitSeen, random: Math.random, persona: el._persona, line: el._line };
        const out = {};
        try {
          el._visitSeen = () => null;
          Math.random = () => 0.5;
          // G-b: the opening number is the lucky one (the real roll; hush pins it to 0).
          delete el._lucky;
          const lucky = el._lucky(s);
          s.game = { picking: true };
          queue.push({ ...base, game: "higher_lower", round: 0, wins: 0, number: lucky });
          await el._pickGame(s, "higher_lower");
          out.lucky = { said: s.bubble.textContent, score: s.gameScore.textContent, n: s.gameNum.dataset.n };
          await new Promise((r) => setTimeout(r, 1700));
          out.luckyAfter = s.bubble.textContent;
          el._endGame(s, null);
          // G-c: a won game's end is the count line, then the type's line 4 s on (random 0).
          const said = [];
          el._line = function (sl, cls, text, ...rest) { said.push(text); return real.line.call(this, sl, cls, text, ...rest); };
          el._persona = () => ({ game_win: ["a winning show! ★"], game_lose: ["bravo, both of us ★"] });
          s.game = { picking: true };
          queue.push({ ...base, game: "left_right", round: 4, wins: 4 });
          await el._pickGame(s, "left_right");
          Math.random = () => 0;
          queue.push({ ...base, game: "left_right", round: 5, wins: 5, correct: true, went: "left", done: true, won: true });
          await el._guess(s, "left");
          await new Promise((r) => setTimeout(r, 2100)); // the last result is read first (1.8 s)
          out.count = s.bubble.textContent;
          await new Promise((r) => setTimeout(r, 4200));
          out.typeLine = said.slice();
          el._line = real.line;
          el._persona = real.persona;
          // D-b: random 0 on a berry is the shiny one; the basket is the server's, as for any berry.
          s.game = { picking: true };
          queue.push({ ...base, game: "dig", round: 0, wins: 0, basket: 0, leaves: 8 });
          Math.random = () => 0.5;
          await el._pickGame(s, "dig");
          Math.random = () => 0;
          queue.push({ ...base, game: "dig", round: 0, wins: 0, basket: 1, leaves: 7, found: "berry", round_over: false });
          await el._guess(s, "right");
          out.shiny = { said: s.bubble.textContent, basket: s.game?.basket };
          el._endGame(s, null);
          Math.random = () => 0.5;
          // D-a: a walking day visitor seen here today watches; a tap on dig still lands.
          const walker = walkers[s.worldKey] ? { name: walkers[s.worldKey] } : null;
          el._visitSeen = () => walker?.name || null;
          s.screen.classList.remove("night", "dim");
          s.game = { picking: true };
          queue.push({ ...base, game: "dig", round: 0, wins: 0, basket: 0, leaves: 8 });
          await el._pickGame(s, "dig");
          const w = s.gameBox.querySelector(".gwatch");
          const gr = s.gameBox.querySelector(".gr").getBoundingClientRect();
          const hit = el.shadowRoot.elementFromPoint(gr.left + gr.width / 2, gr.top + gr.height / 2);
          out.watch = { on: !!w, who: w?.dataset.visitor, said: s.bubble.textContent, hit: hit?.closest?.(".gr") ? "gr" : hit?.className,
            walker: walker?.name };
          el._endGame(s, null);
          out.watchGone = !s.gameBox.querySelector(".gwatch");
          s.screen.classList.add("night");
          s.game = { picking: true };
          queue.push({ ...base, game: "dig", round: 0, wins: 0, basket: 0, leaves: 8 });
          await el._pickGame(s, "dig");
          out.dark = !!s.gameBox.querySelector(".gwatch");
          el._endGame(s, null);
          s.screen.classList.remove("night");
          // G-a: the picker leads with the game of the day.
          s.game = null;
          el._startGame(s, s.buttons.play);
          out.today = el._gameOfDay(s);
          out.order = [...s.gameBox.querySelectorAll(".gpick button")].map((b) => b.dataset.game);
          el._endGame(s, null);
        } finally {
          delete el._playCall;
          if (s.game) el._endGame(s, null);
          Object.assign(el, { _visitSeen: real.seen, _persona: real.persona, _line: real.line, _lucky: () => 0 });
          Math.random = real.random;
        }
        return out;
      }, walkers);
      check("fresh E5 (G-a): the picker leads with the pet's game of the day", e5.order?.[0] === e5.today && e5.order.length === 3,
        JSON.stringify([e5.today, e5.order]));
      check("fresh E5 (G-b): the lucky number opening a game says its line, then the prompt; the score is untouched",
        e5.lucky.said === LUCKY && e5.lucky.score === "round 1/5 · 0 right" && e5.luckyAfter !== LUCKY, JSON.stringify(e5.lucky) + e5.luckyAfter);
      check("fresh E5 (G-c): a won game ends on the count line, then the type's line 4 s later",
        e5.count === "5/5! you win ♪" && e5.typeLine.includes("a winning show! ★"), JSON.stringify([e5.count, e5.typeLine]));
      check("fresh E5 (D-b): random 0 on a berry is the shiny one; the basket is the server's (1)",
        e5.shiny.said === SHINY && e5.shiny.basket === 1, JSON.stringify(e5.shiny));
      check("fresh E5 (D-a): today's walking visitor watches a dig on a day screen, a dig tap still lands, gone after; none when dark",
        !e5.watch.walker || (e5.watch.on && e5.watch.said.includes(e5.watch.walker) && e5.watch.hit === "gr" && e5.watchGone && !e5.dark),
        JSON.stringify({ watch: e5.watch, gone: e5.watchGone, dark: e5.dark }));
    }
    check("dig: a bee ends the round, shows the bee, then asks again with keep disabled",
      dig.bee.round === 2 && dig.bee.wins === 1 && dig.bee.prop && dig.bee.said === "bzz! the berries rolled away" &&
        !dig.afterBee.prop && dig.afterBee.said === "bzz! the berries rolled away" && dig.afterBee.keep === "true" &&
        dig.beePrompt === "dig or keep?",
      JSON.stringify([dig.bee, dig.afterBee, dig.beePrompt]));
    check("dig: the x sends end for the dig (the server parks it), and the pile's label goes",
      dig.end?.game === "dig" && dig.end?.end === true && dig.numLabel === null, JSON.stringify([dig.end, dig.numLabel]));
    check("dig: a reply out of step ends the game as someone else's",
      !dig.stray.live && dig.stray.said === "oh! someone else is playing with me", JSON.stringify(dig.stray));
    check("dig: a won game says the berries banked, no /5",
      !dig.won.live && dig.won.said === "5 berries! you win ♪", JSON.stringify(dig.won));

    // Replies across screens (audit s2616 #8/#9), stubbed with no waits: keep on a
    // basket another screen kept first is someone else; no game while this person's
    // dig is parked (another screen's x) is "maybe later!", not "let's start over".
    const across = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const hass = el._hass;
      const real = hass.callService;
      const out = {};
      try {
        for (const [key, response] of [["empty", { result: "empty_basket" }],
          ["parked", { result: "no_game", parked: true }]]) {
          s.game = { kind: "dig", round: 1, wins: 0, basket: 2, busy: false };
          el._gameView(s, "dig");
          hass.callService = async () => ({ response });
          await el._guess(s, key === "empty" ? "left" : "right");
          out[key] = { live: !!s.game, said: s.bubble.textContent };
        }
      } finally {
        hass.callService = real;
        if (s.game) el._endGame(s, null);
      }
      return out;
    });
    check("dig: empty_basket from another screen's keep says someone else is playing",
      !across.empty.live && across.empty.said === "oh! someone else is playing with me", JSON.stringify(across.empty));
    check("dig: no game while this person's dig is parked says maybe later",
      !across.parked.live && across.parked.said === "maybe later!", JSON.stringify(across.parked));

    // The real server: one dig, the x, and reopening carries on (parked).
    {
      await open("dig");
      await cur().locator(".gr").click();
      await page.waitForTimeout(1400);
      const played = await score();
      await stop();
      await open("dig");
      const back = await score();
      check("dig: after the x, reopening carries on from the parked pile",
        /^round \d\/5\n\d+ banked · basket \d$/.test(played) && back === played, `${played} -> ${back}`);
      await stop();
    }

    // Batch 6 audit #4: after an HA restart the server's dropped-games memory is gone,
    // so a stale guess's round-1 reply has no `restarted` flag. Round 1 past round 0
    // still means a new game: adopted quietly.
    const noFlag = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const hass = el._hass;
      const real = hass.callService;
      try {
        s.game = { kind: "left_right", round: 3, wins: 2, busy: false };
        el._gameView(s, "left_right");
        hass.callService = async () => ({ response: { result: "ok", game: "left_right", round: 1, rounds: 5,
          wins: 0, done: false, went: "right", correct: false } });
        await el._guess(s, "left");
        return { live: !!s.game, round: s.game?.round, said: s.bubble.textContent };
      } finally {
        hass.callService = real;
        if (s.game) el._endGame(s, null);
      }
    });
    check("a round-1 reply without `restarted` is adopted quietly, no someone-else line",
      noFlag.live && noFlag.round === 1 && !/someone else/.test(noFlag.said), JSON.stringify(noFlag));

    // Batch 6 audit #5: a Left/Right game left idle is closed by the card itself after
    // GAME_IDLE_MINUTES (3), silently, with no server call. Faked clock.
    const idleClose = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const realNow = Date.now;
      const hass = el._hass;
      const real = hass.callService;
      let calls = 0;
      hass.callService = async (...a) => { calls++; return real.apply(hass, a); };
      try {
        s.game = { kind: "left_right", round: 1, wins: 0, busy: false, prompt: "again! left or right?",
          lastAt: realNow.call(Date) };
        el._gameView(s, "left_right");
        Date.now = () => realNow.call(Date) + 2 * 60 * 1000;
        el._renderSlide(s);
        const at2 = !!s.game;
        Date.now = () => realNow.call(Date) + 3 * 60 * 1000 + 1000;
        el._renderSlide(s);
        return { at2, at3: !!s.game, hidden: s.gameBox.hidden, calls };
      } finally {
        Date.now = realNow;
        hass.callService = real;
        if (s.game) el._endGame(s, null);
      }
    });
    check("an idle Left/Right game stays at 2 min and closes silently at 3 min, no server call",
      idleClose.at2 && !idleClose.at3 && idleClose.hidden && idleClose.calls === 0, JSON.stringify(idleClose));
    // UX fix 6 (Q8): a dig left idle is closed by the card with its own line (no auto-park).
    const idleDig = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const realNow = Date.now;
      try {
        s.game = { kind: "dig", round: 1, wins: 0, basket: 1, busy: false, prompt: "dig or keep?", lastAt: realNow.call(Date) };
        el._gameView(s, "dig");
        Date.now = () => realNow.call(Date) + 3 * 60 * 1000 + 1000;
        el._renderSlide(s);
        return { live: !!s.game, said: s.bubble.textContent };
      } finally {
        Date.now = realNow;
        if (s.game) el._endGame(s, null);
      }
    });
    check("an idle dig closes with \"let's dig another time\"", !idleDig.live && idleDig.said === "let's dig another time ♪", JSON.stringify(idleDig));

    // Batch 6 audit #1: a tap on the scene mid-game keeps the game; Status ends it.
    await open("left_right");
    await cur().locator(".gl").waitFor();
    await page.waitForTimeout(500);
    const box = await cur().locator(".pet").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const afterTap = await card.evaluate((el) => {
      const s = el._slides[el._index];
      return { game: !!s.game, status: s.screen.classList.contains("show-status") };
    });
    check("a real tap on the pet mid-game keeps the game and opens no status",
      afterTap.game && !afterTap.status, JSON.stringify(afterTap));
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(300);
    const afterBtn = await card.evaluate((el) => {
      const s = el._slides[el._index];
      return { game: !!s.game, status: s.screen.classList.contains("show-status") };
    });
    check("the Status button mid-game still opens the sheet and ends the game",
      !afterBtn.game && afterBtn.status, JSON.stringify(afterBtn));
    if (afterBtn.status) await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(200);

    // Fresh eyes #3+#4: a game never plays unseen. Opening the status, swiping away and
    // tapping Play each end it (no prop left showing), and a game nobody tapped sends only an end.
    const gameLive = () => card.evaluate(async (el) => {
      const s = el._slides[el._index];
      for (let w = 0; w < 300 && !s.game; w++) await new Promise((r) => requestAnimationFrame(r));
      return s.game?.kind === "left_right" && !s.game.picking;
    });
    await open("left_right");
    const statusLive = await gameLive();
    const statusEnd = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      el._toggleStatus(s);
      const out = { game: !!s.game, prop: !s.propEl.hidden };
      await new Promise((r) => setTimeout(r, 300));
      el._toggleStatus(s);
      return out;
    });
    check("opening the status mid-game ends the game and hides the prop",
      statusLive && !statusEnd.game && !statusEnd.prop, `${statusLive} ${JSON.stringify(statusEnd)}`);
    await open("left_right");
    const playLive = await gameLive();
    await button(2).click();
    await page.waitForTimeout(400);
    const playEnd = await card.evaluate((el) => {
      const s = el._slides[el._index];
      return { picking: !!s.game?.picking, prop: !s.propEl.hidden };
    });
    check("Play mid-game ends the game: the picker, and no prop over it",
      playLive && playEnd.picking && !playEnd.prop, `${playLive} ${JSON.stringify(playEnd)}`);
    await card.evaluate((el) => el._endGame(el._slides[el._index], null));
    if (slides > 1) {
      await open("left_right");
      const swipeLive = await gameLive();
      const swipe = await card.evaluate(async (el) => {
        const back = el._index;
        const s = el._slides[back];
        el._go(back + 1);
        const out = { game: !!s.game, prop: !s.propEl.hidden };
        await new Promise((r) => setTimeout(r, 400));
        el._go(back);
        return out;
      });
      await page.waitForTimeout(800);
      check("swiping away mid-game ends the game on the slide left",
        swipeLive && !swipe.game && !swipe.prop, `${swipeLive} ${JSON.stringify(swipe)}`);
    }
    const untapped = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const calls = [];
      const real = el._hass.callService;
      el._hass.callService = (...a) => { calls.push(a[2]); return real.apply(el._hass, a); };
      try {
        s.game = { picking: true };
        el._pickGame(s, "left_right"); // started, never tapped
        await new Promise((r) => setTimeout(r, 300));
        el._quitGame(s, null);
      } finally { el._hass.callService = real; }
      return { ended: !s.game, calls: calls.map((c) => (c?.end ? "end" : c?.guess ? "guess" : "start")) };
    });
    check("a game nobody tapped sends only its end: no guess, no result",
      untapped.ended && untapped.calls.at(-1) === "end" && !untapped.calls.includes("guess"),
      JSON.stringify(untapped));

    // Fresh eyes #7: a care line said over a game's prompt gives way to the prompt again.
    await skip(page, 4500); // the result line clears
    await open("left_right");
    const prompted = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const prompt = s.bubble.textContent;
      const rnd = Math.random;
      Math.random = () => 0; // the feed line is said only half the time
      el._react(s, { action: "feed", result: "ok" }, { mine: true });
      Math.random = rnd;
      const care = s.bubble.textContent;
      s.sayUntil = Date.now() - 1; // the care line's hold runs out
      await new Promise((r) => setTimeout(r, 1600)); // a tick or two
      return { prompt, kept: s.game?.prompt, care, after: s.bubble.textContent, game: !!s.game };
    });
    check("feed mid-game: the care line, then the game's prompt again",
      prompted.game && prompted.prompt === prompted.kept && prompted.care !== prompted.prompt &&
        prompted.after === prompted.prompt, JSON.stringify(prompted));
    await stop();

    // Two viewers share one server game: a stale guess ends with the line.
    const tab = await context.newPage();
    tab.on("pageerror", (e) => errors.push(`tab 2: ${e}`));
    await tab.goto(`${HA}/pet-bench/pet`);
    await tab.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await settle(tab); // the frontend may reload itself once
    await tab.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
    await tab.waitForTimeout(1500);
    const curB = () => tab.locator("hatch-pet-card .slide:not(.away-slide)");
    // B looks at A's pet (A may have moved on to the one awake enough to play).
    const titleA = (await page.locator("hatch-pet-card .title").innerText()).trim();
    for (let i = 0; i < slides; i++) {
      if ((await tab.locator("hatch-pet-card .title").innerText()).trim() === titleA) break;
      await tab.locator("hatch-pet-card .nav.next").click();
      await tab.waitForTimeout(700);
    }
    await open("left_right"); // A: round 1 of a new game
    await curB().locator(".toy").nth(2).click();
    await tab.waitForTimeout(500);
    await curB().locator('.gpick [data-game="left_right"]').click();
    await tab.waitForTimeout(1000);
    await curB().locator(".gl").click(); // B plays a round
    await tab.waitForTimeout(1400);
    await cur().locator(".gl").click(); // A guesses from its stale round
    await page.waitForTimeout(1200);
    const said = await bubble();
    check("two viewers: a stale guess ends with the someone-else line",
      said === "oh! someone else is playing with me" && (await cur().locator(".game").isHidden()), said);
    await tab.close();
  }

  }
  if (enter("moments")) {
  await pinAwake(card, "moments");
  // A shard opens here (SHARD_STARTS) straight after the prelude's 1 h fast-forward, with
  // no play or resume section to calm the pet first: a hatchling's whine then held
  // "play with me?" over every flavour line (CI, 2026-11-01).
  await calm();
  // 4a. A kept line queued for an off-show slide: capped, and the catch-up never repeats it.
  const offShow = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const fake = Object.create(s);
    Object.assign(fake, { queue: [], privateMoments: [] });
    const base = Date.now() + 3600e3; // newer than anything said
    const iso = (n) => new Date(base + n * 1000).toISOString();
    const moments = [["bond_up", 1], ["care_miss", 2], ["first_snow", 3], ["care_miss", 4], ["tucked_in", 5], ["favourite_snack", 6]];
    const real = el._index;
    try {
      el._index = -1; // fake is never the slide on show
      for (const [type, n] of moments) el._line(fake, 3, `${type} line`, 4500, { at: iso(n), type });
    } finally { el._index = real; }
    const left = fake.queue.map((q) => q.type);
    // The catch-up skips what already waits in the queue.
    fake.privateMoments = [{ type: "favourite_snack", at: iso(6) }];
    const caught = el._catchUp(fake, 0, 3).filter(([, at]) => at === iso(6));
    return { left, caught: caught.length };
  });
  check("moments: off-show kept lines are capped to 3, newest, one care miss",
    offShow.left.length === 3 && offShow.left.filter((x) => x === "care_miss").length <= 1 &&
    !offShow.left.includes("bond_up"), JSON.stringify(offShow));
  check("moments: the catch-up skips a moment already waiting in the queue", offShow.caught === 0, JSON.stringify(offShow));
  // 4. Moments make the pet react.
  for (const [type, extra, expect] of [
    ["stage_changed", { stage: "teen", from: "child" }, "teen now"],
    ["trait_learned", { trait: "music_lover", level: 1 }, "new trait"],
    ["sunset", {}, "sun|sky"],
    ["watching", { title: "Bluey" }, "Bluey"],
    ["first_snow", {}, "first snow"],
    ["first_warm", {}, "first warm day"], // fresh-expand E12 (Se-a)
    ["first_fog", {}, "the first fog"],
    // ha-signals H7: a season's first day says one of its season's two lines.
    ["season_start", { season: "spring" }, "^(first day of spring! ♪|spring's here! hop hop ♪)$"],
    ["season_start", { season: "autumn" }, "^(autumn's here! crunchy leaves ♪|first day of autumn ♪)$"],
    ["weather", { change: "cold", temperature: -12 }, "−12°"],
    ["weather", { change: "rainbow" }, "rainbow"],
    ["forecast", { when: "tomorrow", kind: "warmer", high: 72 }, "warmer tomorrow: 72°"],
    // ha-signals H3: the house answered; a line from the pool (set D), the effect class on.
    ["house_answered", { request: "blanket" }, "heater's on! toasty|the house heard me! ♥|warm air! that's better"],
    ["house_answered", { request: "fan" }, "ahh, a breeze|the house heard me! ahh|cool air! much better"],
    // ha-signals H4: the robot vacuum; robot_out shows the stand-in (fx-robot) and it goes again.
    ["robot_out", {}, "the robot's out! vroom|here it comes! \\*hop hop\\*|vroom vroom! ♪"],
    ["robot_home", {}, "the robot's back home|bye, robot! nap well"],
    // ha-signals H6: a machine finished; the washer's line and suds, the dryer's line and swirl, a bare machine.
    ["appliance_done", { kind: "washer" }, "the washer's finished! ♪"],
    ["appliance_done", { kind: "dryer" }, "the dryer's done! warm socks"],
    ["appliance_done", { kind: "machine" }, "ding! a machine finished|something's done!"],
  ]) {
    // Each from a quiet bubble: under 2a a kept line holds the next one back.
    await card.evaluate((el) => Object.assign(el._slides[el._index], { sayUntil: 0, sayClass: 0, sayEntry: null, queue: [] }));
    if (type === "watching") { // the house's show: over the private channel only
      await page.locator("hatch-pet-card").evaluate((el, m) =>
        el._channel(el._slides[el._index], { moment: m }, el._hass.user.id), { type, ...extra, at: new Date().toISOString() });
    } else {
      await inject(pet["sensor.last_care"], {
        attributes: { moments: [{ type, ...extra, at: new Date().toISOString() }] },
      });
    }
    await page.waitForTimeout(500);
    const said = await bubble();
    check(`reacts to ${type}`, new RegExp(expect).test(said), said);
    if (type === "house_answered") {
      const fx = await card.evaluate((el) => [...el._slides[el._index].screen.classList].filter((c) => c.startsWith("fx-")));
      check(`moments: the house answering (${extra.request}) shows ${extra.request === "fan" ? "fx-cool" : "fx-heat"}`,
        fx.join() === (extra.request === "fan" ? "fx-cool" : "fx-heat"), fx.join());
    }
    if (type === "appliance_done") {
      const fx = await card.evaluate((el) => [...el._slides[el._index].screen.classList].filter((c) => c.startsWith("fx-")));
      const want = { washer: "fx-suds", dryer: "fx-tumble", machine: "fx-suds" }[extra.kind];
      check(`moments: appliance_done (${extra.kind}) shows ${want}`, fx.join() === want, fx.join());
    }
    if (type === "robot_out" || type === "robot_home") {
      const robot = () => card.evaluate((el) => el._slides[el._index].screen.classList.contains("fx-robot"));
      check(`moments: ${type} ${type === "robot_out" ? "shows the robot stand-in" : "shows no robot"}`,
        (await robot()) === (type === "robot_out"));
      if (type === "robot_out") {
        await page.waitForTimeout(6300); // it crosses in 6 s, then goes
        check("moments: the robot stand-in goes again", !(await robot()));
      }
    }
    await shot(`05-${type}`);
    await page.waitForTimeout(500);
  }
  // A care miss (fresh eyes #6): live, nothing is said to someone already looking;
  // only the catch-up says "there you are".
  {
    await card.evaluate((el) => Object.assign(el._slides[el._index], { sayUntil: 0, sayClass: 0, sayEntry: null, queue: [] }));
    const before = await bubble();
    await inject(pet["sensor.last_care"], {
      attributes: { moments: [{ type: "care_miss", reason: "hunger", at: new Date().toISOString() }] },
    });
    await page.waitForTimeout(500);
    const live = await card.evaluate((el) => {
      const s = el._slides[el._index];
      return { said: s.bubble.textContent, queue: s.queue.map((q) => q.text),
        catchUp: el._catchUpLine(s, { type: "care_miss", reason: "hunger", at: new Date().toISOString() }) };
    });
    check("a live care_miss says nothing; the catch-up says there you are",
      !/there you are/.test(live.said) && !live.queue.some((t) => /there you are/.test(t)) &&
        /there you are/.test(live.catchUp || ""), `${before} -> ${JSON.stringify(live)}`);
  }

  // Trait flair: one trait per place (head, air, ground), placed from the pet's
  // head point and feet line, and gone again after the moment.
  // Inject and show in one go: a pet update in between would replace the traits.
  const flair = await page.locator("hatch-pet-card").evaluate(async (el, entity) => {
    const s = el._slides[el._index];
    const traits = ["storm_watcher", "social_butterfly", "fireside"];
    const st = el._hass.states[entity];
    await el._hass.callApi("POST", `states/${entity}`,
      { state: st.state, attributes: { ...st.attributes, traits, trait_levels: {} } });
    for (let i = 0; i < 40 && el._hass.states[entity].attributes.traits?.join() !== traits.join(); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const at = el._flairAnchors(s);
    const shown = el._flair(s);
    await new Promise((r) => setTimeout(r, 1500));
    const sr = s.screen.getBoundingClientRect();
    const pieces = [...s.screen.querySelectorAll(".flair .fx")].map((f) => {
      const r = f.getBoundingClientRect();
      return { src: (f.querySelector("img")?.src || "glow").split("/").pop().split("?")[0],
        bottom: r.bottom - sr.top, h: r.height };
    });
    await new Promise((r) => setTimeout(r, 3200));
    return { shown, at, pieces, after: s.screen.querySelectorAll(".flair").length };
  }, pet["sensor.life_stage"]);
  const piece = (name) => flair.pieces.filter((p) => p.src.startsWith(name));
  const cloud = piece("flair_storm_watcher")[0];
  const embers = piece("flair_fireside");
  check("trait flair shows one trait in each place",
    flair.shown.join() === "storm_watcher,social_butterfly,fireside" &&
      piece("flair_social_butterfly").length > 0 && embers.length > 0,
    flair.shown.join(" "));
  check("flair stands on the pet's head point and feet line",
    cloud && cloud.h > 0 && cloud.bottom <= flair.at.hy + 2 && cloud.bottom > flair.at.hy - 40 &&
      embers.every((e) => e.bottom < flair.at.fy + 8),
    `cloud bottom ${Math.round(cloud?.bottom)} vs head ${Math.round(flair.at.hy)}`);
  check("a flair moment clears itself", flair.after === 0);
  // Fresh-moment 7: a first look plans one move within 10 s, and it plays over a line
  // being said (flair has no bubble); with no flair, a look around.
  const firstMove = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    Object.assign(s, { lookedFirst: false, queue: [], flairUntil: 0, poseUntil: 0, movingUntil: 0, propUntil: 0 });
    const t0 = Date.now();
    el._firstLook(s);
    const planned = s.firstMoveAt - t0;
    s.queue = [];
    s.firstMoveAt = Date.now() - 1;
    el._write(s, "a line on show", 5000);
    el._firstMove(s);
    const out = { planned, flair: !!s.screen.querySelector(".flair"), done: s.firstMoveAt === 0, said: s.bubble.textContent };
    s.screen.querySelector(".flair")?.remove();
    Object.assign(s, { flairUntil: 0, sayUntil: 0 });
    const real = el._flair;
    el._flair = () => [];
    s.firstMoveAt = Date.now() - 1;
    el._firstMove(s);
    el._flair = real;
    out.look = s.pet.classList.contains("look");
    return out;
  });
  check("fresh-moment 7: a first look's one move comes within 10 s, over a line (flair, else a look around)",
    firstMove.planned > 0 && firstMove.planned <= 10000 && firstMove.flair && firstMove.done &&
      firstMove.said === "a line on show" && firstMove.look, JSON.stringify(firstMove));
  await inject(pet["sensor.life_stage"], { attributes: { traits: [], trait_levels: {} } });

  // Seasons: forced to Halloween, the lantern and web are in the scene, and a
  // costume moment puts the hat on the head (its brim at or below the head
  // point, never hovering over it). Off again with seasonal: false.
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: "halloween" }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  const spooky = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.sayUntil = 0; s.flairUntil = 0;
    s.nextIdle = Date.now() + 600000; s.greeted = true; // no idle line or hello over "boo!"
    const [hx0, hy0] = el._hatSpot(s) || s.species.head[s.drawn];
    el._headTopAll(s, hx0, hy0); // load every frame first, as the season's ticks do
    await new Promise((r) => setTimeout(r, 600));
    // A late reaction (a treat from play) can take the bubble after "boo!": keep what's said.
    const said = [];
    const speak = el._speak;
    el._speak = function (slide, line, ...rest) { if (slide === s) said.push(String(line)); return speak.call(this, slide, line, ...rest); };
    el._costume(s, { key: "halloween" }, "boo!");
    await new Promise((r) => setTimeout(r, 900));
    const hat = s.screen.querySelector(".costume .hat")?.getBoundingClientRect();
    s.nextIdle = 0; // idle life back (the greeting stays done)
    const at = el._flairAnchors(s);
    const sr = s.screen.getBoundingClientRect();
    const r = s.pet.getBoundingClientRect();
    // The seat the card itself uses: the lowest top across the idle frames, the hat
    // point, or an exact point.
    const top = el._hatSeat(s)?.top ?? null;
    return {
      pieces: [...s.seasonBox.querySelectorAll("img")].map((i) => i.className).join(" ").split(" "),
      hatBottom: hat && hat.bottom - sr.top, headTop: r.top - sr.top + top * (r.height / 256),
      fy: at.fy, said: (delete el._speak, said.includes("boo!") ? "boo!" : s.bubble.textContent),
    };
  });
  check("halloween dresses the scene", spooky.pieces.includes("lantern") && spooky.pieces.includes("web"),
    spooky.pieces.join(" "));
  // Seated: the brim sinks a little into the head, never floats above its top.
  check("the costume hat sits on the head",
    spooky.hatBottom > spooky.headTop && spooky.hatBottom < spooky.headTop + 20 &&
      spooky.hatBottom < spooky.fy && spooky.said === "boo!",
    `hat bottom ${Math.round(spooky.hatBottom)} vs head top ${Math.round(spooky.headTop)}, flair y ${Math.round(spooky.fy)}, said "${spooky.said}"`);
  await shot("05-halloween");
  // An [x, y, "exact"] hat point seats the brim at y itself: no scan, no lowering.
  // Seat the pose on show at y 60 (far above any head scan would put it).
  const exact = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.sayUntil = 0; s.flairUntil = 0;
    const pose = (el._frames(s)[0] || "").replace(/_\d+$/, "");
    const was = s.species.hat;
    s.species.hat = { ...(was || {}), [pose]: [120, 60, "exact"] };
    try {
      const seat = el._hatSeat(s);
      const costume = el.constructor.seasons.find((x) => x.key === "halloween").costumes[0];
      el._costume(s, { key: "halloween", costumes: [costume] }, "boo!");
      await new Promise((r) => setTimeout(r, 400));
      const hat = s.screen.querySelector(".costume .hat").getBoundingClientRect();
      const r = s.pet.getBoundingClientRect();
      const k = r.height / 256;
      return { seat, brim: hat.bottom, want: r.top + (60 + costume.sink) * k, left: hat.left + hat.width / 2, wantX: r.left + 120 * k };
    } finally { s.species.hat = was; }
  });
  check("an exact hat point seats the brim at y",
    exact.seat?.top === 60 && exact.seat?.x === 120 && Math.abs(exact.brim - exact.want) < 1.5 &&
      Math.abs(exact.left - exact.wantX) < 1.5,
    JSON.stringify(exact));
  // No costume while the pet is off its spot (a wander or a look): the hat
  // would be left hovering where the pet was.
  const movingBlocks = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    // Idle life would start its own wander or look meanwhile: hold it off.
    Object.assign(s, { sayUntil: 0, flairUntil: 0, movingUntil: 0, poseUntil: 0, propUntil: 0,
      moodState: "content", asleep: false, calling: false, game: null, nextIdle: Date.now() + 600000 });
    s.screen.classList.remove("show-status");
    const before = el._free(s);
    el._look(s, 300);
    const during = el._free(s);
    await new Promise((r) => setTimeout(r, 700));
    return [before, during, el._free(s)];
  });
  check("no costume moment while the pet moves", movingBlocks.join() === "true,false,true", movingBlocks.join());
  // Halloween's extras: bunting, a ghost the pet jumps at, candy for a snack.
  const extras = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "halloween");
    s.screen.querySelector(".costume")?.remove();
    s.sayUntil = 0; s.flairUntil = 0;
    el._seasonVisitor(s, season);
    await new Promise((r) => setTimeout(r, 1800));
    const ghost = !!s.seasonBox.querySelector(".sghost");
    const eep = s.bubble.textContent;
    el._seasonFly(s, season, "witch", "switch", 3000);
    const witch = !!s.seasonBox.querySelector(".switch img");
    el._react(s, { action: "snack", result: "ok", at: Date.now() / 1000 });
    return { bunting: !!s.seasonBox.querySelector(".bunting"), ghost, eep, witch,
      prop: s.prop.getAttribute("src") || "" };
  });
  check("halloween extras show", extras.bunting && extras.ghost && extras.witch && extras.eep === "eep!!",
    `bunting ${extras.bunting}, ghost ${extras.ghost} (${extras.eep}), witch ${extras.witch}`);
  check("snacks are candy at halloween", /season_halloween_candy/.test(extras.prop), extras.prop.split("/").pop());
  await shot("05-halloween-extras");

  // Thanksgiving: its dates move with the fourth Thursday of November (from
  // 12 days before to the Sunday after); the harvest scene, falling leaves,
  // every costume seated, a turkey that walks by, geese in a V, pie for a
  // snack, and on the day the pet thanks whoever cared for it most.
  const tgDates = await card.evaluate((el) => {
    const at = (y, m, d) => el.constructor.seasonNow({}, new Date(y, m - 1, d))?.key || "-";
    return [at(2026, 11, 13), at(2026, 11, 14), at(2026, 11, 29), at(2026, 11, 30),
      at(2024, 12, 1), at(2024, 12, 2), at(2026, 10, 31), at(2026, 11, 1)].join(" ");
  });
  check("thanksgiving's dates follow the fourth thursday", tgDates ===
    "- thanksgiving thanksgiving - thanksgiving winter halloween -", tgDates); // 2 Dec: winter lights
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: "thanksgiving" }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  const harvest = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "thanksgiving");
    const [hx, hy] = s.species.hat?.[s.drawn] || s.species.head[s.drawn];
    el._headTopAll(s, hx, hy);
    await new Promise((r) => setTimeout(r, 600));
    const top = el._hatSeat(s)?.top ?? null;
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    const headTop = r.top - sr.top + top * (r.height / 256);
    // Every costume, skip lists aside: the brim sinks a little into the head.
    const seats = [];
    for (const costume of season.costumes) {
      s.sayUntil = 0; s.flairUntil = 0; s.movingUntil = 0;
      el._costume(s, { ...season, costumes: [{ ...costume, skip: [] }] }, costume.art);
      await new Promise((res) => setTimeout(res, 700));
      const img = s.screen.querySelector(".costume .hat img");
      const b = img.getBoundingClientRect().bottom - sr.top;
      seats.push(`${costume.art} ${Math.round(b - headTop)}${img.naturalWidth ? "" : " (no art)"}`);
    }
    return {
      pieces: [...s.seasonBox.querySelectorAll("img")].map((i) => i.className).join(" ").split(" "),
      leaves: s.seasonBox.querySelectorAll(".leaf").length, seats,
    };
  });
  check("thanksgiving dresses the scene", harvest.pieces.includes("lantern") && harvest.pieces.includes("leaves") &&
    harvest.leaves === 6, `${[...new Set(harvest.pieces)].join(" ")}; ${harvest.leaves} falling`);
  check("every thanksgiving costume sits on the head",
    harvest.seats.every((x) => { const d = Number(x.split(" ")[1]); return d > 0 && d < 20 && !/no art/.test(x); }),
    harvest.seats.join(", "));
  await shot("05-thanksgiving");
  const feast = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "thanksgiving");
    s.screen.querySelector(".costume")?.remove();
    s.sayUntil = 0; s.flairUntil = 0;
    s.nextFlyer = Date.now() + 600000; // only the flock sent here
    // A flock the tick already sent has its wing geese still to come (450 ms after
    // the leader): let them arrive before clearing the sky.
    await new Promise((r) => setTimeout(r, 600));
    s.seasonBox.querySelectorAll(".sgoose").forEach((g) => g.remove());
    el._seasonVisitor(s, season);
    el._seasonFlyer(s, season);
    await new Promise((r) => setTimeout(r, 1800));
    const turkey = !!s.seasonBox.querySelector(".sturkey.walk");
    const gobble = s.bubble.textContent;
    const geese = s.seasonBox.querySelectorAll(".sgoose").length;
    el._react(s, { action: "snack", result: "ok", at: Date.now() / 1000 });
    return { turkey, gobble, geese, prop: s.prop.getAttribute("src") || "" };
  });
  check("a turkey walks by and geese fly over", feast.turkey && feast.gobble === "gobble?!" && feast.geese === 3,
    `turkey ${feast.turkey} (${feast.gobble}), ${feast.geese} geese`);
  check("snacks are pie at thanksgiving", /season_thanksgiving_pie/.test(feast.prop), feast.prop.split("/").pop());
  await shot("05-thanksgiving-extras");
  await inject(pet["sensor.last_care"], { attributes: { log: [
    { action: "feed", by: "Dev Person", at: new Date().toISOString() },
    { action: "play", by: "Sam", at: new Date().toISOString() },
    { action: "clean", by: "Dev Person", at: new Date().toISOString() },
  ] } });
  await page.waitForTimeout(600);
  const thanks = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "thanksgiving");
    s.sayUntil = 0; s.flairUntil = 0; s.movingUntil = 0;
    el._costume(s, season, season.treatLine);
    const first = s.bubble.textContent;
    el._seasonTreat(s, season);
    return [first, s.bubble.textContent, !!s.screen.querySelector(".costume .pop img[src*=plate]")];
  });
  check("on the day, the pet gives thanks", thanks[0] === "happy Thanksgiving! ♥" &&
    thanks[1] === "thank you all for taking care of me ♥" && thanks[2], thanks.join(" | "));
  await shot("05-thanksgiving-thanks");
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: false }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  check("seasonal: false takes the season away",
    await card.evaluate((el) => el._slides[el._index].seasonBox.children.length === 0));

  // Daily check-ins: the first look of the day tells what happened while you
  // were out, this morning's dream and today's wish, in turn; the wish is on the
  // status screen; a wish coming true queues behind a line said at the same time.
  // A dream of a show is the house's (P3c): the sensor's dream is null and the
  // title comes on the channel's house.dream.
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  await inject(pet["sensor.life_stage"], {
    attributes: { wish: { kind: "sunset", granted: false }, dream: null },
  });
  await inject(pet["sensor.last_care"], {
    attributes: { moments: [{ type: "weather", change: "rain_started", at: hourAgo },
      { type: "fell_asleep", how: "house", at: hourAgo }] },
  });
  await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const device = s.ids.device;
    for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish)-/.test(k)) localStorage.removeItem(k);
    localStorage.setItem(`hatch-seen-${device}`, String(Date.now() - 5 * 3600 * 1000));
    s.lookedFirst = false; s.queue = []; s.sayUntil = 0; s.flairUntil = 0;
    // In one go: the server's own channel push could replace s.house between calls.
    s.house = { ...(s.house || {}), dream: { kind: "watching", title: "Bluey" } };
    el._firstLook(s);
    s.sayUntil = Date.now() + 60000; // the card's own tick mustn't say the first line before we do
  });
  const firstLook = [];
  for (const name of ["05-first-look", "05-dream", "05-wish"]) {
    firstLook.push(await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.sayUntil = 0;
      el._sayQueued(s);
      return s.bubble.textContent;
    }));
    await shot(name);
  }
  // The wish as said takes turns by device and day (fresh-expand E6 W-a): any of sunset's.
  const SUNSET_SAID = ["can we watch the sunset together?", ...require("vm").runInNewContext(`(${fs.readFileSync(
    path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8")
    .match(/\nconst WISH_MORE = (\{[\s\S]*?\n\});/)[1]})`).sunset];
  check("the first look tells the dream and wish first, then the day's news (fresh-moment 2)",
    firstLook[0] === "I dreamed about Bluey!" && SUNSET_SAID.includes(firstLook[1]) &&
      /^while you were out, I (napped|watched the rain)/.test(firstLook[2]), firstLook.join(" | "));
  // P3c: the media dream (sensor null, house.dream titled) is said once a day.
  const dreamAgain = await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.lookedFirst = false; s.queue = [];
    s.house = { ...(s.house || {}), dream: { kind: "watching", title: "Bluey" } };
    el._firstLook(s);
    const queued = s.queue.map((q) => q.text);
    s.queue = []; s.sayUntil = 0;
    return queued;
  });
  check("P3c: a show's dream comes from house.dream, once",
    !dreamAgain.some((t) => /dreamed/.test(t)), JSON.stringify(dreamAgain));
  // Fresh-moment 1 (owner Q1): a tab back after AWAY_NOTE_AFTER_MS hidden is a new look
  // (greeting, first look, visit, the wish mention from scratch), once the house's states
  // come; a short absence changes nothing, and each line's once-key stops a double.
  const resumed = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const back = (hiddenMs) => {
      Object.assign(s, { lookedFirst: true, greeted: true, visitedAt: Date.now(), nextWish: Date.now() + 1, queue: [], lastMoment: "m" });
      s.sayUntil = Date.now() + 60000; // nothing said meanwhile: the tick mustn't greet or speak
      el._hiddenAt = Date.now() - hiddenMs;
      el._onHidden(); // visible again
      return { looked: s.lookedFirst, greeted: s.greeted, visited: s.visitedAt, mention: s.nextWish, replay: s.lastMoment === undefined };
    };
    const look = (fresh = true) => {
      s.house = { ...(s.house || {}), dream: { kind: "watching", title: "Bluey" } };
      el._firstLook(s);
      const held = s.queue.map((q) => q.text);
      el.hass = el._hass; // a set hass with the same states (a connection change): still held
      el._firstLook(s);
      held.push(...s.queue.map((q) => q.text));
      if (fresh) el.hass = { ...el._hass, states: { ...el._hass.states } }; // fresh states
      else el._resumedAt = Date.now() - 6000; // the hold ran out on the old states
      el._firstLook(s);
      const said = s.queue.map((q) => q.text);
      el._resumedAt = el._resumeStates = null;
      return { held, said };
    };
    for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish)-/.test(k)) localStorage.removeItem(k);
    const short = back(60 * 1000);
    const device = s.ids.device;
    const seenWas = localStorage.getItem(`hatch-seen-${device}`);
    const hoursAgo = Date.now() - 5 * 3600 * 1000;
    el._seenWrite(device, { seen: hoursAgo });
    const long = back(3 * 3600 * 1000 + 1000);
    s.seenAt = 0;
    el._seen(s); // a tick while held mustn't move the mark: the away note reads it
    long.seen = el._seenRead(device)?.seen === hoursAgo;
    const first = look();
    if (seenWas === null) localStorage.removeItem(`hatch-seen-${device}`); else localStorage.setItem(`hatch-seen-${device}`, seenWas);
    back(3 * 3600 * 1000 + 1000);
    const twice = look();
    // Timed out on old states: no dream or wish, and their keys left for the next look.
    for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish)-/.test(k)) localStorage.removeItem(k);
    back(3 * 3600 * 1000 + 1000);
    const stale = look(false);
    stale.keys = Object.keys(localStorage).filter((k) => /^hatch-(dream|wish)-/.test(k));
    // A screen left on (no hide): a new day, or the pet up for the day seen live, is a new
    // look; the same day isn't.
    let fresh = null;
    el._firstLook = function (t) { if (t === s && fresh === null) fresh = !t.lookedFirst; };
    el._visit = () => {}; // no server visit from these ticks
    const roll = (day) => {
      fresh = null;
      Object.assign(s, { lookedFirst: true, greeted: true, sayUntil: Date.now() + 60000 });
      el._lookDay = day;
      el._tick();
      return fresh;
    };
    let rolled, sameDay;
    try {
      rolled = roll("Mon Jan 01 2001");
      sameDay = roll(new Date().toDateString());
    } finally {
      delete el._firstLook;
      delete el._visit;
    }
    s.lookedFirst = true;
    el._moment(s, { type: "woke_up", how: "morning", at: new Date().toISOString() });
    const woke = !s.lookedFirst;
    s.queue = []; s.sayUntil = 0; s.lookedFirst = true;
    return { short, long, first, twice, stale, rolled, sameDay, woke };
  });
  check("fresh-moment 1: a tab back after 3 h hidden looks again (the dream and wish once, after fresh states); 1 min changes nothing",
    resumed.short.looked && resumed.short.greeted && resumed.short.visited > 0 && resumed.short.mention > 0 &&
      !resumed.long.looked && !resumed.long.greeted && resumed.long.visited === 0 && resumed.long.mention === 0 && resumed.long.seen &&
      resumed.long.replay && !resumed.short.replay &&
      resumed.first.held.length === 0 && resumed.first.said.includes("I dreamed about Bluey!") &&
      resumed.first.said.some((t) => SUNSET_SAID.includes(t)) &&
      !resumed.twice.said.some((t) => /dreamed/.test(t) || SUNSET_SAID.includes(t)), JSON.stringify(resumed));
  check("fresh-moment 1: a set hass with the same states keeps the hold; timed out, no dream or wish and their keys unused",
    resumed.first.held.length === 0 && !resumed.stale.said.some((t) => /dreamed/.test(t) || SUNSET_SAID.includes(t)) &&
      resumed.stale.keys.length === 0, JSON.stringify(resumed.stale));
  check("fresh-moment 1: a screen left on looks again on a new day or a live morning wake-up, not on the same day",
    resumed.rolled === true && resumed.sameDay === false && resumed.woke, JSON.stringify(resumed));
  // top10 6d: a visitor's dream names it from worlds.json; one this card doesn't know
  // says no dream line at all.
  const visitorDream = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const said = (dream) => {
      for (const k of Object.keys(localStorage)) if (/^hatch-dream-/.test(k)) localStorage.removeItem(k);
      s.lookedFirst = false; s.queue = [];
      s.house = { ...(s.house || {}), dream };
      el._firstLook(s);
      const out = s.queue.map((q) => q.text).filter((t) => /dreamed/.test(t));
      s.queue = []; s.sayUntil = 0;
      return out;
    };
    try {
      return { known: said({ kind: "visitor", id: "stellersjay", world: "woodland" }),
        unknown: said({ kind: "visitor", id: "nobody", world: "woodland" }) };
    } finally {
      s.house = { ...(s.house || {}), dream: null };
    }
  });
  check("top10 6d: a visitor's dream names it; an unknown one says nothing",
    JSON.stringify(visitorDream.known) === JSON.stringify(["I dreamed about the Steller's jay! ♪"]) && visitorDream.unknown.length === 0,
    JSON.stringify(visitorDream));
  // P3c: the recap's TV and music come from the title-less public tv_on/music_on.
  const recapAt = new Date(Date.now() - 1800 * 1000).toISOString();
  await inject(pet["sensor.last_care"], {
    attributes: { moments: [{ type: "music_on", at: recapAt }, { type: "tv_on", at: recapAt }], log: [] },
  });
  const recap = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    for (let i = 0; i < 30 && el._state(s, "sensor.last_care")?.attributes.moments?.[0]?.type !== "music_on"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return el._awayNote(s, Date.now() - 3600 * 1000);
  });
  check("P3c: the recap keeps TV and music (tv_on, music_on)",
    recap === "while you were out, I watched TV and listened to music!", recap);
  // Fresh-moment 2 (owner Q2): a note whose only news is a nap isn't said.
  const napAt = new Date(Date.now() - 1800 * 1000).toISOString();
  await inject(pet["sensor.last_care"], {
    attributes: { moments: [{ type: "woke_up", at: napAt }, { type: "fell_asleep", how: "house", at: napAt }], log: [] },
  });
  const napOnly = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    for (let i = 0; i < 30 && el._state(s, "sensor.last_care")?.attributes.moments?.[0]?.type !== "woke_up"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return el._awayNote(s, Date.now() - 3600 * 1000);
  });
  check("fresh-moment 2: an away note that would only say it napped isn't said", napOnly === null, String(napOnly));
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  check("the wish is on the status screen", /wish\s*♡ watch the sunset together/.test(await cur().locator(".status").innerText()));
  await shot("05-wish-status");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  await inject(pet["sensor.life_stage"], { attributes: { wish: { kind: "sunset", granted: true } } });
  // The usual grant line, not E6 W-b's "what it got" (half the time; checked in E6's own).
  await card.evaluate(() => { window.__grantRandom = Math.random; Math.random = () => 0.9; });
  await inject(pet["sensor.last_care"], {
    attributes: { moments: [{ type: "wish_granted", kind: "sunset", at: new Date().toISOString() },
      { type: "sunset", at: new Date().toISOString() }] },
  });
  await page.waitForTimeout(600);
  const granted = await card.evaluate(async (el) => {
    Math.random = window.__grantRandom;
    const s = el._slides[el._index];
    const first = s.bubble.textContent; // the wish's line: kept, over the sunset (flavour)
    s.sayUntil = 0;
    el._sayQueued(s);
    return [first, s.bubble.textContent];
  });
  check("a wish coming true is celebrated over the sunset said with it (2a: kept over flavour)",
    /wish|best day/.test(granted[0]) && !/sun|sky/.test(granted[1]), granted.join(" | "));
  await shot("05-wish-granted");

  // Excitement bounces briefly, not for the whole 15 minutes it lasts. The
  // bounce starts on becoming excited, and the games above may have excited the
  // pet already, so calm it first.
  await inject(pet["sensor.mood"], { state: "content", attributes: { flags: [] } });
  await page.waitForTimeout(600);
  await inject(pet["sensor.mood"], { state: "excited", attributes: { flags: ["excited"] } });
  await page.waitForTimeout(800);
  const hopsAtFirst = await cur().locator(".pet.hop").count();
  await skip(page, 11000); // the tick ends the bounce by Date.now()
  // Idle life also hops now and then while excited (1.4 s, at most every 20 s),
  // so look for a moment without a hop over the next 3 s, not at one instant.
  let stopped = false;
  for (let i = 0; i < 8 && !stopped; i++) {
    stopped = (await cur().locator(".pet.hop").count()) === 0;
    if (!stopped) await page.waitForTimeout(400);
  }
  check("an excited bounce stops by itself", hopsAtFirst === 1 && stopped,
    `bouncing at first: ${hopsAtFirst === 1}, stopped after 11 s: ${stopped}`);

  // Weather on screen: thunder flashes, wind blows.
  // A pet update can replace the injected mood, so inject until it shows.
  let screen = "";
  for (let i = 0; i < 3 && !(/stormy/.test(screen) && /windy/.test(screen)); i++) {
    await inject(pet["sensor.mood"], { state: "content", attributes: { flags: ["storm", "windy"] } });
    await page.waitForTimeout(800);
    screen = (await cur().locator(".screen").getAttribute("class")) || "";
  }
  check("thunder and wind show on screen", /stormy/.test(screen) && /windy/.test(screen), screen);
  await shot("05-storm");

  // The journal keeps the season's firsts, and a season's first day (H7). A pet update
  // can replace the injected memories (and the journal redraws with them), so inject
  // until they show.
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  await cur().locator(".jlink").click();
  let memory = false;
  for (let i = 0; i < 3 && !memory; i++) {
    await inject(pet["sensor.life_stage"], {
      attributes: { memories: [{ kind: "first_snow", at: Date.now() / 1000 },
        { kind: "season_spring", at: Date.now() / 1000 }] },
    });
    await page.waitForTimeout(1000);
    const text = await cur().locator(".status").innerText();
    memory = /first snow/.test(text) && /first day of spring/.test(text);
  }
  check("the journal shows memories (first snow, first day of spring)", memory);
  await shot("05-memories");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);

  // PR 2a: every line has a class on the one queue (mine, kept, care and beats,
  // flavour). Each check starts from a quiet bubble and an empty queue.
  await calm();
  const quiet2a = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    Object.assign(s, { sayUntil: 0, sayClass: 0, sayEntry: null, queue: [], game: null, pressed: null,
      flairUntil: 0, asleep: false, nextIdle: Date.now() + 600000 });
    s.screen.querySelector(".askday")?.remove();
    s.asking = false;
    s.screen.classList.remove("show-status");
    if (s.bubble) s.bubble.textContent = "";
  });
  // Every moment type has a class: coordinator MOMENTS, const PERSONAL_EVENTS
  // and MEDIA_EVENTS, read from the Python by name.
  const pySet = (file, name) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", file), "utf8");
    const block = new RegExp(`^${name} = \\{([^}]*)\\}`, "m").exec(src);
    return block ? [...block[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
  };
  const serverTypes = [...new Set([...pySet("coordinator.py", "MOMENTS"), ...pySet("const.py", "PERSONAL_EVENTS"),
    ...pySet("const.py", "MEDIA_EVENTS"), ...pySet("const.py", "LIVE_EVENTS")])];
  const classes = await card.evaluate((el) => el.constructor.momentClasses || {});
  const unclassed = serverTypes.filter((t) => !["kept", "beat", "flavour"].includes(classes[t]));
  check("2a: every moment type has a class (MOMENTS, PERSONAL_EVENTS, MEDIA_EVENTS)",
    serverTypes.length > 30 && serverTypes.includes("tv_on") && serverTypes.includes("watching") &&
      serverTypes.includes("bond_up") && unclassed.length === 0,
    `${serverTypes.length} types; unclassed: ${unclassed.join(", ") || "none"}`);
  check("2a: care_miss is kept, tv_on is flavour, someone_home is a beat",
    classes.care_miss === "kept" && classes.tv_on === "flavour" && classes.someone_home === "beat", JSON.stringify(classes));

  // The wake's own line (fresh-expand E4 S-a, in turns by device) may say "morning": the
  // cheer is a "morning" line that isn't one (typed out, a part of one).
  const WAKE4 = require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet",
    "frontend", "hatch-pet-card.js"), "utf8").match(/\nconst WAKE_LINES = (\[[\s\S]*?\]);/)[1]);
  const isWake = (t) => !!t && WAKE4.some((w) => t.includes(w) || w.startsWith(t));
  // Wake, good morning and weather in one update: the yawn, then good morning,
  // and nothing about the weather (it would wait more than 8 s). The wake line pinned to
  // the yawn, so the order is checked whatever the day's turn (audit 2026-11-01b A4).
  await quiet2a();
  await card.evaluate((el) => { el._wakeLine = () => "*yaaawn*"; });
  const wakeAt = Date.now();
  await inject(pet["sensor.last_care"], { attributes: { moments: [
    { type: "weather", change: "sun_out", at: new Date(wakeAt + 2).toISOString() },
    { type: "good_morning", at: new Date(wakeAt + 1).toISOString() },
    { type: "woke_up", how: "morning", at: new Date(wakeAt).toISOString() },
  ] } });
  const morning = [];
  for (let i = 0; i < 40; i++) {
    const t = await cur().locator(".bubble").innerText();
    if (morning[morning.length - 1] !== t) morning.push(t);
    await page.waitForTimeout(300);
  }
  await card.evaluate((el) => { delete el._wakeLine; });
  const iMorning = morning.findIndex((t) => /morning/.test(t) && !isWake(t));
  const iYawn = morning.findIndex((t) => t.includes("yaaawn"));
  check("2a: wake + good morning + weather: the yawn, then good morning; the weather isn't said",
    iMorning >= 0 && iYawn >= 0 && iYawn < iMorning && !morning.some((t) => /sun came out|sunshine/.test(t)),
    morning.join(" | "));

  // Fresh eyes #9: two quick different taps both count as the viewer's own.
  const twoTaps = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const seen = [];
    const was = el._react;
    el._react = (x, entry, opts) => { seen.push(`${entry.action}:${!!opts?.mine}`); };
    try {
      s.pressed = [];
      for (const action of ["feed", "snack"]) {
        s.pressed = [...s.pressed, { action, pressedAt: Date.now() }];
      }
      el._care(s, [{ action: "feed", result: "ok" }]);
      el._care(s, [{ action: "snack", result: "ok" }]);
      el._care(s, [{ action: "snack", result: "ok" }]); // someone else's: no press left
      // Both taps arriving in one update use up both presses: the next is someone else's.
      s.pressed = ["feed", "snack"].map((action) => ({ action, pressedAt: Date.now() }));
      el._care(s, [{ action: "snack", result: "ok" }, { action: "feed", result: "ok" }]);
      el._care(s, [{ action: "feed", result: "ok" }]);
    } finally {
      el._react = was;
      s.pressed = [];
    }
    return seen;
  });
  check("two quick taps (feed, snack) both count as mine, apart or in one update; a later entry doesn't",
    twoTaps.join() === "feed:true,snack:true,snack:false,snack:true,feed:false", twoTaps.join());

  // The viewer's own press is "mine": a flavour moment 1 s later doesn't
  // overwrite its line for 3 s (and a poop has no line to say).
  await quiet2a();
  const pressAt = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.pressed = [{ action: "praise", pressedAt: Date.now() }];
    const hass = el._hass;
    const id = s.ids["sensor.last_care"];
    const st = hass.states[id];
    const at = new Date().toISOString();
    await hass.callApi("POST", `states/${id}`, { state: st.state,
      attributes: { ...st.attributes, log: [{ action: "praise", result: "ok", by: "Dev", at }, ...(st.attributes.log || [])] } });
    for (let i = 0; i < 40 && s.bubble.textContent !== "♥"; i++) await new Promise((r) => setTimeout(r, 25));
    return Date.now();
  });
  await page.waitForTimeout(Math.max(0, pressAt + 1000 - Date.now()));
  const nowIso = new Date().toISOString();
  await inject(pet["sensor.last_care"], { attributes: { moments: [
    { type: "sunset", at: nowIso }, { type: "pooped", count: 1, at: nowIso }] } });
  await page.waitForTimeout(Math.max(0, pressAt + 2800 - Date.now()));
  const heldMine = await card.evaluate((el) => {
    const s = el._slides[el._index];
    return { text: s.bubble.textContent, cls: s.sayClass, left: s.sayUntil - Date.now() };
  });
  // E2 P-c: a typed teen or adult praises in its own words half the time.
  const PRAISE = [...fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"),
    "utf8").matchAll(/praise: \[("[^"]*"), ("[^"]*")\]/g)].flatMap((m) => [JSON.parse(m[1]), JSON.parse(m[2])]);
  check("2a: a care press, then sunset and a poop 1 s later, keeps the care line for 3 s",
    (heldMine.text === "♥" || PRAISE.includes(heldMine.text)) && heldMine.cls === 4, JSON.stringify(heldMine));

  // Two kinds of care in one update: the newest's reaction with one line (C4).
  await quiet2a();
  const burst = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const hass = el._hass;
    const id = s.ids["sensor.last_care"];
    const st = hass.states[id];
    const now = Date.now();
    await hass.callApi("POST", `states/${id}`, { state: st.state, attributes: { ...st.attributes, log: [
      { action: "clean", result: "ok", by: "B", at: new Date(now).toISOString() },
      { action: "snack", result: "ok", by: "A", at: new Date(now - 1000).toISOString() },
      ...(st.attributes.log || [])] } });
    for (let i = 0; i < 60 && !/and/.test(s.bubble.textContent); i++) await new Promise((r) => setTimeout(r, 25));
    return s.bubble.textContent;
  });
  check("2a: two kinds of care in one update give one line (C4)", burst === "snacks and a bath! ♥", burst);

  // A kept moment during a game waits, and is said after it.
  await quiet2a();
  const missInGame = await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.game = { picking: true };
    el._moment(s, { type: "first_frost", at: new Date().toISOString() });
    const during = s.bubble.textContent;
    const waiting = s.queue.map((q) => q.text);
    s.game = null;
    s.sayUntil = 0;
    el._sayQueued(s);
    return { during, waiting, after: s.bubble.textContent };
  });
  check("2a: a kept moment during a game waits and is said after it",
    !/frost outside/.test(missInGame.during) && missInGame.waiting.some((t) => /frost outside/.test(t)) &&
      /frost outside/.test(missInGame.after), JSON.stringify(missInGame));

  // A house.media push (the channel's show) during a kept line is dropped.
  await quiet2a();
  const mediaOverKept = await card.evaluate((el) => {
    const s = el._slides[el._index];
    el._moment(s, { type: "first_frost", at: new Date().toISOString() });
    el._channel(s, { moment: { type: "watching", title: "Bluey", at: new Date().toISOString() } }, el._hass.user.id);
    const said = s.bubble.textContent;
    s.sayUntil = 0;
    el._sayQueued(s);
    return { said, queue: s.queue.map((q) => q.text), after: s.bubble.textContent };
  });
  check("2a: a house.media push during a kept line is dropped, not said over it",
    /frost outside/.test(mediaOverKept.said) && !/Bluey/.test(mediaOverKept.after) && mediaOverKept.queue.length === 0,
    JSON.stringify(mediaOverKept));

  // Catch-up: a stage_changed 40 s old (the card was closed) is a line of the
  // next look; with the away note and the wish that's three, the visit sends
  // queued: 3 and no question comes.
  await quiet2a();
  const lifeWas = await evaluate((id) => document.querySelector("home-assistant").hass.states[id].attributes.wish, pet["sensor.life_stage"]);
  const stageAt = new Date(Date.now() - 40000).toISOString();
  const catchMoments = [{ type: "stage_changed", stage: "teen", from: "child", at: stageAt },
    { type: "weather", change: "rain_started", at: new Date(Date.now() - 3600 * 1000).toISOString() }];
  await inject(pet["sensor.life_stage"], { attributes: { wish: { kind: "sunset", granted: false } } });
  await inject(pet["sensor.last_care"], { attributes: { moments: catchMoments } });
  await page.waitForTimeout(600);
  const look = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const device = s.ids.device;
    for (const k of Object.keys(localStorage)) if (/^hatch-wish-/.test(k)) localStorage.removeItem(k);
    localStorage.setItem(`hatch-seen-${device}`, JSON.stringify({ seen: Date.now() - 5 * 3600 * 1000, said: Date.now() - 120000 }));
    s.lookedFirst = false; s.visitedAt = 0;
    el._firstLook(s);
    const lines = s.queue.map((q) => q.text);
    const real = el._hass.callService;
    let sent = null;
    let reply = null;
    el._hass.callService = function (domain, service, data, ...rest) {
      const p = real.call(this, domain, service, data, ...rest);
      if (service !== "visit") return p;
      sent = data;
      return p.then((r) => { reply = r?.response || {}; return r; });
    };
    s.sayUntil = Date.now() + 60000; // nothing is said while we look
    try {
      el._visit(s);
      for (let i = 0; i < 60 && !reply; i++) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      el._hass.callService = real;
    }
    return { lines, queued: sent?.queued, ask: reply?.ask ?? null, asking: s.queue.some((q) => q.ask) };
  });
  check("2a: a look with two lines and a catch-up line sends queued: 3 and asks no question",
    look.lines.length === 3 && look.lines.some((t) => t === "guess what! i'm a teen now!") &&
      look.queued === 3 && !look.ask && !look.asking, JSON.stringify(look));
  const caught = await card.evaluate((el, at) => {
    const s = el._slides[el._index];
    const said = [];
    for (let i = 0; i < 6 && s.queue.length; i++) {
      s.sayUntil = 0;
      el._sayQueued(s);
      said.push(s.bubble.textContent);
    }
    s.lookedFirst = false;
    el._firstLook(s); // the same page, looking again
    const again = s.queue.map((q) => q.text);
    s.queue = []; s.sayUntil = 0;
    return { said, again, mark: el._seenRead(s.ids.device), at: new Date(at).getTime() };
  }, stageAt);
  check("2a: a stage_changed 40 s old is said once at the next look",
    caught.said.filter((t) => /guess what! i'm a teen/.test(t)).length === 1 &&
      !caught.again.some((t) => /guess what/.test(t)) && caught.mark?.said >= caught.at &&
      caught.mark?.seen > 0, JSON.stringify(caught));
  // Fold #12: the catch-up reads the viewer's own moments too (a bond line),
  // never friend_home, and on a shared screen the public list only.
  const streams = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const kept = s.privateMoments;
    const said = Date.now() - 60000;
    const at = new Date(said + 1000).toISOString();
    s.privateMoments = [{ type: "bond_up", level: 4, at }, { type: "friend_home", at }, { type: "tucked_in", at }];
    const own = el._catchUp(s, said, 3).map(([t]) => t);
    localStorage.setItem("hatch-shared-screen", "on");
    let shared;
    try {
      shared = el._catchUp(s, said, 3).map(([t]) => t);
    } finally {
      localStorage.setItem("hatch-shared-screen", "off");
      s.privateMoments = kept;
    }
    return { own, shared };
  });
  check("2a: the catch-up includes the viewer's bond moments, not friend_home or tucked_in, and none on a shared screen",
    streams.own.length >= 1 && streams.own.some((t) => /♥/.test(t)) && !streams.own.some((t) => /home|tucking/.test(t)) &&
      !streams.shared.some((t) => /♥/.test(t)), JSON.stringify(streams)); // the bond line has a heart
  // ...and not again after a reload (the same moment still in the list).
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.reload();
  await signedIn();
  await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  await seasonsOff();
  await hush();
  for (let i = 0; i < slides; i++) {
    if ((await page.locator("hatch-pet-card .title").innerText()).trim() === petName) break;
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(700);
  }
  await inject(pet["sensor.last_care"], { attributes: { moments: catchMoments } });
  await page.waitForTimeout(3000);
  const reloaded = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const mark = el._seenRead(s.ids.device);
    return { mark, catchUp: el._catchUp(s, mark?.said, 3), queue: (s.queue || []).map((q) => q.text),
      bubble: s.bubble.textContent };
  });
  check("2a: ...and not again after a reload",
    typeof reloaded.mark?.said === "number" && reloaded.catchUp.length === 0 &&
      !reloaded.queue.some((t) => /guess what/.test(t)) && !/guess what/.test(reloaded.bubble), JSON.stringify(reloaded));
  await inject(pet["sensor.life_stage"], { attributes: { wish: lifeWas ?? null } });
  await inject(pet["sensor.last_care"], { attributes: { moments: [] } });
  await calm();

  // PR 2b: feeling poorly (C6), all better (C8). The mood's flags are set on the
  // card's own copy of the state, and put back after.
  const moodFlags = (flags, extra = {}) => card.evaluate((el, { flags, extra }) => {
    const s = el._slides[el._index];
    const st = el._hass.states[s.ids["sensor.mood"]];
    window.__moodWas ??= st.attributes;
    st.attributes = { ...window.__moodWas, flags, ...extra };
  }, { flags, extra });
  const moodBack = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    if (window.__moodWas) el._hass.states[s.ids["sensor.mood"]].attributes = window.__moodWas;
    window.__moodWas = undefined;
  });
  await quiet2a();
  await moodFlags(["sick"]);
  const c6 = await card.evaluate((el) => {
    const s = el._slides[el._index];
    el._moment(s, { type: "became_sick", at: new Date().toISOString() });
    return { text: s.bubble.textContent, droop: s.pet.classList.contains("droop"), cls: s.sayClass,
      queue: s.queue.length };
  });
  check("2b: became_sick says C6 once, with the droop", c6.text === "I don't feel so good..." && c6.droop && c6.cls === 2 && c6.queue === 0,
    JSON.stringify(c6));
  await skip(page, 3000);
  check("2b: the droop is bounded (the class is gone after it)",
    !(await card.evaluate((el) => el._slides[el._index].pet.classList.contains("droop"))));
  // gaps-seams 2b: from weight (the only cause the public moment keeps), it says why.
  await quiet2a();
  const fromWeight = await card.evaluate((el) => {
    const s = el._slides[el._index];
    el._moment(s, { type: "became_sick", cause: "weight", at: new Date().toISOString() });
    return s.bubble.textContent;
  });
  check("gaps-seams 2b: sick from weight says too many snacks",
    ["ugh... too many snacks, I think", "my tummy's grumbly... too many snacks", "tummy hurts... too many snacks"].includes(fromWeight), fromWeight);
  await skip(page, 3000);
  // Reduced motion: the animation is off and one frame holds (a sag), still on the class.
  await quiet2a();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const held = await card.evaluate((el) => {
    const s = el._slides[el._index];
    el._moment(s, { type: "became_sick", at: new Date().toISOString() });
    const cs = getComputedStyle(s.pet);
    return { anim: cs.animationName, transform: cs.transform };
  });
  await shot("2b-droop-reduced-motion");
  check("2b: under reduced motion the droop is one held frame, not an animation",
    held.anim === "none" && held.transform !== "none", JSON.stringify(held));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // A waiting C6 is dropped if the pet is well by the time it would be said; kept if still sick.
  for (const sick of [false, true]) {
    await quiet2a();
    await moodFlags(sick ? ["sick"] : []);
    const waited = await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.game = { picking: true };
      el._moment(s, { type: "became_sick", at: new Date().toISOString() });
      const queued = s.queue.length;
      s.game = null; s.sayUntil = 0;
      el._sayQueued(s);
      return { queued, after: s.bubble.textContent, left: s.queue.length };
    });
    check(`2b: a waiting C6 is ${sick ? "said while still sick" : "dropped once it is well"}`,
      waited.queued === 1 && (/don't feel so good/.test(waited.after) === sick) && waited.left === 0, JSON.stringify(waited));
  }
  // A pet that wakes sick says C6 before the good morning cheer.
  await quiet2a();
  await moodFlags(["sick"]);
  const sickAt = Date.now();
  await inject(pet["sensor.last_care"], { attributes: { moments: [
    { type: "became_sick", at: new Date(sickAt + 2).toISOString() },
    { type: "good_morning", at: new Date(sickAt + 1).toISOString() },
    { type: "woke_up", how: "morning", at: new Date(sickAt).toISOString() },
  ] } });
  const sickState = await card.evaluate((el) => { const s = el._slides[el._index]; return {
    shared: localStorage.getItem("hatch-shared-screen"), calling: !!s.calling, game: !!s.game, q: s.queue?.length, say: s.sayUntil - Date.now(),
    sick: el._isSick(s), reloading: !!s.reloading, nameSheet: !!s.nameSheet, status: s.screen.classList.contains("show-status"),
    asleep: !!s.asleep, away: !!s.away, lastMoment: s.lastMoment, stage: s.egg, booting: !!el._booting, sharedSeen: !!el._sharedSeen,
    lastUpd: el._hass.states[s.ids["sensor.last_care"]]?.last_updated, now: new Date().toISOString() }; });
  const heardSick = [];
  for (let i = 0; i < 50; i++) {
    const t = await cur().locator(".bubble").innerText();
    if (heardSick[heardSick.length - 1] !== t) heardSick.push(t);
    await page.waitForTimeout(300);
  }
  const iSick = heardSick.findIndex((t) => /don't feel so good/.test(t));
  const iCheer = heardSick.findIndex((t) => /morning/.test(t) && !isWake(t));
  check("2b: C6 comes before a coinciding good morning (the cheer waits)",
    iSick >= 0 && iCheer > iSick, heardSick.join(" | ") + (iSick >= 0 ? "" : " " + JSON.stringify(sickState)));
  // C8: someone else's medicine, the viewer's own after the scene's cheer, and one whose scene is over.
  await moodBack();
  await quiet2a();
  const c8 = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const out = {};
    el._react(s, { action: "medicine", result: "ok", by: "Other", at: new Date().toISOString() }, { mine: false });
    out.other = { text: s.bubble.textContent, cls: s.sayClass };
    s.sayUntil = 0; s.sayClass = 0; s.queue = []; s.bubble.textContent = "";
    s.scene = { kind: "medicine", answered: false, els: [], stop() {}, raf: 0 };
    el._react(s, { action: "medicine", result: "ok", at: new Date().toISOString() }, { mine: true });
    out.sceneLive = { answered: s.scene?.answered, text: s.bubble.textContent };
    el._sceneEnd(s);
    out.own = { text: s.bubble.textContent, cls: s.sayClass };
    s.sayUntil = 0; s.sayClass = 0; s.queue = [];
    s.sceneOwes = { kind: "medicine", until: Date.now() + 5000 };
    el._react(s, { action: "medicine", result: "ok", at: new Date().toISOString() }, { mine: true });
    out.late = { text: s.bubble.textContent, cls: s.sayClass };
    s.sayUntil = 0; s.sayClass = 0; s.queue = [];
    el._react(s, { action: "medicine", result: "not_sick", at: new Date().toISOString() }, { mine: false });
    out.notSick = s.bubble.textContent;
    return out;
  });
  check("2b: medicine ok says C8: another viewer's (beat), the viewer's own after the scene, and one that comes late",
    c8.other.text === "all better! ♪" && c8.other.cls === 2 && c8.sceneLive.answered === true &&
      c8.sceneLive.text !== "all better! ♪" && c8.own.text === "all better! ♪" && c8.own.cls === 4 &&
      c8.late.text === "all better! ♪" && c8.late.cls === 4 && c8.notSick !== "all better! ♪", JSON.stringify(c8));

  // C6 arrives with the sick call in one update: the call doesn't hold it back.
  await quiet2a();
  await moodFlags(["sick"], { reason_key: "call_sick", reason: "feeling icky, medicine?" });
  const withCall = await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.calling = true;
    el._moment(s, { type: "became_sick", at: new Date().toISOString() });
    return { text: s.bubble.textContent, queued: s.queue.length };
  });
  check("2b: C6 is said at once even when the sick call came in the same update",
    withCall.text === "I don't feel so good..." && withCall.queued === 0, JSON.stringify(withCall));
  await moodBack();

  // PR 2c: what it wants, in order. A call holds the non-kept lines (and the wish); the
  // status row names the need above the wish, and the deadline is never shown.
  await quiet2a();
  const held2c = await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.calling = true;
    el._queue(s, "I wish for a hop", 4500, { type: "wish" });
    el._line(s, 2, "good night...", 4000, { write: true });
    el._sayQueued(s);
    const during = { text: s.bubble.textContent, queued: s.queue.map((q) => q.text) };
    s.calling = false;
    el._sayQueued(s);
    return { during, after: s.bubble.textContent, left: s.queue.map((q) => q.text) };
  });
  check("2c: a call holds a queued wish line and a beat; they are said when it ends",
    !/hop|good night/.test(held2c.during.text) && held2c.during.queued.length === 2 &&
      /hop|good night/.test(held2c.after), JSON.stringify(held2c));
  await quiet2a();
  await moodFlags([], { reason_key: "call_hunger", requests: ["fan"], call_deadline: "2099-CALLDEADLINE" });
  const rows = await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.asleep = false;
    s.screen.classList.add("show-status");
    el._renderStatus(s, []);
    return { rows: [...s.status.querySelectorAll(".row")].map((r) => r.textContent.trim()),
      html: s.screen.innerHTML + s.status.innerHTML };
  });
  const iWant = rows.rows.findIndex((r) => /^would like/.test(r));
  const iWish = rows.rows.findIndex((r) => /^wish/.test(r));
  check("2c: the status row names the call's need ('a meal'), above the wish row, no deadline",
    iWant === 0 && /a meal/.test(rows.rows[iWant]) && !/snack/.test(rows.rows[iWant]) && (iWish < 0 || iWant < iWish) &&
      !/CALLDEADLINE/.test(rows.html), JSON.stringify(rows.rows.slice(0, 3)));
  const order = [];
  for (const [flags, attrs] of [[["sick"], { reason_key: "mood_content", requests: ["fan"] }],
    [[], { reason_key: "mood_content", requests: ["lay_egg", "blanket"] }],
    [[], { reason_key: "mood_content", requests: ["lay_egg"] }]]) {
    await moodFlags(flags, attrs);
    order.push(await card.evaluate((el) => {
      const s = el._slides[el._index];
      el._renderStatus(s, []);
      return [...s.status.querySelectorAll(".row")].find((r) => /^would like/.test(r.textContent.trim()))
        ?.textContent.trim() || null;
    }));
  }
  check("2c: no call: sick says medicine, else the first request (lay_egg excluded), else no row",
    /medicine/.test(order[0]) && /a blanket/.test(order[1]) && order[2] === null, JSON.stringify(order));
  await moodBack();
  await quiet2a();

  // Fresh-expand E4 (S-a, S-b, M-a): the morning wake in turns, its dream line only on a
  // dream day; lights out after a visitor seen here says its callback once a day; the day
  // after a cure seen here, the first look's line, once.
  {
    const src4 = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const WAKE = require("vm").runInNewContext(src4.match(/\nconst WAKE_LINES = (\[[\s\S]*?\]);/)[1]);
    const CURED = require("vm").runInNewContext(src4.match(/\nconst CURED_LINES = (\[[^\n]*\]);/)[1]);
    const e4 = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const device = s.ids?.device;
      const real = { dream: el._dreamToday, seen: el._visitSeen, sick: el._isSick };
      const out = {};
      const days = (n) => Array.from({ length: n }, (_, i) => new Date(2026, 10, 1 + i, 7));
      try {
        el._dreamToday = () => ({ kind: "stars" });
        out.dream = days(12).map((d) => el._wakeLine(s, d));
        el._dreamToday = () => null;
        out.none = days(12).map((d) => el._wakeLine(s, d));
        const night = `hatch-nightcb-${device}-${new Date().toDateString()}`;
        localStorage.removeItem(night);
        el._visitSeen = () => "robin";
        out.night = [el._nightLine(s), el._nightLine(s)];
        localStorage.removeItem(night);
        el._visitSeen = () => null;
        out.plain = el._nightLine(s);
        const curedKey = `hatch-cured-${device}`;
        const cb = `hatch-curedcb-${device}-${new Date().toDateString()}`;
        localStorage.removeItem(cb);
        el._isSick = () => false;
        el._curedMark(s);
        out.sameDay = [el._curedLine(s), localStorage.getItem(curedKey) !== null];
        const y = new Date();
        y.setDate(y.getDate() - 1);
        localStorage.setItem(curedKey, y.toDateString());
        out.nextDay = [el._curedLine(s), el._curedLine(s), localStorage.getItem(curedKey)];
        localStorage.removeItem(cb);
      } finally {
        Object.assign(el, { _dreamToday: real.dream, _visitSeen: real.seen, _isSick: real.sick });
      }
      return out;
    });
    const dreamLine = WAKE[WAKE.length - 1];
    check("fresh E4 (S-a): the wake takes turns; a dream day can say the dream line, a day with none never",
      e4.dream.includes(dreamLine) && !e4.none.includes(dreamLine) && e4.none.every((l) => WAKE.includes(l)) &&
      e4.dream.every((l, i) => !i || l !== e4.dream[i - 1]), JSON.stringify(e4));
    check("fresh E4 (S-b): lights out after a visitor seen here says its callback once a day; no visitor or sunset, the usual",
      /robin/.test(e4.night[0] || "") && e4.night[1] === null && e4.plain === null, JSON.stringify(e4.night));
    // Fresh-expand E6 (W-a, W-b): a wish's phrasing takes turns a day each; a live grant
    // with random 0 says what it got (TODAY_WISH), and that evening's today line isn't it.
    const TODAY_WISH6 = require("vm").runInNewContext(`(${src4.match(/\nconst TODAY_WISH = (\{[\s\S]*?\n\});/)[1]})`);
    const e6 = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const real = { baby: el._babySet, aimed: el._aimedAtMe, line: el._line, state: el._state, seen: el._visitSeen, random: Math.random };
      const out = {};
      const key = `hatch-todaywish-${s.ids?.device}-${new Date().toDateString()}`;
      const had = localStorage.getItem(key);
      try {
        el._babySet = () => null;
        el._aimedAtMe = () => false;
        // Three days from a cycle's start (the list's length, 3): each line once.
        let d0 = 3;
        while (Math.round(Date.UTC(2026, 10, d0) / 864e5) % 3) d0++;
        out.days = [0, 1, 2].map((i) => el._wishSaid(s, { kind: "play" }, ["base play line", "play"], new Date(2026, 10, d0 + i, 9)));
        localStorage.removeItem(key);
        const said = [];
        el._line = function (sl, cls, text, ...rest) { said.push(text); return real.line.call(this, sl, cls, text, ...rest); };
        Math.random = () => 0;
        el._moment(s, { type: "wish_granted", kind: "bath", at: new Date().toISOString() });
        out.live = said.slice();
        el._line = real.line;
        Math.random = real.random;
        el._visitSeen = () => null;
        el._state = function (sl, k) {
          const st = real.state.call(this, sl, k);
          return k === "sensor.life_stage" && st
            ? { ...st, state: "adult", attributes: { ...st.attributes, personality: "mellow", wish: { kind: "bath", granted: true } } } : st;
        };
        out.today = el._todayLine(s);
      } finally {
        Object.assign(el, { _babySet: real.baby, _aimedAtMe: real.aimed, _line: real.line, _state: real.state, _visitSeen: real.seen });
        Math.random = real.random;
        if (had === null) localStorage.removeItem(key); else localStorage.setItem(key, had);
        Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
      }
      return out;
    });
    check("fresh E6 (W-a): a wish over 3 days is said 3 ways", new Set(e6.days).size === 3, JSON.stringify(e6.days));
    check("fresh E6 (W-b): a live grant (random 0) says what it got; the evening's today line then isn't the wish",
      e6.live.includes(TODAY_WISH6.bath) && e6.today !== TODAY_WISH6.bath, JSON.stringify({ live: e6.live, today: e6.today }));
    check("fresh E4 (M-a): a cure says nothing the same day; the next day's first look says a line once, and the mark goes",
      e4.sameDay[0] === null && e4.sameDay[1] && CURED.includes(e4.nextDay[0]) && e4.nextDay[1] === null && e4.nextDay[2] === null,
      JSON.stringify({ sameDay: e4.sameDay, nextDay: e4.nextDay }));
    // Fresh-expand E8 (A-a): a first look 3 days after the last starts with a welcome and
    // has no away note; 5 hours after, no welcome.
    const WELCOME = require("vm").runInNewContext(src4.match(/\nconst WELCOME_BACK = (\[[^\n]*\]);/)[1]);
    const e8 = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const real = { heard: el._channelHeard, held: el._resumeHeld, today: el._todayLine };
      const key = `hatch-seen-${s.ids.device}`;
      const had = localStorage.getItem(key);
      const look = (agoH) => {
        localStorage.setItem(key, JSON.stringify({ seen: Date.now() - agoH * 3600e3, said: Date.now() }));
        Object.assign(s, { lookedFirst: false, queue: [], asleep: false });
        el._firstLook(s);
        const out = s.queue.map((q) => ({ text: q.text, away: !!q.away }));
        s.queue = [];
        return out;
      };
      const more = { gift: el._giftDue, take: el._giftTake, cured: el._curedLine, fav: el._favLine, promise: el._promiseLook,
        moments: s.privateMoments, welcome: el._welcomeDue, catchUp: el._catchUp };
      try {
        el._channelHeard = () => true;
        el._resumeHeld = () => false;
        el._todayLine = () => null; // the away note's own slot, not the evening's
        const out = { long: look(72), short: look(5) };
        // Audit 2026-11-01b B1: the cure, L10 and the promise leave a waiting gift its slot.
        let took = 0;
        Object.assign(el, { _giftDue: () => true, _giftTake: () => { took++; }, _curedLine: () => "cured!",
          _favLine: () => "best friends! ♥", _promiseLook: () => ({ line: "a promise ♪" }) });
        out.gift = { lines: look(1).map((q) => q.text), took };
        // B2: back after 3 days to a close friend's welcome home: one welcome, room for news.
        Object.assign(el, { _giftDue: more.gift, _giftTake: more.take, _curedLine: () => null, _favLine: () => null,
          _promiseLook: () => null, _welcomeDue: () => true, _catchUp: (sl, said, room) => (room > 0 ? [["the news ♪", Date.now(), "x"]] : []) });
        s.privateMoments = [{ type: "friend_home", at: new Date().toISOString() }];
        out.home = look(72).map((q) => q.text);
        return out;
      } finally {
        Object.assign(el, { _giftDue: more.gift, _giftTake: more.take, _curedLine: more.cured, _favLine: more.fav,
          _promiseLook: more.promise, _welcomeDue: more.welcome, _catchUp: more.catchUp });
        s.privateMoments = more.moments;
        Object.assign(el, { _channelHeard: real.heard, _resumeHeld: real.held, _todayLine: real.today });
        if (had === null) localStorage.removeItem(key); else localStorage.setItem(key, had);
        Object.assign(s, { lookedFirst: true, queue: [], sayUntil: 0, sayClass: 0 });
      }
    });
    // Fresh-expand E9: a link guest's news (L-a) is its dream today in DREAMS' words, else
    // its visitor seen today, else none (yesterday's dream isn't on the sensor); the
    // journal's head carries today's dream (J-a); status shows the evening's today line,
    // else today's dream (St-a).
    const e9 = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const real = { dream: el._dreamToday, seen: el._visitSeen, evening: el._evening, today: el._todayLine };
      const out = {};
      try {
        el._visitSeen = () => null;
        el._dreamToday = () => ({ kind: "rainbow" });
        out.dream = el._linkNews(s);
        el._dreamToday = () => null;
        out.none = el._linkNews(s);
        el._visitSeen = () => "robin";
        out.visitor = el._linkNews(s);
        el._visitSeen = () => null;
        el._dreamToday = () => ({ kind: "rainbow" });
        s.journal = true;
        await el._renderJournal(s);
        out.jdream = s.status.querySelector(".jdream")?.textContent || null;
        s.journal = false;
        el._evening = () => true;
        el._todayLine = () => "today I watched the sunset! ♪";
        el._renderStatus(s, []);
        out.evening = s.status.querySelector(".stoday")?.textContent || null;
        el._evening = () => false;
        el._renderStatus(s, []);
        out.morning = s.status.querySelector(".stoday")?.textContent || null;
      } finally {
        Object.assign(el, { _dreamToday: real.dream, _visitSeen: real.seen, _evening: real.evening, _todayLine: real.today });
        s.journal = false;
        el._renderStatus(s, []);
      }
      return out;
    });
    // Fresh-expand E14: the journal's week strip shows only the days that hold something,
    // oldest first, each labelled; a visitor (icon and name) only while finds are shown.
    const e14 = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const realState = el._state;
      const realShown = el.constructor.findsShown;
      const v = (el._worlds?.[s.worldKey]?.visitors || []).find((x) => x.name);
      const week = [
        { day: "2026-10-27", visit: v?.id }, // only a visitor: hidden with the finds
        { day: "2026-10-28", dream: true, weather: "rain" },
        { day: "2026-10-30", weather: "storm", visit: v?.id },
      ];
      el._state = function (slide, k) {
        const st = realState.call(this, slide, k);
        return k === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, week } } : st;
      };
      const strip = async (shown) => {
        el.constructor.findsShown = shown;
        s.journal = true;
        await el._renderJournal(s);
        const box = s.status.querySelector(".jweek");
        const out = { cells: [...(box?.querySelectorAll(".wday") || [])].map((c) => [c.getAttribute("aria-label"), c.textContent]),
          imgs: box?.querySelectorAll("img").length ?? -1, role: box?.getAttribute("role") };
        s.journal = false;
        return out;
      };
      try {
        return { hidden: await strip(false), shown: await strip(true), name: v?.name };
      } finally {
        el._state = realState;
        el.constructor.findsShown = realShown;
        s.journal = false;
        el._renderStatus(s, []);
      }
    });
    check("fresh E14: the week strip: filled days only, labelled, no visitor while finds are hidden; its icon and name when shown",
      JSON.stringify(e14.hidden.cells) === JSON.stringify([["wed: a dream, rain", "wed✦☂"], ["fri: a storm", "fri⚡"]]) &&
        e14.hidden.imgs === 0 && e14.hidden.role === "list" && e14.shown.cells.length === 3 &&
        e14.shown.cells[0][0] === `tue: the ${e14.name}` && e14.shown.cells[2][0] === `fri: a storm, the ${e14.name}` &&
        e14.shown.imgs === 2, JSON.stringify(e14));
    check("fresh E9 (L-a): a link guest's news is today's dream, else today's visitor, else none",
      e9.dream === "I dreamed about a rainbow!" && e9.none === null && e9.visitor === "a robin came to see me today ♪", JSON.stringify(e9));
    check("fresh E9 (J-a, St-a): the journal's head has today's dream; status has the evening's today line, else the dream",
      e9.jdream === "I dreamed about a rainbow!" && e9.evening === "today I watched the sunset! ♪" && e9.morning === "I dreamed about a rainbow!",
      JSON.stringify(e9));
    // Fresh-expand F2: a picked sea dream (the sensor has the pick) is told as a sea story at
    // a shared screen's first look; the asker's note says only the tail, once; nobody
    // else's note says anything; the story comes back once, 2-4 days later. "you": the look
    // says "my friends", the asker's note the you story and the tail.
    const STORIES = require("vm").runInNewContext(`(${src4.match(/\nconst DREAM_STORIES = (\{[\s\S]*?\n\});/)[1]})`);
    const TAILS = require("vm").runInNewContext(src4.match(/\nconst DREAM_TAIL = (\[[^\n]*\]);/)[1]);
    const f2 = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const device = s.ids.device;
      const real = { state: el._state, today: el._todayLine, catchUp: el._catchUp };
      const keys = [`hatch-dreamstory-${device}`, "hatch-shared-screen", `hatch-dream-${device}-${new Date().toDateString()}`];
      const had = keys.map((k) => localStorage.getItem(k));
      let dream = { kind: "picked", pick: "sea" };
      const houseWas = s.house;
      const out = {};
      try {
        el._state = function (sl, k) {
          const st = real.state.call(this, sl, k);
          return k === "sensor.life_stage" && st && sl === s ? { ...st, attributes: { ...st.attributes, dream } } : st;
        };
        el._todayLine = () => null;
        el._catchUp = () => []; // room for the dream: the look's own news is checked elsewhere
        const look = () => {
          localStorage.removeItem(keys[2]);
          s.house = { ...(houseWas || {}), dream: undefined };
          Object.assign(s, { lookedFirst: false, queue: [], asleep: false, sayUntil: Date.now() + 60000 });
          el._firstLook(s);
          const said = s.queue.map((q) => q.text);
          s.queue = [];
          return said;
        };
        const note = (n) => {
          s.queue = [];
          el._note(s, { kind: "dream", ...n });
          const said = s.queue.map((q) => q.text);
          s.queue = [];
          return said;
        };
        localStorage.setItem("hatch-shared-screen", "on");
        localStorage.removeItem(keys[0]);
        out.shared = look();
        localStorage.setItem("hatch-shared-screen", "off");
        out.mine = note({ pick: "sea", yours: true });
        out.theirs = note({ pick: "sea", yours: false });
        // FM Q4 A: a look with no room left the story untold here: the note tells it.
        localStorage.removeItem(keys[2]);
        out.untold = note({ pick: "sea", yours: true });
        out.untoldAgain = note({ pick: "sea", yours: true });
        out.told = JSON.parse(localStorage.getItem(keys[0]) || "null");
        // From the card's turn day (CARD_CHECK_DAY_SHIFT moves it), as the story's was kept.
        const day = (n) => new Date(Date.now() + ((Number(globalThis.__hatchDayShift) || 0) + n) * 864e5);
        out.later = [0, 1, 2, 3, 4, 5].map((n) => el._dreamCallback(s, day(n)));
        dream = { kind: "picked", pick: "you" };
        out.youLook = look();
        out.youMine = note({ pick: "you", yours: true });
        out.youTheirs = note({ pick: "you", yours: false });
        out.youKey = localStorage.getItem(keys[0]);
      } finally {
        Object.assign(el, { _state: real.state, _todayLine: real.today, _catchUp: real.catchUp });
        s.house = houseWas;
        keys.forEach((k, i) => (had[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, had[i])));
        Object.assign(s, { lookedFirst: true, queue: [], sayUntil: 0, sayClass: 0 });
      }
      return out;
    });
    const seaStory = (t) => STORIES.sea.includes(t) || /sea|wave|seal|ship|pearl|fish/.test(t || "");
    const cb = f2.later.filter(Boolean);
    check("fresh F2: a picked sea dream is a sea story at a shared look; the asker's note is the tail, nobody else's anything",
      f2.shared.some(seaStory) && f2.mine.length === 1 && TAILS.includes(f2.mine[0]) && f2.theirs.length === 0 &&
        f2.told?.pick === "sea", JSON.stringify(f2));
    check("fresh F2: the asker's note tells the story then the tail when the look didn't, once a day",
      f2.untold.length === 2 && seaStory(f2.untold[0]) && TAILS.includes(f2.untold[1]) &&
        f2.untoldAgain.length === 1 && TAILS.includes(f2.untoldAgain[0]), JSON.stringify({ untold: f2.untold, again: f2.untoldAgain }));
    check("fresh F2: the sea story comes back once, 2-4 days later; \"you\" is \"my friends\" to the look, its story and the tail to the asker",
      cb.length === 1 && cb[0] === "I keep thinking of my sea dream ♪" && !f2.later[0] && !f2.later[1] &&
        f2.youLook.includes("I dreamed about my friends ♥") && f2.youMine.length === 2 && TAILS.includes(f2.youMine[1]) &&
        !TAILS.includes(f2.youMine[0]) && f2.youTheirs.length === 0 && f2.youKey === null, JSON.stringify(f2));
    // Audit 0.43.0 F-01..F-03, card side: the evening follow-up waits for a question or
    // game (not fetched), is tried again after a failed call, and goes by the server's
    // day and evening (mine.follow_day / follow_evening), else this browser's clock.
    const fe = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const realWS = el._hass.callWS;
      const real = { heard: el._channelHeard, mine: s.mine, asking: s.asking, game: s.game, lookedFirst: s.lookedFirst,
        asleep: s.asleep, queue: s.queue, eve: s.followEve, following: s.following };
      const calls = [];
      let mode = "ok";
      el._hass.callWS = (msg) => {
        if (msg.type !== "virtual_pet/follow") return realWS.call(el._hass, msg);
        calls.push(msg);
        return mode === "fail" ? Promise.reject({ code: "unknown_error" }) : Promise.resolve(mode === "deferred" ? { deferred: true } : {});
      };
      el._channelHeard = () => true;
      const out = {};
      const base = { follow_at: ["look"] };
      const run = async (mine, extra = {}) => {
        Object.assign(s, { mine, lookedFirst: true, asleep: false, queue: [], following: false, asking: false, game: false, followRetry: 0 }, extra);
        const n = calls.length;
        el._followEvening(s);
        await new Promise((r) => setTimeout(r, 20));
        return calls.length - n;
      };
      try {
        const eve = { ...base, follow_day: "2031-05-06", follow_evening: true };
        const morning = { ...base, follow_day: "2031-05-06", follow_evening: false };
        s.followEve = undefined;
        out.asking = await run(eve, { asking: true });
        out.game = await run(eve, { game: true });
        out.askingKept = s.followEve === undefined;
        mode = "deferred"; // the server holds the evening for an open question
        out.deferred = await run(eve);
        out.deferredMarker = s.followEve === undefined;
        // The deferred try waits FOLLOW_RETRY_MS: the next tick doesn't call again.
        out.backoff = await run(eve, { followRetry: s.followRetry });
        mode = "fail";
        out.failed = await run(eve);
        out.failedMarker = s.followEve === undefined;
        mode = "ok";
        out.retried = await run(eve);
        out.marker = s.followEve;
        out.again = await run(eve);
        s.followEve = undefined;
        out.serverMorning = await run(morning); // the server says morning, whatever this browser's hour
        out.serverMorningMarker = s.followEve === undefined;
        s.followEve = "2031-05-06";
        out.sameDay = await run(eve);
        out.nextDay = await run({ ...eve, follow_day: "2031-05-07" });
        const hour = new Date().getHours();
        s.followEve = undefined;
        out.oldServer = await run(base); // no clock fields: this browser's hour, as before
        out.oldServerExpected = hour >= 19 ? 1 : 0;
        out.oldServerMarker = s.followEve === (hour >= 19 ? new Date().toDateString() : undefined);
      } finally {
        el._hass.callWS = realWS;
        el._channelHeard = real.heard;
        Object.assign(s, { mine: real.mine, asking: real.asking, game: real.game, lookedFirst: real.lookedFirst,
          asleep: real.asleep, queue: real.queue, followEve: real.eve, following: real.following, followRetry: 0 });
      }
      return out;
    });
    check("audit 0.43.0 F-01: the evening follow-up isn't fetched while a question or game is up; a deferred reply leaves the day untried and waits before the next try",
      fe.asking === 0 && fe.game === 0 && fe.askingKept && fe.deferred === 1 && fe.deferredMarker && fe.backoff === 0, JSON.stringify(fe));
    check("audit 0.43.0 F-02: a failed evening fetch leaves the day's marker unset and is tried again; once answered, no more that day",
      fe.failed === 1 && fe.failedMarker && fe.retried === 1 && fe.marker === "2031-05-06" && fe.again === 0, JSON.stringify(fe));
    check("audit 0.43.0 F-03: the evening gate and marker follow the server's day and evening; an older server's mine falls back to this browser's clock",
      fe.serverMorning === 0 && fe.serverMorningMarker && fe.sameDay === 0 && fe.nextDay === 1 &&
        fe.oldServer === fe.oldServerExpected && fe.oldServerMarker, JSON.stringify(fe));
    // Fresh-expand F1 + E13, card side (virtual_pet/follow and the answer stubbed): a big
    // day's morning and evening say their words, else the type's or the shared lines; an
    // HTML text shows as text; a soft morning says its line; a shared screen never asks
    // the server. The typed step keeps HA's shortcuts out, sends "yes" once with the
    // cleaned text (never stashed, even when the send fails), and with none on its time.
    const BIG = require("vm").runInNewContext(`(${src4.match(/\nconst BIG_DAY = (\{[\s\S]*?\n\});/)[1]})`);
    const SOFT = require("vm").runInNewContext(src4.match(/\nconst SOFT_MORNING = (\[[\s\S]*?\]);/)[1]);
    const typeLines = (key) => [...src4.matchAll(new RegExp(`${key}: \\[("[^"]*")(?:, ("[^"]*"))?\\]`, "g"))]
      .flatMap((m) => m.slice(1).filter(Boolean).map((x) => JSON.parse(x)));
    const f1 = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const realWS = el._hass.callWS;
      const sent = [];
      let reply = {};
      let answerOk = false;
      el._hass.callWS = (msg) => {
        sent.push(msg);
        if (msg.type === "virtual_pet/follow") return Promise.resolve(reply);
        if (msg.type === "virtual_pet/answer") return answerOk ? Promise.resolve({ until: "2999-12-31" }) : Promise.reject({ code: "unknown_error" });
        return realWS.call(el._hass, msg);
      };
      const shared = localStorage.getItem("hatch-shared-screen");
      const followOk = el._followOk;
      const mine = s.mine;
      const out = {};
      // Without a follow_at in their mine, no fetch (a slot is kept only then).
      s.mine = { ...(mine || {}), follow_at: [] };
      s.following = false;
      out.unasked = await el._followFetch(s);
      out.unaskedCalls = sent.length;
      s.mine = { ...(mine || {}), follow_at: ["look", "picker"] };
      const fetch = async (r) => {
        reply = r;
        s.queue = [];
        s.following = false;
        await el._followFetch(s);
        const said = s.queue.map((q) => q.text);
        return said;
      };
      const textKey = `hatch-followtext-${el._hass.user.id}`;
      const textHad = localStorage.getItem(textKey);
      const ownCopy = (kind, it) => localStorage.setItem(textKey, JSON.stringify({ kind, it, until: "2999-12-31" }));
      try {
        localStorage.setItem("hatch-shared-screen", "off");
        // Owner Q2 A: the server's words alone aren't said on a desktop browser (this one);
        // this browser's own copy (it typed them) is.
        localStorage.removeItem(textKey);
        out.notHere = await fetch({ kind: "big_day", beat: "morning", text: "your exam" });
        ownCopy("big_day", "your exam");
        out.am = await fetch({ kind: "big_day", beat: "morning", text: "your exam" });
        out.pm = await fetch({ kind: "big_day", beat: "evening", text: "your exam" });
        localStorage.removeItem(textKey); // no words anywhere: the plain lines
        out.amPlain = await fetch({ kind: "big_day", beat: "morning" });
        out.pmPlain = await fetch({ kind: "big_day", beat: "evening" });
        out.soft = await fetch({ kind: "soft", beat: "morning" });
        out.none = await fetch({});
        ownCopy("big_day", "<img src=x onerror=alert(1)>");
        await fetch({ kind: "big_day", beat: "morning", text: "<img src=x onerror=alert(1)>" });
        localStorage.removeItem(textKey);
        Object.assign(s, { sayUntil: 0, sayClass: 0 });
        el._sayQueued(s);
        out.html = { text: s.bubble.textContent, img: !!s.bubble.querySelector("img") };
        localStorage.setItem("hatch-shared-screen", "on");
        const before = sent.length;
        out.shared = await fetch({ kind: "soft", beat: "morning" });
        out.sharedCalls = sent.length - before;
        localStorage.setItem("hatch-shared-screen", "off");
        // "anything big this week?" (owner Q3 A, opp #2): "yes" asks which day, the next
        // six as buttons; a day's tap says a yes line and opens the typed step.
        el._followOk = true;
        const entity = s.ids["sensor.life_stage"];
        sent.length = 0;
        s.queue = [];
        const runAsk = () => {
          const q = s.queue.find((x) => x.ask);
          s.queue = s.queue.filter((x) => x !== q);
          q?.then();
          return q?.text;
        };
        s.asking = false;
        el._ask(s, "big_day", entity);
        const weekBox = s.screen.querySelector(".askday");
        out.week = { buttons: [...(weekBox?.querySelectorAll("button") || [])].map((b) => b.textContent) };
        weekBox?.querySelector('button[data-answer="yes"]')?.click();
        // "yes" says "which day?" at once (UX 3 F4), not after the question's minute: it is on show, not queued.
        out.week.which = s.queue.some((x) => x.ask) ? runAsk() : s.sayEntry?.text;
        const dayBox = s.screen.querySelector(".askday");
        out.week.days = [...(dayBox?.querySelectorAll("button") || [])].map((b) => [b.dataset.answer, b.textContent]);
        const ahead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
        out.week.want = [0, 1, 2, 3, 4, 5, 6].map((n) => { // today first (UX 3 F14), then the next six
          const d = ahead(n);
          return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            n === 0 ? "today" : ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()]];
        });
        Object.assign(s, { sayUntil: 0, sayClass: 0 });
        dayBox?.querySelector("button")?.click();
        out.week.reply = s.bubble.textContent;
        out.week.what = runAsk();
        const input = s.screen.querySelector(".asktext input");
        out.box = !!input && input.maxLength === 20 && input.getAttribute("enterkeyhint") === "done";
        let leaked = 0;
        const onKey = () => leaked++;
        document.addEventListener("keydown", onKey);
        input?.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true, composed: true }));
        document.removeEventListener("keydown", onKey);
        out.leaked = leaked;
        if (input) input.value = "  my\u200b exam!! ";
        Object.assign(s, { sayUntil: 0, sayClass: 0 });
        s.screen.querySelector(".asktext button")?.click(); // ok
        await new Promise((r) => setTimeout(r, 50));
        out.sent = sent.filter((m) => m.type === "virtual_pet/answer");
        out.kept = s.bubble.textContent;
        // Opp #1: the big day's evening asks how it went, naming it from this browser's
        // own copy only; how_day's buttons; "tough" goes to the server as big_how's.
        ownCopy("big_day", "your exam");
        out.how = { own: el._askLine("big_how") };
        localStorage.removeItem(textKey);
        out.how.plain = el._askLine("big_how");
        sent.length = 0;
        s.asking = false;
        el._ask(s, "big_how", entity);
        const howBox = s.screen.querySelector(".askday");
        out.how.buttons = [...(howBox?.querySelectorAll("button") || [])].map((b) => b.textContent);
        howBox?.querySelector('button[data-answer="tough"]')?.click();
        out.how.sent = sent.filter((m) => m.type === "virtual_pet/answer").map((m) => [m.question, m.answer]);
        sent.length = 0;
        // Audit s2635 H1: the evening beat brings the ask; it's asked in the follow slot
        // with their words (this browser's copy), and while another ask is up the plain
        // evening line is said instead.
        ownCopy("big_day", "your exam");
        s.asking = false;
        const eve = { kind: "big_day", beat: "evening", ask: "big_how", text: "your exam" };
        reply = eve;
        s.queue = [];
        s.following = false;
        await el._followFetch(s);
        const eveAsk = s.queue.find((q) => q.ask);
        out.eve = { text: eveAsk?.text, lines: s.queue.length };
        s.queue = [];
        eveAsk?.then();
        out.eve.buttons = [...(s.screen.querySelector(".askday")?.querySelectorAll("button") || [])].map((b) => b.textContent);
        s.screen.querySelector(".askday")?.remove();
        // Another ask is up. The card doesn't fetch an evening beat then (audit 0.43.0 F-01),
        // so the server's clock says "not evening" here: the reply's own fallback (an ask
        // that came up during the call) is what's tested.
        const mineWas = s.mine;
        s.mine = { ...s.mine, follow_day: "2031-05-06", follow_evening: false };
        s.asking = true;
        out.eve.busy = await fetch(eve);
        s.asking = false;
        s.mine = mineWas;
        localStorage.removeItem(textKey);
        // M1: at a first look, kept words past their day (or unreadable) go, any person's;
        // a current one stays.
        const sweepKeys = { old: "hatch-followtext-old-user", bad: "hatch-followtext-bad-user", now: "hatch-followtext-now-user" };
        localStorage.setItem(sweepKeys.old, JSON.stringify({ kind: "big_day", it: "your biopsy", until: "2020-01-01" }));
        localStorage.setItem(sweepKeys.bad, "{not json");
        localStorage.setItem(sweepKeys.now, JSON.stringify({ kind: "weekend", it: "the fair", until: "2999-12-31" }));
        const heard = el._channelHeard;
        el._channelHeard = () => true;
        const followAt = s.mine;
        s.mine = { ...(mine || {}), follow_at: [] }; // the sweep alone, no beat fetched
        Object.assign(s, { lookedFirst: false, queue: [], asleep: false });
        try { el._firstLook(s); } finally { el._channelHeard = heard; s.queue = []; s.lookedFirst = true; s.mine = followAt; }
        out.sweep = Object.fromEntries(Object.entries(sweepKeys).map(([k, key]) => [k, localStorage.getItem(key) !== null]));
        Object.values(sweepKeys).forEach((key) => localStorage.removeItem(key));
        out.stash = Object.keys(localStorage).filter((k) => k.startsWith("hatch-answers-"));
        out.boxGone = !s.screen.querySelector(".asktext");
        // Kept: "I'll remember" only once the server took it (critique #7).
        answerOk = true;
        Object.assign(s, { sayUntil: 0, sayClass: 0 });
        el._askTextStart(s, entity);
        s.queue.find((q) => q.ask)?.then();
        s.screen.querySelector(".asktext button")?.click();
        await new Promise((r) => setTimeout(r, 50));
        out.keptOk = s.bubble.textContent;
        answerOk = false;
        sent.length = 0;
        el._askTextStart(s, entity);
        s.textStep.until = 0;
        el._askTextEnd(s); // what the tick does once its time is up
        out.timeout = sent.filter((m) => m.type === "virtual_pet/answer");
        // F5: the weekend's typed step sends its own question.
        sent.length = 0;
        answerOk = true; // kept: this browser keeps its own copy of the words (Q1 A)
        el._askTextStart(s, entity, "weekend");
        s.queue.find((q) => q.ask)?.then();
        const wkInput = s.screen.querySelector(".asktext input");
        if (wkInput) wkInput.value = "the fair";
        s.screen.querySelector(".asktext button")?.click();
        await new Promise((r) => setTimeout(r, 50));
        out.weekendSent = sent.filter((m) => m.type === "virtual_pet/answer");
        answerOk = false;
        s.queue = [];
        // F5 Monday; F7 a trick shown (with the move, in its idle list today), skipped
        // when LS-a's monthly line was said here today.
        out.kept = { copy: JSON.parse(localStorage.getItem(textKey) || "null") };
        out.monServerOnly = await fetch({ kind: "weekend", beat: "monday" }); // the copy fills it
        out.mon = await fetch({ kind: "weekend", beat: "monday", text: "the fair" });
        localStorage.removeItem(textKey);
        out.monPlain = await fetch({ kind: "weekend", beat: "monday" });
        s.followTrick = null;
        s.trickSaid = null;
        out.shown = await fetch({ kind: "trick", beat: "shown" });
        out.trick = { follow: s.followTrick, idle: el._tricks(s), toShow: el._trickToShow(s) };
        s.trickSaid = new Date().toDateString();
        out.shownSkipped = await fetch({ kind: "trick", beat: "shown" });
        s.trickSaid = null;
        // F6: the game picked yesterday leads the picker and says its line.
        reply = { kind: "game", beat: "day", choice: "dig" };
        s.followGame = null;
        el._startGame(s, s.buttons.play);
        await new Promise((r) => setTimeout(r, 100));
        out.picker = {
          first: s.gameBox.querySelector(".gpick button")?.dataset.game,
          prompt: s.game?.prompt, wide: el._slideW >= 300,
          calls: sent.filter((m) => m.type === "virtual_pet/follow" && m.at === "picker").length,
          ofDay: el._gameOfDay(s),
        };
        el._quitGame(s, null);
      } finally {
        el._hass.callWS = realWS;
        el._followOk = followOk;
        s.mine = mine;
        if (textHad === null) localStorage.removeItem(textKey); else localStorage.setItem(textKey, textHad);
        if (shared === null) localStorage.removeItem("hatch-shared-screen"); else localStorage.setItem("hatch-shared-screen", shared);
        Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0, asking: false, textStep: null, followTrick: null, followGame: null });
      }
      return out;
    });
    const WKND = require("vm").runInNewContext(`(${src4.match(/\nconst WEEKEND = (\{[\s\S]*?\n\});/)[1]})`);
    const TRK = require("vm").runInNewContext(`(${src4.match(/\nconst TRICK_ASK = (\{[\s\S]*?\n\});/)[1]})`);
    const GTM = require("vm").runInNewContext(`(${src4.match(/\nconst GAME_TOMORROW = (\{[\s\S]*?\n\});/)[1]})`);
    check("fresh F1: no follow_at in the viewer's mine, no fetch",
      f1.unasked === null && f1.unaskedCalls === 0, JSON.stringify({ unasked: f1.unasked, calls: f1.unaskedCalls }));
    check("owner Q1/Q2: the typing browser keeps its words to the event's end and fills a reply without them; the server's alone aren't said on a desktop",
      f1.kept.copy?.kind === "weekend" && f1.kept.copy?.it === "the fair" && f1.kept.copy?.until === "2999-12-31" &&
        WKND.monText.map((f) => f("the fair")).includes(f1.monServerOnly[0]) &&
        [...BIG.am, ...typeLines("bigday_am")].includes(f1.notHere[0]),
      JSON.stringify({ kept: f1.kept, filled: f1.monServerOnly, notHere: f1.notHere }));
    check("fresh F5: the weekend's typed step sends weekend yes with the text; Monday says their words, else a Monday line",
      f1.weekendSent.length === 1 && f1.weekendSent[0].question === "weekend" && f1.weekendSent[0].text === "the fair" &&
        WKND.monText.map((f) => f("the fair")).includes(f1.mon[0]) && WKND.mon.includes(f1.monPlain[0]),
      JSON.stringify({ sent: f1.weekendSent, mon: f1.mon, plain: f1.monPlain }));
    check("fresh F7: a trick shown says its line and joins today's idle moves; none after LS-a's line here today",
      TRK.shown.includes(f1.shown[0]) && f1.trick.follow?.move === f1.trick.toShow && f1.trick.idle.includes(f1.trick.toShow) &&
        f1.shownSkipped.length === 0, JSON.stringify({ shown: f1.shown, trick: f1.trick, skipped: f1.shownSkipped }));
    check("fresh F6: yesterday's pick leads the picker (over the daily pick) and its line is the wide prompt",
      f1.picker.calls === 1 && f1.picker.first === "dig" && f1.picker.ofDay === "dig" &&
        (!f1.picker.wide || GTM.day.includes(f1.picker.prompt)), JSON.stringify(f1.picker));
    const withIt = (fns) => fns.map((f) => f("your exam"));
    check("fresh F1: a big day's morning and evening say their words, else the type's or shared lines; HTML shows as text",
      f1.am.length === 1 && withIt(BIG.amText).includes(f1.am[0]) && withIt(BIG.pmText).includes(f1.pm[0]) &&
        [...BIG.am, ...typeLines("bigday_am")].includes(f1.amPlain[0]) && [...BIG.pm, ...typeLines("bigday_pm")].includes(f1.pmPlain[0]) &&
        !f1.html.img && f1.html.text.includes("<img") && f1.none.length === 0, JSON.stringify(f1));
    check("fresh E13: a soft morning says a soft line; a shared screen asks the server nothing and says nothing",
      [...SOFT, ...typeLines("soft"), "*snuggle* hi hi ♥"].includes(f1.soft[0]) && f1.shared.length === 0 && f1.sharedCalls === 0,
      JSON.stringify({ soft: f1.soft, shared: f1.shared, calls: f1.sharedCalls }));
    check("owner Q3 opp #2: anything big this week? yes / not really; which day? today, then the next six by name; a day's tap cheers, asks what, sends its date",
      f1.week.buttons.join() === "yes,not really" && f1.week.which === BIG.which &&
        JSON.stringify(f1.week.days) === JSON.stringify(f1.week.want) && BIG.yes.includes(f1.week.reply) &&
        f1.week.what === BIG.what && f1.sent[0]?.day === f1.week.want[0][0], JSON.stringify({ week: f1.week, sent: f1.sent }));
    check("audit s2635 H1: the big day's evening beat is its ask, with their words, how_day's buttons; another ask up: the plain evening line",
      f1.eve.text === BIG.howText("your exam") && f1.eve.lines === 1 && f1.eve.buttons.join() === "great,ok,tough" &&
        f1.eve.busy.length === 1 && BIG.pmText.map((f) => f("your exam")).includes(f1.eve.busy[0]), JSON.stringify(f1.eve));
    check("audit s2635 M1: a first look sweeps kept words past their day and unreadable ones, keeps a current one",
      !f1.sweep.old && !f1.sweep.bad && f1.sweep.now, JSON.stringify(f1.sweep));
    check("owner Q3 opp #1: the big day's evening asks how it went (its words only from this browser), how_day's buttons, tough sent as big_how's",
      f1.how.own === BIG.howText("your exam") && f1.how.plain === BIG.how && f1.how.buttons.join() === "great,ok,tough" &&
        JSON.stringify(f1.how.sent) === JSON.stringify([["big_how", "tough"]]), JSON.stringify(f1.how));
    check("fresh F1: the typed step keeps HA's keys, sends yes once with the cleaned text, says it'll remember only once kept, stashes nothing; its time sends no text",
      f1.box && f1.leaked === 0 && f1.sent.length === 1 && f1.sent[0].question === "big_day" && f1.sent[0].answer === "yes" &&
        f1.sent[0].text === "my exam" && f1.kept !== BIG.kept && f1.keptOk === BIG.kept && f1.stash.length === 0 && f1.boxGone &&
        f1.timeout.length === 1 && !("text" in f1.timeout[0]), JSON.stringify({ ...f1, am: undefined }));
    check("fresh E8 (A-a): back after 3 days, the look starts with a welcome and has no away note; after 5 h, none",
      WELCOME.includes(e8.long[0]?.text) && !e8.long.some((q) => q.away) && !e8.short.some((q) => WELCOME.includes(q.text)),
      JSON.stringify(e8));
    check("audit B1: the cure, L10 and the promise leave a waiting gift its first-look slot",
      e8.gift.took === 1 && e8.gift.lines.length === 2 && e8.gift.lines[0] === "cured!" && !e8.gift.lines.includes("a promise ♪"),
      JSON.stringify(e8.gift));
    check("audit B2: back after days to a close friend's welcome home: one welcome, and the news still fits",
      e8.home.some((t) => /^welcome home, /.test(t)) && !e8.home.some((t) => WELCOME.includes(t)) && e8.home.includes("the news ♪"),
      JSON.stringify(e8.home));
  }

  // ha-signals H8: virtual_pet.react's house moments, by category. Each says a line of its
  // own pool (HOUSE_MOMENT_LINES) with its reaction's move and its house effect; Custom says
  // the player's words or its reaction's line; the card's categories are const.py's.
  {
    const constPy = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "const.py"), "utf8");
    const pyCats = [...(/^HOUSE_CATEGORIES = \(([^)]*)\)/m.exec(constPy)?.[1] || "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    const cardCats = await card.evaluate((el) => el.constructor.houseCategories || []);
    check("H8: the card's house categories are const.py's HOUSE_CATEGORIES (no garage door)",
      pyCats.length === 16 && JSON.stringify(pyCats) === JSON.stringify(cardCats) && !cardCats.some((c) => /garage/.test(c)),
      `${pyCats} | ${cardCats}`);
    const h8 = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const kept = { game: s.game, calling: s.calling };
      let said = [], moves = [], fxs = [];
      // Every line this moment says, at once with its move and effect (no queue, no wait).
      el._line = function (slide, cls, text, ms, opts) { if (slide === s) { said.push(text); opts?.then?.(); } };
      el._animate = function (slide, node, cls) { moves.push(cls); };
      el._houseFx = function (slide, cls) { fxs.push(cls); };
      const run = (m) => {
        said = []; moves = []; fxs = [];
        el._moment(s, { at: new Date().toISOString(), ...m });
        return { said, moves, fxs };
      };
      const out = {};
      try {
        s.game = null;
        s.calling = false;
        for (const c of el.constructor.houseCategories) if (c !== "custom") out[c] = run({ type: "house_moment", category: c });
        out.live = run({ type: "house_live", category: "coffee" });
        out.words = run({ type: "house_moment", category: "custom", reaction: "dance", text: "the bread's ready ♪" });
        out.bare = run({ type: "house_moment", category: "custom", reaction: "cozy" });
        out.odd = run({ type: "house_moment", category: "custom", reaction: "wiggle" });
        out.washerWords = run({ type: "house_moment", category: "washer", text: "sneaky words" });
        out.unknown = run({ type: "house_moment", category: "garage" });
        s.game = { kind: "left_right" };
        out.inGame = run({ type: "house_moment", category: "timer" });
      } finally {
        delete el._line; delete el._animate; delete el._houseFx;
        Object.assign(s, kept);
      }
      return { out, pools: el.constructor.houseMomentLines };
    });
    // The reaction and effect each category should have (plan H8, review s2643 section C).
    const REACT = { heater: "cozy", ac: "cozy", fan: "hop", washer: "cheer", dryer: "cheer", dishwasher: "cheer",
      oven: "cheer", coffee: "hop", printer: "cheer", ev: "cheer", feeder: "hop", plants: "cozy", delivery: "startle",
      timer: "startle", internet: "dance" };
    const MOVE = { hop: "greethop", cheer: "bighop", cozy: "settle", dance: "jig", startle: "startle" };
    const FX = { heater: "fx-heat", ac: "fx-cool", fan: "fx-cool", washer: "fx-suds", dishwasher: "fx-suds", dryer: "fx-tumble" };
    const wrong = Object.entries(REACT).filter(([c, r]) => {
      const o = h8.out[c];
      return !o || o.said.length !== 1 || !(h8.pools[c] || []).includes(o.said[0]) || o.moves[0] !== MOVE[r] ||
        o.fxs.join() !== (FX[c] || "") || h8.pools[c].length < 2 || h8.pools[c].length > 3;
    }).map(([c]) => `${c}: ${JSON.stringify(h8.out[c])}`);
    check("H8: each category says a line of its own 2-3, with its reaction's move and its effect",
      wrong.length === 0 && Object.keys(h8.out).length >= 15, wrong.join(" | "));
    const o = h8.out;
    check("H8: Custom says the player's words (dance), else its reaction's line; an odd reaction hops",
      o.words.said.join() === "the bread's ready ♪" && o.words.moves[0] === "jig" &&
        h8.pools.custom.cozy.includes(o.bare.said[0]) && o.bare.moves[0] === "settle" &&
        h8.pools.custom.hop.includes(o.odd.said[0]), JSON.stringify([o.words, o.bare, o.odd]));
    check("H8: a channel-only house_live says its category's line; a category's moment never says words; garage and a game say nothing",
      h8.pools.coffee.includes(o.live.said[0]) && h8.pools.washer.includes(o.washerWords.said[0]) &&
        !o.washerWords.said.includes("sneaky words") && o.unknown.said.length === 0 && o.inGame.said.length === 0,
      JSON.stringify([o.live, o.washerWords, o.unknown, o.inGame]));
    // The sensor's route, as the server publishes it: a dishwasher, its line in the bubble.
    await card.evaluate((el) => Object.assign(el._slides[el._index], { sayUntil: 0, sayClass: 0, sayEntry: null, queue: [], game: null }));
    await inject(pet["sensor.last_care"], {
      attributes: { moments: [{ type: "house_moment", category: "dishwasher", at: new Date().toISOString() }] },
    });
    await page.waitForTimeout(500);
    const dish = await bubble();
    check("H8: a dishwasher's house moment from the sensor says its line", h8.pools.dishwasher.includes(dish), dish);
    await shot("05-house_moment");
  }

  await unpinAwake(card);
  }
  if (enter("photos")) {
  // 4b. A best friend's photo (phase 4). The viewer's photos come from the
  // virtual_pet/photos command, stubbed here with two generations.
  const PHOTOS = [
    { generation: 1, name: "Checkfrog", species: "treefrog", stage: "teen", on: "2026-03-07",
      traits: ["storm_watcher", "music_lover", "helper"] },
    { generation: 2, name: "Checkbird", species: "bird", stage: "adult", on: "2026-10-28",
      traits: ["moon_child", "snow_child", "fireside"] },
  ];
  const stubPhotos = (photos) => page.locator("hatch-pet-card").evaluate((el, photos) => {
    window.__realWS ??= el._hass.callWS.bind(el._hass);
    el._hass.callWS = (msg) => (msg.type === "virtual_pet/photos" ? Promise.resolve({ photos }) : window.__realWS(msg));
  }, photos);
  const unstub = () => page.locator("hatch-pet-card").evaluate((el) => {
    if (window.__realWS) el._hass.callWS = window.__realWS;
  });
  await stubPhotos(PHOTOS);
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  await cur().locator(".jlink").click();
  await cur().locator(".status .print img").nth(1).waitFor({ timeout: 10000 }).catch(() => {});
  const prints = await cur().locator(".status .print").evaluateAll((els) => els.map((f) => ({
    src: f.querySelector("img").getAttribute("src"), alt: f.querySelector("img").alt,
    label: f.querySelector("button").getAttribute("aria-label"), gen: f.querySelector("button").dataset.gen,
  })));
  check("the journal shows a print per generation, oldest first",
    prints.length === 2 && prints.every((p) => p.src.startsWith("blob:")) && prints[0].gen === "1" &&
    prints[1].label === "save the photo of Checkbird, generation 2" && /photo of Checkfrog, best friends, .*2026/.test(prints[0].alt),
    JSON.stringify(prints.map((p) => p.alt)));
  await shot("05b-photos-row");
  // The canvas: drawn with every image and the font in, the sprite really there
  // (its area differs from the same photo drawn without it), and the backdrop.
  const canvasCheck = await page.locator("hatch-pet-card").evaluate(async (el, photo) => {
    const a = await el._renderPhoto(photo);
    const b = await el._renderPhoto(photo, { sprite: false });
    const px = (c, x, y) => [...c.getContext("2d").getImageData(x * 2, y * 2, 1, 1).data];
    let differ = 0;
    for (let y = 160; y < 280; y += 4) {
      for (let x = 100; x < 200; x += 4) if (px(a, x, y).join() !== px(b, x, y).join()) differ++;
    }
    const sky = px(a, 150, 30); // the backdrop, above the pet
    return { differ, sky, cream: px(a, 4, 4), font: document.fonts.check("22px Tiny5"), size: [a.width, a.height] };
  }, PHOTOS[1]);
  check("a photo has the pet, its backdrop and its frame", canvasCheck.differ > 40 && canvasCheck.font &&
    canvasCheck.sky.join() !== canvasCheck.cream.join() && canvasCheck.sky[3] === 255 &&
    canvasCheck.size.join() === "600,760", JSON.stringify(canvasCheck));
  // Screenshots of three prints, each with traits on its head, in the air and on the ground.
  const printsOut = await page.locator("hatch-pet-card").evaluate(async (el, photos) => {
    const out = [];
    for (const photo of photos) out.push((await el._renderPhoto(photo)).toDataURL("image/png"));
    return out;
  }, [...PHOTOS, { generation: 3, name: "Checkmew", species: "kitten", stage: "teen", on: "2026-12-24",
    traits: ["early_bird", "social_butterfly", "player"] }]);
  printsOut.forEach((url, i) => fs.writeFileSync(path.join(OUT, `05c-photo-${["treefrog", "bird", "kitten"][i]}.png`),
    Buffer.from(url.split(",")[1], "base64")));
  // "save" with no share sheet: the picture in a dialog, to press and hold, and a download link.
  const saved = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const share = navigator.share;
    const canShare = navigator.canShare;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    s.status.querySelector('.psave[data-gen="2"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const dialog = el.shadowRoot.querySelector(".photo-dialog");
    const link = dialog?.querySelector(".pdownload");
    const out = {
      open: !!dialog?.open, modal: !!dialog?.matches(":modal"), img: dialog?.querySelector(".pbig").src.startsWith("blob:"),
      hint: dialog?.querySelector("p").textContent, download: link?.download, hidden: link?.hidden,
      computer: getComputedStyle(dialog?.querySelector(".pcomputer")).display,
    };
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
    return out;
  });
  check("save without a share sheet shows the picture to press and hold, and a download",
    saved.open && saved.modal && saved.img && saved.hint === "press and hold the picture to save it" &&
    saved.download === "Checkbird-best-friends.png" && saved.hidden === false && saved.computer === "none",
    JSON.stringify(saved));
  await page.screenshot({ path: path.join(OUT, "05d-photo-save.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = await page.locator("hatch-pet-card").evaluate((el) => ({
    open: el.shadowRoot.querySelector(".photo-dialog").open,
    focus: el.shadowRoot.activeElement?.dataset?.gen,
  }));
  check("the dialog closes with Escape, back on its save", !closed.open && closed.focus === "2", JSON.stringify(closed));
  // In a companion app the download link is hidden for real (computed style, not the property).
  const inApp = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const share = navigator.share;
    const canShare = navigator.canShare;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Home Assistant/2026.10", configurable: true });
    el._slides[el._index].status.querySelector('.psave[data-gen="2"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const link = el.shadowRoot.querySelector(".photo-dialog .pdownload");
    const out = { display: getComputedStyle(link).display, hidden: link.hidden };
    el.shadowRoot.querySelector(".photo-dialog").close();
    delete navigator.userAgent; // back to the prototype's
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
    return out;
  });
  check("in the companion app the download link is not displayed", inApp.hidden && inApp.display === "none", JSON.stringify(inApp));
  // The Android app can't save it from the page: the dialog says so; the iPhone app's doesn't.
  const appLine = (ua) => page.locator("hatch-pet-card").evaluate(async (el, ua) => {
    const share = navigator.share;
    const canShare = navigator.canShare;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
    el._slides[el._index].status.querySelector('.psave[data-gen="2"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const line = el.shadowRoot.querySelector(".photo-dialog .pcomputer");
    const out = { display: getComputedStyle(line).display, text: line.textContent };
    el.shadowRoot.querySelector(".photo-dialog").close();
    delete navigator.userAgent;
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
    return out;
  }, ua);
  const android = await appLine("Mozilla/5.0 (Linux; Android 15; Pixel 8) Home Assistant/2026.10.1-1");
  const iphone = await appLine("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.10");
  check("the Android app's photo dialog says to save it from a computer; the iPhone app's doesn't",
    android.display !== "none" && android.text === "you can save it from a computer" && iphone.display === "none",
    JSON.stringify({ android, iphone }));
  // A shared screen shows no photo, and forgets them.
  const shared = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const urls = [...(s.photos?.values() || [])].map((p) => p.url);
    localStorage.setItem("hatch-shared-screen", "off");
    s.journal = false;
    s.settings = true; // the switch lives in the settings sheet
    el._renderStatus(s, []);
    s.status.querySelector(".bell.shared").click(); // on
    s.settings = false;
    s.journal = true;
    el._loadPhotos(s);
    await el._renderJournal(s);
    await new Promise((r) => setTimeout(r, 400));
    const out = { prints: s.status.querySelectorAll(".print").length, kept: s.photos, urls: urls.length };
    // A revoked URL no longer loads.
    out.revoked = await fetch(urls[0]).then(() => false, () => true);
    localStorage.setItem("hatch-shared-screen", "off");
    return out;
  });
  check("a shared screen shows no photos and forgets them", shared.prints === 0 && shared.kept === null &&
    shared.urls === 2 && shared.revoked, JSON.stringify(shared));
  await unstub();
  // The note at the next look.
  const photoLine = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    s.queue = [];
    el._note(s, { kind: "photo" });
    const out = s.queue.map((q) => q.text);
    s.queue = [];
    return out;
  });
  check("the pet says it made you something", photoLine.join() === "i made you something! it's in your journal ♥",
    photoLine.join());
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);

  // Baby talk (phase 5): simpler lines while a pet is a baby or child, for a
  // person who turned it on. The stage (and the viewer) are stubbed in-page,
  // so a drifted pet or the coordinator's next update can't change the line.
  {
    // The tables, read from the card's source: the no-nagging words, repeats,
    // asks only on call lines, the fit with the longest sound, real keys.
    const vm = require("vm");
    const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const literal = (name) => vm.runInNewContext(`(${src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`))[1]})`);
    const BABY = literal("BABY");
    const normal = { REFUSALS: literal("REFUSALS"), WISHES: literal("WISHES") };
    const seasons = [...src.matchAll(/key: "(halloween|thanksgiving|winter)"/g)].map((m) => m[1]);
    const card = new Set(["greet", "greet.warm", "greet.nickname", "idle.sleepy", "idle.bored", "idle.excited", "idle.hungry",
      "idle.dirty", "idle.default", "yum", "favourite_snack", "wish_granted", "friend_home", "care_miss", "tucked_in", "bond_up",
      "visit", "find", "gift", "link_host", "link_guest", "soft"]); // link_*: the infrared link (2b); find: the basket's reveal; gift: V7
    // soft: E13's softer morning (_followLine), a baby's or child's own
    // The mood line's keys (sensor.mood reason_key), from the model's own tables.
    const py = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "model.py"), "utf8");
    const keysOf = (name) => [...py.split(`\n${name} = {`)[1].split("\n}")[0].matchAll(/"(\w+)":/g)].map((m) => m[1]);
    const reasons = new Set([...keysOf("_CALL_REASONS").map((k) => `call_${k}`), ...keysOf("_MOOD_REASONS"), "sleepy_drowsy", "sleepy_low"]);
    const longName = "Wwwwwwwwwwwwwwww"; // 16, as short() leaves a name or food
    const bad = [];
    for (const [key, stages] of Object.entries(BABY)) {
      const [table, sub] = key.split(".");
      const known = card.has(key) || (normal[table] && sub in normal[table]) ||
        (table === "season" && seasons.includes(sub)) || (table === "reason" && reasons.has(sub));
      if (!known) bad.push(`${key}: no such line`);
      for (const [stage, lines] of Object.entries(stages)) {
        if (!["baby", "child"].includes(stage)) bad.push(`${key}: stage ${stage}`);
        for (const entry of lines) {
          const line = typeof entry === "function" ? entry(longName) : entry;
          const words = line.toLowerCase().match(/[a-z']+/g) || [];
          const call = /^reason\.call_/.test(key);
          if (/!!!/.test(line)) bad.push(`${key}: "${line}" !!!`);
          if (/\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i.test(line)) bad.push(`${key}: "${line}" nags`);
          // "la la la" is a song (the owner's line), not a word said three times.
          if (words.some((w, i) => i > 1 && w !== "la" && w === words[i - 1] && w === words[i - 2])) bad.push(`${key}: "${line}" three in a row`);
          if (line.includes("?") && !call) bad.push(`${key}: "${line}" asks`);
          if (call && !/call_happiness$/.test(key) && new Set(words).size < words.length) bad.push(`${key}: "${line}" repeats`);
          if ("squeak squeak!!".length + 1 + line.length > 60) bad.push(`${key}: "${line}" too long`);
        }
      }
    }
    check("baby talk lines: no nagging, asks only on calls, short enough, every key real", bad.length === 0, bad.join(" | "));
  }
  if (await cur().locator(".screen.show-status").count()) await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  { // each check's results stay in here
    const babyAs = (fn, arg) => page.locator("hatch-pet-card").evaluate(async (el, { fn, arg }) => {
      const s = el._slides[el._index];
      const realState = el._state;
      const realHass = el._hass;
      const me = realHass.user.id;
      const keep = { voicedAt: s.voicedAt, queue: s.queue, catchCount: s.catchCount, asleep: s.asleep, calling: s.calling };
      const visit = el._visit;
      el._visit = () => {}; // friend_home looks in again: not in these checks
      // Free to talk, whatever the dev pet is doing.
      Object.assign(s, { asleep: false, calling: false, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0 });
      const t = {
        stage: (stage) => {
          el._state = function (slide, key) {
            const st = realState.call(this, slide, key);
            return key === "sensor.life_stage" && st ? { ...st, state: stage } : st;
          };
        },
        as: (userId) => { el._hass = { ...realHass, user: { ...realHass.user, id: userId } }; },
        cache: (value) => (value === null ? localStorage.removeItem(`hatch-baby-talk-${me}`)
          : localStorage.setItem(`hatch-baby-talk-${me}`, value)),
        greet: () => {
          localStorage.removeItem(`hatch-greet-${el._hass.user.id}-${s.ids?.device}`);
          s.greeted = false; s.sayUntil = 0; s.queue = []; s.voicedAt = Date.now() + 1e9;
          el._greet(s); el._stopTyping(s);
          return s.bubble.textContent;
        },
        idle: (mood) => { // with reduced motion on, the only idle move is a mumble
          const saved = { moodState: s.moodState, drawn: s.drawn };
          Object.assign(s, { moodState: mood, drawn: "adult", sayUntil: 0, nextIdle: 1, poseUntil: 0, movingUntil: 0 });
          s.plain = undefined;
          const shelf = el._slides;
          el._slides = [s]; // no neighbour lines (gaps-seams 5b, checked on their own)
          el._idle(s);
          el._slides = shelf;
          const out = s.plain === undefined ? "" : s.bubble.textContent;
          Object.assign(s, saved, { sayUntil: 0 });
          return out;
        },
        // What a moment says: a line said at once (2a) first, then any queued, each with its opts.
        said: (fn2) => {
          s.queue = []; s.sayUntil = 0; s.sayEntry = null;
          fn2();
          const q = [...(s.sayEntry ? [s.sayEntry] : []), ...s.queue].map((x) => ({ text: x.text, opts: x.opts }));
          s.queue = [];
          return q;
        },
      };
      try {
        return await new Function("el", "s", "t", "arg", `return (${fn})(el, s, t, arg);`)(el, s, t, arg);
      } finally {
        el._state = realState;
        el._hass = realHass;
        el._visit = visit;
        Object.assign(s, keep);
        s.sayUntil = 0;
        el._stopTyping(s);
      }
    }, { fn: fn.toString(), arg });
    // The dev user's bond may be close (the warm lines join in); never a nickname here.
    const NORMAL_GREET = /^(morning|hi|evening), Dev!$|^Dev!! hi!$|^Dev! I missed you ♥$|^yay, Dev's here!$/;
    const BABY_GREET = /^hi hi, Dev!$|^Dev!! hi hi!$|^Dev!! ♥$|^yay yay, Dev!$/;
    // Off (as it starts): a baby's greeting and idle lines are the normal ones.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const off = await babyAs(async (el, s, t) => {
      t.cache(null);
      t.stage("baby");
      return { greet: t.greet(), idle: t.idle("excited"), row: s.status.querySelectorAll(".bell.babytalk").length };
    });
    check("baby talk starts off: a baby's greeting and idle lines are the normal ones",
      NORMAL_GREET.test(off.greet) && ["hehe!", "wheee"].includes(off.idle), JSON.stringify(off));
    // The cache, set before the first greeting: it already knows (no visit yet).
    const on = await babyAs(async (el, s, t) => {
      t.cache("on");
      const out = {};
      for (const stage of ["baby", "child", "teen", "adult"]) {
        t.stage(stage);
        out[stage] = { greet: t.greet(), idle: t.idle("excited"), sleepy: t.idle("sleepy") };
      }
      t.stage("baby");
      s.voicedAt = 0; // the sound in front
      localStorage.removeItem(`hatch-greet-${el._hass.user.id}-${s.ids?.device}`);
      s.greeted = false; s.sayUntil = 0;
      el._greet(s); el._stopTyping(s);
      out.voiced = s.bubble.textContent;
      out.sound = s.species?.voice?.sound;
      t.as("someone-else"); // another person on this browser
      out.other = t.greet();
      t.cache(null);
      return out;
    });
    check("baby talk on, a baby: baby greeting and idle lines, the greeting with its sound",
      BABY_GREET.test(on.baby.greet) && ["hehe!", "yay yay!"].includes(on.baby.idle) &&
      ["*yawn*", "sleepy...", "nap time..."].includes(on.baby.sleepy) &&
      [`${on.sound}! hi hi, Dev!`, `${on.sound} ${on.sound}!! Dev!! hi hi!`, `${on.sound} ${on.sound}!! Dev!! ♥`, "yay yay, Dev!"]
        .includes(on.voiced),
      JSON.stringify(on));
    check("baby talk on: a child, a teen and an adult greet and idle in the normal words",
      ["child", "teen", "adult"].every((st) => NORMAL_GREET.test(on[st].greet) && ["hehe!", "wheee"].includes(on[st].idle)),
      JSON.stringify([on.child, on.teen, on.adult]));
    check("baby talk is kept per person: another person on this browser hears the normal lines",
      NORMAL_GREET.test(on.other), on.other);
    await page.emulateMedia({ reducedMotion: null });
    // Two cards on one pet, signed in as two people (one on, one off): different lines.
    const two = await babyAs(async (el, s, t) => {
      localStorage.setItem("hatch-baby-talk-person-a", "on");
      localStorage.setItem("hatch-baby-talk-person-b", "off");
      t.stage("baby");
      const out = {};
      for (const who of ["person-a", "person-b"]) {
        t.as(who);
        out[who] = el._lines(s, "care_miss", "...oh, there you are ♥").text;
      }
      localStorage.removeItem("hatch-baby-talk-person-a");
      localStorage.removeItem("hatch-baby-talk-person-b");
      return out;
    });
    check("two people on one pet, one with baby talk: each reads their own line",
      two["person-a"] === "oh! hi hi ♥" && two["person-b"] === "...oh, there you are ♥", JSON.stringify(two));
    // The mood line, by its reason_key: baby and child words; the house, the
    // weight, an unknown key and an older integration (no key) keep the sentence.
    const moodLine = await babyAs(async (el, s, t) => {
      const say = (key, reason) => el._say(s, { state: "calling", attributes: { reason, ...(key ? { reason_key: key } : {}) } }, false);
      const out = {};
      t.cache("on");
      for (const stage of ["baby", "child", "teen", "adult"]) {
        t.stage(stage);
        out[stage] = [say("call_hunger", "tummy rumbling!"), say("call_sick", "feeling sick, medicine please?"),
          say("excited", "that was fun!"), say("content", "all good"), say("bored", "nothing to do")];
      }
      t.stage("baby");
      out.kept = [say("home_rainy", "rainy day, blanket please?"), say("weight_heavy", "feeling a bit round..."),
        say("brand_new_key", "a new sentence"), say(null, "tummy rumbling!")];
      t.cache("off");
      out.off = say("call_hunger", "tummy rumbling!");
      // The mood line isn't read out: the tick writes it with no hold.
      t.cache("on");
      let announced = 0;
      const counter = new MutationObserver(() => { announced++; });
      counter.observe(s.live, { childList: true, characterData: true, subtree: true });
      s.sayUntil = 0;
      el._write(s, say("call_hunger", "tummy rumbling!"));
      await new Promise((r) => setTimeout(r, 200));
      counter.disconnect();
      out.announced = announced;
      t.cache(null);
      return out;
    });
    check("baby talk on: a baby's mood line is its own (\"hungy!\"), a child's a little, a teen's and an adult's normal",
      moodLine.baby.join("|") === "hungy!|owie... medicine?|yay yay!|happy!|la la la" &&
      moodLine.child.join("|") === "tummy rumbly!|feeling icky, medicine?|that was fun! yay!|all good!|nothing to do" &&
      ["teen", "adult"].every((st) => moodLine[st].join("|") === "tummy rumbling!|feeling sick, medicine please?|that was fun!|all good|nothing to do"),
      JSON.stringify(moodLine));
    check("the house, the weight, an unknown key and no key keep the sentence; off is normal; the mood line isn't read out",
      moodLine.kept.join("|") === "rainy day, blanket please?|feeling a bit round...|a new sentence|tummy rumbling!" &&
      moodLine.off === "tummy rumbling!" && moodLine.announced === 0, JSON.stringify(moodLine));
    // The card's own lines, as a baby, and the catchphrase never on them.
    const lines = await babyAs(async (el, s, t) => {
      t.cache("on");
      t.stage("baby");
      const at = new Date().toISOString();
      const out = {};
      out.granted = t.said(() => el._moment(s, { type: "wish_granted", at }));
      out.favourite = t.said(() => el._moment(s, { type: "favourite_snack", food: "hazelnuts", at }));
      localStorage.removeItem(`hatch-welcomed-${el._hass.user.id}`);
      out.home = t.said(() => el._moment(s, { type: "friend_home", at }));
      out.bond = t.said(() => el._moment(s, { type: "bond_up", level: 3, at }));
      s.sayUntil = 0;
      out.miss = el._catchUpLine(s, { type: "care_miss", at }); // the catch-up's: live says nothing
      s.sayUntil = 0; s.voicedAt = Date.now() + 1e9;
      el._moment(s, { type: "tucked_in", at });
      el._stopTyping(s);
      out.tucked = s.bubble.textContent;
      out.refusal = ["full", "too_tired", "not_sick"].map((result) => {
        s.sayUntil = 0;
        el._react(s, { action: "feed", result });
        return s.bubble.textContent;
      });
      // The game's own refusal (a play that ends at once) goes through the same
      // table, and is said once: _playCall stays quiet, _react (the care log) speaks.
      const realCall = el._hass.callService;
      const realWrite = el._write;
      const written = [];
      el._write = function (slide, line, ...rest) { written.push(line); return realWrite.call(this, slide, line, ...rest); };
      el._hass = { ...el._hass, callService: async () => ({ response: { result: "too_tired" } }) };
      s.game = { kind: "left_right" };
      s.sayUntil = 0;
      await el._playCall(s, { guess: "left" });
      out.refusalCall = written.length;
      el._react(s, { action: "play", result: "too_tired" });
      out.refusalLines = written.filter((x) => x === "too sleepy to play").length;
      out.refusalTotal = written.length;
      written.length = 0;
      s.sayUntil = 0;
      el._react(s, { action: "snack", result: "full" }); // a snack refused when full
      out.snackFull = written.filter((x) => x === "tummy full!").length;
      out.snackTotal = written.length;
      el._write = realWrite;
      el._hass = { ...el._hass, callService: realCall };
      out.wish = el._wishSaid(s, { kind: "snack" }, ["I'd love a snack after lunch!"]);
      const mine = s.mine; // aimed at this viewer (their channel says so)
      s.mine = { ...mine, wish_for_you: true };
      out.aimed = el._wishSaid(s, { kind: "snack" }, ["will you bring me a snack after lunch?"]);
      s.mine = mine;
      // Said aloud: the catchphrase is not on them, and the count doesn't move.
      s.catchCount = 2; // the next catchy line would carry it
      for (const q of [...out.granted, ...out.favourite]) {
        s.sayUntil = 0;
        s.voicedAt = 0;
        el._speak(s, q.text, 300, q.opts);
        el._stopTyping(s);
        (out.spoken ??= []).push(s.bubble.textContent);
      }
      out.count = s.catchCount;
      out.phrase = el._state(s, "sensor.life_stage")?.attributes.catchphrase;
      t.cache(null);
      return out;
    });
    check("a baby's moments: wish, favourite snack, home, bond, missed care, tucked in",
      lines.granted[0]?.text === "yay yay! ♥" && lines.favourite[0]?.text === "hazelnuts! yay yay!" &&
      lines.home[0]?.text === "you're home! yay yay ♥" && lines.bond[0]?.text === "yay, you! ♥" &&
      lines.miss === "oh! hi hi ♥" && /^night night, \S+ ♥$/.test(lines.tucked), JSON.stringify(lines));
    check("a baby's refusals and wish; an aimed wish keeps its words",
      lines.refusal.join("|") === "tummy full!|too sleepy to play|i'm not sick!" && lines.wish === "wish... snack after lunch" &&
      lines.aimed === "will you bring me a snack after lunch?", JSON.stringify(lines));
    check("a refused snack says the full line once",
      lines.snackFull === 1 && lines.snackTotal === 1, JSON.stringify(lines));
    check("a refused game says its refusal line once",
      lines.refusalCall === 0 && lines.refusalLines === 1 && lines.refusalTotal === 1, JSON.stringify(lines));
    // Hearts: to the nearest half, and full once the server calls the pet full.
    const heartRows = await babyAs(async (el, s) => {
      const realState = el._state;
      const out = {};
      for (const hunger of [30, 34, 96]) {
        el._state = function (slide, key) {
          return key === "sensor.hunger" ? { state: String(hunger), attributes: {} } : realState.call(this, slide, key);
        };
        el._renderStatus(s, []);
        const row = [...s.screen.querySelectorAll(".row")].find((r) => r.children[1]?.textContent === "hunger");
        const srcs = [...row.querySelectorAll(".hearts img")].map((i) => i.getAttribute("src"));
        out[hunger] = srcs.map((x) => /stat_heart_(\w+)\.png/.exec(x)[1]).join(",");
      }
      el._state = realState;
      return out;
    });
    check("hunger 30 shows one heart (round, not ceil), 34 one and a half, 96 four (full at the server's FEED_FULL_AT)",
      heartRows[30] === "full,empty,empty,empty" && heartRows[34] === "full,half,empty,empty" && heartRows[96] === "full,full,full,full", JSON.stringify(heartRows));
    // The clock: a device 10 min fast reads the server's countdown after one state event.
    const clock = await babyAs(async (el, s) => {
      const realNow = Date.now;
      const realHass = el._hass;
      const server = realNow();
      const hatchesAt = s.hatchesAt;
      const out = {};
      let fire;
      let subscribes = 0;
      let unsubbed = 0;
      const fresh = (conn) => ({ ...realHass, connection: conn });
      try {
        s.hatchesAt = new Date(server + 30 * 60000).toISOString();
        Date.now = () => realNow() + 10 * 60000;
        out.before = el._say(s, null, false);
        el._hass = fresh({ subscribeEvents: (cb) => { subscribes++; fire = cb; return Promise.resolve(() => { unsubbed++; }); } });
        el._watchServerClock(el._hass);
        await new Promise((r) => setTimeout(r, 0));
        fire({ time_fired: new Date(server).toISOString() });
        await new Promise((r) => setTimeout(r, 0));
        out.after = el._say(s, null, false);
        out.unsubscribed = unsubbed;
        // A second card on the same connection within the hour does not read again.
        const before = subscribes;
        el._watchServerClock(el._hass);
        out.again = subscribes - before;
      } finally {
        Date.now = realNow;
        fire?.({ time_fired: new Date().toISOString() }); // (ignored: one reading) back to an honest clock below
        el._hass = fresh({ subscribeEvents: (cb) => { cb({ time_fired: new Date().toISOString() }); return Promise.resolve(() => {}); } });
        el._watchServerClock(el._hass);
        s.hatchesAt = hatchesAt;
        el._hass = realHass;
      }
      return out;
    });
    check("device clock 10 min fast: the hatch countdown reads the server's after one state event",
      /^hatching in about 2[01]\u00a0min$/.test(clock.before) // 20, or 21 with a few seconds of offset left over
       && clock.after === "hatching in about 30\u00a0min" &&
      clock.unsubscribed === 1 && clock.again === 0, JSON.stringify(clock));
    check("no catchphrase on a baby line, and the count doesn't move",
      lines.granted[0]?.opts?.catch === false && lines.favourite[0]?.opts?.catch === false && lines.count === 2 &&
      !lines.spoken.some((x) => lines.phrase && x.includes(lines.phrase)), JSON.stringify(lines));
    // Holiday lines: a baby's own set; a child, a teen and "off" keep the normal ones.
    const holiday = await babyAs(async (el, s, t) => {
      const config = el._config;
      const fly = [el._seasonFlyer, el._seasonVisitor, el._costume];
      const out = {};
      const mood = s.moodState;
      s.moodState = "content"; // awake and free, whatever the hour (a dev pet sleeps at night)
      el._seasonFlyer = el._seasonVisitor = () => {};
      el._costume = (slide, season, line, catchy) => { out.line = line; out.catchy = catchy; };
      // The week before a holiday its countdown speaks first (once a slide) and
      // would hold every tick below: not this check's.
      const counted = s.counted;
      s.counted = true;
      try {
        for (const key of ["halloween", "thanksgiving", "winter"]) {
          el._config = { ...config, seasonal: key };
          localStorage.setItem(`hatch-costume-${key}-${s.ids?.device}-${new Date().toDateString()}`, "1");
          for (const [stage, cache] of [["baby", "on"], ["child", "on"], ["teen", "on"], ["baby", "off"]]) {
            t.cache(cache);
            t.stage(stage);
            const said = new Set();
            let catchy = new Set();
            for (let i = 0; i < 30; i++) {
              s.nextCostume = 1;
              s.sayUntil = 0; // the real season may be mid-line (a costume line, a countdown): not this check's
              s.pet.classList.remove("hop", "greethop"); // the greets above leave a 1.4 s greethop: not this check's
              el._seasonTick(s);
              said.add(out.line);
              catchy.add(out.catchy);
            }
            out[`${key}-${stage}-${cache}`] = { said: [...said], catchy: [...catchy] };
          }
        }
      } finally {
        [el._seasonFlyer, el._seasonVisitor, el._costume] = fly;
        s.counted = counted;
        el._config = config;
        s.moodState = mood;
        t.cache(null);
      }
      return out;
    });
    const halloweenBaby = ["boo!", "boo! hehe", "spooky~", "yay, costume!"];
    const halloweenNormal = ["boo!", "happy Halloween!", "spooky~", "trick or treat! hehe", "look how spooky I am!"];
    check("holidays: a baby has its own costume lines, never with the catchphrase",
      holiday["halloween-baby-on"].said.every((x) => halloweenBaby.includes(x)) &&
      holiday["halloween-baby-on"].said.some((x) => !halloweenNormal.includes(x)) &&
      holiday["halloween-baby-on"].catchy.join() === "false" &&
      holiday["thanksgiving-baby-on"].said.every((x) => ["gobble gobble!", "pie! yum yum", "thank you ♥", "cozy cozy~", "leaves!"].includes(x)) &&
      holiday["winter-baby-on"].said.every((x) => ["pretty! pretty!", "lights!", "cozy cozy~", "yum yum"].includes(x)),
      JSON.stringify(holiday));
    check("holidays: a child, a teen and baby talk off keep the normal lines",
      ["halloween-child-on", "halloween-teen-on", "halloween-baby-off"].every((k) =>
        holiday[k].said.every((x) => halloweenNormal.includes(x)) && holiday[k].catchy.join() === "true"),
      JSON.stringify(holiday));
    // Screen readers hear a baby line once, as shown, without the sound; reduced motion: no typing.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const heard = await babyAs(async (el, s, t) => {
      t.cache("on");
      t.stage("baby");
      let announced = 0;
      const counter = new MutationObserver(() => { announced++; });
      counter.observe(s.live, { childList: true, characterData: true, subtree: true });
      s.voicedAt = 0; s.sayUntil = 0;
      localStorage.removeItem(`hatch-greet-${el._hass.user.id}-${s.ids?.device}`);
      s.greeted = false;
      el._greet(s);
      const out = { typing: !!s.bubble.dataset.typing, shown: s.bubble.textContent, sound: s.species?.voice?.sound };
      // The line without its sound (and without the marks screen readers skip).
      out.said = s.bubble.textContent.replace(s.bubble.querySelector(".snd")?.textContent || "", "").trim();
      out.plain = out.said.replace(/[♥♡♪★~*]/g, "").replace(/\s+/g, " ").trim();
      await new Promise((r) => setTimeout(r, 300));
      counter.disconnect();
      out.live = s.live.textContent;
      out.announced = announced;
      t.cache(null);
      return out;
    });
    await page.emulateMedia({ reducedMotion: null });
    check("screen readers hear a baby line once, as shown, without its sound; reduced motion: no typing",
      heard.announced === 1 && heard.live === heard.plain && BABY_GREET.test(heard.said) && !heard.typing &&
      !heard.live.includes(heard.sound),
      JSON.stringify(heard));
    // A shared screen: no baby talk row, and normal lines, even with the cache on.
    const shared = await babyAs(async (el, s, t) => {
      t.cache("on");
      t.stage("baby");
      localStorage.setItem("hatch-shared-screen", "on");
      s.settings = true; // the row lives in the settings sheet
      el._renderStatus(s, []);
      const out = { row: s.status.querySelectorAll(".bell.babytalk").length, sheet: s.status.querySelectorAll(".bell.shared").length,
        line: el._lines(s, "care_miss", "normal").text };
      localStorage.setItem("hatch-shared-screen", "off");
      el._renderStatus(s, []);
      out.personalRow = s.status.querySelectorAll(".bell.babytalk").length;
      s.settings = false;
      el._renderStatus(s, []);
      t.cache(null);
      return out;
    });
    check("a shared screen has no baby talk switch and says the normal lines",
      shared.row === 0 && shared.sheet === 1 && shared.line === "normal" && shared.personalRow === 1, JSON.stringify(shared));
    // A visit reply carries the switch: an asleep (not counted) reply that says off
    // turns the cache off; the real server's reply too.
    const visit = await babyAs(async (el, s, t) => {
      t.cache("on");
      const realCall = el._hass.callService;
      el._hass = { ...el._hass, callService: async () => ({ response: { notes: [], ask: null, counted: false, baby_talk: false } }) };
      s.visitedAt = 0;
      const realVisit = Object.getPrototypeOf(el)._visit; // babyAs holds the card's own
      realVisit.call(el, s);
      await new Promise((r) => setTimeout(r, 200));
      const out = { asleep: localStorage.getItem(`hatch-baby-talk-${el._hass.user.id}`) };
      el._hass = { ...el._hass, callService: realCall };
      await el._hass.callWS({ type: "virtual_pet/baby_talk", entity_id: s.ids["sensor.life_stage"], enabled: true });
      t.cache("off");
      s.visitedAt = 0;
      realVisit.call(el, s);
      for (let i = 0; i < 30 && localStorage.getItem(`hatch-baby-talk-${el._hass.user.id}`) !== "on"; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      out.real = localStorage.getItem(`hatch-baby-talk-${el._hass.user.id}`);
      await el._hass.callWS({ type: "virtual_pet/baby_talk", entity_id: s.ids["sensor.life_stage"], enabled: false });
      t.cache(null);
      s.queue = [];
      el._clearAsk(s);
      return out;
    });
    check("a visit reply sets the cache, an asleep one too", visit.asleep === "off" && visit.real === "on", JSON.stringify(visit));
    // The switch: one command per tap, the button follows, a failed call goes back.
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
    const toggle = await babyAs(async (el, s, t) => {
      t.cache("off");
      t.stage("adult");
      s.settings = true; // the switch lives in the settings sheet
      el._renderStatus(s, el._state(s, "sensor.last_care")?.attributes.log || []);
      const calls = [];
      const realWS = el._hass.callWS;
      let fail = false;
      el._hass = { ...el._hass, callWS: async (msg) => { calls.push(msg); if (fail) throw new Error("no"); return null; } };
      const btn = () => s.status.querySelector(".bell.babytalk");
      const before = btn().getAttribute("aria-pressed");
      btn().click();
      await new Promise((r) => setTimeout(r, 100));
      const out = { before, after: btn().getAttribute("aria-pressed"), text: btn().textContent, calls: calls.length,
        type: calls[0]?.type, enabled: calls[0]?.enabled, cache: localStorage.getItem(`hatch-baby-talk-${el._hass.user.id}`),
        note: s.status.querySelector(".status-feedback")?.textContent };
      fail = true;
      btn().click();
      await new Promise((r) => setTimeout(r, 100));
      out.failed = { pressed: btn().getAttribute("aria-pressed"), calls: calls.length, note: s.status.querySelector(".status-feedback")?.textContent,
        cache: localStorage.getItem(`hatch-baby-talk-${el._hass.user.id}`) };
      el._hass = { ...el._hass, callWS: realWS };
      // A baby on screen: the status screen hides the bubble, so the note must show.
      t.stage("baby");
      el._hass = { ...el._hass, callWS: async () => null };
      btn().click(); // the failed tap left it on; turn off, then on
      await new Promise((r) => setTimeout(r, 100));
      btn().click();
      await new Promise((r) => setTimeout(r, 100));
      out.babyNote = s.status.querySelector(".status-feedback")?.textContent;
      el._hass = { ...el._hass, callWS: realWS };
      return out;
    });
    check("the baby talk switch: one call per tap, the button follows, a failed call goes back",
      toggle.before === "false" && toggle.after === "true" && toggle.text === "on" && toggle.calls === 1 &&
      toggle.type === "virtual_pet/baby_talk" && toggle.enabled === true && toggle.cache === "on" &&
      toggle.note === "ok, baby talk for babies and kids ♥" &&
      toggle.failed.pressed === "true" && toggle.failed.calls === 2 && toggle.failed.note === "hm, that didn't work. try again soon" &&
      toggle.failed.cache === "on" && toggle.babyNote === "ok, baby talk for babies and kids ♥", JSON.stringify(toggle));
    await page.locator("hatch-pet-card").evaluate((el) => { // the switch, on, without the failed tap's note
      const s = el._slides[el._index];
      el._renderStatus(s, []);
      s.status.querySelector(".status-feedback").hidden = true;
    });
    await cur().locator(".row", { hasText: "baby talk" }).scrollIntoViewIfNeeded();
    await shot("06a-baby-talk-switch");
    await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      localStorage.setItem("hatch-shared-screen", "on");
      el._renderStatus(s, []);
    });
    await cur().locator(".row", { hasText: "shared screen" }).scrollIntoViewIfNeeded();
    await shot("06b-shared-no-baby-talk");
    await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      localStorage.setItem("hatch-shared-screen", "off");
      localStorage.removeItem(`hatch-baby-talk-${el._hass.user.id}`);
      s.settings = false;
      el._renderStatus(s, []);
    });
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
    // Baby lines on screen, for the owner: two creatures, and a child.
    const babyShot = async (name, stage, fn) => {
      await page.locator("hatch-pet-card").evaluate((el, { stage, fn }) => {
        const s = el._slides[el._index];
        localStorage.setItem(`hatch-baby-talk-${el._hass.user.id}`, "on");
        const realState = el._state;
        el._state = function (slide, key) {
          const st = realState.call(this, slide, key);
          return key === "sensor.life_stage" && st ? { ...st, state: stage } : st;
        };
        s.sayUntil = 0; s.voicedAt = 0;
        new Function("el", "s", fn)(el, s);
        el._stopTyping(s);
        s.sayUntil = Date.now() + 20000; // held for the screenshot
        el._state = realState;
        localStorage.removeItem(`hatch-baby-talk-${el._hass.user.id}`);
      }, { stage, fn });
      await page.waitForTimeout(300);
      await shot(name);
    };
    await babyShot("06c-baby-greeting", "baby", `localStorage.removeItem("hatch-greet-" + el._hass.user.id + "-" + s.ids?.device); s.greeted = false; el._greet(s);`);
    await babyShot("06d-baby-snack", "baby", `el._moment(s, { type: "favourite_snack", food: "hazelnuts", at: new Date().toISOString() }); el._sayQueued(s);`);
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(1500);
    await hush();
    await babyShot("06e-baby-other-creature", "baby", `el._moment(s, { type: "tucked_in", at: new Date().toISOString() });`);
    await babyShot("06f-child-line", "child", `el._write(s, el._say(s, { state: "calling", attributes: { reason: "tummy rumbling!", reason_key: "call_hunger" } }, false), 20000);`);
    await babyShot("06g-baby-mood-line", "baby", `el._write(s, el._say(s, { state: "calling", attributes: { reason: "tummy rumbling!", reason_key: "call_hunger" } }, false), 20000);`);
    await page.locator("hatch-pet-card .nav.prev").click();
    await page.waitForTimeout(1500);
    await hush();
    await page.locator("hatch-pet-card").evaluate((el) => el._slides.forEach((s) => { s.sayUntil = 0; }));
  }

  }
  if (enter("personality")) {
  // 4c. Personality (P1): a "personality" row for a teen and an adult, none for a
  // baby or an older server; the type on the journal line, none on an old record.
  // The life stage is stubbed in-page and kept until the screenshot is taken.
  {
    const asPet = (stage, attrs, journal = false) => page.locator("hatch-pet-card").evaluate(async (el, { stage, attrs, journal }) => {
      const s = el._slides[el._index];
      window.__realState ??= el._state;
      const realState = window.__realState;
      el._state = function (slide, key) {
        const st = realState.call(this, slide, key);
        if (key !== "sensor.life_stage" || !st || slide !== s) return st;
        const out = { ...st.attributes, ...attrs };
        if (attrs.personality === "drop") delete out.personality; // a server before P1
        return { ...st, state: stage, attributes: out };
      };
      s.journal = journal;
      // The journal page, once drawn, stays on show while a redraw gathers its data (UX fix 2, F2):
      // a stale .gen is already there, so wait for the redraw itself, not for a .gen to appear.
      if (journal) await el._renderJournal(s);
      else el._renderStatus(s, []);
      const text = (sel) => [...s.status.querySelectorAll(sel)].map((r) => r.innerText.replace(/\s+/g, " ").trim());
      return journal ? text(".gen") : text(".row");
    }, { stage, attrs, journal });
    const unstubState = () => page.locator("hatch-pet-card").evaluate((el) => {
      if (window.__realState) el._state = window.__realState;
      delete window.__realState;
      const s = el._slides[el._index];
      s.journal = false;
      el._renderStatus(s, []);
    });
    const typeRow = (rows) => rows.filter((r) => r.startsWith("personality"));
    const personalityShot = async (name) => {
      const row = cur().locator(".row", { hasText: "personality" });
      if (await row.count()) await row.scrollIntoViewIfNeeded();
      else await cur().locator(".row", { hasText: "traits" }).scrollIntoViewIfNeeded();
      await shot(name);
    };
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
    const teen = await asPet("teen", { personality: "fancy", upbringing: "steady" });
    check("a teen's status screen shows its personality", typeRow(teen).join() === "personality fancy" &&
      teen.some((r) => r === "growing up steady"), JSON.stringify(typeRow(teen)));
    await personalityShot("07a-personality-teen");
    const adult = await asPet("adult", { personality: "old_soul", upbringing: "devoted" });
    check("an adult's status screen shows its personality, in words", typeRow(adult).join() === "personality old soul",
      JSON.stringify(typeRow(adult)));
    await personalityShot("07b-personality-adult");
    const baby = await asPet("baby", { personality: null });
    check("a baby's status screen has no personality row", typeRow(baby).length === 0, JSON.stringify(typeRow(baby)));
    await personalityShot("07c-personality-none-for-a-baby");
    const older = await asPet("teen", { personality: "drop" });
    check("a teen from an older server has no personality row", typeRow(older).length === 0, JSON.stringify(typeRow(older)));
    const species = await page.locator("hatch-pet-card").evaluate((el) =>
      el._state(el._slides[el._index], "sensor.life_stage")?.attributes.species);
    const record = (generation, name, extra) => ({ generation, name, species, traits: ["homebody"],
      levels: { homebody: 1 }, inherited: null, age_days: 21.2, care_misses: 0, games: {}, ...extra });
    const journal = (await asPet("adult", {
      personality: "old_soul", upbringing: "devoted", generation: 3,
      journal: [record(1, "Checkold", { upbringing: "steady" }), record(2, "Checksweet", { upbringing: "devoted", personality: "sweet" })],
    }, true)).filter((line) => /^gen \d/.test(line)); // not the memories
    check("the journal shows each generation's personality, none on an old record",
      journal.length === 3 && !/sweet|old soul|mellow|bouncy|starry|fancy|charming|plucky/.test(journal[0]) &&
      / · devoted · sweet( |$)/.test(journal[1]) && / · devoted · old soul( |$)/.test(journal[2]) && /\(now\)/.test(journal[2]),
      JSON.stringify(journal));
    await shot("07d-personality-journal");
    // D1: a personality in a younger pet's save (a downgrade, a hand edit) isn't shown.
    const child = await asPet("child", { personality: "fancy" });
    check("D1: a child with a personality in its save shows no personality row", typeRow(child).length === 0,
      JSON.stringify(typeRow(child)));
    const childJournal = (await asPet("child", { personality: "fancy", generation: 2,
      journal: [record(1, "Checkold", { upbringing: "steady", personality: "sweet" })] }, true))
      .filter((line) => /^gen \d/.test(line));
    check("D1: nor on its own journal line, while its parent's stays",
      childJournal.length === 2 && / · sweet( |$)/.test(childJournal[0]) && !/fancy/.test(childJournal[1]),
      JSON.stringify(childJournal));
    const teenJournal = (await asPet("teen", { personality: "fancy", generation: 2, journal: [] }, true))
      .filter((line) => /^gen \d/.test(line));
    check("D1: a teen's journal line shows it", teenJournal.length === 1 && / · fancy( |$)/.test(teenJournal[0]),
      JSON.stringify(teenJournal));
    // 2e: seven generations: the newest four, then "older generations (3)", a tap
    // opens the other three, oldest first, at 44 px.
    const seven = [1, 2, 3, 4, 5, 6].map((g) => record(g, `Checkgen${g}`, {}));
    const sevenLines = (await asPet("adult", { generation: 7, journal: seven }, true))
      .filter((line) => /^gen \d/.test(line));
    const olderBtn = cur().locator(".jolder");
    check("2e: seven generations show four and a link saying 3",
      sevenLines.length === 4 && /^gen 4 /.test(sevenLines[0]) && /^gen 7 \(now\)/.test(sevenLines[3]) &&
      (await olderBtn.innerText()) === "older generations (3)", JSON.stringify(sevenLines));
    const box = await olderBtn.boundingBox();
    check("2e: the link is 44 px", box.height >= 44 && box.width >= 44, JSON.stringify(box));
    await shot("07e-older-generations-closed");
    await olderBtn.click();
    const all = (await cur().locator(".gen").allInnerTexts()).map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => /^gen \d/.test(l)).map((l) => l.split(" ")[1]); // not the memories line
    check("2e: focus moves to the first revealed generation",
      await cur().locator(".jmore .gen").first().evaluate((e) => document.activeElement === e || e.getRootNode().activeElement === e), "");
    check("2e: a tap opens the rest, oldest first, and the link goes",
      all.join() === "1,2,3,4,5,6,7" && (await cur().locator(".jolder").count()) === 0, all.join());
    await shot("07f-older-generations-open");
    await page.locator("hatch-pet-card").evaluate((el) => { el._slides[el._index].olderOpen = false; });
    await asPet("adult", { generation: 5, journal: seven.slice(0, 4) }, true);
    check("2e: five generations: the link says 1",
      (await cur().locator(".jolder").count()) === 1 && (await olderBtn.innerText()) === "older generations (1)", "");
    const three = await asPet("adult", { generation: 4, journal: seven.slice(0, 3) }, true);
    check("2e: four generations show no link", (await cur().locator(".jolder").count()) === 0 && three.length >= 4,
      JSON.stringify(three));
    await unstubState();
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
  }
  // Fresh-expand E7 (Q-a): a typed teen's answer to "how was your day?" says its own
  // reply or a base one; "tough" with random 0 says the type's.
  {
    const src7 = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const own = require("vm").runInNewContext(`(${src7.match(/\nconst PERSONA_FRESH = (\{[\s\S]*?\n\});/)[1]})`).sweet;
    const base = require("vm").runInNewContext(`(${src7.match(/\n {2}how_day: \{ q: "how was your day\?", answers: (\{[\s\S]*?\] \}) \},/)[1]})`);
    const e7 = await card.evaluate(async (el, own) => {
      const s = el._slides[el._index];
      const real = { persona: el._persona, speak: el._speak, random: Math.random };
      const said = [];
      el._persona = () => own;
      el._speak = function (sl, text, ...rest) { said.push(text); return real.speak.call(this, sl, text, ...rest); };
      const answer = (a) => {
        el._ask(s, "how_day");
        s.screen.querySelector(`.askday [data-answer="${a}"]`)?.click();
      };
      try {
        Math.random = () => 0;
        answer("tough");
        Math.random = () => 0.9;
        answer("tough");
        Math.random = real.random;
        for (let i = 0; i < 6; i++) answer("great");
      } finally {
        Object.assign(el, { _persona: real.persona, _speak: real.speak });
        Math.random = real.random;
        s.screen.querySelector(".askday")?.remove();
        Object.assign(s, { asking: false, queue: [], sayUntil: 0, sayClass: 0 });
      }
      return said;
    }, own);
    // Fresh-expand E8 (LS-a): an adult 45 days old has its first trick (a spin) in its idle
    // moves, and the month's first look says a trick line once; a teen has none.
    const TRICK7 = require("vm").runInNewContext(src7.match(/\nconst TRICK_LINES = (\[[^\n]*\]);/)[1]);
    const ls = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const real = { state: el._state, heard: el._channelHeard, held: el._resumeHeld };
      const as = (stage, age) => {
        el._state = function (sl, k) {
          const st = real.state.call(this, sl, k);
          return k === "sensor.life_stage" && st ? { ...st, state: stage, attributes: { ...st.attributes, age_days: age, generation: 77 } } : st;
        };
      };
      const out = {};
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith(`hatch-trick-${s.ids.device}-77-`)) localStorage.removeItem(k);
        as("adult", 45);
        out.moves = el._idleMoves(s, false, false);
        out.calmMoves = el._idleMoves(s, false, true);
        el._channelHeard = () => true;
        el._resumeHeld = () => false;
        const look = () => {
          Object.assign(s, { lookedFirst: false, queue: [], asleep: false });
          el._firstLook(s);
          const said = s.queue.map((q) => q.text);
          s.queue = [];
          return said;
        };
        out.first = look();
        out.again = look();
        as("teen", 45);
        out.teen = el._idleMoves(s, false, false);
      } finally {
        Object.assign(el, { _state: real.state, _channelHeard: real.heard, _resumeHeld: real.held });
        for (const k of Object.keys(localStorage)) if (k.startsWith(`hatch-trick-${s.ids.device}-77-`)) localStorage.removeItem(k);
        Object.assign(s, { lookedFirst: true, queue: [], sayUntil: 0, sayClass: 0 });
      }
      return out;
    });
    check("fresh E8 (LS-a): an adult of 45 days spins in its idle moves (none when calm, none for a teen); its trick line once",
      ls.moves.includes("spin") && !ls.calmMoves.includes("spin") && !ls.teen.includes("spin") &&
      ls.first.some((l) => TRICK7.includes(l)) && !ls.again.some((l) => TRICK7.includes(l)), JSON.stringify(ls));
    // Fresh-expand F3: the pet's promise. On its pinned day 0 a teen's first look says the
    // promise; on day 4 the payoff, once a cycle, with the bigger move; a child, none.
    const pctx = {};
    require("vm").runInNewContext([/\nconst dayOrdinal = [^\n]*\n/, /\nconst turnHash = [\s\S]*?\n\};\n/, /\nconst PROMISE_CYCLE = [^\n]*\n/,
      /\nconst PROMISE_TOPICS = [^\n]*\n/, /\nfunction promiseDay\([\s\S]*?\n\}\n/].map((re) => src7.match(re)[0]).join("") +
      "this.promiseDay = promiseDay;", pctx);
    const PROMISE = require("vm").runInNewContext(`(${src7.match(/\nconst PROMISE_LINES = (\{[\s\S]*?\n\});/)[1]})`);
    const pdevice = await card.evaluate((el) => el._slides[el._index].ids.device);
    let p0 = 0;
    while (pctx.promiseDay(pdevice, new Date(2030, 0, 1 + p0, 12)).day !== 0) p0++;
    const d0 = new Date(2030, 0, 1 + p0, 12);
    const topic = pctx.promiseDay(pdevice, d0).topic;
    const pr = await card.evaluate((el, { t0, t4 }) => {
      const s = el._slides[el._index];
      const real = el._state;
      const as = (stage) => {
        el._state = function (sl, k) {
          const st = real.call(this, sl, k);
          return k === "sensor.life_stage" && st ? { ...st, state: stage } : st;
        };
      };
      const d0 = new Date(t0);
      const d4 = new Date(t4);
      const keys = [`hatch-promise-${s.ids.device}`, `hatch-promise-${s.ids.device}-${d0.toDateString()}`,
        `hatch-promise-${s.ids.device}-${d4.toDateString()}`];
      keys.forEach((k) => localStorage.removeItem(k));
      const out = {};
      const pinned = el._promiseLook;
      delete el._promiseLook; // the real one (hush pins it off)
      try {
        as("child");
        out.child = el._promiseLook(s, d0);
        as("teen");
        out.day0 = el._promiseLook(s, d0);
        out.day0again = el._promiseLook(s, d0);
        out.day4 = el._promiseLook(s, d4);
        localStorage.removeItem(keys[2]);
        out.day4again = el._promiseLook(s, d4); // paid this cycle
        s.pet.classList.remove("bighop", "spin");
        if (out.day4?.move) el._promiseMove(s, out.day4.move);
        out.cls = [...s.pet.classList].filter((c) => ["bighop", "spin"].includes(c));
      } finally {
        el._state = real;
        el._promiseLook = pinned;
        keys.forEach((k) => localStorage.removeItem(k));
      }
      return out;
    }, { t0: d0.getTime(), t4: new Date(2030, 0, 5 + p0, 12).getTime() });
    check("fresh F3: a teen's day 0 says its promise once; day 4 the payoff once a cycle, with the bigger move; a child none",
      pr.child === null && pr.day0?.line === PROMISE[topic][0] && pr.day0again === null && pr.day4?.line === PROMISE[topic][1] &&
      pr.day4again === null && (topic === "song" || pr.cls.length === 1), JSON.stringify({ topic, ...pr }));
    check("fresh E7 (Q-a): how_day's tough answer says the type's reply (random 0) or a base one (0.9); great says either",
      e7[0] === own.reply_tough[0] && base.tough.includes(e7[1]) &&
      e7.slice(2).every((l) => [...own.reply_great, ...base.great].includes(l)), JSON.stringify(e7));
  }

  }
  if (enter("types")) {
  // 4d. Personality (P2a): each type's hellos, reveal and moments. The table is
  // read from the card's source; the stage, the type and the viewer's bond are
  // stubbed in-page, and Math.random is pinned where a check needs one side of
  // the coin (0.1: the type's first line; 0.9: the normal pick).
  {
    const vm = require("vm");
    const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const PERSONA = vm.runInNewContext(`(${src.match(/const PERSONA = (\{[\s\S]*?\n\});/)[1]})`);
    const py = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "model.py"), "utf8");
    const TYPES = [...py.split("\nPERSONALITIES = (")[1].split("\n)")[0].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const KEYS = ["reveal", "hello", "hello_shared", "hello_warm", "hello_hearts",
      "good_morning", "sunset", "fell_asleep", "wish_granted", "favourite_snack",
      "idle", "idle_bored", "idle_excited", "mood_content", "mood_excited", "mood_cozy", "mood_bored", "today", "visit"];
    const HELLOS = ["hello", "hello_shared", "hello_warm", "hello_hearts"];
    const longName = "Wwwwwwwwwwwwwwww"; // 16, as _greet leaves a name
    const longFood = "sunflower seeds"; // 15, the longest likes entry
    const fill = (line, arg) => (typeof line === "function" ? line(arg) : line);
    const bad = [];
    if (Object.keys(PERSONA).sort().join() !== [...TYPES].sort().join()) bad.push(`types ${Object.keys(PERSONA)} vs ${TYPES}`);
    // The infrared link's keys (2b) have their own counts and scan: tests/js/link_lines.test.js.
    const LINK_KEYS = ["link_host", "link_guest", "link_kindred"];
    for (const [type, keys] of Object.entries(PERSONA)) {
      if (Object.keys(keys).filter((k) => !LINK_KEYS.includes(k)).join() !== KEYS.join()) bad.push(`${type}: keys ${Object.keys(keys)}`);
      if (!LINK_KEYS.every((k) => keys[k]?.length)) bad.push(`${type}: no link lines`);
      for (const [key, lines] of Object.entries(keys)) {
        if (LINK_KEYS.includes(key)) continue;
        if (lines.length < 2 || lines.length > 3) bad.push(`${type}.${key}: ${lines.length} lines`);
        const named = ["hello", "hello_warm", "hello_hearts"].includes(key);
        const food = key === "favourite_snack";
        for (const entry of lines) {
          if ((typeof entry === "function") !== (named || food)) bad.push(`${type}.${key}: "${fill(entry, "{x}")}" name or food`);
          const line = fill(entry, food ? longFood : longName);
          const words = line.toLowerCase().match(/[a-z']+/g) || [];
          if (/!!!/.test(line)) bad.push(`${type}.${key}: "${line}" !!!`);
          if (/\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i.test(line)) bad.push(`${type}.${key}: "${line}" nags`);
          if (words.some((w, i) => i > 1 && w === words[i - 1] && w === words[i - 2])) bad.push(`${type}.${key}: "${line}" three in a row`);
          // One approved exception (owner, 2026-11-01, gaps-seams 4b): a sentry's call, not a question to the player.
          const ASKS_OK = ["who goes there? oh, hi!"];
          if (line.includes("?") && !ASKS_OK.includes(line)) bad.push(`${type}.${key}: "${line}" asks`);
          if (line.length > 40) bad.push(`${type}.${key}: "${line}" ${line.length} long`);
          if (key === "wish_granted" && /thank|you remembered|too kind/i.test(line)) bad.push(`${type}.${key}: "${line}" credits someone`);
          if (HELLOS.includes(key) && /\b(favourite|best|morning|afternoon|evening|night|tonight|tomorrow)\b/i.test(line)) {
            bad.push(`${type}.${key}: "${line}" ranks or tells the time`);
          }
        }
      }
    }
    check("personality lines: all eight types, every key, 2-3 lines, 40 at most, no nagging, no asking, wishes credit nobody",
      bad.length === 0, bad.join(" | "));
    // Fresh-expand copy (E1): every table in the card's fresh-expand block is named in
    // COPY_TABLES (scripts/copy-scan.js) and scanned: no nagging, 40 at most with the
    // longest fill, asks only in a question slot, no digits.
    const freshScan = require("./copy-scan.js").scanFreshCopy(src);
    check(`fresh-expand copy: ${freshScan.tables.length} tables, ${freshScan.count} lines, every table scanned, 40 at most, no nagging, no asking`,
      freshScan.bad.length === 0 && freshScan.tables.length > 0, freshScan.bad.join(" | "));
    // The basket's reveal lines (visitors v2 §7, V1-V3): the same scan over every find the
    // reveal can show (not the gift-only ones) and each visitor's own left find, 40 at most
    // (no margin: "the nighthawk left a nighthawk feather ♪" is 40). V4 is BABY.find, above.
    const FIND_LINES = vm.runInNewContext(`(${src.match(/const FIND_LINES = (\{[\s\S]*?\n\});/)[1]})`);
    const WORLDS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
    const findBad = [];
    let findN = 0;
    for (const w of Object.values(WORLDS)) {
      const lines = w.finds.filter((f) => !f.gift_only).flatMap((f) => [...FIND_LINES.find, ...FIND_LINES.fresh].map((fn) => fn(f.a)));
      for (const v of w.visitors) {
        const f = v.leaves && w.finds.find((x) => x.id === v.leaves);
        if (f) lines.push(...FIND_LINES.left.map((fn) => fn(f.a, v.name)));
      }
      for (const line of lines) {
        findN++;
        const words = line.toLowerCase().match(/[a-z']+/g) || [];
        if (/!!!/.test(line)) findBad.push(`"${line}" !!!`);
        if (/\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i.test(line)) findBad.push(`"${line}" nags`);
        if (words.some((w2, i) => i > 1 && w2 === words[i - 1] && w2 === words[i - 2])) findBad.push(`"${line}" three in a row`);
        if (line.includes("?")) findBad.push(`"${line}" asks`);
        if (line.length > 40) findBad.push(`"${line}" ${line.length} long`);
      }
    }
    check(`find lines (V1-V3): ${findN} lines over every find, 40 at most, no nagging, no asking`,
      findN > 150 && findBad.length === 0, findBad.join(" | "));

    // One pet on show, as a teen or adult of a type, with this viewer's bond.
    const typeAs = (fn, arg) => page.locator("hatch-pet-card").evaluate(async (el, { fn, arg }) => {
      const s = el._slides[el._index];
      const realState = el._state;
      const realRandom = Math.random;
      // F3's practice takes an idle on its days (by the device: any run), and a draw.
      const realPractice = el._promisePractice;
      el._promisePractice = () => false;
      // E4 S-b: lights out after a visitor or sunset seen today is a once-a-day callback.
      const realNight = el._nightLine;
      el._nightLine = () => null;
      const me = el._hass.user.id;
      const keep = { voicedAt: s.voicedAt, queue: s.queue, catchCount: s.catchCount, asleep: s.asleep, calling: s.calling };
      const kept = { shared: localStorage.getItem("hatch-shared-screen"), baby: localStorage.getItem(`hatch-baby-talk-${me}`) };
      const keptMine = s.mine;
      const free = () => Object.assign(s, { asleep: false, calling: false, sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0,
        movingUntil: 0, queue: [], voicedAt: Date.now() + 1e9 });
      free();
      const t = {
        pet: (stage, personality, level = null, extra = {}) => {
          el._state = function (slide, key) {
            const st = realState.call(this, slide, key);
            if (key !== "sensor.life_stage" || !st || slide !== s) return st;
            return { ...st, state: stage, attributes: { ...st.attributes, personality, ...extra } };
          };
          s.mine = { ...(keptMine || {}), bond: level === null ? null : { level } }; // as the channel has it
        },
        random: (r) => { Math.random = r === null ? realRandom : typeof r === "function" ? r : () => r; },
        shared: (on) => localStorage.setItem("hatch-shared-screen", on ? "on" : "off"),
        baby: (on) => localStorage.setItem(`hatch-baby-talk-${me}`, on ? "on" : "off"),
        greet: () => {
          free();
          localStorage.removeItem(`hatch-greet-${el._hass.user.id}-${s.ids?.device}`);
          s.greeted = false;
          el._greet(s); el._stopTyping(s);
          return s.bubble.textContent;
        },
        moment: (m) => { // what's said now, and what's queued after it
          free();
          s.sayEntry = null;
          el._moment(s, { at: new Date().toISOString(), ...m }); el._stopTyping(s);
          const out = { said: s.bubble.textContent, saidCatch: !!s.sayEntry?.opts?.catch, // (2a: said at once, or queued)
            queued: s.queue.map((q) => ({ text: q.text, catch: !!q.opts?.catch })) };
          s.queue = [];
          return out;
        },
      };
      try {
        return await new Function("el", "s", "t", "arg", `return (${fn})(el, s, t, arg);`)(el, s, t, arg);
      } finally {
        el._state = realState;
        el._promisePractice = realPractice;
        el._nightLine = realNight;
        Math.random = realRandom;
        s.mine = keptMine;
        for (const [k, v] of [["hatch-shared-screen", kept.shared], [`hatch-baby-talk-${me}`, kept.baby]]) {
          if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
        }
        Object.assign(s, keep);
        s.sayUntil = 0;
        el._stopTyping(s);
      }
    }, { fn: fn.toString(), arg });
    const filled = (type, key, arg) => PERSONA[type][key].map((line) => fill(line, arg));
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Fresh-moment 4 (owner Q4): the evening's today line. A granted wish's line, else a
    // visitor seen here today, else today's newest bit (not a nap), else the type's line;
    // a teen or adult only. At the first look from TODAY_FROM_HOUR, once a day, in the
    // away note's place; never in the morning.
    const TODAY_WISH = vm.runInNewContext(`(${src.match(/\nconst TODAY_WISH = (\{[\s\S]*?\n\});/)[1]})`);
    const todayBad = Object.entries(TODAY_WISH).filter(([, l]) =>
      /\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i.test(l) || l.includes("?") || l.length > 40);
    const todayOut = await typeAs(async (el, s, t) => {
      const out = {};
      const real = { bits: el._dayBits, seen: el._visitSeen, evening: el._evening, catchUp: el._catchUp };
      const dreamKey = `hatch-dream-${s.ids?.device}-${new Date().toDateString()}`;
      const dreamWas = localStorage.getItem(dreamKey);
      const clearToday = () => { for (const k of Object.keys(localStorage)) if (/^hatch-today-/.test(k)) localStorage.removeItem(k); };
      try {
        el._visitSeen = () => null;
        // A live grant earlier may have told the wish today (E6 W-b): that skips the wish.
        localStorage.removeItem(`hatch-todaywish-${s.ids?.device}-${new Date().toDateString()}`);
        t.pet("adult", "mellow", 6, { wish: { kind: "bath", granted: true } });
        out.wish = el._todayLine(s);
        el._dayBits = (sl, since, care) => (care === false ? [] : ["had a meal"]);
        out.wishTold = el._todayLine(s, true); // the catch-up told it: the type's line
        t.pet("adult", "mellow", 6, { wish: { kind: "bath", granted: false } });
        out.noCare = el._todayLine(s); // care alone isn't a bit: the type's line
        el._visitSeen = () => "chickadee";
        out.visitor = el._todayLine(s);
        el._visitSeen = () => null;
        el._dayBits = () => ["napped", "watched the sunset"];
        out.bit = el._todayLine(s);
        el._dayBits = () => ["napped"];
        out.type = el._todayLine(s);
        t.pet("child", "mellow", 6, {});
        out.child = el._todayLine(s);
        t.pet("adult", "mellow", 6, { wish: null });
        el._catchUp = () => [];
        localStorage.setItem(dreamKey, "1"); // no dream line: room for the rest
        const look = (evening) => {
          el._evening = () => evening;
          Object.assign(s, { lookedFirst: false, queue: [], asleep: false, away: false });
          el._firstLook(s);
          const q = s.queue.map((x) => x.text);
          s.queue = [];
          return q;
        };
        clearToday();
        out.morning = look(false);
        out.evening = look(true);
        out.again = look(true);
      } finally {
        Object.assign(el, { _dayBits: real.bits, _visitSeen: real.seen, _evening: real.evening, _catchUp: real.catchUp });
        if (dreamWas === null) localStorage.removeItem(dreamKey); else localStorage.setItem(dreamKey, dreamWas);
        clearToday();
        s.lookedFirst = true;
      }
      return out;
    });
    const mellowToday = PERSONA.mellow.today;
    check("fresh-moment 4: the today line: the wish's (not after its catch-up), a visitor seen, today's bit (no care), else the type's; none for a child",
      todayBad.length === 0 && todayOut.wish === TODAY_WISH.bath && todayOut.visitor === "a chickadee visited me today ♪" &&
        todayOut.bit === "today I watched the sunset! ♪" && mellowToday.includes(todayOut.type) && todayOut.child === null &&
        mellowToday.includes(todayOut.wishTold) && mellowToday.includes(todayOut.noCare),
      JSON.stringify({ todayBad, ...todayOut }));
    check("fresh-moment 4: said at an evening first look, once a day; never in the morning",
      todayOut.evening.some((l) => mellowToday.includes(l)) && !todayOut.morning.some((l) => mellowToday.includes(l)) &&
        !todayOut.again.some((l) => mellowToday.includes(l)),
      JSON.stringify({ morning: todayOut.morning, evening: todayOut.evening, again: todayOut.again }));

    // The half rule, at every site: heads the type's line, tails the normal pick.
    const MOMENTS = [["good_morning", { type: "good_morning" }], ["sunset", { type: "sunset" }],
      ["fell_asleep", { type: "fell_asleep", how: "house" }], ["wish_granted", { type: "wish_granted" }],
      ["favourite_snack", { type: "favourite_snack", food: "hazelnuts" }]];
    const half = await typeAs(async (el, s, t, { types, moments }) => {
      const out = {};
      for (const type of types) {
        t.pet(type === "old_soul" ? "adult" : "teen", type, 0);
        out[type] = {};
        for (const r of [0.1, 0.9]) {
          t.random(r);
          out[type][r] = { greet: t.greet() };
          for (const [key, m] of moments) {
            const said = t.moment(m);
            out[type][r][key] = said.queued.length ? said.queued[0] : { text: said.said, catch: said.saidCatch };
          }
        }
      }
      return out;
    }, { types: TYPES, moments: MOMENTS });
    const NORMAL = {
      greet: /^(morning|hi|evening), Dev!$|^Dev!! hi!$/,
      good_morning: /^morning!! you're up!$|^morning! ♪$/,
      sunset: /^ooh, the sunset\.\.\.$|^pretty sky tonight$|^the sun's going down$/,
      fell_asleep: /^good night\.\.\.$|^night night\.\.\.$|^sleep tight\.\.\.$/,
      wish_granted: /^my wish came true! thank you ♥$|^yay, my wish! ♥$|^best day ever! ♥$/,
      favourite_snack: /^hazelnuts, my favourite!!$/,
    };
    const halfBad = [];
    for (const type of TYPES) {
      const heads = half[type][0.1];
      const tails = half[type][0.9];
      if (heads.greet !== filled(type, "hello", "Dev")[0]) halfBad.push(`${type} hello: ${heads.greet}`);
      if (!NORMAL.greet.test(tails.greet)) halfBad.push(`${type} normal hello: ${tails.greet}`);
      for (const [key] of MOMENTS) {
        if (heads[key].text !== filled(type, key, "hazelnuts")[0]) halfBad.push(`${type} ${key}: ${heads[key].text}`);
        if (!NORMAL[key].test(tails[key].text)) halfBad.push(`${type} normal ${key}: ${tails[key].text}`);
      }
      // The catchphrase follows the site: queued wish and snack lines may carry it.
      if (!heads.wish_granted.catch || !heads.favourite_snack.catch) halfBad.push(`${type}: queued line without catch`);
    }
    check("the half rule: heads a type's own hello and moments, tails the normal ones, for all eight",
      halfBad.length === 0, halfBad.slice(0, 6).join(" | "));

    // Precedence: baby talk, then the type, then normal; a baby or child never
    // speaks a type (even one stubbed in), nor a pet with none or an unknown one.
    const order = await typeAs(async (el, s, t) => {
      t.random(0.1);
      const wish = () => { const m = t.moment({ type: "wish_granted" }); return m.queued[0]?.text ?? m.said; };
      const out = {};
      t.baby(true);
      t.pet("baby", "sweet", 0); out.babyOn = wish();
      t.baby(false);
      t.pet("baby", "sweet", 0); out.babyOff = wish();
      t.pet("child", "sweet", 0); out.child = wish();
      t.baby(true);
      t.pet("teen", "sweet", 0); out.teenOn = wish();
      t.pet("teen", null, 0); out.none = wish();
      t.pet("adult", "grumpy", 0); out.unknown = wish();
      return out;
    });
    check("baby talk first, then the type, then normal: a baby or child never speaks a type, nor a pet without one",
      order.babyOn === "yay yay! ♥" && order.babyOff === "my wish came true! thank you ♥" &&
      order.child === "my wish came true! thank you ♥" && order.teenOn === PERSONA.sweet.wish_granted[0] &&
      order.none === "my wish came true! thank you ♥" && order.unknown === "my wish came true! thank you ♥",
      JSON.stringify(order));

    // Hellos: a shared screen says the nameless ones and never a bond line (its
    // bond injected at 8 all the same); signed in, a bond line only at 2+ and 8+.
    // A greeting is a coin toss (its own line or a normal one) and then a pick,
    // so a bond line shows up only some of the time: seed the dice (mulberry32)
    // so the same runs happen every time, and "no bond-8 line" can't be luck.
    const hellos = await typeAs(async (el, s, t, types) => {
      const out = {};
      let seed = 0x2f6e2b1;
      t.random(() => {
        seed = (seed + 0x6d2b79f5) | 0;
        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      });
      for (const type of types) {
        const run = (n) => Array.from({ length: n }, () => t.greet());
        t.shared(true);
        t.pet("teen", type, 8);
        const shared = run(40);
        t.shared(false);
        t.pet("teen", type, null);
        const stranger = run(30);
        t.pet("adult", type, 0);
        const zero = run(30);
        t.pet("adult", type, 2);
        const warm = run(40);
        t.pet("adult", type, 8);
        const hearts = run(60);
        out[type] = { shared, stranger, zero, warm, hearts };
      }
      return out;
    }, TYPES);
    const helloBad = [];
    const nameless = /^(morning|hi|evening)!$|^hi hi!$/;
    for (const type of TYPES) {
      const h = hellos[type];
      const own = (key) => filled(type, key, "Dev");
      const plain = (line) => NORMAL.greet.test(line);
      const warmNormal = /^Dev! I missed you ♥$|^yay, Dev's here!$/;
      if (!h.shared.every((l) => !l.includes("Dev") && (nameless.test(l) || PERSONA[type].hello_shared.includes(l)))) {
        helloBad.push(`${type} shared: ${h.shared.find((l) => !nameless.test(l) && !PERSONA[type].hello_shared.includes(l))}`);
      }
      if (!h.shared.some((l) => PERSONA[type].hello_shared.includes(l))) helloBad.push(`${type} shared: never its own`);
      for (const [name, lines] of [["no bond", h.stranger], ["bond 0", h.zero]]) {
        if (!lines.every((l) => plain(l) || own("hello").includes(l))) helloBad.push(`${type} ${name}: ${lines.find((l) => !plain(l) && !own("hello").includes(l))}`);
      }
      const warmOk = (l) => plain(l) || warmNormal.test(l) || own("hello").includes(l) || own("hello_warm").includes(l);
      if (!h.warm.every(warmOk)) helloBad.push(`${type} bond 2: ${h.warm.find((l) => !warmOk(l))}`);
      if (!h.warm.some((l) => own("hello_warm").includes(l))) helloBad.push(`${type} bond 2: no warm line`);
      const heartsOk = (l) => warmOk(l) || own("hello_hearts").includes(l);
      if (!h.hearts.every(heartsOk)) helloBad.push(`${type} bond 8: ${h.hearts.find((l) => !heartsOk(l))}`);
      if (!h.hearts.some((l) => own("hello_hearts").includes(l))) helloBad.push(`${type} bond 8: no bond-8 line`);
    }
    check("hellos by type: nameless on a shared screen and never a bond line; bond lines only with the viewer's own bond",
      helloBad.length === 0, helloBad.slice(0, 6).join(" | "));

    // The reveal: "i'm a teen now!", then the type's line in a bubble of its
    // own (with its catchphrase allowed); none for an adult or without a type.
    const reveal = await typeAs(async (el, s, t, types) => {
      t.pet("teen", null, 0);
      const out = {};
      for (const type of types) out[type] = t.moment({ type: "stage_changed", stage: "teen", from: "child", personality: type });
      out.adult = t.moment({ type: "stage_changed", stage: "adult", from: "teen", personality: "sweet", upbringing: "steady" });
      out.none = t.moment({ type: "stage_changed", stage: "teen", from: "child" });
      return out;
    }, TYPES);
    check("a new teen says its type after \"i'm a teen now!\", in a bubble of its own; an adult or no type, none",
      TYPES.every((type) => reveal[type].said === "i'm a teen now!" && reveal[type].queued.length === 1 &&
        PERSONA[type].reveal.includes(reveal[type].queued[0].text) && reveal[type].queued[0].catch) &&
      reveal.adult.queued.length === 0 && reveal.none.queued.length === 0 && reveal.none.said === "i'm a teen now!",
      JSON.stringify([reveal.plucky, reveal.adult, reveal.none]));
    await page.emulateMedia({ reducedMotion: null });

    // Live: the moment arrives through sensor.last_care and both lines show.
    await hush();
    await inject(pet["sensor.last_care"], {
      attributes: { moments: [{ type: "stage_changed", stage: "teen", from: "child", personality: "charming", at: new Date().toISOString() }] },
    });
    await page.waitForTimeout(500);
    const stageLine = await bubble();
    await shot("07e-reveal-stage-line");
    let revealLine = "";
    for (let i = 0; i < 30 && !PERSONA.charming.reveal.includes(revealLine); i++) {
      await page.waitForTimeout(300);
      revealLine = (await bubble()).trim();
    }
    await shot("07f-reveal-charming");
    check("live, the reveal shows after the stage line, neither lost", stageLine.trim() === "i'm a teen now!" &&
      PERSONA.charming.reveal.includes(revealLine), `${stageLine} -> ${revealLine}`);

    // Side by side, for the owner: a named hello, a shared-screen hello and a
    // moment, in three types' words (the stub kept until the shot is taken).
    const show = (type, stage, what) => page.locator("hatch-pet-card").evaluate(async (el, { type, stage, what }) => {
      const s = el._slides[el._index];
      window.__p2State ??= el._state;
      const realState = window.__p2State;
      el._state = function (slide, key) {
        const st = realState.call(this, slide, key);
        if (key !== "sensor.life_stage" || !st || slide !== s) return st;
        return { ...st, state: stage, attributes: { ...st.attributes, personality: type } };
      };
      window.__p2Mine ??= { mine: s.mine };
      s.mine = { ...(s.mine || {}), bond: null }; // no bond: the plain hellos
      const realRandom = Math.random;
      Math.random = () => 0.1;
      localStorage.setItem("hatch-shared-screen", what === "shared" ? "on" : "off");
      Object.assign(s, { asleep: false, calling: false, sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0,
        queue: [], voicedAt: Date.now() + 1e9 });
      try {
        if (what === "sunset") {
          el._moment(s, { type: "sunset", at: new Date().toISOString() });
        } else {
          localStorage.removeItem(`hatch-greet-${el._hass.user.id}-${s.ids?.device}`);
          s.greeted = false;
          el._greet(s);
        }
        el._stopTyping(s);
        s.sayUntil = Date.now() + 8000; // held for the screenshot
      } finally {
        Math.random = realRandom;
        localStorage.setItem("hatch-shared-screen", "off");
      }
      return s.bubble.textContent;
    }, { type, stage, what });
    const unshow = () => page.locator("hatch-pet-card").evaluate((el) => {
      if (window.__p2State) el._state = window.__p2State;
      if (window.__p2Mine) el._slides[el._index].mine = window.__p2Mine.mine;
      delete window.__p2State;
      delete window.__p2Mine;
      el._slides[el._index].sayUntil = 0;
    });
    const sideBySide = [];
    for (const [type, what] of [["sweet", "named"], ["old_soul", "named"], ["bouncy", "named"],
      ["starry", "shared"], ["fancy", "shared"], ["plucky", "shared"],
      ["mellow", "sunset"], ["charming", "sunset"], ["old_soul", "sunset"]]) {
      const said = await show(type, "teen", what);
      await page.waitForTimeout(150);
      const name = `07g-${what}-${type}`;
      await shot(name);
      sideBySide.push(`${name}: ${said}`);
    }
    await unshow();
    check("the side-by-side screenshots say each type's own line", sideBySide.length === 9 &&
      sideBySide.every((l) => !/: $/.test(l)), sideBySide.join(" | "));

    // P2b: the mood line and the idle mumble. The mood line is picked by a hash of
    // hatched_on, the key and the date, never Math.random, and is plain for the
    // needs and the house's lines; the idle mumble keeps the body's lines normal.
    const mood = await typeAs(async (el, s, t, types) => {
      const says = (key, reason) => el._say(s, { state: "x", attributes: { reason, reason_key: key } }, false);
      const out = { types: {} };
      for (const type of types) {
        let own = null, plain = null;
        const seen = {};
        for (let i = 0; i < 40 && !(own && plain); i++) {
          t.pet("adult", type, null, { hatched_on: `2026-01-${String(i + 1).padStart(2, "0")}` });
          t.random(0.1);
          const a = says("content", "all good");
          t.random(0.9);
          const b = says("content", "all good");
          const many = new Set([a, b]);
          for (let k = 0; k < 20; k++) many.add(says("content", "all good"));
          seen[i] = many.size;
          if (many.size !== 1) { out.flicker = `${type} ${i}: ${[...many]}`; }
          if (a === "all good") plain ||= i; else own ||= a;
        }
        out.types[type] = { own, plain, flicker: out.flicker || null };
        t.pet("adult", type, null, { hatched_on: "2026-01-01" });
        out.types[type].hungry = says("hungry", "a little hungry");
        out.types[type].home = says("home_rain", "listening to the rain");
        out.types[type].excited = says("excited", "that was fun!");
        out.types[type].cozy = says("cozy", "nice and cozy");
        out.types[type].bored = says("bored", "nothing to do");
      }
      t.pet("child", null, null, { hatched_on: "2026-01-01" });
      out.child = says("content", "all good");
      t.pet("teen", null, null, { hatched_on: "2026-01-01" });
      out.noType = says("content", "all good");
      return out;
    }, TYPES);
    const moodBad = [];
    for (const [type, m] of Object.entries(mood.types)) {
      if (!PERSONA[type].mood_content.includes(m.own)) moodBad.push(`${type}: no own line (${m.own})`);
      if (m.plain === null) moodBad.push(`${type}: never plain`);
      if (m.flicker) moodBad.push(m.flicker);
      if (m.hungry !== "a little hungry" || m.home !== "listening to the rain") moodBad.push(`${type}: needs/house not plain`);
      if (m.excited !== "that was fun!" && !PERSONA[type].mood_excited.includes(m.excited)) moodBad.push(`${type}: excited ${m.excited}`);
      // gaps-seams 4a: cozy and bored swap the same way.
      if (m.cozy !== "nice and cozy" && !PERSONA[type].mood_cozy.includes(m.cozy)) moodBad.push(`${type}: cozy ${m.cozy}`);
      if (m.bored !== "nothing to do" && !PERSONA[type].mood_bored.includes(m.bored)) moodBad.push(`${type}: bored ${m.bored}`);
    }
    if (mood.noType !== "all good") moodBad.push(`no type: ${mood.noType}`);
    check("P2b mood line: content swaps by hash for every type, same all day (no flicker, random-free), needs and home stay plain, no type is plain",
      moodBad.length === 0, moodBad.join(" | "));

    const idle = await typeAs(async (el, s, t, types) => {
      const out = {};
      const say = (type, moodState, r) => {
        t.pet("adult", type);
        s.moodState = moodState;
        s.bubble.textContent = "";
        for (let i = 0; i < 5 && !s.bubble.textContent; i++) { // the card's own tick may hold the pet a moment
          Object.assign(s, { sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0, nextIdle: 1 });
          let calls = 0; // draws: the next-idle delay, the move (0: mumble, first of the list), then the coin
          t.random(() => (calls++ < 2 ? 0 : r));
          const shelf = el._slides;
          el._slides = [s]; // no neighbour lines (gaps-seams 5b, checked on their own)
          el._idle(s);
          el._slides = shelf;
        }
        return s.bubble.textContent || `(idle did not run: free=${!!el._free(s)} mood=${s.moodState} moves=${el._idleMoves(s, false, false)} st=${JSON.stringify([s.asleep, s.calling, !!s.game, !!s.scene, s.sayUntil - Date.now(), s.poseUntil - Date.now(), s.propUntil - Date.now(), s.flairUntil - Date.now(), s.movingUntil - Date.now()])})`;
      };
      for (const type of types) {
        out[type] = { content: say(type, "content", 0.1), bored: say(type, "bored", 0.1), excited: say(type, "excited", 0.1),
          sleepy: say(type, "sleepy", 0.1), hungry: say(type, "hungry", 0.1), dirty: say(type, "dirty", 0.1), plain: say(type, "content", 0.9) };
      }
      return out;
    }, TYPES);
    const idleBad = [];
    for (const [type, o] of Object.entries(idle)) {
      if (!PERSONA[type].idle.includes(o.content)) idleBad.push(`${type} content: ${o.content}`);
      if (!PERSONA[type].idle_bored.includes(o.bored)) idleBad.push(`${type} bored: ${o.bored}`);
      if (!PERSONA[type].idle_excited.includes(o.excited)) idleBad.push(`${type} excited: ${o.excited}`);
      for (const k of ["sleepy", "hungry", "dirty"]) {
        if (Object.values(PERSONA[type]).some((l) => l.includes?.(o[k]))) idleBad.push(`${type} ${k}: ${o[k]} is a type line`);
      }
      if (Object.values(PERSONA[type]).some((l) => l.includes?.(o.plain))) idleBad.push(`${type} plain: ${o.plain}`);
    }
    check("P2b idle mumble: the type's lines by mood (default, bored, excited) on the heads side, sleepy/hungry/dirty and the tails side stay normal",
      idleBad.length === 0, idleBad.join(" | "));
    // gaps-seams 5b: with a neighbour on the shelf, the neighbour roll (1 in 6) names it,
    // never for a bodily mood; alone on the shelf, never.
    const near = await typeAs(async (el, s, t) => {
      const say = (moodState, r, alone) => {
        t.pet("adult", null);
        s.moodState = moodState;
        s.bubble.textContent = "";
        const shelf = el._slides;
        const other = { ids: { device: "cc-neighbour" } };
        el._slides = alone ? [s] : [s, other];
        const devices = el._hass.devices;
        el._hass.devices = { ...devices, "cc-neighbour": { name: "Nib" } };
        for (let i = 0; i < 5 && !s.bubble.textContent; i++) {
          Object.assign(s, { sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0, nextIdle: 1 });
          let calls = 0;
          t.random(() => (calls++ < 2 ? 0 : r));
          el._idle(s);
        }
        el._slides = shelf;
        el._hass.devices = devices;
        return s.bubble.textContent;
      };
      return { named: say("content", 0.1), bodily: say("hungry", 0.1), alone: say("content", 0.1, true), off: say("content", 0.5) };
    });
    check("gaps-seams 5b: an idle line may name a neighbour on the shelf, never for a bodily mood or alone",
      /Nib/.test(near.named) && !/Nib/.test(near.bodily) && !/Nib/.test(near.alone) && !/Nib/.test(near.off), JSON.stringify(near));

    // The upbringing lines: an adult at most once a week at the first look; never
    // a baby, child or teen; every upbringing has a happy line of its own.
    const grown = await typeAs(async (el, s, t) => {
      const device = s.ids?.device;
      const key = `hatch-upbringing-${device}`;
      const realKeep = localStorage.getItem(key);
      // _firstLook spends the day's dream and wish and moves the "seen" mark: put them back.
      const spent = Object.keys(localStorage).filter((k) => /^hatch-(dream|wish|wishmention|welcomed|seen)-/.test(k))
        .map((k) => [k, localStorage.getItem(k)]);
      const wasLooked = s.lookedFirst, wasQueue = s.queue, wasSay = s.sayUntil;
      const look = (stage, upbringing, { clear = true } = {}) => {
        t.pet(stage, "sweet", null, { upbringing });
        if (clear) localStorage.removeItem(key);
        Object.assign(s, { lookedFirst: false, queue: [], asleep: false });
        el._channelHeard = () => true;
        el._firstLook(s);
        const out = s.queue.map((q) => q.text);
        s.queue = [];
        return out;
      };
      const out = { stages: {} };
      try {
        for (const stage of ["baby", "child", "teen", "adult"]) out.stages[stage] = look(stage, "devoted");
        out.each = {};
        for (const u of ["devoted", "steady", "scrappy"]) out.each[u] = look("adult", u);
        out.first = look("adult", "steady");
        out.again = look("adult", "steady", { clear: false });
        localStorage.setItem(key, String(Date.now() - 8 * 24 * 3600 * 1000));
        out.nextWeek = look("adult", "steady", { clear: false });
        out.unknown = look("adult", "weird");
      } finally {
        delete el._channelHeard;
        for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish|wishmention|welcomed|seen)-/.test(k)) localStorage.removeItem(k);
        for (const [k, v] of spent) localStorage.setItem(k, v);
        Object.assign(s, { lookedFirst: wasLooked, queue: wasQueue, sayUntil: wasSay });
        if (realKeep === null) localStorage.removeItem(key); else localStorage.setItem(key, realKeep);
      }
      return out;
    });
    const UP = { devoted: "you always looked after me ♥", steady: "I turned out just right ♪", scrappy: "I'm a bit of a rascal, hehe ♥" };
    const grownBad = [];
    for (const stage of ["baby", "child", "teen"]) if (grown.stages[stage].some((l) => Object.values(UP).includes(l))) grownBad.push(`${stage} got one`);
    for (const [u, line] of Object.entries(UP)) if (!grown.each[u].includes(line)) grownBad.push(`${u}: ${grown.each[u]}`);
    if (!grown.first.includes(UP.steady)) grownBad.push("first look: none");
    if (grown.again.includes(UP.steady)) grownBad.push("twice in a week");
    if (!grown.nextWeek.includes(UP.steady)) grownBad.push("not again after 8 days");
    if (grown.unknown.length && grown.unknown.some((l) => Object.values(UP).includes(l))) grownBad.push("unknown upbringing");
    check("upbringing lines: an adult gets its own once a week at the first look, never a baby, child or teen",
      grownBad.length === 0, grownBad.join(" | "));

    // P3: the move list per type. Calm (reduced motion) leaves only mumble and
    // pose for every type; otherwise each type's row adds its copies; "praised"
    // takes the first body move the row adds (greethop where it adds none).
    const manner = await typeAs(async (el, s, t, types) => {
      const out = {};
      const count = (list, m) => list.filter((x) => x === m).length;
      for (const type of types) {
        t.pet("adult", type);
        s.moodState = "content";
        const base = (() => { t.pet("adult", null); return el._idleMoves(s, false, false); })();
        t.pet("adult", type);
        const moves = el._idleMoves(s, false, false);
        const calmMoves = el._idleMoves(s, true, true);
        out[type] = { extra: ["mumble", "look", "wander", "perk", "speck", "hop"]
          .map((m) => [m, count(moves, m) - count(base, m)]).filter(([, n]) => n), calm: calmMoves.join(),
          praise: el._praiseMove(s), praiseGame: el._praiseMove(s, true), base: base.join() };
      }
      t.pet("teen", null);
      out.noType = el._idleMoves(s, false, false).join();
      t.pet("child", "bouncy");
      out.child = el._idleMoves(s, false, false).join();
      return out;
    }, TYPES);
    const WANT = { mellow: [["mumble", 2]], sweet: [], bouncy: [["hop", 1]], starry: [["mumble", 1], ["perk", 1]],
      old_soul: [["look", 2]], fancy: [["perk", 2]], charming: [["look", 1], ["perk", 1]], plucky: [["wander", 1], ["perk", 1]] };
    // Bouncy's hop plays as greethop (_render clears "hop"); in a game plucky perks, not wanders.
    const PRAISE = { mellow: "greethop", sweet: "greethop", bouncy: "greethop", starry: "perk", old_soul: "greethop", fancy: "perk",
      charming: "perk", plucky: "wander" };
    const mannerBad = [];
    for (const type of TYPES) {
      const m = manner[type];
      if (JSON.stringify(m.extra) !== JSON.stringify(WANT[type])) mannerBad.push(`${type}: adds ${JSON.stringify(m.extra)}`);
      if (m.calm !== "mumble,pose,pose") mannerBad.push(`${type}: calm ${m.calm}`);
      if (m.praise !== PRAISE[type]) mannerBad.push(`${type}: praise ${m.praise}`);
      if (m.praiseGame !== (type === "plucky" ? "perk" : PRAISE[type])) mannerBad.push(`${type}: praise in a game ${m.praiseGame}`);
    }
    if (manner.noType !== manner[TYPES[0]].base || manner.child !== manner[TYPES[0]].base) mannerBad.push("no type / child not the base list");
    if (!manner.bouncy.base.split(",").every((m) => m !== "hop")) mannerBad.push("hop in the content base list");
    check("P3 manner: each type adds its moves (bouncy a hop even when content), calm leaves mumble and pose, no type or a child is unchanged, praise follows the row",
      mannerBad.length === 0, mannerBad.join(" | "));
  }

  }
  if (enter("egg")) {
  // 5. The egg wiggles, then cracks, before it hatches.
  // A pet update can replace the injected egg, so inject until it shows (or 3 tries).
  for (const [minutes, frames] of [[12, "egg_wiggle"], [4, "egg_crack"]]) {
    let src = "";
    for (let i = 0; i < 3 && !src.includes(frames); i++) {
      await inject(pet["sensor.life_stage"], {
        state: "egg", attributes: { hatches_at: new Date(Date.now() + minutes * 60000).toISOString() },
      });
      await page.waitForTimeout(1200);
      src = (await cur().locator(".pet").getAttribute("src")) || "";
    }
    check(`egg shows ${frames}`, src.includes(frames), src.split("/").slice(-1)[0]);
  }
  // UX fix 2, F12: an egg's status page is "you two" and when it hatches, none of the care meters.
  for (const [minutes, line] of [[25, "warm and growing ♪"], [10, "wiggling! any minute ♪"], [4, "cracking! ♥"]]) {
    await inject(pet["sensor.life_stage"], { state: "egg", attributes: { hatches_at: new Date(Date.now() + minutes * 60000).toISOString() } });
    await page.waitForTimeout(1200);
    const egg = await card.first().evaluate((el) => {
      const s = el._slides[el._index];
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      el._toggleStatus(s);
      const out = { rows: [...s.status.querySelectorAll(".row")].map((r) => r.textContent.trim()), text: s.status.textContent };
      el._toggleStatus(s);
      return out;
    });
    check(`UX2 F12: an egg ${minutes} min out says "${line}" and shows no care meters`,
      egg.rows.some((r) => r === `hatching${line}`) && !/hunger|happy|energy|health|discipline|weight|traits|no care yet|all new here/.test(egg.text), JSON.stringify(egg));
  }
  // UX fix 4, F2: an egg can be patted (it rocks, says "♪", the status stays shut) and doesn't greet
  // by name (its greeting waits for the hatch). F10: the bubble counts "N min" with a no-break
  // space, and says what the status says in the last 6 minutes.
  await inject(pet["sensor.life_stage"], { state: "egg", attributes: { hatches_at: new Date(Date.now() + 25 * 60000).toISOString() } });
  await page.waitForTimeout(1200);
  const eggPat = await card.first().evaluate((el) => {
    const s = el._slides[el._index];
    if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
    const out = { patOn: el._patOn(s) };
    const greeted = s.greeted;
    s.greeted = false;
    el._greet(s); // an egg doesn't greet: the flag stays down for the hatch
    out.greetedAfter = s.greeted;
    s.greeted = greeted;
    s.patAt = 0;
    s.sayUntil = 0;
    out.say25 = el._say(s, null, false);
    s.hatchesAt = new Date(Date.now() + 4 * 60000).toISOString();
    out.say4 = el._say(s, null, false);
    s.hatchesAt = new Date(Date.now() + 25 * 60000).toISOString();
    s.pat.click();
    out.bubble = s.bubble.textContent;
    out.rocked = s.pet.classList.contains("rock");
    out.status = s.screen.classList.contains("show-status");
    return out;
  });
  check("UX4 F2: an egg's pat rocks it and says ♪, opens no status, and it hasn't greeted",
    eggPat.patOn && eggPat.bubble === "♪" && eggPat.rocked && !eggPat.status && !eggPat.greetedAfter, JSON.stringify(eggPat));
  check("UX4 F10: the egg's bubble keeps '25 min' together, and says 'cracking! ♥' at 6 or fewer",
    /^hatching in about 25\u00a0min$/.test(eggPat.say25) && eggPat.say4 === "cracking! ♥", JSON.stringify(eggPat));
  // The name sheet (settings S3): naming the new generation. It lives here, after the moments section, because
  // it swaps the pet's states for a while; the moments checks near the layout and timing limit are touchy about that.
  // (SKIP_S3 leaves it out, to tell its effects from others'.) The lay press, the server's answers and the
  // pet's stage and generation are stubbed on this card's own hass (a copy, put back at the end).
  const naming = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const realTimeout = window.setTimeout; // the expiry check swaps setTimeout for a while: waits keep the real one
    const wait = (ms) => new Promise((r) => realTimeout(r, ms));
    const s = el._slides[el._index];
    const realHass = el._hass;
    const lifeId = s.ids["sensor.life_stage"];
    const life = realHass.states[lifeId];
    const gen = Number(life.attributes.generation ?? 1);
    const had = s.ids["button.lay_egg"];
    const sent = [], pressed = [];
    let answer = () => ({ name: "x" }); // what the fake server says to a rename (may throw {code})
    let layFails = false;
    // The pet's state: its stage and generation ("gone" is the entry reloading: unavailable, no attributes).
    const put = (stage, generation) => {
      const state = stage === "gone" ? { ...life, state: "unavailable", attributes: {} }
        : { ...life, state: stage, attributes: { ...life.attributes, generation } };
      el._hass = { ...realHass, states: { ...realHass.states, [lifeId]: state },
        callService: async (d, svc, data) => { pressed.push(`${d}.${svc}`); if (layFails) throw new Error("no"); },
        callWS: async (msg) => {
          if (msg.type !== "virtual_pet/rename") return realHass.callWS.call(realHass, msg);
          sent.push(msg);
          return answer(msg);
        } };
      s.drawnSig = null;
    };
    const settle = async () => { el._redraw(s); await wait(300); }; // _update is async
    const closed = () => !s.nameSheet && !s.screen.classList.contains("show-status");
    const isOpen = () => s.nameSheet && s.screen.classList.contains("show-status") && !!s.status.querySelector(".nameinput");
    const lay = async () => { // the tap of a lay, as the card sends it
      s.ids["button.lay_egg"] = s.ids["button.lay_egg"] || "button.nobody_lay_egg";
      el._press(s, "lay_egg");
      await wait(40);
    };
    const reopen = async (stage = "egg") => {
      put("adult", gen);
      await settle();
      await lay();
      put(stage, gen + 1);
      await settle();
      return isOpen();
    };
    const type = (text) => { const f = s.status.querySelector(".nameinput"); f.value = text; return f; };
    const save = async () => { s.nameSheetAt = 0; s.status.querySelector(".namego").click(); await wait(60); };
    const err = () => s.status.querySelector(".nameerr");
    const out = {};
    const timers = [];
    try {
      // The trigger: the sheet opens when the sensor shows an egg of the next generation, and not before.
      put("adult", gen);
      await settle();
      out.noneYet = closed() && !s.layAt;
      await lay();
      out.waiting = s.layAt?.generation === gen && closed() && pressed.at(-1) === "button.press";
      put("adult", gen);
      await settle();
      out.sameGeneration = closed() && !!s.layAt; // nothing changed: nothing opens
      put("egg", gen); // an egg, but not a newer one
      await settle();
      out.notNewer = closed();
      put("gone"); // the entry reloading after a lay that moves the world: keep waiting
      await settle();
      out.waitsThroughGone = closed() && !!s.layAt;
      put("egg", gen + 1);
      await settle();
      out.opens = isOpen() && !s.layAt;
      const field = s.status.querySelector(".nameinput");
      out.fieldName = field.value === el._petName(s) && field.maxLength === 20 && field.getAttribute("aria-label") === "the new egg's name, up to 20 characters"
        && document.activeElement !== null;
      out.lines = s.status.querySelector(".sec").textContent === "a name for the egg"
        && s.status.querySelector(".namego").textContent === "name it"
        && s.status.querySelector(".nameback").textContent === `keep ${el._petName(s)}`;
      // The save: sends {type, entity_id, name} (spaces as typed; the server tidies), says N13 on the screen, closes.
      answer = (msg) => ({ name: msg.name });
      type("Fern");
      await save();
      out.sends = sent.length === 1 && sent[0].type === "virtual_pet/rename" && sent[0].entity_id === lifeId && sent[0].name === "Fern";
      out.saved = closed() && s.bubble.textContent === "Fern! i like it ♥";
      sent.length = 0;
      // Enter submits; the same text twice is one rename.
      await reopen();
      type("  Fern   Two ").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await wait(60);
      out.enter = sent.length === 1 && sent[0].name === "Fern Two" && closed();
      sent.length = 0;
      // Empty or blank: N14 without asking the server; the field and sheet stay.
      await reopen();
      type("   ");
      await save();
      out.blank = sent.length === 0 && isOpen() && err().textContent === "keep it short, and not blank" && !err().hidden;
      type("a");
      s.status.querySelector(".nameinput").dispatchEvent(new Event("input", { bubbles: true }));
      out.errClears = err().hidden;
      // Each error key shows its own line under the field; the sheet and the typed text stay.
      const want = { bad_name: "keep it short, and not blank", taken: "another pet here has that name",
        not_now: "only a new egg or baby can be named", read_only: "this login can't name, sorry",
        unknown_command: "hm, that name didn't stick ♪", no_pet: "hm, that name didn't stick ♪" };
      out.errors = true;
      for (const [code, line] of Object.entries(want)) {
        answer = () => { throw { code }; };
        type("Moss");
        await save();
        if (!(isOpen() && err().textContent === line && s.status.querySelector(".nameinput").value === "Moss")) out.errors = `${code}: ${err()?.textContent}`;
      }
      // Hatching resets nothing here: the cap is on the field.
      out.cap = s.status.querySelector(".nameinput").maxLength === 20;
      // not_ready (the entry reloading): once more after 2 s, then it succeeds; twice shows N18.
      let calls = 0;
      answer = (msg) => { calls++; if (calls === 1) throw { code: "not_ready" }; return { name: msg.name }; };
      sent.length = 0;
      type("Moss");
      await save();
      out.retryWaits = sent.length === 1 && isOpen();
      await wait(2300);
      out.retryOnce = sent.length === 2 && closed() && s.bubble.textContent === "Moss! i like it ♥";
      await reopen();
      calls = 0;
      sent.length = 0;
      answer = () => { calls++; throw { code: "not_ready" }; };
      type("Moss");
      await save();
      await wait(2300);
      out.retryThenFails = sent.length === 2 && isOpen() && err().textContent === "hm, that name didn't stick ♪";
      // The exits: keep (no call), Escape in the field, the status chip, a swipe, the shared-screen switch,
      // the pet leaving the baby stage, and another generation.
      sent.length = 0;
      s.nameSheetAt = 0;
      s.status.querySelector(".nameback").click();
      out.keep = closed() && sent.length === 0;
      await reopen();
      s.status.querySelector(".nameinput").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      out.escape = closed() && sent.length === 0;
      await reopen();
      el._toggleStatus(s);
      out.chip = closed();
      const n = el._slides.length;
      if (n > 1) {
        await reopen();
        el._go((el._index + 1) % n);
        const gone = closed();
        el._go(el._slides.indexOf(s));
        out.swipe = gone;
      } else out.swipe = true;
      await reopen();
      put("child", gen + 1);
      await settle();
      out.child = closed();
      await reopen(); // a new generation always starts as an egg; the sheet stays open as it turns baby
      put("baby", gen + 1);
      await settle();
      out.baby = isOpen();
      put("baby", gen + 2);
      await settle();
      out.otherGeneration = closed();
      // Shared screen: the sheet opens and saves there too; the switch closes it.
      localStorage.setItem("hatch-shared-screen", "on");
      el._goShared();
      out.sharedOpens = await reopen();
      answer = (msg) => ({ name: msg.name });
      type("Fern");
      await save();
      out.sharedSaves = sent.at(-1)?.name === "Fern" && closed();
      await reopen();
      localStorage.setItem("hatch-shared-screen", "off");
      el._goPersonal();
      out.sharedExit = closed();
      // A lay that fails to press drops the wait; a lay refused by the server (nothing changes) opens
      // nothing and the wait is dropped after 30 s, longer while the pet is reloading.
      put("adult", gen);
      await settle();
      layFails = true;
      await lay();
      await wait(60);
      out.failedPress = !s.layAt && closed();
      layFails = false;
      window.setTimeout = (fn, ms, ...rest) => { timers.push([fn, ms]); return realTimeout(() => {}, 1e9); };
      await lay();
      const expire = timers.find(([, ms]) => ms === 30000);
      window.setTimeout = realTimeout;
      out.expiry = !!expire && !!s.layAt;
      s.reloading = true;
      expire?.[0]();
      out.expiryWaitsWhileReloading = !!s.layAt;
      s.reloading = false;
      expire?.[0]();
      out.expires = !s.layAt;
      // A pet change drops the wait.
      const other = el._buildSlide(); // a slide that now shows another pet: _forget on one of its own
      other.layAt = { generation: gen, at: Date.now() };
      other.nameSheet = true;
      el._forget(other);
      out.petChange = !other.layAt && !other.nameSheet;
      other.el.remove(); // _buildSlide put it in the track
      // The status row: on an egg and a baby, not a child; "change" opens the sheet, keep goes back to the page.
      const row = async (stage) => {
        put(stage, gen);
        if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
        await settle();
        el._toggleStatus(s);
        return !!s.status.querySelector(".namechange");
      };
      out.rowEgg = await row("egg");
      const rowText = [...s.status.querySelectorAll(".row")].find((r) => r.querySelector(".namechange"))?.textContent || "";
      out.rowLines = rowText.startsWith("name") && rowText.endsWith("change") && rowText.includes(el._petName(s));
      s.status.querySelector(".namechange").click();
      out.rowOpens = isOpen() && s.nameFrom === "status";
      s.nameSheetAt = 0;
      s.status.querySelector(".nameback").click();
      out.rowKeep = !s.nameSheet && s.screen.classList.contains("show-status") && !!s.status.querySelector(".namechange");
      out.rowSave = true;
      s.status.querySelector(".namechange").click();
      answer = (msg) => ({ name: msg.name });
      type("Pip2");
      await save();
      out.rowSave = !s.nameSheet && s.screen.classList.contains("show-status") && s.status.querySelector(".status-feedback")?.textContent === "Pip2! i like it ♥";
      out.rowBaby = await row("baby");
      out.rowChild = !(await row("child"));
      out.rowAdult = !(await row("adult"));
      el._toggleStatus(s);
    } finally {
      window.setTimeout = realTimeout;
      // Home Assistant's own hass as it is now, not the copy taken at the start (this block ran for seconds).
      el.hass = document.querySelector("home-assistant").hass;
      s.sayUntil = 0;
      s.queue = [];
      s.wasGone = false;
      localStorage.setItem("hatch-shared-screen", "off");
      if (had === undefined) delete s.ids["button.lay_egg"];
      el._layDrop(s);
      s.nameSheet = false;
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      s.confirm = null;
      s.drawnSig = null;
    }
    return out;
  });
  for (const [name, ok] of Object.entries(naming)) check(`settings S3 name sheet: ${name}`, ok === true, JSON.stringify(naming));

  }
  if (enter("sharedscreen")) {
  await pinAwake(card, "sharedscreen");
  // Fresh-expand E8: a best friend's weekly line (B-a) never on a shared screen; a
  // visitor stays twice as long there (Sh-a).
  {
    const e8s = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const mine = s.mine;
      const favKey = `hatch-fav-${s.ids.device}`;
      const had = { fav: localStorage.getItem(favKey), shared: localStorage.getItem("hatch-shared-screen") };
      const out = {};
      try {
        s.mine = { ...(mine || {}), bond: { level: 10 } };
        localStorage.removeItem(favKey);
        localStorage.setItem("hatch-shared-screen", "on");
        out.sharedFav = el._favLine(s);
        const v = { id: "snail", name: "snail", walk: true, lines: ["hi"] };
        const stay = () => {
          const V = el._visitorStart(s, v, { count: false });
          const ms = V.until - Date.now();
          el._visitorEnd(s);
          return ms;
        };
        out.shared = stay();
        localStorage.removeItem("hatch-shared-screen");
        out.personal = stay();
        out.personalFav = el._favLine(s);
        out.again = el._favLine(s);
      } finally {
        s.mine = mine;
        if (had.fav === null) localStorage.removeItem(favKey); else localStorage.setItem(favKey, had.fav);
        if (had.shared === null) localStorage.removeItem("hatch-shared-screen"); else localStorage.setItem("hatch-shared-screen", had.shared);
        Object.assign(s, { flairUntil: 0, visitUntil: 0 });
      }
      return out;
    });
    check("fresh E8 (B-a): bond 10 gets its weekly line on a personal screen, once a week, never on a shared one",
      e8s.sharedFav === null && typeof e8s.personalFav === "string" && e8s.again === null, JSON.stringify(e8s));
    check("fresh E8 (Sh-a): a visitor stays longer on a shared screen (its stay twice over)",
      e8s.shared - e8s.personal >= 2900, JSON.stringify(e8s));
  }
  // 5b. FA: turning on "shared screen" clears every personal line, typed or
  // typing, on every slide of every card on the page and in every tab (privacy P1).
  {
    const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
    // The page's own card gets a stable handle before a second one is added: a bare
    // `.first()` would resolve to the second card once it is on the page.
    await page.locator("hatch-pet-card").first().evaluate((el) => el.setAttribute("data-fa", "one"));
    const card = page.locator('hatch-pet-card[data-fa="one"]');
    // Every card instance gets a close bond: nickname "sunbeam", level 8 (as
    // the channel's "mine" would have it, on every slide).
    const personal = (el) => {
      el._slides.forEach((s) => el._mineFor(s, { ...(s.mine || {}), bond: { level: 8, nickname: "sunbeam" } }));
    };
    // A second tab on the same browser (same localStorage), with its own personal line.
    const tab = await context.newPage();
    tab.on("pageerror", (e) => errors.push(`tab 2: ${e}`));
    await tab.goto(`${HA}/pet-bench/pet`);
    await tab.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await settle(tab); // the frontend may reload itself once
    // That reload can catch the frontend mid-fetch and leave a failed module import
    // (see reloadFor): if the card isn't up, reload once more before giving up.
    await tab.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 }).catch(() => reloadFor(tab, "hatch-pet-card .statusbtn", 30000)).catch(async (err) => {
      // What the tab shows instead, for the next person chasing this.
      await tab.screenshot({ path: path.join(OUT, "05b-tab2-timeout.png") }).catch(() => {});
      const why = await tab.locator("hatch-pet-card").first().evaluate((el) => {
        const btn = el.shadowRoot?.querySelector(".statusbtn");
        const s = el._slides?.[el._index];
        return { url: location.href, slides: el._slides?.length, booting: el._booting,
          stage: s && el._state(s, "sensor.life_stage")?.state, statusbtn: !!btn, shown: !!btn?.offsetParent };
      }, null, { timeout: 5000 }).catch((e) => `no card: ${String(e).split("\n")[0]}`);
      console.log(`note: tab 2 never showed the status button: ${JSON.stringify(why)}`);
      throw err;
    });
    // The page's helpers (sharedScreen is the card module's; mirror it here).
    const setup = String.raw`
      window.sharedScreen = () => localStorage.getItem("hatch-shared-screen") === "on";
      // Every subscribe sent on this page's socket, shared or not.
      window.__subs = [];
      const conn = document.querySelector("home-assistant").hass.connection;
      if (!conn.__subsWrapped) {
        const real = conn.subscribeMessage.bind(conn);
        conn.subscribeMessage = (cb, msg, opts) => {
          if (msg?.type === "virtual_pet/subscribe") window.__subs.push({ shared: msg.shared, opts });
          return real(cb, msg, opts);
        };
        conn.__subsWrapped = true;
      }
      window.__personal = ${personal.toString()};
      window.__say = (el, s) => {
        el._speak(s, "hi, sunbeam! hi ${USER.name}, my sunbeam friend, so good to see you here", 60000);
        el._bondHearts(s);
      };
      window.__look = (el) => el._slides.map((s) => ({
        bubble: s.bubble.textContent, live: s.live.textContent, typing: !!s.typing, babbling: !!s.babbling,
        hearts: s.screen.querySelectorAll(".bondhearts").length,
        // Personal rows in whichever view is up: the status ("you two") or the settings sheet.
        status: /you two|my day|notify me|baby talk|my data/.test(s.status.textContent),
      }));`;
    await evaluate(setup);
    // The second card, and proof it is not the first: every FA step reads both through this.
    await evaluate(() => {
      window.__faTwo = (el) => {
        const two = document.getElementById("fa-second");
        if (!two || two === el || el.getAttribute("data-fa") !== "one") throw new Error("FA step: el and two are not different cards");
        return two;
      };
    });
    await tab.evaluate(setup);
    await tab.locator("hatch-pet-card").evaluate((el) => {
      el.setConfig({ ...el._config, seasonal: false }); // no costume line mid-check
      el.hass = el._hass;
      window.__personal(el);
      el._slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; });
      const s = el._slides[el._index];
      window.__say(el, s);
    });
    // A second card on this page.
    await card.evaluate(async (el) => {
      localStorage.setItem("hatch-shared-screen", "off");
      const two = document.createElement("hatch-pet-card");
      two.id = "fa-second";
      two.style.cssText = "position:fixed;left:0;top:0;width:400px;z-index:-1";
      two.setConfig({ ...el._config, seasonal: false });
      document.body.append(two);
      two.hass = el._hass;
      for (let i = 0; i < 40 && !two._slides?.[0]?.species; i++) await new Promise((r) => setTimeout(r, 250));
      for (const c of [el, two]) {
        window.__personal(c);
        c._slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; });
      }
    });
    const round = async (typing) => {
      await tab.evaluate(() => { window.__subs = []; });
      const before = await card.evaluate(async (el, typing) => {
        window.__subs = [];
        localStorage.setItem("hatch-shared-screen", "off");
        const two = window.__faTwo(el);
        const s = el._slides[el._index];
        const other = el._slides.find((x) => x !== s);
        s.screen.classList.remove("show-status");
        // The other slide: its status drawn personally, its bond hearts showing.
        other.statusHtml = null;
        el._renderStatus(other, []);
        el._bondHearts(other);
        window.__say(two, two._slides[two._index]);
        window.__say(el, s);
        const out = { typing: !!s.typing, said: s.bubble.textContent, live: s.live.textContent,
          otherStatus: /you two/.test(other.status.textContent), babble: localStorage.getItem("hatch-babble") };
        if (!typing) el._stopTyping(s, false);
        // The settings sheet opens on this slide (as the gear does), with its
        // personal rows, and its switch is pressed.
        s.settings = true;
        el._renderStatus(s, []);
        out.sheetPersonal = /notify me/.test(s.status.textContent) && /my data/.test(s.status.textContent);
        s.status.querySelector(".bell.shared").click();
        return out;
      }, typing);
      await page.waitForTimeout(1500); // a tick or two
      const after = await card.evaluate((el) => ({
        one: window.__look(el), two: window.__look(window.__faTwo(el)),
        message: el._slides[el._index].status.querySelector(".status-feedback")?.textContent,
        sheetKept: !!el._slides[el._index].status.querySelector(".sback") &&
          !!el._slides[el._index].status.querySelector(".bell.sound"),
      }));
      const inTab = await tab.locator("hatch-pet-card").evaluate((el) => window.__look(el));
      // Each card's slides asked the channel again, as a shared screen (no library resubscribe).
      const subs = {
        page: await card.evaluate((el) => ({ shared: window.__subs.filter((x) => x.shared && x.opts?.resubscribe === false).length,
          slides: el._slides.length + window.__faTwo(el)._slides.length })),
        tab: await tab.locator("hatch-pet-card").evaluate((el) => ({
          shared: window.__subs.filter((x) => x.shared && x.opts?.resubscribe === false).length, slides: el._slides.length })),
      };
      const clean = (looks) => looks.every((l) => !/sunbeam/.test(l.bubble + l.live) &&
        !l.bubble.includes(USER.name) && !l.live.includes(USER.name) &&
        !l.typing && !l.babbling && !l.hearts && !l.status);
      return { before, after, inTab, subs, clean: clean(after.one) && clean(after.two) && clean(inTab) };
    };
    // Its own tab's line, said fresh before each round.
    const sayInTab = () => tab.locator("hatch-pet-card").evaluate((el) => window.__say(el, el._slides[el._index]));
    const typingRound = await round(true);
    check("FA: shared screen clears a personal line still typing, on every slide, card and tab",
      typingRound.before.said.includes("sunbeam") && typingRound.before.live.includes("sunbeam") &&
      typingRound.before.otherStatus && typingRound.before.sheetPersonal && typingRound.after.sheetKept && typingRound.clean &&
      typingRound.after.message === "shh, nothing personal here now",
      JSON.stringify({ ...typingRound, typedWhenPressed: typingRound.before.typing }));
    check("FA: every card and tab asks its channel again as a shared screen",
      typingRound.subs.page.shared >= typingRound.subs.page.slides && typingRound.subs.tab.shared >= typingRound.subs.tab.slides,
      JSON.stringify(typingRound.subs));
    await sayInTab();
    const doneRound = await round(false);
    check("FA: and a personal line already typed out", doneRound.before.said.includes("sunbeam") && doneRound.clean,
      JSON.stringify(doneRound));
    await card.locator(".slide:not(.away-slide) .device").screenshot({ path: path.join(OUT, "08a-shared-cleared.png") });
    // Closing the status changes nothing: the next line is the mood's own.
    const closed = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      s.screen.classList.remove("show-status");
      await new Promise((r) => setTimeout(r, 1500));
      return { looks: window.__look(el), index: el._index };
    });
    check("FA: the status closed, still nothing personal, and the pet says its idle line",
      closed.looks.every((l) => !/sunbeam/.test(l.bubble + l.live) && !l.hearts) &&
      closed.looks[closed.index].bubble.length > 0,
      JSON.stringify(closed));
    // Personal again: other cards and tabs follow, with their status redrawn.
    await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.settings = true; // the switch lives in the settings sheet
      el._renderStatus(s, []);
      s.status.querySelector(".bell.shared").click();
      s.settings = false; // the status again, for the bond row below
    });
    await page.waitForTimeout(800);
    const back = await card.evaluate((el) => {
      const two = window.__faTwo(el);
      const s = two._slides[0];
      window.__personal(two); // its bond, as the personal channel brings it back
      s.statusHtml = null;
      two._renderStatus(s, []);
      return { shared: localStorage.getItem("hatch-shared-screen"), you: /you two/.test(s.status.textContent),
        bond: !!two._bond(s), view: s.journal ? "journal" : s.settings ? "settings" : "status",
        text: s.status.textContent.replace(/\s+/g, " ").slice(0, 120) };
    });
    check("FA: turning it off again makes every card personal", back.shared === "off" && back.you, JSON.stringify(back));
    // A card off the page (a view switch) misses the switch's event: shared
    // screen goes on while it's away, and it catches up when it's back.
    const away = await card.evaluate(async (el) => {
      const two = window.__faTwo(el);
      const s = two._slides[two._index];
      window.__personal(two);
      window.__say(two, s);
      s.queue = [{ text: "can I call you sunbeam? ♥", ms: 4000 }];
      const before = { said: s.bubble.textContent, queued: s.queue.length };
      two.remove(); // its typing line is written in whole on the way out
      const one = el._slides[el._index];
      one.settings = true; // the switch lives in the settings sheet
      el._renderStatus(one, []);
      one.status.querySelector(".bell.shared").click();
      one.settings = false;
      const shared = localStorage.getItem("hatch-shared-screen");
      document.body.append(two);
      await new Promise((r) => setTimeout(r, 1500)); // a tick or two
      try {
        const looks = window.__look(two);
        return { before, shared, looks, queue: two._slides.flatMap((x) => (x.queue || []).map((q) => q.text)) };
      } finally { // and off again, for what follows
        localStorage.setItem("hatch-shared-screen", "off");
        el._goPersonal();
        two._goPersonal();
      }
    });
    check("FA: a card away from the page when shared screen went on clears its personal lines when it's back",
      away.before.said.includes("sunbeam") && away.shared === "on" && away.queue.every((t) => !/sunbeam/.test(t)) &&
      away.looks.every((l) => !/sunbeam/.test(l.bubble + l.live) && !l.bubble.includes(USER.name) &&
        !l.live.includes(USER.name) && !l.typing && !l.babbling && !l.hearts && !l.status),
      JSON.stringify(away));
    // A visit reply that lands after the switch queues no personal note or question.
    const late = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const hass = el._hass;
      const real = hass.callService;
      let answer;
      hass.callService = () => new Promise((r) => { answer = r; });
      Object.assign(s, { visitedAt: 0, queue: [], asking: false });
      try {
        el._visit(s);
      } finally {
        hass.callService = real;
      }
      const asked = !!answer;
      localStorage.setItem("hatch-shared-screen", "on");
      el._goShared();
      answer?.({ response: { counted: true, notes: [{ kind: "friends_for", months: 3 }], ask: "catchphrase" } });
      await new Promise((r) => setTimeout(r, 50));
      const out = { asked, queue: (s.queue || []).map((q) => q.text), asking: !!s.asking };
      localStorage.setItem("hatch-shared-screen", "off");
      return out;
    });
    check("FA: a visit reply arriving after the switch queues nothing personal",
      late.asked && late.queue.length === 0 && !late.asking, JSON.stringify(late));
    await tab.close();

    // F6: a slide that goes is torn down like a forgotten one, and the card's
    // observer is disconnected when it leaves the page and re-observed after.
    const f6 = await card.evaluate(async (el) => {
      const two = window.__faTwo(el);
      const io = { observe: 0, disconnect: 0 };
      const proto = IntersectionObserver.prototype;
      const real = { observe: proto.observe, disconnect: proto.disconnect, revoke: URL.revokeObjectURL };
      proto.observe = function (...a) { io.observe++; return real.observe.apply(this, a); };
      proto.disconnect = function (...a) { io.disconnect++; return real.disconnect.apply(this, a); };
      const revoked = [];
      URL.revokeObjectURL = (u) => { revoked.push(u); return real.revoke(u); };
      const out = {};
      try {
        const devices = Object.values(two._hass.entities).filter((e) => e.platform === "virtual_pet")
          .map((e) => e.device_id).filter((d, i, all) => d && all.indexOf(d) === i);
        two.setConfig({ ...two._config, devices: devices.slice(0, 2) });
        two.hass = two._hass;
        for (let i = 0; i < 40 && two._slides.length < 2; i++) await new Promise((r) => setTimeout(r, 250));
        const s = two._slides[1];
        const url = URL.createObjectURL(new Blob(["x"], { type: "image/png" }));
        s.photos = new Map([[1, { url, name: "a.png", photo: { name: "Old", species: "bird", stage: "adult", on: "2026-01-02" } }]]);
        two._photoDialog(s, 1);
        out.dialogOpened = !!two.shadowRoot.querySelector(".photo-dialog")?.open;
        s.game = {};
        // Its real subscription (the private channel), watched as it goes.
        for (let i = 0; i < 40 && !(s.subscribed && s.unsub); i++) await new Promise((r) => setTimeout(r, 100));
        out.realSub = !!s.subscribed && typeof s.unsub === "function";
        let unsubbed = false;
        const realUnsub = s.unsub;
        s.unsub = () => { unsubbed = true; return realUnsub?.(); };
        s.screen.classList.add("breezy");
        s.breezeTimer = setTimeout(() => {}, 60000);
        two.setConfig({ ...two._config, devices: devices.slice(0, 1) });
        two.hass = two._hass;
        for (let i = 0; i < 40 && two._slides.length > 1; i++) await new Promise((r) => setTimeout(r, 250));
        Object.assign(out, {
          slides: two._slides.length, revoked: revoked.includes(url),
          dialogClosed: !two.shadowRoot.querySelector(".photo-dialog")?.open,
          game: s.game, unsubbed, unsubCleared: s.unsub === null, breezy: s.screen.classList.contains("breezy"),
        });
        const before = { ...io };
        two._slides[0].unsub = () => {};
        two.remove();
        out.disconnected = io.disconnect > before.disconnect;
        out.unsubClearedOnLeave = two._slides[0].unsub === null;
        document.body.append(two);
        out.observed = io.observe > before.observe;
        two.remove();
      } finally {
        proto.observe = real.observe;
        proto.disconnect = real.disconnect;
        URL.revokeObjectURL = real.revoke;
      }
      return out;
    });
    check("F6: a dropped slide ends its game, revokes its photos, closes the dialog and unsubscribes",
      f6.slides === 1 && f6.dialogOpened && f6.dialogClosed && f6.revoked && f6.game === null && f6.realSub && f6.unsubbed && f6.unsubCleared && f6.unsubClearedOnLeave && !f6.breezy,
      JSON.stringify(f6));
    check("F6: the card's observer disconnects when it leaves the page and observes again when back",
      f6.disconnected && f6.observed, JSON.stringify(f6));
  }

  // ha-signals H8: a shared screen says the house's words said live (a channel-only house
  // moment, house words kept off the sensor): they're the house's, not anyone's.
  {
    const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
    const h8s = await page.locator("hatch-pet-card").first().evaluate((el, me) => {
      const s = el._slides[el._index];
      const kept = { game: s.game, calling: s.calling };
      let said = [], moves = [], fxs = [];
      // Every line this moment says, at once with its move and effect (no queue, no wait).
      el._line = function (slide, cls, text, ms, opts) { if (slide === s) { said.push(text); opts?.then?.(); } };
      el._animate = function (slide, node, cls) { moves.push(cls); };
      el._houseFx = function (slide, cls) { fxs.push(cls); };
      const run = (m) => {
        said = []; moves = []; fxs = [];
        el._moment(s, { at: new Date().toISOString(), ...m });
        return { said, moves, fxs };
      };
      const had = localStorage.getItem("hatch-shared-screen");
      const out = {};
      try {
        localStorage.setItem("hatch-shared-screen", "on");
        s.game = null;
        s.calling = false;
        said = [];
        el._channel(s, { moment: { type: "house_live", category: "custom", reaction: "cozy", text: "Shared words ♪", at: new Date().toISOString() } }, me);
        out.words = said;
        said = [];
        el._channel(s, { moment: { type: "house_live", category: "delivery", at: new Date(Date.now() + 1).toISOString() } }, me);
        out.delivery = said;
        out.pool = el.constructor.houseMomentLines.delivery;
      } finally {
        if (had === null) localStorage.removeItem("hatch-shared-screen"); else localStorage.setItem("hatch-shared-screen", had);
        delete el._line; delete el._animate; delete el._houseFx;
        Object.assign(s, kept);
      }
      return out;
    }, me);
    check("H8: a shared screen says a house_live's words, and a delivery's line",
      h8s.words.join() === "Shared words ♪" && h8s.pool.includes(h8s.delivery[0]), JSON.stringify(h8s));
  }

  await unpinAwake(card);
  }
  if (enter("forget")) {
  // 5c. "forget my data" (privacy P2): personal screens only, two taps, then the
  // pets start fresh with you, here and on the server. Late in the run: its real
  // visits redraw the sensors over the stubs that earlier checks inject.
  const forgot = await page.locator("hatch-pet-card").evaluate(async (el, me) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const id = s.ids["sensor.life_stage"];
    const log = () => el._state(s, "sensor.last_care")?.attributes.log || [];
    const visit = async () => {
      await el._hass.callService("virtual_pet", "fast_forward", { hours: 1 });
      const res = await el._hass.callService("virtual_pet", "visit", { entity_id: id, queued: 0 }, undefined, false, true);
      return res?.response || {};
    };
    const out = {};
    await el._hass.callWS({ type: "virtual_pet/answer", entity_id: id, question: "birthday", answer: "03-14" });
    await el._hass.callWS({ type: "virtual_pet/baby_talk", entity_id: id, enabled: true });
    const before = await visit();
    out.before = { counted: before.counted, kept: before.birthday_kept, baby: before.baby_talk };
    localStorage.setItem("hatch-shared-screen", "on");
    s.settings = true; // the row lives in the settings sheet
    el._renderStatus(s, log());
    out.shared = !!s.status.querySelector(".bell.forgetme");
    out.sharedSheet = !!s.status.querySelector(".bell.shared"); // the sheet itself is there
    localStorage.setItem("hatch-shared-screen", "off");
    el._birthdayKept = true;
    el._myDay = true;
    if (s.mine) Object.assign(s.mine, { birthday_kept: true, my_day: true }); // as the channel will have it
    localStorage.setItem(`hatch-welcomed-${me}`, "1");
    localStorage.setItem(`hatch-greet-${me}-dev-a`, "1");
    localStorage.setItem(`hatch-greet-${me}-dev-b`, "1");
    localStorage.setItem("hatch-greet-someone-else-dev-a", "1");
    s.statusHtml = null;
    el._renderStatus(s, log());
    const button = () => s.status.querySelector(".bell.forgetme");
    out.label = button()?.closest(".row")?.textContent.trim();
    out.aria = button()?.getAttribute("aria-label");
    out.order = [...s.status.querySelectorAll(".row")].map((r) => r.children[0]?.textContent) // a sheet row: label first (no icon slot, F5)
      .filter((t) => ["baby talk", "my data", "sounds here"].includes(t)).join();
    const sent = [];
    const realWS = el._hass.callWS.bind(el._hass);
    el._hass.callWS = (msg) => { sent.push(msg.type); return realWS(msg); };
    button().click();
    await wait(200);
    out.one = { text: button()?.textContent, aria: button()?.getAttribute("aria-label"), sent: sent.length };
    await wait(500);
    button().click();
    for (let i = 0; i < 40 && el._birthdayKept; i++) await wait(50);
    el._hass.callWS = realWS;
    out.sent = sent;
    out.message = s.status.querySelector(".status-feedback")?.textContent;
    out.bdayRows = !!s.status.querySelector(".bell.forgetbday, .bell.bdayphone");
    out.babyTalk = s.status.querySelector(".bell.babytalk")?.getAttribute("aria-pressed");
    out.myDay = el._myDay;
    out.myDayRow = s.status.querySelector(".bell.myday")?.getAttribute("aria-pressed") ?? "none";
    out.storage = Object.keys(localStorage).filter((k) => k === `hatch-welcomed-${me}` || k.startsWith(`hatch-greet-${me}-`));
    out.othersKept = localStorage.getItem("hatch-greet-someone-else-dev-a") === "1";
    const after = await visit();
    out.after = { counted: after.counted, kept: after.birthday_kept, baby: after.baby_talk, myDay: after.my_day };
    localStorage.removeItem("hatch-greet-someone-else-dev-a");
    s.settings = false;
    s.sayUntil = 0;
    return out;
  }, me);
  // An armed "forget" goes back to "forget" when its window closes with nothing
  // else changed, and after a confirm that failed.
  const lapse = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const log = () => el._state(s, "sensor.last_care")?.attributes.log || [];
    const button = () => s.status.querySelector(".bell.forgetme");
    const look = () => ({ text: button()?.textContent, aria: button()?.getAttribute("aria-label") });
    s.confirm = null;
    s.statusHtml = null;
    s.settings = true; // the row lives in the settings sheet
    el._renderStatus(s, log());
    button().click();
    const armed = look();
    await wait(4300);
    const lapsed = look();
    const realWS = el._hass.callWS;
    const sent = [];
    el._hass.callWS = (msg) => {
      sent.push(msg.type);
      return msg.type === "virtual_pet/forget_me" ? Promise.reject(new Error("no")) : realWS.call(el._hass, msg);
    };
    button().click();
    await wait(700);
    button().click();
    await wait(300);
    el._hass.callWS = realWS;
    const out = { armed, lapsed, failed: look(), sent, message: s.status.querySelector(".status-feedback")?.textContent,
      inSheet: !!s.status.querySelector(".sback") };
    s.settings = false;
    return out;
  });
  const unarmed = "forget my data: your birthday, answers and settings for every pet; your bonds stay";
  check("an armed forget goes back to forget when its window closes, and after a failure",
    lapse.armed.text === "sure? tap again" && lapse.lapsed.text === "forget" && lapse.lapsed.aria === unarmed &&
    lapse.sent.join() === "virtual_pet/forget_me" && lapse.message === "hm, that didn't work. try again soon" &&
    lapse.failed.text === "forget" && lapse.failed.aria === unarmed && lapse.inSheet, JSON.stringify(lapse));
  check("forget my data is a personal row, after baby talk",
    !forgot.shared && forgot.sharedSheet && forgot.label === "my dataforget" && forgot.order === "baby talk,my data,sounds here" &&
    forgot.aria === "forget my data: your birthday, answers and settings for every pet; your bonds stay",
    JSON.stringify(forgot));
  check("one tap on forget my data only asks",
    forgot.one.text === "sure? tap again" && forgot.one.aria === "Sure? Press again to forget my data" &&
    forgot.one.sent === 0, JSON.stringify(forgot.one));
  check("the second tap forgets you, here and on the server",
    // A visit within the hour isn't counted (fast_forward doesn't move the clock),
    // and then says only baby talk: that it's off proves the server forgot.
    (forgot.before.counted === false || forgot.before.kept === true) && forgot.before.baby === true &&
    forgot.sent.join() === "virtual_pet/forget_me" && forgot.message === "forgotten. we'll start fresh ♥" &&
    !forgot.bdayRows && forgot.babyTalk === "false" && !forgot.myDay && forgot.myDayRow !== "true" &&
    forgot.storage.length === 0 && forgot.othersKept &&
    forgot.after.baby === false && (forgot.after.counted === false || (forgot.after.kept === false && forgot.after.myDay === false)),
    JSON.stringify(forgot));
  }
  if (enter("prefs")) {
  // 6. The card editor loads and offers the pets.
  // 5d. Preferences on every visit, quiet samples (Wave 1, PR 1c).
  // "my day" reads "…" until a visit reply sets it, never "off" (with no
  // channel: an older server; the channel's "mine" is checked below).
  const unknown = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const log = () => el._state(s, "sensor.last_care")?.attributes.log || [];
    const saved = el._myDay;
    const mine = s.mine;
    s.mine = null;
    el._bond = () => ({ level: 8, nickname: "sunbeam" });
    el._myDay = undefined;
    s.statusHtml = null;
    s.settings = true; // the row lives in the settings sheet
    el._renderStatus(s, log());
    const row = [...s.status.querySelectorAll(".row")].find((r) => /my day/.test(r.textContent));
    const out = { text: row?.textContent.trim(), button: !!s.status.querySelector(".bell.myday") };
    el._myDay = false; // after "forget my data": a known "off"
    s.statusHtml = null;
    el._renderStatus(s, log());
    out.off = s.status.querySelector(".bell.myday")?.textContent;
    el._myDay = saved;
    s.mine = mine;
    delete el._bond;
    s.settings = false;
    s.statusHtml = null;
    return out;
  });
  check("my day reads … before any visit reply, and off once it is known false",
    /…/.test(unknown.text || "") && !unknown.button && unknown.off === "off", JSON.stringify(unknown));
  // A held visit reply: the row stays "…" until the reply comes.
  const held = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const log = () => el._state(s, "sensor.last_care")?.attributes.log || [];
    const real = el._hass.callService.bind(el._hass);
    let release;
    const gate = new Promise((r) => { release = r; });
    el._hass.callService = async (d, svc, ...rest) => {
      const res = real(d, svc, ...rest);
      if (svc === "visit") await gate;
      return res;
    };
    const mine = s.mine;
    s.mine = null; // no channel: the visit reply is the fallback
    el._bond = () => ({ level: 8, nickname: "sunbeam" });
    el._myDay = undefined;
    s.visitedAt = 0;
    el._visit(s);
    await wait(300);
    s.statusHtml = null;
    s.settings = true; // the row lives in the settings sheet
    el._renderStatus(s, log());
    const during = !!s.status.querySelector(".bell.myday");
    release();
    for (let i = 0; i < 40 && el._myDay === undefined; i++) await wait(50);
    el._hass.callService = real;
    s.statusHtml = null;
    el._renderStatus(s, log());
    const out = { during, after: el._myDay, button: !!s.status.querySelector(".bell.myday") };
    s.mine = mine;
    delete el._bond;
    s.settings = false;
    return out;
  });
  check("the my day row waits for the held visit reply, then shows the real setting",
    !held.during && typeof held.after === "boolean" && held.button, JSON.stringify(held));
  // A second browser inside the hour shows "my day: on" for a person who has it on.
  await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    await el._hass.callService("virtual_pet", "my_day", { entity_id: s.ids["sensor.life_stage"], enabled: true });
  });
  const second = await context.newPage();
  second.on("pageerror", (e) => errors.push(`tab 3: ${e}`));
  await second.goto(`${HA}/pet-bench/pet`);
  await second.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
  await settle(second); // the frontend may reload itself once
  await second.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  // From the private channel's "mine" now, with no visit reply needed.
  const reopened = await second.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = () => el._slides[el._index];
    for (let i = 0; i < 80 && !s().mine; i++) await wait(100);
    return s().mine?.my_day;
  });
  check("a second browser within the hour shows my day on for a person who has it on",
    reopened === true, String(reopened));
  await second.close();
  await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    await el._hass.callService("virtual_pet", "my_day", { entity_id: s.ids["sensor.life_stage"], enabled: false });
    el._myDay = false;
  });
  // Quiet samples: _mayPlay's rules, and the tap still unlocks audio.
  const samples = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const log = () => el._state(s, "sensor.last_care")?.attributes.log || [];
    const realHours = Date.prototype.getHours;
    const saved = { asleep: s.asleep, lightsOut: s.lightsOut };
    const OsC = window.OscillatorNode.prototype.start;
    let started = 0;
    window.OscillatorNode.prototype.start = function (...a) { started++; return OsC.apply(this, a); };
    const tap = async (setup, bell) => {
      Object.assign(s, { asleep: false, lightsOut: false });
      Date.prototype.getHours = realHours;
      setup();
      localStorage.setItem("hatch-sounds", "off");
      localStorage.setItem("hatch-babble", "off");
      s.statusHtml = null;
      s.settings = true; // the switches live in the settings sheet
      el._renderStatus(s, log());
      const before = started;
      s.status.querySelector(bell).click();
      await wait(400);
      return { played: started - before, note: s.status.querySelector(".status-feedback")?.textContent || "" };
    };
    const out = {};
    out.night = await tap(() => { Date.prototype.getHours = () => 22; }, ".bell.sound");
    out.morning = await tap(() => { Date.prototype.getHours = () => 9; }, ".bell.sound");
    out.asleep = await tap(() => { Date.prototype.getHours = () => 12; s.asleep = true; }, ".bell.sound");
    out.lights = await tap(() => { Date.prototype.getHours = () => 12; s.lightsOut = true; s.asleep = true; }, ".bell.sound");
    if (s.species?.voice) {
      out.babbleNight = await tap(() => { Date.prototype.getHours = () => 22; }, ".bell.babble");
    }
    Date.prototype.getHours = realHours;
    window.OscillatorNode.prototype.start = OsC;
    Object.assign(s, saved);
    localStorage.setItem("hatch-sounds", "off");
    localStorage.setItem("hatch-babble", "off");
    s.settings = false;
    s.statusHtml = null;
    return out;
  });
  check("sounds here at 22:00 plays nothing and says quiet till morning",
    samples.night.played === 0 && samples.night.note === "sounds are on: quiet till morning ♪", JSON.stringify(samples.night));
  check("sounds here at 09:00 plays the chirp", samples.morning.played > 0 && samples.morning.note === "", JSON.stringify(samples.morning));
  check("sounds here while the pet sleeps is skipped with its line",
    samples.asleep.played === 0 && samples.asleep.note === "sounds are on: shh, it's sleeping", JSON.stringify(samples.asleep));
  check("sounds here with lights out by day (asleep too) says napping",
    samples.lights.played === 0 && samples.lights.note === "sounds are on: shh, it's napping", JSON.stringify(samples.lights));
  check("the baby-talk sample is quiet at night too",
    !samples.babbleNight || (samples.babbleNight.played === 0 && /quiet till morning/.test(samples.babbleNight.note)),
    JSON.stringify(samples.babbleNight));

  }
  if (enter("channel")) {
  // 7. The private channel (privacy P3a-card): the viewer's bond, switches and
  // own moments, and the house's shows, come only from virtual_pet/subscribe.
  {
    const card = page.locator("hatch-pet-card").first();
    // Back to the pet the bond checks used (the viewer has a bond with it).
    for (let i = 0; i < slides; i++) {
      if (await card.evaluate((el, e) => el._slides[el._index].ids?.["sensor.life_stage"] === e, pet["sensor.life_stage"])) break;
      await page.locator("hatch-pet-card .nav.next").click();
      await page.waitForTimeout(700);
    }
    await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      for (let i = 0; i < 50 && !s.subscribed; i++) await new Promise((r) => setTimeout(r, 100));
      // Every line this slide says or queues, from here on.
      window.__spoken = [];
      for (const name of ["_speak", "_queue"]) {
        const real = el[name];
        el[name] = function (slide, text, ...rest) {
          if (slide === s && typeof text === "string") window.__spoken.push(text);
          return real.call(this, slide, text, ...rest);
        };
      }
    });
    // One media line: a public titled moment (an old server's; P3c publishes
    // only a title-less tv_on) is skipped, the channel's says it once, its house push and a replayed
    // snapshot say nothing more. A private moment is said once too.
    const publicNow = await evaluate((e) =>
      document.querySelector("home-assistant").hass.states[e].attributes.moments || [], pet["sensor.last_care"]);
    const mediaAt = new Date().toISOString();
    const media = { type: "watching", title: "Bluey Check", at: mediaAt };
    await inject(pet["sensor.last_care"], { attributes: { moments: [media, ...publicNow] } });
    await page.waitForTimeout(1000);
    const once = await card.evaluate(async (el, { media, me }) => {
      const s = el._slides[el._index];
      const fromPublic = window.__spoken.filter((t) => t.includes("Bluey Check")).length;
      const kept = { mine: s.mine, house: s.house, game: s.game, calling: s.calling };
      // A media line is flavour: _mayInterrupt/_line drop it while the pet is in a
      // game, has a question up, or is calling for care (the record below is kept
      // and gets through regardless, which is the flake: media 0, record 1). Those
      // states come and go with the dev pet's own timers, so pin them off for the
      // measurement and put them back after.
      const busy = { game: !!s.game, calling: !!s.calling, question: el._questionOn(s) };
      s.game = null;
      s.calling = false;
      const askday = s.screen?.querySelector(".askday");
      const askHome = askday && { parent: askday.parentNode, next: askday.nextSibling };
      askday?.remove();
      const house = { media, dream: null };
      const record = { type: "bond_record", game: "left_right", wins: 4, at: new Date().toISOString() };
      Object.assign(s, { sayUntil: 0, queue: [] });
      el._channel(s, { moment: media }, me);
      el._stopTyping(s);
      el._channel(s, { house }, me);
      el._channel(s, { moment: record }, me);
      el._channel(s, { moment: record }, me); // the same one again
      el._channel(s, { mine: kept.mine, house, moments: [record, media], now: new Date().toISOString() }, me);
      el._channel(s, { moment: media }, me); // and the show again
      const out = {
        fromPublic, media: window.__spoken.filter((t) => t.includes("Bluey Check")).length,
        record: window.__spoken.filter((t) => /new best/.test(t)).length,
        house: s.house?.media?.title,
        ...(busy.game || busy.calling || busy.question ? { busy } : {}),
      };
      s.queue = [];
      s.house = kept.house;
      s.game = kept.game;
      s.calling = kept.calling;
      if (askHome) askHome.parent.insertBefore(askday, askHome.next);
      return out;
    }, { media, me });
    check("P3a: one media line: the public moment is skipped, the channel's is said once",
      once.fromPublic === 0 && once.media === 1 && once.house === "Bluey Check", JSON.stringify(once));
    check("P3a: a private moment is said once, not again from a replayed snapshot", once.record === 1, JSON.stringify(once));
    await inject(pet["sensor.last_care"], { attributes: { moments: publicNow } });
    // A shared screen drops "mine" even if a server sent one; "gone" stops the slide's channel.
    const ends = await card.evaluate(async (el, me) => {
      const s = el._slides[el._index];
      const kept = s.mine;
      localStorage.setItem("hatch-shared-screen", "on");
      el._channel(s, { mine: { bond: { level: 8, nickname: "sunbeam" }, notify_me: true }, house: null, moments: [], now: new Date().toISOString() }, me);
      const shared = { mine: s.mine, bond: el._bond(s) };
      localStorage.setItem("hatch-shared-screen", "off");
      s.mine = kept;
      el._channel(s, { gone: true }, me);
      const gone = { unsub: s.unsub, gone: s.gone, retry: !!s.retryTimer };
      el._subscribe(s); // a no-op now: its pet is gone
      gone.asked = !!(s.unsub || s.subPending);
      const all = el._slides;
      el._slides = [s]; // a new socket, for this slide alone
      try { el._onReady(); } finally { el._slides = all; }
      gone.askedOnReady = !!(s.unsub || s.subPending || s.retryTimer) || !s.gone;
      el._subscribe(s, true); // (and back, for the checks after)
      for (let i = 0; i < 50 && !(s.unsub && s.subscribed); i++) await new Promise((r) => setTimeout(r, 100));
      return { shared, gone, back: !!s.unsub };
    }, me);
    check("P3a: a shared screen never keeps a person's own view", ends.shared.mine === null && ends.shared.bond === null,
      JSON.stringify(ends.shared));
    check("P3a: a removed pet's channel stops, with no retry", ends.gone.unsub === null && ends.gone.gone &&
      !ends.gone.retry && !ends.gone.asked && ends.back, JSON.stringify(ends));
    check("P3a: a removed pet's slide isn't asked again on a new socket", ends.gone.askedOnReady === false, JSON.stringify(ends));
    // The bell and the switches read "mine".
    const bell = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const kept = s.mine;
      const read = () => {
        s.statusHtml = null;
        s.settings = true; // the switches live in the settings sheet
        el._renderStatus(s, []);
        return ["notify", "myday", "babytalk"].map((k) => s.status.querySelector(`.bell.${k}`)?.getAttribute("aria-pressed")).join();
      };
      el._mineFor(s, { ...kept, bond: { level: 3 }, notify_me: true, my_day: true, baby_talk: false });
      const on = read();
      el._mineFor(s, { ...kept, bond: { level: 3 }, notify_me: false, my_day: false });
      const off = read();
      el._mineFor(s, kept);
      s.settings = false;
      return { on, off };
    });
    check("P3a: the bell and my day read the person's own view", bell.on.startsWith("true,true") && bell.off.startsWith("false,false"),
      JSON.stringify(bell));
    // An older server: the bell and "my day" fall back to the services on
    // unknown_command, and only then.
    const fallback = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const hass = el._hass;
      const real = { ws: hass.callWS, svc: hass.callService, myDay: el._myDay };
      const mines = el._slides.map((x) => x.mine && { ...x.mine });
      const ws = [];
      const svc = [];
      hass.callWS = async (msg) => { ws.push(msg.type); throw { code: "unknown_command", message: "Unknown command." }; };
      hass.callService = async (domain, service, data) => { svc.push(`${domain}.${service}:${data.enabled}`); return {}; };
      try {
        s.statusHtml = null;
        el._renderStatus(s, []);
        await el._setNotify(s, true);
        await el._setMyDay(s, true, document.createElement("button"));
        hass.callWS = async (msg) => { ws.push(msg.type); throw { code: "home_assistant_error" }; };
        await el._setNotify(s, false);
      } finally {
        hass.callWS = real.ws;
        hass.callService = real.svc;
        el._myDay = real.myDay;
        el._slides.forEach((x, i) => { x.mine = mines[i]; });
      }
      return { ws, svc, message: s.status.querySelector(".status-feedback")?.textContent };
    });
    check("P3a: the bell and my day fall back to the services on unknown_command, and only then",
      fallback.ws.join() === "virtual_pet/notify_me,virtual_pet/my_day,virtual_pet/notify_me" &&
      fallback.svc.join() === "virtual_pet.notify_me:true,virtual_pet.my_day:true" &&
      fallback.message === "hm, that didn't work. try again soon", JSON.stringify(fallback));
    // Retries: a subscribe refused (HA still starting, the pet mid-reload) is
    // asked again after 2 s and 5 s (then 15 s, then every minute); the first
    // look goes ahead meanwhile. And a new socket ("ready") asks again at once.
    const retry = await card.evaluate(async (el) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const s = el._slides[el._index];
      const id = s.ids["sensor.life_stage"];
      const conn = el._hass.connection;
      const had = Object.prototype.hasOwnProperty.call(conn, "subscribeMessage");
      const real = conn.subscribeMessage;
      const tries = [];
      conn.subscribeMessage = (cb, msg, opts) => {
        if (msg?.entity_id !== id) return real.call(conn, cb, msg, opts);
        tries.push({ at: Date.now(), opts });
        if (tries.length === 1) return Promise.reject({ code: "unknown_command" });
        if (tries.length === 2) return Promise.reject({ code: "no_pet" });
        return real.call(conn, cb, msg, opts);
      };
      const out = {};
      try {
        el._unsubscribe(s);
        el._resetChannel(s);
        el._subscribe(s, true);
        await wait(300);
        out.failedSoon = s.subscribeFailed && el._channelHeard(s);
        for (let i = 0; i < 120 && !(s.subscribed && tries.length >= 3); i++) await wait(100);
        out.gaps = tries.slice(1).map((t, i) => Math.round((t.at - tries[i].at) / 1000));
        out.subscribed = s.subscribed;
        out.noLibrary = tries.every((t) => t.opts?.resubscribe === false);
        const before = tries.length;
        el._onReady();
        await wait(300);
        out.onReady = tries.length - before;
        for (let i = 0; i < 50 && !s.unsub; i++) await wait(100);
      } finally {
        if (had) conn.subscribeMessage = real;
        else delete conn.subscribeMessage;
      }
      return out;
    });
    check("P3a: a refused subscribe is tried again on the ladder, and a new socket asks again",
      retry.failedSoon && retry.gaps.join() === "2,5" && retry.subscribed && retry.noLibrary && retry.onReady === 1,
      JSON.stringify(retry));
    // A slide switched from a bonded pet to another shows nothing of the first
    // pet's bond before the new pet's own view arrives.
    const switched = await card.evaluate(async (el) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const devices = Object.values(el._hass.entities).filter((e) => e.platform === "virtual_pet")
        .map((e) => e.device_id).filter((d, i, all) => d && all.indexOf(d) === i);
      const three = document.createElement("hatch-pet-card");
      three.style.cssText = "position:fixed;left:0;top:0;width:400px;z-index:-1";
      three.setConfig({ ...el._config, seasonal: false, devices: [devices[0]] });
      document.body.append(three);
      three.hass = el._hass;
      const s = () => three._slides?.[0];
      for (let i = 0; i < 50 && !(s()?.species && s().subscribed); i++) await wait(100);
      const out = { first: s()?.subscribed };
      three._mineFor(s(), { ...(s().mine || {}), bond: { level: 8, nickname: "sunbeam" }, wish_for_you: true });
      const conn = three._hass.connection;
      const had = Object.prototype.hasOwnProperty.call(conn, "subscribeMessage");
      const real = conn.subscribeMessage;
      let release;
      const held = new Promise((r) => { release = r; });
      conn.subscribeMessage = async (cb, msg, opts) => { await held; return real.call(conn, cb, msg, opts); };
      try {
        three.setConfig({ ...three._config, devices: [devices[1]] });
        three.hass = three._hass;
        await wait(400);
        const sl = s();
        sl.lookedFirst = false;
        three._firstLook(sl);
        sl.statusHtml = null;
        three._renderStatus(sl, []);
        out.before = { mine: sl.mine, bond: three._bond(sl), subscribed: sl.subscribed, looked: sl.lookedFirst,
          status: /you two|sunbeam/.test(sl.status.textContent), bubble: /sunbeam/.test(sl.bubble.textContent) };
      } finally {
        if (had) conn.subscribeMessage = real;
        else delete conn.subscribeMessage;
        release();
      }
      for (let i = 0; i < 50 && !s().subscribed; i++) await wait(100);
      out.after = { subscribed: s().subscribed, to: s().subKey?.split("|")[0] === s().ids["sensor.life_stage"],
        nickname: s().mine?.bond?.nickname || null };
      three.remove();
      return out;
    });
    check("P3a: switching a slide's pet drops the last pet's bond before the new view arrives",
      switched.first && switched.before.mine === null && switched.before.bond === null && !switched.before.subscribed &&
      !switched.before.looked && !switched.before.status && !switched.before.bubble &&
      switched.after.subscribed && switched.after.to && switched.after.nickname !== "sunbeam", JSON.stringify(switched));
    // An options save reloads the pet: the open card gets a fresh view on the
    // same subscription, its bond row back within 5 s, with no page reload.
    const entryId = await evaluate(async (e) => (await document.querySelector("home-assistant").hass
      .callWS({ type: "config/entity_registry/get", entity_id: e })).config_entry_id, pet["sensor.life_stage"]);
    await card.evaluate((el) => {
      window.__hatchMark = "same page";
      window.__snapshots = 0;
      const real = el._channel;
      el._channel = function (s, msg, ...rest) {
        if (Array.isArray(msg?.moments) && s === this._slides[this._index]) window.__snapshots++;
        return real.call(this, s, msg, ...rest);
      };
    });
    await evaluate((entry_id) => document.querySelector("home-assistant").hass
      .callService("homeassistant", "reload_config_entry", { entry_id }), entryId);
    const reloaded = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const start = Date.now();
      let you = false;
      while (Date.now() - start < 5000) {
        s.statusHtml = null;
        el._renderStatus(s, []);
        you = /you two/.test(s.status.textContent);
        if (window.__snapshots && you) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      return { snapshots: window.__snapshots, you, ms: Date.now() - start, mark: window.__hatchMark };
    });
    check("P3a: an options save keeps the bond (a fresh view within 5 s, no page reload)",
      reloaded.snapshots >= 1 && reloaded.you && reloaded.mark === "same page", JSON.stringify(reloaded));
    await card.evaluate((el) => { for (const name of ["_speak", "_queue", "_channel"]) delete el[name]; });
    if (await cur().locator(".screen.show-status").count()) await page.locator("hatch-pet-card .statusbtn").click();
  }
  // ha-signals H8 (review s2643 F4): house words said live (house_live, news_live) come
  // from the channel only, once: a repeat, a replayed snapshot or an old server's public
  // copy says nothing more.
  {
    const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
    const h8c = await card.first().evaluate((el, me) => {
      const s = el._slides[el._index];
      const kept = { game: s.game, calling: s.calling };
      let said = [], moves = [], fxs = [];
      // Every line this moment says, at once with its move and effect (no queue, no wait).
      el._line = function (slide, cls, text, ms, opts) { if (slide === s) { said.push(text); opts?.then?.(); } };
      el._animate = function (slide, node, cls) { moves.push(cls); };
      el._houseFx = function (slide, cls) { fxs.push(cls); };
      const run = (m) => {
        said = []; moves = []; fxs = [];
        el._moment(s, { at: new Date().toISOString(), ...m });
        return { said, moves, fxs };
      };
      const at = new Date().toISOString();
      const live = { type: "house_live", category: "custom", reaction: "cheer", text: "Check words ♪", at };
      const news = { type: "news_live", headline: "Check headline", at: new Date(Date.now() + 1).toISOString() };
      const heard = [];
      try {
        s.game = null;
        s.calling = false;
        // Each call's lines alone (said is reset before each).
        const hear = (msg) => { said = []; el._channel(s, msg, me); heard.push(...said); };
        hear({ moment: live });
        hear({ moment: live }); // the same again
        hear({ moment: news });
        // A replayed snapshot with them says nothing (its moments are the past).
        hear({ mine: s.mine, house: s.house, moments: [live, news], now: new Date().toISOString() });
      } finally {
        delete el._line; delete el._animate; delete el._houseFx;
        Object.assign(s, kept);
      }
      return heard;
    }, me);
    const words = h8c.filter((t) => t.includes("Check words")).length;
    const head = h8c.filter((t) => t.includes("Check headline")).length;
    check("H8: a house_live's words and a news_live's headline are each said once, from the channel only",
      words === 1 && head === 1, JSON.stringify(h8c));
    // The sensor's route never says them (CHANNEL_ONLY), even if an old server put them there.
    const publicNow = await evaluate((e) =>
      document.querySelector("home-assistant").hass.states[e].attributes.moments || [], pet["sensor.last_care"]);
    await card.first().evaluate((el) => { window.__h8 = []; el._line = function (slide, cls, text) { window.__h8.push(text); }; });
    await inject(pet["sensor.last_care"], { attributes: { moments: [
      { type: "house_live", category: "custom", reaction: "hop", text: "Old server words", at: new Date().toISOString() }, ...publicNow] } });
    await page.waitForTimeout(800);
    const old = await card.first().evaluate((el) => { delete el._line; return window.__h8; });
    check("H8: a house_live on the sensor (an old server's) is never said", !old.some((t) => /Old server words/.test(t)), JSON.stringify(old));
    await inject(pet["sensor.last_care"], { attributes: { moments: publicNow } });
  }
  // ha-signals H5 (review s2651 #10): a doorbell press (doorbell_live) is said once, from
  // the channel only; a replayed snapshot and an old server's sensor copy say nothing.
  {
    const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
    const h5 = await card.first().evaluate((el, me) => {
      const s = el._slides[el._index];
      const kept = { game: s.game, calling: s.calling };
      let said = [], moves = [], fxs = [];
      el._line = function (slide, cls, text, ms, opts) { if (slide === s) { said.push(text); opts?.then?.(); } };
      el._animate = function (slide, node, cls) { moves.push(cls); };
      el._houseFx = function (slide, cls) { fxs.push(cls); };
      const ring = { type: "doorbell_live", at: new Date().toISOString() };
      const out = {};
      try {
        s.game = null;
        s.calling = false;
        said = []; moves = []; fxs = [];
        el._channel(s, { moment: ring }, me);
        out.once = { said: [...said], moves: [...moves], fxs: [...fxs] };
        said = [];
        el._channel(s, { moment: ring }, me); // the same press again
        out.again = [...said];
        // A line that is dropped or waits (FLAVOUR): the startle and chime still come at once.
        el._line = function (slide, cls, text) { if (slide === s) said.push(text); };
        said = []; moves = []; fxs = [];
        el._channel(s, { moment: { ...ring, at: new Date(Date.now() + 1).toISOString() } }, me);
        out.unsaid = { moves: [...moves], fxs: [...fxs] };
        el._line = function (slide, cls, text, ms, opts) { if (slide === s) { said.push(text); opts?.then?.(); } };
        said = [];
        el._channel(s, { mine: s.mine, house: s.house, moments: [ring], now: new Date().toISOString() }, me);
        out.replay = [...said];
      } finally {
        delete el._line; delete el._animate; delete el._houseFx;
        Object.assign(s, kept);
      }
      return out;
    }, me);
    const pool = ["ding dong! eep!", "ooh, the doorbell! ♪", "ding dong! *perks up*"];
    check("H5: a doorbell_live is said once (one of the three lines, a startle and fx-chime), from the channel only",
      h5.once.said.length === 1 && pool.includes(h5.once.said[0]) && h5.once.fxs.join() === "fx-chime"
        && h5.once.moves.includes("startle") && h5.again.length === 0, JSON.stringify(h5));
    check("H5: the startle and fx-chime come at once, even when the line is dropped or waits",
      h5.unsaid.fxs.join() === "fx-chime" && h5.unsaid.moves.includes("startle"), JSON.stringify(h5.unsaid));
    check("H5: a replayed snapshot holding a doorbell_live says nothing", h5.replay.length === 0, JSON.stringify(h5.replay));
    const publicNow = await evaluate((e) =>
      document.querySelector("home-assistant").hass.states[e].attributes.moments || [], pet["sensor.last_care"]);
    await card.first().evaluate((el) => { window.__h5 = []; el._line = function (slide, cls, text) { window.__h5.push(text); }; });
    await inject(pet["sensor.last_care"], { attributes: { moments: [
      { type: "doorbell_live", at: new Date().toISOString() }, ...publicNow] } });
    await page.waitForTimeout(800);
    const old = await card.first().evaluate((el) => { delete el._line; return window.__h5; });
    check("H5: a doorbell_live on the sensor (an old server's) is never said", !old.some((t) => pool.includes(t)), JSON.stringify(old));
    await inject(pet["sensor.last_care"], { attributes: { moments: publicNow } });
  }

  }
  // Device charm, Part 1: the LCD quirks (docs/plan-2026-10-29-device-charm.md).
  const worlds = Object.keys(JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8")));
  // Show the pet on show in another world's shell (its life_stage says so), or back.
  const inWorld = (key) => card.evaluate(async (el, key) => {
    if (!el.__worldless) el.__worldless = el._state;
    const real = el.__worldless;
    el._state = key ? function (slide, k) {
      const st = real.call(this, slide, k);
      return k === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, world: key } } : st;
    } : real;
    if (!key) delete el.__worldless;
    el._redraw();
    await new Promise((r) => setTimeout(r, 700));
    const s = el._slides[el._index];
    return { device: s.device.className, slideW: el._slideW, compact: el._card.classList.contains("compact") };
  }, key);
  const setLcd = (on) => card.evaluate((el, on) => {
    localStorage.setItem("hatch-lcd", on ? "on" : "off");
    el._card.classList.toggle("lcd-on", on);
  }, on);
  // A crop of the page, with every animation on the screen held still.
  const holdStill = (hold) => card.evaluate((el, hold) => {
    el._slides[el._index].screen.getAnimations({ subtree: true }).forEach((a) => (hold ? a.pause() : a.play()));
  }, hold);
  const crop = async (sel, inset) => {
    const box = await cur().locator(sel).first().boundingBox();
    return page.screenshot({ clip: { x: box.x + inset * box.width, y: box.y + inset * box.height,
      width: box.width * (1 - 2 * inset), height: box.height * (1 - 2 * inset) } });
  };
  // The same crop with the grid off, then on: identical when the grid is under it.
  // The words are hidden for it: anything animating under the grid puts the layers
  // above it on the compositor, where Chrome draws text with greyscale smoothing
  // instead of subpixel (same contrast, different pixels).
  const under = async (sel, inset) => {
    await holdStill(true);
    await card.evaluate((el) => {
      const st = document.createElement("style");
      st.className = "check-notext";
      st.textContent = ".screen, .screen * { color: transparent !important; text-shadow: none !important; }";
      el.shadowRoot.append(st);
    });
    await setLcd(false);
    const off = await crop(sel, inset);
    await setLcd(true);
    const on = await crop(sel, inset);
    await card.evaluate((el) => el.shadowRoot.querySelector(".check-notext").remove());
    await holdStill(false);
    // At most 3 levels apart (compositing rounds a little); a grid line would be ~20.
    return off.equals(on) || await evaluate(async ([a, b]) => {
      const pixels = async (src) => {
        const img = new Image();
        img.src = `data:image/png;base64,${src}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const [pa, pb] = [await pixels(a), await pixels(b)];
      return pa.length === pb.length && pa.every((v, i) => Math.abs(v - pb[i]) <= 3);
    }, [off.toString("base64"), on.toString("base64")]);
  };

  if (enter("lcd")) {
  // The "screen effects here" row: on by default, per browser.
  await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
  await page.waitForTimeout(400);
  await cur().locator(".status .gear").click(); // the row lives in the settings sheet
  await page.waitForTimeout(300);
  const fxRow = async () => ({ pressed: await cur().locator(".bell.lcdfx").getAttribute("aria-pressed"),
    stored: await evaluate(() => localStorage.getItem("hatch-lcd")),
    on: await card.evaluate((el) => el._card.classList.contains("lcd-on")) });
  const fxSeeded = await fxRow();
  await card.evaluate((el) => {
    localStorage.removeItem("hatch-lcd");
    const s = el._slides[el._index];
    s.statusHtml = null;
    el._renderStatus(s, el._state(s, "sensor.last_care")?.attributes.log || []);
  });
  await page.waitForTimeout(300);
  const fxDefault = await fxRow();
  await cur().locator(".bell.lcdfx").click();
  await page.waitForTimeout(300);
  const fxOff = await fxRow();
  await cur().locator(".bell.lcdfx").click();
  await page.waitForTimeout(300);
  const fxOn = await fxRow();
  check("screen effects here: on by default, off and on again for this browser",
    fxSeeded.pressed === "false" && !fxSeeded.on && fxDefault.pressed === "true" &&
    fxOff.pressed === "false" && fxOff.stored === "off" && !fxOff.on &&
    fxOn.pressed === "true" && fxOn.stored === "on" && fxOn.on,
    JSON.stringify({ fxSeeded, fxDefault, fxOff, fxOn }));
  await cur().locator(".status .row", { hasText: "screen effects here" }).scrollIntoViewIfNeeded();
  await shot("d1-lcd-row");
  check("the grid is off on the status screen",
    await cur().locator(".lcd").evaluate((n) => getComputedStyle(n).display) === "none" &&
    await under(".status", 0.25));
  await card.evaluate((el) => el._toggleStatus(el._slides[el._index]));
  await page.waitForTimeout(400);
  }
  if (enter("mono")) {
  await monoChecks({ page, context, check, cur, evaluate, shot, errors });
  await bigTextChecks({ page, check, cur, shot });

  }
  if (enter("ghost")) {
  // The prelude turns the grid off; the lcd section turns it back on. Alone (gate --auto)
  // the first shell would be checked with it off, so turn it on here.
  await setLcd(true);
  for (const width of [420, 330]) {
    await page.setViewportSize({ width, height: 860 });
    await page.waitForTimeout(600);
    const bad = [];
    let layout = null;
    for (const key of worlds) {
      layout = await inWorld(key);
      const grid = await card.evaluate((el) => {
        const s = el._slides[el._index];
        const lcd = s.screen.querySelector(".lcd");
        const css = getComputedStyle(lcd);
        const a = lcd.getBoundingClientRect();
        const b = s.screen.getBoundingClientRect();
        return { display: css.display, image: /repeating-linear-gradient/.test(css.backgroundImage),
          pitch: parseFloat(s.screen.style.getPropertyValue("--lcd-pitch")) * (window.devicePixelRatio || 1),
          fills: Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1,
          clipped: getComputedStyle(s.screen).overflow === "hidden" };
      });
      await card.evaluate((el) => el._write(el._slides[el._index], "screen effects!", 60000));
      await page.waitForTimeout(1200);
      const bubbleOk = await under(".bubble", 0.12);
      await shot(`d1-lcd-${width}-${key}`);
      if (grid.display !== "block" || !grid.image || !(grid.pitch >= 3) || !grid.fills || !grid.clipped || !bubbleOk) {
        bad.push({ key, ...grid, bubbleOk });
      }
    }
    check(`the LCD grid covers the scene on all six shells at ${width} px, under the bubble`,
      bad.length === 0, JSON.stringify({ layout, bad }));
    // Under the game too.
    const picked = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const real = el._state;
      el._state = function (slide, k) { // rested enough to play
        const st = real.call(this, slide, k);
        return k === "sensor.energy" && st ? { ...st, state: "80" } : st;
      };
      s.asleep = false;
      el._startGame(s, s.buttons.play);
      el._state = real;
      await new Promise((r) => setTimeout(r, 500));
      return { picking: !!s.game?.picking, game: s.game, said: s.bubble.textContent };
    });
    check(`the LCD grid is under the game picker at ${width} px`,
      picked.picking && await under(".gpick button", 0.2), JSON.stringify(picked));
    await shot(`d1-lcd-${width}-game`);
    await card.evaluate((el) => el._endGame(el._slides[el._index], null));
    await page.waitForTimeout(300);
    // The settings sheet at this width: the gear is a real tap target, the sheet
    // opens over the status and scrolls to its last row.
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
    const gearBox = await cur().locator(".status .gear").boundingBox();
    await cur().locator(".status .gear").click();
    await page.waitForTimeout(300);
    await cur().locator(".bell.shared").scrollIntoViewIfNeeded();
    const sheetAt = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const box = s.status.getBoundingClientRect();
      const last = s.status.querySelector(".bell.shared").getBoundingClientRect();
      return { open: s.screen.classList.contains("show-status"), sheet: !!s.status.querySelector(".sback"),
        lastInside: last.top >= box.top && last.bottom <= box.bottom + 1, compact: el._card.classList.contains("compact") };
    });
    await shot(`02d-settings-${width}`);
    check(`the gear opens the settings sheet at ${width} px, and the sheet reaches its last row`,
      gearBox && gearBox.width >= 30 && gearBox.height >= 28 && sheetAt.open && sheetAt.sheet && sheetAt.lastInside,
      JSON.stringify({ gearBox, ...sheetAt }));
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(300);
  }
  // Night, for the screenshots.
  await card.evaluate((el) => el._slides[el._index].screen.classList.add("night"));
  await shot("d1-lcd-night");
  await inWorld(null);
  await page.setViewportSize({ width: 420, height: 860 });
  await setLcd(false);
  await page.waitForTimeout(600);

  // Ghosting (1b): a frame swap and a wander leave a fading trace, on the pet on show only.
  await setLcd(true);
  const ghostRun = (opts) => card.evaluate(async (el) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const op = () => Number(getComputedStyle(s.ghost).opacity);
    const out = { pets: s.screen.querySelectorAll(".pet").length, ghostIsPet: s.ghost.classList.contains("pet") };
    const savedGame = s.game;
    // No tick of the card's own while sampling (its idle life moves the pet too).
    const realTick = el._tick;
    el._tick = () => {};
    await wait(1500); // an idle move already under way finishes
    s.pet.classList.remove("wander-l", "wander-r", "look");
    // The card's own wanders and reactions add and drop their class on setTimeouts, outside
    // _tick, so one can land mid-sample: the drop makes a 30% trail (_ghostTrail) that sits
    // over the frame fade (frameJust/frameLater read 0.3, not 0.35 falling). Refuse a
    // move class from the pet until the trail step adds its own.
    const realAdd = s.pet.classList.add.bind(s.pet.classList);
    s.pet.classList.add = (...c) => realAdd(...c.filter((x) => !/^(wander|go)-/.test(x)));
    await wait(1200);
    s.pet.classList.remove("wander-l", "wander-r", "go-left", "go-right");
    await wait(0); // the observer settles the ghost's classes
    // A clean frame swap: the pet awake, still, with two different frames.
    s.pet.classList.remove("hop", "greethop", "look", "dance", "shiver");
    s.screen.classList.remove("breezy", "windy");
    s.pet.getAnimations().forEach((a) => a.cancel());
    s.ghost.getAnimations().forEach((a) => a.cancel());
    s.ghostUntil = 0;
    const realFrames = el._frames;
    el._frames = () => [s.frames[0], s.frames.find((f) => f !== s.frames[0]) || s.frames[0]];
    s.frame = 0;
    el._show(s, s.pet, el._frames(s)[0]);
    el._ticks = 1; // the next tick swaps even while asleep
    const before = s.pet.getAttribute("src");
    realTick.call(el);
    el._frames = realFrames;
    out.swapped = before !== s.pet.getAttribute("src");
    out.frameSrc = s.ghost.getAttribute("src") === before;
    await wait(20);
    out.frameJust = op();
    await wait(300);
    out.frameLater = op();
    // A wander: the ghost trails the pet at 30% and catches up.
    delete s.pet.classList.add; // the real one again
    s.pet.classList.add("wander-l");
    await wait(150);
    out.trail = op();
    out.lag = [s.pet, s.ghost].map((n) => new DOMMatrix(getComputedStyle(n).transform).m41 ||
      parseFloat(getComputedStyle(n).translate) || 0);
    await wait(1400);
    out.trailLater = op();
    s.pet.classList.remove("wander-l");
    await wait(1200);
    out.back = op();
    s.game = savedGame;
    delete el._tick; // the card's own again
    return out;
  }, opts);
  for (const width of [420, 330]) {
    await page.setViewportSize({ width, height: 860 });
    await page.waitForTimeout(600);
    const g = await ghostRun({});
    check(`ghosting at ${width} px: the old frame fades from the pet, gone by 300 ms`,
      g.swapped && g.frameJust > 0 && g.frameSrc && g.frameLater === 0, JSON.stringify(g));
    check(`ghosting at ${width} px: a wander leaves a 30% trail that catches up`,
      Math.abs(g.trail - 0.3) < 0.01 && g.trailLater === 0 && g.back === 0, JSON.stringify(g));
    check(`ghosting at ${width} px: the ghost is not a second pet`, g.pets === 1 && !g.ghostIsPet, JSON.stringify(g));
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const calmGhost = await ghostRun({});
  check("ghosting never shows with reduced motion",
    calmGhost.frameJust === 0 && calmGhost.trail === 0, JSON.stringify(calmGhost));
  await page.emulateMedia({ reducedMotion: null });
  await setLcd(false);
  const offGhost = await ghostRun({});
  check("ghosting is off with screen effects off",
    offGhost.frameJust === 0 && offGhost.trail === 0, JSON.stringify(offGhost));
  // Screenshots, held mid-fade.
  await setLcd(true);
  const ghostShot = async (name, move) => {
    await card.evaluate(async (el, move) => {
      const s = el._slides[el._index];
      s.pet.getAnimations().forEach((a) => a.cancel());
      s.ghostUntil = 0;
      if (move) {
        s.pet.classList.add("wander-r");
      } else { // a frame swap, as in ghostRun
        const realFrames = el._frames;
        el._frames = () => [s.frames[0], s.frames.find((f) => f !== s.frames[0]) || s.frames[0]];
        s.frame = 0;
        el._show(s, s.pet, el._frames(s)[0]);
        el._ticks = 1;
        el._tick();
        el._frames = realFrames;
      }
      await new Promise((r) => setTimeout(r, move ? 450 : 40));
      s.screen.getAnimations({ subtree: true }).forEach((a) => a.pause());
    }, move);
    await shot(name);
    await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.screen.getAnimations({ subtree: true }).forEach((a) => a.play());
      s.pet.classList.remove("wander-r");
    });
    await page.waitForTimeout(1500);
  };
  await ghostShot("d2-ghost-trail", true);
  await ghostShot("d2-ghost-frame", false);
  await setLcd(false);
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(600);

  }
  if (enter("backlight")) {
  // The backlight (1c): a button on each shell. Its 44 px target gets the taps,
  // and without it they'd land on the shell: not the screen, a toy, the label or
  // the request, and not past the slide's sides (the gap to the next device).
  // The one exception is the compact egg, whose label plate leaves no room: its
  // target overlaps the plate's end (decoration, not a control).
  const reach = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    const root = el.shadowRoot;
    const b = s.backlight;
    const box = b.getBoundingClientRect();
    const slide = s.el.getBoundingClientRect();
    const out = { size: [Math.round(box.width), Math.round(box.height)], self: 0, missed: 0, under: {},
      inside: box.left >= slide.left - 0.5 && box.right <= slide.right + 0.5,
      label: b.getAttribute("aria-label"), title: b.title };
    const points = [];
    for (let i = 4; i <= 40; i += 4) for (let j = 4; j <= 40; j += 4) points.push([box.left + i, box.top + j]);
    for (const [x, y] of points) root.elementFromPoint(x, y) === b ? out.self++ : out.missed++;
    b.style.pointerEvents = "none";
    for (const [x, y] of points) {
      const h = root.elementFromPoint(x, y);
      const k = h?.closest(".screen") ? "screen" : h?.closest(".toy") ? "toy" : h?.closest(".label") ? "label" :
        h?.closest(".request") ? "request" : h?.closest(".slide") === s.el || h?.closest(".viewport") ? "shell" : "other";
      out.under[k] = (out.under[k] || 0) + 1;
    }
    b.style.pointerEvents = "";
    return out;
  });
  // Service calls and the pet's own websocket messages, on the connection itself
  // (the hass object is replaced at every state change).
  const calls = () => card.evaluate((el) => {
    el.__calls = [];
    const conn = el._hass.connection;
    if (!conn.__realSend) {
      conn.__realSend = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        if (msg?.type === "call_service" || /^virtual_pet\//.test(msg?.type || "")) el.__calls?.push(msg.type);
        return conn.__realSend.call(this, msg, ...a);
      };
    }
  });
  const glow = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    return { lit: s.screen.classList.contains("lit"),
      opacity: Number(getComputedStyle(s.screen.querySelector(".glow")).opacity), calls: el.__calls,
      lights: el._state(s, "switch.lights_out")?.state, asleep: s.asleep };
  });
  for (const width of [420, 330]) {
    await page.setViewportSize({ width, height: 860 });
    await page.waitForTimeout(600);
    const bad = [];
    let layout = null;
    for (const key of worlds) {
      layout = await inWorld(key);
      const r = await reach();
      const egg = layout.device.split(" ").includes("egg");
      const clear = Object.keys(r.under).every((k) => k === "shell" || (k === "label" && egg && layout.compact));
      if (r.size.join() !== "44,44" || r.missed || !r.inside || !clear || r.label !== "Backlight" || r.title !== "Light up the screen") {
        bad.push({ key, ...r });
      }
    }
    check(`the backlight button is reachable on all six shells at ${width} px, clear of the screen, toys and label`,
      bad.length === 0, JSON.stringify({ layout, bad }));
    // A tap at night lights the screen for 3 s; nothing is sent to Home Assistant.
    await card.evaluate((el) => el._slides[el._index].screen.classList.add("night"));
    await calls();
    const lightsBefore = (await glow()).lights;
    await cur().locator(".backlight").click();
    await page.waitForTimeout(100);
    const lit = await glow();
    await page.waitForTimeout(3900);
    const after = await glow();
    check(`a backlight tap at ${width} px lights the screen, gone by 4 s, nothing sent`,
      lit.lit && lit.opacity > 0.5 && !after.lit && after.opacity === 0 && after.calls.length === 0 &&
      after.lights === lightsBefore, JSON.stringify({ lit, after }));
  }
  // Keyboard, a second tap, and the sleeping pet under the glow.
  await cur().locator(".backlight").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const byKey = await glow();
  await page.waitForTimeout(2000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  const again = await glow();
  await page.waitForTimeout(1700);
  check("the backlight works from the keyboard, and a second tap starts the 3 s again",
    byKey.lit && again.lit && !(await glow()).lit, JSON.stringify({ byKey, again }));
  const asleepGlow = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const was = { asleep: s.asleep };
    s.screen.classList.add("dim");
    s.asleep = true;
    const frame = s.pet.getAttribute("src");
    el._backlight(s);
    await new Promise((r) => setTimeout(r, 800)); // the scene's filter eases over .6 s
    const out = { bg: getComputedStyle(s.bg).filter, asleep: s.asleep, frame: s.pet.getAttribute("src") === frame,
      said: s.bubble.textContent };
    Object.assign(s, was);
    return out;
  });
  check("under the backlight a sleeping pet stays asleep and its scene brightens",
    asleepGlow.asleep && /brightness\(0\.9\)/.test(asleepGlow.bg), JSON.stringify(asleepGlow));
  await page.waitForTimeout(3100);
  // Screenshots: lit at night on every shell, and by day; off with reduced motion.
  for (const key of worlds) {
    await inWorld(key);
    await card.evaluate((el) => {
      const s = el._slides[el._index];
      s.screen.classList.add("night");
      el._backlight(s);
    });
    await page.waitForTimeout(150);
    await shot(`d3-backlight-${key}`);
  }
  await inWorld(null);
  await card.evaluate((el) => el._backlight(el._slides[el._index]));
  await page.waitForTimeout(150);
  await shot("d3-backlight-day");
  await page.waitForTimeout(3800);
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    s.screen.classList.add("dim");
    el._backlight(s);
  });
  await page.waitForTimeout(800);
  await shot("d3-backlight-asleep");
  await card.evaluate((el) => el._redraw());
  await page.waitForTimeout(3800);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.evaluate((el) => el._backlight(el._slides[el._index]));
  await page.waitForTimeout(3050);
  const calmOff = await glow();
  check("with reduced motion the backlight goes straight off", !calmOff.lit && calmOff.opacity === 0, JSON.stringify(calmOff));
  await shot("d3-backlight-reduced-motion-off");
  await page.emulateMedia({ reducedMotion: null });
  await card.evaluate((el) => {
    const conn = el._hass.connection;
    if (conn.__realSend) conn.sendMessagePromise = conn.__realSend;
    delete conn.__realSend;
    delete el.__calls;
  });
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(600);
  }
  if (enter("pat")) {
  // The pat (PR 3b): a clear button over the pet. A tap on it gives a C10 line and no
  // status; a tap beside it still opens the status. Card only: nothing sent or stored.
  await calm();
  await page.waitForTimeout(800);
  await pinAwake(card, "pat");
  // The coin and the sweet spot (fresh-expand P-a, P-b) pinned to the plain line here;
  // the fresh checks below set their own.
  await card.evaluate(() => { window.__patRandom ||= Math.random; Math.random = () => 0.9; });
  await card.evaluate((el) => {
    el._slides.forEach((s) => { s.patAt = 0; s.queue = []; s.sayUntil = 0; s.sayClass = 0; });
    el.__realMoving ||= el._moving;
  });
  const patState = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    const r = s.pat.getBoundingClientRect();
    const sc = s.screen.getBoundingClientRect();
    return { shown: getComputedStyle(s.pat).display !== "none" && r.width > 0, hidden: s.pat.hidden,
      status: s.screen.classList.contains("show-status"), said: s.bubble.textContent, cls: s.sayClass || 0,
      label: s.pat.getAttribute("aria-label"), catchCount: s.catchCount || 0,
      onPet: (() => {
        const p = s.pet.getBoundingClientRect();
        return [p.left - r.left, p.top - r.top, p.width - r.width, p.height - r.height].every((d) => Math.abs(d) < 1.5);
      })(),
      box: [(r.left - sc.left) / sc.width, (r.top - sc.top) / sc.height, r.width / sc.width, r.height / sc.height]
        .map((n) => Math.round(n * 1000) / 10) };
  });
  const patReset = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
    Object.assign(s, { patAt: 0, queue: [], sayUntil: 0, sayClass: 0 });
    s.bubble.textContent = "";
    s.pat.hidden = !el._patOn(s);
  });
  // A real tap where the box is (hit-testing is the point), at a share of the screen.
  const tapAt = async (fx, fy) => {
    const r = await cur().locator(".screen").boundingBox();
    await page.mouse.click(r.x + r.width * fx, r.y + r.height * fy);
    await page.waitForTimeout(150);
  };
  const tapPet = async () => {
    const r = await cur().locator(".pat").boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height * 0.6);
    await page.waitForTimeout(150);
  };
  const PAT = { content: "hehe ♥", excited: "hehe! ♪", sleepy: "mmm...", sick: "thanks... ♥" };
  // The pet may be content or excited by now (a run's earlier sections, the day's turns):
  // either mood's pat line is the plain pat (a day-shift run found it excited).
  const patSaid = (t) => spoke(t, PAT.content) || spoke(t, PAT.excited);
  const spoke = (said, line) => said.replace(/^\S+ /, "") === line || said === line || said.endsWith(` ${line}`);
  await patReset();
  const placed = await patState();
  check("the pat box sits on the pet's box, shown, named for the pet",
    placed.shown && placed.onPet && /^pat \S/.test(placed.label), JSON.stringify(placed));
  // Focus on the pat box when a game (the tick hides it) or a question (the CSS hides it
  // at once) covers it: the focus goes to the Status button, not the page.
  const patFocus = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const active = () => el.shadowRoot.activeElement;
    const name = () => (active() === s.pat ? "pat" : active()?.classList?.contains("statusbtn") ? "statusbtn" : active()?.tagName || "body");
    const out = {};
    s.pat.focus();
    out.before = name();
    const keep = s.game;
    const boxHidden = s.gameBox.hidden;
    s.game = { cur: null };
    s.gameBox.hidden = false; // the CSS hides the pat at once
    await new Promise((r) => setTimeout(r, 200));
    out.gameNoTick = name();
    el._tick();
    out.game = name();
    s.game = keep;
    s.gameBox.hidden = boxHidden;
    el._tick();
    s.pat.focus();
    out.again = name();
    const ask = document.createElement("div");
    ask.className = "askday";
    s.screen.append(ask);
    await new Promise((r) => setTimeout(r, 200));
    out.questionNoTick = name();
    el._tick();
    out.question = name();
    ask.remove();
    el._tick();
    return out;
  });
  check("pat: hidden with focus on it, the focus moves to Status",
    patFocus.before === "pat" && patFocus.again === "pat" && patFocus.game === "statusbtn" && patFocus.question === "statusbtn",
    JSON.stringify(patFocus));
  await patReset();
  // Service calls and the pet's own websocket messages, on the connection itself.
  await card.evaluate((el) => {
    el.__calls = [];
    const conn = el._hass.connection;
    if (!conn.__realSend) {
      conn.__realSend = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        if (msg?.type === "call_service" || /^virtual_pet\//.test(msg?.type || "")) el.__calls?.push(msg.type);
        return conn.__realSend.call(this, msg, ...a);
      };
    }
  });
  const store = () => evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
  const storeBefore = await store();
  await tapPet();
  await page.waitForTimeout(50);
  const one = await patState();
  const sent = await card.evaluate((el) => el.__calls.slice());
  const storeAfter = await store();
  check("a pat gives the content C10 line and doesn't open the status",
    spoke(await bubble(), PAT.content) && !one.status, JSON.stringify(one));
  check("a pat sends nothing and stores nothing (200 ms)", sent.length === 0 && storeAfter === storeBefore,
    JSON.stringify({ sent, same: storeAfter === storeBefore }));
  // Three fast pats, one line: the cooldown's pats wiggle.
  await patReset();
  let lines = 0;
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    el.__patLines = 0;
    s.__realSayLine ||= el._sayLine;
    el._sayLine = function (sl, q) {
      if (q.text === "hehe ♥") el.__patLines++;
      return s.__realSayLine.call(this, sl, q);
    };
  });
  for (let i = 0; i < 3; i++) await tapPet();
  lines = await card.evaluate((el) => {
    el._sayLine = el._slides[el._index].__realSayLine;
    return el.__patLines;
  });
  check("three fast pats give one line", lines === 1, `lines ${lines}`);
  // Each mood's line (babies and children say the same).
  const moodLines = {};
  for (const mood of ["excited", "sleepy", "sick", "bored", "hungry"]) {
    await card.evaluate((el, mood) => { el._slides[el._index].moodState = mood; }, mood);
    await patReset();
    await card.evaluate((el, mood) => { el._slides[el._index].moodState = mood; }, mood);
    await tapPet();
    moodLines[mood] = await bubble();
  }
  await calm();
  await page.waitForTimeout(500);
  check("each mood pats with its C10 line (bored and hungry say the content line)",
    spoke(moodLines.excited, PAT.excited) && spoke(moodLines.sleepy, PAT.sleepy) && spoke(moodLines.sick, PAT.sick) &&
    spoke(moodLines.bored, PAT.content) && spoke(moodLines.hungry, PAT.content), JSON.stringify(moodLines));
  // Fresh-expand E2: a typed teen's spoken pats take turns with its own two lines (P-a),
  // never the same twice running, and now and then the sweet spot with a hop (P-b);
  // random 0 is the sweet spot; a sleepy pat keeps its one line.
  {
    const vm = require("vm");
    const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const FRESH = vm.runInNewContext(`(${src.match(/const PERSONA_FRESH = (\{[\s\S]*?\n\});/)[1]})`);
    const spot = src.match(/\nconst PAT_SPOT = "([^"]+)";/)[1];
    const own = FRESH.mellow.pat;
    const fresh = await card.evaluate((el, { own }) => {
      const s = el._slides[el._index];
      const real = { line: el._line, persona: el._persona, state: el._state, mood: s.moodState };
      const said = [];
      el._line = function (sl, cls, text, ...rest) { said.push(text); return real.line.call(this, sl, cls, text, ...rest); };
      el._persona = () => ({ pat: own });
      el._state = function (sl, key) {
        const st = real.state.call(this, sl, key);
        return key === "sensor.life_stage" && st ? { ...st, state: "teen" } : st;
      };
      const pat = () => {
        Object.assign(s, { patAt: 0, queue: [], sayUntil: 0, sayClass: 0, poseUntil: 0 });
        s.pet.classList.remove("greethop");
        el._pat(s, { detail: 0, stopPropagation() {} });
      };
      const out = {};
      try {
        s.moodState = "content";
        s.lastPick = {};
        Math.random = window.__patRandom;
        for (let i = 0; i < 40; i++) pat();
        out.forty = said.splice(0);
        Math.random = () => 0;
        s.lastPick = {};
        pat();
        out.spot = said.splice(0);
        out.hop = s.pet.classList.contains("greethop");
        s.moodState = "sleepy";
        pat();
        out.sleepy = said.splice(0);
      } finally {
        Object.assign(el, { _line: real.line, _persona: real.persona, _state: real.state });
        Math.random = () => 0.9;
        s.moodState = real.mood;
        Object.assign(s, { patAt: 0, queue: [], sayUntil: 0, sayClass: 0, poseUntil: 0 });
      }
      return out;
    }, { own });
    const allowed = new Set([...own, PAT.content, spot]);
    const runs = fresh.forty.filter((l, i) => i && l === fresh.forty[i - 1]);
    check("fresh pat (P-a): 40 spoken pats on a typed teen give its lines and the mood line, never twice running",
      fresh.forty.length === 40 && fresh.forty.every((l) => allowed.has(l)) && runs.length === 0 &&
      own.every((l) => fresh.forty.includes(l)) && fresh.forty.includes(PAT.content), JSON.stringify(fresh.forty));
    check("fresh pat (P-b): random 0 is the sweet spot, with a hop", fresh.spot.join() === spot && fresh.hop, JSON.stringify(fresh));
    check("fresh pat: a sleepy pat keeps its one line", fresh.sleepy.join() === PAT.sleepy, JSON.stringify(fresh.sleepy));
  }
  // Six spoken pats don't count toward the catchphrase.
  await patReset();
  const cc0 = (await patState()).catchCount;
  for (let i = 0; i < 6; i++) {
    await card.evaluate((el) => { el._slides[el._index].patAt = 0; });
    await tapPet();
  }
  const cc1 = (await patState()).catchCount;
  check("six pats leave catchCount alone", cc0 === cc1, `${cc0} -> ${cc1}`);
  // A tap beside the pet still opens the status (left of the box, and above it).
  for (const [fx, fy] of [[0.12, 0.7], [0.88, 0.7], [0.5, 0.2]]) {
    await patReset();
    await card.evaluate((el) => el._slides[el._index].pet.classList.remove("wander-l", "wander-r"));
    await page.waitForTimeout(300);
    await tapAt(fx, fy);
    const st = await patState();
    check(`a tap beside the pet (${fx * 100} %, ${fy * 100} %) opens the status`, st.status, JSON.stringify(st));
  }
  await patReset();
  // A pat during a kept line, a call: that line stays, the pat wiggles.
  for (const [what, setup] of [
    ["a kept line", (el) => el._line(el._slides[el._index], 3, "kept line for the pat check", 8000)],
    ["a kept line waiting", (el) => {
      const s = el._slides[el._index];
      el._write(s, "something said", 8000);
      s.sayUntil = Date.now() + 8000;
      (s.queue ??= []).push({ text: "queued kept line", ms: 4000, cls: 3 });
    }],
    ["a call", (el) => {
      const s = el._slides[el._index];
      s.calling = true;
      el._write(s, "calling line", 8000);
    }],
  ]) {
    await patReset();
    await card.evaluate(setup);
    await page.waitForTimeout(300);
    const before = await patState();
    await tapPet();
    await page.waitForTimeout(100);
    const after = await patState();
    const moving = await card.evaluate((el) => el._slides[el._index].movingUntil - Date.now());
    check(`a pat during ${what} keeps its line and only wiggles`,
      after.said === before.said && !after.status && moving > 0, JSON.stringify({ before: before.said, after: after.said, moving }));
    await card.evaluate((el) => { el._slides[el._index].calling = false; });
  }
  await patReset();
  // Keyboard: Enter pats, even right after a swipe; a visible focus ring.
  await page.keyboard.press("Shift");
  await cur().locator(".pat").focus();
  const ring = await card.evaluate((el) => {
    const p = el._slides[el._index].pat;
    const cs = getComputedStyle(p);
    return { focus: p.matches(":focus-visible"), outline: cs.outlineStyle, width: cs.outlineWidth };
  });
  check("the pat box has a visible focus ring", ring.focus && ring.outline !== "none" && ring.width !== "0px", JSON.stringify(ring));
  await card.evaluate((el) => { el._swiped = true; });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const byKey = await patState();
  check("Enter pats right after a swipe, no status", patSaid(await bubble()) && !byKey.status, JSON.stringify(byKey));
  await card.evaluate((el) => { el._swiped = false; });
  // One shared-screen pat: the same line (it names nobody).
  await patReset();
  await evaluate(() => localStorage.setItem("hatch-shared-screen", "on"));
  await tapPet();
  const shared = await bubble();
  await evaluate(() => localStorage.setItem("hatch-shared-screen", "off"));
  check("a pat on a shared screen gives the same line", patSaid(shared), shared);
  // Asleep: a slow perk, nothing said.
  await patReset();
  const sleepy = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.asleep = true;
    s.bubble.textContent = "";
    s.pat.click();
    const cls = s.pet.classList.contains("pat-slow");
    await new Promise((r) => setTimeout(r, 200));
    const out = { said: s.bubble.textContent, cls, sayUntil: s.sayUntil > Date.now() };
    s.asleep = false;
    return out;
  });
  check("asleep, a pat is a slow perk and no line",
    sleepy.cls && !Object.values(PAT).some((l) => sleepy.said.includes(l)) && !sleepy.sayUntil, JSON.stringify(sleepy));
  // Hidden where the pat makes no sense.
  await patReset();
  const hiddenIn = {};
  const flagged = async (name, on, off) => {
    await card.evaluate(on);
    await card.evaluate((el) => el._tick());
    hiddenIn[name] = !(await patState()).shown;
    await card.evaluate(off);
    await card.evaluate((el) => el._tick());
  };
  await flagged("status", (el) => el._toggleStatus(el._slides[el._index]), (el) => el._toggleStatus(el._slides[el._index]));
  await flagged("game", (el) => { const s = el._slides[el._index]; s.gameBox.hidden = false; },
    (el) => { el._slides[el._index].gameBox.hidden = true; });
  await flagged("question", (el) => { const d = document.createElement("div"); d.className = "askday"; el._slides[el._index].screen.append(d); },
    (el) => el._slides[el._index].screen.querySelector(".askday")?.remove());
  await flagged("scene", (el) => { el._slides[el._index].scene = { kind: "test" }; }, (el) => { el._slides[el._index].scene = null; });
  await flagged("link", (el) => { el._slides[el._index].screen.classList.add("linking"); }, (el) => { el._slides[el._index].screen.classList.remove("linking"); });
  await flagged("power", (el) => { el._slides[el._index].power = { timers: [] }; }, (el) => { el._slides[el._index].power = null; });
  await flagged("boot", (el) => { el._slides[el._index].boot.hidden = false; }, (el) => { el._slides[el._index].boot.hidden = true; });
  await flagged("away", (el) => { el._slides[el._index].away = true; }, (el) => { el._slides[el._index].away = false; });
  // An egg is patted now (UX fix 4, F2); a pet whose states are reloading is not.
  await flagged("reloading", (el) => { el._slides[el._index].reloading = true; }, (el) => { el._slides[el._index].reloading = false; });
  check("the pat box is hidden in the status, a game, a question, a scene, a link, low battery, boot, away and while reloading",
    Object.values(hiddenIn).length === 9 && Object.values(hiddenIn).every(Boolean), JSON.stringify(hiddenIn));
  check("the pat box is back after", (await patState()).shown);
  // A peeking neighbour: its box is hidden and its device inert, so a real tap there reaches
  // the slide (which brings it forward); even a pat sent to it says nothing.
  if (slides > 1) {
    await patReset();
    const n = await card.evaluate((el) => {
      const i = (el._index + 1) % el._slides.length;
      const s = el._slides[i];
      s.patAt = 0;
      s.bubble.textContent = "";
      s.sayUntil = Date.now() + 60000; // its own chatter held, so a line would be the pat's
      let stopped = false;
      const ev = { detail: 1, stopPropagation: () => { stopped = true; } };
      el._pat(s, ev);
      const out = { shown: getComputedStyle(s.pat).display !== "none", inert: s.device.inert, stopped,
        said: s.bubble.textContent };
      s.sayUntil = 0;
      return out;
    });
    check("a peeking neighbour's pat box is hidden and inert, and a pat sent to it says nothing",
      !n.shown && n.inert && !n.stopped && !n.said, JSON.stringify(n));
  }
  // Reduced motion: the line and nothing that moves.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await patReset();
  const calmAt = await cur().locator(".pat").boundingBox();
  const calmHit = await card.evaluate((el, [x, y]) => {
    const h = el.shadowRoot.elementFromPoint(x, y);
    const s = el._slides[el._index];
    return { hit: `${h?.tagName}.${h?.className}`, on: el._patOn(s), talk: el._patMayTalk(s), index: el._index };
  }, [calmAt.x + calmAt.width / 2, calmAt.y + calmAt.height * 0.6]);
  await tapPet();
  const calmPat = await card.evaluate((el, calmHit) => {
    const s = el._slides[el._index];
    return { anim: getComputedStyle(s.pet).animationName, said: s.bubble.textContent, calmHit };
  }, calmHit);
  const movedBefore = await card.evaluate((el) => el._slides[el._index].movingUntil || 0);
  await tapPet(); // in the cooldown: no wiggle under calm
  const calmMove = await card.evaluate((el, was) => {
    const s = el._slides[el._index];
    return { soft: s.pet.classList.contains("pat-soft"), moving: (s.movingUntil || 0) !== was };
  }, movedBefore);
  check("under reduced motion a pat gives the line and nothing moves",
    patSaid(calmPat.said.replace(/^\S+ /, "")) || [PAT.content, PAT.excited].some((l) => calmPat.said.includes(l)),
    JSON.stringify({ calmPat, calmMove }));
  check("under reduced motion a cooldown pat starts no wiggle", !calmMove.soft && !calmMove.moving, JSON.stringify(calmMove));
  await page.emulateMedia({ reducedMotion: null });
  await card.evaluate((el) => {
    const conn = el._hass.connection;
    if (conn.__realSend) conn.sendMessagePromise = conn.__realSend;
    delete conn.__realSend;
    delete el.__calls;
    if (window.__patRandom) Math.random = window.__patRandom;
  });
  await patReset();
  await unpinAwake(card);
  }
  if (enter("react")) {
  // Reactions at baby, teen and adult (PR 3c): the stage's own mood frame and a bounded move.
  await calm();
  await page.waitForTimeout(800);
  await pinAwake(card, "react");
  const rs = (stage) => card.evaluate((el, stage) => {
    const s = el._slides[el._index];
    const real = el.__realState || el._state;
    el.__realState = real;
    el._state = function (slide, key) {
      const st = real.call(this, slide, key);
      return key === "sensor.life_stage" && st && stage ? { ...st, state: stage } : st;
    };
    s.framesKey = null;
    el._redraw(s);
    return s.drawn;
  }, stage).then(async (drawn) => {
    await page.waitForTimeout(300);
    await card.evaluate((el) => Object.assign(el._slides[el._index], { poseUntil: 0, propUntil: 0, movingUntil: 0, queue: [],
      sayUntil: 0, sayClass: 0, game: null, scene: null, power: null, linking: false, patAt: 0 }));
    return card.evaluate((el) => el._slides[el._index].drawn);
  });
  const MOVES = ["munch", "greethop", "look", "settle", "perk", "pat-soft"];
  const react = (entry) => card.evaluate((el, entry) => {
    const s = el._slides[el._index];
    Object.assign(s, { poseUntil: 0, movingUntil: 0 });
    s.pet.classList.remove("munch", "greethop", "look", "settle", "perk", "pat-soft", "hop");
    el._react(s, { at: Date.now() / 1000, ...entry });
    return { src: s.pet.getAttribute("src"), live: s.poseUntil > Date.now(), moves: [...s.pet.classList].filter((c) => ["munch", "greethop", "look", "settle", "hop"].includes(c)),
      moving: s.movingUntil > Date.now(), drawn: s.drawn };
  }, entry);
  for (const stage of ["teen", "adult"]) {
    check(`react: ${stage} stage stubbed`, (await rs(stage)) === stage);
    // A species that declares "acts" for this stage plays <stage>_eat / _cheer for fed / praised (R1).
    const acts = await card.evaluate((el) => el._slides[el._index].species?.acts || null);
    const own = (act) => (acts && (acts[act] === true || acts[act]?.includes(stage)) ? act : "excited");
    const refuse = acts && (acts.refuse === true || acts.refuse?.includes(stage)) ? "refuse" : "bored"; // A5 art, else the mood frame
    const cases = [
      ["fed", { action: "feed", result: "ok" }, own("eat"), "munch"],
      ["snack", { action: "snack", result: "ok" }, own("eat"), "munch"],
      ["praised", { action: "praise", result: "ok" }, own("cheer"), "greethop"],
      ["won", { action: "game", result: "won" }, own("cheer"), "greethop"],
      ["tucked in", { action: "blanket", result: "ok" }, "cozy", "settle"],
      ["refused (full)", { action: "feed", result: "full" }, refuse, "look"],
    ];
    for (const [name, entry, mood, move] of cases) {
      const r = await react(entry);
      check(`react: ${stage} ${name} shows ${stage}_${mood} and ${move}`,
        r.src.includes(`/${stage}_${mood}_`) && r.live && r.moves.join() === move && (move !== "look" || r.moving), JSON.stringify(r));
    }
    for (const [action, line] of [["blanket", "so cozy now... thank you ♥"], ["fan", "ahh, a breeze! thank you ♪"]]) {
      const said = await card.evaluate((el, action) => {
        const s = el._slides[el._index];
        s.queue = []; s.sayUntil = 0; s.sayClass = 0;
        el._react(s, { at: Date.now() / 1000, action, result: "ok" });
        return s.bubble.textContent;
      }, action);
      check(`UX3 F11: ${stage} the ${action} answered gets a thank-you line`, said === line, said);
    }
    for (const result of ["not_needed", "already_clean", "not_sick", "not_sleepy", "too_tired"]) {
      const r = await react({ action: "play", result });
      check(`react: ${stage} refusal ${result} reacts`, r.live && r.moves.join() === "look" && r.src.includes(`/${stage}_`), JSON.stringify(r));
    }
    const won = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const keep = s.game;
      s.game = { cur: null }; s.poseUntil = 0;
      el._react(s, { action: "game", result: "won", at: Date.now() / 1000 });
      const out = { live: s.poseUntil > Date.now(), src: s.pet.getAttribute("src") };
      s.game = keep; s.poseUntil = 0;
      return out;
    });
    check(`react: ${stage} a won game's log reacts even if the game is still open`, won.live && won.src.includes(`/${stage}_${own("cheer")}_`), JSON.stringify(won));
    for (const result of ["asleep", "egg", "away", "no_game", "unfair", "spoiled"]) {
      const r = await react({ action: "play", result });
      check(`react: ${stage} ${result} does nothing`, !r.live && r.moves.length === 0, JSON.stringify(r));
    }
    const after = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      el._react(s, { action: "feed", result: "ok", at: Date.now() / 1000 });
      await new Promise((r) => setTimeout(r, 2800));
      el._tick();
      return { src: s.pet.getAttribute("src"), live: s.poseUntil > Date.now(), mood: s.moodState, moves: [...s.pet.classList],
        frames: s.frames, shown: !(s.poseFrames || []).some((f) => s.pet.getAttribute("src").includes(`/${f}.png`)) ||
          (s.frames || []).some((f) => s.pet.getAttribute("src").includes(`/${f}.png`)) };
    });
    check(`react: ${stage} back to the mood frame after 2.5 s`,
      !after.live && after.shown && new RegExp(`/${stage}_${after.mood}_|/${stage}_content_`).test(after.src) &&
      !after.moves.some((c) => ["munch", "greethop", "look", "settle"].includes(c)), JSON.stringify(after));
    // UX fix 6 (F5): a lost game settles on the content frames (a species with acts.aww plays it).
    const lostReact = await react({ action: "play", result: "lost" });
    check(`react: ${stage} lost settles on the content frames`,
      lostReact.live && lostReact.moves.includes("settle") && lostReact.src.includes(`/${stage}_content_`), JSON.stringify(lostReact));
    // Fallback: an act whose sprites do not load swaps back to the mood frames, and is remembered
    // (_poseOk, keyed species/stage/act, apart from the waves). No broken image left on show.
    if (acts) {
      const fb = await card.evaluate(async (el, stage) => {
        const s = el._slides[el._index];
        const real = s.speciesId;
        s.speciesId = "no-such-species"; Object.assign(s, { poseUntil: 0 });
        el._reactFrames(s, "fed");
        const first = s.poseFrames[0];
        await new Promise((r) => setTimeout(r, 700));
        const out = { first, after: s.poseFrames[0], ok: el._poseOk.get(`no-such-species/${stage}/eat`), wave: [...(el._waveOk || new Map()).keys()].some((k) => k.includes("eat")) };
        s.speciesId = real; s.poseUntil = 0;
        return out;
      }, stage);
      check(`react: ${stage} a missing eat sprite falls back to the mood frame`,
        fb.first === `${stage}_eat_1` && fb.after.startsWith(`${stage}_`) && !fb.after.includes("_eat_") && fb.ok === false && !fb.wave, JSON.stringify(fb));
      // Calls while the probe is out start no new one; each caller's fallback still runs.
      const once = await card.evaluate(async (el, stage) => {
        const s = el._slides[el._index];
        const Real = window.Image;
        let made = 0;
        window.Image = function () { made++; return new Real(); };
        let applied = 0;
        try {
          for (let i = 0; i < 3; i++) el._actPose(s.species, stage, "probe-once-species", "eat", () => { applied++; });
        } finally {
          window.Image = Real;
        }
        await new Promise((r) => setTimeout(r, 700));
        return { made, applied, ok: el._poseOk.get(`probe-once-species/${stage}/eat`) };
      }, stage);
      check(`react: ${stage} an act's sprites are probed once while loading`,
        once.made === 2 && once.applied === 3 && once.ok === false, JSON.stringify(once));
    }
    // Never while: a scene, a link, a game, the low-battery gag, asleep, away, egg.
    for (const [name, patch] of [["scene", { scene: { kind: "feed", frames: [] } }], ["linking", { linking: true }],
      ["game", { game: { cur: null } }], ["power", { power: {} }], ["asleep", { asleep: true }], ["away", { away: true }], ["egg", { egg: true }]]) {
      const r = await card.evaluate((el, patch) => {
        const s = el._slides[el._index];
        const keep = { scene: s.scene, linking: s.linking, game: s.game, power: s.power, asleep: s.asleep, away: s.away, egg: s.egg };
        Object.assign(s, { poseUntil: 0 }, patch);
        s.pet.classList.remove("munch");
        el._reactFrames(s, "fed");
        const out = { live: s.poseUntil > Date.now(), moves: s.pet.classList.contains("munch") };
        Object.assign(s, keep, { poseUntil: 0 });
        return out;
      }, patch);
      check(`react: ${stage} no reaction while ${name}`, !r.live && !r.moves, JSON.stringify(r));
    }
    // A pat during a reaction speaks and keeps the reaction's move.
    const pat = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      Object.assign(s, { patAt: 0, queue: [], sayUntil: 0, sayClass: 0, poseUntil: 0 });
      el._react(s, { action: "praise", result: "ok", at: Date.now() / 1000 });
      s.sayUntil = 0; s.queue = []; s.sayClass = 0;
      s.pet.classList.remove("perk");
      el._pat(s, { detail: 0, stopPropagation() {} });
      const out = { cls: [...s.pet.classList], said: s.bubble.textContent, live: s.poseUntil > Date.now() };
      s.patAt = 0;
      return out;
    });
    check(`react: ${stage} a pat during a reaction speaks, keeps its move, adds no perk`,
      pat.cls.includes("greethop") && !pat.cls.includes("perk") && pat.said.length > 0 && pat.live, JSON.stringify(pat));
    // Fresh-expand P-c: a typed teen's praise says one of its praise lines or "♥", never
    // the same twice running.
    if (stage === "teen") {
      const vm = require("vm");
      const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
      const own = vm.runInNewContext(`(${src.match(/const PERSONA_FRESH = (\{[\s\S]*?\n\});/)[1]})`).starry.praise;
      const praised = await card.evaluate((el, own) => {
        const s = el._slides[el._index];
        const real = { line: el._line, persona: el._persona };
        const said = [];
        el._line = function (sl, cls, text, ...rest) { said.push(text); return real.line.call(this, sl, cls, text, ...rest); };
        el._persona = () => ({ praise: own });
        try {
          s.lastPick = {};
          for (let i = 0; i < 20; i++) {
            Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0, poseUntil: 0 });
            el._react(s, { action: "praise", result: "ok", at: Date.now() / 1000 });
          }
        } finally {
          Object.assign(el, { _line: real.line, _persona: real.persona });
          Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0, poseUntil: 0 });
        }
        return said;
      }, own);
      check("react: a typed teen's praise says its praise lines or ♥, never twice running",
        praised.length === 20 && praised.every((l) => [...own, "♥"].includes(l)) &&
        praised.every((l, i) => !i || l !== praised[i - 1]) && own.some((l) => praised.includes(l)), JSON.stringify(praised));
    }
    // P3 praise moves, live: a plucky pet's win beat in a game (ms 900) is a perk, back in the
    // middle before the next round (1000 ms); bouncy's praise hop is a greethop, which
    // a hass update (_render toggles "hop") leaves running.
    if (stage === "adult") {
      const moves = await card.evaluate(async (el) => {
        const s = el._slides[el._index];
        const base = el._state;
        const as = (personality) => {
          el._state = function (slide, key) {
            const st = base.call(this, slide, key);
            return key === "sensor.life_stage" && st && slide === s ? { ...st, attributes: { ...st.attributes, personality } } : st;
          };
        };
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const moved = () => [...s.pet.classList].filter((c) => ["wander-l", "wander-r", "perk", "hop", "greethop"].includes(c));
        const out = {};
        await wait(1500); // the pat check's greethop has run out
        s.pet.classList.remove("wander-l", "wander-r", "perk", "hop", "greethop");
        as("plucky");
        const keep = s.game;
        Object.assign(s, { poseUntil: 0, movingUntil: 0, game: { cur: null } });
        el._reactFrames(s, "praised", { inGame: true, ms: 900 }); // the move is picked now
        s.game = keep; // not left open for the tick to end
        out.pluckyNow = moved();
        await wait(1000);
        out.pluckyNext = moved();
        out.pluckyMoving = s.movingUntil > Date.now();
        out.pluckyX = getComputedStyle(s.pet).translate;
        as("bouncy");
        Object.assign(s, { poseUntil: 0, movingUntil: 0 });
        s.pet.classList.remove("greethop", "hop");
        el._reactFrames(s, "praised");
        out.bouncyNow = moved();
        s.drawnSig = null; el._sig = null;
        el.hass = { ...el._hass }; // an update that redraws the slide (toggles "hop")
        await wait(300);
        out.redrawn = !!s.drawnSig;
        out.bouncyAfter = moved();
        el._state = base;
        Object.assign(s, { poseUntil: 0, movingUntil: 0 });
        return out;
      });
      check("react: plucky's in-game praise is a perk, centred before the next round",
        moves.pluckyNow.join() === "perk" && moves.pluckyNext.length === 0 && !moves.pluckyMoving &&
        ["none", "0px", "0px 0px"].includes(moves.pluckyX), JSON.stringify(moves));
      check("react: bouncy's praise hop (greethop) survives a hass update",
        moves.redrawn && moves.bouncyNow.includes("greethop") && moves.bouncyAfter.includes("greethop"), JSON.stringify(moves));
    }
    // R2 hooks: pat, refuse, aww (lost), ready, splash play the species' acts when declared and
    // change nothing without. The new art is not drawn yet, so the sprites are served the stage's content frames.
    const NEW = /_(pat|refuse|aww|ready|splash)_([12])\.png/;
    const feedNew = async (route) => {
      const url = route.request().url();
      await (NEW.test(url) ? route.fulfill({ response: await route.fetch({ url: url.replace(NEW, "_content_$2.png") }) }) : route.continue());
    };
    await page.route("**/sprites/**", feedNew);
    const hooks = (await card.evaluate(async (el, stage) => {
      const s = el._slides[el._index];
      const sp0 = s.species;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const reset = () => {
        Object.assign(s, { poseUntil: 0, patPoseUntil: 0, patAt: 0, movingUntil: 0, queue: [], sayUntil: 0, sayClass: 0, game: null, calling: false });
        s.pet.classList.remove("look", "settle", "munch", "pat-soft", "perk");
      };
      const src = () => s.pet.getAttribute("src") || "";
      const ev = { detail: 0, stopPropagation() {} };
      const out = {};
      const ALL = Object.fromEntries(["pat", "refuse", "aww", "ready", "splash"].map((k) => [k, ["baby", "teen", "adult"]]));
      const realState = el._state;
      for (const withActs of [true, false]) {
        const k = withActs ? "acts" : "none";
        s.species = { ...sp0, acts: withActs ? ALL : undefined };
        // Warm every probe once (unknown plays), then let the loads finish.
        reset(); el._reactFrames(s, "refused"); el._pat(s, ev); s.patPoseUntil = 0; reset();
        await wait(500);
        const r = out[k] = {};
        reset(); el._pat(s, ev);
        r.pat = { src: src(), live: s.patPoseUntil > Date.now(), reactLive: s.poseUntil > Date.now(), frames: el._frames(s).length };
        el._pat(s, ev); // a second pat inside the cooldown: not "reacting", so it still wiggles
        r.pat.soft = s.pet.classList.contains("pat-soft");
        reset(); el._reactFrames(s, "fed"); const before = s.poseUntil; el._pat(s, ev);
        r.patInReaction = { src: src(), live: s.patPoseUntil > Date.now(), same: s.poseUntil === before };
        reset(); s.calling = true; el._pat(s, ev);
        r.patCalling = { live: s.patPoseUntil > Date.now() };
        reset(); s.asleep = true; el._pat(s, ev); s.asleep = false;
        r.patAsleep = { live: s.patPoseUntil > Date.now() };
        reset(); el._reactFrames(s, "refused");
        r.refuse = { src: src(), live: s.poseUntil > Date.now(), look: s.pet.classList.contains("look") };
        reset(); el._reactFrames(s, "lost", { inGame: true });
        r.aww = { src: src(), live: s.poseUntil > Date.now() };
        reset(); s.game = { cur: null }; el._react(s, { action: "game", result: "lost", at: Date.now() / 1000 });
        r.awwLog = { src: src(), live: s.poseUntil > Date.now() };
        reset(); s.game = { cur: null }; // the picker: nothing yet
        r.picker = { live: s.poseUntil > Date.now() };
        await el._pickGame(s, "left_right"); // the pick starts the game: acts.ready
        r.ready = { src: src(), live: s.poseUntil > Date.now(), ms: s.poseUntil - Date.now() };
        el._quitGame(s, null);
        reset();
        // The clean scene's last beat.
        el._state = function (slide, key) {
          const st = realState.call(this, slide, key);
          return key === "sensor.poop" && st ? { ...st, state: "2" } : st;
        };
        el._sceneStart(s, "clean");
        if (s.scene) { s.scene.paused = true; el._sceneRender(s, 2000); r.splash = { src: src() }; el._sceneEnd(s, { quiet: true }); }
        else r.splash = { src: "no scene" };
        el._state = realState;
        reset();
      }
      s.species = sp0;
      return out;
    }, stage));
    const H = hooks.acts, N = hooks.none, sg = `/${stage}_`;
    check(`react: ${stage} acts.pat shows on a pat, apart from the reaction`, H.pat.src.includes(`${sg}pat_`) && H.pat.live && !H.pat.reactLive && H.pat.frames === 2, JSON.stringify(H.pat));
    check(`react: ${stage} a second pat is not "reacting" after the pat pose (still wiggles)`, H.pat.soft, JSON.stringify(H.pat));
    check(`react: ${stage} no pat pose over a reaction, a call or sleep, and the reaction's frames stay`,
      !H.patInReaction.live && H.patInReaction.same && !H.patCalling.live && !H.patAsleep.live && !H.patInReaction.src.includes("_pat_"), JSON.stringify([H.patInReaction, H.patCalling, H.patAsleep]));
    check(`react: ${stage} without acts a pat is as before`, !N.pat.src.includes("_pat_") && !N.pat.live && !N.patInReaction.live, JSON.stringify(N.pat));
    check(`react: ${stage} acts.refuse plays, else the bored frame and look`,
      H.refuse.src.includes(`${sg}refuse_`) && H.refuse.live && N.refuse.src.includes(`${sg}bored_`) && N.refuse.look && N.refuse.live, JSON.stringify([H.refuse, N.refuse]));
    check(`react: ${stage} acts.aww plays after a lost game (even with the game still open); without it the content frames settle (UX fix 6, F5)`,
      H.aww.live && H.aww.src.includes(`${sg}aww_`) && H.awwLog.live && H.awwLog.src.includes(`${sg}aww_`) &&
        N.aww.live && N.awwLog.live && !N.aww.src.includes("aww_") && N.aww.src.includes(`${sg}content_`), JSON.stringify([H.aww, H.awwLog, N.aww, N.awwLog]));
    check(`react: ${stage} acts.ready plays ~1.2 s at a game's start; none without`,
      !H.picker.live && H.ready.live && H.ready.src.includes(`${sg}ready_`) && H.ready.ms <= 1300 && !N.ready.live, JSON.stringify([H.ready, N.ready]));
    check(`react: ${stage} acts.splash is the clean scene's last beat; without it the cheer or clean frames`,
      H.splash.src.includes(`${sg}splash_`) && !N.splash.src.includes("_splash_") && N.splash.src !== "no scene", JSON.stringify([H.splash, N.splash]));
    await page.unroute("**/sprites/**", feedNew);
    // The pat pose under reduced motion is a single still frame.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const still = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const sp0 = s.species;
      s.species = { ...sp0, acts: { pat: ["baby", "teen", "adult"] } };
      s.patPoseFrames = ["adult_pat_1", "adult_pat_2"]; s.patPoseUntil = Date.now() + 900; s.poseUntil = 0;
      const n = el._frames(s).length;
      s.patPoseUntil = 0; s.patPoseFrames = null; s.species = sp0;
      return n;
    });
    check(`react: ${stage} the pat pose is one still frame under reduced motion`, still === 1, String(still));
    await page.emulateMedia({ reducedMotion: null });
    // Under reduced motion: the frame changes, nothing moves, no class sticks.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(150);
    for (const [entry, mood] of [[{ action: "feed", result: "ok" }, own("eat")], [{ action: "blanket", result: "ok" }, "cozy"],
      [{ action: "feed", result: "full" }, refuse]]) {
      const r = await react(entry);
      check(`react: ${stage} reduced motion, ${entry.result}: the frame changes, no move, no wander`,
        r.src.includes(`/${stage}_${mood}_1`) && r.moves.length === 0 && !r.moving, JSON.stringify(r));
    }
    await page.emulateMedia({ reducedMotion: null });
    await page.waitForTimeout(150);
    await card.evaluate((el) => { el._slides[el._index].poseUntil = 0; });
  }
  // A child is left alone (its own species poses).
  await rs("child");
  const kid = await react({ action: "feed", result: "full" });
  check("react: a child gets no stage reaction", kid.drawn === "child" && !kid.live && kid.moves.length === 0, JSON.stringify(kid));
  await rs(null);
  await card.evaluate((el) => { if (el.__realState) { el._state = el.__realState; delete el.__realState; } el._redraw(el._slides[el._index]); });
  // Every species: 4 moods x 3 stages load.
  const species = fs.readdirSync(path.join(__dirname, "../custom_components/virtual_pet/frontend/sprites"), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(__dirname, "../custom_components/virtual_pet/frontend/sprites", n, "species.json")))
    .map((n) => [n, JSON.parse(fs.readFileSync(path.join(__dirname, "../custom_components/virtual_pet/frontend/sprites", n, "species.json"), "utf8"))])
    .filter(([, d]) => d.ready !== false);
  const loaded = await card.evaluate(async (el, list) => {
    const base = el._slides[el._index].pet.src.replace(/\/sprites\/.*$/, "/sprites/");
    const q = el._slides[el._index].pet.src.match(/\?.*$/)?.[0] || "";
    const bad = [];
    let n = 0;
    const jobs = [];
    for (const [id, d] of list) {
      for (const stage of ["baby", "teen", "adult"]) {
        const drawn = d.stages.includes(stage) ? stage : (d.stage_fallback?.[stage] || d.stages[d.stages.length - 1]);
        for (const mood of ["content", "excited", "cozy", "bored"]) {
          const m = d.moods.includes(mood) ? mood : "content";
          for (let i = 1; i <= (d.frames || 1); i++) {
            const url = `${base}${id}/${drawn}_${m}_${i}.png${q}`;
            n++;
            jobs.push(new Promise((ok) => {
              const img = new Image();
              img.onload = () => { if (!img.naturalWidth) bad.push(url); ok(); };
              img.onerror = () => { bad.push(url); ok(); };
              img.src = url;
            }));
          }
        }
      }
    }
    await Promise.all(jobs);
    return { n, bad: bad.slice(0, 5), nbad: bad.length };
  }, species);
  check(`react: ${species.length} species x 3 stages x 4 moods all load (${loaded.n} frames)`,
    species.length >= 30 && loaded.nbad === 0, JSON.stringify(loaded));
  await unpinAwake(card);
  }
  if (enter("visitors")) {
  // World visitors (docs/plan-2026-10-31-visitors.md): card only, seeded by date,
  // nothing kept but the day's flag. The decision (_visitorDue) is stubbed for the
  // gates; the real one is walked over 14 days x 24 hours. The day flag persists
  // across runs: every hatch-visit-* is cleared before each case, and set again after.
  await calm();
  await page.waitForTimeout(800);
  await pinAwake(card, "visitors");
  // (vprep clears every hatch-visit-* once its stub is in, so no real visit slips in first)
  const vsrc = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
  // Each world's visitors: worlds.json's roster with the card's play data (by id).
  const VPLAY = require("vm").runInNewContext(`(${vsrc.match(/\nconst VISITOR_PLAY = (\{[\s\S]*?\n\});/)[1]})`);
  const VWORLDS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
  const VIS = Object.fromEntries(Object.entries(VWORLDS).map(([w, x]) => [w, (x.visitors || []).map((v) => ({ ...VPLAY[v.id], ...v }))]));
  const VLINES = require("vm").runInNewContext(vsrc.match(/\nconst VISIT_LINES = (\[[^\n]*\]);/)[1]);
  const VBABY = require("vm").runInNewContext(`(${vsrc.match(/\n {2}"visit": (\{[^\n]*\}),/)[1]})`).baby;
  // A free, shown pet: past its first look, on show a minute, no link lately; the
  // decision stubbed to `due` (a visitor object, or null), checks every tick.
  const vprep = (due) => card.evaluate((el, due) => {
    const s = el._slides[el._index];
    el._visitorEnd(s);
    if (!el.__realDue) el.__realDue = el._visitorDue;
    // Due only inside __vtick: the card's own 700 ms tick never starts one meanwhile.
    el._visitorDue = () => el.__vdue || null;
    el.__vdue = null;
    // A missed day visitor coming late (fresh-moment 3): only where a case asks (__late).
    if (!el.__realLate) el.__realLate = el._visitorLate;
    el._visitorLate = function (t) { return el.__late ? el.__realLate.call(this, t) : null; };
    // It clears the 20 s throttle too: the card's own tick may have looked (nothing due) since.
    el.__vtick = (t) => {
      el.__vdue = due;
      t.nextVisitCheck = 0;
      try { el._visitorTick(t); } finally { el.__vdue = null; }
    };
    Object.assign(s, { poseUntil: 0, propUntil: 0, movingUntil: 0, flairUntil: 0, visitUntil: 0, queue: [], sayUntil: 0,
      sayClass: 0, game: null, scene: null, power: null, linking: false, calling: false, asleep: false, away: false,
      lookedFirst: true, nextVisitCheck: 0, patAt: 0, poseFrames: [], moodState: "content" });
    s.screen.classList.remove("show-status");
    el._booting = false;
    el._visitShown = { s, at: Date.now() - 60000 };
    el._linkEndedAt = undefined;
    for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-visit-") || k.startsWith("hatch-visitfriends-")) localStorage.removeItem(k);
    return { world: s.worldKey, device: s.ids?.device, key: `hatch-visit-${s.ids?.device}-${new Date().toDateString()}` };
  }, due);
  const where = await vprep(null);
  const list = VIS[where.world] || [];
  check("visitors: the pet's world has three visitors", list.length === 3, `${where.world}: ${list.map((v) => v.id)}`);
  const V0 = list.find((v) => !v.cross) || list[0];
  // Not due: nothing starts and the day's flag stays unused.
  const tick = (setup) => card.evaluate((el, setup) => {
    const s = el._slides[el._index];
    const undo = [];
    const set = (obj, k, v) => { undo.push([obj, k, obj[k]]); obj[k] = v; };
    if (setup === "asleep") set(s, "asleep", true);
    if (setup === "away") { set(s, "away", true); set(s, "moodState", "away"); }
    if (setup === "game") set(s, "game", { cur: null });
    if (setup === "scene") set(s, "scene", { kind: "clean" });
    if (setup === "linking") set(s, "linking", true);
    if (setup === "link running") set(el, "_link", { timers: [] });
    if (setup === "calling") set(s, "calling", true);
    if (setup === "power") set(s, "power", { timers: [] });
    if (setup === "status open") s.screen.classList.add("show-status");
    if (setup === "a line queued") set(s, "queue", [{ text: "x", ms: 100, cls: 3 }]);
    if (setup === "before its first look") set(s, "lookedFirst", false);
    if (setup === "in its first 10 s") set(el, "_visitShown", { s, at: Date.now() - 9000 });
    if (setup === "just past 10 s") set(el, "_visitShown", { s, at: Date.now() - 10500 });
    if (setup === "a link 1 min ago") set(el, "_linkEndedAt", Date.now() - 60000);
    if (setup === "egg") {
      const real = el._state;
      set(el, "_state", function (slide, key) {
        const st = real.call(this, slide, key);
        return key === "sensor.life_stage" && st ? { ...st, state: "egg" } : st;
      });
    }
    const target = setup === "off-slide" ? { ...s, visitor: null } : s;
    el.__vtick(target);
    const out = { started: !!s.visitor || !!target.visitor,
      used: Object.keys(localStorage).some((k) => k.startsWith("hatch-visit-")) };
    s.screen.classList.remove("show-status");
    for (const [obj, k, v] of undo.reverse()) obj[k] = v;
    if (target !== s && target.visitor) el._visitorEnd(target);
    return out;
  }, setup);
  {
    const r = await tick(null);
    check("visitors: not due, nothing starts and the day isn't used up", !r.started && !r.used, JSON.stringify(r));
  }
  const skips = ["asleep", "away", "egg", "game", "scene", "linking", "link running", "calling", "power", "status open",
    "a line queued", "before its first look", "in its first 10 s", "a link 1 min ago", "off-slide"];
  const bad = [];
  for (const setup of skips) {
    await vprep(V0);
    const r = await tick(setup);
    if (r.started || r.used) bad.push(`${setup}: ${JSON.stringify(r)}`);
  }
  check("visitors: no visit when asleep, away, egg, in a game or scene, linking, calling, power, status open, queued, " +
    "early or off-slide; the day's flag unused", bad.length === 0, bad.join(" | "));
  // Fresh-moment 5a: a question on show (its 60 s hold) no longer stops a visit or a flair;
  // the question keeps its bubble and buttons, and the visitor's greet says no line.
  {
    await vprep(V0);
    const r = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const box = document.createElement("div");
      box.className = "askday";
      s.screen.append(box);
      el._write(s, "how was your day?", 60000);
      try {
        el.__vtick(s);
        const started = !!s.visitor;
        if (s.visitor) el._visitorGreet(s, s.visitor.v);
        const said = s.bubble.textContent;
        el._visitorEnd(s);
        Object.assign(s, { flairUntil: 0, poseUntil: 0, movingUntil: 0, nextFlair: 1 });
        let flair = false;
        const realFlair = el._flair;
        el._flair = () => { flair = true; return []; };
        try { el._flairTick(s); } finally { el._flair = realFlair; }
        return { started, said, flair, box: !!s.screen.querySelector(".askday") };
      } finally {
        box.remove();
        Object.assign(s, { sayUntil: 0, flairUntil: 0, poseUntil: 0 });
        for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-visit-")) localStorage.removeItem(k);
      }
    });
    check("fresh-moment 5a: with a question on show a visitor and a flair still come, no line over it, and the question stays",
      r.started && r.said === "how was your day?" && r.flair && r.box, JSON.stringify(r));
  }
  // Review s2622 #9: an answer tapped while the visitor is on screen still lands (a real
  // click, so nothing of the visit covers the buttons); the question goes, its reply said.
  {
    await vprep(V0);
    const started = await card.evaluate((el) => {
      const s = el._slides[el._index];
      el._ask(s, "how_day");
      el._write(s, "how was your day?", 60000);
      el.__vtick(s);
      return !!s.visitor;
    });
    let clicked = true;
    try {
      await cur().locator(".askday button").first().click({ timeout: 3000 });
    } catch (err) {
      clicked = String(err.message).split("\n")[0];
    }
    const after = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const out = { box: !!s.screen.querySelector(".askday"), said: s.bubble.textContent, visitor: !!s.visitor };
      el._visitorEnd(s);
      s.screen.querySelector(".askday")?.remove();
      clearTimeout(s.askTimer);
      Object.assign(s, { asking: false, sayUntil: 0, poseUntil: 0, flairUntil: 0, visitUntil: 0 });
      for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-visit-")) localStorage.removeItem(k);
      return out;
    });
    check("fresh-moment 5a: an answer tapped mid-visit lands: the question goes and its reply is said",
      started && clicked === true && !after.box && after.said !== "how was your day?",
      JSON.stringify({ started, clicked, ...after }));
  }
  // VISIT_SHOWN_MS is 10 s (owner, 2026-10-31): 9 s on show, no visit; 10.5 s, it starts.
  {
    await vprep(V0);
    const r = await tick("just past 10 s");
    await card.evaluate((el) => el._visitorEnd(el._slides[el._index]));
    check("visitors: the slide on show 10 s (VISIT_SHOWN_MS), then a visit may start", r.started && r.used &&
      /\nconst VISIT_SHOWN_MS = 10000;/.test(vsrc), JSON.stringify(r));
  }
  // A visit: the visitor's picture, the flag used, then the greet frame and one line.
  await vprep(V0);
  const before = await evaluate(() => Object.keys(localStorage));
  const started = await card.evaluate((el) => {
    const s = el._slides[el._index];
    el.__vcalls = [];
    el.__realCalls ||= { svc: el._hass.callService, ws: el._hass.callWS };
    el._hass.callService = (...a) => { el.__vcalls.push(`svc ${a[0]}.${a[1]}`); return el.__realCalls.svc.apply(el._hass, a); };
    el._hass.callWS = (...a) => { el.__vcalls.push(`ws ${a[0]?.type}`); return el.__realCalls.ws.apply(el._hass, a); };
    el.__vtick(s);
    const imgs = [...(s.visitor?.el.querySelectorAll("img") || [])].map((i) => i.getAttribute("src"));
    s.nextVisitCheck = 0;
    const again = (() => { // the same pet free again (no visit on, no flair): the day is used up
      const keep = { visitor: s.visitor, flairUntil: s.flairUntil, visitUntil: s.visitUntil };
      Object.assign(s, { visitor: null, flairUntil: 0, visitUntil: 0 });
      el.__vtick(s);
      const twice = !!s.visitor;
      if (twice) el._visitorEnd(s);
      Object.assign(s, keep);
      return twice;
    })();
    return { on: !!s.visitor, imgs, visitUntil: s.visitUntil > Date.now(), again };
  });
  check("visitors: a free, shown pet gets its visitor (two frames) and pats go quiet for it",
    started.on && started.imgs.length === 2 && started.imgs.every((x, i) => x.includes(`/ui/visitor_${where.world}_${V0.id}_${i + 1}.png`)) &&
    started.visitUntil, JSON.stringify(started));
  check("visitors: once a day per pet (the flag hatch-visit-<device>-<date>)", !started.again, JSON.stringify(started));
  const pat = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const said = s.bubble.textContent;
    const on = el._patOn(s);
    el._pat(s, { stopPropagation() {}, detail: 0 });
    return { on, patAt: s.patAt, same: s.bubble.textContent === said };
  });
  check("visitors: a pat mid-visit wiggles with no line", pat.on && pat.patAt === 0 && pat.same, JSON.stringify(pat));
  await page.waitForTimeout((V0.in || 1400) + 1300);
  const greeted = await card.evaluate((el) => {
    const s = el._slides[el._index];
    return { src: s.pet.getAttribute("src"), text: s.bubble.textContent, drawn: s.drawn, acts: s.species?.acts?.cheer ?? null, waves: !!s.species?.waves?.[s.drawn],
      leftOn: !!s.visitor, keys: Object.keys(localStorage), calls: el.__vcalls };
  });
  // A teen or adult may greet in its type's words (gaps-seams 4b).
  const VPERSONA = require("vm").runInNewContext(`(${vsrc.match(/const PERSONA = (\{[\s\S]*?\n\});/)[1]})`);
  const lines = [...VLINES, ...V0.lines, ...Object.values(VPERSONA).flatMap((t) => t.visit)];
  const waves = greeted.drawn !== "child" && greeted.waves;
  const greetFrame = greeted.drawn === "child" || (waves ? /_wave_\d/.test(greeted.src) : /_(cheer|excited)_\d/.test(greeted.src));
  check("visitors: the pet greets it with its wave frames (child: the greet as before; no waves: cheer or excited) and one of its lines",
    greetFrame && lines.some((l) => greeted.text.includes(l)), JSON.stringify(greeted));
  // Without the wave art the greet falls back to excited frames, never a broken image.
  const fb = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    if (s.drawn === "child" || !s.species?.waves?.[s.drawn]) return { skip: true };
    const key = `${s.speciesId}/${s.drawn}`;
    const had = el._waveOk?.get(key);
    (el._waveOk ||= new Map()).set(key, false);
    const frames = el._linkPose(s.species, s.drawn, s.speciesId, () => {});
    if (had === undefined) el._waveOk.delete(key); else el._waveOk.set(key, had);
    return { frames };
  });
  check("visitors: the greet falls back to the excited frames when the waves failed to load",
    fb.skip || (fb.frames?.length && fb.frames.every((f) => !/_wave_/.test(f))), JSON.stringify(fb));
  const added = greeted.keys.filter((k) => !before.includes(k));
  check("visitors: nothing sent (no callService or callWS), only hatch-visit-* kept (and E3's friends tally)",
    greeted.calls.length === 0 && added.filter((k) => k.startsWith("hatch-visit-")).length === 1 &&
    added.every((k) => /^hatch-visit(-|seen-|friends-)/.test(k)), JSON.stringify({ calls: greeted.calls, added }));
  await card.evaluate((el) => { el._hass.callService = el.__realCalls.svc; el._hass.callWS = el.__realCalls.ws; });
  // A kept line arriving mid-visit keeps its bubble: the greet is skipped.
  await vprep(V0);
  const kept = await card.evaluate(async (el, ms) => {
    const s = el._slides[el._index];
    el.__vtick(s);
    el._line(s, 3, "a kept line for the check", 6000);
    await new Promise((r) => setTimeout(r, ms));
    return { text: s.bubble.textContent, pose: s.poseUntil > Date.now(), on: !!s.visitor };
  }, (V0.in || 1400) + 1300);
  check("visitors: a kept line mid-visit keeps its bubble; no greet", kept.text.includes("a kept line for the check") && !kept.pose && kept.on,
    JSON.stringify(kept));
  // The pet goes into a game mid-visit: the visit ends at the next beat, its picture gone, nothing said.
  await vprep(V0);
  const abort = await card.evaluate(async (el, ms) => {
    const s = el._slides[el._index];
    el.__vtick(s);
    const box = s.visitor.el;
    s.game = { cur: null };
    await new Promise((r) => setTimeout(r, ms));
    const out = { on: !!s.visitor, inDom: box.isConnected, said: s.sayUntil > Date.now() };
    s.game = null;
    return out;
  }, (V0.in || 1400) + 1300);
  check("visitors: a game starting mid-visit ends it, the picture removed, no line", !abort.on && !abort.inDom && !abort.said, JSON.stringify(abort));
  // Reduced motion: one still first frame at the edge, on screen, then the greet frame and line, no hop.
  await vprep(V0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  const still = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    el.__vtick(s);
    const box = s.visitor.el;
    const sc = s.screen.getBoundingClientRect();
    const a = box.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 1200));
    const b = box.getBoundingClientRect();
    return { imgs: [...box.querySelectorAll("img")].map((i) => i.getAttribute("src")), flap: box.classList.contains("flap"),
      inside: a.width > 0 && a.left >= sc.left && a.right <= sc.right && a.top >= sc.top && a.bottom <= sc.bottom,
      same: a.left === b.left && a.top === b.top, src: s.pet.getAttribute("src"), text: s.bubble.textContent,
      hop: s.pet.classList.contains("greethop"), drawn: s.drawn };
  });
  check("visitors: reduced motion: one _1 frame, no flap, on screen and still; the greet frame and a line, no hop",
    still.imgs.length === 1 && /_1\.png/.test(still.imgs[0]) && !still.flap && still.inside && still.same && !still.hop &&
    (still.drawn === "child" || /_(cheer|excited|wave)_1/.test(still.src)) && lines.some((l) => still.text.includes(l)), JSON.stringify(still));
  await page.emulateMedia({ reducedMotion: null });
  await page.waitForTimeout(150);
  // A baby (baby talk on for this viewer) says the BABY.visit babble.
  await vprep(V0);
  const babyKey = `hatch-baby-talk-${me}`;
  const baby = await card.evaluate(async (el, { key, ms }) => {
    const s = el._slides[el._index];
    const had = localStorage.getItem(key);
    localStorage.setItem(key, "on");
    const real = el._state;
    el._state = function (slide, k) {
      const st = real.call(this, slide, k);
      return k === "sensor.life_stage" && st ? { ...st, state: "baby" } : st;
    };
    el.__vtick(s);
    await new Promise((r) => setTimeout(r, ms));
    const text = s.bubble.textContent;
    el._state = real;
    if (had === null) localStorage.removeItem(key); else localStorage.setItem(key, had);
    return { text };
  }, { key: babyKey, ms: (V0.in || 1400) + 1300 });
  check("visitors: a baby says baby talk (BABY.visit)", VBABY.some((l) => baby.text.includes(l)), JSON.stringify(baby));
  // Fresh-expand E3 (V-a): a visitor seen here on 3 days is a friend: half its greets are
  // its friend lines (random stubbed to the friend side). At 2, never. Two starts on one
  // day add 1. A new generation's tally starts at 0 (its key carries the generation).
  {
    const FRIENDS = require("vm").runInNewContext(`(${vsrc.match(/\nconst VISIT_FRIENDS = (\{[\s\S]*?\n\});/)[1]})`);
    const friendCase = async (n) => {
      await vprep(V0);
      return card.evaluate(async (el, { id, n, ms }) => {
        const s = el._slides[el._index];
        const key = el._visitFriendKey(s);
        const real = Math.random;
        // Counted already today (so this start adds nothing), at n days.
        localStorage.setItem(key, JSON.stringify({ [id]: { n, day: el._visitDay(s).toDateString() } }));
        Math.random = () => 0.2;
        try {
          el.__vtick(s);
          await new Promise((r) => setTimeout(r, ms));
        } finally {
          Math.random = real;
        }
        const out = { text: s.bubble.textContent, tally: JSON.parse(localStorage.getItem(key) || "{}") };
        el._visitorEnd(s);
        return out;
      }, { id: V0.id, n, ms: (V0.in || 1400) + 1300 });
    };
    const three = await friendCase(3);
    const two = await friendCase(2);
    check(`fresh E3: a visitor seen on 3 days greets as a friend (${V0.id})`,
      FRIENDS[V0.id].some((l) => three.text.includes(l)), JSON.stringify(three));
    check("fresh E3: at 2 days, never a friend line", !FRIENDS[V0.id].some((l) => two.text.includes(l)) && two.text.length > 0,
      JSON.stringify(two));
    const counted = await card.evaluate((el, v) => {
      const s = el._slides[el._index];
      const key = el._visitFriendKey(s);
      localStorage.removeItem(key);
      el._visitFriendCount(s, v);
      el._visitFriendCount(s, v);
      const one = JSON.parse(localStorage.getItem(key) || "{}")[v.id]?.n;
      // A new generation: another key, and the old one gone.
      const real = el._state;
      el._state = function (slide, k) {
        const st = real.call(this, slide, k);
        return k === "sensor.life_stage" && st ? { ...st, attributes: { ...st.attributes, generation: (st.attributes?.generation || 1) + 1 } } : st;
      };
      const next = el._visitFriendKey(s);
      const fresh = el._visitFriends(s)[v.id]?.n || 0;
      el._visitFriendCount(s, v);
      const after = { oldGone: localStorage.getItem(key) === null, nextN: JSON.parse(localStorage.getItem(next) || "{}")[v.id]?.n };
      el._state = real;
      localStorage.removeItem(next);
      return { one, differ: next !== key, fresh, ...after };
    }, V0);
    check("fresh E3: two starts on one day add 1; a new generation reads 0, and its key replaces the old",
      counted.one === 1 && counted.differ && counted.fresh === 0 && counted.oldGone && counted.nextN === 1, JSON.stringify(counted));
  }
  // Fresh-expand F4: the viewer's favourite visitor greets them on their own screen
  // (random stubbed to the fav side), and never on a shared one; the question's buttons
  // are this world's visitors by name, and the answer sent is the visitor's id.
  {
    const favCase = async (shared) => {
      await vprep(V0);
      return card.evaluate(async (el, { id, shared, ms }) => {
        const s = el._slides[el._index];
        const mine = s.mine;
        const real = Math.random;
        s.mine = { ...(mine || {}), fav_visitor: id };
        if (shared) localStorage.setItem("hatch-shared-screen", "on");
        Math.random = () => 0.2;
        try {
          el.__vtick(s);
          await new Promise((r) => setTimeout(r, ms));
        } finally {
          Math.random = real;
          s.mine = mine;
          if (shared) localStorage.setItem("hatch-shared-screen", "off");
        }
        const out = { text: s.bubble.textContent };
        el._visitorEnd(s);
        return out;
      }, { id: V0.id, shared, ms: (V0.in || 1400) + 1300 });
    };
    const own = await favCase(false);
    const onShared = await favCase(true);
    // Either of its two greets: they turn by the day (owner Q3 A).
    const favGreets = [`your favourite, the ${V0.name}! ♥`, `look who it is! your ${V0.name} ♥`];
    check(`fresh F4: the favourite visitor's greet on the viewer's own screen (${V0.id})`,
      favGreets.some((g) => own.text.includes(g)), JSON.stringify(own));
    check("fresh F4: never the favourite greet on a shared screen",
      !favGreets.some((g) => onShared.text.includes(g)) && onShared.text.length > 0, JSON.stringify(onShared));
    const asked = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const realWS = el._hass.callWS;
      const sent = [];
      el._hass.callWS = (m) => { sent.push(m); return Promise.resolve(null); };
      try {
        s.asking = true;
        el._ask(s, "fav_visitor");
        const buttons = [...s.screen.querySelectorAll(".askday button")];
        const labels = buttons.map((b) => b.textContent);
        buttons[0]?.click();
        await new Promise((r) => setTimeout(r, 200));
        return { labels, ids: buttons.map((b) => b.dataset.answer), sent: sent.filter((m) => m.type === "virtual_pet/answer"),
          said: s.bubble.textContent, world: (s.world.visitors || []).map((v) => [v.id, v.name]) };
      } finally {
        el._hass.callWS = realWS;
        s.screen.querySelector(".askday")?.remove();
        s.asking = false;
      }
    });
    const names = asked.world.map(([, n]) => n);
    check("fresh F4: the favourite-visitor buttons are this world's visitors; the answer sent is an id",
      asked.labels.length === asked.world.length && asked.labels.every((l) => names.includes(l)) &&
      asked.sent.length === 1 && asked.sent[0].question === "fav_visitor" && asked.sent[0].answer === asked.ids[0] &&
      asked.said.includes(`the ${asked.labels[0]}! good pick`), JSON.stringify(asked));
  }
  // Fresh-expand E10 (V-b, V-c), card only: on a pinned pair day a friend of the planned
  // visitor comes too (two visitors, a pair line), nothing sent and its friend not counted;
  // on a pinned no-visit guest day a visitor from another world comes in its window, says
  // its home's line, and visitseen isn't written; a dark screen gets only night guests.
  {
    const PAIRS = require("vm").runInNewContext(vsrc.match(/\nconst PAIR_LINES = (\[[^\n]*\]);/)[1]);
    const GUESTS = require("vm").runInNewContext(`(${vsrc.match(/\nconst VISIT_GUEST = (\{[\s\S]*?\n\});/)[1]})`);
    const host = list.find((v) => !v.cross && list.some((x) => x.id !== v.id && x.hours === v.hours && !x.cross));
    if (host) {
      await vprep(host);
      const pair = await card.evaluate(async (el, { ms }) => {
        const s = el._slides[el._index];
        const real = { rare: el._rareDay, svc: el._hass.callService, ws: el._hass.callWS };
        const calls = [];
        el._hass.callService = (...a) => { calls.push(a[1]); return real.svc.apply(el._hass, a); };
        el._hass.callWS = (m) => { calls.push(m?.type); return real.ws.call(el._hass, m); };
        el._rareDay = (sl, kind) => kind === "pair";
        try {
          el.__vtick(s);
          await new Promise((r) => setTimeout(r, ms));
          const out = { vis: [...s.seasonBox.querySelectorAll(".vis")].map((v) => v.dataset.visitor), said: s.bubble.textContent,
            tally: el._visitFriends(s), calls };
          el._visitorEnd(s);
          out.after = s.seasonBox.querySelectorAll(".vis").length;
          return out;
        } finally {
          Object.assign(el, { _rareDay: real.rare });
          Object.assign(el._hass, { callService: real.svc, callWS: real.ws });
        }
      }, { ms: (host.in || 1400) + 1600 });
      check("fresh E10 (V-b): a pair day brings a second visitor of the world and a pair line; both go; nothing sent; only the planned one counted",
        pair.vis.length === 2 && new Set(pair.vis).size === 2 && PAIRS.includes(pair.said) && pair.after === 0 &&
        pair.calls.length === 0 && Object.keys(pair.tally).length === 1, JSON.stringify(pair));
    }
    await vprep(null);
    const guest = await card.evaluate(async (el) => {
      const s = el._slides[el._index];
      const real = { rare: el._rareDay, house: s.house };
      const seenKey = `hatch-visitseen-${s.ids?.device}`;
      const seenBefore = localStorage.getItem(seenKey);
      const out = {};
      el._rareDay = (sl, kind) => kind === "guest";
      const pinnedGuest = el._visitorGuest;
      delete el._visitorGuest; // the real one (hush pins it off)
      s.house = { ...(s.house || {}), visit: null };
      const at = (h) => new Date(new Date().setHours(h, 30, 0, 0));
      try {
        s.screen.classList.remove("night", "dim");
        out.day = el._visitorGuest(s, at(10));
        out.dayLate = el._visitorGuest(s, at(14));
        s.screen.classList.add("night");
        out.night = el._visitorGuest(s, at(20));
        out.nightAtDay = el._visitorGuest(s, at(10));
        s.screen.classList.remove("night");
        s.house = { ...s.house, visit: { id: "x", day: "2026-01-01", from: 0, until: 0 } };
        out.planned = el._visitorGuest(s, at(10));
        s.house = { ...s.house, visit: null };
        if (out.day) {
          el._visitorStart(s, out.day.v, { world: out.day.world, guest: true });
          await new Promise((r) => setTimeout(r, (out.day.v.in || 1400) + 1300));
          out.shown = [...s.seasonBox.querySelectorAll(".vis")].map((v) => v.dataset.visitor);
          out.said = s.bubble.textContent;
          el._visitorEnd(s);
        }
        out.seenSame = localStorage.getItem(seenKey) === seenBefore;
        out.home = s.worldKey;
      } finally {
        el._rareDay = real.rare;
        el._visitorGuest = pinnedGuest;
        s.house = real.house;
        s.screen.classList.remove("night");
      }
      const brief = (g) => g && { id: g.v.id, world: g.world, hours: g.v.hours };
      return { ...out, day: brief(out.day), dayLate: brief(out.dayLate), night: brief(out.night), nightAtDay: brief(out.nightAtDay),
        planned: brief(out.planned) };
    });
    check("fresh E10 (V-c): a no-visit guest day: another world's day visitor 09-12 (none at 14, none on a visit day), its home's line, visitseen untouched",
      guest.day && guest.day.world !== guest.home && guest.day.hours === "day" && !guest.dayLate && !guest.planned &&
      guest.shown?.[0] === `${guest.day.world}/${guest.day.id}` && guest.said === GUESTS[guest.day.world] && guest.seenSame,
      JSON.stringify(guest));
    check("fresh E10 (V-c): a dark screen gets only night guests, 19-22",
      guest.night?.hours === "night" && guest.night.world !== guest.home && !guest.nightAtDay, JSON.stringify(guest));
  }
  // The catch-up (owner, 2026-10-31): today's visitor's window over and the visit
  // never played here, the next first look says "a <name> came by today ♪" once
  // (flavour, last, only with room), using up the day's flag so the visit can't play.
  // _visitorMissed (the window) is stubbed; its clock is walked below and in node.
  await vprep(null);
  const VSTAR = VIS.nightsky.find((v) => v.id === "shootingstar");
  const VDAY = list.find((v) => v.hours !== "night" && !v.cross) || list.find((v) => v.hours !== "night");
  const VNIGHT = Object.values(VIS).flat().find((v) => v.hours === "night");
  const catchUp = await card.evaluate((el, { V0, VSTAR, VDAY, VNIGHT }) => {
    const s = el._slides[el._index];
    const device = s.ids?.device;
    const spent = Object.keys(localStorage).filter((k) => /^hatch-(dream|wish|wishmention|welcomed|seen|upbringing)-/.test(k))
      .map((k) => [k, localStorage.getItem(k)]);
    const real = { missed: el._visitorMissed, heard: el._channelHeard, catchUp: el._catchUp, seenRead: el._seenRead, away: el._awayNote,
      dark: el._screenDark };
    // A dark screen: the catch-up line (a day screen's live visit is checked below).
    el._screenDark = () => true;
    // Room for it: no kept catch-up, away note, dream, wish or upbringing line this look.
    el._catchUp = () => [];
    el._awayNote = () => null;
    const day = new Date().toDateString();
    for (const n of ["dream", "wish"]) localStorage.setItem(`hatch-${n}-${device}-${day}`, "1");
    localStorage.setItem(`hatch-upbringing-${device}`, String(Date.now()));
    const flag = () => Object.keys(localStorage).some((k) => k.startsWith(`hatch-visit-${device}-`));
    const clearFlag = () => { for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-visit-")) localStorage.removeItem(k); };
    const realState = el._state;
    const look = (missed, stage = "adult") => {
      el._state = function (slide, k) { // the line depends on the stage: pin it
        const st = realState.call(this, slide, k);
        return k === "sensor.life_stage" && st ? { ...st, state: stage } : st;
      };
      el._visitorMissed = () => missed;
      el._channelHeard = () => true;
      Object.assign(s, { lookedFirst: false, queue: [], asleep: false, away: false });
      el._firstLook(s);
      const q = s.queue.map((x) => ({ text: x.text, cls: x.cls }));
      el._state = realState;
      s.queue = [];
      return { q, said: q.filter((x) => / came by today [♪♥]$| went by! ♪$|^hi hi! ♪$/.test(x.text)), flag: flag() };
    };
    const out = {};
    try {
      clearFlag();
      out.before = look(null); // the window not over yet (or no visit today)
      clearFlag();
      out.first = look(V0);
      clearFlag();
      // Baby talk on for this viewer: "hi hi! ♪"; off (the default): the normal line.
      const talkKey = `hatch-baby-talk-${el._hass.user.id}`;
      const talkWas = localStorage.getItem(talkKey);
      try {
        localStorage.setItem(talkKey, "on");
        out.baby = look(V0, "baby");
        clearFlag();
        localStorage.setItem(talkKey, "off");
        out.babyOff = look(V0, "baby");
      } finally {
        if (talkWas === null) localStorage.removeItem(talkKey); else localStorage.setItem(talkKey, talkWas);
      }
      clearFlag();
      out.first = look(V0);
      out.twice = look(V0);
      // A visit tried with V0 due, the pet free and shown a minute (the same for both
      // cases below): it can't also play after the catch-up; with no flag it does.
      const tryVisit = () => {
        Object.assign(s, { poseUntil: 0, sayUntil: 0, sayClass: 0, visitUntil: 0, flairUntil: 0, queue: [], nextVisitCheck: 0 });
        el._visitShown = { s, at: Date.now() - 60000 };
        el.__vdue = V0;
        try { el._visitorTick(s); } finally { el.__vdue = null; }
        const on = !!s.visitor;
        el._visitorEnd(s);
        Object.assign(s, { poseUntil: 0, sayUntil: 0, visitUntil: 0, flairUntil: 0, queue: [] });
        return on;
      };
      out.playedAfter = tryVisit();
      // The visit played on this device today: no catch-up.
      clearFlag();
      out.played = tryVisit();
      out.afterVisit = look(V0);
      // The shooting star's own line.
      clearFlag();
      out.star = look(VSTAR);
      // Opp #4: their favourite, in its own line; never on a shared screen.
      const mineWas = s.mine;
      const sharedWas = localStorage.getItem("hatch-shared-screen");
      try {
        s.mine = { ...(mineWas || {}), fav_visitor: V0.id };
        clearFlag();
        out.fav = look(V0);
        localStorage.setItem("hatch-shared-screen", "on");
        clearFlag();
        out.favShared = look(V0);
      } finally {
        s.mine = mineWas;
        if (sharedWas === null) localStorage.removeItem("hatch-shared-screen"); else localStorage.setItem("hatch-shared-screen", sharedWas);
      }
      // No room: three kept catch-up lines fill the first look; the flag stays unused.
      clearFlag();
      el._seenRead = function (d) { return { ...(real.seenRead.call(this, d) || {}), said: 0 }; };
      el._catchUp = () => [["kept one", "2026-01-01T00:00:00Z"], ["kept two", "2026-01-01T00:00:01Z"], ["kept three", "2026-01-01T00:00:02Z"]];
      out.full = look(V0);
      // Fresh-moment 3 (owner Q3, Q7): on a day screen a missed day visitor isn't told at
      // the first look; it comes by live (nothing due), once; a night visitor stays a line.
      el._seenRead = real.seenRead; el._catchUp = () => [];
      el._screenDark = () => false;
      el.__late = true;
      clearFlag();
      out.dayLook = look(VDAY);
      const late = () => {
        Object.assign(s, { poseUntil: 0, sayUntil: 0, sayClass: 0, visitUntil: 0, flairUntil: 0, queue: [], nextVisitCheck: 0 });
        el._visitShown = { s, at: Date.now() - 60000 };
        el._visitorMissed = () => VDAY;
        el._visitorTick(s);
        const id = s.visitor?.v.id || null;
        el._visitorEnd(s);
        Object.assign(s, { poseUntil: 0, sayUntil: 0, visitUntil: 0, flairUntil: 0, queue: [] });
        return { id, flag: flag() };
      };
      out.dayLive = late();
      out.dayAgain = late();
      out.dayLookAfter = look(VDAY);
      clearFlag();
      out.dayNight = look(VNIGHT);
      el._screenDark = () => true;
      clearFlag();
      out.darkLive = late();
      out.darkLook = look(VDAY);
      // It comes right after the look's first line, the rest still queued (review s2622 #7).
      el._screenDark = () => false;
      clearFlag();
      look(VDAY);
      out.dayPending = !!s.lateVisit;
      el._visitorMissed = () => VDAY;
      Object.assign(s, { visitor: null, poseUntil: 0, flairUntil: 0, movingUntil: 0, sayUntil: Date.now() + 3000,
        queue: [{ text: "one", ms: 5000, cls: 3 }, { text: "two", ms: 5000, cls: 3 }] });
      s.lateVisit = { left: 1, made: Date.now() };
      el._visitorTick(s);
      const early = !!s.visitor; // two lines waiting: not yet
      s.queue.shift();
      el._visitorTick(s);
      const during = !!s.visitor; // the first line still on show
      s.lateVisit.after = Date.now() - 1;
      s.sayUntil = 0;
      el._visitorTick(s);
      out.firstLine = { early, during, after: s.visitor?.v.id || null, queued: s.queue.length };
      el._visitorEnd(s);
      Object.assign(s, { queue: [], lateVisit: null, poseUntil: 0, flairUntil: 0, visitUntil: 0 });
    } finally {
      el.__late = false;
      el._visitorMissed = real.missed; el._channelHeard = real.heard; el._catchUp = real.catchUp; el._seenRead = real.seenRead;
      el._awayNote = real.away; el._screenDark = real.dark;
      for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish|wishmention|welcomed|seen|upbringing)-/.test(k)) localStorage.removeItem(k);
      for (const [k, v] of spent) localStorage.setItem(k, v);
      Object.assign(s, { lookedFirst: true, queue: [], sayUntil: 0 });
      clearFlag();
    }
    return out;
  }, { V0, VSTAR, VDAY, VNIGHT });
  const cu = catchUp;
  check("fresh-moment 3: a missed day visitor on a day screen: no line, it comes by live once, and no line after",
    cu.dayLook.said.length === 0 && !cu.dayLook.flag && cu.dayLive.id === VDAY.id && cu.dayLive.flag &&
      cu.dayAgain.id === null && cu.dayLookAfter.said.length === 0,
    JSON.stringify({ dayLook: cu.dayLook, dayLive: cu.dayLive, dayAgain: cu.dayAgain, after: cu.dayLookAfter }));
  check("fresh-moment 3: the missed visitor comes right after the look's first line, the rest still queued",
    cu.dayPending && !cu.firstLine.early && !cu.firstLine.during && cu.firstLine.after === VDAY.id && cu.firstLine.queued === 1,
    JSON.stringify({ pending: cu.dayPending, firstLine: cu.firstLine }));
  check("fresh-moment 3: a dark screen keeps the line, no late visit (Q7); a night visitor stays a line",
    cu.darkLive.id === null && !cu.darkLive.flag && cu.darkLook.said.length === 1 && cu.dayNight.said.length === 1,
    JSON.stringify({ darkLive: cu.darkLive, darkLook: cu.darkLook, dayNight: cu.dayNight }));
  check("visitors: catch-up: nothing said before the window ends; the day's flag unused",
    cu.before.said.length === 0 && !cu.before.flag, JSON.stringify(cu.before));
  check(`visitors: catch-up: after the window, "a ${V0.name} came by today ♪" once, flavour, last; the flag used`,
    cu.first.said.length === 1 && cu.first.said[0].text === `a ${V0.name} came by today ♪` && cu.first.said[0].cls === 1 &&
    cu.first.q[cu.first.q.length - 1].text === cu.first.said[0].text && cu.first.flag, JSON.stringify(cu.first));
  check("visitors: catch-up: a baby says \"hi hi! ♪\" instead, once, flavour",
    cu.baby.said.length === 1 && cu.baby.said[0].text === "hi hi! ♪" && cu.baby.said[0].cls === 1, JSON.stringify(cu.baby));
  check("visitors: catch-up: a baby with baby talk off gets the normal line",
    cu.babyOff.said.length === 1 && cu.babyOff.said[0].text === `a ${V0.name} came by today ♪`, JSON.stringify(cu.babyOff));
  check("visitors: catch-up: never twice, and the visit can't also play after it",
    cu.twice.said.length === 0 && !cu.playedAfter, JSON.stringify({ twice: cu.twice, playedAfter: cu.playedAfter }));
  check("visitors: catch-up: none if the visit played on this device today",
    cu.played && cu.afterVisit.said.length === 0, JSON.stringify({ played: cu.played, afterVisit: cu.afterVisit }));
  check("owner Q3 opp #4: their favourite's missed visit is its own line on their screen; a shared screen says the usual",
    cu.fav.said.length === 1 && cu.fav.said[0].text === `your ${V0.name} came by today ♥` &&
      cu.favShared.said.every((x) => !x.text.startsWith("your ")), JSON.stringify({ fav: cu.fav, shared: cu.favShared }));
  check("visitors: catch-up: the shooting star says \"a shooting star went by! ♪\"",
    cu.star.said.length === 1 && cu.star.said[0].text === "a shooting star went by! ♪", JSON.stringify(cu.star));
  check("visitors: catch-up: no room after three kept lines, nothing pushed out, the flag unused",
    cu.full.said.length === 0 && cu.full.q.length === 3 && cu.full.q.every((x) => /^kept /.test(x.text)) && !cu.full.flag,
    JSON.stringify(cu.full));
  // v2 (docs/plan-2026-11-01-visitors-v2.md §1): the server picks the day's visit and
  // the card plays house.visit. The real channel's plan: always a key (null on a day
  // with no visit, so the card doesn't fall back), a visitor of this world, 3 hours.
  const served = await card.evaluate((el) => {
    const s = el._slides[el._index];
    return { has: !!s.house && "visit" in s.house, visit: s.house?.visit ?? null, world: s.worldKey };
  });
  const servedIds = (VIS[served.world] || []).map((v) => v.id);
  check("visitors: the channel carries house.visit, the server's plan (null on a no-visit day)",
    served.has && (served.visit === null || (servedIds.includes(served.visit.id) &&
      served.visit.until - served.visit.from === 10800 && /^\d{4}-\d{2}-\d{2}$/.test(served.visit.day))),
    JSON.stringify(served));
  // A plan pinned for V0 (window: an hour ago to two hours on): due exactly inside it,
  // on its kind of screen, by the server's clock; told missed once it's over; an id
  // this world hasn't, or a no-visit day (null), plays nothing and never falls back.
  const planned = await card.evaluate((el, V0) => {
    const s = el._slides[el._index];
    const had = s.house;
    const was = [s.screen.classList.contains("night"), s.screen.classList.contains("dim")];
    const kind = (night) => { s.screen.classList.toggle("night", night); s.screen.classList.remove("dim"); };
    const now = Math.floor(Date.now() / 1000);
    const plan = { day: "2026-03-14", id: V0.id, hours: V0.hours, from: now - 3600, until: now + 7200 };
    const due = (t) => el.__realDue.call(el, s, new Date(t * 1000))?.id || null;
    const missed = (t) => el._visitorMissed(s, new Date(t * 1000))?.id || null;
    const out = {};
    try {
      s.house = { ...(had || {}), visit: plan };
      kind(V0.hours === "night");
      Object.assign(out, { before: due(plan.from - 1), start: due(plan.from), last: due(plan.until - 1),
        after: due(plan.until), now: el.__realDue.call(el, s)?.id || null,
        missedIn: missed(now), missedAfter: missed(plan.until), flagDay: el._visitDay(s).toDateString() });
      kind(V0.hours !== "night");
      out.otherScreen = due(now);
      kind(V0.hours === "night");
      s.house = { ...(had || {}), visit: { ...plan, id: "nobody" } };
      out.unknown = due(now);
      // No visit today: 14 days x 24 hours, on either screen, nothing due or missed
      // (v1's pick alone would give 8 visit days).
      s.house = { ...(had || {}), visit: null };
      const hits = [];
      const base = new Date();
      for (let d = 0; d < 14; d++) {
        for (let h = 0; h < 24; h++) {
          kind(h >= 19 || h < 7);
          const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, h, 30);
          if (el.__realDue.call(el, s, at) || el._visitorMissed(s, at)) hits.push(`${d}/${h}`);
        }
      }
      out.noVisitHits = hits;
    } finally {
      s.house = had;
      s.screen.classList.toggle("night", was[0]);
      s.screen.classList.toggle("dim", was[1]);
    }
    return out;
  }, V0);
  check("visitors: the card plays the server's window (from <= now < until, by the server's clock), on its kind of screen",
    planned.before === null && planned.start === V0.id && planned.last === V0.id && planned.after === null &&
    planned.now === V0.id && planned.otherScreen === null && planned.unknown === null, JSON.stringify(planned));
  check("visitors: the server's visit is told missed only once its window is over",
    planned.missedIn === null && planned.missedAfter === V0.id, JSON.stringify(planned));
  check("visitors: the day's flag is keyed by house.visit.day (finding #22)",
    planned.flagDay === new Date(2026, 2, 14).toDateString(), JSON.stringify(planned));
  check("visitors: a no-visit day from the server plays nothing and never falls back to v1's pick",
    planned.noVisitHits.length === 0, JSON.stringify(planned.noVisitHits));
  // Two cards, the second in another time zone (one whose date differs from HA's now),
  // agree on the plan and the flag's day; then that browser crosses its own midnight
  // inside the same HA day, and the visit doesn't play twice (finding #22). v1's key
  // (the browser's date) would let it play again: shown last, with no house.visit.
  {
    const haTz = await card.evaluate((el) => el._hass.config.time_zone);
    const dayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const haDay = dayIn(haTz);
    const tz = ["Pacific/Kiritimati", "Pacific/Pago_Pago"].find((z) => dayIn(z) !== haDay);
    const petId = await card.evaluate((el) => el._slides[el._index].ids?.["sensor.life_stage"]);
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, storageState: await context.storageState(), timezoneId: tz });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("hatch-lcd", "off");
        localStorage.setItem("hatch-shared-screen", "off");
      } catch (err) {
        // no storage
      }
    });
    const p2 = await ctx.newPage();
    p2.on("pageerror", (e) => errors.push(`visitors tz tab: ${e}`));
    const out = { tz, haTz, haDay };
    try {
      await p2.clock.install(); // the time runs as usual; setSystemTime jumps it below
      await p2.goto(`${HA}/pet-bench/pet`);
      if (await p2.waitForSelector('input[autocomplete="username"]', { timeout: 8000 }).catch(() => null)) {
        await p2.locator('input[autocomplete="username"]').first().fill(USER.username);
        await p2.locator('input[type="password"]').first().fill(USER.password);
        await p2.keyboard.press("Enter");
      }
      await p2.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
      await settle(p2);
      await p2.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
      const el2 = p2.locator("hatch-pet-card").first();
      const slides2 = await p2.locator("hatch-pet-card .slide").count();
      for (let i = 0; i < slides2; i++) {
        if (await el2.evaluate((c, e) => c._slides?.[c._index]?.ids?.["sensor.life_stage"] === e, petId)) break;
        await p2.locator("hatch-pet-card .nav.next").click();
        await p2.waitForTimeout(700);
      }
      const view = (el) => el.evaluate(async (c) => {
        const s = c._slides[c._index];
        for (let i = 0; i < 100 && !(s.house && "visit" in s.house); i++) await new Promise((r) => setTimeout(r, 100));
        return { visit: s.house?.visit ?? null, flagDay: c._visitDay(s).toDateString(), browserDay: new Date().toDateString() };
      });
      out.a = await view(card);
      out.b = await view(el2);
      // The crossing, on the second card: a plan for HA's today, inside its window.
      const tryVisit = (step) => el2.evaluate((el, { V0, haDay, step }) => {
        const s = el._slides[el._index];
        const now = Math.floor(Date.now() / 1000);
        if (step === "plan") s.house = { ...(s.house || {}), visit: { day: haDay, id: V0.id, hours: V0.hours, from: now - 3600, until: now + 7200 } };
        if (step === "clear") for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-visit-")) localStorage.removeItem(k);
        if (step === "fallback") { const { visit, ...rest } = s.house || {}; s.house = rest; }
        el._visitorEnd(s);
        Object.assign(s, { poseUntil: 0, propUntil: 0, movingUntil: 0, flairUntil: 0, visitUntil: 0, queue: [], sayUntil: 0,
          sayClass: 0, game: null, scene: null, power: null, linking: false, calling: false, asleep: false, away: false,
          lookedFirst: true, nextVisitCheck: 0, patAt: 0, poseFrames: [], moodState: "content" });
        s.screen.classList.remove("show-status");
        el._booting = false;
        el._link = null;
        el._visitShown = { s, at: Date.now() - 60000 };
        el._linkEndedAt = undefined;
        const real = el._visitorDue;
        el._visitorDue = () => V0;
        try { el._visitorTick(s); } finally { el._visitorDue = real; }
        const on = !!s.visitor;
        el._visitorEnd(s);
        Object.assign(s, { poseUntil: 0, sayUntil: 0, visitUntil: 0, flairUntil: 0, queue: [] });
        return { on, browserDay: new Date().toDateString(), keys: Object.keys(localStorage).filter((k) => k.startsWith("hatch-visit-")) };
      }, { V0, haDay, step });
      await tryVisit("plan");
      out.first = await tryVisit("clear");
      out.again = await tryVisit("none");
      const midnight = await p2.evaluate(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 1).getTime(); });
      await p2.clock.setSystemTime(midnight);
      out.crossed = await tryVisit("none");
      out.v1 = await tryVisit("fallback");
    } catch (err) {
      out.error = String(err);
    } finally {
      await ctx.close();
    }
    check(`visitors: two cards, one in ${tz}, get the same house.visit and key its flag by HA's day`,
      !out.error && !!tz && JSON.stringify(out.a.visit) === JSON.stringify(out.b.visit) &&
      (out.a.visit === null || (out.a.flagDay === out.b.flagDay && out.b.flagDay !== out.b.browserDay)), JSON.stringify(out));
    const haKey = (() => { const [y, m, d] = haDay.split("-").map(Number); return new Date(y, m - 1, d).toDateString(); })();
    check("visitors: crossing the browser's own midnight inside one HA day, the visit plays once (flag keyed by house.visit.day)",
      !out.error && out.first.on && !out.again.on && !out.crossed.on && out.crossed.browserDay !== out.first.browserDay &&
      out.crossed.keys.length === 1 && out.crossed.keys[0].endsWith(haKey), JSON.stringify(out));
    // Only meaningful when the browser's new day differs from HA's day: run near HA's midnight
    // (CI at about 07:00 UTC), the browser's next day can be HA's day, and v1's key is then the same key.
    check("visitors: (v1's key, with no house.visit, would have played it again past the browser's midnight)",
      !out.error && (out.v1.on || out.v1.browserDay === haKey), JSON.stringify(out.v1 || out));
  }
  // v1's fallback (no house.visit: an older server, the bench) over 14 days x 24 hours:
  // 8 visit days, each with one 3-hour window on the matching screen (night 19-23 for a
  // night visitor, day 09-18 else).
  const walk = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const had = s.house;
    if (had) { const { visit, ...rest } = had; s.house = rest; }
    const was = [s.screen.classList.contains("night"), s.screen.classList.contains("dim")];
    const days = [];
    const now = new Date();
    for (let d = 0; d < 14; d++) {
      const hours = [];
      const missed = [];
      let id = null;
      for (let h = 0; h < 24; h++) {
        s.screen.classList.toggle("night", h >= 19 || h < 7);
        s.screen.classList.remove("dim");
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, 30);
        const v = el.__realDue.call(el, s, at);
        if (v) { hours.push(h); id = `${v.id}/${v.hours}`; }
        if (el._visitorMissed(s, at)) missed.push(h);
      }
      days.push({ hours, id, missed });
    }
    s.house = had;
    s.screen.classList.toggle("night", was[0]);
    s.screen.classList.toggle("dim", was[1]);
    return days;
  });
  const vdays = walk.filter((d) => d.hours.length);
  const okHours = vdays.every((d) => d.hours.length === 3 && d.hours[2] - d.hours[0] === 2 &&
    (d.id.endsWith("/night") ? d.hours[0] >= 19 && d.hours[2] <= 22 : d.hours[0] >= 9 && d.hours[2] <= 17));
  check("visitors: v1's fallback: over 14 days, 8 visit days, each one 3-hour window in its visitor's hours",
    vdays.length === 8 && okHours, JSON.stringify(walk));
  // The catch-up's window: from the hour after the last due hour to midnight, never before.
  check("visitors: v1's fallback: catch-up comes only once the day's window is over (none on other days)",
    walk.every((d) => d.hours.length ? d.missed.length === 23 - d.hours[2] && d.missed[0] === d.hours[2] + 1 : !d.missed.length),
    JSON.stringify(walk.map((d) => [d.hours, d.missed])));
  // v1's pick is for a true old server only (the channel up, no visit key). With the
  // channel failed or not up yet (HA starting or reloading), nothing is due or told
  // missed, so the day's flag is left for the server's visit (V-A audit #3).
  const noChannel = await card.evaluate((el) => {
    const s = el._slides[el._index];
    const was = { house: s.house, subscribed: s.subscribed, subscribeFailed: s.subscribeFailed,
      night: s.screen.classList.contains("night"), dim: s.screen.classList.contains("dim") };
    const hits = [];
    try {
      const now = new Date();
      for (const [house, failed] of [[null, true], [{}, true], [null, false]]) {
        Object.assign(s, { house, subscribed: false, subscribeFailed: failed });
        for (let d = 0; d < 14; d++) {
          for (let h = 0; h < 24; h++) {
            s.screen.classList.toggle("night", h >= 19 || h < 7);
            s.screen.classList.remove("dim");
            const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, 30);
            if (el.__realDue.call(el, s, at) || el._visitorMissed(s, at)) hits.push(`${failed}/${d}/${h}`);
          }
        }
      }
    } finally {
      Object.assign(s, { house: was.house, subscribed: was.subscribed, subscribeFailed: was.subscribeFailed });
      s.screen.classList.toggle("night", was.night);
      s.screen.classList.toggle("dim", was.dim);
    }
    return hits;
  });
  check("visitors: with no channel (failed or not up yet) nothing plays or is told missed: no v1 pick",
    noChannel.length === 0, JSON.stringify(noChannel.slice(0, 10)));
  // Every visitor's frames load.
  const frames = await card.evaluate(async (el, all) => {
    const base = el._slides[el._index].pet.src.replace(/\/sprites\/.*$/, "/ui/");
    const bad = [];
    await Promise.all(all.map((n) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => { if (!img.naturalWidth) bad.push(n); ok(); };
      img.onerror = () => { bad.push(n); ok(); };
      img.src = `${base}${n}.png`;
    })));
    return bad;
  }, Object.entries(VIS).flatMap(([w, l]) => l.flatMap((v) => [1, 2].map((n) => `visitor_${w}_${v.id}_${n}`))));
  check("visitors: all 36 visitor frames load", frames.length === 0, frames.join(", "));
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    el._visitorEnd(s);
    if (el.__realDue) { el._visitorDue = el.__realDue; delete el.__realDue; }
    if (el.__realLate) { el._visitorLate = el.__realLate; delete el.__realLate; delete el.__late; }
    Object.assign(s, { poseUntil: 0, sayUntil: 0, visitUntil: 0, flairUntil: 0, queue: [] });
  });
  await holdVisits();
  await unpinAwake(card);
  }
  if (enter("winter")) {
  // Winter lights (docs/plan-2026-10-31-winter-lights.md): 1-31 December after
  // Thanksgiving, card only. The scene and its night glow (the float's bob kept),
  // every hat seated, the walking snow hare (a world visitor waits after it), the
  // cookie, the treat day's own line, Hanukkah from the browser's Hebrew calendar,
  // and the "holiday names" row in "this screen": off, no festival name anywhere.
  await calm();
  await page.waitForTimeout(400);
  await pinAwake(card, "winter");
  const wDates = await card.evaluate((el) => {
    const C = el.constructor;
    const at = (y, m, d) => C.seasonNow({}, new Date(y, m - 1, d, 12))?.key || "-";
    const winter = C.seasons.find((x) => x.key === "winter");
    return {
      keys: [at(2026, 11, 30), at(2026, 12, 1), at(2026, 12, 31), at(2027, 1, 1), at(2024, 12, 1), at(2030, 12, 1)].join(" "),
      hanukkah: [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032].map((y) => C.hanukkah(y)?.join("/")).join(" "),
      christmas: [24, 25].map((d) => C.seasonLines(winter, new Date(2026, 11, d, 12), true).dated.join("/")).join(" | "),
    };
  });
  check("winter: 1-31 December, Thanksgiving keeps 1 Dec in the years it reaches it",
    wDates.keys === "- winter winter - thanksgiving thanksgiving", wDates.keys);
  check("winter: Hanukkah from the browser's Hebrew calendar, 2025-2032",
    wDates.hanukkah === "12/15 12/5 12/25 12/13 12/2 12/21 12/10 11/28" &&
      wDates.christmas === "Christmas Eve! ♪/merry Christmas! ♥ | merry Christmas! ♥", JSON.stringify(wDates)); // no Eve on the day
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: "winter" }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  const lights = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "winter");
    s.nextVisitor = s.nextFlyer = s.nextCostume = Date.now() + 600000; // only what this check sends
    s.screen.querySelector(".costume")?.remove();
    // Every piece loads (stand-ins until the final art swaps the files).
    const names = [...season.lanterns, season.corner, season.sweet, season.snack, "bunting", "deco",
      ...season.flyer.art, ...season.visitor.art, ...season.costumes.map((c) => c.art)];
    const missing = [];
    await Promise.all(names.map((n) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res();
      img.onerror = () => { missing.push(n); res(); };
      img.src = s.seasonBox.querySelector(".lantern").src.replace(/season_winter_[^/?]+\.png/, `season_winter_${n}.png`);
    })));
    // The night glow: a drop-shadow on the lamp; a floating lamp keeps its bob.
    const lamp = s.seasonBox.querySelector(".lantern");
    const wasNight = s.screen.classList.contains("night");
    s.screen.classList.add("night");
    const plain = getComputedStyle(lamp);
    const glow = { filter: plain.filter, anim: plain.animationName };
    const floated = lamp.classList.contains("lantern-float");
    lamp.classList.add("lantern-float");
    const bob = getComputedStyle(lamp).animationName;
    if (!floated) lamp.classList.remove("lantern-float");
    if (!wasNight) s.screen.classList.remove("night");
    // Every hat on the head, skip lists aside.
    const [hx, hy] = s.species.hat?.[s.drawn] || s.species.head[s.drawn];
    el._headTopAll(s, hx, hy);
    await new Promise((r) => setTimeout(r, 600));
    const top = el._hatSeat(s)?.top ?? null;
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    const headTop = r.top - sr.top + top * (r.height / 256);
    const seats = [];
    for (const costume of season.costumes) {
      s.sayUntil = 0; s.flairUntil = 0; s.movingUntil = 0;
      el._costume(s, { ...season, costumes: [{ ...costume, skip: [] }] }, costume.art);
      await new Promise((res) => setTimeout(res, 700));
      const img = s.screen.querySelector(".costume .hat img");
      seats.push(`${costume.art} ${Math.round(img.getBoundingClientRect().bottom - sr.top - headTop)}${img.naturalWidth ? "" : " (no art)"}`);
    }
    return {
      pieces: [...new Set([...s.seasonBox.querySelectorAll("img, div")].map((i) => i.className.split(" ")[0]))].join(" "),
      inSeason: s.screen.classList.contains("s-winter"), missing, glow, bob, seats,
    };
  });
  check("winter dresses the scene and every piece loads",
    lights.inSeason && /lantern/.test(lights.pieces) && /corner/.test(lights.pieces) && /bunting/.test(lights.pieces) &&
      lights.missing.length === 0, `${lights.pieces}; missing ${lights.missing.join(", ")}`);
  check("winter: the lamp glows at night, and a floating lamp still bobs",
    /drop-shadow/.test(lights.glow.filter) && /s-shine/.test(lights.glow.anim) && /s-shine/.test(lights.bob) && /s-bob/.test(lights.bob),
    JSON.stringify({ glow: lights.glow, bob: lights.bob }));
  check("every winter costume sits on the head",
    lights.seats.every((x) => { const d = Number(x.split(" ")[1]); return d > 0 && d < 20 && !/no art/.test(x); }),
    lights.seats.join(", "));
  await shot("05-winter");
  const hare = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "winter");
    s.screen.querySelector(".costume")?.remove();
    s.sayUntil = 0; s.flairUntil = 0; s.nextVisitCheck = 0;
    el._seasonVisitor(s, season);
    const gap = s.nextVisitCheck - s.flairUntil;
    await new Promise((r) => setTimeout(r, 1800));
    const walker = !!s.seasonBox.querySelector(".snowhare.walk.flap");
    const startle = s.bubble.textContent;
    await new Promise((r) => setTimeout(r, 1900));
    const greet = s.bubble.textContent;
    el._react(s, { action: "snack", result: "ok", at: Date.now() / 1000 });
    return { walker, startle, greet, gap, prop: s.prop.getAttribute("src") || "" };
  });
  check("winter: a snow hare walks by; the pet says oh!, then hi", hare.walker && hare.startle === "oh!" &&
    hare.greet === "hi, little hare!", JSON.stringify(hare));
  check("winter: a world visitor waits VISIT_AFTER_MS after the hare", hare.gap >= 120000, String(hare.gap));
  // A kept line arriving while the hare passes outranks its oh! and hi (flavour):
  // both are skipped, the kept line holds the bubble throughout. The status opened
  // mid-walk (as a game would, _visitorLive) ends the visit at its next beat: the
  // hare gone, nothing said.
  const hareKept = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "winter");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(4500); // the last hare's walk is over
    Object.assign(s, { sayUntil: 0, flairUntil: 0, visitUntil: 0, nextVisitCheck: 0, queue: [] });
    el._seasonVisitor(s, season);
    await wait(500);
    el._line(s, 3, "kept line through the hare", 6000);
    const said = () => `${s.sayEntry?.text}|${s.bubble.textContent}`; // the held line, and what's typed so far
    await wait(1400); // past oh! (1.4 s)
    const atStartle = said();
    await wait(2100); // past hi (3.4 s)
    const atGreet = said();
    await wait(2500); // the kept line is over
    Object.assign(s, { sayUntil: 0, flairUntil: 0, visitUntil: 0, nextVisitCheck: 0, queue: [] });
    s.bubble.textContent = "";
    el._seasonVisitor(s, season);
    s.screen.classList.add("show-status");
    await wait(1700);
    const inGame = { text: s.bubble.textContent, hare: !!s.seasonBox.querySelector(".snowhare"), on: !!s.seasonVisit };
    s.screen.classList.remove("show-status");
    return { atStartle, atGreet, inGame };
  });
  check("winter: a kept line during the hare's walk survives",
    [hareKept.atStartle, hareKept.atGreet].every((x) => x.startsWith("kept line through the hare|") && !/oh!|little hare!/.test(x)),
    JSON.stringify(hareKept));
  check("winter: the status opened mid-walk ends the hare's visit, no oh!",
    !hareKept.inGame.text.includes("oh!") && !hareKept.inGame.hare && !hareKept.inGame.on, JSON.stringify(hareKept.inGame));
  check("snacks are cookies in winter", /season_winter_cookie/.test(hare.prop), hare.prop.split("/").pop());
  await shot("05-winter-hare");
  const treat = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const season = el.constructor.seasons.find((x) => x.key === "winter");
    Object.assign(s, { sayUntil: 0, flairUntil: 0, movingUntil: 0, visitUntil: 0 });
    el._costume(s, season, season.treatLine);
    const first = s.bubble.textContent;
    el._seasonTreat(s, season);
    return [first, s.bubble.textContent];
  });
  check("winter's treat day: its own line and no thank-you", treat.join(" | ") === "so many lights! ♥ | a little treat ♪",
    treat.join(" | "));
  // Holiday names: the row in "this screen", on by default; off hides festival names.
  const named = () => card.evaluate((el) => {
    const s = el._slides[el._index];
    const bell = s.status.querySelector(".bell.named");
    const secs = [...s.status.querySelectorAll(".sec, .row")];
    const screenAt = secs.findIndex((n) => n.classList.contains("sec") && n.textContent === "this screen");
    const rowAt = secs.findIndex((n) => n.contains(bell));
    const C = el.constructor;
    const winter = C.seasons.find((x) => x.key === "winter");
    // The card's own pool on a named day, and Halloween's costume lines from the tick.
    const pool = C.seasonLines(winter, new Date(2026, 11, 25, 12));
    const said = new Set();
    const keep = [el._costume, el._seasonVisitor, el._seasonFlyer, el._config, s.counted];
    el._costume = (slide, season, line) => said.add(line);
    el._seasonVisitor = el._seasonFlyer = () => {};
    el._config = { ...el._config, seasonal: "halloween" };
    s.counted = true;
    const mood = s.moodState;
    s.screen.classList.remove("show-status"); // the sheet holds every tick: lift it meanwhile
    Object.assign(s, { moodState: "content", poseUntil: 0, propUntil: 0, movingUntil: 0 });
    try {
      localStorage.setItem(`hatch-costume-halloween-${s.ids?.device}-${new Date().toDateString()}`, "1");
      for (let i = 0; i < 40; i++) { s.nextCostume = 1; s.sayUntil = 0; s.flairUntil = 0; el._seasonTick(s); }
    } finally {
      [el._costume, el._seasonVisitor, el._seasonFlyer, el._config, s.counted] = keep;
      s.moodState = mood;
      s.screen.classList.add("show-status");
    }
    s.queue = [];
    el._note(s, { kind: "season", season: "autumn", holiday: "thanksgiving" });
    const note = s.queue.map((x) => x.text).join("");
    s.queue = [];
    return {
      row: bell && { text: bell.textContent, pressed: bell.getAttribute("aria-pressed"), label: bell.getAttribute("aria-label"),
        label2: bell.closest(".row")?.textContent.replace(/\s+/g, " ").trim() },
      inScreen: screenAt >= 0 && rowAt > screenAt, stored: localStorage.getItem("hatch-named-holidays"),
      dated: pool.dated.length, lines: pool.lines.join("|"), said: [...said], note,
    };
  });
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    localStorage.removeItem("hatch-named-holidays");
    if (!s.screen.classList.contains("show-status")) el._toggleStatus(s);
  });
  await page.waitForTimeout(300);
  if (!await cur().locator(".status .sback").count()) await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  await cur().locator(".bell.named").scrollIntoViewIfNeeded();
  const onRow = await named();
  check("holiday names: a row in this screen, on by default", onRow.row?.pressed === "true" && onRow.row?.text === "on" &&
    onRow.row?.label === "holiday names" && onRow.inScreen && onRow.stored === null && onRow.dated === 1 &&
    /Thanksgiving in your favourite season/.test(onRow.note), JSON.stringify(onRow));
  await shot("05-winter-names-on");
  await cur().locator(".bell.named").click();
  await page.waitForTimeout(300);
  const offRow = await named();
  check("holiday names off: kept as off for this browser", offRow.row?.pressed === "false" && offRow.row?.text === "off" &&
    offRow.stored === "off", JSON.stringify(offRow.row));
  check("holiday names off: no dated line, no Halloween or Thanksgiving by name; generic lines stay",
    offRow.dated === 0 && offRow.lines.includes("happy holidays! ♥") && offRow.said.length > 0 &&
      !offRow.said.some((x) => /Halloween|Thanksgiving|Christmas|Hanukkah/.test(x)) &&
      /^it's autumn, your favourite!/.test(offRow.note), JSON.stringify(offRow));
  await cur().locator(".bell.named").scrollIntoViewIfNeeded();
  await shot("05-winter-names-off");
  await cur().locator(".bell.named").click();
  await page.waitForTimeout(300);
  check("holiday names on again: nothing kept", await evaluate(() => localStorage.getItem("hatch-named-holidays")) === null);
  await card.evaluate((el) => {
    const s = el._slides[el._index];
    localStorage.removeItem("hatch-named-holidays");
    s.settings = false;
    if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
    s.screen.querySelector(".costume")?.remove();
    Object.assign(s, { poseUntil: 0, sayUntil: 0, visitUntil: 0, flairUntil: 0, nextVisitCheck: 0, queue: [] });
    el.setConfig({ ...el._config, seasonal: false }); el.hass = el._hass;
  });
  await page.waitForTimeout(600);
  check("winter: seasonal: false takes it away again",
    await card.evaluate((el) => el._slides[el._index].seasonBox.children.length === 0));
  await unpinAwake(card);
  }
  if (enter("care")) {
  // Care scenes: medicine and clean play out (about 2 s) before the screen shows
  // the news. No call reaches the server here: each check plays its answer.
  {
    const card = page.locator("hatch-pet-card");
    await card.evaluate((el) => {
      el.__calls = [];
      el._call = function (button, s, domain, service, entityId) {
        this._tapped(button, s);
        this.__calls.push(entityId);
      };
      el.__ends = [];
      const end = el._sceneEnd;
      el._sceneEnd = function (s, opts) {
        if (s.scene) this.__ends.push({ kind: s.scene.kind, at: performance.now() - s.scene.start });
        return end.call(this, s, opts);
      };
    });
    const now = () => new Date().toISOString();
    const put = async (p, key, patch) => {
      if (p[key]) await inject(p[key], patch);
    };
    // A pet awake and calm that needs this care (or doesn't).
    const sceneState = async (p, kind, due = true) => {
      await put(p, "binary_sensor.asleep", { state: "off" });
      await put(p, "switch.lights_out", { state: "off" });
      await put(p, "binary_sensor.calling", { state: "off" });
      const sick = due && kind === "medicine";
      await put(p, "sensor.mood", { state: sick ? "sick" : "content",
        attributes: { flags: due ? [sick ? "sick" : "dirty"] : [], requests: [] } });
      await put(p, "sensor.poop", { state: due && kind === "clean" ? "2" : "0" });
      await put(p, `button.${kind}`, { state: "unknown" }); // medicine's is only there while sick
      await page.waitForTimeout(600);
      await card.evaluate((el) => {
        const s = el._slides[el._index];
        s.sayUntil = 0; s.poseUntil = 0; s.propUntil = 0; s.prop.style.display = "none";
        s.pet.classList.remove("look", "wander-l", "wander-r", "hop");
      });
    };
    // The server's answer: cured or cleaned, and the care in the log.
    const answer = async (p, kind, result = "ok") => {
      if (result === "ok") {
        await put(p, "sensor.mood", { state: "content", attributes: { flags: [], requests: [] } });
        await put(p, "sensor.poop", { state: "0" });
      }
      await put(p, "sensor.last_care", { attributes: { log: [{ action: kind, result, by: "Dev Person", at: now() }] } });
    };
    const careButton = (kind) => cur().locator(".toy", { hasText: kind === "medicine" ? "meds" : "clean" });
    const look = () => card.evaluate((el) => {
      const s = el._slides[el._index];
      const live = (k) => el._hass.states[s.ids[k]];
      return {
        scene: s.scene?.kind || null, answered: !!s.scene?.answered, calls: el.__calls.length,
        end: el.__ends[el.__ends.length - 1] || null, fade: s.sceneFade?.kind || null,
        liveFlags: (live("sensor.mood")?.attributes.flags || []).join(),
        livePoop: live("sensor.poop")?.state, heldPoop: el._state(s, "sensor.poop")?.state,
        sick: /_sick_/.test((s.frames || []).join()) || /_sick_/.test(s.pet.getAttribute("src") || ""),
        poops: s.poops.filter((p) => p.style.display !== "none").length,
        props: s.screen.querySelectorAll(".scene, .scene-spark").length,
        status: s.screen.classList.contains("show-status"), line: s.bubble.textContent,
        prop: s.prop.style.display !== "none" ? s.prop.getAttribute("src") : "",
      };
    });
    const waitEnd = async () => {
      for (let i = 0; i < 40 && (await look()).scene; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(400); // the redraw after it
      return look();
    };

    // Medicine: the pill, the sick pet held on screen, then the cured one.
    await sceneState(pet, "medicine");
    await careButton("medicine").click();
    const medStart = await look();
    await answer(pet, "medicine");
    await page.waitForTimeout(700);
    const medHeld = await look();
    await shot("care-medicine-mid");
    const medEnd = await waitEnd();
    check("medicine: a scene starts at the tap, and the call goes out then",
      medStart.scene === "medicine" && medStart.calls === 1 && medStart.props > 0, JSON.stringify(medStart));
    check("medicine: the screen keeps the sick pet while the scene plays",
      medHeld.scene === "medicine" && medHeld.answered && medHeld.liveFlags === "" && medHeld.sick, JSON.stringify(medHeld));
    check("medicine: then shows the cured pet, after about 2 s",
      !medEnd.scene && !medEnd.sick && medEnd.props === 0 && medEnd.end?.at >= 1500 && medEnd.end?.at <= 2600 &&
      !/not sick/.test(medEnd.line), JSON.stringify(medEnd));

    // Clean: the broom sweeps left to right; each mess goes as it passes.
    await sceneState(pet, "clean");
    await careButton("clean").click();
    await answer(pet, "clean");
    await page.waitForTimeout(500);
    const cleanHeld = await look();
    const sweep = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const sc = s.scene;
      if (!sc) return null;
      sc.paused = true;
      const left = () => s.poops.filter((p) => p.style.display !== "none" && !p.classList.contains("scene-gone")).length;
      const counts = [];
      for (let t = 0; t <= 1800; t += 50) {
        el._sceneRender(s, t);
        counts.push(left());
      }
      el._sceneRender(s, performance.now() - sc.start);
      sc.paused = false;
      return { counts, broom: !!s.screen.querySelector(".scene-broom"), dust: !!s.screen.querySelector(".scene-dust") };
    });
    await shot("care-clean-mid");
    const cleanEnd = await waitEnd();
    const counts = sweep?.counts || [];
    check("clean: the mess stays on screen though the server has cleared it",
      cleanHeld.scene === "clean" && cleanHeld.livePoop === "0" && cleanHeld.heldPoop === "2" && cleanHeld.poops === 2,
      JSON.stringify(cleanHeld));
    check("clean: a broom and its dust sweep the mess away one by one",
      sweep?.broom && sweep?.dust && counts[0] === 2 && counts[counts.length - 1] === 0 && counts.includes(1) &&
      counts.every((n, i) => i === 0 || n <= counts[i - 1]), counts.join(""));
    check("clean: then a clean room with its sparkle, after about 2 s",
      !cleanEnd.scene && cleanEnd.poops === 0 && cleanEnd.props === 0 && cleanEnd.end?.at >= 1500 &&
      cleanEnd.end?.at <= 2600 && !/already clean/.test(cleanEnd.line), JSON.stringify(cleanEnd));

    // Interruptions end the scene at once, on the news.
    await sceneState(pet, "medicine");
    await careButton("medicine").click();
    await answer(pet, "medicine");
    await page.waitForTimeout(500);
    await cur().locator(".screen").click({ position: { x: 30, y: 40 } });
    await page.waitForTimeout(400);
    const tapCut = await look();
    check("a tap on the screen mid-scene ends it on the cured pet (no status)",
      !tapCut.scene && tapCut.end?.at < 1500 && !tapCut.sick && !tapCut.status && tapCut.props === 0, JSON.stringify(tapCut));
    await sceneState(pet, "clean");
    const callsBefore = (await look()).calls;
    await careButton("clean").click();
    await page.waitForTimeout(300);
    await careButton("clean").click();
    await page.waitForTimeout(300);
    const againCut = await look();
    check("a second tap on clean ends its scene and isn't sent again",
      !againCut.scene && againCut.calls === callsBefore + 1 && againCut.props === 0, JSON.stringify(againCut));
    await answer(pet, "clean");
    await page.waitForTimeout(500);
    await sceneState(pet, "medicine");
    await careButton("medicine").click();
    await page.waitForTimeout(300);
    const swipeTitle = (await page.locator("hatch-pet-card .title").innerText()).trim();
    await page.locator("hatch-pet-card .nav.next").click();
    const swipeCut = await card.evaluate((el) => el._slides.every((s) => !s.scene && !s.screen.querySelector(".scene")));
    await page.locator("hatch-pet-card .nav.prev").click();
    await page.waitForTimeout(700);
    check("moving to another pet mid-scene ends it", swipeCut &&
      (await page.locator("hatch-pet-card .title").innerText()).trim() === swipeTitle);
    await answer(pet, "medicine");
    await page.waitForTimeout(500);

    // Refusals are answered as before: no scene.
    await sceneState(pet, "medicine", false);
    await careButton("medicine").click();
    const refused = await look();
    check("medicine for a pet that isn't sick plays no scene", !refused.scene && refused.props === 0, JSON.stringify(refused));
    await sceneState(pet, "clean", false);
    await careButton("clean").click();
    check("clean with nothing to clean plays no scene", !(await look()).scene);

    // Reduced motion: no walking or sweeping; the news fades in when it comes.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const calmRuns = {};
    for (const kind of ["medicine", "clean"]) {
      await sceneState(pet, kind);
      await card.evaluate((el) => {
        const s = el._slides[el._index];
        window.__faded = false;
        s.pet.animate = function (...args) {
          window.__faded = true;
          return Element.prototype.animate.apply(this, args);
        };
      });
      await careButton(kind).click();
      const tapped = await look();
      await answer(pet, kind);
      await page.waitForTimeout(800);
      const shown = await look();
      calmRuns[kind] = { tapped, shown, faded: await evaluate(() => window.__faded) };
      await card.evaluate((el) => { delete el._slides[el._index].pet.animate; });
    }
    await page.emulateMedia({ reducedMotion: null });
    for (const [kind, r] of Object.entries(calmRuns)) {
      check(`reduced motion: ${kind} shows the end state with a short fade, no scene`,
        !r.tapped.scene && r.tapped.fade === kind && r.tapped.props === 0 && r.faded && !r.shown.sick && r.shown.poops === 0,
        JSON.stringify({ ...r.tapped, faded: r.faded }));
    }

    // 330 px, on the other pet's slide: both scenes fit the screen.
    await page.setViewportSize({ width: 330, height: 860 });
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(900);
    const other = await ids();
    await hush();
    const fits = {};
    for (const kind of ["medicine", "clean"]) {
      await sceneState(other, kind);
      await careButton(kind).click();
      await answer(other, kind);
      await page.waitForTimeout(kind === "medicine" ? 900 : 700);
      fits[kind] = await card.evaluate((el) => {
        const s = el._slides[el._index];
        const box = s.screen.getBoundingClientRect();
        const inside = (r) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1;
        const sc = s.scene;
        if (!sc) return null;
        if (sc.kind === "medicine") {
          return { pill: inside(sc.pill.getBoundingClientRect()), step: sc.step > 0,
            pet: s.pet.getBoundingClientRect().right <= box.right + 1, sick: /_sick_/.test(s.frames.join()) };
        }
        return { broom: !!sc.tool.getAttribute("src"), held: el._state(s, "sensor.poop").state === "2" };
      });
      await shot(`care-${kind}-330`);
      await waitEnd();
    }
    check("at 330 px the medicine scene fits (pill and pet on screen)",
      fits.medicine?.pill && fits.medicine?.step && fits.medicine?.pet && fits.medicine?.sick, JSON.stringify(fits.medicine));
    check("at 330 px the clean scene plays on another pet's slide",
      fits.clean?.broom && fits.clean?.held, JSON.stringify(fits.clean));
    await page.setViewportSize({ width: 420, height: 860 });
    await page.locator("hatch-pet-card .nav.prev").click();
    await page.waitForTimeout(900);

    // Frame strips for three body plans: a bird, a low tortoise, an octopus on
    // a water world (the net and its bubbles instead of the broom).
    const life = pet["sensor.life_stage"];
    const lifeBefore = await evaluate((e) => document.querySelector("home-assistant").hass.states[e].attributes, life);
    const strips = {};
    for (const [species, world] of [["bird", "woodland"], ["tortoise", "terrarium"], ["octopus", "tidepool"]]) {
      await inject(life, { attributes: { species, world } });
      for (let i = 0; i < 30; i++) {
        if (await card.evaluate((el, sp) => el._slides[el._index].species && el._slides[el._index].speciesId === sp, species)) break;
        await page.waitForTimeout(200);
      }
      for (const kind of ["medicine", "clean"]) {
        await sceneState(pet, kind);
        await careButton(kind).click();
        const times = kind === "medicine" ? [0, 600, 1100, 1600, 2000] : [100, 600, 1000, 1500, 1950];
        const got = [];
        for (const [n, t] of times.entries()) {
          const at = await card.evaluate((el, t) => {
            const s = el._slides[el._index];
            if (!s.scene) return null;
            s.scene.paused = true;
            s.scene.ms = Infinity;
            el._sceneRender(s, t);
            return { net: !!s.screen.querySelector(".scene-net"), murk: s.murk.style.maskImage };
          }, t);
          await page.waitForTimeout(250); // new frames load
          await cur().locator(".screen").screenshot({ path: path.join(OUT, `scene-${kind}-${species}-${n}.png`) });
          got.push(at);
        }
        await card.evaluate((el) => el._sceneEnd(el._slides[el._index]));
        await answer(pet, kind);
        await page.waitForTimeout(400);
        strips[`${kind}-${species}`] = got;
      }
    }
    await inject(life, { attributes: lifeBefore });
    await page.waitForTimeout(800);
    const octo = strips["clean-octopus"] || [];
    check("on a water world the net clears the murk in step (octopus)",
      octo.every((a) => a?.net) && octo.map((a) => Number(/transparent (-?[\d.]+)%/.exec(a?.murk || "")?.[1]))
        .every((x, i, xs) => i === 0 || x > xs[i - 1]), JSON.stringify(octo.map((a) => a?.murk)));
    check("both scenes play for a bird, a tortoise and an octopus",
      Object.values(strips).length === 6 && Object.values(strips).every((g) => g.every(Boolean)),
      Object.keys(strips).join(" "));
    await calm();
  }
  // Fresh-expand E4 (F-a, F-b): a feed at 08:00 says a breakfast line or its "yum"; from
  // 22 to 05, "yum" only; the crumb line (random 0) on a day a visitor came by, once a day.
  {
    const src4 = fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
    const MEALS = require("vm").runInNewContext(`(${src4.match(/\nconst MEAL_LINES = (\{[\s\S]*?\n\});/)[1]})`);
    const meals = await card.evaluate((el) => {
      const s = el._slides[el._index];
      const real = { seen: el._visitSeen, random: Math.random };
      const out = { breakfast: [], late: [] };
      try {
        el._visitSeen = () => null;
        for (let i = 0; i < 30; i++) out.breakfast.push(el._mealLine(s, "seeds", 8)?.[0]);
        for (let i = 0; i < 10; i++) out.late.push(el._mealLine(s, "seeds", 23)?.[0]);
        out.noFoodLate = el._mealLine(s, null, 23);
        const crumbKey = `hatch-crumb-${s.ids?.device}-${new Date().toDateString()}`;
        localStorage.removeItem(crumbKey);
        el._visitSeen = () => "snail";
        Math.random = () => 0;
        out.crumb = [el._mealLine(s, "seeds", 12)?.[0], el._mealLine(s, "seeds", 12)?.[0]];
        localStorage.removeItem(crumbKey);
      } finally {
        Object.assign(el, { _visitSeen: real.seen });
        Math.random = real.random;
      }
      return out;
    });
    const yum = (l) => /seeds/.test(l || "");
    check("fresh E4 (F-a): feeds at 08:00 say breakfast lines or the food's yum; late at night, yum only",
      meals.breakfast.every((l) => MEALS.breakfast.includes(l) || yum(l)) && meals.breakfast.some((l) => MEALS.breakfast.includes(l)) &&
      meals.late.every(yum) && meals.noFoodLate === null, JSON.stringify(meals));
    check("fresh E4 (F-b): the crumb line for today's visitor, once a day",
      meals.crumb[0] === "saving a crumb for the snail ♪" && meals.crumb[1] !== meals.crumb[0], JSON.stringify(meals.crumb));
  }

  }
  if (enter("editor")) {
  const editor = await evaluate(async () => {
    const hass = document.querySelector("home-assistant").hass;
    const el = document.createElement("hatch-pet-card-editor");
    document.body.append(el);
    el.hass = hass;
    el.setConfig({});
    for (let i = 0; i < 40 && !el.querySelector("ha-form")?.shadowRoot; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const form = el.querySelector("ha-form");
    const changed = new Promise((resolve) => el.addEventListener("config-changed", (e) => resolve(e.detail.config)));
    const device = Object.values(hass.entities).find((e) => e.platform === "virtual_pet")?.device_id;
    form?.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { devices: [device] } } }));
    const config = await Promise.race([changed, new Promise((r) => setTimeout(() => r(null), 2000))]);
    // gaps-seams 7a: the seasonal switch. Off writes `seasonal: false`; on drops it, but
    // keeps a preview key; the form shows it on unless the config says false.
    const seasonal = {};
    const turn = async (start, on) => {
      el.setConfig(start);
      await new Promise((r) => setTimeout(r, 50));
      const shown = form?.data?.seasonal;
      const next = new Promise((resolve) => el.addEventListener("config-changed", (e) => resolve(e.detail.config), { once: true }));
      form?.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { devices: [], seasonal: on } } }));
      return { shown, config: await Promise.race([next, new Promise((r) => setTimeout(() => r(null), 2000))]) };
    };
    seasonal.off = await turn({}, false);
    seasonal.on = await turn({ seasonal: false }, true);
    seasonal.preview = await turn({ seasonal: "winter" }, true);
    seasonal.label = form?.computeLabel?.({ name: "seasonal" });
    seasonal.fields = (form?.schema || []).map((f) => f.name);
    el.remove();
    return { form: !!form, rendered: !!form?.shadowRoot, config, seasonal };
  });
  check("card editor renders a form", editor.form && editor.rendered);
  check("card editor saves the picked pets", Array.isArray(editor.config?.devices), JSON.stringify(editor.config));
  const sz = editor.seasonal;
  check("card editor: a seasonal switch, on unless seasonal: false; off writes false, on drops it, a preview stays",
    sz.fields.join() === "devices,seasonal" && sz.label === "Seasonal decorations"
    && sz.off.shown === true && sz.off.config?.seasonal === false
    && sz.on.shown === false && sz.on.config && !("seasonal" in sz.on.config)
    && sz.preview.shown === true && sz.preview.config?.seasonal === "winter", JSON.stringify(sz));

  }
  if (enter("boot")) {
  // 3a. The power-on boot screen, at two widths. A page of its own, flagged so the
  // seeded "already booted" doesn't apply; Date.getHours and the oscillator count
  // are stubbed per step.
  for (const width of [420, 330]) {
    const bp = await context.newPage();
    await bp.setViewportSize({ width, height: 860 });
    await bp.addInitScript(() => {
      window.__osc = 0;
      const start = window.OscillatorNode.prototype.start;
      window.OscillatorNode.prototype.start = function (...a) { window.__osc++; return start.apply(this, a); };
    });
    const fresh = async (reduced = false) => {
      await bp.emulateMedia({ reducedMotion: reduced ? "reduce" : null });
      await bp.goto(`${HA}/pet-bench/pet`);
      // A new tab's frontend reloads itself once. Let that happen before the flag is
      // cleared: a boot the card claims in that reload is stored as done and never
      // shows to the test (it lasts BOOT_WAIT_MS, 5 s). If one is missed anyway, clear
      // the flag and reload again until the boot screen is seen.
      await bp.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      for (let attempt = 1; ; attempt++) {
        await bp.evaluate(() => {
          sessionStorage.setItem("cc-boot-test", "1");
          localStorage.removeItem("hatch-booted");
          localStorage.setItem("hatch-sounds", "off");
        });
        await bp.reload();
        try {
          await bp.waitForSelector("hatch-pet-card .slide .boot", { state: "visible", timeout: 20000 });
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          console.log("note: the boot screen was missed (the frontend reloaded itself), trying again");
        }
      }
      await bp.waitForTimeout(1000); // HA's loading logo clears the page a moment later
    };
    const visible = (sel) => bp.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent && getComputedStyle(e).visibility !== "hidden").length);
    const bootShots = path.join(OUT, `boot-${width}`);
    const bshot = (name) => bp.locator("hatch-pet-card .slide:not(.away-slide) .device").screenshot({ path: `${bootShots}-${name}.png` });
    const hours = (h) => bp.evaluate((h) => { Date.prototype.getHours = () => h; }, h);
    const tap = () => bp.locator("hatch-pet-card .slide:not(.away-slide) .boot").click({ force: true });
    const gone = async (ms) => { // no boot screen showing (polled: the card is in shadow DOM)
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await visible("hatch-pet-card .boot") === 0) return true;
        await bp.waitForTimeout(50);
      }
      return false;
    };

    // Fresh storage: the boot screen on every slide, buttons hidden, no sound before the tap.
    await fresh();
    const total = await bp.locator("hatch-pet-card .slide").count();
    check(`boot screen on every slide of a fresh browser (${width}px)`,
      total >= 2 && await visible("hatch-pet-card .slide .boot") === total, `${await visible("hatch-pet-card .slide .boot")}/${total}`);
    check(`boot screen shows the tap line and hides the buttons (${width}px)`,
      (await bp.locator("hatch-pet-card .slide:not(.away-slide) .boot").innerText()).includes("▶ tap to start") &&
      await visible("hatch-pet-card .slide:not(.away-slide) .toy") === 0);
    check(`boot screen starts no sound before the tap (${width}px)`, await bp.evaluate(() => window.__osc) === 0);
    await bp.locator("hatch-pet-card").evaluate((el) => { // count the pet speaking up
      el.__greets = 0;
      const greet = el._greet;
      el._greet = function (...a) { el.__greets++; return greet.apply(this, a); };
    });
    await bp.waitForTimeout(2000);
    check(`boot screen holds the speaking back (${width}px)`,
      await bp.locator("hatch-pet-card").evaluate((el) => el.__greets === 0));
    // A private moment from the channel waits for the boot too, then is said once.
    const heldBack = await bp.locator("hatch-pet-card").evaluate((el) => {
      el.__moments = [];
      const moment = el._moment;
      el._moment = function (s, m) { el.__moments.push(m.type); return moment.call(this, s, m); };
      el._channel(el._slides[el._index], { moment: { type: "friend_home", at: new Date().toISOString() } }, el._hass.user.id);
      return { booting: el._booting, said: el.__moments.length };
    });
    check(`boot screen holds a private moment back (${width}px)`,
      heldBack.booting && heldBack.said === 0, JSON.stringify(heldBack));
    await bshot("day");
    // The tap: sounds on at 10:00 plays the beep, the pet shows, the status stays shut.
    await hours(10);
    await bp.evaluate(() => localStorage.setItem("hatch-sounds", "on"));
    await bp.locator("hatch-pet-card").evaluate((el) => Object.assign(el._slides[el._index], { asleep: false, lightsOut: false }));
    await tap();
    await bp.waitForTimeout(250);
    await bshot("filling");
    check(`boot tap at 10:00 with sounds on plays the power-on beep (${width}px)`, await bp.evaluate(() => window.__osc) >= 3);
    const wentAway = await gone(3000);
    const toys = await visible("hatch-pet-card .slide:not(.away-slide) .toy");
    const statusShut = await bp.locator("hatch-pet-card .slide:not(.away-slide) .screen.show-status").count() === 0;
    check(`boot tap shows the pet and leaves the status shut (${width}px)`,
      wentAway && toys > 0 && statusShut, `gone ${wentAway}, buttons ${toys}, status shut ${statusShut}`);
    await bp.waitForTimeout(2500);
    check(`the first look runs after the boot (${width}px)`,
      await bp.locator("hatch-pet-card").evaluate((el) => el.__greets > 0));
    const saidAfter = await bp.locator("hatch-pet-card").evaluate((el) => el.__moments);
    check(`the held private moment is said once after the boot (${width}px)`,
      saidAfter.filter((type) => type === "friend_home").length === 1, saidAfter.join(","));
    // A second load: no boot screen.
    await reloadFor(bp, "hatch-pet-card .slide");
    await bp.waitForTimeout(1500);
    check(`a second load shows no boot screen (${width}px)`, await visible("hatch-pet-card .slide .boot") === 0);
    // Nobody taps: the pet shows by itself in about 5 s, silently.
    await fresh();
    const t0 = Date.now() - 1000; // fresh() settled for a second after the screen showed
    const auto = await gone(6000);
    check(`boot with no tap finishes by itself in 6 s, silently (${width}px)`,
      auto && Date.now() - t0 < 6000 && await bp.evaluate(() => window.__osc) === 0, `${Date.now() - t0} ms`);
    // Sounds on at 22:00: the tap works, the beep stays quiet.
    await fresh();
    await hours(22);
    await bp.evaluate(() => localStorage.setItem("hatch-sounds", "on"));
    await tap();
    check(`boot tap at 22:00 plays nothing (${width}px)`, await gone(3000) && await bp.evaluate(() => window.__osc) === 0);
    // Reduced motion: no fill, straight to the pet.
    await fresh(true);
    await bp.waitForTimeout(1000);
    await bshot("reduced");
    await tap();
    check(`boot tap under reduced motion goes straight to the pet (${width}px)`, await gone(300));
    await bp.evaluate(() => {
      sessionStorage.removeItem("cc-boot-test");
      localStorage.setItem("hatch-sounds", "off");
    });
    await bp.emulateMedia({ reducedMotion: null });
    await bp.close();
  }


  }
  if (enter("infrared")) {
  // 2a. The infrared link: a visit between the pet on show and a neighbour, at two
  // widths and with three pets. Sounds off; every visit is forced (the day's
  // random timer is checked separately), the lines are the card's own.
  {
    const third = (await api("GET", "/api/config/config_entries/entry?domain=virtual_pet", access)).length < 3;
    if (third) {
      const flow = await api("POST", "/api/config/config_entries/flow", access, { handler: "virtual_pet" });
      await api("POST", `/api/config/config_entries/flow/${flow.flow_id}`, access, { name: "Checkfin", world: "pond" });
      await api("POST", "/api/services/virtual_pet/fast_forward", access, { hours: 1 });
    }
  }
  for (const width of [420, 330]) {
    const lp = await context.newPage();
    await lp.setViewportSize({ width, height: 860 });
    await lp.goto(`${HA}/pet-bench/pet`);
    await lp.evaluate(() => { localStorage.setItem("hatch-sounds", "off"); localStorage.setItem("hatch-lcd", "off"); });
    await reloadFor(lp, "hatch-pet-card .statusbtn");
    for (let i = 0; i < 60 && await lp.locator("hatch-pet-card").evaluate((el) => (el._slides?.length || 0) < 3); i++) await lp.waitForTimeout(1000);
    await lp.waitForTimeout(1500);
    const card = lp.locator("hatch-pet-card");
    const lshots = path.join(OUT, `link-${width}`);
    // Everyone free, on this page, no leftovers from earlier pages' storage.
    const prep = (index = 0) => card.evaluate((el, index) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-link-")) localStorage.removeItem(k);
      localStorage.setItem(`hatch-link-cardcheck-${new Date().toDateString()}`, "1"); // not the day's first
      el._linkEnd();
      el._linkAt = Date.now() + 1e9; // only the forced visits run
      // E9 L-a's news (1 link in 3, with a guest's dream today) swaps the guest's line and
      // holds the visit 1.5 s longer: off here; moments checks it.
      el._linkNews = () => null;
      el._index = index;
      el._renderShelf();
      const realState = el._state;
      if (!el.__linkStage) {
        el.__linkStage = true;
        el._state = function (slide, key) {
          const st = realState.call(this, slide, key);
          return key === "sensor.life_stage" && st?.state === "egg" ? { ...st, state: "adult" } : st;
        };
      }
      for (const s of el._slides) {
        Object.assign(s, { asleep: false, lightsOut: false, calling: false, game: null, moodState: "content",
          lookedFirst: true, queue: [], scene: null, sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0 });
        s.screen.classList.remove("show-status");
      }
      el._booting = false;
    }, index).then(() => pinAwake(card, "infrared"));
    const state = () => card.evaluate((el) => {
      const [h, g] = [el._slides[el._index], el._slides[el._index + 1] || el._slides[el._index - 1]];
      const beam = el._track.querySelector(".irbeam");
      const head = beam?.querySelector(".head");
      return {
        beam: !!beam, head: head?.getBoundingClientRect().left ?? null, pe: beam && getComputedStyle(beam).pointerEvents,
        loaded: beam ? [...beam.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0) : null,
        guestImg: h.screen.querySelectorAll(".vguest").length, band: h.screen.querySelectorAll(".vband").length,
        hostPos: h.pet.classList.contains("linking"), hop: h.pet.classList.contains("greethop") || !!h.screen.querySelector(".vguest.greethop"),
        hostSays: h.bubble.textContent, guestSays: h.screen.querySelector(".vsay:not([hidden])")?.textContent || "",
        guestBubble: g.bubble.textContent, hostQueue: h.queue.length,
        left: document.querySelectorAll("x").length + el._track.querySelectorAll(".irbeam").length +
          el._slides.reduce((n, s) => n + s.screen.querySelectorAll(".visit, .vguest").length +
            (s.screen.classList.contains("linking") || s.pet.classList.contains("linking") ? 1 : 0), 0),
        scale: h.pet.style.scale,
      };
    });
    // Poll a condition on the card (it sits in a shadow root, so no page-level waitForFunction).
    const until = async (fn, arg, ms) => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await card.evaluate(fn, arg).catch(() => false)) return true;
        await lp.waitForTimeout(50);
      }
      return false;
    };
    const strip = (name) => card.locator(".viewport").screenshot({ path: `${lshots}-${name}.png` });

    // The timer: after the day's first, a visit is 10-25 minutes away, and never while the
    // boot screen is up.
    await prep();
    const timer = await card.evaluate((el) => {
      const h = el._slides[el._index];
      el._linkAt = null; el._linkTick(h);
      const wait = el._linkAt - Date.now();
      el._linkAt = 0; el._booting = true; el._linkTick(h);
      const booting = !!el._link;
      el._booting = false;
      return { wait, booting, started: !!el._link };
    });
    check(`link waits 10-25 minutes after the day's first (${width}px)`,
      timer.wait > 590000 && timer.wait <= 1500000 && !timer.started, JSON.stringify(timer));
    check(`link never starts under the boot screen (${width}px)`, !timer.booting);
    // The day's first (gaps-seams 5a, owner Q7): only 1-3 min into a look someone touched
    // in the last 5 min, on a shown tab; never untouched, too soon, stale, hidden or off screen.
    await prep();
    const first = await card.evaluate((el) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-link-")) localStorage.removeItem(k);
      // This is about the day's first-link timer, not who is free: with finds shown a line can
      // land (a find, a gift) between prep and here, and a pet with a line waiting is not free.
      // So clear them again in this same step, and report what was left if a try still fails.
      for (const s of el._slides) Object.assign(s, { queue: [], sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0 });
      const h = el._slides[el._index];
      const now = Date.now();
      const tries = {};
      const tryIt = (name, touched, look) => {
        el._linkEnd();
        el._touchedAt = touched === null ? null : now - touched;
        el._lookAt = now - look;
        el._linkFirstMs = 90000;
        el._linkTick(h);
        tries[name] = !!el._link;
        el._linkEnd();
        for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-link-")) localStorage.removeItem(k);
      };
      tryIt("untouched", null, 100000);
      tryIt("soon", 1000, 30000);
      tryIt("stale", 310000, 400000);
      Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
      tryIt("hidden", 1000, 100000);
      delete document.hidden;
      el._visible = false; // scrolled off screen (the card's IntersectionObserver)
      tryIt("offscreen", 1000, 100000);
      el._visible = true;
      tryIt("watched", 1000, 100000);
      const ms = [];
      for (let i = 0; i < 20; i++) { el._linkFirstMs = undefined; el._touchedAt = null; el._linkTick(h); ms.push(el._linkFirstMs); }
      el._linkAt = Date.now() + 1e9;
      localStorage.setItem(`hatch-link-cardcheck-${new Date().toDateString()}`, "1");
      return { tries, lo: Math.min(...ms), hi: Math.max(...ms),
        free: el._slides.map((x) => [el._free(x), x.queue?.length || 0, x.moodState]) };
    });
    check(`the day's first link waits for a touched, shown look 1-3 min in (${width}px)`,
      first.tries.watched && !first.tries.untouched && !first.tries.soon && !first.tries.stale && !first.tries.hidden && !first.tries.offscreen
      && first.lo >= 60000 && first.hi <= 180000, JSON.stringify(first));

    // A full visit, with frames along the way.
    await prep();
    const names = await card.evaluate((el) => {
      const nm = (s) => { const d = el._hass.devices[s.ids.device]; return d.name_by_user || d.name; };
      return [nm(el._slides[0]), nm(el._slides[1])];
    });
    await card.evaluate((el) => el._linkStart(el._slides[0], el._slides[1]));
    await lp.waitForTimeout(450);
    const beam1 = await state();
    await strip("1-beam-start");
    await lp.waitForTimeout(550);
    const beam2 = await state();
    await strip("2-beam-flying");
    check(`the beam flies and loads its art, taking no taps (${width}px)`,
      beam1.beam && beam1.loaded && beam1.pe === "none" && beam2.head > beam1.head, JSON.stringify([beam1, beam2].map((b) => [b.beam, b.loaded, b.pe, b.head])));
    await lp.waitForTimeout(600);
    await strip("3-connecting");
    const band = await state();
    await lp.waitForTimeout(1100);
    const both = await state();
    await strip("4-visit");
    // The guest's bubble shows only in a 2.2 s window of the visit: wait for it, not a fixed time.
    await until((el) => el._slides.some((s) => s.screen.querySelector(".vsay:not([hidden])")), null, 3000);
    await strip("5-hop");
    const lines = await state();
    check(`the visit screen shows a connecting band, then both pets (${width}px)`,
      band.band === 1 && both.guestImg === 1 && both.hostPos && both.band === 0, JSON.stringify([band.band, both.guestImg, both.hostPos]));
    check(`both pets speak, each in their own voice (${width}px)`,
      lines.hostSays.includes(names[1]) && lines.guestSays.includes(names[0]) && lines.guestBubble.includes("♪"),
      JSON.stringify([lines.hostSays, lines.guestSays, lines.guestBubble]));
    await lp.waitForTimeout(1500);
    await strip("6-farewell");
    // About 9 s since the start; a kindred pair's extra line (2b) can hold the visit longer.
    await until((el) => !el._link, null, 6000);
    const over = await state();
    check(`the visit is over and nothing is left behind by 9 s (${width}px)`,
      over.left === 0 && !over.beam, JSON.stringify(over));

    // The visit's hearts are its own: its end leaves a bond's hearts alone, and
    // a shared screen gets none (bond hearts are personal there).
    const heartsRun = (shared) => card.evaluate(async (el, shared) => {
      localStorage.setItem("hatch-shared-screen", shared ? "on" : "off");
      const host = el._slides[0];
      el._linkStart(host, el._slides[1]);
      let link = 0;
      for (let i = 0; i < 60 && el._link && !link; i++) {
        await new Promise((r) => setTimeout(r, 100));
        link = host.screen.querySelectorAll(".linkhearts").length;
      }
      try {
        el._bondHearts(host); // a real bond's hearts, mid-visit
        el._linkEnd();
        return { link, bond: host.screen.querySelectorAll(".bondhearts").length,
          linkAfter: host.screen.querySelectorAll(".linkhearts").length };
      } finally {
        el._linkEnd();
        host.screen.querySelector(".bondhearts")?.remove();
        localStorage.setItem("hatch-shared-screen", "off");
      }
    }, shared);
    await prep();
    const ownHearts = await heartsRun(false);
    await prep();
    const sharedHearts = await heartsRun(true);
    check(`the visit's hearts are its own, and none on a shared screen (${width}px)`,
      ownHearts.link === 1 && ownHearts.bond === 1 && ownHearts.linkAfter === 0 && sharedHearts.link === 0,
      JSON.stringify([ownHearts, sharedHearts]));

    // A swipe mid-visit ends it at once.
    await prep();
    await card.evaluate((el) => el._linkStart(el._slides[0], el._slides[1]));
    await lp.waitForTimeout(3300);
    const midway = await state();
    await card.evaluate((el) => el._go(1));
    const swiped = await state();
    check(`a swipe mid-visit leaves nothing behind (${width}px)`, midway.guestImg === 1 && swiped.left === 0 && !swiped.beam, JSON.stringify([midway.guestImg, swiped.left]));

    // Not when either pet is asleep, calling or in a game, nor with a line waiting; once a day per pair.
    await prep();
    const gates = await card.evaluate((el) => {
      const [a, b] = [el._slides[0], el._slides[1]];
      const out = {};
      const clear = () => { for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-link-")) localStorage.removeItem(k); };
      // prep() ran a tick ago: an idle flair, line or move in that gap would make a pet "not free", so reset in here.
      for (const s of el._slides) {
        Object.assign(s, { asleep: false, calling: false, game: null, moodState: "content", lookedFirst: true, queue: [], scene: null, sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0 });
        s.screen.classList.remove("show-status");
      }
      for (const [who, s] of [["host", a], ["guest", b]]) {
        for (const [what, patch] of [["asleep", { asleep: true }], ["calling", { calling: true }], ["game", { game: { kind: "left_right" } }], ["queue", { queue: [{ text: "x" }] }]]) {
          const keep = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k]]));
          Object.assign(s, patch); clear();
          out[`${who} ${what}`] = el._linkPick(a);
          Object.assign(s, keep);
        }
      }
      clear();
      out.first = !!el._linkPick(a);
      out.second = !!el._linkPick(a);
      return out;
    });
    const blocked = Object.entries(gates).filter(([k]) => k !== "first" && k !== "second").every(([, v]) => v === null);
    check(`no visit while either pet is asleep, calling, in a game or has a line waiting (${width}px)`, blocked, JSON.stringify(gates));
    check(`a pair visits once a day (${width}px)`, gates.first && !gates.second, JSON.stringify([gates.first, gates.second]));

    // Three pets: the pet in the middle can send the beam either way.
    for (const toRight of [true, false]) {
      await prep(1);
      await card.evaluate((el, toRight) => el._linkStart(el._slides[1], el._slides[toRight ? 2 : 0]), toRight);
      await lp.waitForTimeout(500);
      const a = await state();
      // Wait for the head to have moved (a fixed 450 ms can sit on a frame edge), not a clock.
      await until((el, x) => {
        const h = el._track.querySelector(".irbeam .head");
        return !h || Math.abs(h.getBoundingClientRect().left - x) > 2;
      }, a.head, 2000);
      const b = await state();
      await strip(`7-three-${toRight ? "right" : "left"}`);
      check(`with three pets the beam goes ${toRight ? "right" : "left"} to the neighbour (${width}px)`,
        a.beam && (toRight ? b.head > a.head : b.head < a.head), JSON.stringify([a.head, b.head]));
      await card.evaluate((el) => el._linkEnd());
    }

    // Reduced motion: no beam, no hops; the pets appear together, speak and go.
    await prep();
    await lp.emulateMedia({ reducedMotion: "reduce" });
    await card.evaluate((el) => el._linkStart(el._slides[0], el._slides[1]));
    let sawBeam = false, sawHop = false, sawBoth = false;
    for (let i = 0; i < 24; i++) {
      await lp.waitForTimeout(250);
      const x = await state();
      sawBeam ||= x.beam; sawHop ||= x.hop; sawBoth ||= x.guestImg === 1 && x.hostPos;
    }
    await until((el) => !el._link, null, 4000); // a kindred extra stretches the visit
    await lp.emulateMedia({ reducedMotion: null });
    const calmEnd = await state();
    check(`reduced motion: no beam and no hops, the pets just appear together (${width}px)`,
      !sawBeam && !sawHop && sawBoth && calmEnd.left === 0, JSON.stringify([sawBeam, sawHop, sawBoth, calmEnd.left]));

    // Kindred pairs (2b): a mellow host and a sweet guest, every roll 0 (type lines, and
    // the extra, mellow's first: "<guest>, we do cosy well ♥"). The extra is said and
    // announced in the visit, never after it, nor after a swipe away and back.
    if (width === 420) {
      const kindred = (run) => card.evaluate(async (el, run) => {
        const [host, guest] = [el._slides[0], el._slides[1]];
        if (!el.__linkTypes) {
          const before = el._state;
          el._state = function (slide, key) {
            const st = before.call(this, slide, key);
            const type = this.__linkTypes?.get(slide);
            return key === "sensor.life_stage" && st && type ? { ...st, state: "adult", attributes: { ...st.attributes, personality: type } } : st;
          };
        }
        el.__linkTypes = new Map([[host, "mellow"], [guest, "sweet"]]);
        const nm = (s) => { const d = el._hass.devices[s.ids.device]; return d.name_by_user || d.name; };
        const extra = `${nm(guest)}, we do cosy well ♥`;
        const real = Math.random;
        Math.random = () => 0;
        try { el._linkStart(host, guest); } finally { Math.random = real; }
        const seen = { during: false, live: false, after: false, endMs: 0, hello: false };
        const t0 = Date.now();
        for (let i = 0; i < 110; i++) {
          if (run === "swipe" && i === 10) el._go(1);
          if (run === "swipe" && i === 15) el._go(-1);
          await new Promise((r) => setTimeout(r, 100));
          const says = host.bubble.textContent.includes(extra);
          if (el._link) {
            seen.during ||= says;
            seen.live ||= host.live.textContent.includes(extra.replace(" ♥", "")); // read out without the heart
            seen.hello ||= host.bubble.textContent.includes(`oh hey, ${nm(guest)}... ♪`); // mellow's first
            seen.endMs = Date.now() - t0;
          } else seen.after ||= says && host.sayEntry?.shownAt > t0 + seen.endMs;
        }
        seen.left = host.queue.filter((q) => q.text === extra).length;
        el.__linkTypes = null;
        el._linkEnd();
        return seen;
      }, run);
      for (const run of ["visit", "calm", "swipe"]) {
        await prep();
        if (run === "calm") await lp.emulateMedia({ reducedMotion: "reduce" });
        const k = await kindred(run);
        await lp.emulateMedia({ reducedMotion: null });
        if (run === "swipe") {
          check("kindred: a swipe away and back leaves no extra line said after the visit", !k.after && k.left === 0, JSON.stringify(k));
        } else {
          check(`kindred: the host greets in its type and adds its line, announced, inside the visit (${run})`,
            k.during && k.live && !k.after && k.left === 0 && k.hello, JSON.stringify(k));
        }
      }
    }
    // The swipes above kept a place in this browser (UX fix 2, F8: hatch-shelf-*, shared by every
    // tab of the origin). Put it back, or a later page load (restart's) would open on pet 2, not 1.
    await lp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hatch-shelf-")).forEach((k) => localStorage.removeItem(k)));
    await lp.close();
  }

  }
  check("no errors in the browser console", errors.length === 0, errors.slice(0, 3).join(" | "));

  if (enter("lowbattery")) {
  // 7b. The low-battery gag after an HA restart (D5): the card compares the house
  // view's powered_on.at with its stored hatch-power-<pet>, through the real
  // channel path. The real restart's snapshot is asserted in section 8.
  for (const width of [420, 330]) {
    await page.setViewportSize({ width, height: 860 });
    await page.emulateMedia({ reducedMotion: null });
    await page.waitForTimeout(300);
    const card = page.locator("hatch-pet-card").first();
    // One step in the page: the slide to use, and helpers that clear the browser's marker.
    const run = (fn, arg) => card.evaluate(async (el, { fn, arg }) => {
      const s = el._slides.find((x) => x.species && x.drawn && x.ids?.device &&
        el._eggMinutes(el._state(x, "sensor.life_stage")) === null);
      if (!s) return { noSlide: true };
      // The real pet may be asleep or calling (the redraw sets both from its sensors): pin them.
      const pin = { asleep: false, calling: false };
      const real = { asleep: s.asleep, calling: s.calling };
      for (const k of Object.keys(pin)) Object.defineProperty(s, k, { configurable: true, get: () => pin[k], set() {} });
      const key = `hatch-power-${s.ids.device}`;
      const iso = (ms) => new Date(Date.now() + ms).toISOString();
      const snap = (at) => el._channel(s, { mine: s.mine, moments: [], house: { media: null, dream: null,
        ...(at ? { powered_on: { at } } : {}) }, now: iso(0) }, el._hass.user.id);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const reset = () => {
        el._powerEnd(s);
        s.powerPending = null;
        pin.asleep = pin.calling = false;
        localStorage.removeItem(key);
      };
      // eslint-disable-next-line no-new-func
      try {
        return await new Function("el", "s", "key", "iso", "snap", "sleep", "reset", "pin", "arg", `return (async () => { ${fn} })()`)(
          el, s, key, iso, snap, sleep, reset, pin, arg);
      } finally {
        el._powerEnd(s);
        for (const k of Object.keys(pin)) Object.defineProperty(s, k, { configurable: true, writable: true, value: real[k] });
      }
    }, { fn, arg });
    const w = `(${width}px)`;

    let r = await run(`reset();
      snap(iso(-1000)); // a browser that never stored one: it only stores
      const first = { pending: s.powerPending, stored: localStorage.getItem(key), power: !!s.power };
      const at = iso(0);
      snap(at);
      el._powerTick(s);
      await sleep(350);
      const during = { pending: s.powerPending, power: !!s.power, hidden: s.batt.hidden, level: s.batt.dataset.level,
        line: s.plain, src: s.pet.getAttribute("src"), stored: localStorage.getItem(key) === at };
      await sleep(2300);
      const later = { level: s.batt.dataset.level, line: s.plain, hidden: s.batt.hidden };
      await sleep(2200);
      const end = { hidden: s.batt.hidden, power: !!s.power };
      snap(at); // the same one again
      el._powerTick(s);
      const again = { pending: s.powerPending, power: !!s.power };
      reset();
      return { first, during, later, end, again, at };`);
    const LOW = ["w-whoa... did someone pull my battery?", "low batt... ♪ ... oh! we're back"];
    const BACK = ["all charged! hi! ♥", "power's back! ♪"];
    check(`D5: a browser with no stored power-on only stores it, no gag ${w}`,
      !r.noSlide && r.first.pending == null && !r.first.power && !!r.first.stored, JSON.stringify(r.first));
    check(`D5: a new fresh power-on shows the one-bar battery and a line, sleepy ${w}`,
      r.during?.power && !r.during.hidden && r.during.level === "1" && LOW.some((l) => r.during.line?.includes(l)) &&
      r.during.stored && /sleepy/.test(r.during.src || ""), JSON.stringify(r.during));
    check(`D5: then it perks up (full battery, second line) ${w}`,
      r.later?.level === "3" && !r.later.hidden && BACK.some((l) => r.later.line?.includes(l)), JSON.stringify(r.later));
    check(`D5: it is gone by 6 s ${w}`, r.end?.hidden && !r.end.power, JSON.stringify(r.end));
    check(`D5: a second snapshot with the same at does nothing ${w}`,
      r.again?.pending == null && !r.again.power, JSON.stringify(r.again));

    r = await run(`reset();
      snap(iso(-3600000)); // stored
      const before = localStorage.getItem(key);
      snap(iso(-1200000)); // 20 min old: newer than stored, but stale
      const stale = { pending: s.powerPending, power: !!s.power, moved: localStorage.getItem(key) !== before };
      const stored = localStorage.getItem(key);
      snap(null); // no powered_on: no news
      const none = { pending: s.powerPending, kept: localStorage.getItem(key) === stored };
      el._channel(s, { house: { media: null, dream: null } }, el._hass.user.id); // a push without it
      const afterPush = localStorage.getItem(key) === stored;
      reset();
      return { stale, none, afterPush };`);
    check(`D5: a stale power-on (over 15 min) stores but does not gag ${w}`,
      r.stale?.pending == null && !r.stale.power && r.stale.moved, JSON.stringify(r.stale));
    check(`D5: no powered_on leaves the stored key alone ${w}`,
      r.none?.pending == null && r.none.kept && r.afterPush, JSON.stringify(r));

    r = await run(`reset();
      snap(iso(-3600000));
      const at = iso(-1000);
      snap(at);
      pin.asleep = true;
      el._powerTick(s);
      const asleep = { pending: s.powerPending === at, power: !!s.power };
      pin.asleep = false;
      el._powerTick(s);
      const awake = { pending: s.powerPending, power: !!s.power };
      el._powerEnd(s);
      s.powerPending = iso(-13 * 3600000); // over 12 h old
      el._powerTick(s);
      const dropped = { pending: s.powerPending, power: !!s.power };
      reset();
      return { asleep, awake, dropped };`);
    check(`D5: asleep defers the gag; awake plays it; over 12 h is dropped ${w}`,
      r.asleep?.pending && !r.asleep.power && r.awake.power && r.awake.pending == null &&
      r.dropped.pending == null && !r.dropped.power, JSON.stringify(r));

    r = await run(`reset();
      snap(iso(-3600000));
      snap(iso(-1000));
      el._powerTick(s);
      await sleep(400);
      const on = !!s.power && !s.batt.hidden;
      pin.calling = true; // a call starts mid-gag
      el._powerTick(s);
      const aborted = { power: !!s.power, hidden: s.batt.hidden, sayUntil: s.sayUntil };
      await sleep(2600);
      const quiet = !LINES_BACK.some((l) => (s.plain || "").includes(l)) && s.batt.hidden;
      reset();
      return { on, aborted, quiet };`.replace("LINES_BACK", JSON.stringify(BACK)));
    check(`D5: a call starting mid-gag aborts it (battery off, lines dropped) ${w}`,
      r.on && !r.aborted.power && r.aborted.hidden && r.quiet, JSON.stringify(r));

    r = await run(`reset();
      snap(iso(-3600000));
      const other = { ids: s.ids, house: { powered_on: { at: iso(-500) } } }; // a second slide of the same pet
      s.house = other.house;
      el._powerNews(other);
      el._powerNews(s);
      const out = { first: other.powerPending != null, second: s.powerPending != null };
      reset();
      return out;`);
    check(`D5: two slides on one pet: only one gags ${w}`, r.first && !r.second, JSON.stringify(r));

    // The flicker: two blanks (a mutation observer, the blanks last 80 ms).
    r = await run(`reset();
      snap(iso(-3600000));
      let blanks = 0, was = false;
      const watch = new MutationObserver(() => {
        const now = s.screen.classList.contains("blank");
        if (now && !was) blanks++;
        was = now;
      });
      watch.observe(s.screen, { attributes: true, attributeFilter: ["class"] });
      snap(iso(-500));
      el._powerTick(s);
      await sleep(900);
      watch.disconnect();
      reset();
      return { blanks };`);
    check(`D5: the screen flickers twice ${w}`, r.blanks === 2, JSON.stringify(r));

    await page.emulateMedia({ reducedMotion: "reduce" });
    r = await run(`reset();
      snap(iso(-3600000));
      let blanks = 0;
      const watch = new MutationObserver(() => { if (s.screen.classList.contains("blank")) blanks++; });
      watch.observe(s.screen, { attributes: true, attributeFilter: ["class"] });
      snap(iso(-500));
      el._powerTick(s);
      const levels = new Set();
      for (let i = 0; i < 17; i++) { levels.add(s.batt.hidden ? "off" : s.batt.dataset.level + (s.batt.classList.contains("blink") ? "b" : "")); await sleep(300); }
      watch.disconnect();
      reset();
      return { blanks, levels: [...levels] };`);
    check(`D5: reduced motion: no blanks, a static one-bar battery for the whole gag ${w}`,
      r.blanks === 0 && JSON.stringify(r.levels.sort()) === JSON.stringify(["1", "off"]), JSON.stringify(r));
    await page.emulateMedia({ reducedMotion: null });
  }


  }
  let seeded = false;
  let unseed = null;
  let basketSeed = null; // restart's seeded basket, for finds: {entryId, world, basket, back}
  let giftBounce = null; // for gifts: {bounce, entryId, world} (its own bounce seeds dev's gift)
  let giftsTaken = []; // the gift ids dev holds after gifts (collection draws them with ♥)
  const seedPet = pet["sensor.life_stage"];
  if (enter("restart")) {
  // 8. An HA restart keeps the bond, and a second login sees nothing of the
  // first's (privacy P3a-card). After the console check: a restart's lost
  // connection is noise there. The restart is opt-in, as card-check stops
  // and starts Home Assistant itself (HA's restart only exits under `hass`):
  // HA_CONFIG=<this instance's config dir> HA_START="<command that starts it>"
  // (the dev instance's by default, see the top). It also seeds dev's bond
  // (level 8, "sunbeam") and an aimed wish while HA is down (plan review #12),
  // and puts back what was there at the end (so the next run starts as this
  // one did). Without them the second-login checks would prove nothing, so
  // that's a failure, not a skip.
  // Stop HA, change the pet's store while it's down, start it again (detached:
  // it outlives this script) and wait until it runs. Returns a fresh token.
  const bounce = async (token, entryId, patch) => {
    const lock = path.join(process.env.HA_CONFIG, ".ha_run.lock");
    const pid = JSON.parse(fs.readFileSync(lock, "utf8") || "{}").pid;
    await api("POST", "/api/services/homeassistant/stop", token, {}).catch(() => {});
    const alive = () => { try { process.kill(pid, 0); return true; } catch (err) { return false; } };
    for (let i = 0; i < 120 && pid && alive(); i++) await new Promise((r) => setTimeout(r, 500));
    const storeFile = path.join(process.env.HA_CONFIG, ".storage", `virtual_pet.${entryId}`);
    const store = JSON.parse(fs.readFileSync(storeFile, "utf8")); // as HA left it on the way out
    patch(store.data);
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));
    const log = fs.openSync(path.join(OUT, "ha-restart.log"), "a");
    require("child_process").spawn("bash", ["-c", process.env.HA_START], { detached: true, stdio: ["ignore", log, log] }).unref();
    await waitForHa();
    const next = await signIn();
    for (let i = 0; i < 90; i++) {
      if ((await api("GET", "/api/config", next).catch(() => ({}))).state === "RUNNING") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return next;
  };
  if (process.env.HA_CONFIG && process.env.HA_START) {
    const fresh = await signIn(); // the first token may have expired by now
    const { time_zone: tz } = await api("GET", "/api/config", fresh);
    const entryId = await evaluate(async (e) => (await document.querySelector("home-assistant").hass
      .callWS({ type: "config/entity_registry/get", entity_id: e })).config_entry_id, seedPet);
    const card = page.locator("hatch-pet-card").first();
    for (let i = 0; i < slides; i++) {
      if (await card.evaluate((el, e) => el._slides[el._index].ids?.["sensor.life_stage"] === e, seedPet)) break;
      await page.locator("hatch-pet-card .nav.next").click();
      await page.waitForTimeout(700);
    }
    await evaluate(() => { window.__hatchMark = "same page"; });
    const poweredBefore = await card.evaluate((el, e) =>
      el._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.house?.powered_on?.at ?? null, seedPet);
    // Seed: dev's bond with this pet, and today's wish aimed at dev. What was
    // there goes back at the end.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    // And today's world visit (visitors v2): the pet's first visitor, its window on now,
    // at a minute no pick would make, so a re-roll on restart would show.
    const seedWorld = await card.evaluate((el, e) => el._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.worldKey, seedPet);
    const seedGuest = (JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"))[seedWorld]?.visitors || [])[0];
    const seedFrom = Math.floor(Date.now() / 1000) - 17 * 60 - 7;
    const seedVisit = seedGuest && { day: today, world: seedWorld, id: seedGuest.id, hours: seedGuest.hours,
      from: seedFrom, until: seedFrom + 10800, credited: false };
    // And a full basket (visitors v2 V-C, the finds section taps it): a find met before, a
    // first-ever one, and one a visitor left (its own `leaves`, else another find); and a
    // part-met collection page for the world (V-D's: two visitors and finds met, a gift-only
    // id and an id no worlds.json knows, both kept by the server and skipped on show).
    const seedW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"))[seedWorld] || {};
    const wFinds = (seedW.finds || []).filter((f) => !f.gift_only);
    const leaver = (seedW.visitors || []).find((v) => v.leaves) || (seedW.visitors || [])[1];
    const leftId = leaver?.leaves || wFinds[3]?.id;
    const seedBasket = wFinds.length >= 4 && leaver ? [
      { id: wFinds[0].id, world: seedWorld, new: false },
      { id: wFinds.find((f) => ![wFinds[0].id, leftId].includes(f.id) && f.id !== wFinds[1].id).id, world: seedWorld, new: true },
      { id: leftId, world: seedWorld, new: false, from: leaver.id },
    ] : null;
    const seedPage = seedBasket && { visitors: { [seedW.visitors[0].id]: today, [leaver.id]: today },
      finds: { [wFinds[0].id]: today, [wFinds[1].id]: today, [leftId]: today,
        [(seedW.finds.find((f) => f.gift_only) || {}).id || "nogift"]: today, laterfind: today } };
    let before = null;
    const downAt = Date.now();
    const token2 = await bounce(fresh, entryId, (data) => {
      before = { bond: data.bonds?.[me], wish: data.wish, visit: data.visit, basket: data.basket,
        collection: data.collection };
      if (seedVisit) data.visit = seedVisit;
      if (seedBasket) {
        data.basket = seedBasket;
        data.collection = { ...(data.collection || {}), [seedWorld]: seedPage };
      }
      // Level 8, one point short of 9 with today's care still to earn: the
      // old-card check's care press makes a real bond_up (8b).
      const { gift: _was, ...bond } = data.bonds?.[me] || {}; // no gift but the seeded one
      data.bonds = { ...(data.bonds || {}), [me]: { ...bond, points: 144, nickname: "sunbeam",
        day: today, today: 0, visited: true } };
      data.wish = { kind: "play", day: today, granted: false, for: me, for_name: USER.name };
    });
    unseed = () => bounce(token2, entryId, (data) => {
      if (before.bond === undefined) delete data.bonds?.[me];
      else data.bonds = { ...(data.bonds || {}), [me]: before.bond };
      data.wish = before.wish;
      if (seedVisit) data.visit = before.visit ?? null;
      if (seedBasket) {
        if (before.basket === undefined) delete data.basket;
        else data.basket = before.basket;
        if (before.collection === undefined) delete data.collection;
        else data.collection = before.collection;
      }
    });
    if (seedBasket) basketSeed = { entryId, world: seedWorld, basket: seedBasket };
    giftBounce = { bounce, entryId, world: seedWorld };
    const upAt = Date.now();
    const back = await card.evaluate(async (el, e) => {
      const start = Date.now();
      const s = () => el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
      while (Date.now() - start < 90000 && s()?.mine?.bond?.nickname !== "sunbeam") {
        await new Promise((r) => setTimeout(r, 500));
      }
      const sl = s();
      sl.statusHtml = null;
      el._renderStatus(sl, []);
      return { s: Math.round((Date.now() - start) / 1000), bond: sl.mine?.bond, aimed: sl.mine?.wish_for_you,
        you: /you two/.test(sl.status.textContent), wish: sl.status.querySelector(".row")?.textContent.trim(),
        // the wish's own row: a pet that is calling gets a "would like" row above it
        wishRow: [...sl.status.querySelectorAll(".row")].find((r) => /^wish/.test(r.textContent.trim()))?.textContent.trim(),
        mark: window.__hatchMark, powered: sl.house?.powered_on?.at ?? null, visit: sl.house?.visit ?? null,
        basket: sl.house?.basket };
    }, seedPet);
    check("visitors v2 V-C: an HA restart keeps the seeded basket (house.basket 3, no ids on the house view)",
      !!seedBasket && back.basket === 3, JSON.stringify({ seeded: seedBasket, got: back.basket }));
    // And the seeded collection page (V-D0's virtual_pet/collection): its visitors and known
    // finds are back after the restart (the gift-only and unknown ids are V-D's to check).
    const coll = seedPage && await card.evaluate((el, e) => el._hass.callWS({ type: "virtual_pet/collection", entity_id: e, shared: false })
      .catch((err) => ({ error: err?.code || String(err) })), seedPet);
    const wantV = seedPage ? Object.keys(seedPage.visitors) : [];
    const wantF = seedBasket ? [wFinds[0].id, wFinds[1].id, leftId] : [];
    check("visitors v2 V-C: an HA restart keeps the seeded collection (its visitors and finds, by virtual_pet/collection)",
      !!coll && coll.world === seedWorld && wantV.every((v) => coll.visitors?.includes(v)) &&
      wantF.every((f) => coll.finds?.[f] === today), JSON.stringify({ want: { visitors: wantV, finds: wantF }, got: coll }));
    check("visitors v2: an HA restart keeps the day's visit (no re-roll), and the card gets it as house.visit",
      !!seedVisit && JSON.stringify(back.visit) === JSON.stringify({ day: seedVisit.day, id: seedVisit.id,
        hours: seedVisit.hours, from: seedVisit.from, until: seedVisit.until }), JSON.stringify({ seeded: seedVisit, got: back.visit }));
    seeded = back.bond?.nickname === "sunbeam";
    check("P3a: an HA restart keeps the bond (back within 90 s of start-up, no page reload)",
      seeded && back.you && back.mark === "same page" && back.s <= 90,
      JSON.stringify({ ...back, downForS: Math.round((upAt - downAt) / 1000) }));
    check("D5: after a real HA restart the snapshot carries house.powered_on (new, just now)",
      !!back.powered && back.powered !== poweredBefore && Math.abs(Date.now() - Date.parse(back.powered)) < 10 * 60000,
      JSON.stringify({ before: poweredBefore, after: back.powered }));
    check("P3a: the seeded wish is aimed at dev on dev's own card",
      back.aimed === true && /play a game with you/.test(back.wishRow || ""), JSON.stringify(back));
    // The same aimed wish on dev's own card turned shared screen: no "mine"
    // from the server, and the plain wish in the status and the first look.
    const sharedWish = await card.evaluate(async (el, e) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
      localStorage.setItem("hatch-shared-screen", "on");
      el._subscribe(s, true);
      for (let i = 0; i < 50 && (s.mine !== null || !s.subscribed); i++) await wait(100);
      const out = { mine: s.mine, asleep: !!s.asleep };
      s.settings = false; s.statusHtml = null; el._renderStatus(s, []);
      out.wish = [...s.status.querySelectorAll(".row")].find((r) => /^wish/.test(r.textContent.trim()))?.textContent.trim() || null;
      for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish)-/.test(k)) localStorage.removeItem(k);
      // Awake for the first look (it says nothing to a sleeping pet's screen).
      const was = s.asleep;
      s.asleep = false; s.lookedFirst = false; s.queue = [];
      el._firstLook(s);
      s.asleep = was;
      out.look = s.queue.map((q) => q.text);
      s.queue = [];
      localStorage.setItem("hatch-shared-screen", "off");
      s.statusHtml = null;
      el._subscribe(s, true);
      for (let i = 0; i < 50 && s.mine?.bond?.nickname !== "sunbeam"; i++) await wait(100);
      return out;
    }, seedPet);
    const sharedSaid = `${sharedWish.wish}|${sharedWish.look.join("|")}`;
    check("P3b: a wish aimed at dev is plain on dev's card turned shared screen (no mine, no name)",
      seeded && sharedWish.mine === null && /play a game together/.test(sharedWish.wish || "") &&
      sharedWish.look.some((t) => /play a game today|a game today would be fun|playing mood today/.test(t)) &&
      !/sunbeam|with you|with me/.test(sharedSaid), JSON.stringify(sharedWish));
  } else {
    check("P3a: HA restart and the seeded bond can run (set HA_CONFIG and HA_START with HA_URL)", false,
      "no HA_CONFIG/HA_START: the restart and the seeded second login didn't run");
  }

  }
  if (enter("gifts")) {
  // 8a. Gifts (visitors v2 §5, V-E2), on the gift restart seeded for dev (the world's
  // gift-only find). While it waits: the open card says nothing (a gift isn't an
  // interruption); a shared screen's first look sends nothing and says nothing, the
  // server refuses a take without shared: false, and a shared collection has no gifts; a
  // shared flip drops a pop and its line. Then two fresh tabs of dev race their first
  // looks: exactly one non-empty take and one gift line across both. After: the house
  // page has no gift, dev's own has it, and no state or event carried it. Then the
  // tab-back rule (owner Q1) on the card, with the take stubbed.
  const giftOnly = giftBounce && (JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet",
    "frontend", "worlds.json"), "utf8"))[giftBounce.world]?.finds || []).find((f) => f.gift_only);
  if (!giftOnly) {
    check("V-E2: the gifts section can seed a gift (restart ran with HA_CONFIG and HA_START; its world has a gift-only find)", false,
      "no bounce: restart didn't run, or no gift-only find");
  } else {
  await calm();
  const giftSeed = { id: giftOnly.id, world: giftBounce.world };
  const gid = giftSeed.id;
  // Seeded in this section's own bounce (review #15), with every card on the page a
  // shared screen meanwhile: after a restart a card may see its slides' pets anew (a
  // first look again, which would take the gift). Back personal, every slide's look done.
  const everyCard = (fn, arg) => page.locator("hatch-pet-card").evaluateAll(fn, arg);
  const poweredWas = await everyCard(async (els, e) => {
    localStorage.setItem("hatch-shared-screen", "on");
    els.forEach((el) => el._goShared());
    for (let i = 0; i < 50 && !els[0]._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.subscribed; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return els[0]._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.house?.powered_on?.at ?? null;
  }, seedPet);
  await giftBounce.bounce(await signIn(), giftBounce.entryId, (data) => {
    data.bonds = { ...(data.bonds || {}), [me]: { ...(data.bonds?.[me] || {}), gift: giftSeed } };
  });
  // HA is back when the card hears the new powered_on (as restart's D5 check reads it).
  await everyCard(async (els, { e, was }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 900; i++) {
      const s = els[0]?._slides?.find((x) => x.ids?.["sensor.life_stage"] === e);
      if (s?.subscribed && (s.house?.powered_on?.at ?? null) !== was) break;
      await wait(100);
    }
    await wait(1000);
    els.forEach((el) => el._slides.forEach((x) => { x.lookedFirst = true; }));
    localStorage.setItem("hatch-shared-screen", "off");
    els.forEach((el) => el._goPersonal());
  }, { e: seedPet, was: poweredWas });
  // _goPersonal asks the channel again; dev's own view (mine, with the seeded gift) is
  // back when it answers, which on a slow runner after a restart takes more than the
  // checks below would wait. Wait for that answer (a dev with a bond has a mine).
  await everyCard(async (els, e) => {
    for (let i = 0; i < 300; i++) {
      const s = els[0]?._slides?.find((x) => x.ids?.["sensor.life_stage"] === e);
      if (s?.subscribed && s.mine) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, seedPet);
  await pinAwake(card, "gifts");
  // FINDS_SHOWN on (the default): with restart's basket waiting, the basket shows on the
  // slide on screen.
  const on = await card.first().evaluate((el, e) => {
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    el._basketSync(s);
    const b = s.basket;
    return { def: customElements.get("hatch-pet-card").findsShown, onShow: s === el._slides[el._index],
      basket: s.house?.basket ?? null, shown: !!b && !b.hidden && getComputedStyle(b).display !== "none" };
  }, seedPet);
  check("FINDS_SHOWN on by default: with a full basket waiting, the basket shows",
    on.def === true && on.onShow && on.basket > 0 && on.shown, JSON.stringify(on));
  // The switch still works off (HatchPetCard.findsShown = false), with dev's gift and
  // restart's basket both waiting: no basket shows, a tap, a tab-back and a direct take
  // send no collect, and no pop or reveal appears. Then it goes back on for the real
  // features below.
  const off = await card.first().evaluate(async (el, e) => {
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    const conn = el._hass.connection;
    const sent = [];
    const real = conn.sendMessagePromise;
    conn.sendMessagePromise = function (msg, ...a) {
      if (msg?.type === "virtual_pet/collect") sent.push(JSON.stringify(msg));
      return real.call(this, msg, ...a);
    };
    const onShow = s === el._slides[el._index];
    const Card = customElements.get("hatch-pet-card");
    Card.findsShown = false;
    try {
      el._basketSync(s);
      s.giftAgain = true;
      el._giftReturn(s);
      await el._giftTake(s);
      await el._basketTap(s);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      conn.sendMessagePromise = real;
      s.giftAgain = false;
    }
    const shown = (b) => !!b && !b.hidden && getComputedStyle(b).display !== "none";
    const res = { def: Card.findsShown, onShow, gift: !!s.mine?.gift,
      basket: s.house?.basket ?? null, baskets: el._slides.filter((x) => shown(x.basket)).length,
      reveals: el._slides.filter((x) => x.screen?.querySelector(".reveal")).length, sent };
    Card.findsShown = true;
    el._slides.forEach((x) => el._basketSync(x));
    return res;
  }, seedPet);
  check("FINDS_SHOWN set false: with a gift and a full basket waiting, no basket or pop shows and no collect is sent",
    off.def === false && off.onShow && off.gift && off.basket > 0 && off.baskets === 0 && off.reveals === 0 &&
    off.sent.length === 0, JSON.stringify(off));
  await showFinds();
  // Everything this page sends to the pet from here on, and every event on the bus.
  const held = await card.first().evaluate(async (el, e) => {
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    const conn = el._hass.connection;
    el.__giftSent = [];
    if (!conn.__giftSend) {
      conn.__giftSend = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        if (/^virtual_pet\//.test(msg?.type || "")) el.__giftSent?.push(JSON.stringify(msg));
        return conn.__giftSend.call(this, msg, ...a);
      };
    }
    window.__giftBus = [];
    window.__giftBusOff = await conn.subscribeEvents((ev) => window.__giftBus.push(JSON.stringify(ev)));
    const said = [];
    new MutationObserver(() => said.push(s.bubble.textContent)).observe(s.bubble, { childList: true, characterData: true, subtree: true });
    await new Promise((r) => setTimeout(r, 3000));
    return { gift: s.mine?.gift ?? null, lookedFirst: !!s.lookedFirst, sent: el.__giftSent.slice(),
      said: [...said, ...(s.queue || []).map((q) => q.text)].filter(Boolean) };
  }, seedPet);
  const giftLines = /made this for you|found this for you|saved this .* for you|for you! ♥/;
  check("V-E2: the seeded gift reaches dev's own card as mine.gift {id, world}",
    JSON.stringify(held.gift) === JSON.stringify(giftSeed), JSON.stringify({ seeded: giftSeed, got: held.gift }));
  check("V-E2: a gift arriving on an open card (its first look done) is not said, and nothing is taken",
    held.lookedFirst && !held.sent.some((m) => /"gift":true/.test(m)) && !held.said.some((t) => giftLines.test(t)),
    JSON.stringify(held));
  // Shared: this card turned shared screen (the real _goShared), with a pop and its line up
  // first; then its first look again, and the server asked directly.
  const shared = await card.first().evaluate(async (el, { e, g }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    const id = s.ids["sensor.life_stage"];
    el._giftPop(s, g);
    el._queue(s, "found this for you ♥", 5000, { type: "gift" });
    const popped = !!s.screen.querySelector(".reveal.gift");
    localStorage.setItem("hatch-shared-screen", "on");
    el._goShared();
    const out = { popped, popAfter: !!s.screen.querySelector(".reveal.gift") || !!s.giftPop,
      lineAfter: (s.queue || []).some((q) => q.type === "gift") };
    for (let i = 0; i < 50 && (s.mine !== null || !s.subscribed); i++) await wait(100);
    el.__giftSent = [];
    const was = s.asleep;
    Object.assign(s, { asleep: false, lookedFirst: false, queue: [], sayUntil: 0 });
    el._firstLook(s);
    s.asleep = was;
    await wait(1500);
    out.mine = s.mine;
    out.look = (s.queue || []).map((q) => q.text);
    out.sent = el.__giftSent.filter((m) => /virtual_pet\/collect/.test(m));
    const err = (p) => p.then((r) => ({ ok: r }), (x) => ({ error: x?.code || String(x) }));
    out.noShared = await err(el._hass.callWS({ type: "virtual_pet/collect", entity_id: id, gift: true }));
    out.sharedTrue = await err(el._hass.callWS({ type: "virtual_pet/collect", entity_id: id, gift: true, shared: true }));
    out.coll = await err(el._hass.callWS({ type: "virtual_pet/collection", entity_id: id, shared: true }));
    localStorage.setItem("hatch-shared-screen", "off");
    s.queue = [];
    el._goPersonal();
    for (let i = 0; i < 50 && !s.mine?.gift; i++) await wait(100);
    out.back = s.mine?.gift ?? null;
    s.lookedFirst = true; // this page sits out the race
    return out;
  }, { e: seedPet, g: giftSeed });
  check("V-E2: a shared flip drops the gift's pop and its queued line (_dropGift)",
    shared.popped && !shared.popAfter && !shared.lineAfter, JSON.stringify(shared));
  check("V-E2: a shared screen's first look sends no collect and says no gift line (mine is null there)",
    shared.mine === null && shared.sent.length === 0 && !shared.look.some((t) => giftLines.test(t)), JSON.stringify(shared));
  check("V-E2: the server refuses a gift's take without shared: false (error shared), and the gift still waits",
    shared.noShared.error === "shared" && shared.sharedTrue.error === "shared" &&
    JSON.stringify(shared.back) === JSON.stringify(giftSeed), JSON.stringify(shared));
  check("V-E2: a shared screen's collection reply has no gifts",
    !!shared.coll.ok && !("gifts" in shared.coll.ok), JSON.stringify(shared.coll));
  // Two fresh tabs of dev, opened together: their spies are in before the card runs.
  await context.addInitScript(() => {
    window.__gift = { said: [], replies: [], looks: [] };
    customElements.whenDefined("hatch-pet-card").then(() => {
      const P = customElements.get("hatch-pet-card").prototype;
      if (P.__giftSpy) return;
      P.__giftSpy = true;
      const say = P._sayLine;
      P._sayLine = function (s, q) {
        window.__gift.said.push(q?.text);
        return say.call(this, s, q);
      };
      const take = P._giftTake;
      P._giftTake = function (s) {
        const hass = this._hass;
        if (hass && !hass.__giftSpy) {
          hass.__giftSpy = true;
          const real = hass.callWS.bind(hass);
          hass.callWS = (msg) => {
            const p = real(msg);
            if (msg?.type === "virtual_pet/collect" && msg.gift) {
              p.then((r) => window.__gift.replies.push(r), (x) => window.__gift.replies.push({ error: x?.code || String(x) }));
            }
            return p;
          };
        }
        return take.call(this, s);
      };
    });
  });
  const tabs = [];
  await Promise.all([0, 1].map(async (i) => {
    const pg = await context.newPage();
    pg.on("pageerror", (err) => errors.push(`gifts tab ${i}: ${err}`));
    tabs.push(pg);
    try {
      await pg.goto(`${HA}/pet-bench/pet`);
      await pg.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
      await settle(pg);
      await pg.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
      const c = pg.locator("hatch-pet-card").first();
      // Woken only if the pet is asleep here (pinAwake clears the queues: a look that
      // already ran has queued its lines, and its gift's, and must keep them).
      if (await c.evaluate((el) => el._slides.some((x) => x.asleep))) await pinAwake(c, `gifts tab ${i}`);
      const n = await pg.locator("hatch-pet-card .slide").count();
      for (let k = 0; k < n; k++) {
        if (await c.evaluate((el, e) => el._slides?.[el._index]?.ids?.["sensor.life_stage"] === e, seedPet)) break;
        await pg.locator("hatch-pet-card .nav.next").click();
        await pg.waitForTimeout(700);
      }
    } catch (err) {
      errors.push(`gifts tab ${i}: ${err.message}`);
    }
  }));
  const race = [];
  for (const pg of tabs) {
    const c = pg.locator("hatch-pet-card").first();
    race.push(await c.evaluate(async (el, e) => {
      const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
      for (let i = 0; i < 250 && (!s?.lookedFirst || s.gifting || s.queue?.some((q) => q.type === "gift")); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const find = el._worlds?.[s.mine?.gift?.world || ""]?.finds;
      return { ...window.__gift, lookedFirst: !!s?.lookedFirst, onShow: el._slides[el._index] === s,
        mine: s?.mine?.gift ?? null, pop: s?.giftPop ? s.giftPop.el.querySelector(".rf").dataset.find : null,
        queue: (s?.queue || []).map((q) => q.text), hasFind: !!find };
    }, seedPet).catch((err) => ({ error: err.message })));
  }
  const replies = race.flatMap((r) => r.replies || []);
  const full = replies.filter((r) => r?.gift);
  const lines = race.flatMap((r) => (r.said || []).filter((t) => giftLines.test(t || "")));
  const wantLine = giftSeed && (["acorncup", "knittedheart", "paperboat"].includes(gid) ? "made this for you ♥" : "found this for you ♥");
  check("V-E2: two tabs of dev: exactly one non-empty take ({gift: {id, world}}), at most one empty, no error",
    full.length === 1 && JSON.stringify(full[0].gift) === JSON.stringify(giftSeed) &&
    replies.length - full.length <= 1 && replies.every((r) => !r?.error && "gift" in r), JSON.stringify(race));
  check(`V-E2: two tabs of dev: exactly one gift line across both (V6 for the gift-only ${gid}: "${wantLine}"), with the pop`,
    lines.length === 1 && (lines[0] === wantLine || lines[0] === "for you! ♥") &&
    race.filter((r) => r.pop === `${giftSeed.world}/${gid}`).length <= 1, JSON.stringify({ lines, race }));
  for (const pg of tabs) await pg.close().catch(() => {});
  await page.bringToFront();
  // After the take: dev's card (sat out) said nothing and holds no gift; the pages and the bus.
  const after = await card.first().evaluate(async (el, { e, g }) => {
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    const id = s.ids["sensor.life_stage"];
    for (let i = 0; i < 30 && s.mine?.gift; i++) await new Promise((r) => setTimeout(r, 100));
    const mine = await el._hass.callWS({ type: "virtual_pet/collection", entity_id: id, shared: false });
    const house = await el._hass.callWS({ type: "virtual_pet/collection", entity_id: id, shared: true });
    window.__giftBusOff?.();
    const ents = Object.keys(el._hass.states).filter((k) => el._hass.entities?.[k]?.device_id === s.ids.device);
    return { gift: s.mine?.gift ?? null, sent: el.__giftSent.filter((m) => /"gift":true/.test(m) && /"shared":false/.test(m)),
      mineGifts: mine.gifts, mineFinds: Object.keys(mine.finds || {}), houseFinds: Object.keys(house.finds || {}),
      houseGifts: "gifts" in house, states: JSON.stringify(ents.map((k) => el._hass.states[k])), nEnts: ents.length,
      bus: window.__giftBus.filter((x) => x.includes(g) || /"gifts?"/.test(x)), nBus: window.__giftBus.length };
  }, { e: seedPet, g: gid });
  check("V-E2: after the take, dev's open card holds mine.gift null and sent no take of its own",
    after.gift === null && after.sent.length === 0, JSON.stringify({ gift: after.gift, sent: after.sent }));
  giftsTaken = Array.isArray(after.mineGifts) ? after.mineGifts : [];
  check("V-E2: the gift is on dev's own page (gifts), never in the house finds map (finding #7)",
    Array.isArray(after.mineGifts) && after.mineGifts.includes(gid) && !after.mineFinds.includes(gid) &&
    !after.houseFinds.includes(gid) && !after.houseGifts, JSON.stringify(after));
  check("V-E2: no sensor state or attribute and no bus event carries the gift",
    after.nEnts > 0 && !after.states.includes(gid) && !/"gifts?"/.test(after.states) && after.nBus > 0 && after.bus.length === 0,
    JSON.stringify({ nEnts: after.nEnts, nBus: after.nBus, bus: after.bus }));
  // Owner Q1 on the card, the take stubbed (the server's is checked above): a tab back after
  // AWAY_NOTE_AFTER_MS hidden takes a waiting gift and says it; a short absence doesn't.
  const q1 = await card.first().evaluate(async (el, { e, g }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
    const hass = el._hass;
    const real = hass.callWS;
    const calls = [];
    hass.callWS = (msg) => {
      if (msg?.type === "virtual_pet/collect" && msg.gift) {
        calls.push(msg);
        return Promise.resolve({ gift: g });
      }
      return real.call(hass, msg);
    };
    const run = async (hiddenMs) => {
      Object.assign(s, { queue: [], sayUntil: 0, flairUntil: 0, visitUntil: 0 });
      s.mine = { ...(s.mine || {}), gift: g };
      el._hiddenAt = Date.now() - hiddenMs;
      el._onHidden(); // the page is visible: a return
      el.hass = { ...el._hass, states: { ...el._hass.states } }; // fresh states: a long absence's new look may begin (fresh-moment 1)
      const said = [];
      const was = el._sayLine;
      el._sayLine = function (sl, q) { said.push(q.text); return was.call(this, sl, q); };
      // The new look's greeting and lines come first: skip through them to the gift's.
      for (let i = 0; i < 25; i++) {
        await wait(100);
        s.sayUntil = 0;
      }
      delete el._sayLine;
      const pop = !!s.screen.querySelector(".reveal.gift");
      el._dropGift(s);
      return { said, pop, again: !!s.giftAgain };
    };
    const short = await run(60 * 1000);
    const nShort = calls.length;
    const long = await run(3 * 3600 * 1000 + 1000);
    hass.callWS = real;
    s.mine = { ...(s.mine || {}), gift: null };
    s.giftAgain = false;
    return { short, nShort, long, nLong: calls.length - nShort, shared: calls.every((m) => m.shared === false) };
  }, { e: seedPet, g: giftSeed });
  check("V-E2 (owner Q1): a tab back after a short absence takes nothing; after AWAY_NOTE_AFTER_MS it takes and says the gift",
    q1.nShort === 0 && !q1.short.said.some((t) => giftLines.test(t || "")) && q1.nLong === 1 && q1.shared &&
    q1.long.said.some((t) => giftLines.test(t || "")) && q1.long.pop, JSON.stringify(q1));
  await unpinAwake(card);
  }
  }
  if (enter("finds")) {
  // 8b. The basket and the reveal (visitors v2 §3, V-C), on the basket restart seeded:
  // its picture with no number; nothing said on open; a tap is one virtual_pet/collect (a
  // websocket command: no call_service, so who tapped isn't recorded) and never a pat or
  // the status; a double tap sends one; the finds come out one by one with their lines
  // (V1, V2 with its sparkle, V3 by the visitor's name); a second screen loses its basket
  // at once, quietly; a second tap gets []; the empty basket is saved at once. Then, on
  // the card alone: not tappable asleep (C1), calm, compact, and the away note's bit (V8).
  if (!basketSeed) {
    check("V-C: the finds section has restart's seeded basket (set HA_CONFIG and HA_START)", false,
      "no seeded basket: restart didn't run or its world has too few finds");
  } else {
  await page.setViewportSize({ width: 420, height: 860 }); // lowbattery ends at 330
  await page.waitForTimeout(500);
  await calm();
  await pinAwake(card, "finds");
  await showFinds();
  const W = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
  const fw = W[basketSeed.world];
  const aOf = (id) => fw.finds.find((f) => f.id === id).a;
  const seedB = basketSeed.basket;
  const leaverName = fw.visitors.find((v) => v.id === seedB[2].from).name;
  // Any line about a find: its name, or the reveal's words.
  const findWords = new RegExp(`${fw.finds.map((f) => f.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|a new one`, "i");
  // The pet seeded is on show (restart brought it forward).
  const onShow = await card.first().evaluate((el, e) => el._slides[el._index].ids?.["sensor.life_stage"] === e, seedPet);
  // A second screen (the same login, another tab): open with the basket full.
  const p2 = await context.newPage();
  p2.on("pageerror", (e) => errors.push(`finds tab: ${e}`));
  let el2 = null;
  try {
    await p2.goto(`${HA}/pet-bench/pet`);
    await p2.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await settle(p2);
    await p2.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
    el2 = p2.locator("hatch-pet-card").first();
    const n2 = await p2.locator("hatch-pet-card .slide").count();
    for (let i = 0; i < n2; i++) {
      if (await el2.evaluate((c, e) => c._slides?.[c._index]?.ids?.["sensor.life_stage"] === e, seedPet)) break;
      await p2.locator("hatch-pet-card .nav.next").click();
      await p2.waitForTimeout(700);
    }
    // Everything its bubble says from here on, and its collect calls.
    await el2.evaluate((c) => {
      const s = c._slides[c._index];
      c.__said = [s.bubble.textContent, ...(s.queue || []).map((q) => q.text)];
      new MutationObserver(() => c.__said.push(s.bubble.textContent)).observe(s.bubble, { childList: true, characterData: true, subtree: true });
      c.__collects = 0;
      const conn = c._hass.connection;
      const real = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        if (msg?.type === "virtual_pet/collect" && !msg.gift) c.__collects++; // a gift's take isn't the basket's
        return real.call(this, msg, ...a);
      };
    });
    await p2.waitForTimeout(3000);
  } catch (err) {
    errors.push(`finds tab: ${err.message}`);
  }
  const open2 = el2 && await el2.evaluate((c) => {
    const s = c._slides[c._index];
    return { basket: s.house?.basket, hidden: s.basket.hidden, src: s.basket.querySelector("img").getAttribute("src"),
      reveal: !!s.reveal, said: c.__said.filter(Boolean), collects: c.__collects };
  });
  check("V-C: a second screen opened with a full basket shows it (basket_3) and says nothing about it, sends no collect",
    onShow && !!open2 && open2.basket === 3 && !open2.hidden && /\/ui\/basket_3\.png/.test(open2.src) && !open2.reveal &&
    open2.collects === 0 && !open2.said.some((t) => findWords.test(t)), JSON.stringify(open2));
  // This card: the basket's picture, no number; the tap lands on the basket, not the pet.
  const look = await card.first().evaluate((el) => {
    const s = el._slides[el._index];
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0, flairUntil: 0, visitUntil: 0, poseUntil: 0, movingUntil: 0 });
    s.screen.classList.remove("show-status");
    el._basketSync(s);
    const b = s.basket;
    const r = b.getBoundingClientRect();
    const hit = el.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { hidden: b.hidden, live: !b.classList.contains("idle"), src: b.querySelector("img").getAttribute("src"),
      text: b.textContent.trim(), label: b.getAttribute("aria-label"), hit: hit === b, w: Math.round(r.width),
      said: [s.bubble.textContent, ...(s.queue || []).map((q) => q.text)],
      hitEl: hit ? `${hit.tagName}.${hit.className}` : null, path: location.pathname, vis: document.visibilityState,
      screenW: Math.round(s.screen.getBoundingClientRect().width), px: getComputedStyle(b).width,
      none: (() => { const out = []; for (let n = b; n && n !== el.shadowRoot; n = n.parentNode) {
        if (n.nodeType === 1 && getComputedStyle(n).display === "none") out.push(`${n.tagName}.${n.className}`); } return out; })() };
  });
  check("V-C: the seeded basket shows its picture (basket_3), no number, labelled \"the basket\", live, on top at its centre",
    !look.hidden && look.live && /\/ui\/basket_3\.png/.test(look.src) && look.text === "" && look.label === "the basket" &&
    !/\d/.test(look.label) && look.hit, JSON.stringify(look));
  check("V-C: nothing is said on open with a full basket", !look.said.some((t) => findWords.test(t || "")), JSON.stringify(look.said));
  // Asleep (C1): shown, not live, and a tap sends nothing. Then the spy: every service
  // call and pet message from here on.
  const asleep = await card.first().evaluate(async (el) => {
    const s = el._slides[el._index];
    el.__calls = [];
    const conn = el._hass.connection;
    if (!conn.__realSend) {
      conn.__realSend = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        if (msg?.type === "call_service" || /^virtual_pet\//.test(msg?.type || "")) el.__calls?.push(msg.type);
        return conn.__realSend.call(this, msg, ...a);
      };
    }
    s.asleep = true;
    el._basketSync(s);
    const out = { hidden: s.basket.hidden, idle: s.basket.classList.contains("idle"), pe: getComputedStyle(s.basket).pointerEvents };
    await el._basketTap(s, { stopPropagation() {}, detail: 0 });
    out.calls = el.__calls.slice();
    s.asleep = false;
    el._basketSync(s);
    return out;
  });
  check("V-C: a sleeping pet's basket shows but isn't live (taps go to the screen), and a tap sends nothing (C1)",
    !asleep.hidden && asleep.idle && asleep.pe === "none" && asleep.calls.length === 0, JSON.stringify(asleep));
  // The tap: two clicks at once, the reveal watched to its end.
  const tap = await card.first().evaluate(async (el) => {
    const s = el._slides[el._index];
    const said = [];
    const obs = new MutationObserver(() => said.push(s.bubble.textContent));
    obs.observe(s.bubble, { childList: true, characterData: true, subtree: true });
    let pats = 0;
    const realPat = el._pat;
    el._pat = function (...a) { pats++; return realPat.apply(this, a); };
    const patAt = s.patAt;
    s.basket.click();
    s.basket.click(); // re-entry: the first is in flight
    const status = s.screen.classList.contains("show-status");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 50 && !s.reveal; i++) await wait(100);
    const R = s.reveal;
    const out = { status, pats, finds: R?.finds || null, bursts: 0 };
    if (R) new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains("burst")) out.bursts++; })
      .observe(R.el, { childList: true });
    await wait(1200);
    // A pat mid-reveal: the wiggle only (no line, the pat clock untouched).
    const patAt2 = s.patAt;
    el._pat(s, { stopPropagation() {}, detail: 0 });
    out.patMid = s.patAt === patAt2;
    out.basketHiddenMid = s.basket.hidden;
    for (let i = 0; i < 120 && s.reveal; i++) await wait(100);
    obs.disconnect();
    el._pat = realPat;
    Object.assign(out, { shown: R?.shown || [], said: [...new Set(said.filter(Boolean))], patAt: s.patAt === patAt,
      quiet: !!R?.quiet, end: { reveal: !!s.reveal, hidden: s.basket.hidden, basket: s.house?.basket, visitUntil: s.visitUntil },
      calls: el.__calls.slice(), baby: !!el._babySet(s, "find") });
    return out;
  });
  const ids = seedB.map((f) => `${f.world}/${f.id}`);
  check("V-C: a basket tap is one virtual_pet/collect and no call_service (two clicks at once: one call)",
    JSON.stringify(tap.calls) === JSON.stringify(["virtual_pet/collect"]), JSON.stringify(tap.calls));
  check("V-C: a basket tap is not a pat and doesn't open the status",
    tap.pats === 0 && tap.patAt && !tap.status, JSON.stringify({ pats: tap.pats, patAt: tap.patAt, status: tap.status }));
  check("V-C: the reveal shows the basket's finds in order, the basket gone meanwhile, and ends clean",
    JSON.stringify(tap.shown) === JSON.stringify(ids) && tap.basketHiddenMid &&
    !tap.end.reveal && tap.end.hidden && tap.end.basket === 0 && !tap.end.visitUntil, JSON.stringify(tap));
  const v1 = [`${aOf(seedB[0].id)}! ♪`, `look, ${aOf(seedB[0].id)} ♪`, `ooh, ${aOf(seedB[0].id)}~`];
  const v2 = `${aOf(seedB[1].id)}! a new one ✦`;
  const v3 = `the ${leaverName} left ${aOf(seedB[2].id)} ♪`;
  const linesOk = tap.baby
    ? tap.said.some((t) => /yay yay!|hehe!/.test(t))
    : tap.said.some((t) => v1.some((x) => t.includes(x))) && tap.said.some((t) => t.includes(v2)) &&
      tap.said.some((t) => t.includes(v3)); // the bubble may carry the pet's sound first
  check("V-C: the reveal's lines: V1 for a find met before, V2 for a first-ever one, V3 by the visitor's name (baby: BABY.find)",
    !tap.quiet && linesOk, JSON.stringify({ said: tap.said, want: tap.baby ? "baby" : [v1, v2, v3] }));
  check("V-C: a first-ever find sparkles (one sparkle for one new find); a pat mid-reveal only wiggles",
    tap.bursts === 1 && tap.patMid, JSON.stringify({ bursts: tap.bursts, patMid: tap.patMid }));
  const after2 = el2 && await el2.evaluate((c) => {
    const s = c._slides[c._index];
    return { basket: s.house?.basket, hidden: s.basket.hidden, reveal: !!s.reveal, said: c.__said.filter(Boolean), collects: c.__collects };
  });
  check("V-C: the second screen's basket goes at once, with no line and no reveal (review C2)",
    !!after2 && after2.basket === 0 && after2.hidden && !after2.reveal && after2.collects === 0 &&
    !after2.said.some((t) => findWords.test(t)), JSON.stringify(after2));
  await p2.close().catch(() => {});
  // A second tap (another screen late): [] and nothing shown; the empty basket was saved at once.
  const again = await card.first().evaluate(async (el, e) => (await el._hass.callWS({ type: "virtual_pet/collect", entity_id: e })), seedPet);
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.HA_CONFIG, ".storage", `virtual_pet.${basketSeed.entryId}`), "utf8")).data;
  const savedLeft = (saved.basket || []).filter((b) => seedB.some((x) => x.id === b.id && x.world === b.world));
  check("V-C: a second collect gets [] and the emptied basket is already saved (no restart can bring it back)",
    Array.isArray(again?.finds) && again.finds.length === 0 && savedLeft.length === 0,
    JSON.stringify({ again, savedLeft }));
  // On the card alone (no server): compact shows the basket; calm shows the find still.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const local = await card.first().evaluate(async (el, f) => {
    const s = el._slides[el._index];
    const was = s.house;
    s.house = { ...(s.house || {}), basket: 2 };
    el._card.classList.add("compact");
    el._basketSync(s);
    const out = { compactShown: getComputedStyle(s.basket).display !== "none", compactShows: el._basketShows(s) };
    s.screen.classList.remove("show-status");
    s.basket.scrollIntoView({ block: "center" }); // elementFromPoint needs it on screen
    const br = s.basket.getBoundingClientRect();
    const sr = s.basket.closest(".screen").getBoundingClientRect();
    const hit = el.shadowRoot.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
    // the 44 px tap box is the ::before; it is tappable when the centre hits the button
    out.tap = { hit: hit === s.basket, inside: br.left >= sr.left && br.right <= sr.right && br.bottom <= sr.bottom + 1,
      w: br.width, w44: parseFloat(getComputedStyle(s.basket, "::before").width) };
    el._card.classList.remove("compact");
    el._basketSync(s);
    out.src = s.basket.querySelector("img").getAttribute("src");
    s.house = was;
    Object.assign(s, { queue: [], sayUntil: 0, sayClass: 0 });
    const R = el._revealStart(s, [f]);
    await new Promise((r) => setTimeout(r, 300));
    const img = R.el.querySelector(".rf");
    out.calm = { shown: !img.hidden, pop: img.classList.contains("pop"), anims: img.getAnimations().length };
    el._revealEnd(s);
    el._basketSync(s);
    out.after = { hidden: s.basket.hidden, reveal: !!s.reveal };
    return out;
  }, seedB[0]);
  await page.emulateMedia({ reducedMotion: null });
  check("V-C: compact shows the basket at 330 (owner 2026-11-02), tappable, 44 px box inside the screen; two waiting show basket_2",
    local.compactShown && local.compactShows && local.tap.hit && local.tap.inside && local.tap.w44 >= 44 && /\/ui\/basket_2\.png/.test(local.src), JSON.stringify(local));
  check("V-C: calm: the find appears still, no pop", local.calm.shown && !local.calm.pop && local.calm.anims === 0 &&
    local.after.hidden && !local.after.reveal, JSON.stringify(local.calm));
  // The away note (V8): one "found <a find>" a find, newest first; the note keeps two bits.
  const note = await card.first().evaluate((el, { world, ids }) => {
    const s = el._slides[el._index];
    const real = el._state;
    const t = (m) => new Date(Date.now() - m * 60000).toISOString();
    const moments = [
      { type: "found", id: ids[0], world, at: t(50) },
      { type: "found", id: "laterfind", world, at: t(40) },
      { type: "found", id: ids[1], world, at: t(30) },
      { type: "found", id: ids[2], world, at: t(20) },
    ];
    el._state = function (slide, key) {
      if (key === "sensor.last_care") return { state: "ok", attributes: { moments, log: [] } };
      return real.call(this, slide, key);
    };
    try {
      return el._awayNote(s, Date.now() - 3600000);
    } finally {
      el._state = real;
    }
  }, { world: basketSeed.world, ids: seedB.map((f) => f.id) });
  check("V-C: the away note says \"found <a find>\", newest first, an unknown find skipped (V8)",
    note === `while you were out, I found ${aOf(seedB[2].id)} and found ${aOf(seedB[1].id)}!`, JSON.stringify(note));
  await card.first().evaluate((el) => { const s = el._slides[el._index]; el._revealEnd(s); s.queue = []; delete el.__calls; });
  }
  }
  if (enter("collection")) {
  // 8a2. The finds page (visitors v2 §4, V-D: _findsLink, _loadFinds, _fetchFinds,
  // _renderFinds, _dropFinds, collectionTiles), on the collection restart seeded (two
  // visitors, three finds, the gift-only id and `laterfind`): "finds ›" in the journal's
  // foot opens it with one virtual_pet/collection {shared: false} (a websocket read: no
  // call_service); "finds · <world>", "‹ journal"; met tiles drawn with their names,
  // unmet ones silhouettes with no name, alt or label; a find with a `when` and the
  // gift-only find hidden until met, the gift-only id and laterfind never in the house's
  // page (D7); no count (D8); no overflow at 420 or 330 (D6); a photo load doesn't flip
  // back to the journal (D3, _fetchPhotos). Then, with the server's reply given gifts on
  // the card's side: the ♥ on the viewer's own screen, dropped on a shared-screen flip
  // (_goShared) and kept in no localStorage key; a shared screen's page has none even if
  // a reply carried them; an error goes back to the journal with no text.
  if (!basketSeed) {
    check("V-D: the collection section has restart's seeded page (set HA_CONFIG and HA_START)", false,
      "no seeded collection: restart didn't run or its world has too few finds");
  } else {
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(500);
  await calm();
  await pinAwake(card, "collection");
  // top10 7a: with FINDS_SHOWN set false, the link and the page are named by what they
  // show, visitors. The switch goes back on after.
  const hidden = await card.first().evaluate(async (el) => {
    const Card = customElements.get("hatch-pet-card");
    const was = Card.findsShown;
    Card.findsShown = false;
    const s = el._slides[el._index];
    const wait = async (ok, ms = 10000) => { for (const t = Date.now(); !ok() && Date.now() - t < ms;) await new Promise((r) => setTimeout(r, 50)); };
    try {
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      el._toggleStatus(s);
      s.status.querySelector(".jlink").click();
      await wait(() => s.status.querySelector(".jfoot .flink"));
      const link = s.status.querySelector(".jfoot .flink")?.textContent;
      s.status.querySelector(".jfoot .flink")?.click();
      const head = s.status.querySelector(".shead .stitle")?.textContent.replace(" · opening…", "");
      return { link, head, world: el._worldName(s).toLowerCase() };
    } finally {
      if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
      el._dropFinds(s);
      s.finds = false;
      s.journal = false;
      Card.findsShown = was;
    }
  });
  check("top10 7a: with finds hidden, the journal's link is \"visitors ›\" and the page \"visitors · <world>\"",
    hidden.link === "visitors ›" && hidden.head === `visitors · ${hidden.world}`, JSON.stringify(hidden));
  await showFinds();
  const W = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
  const cw = basketSeed.world;
  const fw = W[cw];
  const stored = JSON.parse(fs.readFileSync(path.join(process.env.HA_CONFIG, ".storage", `virtual_pet.${basketSeed.entryId}`), "utf8")).data;
  const savedPage = stored.collection?.[cw] || {};
  const giftOnly = fw.finds.filter((f) => f.gift_only).map((f) => f.id);
  const timed = (f) => Array.isArray(f.when) && f.when.length > 0;
  const nameOf = (id) => (fw.finds.find((f) => f.id === id) || fw.visitors.find((v) => v.id === id))?.name;
  // The server's own page first (no stub yet): the house map, and gifts only when not shared.
  const real = await card.first().evaluate(async (el, e) => {
    const ask = (shared) => el._hass.callWS({ type: "virtual_pet/collection", entity_id: e, shared })
      .catch((err) => ({ error: err?.code || String(err) }));
    return { own: await ask(false), shared: await ask(true) };
  }, seedPet);
  const metV = fw.visitors.map((v) => v.id).filter((id) => real.own.visitors?.includes(id));
  const metF = fw.finds.map((f) => f.id).filter((id) => real.own.finds?.[id]);
  check("V-D: the server's page has the seeded finds but neither the gift-only id nor laterfind (D7), and gifts only when not shared",
    !real.own.error && real.own.world === cw && metV.length >= 1 && metF.length >= 2 &&
    giftOnly.every((id) => savedPage.finds?.[id] && !(id in (real.own.finds || {})) && !(id in (real.shared.finds || {}))) &&
    !("laterfind" in (real.own.finds || {})) && Array.isArray(real.own.gifts) && !("gifts" in real.shared),
    JSON.stringify({ saved: savedPage, real }));
  // Open it through the journal's foot, with a spy on every message the card sends.
  const open = async (stub) => card.first().evaluate(async (el, { e, stub }) => {
    const s = el._slides[el._index];
    const conn = el._hass.connection;
    el.__fmsgs = [];
    if (!el.__fprev) {
      el.__fprev = conn.sendMessagePromise;
      conn.sendMessagePromise = function (msg, ...a) {
        el.__fmsgs?.push({ type: msg?.type, entity_id: msg?.entity_id, shared: msg?.shared });
        if (msg?.type === "virtual_pet/collection" && el.__fstub === "error") return Promise.reject({ code: "unknown_command" });
        const p = el.__fprev.call(this, msg, ...a);
        // The server's reply, given gifts here (any screen: the card must ignore them shared).
        return msg?.type === "virtual_pet/collection" && el.__fstub ? p.then((r) => ({ ...r, gifts: el.__fstub })) : p;
      };
    }
    el.__fstub = stub;
    const wait = async (ok, ms = 10000) => { for (const t = Date.now(); !ok() && Date.now() - t < ms;) await new Promise((r) => setTimeout(r, 50)); };
    if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
    el._toggleStatus(s);
    s.status.querySelector(".jlink").click();
    await wait(() => s.status.querySelector(".jfoot .flink"));
    const foot = [...(s.status.querySelector(".jfoot")?.querySelectorAll("button") || [])].map((b) => b.textContent);
    s.status.querySelector(".jfoot .flink").click();
    const loading = s.status.querySelector(".shead .stitle")?.textContent;
    await wait(() => s.status.querySelector(".fgrid") || !s.finds);
    await wait(() => s.status.querySelector(".fgrid") || s.status.querySelector(".jgrid"), 5000); // an error: the journal
    await new Promise((r) => setTimeout(r, 300));
    const grids = [...s.status.querySelectorAll(".fgrid")];
    const tile = (t) => ({ id: (t.querySelector("img")?.getAttribute("src") || "").match(/\/ui\/(?:visitor|find)_[a-z]+_([a-z]+)(?:_1)?\.png/)?.[1],
      locked: t.classList.contains("locked"), alt: t.querySelector("img")?.getAttribute("alt"), label: t.getAttribute("aria-label"),
      text: t.textContent.trim(), heart: !!t.querySelector(".fheart") });
    const box = s.status.getBoundingClientRect();
    return { e: s.ids?.["sensor.life_stage"] === e, finds: s.finds, journal: s.journal, foot, loading,
      head: s.status.querySelector(".shead .stitle")?.textContent.replace(/\s+/g, " ").trim(),
      back: s.status.querySelector(".shead .sback")?.textContent, text: s.status.textContent,
      visitors: grids[0] ? [...grids[0].children].map(tile) : null, tiles: grids[1] ? [...grids[1].children].map(tile) : null,
      fit: s.status.scrollWidth <= s.status.clientWidth && [...s.status.querySelectorAll(".ftile")].every((t) => t.getBoundingClientRect().right <= box.right + 0.5),
      jgrid: !!s.status.querySelector(".jgrid"), note: s.status.querySelector(".status-feedback")?.textContent || "",
      msgs: el.__fmsgs.slice() };
  }, { e: seedPet, stub });
  const a = await open(null);
  const calls = a.msgs.filter((m) => m.type === "virtual_pet/collection");
  check("V-D: \"finds ›\" sits in the journal's foot (\"‹ status\" is in its top band), and opens with \"opening…\"",
    JSON.stringify(a.foot) === JSON.stringify(["finds ›"]) &&
    a.loading === `finds · ${fw.name.toLowerCase()} · opening…`, JSON.stringify({ foot: a.foot, loading: a.loading }));
  check("V-D: one virtual_pet/collection {shared: false} for this pet, and no call_service",
    calls.length === 1 && calls[0].entity_id === seedPet && calls[0].shared === false && !a.msgs.some((m) => m.type === "call_service"),
    JSON.stringify(a.msgs));
  check("V-D: the page is \"finds · <world>\" with \"‹ journal\"", a.e && a.finds && a.head === `finds · ${fw.name.toLowerCase()}` && a.back === "‹ journal",
    JSON.stringify({ head: a.head, back: a.back, finds: a.finds }));
  const wantV = fw.visitors.map((v) => ({ id: v.id, locked: !metV.includes(v.id) }));
  const wantF = fw.finds.filter((f) => !f.gift_only && (metF.includes(f.id) || !timed(f))).map((f) => ({ id: f.id, locked: !metF.includes(f.id) }));
  const same = (got, want) => JSON.stringify((got || []).map((t) => ({ id: t.id, locked: t.locked }))) === JSON.stringify(want);
  const named = (t) => (t.locked ? t.text === "" && t.alt === "" && t.label === null : t.text === nameOf(t.id) && t.alt === "");
  check("V-D: three visitor tiles, the met ones drawn with their names, the other a silhouette", same(a.visitors, wantV) &&
    a.visitors.every(named), JSON.stringify({ want: wantV, got: a.visitors }));
  // A gift dev really received (the gifts section's, when it ran) is drawn with a ♥ on dev's
  // own page (owner Q2): checked apart, and left out of the house's tiles below.
  const gotGifts = (a.tiles || []).filter((t) => giftsTaken.includes(t.id));
  const houseTiles = (a.tiles || []).filter((t) => !giftsTaken.includes(t.id));
  check("V-D: find tiles: met ones drawn with names; unmet plain ones silhouettes with no name, alt or label; unmet `when` finds, the gift-only one and laterfind absent",
    same(houseTiles, wantF) && houseTiles.every(named) && !houseTiles.some((t) => giftOnly.includes(t.id) || t.id === "laterfind") &&
    !houseTiles.some((t) => t.heart) && !/\?\?\?/.test(a.text), JSON.stringify({ want: wantF, got: a.tiles, giftsTaken }));
  if (giftsTaken.length) {
    check("V-D/V-E2: the gift dev took in gifts is drawn on dev's own page with a ♥",
      giftsTaken.filter((id) => fw.finds.some((f) => f.id === id)).every((id) => gotGifts.some((t) => t.id === id && !t.locked && t.heart)),
      JSON.stringify({ giftsTaken, gotGifts }));
  }
  check("V-D: no count on the page (no \"x of y\", %, or progress, D8)", !/\d+\s*(of|\/)\s*\d+|%|progress/i.test(a.text), a.text);
  // D3: a photo load while on the page draws the journal under it no more.
  const photos = await card.first().evaluate(async (el) => {
    const s = el._slides[el._index];
    await el._loadPhotos(s);
    await new Promise((r) => setTimeout(r, 300));
    return { finds: s.finds, grid: !!s.status.querySelector(".fgrid"), journal: !!s.status.querySelector(".jgrid") };
  });
  check("V-D: a photo load while the page is open leaves it open (D3)", photos.finds && photos.grid && !photos.journal, JSON.stringify(photos));
  check("V-D: no overflow at 420 (D6)", a.fit, "");
  await page.setViewportSize({ width: 330, height: 860 });
  await page.waitForTimeout(800);
  const fit330 = await card.first().evaluate((el) => {
    const s = el._slides[el._index];
    const box = s.status.getBoundingClientRect();
    return { compact: el._card.classList.contains("compact"), grid: !!s.status.querySelector(".fgrid"), sw: s.status.scrollWidth, cw: s.status.clientWidth,
      out: [...s.status.querySelectorAll(".ftile")].filter((t) => t.getBoundingClientRect().right > box.right + 0.5).length };
  });
  check("V-D: no overflow at 330 (D6)", fit330.grid && fit330.sw <= fit330.cw && fit330.out === 0, JSON.stringify(fit330));
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(500);
  const back = await card.first().evaluate(async (el) => {
    const s = el._slides[el._index];
    s.status.querySelector(".shead .sback").click();
    for (const t = Date.now(); !s.status.querySelector(".jgrid") && Date.now() - t < 10000;) await new Promise((r) => setTimeout(r, 50));
    return { finds: s.finds, journal: s.journal, grid: !!s.status.querySelector(".jgrid") };
  });
  check("V-D: \"‹ journal\" goes back to the journal", !back.finds && back.journal && back.grid, JSON.stringify(back));
  // The ♥: the reply given gifts here (a met find, one the house never found, the
  // gift-only one, and a `when` find never met, if any).
  const plain = fw.finds.filter((f) => !f.gift_only && !timed(f));
  const unmet = plain.find((f) => !metF.includes(f.id));
  const unmetTimed = fw.finds.find((f) => !f.gift_only && timed(f) && !metF.includes(f.id));
  const gifts = [metF[0], unmet?.id, giftOnly[0], unmetTimed?.id].filter(Boolean);
  const h = await open(gifts);
  const hearts = (h.tiles || []).filter((t) => t.heart).map((t) => t.id).sort();
  check("V-D: on the viewer's own screen their gifts are drawn with a ♥, the house's unfound and the gift-only one too (owner, 2026-11-02)",
    JSON.stringify(hearts) === JSON.stringify([...gifts].sort()) && gifts.every((id) => { const t = h.tiles.find((x) => x.id === id); return t && !t.locked && t.text.startsWith(nameOf(id)); }),
    JSON.stringify({ gifts, tiles: h.tiles }));
  // A shared-screen flip: the page and its ♥ go; nothing of them is kept in localStorage.
  await page.evaluate(() => {
    localStorage.setItem("hatch-shared-screen", "on");
    window.dispatchEvent(new CustomEvent("hatch-shared-changed", { detail: { on: true } }));
  });
  await page.waitForTimeout(500);
  const flip = await card.first().evaluate((el, ids) => {
    const s = el._slides[el._index];
    const store = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join("\n");
    return { finds: s.finds, data: s.findsData, hearts: el.shadowRoot.querySelectorAll(".fheart").length,
      kept: ids.filter((id) => store.includes(id)), words: /collection|gift|♥/.test(store) };
  }, gifts);
  check("V-D: a shared-screen flip drops the page and its ♥; no localStorage key holds them (V-E review #12)",
    !flip.finds && flip.data === null && flip.hearts === 0 && flip.kept.length === 0 && !flip.words, JSON.stringify(flip));
  const sh = await open(gifts);
  const shCalls = sh.msgs.filter((m) => m.type === "virtual_pet/collection");
  check("V-D: a shared screen asks with shared: true and draws no ♥, no gift-only tile, and no unfound gift, even if the reply carried them",
    shCalls.length === 1 && shCalls[0].shared === true && sh.finds && !(sh.tiles || []).some((t) => t.heart || giftOnly.includes(t.id)) &&
    (!unmet || sh.tiles.find((t) => t.id === unmet.id)?.locked) && same(sh.tiles, wantF),
    JSON.stringify({ msgs: sh.msgs, tiles: sh.tiles }));
  await page.evaluate(() => {
    localStorage.setItem("hatch-shared-screen", "off");
    window.dispatchEvent(new CustomEvent("hatch-shared-changed", { detail: { on: false } }));
  });
  await page.waitForTimeout(800);
  // An older server (an error): back to the journal, nothing said.
  const err = await open("error");
  check("V-D: an error stays on the journal with no text", !err.finds && err.journal && err.jgrid && err.note === "" &&
    !/opening…/.test(err.text), JSON.stringify({ finds: err.finds, journal: err.journal, grid: err.jgrid, note: err.note }));
  await card.first().evaluate((el) => {
    const s = el._slides[el._index];
    if (el.__fprev) el._hass.connection.sendMessagePromise = el.__fprev;
    delete el.__fprev; delete el.__fstub; delete el.__fmsgs;
    if (s.screen.classList.contains("show-status")) el._toggleStatus(s);
  });
  await unpinAwake(card);
  }
  }
  if (enter("oldcard")) {
  // 8b. An old card on a stale tablet (privacy P3b): the one just before P3b
  // (v0.37.0) and the last before the channel (v0.35.0, the only one P3b
  // changes visibly), served in place of this card against this server. P3b
  // takes bonds, notify_users and the aimed wish off the sensor and the bond
  // moments off the bus: an old card loses them and must not break. Pass is
  // no "undefined" and no uncaught error; every console error is kept in
  // dev/card-check/old-card-<tag>.json, to compare with a pre-P3b run.
  // P3c adds the media cases: tv_on/music_on, a show's dream, the recap.
  const BOND_MOMENTS = ["bond_up", "bond_record", "bond_favourite", "friend_home", "tucked_in"];
  const oldCard = async (tag) => {
    const root = path.join(__dirname, "..");
    const src = require("child_process").execFileSync("git",
      ["show", `${tag}:custom_components/virtual_pet/frontend/hatch-pet-card.js`],
      { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
    const oldBoot = /const BOOT_VERSION = "([^"]*)"/.exec(src)?.[1] || null;
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, storageState: await context.storageState() });
    await ctx.addInitScript((v) => {
      try {
        if (v) localStorage.setItem("hatch-booted", v);
        localStorage.setItem("hatch-lcd", "off");
        localStorage.setItem("hatch-shared-screen", "off");
      } catch (err) {
        // no storage
      }
    }, oldBoot);
    let served = 0;
    await ctx.route("**/virtual_pet/frontend/hatch-pet-card.js*", (r) => {
      served += 1;
      return r.fulfill({ status: 200, contentType: "text/javascript", body: src });
    });
    const p = await ctx.newPage();
    const errs = [];
    const uncaught = [];
    p.on("pageerror", (e) => { uncaught.push(String(e)); errs.push(String(e)); });
    p.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text());
    });
    const out = { tag, cases: {} };
    try {
      await p.goto(`${HA}/pet-bench/pet`);
      if (await p.waitForSelector('input[autocomplete="username"]', { timeout: 8000 }).catch(() => null)) {
        await p.locator('input[autocomplete="username"]').first().fill(USER.username);
        await p.locator('input[type="password"]').first().fill(USER.password);
        await p.keyboard.press("Enter");
      }
      await p.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
      await settle(p); // the frontend may reload itself once
      await p.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
      const el = p.locator("hatch-pet-card").first();
      const slideCount = await p.locator("hatch-pet-card .slide").count();
      for (let i = 0; i < slideCount; i++) {
        if (await el.evaluate((c, e) => c._slides?.[c._index]?.ids?.["sensor.life_stage"] === e, seedPet)) break;
        await p.locator("hatch-pet-card .nav.next").click();
        await p.waitForTimeout(700);
      }
      const view = () => el.evaluate((c) => {
        const s = c._slides[c._index];
        return { bubble: s.bubble?.textContent || "", status: s.status?.textContent || "",
          queued: (s.queue || []).map((q) => q.text) };
      });
      // The status (the bond row, the aimed wish, the bell where it lives).
      await p.locator("hatch-pet-card .statusbtn").click();
      await p.waitForTimeout(800);
      out.cases.status = await view();
      out.cases.status.wish = await el.evaluate((c) => [...c._slides[c._index].status.querySelectorAll(".row")]
        .find((r) => /^wish/.test(r.textContent.trim()))?.textContent.trim() || null);
      await p.locator("hatch-pet-card .statusbtn").click();
      await p.waitForTimeout(400);
      // A real bond moment: dev's care press takes the seeded bond to level 9.
      const level = () => page.locator("hatch-pet-card").evaluate((c, e) =>
        c._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.mine?.bond?.level ?? null, seedPet);
      const before = await level();
      const said = new Set();
      // Awake first (the card's "wake" tap): care to a sleeping pet is refused.
      if (pet["switch.lights_out"]) {
        await p.evaluate((id) => document.querySelector("home-assistant").hass
          .callService("switch", "turn_off", { entity_id: id }), pet["switch.lights_out"]).catch(() => {});
        await p.waitForTimeout(1500);
      }
      // Not "play": that would grant the seeded wish the second login checks.
      for (const key of ["button.praise", "button.feed", "button.snack", "button.clean"]) {
        if (!pet[key] || (await level()) > before) break;
        await p.evaluate((id) => document.querySelector("home-assistant").hass
          .callService("button", "press", { entity_id: id }), pet[key]).catch(() => {});
        for (let i = 0; i < 10; i++) {
          const v = await view();
          [v.bubble, ...v.queued].forEach((t) => t && said.add(t));
          await p.waitForTimeout(200);
        }
      }
      for (let i = 0; i < 15; i++) {
        const v = await view();
        [v.bubble, ...v.queued].forEach((t) => t && said.add(t));
        await p.waitForTimeout(200);
      }
      const lastCare = pet["sensor.last_care"];
      out.cases.bond = { levelBefore: before, levelAfter: await level(), said: [...said],
        publicMoments: await p.evaluate((id) => (document.querySelector("home-assistant").hass.states[id]
          ?.attributes.moments || []).map((m) => m.type), lastCare) };
      // someone_home on a shared screen (a public moment, injected).
      out.cases.someoneHome = await el.evaluate(async (c, id) => {
        localStorage.setItem("hatch-shared-screen", "on");
        const s = c._slides[c._index];
        s.queue = [];
        const hass = c._hass;
        const st = hass.states[id];
        const moments = [{ type: "someone_home", at: new Date().toISOString() }, ...(st.attributes.moments || [])];
        await hass.callApi("POST", `states/${id}`, { state: st.state, attributes: { ...st.attributes, moments } });
        await new Promise((r) => setTimeout(r, 1500));
        const r = { bubble: s.bubble?.textContent || "", queued: (s.queue || []).map((q) => q.text) };
        localStorage.setItem("hatch-shared-screen", "off");
        return r;
      }, lastCare);
      // 2b: a public became_sick ({type, at}) on an old card: nothing breaks, nothing undefined.
      out.cases.sick = await el.evaluate(async (c, id) => {
        const s = c._slides[c._index];
        s.queue = [];
        const hass = c._hass;
        const st = hass.states[id];
        const moments = [{ type: "became_sick", at: new Date().toISOString() }, ...(st.attributes.moments || [])];
        await hass.callApi("POST", `states/${id}`, { state: st.state, attributes: { ...st.attributes, moments } });
        await new Promise((r) => setTimeout(r, 1500));
        return { bubble: s.bubble?.textContent || "", queued: (s.queue || []).map((q) => q.text) };
      }, lastCare);
      // P3c: what this server sends about the TV, music and a show's dream.
      // The public list has a title-less tv_on and music_on; the sensor's dream
      // is null for a show; the title is on the channel (house.media, house.dream),
      // which v0.35.0 doesn't read. Pushed by hand: the dev pet has no TV.
      out.cases.media = await el.evaluate(async (c, { id, stageId }) => {
        const s = c._slides[c._index];
        const hass = c._hass;
        const me = hass.user?.id;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const post = async (e, attrs) => {
          const st = c._hass.states[e];
          await c._hass.callApi("POST", `states/${e}`, { state: st.state, attributes: { ...st.attributes, ...attrs } });
        };
        const reset = () => { s.queue = []; s.sayUntil = 0; if (s.bubble) s.bubble.textContent = ""; };
        const heard = () => [s.bubble?.textContent || "", ...(s.queue || []).map((q) => q.text)];
        const r = { channel: typeof c._channel === "function" };
        // Live: the public stand-ins, then (a channel card) the titled pushes.
        reset();
        const at = new Date().toISOString();
        await post(id, { moments: [{ type: "music_on", at }, { type: "tv_on", at }, ...(c._hass.states[id].attributes.moments || [])] });
        await wait(1500);
        r.live = heard();
        if (r.channel) {
          reset();
          c._channel(s, { moment: { type: "watching", title: "Bluey Old", at: new Date().toISOString() } }, me);
          await wait(300);
          r.tv = heard();
          reset();
          c._channel(s, { moment: { type: "listening", title: "Clair Old", artist: "Debussy", at: new Date().toISOString() } }, me);
          await wait(300);
          r.music = heard();
        }
        // This morning's dream of a show: null on the sensor, titled on the channel.
        await post(stageId, { dream: null });
        await wait(1000);
        for (const k of Object.keys(localStorage)) if (/^hatch-(dream|wish)-/.test(k)) localStorage.removeItem(k);
        s.lookedFirst = false; s.queue = []; s.sayUntil = Date.now() + 60000;
        if (r.channel) c._channel(s, { house: { media: null, dream: { kind: "watching", title: "Bluey Old" } } }, me);
        c._firstLook(s);
        r.firstLook = (s.queue || []).map((q) => q.text);
        r.dreamSaid = r.firstLook.some((t) => /dreamed/.test(t));
        s.queue = []; s.sayUntil = 0;
        // The recap, from the stand-ins alone (an old card has no bits for them).
        const since = Date.now() - 3600 * 1000;
        const recapAt = new Date(Date.now() - 1800 * 1000).toISOString();
        await post(id, { moments: [{ type: "music_on", at: recapAt }, { type: "tv_on", at: recapAt }], log: [] });
        for (let i = 0; i < 30 && c._hass.states[id]?.attributes.moments?.[0]?.type !== "music_on"; i++) await wait(100);
        r.recap = c._awayNote(s, since);
        return r;
      }, { id: lastCare, stageId: seedPet });
    } catch (err) {
      out.failed = String(err);
    }
    out.served = served;
    out.errors = errs;
    out.uncaught = uncaught;
    const text = JSON.stringify(out.cases);
    out.undefined = /undefined/.test(text);
    out.sunbeam = /sunbeam/.test(text);
    fs.writeFileSync(path.join(OUT, `old-card-${tag}.json`), JSON.stringify(out, null, 2));
    await ctx.close();
    return out;
  };
  for (const tag of ["v0.37.0", "v0.35.0"]) {
    const r = await oldCard(tag);
    check(`P3b: an old card (${tag}) on this server: no "undefined", no uncaught error`,
      seeded && !r.failed && r.served > 0 && !r.undefined && r.uncaught.length === 0,
      JSON.stringify({ failed: r.failed, served: r.served, errors: r.errors.slice(0, 3), uncaught: r.uncaught.slice(0, 3),
        wish: r.cases.status?.wish, bond: r.cases.bond, someoneHome: r.cases.someoneHome, media: r.cases.media }));
    // P3c: the stand-ins say nothing on an old card (no "ooh, undefined!"), and
    // a channel card (v0.37.0) still has its live lines and the show's dream.
    const m = r.cases.media || {};
    const v037 = tag === "v0.37.0";
    check(`P3c: an old card (${tag}): tv_on/music_on say nothing; ${v037 ? "the channel's show, song and dream are said" : "no channel, so no media lines"}`,
      !!r.cases.media && !(m.live || []).some((t) => /TV|music|♪|undefined/.test(t)) &&
        (v037 ? m.channel && (m.tv || []).some((t) => /Bluey Old/.test(t)) &&
          (m.music || []).some((t) => /Clair Old|Debussy/.test(t)) && m.dreamSaid
          : !m.channel && !m.dreamSaid),
      JSON.stringify(m));
    if (tag === "v0.37.0") {
      const b = r.cases.bond || {};
      check("P3b: a real bond level-up puts no bond moment on the public list",
        b.levelAfter > b.levelBefore && !(b.publicMoments || []).some((t) => BOND_MOMENTS.includes(t)),
        JSON.stringify(b));
    }
  }

  // A second, non-admin login on the same dashboard.
  {
    const other = { username: "other", password: "otherother1" };
    const users = await evaluate(() => document.querySelector("home-assistant").hass.callWS({ type: "config/auth/list" }));
    if (!users.some((u) => u.username === other.username)) {
      const { user } = await evaluate(() => document.querySelector("home-assistant").hass
        .callWS({ type: "config/auth/create", name: "Other", group_ids: ["system-users"] }));
      await evaluate((arg) => document.querySelector("home-assistant").hass
        .callWS({ type: "config/auth_provider/homeassistant/create", ...arg }), { user_id: user.id, ...other });
    }
    const devNickname = seeded ? "sunbeam" : await page.locator("hatch-pet-card").evaluate((el, e) =>
      el._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.mine?.bond?.nickname || null, seedPet);
    const ctx2 = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const page2 = await ctx2.newPage();
    const errors2 = [];
    page2.on("pageerror", (e) => errors2.push(String(e)));
    await page2.goto(CLIENT);
    await page2.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await page2.locator('input[autocomplete="username"]').first().fill(other.username);
    await page2.locator('input[type="password"]').first().fill(other.password);
    await page2.keyboard.press("Enter");
    await page2.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await page2.goto(`${HA}/pet-bench/pet`);
    await page2.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await settle(page2); // the frontend may reload itself once
    await page2.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
    const card2 = page2.locator("hatch-pet-card").first();
    // Every payload of Other's channel, from a fresh subscribe on every slide.
    await card2.evaluate(async (el) => {
      window.__payloads = [];
      const conn = el._hass.connection;
      const real = conn.subscribeMessage.bind(conn);
      conn.subscribeMessage = (cb, msg, opts) => real((m) => {
        if (msg?.type === "virtual_pet/subscribe") window.__payloads.push(m);
        cb(m);
      }, msg, opts);
      el._slides.forEach((s) => el._subscribe(s, true));
      for (let i = 0; i < 50 && !el._slides.every((s) => s.subscribed); i++) await new Promise((r) => setTimeout(r, 100));
    });
    await page2.waitForTimeout(1500);
    const view = await card2.evaluate(async (el, e) => {
      const s = el._slides.find((x) => x.ids?.["sensor.life_stage"] === e);
      const id = s.ids["sensor.life_stage"];
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // The status, or the settings sheet (the bell).
      const status = (settings = false) => { s.settings = settings; s.statusHtml = null; el._renderStatus(s, []); return s.status; };
      const sheet = () => status(true);
      const out = { user: el._hass.user.id, admin: el._hass.user.is_admin };
      out.bell = sheet().querySelector(".bell.notify")?.getAttribute("aria-pressed");
      await el._hass.callWS({ type: "virtual_pet/notify_me", entity_id: id, enabled: true });
      for (let i = 0; i < 30 && !s.mine?.notify_me; i++) await wait(100);
      out.bellOn = sheet().querySelector(".bell.notify")?.getAttribute("aria-pressed");
      out.pushed = !!s.mine?.notify_me; // a real push of Other's own view
      out.bond = s.mine?.bond ?? null;
      await el._hass.callWS({ type: "virtual_pet/notify_me", entity_id: id, enabled: false });
      for (let i = 0; i < 30 && s.mine?.notify_me; i++) await wait(100);
      const st = status();
      out.bondRow = [...st.querySelectorAll(".row")].find((r) => /you two/.test(r.textContent))
        ?.querySelector(".hearts")?.getAttribute("aria-label") || null;
      out.wish = [...st.querySelectorAll(".row")].find((r) => /^wish/.test(r.textContent.trim()))?.textContent.trim() || null;
      out.held = JSON.stringify(el._slides.map((x) => ({ mine: x.mine, house: x.house, moments: x.privateMoments })));
      out.payloads = JSON.stringify(window.__payloads);
      // Both views of every slide: the status and the settings sheet.
      out.shown = el._slides.map((x) => [false, true].map((settings) => {
        x.settings = settings; x.statusHtml = null; el._renderStatus(x, []);
        return `${x.status.textContent}|${x.bubble.textContent}|${x.live.textContent}`;
      }).join("|")).join("\n");
      el._slides.forEach((x) => { x.settings = false; x.statusHtml = null; });
      out.nPayloads = window.__payloads.length;
      return out;
    }, seedPet);
    const devStrings = [me, devNickname].filter(Boolean);
    const leaks = devStrings.filter((d) => view.held.includes(d) || view.payloads.includes(d) || view.shown.includes(d));
    const devBell = await page.locator("hatch-pet-card").evaluate((el, e) =>
      el._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.mine?.notify_me, seedPet);
    check("P3a: a second login's card holds and shows nothing of dev's (ID, nickname)",
      view.user !== me && view.nPayloads > 0 && leaks.length === 0,
      JSON.stringify({ leaks, nPayloads: view.nPayloads, seeded, admin: view.admin }));
    check("P3a: a second login has no close bond and no nickname from dev",
      view.bondRow !== "bond level 8 of 10" && !view.shown.includes("sunbeam"), JSON.stringify({ bondRow: view.bondRow }));
    const devBond = await page.locator("hatch-pet-card").evaluate((el, e) =>
      el._slides.find((x) => x.ids?.["sensor.life_stage"] === e)?.mine?.bond ?? null, seedPet);
    check("P3a: after a push, the second login's bond is its own, not dev's",
      view.pushed && devBond !== null && (view.bond === null || JSON.stringify(view.bond) !== JSON.stringify(devBond)),
      JSON.stringify({ pushed: view.pushed, other: view.bond, dev: devBond }));
    check("P3a: the bell is the second login's own setting",
      view.bell === "false" && view.bellOn === "true" && devBell === false, JSON.stringify({ ...view, held: undefined, payloads: undefined, shown: undefined, devBell }));
    check("P3a: a wish aimed at dev is plain on the second login's card",
      seeded && (view.wish === "wish♡ play a game together" || /play a game together/.test(view.wish || "")), String(view.wish));
    check("P3a: no errors in the second login's console", errors2.length === 0, errors2.slice(0, 3).join(" | "));
    // P3b: nothing of dev's on any pet entity in the second login's
    // hass.states either, except the care log's "by" (the HA user's display
    // name, kept by the owner's decision). Needs the seed: a FAIL without it.
    const scan = await page2.evaluate(() => {
      const hass = document.querySelector("home-assistant").hass;
      const out = {};
      for (const [id, st] of Object.entries(hass.states)) {
        if (hass.entities[id]?.platform !== "virtual_pet") continue;
        const attrs = { ...st.attributes };
        if (Array.isArray(attrs.log)) attrs.log = attrs.log.map(({ by, ...rest }) => rest);
        out[id] = attrs;
      }
      return out;
    });
    const scanned = JSON.stringify(scan);
    const stateLeaks = [me, "sunbeam"].filter((d) => scanned.includes(d));
    const keys = ["\"bonds\"", "\"notify_users\"", "\"for_name\"", "\"for\""].filter((k) => scanned.includes(k));
    check("P3b: a second login's hass.states holds nothing of dev's (ID, nickname; log[].by aside)",
      seeded && Object.keys(scan).length > 0 && stateLeaks.length === 0 && keys.length === 0,
      JSON.stringify({ seeded, entities: Object.keys(scan).length, stateLeaks, keys }));
    await ctx2.close();
  }
  }
  if (unseed) {
    await unseed();
    console.log("note: dev's seeded bond and wish are put back as they were");
  }
  await browser.close();

  const ends = [...timings.slice(1).map((t) => t.at), Date.now()];
  const secs = [{ name: "prelude", s: ((timings[0]?.at ?? Date.now()) - T0) / 1000 },
    ...timings.map((t, i) => ({ name: t.name, s: (ends[i] - t.at) / 1000 }))];
  console.log(`\ntime: ${Math.round((Date.now() - T0) / 1000)} s; by section: ${secs.sort((a, b) => b.s - a.s)
    .map((t) => `${t.name} ${Math.round(t.s)}`).join(", ")}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${ONLY ? ` (partial: ${SECTIONS.filter(want).join(",")})` : ""}. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
