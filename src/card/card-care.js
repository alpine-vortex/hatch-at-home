// --- Care scenes: the registry ---------------------------------------------------
// One entry per care that plays as a scene (plan care-reactions 4.1). The shared frame
// (held states, tap-to-skip, sceneFade, sceneOwes, the answer) is card-actions.js's
// _sceneStart / _sceneRender / _sceneEnd / _sceneAnswered; an entry only knows its own
// beats. Each function runs with the card as `this`:
//   due(s, mood, stage)          -> truthy when the card predicts a yes (else no scene)
//   ms                           -> the total, ms from the tap (setup may change sc.ms)
//   setup(s, sc, { add, box, pet })  make the elements (add(tag, cls) puts one in sc.els)
//   render(s, sc, t, k)          -> the pet's frames at t (or null: its own); k holds sw, sh,
//                                   ramp(a, b) and ease(a, b) on the clock t
//   clear(s, sc)                 what the scene changed outside sc.els, put back at its end
//   done(s, sc)                  after the end's redraw, when the scene was answered
//   skippable                    a tap on the screen, or the same care again, ends it (else the
//                                second tap is ignored and the screen tap does nothing)
//   gate                         ms at which the answer is needed; the scene holds there (4.3)
//   playOwed                     an ok that comes after the scene ended plays the floor (4.5)
//   refuse(s, sc, u, k), refuseMs, refuseAt(s, sc, te)
//                                the push-away u ms in, how long it is, where on the clock it
//                                starts for a refusal at te (default te)
//   exit(s, sc, u, k)            the exit beat u ms in (SCENE_EXIT_MS), when it gives up
const SCENES = {
  medicine: {
    ms: 2200,
    skippable: true,
    due(s, mood) {
      return (mood.attributes.flags || []).includes("sick");
    },
    setup(s, sc, { add, box, pet }) {
      sc.pill = add("img", "scene scene-pill");
      sc.pill.setAttribute("src", spriteSrc(s.speciesId, s.species.props?.medicine || "bird/medicine"));
      // It steps up until its front (most of the way across its frame) is at the pill.
      const pill = sc.pill.getBoundingClientRect();
      const front = pet.left + pet.width * 0.72;
      sc.step = Math.max(0, Math.min(box.width * 0.22, pill.left + pill.width / 2 - front));
      sc.eat = this._sceneFrames(s, "eat");
      sc.sniff = this._careVariant(s, "medicine", ["plain", "sniff"]) === "sniff"; // a lean to sniff it first (plan 5.5)
      const extras = s.drawn === "child" && s.species.extras?.squint;
      const excited = s.species.moods?.includes("excited") && s.drawn &&
        Array.from({ length: s.species.frames || 1 }, (_, i) => `${s.drawn}_excited_${i + 1}`);
      sc.cheer ||= extras ? [].concat(extras) : excited || null;
      // A few sparkles about its head, where it stands.
      sc.sparks = [[0.22, 0.2], [0.78, 0.12], [0.66, 0.42]].map(([x, y]) => {
        const el = add("div", "scene-spark");
        el.style.left = `${pet.left - box.left + pet.width * x}px`;
        el.style.top = `${pet.top - box.top + pet.height * y}px`;
        return el;
      });
    },
    // Notice the pill, step up, lean in and take it, step back, a happy hop.
    render(s, sc, t, { sh, ramp, ease }) {
      const step = sc.step * (ease(350, 850) - ease(1500, 1900));
      const hop = -0.06 * sh * Math.sin(Math.PI * ramp(1450, 1750));
      s.pet.style.translate = `${step}px ${hop}px`;
      s.perch.style.translate = `${step}px 0`;
      const sniff = sc.sniff ? 5 * (ease(550, 650) - ease(850, 950)) : 0; // 300 ms: lean in, look, back
      s.pet.style.rotate = `${(sc.eat ? 4 : 9) * (ease(850, 1000) - ease(1250, 1400)) + sniff}deg`;
      const gulp = ease(1000, 1250);
      sc.pill.style.opacity = String(1 - gulp);
      sc.pill.style.scale = String((0.3 + 0.7 * ease(0, 200)) * (1 - 0.7 * gulp));
      sc.pill.style.translate = `${-0.3 * sc.step * gulp}px 0`;
      sc.sparks.forEach((el, i) => {
        const k = ramp(1450 + i * 150, 2050 + i * 150);
        el.style.opacity = k > 0 && k < 1 ? String(1 - k * k) : "0";
        el.style.scale = String(0.4 + k);
      });
      if (t >= 1400) return sc.cheer;
      if (t >= 850) return sc.eat;
      return null;
    },
    done(s) {
      this._allBetter(s, true); // the cheer is over
    },
  },

  clean: {
    ms: 2300,
    skippable: true,
    due(s) {
      const poop = Number.parseFloat(this._state(s, "sensor.poop")?.state); // unavailable, unknown, NaN: no scene (4.2)
      return Number.isFinite(poop) && poop > 0;
    },
    setup(s, sc, { add, box, pet }) {
      this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}); // warm the load probe
      sc.water = s.world?.mess === "murk";
      const own = (key) => [].concat(s.species.props?.[key] || SCENE_PROPS[key]);
      sc.toolArt = own(sc.water ? "net" : "broom");
      if (!sc.water) sc.dustArt = own("dust");
      if (sc.water) sc.bubbleArt = own("bubbles");
      if (sc.dustArt) sc.dust = add("img", "scene scene-dust");
      sc.tool = add("img", `scene scene-${sc.water ? "net" : "broom"}`);
      if (sc.bubbleArt) sc.bubbles = add("img", "scene scene-bubbles");
      // Each mess on show goes as the broom (or net) passes its middle.
      sc.mess = s.poops.filter((el) => el.style.display !== "none").map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left - box.left + r.width / 2 };
      });
      sc.murk = s.murk.style.display !== "none" && Number(s.murk.style.opacity) > 0;
      sc.petX = pet.left - box.left + pet.width / 2; // where the pet stands, for the hop over the broom
    },
    render(s, sc, t, { sw, sh, ramp }) {
      // The broom (on water worlds, a net) crosses the floor left to right.
      const sweep = ramp(0, 1800);
      this._sceneArt(s, sc.tool, sc.toolArt[Math.floor(t / 180) % sc.toolArt.length]);
      const tw = sc.tool.getBoundingClientRect().width || sw * 0.25;
      const left = -tw + (sw + tw) * sweep;
      const point = left + tw / 2;
      sc.tool.style.left = `${left}px`;
      sc.tool.style.display = sweep < 1 ? "" : "none";
      if (sc.water) sc.tool.style.translate = `0 ${Math.sin(t / 150) * 0.02 * sh}px`;
      // The pet hops over the broom as it passes (the medicine hop's maths); on water it bobs on the
      // net's wake. Then, as the broom leaves, a two-step shake-off.
      const near = Math.abs(point - sc.petX) / (0.14 * sw);
      const hopK = near < 1 && sweep < 1 ? Math.sin(Math.PI * (1 - near) / 2) : 0;
      const lift = sc.water ? Math.sin(t / 150) * 0.015 * sh * hopK : -0.07 * sh * hopK;
      s.pet.style.translate = `0 ${lift}px`;
      if (t >= 1800 && !sc.shook) {
        sc.shook = true;
        s.pet.classList.add("rock2");
        setTimeout(() => s.pet.classList.remove("rock2"), 1300);
      }
      if (sc.dust) {
        // Dust kicks up behind it.
        this._sceneArt(s, sc.dust, sc.dustArt[Math.floor(t / 220) % sc.dustArt.length]);
        sc.dust.style.left = `${left - sc.dust.getBoundingClientRect().width * 0.55}px`;
        sc.dust.style.opacity = String(0.9 * ramp(60, 260) * (1 - ramp(1650, 2000)));
      }
      for (const { el, x } of sc.mess) {
        const k = Math.min(1, Math.max(0, (point - x) / (0.05 * sw)));
        el.style.opacity = String(1 - k);
        el.classList.toggle("scene-gone", k >= 1);
      }
      if (sc.murk) {
        // The water clears behind the net, with a soft edge.
        const p = Math.min(106, Math.max(-6, (point / sw) * 100));
        s.murk.style.maskImage = `linear-gradient(90deg, transparent ${p - 6}%, #000 ${p + 6}%)`;
      }
      if (sc.bubbles) {
        // Then bubbles rise where the water was cleared.
        const k = ramp(1600, 2300);
        this._sceneArt(s, sc.bubbles, sc.bubbleArt[Math.floor(t / 200) % sc.bubbleArt.length]);
        sc.bubbles.style.left = `${sw * 0.62}px`;
        sc.bubbles.style.translate = `0 ${-0.35 * sh * k}px`;
        sc.bubbles.style.opacity = String(k > 0 ? 1 - ramp(2000, 2300) : 0);
      }
      if (t >= 1800 && !sc.shone) {
        sc.shone = true;
        const prop = s.species.props?.clean;
        if (prop) {
          this._propShow(s, prop, 1500);
        }
        this._sparkle(s);
      }
      if (t >= 1800) return this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}) || sc.cheer;
      return null;
    },
    clear(s, sc) {
      for (const el of s.poops) {
        el.style.opacity = "";
        el.classList.remove("scene-gone");
      }
      if (sc.murk) {
        // What the net cleared stays clear: no fading back in from the held murk.
        s.murk.style.transition = "none";
        s.murk.style.opacity = "0";
        s.murk.style.maskImage = "";
        setTimeout(() => { s.murk.style.transition = ""; }, 50);
      }
    },
  },

  // Feed (plan 5.1): the bowl arrives, the pet eats it in bites, the bowl goes. Variants (4.7,
  // no-repeat): A drops in, B slides in from the left (the pet turns to watch it), C gobbles
  // (four quick bites; only when hunger is under FEED_GOBBLE), D savours (a look up at you
  // before the last bite). The gate is the first bite: before it, everything plays whatever
  // the server says.
  feed: {
    ms: 2750,
    gate: 650,
    skippable: false,
    playOwed: true,
    refuseMs: 900,
    due(s) {
      const hunger = Number.parseFloat(this._state(s, "sensor.hunger")?.state);
      return Number.isFinite(hunger) && hunger < FEED_FULL_AT; // the server's ">=": 95 is full
    },
    setup(s, sc, { add, box, pet }) {
      const sw = box.width;
      const sh = box.height;
      const hunger = Number.parseFloat(this._state(s, "sensor.hunger")?.state);
      const habit = nature(s.species)?.habit;
      const pool = ["A", "B", "D", ...(hunger < FEED_GOBBLE ? ["C"] : [])];
      // The nature hook (4.8): a hoarder gobbles, a watcher or basker savours, half the time.
      const own = { hoarder: "C", watcher: "D", basker: "D" }[habit];
      const pinned = s.pinVariant?.feed;
      sc.variant = !pinned && own && (own !== "C" || hunger < FEED_GOBBLE) && s.lastVariant?.feed !== own && Math.random() < 0.5
        ? ((s.lastVariant ||= {}).feed = own) : this._careVariant(s, "feed", pool);
      sc.performer = habit === "performer"; // a small hop between bites
      // The beats, ms from the tap. A bite: 0-120 the first eat frame and a lean in, then the chomp.
      const pace = Math.min(1.2, Math.max(0.8, PACE_SCALE[paceOf(s.species)] || 1)); // +-20% at most (4.8)
      const v = sc.variant;
      const n = v === "C" ? 4 : 3;
      const len0 = v === "C" ? 250 : 400;
      // The time and the world (5.1 hooks): breakfast opens sleepy, supper ends on a yawn; on a
      // water world the food sinks in and drifts out, its crumbs are bubbles; the night sky twinkles.
      sc.meal = mealPart(new Date().getHours());
      sc.water = s.world?.mess === "murk";
      sc.twinkle = s.worldKey === "nightsky";
      sc.gate = v === "B" ? 950 : 650;
      sc.landAt = v === "B" || sc.water ? 600 : 450;
      const look = v === "D" ? 400 : 0;
      // Never past FEED_MAX_MS: a slow pet's bites shrink back toward the plain length.
      const len = Math.floor(Math.min(len0 * pace, (FEED_MAX_MS - sc.gate - look - 900) / n));
      sc.bites = [];
      let at = sc.gate;
      for (let i = 0; i < n; i++) {
        if (v === "D" && i === 2) {
          sc.lookUp = at;
          at += look;
        }
        sc.bites.push({ at, len, step: Math.ceil(((i + 1) * 3) / n) });
        at += len;
      }
      sc.fullAt = at; // the satisfied beat: step back, content, a breath
      sc.leaveAt = at + 500;
      sc.ms = sc.leaveAt + 400;
      this._careFrames(s, sc, "feed");
      // The bowl: the prop's place (left 67%, 22% high, a square sprite); the pet steps up until
      // its front (most of the way across its frame) is at the bowl's middle.
      sc.bowl = add("img", "scene scene-bowl");
      sc.bowl.setAttribute("src", spriteSrc(s.speciesId, s.species.props?.feed || "bird/bowl_food"));
      sc.bowlW = 0.22 * sh;
      sc.bowlX = 0.67 * sw;
      const front = pet.left - box.left + pet.width * 0.72;
      sc.step = Math.max(0, Math.min(sw * 0.22, sc.bowlX + sc.bowlW / 2 - front));
      sc.crumbs = [0, 1, 2].map(() => add("div", `scene-crumb${sc.water ? " bubble" : ""}`));
      sc.dust = sc.water ? [] : [0, 1].map(() => add("div", "scene-crumb dust"));
      if (sc.twinkle) sc.spark = add("div", "scene-spark");
      // The extra at the end, 1 in 4 (5.1): a heart and a pat of the tummy, a lick, or (heavy) a burp.
      const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
      const extras = ["heart", "lick", ...(isHeavy(Number.isFinite(weight) ? weight : null) ? ["burp"] : [])];
      sc.extra = s.pinVariant?.["feed.extra"] ?? (Math.random() < FEED_EXTRA_ODDS ? this._careVariant(s, "feed.extra", extras) : "none");
      sc.fired = new Set();
    },
    render(s, sc, t, { sw, sh, ramp, ease }) {
      const once = (key) => !sc.fired.has(key) && sc.fired.add(key);
      const v = sc.variant;
      // The bowl arrives: A drops in four steps with a one-frame squash; on water it sinks in six,
      // wobbling; B slides in from the left in five. Then it leaves off the right in three steps
      // (on water it drifts), with what is left on it.
      let x = 0;
      let y = 0;
      let squash = "";
      if (v === "B") x = -(sc.bowlX + sc.bowlW) * (1 - Math.floor(ramp(100, 600) * 5) / 5);
      else if (sc.water) {
        const k = Math.floor(ramp(100, 600) * 6) / 6;
        y = -(1 - k) * sh * 0.75;
        x = k < 1 ? (Math.floor(k * 6) % 2 ? 1 : -1) * sw * 0.015 : 0;
      } else {
        y = -(1 - Math.floor(ramp(100, 400) * 4) / 4) * sh * 0.95;
        if (t >= 400 && t < 450) squash = "1.1 0.85";
      }
      const out = sc.water ? ease(sc.leaveAt, sc.leaveAt + 400) : Math.floor(ramp(sc.leaveAt, sc.leaveAt + 400) * 3) / 3;
      x += out * (sw - sc.bowlX);
      if (sc.water) y -= out * sh * 0.06;
      sc.bowl.style.translate = `${x}px ${y}px`;
      sc.bowl.style.scale = squash;
      sc.bowl.style.opacity = t < 100 ? "0" : "";
      // The food: a stepped clip at each bite's chomp (none for a species with no bowl_rim).
      const chomps = sc.bites.filter((b) => t >= b.at + 120);
      const clipped = this._bowlClip(s, sc.bowl, chomps.length ? chomps[chomps.length - 1].step : 0);
      // A bowl with no rim to clip to (25 species) shows each bite another way: the whole bowl
      // dips, 200 ms (squashed 8% down and back, from its base) at the chomp.
      if (!clipped) {
        const dip = Math.max(0, ...sc.bites.map((b) => Math.sin(Math.PI * ramp(b.at + 120, b.at + 320))));
        if (dip > 0) sc.bowl.style.scale = `${1 + 0.03 * dip} ${1 - 0.08 * dip}`;
      }
      // Landing dust (two pixels out to the sides), or the night sky's twinkle.
      const base = sh * 0.07;
      sc.dust.forEach((el, i) => {
        const k = ramp(sc.landAt - 50, sc.landAt + 150);
        el.style.opacity = k > 0 && k < 1 ? "1" : "0";
        el.style.left = `${sc.bowlX + (i ? sc.bowlW + 0.02 * sw * Math.floor(k * 3) : -0.02 * sw * (1 + Math.floor(k * 3)))}px`;
        el.style.bottom = `${base}px`;
      });
      if (sc.spark) {
        const k = ramp(sc.landAt - 50, sc.landAt + 250);
        sc.spark.style.left = `${sc.bowlX + sc.bowlW * 0.7}px`;
        sc.spark.style.bottom = `${base + sc.bowlW * 0.6}px`;
        sc.spark.style.opacity = k > 0 && k < 1 ? String(1 - k) : "0";
        sc.spark.style.scale = String(0.5 + k);
      }
      // Crumbs hop out of the bowl at each chomp (a 300 ms arc); on water, bubbles rise.
      const last = chomps[chomps.length - 1];
      sc.crumbs.forEach((el, i) => {
        const k = last ? ramp(last.at + 120, last.at + 120 + (sc.water ? 500 : 300)) : 0;
        const shown = last && k > 0 && k < 1;
        el.style.opacity = shown ? String(1 - k * k) : "0";
        el.style.background = sc.water ? "" : bowlColour(sc.bowl);
        const dx = (i - 1) * 0.03 * sw + (sc.water ? 0 : (i - 1) * k * 0.05 * sw);
        const dy = sc.water ? k * 0.18 * sh : Math.sin(Math.PI * k) * 0.07 * sh;
        el.style.left = `${sc.bowlX + sc.bowlW / 2 + dx}px`;
        el.style.bottom = `${base + sc.bowlW * 0.55 + dy}px`;
      });
      // The pet: looks to the pad, steps up to the bowl, leans into each bite, steps back.
      const step = sc.step * (ease(v === "B" ? 600 : 450, sc.gate) - ease(sc.fullAt, sc.fullAt + 300));
      s.pet.style.translate = `${step}px 0`;
      s.perch.style.translate = `${step}px 0`;
      // B turns to watch the bowl come in from the left, then back (the flip wins over a lean, 4.9).
      const turned = v === "B" && t >= 100 && t < 500;
      if (v === "B") {
        sc.looked = true;
        s.pet.style.transition = t < 700 ? "rotate .2s ease-out" : "none"; // the turn takes .2 s; a lean is per frame
        s.pet.classList.toggle("look", turned);
      }
      let lean = -4 * (ease(0, 100) - ease(200, 300)); // a look toward the pad
      for (const b of sc.bites) lean += 4 * (ease(b.at, b.at + 60) - ease(b.at + 120, b.at + 200));
      if (sc.lookUp != null) lean -= 3 * (ease(sc.lookUp, sc.lookUp + 100) - ease(sc.lookUp + 300, sc.lookUp + 400));
      if (v === "B" && t < 700) lean = 0;
      s.pet.style.rotate = turned ? "" : `${lean}deg`;
      // Beats that start a CSS move: the chomp's squash, a performer's hop, the breath at the end.
      for (const b of sc.bites) {
        if (t >= b.at + 120 && once(`chomp${b.at}`)) this._animate(s, s.pet, "chomp", 280);
        if (sc.performer && b !== sc.bites[sc.bites.length - 1] && t >= b.at + b.len - 60 && once(`hop${b.at}`)) this._perk(s);
      }
      if (t >= sc.fullAt && once("full")) {
        this._animate(s, s.pet, sc.meal === "supper" ? "breath-long" : "breath", sc.meal === "supper" ? 1600 : 1000);
        if (sc.extra === "heart" && !s.asleep) this._bondHearts(s, "carehearts", 1);
      }
      // The meal's line as the bowl goes (the answer is in: the gate saw to it). The 1-in-4
      // extra says its own instead.
      if (t >= sc.leaveAt && sc.result === "ok" && once("line")) {
        const line = sc.extra !== "none" ? [pick(FEED_LINES[sc.extra === "heart" ? "tummy" : sc.extra]), 3000]
          : this._mealLine(s, this._words(s).food);
        if (line) this._line(s, MINE, line[0], Math.max(line[1], MINE_MS), { write: true, type: "care" });
      }
      // Frames, beat by beat.
      if (t < 300) return sc.meal === "breakfast" && sc.sleepy ? sc.sleepy : sc.hungry;
      if (t < sc.gate) return t >= sc.landAt ? sc.excited : null;
      for (const b of sc.bites) {
        if (t >= b.at && t < b.at + b.len) return sc.eat && [sc.eat[t < b.at + 120 ? 0 : Math.min(1, sc.eat.length - 1)]];
      }
      if (sc.lookUp != null && t >= sc.lookUp && t < sc.lookUp + 400) return sc.excited && [sc.excited[0]];
      if (sc.extra === "lick" && t >= sc.fullAt + 200 && t < sc.fullAt + 350) return sc.eat && [sc.eat[0]];
      if (sc.meal === "supper" && sc.sleepy && t >= sc.fullAt + 250 && t < sc.leaveAt) return sc.sleepy;
      return t >= sc.fullAt ? sc.content : null;
    },
    // Full: where it stands (before the gate) it sniffs the bowl and turns away; after it, the
    // bite in progress is finished first (refuseAt), and it steps back from what is left. The
    // bowl slides out with it. "i'm full!" is said as it starts (_sceneRender).
    refuseAt(s, sc, te) {
      // A reply that came after a hold (answerAt at or past the gate) is still before the first bite.
      if (te < sc.gate || (te === sc.gate && sc.answerAt >= sc.gate)) return Math.max(te, sc.landAt);
      const b = sc.bites.find((x) => te >= x.at && te < x.at + x.len);
      return b ? b.at + b.len : te;
    },
    refuse(s, sc, u, { sw, ramp, ease }) {
      const pre = sc.refuseAt <= sc.gate; // no bite was made (a reply after a hold is refused at the gate)
      const stood = Number.parseFloat(s.pet.style.translate) || 0; // where render(refuseAt) left it
      const step = stood * (1 - ease(pre ? 250 : 0, pre ? 550 : 300));
      s.pet.style.translate = `${step}px 0`;
      s.perch.style.translate = `${step}px 0`;
      const sniff = pre ? 5 * (ease(0, 100) - ease(150, 250)) : 0;
      const turned = u >= 250 && u < 750;
      sc.looked = true;
      s.pet.style.transition = turned || u >= 750 ? "rotate .2s ease-out" : "none";
      s.pet.classList.toggle("look", turned);
      s.pet.style.rotate = turned ? "" : `${sniff}deg`;
      const out = Math.floor(ramp(pre ? 600 : 500, pre ? 900 : 800) * 3) / 3;
      const [x0, y0] = (sc.bowl.style.translate || "0px 0px").split(" ").map(Number.parseFloat);
      sc.bowl.style.translate = `${x0 + out * (sw - sc.bowlX)}px ${y0 || 0}px`;
      for (const el of sc.crumbs) el.style.opacity = "0";
      sc.bowl.style.scale = ""; // stopped mid-dip: whole again
      if (u < 250 && pre) return sc.hungry;
      return sc.refuse;
    },
    // It gave up (no answer in 2 s) or the call failed: the bowl slides out, the pet steps back
    // to its own frame.
    exit(s, sc, u, { sw, ramp, ease }) {
      const stood = Number.parseFloat(s.pet.style.translate) || 0;
      const step = stood * (1 - ease(0, 300));
      s.pet.style.translate = `${step}px 0`;
      s.perch.style.translate = `${step}px 0`;
      s.pet.style.rotate = "";
      const out = Math.floor(ramp(0, 300) * 3) / 3;
      const [x0, y0] = (sc.bowl.style.translate || "0px 0px").split(" ").map(Number.parseFloat);
      sc.bowl.style.translate = `${x0 + out * (sw - sc.bowlX)}px ${y0 || 0}px`;
      for (const el of sc.crumbs) el.style.opacity = "0";
      sc.bowl.style.scale = "";
      return null;
    },
  },

  // Snack (plan 5.2): tossed and caught. The snack flies in from the bottom-left in an arc to the
  // pet's catch point (catchPoint), the pet catches it (A), or it misses and bounces and the pet
  // pounces (B), or it lands in front and is nibbled, a round bite at a time (C), or it is caught
  // and stashed in the cheeks (D, a hoarder's). Gate 650: the toss is the pet noticing; the
  // catch ends at 700 (the snack goes into the mouth, hidden). A full before the gate has the
  // snack drop and roll out; after it, the catch (or the bite in progress) is finished first.
  snack: {
    ms: 1950,
    gate: 650,
    skippable: false,
    playOwed: true,
    refuseMs: 900,
    due(s) {
      const hunger = Number.parseFloat(this._state(s, "sensor.hunger")?.state);
      return Number.isFinite(hunger) && hunger < FEED_FULL_AT;
    },
    setup(s, sc, { add, box, pet }) {
      const sw = box.width;
      const sh = box.height;
      const habit = nature(s.species)?.habit;
      // The variants (4.7, no-repeat): D (stash) is a hoarder's, nobody else's unless pinned; the
      // nature hook: a hoarder stashes, a performer pounces, a watcher or basker savours, half the time.
      const pinned = s.pinVariant?.snack;
      const pool = ["A", "B", "C", ...(habit === "hoarder" || pinned === "D" ? ["D"] : [])];
      const own = { hoarder: "D", performer: "B", watcher: "C", basker: "C" }[habit];
      sc.variant = !pinned && own && s.lastVariant?.snack !== own && Math.random() < 0.5
        ? ((s.lastVariant ||= {}).snack = own) : this._careVariant(s, "snack", pool);
      const v = sc.variant;
      sc.fired = new Set();
      const pace = Math.min(1.2, Math.max(0.8, PACE_SCALE[paceOf(s.species)] || 1)); // +-20% at most (4.8)
      // The line (5.2 hooks), said once at the delight beat: a season's own, else the heavy line
      // (half the time), else (unless the favourite-snack moment says its own) SNACK_LINES.
      const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
      sc.heavy = isHeavy(Number.isFinite(weight) ? weight : null);
      const season = seasonNow(this._config);
      sc.candy = season?.snack ? `../ui/season_${season.key}_${season.snack}` : null;
      sc.line = sc.candy ? pick(season.snackLines || ["a treat! ♪"])
        : sc.heavy && Math.random() < 0.5 ? pick(HEAVY_SNACK) : null;
      // Where it goes: the catch point; B and C land on the floor in front of the pet.
      sc.mouth = catchPoint(s, pet, box);
      sc.floorY = pet.top - box.top + (pet.height * 224) / 256 - 0.04 * sh; // the feet line, and a snack's half height
      sc.dir = sc.mouth.x >= pet.left - box.left + pet.width / 2 ? 1 : -1; // the way it faces
      const floor = v === "B" || v === "C";
      sc.land = floor ? { x: Math.min(0.92 * sw, Math.max(0.08 * sw, sc.mouth.x + sc.dir * 0.1 * sw)), y: sc.floorY } : sc.mouth;
      sc.pounceX = v === "B" ? sc.dir * 0.07 * sw : 0;
      // The beats, ms on the scene's clock. The catch is over at 700 (B: the pounce, 700-850); a
      // heavy pet looks at it for 400 ms first; then the chews (C: three nibbles); D then puffs its cheeks.
      let at = v === "B" ? 850 : 700;
      sc.hideAt = v === "B" ? 800 : v === "C" ? Infinity : 700;
      if (sc.heavy) {
        sc.lookAt = at;
        at += 400;
      }
      const len = Math.round(300 * pace);
      sc.chews = Array.from({ length: v === "C" ? 3 : v === "D" ? 1 : 2 }, (_, i) => ({ at: at + i * len, len }));
      at += sc.chews.length * len;
      if (v === "D") {
        sc.puffAt = at;
        at += 450;
      }
      if (v === "C") sc.hideAt = at;
      sc.delightAt = at;
      sc.settleAt = at + 450;
      sc.ms = sc.settleAt + 200;
      this._careFrames(s, sc, "snack");
      sc.snack = add("img", "scene scene-snack");
      this._sceneArt(s, sc.snack, sc.candy || s.species.props?.snack || "snack");
      sc.pos = { x: 0, y: 0, rot: 0, shown: false };
    },
    render(s, sc, t, { sw, sh, ramp, ease }) {
      const once = (key) => !sc.fired.has(key) && sc.fired.add(key);
      const v = sc.variant;
      const { mouth, land } = sc;
      // The snack: thrown from the bottom-left edge in a parabola (a turn and a half), then held at
      // the mouth (A, D), or bouncing once on the floor (B), or sitting there (C) under its nibbles.
      const k = ramp(100, 550);
      const from = { x: -0.06 * sw, y: 0.92 * sh };
      let x = from.x + (land.x - from.x) * k;
      let y = from.y + (land.y - from.y) * k - 4 * 0.3 * sh * k * (1 - k);
      if (v === "B") y -= 0.07 * sh * Math.sin(Math.PI * ramp(550, 700));
      if (v === "C") y -= 0.025 * sh * Math.sin(Math.PI * ramp(550, 650));
      const shown = t >= 100 && t < sc.hideAt;
      const into = v === "B" ? ease(750, 800) : v === "C" ? 0 : ease(600, 700); // into the mouth
      sc.pos = { x, y, rot: 540 * k, shown };
      sc.snack.style.opacity = shown ? "1" : "0";
      sc.snack.style.translate = `calc(${x}px - 50%) calc(${y}px - 50%)`;
      sc.snack.style.rotate = `${540 * k}deg`;
      sc.snack.style.scale = String(1 - 0.35 * into);
      if (v === "C") {
        // Each nibble takes a round bite out of it (a mask, no art); the last takes what is left.
        const cuts = sc.chews.map((b, i) => [SNACK_NIBBLES[i], ease(b.at + 60, b.at + 160)]).filter(([, e]) => e > 0);
        sc.snack.style.maskImage = cuts.map(([[cx, cy, r], e]) => `radial-gradient(circle at ${cx}% ${cy}%, transparent ${r * e}%, #000 ${r * e + 1}%)`).join(",");
        sc.snack.style.maskComposite = "intersect";
        sc.snack.style.webkitMaskComposite = "source-in";
      }
      // The pet: watches the pad, hops up to catch it (A, D), hops at it where it fell (B), leans
      // into each chew, looks round while the cheeks are full (D).
      let px = 0;
      let py = 0;
      if (v === "A" || v === "D") py = -0.05 * sh * Math.sin(Math.PI * ramp(550, 700));
      if (v === "B") {
        px = sc.pounceX * (ease(700, 850) - ease(sc.delightAt, sc.delightAt + 250));
        py = -0.06 * sh * Math.sin(Math.PI * ramp(700, 850));
      }
      s.pet.style.translate = `${px}px ${py}px`;
      s.perch.style.translate = `${px}px 0`;
      let lean = -4 * (ease(0, 100) - ease(200, 300)); // a look toward the pad
      for (const b of sc.chews) lean += (v === "C" ? 5 : 3) * (ease(b.at, b.at + 60) - ease(b.at + 120, b.at + 200));
      if (sc.lookAt != null) lean -= 3 * (ease(sc.lookAt, sc.lookAt + 100) - ease(sc.lookAt + 300, sc.lookAt + 400));
      if (sc.puffAt != null) lean += 3 * Math.sin(2 * Math.PI * ramp(sc.puffAt, sc.puffAt + 450));
      s.pet.style.rotate = `${lean}deg`;
      for (const b of sc.chews) {
        if (t >= b.at + 120 && once(`chomp${b.at}`)) this._animate(s, s.pet, "chomp", 280);
      }
      if (sc.puffAt != null && t >= sc.puffAt && once("puff")) this._animate(s, s.pet, "puff", 450);
      // The delight: one greethop (the favourite snack's day: a bighop and the sparkle), a heart; a
      // spoiled one is eaten, then smug: two rocks and the existing line, no hop. The ok is in by
      // now (the gate saw to it). Sets excitedSince at the end (clear) so the layout does not hop again.
      if (t >= sc.delightAt && once("delight")) {
        if (sc.spoiled) this._animate(s, s.pet, "rock2", 1250);
        else this._animate(s, s.pet, sc.fav ? "bighop" : "greethop", 1400);
        if (sc.fav) this._sparkle(s);
        if (!sc.spoiled && !s.asleep) this._bondHearts(s, "carehearts", sc.fav ? 2 : 1);
        const said = sc.spoiled ? this._lines(s, "REFUSALS.spoiled", REFUSALS.spoiled).text
          : sc.line || (sc.fav || Math.random() >= SNACK_LINE_ODDS ? null : pick(SNACK_LINES[v === "B" ? "miss" : "catch"]));
        if (said && sc.result === "ok") this._line(s, MINE, said, Math.max(3000, MINE_MS), { write: true, type: "care" });
      }
      // Frames, beat by beat.
      const eat = (b) => sc.eat && [sc.eat[t < b.at + 120 ? 0 : Math.min(1, sc.eat.length - 1)]];
      if (t < 550) return null;
      if (v === "B" && t < 700) return sc.excited;
      if (v !== "B" && t < 700) return sc.eat && [sc.eat[0]];
      if (v === "B" && t < 850) return sc.excited;
      for (const b of sc.chews) if (t >= b.at && t < b.at + b.len) return eat(b);
      if (sc.lookAt != null && t >= sc.lookAt && t < sc.lookAt + 400) return sc.excited && [sc.excited[0]];
      if (sc.puffAt != null && t >= sc.puffAt && t < sc.puffAt + 450) return sc.eat && [sc.eat[0]];
      return t >= sc.delightAt && t < sc.settleAt ? sc.cheer || sc.excited : null;
    },
    // Full: before the gate the snack drops and rolls out; after it, the catch (to 700), or the
    // chew in progress, is finished first (the snack is gone by then, or what is left of C's rolls
    // out). Then the pet turns away from it.
    refuseAt(s, sc, te) {
      if (te < sc.gate || (te === sc.gate && sc.answerAt >= sc.gate)) return Math.max(te, 550);
      if (te < sc.chews[0].at) return sc.variant === "C" ? te : sc.chews[0].at - (sc.heavy ? 400 : 0);
      const b = sc.chews.find((x) => te >= x.at && te < x.at + x.len);
      return b ? b.at + b.len : te;
    },
    refuse(s, sc, u, { sw, ramp, ease }) {
      const pre = sc.refuseAt <= sc.gate;
      const [sx, sy] = (s.pet.style.translate || "0px 0px").split(" ").map(Number.parseFloat); // render(refuseAt)'s
      const back = 1 - ease(pre ? 250 : 0, pre ? 550 : 300);
      s.pet.style.translate = `${sx * back}px ${(sy || 0) * back}px`;
      s.perch.style.translate = `${sx * back}px 0`;
      const sniff = pre ? 5 * (ease(0, 100) - ease(150, 250)) : 0;
      const turned = u >= 250 && u < 750;
      sc.looked = true;
      s.pet.style.transition = turned || u >= 750 ? "rotate .2s ease-out" : "none";
      s.pet.classList.toggle("look", turned);
      s.pet.style.rotate = turned ? "" : `${sniff}deg`;
      this._snackRollOut(sc, u, { sw, ramp, ease });
      if (u < 250 && pre) return sc.hungry;
      return sc.refuse;
    },
    // It gave up (no answer in 2 s) or the call failed: the snack, if it is still there, drops and
    // rolls out, and the pet steps back to its own frame.
    exit(s, sc, u, { sw, ramp, ease }) {
      const back = 1 - ease(0, 300);
      const [sx, sy] = (s.pet.style.translate || "0px 0px").split(" ").map(Number.parseFloat);
      s.pet.style.translate = `${sx * back}px ${(sy || 0) * back}px`;
      s.perch.style.translate = `${sx * back}px 0`;
      s.pet.style.rotate = "";
      this._snackRollOut(sc, u, { sw, ramp, ease });
      return null;
    },
    clear(s, sc) {
      // The mood the snack brings is first seen by the redraw after the scene: its hop was the
      // delight's one greethop, not a second one from the layout (plan 5.2, B2).
      if (sc.fired?.has("delight")) s.excitedSince = Date.now();
    },
  },
};

const FEED_GOBBLE = 30; // under this hunger the feed may be a gobble (variant C)
const FEED_MAX_MS = 3200; // a feed scene never runs longer, whatever the pace (plan 8)
const FEED_EXTRA_ODDS = 0.25; // a heart, a lick or a burp at the end of a meal
const SNACK_LINE_ODDS = 0.25; // how often a snack scene says its SNACK_LINES line (1 in 4, as FEED_EXTRA_ODDS: FM)
const SNACK_NIBBLES = [[90, 25, 38], [8, 45, 40], [50, 55, 75]]; // C's three bites: centre (% of the snack) and radius

// Where a snack is caught (plan 5.2, B2): species.json "head" is the crown of the head (a back,
// wing or shell for some), in the 256 px frame of the drawn stage; the mouth is a fixed 8% of the
// pet's height below it. Where a species gives "face" (the face's centre, for the five whose head
// point is not a head) that is the point, 3% down. The pet's rect is its drawn box (the stage's
// scale is in it); a flipped pet (.look) is mirrored. In px, from the screen's top left. Both
// rects are the caller's.
function catchPoint(s, pet, box) {
  const face = s.species?.face?.[s.drawn];
  const [hx, hy] = face || s.species?.head?.[s.drawn] || [128, 96];
  const k = pet.height / 256;
  const flipped = !!s.pet?.classList?.contains("look");
  return { x: pet.left - box.left + (flipped ? 256 - hx : hx) * k, y: pet.top - box.top + hy * k + (face ? 0.03 : 0.08) * pet.height };
}

// The bowl's food shrinks by a stepped clip from the top (plan care-reactions 5.1): three
// cuts that take a third, two thirds and all of the food above species.json "bowl_rim" (the
// rim line, a fraction of the sprite's height). No number: no shrink. Each cut is on the
// art's grid (4 sprite px), never below the rim, so the bowl itself is never cut.
const BOWL_ROWS = new Map(); // sprite src -> { rows: opaque pixels per row, colour }, measured once
const BOWL_GRID = 4;

// What a loaded sprite's opaque pixels are: per row, and the colour of the top third of them
// (the food's, for the crumbs). Null when it isn't loaded, or the canvas can't read it.
function bowlArt(img) {
  const src = img?.currentSrc || img?.src;
  if (!src) return null;
  if (BOWL_ROWS.has(src)) return BOWL_ROWS.get(src);
  if (!img.complete || !img.naturalWidth) return null;
  let art = null;
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const rows = Array.from({ length: c.height }, (_, y) => {
      let n = 0;
      for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) n++;
      return n;
    });
    const top = rows.findIndex((n) => n > 0);
    const bottom = rows.length - [...rows].reverse().findIndex((n) => n > 0);
    const rgb = [0, 0, 0];
    let k = 0;
    for (let y = top; y >= 0 && y < top + (bottom - top) / 3; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] < 200) continue;
        for (let j = 0; j < 3; j++) rgb[j] += d[i + j];
        k++;
      }
    }
    art = { rows, colour: k ? `rgb(${rgb.map((x) => Math.round(x / k)).join(", ")})` : null };
  } catch (err) {
    art = null; // a sprite the canvas can't read: no shrink, plain crumbs
  }
  BOWL_ROWS.set(src, art);
  return art;
}
const bowlRows = (img) => bowlArt(img)?.rows || null;
const bowlColour = (img) => bowlArt(img)?.colour || "#8a5a2b";

// The three cuts (sprite rows from the top) for a rim at `rim` (0-1), or null: the last at the
// rim, the two before it on the grid where the three bites are most even (the smallest of
// them as large as it can be).
function bowlCuts(rows, rim) {
  if (!rows?.length || !(rim > 0 && rim < 1)) return null;
  const rimRow = Math.round((rim * rows.length) / BOWL_GRID) * BOWL_GRID; // the rim, on the grid
  const upTo = [0];
  for (let r = 0; r < rimRow; r++) upTo.push(upTo[r] + rows[r]);
  if (!upTo[rimRow]) return null;
  let best = null;
  for (let a = BOWL_GRID; a < rimRow; a += BOWL_GRID) {
    for (let b = a + BOWL_GRID; b < rimRow; b += BOWL_GRID) {
      const least = Math.min(upTo[a], upTo[b] - upTo[a], upTo[rimRow] - upTo[b]);
      if (!best || least > best.least) best = { least, cuts: [a, b, rimRow] };
    }
  }
  return best?.cuts || null;
}

class HatchPetCardCare extends HatchPetCardActions {
  // The frames a meal's scenes use: the species' own where it has them, else the ladder (plan 7):
  // a child's own pose for this care (rung 1), else its mood frames (rung 3). `care` is the care's
  // key in species.json "reactions" (feed, snack).
  _careFrames(s, sc, care) {
    const mood = (m) => s.species.moods?.includes(m) && s.drawn
      ? Array.from({ length: s.species.frames || 1 }, (_, i) => `${s.drawn}_${m}_${i + 1}`) : null;
    const pose = s.drawn === "child" && s.species.extras?.[s.species.reactions?.[care]];
    sc.eat = this._sceneFrames(s, "eat") || (pose ? [].concat(pose) : null) || mood("excited");
    sc.refuse = this._sceneFrames(s, "refuse") || mood("bored");
    sc.hungry = mood("hungry");
    sc.excited = mood("excited");
    sc.content = mood("content");
    sc.sleepy = mood("sleepy");
  }

  // A snack that is still there when the scene turns away (a full before the catch, a give-up):
  // it drops where it was and rolls out toward the pad, spinning, and is gone (u ms in).
  _snackRollOut(sc, u, { ramp, ease, sw }) {
    const p = sc.pos;
    if (!p?.shown) {
      sc.snack.style.opacity = "0";
      return;
    }
    const drop = ease(0, 220);
    const roll = ease(220, 700);
    sc.snack.style.opacity = String(1 - ramp(550, 700));
    sc.snack.style.translate = `calc(${p.x - roll * 0.7 * sw}px - 50%) calc(${p.y + (sc.floorY - p.y) * drop}px - 50%)`;
    sc.snack.style.rotate = `${p.rot - roll * 720}deg`;
    sc.snack.style.scale = "1";
  }

  // The bowl's food at step 0 (full) to 3 (all of it above the rim gone): a stepped clip.
  _bowlClip(s, img, step) {
    const cuts = bowlCuts(bowlRows(img), s.species?.bowl_rim);
    const cut = step > 0 && cuts ? cuts[Math.min(3, step) - 1] : 0;
    img.style.clipPath = cut ? `inset(${(cut / img.naturalHeight) * 100}% 0 0 0)` : "";
    return !!cuts;
  }

  // A species' own care frames, when its art has them: species.json "acts", like
  // {"eat": ["baby", "teen", "adult"], "cheer": true} (true: every stage), drawn as
  // <stage>_eat_1 and <stage>_eat_2. Else null, and the scene uses what all have.
  _sceneFrames(s, act) {
    const stages = s.species?.acts?.[act];
    const st = s.drawn;
    if (!st || !(stages === true || (Array.isArray(stages) && stages.includes(st)))) return null;
    return [`${st}_${act}_1`, `${st}_${act}_2`];
  }

  // Scene art (props) on the world's grid: its PNG is 4 frame px per art px, and
  // an art px is 1/64 of the pet's 62% of the screen's height. That is the
  // pet's frame scale (256 frame px), whichever grid the creature is drawn on.
  _sceneArt(s, img, sprite) {
    const src = spriteSrc(s.speciesId, sprite);
    if (img.getAttribute("src") === src) return;
    img.onload = () => {
      img.style.height = `${(img.naturalHeight / 4) * 62 / 64}%`;
    };
    img.setAttribute("src", src);
  }
}
