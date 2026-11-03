// The card bench: PNGs of the real hatch-pet-card.js without Home Assistant.
//
//   NODE_PATH=/home/poe/github/relink/node_modules node scripts/bench.js --preset shells
//
// See dev/bench/README.md. Needs Playwright with Chromium (this repo has no
// node_modules: point NODE_PATH at a checkout that does).

const fs = require("fs");
const path = require("path");
const { startServer } = require("../dev/bench/server");
// The card is built from src/card/ (gitignored); rebuild if the parts changed.
require("./build-card.js").ensureBuilt();

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

// The world visitors: worlds.json's roster (the play data is the card's).
const VISITORS = Object.fromEntries(Object.entries(WORLDS).map(([w, world]) => [w, world.visitors || []]));
const CROSSERS = new Set(["shootingstar"]); // the card's VISITOR_PLAY with cross: true

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
      for (const [view, extra] of [["status", {}], ["games", {}], ["bubble", { say: "hi, Sam! I missed you~" }],
        ["phone", { ask: "phone", say: "can I call your phone when I need you?" }]]) { // top10 1a
        out.push({ name: `ui/${world}-${view}`, group: "ui", label: `${world} ${view}`, world,
          view: ["bubble", "phone"].includes(view) ? "card" : view, ...extra });
      }
    }
    // Fresh-expand E2: a starry teen's own pat line and praise line (P-a, P-c).
    const starry = { world: "woodland", view: "card", stage: "teen", pet: { personality: "starry" } };
    out.push({ name: "ui/woodland-pat-starry", group: "ui", label: "pat, starry", ...starry, say: "my favourite kind of applause ★" });
    out.push({ name: "ui/woodland-praise-starry", group: "ui", label: "praise, starry", ...starry, say: "I'll take a bow for that ★" });
    // Fresh-expand E4: a dream morning's wake line, and a clean's extra bubble mid-pop.
    out.push({ name: "ui/woodland-wake-dream", group: "ui", label: "wake, a dream day", world: "woodland", view: "card",
      say: "*yawn* i had the best dream" });
    out.push({ name: "ui/woodland-bubble-pop", group: "ui", label: "clean, a bubble pops", world: "woodland", view: "card",
      bubblePop: true });
    return out;
  },
  // The Berry dig (playtime 2a) with scripted replies, at 420 and 330 (compact): a
  // game under way, a berry just dug, a bee, and the three-game picker.
  dig() {
    const out = [];
    const r = (round, wins, basket, more = {}) => ({ result: "ok", game: "dig", round, rounds: 5, wins, basket,
      leaves: 8 - basket, win_at: 5, done: false, ...more });
    for (const width of [420, 330]) {
      const base = { width, world: "woodland", group: `dig-${width}` };
      out.push({ ...base, name: `dig/${width}-picker`, label: "picker (three games)", view: "games" });
      out.push({ ...base, name: `dig/${width}-start`, label: "fresh pile, keep disabled", game: "dig",
        digReplies: [r(0, 0, 0)] });
      out.push({ ...base, name: `dig/${width}-under-way`, label: "round 2, 2 banked, basket 2", game: "dig" });
      out.push({ ...base, name: `dig/${width}-berry`, label: "a berry", game: "dig",
        digReplies: [r(1, 2, 2), r(1, 2, 3, { found: "berry", round_over: false })], digTaps: ["dig"] });
      out.push({ ...base, name: `dig/${width}-bee`, label: "a bee", game: "dig",
        digReplies: [r(1, 2, 2), r(2, 2, 0, { found: "bee", round_over: true })], digTaps: ["dig"] });
    }
    // The picker fits at every card width (audit s2616 #1/#4): three games.
    for (const width of [300, 320, 336, 350, 360, 375, 385, 400, 420]) {
      out.push({ width, world: "woodland", group: "dig-picker", name: `dig/picker-${width}`, label: `${width}`, view: "games" });
    }
    out.push({ width: 300, world: "woodland", group: "dig-300", name: "dig/300-under-way", label: "300: round 2, basket 2", game: "dig" });
    out.push({ width: 300, world: "woodland", group: "dig-300", name: "dig/300-start", label: "300: fresh pile",
      game: "dig", digReplies: [r(0, 0, 0)] });
    out.push({ width: 330, world: "woodland", group: "dig-calm", name: "dig/330-bee-calm", label: "a bee, reduced motion",
      motion: "reduce", game: "dig", digReplies: [r(1, 2, 2), r(2, 2, 0, { found: "bee", round_over: true })], digTaps: ["dig"] });
    return out;
  },
  // World visitors at 330: every one at its greet (its own hours: night ones on a night
  // screen), then the beats of one walker and one flyer, a calm visit, a baby and a child.
  visitors() {
    const out = [];
    const base = { width: 330, group: "visitors" };
    for (const [world, list] of Object.entries(VISITORS)) {
      for (const v of list) {
        out.push({ ...base, name: `visitors/${world}-${v.id}`, label: `${world} ${v.id}`, world,
          scene: v.hours === "night" ? "night" : "day", visitor: { id: v.id, beat: "greet" } });
      }
    }
    const extra = (name, label, shot) => out.push({ ...base, group: "visitors-beats", name: `visitors/${name}`, label, ...shot });
    for (const beat of ["arrive", "greet", "leave"]) {
      extra(`beat-woodland-snail-${beat}`, `snail ${beat}`, { world: "woodland", visitor: { id: "snail", beat, frame: 2 } });
      extra(`beat-tidepool-gull-${beat}`, `gull ${beat} (right)`, { world: "tidepool", visitor: { id: "gull", beat, side: "right" } });
    }
    extra("night-hearth-mouse", "hearth mouse, night", { world: "hearth", scene: "night", visitor: { id: "mouse" } });
    extra("calm-pond-heron", "pond heron, calm", { world: "pond", motion: "reduce", visitor: { id: "heron" } });
    extra("baby-terrarium-ladybird", "baby, ladybird", { world: "terrarium", stage: "baby", visitor: { id: "ladybird" },
      storage: { "hatch-baby-talk-bench-user": "on" } }); // baby talk is the viewer's own switch
    extra("child-nightsky-raccoon", "child, raccoon (line only)", { world: "nightsky", stage: "child", scene: "night", visitor: { id: "raccoon" } });
    // The greet's wave frames: three species at baby, teen and adult, and a child (no wave).
    for (const species of ["otter", "fox", "beardeddragon"]) {
      for (const stage of ["baby", "teen", "adult"]) {
        extra(`wave-${species}-${stage}`, `${species} ${stage} waves`, { world: "woodland", species, stage, visitor: { id: "snail" } });
      }
    }
    extra("wave-otter-child", "otter child (no wave)", { world: "woodland", species: "otter", stage: "child", visitor: { id: "snail" } });
    return out;
  },
  // Visitors as friends (fresh-expand E3): every world's visitors greeting with a friend
  // line (the line is the shot's point), one sheet row per world.
  "visitors-friends"() {
    const out = [];
    for (const [world, list] of Object.entries(VISITORS)) {
      for (const v of list) {
        out.push({ width: 330, group: `friends-${world}`, name: `visitors-friends/${world}-${v.id}`, label: `${v.id}, a friend`, world,
          scene: v.hours === "night" ? "night" : "day", visitor: { id: v.id, beat: "greet", friend: true } });
      }
    }
    return out;
  },
  // Fresh-expand E10, card only: a pair day in each world (a planned visitor and a friend of
  // its world with the same hours, from the other side) and a guest from the next world
  // (its home world's line), at the greet.
  "visitors-rare"() {
    const out = [];
    const worlds = Object.keys(VISITORS);
    worlds.forEach((world, i) => {
      const list = VISITORS[world].filter((v) => !CROSSERS.has(v.id)); // a crosser never pairs
      const v = list.find((x) => list.some((y) => y.id !== x.id && y.hours === x.hours));
      if (v) {
        out.push({ width: 330, group: "rare-pair", name: `visitors-rare/pair-${world}-${v.id}`, label: `${world}: ${v.id} and a friend`,
          world, scene: v.hours === "night" ? "night" : "day", visitor: { id: v.id, beat: "greet", pair: true } });
      }
      const from = worlds[(i + 1) % worlds.length];
      const g = VISITORS[from].find((x) => !CROSSERS.has(x.id) && x.hours !== "night");
      if (g) {
        out.push({ width: 330, group: "rare-guest", name: `visitors-rare/guest-${world}-from-${from}`, label: `${world}: ${g.id} from ${from}`,
          world, scene: "day", visitor: { id: g.id, beat: "greet", guest: from } });
      }
    });
    return out;
  },
  // The basket and the reveal (visitors v2 §3, V-C): every find at reveal size (16 cells)
  // over its own world's backdrop, one sheet a world; then the three baskets, a first-ever
  // find (its sparkle), a visitor's, an old world's, a baby, calm, a night basket and the
  // compact layout (no basket). The collection page is V-D's.
  finds() {
    const out = [];
    for (const [world, w] of Object.entries(WORLDS)) {
      for (const f of w.finds || []) {
        out.push({ name: `finds/${world}-${f.id}`, group: `finds-${world}`, label: `${world} ${f.id}`, world,
          reveal: { id: f.id } });
      }
    }
    const extra = (name, label, shot) => out.push({ group: "finds-basket", name: `finds/${name}`, label, ...shot });
    for (const n of [1, 2, 3]) extra(`basket-${n}`, `basket ${n}`, { world: "woodland", basket: n });
    extra("basket-porthole", "basket 3, porthole", { world: "tidepool", basket: 3 });
    extra("basket-night", "basket 2, night", { world: "nightsky", scene: "night", basket: 2 });
    extra("basket-patbox", "basket over the pat box (wander-r)", { world: "woodland", basket: 3, patBox: true, petClasses: ["wander-r"] });
    extra("new-woodland-pinecone", "a first-ever find: sparkle", { world: "woodland", reveal: { id: "pinecone", new: true } });
    extra("left-nightsky-nighthawk", "a visitor's (V3)", { world: "nightsky", scene: "night",
      reveal: { id: "nighthawkfeather", from: "nighthawk", new: true } });
    extra("left-woodland-jay", "Steller's jay's", { world: "woodland", reveal: { id: "jayfeather", from: "stellersjay" } });
    extra("oldworld-pond-in-woodland", "an old world's find", { world: "woodland", reveal: { id: "lilyflower", world: "pond" } });
    extra("second-of-three", "the second of three", { world: "hearth",
      reveal: { finds: [{ id: "button" }, { id: "spool", new: true }, { id: "cookie" }], at: 1 } });
    extra("baby-terrarium", "baby (V4)", { world: "terrarium", stage: "baby", reveal: { id: "seedpod" },
      storage: { "hatch-baby-talk-bench-user": "on" } });
    extra("calm-pond", "calm: still", { world: "pond", motion: "reduce", reveal: { id: "frogbit", new: true } });
    extra("compact-330", "compact: the basket shows", { world: "woodland", width: 330, basket: 3 });
    return out;
  },
  // A 30 s look (fresh-moment), played by the card's own tick: a fresh page's morning and
  // a tab resumed after 3 h hidden, each at 5, 10, 20 and 30 s in, and an evening look. An adult with a type, a
  // trait, today's wish and dream, and a night's sleep since this device last looked.
  look() {
    const out = [];
    const pet = { personality: "mellow", traits: ["early_bird"], trait_levels: { early_bird: 1 },
      wish: { kind: "bath", granted: false, open: true }, dream: { kind: "flying" },
      moments: [{ type: "fell_asleep", ago: 540 }, { type: "woke_up", ago: 30 }] };
    for (const [kind, resumed] of [["fresh", false], ["resumed", true]]) {
      for (const at of [5, 10, 20, 30]) {
        out.push({ group: `look-${kind}`, name: `look/${kind}-${String(at).padStart(2, "0")}s`, label: `${kind}, ${at} s`,
          world: "woodland", width: 330, time: "2026-11-02T07:30:00Z", pet, look: { at, resumed, seenAgo: 12 } });
      }
    }
    // The evening's today line (fresh-moment 4): a 19:30 look after the sunset; the wish
    // used up in the morning (its key spent), the dream too.
    const evening = { ...pet, moments: [{ type: "woke_up", ago: 750 }, { type: "sunset", ago: 60 }] };
    const spent = { "hatch-dream-bench_dev_0-Mon Nov 02 2026": "1", "hatch-wish-bench_dev_0-Mon Nov 02 2026": "1" };
    // A question on show as a visitor walks in and greets (fresh-moment 5a): the question
    // keeps its bubble and buttons, the greet says no line.
    for (const beat of ["arrive", "greet"]) {
      out.push({ group: "look-question", name: `look/question-visitor-${beat}`, label: `question, visitor ${beat}`,
        world: "woodland", width: 330, ask: "how_day", say: "how was your day?", visitor: { beat } });
    }
    for (const at of [5, 10]) {
      out.push({ group: "look-evening", name: `look/evening-${String(at).padStart(2, "0")}s`, label: `evening, ${at} s`,
        world: "woodland", width: 330, scene: "night", time: "2026-11-02T19:30:00Z", pet: evening, storage: spent,
        look: { at, seenAgo: 12 } });
    }
    return out;
  },
  // Gifts (visitors v2 §5, V-E2): said at the first look, the find popped above the pet.
  // V5 with the longest name (porthole too), V6 made and found, an old world's gift, V7
  // (baby), calm (still), compact, and an asleep pet's look that takes nothing.
  gifts() {
    const out = [];
    const g = (name, label, shot) => out.push({ group: "gifts", name: `gifts/${name}`, label, ...shot });
    g("v5-tidepool-bottle", "V5, longest name (porthole)", { world: "tidepool", gift: { id: "bottle", world: "tidepool" } });
    g("v5-woodland-pinecone", "V5", { world: "woodland", gift: { id: "pinecone", world: "woodland" } });
    g("v5-nightsky-night", "V5, night", { world: "nightsky", scene: "night", gift: { id: "moonstone", world: "nightsky" } });
    g("v6-made-hearth", "V6 made (knitted heart)", { world: "hearth", gift: { id: "knittedheart", world: "hearth" } });
    g("v6-found-pond", "V6 found (pearl, from tidepool)", { world: "pond", gift: { id: "pearl", world: "tidepool" } });
    g("v6-made-pond", "V6 made (paper boat)", { world: "pond", gift: { id: "paperboat", world: "pond" } });
    g("v7-baby", "V7 baby", { world: "terrarium", stage: "baby", gift: { id: "seedpod", world: "terrarium" },
      storage: { "hatch-baby-talk-bench-user": "on" } });
    g("calm", "calm: still", { world: "woodland", motion: "reduce", gift: { id: "acorncup", world: "woodland" } });
    g("compact-330", "compact", { world: "woodland", width: 330, gift: { id: "fourleafclover", world: "woodland" } });
    g("compact-330-porthole", "compact, porthole, longest", { world: "tidepool", width: 330, gift: { id: "bottle", world: "tidepool" } });
    g("asleep", "asleep: nothing", { world: "woodland", mood: "asleep", gift: { id: "pinecone", world: "woodland" } });
    return out;
  },
  // The finds page (visitors v2 §4, V-D): each world part met at both card widths (two
  // visitors; plain finds drawn, the rest silhouettes; a `when` find met, the others
  // hidden; ♥ on a met gift, a gift the house never found and the gift-only one), then the
  // same page on a shared screen (no ♥, no gift-only tile), an empty page, everything met
  // at 330 (the longest names), mono at both widths, and an older server (the journal).
  collection() {
    const out = [];
    for (const width of [420, 330]) {
      for (const world of Object.keys(WORLDS)) {
        out.push({ name: `collection/${width}/${world}`, group: `collection-${width}`, label: `${world}`, world, width,
          scene: world === "nightsky" ? "night" : "day", view: "collection", collection: true });
      }
    }
    const extra = (name, label, shot) => out.push({ group: "collection-cases", name: `collection/${name}`, label,
      view: "collection", collection: true, ...shot });
    extra("shared-woodland", "shared screen: no ♥", { world: "woodland", storage: { "hatch-shared-screen": "on" } });
    extra("empty-woodland", "empty page", { world: "woodland", collection: "empty" });
    const all = (w) => ({ visitors: w.visitors.map((v) => v.id), finds: w.finds.filter((f) => !f.gift_only).map((f) => f.id),
      gifts: w.finds.filter((f) => f.gift_only).map((f) => f.id) });
    extra("all-tidepool-330", "all met, 330", { world: "tidepool", width: 330, collection: all(WORLDS.tidepool) });
    extra("all-nightsky-420", "all met, 420", { world: "nightsky", scene: "night", collection: all(WORLDS.nightsky) });
    extra("mono-420", "mono 420", { world: "woodland", mono: true });
    extra("mono-330", "mono 330", { world: "woodland", width: 330, mono: true });
    extra("mono-hearth-330", "mono hearth 330", { world: "hearth", width: 330, mono: true });
    extra("error-woodland", "older server: the journal (its foot)", { world: "woodland", collection: "error", scrollEnd: true });
    extra("foot-woodland-330", "the page's foot, 330", { world: "woodland", width: 330, scrollEnd: true });
    return out;
  },
  // Every world (top10 8a): none raised, a few from two worlds, and all 30, at 420 and
  // 330, the 330 ones also scrolled to the foot; big text at 330.
  everyworld() {
    const out = [];
    const all = Object.values(WORLDS).flatMap((w) => w.roster);
    const cases = { none: [], some: [...WORLDS.woodland.roster.slice(0, 3), ...WORLDS.pond.roster.slice(0, 2)], all };
    for (const width of [420, 330]) {
      for (const [k, raised] of Object.entries(cases)) {
        out.push({ name: `everyworld/${width}/${k}`, group: `everyworld-${width}`, label: k, world: "woodland", width,
          view: "everyworld", journal: { raised } });
        if (width === 330) out.push({ name: `everyworld/${width}/${k}-end`, group: `everyworld-${width}`, label: `${k}, end`,
          world: "woodland", width, view: "everyworld", journal: { raised }, scrollEnd: true });
      }
    }
    out.push({ name: "everyworld/330/big", group: "everyworld-330", label: "big text", world: "woodland", width: 330,
      view: "everyworld", journal: { raised: cases.some }, bigText: true });
    return out;
  },
  // Big text (top10 4b): every status-box page at 420, 330 and compact (260), the
  // status page also scrolled to its end. Nothing may clip or run off the box.
  bigtext() {
    const out = [];
    for (const width of [420, 330, 260]) {
      for (const view of ["status", "settings", "picker", "journal", "collection"]) {
        out.push({ name: `bigtext/${width}/${view}`, group: `bigtext-${width}`, label: view, world: "woodland", width, view,
          bigText: true, mine: true, ...(view === "picker" ? { shellOptions: FINISHES, shellFinish: "stripes", stage: "teen" } : {}), ...(view === "collection" ? { collection: true } : {}) });
      }
      out.push({ name: `bigtext/${width}/status-end`, group: `bigtext-${width}`, label: "status, end", world: "woodland", width,
        view: "status", bigText: true, scrollEnd: true });
    }
    return out;
  },
  // The lay sheet (settings S2): the offer in two worlds at both card widths, big text at
  // 330, a pick made in HA outside the offer, and a waiting world change (the offer is the
  // new world's, raised by a second pet there).
  lay() {
    const out = [];
    const lead = (world, pet = {}) => ({ world, stage: "adult", view: "lay", pet: { lay: true, raised: "world", ...pet } });
    for (const world of ["woodland", "tidepool"]) {
      for (const width of [420, 330]) {
        out.push({ name: `lay/${width}/${world}`, group: `lay-${width}`, label: world, width, ...lead(world) });
      }
      out.push({ name: `lay/330/${world}-big`, group: "lay-330", label: `${world}, big text`, width: 330, bigText: true,
        ...lead(world) });
    }
    out.push({ name: "lay/330/picked", group: "lay-330", label: "one picked", width: 330, scroll: '.layrow[aria-pressed="true"]', ...lead("woodland", { next_egg: "Black-tailed deer" }) });
    out.push({ name: "lay/330/outside", group: "lay-330", label: "set in HA, not offered", width: 330, scroll: ".layrow.ro",
      ...lead("woodland", { next_egg: "Banana slug", raised: ["bird", "squirrel", "deer"] }) });
    out.push({ name: "lay/330/next-world", group: "lay-330", label: "next world: tidepool", width: 330,
      ...lead("woodland", { lay: { egg_world: "tidepool" }, next_world: "Tidepool" }),
      pets: [{}, { world: "tidepool", stage: "adult", raised: "world" }] });
    return out;
  },
  // The name sheet (settings S3), opened as a lay that hatched a new egg opens it: an empty
  // field and a 20-character name at 300/330/420, every error line, a baby, night, dim, big text,
  // and the status page's "name" row (egg and baby).
  name() {
    const out = [];
    const long = "Wwwwwwwwwwwwwwwwwwww"; // 20
    const base = { world: "woodland", view: "name", pet: { stage: "egg", generation: 2, hatch_minutes: 1400 } };
    for (const width of [420, 330, 300]) {
      out.push({ name: `name/${width}/name`, group: `name-${width}`, label: "Pip", width, ...base, pet: { ...base.pet, name: "Pip" } });
      out.push({ name: `name/${width}/empty`, group: `name-${width}`, label: "empty", width, ...base, nameText: "", rename: "bad_name" });
      out.push({ name: `name/${width}/long`, group: `name-${width}`, label: "20 characters", width, ...base,
        pet: { ...base.pet, name: long } });
    }
    for (const [code, label] of [["taken", "taken"], ["not_now", "not now"], ["read_only", "read only"], ["unknown", "anything else"]]) {
      out.push({ name: `name/330/error-${code}`, group: "name-330", label, width: 330, ...base, nameText: "Moss", rename: code });
    }
    out.push({ name: "name/330/baby", group: "name-330", label: "baby", width: 330, ...base, pet: { stage: "baby", generation: 2, name: "Moss" } });
    out.push({ name: "name/330/night", group: "name-330", label: "night", width: 330, ...base, scene: "night", pet: { ...base.pet, name: "Pip" } });
    out.push({ name: "name/330/dim", group: "name-330", label: "dim (lights out)", width: 330, ...base, scene: "dim", pet: { ...base.pet, name: "Pip" } });
    out.push({ name: "name/330/big", group: "name-330", label: "big text", width: 330, ...base, bigText: true, pet: { ...base.pet, name: long } });
    out.push({ name: "name/330/big-error", group: "name-330", label: "big text, error", width: 330, ...base, bigText: true, nameText: "", rename: "bad_name" });
    out.push({ name: "name/330/mono", group: "name-330", label: "mono", width: 330, ...base, mono: true });
    for (const width of [420, 330, 300]) {
      out.push({ name: `name/${width}/row-egg`, group: `namerow-${width}`, label: "egg: name row", width, world: "woodland", view: "status",
        pet: { stage: "egg", generation: 2, name: long, hatch_minutes: 1400 } });
      out.push({ name: `name/${width}/row-baby`, group: `namerow-${width}`, label: "baby: name row", width, world: "woodland", view: "status",
        pet: { stage: "baby", generation: 2, name: "Moss" } });
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
  // Winter lights at 330: every world day and night, each hat, mono at night per world,
  // the snow hare, December by the clock (season "auto"), the holiday names row on/off.
  winter() {
    const out = [];
    const base = { width: 330, season: "winter", group: "winter" };
    for (const world of Object.keys(WORLDS)) {
      for (const scene of ["day", "night"]) {
        out.push({ ...base, name: `winter/${world}-${scene}`, label: `${world} ${scene}`, world, scene, say: "" });
      }
      out.push({ ...base, group: "winter-mono", name: `winter/mono-${world}-night`, label: `${world} mono night`, world,
        scene: "night", mono: true, say: "" });
    }
    for (const art of ["knit_cap", "earmuffs", "light_wreath", "star_cap"]) {
      out.push({ ...base, group: "winter-more", name: `winter/hat-${art}`, label: art, costume: { season: "winter", art } });
    }
    out.push({ ...base, group: "winter-more", name: "winter/hare-woodland", label: "snow hare", world: "woodland",
      seasonVisitor: { season: "winter", at: 0.25 } });
    out.push({ ...base, group: "winter-more", name: "winter/hare-hearth-night", label: "snow hare, night (frame 2)",
      world: "hearth", scene: "night", seasonVisitor: { season: "winter", frame: 2, side: "right" } });
    out.push({ ...base, group: "winter-more", name: "winter/auto-december", label: "auto, 12 Dec", season: "auto",
      time: "2026-12-12T12:00:00Z", say: "" });
    for (const [label, storage] of [["on", {}], ["off", { "hatch-named-holidays": "off" }]]) {
      out.push({ ...base, group: "winter-more", name: `winter/names-${label}`, label: `holiday names ${label}`,
        view: "settings", scroll: ".bell.named", storage });
    }
    // The row at both widths, personal and on a shared screen (it shows there too).
    for (const width of [420, 330]) {
      for (const shared of [false, true]) {
        out.push({ ...base, width, group: "winter-names", name: `winter/names-${width}${shared ? "-shared" : ""}`,
          label: `${width}${shared ? " shared" : ""}`, view: "settings", scroll: ".bell.named", mine: true,
          storage: shared ? { "hatch-shared-screen": "on" } : {} });
      }
    }
    return out;
  },
  // ha-signals H7: a season's first day, its eight lines (set C) and the journal's
  // four labels, at both widths.
  seasons() {
    const out = [];
    const time = "2027-03-21T12:00:00Z";
    const day = (iso) => Math.floor(new Date(iso).getTime() / 1000);
    const memories = [
      { kind: "season_summer", at: day("2026-06-21T09:00:00Z") }, { kind: "season_autumn", at: day("2026-09-22T09:00:00Z") },
      { kind: "first_snow", at: day("2026-12-02T09:00:00Z") }, { kind: "season_winter", at: day("2026-12-21T09:00:00Z") },
      { kind: "season_spring", at: day("2027-03-20T09:00:00Z") },
    ];
    for (const width of [420, 330]) {
      out.push({ name: `seasons/journal-${width}`, group: "seasons-journal", label: `journal ${width}`, world: "woodland",
        width, time, journal: { memories }, view: "journal", scrollEnd: true });
    }
    const lines = ["first day of spring! ♪", "spring's here! hop hop ♪", "summer's here! ☀ ♪", "first day of summer! ☀",
      "autumn's here! crunchy leaves ♪", "first day of autumn ♪", "winter's here! ❄", "first day of winter! ❄"];
    lines.forEach((say, i) => {
      out.push({ name: `seasons/line-${i + 1}`, group: "seasons-lines", label: say, world: "woodland", width: 330, time, say });
    });
    return out;
  },
  // The S7 rows of the sheet at 330 (and big text at 300): the sub-headings (sound, look), the
  // bedtime row in 12 h and 24 h, and N24 at the foot (an admin), day, night, mono and big text.
  "settings-s7"() {
    const out = [];
    const base = { world: "woodland", width: 330, view: "settings", mine: true };
    const parts = [["top", {}], ["bedtime", { scroll: ".sleeprow" }], ["end", { scrollEnd: true }]];
    for (const [label, extra] of [["day", {}], ["night", { scene: "night" }], ["mono", { mono: true }], ["big", { bigText: true }]]) {
      for (const [part, scroll] of parts) {
        out.push({ ...base, ...extra, ...scroll, name: `settings-s7/330-${label}-${part}`, group: `settings-s7-${label}`, label: `${label} ${part}` });
      }
    }
    out.push({ ...base, timeFormat: "12", scroll: ".sleeprow", name: "settings-s7/330-12h", group: "settings-s7-time", label: "12 h" });
    out.push({ ...base, timeFormat: "24", scroll: ".sleeprow", name: "settings-s7/330-24h", group: "settings-s7-time", label: "24 h" });
    for (const [part, scroll] of parts) {
      out.push({ ...base, width: 300, bigText: true, timeFormat: "12", ...scroll, name: `settings-s7/300-big-${part}`, group: "settings-s7-300", label: `300 big ${part}` });
    }
    out.push({ ...base, admin: false, scroll: ".sleeprow", name: "settings-s7/330-nonadmin", group: "settings-s7-time", label: "not an admin" });
    return out;
  },
  // Species nature N1 (plan-2026-11-02-species-nature.md section 10): the sky reaction per sky (both
  // lines, 330 and 300, and calm), the sunset and morning lines per clock, and a baby and a child with none.
  nature() {
    const out = [];
    const skies = [["sun", "tortoise", "terrarium", "sunny"], ["rain", "otter", "tidepool", "rainy"],
      ["snow", "corgi", "hearth", "snowy"], ["fog", "deer", "woodland", "foggy"], ["wind", "squirrel", "woodland", "windy"],
      ["fire", "kitten", "hearth", "fireside"], ["moon", "bat", "nightsky", "full_moon"]];
    for (const [sky, species, world, flag] of skies) {
      const base = { species, world, width: 330, pet: { flags: [flag] }, group: "nature-sky", scene: sky === "moon" ? "night" : "day" };
      for (const [i, draw] of [0, 0.99].entries()) {
        out.push({ ...base, idle: { mood: "content", draw }, name: `nature/sky-${sky}-${i + 1}`, label: `${sky} ${species} line ${i + 1}` });
        out.push({ ...base, width: 300, idle: { mood: "content", draw }, name: `nature/sky-${sky}-${i + 1}-300`, group: "nature-sky-300", label: `${sky} 300 line ${i + 1}` });
      }
      out.push({ ...base, motion: "reduce", idle: { mood: "content", draw: 0 }, name: `nature/sky-${sky}-calm`, group: "nature-sky-calm", label: `${sky} calm` });
    }
    const clocks = [["day", "otter", "tidepool"], ["dusk", "kitten", "hearth"], ["night", "owl", "nightsky"]];
    for (const [clock, species, world] of clocks) {
      for (const [type, scene] of [["sunset", "day"], ["good_morning", "day"]]) {
        out.push({ species, world, width: 330, scene, moment: { type }, name: `nature/${type}-${clock}`, group: "nature-clock", label: `${type} ${clock} ${species}` });
        out.push({ species, world, width: 300, scene, moment: { type }, name: `nature/${type}-${clock}-300`, group: "nature-clock-300", label: `${type} ${clock} 300` });
      }
    }
    for (const stage of ["baby", "child"]) {
      out.push({ species: "otter", world: "tidepool", stage, width: 330, pet: { flags: ["rainy"] }, idle: { mood: "content" },
        name: `nature/${stage}-none`, group: "nature-none", label: `${stage}: no nature line` });
    }
    return out;
  },
  // Resting (R1, plan favourite-resting §9): the label and breathing pose, its idle line and a
  // baby's, a sick resting pet (sick wins), the status page's line, and the settings row at
  // 420/330/300, day and night, mono, big text and on a shared screen (read-only).
  resting() {
    const out = [];
    const shot = (name, label, extra) => out.push({ name: `resting/${name}`, group: `resting-${extra.view || "card"}`,
      label, world: "woodland", width: 330, ...extra, pet: { resting: true, ...(extra.pet || {}) } });
    for (const width of [420, 330, 300]) shot(`card-${width}`, `card ${width}`, { width });
    shot("card-night", "night", { scene: "night" });
    shot("card-mono", "mono", { mono: true });
    shot("card-idle", "idle line", { idle: { mood: "content" } });
    shot("card-baby", "baby idle", { stage: "baby", idle: { mood: "content" }, storage: { "hatch-baby-talk-bench-user": "on" } });
    shot("card-sick", "sick: no label", { pet: { mood: "sick" } });
    shot("card-asleep", "asleep: no label", { scene: "dim", pet: { mood: "asleep" } });
    shot("status", "status page", { view: "status" });
    for (const width of [420, 330, 300]) {
      shot(`settings-${width}`, `settings ${width}`, { width, view: "settings", mine: true, scroll: ".restrow" });
    }
    shot("settings-night", "settings night", { scene: "night", view: "settings", mine: true, scroll: ".restrow" });
    shot("settings-mono", "settings mono", { mono: true, view: "settings", mine: true, scroll: ".restrow" });
    shot("settings-big", "settings big text", { bigText: true, view: "settings", mine: true, scroll: ".restrow" });
    shot("settings-big-300", "settings big 300", { width: 300, bigText: true, view: "settings", mine: true, scroll: ".restrow" });
    shot("settings-off", "settings, off", { view: "settings", mine: true, scroll: ".restrow", pet: { resting: false } });
    shot("settings-shared", "shared: read-only", { view: "settings", mine: true, scroll: ".restrow",
      storage: { "hatch-shared-screen": "on" } });
    shot("settings-shared-300", "shared 300", { width: 300, view: "settings", mine: true, scroll: ".restrow",
      storage: { "hatch-shared-screen": "on" } });
    return out;
  },
  // Care reactions ship A, the floor (docs/plan-2026-11-02-care-reactions.md 13): each reaction
  // through the card's own _react at a few moments, at 330 and 300, an adult (fox, the species'
  // own acts), a child with its own pose (fox, rung 1) and a child on its mood frame (bird,
  // rung 3), then reduced motion (the final frame, the prop still).
  care() {
    const out = [];
    const cases = [
      ["praise", { action: "praise", result: "ok" }, [300, 900]],
      ["praise-spin", { action: "praise", result: "ok" }, [300, 600], { praise: "spin" }],
      ["praise-spoiled", { action: "praise", result: "spoiled" }, [300, 1500]],
      ["scold", { action: "scold", result: "ok" }, [200, 700]],
      ["scold-unfair", { action: "scold", result: "unfair" }, [200, 700]],
      ["fan", { action: "fan", result: "ok" }, [300, 1200]],
      ["feed", { action: "feed", result: "ok" }, [300, 1200]],
      ["snack", { action: "snack", result: "ok" }, [300, 1200]],
      ["blanket", { action: "blanket", result: "ok" }, [300, 1200]],
      ["full-look", { action: "feed", result: "full" }, [200, 500], { "refused.full": "look" }],
      ["full-shake", { action: "feed", result: "full" }, [200, 500], { "refused.full": "shake" }],
      ["not-sleepy-yawn", { action: "play", result: "not_sleepy" }, [300, 1000], { "refused.not_sleepy": "yawn" }],
      ["too-tired-flop", { action: "play", result: "too_tired" }, [300, 1200], { "refused.too_tired": "flop" }],
    ];
    const who = [["adult", "fox", "adult"], ["child1", "fox", "child"], ["child3", "bird", "child"]];
    for (const [id, species, stage] of who) {
      for (const width of [330, 300]) {
        for (const [name, entry, ats, variant] of cases) {
          if (width === 300 && !["praise", "scold", "fan", "feed", "full-shake"].includes(name)) continue;
          for (const reactAt of ats) {
            out.push({ name: `care/${id}-${width}/${name}-${reactAt}`, group: `care-${id}-${width}`, label: `${name} ${reactAt}`,
              species, stage, world: worldOf(species), width, reactEntry: entry, reactAt, variant, clip: "screen", say: "" });
          }
        }
      }
    }
    // Reduced motion: the final frame, the prop still, no move.
    for (const [id, species, stage] of who) {
      for (const [name, entry, , variant] of cases.filter(([n]) => ["praise", "scold", "fan", "feed", "full-shake", "blanket"].includes(n))) {
        out.push({ name: `care/${id}-calm/${name}`, group: `care-${id}-calm`, label: `calm ${name}`,
          species, stage, world: worldOf(species), width: 330, reactEntry: entry, variant, motion: "reduce", clip: "screen", say: "" });
      }
    }
    // The scenes with the floor's tweaks: the clean hop over the broom, the meds sniff.
    for (const [id, species, stage] of who.slice(0, 2)) {
      for (const careAt of [800, 1000, 1200]) {
        out.push({ name: `care/${id}-scene/clean-${careAt}`, group: `care-${id}-scene`, label: `clean ${careAt}`,
          species, stage, world: worldOf(species), width: 330, care: "clean", careAt, pet: { poop: 1 }, clip: "screen", say: "" });
      }
      for (const careAt of [650, 800]) {
        out.push({ name: `care/${id}-scene/meds-sniff-${careAt}`, group: `care-${id}-scene`, label: `meds sniff ${careAt}`,
          species, stage, world: worldOf(species), width: 330, care: "medicine", careAt, variant: { medicine: "sniff" },
          mood: "sick", clip: "screen", say: "" });
      }
    }
    return out;
  },
  // Care B1, the bowl clip (plan care-reactions 5.1): every species' feed bowl on the floor at
  // full, 2/3, 1/3 and gone (step 3: the food above the rim), at 330 and 420, day and night,
  // one sheet per world and scene, a close-up of the bowl. A species with no "bowl_rim" is shown at its BOWL_CANDIDATES rim (so
  // the sheet shows why it has none), labelled "cand". The pass rule is bowlPass's.
  bowls() {
    const out = [];
    for (const species of allSpecies().sort()) {
      const own = speciesData(species).bowl_rim;
      const rim = own ?? BOWL_CANDIDATES[species];
      const world = worldOf(species);
      for (const scene of ["day", "night"]) {
        for (const width of [330, 420]) {
          ["full", "2/3", "1/3", "gone"].forEach((step, i) => {
            out.push({ name: `bowls/${world}/${species}-${scene}-${width}-${i}`, group: `bowls-${world}-${scene}`,
              label: `${species}${own ? "" : " cand"} ${rim} ${scene} ${width} ${step}`, species, stage: "adult", world, scene,
              width, bowlStep: i, bowlRim: rim, mood: "content", clip: "screen", crop: [0.6, 0.62, 0.92, 0.97], dpr: 3, tile: 150, say: "" });
          });
        }
      }
    }
    return out;
  },
  // Care B1, the feed scene (plan care-reactions 5.1, 13): an adult fox's four variants every
  // 200 ms (the reply in at 200 ms), the push-away before and after the gate, the hold and
  // the exit with no reply, a 300 px card with its poops (one under the bowl), the child ladder (rung 1: hamster,
  // deer; rung 3: fox, bird), a water world (otter) and the night sky (owl), the end's extras,
  // breakfast and supper, a resting pet, big text and mono for the line, and reduced motion.
  feed() {
    const out = [];
    const ok = { at: 200, result: "ok" };
    const shot = (group, name, label, extra) => out.push({ name: `feed/${group}/${name}`, group: `feed-${group}`, label,
      species: "fox", stage: "adult", world: "woodland", width: 330, care: "feed", answer: ok, clip: "screen", say: "",
      ...extra, pet: { hunger: 60, ...extra.pet }, variant: { "feed.extra": "none", ...extra.variant } });
    for (const v of ["A", "B", "C", "D"]) {
      for (let at = 0; at <= 3200; at += 200) {
        shot(`variant-${v}`, `${v}-${at}`, `${v} ${at}`, { careAt: at, variant: { feed: v }, pet: v === "C" ? { hunger: 20 } : {} });
      }
    }
    for (let at = 300; at <= 1500; at += 200) {
      shot("refuse", `pre-${at}`, `full at 300: ${at}`, { careAt: at, answer: { at: 300, result: "full" }, variant: { feed: "A" } });
    }
    for (let at = 900; at <= 2100; at += 200) {
      shot("refuse", `post-${at}`, `ok, full at 900: ${at}`, { careAt: at, answer: [ok, { at: 900, result: "full" }], variant: { feed: "A" } });
    }
    for (const at of [650, 950, 1250, 2650, 2850, 3100]) {
      shot("refuse", `hold-${at}`, `no reply: ${at}`, { careAt: at, answer: undefined, variant: { feed: "A" } });
    }
    for (const at of [450, 1000, 1500, 2300]) {
      shot("300", `poops-${at}`, `300, three poops ${at}`, { width: 300, careAt: at, variant: { feed: "A" }, pet: { poop: 3 } }); // the third sits at right: 7%, under the bowl
    }
    for (const [species, stage, rung] of [["hamster", "child", 1], ["deer", "child", 1], ["fox", "child", 3], ["bird", "child", 3]]) {
      for (const at of [500, 1000, 1500, 2200]) {
        shot("child", `${species}-${at}`, `${species} child (rung ${rung}) ${at}`,
          { species, stage, world: worldOf(species), careAt: at, variant: { feed: "A" } });
      }
    }
    for (const at of [300, 450, 600, 1000, 1150, 2300, 2600]) {
      shot("worlds", `otter-${at}`, `water ${at}`, { species: "otter", world: "tidepool", careAt: at, variant: { feed: "A" } });
    }
    for (const at of [400, 500, 600, 1000]) {
      shot("worlds", `owl-${at}`, `night sky ${at}`, { species: "owl", world: "nightsky", careAt: at, variant: { feed: "A" } });
    }
    // The fox is quick (bites of 320 ms): full at 1610, the bowl leaves at 2110.
    shot("extras", "lick", "lick 1860", { careAt: 1860, variant: { feed: "A", "feed.extra": "lick" } });
    shot("extras", "heart", "heart 1900", { careAt: 1900, variant: { feed: "A", "feed.extra": "heart" } });
    shot("extras", "heart-line", "heart, its line 2300", { careAt: 2300, variant: { feed: "A", "feed.extra": "heart" } });
    shot("extras", "burp", "heavy: burp 2300", { careAt: 2300, variant: { feed: "A", "feed.extra": "burp" }, pet: { weight: 90 } });
    shot("extras", "breakfast", "breakfast 150", { careAt: 150, time: "2026-11-02T08:00:00Z", variant: { feed: "A" } });
    shot("extras", "supper", "supper 2000", { careAt: 2000, time: "2026-11-02T19:00:00Z", variant: { feed: "A" } });
    shot("extras", "performer", "performer hop (bird) 1260", { species: "bird", careAt: 1260, variant: { feed: "A" } });
    for (const at of [100, 1000, 2300]) {
      shot("resting", `resting-${at}`, `resting ${at}`, { careAt: at, variant: { feed: "A" }, pet: { resting: true } });
    }
    shot("text", "big", "big text 2300", { careAt: 2300, bigText: true, variant: { feed: "A" } });
    shot("text", "mono", "mono 2300", { careAt: 2300, mono: true, variant: { feed: "A" } });
    shot("text", "mono-1000", "mono 1000", { careAt: 1000, mono: true, variant: { feed: "A" } });
    // Reduced motion: no scene (the tap), then the reply on the floor path, the prop still.
    shot("calm", "tap", "calm: the tap, no scene", { careAt: 1000, motion: "reduce" });
    shot("calm", "reply", "calm: the reply", { care: undefined, reactEntry: { action: "feed", result: "ok" }, motion: "reduce" });
    shot("calm", "child-reply", "calm: a child's reply", { care: undefined, stage: "child", reactEntry: { action: "feed", result: "ok" }, motion: "reduce" });
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

// The bowl clip's rim for each species with no "bowl_rim" of its own: where its rim (or, with
// no bowl, the widest row) sits, so the bowls sheet shows what a clip there would do.
const BOWL_CANDIDATES = {
  axolotl: 0.375, ballpython: 0.531, bananaslug: 0.5, bat: 0.406, beardeddragon: 0.375, beaver: 0.406, bird: 0.375,
  bunny: 0.562, duckling: 0.344, hamster: 0.406, ferret: 0.375, firefly: 0.375, gecko: 0.344, hermitcrab: 0.344, lunamoth: 0.5,
  opossum: 0.375, otter: 0.375, owl: 0.406, pondturtle: 0.344, puffin: 0.406, seal: 0.375, squirrel: 0.531,
  tarantula: 0.469, tortoise: 0.469, treefrog: 0.375,
};

// The bowl clip's pass rule (plan care-reactions 5.1), from each sprite through the card's own
// bowlRows and bowlCuts: each of the 3 steps removes at least BOWL_STEP_MIN of the sprite's
// opaque pixels, and no cut reaches below the rim (every row under it is the full bowl's).
// A species with "bowl_rim" that fails it fails the run.
const BOWL_STEP_MIN = 0.08;
async function bowlPass(browser, base) {
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  const list = allSpecies().sort().map((id) => {
    const sp = speciesData(id);
    return { id, sprite: sp.props?.feed || "bird/bowl_food", own: sp.bowl_rim ?? null, rim: sp.bowl_rim ?? BOWL_CANDIDATES[id] ?? null };
  });
  const out = await page.evaluate(async ({ list, min }) => {
    await customElements.whenDefined("hatch-pet-card");
    const res = [];
    for (const b of list) {
      const img = new Image();
      img.src = spriteSrc(b.id, b.sprite);
      await img.decode();
      const rows = bowlRows(img);
      const cuts = bowlCuts(rows, b.rim);
      const total = rows.reduce((x, y) => x + y, 0);
      const gone = (c) => rows.slice(0, c).reduce((x, y) => x + y, 0);
      const steps = cuts ? cuts.map((c, i) => (gone(c) - (i ? gone(cuts[i - 1]) : 0)) / total) : [];
      const rimRow = Math.round((b.rim * rows.length) / 4) * 4;
      const pass = !!cuts && steps.every((x) => x >= min) && cuts.every((c) => c <= rimRow);
      res.push({ ...b, cuts, steps: steps.map((x) => Math.round(x * 1000) / 1000), pass });
    }
    return res;
  }, { list, min: BOWL_STEP_MIN });
  await page.close();
  return out;
}

// Presets of what the card's FINDS_SHOWN switch gates: run with it on, whatever the default.
const FINDS_PRESETS = new Set(["finds", "gifts", "collection"]);

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
  if (shot.lcd !== undefined || shot.booted || shot.mono || shot.bigText) {
    shot.storage = { ...(shot.booted ? { "hatch-booted": "1" } : {}), ...(shot.lcd !== undefined ? { "hatch-lcd": String(shot.lcd) } : {}),
      ...(shot.mono ? { "hatch-mono": "4" } : {}), ...(shot.bigText ? { "hatch-big-text": "on" } : {}), ...shot.storage };
  }
  return shot;
}

function parseArgs(argv) {
  const opts = { shot: {}, workers: 6, out: path.join(ROOT, "dev", "bench", "out"), sheet: true };
  const num = new Set(["width", "dpr", "pets", "seed", "basket"]);
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
    else if (key === "big-text") opts.shot.bigText = true; // the "big text" switch on (top10 4b)
    else if (key === "boot") opts.shot.booted = false;
    else if (key === "mine") opts.shot.mine = true;
    else if (key === "finds-shown") opts.shot.findsShown = true; // FINDS_SHOWN on
    else if (key === "gift") { const [world, id] = val().split("/"); opts.shot.gift = { id, world }; } // --gift woodland/pinecone
    else if (key === "journal") Object.assign(opts.shot, { journal: true, view: "journal" });
    else if (key === "collection") Object.assign(opts.shot, { collection: true, view: "collection" });
    else if (key === "season") opts.shot.season = val() === "off" ? false : val() === "on" ? "auto" : argv[i];
    else opts.shot[key] = num.has(key) ? Number(val()) : val();
  }
  return opts;
}

function loadShots(opts) {
  let shots;
  if (opts.preset) {
    if (!PRESETS[opts.preset]) throw new Error(`no preset "${opts.preset}" (${Object.keys(PRESETS).join(", ")})`);
    // The finds, gifts and collection presets show what FINDS_SHOWN gates, so turn it on.
    const finds = FINDS_PRESETS.has(opts.preset) ? { findsShown: true } : {};
    shots = PRESETS[opts.preset]().map((s) => ({ ...finds, ...opts.shot, ...s, shell: { ...opts.shot.shell, ...s.shell } }));
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
        await page.emulateMedia({ colorScheme: shot.os || null }); // `os`: the OS's colour scheme (dark / light)
        // `missing`: sprite file names (e.g. "adult_eat_1") the server answers 404, for a load-fail shot.
        const miss = (shot.missing || []).map((n) => `${n}.png`);
        // `acts`: the new poses' PNGs are not drawn yet; a shot that fakes them is served the species'
        // own eat frames instead (bench only), so the card's act paths run with a real image.
        const fake = shot.acts ? /_(pat|refuse|aww|ready|splash)_([12])\.png/ : null;
        const gate = miss.length || fake ? async (route) => {
          const url = route.request().url();
          if (miss.some((n) => url.split("?")[0].endsWith(`/${n}`))) return route.fulfill({ status: 404 });
          if (fake && fake.test(url)) { // the real art when it exists, else the eat frame
            const real = await route.fetch();
            return route.fulfill({ response: real.ok() ? real : await route.fetch({ url: url.replace(fake, "_eat_$2.png") }) });
          }
          return route.continue();
        } : null;
        if (gate) await page.route("**/sprites/**", gate);
        try { await page.evaluate((s) => window.bench.mount(s), shot); } finally { if (gate) await page.unroute("**/sprites/**", gate); }
        if (shot.look) { // the look played on: the pinned clock moved on in 250 ms steps, a tick each
          const t0 = new Date(shot.time).getTime();
          for (let ms = 250; ms <= (shot.look.at || 0) * 1000; ms += 250) {
            await page.clock.setFixedTime(new Date(t0 + ms));
            await page.evaluate(() => window.bench.step());
          }
          await page.evaluate(() => window.bench.lookEnd());
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        }
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
        if (shot.crop) { // `crop`: [x0, y0, x1, y1], fractions of the clip (a close-up, such as the bowl)
          const [x0, y0, x1, y1] = shot.crop;
          Object.assign(clip, { x: clip.x + clip.width * x0, y: clip.y + clip.height * y0,
            width: clip.width * (x1 - x0), height: clip.height * (y1 - y0) });
        }
        const png = await page.screenshot({ path: file, clip });
        shot.file = file;
        if (shot.mono) shot.measure = { screen: await page.evaluate(() => window.bench.screenClass), ...await measureMono(page, clip, png) };
        if (shot.costume || shot.gift || shot.look || shot.care) {
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
      return `<figure><img src="data:image/png;base64,${data}" style="width:${Math.round(s.tile || (s.clip === "screen" ? 160 : s.width * 0.5))}px"><figcaption>${s.label || s.name}</figcaption></figure>`;
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
    if (opts.preset === "bowls") {
      const bowls = await bowlPass(browser, url);
      fs.writeFileSync(path.join(opts.out, "bowl-pass.json"), JSON.stringify(bowls, null, 1));
      const set = bowls.filter((b) => b.own !== null);
      console.log(`bowl clip pass rule (each step >= ${BOWL_STEP_MIN * 100}% of the opaque pixels, no cut below the rim): ` +
        `${bowls.filter((b) => b.pass).length} of ${bowls.length} pass at their rim; ${set.length} have bowl_rim`);
      for (const b of bowls) {
        const bad = b.own !== null && !b.pass;
        console.log(`  ${bad ? "FAIL" : b.pass ? "pass" : "  - "} ${b.id.padEnd(14)} ${b.own !== null ? "bowl_rim" : "cand    "} ${b.rim} steps ${b.steps.map((x) => (x * 100).toFixed(1)).join(" / ")}`);
        if (bad) process.exitCode = 1;
      }
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
