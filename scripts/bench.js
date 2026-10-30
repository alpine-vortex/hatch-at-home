// The card bench: PNGs of the real hatch-pet-card.js without Home Assistant.
//
//   NODE_PATH=/home/poe/github/relink/node_modules node scripts/bench.js --preset shells
//
// See dev/bench/README.md. Needs Playwright with Chromium (this repo has no
// node_modules: point NODE_PATH at a checkout that does).

const fs = require("fs");
const path = require("path");
const { startServer } = require("../dev/bench/server");

const ROOT = path.join(__dirname, "..");
const FRONTEND = path.join(ROOT, "custom_components", "virtual_pet", "frontend");
const WORLDS = JSON.parse(fs.readFileSync(path.join(FRONTEND, "worlds.json"), "utf8"));
const SHAPES = ["egg", "tank", "house", "porthole", "pad", "moon"];
const FINISHES = ["woodland", "aqua", "grove", "celestial", "dune", "clear", "glitter", "glow", "speckle", "stripes",
  "hearts", "stars", "gingham", "dots", "camo", "waves", "scales", "leaves", "paws", "constellation", "rainbow",
  "twotone", "sunset", "smoke"];
const PINNED_TIME = "2026-06-15T12:00:00Z"; // a plain June noon: no season, no countdown

const DEFAULTS = {
  species: null, stage: "adult", mood: "content", world: "woodland", scene: "day",
  season: false, pets: 1, width: 420, dpr: 1, time: PINNED_TIME, booted: true,
  clip: "card", view: "card",
};

function speciesData(id) {
  return JSON.parse(fs.readFileSync(path.join(FRONTEND, "sprites", id, "species.json"), "utf8"));
}
const allSpecies = () => fs.readdirSync(path.join(FRONTEND, "sprites"))
  .filter((d) => fs.existsSync(path.join(FRONTEND, "sprites", d, "species.json")));
const worldOf = (species) => Object.keys(WORLDS).find((w) => WORLDS[w].roster.includes(species)) || "woodland";

// --- Presets ---------------------------------------------------------------

const PRESETS = {
  // Every world's shell in every shape, day and night, at both card widths.
  shells() {
    const out = [];
    for (const width of [420, 330]) {
      for (const world of Object.keys(WORLDS)) {
        for (const shape of SHAPES) {
          for (const scene of ["day", "night"]) {
            out.push({ name: `shells/${width}/${world}-${shape}-${scene}`, group: `shells-${width}`, label: `${world} ${shape} ${scene}`,
              world, shell: { shape }, scene, width });
          }
        }
      }
    }
    return out;
  },
  // Every species, every stage it has, every mood: the creature's screen, frame 1.
  species() {
    const out = [];
    for (const id of allSpecies()) {
      const sp = speciesData(id);
      if (sp.ready === false) continue;
      const world = worldOf(id);
      out.push({ name: `species/${id}/egg`, group: `species-${id}`, label: "egg", species: id, world, stage: "egg", clip: "screen", say: "" });
      for (const stage of sp.stages) {
        for (const mood of sp.moods) {
          out.push({ name: `species/${id}/${stage}-${mood}`, group: `species-${id}`, label: `${stage} ${mood}`,
            species: id, world, stage, mood, clip: "screen", say: "" });
        }
      }
    }
    return out;
  },
  // Every shell finish on every world's own shape, day and night, at both card widths:
  // a sheet per world. Keep FINISHES in step with the card's.
  finishes() {
    const out = [];
    for (const world of Object.keys(WORLDS)) {
      for (const finish of FINISHES) {
        for (const width of [420, 330]) {
          for (const scene of ["day", "night"]) {
            out.push({ name: `finishes/${world}/${finish}-${width}-${scene}`, group: `finishes-${world}`,
              label: `${finish} ${width} ${scene}`, world, shell: { finish }, scene, width, clip: "device" });
          }
        }
      }
    }
    return out;
  },
  // The card around the toy: status screen, game picker, a speech bubble.
  ui() {
    const out = [];
    for (const world of ["woodland", "tidepool", "nightsky"]) {
      for (const [view, extra] of [["status", {}], ["games", {}], ["bubble", { say: "hi, Sam! I missed you~" }]]) {
        out.push({ name: `ui/${world}-${view}`, group: "ui", label: `${world} ${view}`, world, view: view === "bubble" ? "card" : view, ...extra });
      }
    }
    return out;
  },
};

// --- Shots -----------------------------------------------------------------

function normalize(raw) {
  const shot = { ...DEFAULTS, ...raw };
  shot.world = WORLDS[shot.world] ? shot.world : "woodland";
  const roster = WORLDS[shot.world].roster;
  const lead = { species: shot.species || roster[0], stage: shot.stage, mood: shot.mood, world: shot.world, ...(shot.pet || {}) };
  const count = typeof shot.pets === "number" ? shot.pets : shot.pets.length;
  const extra = Array.isArray(shot.pets) ? shot.pets : [];
  shot.pets = [lead];
  for (let i = 1; i < count; i++) {
    shot.pets.push({ species: roster[i % roster.length], stage: "child", mood: "content", world: shot.world, ...(extra[i] || {}) });
  }
  shot.name ||= `shot-${shot.species || "x"}-${shot.stage}-${shot.mood}`;
  if (shot.lcd !== undefined || shot.booted) {
    shot.storage = { ...(shot.booted ? { "hatch-booted": "1" } : {}), ...(shot.lcd !== undefined ? { "hatch-lcd": String(shot.lcd) } : {}), ...shot.storage };
  }
  return shot;
}

function parseArgs(argv) {
  const opts = { shot: {}, workers: 6, out: path.join(ROOT, "dev", "bench", "out"), sheet: true };
  const num = new Set(["width", "dpr", "pets", "seed"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    const val = () => argv[++i];
    if (key === "preset") opts.preset = val();
    else if (key === "shots") opts.shots = val();
    else if (key === "out") opts.out = path.resolve(val());
    else if (key === "workers") opts.workers = Number(val());
    else if (key === "no-sheet") opts.sheet = false;
    else if (key === "only") opts.only = val();
    else if (key === "shape" || key === "color" || key === "bezel" || key === "finish") (opts.shot.shell ||= {})[key] = val();
    else if (key === "lcd") opts.shot.lcd = val();
    else if (key === "boot") opts.shot.booted = false;
    else if (key === "season") opts.shot.season = val() === "off" ? false : val() === "on" ? "auto" : argv[i];
    else opts.shot[key] = num.has(key) ? Number(val()) : val();
  }
  return opts;
}

function loadShots(opts) {
  let shots;
  if (opts.preset) {
    if (!PRESETS[opts.preset]) throw new Error(`no preset "${opts.preset}" (${Object.keys(PRESETS).join(", ")})`);
    shots = PRESETS[opts.preset]().map((s) => ({ ...opts.shot, ...s, shell: { ...opts.shot.shell, ...s.shell } }));
    shots.forEach((s) => { s.name = `${opts.preset}/${s.name.split("/").slice(1).join("/")}`; });
  } else if (opts.shots) {
    const list = JSON.parse(fs.readFileSync(opts.shots, "utf8"));
    const base = Array.isArray(list) ? {} : list.defaults || {};
    shots = (Array.isArray(list) ? list : list.shots).map((s) => ({ ...base, ...s }));
  } else {
    shots = [{ name: opts.shot.name || "single", ...opts.shot }];
  }
  if (opts.only) shots = shots.filter((s) => s.name.includes(opts.only));
  return shots.map(normalize);
}

// --- Running ---------------------------------------------------------------

async function runShots(browser, base, shots, outDir, workers) {
  const queue = shots.map((s, i) => [s, i]);
  const failures = [];
  const worker = async () => {
    const contexts = new Map(); // one per dpr; storage is per context, so workers never share
    const pageFor = async (dpr) => {
      if (!contexts.has(dpr)) {
        const context = await browser.newContext({ viewport: { width: 500, height: 900 }, deviceScaleFactor: dpr, timezoneId: "UTC", locale: "en-US" });
        const page = await context.newPage();
        page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
        await page.goto(`${base}/`);
        contexts.set(dpr, page);
      }
      return contexts.get(dpr);
    };
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [shot] = job;
      try {
        const page = await pageFor(shot.dpr);
        await page.clock.setFixedTime(new Date(shot.time));
        await page.setViewportSize({ width: shot.width + 40, height: 900 });
        await page.evaluate((storage) => { localStorage.clear(); for (const [k, v] of Object.entries(storage || {})) localStorage.setItem(k, v); }, shot.storage);
        // The card claims its boot screen once per page load: a shot that wants it needs a fresh page.
        if (!shot.booted) await page.goto(`${base}/`);
        const motion = shot.motion === "reduce" ? "reduce" : "no-preference";
        if (page.motion !== motion && (page.motion || motion === "reduce")) await page.emulateMedia({ reducedMotion: motion });
        page.motion = motion;
        await page.evaluate((s) => window.bench.mount(s), shot);
        const inCard = { screen: ".slide:not(.away-slide) .screen", device: ".slide:not(.away-slide) .device" }[shot.clip];
        const file = path.join(outDir, `${shot.name}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // A clip of the page, not locator.screenshot: that waits for the card's
        // looping animations to hold still, about a second a shot.
        const clip = await page.evaluate((sel) => {
          const el = sel ? document.querySelector("hatch-pet-card").shadowRoot.querySelector(sel) : document.getElementById("stage");
          const b = el.getBoundingClientRect();
          return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height };
        }, inCard);
        await page.screenshot({ path: file, clip });
        shot.file = file;
      } catch (err) {
        failures.push(`${shot.name}: ${err.message.split("\n")[0]}`);
        contexts.clear(); // a fresh page for the next shot
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, shots.length) }, worker));
  return failures;
}

// A contact sheet per group: the shots as captioned tiles, drawn by the browser.
async function buildSheets(browser, shots, outDir) {
  const groups = new Map();
  for (const s of shots.filter((x) => x.file)) {
    const key = s.group || "sheet";
    (groups.get(key) || groups.set(key, []).get(key)).push(s);
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const made = [];
  for (const [key, list] of groups) {
    const tiles = list.map((s) => {
      const data = fs.readFileSync(s.file).toString("base64");
      return `<figure><img src="data:image/png;base64,${data}" style="width:${Math.round(s.clip === "screen" ? 160 : s.width * 0.5)}px"><figcaption>${s.label || s.name}</figcaption></figure>`;
    }).join("");
    await page.setContent(`<style>body{margin:0;padding:12px;background:#222;color:#ddd;font:11px system-ui}
      main{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}figure{margin:0}img{display:block;image-rendering:pixelated}
      figcaption{margin-top:3px;max-width:200px}</style><main>${tiles}</main>`);
    await page.waitForLoadState("load");
    const file = path.join(outDir, "sheets", `${key}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    made.push(file);
  }
  await page.close();
  return made;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const shots = loadShots(opts);
  const { chromium } = require("playwright");
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const started = Date.now();
  try {
    console.log(`${shots.length} shots -> ${opts.out}`);
    const failures = await runShots(browser, url, shots, opts.out, opts.workers);
    const done = shots.filter((s) => s.file).length;
    console.log(`${done} written in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (opts.sheet && opts.preset) {
      for (const f of await buildSheets(browser, shots, opts.out)) console.log(`sheet ${f}`);
    }
    if (failures.length) {
      console.error(`${failures.length} failed:\n  ${failures.slice(0, 20).join("\n  ")}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
