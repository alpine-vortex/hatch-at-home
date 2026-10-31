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
// The server's SHELL_UNLOCKS (rates.py): what a pet below teen has locked.
const SHOW_OFFS = { glitter: "teen", glow: "teen", smoke: "teen", sunset: "teen", constellation: "teen", stars: "teen" };
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
  // The settings sheet (the status screen's gear) with the viewer's own rows, at
  // both card widths, day and night.
  settings() {
    const out = [];
    for (const width of [420, 330]) {
      for (const world of ["woodland", "tidepool", "nightsky"]) {
        for (const scene of ["day", "night"]) {
          out.push({ name: `settings/${width}/${world}-${scene}`, group: `settings-${width}`, label: `${world} ${scene}`,
            world, scene, width, view: "settings", mine: true });
        }
      }
    }
    return out;
  },
  // The shell picker at both card widths: an egg (the show-offs locked, on its
  // world's own) and a teen (every finish open, wearing stripes, glitter previewed).
  picker() {
    const out = [];
    for (const width of [420, 330]) {
      const egg = { width, stage: "egg", view: "picker", shellOptions: FINISHES.filter((k) => !SHOW_OFFS[k]), shellLocked: SHOW_OFFS };
      const teen = { width, stage: "teen", view: "picker", shellFinish: "stripes", shellOptions: FINISHES, preview: "glitter" };
      for (const clip of ["card", "screen"]) {
        out.push({ ...egg, clip, name: `picker/${width}-egg-${clip}`, group: `picker-${clip}`, label: `${width} egg (top)` });
        out.push({ ...egg, clip, name: `picker/${width}-egg-locked-${clip}`, group: `picker-${clip}`, label: `${width} egg, locked`, scroll: '.sec[data-group="specials"]' });
        out.push({ ...teen, clip, name: `picker/${width}-teen-${clip}`, group: `picker-${clip}`, label: `${width} teen, glitter previewed`, scroll: '.sec[data-group="specials"]' });
        out.push({ ...teen, clip, name: `picker/${width}-teen-now-${clip}`, group: `picker-${clip}`, label: `${width} teen, stripes now`, scroll: ".tile.now" });
      }
    }
    return out;
  },
  // The mono screen (4 tones): the species sheet (frame 1, as `species`), then one
  // adult in woodland through every screen state, sheet, mark and the IR beam, at
  // both card widths. Each shot is measured for the pass rule (see monoPass).
  mono() {
    const out = [];
    for (const width of [420, 330]) {
      for (const s of PRESETS.species()) {
        out.push({ ...s, name: `mono/${width}/${s.name.slice(8)}`, group: `mono-${s.group}-${width}`, width, mono: true });
      }
      const strip = [
        ["day", {}], ["night", { scene: "night" }], ["dim", { scene: "dim" }], ["faded", { classes: ["faded"] }],
        ["raining", { classes: ["raining"] }], ["rain-scene", { scene: "rain" }], ["lit", { classes: ["lit"] }], ["lit-night", { scene: "night", classes: ["lit"] }],
        ["lit-rain-scene", { scene: "rain", classes: ["lit"] }],
        ["status", { view: "status" }], ["journal", { journal: true, view: "journal" }],
        ["picker", { view: "picker", shellOptions: FINISHES, shellFinish: "stripes", stage: "teen" }],
        ["games", { view: "games" }], ["bubble", { say: "hi, Sam! I missed you~" }], ["boot", { booted: false }],
        ["sick", { mood: "sick" }], ["dirty", { mood: "dirty" }], ["attention", { pet: { calling: true } }],
        ["effects-off", { lcd: "off" }], ["beam", { beam: true, pets: 2, clip: "card" }],
      ];
      for (const [label, extra] of strip) {
        out.push({ name: `mono/${width}/strip-${label}`, group: `mono-strip-${width}`, label, world: "woodland",
          clip: "device", width, mono: true, say: "", ...extra });
      }
    }
    return out;
  },
  // The same sheet on a shared screen: nothing personal, only this screen's rows.
  "settings-shared"() {
    const out = [];
    for (const width of [420, 330]) {
      for (const scene of ["day", "night"]) {
        out.push({ name: `settings-shared/${width}-${scene}`, group: "settings-shared", label: `${width} ${scene}`,
          scene, width, view: "settings", mine: true, storage: { "hatch-shared-screen": "on" } });
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
  if (shot.lcd !== undefined || shot.booted || shot.mono) {
    shot.storage = { ...(shot.booted ? { "hatch-booted": "1" } : {}), ...(shot.lcd !== undefined ? { "hatch-lcd": String(shot.lcd) } : {}),
      ...(shot.mono ? { "hatch-mono": "4" } : {}), ...shot.storage };
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
    else if (key === "mono") opts.shot.mono = val() !== "off";
    else if (key === "boot") opts.shot.booted = false;
    else if (key === "mine") opts.shot.mine = true;
    else if (key === "journal") Object.assign(opts.shot, { journal: true, view: "journal" });
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
        const png = await page.screenshot({ path: file, clip });
        shot.file = file;
        if (shot.mono) shot.measure = { screen: await page.evaluate(() => window.bench.screenClass), ...await measureMono(page, clip, png) };
        if (shot.costume) {
          const info = await page.evaluate(() => window.bench.info);
          fs.writeFileSync(file.replace(/\.png$/, ".json"), JSON.stringify(info));
        }
      } catch (err) {
        failures.push(`${shot.name}: ${err.message.split("\n")[0]}`);
        contexts.clear(); // a fresh page for the next shot
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, shots.length) }, worker));
  return failures;
}

// --- The mono pass rule ----------------------------------------------------
//
// The four tones the card's #hatch-mono4 filter draws, darkest to lightest.
const MONO_TONES = [[0x2f, 0x3a, 0x24], [0x6f, 0x7f, 0x4f], [0x9a, 0xaa, 0x72], [0xc6, 0xd4, 0xa0]];
const MONO_MIN_APART = 0.5; // tone steps, pet pixel to the pixel behind it, on average (woodland day: ~0.9)
const MONO_MAX_SHARE = 0.97; // one tone over this much of the screen = flat

// The screen (inset past its rounded corners) in the shot just taken, measured
// against three more captures: the pet hidden (what is behind it), and the pet as
// a black and as a white silhouette (where they differ is the pet, including the
// pixels that came out the same tone as the background). Returns tone shares, how
// much of the screen is on the palette, and for the pet: `apart`, the mean tone
// steps between each pet pixel and the pixel behind it (0 where it is lost), `lost`,
// the share that is the same tone, and `delta`, the mean luma difference in tone
// steps. The pet ones are null when no pet is on show.
async function measureMono(page, clip, png) {
  const petStyle = (css) => page.evaluate(async (css) => {
    const pet = document.querySelector("hatch-pet-card").shadowRoot.querySelector(".slide:not(.away-slide) .screen .pet");
    Object.assign(pet.style, css);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, css);
  const box = await page.evaluate((c) => {
    const root = document.querySelector("hatch-pet-card").shadowRoot;
    const s = root.querySelector(".slide:not(.away-slide) .screen");
    const pet = s.querySelector(".pet");
    const b = s.getBoundingClientRect();
    const p = pet.getBoundingClientRect();
    const css = getComputedStyle(pet);
    const shown = pet.getAttribute("src") && css.display !== "none" && css.visibility !== "hidden" && Number(css.opacity) > 0 &&
      p.width > 0 && !s.classList.contains("show-status") && !s.querySelector(".game:not([hidden])") && !root.querySelector(".boot:not([hidden])");
    const ix = b.width * 0.06;
    const iy = b.height * 0.06;
    return { x: Math.round(b.x + scrollX - c.x + ix), y: Math.round(b.y + scrollY - c.y + iy),
      w: Math.round(b.width - 2 * ix), h: Math.round(b.height - 2 * iy), shown: !!shown };
  }, clip);
  let more = null;
  if (box.shown) {
    more = {};
    await petStyle({ visibility: "hidden" });
    more.bare = (await page.screenshot({ clip })).toString("base64");
    await petStyle({ visibility: "", filter: "brightness(0)" });
    more.black = (await page.screenshot({ clip })).toString("base64");
    await petStyle({ filter: "brightness(0) invert(1)" });
    more.white = (await page.screenshot({ clip })).toString("base64");
    await petStyle({ filter: "" });
  }
  return page.evaluate(async ({ a, more, box, tones }) => {
    const pixels = async (src) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return g.getImageData(box.x, box.y, box.w, box.h).data;
    };
    const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const tl = tones.map(([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b);
    const step = (tl[3] - tl[0]) / 3;
    const nearest = (l) => tl.reduce((best, t, i) => (Math.abs(l - t) < Math.abs(l - tl[best]) ? i : best), 0);
    const pa = await pixels(a);
    const [pb, pk, pw] = more ? [await pixels(more.bare), await pixels(more.black), await pixels(more.white)] : [];
    const share = [0, 0, 0, 0];
    let onPalette = 0;
    let petL = 0;
    let backL = 0;
    let petN = 0;
    let apart = 0;
    let lost = 0;
    const n = pa.length / 4;
    for (let i = 0; i < pa.length; i += 4) {
      const l = luma(pa, i);
      const k = nearest(l);
      share[k]++;
      if (tones[k].every((v, c) => Math.abs(pa[i + c] - v) <= 20)) onPalette++;
      if (pk && Math.abs(luma(pk, i) - luma(pw, i)) > 2 * step) {
        const lb = luma(pb, i);
        const d = Math.abs(k - nearest(lb));
        petL += l;
        backL += lb;
        apart += d;
        if (!d) lost++;
        petN++;
      }
    }
    return {
      share: share.map((v) => +(v / n).toFixed(3)), palette: +(onPalette / n).toFixed(3), petPixels: petN,
      apart: petN ? +(apart / petN).toFixed(2) : null, lost: petN ? +(lost / petN).toFixed(2) : null,
      delta: petN ? +(Math.abs(petL - backL) / petN / step).toFixed(2) : null,
    };
  }, { a: png.toString("base64"), more, box, tones: MONO_TONES });
}

// Fail = a flat screen, or a pet under MONO_MIN_APART tone steps from what is
// behind it. Then the worst 10 by that, for the owner's look.
function monoPass(shots) {
  const measured = shots.filter((s) => s.measure);
  if (!measured.length) return;
  const fails = [];
  for (const s of measured) {
    const m = s.measure;
    const why = [];
    if (Math.max(...m.share) > MONO_MAX_SHARE) why.push(`flat (${Math.max(...m.share)})`);
    if (m.apart !== null && m.apart < MONO_MIN_APART) why.push(`apart ${m.apart}`);
    if (why.length) fails.push(`${s.name}: ${why.join(", ")}`);
  }
  const pets = measured.filter((s) => s.measure.apart !== null).sort((a, b) => a.measure.apart - b.measure.apart);
  const fmt = (s) => `${s.name}: apart ${s.measure.apart}, lost ${s.measure.lost}, delta ${s.measure.delta}, tones ${s.measure.share.join("/")}`;
  console.log(`mono pass rule: ${measured.length} measured, ${fails.length} fail (apart >= ${MONO_MIN_APART}, no tone over ${MONO_MAX_SHARE})`);
  for (const f of fails.slice(0, 40)) console.log(`  FAIL ${f}`);
  if (fails.length > 40) console.log(`  ... ${fails.length - 40} more in mono-pass.json`);
  console.log("  worst 10 by apart:");
  for (const s of pets.slice(0, 10)) console.log(`    ${fmt(s)}`);
  const offPalette = measured.filter((s) => s.measure.palette < 0.95);
  if (offPalette.length) console.log(`  ${offPalette.length} under 95% on the palette (the worst: ${offPalette.sort((a, b) => a.measure.palette - b.measure.palette)[0].name})`);
  return { fails, worst: pets.slice(0, 10).map(fmt) };
}

// The mono backlight must move the scene: each lit strip shot against its unlit twin
// differs on more than MONO_LIT_MIN of the pixels (day, night, rain).
const MONO_LIT_MIN = 0.05;
async function monoLitCheck(browser, shots) {
  const by = new Map(shots.filter((s) => s.file && s.mono).map((s) => [s.name, s.file]));
  const pairs = [];
  for (const width of [420, 330]) {
    for (const [unlit, lit] of [["day", "lit"], ["night", "lit-night"], ["rain-scene", "lit-rain-scene"]]) {
      const a = by.get(`mono/${width}/strip-${unlit}`);
      const b = by.get(`mono/${width}/strip-${lit}`);
      if (a && b) pairs.push({ label: `${width} ${unlit} vs ${lit}`, a, b });
    }
  }
  if (!pairs.length) return [];
  const page = await browser.newPage();
  const out = [];
  for (const p of pairs) {
    const share = await page.evaluate(async ({ a, b }) => {
      const px = async (src) => {
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
      const [x, y] = [await px(a), await px(b)];
      let diff = 0;
      for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 30) diff++;
      return diff / (x.length / 4);
    }, { a: fs.readFileSync(p.a).toString("base64"), b: fs.readFileSync(p.b).toString("base64") });
    out.push({ ...p, share: +share.toFixed(3) });
  }
  await page.close();
  return out;
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
    const mono = monoPass(shots);
    if (mono) fs.writeFileSync(path.join(opts.out, "mono-pass.json"), JSON.stringify({ ...mono,
      shots: shots.filter((s) => s.measure).map((s) => ({ name: s.name, ...s.measure })) }, null, 1));
    const lit = await monoLitCheck(browser, shots);
    for (const l of lit) {
      const bad = l.share <= MONO_LIT_MIN;
      console.log(`mono backlight ${bad ? "FAIL" : "ok"}: ${l.label} differ on ${(l.share * 100).toFixed(1)}% of pixels (need > ${MONO_LIT_MIN * 100}%)`);
      if (bad) process.exitCode = 1;
    }
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
