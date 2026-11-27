const TASTING_STYLE = `
  .screen > .activity-panel.tasting {
    padding-inline: 6%; color: #fff2d7;
    background: linear-gradient(180deg, #50372a 0 73%, #755138 73% 76%, #916645 76% 100%);
  }
  .tasting .activity-body { container-type: size; }
  .tasting-table { position: absolute; inset: 0; }
  .screen .tasting-pet {
    left: 35%; bottom: -2%; translate: -50% 0;
    width: min(var(--tasting-dog-width), 122cqh); aspect-ratio: 1;
  }
  .tasting-dish {
    position: absolute; left: 72%; bottom: 1%; translate: -50% 0;
    width: min(41%, 99cqh); aspect-ratio: 1.7;
  }
  .tasting-dish::before, .tasting-dish::after {
    content: ""; position: absolute; border-radius: 50%;
  }
  .tasting-dish::before {
    inset: 26% 0 0; background: #efd6a4; border: 2px solid #523821;
    box-shadow: 0 3px #614129;
  }
  .tasting-dish::after { inset: 36% 11% 10%; border: 1px solid #9f6943; }
  .screen .tasting-biscuit { inset: 0 13% auto; width: 74%; z-index: 1; }
  .screen .tasting-topping { right: 9%; top: -12%; width: 52%; z-index: 2; }
  .tasting-meal { position: absolute; inset: 0; }
  .tasting-table.bite .tasting-meal {
    clip-path: polygon(34% 0, 100% 0, 100% 100%, 25% 100%, 25% 63%, 39% 49%, 45% 23%);
  }
  .tasting-twinkle {
    position: absolute; left: 59%; bottom: 60%;
    color: #ffe2a0; font-size: 1.2em; line-height: 1;
  }
  @media (prefers-reduced-motion: no-preference) {
    .tasting-table.serving .tasting-pet { animation: tasting-sniff 260ms ease-out; }
    .tasting-table.bite .tasting-pet { animation: tasting-sniff 260ms ease-out; }
    @keyframes tasting-sniff { 50% { transform: translateX(5%) rotate(3deg); } }
  }
`;

const TASTING_VERSION = 1;
const TASTING_RECIPES = { apple: "Apple", pumpkin: "Pumpkin" };
const TASTING_ID = /^[a-f0-9]{32}$/;
const TASTING_WAIT = "tasting.response";
const TASTING_BEAT = "tasting.beat";
const TASTING_EATEN = new Set(["ok", "spoiled"]);
const TASTING_RESULTS = new Set([...TASTING_EATEN, "asleep", "full", "not_now",
  "expired", "pet_changed", "busy"]);

function tastingRecipe(recipe) {
  return Object.hasOwn(TASTING_RECIPES, recipe) ? recipe : null;
}

class HatchPetCardTasting extends HatchPetCardHouseholdHop {
  _tastingOpen(s, from) {
    const gameplay = s.house?.gameplay;
    const entity = s.ids?.["sensor.life_stage"];
    if (gameplay?.tasting?.version !== TASTING_VERSION || !gameplay.pet_ref || !entity ||
        s.tasting || s.worldKey !== "hearth" || s.speciesId !== "corgi" || s.lightsOut) return false;
    const ref = gameplay.pet_ref;
    const key = `hatch-tasting:${this._hass.user?.id || "ha"}:${ref}`;
    const attempt = this._tastingPending(key);
    const tasting = s.tasting = {
      ref, entity, key, attempt, stage: s.drawn,
      recipe: attempt?.recipe || tastingRecipe(gameplay.tasting.preferred),
      phase: attempt ? "uncertain" : "prepare",
    };
    const opened = this._activityOpen(s, {
      id: "tasting", from, title: "Make a snack", holdCapFocus: true,
      text: () => this._tastingText(s, tasting),
      buttons: () => this._tastingButtons(s, tasting),
      render: (box) => this._tastingRender(box, s, tasting),
      close: () => {
        this._stop(s, { key: TASTING_WAIT });
        this._stop(s, { key: TASTING_BEAT });
        s.tasting = null;
      },
    });
    if (opened) s.activity.panel.classList.add("tasting");
    else s.tasting = null;
    return opened;
  }

  _tastingPending(key) {
    if (this._tastingAttempts?.has(key)) return this._tastingAttempts.get(key);
    try {
      const attempt = JSON.parse(sessionStorage.getItem(key));
      if (TASTING_ID.test(attempt?.serve_id) && tastingRecipe(attempt.recipe) &&
          (attempt.token === undefined || TASTING_ID.test(attempt.token))) {
        return attempt;
      }
    } catch {
      // A browser can disable session storage. The card still holds its attempt.
    }
    return null;
  }

  _tastingRemember(key, attempt) {
    (this._tastingAttempts ??= new Map()).set(key, attempt);
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt));
    } catch {
      // The card's pending attempt still survives a websocket reconnect.
    }
  }

  _tastingForget(key, attempt) {
    if (this._tastingPending(key)?.serve_id !== attempt.serve_id) return;
    this._tastingAttempts?.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // The card can still clear its own pending attempt.
    }
  }

  _tastingCurrent(s, tasting) {
    return s.tasting === tasting && s.activity?.id === "tasting" &&
      s.house?.gameplay?.pet_ref === tasting.ref && !s.gone &&
      s === this._slides?.[this._index];
  }

  _tastingText(s, tasting) {
    const label = TASTING_RECIPES[tasting.recipe];
    switch (tasting.phase) {
      case "prepare":
        if (!label) return "A biscuit. Choose a topping.";
        return s.house?.gameplay?.tasting?.preferred === tasting.recipe
          ? `${label} biscuit · their favourite` : `${label} biscuit`;
      case "serving": return "A curious sniff…";
      case "bite": return "A little bite…";
      case "uncertain": return "No reply yet. Retry serving.";
      case "result":
        switch (tasting.result.result) {
          case "spoiled": return tasting.result.preferred ? "A favourite bite. Tail still wagging!" : "All gone. Look at that grin!";
          case "ok":
            if (tasting.result.recognized) return `They knew that ${label.toLowerCase()} biscuit!`;
            return tasting.result.preferred ? "A favourite! That tail won't stop." : "Biscuit gone, one happy pup.";
          case "busy": return "The kitchen is busy. Try again later.";
          case "expired": return "That serving attempt expired.";
          default: return REFUSALS[tasting.result.result] || "The biscuit can wait.";
        }
      default: return "";
    }
  }

  _tastingButtons(s, tasting) {
    if (tasting.phase === "prepare") return [
      ...Object.entries(TASTING_RECIPES).map(([recipe, title], i) => ({
        label: `Add ${recipe}`, cap: title, icon: `icon_tasting_${recipe}`,
        keys: [i === 0 ? "ArrowLeft" : "ArrowRight"],
        selected: tasting.recipe === recipe,
        act: () => {
          tasting.recipe = recipe;
          this._activityUpdate(s);
        },
      })),
      { label: "Serve biscuit", cap: "serve", icon: "icon_snack", keys: ["ArrowUp", "s"],
        disabled: !tasting.recipe, act: () => void this._tastingServe(s, tasting) },
    ];
    if (tasting.phase === "uncertain") return [
      , , { label: "Retry serving", cap: "retry", icon: "icon_snack", keys: ["ArrowUp", "s"],
        act: () => void this._tastingServe(s, tasting) },
    ];
    if (tasting.phase === "result") return [
      , , { label: "Make again", cap: "make again", icon: "icon_mode_restart", keys: ["ArrowUp", "s"],
        act: () => {
          tasting.recipe = tastingRecipe(s.house?.gameplay?.tasting?.preferred) ||
            (tasting.result.preferred ? tasting.result.recipe : tasting.recipe);
          tasting.phase = "prepare";
          this._activityUpdate(s);
        } },
    ];
    return [
      , , { label: "Serving biscuit", cap: "serve", icon: "icon_snack", disabled: true, act: () => {} },
    ];
  }

  _tastingRender(box, s, tasting) {
    const table = document.createElement("div");
    table.className = `tasting-table ${tasting.phase}`;
    const pet = document.createElement("img");
    pet.className = "tasting-pet";
    pet.alt = "";
    pet.style.setProperty("--tasting-dog-width", `${55 * (s.species.scale?.[tasting.stage] || 1)}%`);
    this._show(s, pet, this._tastingPose(s, tasting));
    const dish = document.createElement("div");
    dish.className = "tasting-dish";
    const eaten = tasting.phase === "result" && TASTING_EATEN.has(tasting.result.result);
    if (!eaten) {
      const meal = document.createElement("div");
      meal.className = "tasting-meal";
      const biscuit = document.createElement("img");
      biscuit.className = "tasting-biscuit";
      biscuit.alt = "";
      this._show(s, biscuit, s.species.props.snack);
      meal.append(biscuit);
      if (tasting.recipe) {
        const topping = document.createElement("img");
        topping.className = "tasting-topping";
        topping.alt = "";
        topping.src = `${BASE}/ui/icon_tasting_${tasting.recipe}.png?v=${VERSION}`;
        meal.append(topping);
      }
      dish.append(meal);
    } else if (tasting.result.preferred) {
      const star = document.createElement("span");
      star.className = "tasting-twinkle";
      star.setAttribute("aria-hidden", "true");
      star.textContent = "✦";
      table.append(star);
    }
    table.append(dish, pet);
    box.append(table);
  }

  _tastingPose(s, tasting) {
    const stage = tasting.stage;
    if (tasting.phase === "bite") return `${stage}_eat_1`;
    if (tasting.phase === "serving") {
      return stage === "child" ? s.species.extras.head_tilt[0] : `${stage}_ready_1`;
    }
    if (tasting.phase === "result") {
      const result = tasting.result;
      if (result.preferred) {
        return s.species.acts.cheer.includes(stage) ? `${stage}_cheer_1` : `${stage}_excited_1`;
      }
      if (result.result === "asleep") return `${stage}_asleep_1`;
      if (!TASTING_EATEN.has(result.result) && s.species.acts.refuse.includes(stage)) {
        return `${stage}_refuse_1`;
      }
    }
    return `${stage}_content_1`;
  }

  _tastingCall(tasting, attempt, action) {
    return this._hass.callWS({
      type: "virtual_pet/tasting", entity_id: tasting.entity,
      pet_ref: tasting.ref, version: TASTING_VERSION, action, ...attempt,
    });
  }

  _tastingMatches(attempt, response) {
    return response?.serve_id === attempt.serve_id && response.recipe === attempt.recipe;
  }

  async _tastingServe(s, tasting) {
    if (!this._tastingCurrent(s, tasting) || !tasting.recipe ||
        !["prepare", "uncertain"].includes(tasting.phase)) return;
    const attempt = tasting.attempt ??= {
      recipe: tasting.recipe,
      serve_id: Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (n) => n.toString(16).padStart(2, "0")).join(""),
    };
    this._tastingRemember(tasting.key, attempt);
    const run = tasting.run = {};
    const current = () => this._tastingCurrent(s, tasting) && tasting.run === run;
    const start = performance.now();
    tasting.phase = "serving";
    this._activityUpdate(s);
    const uncertain = () => {
      if (!current()) return;
      this._stop(s, { key: TASTING_WAIT });
      tasting.phase = "uncertain";
      tasting.run = null;
      this._activityUpdate(s);
    };
    this._later(s, 7000, uncertain, { key: TASTING_WAIT });
    let reply;
    try {
      if (!attempt.token) {
        reply = await this._tastingCall(tasting, attempt, "issue");
        if (!this._tastingMatches(attempt, reply)) return uncertain();
        if (reply.result === "ready" && TASTING_ID.test(reply.token)) {
          attempt.token = reply.token;
          if (this._tastingPending(tasting.key)?.serve_id === attempt.serve_id) {
            this._tastingRemember(tasting.key, attempt);
          }
        }
      }
      if (attempt.token) reply = await this._tastingCall(tasting, attempt, "serve");
    } catch (err) {
      if (err?.code !== "forbidden") return uncertain();
      reply = { serve_id: attempt.serve_id, recipe: attempt.recipe, result: "not_now" };
    }
    if (!this._tastingMatches(attempt, reply) || !TASTING_RESULTS.has(reply.result)) return uncertain();
    // Either in-flight request can answer the same intent. A closed scene
    // only clears that intent from storage, and leaves the live controls alone.
    this._tastingForget(tasting.key, attempt);
    const active = s.tasting;
    if (!active || !this._tastingCurrent(s, active) ||
        active.attempt?.serve_id !== attempt.serve_id) return;
    this._stop(s, { key: TASTING_WAIT });
    active.run = null;
    active.attempt = null;
    active.result = reply;
    if (reply.result === "pet_changed") {
      this._activityClose(s, "changed");
    } else if (TASTING_EATEN.has(reply.result)) {
      const bite = () => {
        if (!this._tastingCurrent(s, active)) return;
        active.phase = "bite";
        this._activityUpdate(s);
        this._later(s, 310, () => this._tastingResult(s, active), { key: TASTING_BEAT });
      };
      this._later(s, Math.max(0, 260 - (performance.now() - start)), bite, { key: TASTING_BEAT });
    } else {
      this._tastingResult(s, active);
    }
  }

  _tastingResult(s, tasting) {
    if (!this._tastingCurrent(s, tasting)) return;
    tasting.phase = "result";
    this._activityUpdate(s);
  }
}
