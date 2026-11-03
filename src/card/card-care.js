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
      sc.sniff = this._floorVariant(s, "medicine", ["plain", "sniff"]) === "sniff"; // a lean to sniff it first (plan 5.5)
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
};

class HatchPetCardCare extends HatchPetCardActions {
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
