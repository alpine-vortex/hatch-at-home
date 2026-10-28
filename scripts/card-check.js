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

  const browser = await chromium.launch();
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
  const cur = () => page.locator("hatch-pet-card .slide:not(.away-slide)");
  const shot = (name) => cur().locator(".device").screenshot({ path: path.join(OUT, `${name}.png`) });
  const bubble = () => cur().locator(".bubble").innerText();
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
  check("idle life happens by itself", !!idle, idle);
  await shot("04b-idle");
  await button(2).click();
  await page.waitForTimeout(600);
  check("play offers a choice of games",
    (await cur().locator(".gpick button").count()) === 2 && await cur().locator(".gpick").isVisible());
  await shot("04a-pick");
  await cur().locator('.gpick [data-game="left_right"]').click();
  await page.waitForTimeout(400);
  let rounds = 0;
  for (let r = 0; r < 5 && !(await cur().locator(".game").isHidden()); r++) {
    await cur().locator(r % 2 ? ".gr" : ".gl").click();
    await page.waitForTimeout(1400);
    rounds++;
  }
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
