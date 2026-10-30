// Drive the pet shelf card in the throwaway HA and check what players see.
//
// Start `scripts/develop` first, then run `scripts/card-check`. On a fresh
// dev/config it onboards the `dev` / `devdevdev` user and creates two pets.
// Screenshots go to dev/card-check/. Exits non-zero if any check fails.
// Needs Playwright with Chromium (preinstalled in the cloud sessions).
//
// Environment: HA_URL (default http://localhost:8123); SCALE=2 for sharp
// screenshots (the README art uses them). HA_CONFIG and HA_START: the
// instance's config dir and the command that starts it, for the restart and
// the seeded second login (section 8). Without HA_URL they default to
// dev/config and scripts/develop: card-check stops your dev HA there and
// starts it again in the background (its log: dev/card-check/ha-restart.log).
// With HA_URL and without them, section 8 fails rather than skip.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const HA = process.env.HA_URL || "http://localhost:8123";
if (!process.env.HA_URL && !process.env.HA_CONFIG && !process.env.HA_START) {
  process.env.HA_CONFIG = path.join(__dirname, "..", "dev", "config");
  process.env.HA_START = `exec ${JSON.stringify(path.join(__dirname, "develop"))}`;
}
const CLIENT = `${HA}/`;
const USER = { username: "dev", password: "devdevdev", name: "Dev" };
const OUT = path.join(__dirname, "..", "dev", "card-check");
const results = [];

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
  // The boot screen shows once per browser: every page here starts as if it had
  // been shown, except the boot checks' (they set the session flag and clear it).
  const bootVersion = /const BOOT_VERSION = "([^"]*)"/.exec(
    fs.readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8"))?.[1];
  await context.addInitScript((v) => {
    try {
      if (!sessionStorage.getItem("cc-boot-test") && v) localStorage.setItem("hatch-booted", v);
      for (const k of Object.keys(localStorage)) if (k.startsWith("hatch-power-")) localStorage.removeItem(k);
    } catch (err) {
      // no storage
    }
  }, bootVersion);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
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
  await page.waitForTimeout(16000); // the frontend reloads itself once after the first load
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

  // 1. The shelf draws its devices.
  const slides = await page.locator("hatch-pet-card .slide").count();
  check("shelf shows the pets", slides >= 2, `${slides} devices`);
  check("sprites load", !(await bubble()).startsWith("missing sprites"));
  await shot("01-shelf");

  // 2. Status and journal.
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(600);
  const status = await cur().locator(".status").innerText();
  check("status screen opens", /weight/.test(status) && /whines/.test(status));
  await shot("02-status");
  // The next egg's creature, picked through its select, shows on the status screen.
  const eggChoice = (await ids())["select.next_egg"];
  const options = await evaluate((e) =>
    document.querySelector("home-assistant").hass.states[e].attributes.options, eggChoice);
  const pickEgg = (option) => evaluate(({ e, option }) => document.querySelector("home-assistant").hass
    .callService("select", "select_option", { entity_id: e, option }), { e: eggChoice, option });
  await pickEgg(options[1]);
  await page.waitForTimeout(800);
  check("the next egg's creature shows",
    (await cur().locator(".status").innerText()).toLowerCase().includes(options[1].toLowerCase()),
    options[1]);
  await cur().locator(".status .row", { hasText: /next egg|hatching/ }).scrollIntoViewIfNeeded();
  await shot("02b-next-egg");
  await pickEgg(options[0]); // back to a surprise
  await page.waitForTimeout(400);
  // The gear opens the settings sheet in the same screen: the status stays up, the
  // switches are there and the stats are not, and focus lands on its back row.
  const statusRows = /weight/.test(await cur().locator(".status").innerText()) && !await cur().locator(".status .bell").count();
  await cur().locator(".status .gear").click();
  await page.waitForTimeout(300);
  const sheet = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    return { open: s.screen.classList.contains("show-status"), back: !!s.status.querySelector(".sback"),
      focus: el.shadowRoot.activeElement?.className, sound: !!s.status.querySelector(".bell.sound"),
      stats: /weight|whines/.test(s.status.textContent), heads: [...s.status.querySelectorAll(".sec")].map((h) => h.textContent) };
  });
  check("the status screen has a gear and no switches; the gear opens the settings sheet over it",
    statusRows && sheet.open && sheet.back && sheet.sound && !sheet.stats, JSON.stringify(sheet));
  check("the gear moves focus to the sheet's back row", sheet.focus === "sback", sheet.focus);
  check("the sheet heads the viewer's rows and this screen's", sheet.heads.join("|") === "for you|this screen", sheet.heads.join("|"));
  await shot("02c-settings");
  // A heading is not a button: tapping it leaves the sheet up.
  await cur().locator(".status .sec").first().click();
  await page.waitForTimeout(300);
  const headBox = await cur().locator(".status .shead").boundingBox();
  await page.mouse.click(headBox.x + headBox.width - 6, headBox.y + headBox.height / 2); // beside the back row
  await page.waitForTimeout(300);
  check("tapping a heading or the back row's empty end leaves the sheet open",
    await cur().locator(".screen.show-status .sback").count() === 1);
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
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);

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
  const calm = async () => {
    await inject(pet["binary_sensor.calling"], { state: "off" });
    await inject(pet["sensor.mood"], { state: "content", attributes: { flags: [], requests: [] } });
  };

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
  for (let i = 0; i < slides; i++) {
    if ((await page.locator("hatch-pet-card .title").innerText()).trim() === petName) break;
    await page.locator("hatch-pet-card .nav.next").click();
    await page.waitForTimeout(700);
  }
  await calm();
  let greeting = "";
  for (let i = 0; i < 30 && !greeting.includes(USER.name); i++) {
    await page.waitForTimeout(500);
    greeting = await bubble();
  }
  check("greets the viewer by first name", greeting.includes(USER.name), greeting);
  await shot("04a-greeting");

  // The bond: looking in starts one for the viewer (virtual_pet.visit), and
  // the private channel brings it to this card alone.
  const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
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
    s.queue = [];
    const before = s.bubble.textContent;
    for (const type of ["bond_up", "bond_record", "tucked_in", "bond_favourite", "friend_home"]) {
      el._moment(s, { type, level: 4, nickname: "sunbeam", game: "left_right", wins: 4, at: new Date().toISOString() });
    }
    el._moment(s, { type: "someone_home", at: new Date().toISOString() });
    const out = { queued: s.queue.map((q) => q.text), bubble: s.bubble.textContent, before };
    s.queue = [];
    localStorage.setItem("hatch-shared-screen", "off");
    el._moment(s, { type: "someone_home", at: new Date().toISOString() });
    out.personal = s.queue.map((q) => q.text);
    s.queue = [];
    return out;
  });
  check("a shared screen's moments name nobody", sharedMoments.queued.join() === "someone's home!! ♥" &&
    sharedMoments.bubble === sharedMoments.before && sharedMoments.personal.length === 0, JSON.stringify(sharedMoments));
  check("a shared screen shows nothing personal", sharedStatus && sharedView.sheetUp && sharedView.statusUp &&
    !sharedView.visited && !sharedView.bondRow &&
    !sharedView.said.includes(USER.name) && !sharedView.said.includes("sunbeam"), JSON.stringify(sharedView));
  // A push from the server may have replaced the close bond set above: again.
  await mineFor({ bond: { level: 8, nickname: "sunbeam" } });
  await page.waitForTimeout(300);
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  // A level-up is said only to the person whose bond grew: from their own
  // channel. Someone else's, still on the public list until P3b, says nothing.
  const mine = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    s.queue = [];
    s.sayUntil = 0;
    el._moment(s, { type: "bond_up", level: 4, nickname: "sunbeam" });
    const out = s.queue.map((q) => q.text);
    s.queue = [];
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
    mine[0] === "can I call you sunbeam? ♥" && theirs.length === 0, `${mine} / ${theirs}`);
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
    el._moment(s, { type: "care_miss", at: new Date().toISOString() });
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
    el._moment(s, { type: "favourite_snack", food: "hazelnuts", at: new Date().toISOString() });
    out.favourite = s.queue.map((q) => q.text);
    s.queue = [];
    s.sayUntil = 0;
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
    voices.miss === "...oh, there you are ♥" && voices.opener === "hmm... sleepy", `${voices.miss} | ${voices.opener}`);
  check("opening the status screen finishes the line", voices.finished);
  check("its favourite snack is said", voices.favourite.join() === "hazelnuts, my favourite!!", voices.favourite.join());
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
    const month = box.querySelector(".bmonth");
    month.value = "2";
    month.dispatchEvent(new Event("change", { bubbles: true }));
    out.febDays = box.querySelector(".bday").options.length;
    month.click();
    box.querySelector(".bday").click();
    out.statusAfterPick = s.screen.classList.contains("show-status");
    box.querySelector(".bday").value = "14";
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
    bday.febDays === 29 && !bday.statusAfterPick && /Feb 14! I'll remember ♥$/.test(bday.reply), JSON.stringify(bday));
  check("a celebration takes the away note's place; yours is by name",
    bday.queue.join("|") === "a|c|I'm 3 months old today! ♥" &&
    /^happy birthday, \S+!! ♥$/.test(bday.yours[0]) &&
    bday.yours[1] === "I'm 11 months old, and we've been friends all that time! ♥", JSON.stringify(bday));
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
  check("a failed save is retried once, the bubble says it slipped away, and the answer is kept for this person",
    waits.tries === 2 && waits.bubble === "hm, that one slipped away ♪" && waits.stash === "fav_weather=snow", JSON.stringify(waits));
  check("a kept answer is sent when the card next gets hass with a user, and cleared",
    waits.resent === "fav_weather=snow" && waits.cleared === null, JSON.stringify(waits));
  check("a kept answer the server did not ask for is dropped, a transport error keeps it",
    waits.dropped === null && waits.kept === true, JSON.stringify(waits));
  check("a dream, a birthday and a shared screen store nothing",
    waits.dream === null && waits.birthday === null && waits.shared === null, JSON.stringify(waits));
  check("forgetting my data removes kept answers", waits.forgotten === null, JSON.stringify(waits));
  check("a retry after the slide changed writes no bubble", waits.late === "", JSON.stringify(waits));
  // A close friend coming home: "you're home!!" to them (their own channel's
  // friend_home), and nothing for anyone else's arrival on a personal card.
  await evaluate((me) => localStorage.removeItem(`hatch-welcomed-${me}`), me);
  const cheers = await page.locator("hatch-pet-card").evaluate((el) => {
    const s = el._slides[el._index];
    const out = [];
    const at = new Date().toISOString(); // the same arrival twice: cheered once
    for (const type of ["friend_home", "friend_home", "someone_home"]) {
      s.queue = [];
      el._moment(s, { type, at });
      out.push(s.queue[0]?.text || "");
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
    el._note(s, { kind: "friends_for", months: 1 });
    el._note(s, { kind: "steps", steps: 11000 });
    el._note(s, { kind: "stairs", floors: 12 });
    el._moment(s, { type: "bond_record", game: "left_right", wins: 4, at: "x" });
    el._moment(s, { type: "tucked_in", at: "z" });
    const out = [...s.queue.map((q) => q.text), s.bubble.textContent]; // the goodnight replaces, not queues
    s.queue = [];
    return out;
  }, me);
  check("private notes, records and goodnights are said to their person",
    secret[0] === "we've been friends for a month! ♥" && secret[1] === "11,000 steps?! you've been busy!" &&
    secret[2] === "12 floors of stairs?! you're a climber!" && secret[3] === "new best at left or right! 4/5 ♥" &&
    secret[4] === "thank you for tucking me in, sunbeam ♥" && secret.length === 5,
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
  check("it asks how your day was, and answers kindly", answers.join() === "great,ok,tough" &&
    /snuggle|cuddle/.test(reply) && await askBox.count() === 0, `${answers.join()} -> ${reply}`);
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
    kept.sent[0].answer === "snow" && kept.said === "snow!! ❄ I'll remember", JSON.stringify(kept));
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
    look.length === 3 && look[0].startsWith("welcome home") && look[1] === "brr, was it cold out there?" &&
    !look.some((l) => /play a game/.test(l)), look.join(" | "));
  check("the new private lines read right", lines[0] === "I dreamed about the sea, like you said! ♥" &&
    lines[1] === "I dreamed about the sea..." && lines[2] === "oh, sunny after all! good guess though ♥" &&
    lines[3] === "back from the gym?! so strong!" && lines[4] === "Thanksgiving in your favourite season! ♥" &&
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
    (await cur().locator(".gpick button").count()) === 2 && await cur().locator(".gpick").isVisible());
  await shot("04a-pick");
  await cur().locator('.gpick [data-game="left_right"]').click();
  await page.waitForTimeout(400);
  let rounds = 0;
  const gameSaid = [];
  for (let r = 0; r < 5 && !(await cur().locator(".game").isHidden()); r++) {
    gameSaid.push(await cur().locator(".bubble").textContent());
    await cur().locator(r % 2 ? ".gr" : ".gl").click();
    await page.waitForTimeout(1400);
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
  await page.waitForTimeout(3500); // let the last game's line clear
  await button(2).click();
  await page.waitForTimeout(600);
  await cur().locator('.gpick [data-game="higher_lower"]').click();
  await page.waitForTimeout(1200);
  let hlRounds = 0;
  const numbers = [];
  for (let r = 0; r < 5 && !(await cur().locator(".game").isHidden()); r++) {
    const shown = Number(await cur().locator(".gnum").getAttribute("data-n"));
    numbers.push(shown);
    if (r === 2) await shot("04c-higher-lower");
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

  // Catch (prototype, behind experimental_catch): the card times the taps, so
  // play it from inside the page: tap mid-window on the right side, leave the
  // bees alone, and tap one round too soon on purpose (so 4 of 5).
  await page.waitForTimeout(3500);
  await page.locator("hatch-pet-card").evaluate((el) => el.setConfig({ ...el._config, experimental_catch: true }));
  await inject(pet["sensor.energy"], { state: "80" }); // the card turns play down when tired
  await page.waitForTimeout(800);
  await button(2).click();
  await page.waitForTimeout(600);
  check("catch joins the picker with the option",
    (await cur().locator(".gpick button").count()) === 3);
  await cur().locator('.gpick [data-game="catch"]').click();
  const catchShot = page.waitForTimeout(2600).then(() => shot("04d-catch"));
  const catchRounds = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const out = [];
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 5; i++) {
      let c;
      for (let w = 0; w < 600 && !((c = s.game?.cur) && !c.done && s.game.round === i); w++) await frame();
      if (!c) return out;
      const early = i === 2 && !c.decoy;
      const due = early ? 0.05 : c.travel - c.window / 2;
      while (!c.done && (performance.now() - c.start) / 1000 < due) await frame();
      if (!c.decoy && !c.done) s.gameBox.querySelector(c.side === "left" ? ".gl" : ".gr").click();
      while (!c.done) await frame();
      out.push({ decoy: c.decoy, early, wins: s.game?.wins });
      for (let w = 0; w < 200 && s.game && s.game.round === i + 1 && s.game.cur === c; w++) await frame();
    }
    return out;
  });
  await catchShot;
  await page.waitForTimeout(1500);
  const catchLine = await bubble();
  const expected = 5 - catchRounds.filter((r) => r.early).length;
  check("catch plays five timed rounds", catchRounds.length === 5 && catchLine.startsWith(`${expected}/5 caught`),
    `${catchRounds.map((r) => (r.decoy ? "bee" : r.early ? "early" : "catch")).join(" ")} -> ${catchLine}`);
  check("catch keeps a best score",
    Number(await evaluate(() => localStorage.getItem("hatch-best-catch"))) >= expected);

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
    await page.waitForTimeout(4500); // let the catch result line clear
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
      check(`${kind}: reopened, the score reads round 2 of 5 with the wins kept`,
        /^round 2\/5 · \d right$/.test(back) && back === played, `${played} -> ${back}`);
      if (kind === "higher_lower") {
        check("higher or lower: the number is kept",
          (await cur().locator(".gnum").getAttribute("data-n")) === number);
      }
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

    // Catch (experimental_catch is on above): close and reopen inside 900 ms,
    // and exactly one round runs (the kickoff timer only).
    await open("catch");
    await page.locator("hatch-pet-card").evaluate((el) => {
      const s = el._slides[el._index];
      window.__catchRounds = 0;
      const was = el._catchRound.bind(el);
      el._catchRound = (x) => { window.__catchRounds += x === s && x.game?.kind === "catch" ? 1 : 0; return was(x); };
      el._endGame(s, null);
    });
    await page.waitForTimeout(100);
    await button(2).click();
    await page.waitForTimeout(300);
    await cur().locator('.gpick [data-game="catch"]').click();
    await page.waitForTimeout(1500);
    check("catch reopened inside 900 ms runs one round",
      (await evaluate(() => window.__catchRounds)) === 1, String(await evaluate(() => window.__catchRounds)));
    await stop();

    // Two viewers share one server game: a stale guess ends with the line.
    const tab = await context.newPage();
    tab.on("pageerror", (e) => errors.push(`tab 2: ${e}`));
    await tab.goto(`${HA}/pet-bench/pet`);
    await tab.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
    await tab.waitForTimeout(16000); // the frontend reloads itself once
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

  // 4. Moments make the pet react.
  for (const [type, extra, expect] of [
    ["care_miss", { reason: "hunger" }, "there you are"],
    ["stage_changed", { stage: "teen", from: "child" }, "teen now"],
    ["trait_learned", { trait: "music_lover", level: 1 }, "new trait"],
    ["sunset", {}, "sun|sky"],
    ["watching", { title: "Bluey" }, "Bluey"],
    ["first_snow", {}, "first snow"],
    ["weather", { change: "cold", temperature: -12 }, "−12°"],
    ["weather", { change: "rainbow" }, "rainbow"],
    ["forecast", { when: "tomorrow", kind: "warmer", high: 72 }, "warmer tomorrow: 72°"],
  ]) {
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
    await shot(`05-${type}`);
    await page.waitForTimeout(500);
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
  await inject(pet["sensor.life_stage"], { attributes: { traits: [], trait_levels: {} } });

  // Seasons: forced to Halloween, the lantern and web are in the scene, and a
  // costume moment puts the hat on the head (its brim at or below the head
  // point, never hovering over it). Off again with seasonal: false.
  const card = page.locator("hatch-pet-card");
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: "halloween" }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  const spooky = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    s.sayUntil = 0; s.flairUntil = 0;
    const [hx0, hy0] = el._hatSpot(s) || s.species.head[s.drawn];
    el._headTopAll(s, hx0, hy0); // load every frame first, as the season's ticks do
    await new Promise((r) => setTimeout(r, 600));
    el._costume(s, { key: "halloween" }, "boo!");
    await new Promise((r) => setTimeout(r, 900));
    const hat = s.screen.querySelector(".costume .hat")?.getBoundingClientRect();
    const at = el._flairAnchors(s);
    const sr = s.screen.getBoundingClientRect();
    const r = s.pet.getBoundingClientRect();
    // The seat the card itself uses: the lowest top across the idle frames, the hat
    // point, or an exact point.
    const top = el._hatSeat(s)?.top ?? null;
    return {
      pieces: [...s.seasonBox.querySelectorAll("img")].map((i) => i.className).join(" ").split(" "),
      hatBottom: hat && hat.bottom - sr.top, headTop: r.top - sr.top + top * (r.height / 256),
      fy: at.fy, said: s.bubble.textContent,
    };
  });
  check("halloween dresses the scene", spooky.pieces.includes("lantern") && spooky.pieces.includes("web"),
    spooky.pieces.join(" "));
  // Seated: the brim sinks a little into the head, never floats above its top.
  check("the costume hat sits on the head",
    spooky.hatBottom > spooky.headTop && spooky.hatBottom < spooky.headTop + 20 &&
      spooky.hatBottom < spooky.fy && spooky.said === "boo!",
    `hat bottom ${Math.round(spooky.hatBottom)} vs head top ${Math.round(spooky.headTop)}`);
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
    "- thanksgiving thanksgiving - thanksgiving - halloween -", tgDates);
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
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  await inject(pet["sensor.life_stage"], {
    attributes: { wish: { kind: "sunset", granted: false }, dream: { kind: "watching", title: "Bluey" } },
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
  check("the first look tells the day's news, dream and wish",
    /^while you were out, I (napped|watched the rain)/.test(firstLook[0]) && firstLook[1] === "I dreamed about Bluey!" &&
      firstLook[2] === "can we watch the sunset together?", firstLook.join(" | "));
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  check("the wish is on the status screen", /wish\s*♡ watch the sunset together/.test(await cur().locator(".status").innerText()));
  await shot("05-wish-status");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  await inject(pet["sensor.life_stage"], { attributes: { wish: { kind: "sunset", granted: true } } });
  await inject(pet["sensor.last_care"], {
    attributes: { moments: [{ type: "wish_granted", kind: "sunset", at: new Date().toISOString() },
      { type: "sunset", at: new Date().toISOString() }] },
  });
  await page.waitForTimeout(600);
  const granted = await card.evaluate(async (el) => {
    const s = el._slides[el._index];
    const first = s.bubble.textContent; // the sunset's line
    s.sayUntil = 0;
    el._sayQueued(s);
    return [first, s.bubble.textContent];
  });
  check("a wish coming true is celebrated after the line said with it",
    /sun|sky/.test(granted[0]) && /wish|best day/.test(granted[1]), granted.join(" | "));
  await shot("05-wish-granted");

  // Excitement bounces briefly, not for the whole 15 minutes it lasts. The
  // bounce starts on becoming excited, and the games above may have excited the
  // pet already, so calm it first.
  await inject(pet["sensor.mood"], { state: "content", attributes: { flags: [] } });
  await page.waitForTimeout(600);
  await inject(pet["sensor.mood"], { state: "excited", attributes: { flags: ["excited"] } });
  await page.waitForTimeout(800);
  const hopsAtFirst = await cur().locator(".pet.hop").count();
  await page.waitForTimeout(11000);
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

  // The journal keeps the season's firsts. A pet update can replace the injected
  // memory (and the journal redraws with it), so inject until it shows.
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(500);
  await cur().locator(".jlink").click();
  let memory = false;
  for (let i = 0; i < 3 && !memory; i++) {
    await inject(pet["sensor.life_stage"], {
      attributes: { memories: [{ kind: "first_snow", at: Date.now() / 1000 }] },
    });
    await page.waitForTimeout(1000);
    memory = /first snow/.test(await cur().locator(".status").innerText());
  }
  check("the journal shows memories", memory);
  await shot("05-memories");
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(400);

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
  check("the pet says it made you something", photoLine.join() === "I made you something! it's in your journal ♥",
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
    const seasons = [...src.matchAll(/key: "(halloween|thanksgiving)"/g)].map((m) => m[1]);
    const card = new Set(["greet", "greet.warm", "greet.nickname", "idle.sleepy", "idle.bored", "idle.excited", "idle.hungry",
      "idle.dirty", "idle.default", "yum", "favourite_snack", "wish_granted", "friend_home", "care_miss", "tucked_in", "bond_up"]);
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
          el._idle(s);
          const out = s.plain === undefined ? "" : s.bubble.textContent;
          Object.assign(s, saved, { sayUntil: 0 });
          return out;
        },
        said: (fn2) => { s.queue = []; s.sayUntil = 0; fn2(); const q = s.queue.map((x) => ({ text: x.text, opts: x.opts })); s.queue = []; return q; },
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
      el._moment(s, { type: "care_miss", at });
      out.miss = s.bubble.textContent;
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
      lines.refusal.join("|") === "tummy full!|too sleepy to play|I'm not sick!" && lines.wish === "wish... snack after lunch" &&
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
      /^hatching in about 2[01] min$/.test(clock.before) // 20, or 21 with a few seconds of offset left over
       && clock.after === "hatching in about 30 min" &&
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
        for (const key of ["halloween", "thanksgiving"]) {
          el._config = { ...config, seasonal: key };
          localStorage.setItem(`hatch-costume-${key}-${s.ids?.device}-${new Date().toDateString()}`, "1");
          for (const [stage, cache] of [["baby", "on"], ["child", "on"], ["teen", "on"], ["baby", "off"]]) {
            t.cache(cache);
            t.stage(stage);
            const said = new Set();
            let catchy = new Set();
            for (let i = 0; i < 30; i++) {
              s.nextCostume = 1;
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
    const halloweenNormal = ["boo!", "happy Halloween!", "spooky~", "trick or treat?", "do I look spooky?"];
    check("holidays: a baby has its own costume lines, never with the catchphrase",
      holiday["halloween-baby-on"].said.every((x) => halloweenBaby.includes(x)) &&
      holiday["halloween-baby-on"].said.some((x) => !halloweenNormal.includes(x)) &&
      holiday["halloween-baby-on"].catchy.join() === "false" &&
      holiday["thanksgiving-baby-on"].said.every((x) => ["gobble gobble!", "pie! yum yum", "thank you ♥", "cozy cozy~", "leaves!"].includes(x)),
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
      toggle.note === "OK, baby talk for babies and children ♥" &&
      toggle.failed.pressed === "true" && toggle.failed.calls === 2 && toggle.failed.note === "That didn't work. Try again." &&
      toggle.failed.cache === "on" && toggle.babyNote === "OK, baby talk for babies and children ♥", JSON.stringify(toggle));
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
      el._renderStatus(s, []);
      for (let i = 0; i < 40 && journal && !s.status.querySelector(".gen"); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
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
    await unstubState();
    await page.locator("hatch-pet-card .statusbtn").click();
    await page.waitForTimeout(400);
  }

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
      "good_morning", "sunset", "fell_asleep", "wish_granted", "favourite_snack"];
    const HELLOS = ["hello", "hello_shared", "hello_warm", "hello_hearts"];
    const longName = "Wwwwwwwwwwwwwwww"; // 16, as _greet leaves a name
    const longFood = "sunflower seeds"; // 15, the longest likes entry
    const fill = (line, arg) => (typeof line === "function" ? line(arg) : line);
    const bad = [];
    if (Object.keys(PERSONA).sort().join() !== [...TYPES].sort().join()) bad.push(`types ${Object.keys(PERSONA)} vs ${TYPES}`);
    for (const [type, keys] of Object.entries(PERSONA)) {
      if (Object.keys(keys).join() !== KEYS.join()) bad.push(`${type}: keys ${Object.keys(keys)}`);
      for (const [key, lines] of Object.entries(keys)) {
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
          if (line.includes("?")) bad.push(`${type}.${key}: "${line}" asks`);
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

    // One pet on show, as a teen or adult of a type, with this viewer's bond.
    const typeAs = (fn, arg) => page.locator("hatch-pet-card").evaluate(async (el, { fn, arg }) => {
      const s = el._slides[el._index];
      const realState = el._state;
      const realRandom = Math.random;
      const me = el._hass.user.id;
      const keep = { voicedAt: s.voicedAt, queue: s.queue, catchCount: s.catchCount, asleep: s.asleep, calling: s.calling };
      const kept = { shared: localStorage.getItem("hatch-shared-screen"), baby: localStorage.getItem(`hatch-baby-talk-${me}`) };
      const keptMine = s.mine;
      const free = () => Object.assign(s, { asleep: false, calling: false, sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0,
        movingUntil: 0, queue: [], voicedAt: Date.now() + 1e9 });
      free();
      const t = {
        pet: (stage, personality, level = null) => {
          el._state = function (slide, key) {
            const st = realState.call(this, slide, key);
            if (key !== "sensor.life_stage" || !st || slide !== s) return st;
            return { ...st, state: stage, attributes: { ...st.attributes, personality } };
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
          el._moment(s, { at: new Date().toISOString(), ...m }); el._stopTyping(s);
          const out = { said: s.bubble.textContent, queued: s.queue.map((q) => ({ text: q.text, catch: !!q.opts?.catch })) };
          s.queue = [];
          return out;
        },
      };
      try {
        return await new Function("el", "s", "t", "arg", `return (${fn})(el, s, t, arg);`)(el, s, t, arg);
      } finally {
        el._state = realState;
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
            out[type][r][key] = said.queued.length ? said.queued[0] : { text: said.said };
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
      const wish = () => t.moment({ type: "wish_granted" }).queued[0]?.text;
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

    // The reveal: "I'm a teen now!", then the type's line in a bubble of its
    // own (with its catchphrase allowed); none for an adult or without a type.
    const reveal = await typeAs(async (el, s, t, types) => {
      t.pet("teen", null, 0);
      const out = {};
      for (const type of types) out[type] = t.moment({ type: "stage_changed", stage: "teen", from: "child", personality: type });
      out.adult = t.moment({ type: "stage_changed", stage: "adult", from: "teen", personality: "sweet", upbringing: "steady" });
      out.none = t.moment({ type: "stage_changed", stage: "teen", from: "child" });
      return out;
    }, TYPES);
    check("a new teen says its type after \"I'm a teen now!\", in a bubble of its own; an adult or no type, none",
      TYPES.every((type) => reveal[type].said === "I'm a teen now!" && reveal[type].queued.length === 1 &&
        PERSONA[type].reveal.includes(reveal[type].queued[0].text) && reveal[type].queued[0].catch) &&
      reveal.adult.queued.length === 0 && reveal.none.queued.length === 0 && reveal.none.said === "I'm a teen now!",
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
    check("live, the reveal shows after the stage line, neither lost", stageLine.trim() === "I'm a teen now!" &&
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
  }

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
    await tab.waitForTimeout(16000); // the frontend reloads itself once
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
      typingRound.after.message === "Nothing personal on this screen now.",
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
    out.order = [...s.status.querySelectorAll(".row")].map((r) => r.children[1]?.textContent)
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
    lapse.sent.join() === "virtual_pet/forget_me" && lapse.message === "That didn't work. Try again." &&
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
    forgot.sent.join() === "virtual_pet/forget_me" && forgot.message === "Forgotten. The pets start fresh with you ♥" &&
    !forgot.bdayRows && forgot.babyTalk === "false" && !forgot.myDay && forgot.myDayRow !== "true" &&
    forgot.storage.length === 0 && forgot.othersKept &&
    forgot.after.baby === false && (forgot.after.counted === false || (forgot.after.kept === false && forgot.after.myDay === false)),
    JSON.stringify(forgot));
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
  await second.waitForTimeout(16000);
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
    // One media line: the public titled moment (still published until P3c) is
    // skipped, the channel's says it once, its house push and a replayed
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
      const kept = { mine: s.mine, house: s.house };
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
      };
      s.queue = [];
      s.house = kept.house;
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
      fallback.message === "That didn't work. Try again.", JSON.stringify(fallback));
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
  const ghostRun = (opts) => card.evaluate(async (el, { catchGame }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = el._slides[el._index];
    const op = () => Number(getComputedStyle(s.ghost).opacity);
    const out = { pets: s.screen.querySelectorAll(".pet").length, ghostIsPet: s.ghost.classList.contains("pet") };
    const savedGame = s.game;
    if (catchGame) s.game = { kind: "catch" };
    // No tick of the card's own while sampling (its idle life moves the pet too).
    const realTick = el._tick;
    el._tick = () => {};
    await wait(1500); // an idle move already under way finishes
    s.pet.classList.remove("wander-l", "wander-r", "look");
    await wait(1200);
    // A clean frame swap: the pet awake, still, with two different frames.
    s.pet.classList.remove("hop", "greethop", "look", "dance", "shiver");
    s.screen.classList.remove("breezy", "windy");
    s.pet.getAnimations().forEach((a) => a.cancel());
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
  const inCatch = await ghostRun({ catchGame: true });
  check("ghosting stays hidden in Catch",
    inCatch.frameJust === 0 && inCatch.trail === 0, JSON.stringify(inCatch));
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
    el.remove();
    return { form: !!form, rendered: !!form?.shadowRoot, config };
  });
  check("card editor renders a form", editor.form && editor.rendered);
  check("card editor saves the picked pets", Array.isArray(editor.config?.devices), JSON.stringify(editor.config));

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
      el._linkEnd();
      el._linkAt = Date.now() + 1e9; // only the forced visits run
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
          lookedFirst: true, queue: [], sayUntil: 0, poseUntil: 0, propUntil: 0, flairUntil: 0, movingUntil: 0 });
        s.screen.classList.remove("show-status");
      }
      el._booting = false;
    }, index);
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
    const strip = (name) => card.locator(".viewport").screenshot({ path: `${lshots}-${name}.png` });

    // The timer: the day's visit is 10-25 minutes away, and never while the boot screen is up.
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
    check(`link waits 10-25 minutes after the page loads (${width}px)`,
      timer.wait > 590000 && timer.wait <= 1500000 && !timer.started, JSON.stringify(timer));
    check(`link never starts under the boot screen (${width}px)`, !timer.booting);

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
    await lp.waitForTimeout(1500);
    await strip("5-hop");
    const lines = await state();
    check(`the visit screen shows a connecting band, then both pets (${width}px)`,
      band.band === 1 && both.guestImg === 1 && both.hostPos && both.band === 0, JSON.stringify([band.band, both.guestImg, both.hostPos]));
    check(`both pets speak, each in their own voice (${width}px)`,
      new RegExp(`hi.*${names[1]}|${names[1]}.*hello`).test(lines.hostSays) && lines.guestSays.includes(names[0]) && lines.guestBubble.includes("♪"),
      JSON.stringify([lines.hostSays, lines.guestSays, lines.guestBubble]));
    await lp.waitForTimeout(1500);
    await strip("6-farewell");
    await lp.waitForTimeout(3500); // 9 s since the start
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
      for (const [who, s] of [["host", a], ["guest", b]]) {
        for (const [what, patch] of [["asleep", { asleep: true }], ["calling", { calling: true }], ["game", { game: { kind: "catch" } }], ["queue", { queue: [{ text: "x" }] }]]) {
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
      await lp.waitForTimeout(450);
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
    await lp.emulateMedia({ reducedMotion: null });
    const calmEnd = await state();
    check(`reduced motion: no beam and no hops, the pets just appear together (${width}px)`,
      !sawBeam && !sawHop && sawBoth && calmEnd.left === 0, JSON.stringify([sawBeam, sawHop, sawBoth, calmEnd.left]));
    await lp.close();
  }

  check("no errors in the browser console", errors.length === 0, errors.slice(0, 3).join(" | "));

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
  let seeded = false;
  let unseed = null;
  const seedPet = pet["sensor.life_stage"];
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
    let before = null;
    const downAt = Date.now();
    const token2 = await bounce(fresh, entryId, (data) => {
      before = { bond: data.bonds?.[me], wish: data.wish };
      data.bonds = { ...(data.bonds || {}), [me]: { ...(data.bonds?.[me] || {}), points: 105, nickname: "sunbeam" } };
      data.wish = { kind: "play", day: today, granted: false, for: me, for_name: USER.name };
    });
    unseed = () => bounce(token2, entryId, (data) => {
      if (before.bond === undefined) delete data.bonds?.[me];
      else data.bonds = { ...(data.bonds || {}), [me]: before.bond };
      data.wish = before.wish;
    });
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
        mark: window.__hatchMark, powered: sl.house?.powered_on?.at ?? null };
    }, seedPet);
    seeded = back.bond?.nickname === "sunbeam";
    check("P3a: an HA restart keeps the bond (back within 90 s of start-up, no page reload)",
      seeded && back.you && back.mark === "same page" && back.s <= 90,
      JSON.stringify({ ...back, downForS: Math.round((upAt - downAt) / 1000) }));
    check("D5: after a real HA restart the snapshot carries house.powered_on (new, just now)",
      !!back.powered && back.powered !== poweredBefore && Math.abs(Date.now() - Date.parse(back.powered)) < 10 * 60000,
      JSON.stringify({ before: poweredBefore, after: back.powered }));
    check("P3a: the seeded wish is aimed at dev on dev's own card",
      back.aimed === true && /play a game with you/.test(back.wish || ""), JSON.stringify(back));
  } else {
    check("P3a: HA restart and the seeded bond can run (set HA_CONFIG and HA_START with HA_URL)", false,
      "no HA_CONFIG/HA_START: the restart and the seeded second login didn't run");
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
    await page2.waitForTimeout(16000); // the frontend reloads itself once
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
    await ctx2.close();
  }
  if (unseed) {
    await unseed();
    console.log("note: dev's seeded bond and wish are put back as they were");
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
