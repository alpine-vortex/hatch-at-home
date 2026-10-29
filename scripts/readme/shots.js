// Shoot one device per world for the README art (scripts/readme/art.py).
// docs/readme/README.md walks through the whole retake; in short, with
// scripts/develop running and scripts/card-check run once (it onboards and
// makes the Woodland and Hearth pets):
//   node scripts/readme/shots.js setup   adds a pet in each other world, 26 h old
//   node scripts/readme/shots.js care    puts them to bed 6 h, then wakes, feeds,
//                                        cleans, cures and plays with every pet
//   node scripts/readme/shots.js shoot   saves docs/readme/src/world-<world>.png
// Shoot in daylight in HA's time zone, or the scenes are night and the pets
// asleep. SEASONAL=1 shoots the Halloween versions as halloween-<world>.png.
const { chromium } = require("playwright");
const path = require("path");
const HA = "http://localhost:8123";
const CLIENT = `${HA}/`;
const OUT = process.env.OUT || path.join(__dirname, "..", "..", "docs", "readme", "src");
require("fs").mkdirSync(OUT, { recursive: true });
async function api(method, url, token, body, form = false) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(body).toString(); }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${HA}${url}`, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function signIn() {
  const flow = await api("POST", "/auth/login_flow", null, { client_id: CLIENT, handler: ["homeassistant", null], redirect_uri: CLIENT });
  const done = await api("POST", `/auth/login_flow/${flow.flow_id}`, null, { client_id: CLIENT, username: "dev", password: "devdevdev" });
  return (await api("POST", "/auth/token", null, { grant_type: "authorization_code", code: done.result, client_id: CLIENT }, true)).access_token;
}
// Every pet's entity prefix, from its lights-out switch.
async function pets(access) {
  const states = await api("GET", "/api/states", access);
  return states.map((s) => s.entity_id.match(/^switch\.(.+)_lights_out$/)?.[1]).filter(Boolean);
}
(async () => {
  const access = await signIn();
  const mode = process.argv[2];
  const call = (service, data) => api("POST", `/api/services/${service}`, access, data);
  if (mode === "setup") {
    for (const [name, world] of [["Pebble", "terrarium"], ["Ripple", "tidepool"], ["Lily", "pond"], ["Luna", "nightsky"]]) {
      const flow = await api("POST", "/api/config/config_entries/flow", access, { handler: "virtual_pet" });
      const r = await api("POST", `/api/config/config_entries/flow/${flow.flow_id}`, access, { name, world });
      console.log(name, r.type, r.errors || "");
    }
    await call("virtual_pet/fast_forward", { hours: Number(process.argv[3] || 26) });
    return;
  }
  if (mode === "care") {
    const all = await pets(access);
    for (const p of all) await call("switch/turn_on", { entity_id: `switch.${p}_lights_out` });
    await call("virtual_pet/fast_forward", { hours: 6 }); // rested
    for (const p of all) {
      await call("switch/turn_off", { entity_id: `switch.${p}_lights_out` });
      for (const b of ["feed", "feed", "clean", "medicine", "play", "praise"]) {
        // Medicine is unavailable unless the pet is sick; that's fine.
        await call("button/press", { entity_id: `button.${p}_${b}` }).catch(() => {});
      }
    }
    const states = await api("GET", "/api/states", access);
    for (const p of all) console.log(p, states.find((s) => s.entity_id === `sensor.${p}_mood`)?.state);
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  // Shots show the plain card: no LCD grid, no power-on screen.
  const bootVersion = (require("fs").readFileSync(path.join(__dirname, "../..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8").match(/BOOT_VERSION = "([^"]+)"/) || [])[1];
  await page.addInitScript((v) => {
    localStorage.setItem("hatch-lcd", "off");
    if (v) localStorage.setItem("hatch-booted", v);
  }, bootVersion);
  await page.goto(CLIENT);
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
  await page.locator('input[autocomplete="username"]').first().fill("dev");
  await page.locator('input[type="password"]').first().fill("devdevdev");
  await page.keyboard.press("Enter");
  const signedIn = () => page.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
  await signedIn();
  await page.goto(`${HA}/pet-bench/pet`);
  await signedIn();
  await page.waitForTimeout(16000);
  await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  const seasonal = process.env.SEASONAL === "1" ? "halloween" : false;
  await page.locator("hatch-pet-card").evaluate((el, s) => { el.setConfig({ ...el._config, seasonal: s }); el.hass = el._hass; }, seasonal);
  // The world of the pet on show, from its life stage sensor.
  const worldOf = (title) => page.evaluate((title) => {
    const hass = document.querySelector("home-assistant").hass;
    const device = Object.values(hass.devices).find((d) => (d.name_by_user || d.name) === title);
    const stage = Object.values(hass.entities).find((e) => e.device_id === device?.id && e.translation_key === "life_stage");
    return hass.states[stage?.entity_id]?.attributes.world;
  }, title);
  const n = await page.locator("hatch-pet-card .slide").count();
  for (let i = 0; i < n; i++) {
    // Halloween needs longer: the costume and the first-visit countdown come in.
    await page.waitForTimeout(Number(process.env.WAIT || (seasonal ? 9000 : 3000)));
    const title = (await page.locator("hatch-pet-card .title").innerText()).trim();
    const world = await worldOf(title);
    const file = `${seasonal ? "halloween" : "world"}-${world}.png`;
    await page.locator("hatch-pet-card .slide:not(.away-slide)").locator(".device").screenshot({ path: path.join(OUT, file) });
    console.log(title, "->", file);
    await page.locator("hatch-pet-card .next").click();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
