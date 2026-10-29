// Dress every creature, at every stage, in each of a season's costumes, and
// screenshot the card's screen: dev/costumes/<species>_<stage>_<costume>.png.
// Then scripts/art/costume_sheet.py builds one contact sheet per costume.
//
// Start `scripts/develop` and run `scripts/card-check` once first (it onboards
// the dev user and creates the test pets). Usage:
//   node scripts/costume-preview.js [season]     (default: halloween)
// Costumes come from the card's SEASONS, creatures from the sprite folders
// with a species.json. Skip lists are ignored so every pair can be judged;
// the shot is named "-SKIPPED" when the card would never show it.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const HA = process.env.HA_URL || "http://localhost:8123";
const SEASON = process.argv[2] || "halloween";
const FRONTEND = path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend");
const OUT = path.join(__dirname, "..", "dev", "costumes");
const SPECIES = fs.readdirSync(path.join(FRONTEND, "sprites"))
  .filter((d) => fs.existsSync(path.join(FRONTEND, "sprites", d, "species.json")));
const STAGES = ["baby", "child", "teen", "adult"];

// The season's costume list, as written in the card.
function costumesOf(key) {
  const card = fs.readFileSync(path.join(FRONTEND, "hatch-pet-card.js"), "utf8");
  const at = card.indexOf(`key: "${key}"`);
  if (at < 0) throw new Error(`no season "${key}" in the card`);
  const start = card.indexOf("costumes: [", at);
  const end = card.indexOf("\n    ],", start);
  if (start < 0 || end < 0) throw new Error(`season "${key}" has no costumes`);
  return Function(`return [${card.slice(start + "costumes: [".length, end)}\n];`)();
}
const COSTUMES = costumesOf(SEASON);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  // Shots show the plain card: no LCD grid, no power-on screen.
  const bootVersion = (require("fs").readFileSync(path.join(__dirname, "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8").match(/BOOT_VERSION = "([^"]+)"/) || [])[1];
  await page.addInitScript((v) => {
    localStorage.setItem("hatch-lcd", "off");
    if (v) localStorage.setItem("hatch-booted", v);
  }, bootVersion);
  await page.goto(`${HA}/`);
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
  await page.locator('input[autocomplete="username"]').first().fill("dev");
  await page.locator('input[type="password"]').first().fill("devdevdev");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 60000 });
  await page.goto(`${HA}/pet-bench/pet`);
  await page.waitForTimeout(16000); // the frontend reloads itself once after the first load
  await page.waitForSelector("hatch-pet-card .statusbtn", { timeout: 30000 });
  const card = page.locator("hatch-pet-card");
  await card.evaluate((el, key) => {
    el.setConfig({ ...el._config, seasonal: key });
    // Freeze: HA's own updates would undo the injected creature mid-shot.
    const real = el._hass;
    Object.defineProperty(el, "hass", { set() {}, get() { return this._hass; }, configurable: true });
    el._hass = real;
  }, SEASON);
  for (const sp of SPECIES) {
    for (const st of STAGES) {
      const inject = () => card.evaluate(async (el, [sp, st]) => {
        const s = el._slides[el._index];
        const states = { ...el._hass.states };
        const put = (domainKey, patch) => {
          const id = Object.values(s.ids).find((v) => typeof v === "string" && v.startsWith(domainKey.split(".")[0] + ".")
            && el._hass.entities?.[v]?.translation_key === domainKey.split(".")[1]) ||
            Object.values(s.ids).find((v) => typeof v === "string" && v.endsWith(domainKey.split(".")[1]));
          if (!id) return;
          const old = states[id];
          states[id] = { ...old, ...patch, attributes: { ...old.attributes, ...(patch.attributes || {}) },
            last_updated: new Date().toISOString() };
        };
        put("sensor.life_stage", { state: st, attributes: { species: sp } });
        put("sensor.mood", { state: "content", attributes: { flags: [] } });
        put("binary_sensor.asleep", { state: "off" });
        el._hass = { ...el._hass, states };
        el._update();
        for (let i = 0; i < 40 && !(s.species && s.speciesId === sp && s.drawn); i++) {
          await new Promise((r) => setTimeout(r, 100));
          el._update();
        }
        return { id: s.speciesId, drawn: s.drawn };
      }, [sp, st]);
      const result = await inject();
      if (result.id !== sp) { console.log("skip", sp, st, JSON.stringify(result)); continue; }
      const tries = [];
      for (let c = 0; c < COSTUMES.length; c++) {
        const art = await card.evaluate(async (el, [costume, key]) => {
          const s = el._slides[el._index];
          s.frame = 0;
          el._update();
          const head = s.species.hat?.[s.drawn] || s.species.head?.[s.drawn];
          if (!head) return null;
          s.nextIdle = Date.now() + 600000;
          s.pet.classList.remove("wander-l", "wander-r", "look");
          el._headTopAll(s, head[0], head[1]);
          await new Promise((r) => setTimeout(r, 1200));
          // The real costumes, one at a time, skip lists ignored so every pair is seen.
          el._costume(s, { key, costumes: [{ ...costume, skip: [] }] }, costume.art);
          await new Promise((r) => setTimeout(r, 1000));
          return costume.art + (costume.skip?.includes(s.speciesId) ? "-SKIPPED" : "");
        }, [COSTUMES[c], SEASON]);
        if (!art) continue;
        await page.locator("hatch-pet-card .slide:not(.away-slide) .screen").screenshot({
          path: path.join(OUT, `${sp}_${st}_${art}.png`) });
        // HA's own state for the test pet can come back mid-shot: retake unless
        // the frame on show is the creature and stage asked for.
        const src = await card.evaluate((el) => el._slides[el._index].pet.src);
        if (!src.includes(`/${sp}/${st}_`)) {
          console.log("RETAKE", sp, st, art, src.split("/").slice(-2).join("/"));
          if ((tries[c] = (tries[c] || 0) + 1) < 4) { await inject(); c--; }
          else console.log("GAVE UP", sp, st, art);
        }
      }
      console.log(sp, st);
    }
  }
  await browser.close();
})();
