// Shoot one device per world for the README art (scripts/readme/art.py).
//
// With scripts/develop running and scripts/card-check run once (it onboards and
// makes the Woodland and Hearth pets):
//   node scripts/readme/shots.js setup   adds a pet in each other world, 26 h old
//   node scripts/readme/shots.js shoot   saves each device to dev/readme-shots/
// Take the shots in daylight (HA's time zone) with the pets awake and cared for;
// SEASONAL=1 PREFIX=h adds the Halloween versions.
const { chromium } = require("playwright");
const path = require("path");
const HA = "http://localhost:8123";
const CLIENT = `${HA}/`;
const OUT = process.env.OUT || path.join(__dirname, "..", "..", "dev", "readme-shots");
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
(async () => {
  const access = await signIn();
  const mode = process.argv[2];
  if (mode === "setup") {
    for (const [name, world] of [["Pebble", "terrarium"], ["Ripple", "tidepool"], ["Lily", "pond"], ["Luna", "nightsky"]]) {
      const flow = await api("POST", "/api/config/config_entries/flow", access, { handler: "virtual_pet" });
      const r = await api("POST", `/api/config/config_entries/flow/${flow.flow_id}`, access, { name, world });
      console.log(name, r.type, r.errors || "");
    }
    await api("POST", "/api/services/virtual_pet/fast_forward", access, { hours: Number(process.argv[3] || 26) });
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
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
  const n = await page.locator("hatch-pet-card .slide").count();
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(Number(process.env.WAIT || 2500));
    const title = (await page.locator("hatch-pet-card .title").innerText()).trim();
    await page.locator("hatch-pet-card .slide:not(.away-slide)").locator(".device").screenshot({ path: path.join(OUT, `${process.env.PREFIX || ""}${i}-${title}.png`) });
    console.log(i, title);
    await page.locator("hatch-pet-card .next").click();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
