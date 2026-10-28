// Drive the pet shelf card in the throwaway HA and check what players see.
//
// Start `scripts/develop` first, then run `scripts/card-check`. On a fresh
// dev/config it onboards the `dev` / `devdevdev` user and creates two pets.
// Screenshots go to dev/card-check/. Exits non-zero if any check fails.
// Needs Playwright with Chromium (preinstalled in the cloud sessions).
//
// Environment: HA_URL (default http://localhost:8123); SCALE=2 for sharp
// screenshots (the README art uses them).

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const HA = process.env.HA_URL || "http://localhost:8123";
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
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: Number(process.env.SCALE || 1) });
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
  const hush = () => page.locator("hatch-pet-card").evaluate((el) => {
    el._slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; });
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
    const s = el._slides[el._index];
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

  // The bond: looking in starts one for the viewer (virtual_pet.visit).
  const me = await evaluate(() => document.querySelector("home-assistant").hass.user.id);
  const bondOf = () => evaluate(({ e, me }) =>
    document.querySelector("home-assistant").hass.states[e].attributes.bonds?.[me], { e: pet["sensor.life_stage"], me });
  let bond = null;
  for (let i = 0; i < 20 && !bond; i++) {
    await page.waitForTimeout(500);
    bond = await bondOf();
  }
  check("looking in starts a bond", bond?.level >= 1, JSON.stringify(bond));
  // A close bond: the nickname, a hop and hearts, and five hearts on the status screen.
  await inject(pet["sensor.life_stage"], { attributes: { bonds: { [me]: { level: 8, nickname: "sunbeam" } } } });
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
  // "My day" is each person's own switch.
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
    const status = s.status.innerText;
    return { visited, said: s.bubble.textContent, bondRow: /you two|my day/.test(status) };
  });
  // The status screen still works with it on (no "notify me" row to wire up).
  const sharedStatus = await cur().evaluate((sl) => sl.querySelector(".screen").classList.contains("show-status") &&
    !!sl.querySelector(".bell.shared") && !/notify me/.test(sl.querySelector(".status").innerText));
  await cur().locator(".bell.shared").click(); // personal again
  await page.waitForTimeout(400);
  // On a shared screen the bond's moments say nothing personal either.
  const sharedMoments = await page.locator("hatch-pet-card").evaluate((el, me) => {
    localStorage.setItem("hatch-shared-screen", "on");
    const s = el._slides[el._index];
    s.queue = [];
    const before = s.bubble.textContent;
    for (const type of ["bond_up", "bond_record", "tucked_in", "bond_favourite"]) {
      el._moment(s, { type, user: me, level: 4, nickname: "sunbeam", game: "left_right", wins: 4, at: type });
    }
    el._moment(s, { type: "friend_home", user: "someone-else", at: new Date().toISOString() });
    const out = { queued: s.queue.map((q) => q.text), bubble: s.bubble.textContent, before };
    s.queue = [];
    localStorage.setItem("hatch-shared-screen", "off");
    return out;
  }, me);
  check("a shared screen's moments name nobody", sharedMoments.queued.join() === "someone's home!! ♥" &&
    sharedMoments.bubble === sharedMoments.before, JSON.stringify(sharedMoments));
  check("a shared screen shows nothing personal", sharedStatus && !sharedView.visited && !sharedView.bondRow &&
    !sharedView.said.includes(USER.name) && !sharedView.said.includes("sunbeam"), JSON.stringify(sharedView));
  // The server's update replaced the close bond injected above: inject it again.
  await inject(pet["sensor.life_stage"], { attributes: { bonds: { [me]: { level: 8, nickname: "sunbeam" } } } });
  await page.waitForTimeout(300);
  await page.locator("hatch-pet-card .statusbtn").click();
  await page.waitForTimeout(300);
  // A level-up is said only to the person whose bond grew.
  const levelUp = (user) => page.locator("hatch-pet-card").evaluate((el, user) => {
    const s = el._slides[el._index];
    s.queue = [];
    s.sayUntil = 0;
    el._moment(s, { type: "bond_up", user, level: 4, nickname: "sunbeam" });
    return s.queue.map((q) => q.text);
  }, user);
  const mine = await levelUp(me);
  const theirs = await levelUp("someone-else");
  check("a bond level-up is said only to its person",
    mine[0] === "can I call you sunbeam? ♥" && theirs.length === 0, `${mine} / ${theirs}`);
  // A wish aimed at a close friend: spoken to them, about them to anyone else.
  const aimed = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    const toMe = el._wishLine({ kind: "play", for: me, for_name: "Dev" }, s);
    const ofThem = el._wishLine({ kind: "play", for: "someone-else", for_name: "Sam" }, s);
    return [toMe[0], toMe[1], ofThem[0], ofThem[1]];
  }, me);
  check("a wish can be aimed at a close friend", aimed.join(" | ") ===
    "will you play a game with me today, sunbeam? | play a game with you | " +
    "I hope Sam plays a game with me today! | play a game with Sam", aimed.join(" | "));
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
    el._birthdayPhone = false;
    el._renderStatus(s, []);
    out.forget = !!s.status.querySelector(".bell.forgetbday");
    out.phoneOff = s.status.querySelector(".bell.bdayphone")?.getAttribute("aria-pressed");
    s.status.querySelector(".bell.bdayphone").click();
    for (let i = 0; i < 40 && !el._birthdayPhone; i++) await wait(50);
    out.phoneOn = s.status.querySelector(".bell.bdayphone")?.getAttribute("aria-pressed");
    localStorage.setItem("hatch-shared-screen", "on");
    el._renderStatus(s, []);
    out.forgetShared = !!s.status.querySelector(".bell.forgetbday, .bell.bdayphone");
    localStorage.setItem("hatch-shared-screen", "off");
    el._renderStatus(s, []);
    s.status.querySelector(".bell.forgetbday").click();
    for (let i = 0; i < 40 && el._birthdayKept; i++) await wait(50);
    out.forgotten = !el._birthdayKept;
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
    bday.forget && !bday.forgetShared && bday.forgotten, JSON.stringify(bday));
  check("the birthday phone message is off until you turn it on",
    bday.phoneOff === "false" && bday.phoneOn === "true", JSON.stringify(bday));
  // A close friend coming home: "you're home!!" to them, by name to anyone else.
  await evaluate((me) => localStorage.removeItem(`hatch-welcomed-${me}`), me);
  await evaluate(() => document.querySelector("home-assistant").hass.callApi("POST", "states/person.sam_check",
    { state: "home", attributes: { user_id: "someone-else", friendly_name: "Sam Check" } }));
  await page.waitForTimeout(500);
  const cheers = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    const person = Object.values(el._hass.states).find((st) => st.entity_id.startsWith("person.") &&
      st.attributes.user_id === me);
    const out = [];
    const at = new Date().toISOString(); // the same arrival twice: cheered once
    for (const user of [me, me, "someone-else"]) {
      s.queue = [];
      el._moment(s, { type: "friend_home", user, at });
      out.push(s.queue[0]?.text || "");
    }
    return { out, person: person?.attributes.friendly_name };
  }, me);
  // What the pet tells only you: a friendship month, last night's tuck-in, a
  // busy day; a record and a goodnight, to their person only.
  const secret = await page.locator("hatch-pet-card").evaluate((el, me) => {
    const s = el._slides[el._index];
    s.queue = [];
    el._note(s, { kind: "friends_for", months: 1 });
    el._note(s, { kind: "steps", steps: 11000 });
    el._note(s, { kind: "stairs", floors: 12 });
    el._moment(s, { type: "bond_record", user: me, game: "left_right", wins: 4, at: "x" });
    el._moment(s, { type: "bond_record", user: "someone-else", game: "left_right", wins: 5, at: "y" });
    el._moment(s, { type: "tucked_in", user: me, at: "z" });
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
    el._moment(s, { type: "friend_home", user: me, weather: "wet", at: new Date().toISOString() });
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
      [careId]: { ...real[careId], attributes: { ...real[careId].attributes,
        moments: [{ type: "friend_home", user: me, weather: "cold", at: now }] } } };
    el._hass = { ...el._hass, states: fake };
    for (const k of Object.keys(localStorage)) {
      if (/^hatch-(dream|wish|welcomed)-/.test(k)) localStorage.removeItem(k);
    }
    localStorage.setItem(`hatch-seen-${s.ids.device}`, String(Date.now() - 5 * 3600 * 1000));
    s.lookedFirst = false; s.queue = [];
    el._firstLook(s);
    const out = s.queue.map((q) => q.text);
    s.queue = [];
    el._hass = { ...el._hass, states: real };
    return out;
  }, me);
  check("the first look: welcome first, three lines at most, no closed wish",
    look.length === 3 && look[0].startsWith("welcome home") && look[1] === "brr, was it cold out there?" &&
    !look.some((l) => /play a game/.test(l)), look.join(" | "));
  check("the new private lines read right", lines[0] === "I dreamed about the sea, like you said! ♥" &&
    lines[1] === "I dreamed about the sea..." && lines[2] === "oh, sunny after all! good guess though ♥" &&
    lines[3] === "back from the gym?! so strong!" && lines[4] === "Thanksgiving in your favourite season! ♥" &&
    /rain/.test(lines[5]) && lines[7] === "it's wet out there! come get cozy ☂", lines.join(" | "));
  check("a friend coming home is cheered, by name to others", /^(you're home!! ♥|yay, you're back! ♥)$/.test(cheers.out[0]) &&
    cheers.out[1] === "" && /^(Sam's home!!|ooh, Sam is back!)$/.test(cheers.out[2]),
  `${cheers.out.join(" | ")} (person ${cheers.person})`);

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
  // A call (a need, or a whine) keeps idle life away by design: show the pet
  // content for this check, as if it had been answered (the integration's next
  // update, minutes away, puts the real mood back).
  if (await evaluate((id) => document.querySelector("home-assistant").hass.states[id]?.state === "calling",
    pet["sensor.mood"])) {
    console.log("note: the pet was calling; shown content for the idle check");
    await inject(pet["sensor.mood"], { state: "content" });
    await page.waitForTimeout(800);
  }
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
    await inject(pet["sensor.last_care"], {
      attributes: { moments: [{ type, ...extra, at: new Date().toISOString() }] },
    });
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
    const [hx0, hy0] = s.species.hat?.[s.drawn] || s.species.head[s.drawn];
    el._headTopAll(s, hx0, hy0); // load every frame first, as the season's ticks do
    await new Promise((r) => setTimeout(r, 600));
    el._costume(s, { key: "halloween" }, "boo!");
    await new Promise((r) => setTimeout(r, 900));
    const hat = s.screen.querySelector(".costume .hat")?.getBoundingClientRect();
    const at = el._flairAnchors(s);
    const sr = s.screen.getBoundingClientRect();
    const r = s.pet.getBoundingClientRect();
    // The real top of the head in the frame on show (or the species' hat point).
    const [hx, hy] = s.species.hat?.[s.drawn] || s.species.head[s.drawn];
    // The lowest top across the idle frames: on every frame the hat must sit on the head.
    const scanned = el._headTopAll(s, hx, hy);
    const top = s.species.hat?.[s.drawn] ? Math.max(hy, scanned ?? hy) : scanned;
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
    const scanned = el._headTopAll(s, hx, hy);
    const top = s.species.hat?.[s.drawn] ? Math.max(hy, scanned ?? hy) : scanned;
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
    };
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
    return out;
  });
  check("save without a share sheet shows the picture to press and hold, and a download",
    saved.open && saved.modal && saved.img && saved.hint === "press and hold the picture to save it" &&
    saved.download === "Checkbird-best-friends.png" && saved.hidden === false, JSON.stringify(saved));
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
  // A shared screen shows no photo, and forgets them.
  const shared = await page.locator("hatch-pet-card").evaluate(async (el) => {
    const s = el._slides[el._index];
    const urls = [...(s.photos?.values() || [])].map((p) => p.url);
    localStorage.setItem("hatch-shared-screen", "off");
    s.journal = false;
    el._renderStatus(s, []);
    s.status.querySelector(".bell.shared").click(); // on
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
          if (call && !/call_(happiness|fake)$/.test(key) && new Set(words).size < words.length) bad.push(`${key}: "${line}" repeats`);
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
      out.home = t.said(() => el._moment(s, { type: "friend_home", user: el._hass.user.id, at }));
      out.bond = t.said(() => el._moment(s, { type: "bond_up", user: el._hass.user.id, level: 3, at }));
      s.sayUntil = 0;
      el._moment(s, { type: "care_miss", at });
      out.miss = s.bubble.textContent;
      s.sayUntil = 0; s.voicedAt = Date.now() + 1e9;
      el._moment(s, { type: "tucked_in", user: el._hass.user.id, at });
      el._stopTyping(s);
      out.tucked = s.bubble.textContent;
      out.refusal = ["full", "too_tired", "not_sick"].map((result) => {
        s.sayUntil = 0;
        el._react(s, { action: "feed", result });
        return s.bubble.textContent;
      });
      // The game's own refusal (a play that ends at once) goes through the same table.
      const realCall = el._hass.callService;
      el._hass = { ...el._hass, callService: async () => ({ response: { result: "too_tired" } }) };
      s.game = { kind: "left_right" };
      await el._playCall(s, { guess: "left" });
      out.refusal.push(s.bubble.textContent);
      el._hass = { ...el._hass, callService: realCall };
      out.wish = el._wishSaid(s, { kind: "snack" }, ["I'd love a snack after lunch!"]);
      out.aimed = el._wishSaid(s, { kind: "snack", for: "x", for_name: "Alex" }, ["I hope Alex brings me a snack after lunch!"]);
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
      lines.refusal.join("|") === "tummy full!|too sleepy to play|I'm not sick!|too sleepy to play" && lines.wish === "wish... snack after lunch" &&
      lines.aimed === "I hope Alex brings me a snack after lunch!", JSON.stringify(lines));
    check("no catchphrase on a baby line, and the count doesn't move",
      lines.granted[0]?.opts?.catch === false && lines.favourite[0]?.opts?.catch === false && lines.count === 2 &&
      !lines.spoken.some((x) => lines.phrase && x.includes(lines.phrase)), JSON.stringify(lines));
    // Holiday lines: a baby's own set; a child, a teen and "off" keep the normal ones.
    const holiday = await babyAs(async (el, s, t) => {
      const config = el._config;
      const fly = [el._seasonFlyer, el._seasonVisitor, el._costume];
      const out = {};
      el._seasonFlyer = el._seasonVisitor = () => {};
      el._costume = (slide, season, line, catchy) => { out.line = line; out.catchy = catchy; };
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
        el._config = config;
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
      el._renderStatus(s, []);
      const out = { row: s.status.querySelectorAll(".bell.babytalk").length, line: el._lines(s, "care_miss", "normal").text };
      localStorage.setItem("hatch-shared-screen", "off");
      el._renderStatus(s, []);
      out.personalRow = s.status.querySelectorAll(".bell.babytalk").length;
      t.cache(null);
      return out;
    });
    check("a shared screen has no baby talk switch and says the normal lines",
      shared.row === 0 && shared.line === "normal" && shared.personalRow === 1, JSON.stringify(shared));
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
    await babyShot("06e-baby-other-creature", "baby", `el._moment(s, { type: "tucked_in", user: el._hass.user.id, at: new Date().toISOString() });`);
    await babyShot("06f-child-line", "child", `el._write(s, el._say(s, { state: "calling", attributes: { reason: "tummy rumbling!", reason_key: "call_hunger" } }, false), 20000);`);
    await babyShot("06g-baby-mood-line", "baby", `el._write(s, el._say(s, { state: "calling", attributes: { reason: "tummy rumbling!", reason_key: "call_hunger" } }, false), 20000);`);
    await page.locator("hatch-pet-card .nav.prev").click();
    await page.waitForTimeout(1500);
    await hush();
    await page.locator("hatch-pet-card").evaluate((el) => el._slides.forEach((s) => { s.sayUntil = 0; }));
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

  // 6. The card editor loads and offers the pets.
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

  check("no errors in the browser console", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
