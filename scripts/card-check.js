// Drive the pet shelf card in the throwaway HA and check what players see.
//
// Start `scripts/develop` first, then run `scripts/card-check`. On a fresh
// dev/config it onboards the `dev` / `devdevdev` user and creates two pets.
// Screenshots go to dev/card-check/. Exits non-zero if any check fails.
// Needs Playwright with Chromium (preinstalled in the cloud sessions).
//
// Environment: HA_URL (default http://localhost:8123).

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
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
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
  await page.locator("hatch-pet-card").evaluate((el) => {
    el.setConfig({ ...el._config, seasonal: false }); el.hass = el._hass;
  });
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

  // Idle life: something small happens on its own within a minute.
  const idleSign = () => cur().evaluate((slide) => {
    const pet = slide.querySelector(".pet");
    return ["look", "wander-l", "wander-r", "perk"].find((c) => pet.classList.contains(c)) ||
      (slide.querySelector(".speck") && "speck") ||
      (/_(?!content|excited|cozy|bored|sleepy|hungry|dirty|sick|asleep|calling)[a-z_]+_\d\.png/
        .test(pet.getAttribute("src") || "") && "pose") || "";
  });
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
    ["care_miss", { reason: "hunger" }, "nobody came"],
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
    el._costume(s, { key: "halloween" }, "boo!");
    await new Promise((r) => setTimeout(r, 900));
    const hat = s.screen.querySelector(".costume .hat")?.getBoundingClientRect();
    const at = el._flairAnchors(s);
    const sr = s.screen.getBoundingClientRect();
    return {
      pieces: [...s.seasonBox.querySelectorAll("img")].map((i) => i.className.split(" ")[0]),
      hatBottom: hat && hat.bottom - sr.top, hy: at.hy, fy: at.fy, said: s.bubble.textContent,
    };
  });
  check("halloween dresses the scene", spooky.pieces.includes("lantern") && spooky.pieces.includes("web"),
    spooky.pieces.join(" "));
  check("the costume hat sits on the head",
    spooky.hatBottom >= spooky.hy - 2 && spooky.hatBottom < spooky.fy && spooky.said === "boo!",
    `hat bottom ${Math.round(spooky.hatBottom)} vs head ${Math.round(spooky.hy)}`);
  await shot("05-halloween");
  await card.evaluate((el) => { el.setConfig({ ...el._config, seasonal: false }); el.hass = el._hass; });
  await page.waitForTimeout(800);
  check("seasonal: false takes the season away",
    await card.evaluate((el) => el._slides[el._index].seasonBox.children.length === 0));

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
