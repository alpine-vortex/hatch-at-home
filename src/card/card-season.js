class HatchPetCardSeason extends HatchPetCardCrate {
  // --- Seasons --------------------------------------------------------------

  // The season's pieces in the scene (behind the pet): a lantern by its side,
  // cobwebs in the corners, a sweet, falling leaves. Drawn again only when
  // something changes.
  _renderSeason(s) {
    const season = seasonNow(this._config);
    const part = season && seasonPart(season, s.worldKey);
    const sig = season ? `${season.key}|${s.worldKey}|${new Date().toDateString()}` : "";
    if (s.seasonSig === sig) return;
    s.seasonSig = sig;
    s.seasonBox.innerHTML = "";
    for (const c of [...s.screen.classList]) if (c.startsWith("s-")) s.screen.classList.remove(c);
    s.screen.classList.toggle("in-season", !!season);
    if (!season) return;
    s.screen.classList.add(`s-${season.key}`);
    if (season.mist) {
      const mist = document.createElement("div");
      mist.className = "mist";
      s.seasonBox.append(mist);
    }
    if (season.bunting) {
      const bunting = document.createElement("div");
      bunting.className = "bunting";
      bunting.style.backgroundImage = `url(${BASE}/ui/season_${season.key}_bunting.png?v=${VERSION})`;
      s.seasonBox.append(bunting);
    }
    const src = (n) => `${BASE}/ui/season_${season.key}_${n}.png?v=${VERSION}`;
    const add = (name, cls) => {
      const img = document.createElement("img");
      img.className = cls;
      img.alt = "";
      img.src = src(name);
      s.seasonBox.append(img);
    };
    if (part.lantern && season.lanterns) {
      add(dailyPick(season.lanterns, season.key), `lantern lantern-${part.lantern}`);
    }
    if (season.corner) for (const side of part.corners || []) add(season.corner, `corner ${season.corner} ${side}`);
    if (part.sweets && season.sweet) add(season.sweet, `sweet ${season.sweet}`);
    // Leaves drift down, each on its own path and pace.
    if (season.leaves) {
      for (let i = 0; i < 6; i++) {
        add(`leaf_${(i % 3) + 1}`, "leaf");
        const leaf = s.seasonBox.lastChild;
        leaf.style.left = `${8 + i * 15 + Math.random() * 6}%`;
        const lane = document.createElement("div"); // the lane that falls (translate); the leaf drifts inside it
        lane.className = "leafwrap";
        lane.style.setProperty("--leaf-ms", `${8 + Math.random() * 5}s`);
        lane.style.setProperty("--leaf-delay", `${-Math.random() * 12}s`);
        lane.append(leaf);
        s.seasonBox.append(lane);
      }
    }
  }

  // Now and then, a costume moment: the season's hat on the pet's head and a
  // seasonal line. On the treat day, the first visit gets "trick or treat!".
  // Bats (geese) cross at night, and by day where the world says so.
  _seasonTick(s) {
    const season = seasonNow(this._config);
    if (!season || !s.species) return;
    const spot = this._hatSpot(s) || s.species.head?.[s.drawn];
    if (spot) this._headTopAll(s, spot[0], spot[1]); // measure ahead
    const now = Date.now();
    const isCalm = calm();
    const part = seasonPart(season, s.worldKey);
    const dark = s.screen.classList.contains("night") || s.screen.classList.contains("dim");
    if (season.flyer) {
      if (!s.nextFlyer) s.nextFlyer = now + 6000 + Math.random() * 10000;
      if (now >= s.nextFlyer) {
        const [lo, hi] = SEASON_FLYER_MS;
        s.nextFlyer = now + lo + Math.random() * (hi - lo);
        if (!isCalm && (dark || part.dayFlyers) && !(s.visitUntil > now)) this._seasonFlyer(s, season);
      }
    }
    if (season.nightFlyer && part.nightFlyer) {
      if (!s.nextNightFlyer) s.nextNightFlyer = now + 20000 + Math.random() * 40000;
      if (now >= s.nextNightFlyer) {
        const [lo, hi] = SEASON_NIGHT_FLYER_MS;
        s.nextNightFlyer = now + lo + Math.random() * (hi - lo);
        const { art, cls, ms } = season.nightFlyer;
        if (!isCalm && dark && !(s.visitUntil > now)) this._seasonFly(s, season, art, cls, ms, { ltr: true });
      }
    }
    if (!this._free(s) || s.pet.classList.contains("hop") || s.pet.classList.contains("greethop")) return;
    const today = new Date();
    // The countdown, on the first look of the day.
    const treatOn = season.treat && seasonDate(season.treat, today.getFullYear());
    if (season.countdown && treatOn && !s.counted && namedHolidays()) {
      s.counted = true;
      const treat = new Date(today.getFullYear(), treatOn[0] - 1, treatOn[1]);
      const days = Math.round((treat - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      if (days > 0 && days <= 7 && oncePerDay(`count-${season.key}-${s.ids?.device}`)) {
        this._speak(s, days === 1 ? `${season.countdown} is tomorrow!!` : `${days} sleeps till ${season.countdown}!`, 4500);
        this._animate(s, s.pet, "perk", 320);
        return;
      }
    }
    // A walker waits while the basket shows (the same floor line).
    if (season.visitor && !isCalm && !(season.visitor.walk && this._basketShows(s))) {
      if (!s.nextVisitor) s.nextVisitor = now + 60000 + Math.random() * 60000;
      if (now >= s.nextVisitor) {
        const [lo, hi] = SEASON_VISITOR_MS;
        s.nextVisitor = now + lo + Math.random() * (hi - lo);
        this._seasonVisitor(s, season);
        return;
      }
    }
    if (this._hatSpot(s) === null) return; // a pose no hat can sit on: wait for the next
    const treatDay = treatOn && today.getMonth() + 1 === treatOn[0] && today.getDate() === treatOn[1];
    if (treatDay && !s.treated) {
      s.treated = true;
      const key = `hatch-treat-${season.key}-${s.ids?.device}-${today.toDateString()}`;
      let fresh = true;
      try {
        fresh = !localStorage.getItem(key);
        localStorage.setItem(key, "1");
      } catch (err) {
        // no storage: once per page load
      }
      if (fresh) {
        const named = season.treatLine && unnamed([season.treatLine]).length;
        this._costume(s, season, named ? season.treatLine : seasonLine(season, today));
        this._later(s, 1600, () => this._seasonTreat(s, season), { group: "season" });
        return;
      }
    }
    if (this._state(s, "sensor.life_stage")?.attributes.birthday) return; // the party's day
    if (!s.nextCostume) s.nextCostume = now + 8000 + Math.random() * 12000;
    if (now < s.nextCostume) return;
    const [lo, hi] = SEASON_COSTUME_MS;
    s.nextCostume = now + lo + Math.random() * (hi - lo);
    const fresh = season.costumes && oncePerDay(`costume-${season.key}-${s.ids?.device}`);
    const line = fresh ? { text: "new costume today! look at me ♪", baby: false }
      : this._lines(s, `season.${season.key}`, seasonLine(season, today));
    this._costume(s, season, line.text, !line.baby);
    if (fresh && season.chirp) this._chirp(s, season.chirp);
  }

  // Its yearly birthday (the server's date): confetti and the party hat at
  // the first look of the day on this device (a tablet left on overnight too:
  // the day turning starts it), then the hat now and then. On a holiday's own
  // day that holiday's costume wins: confetti, no party hat.
  _partyTick(s) {
    if (!this._state(s, "sensor.life_stage")?.attributes.birthday) return;
    if (!this._free(s) || s.pet.classList.contains("hop") || s.pet.classList.contains("greethop")) return;
    if (this._hatSpot(s) === null) return; // a pose no hat can sit on: wait for the next
    const season = seasonNow(this._config);
    const today = new Date();
    const treatOn = season?.treat && seasonDate(season.treat, today.getFullYear());
    const treatDay = treatOn && today.getMonth() + 1 === treatOn[0] && today.getDate() === treatOn[1];
    const now = Date.now();
    if (this._partyFirst(s)) {
      this._confetti(s);
      if (!treatDay) this._costume(s, PARTY, "party hat on! ♪"); // the visit says "it's my birthday!!"
      s.nextParty = now + SEASON_COSTUME_MS[0];
      return;
    }
    if (treatDay) return;
    if (!s.nextParty) s.nextParty = now + SEASON_COSTUME_MS[0];
    if (now < s.nextParty) return;
    const [lo, hi] = SEASON_COSTUME_MS;
    s.nextParty = now + lo + Math.random() * (hi - lo);
    this._costume(s, PARTY, pick(PARTY.lines));
  }

  // The first party moment of this birthday on this device (keyed by the
  // birthday itself, not the browser's date, which may be another time zone's).
  _partyFirst(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const key = `hatch-party-${s.ids?.device}-${stage.hatched_on}-${stage.birthday?.years}`;
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
    } catch (err) {
      if (this._parties?.has(key)) return false;
      (this._parties ??= new Set()).add(key);
    }
    return true;
  }

  _confetti(s) {
    if (calm()) return;
    const box = document.createElement("div");
    box.className = "confetti";
    box.setAttribute("aria-hidden", "true");
    const colors = ["#f06e96", "#ffd64d", "#5ca8dc", "#8fd17a", "#fffdf5"];
    for (let i = 0; i < 18; i++) {
      const bit = document.createElement("i");
      bit.style.setProperty("--x", `${Math.random() * 100}%`);
      bit.style.setProperty("--d", `${Math.random() * 0.9}s`);
      bit.style.setProperty("--c", colors[i % colors.length]);
      box.append(bit);
    }
    s.screen.append(box);
    this._later(s, 3600, () => box.remove(), { group: "season", hidden: "tab", undo: () => box.remove() });
  }

  // Where a hat sits: the top of the head in the frame on show, found by going
  // down the head point's column to the first solid pixel. (The head point is
  // for flair floating above the head, so a hat there would hover.) Cached per
  // frame; null if the frame can't be read.
  _headTop(img, hx, hy) {
    const key = `${img.currentSrc || img.src}|${hx}`;
    if (HEAD_TOPS.has(key)) return HEAD_TOPS.get(key);
    if (!img.complete || !img.naturalWidth) return null;
    let top = null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 256, 256);
      const from = Math.max(0, Math.round(hy) - 40);
      const x0 = Math.min(251, Math.max(0, Math.round(hx) - 2));
      const data = g.getImageData(x0, from, 5, 256 - from).data;
      for (let y = 0; y < 256 - from && top === null; y++) {
        for (let x = 0; x < 5; x++) {
          if (data[(y * 5 + x) * 4 + 3] > 128) { top = from + y; break; }
        }
      }
    } catch (err) {
      top = null; // no canvas: the head point will do
    }
    HEAD_TOPS.set(key, top);
    return top;
  }

  // The lowest head top across the frames on show (a pet's two idle frames can
  // carry the head a few pixels apart), so a hat never hovers on either: it
  // sits a little deeper on the other. Frames not loaded yet are measured on a
  // later call (_seasonTick calls this every tick to have them ready).
  _headTopAll(s, hx, hy) {
    let low = this._headTop(s.pet, hx, hy);
    for (const sprite of this._frames(s)) {
      const path = sprite.includes("/") ? sprite : `${s.speciesId}/${sprite}`;
      const src = new URL(`${BASE}/sprites/${path}.png?v=${VERSION}`, location.href).href;
      let img = FRAME_IMGS.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        FRAME_IMGS.set(src, img);
      }
      const top = this._headTop(img, hx, hy);
      if (top !== null && (low === null || top > low)) low = top;
    }
    return low;
  }

  // species.json "hat" for the pose on show ("adult_dirty"), else for the stage:
  // a pose that sits the creature up carries its head well above the stage's point
  // (the opossum frets sitting up). null: no hat fits the pose (its frames bounce
  // between a leap and a crouch), so the costume waits for another pose.
  _hatSpot(s) {
    const pose = (this._frames(s)[0] || "").replace(/_\d+$/, "");
    const hat = s.species.hat || {};
    return pose in hat ? hat[pose] : hat[s.drawn];
  }

  // Where the hat's brim top sits: {x, top} in sprite pixels, null when the head
  // can't be measured. A [x, y, "exact"] entry seats it at y with no scan (a point
  // alone can only push a hat lower, never lift it); a [x, y] entry is the lower
  // of y and the frames' head top; no entry scans the head point.
  _hatSeat(s) {
    const own = this._hatSpot(s);
    const head = s.species?.head?.[s.drawn];
    if (Array.isArray(own) && own[2] === "exact") return { x: own[0], top: own[1] };
    const p = own || head;
    if (!p) return null;
    const scanned = this._headTopAll(s, p[0], p[1]);
    const top = own ? Math.max(own[1], scanned ?? own[1]) : scanned;
    return top === null ? null : { x: p[0], top };
  }

  // The hat sits on top of the head, brim sunk in a little.
  _costume(s, season, line, catchy = true) {
    const head = s.species?.head?.[s.drawn];
    if (!head) return; // no head point (an egg): no hat
    s.screen.querySelector(".costume")?.remove();
    const at = this._flairAnchors(s);
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    // species.json "hat" where ears or antlers rise above the skull (the deer).
    const own = this._hatSpot(s);
    const k = r.height / 256;
    // With a hat point, the lower of it and the frames' top in its column (another
    // mood's frames can carry the head lower).
    const top = this._hatSeat(s)?.top ?? null;
    // Today's costume for this pet (the hat, without a list).
    const suits = (season.costumes || []).filter((c) => !c.skip?.includes(s.speciesId));
    const costume = dailyPick(suits.length ? suits : [{ art: "hat", sink: 7, width: 64 }], s.ids?.device);
    const brim = top === null ? at.hy + 14 * at.ks : r.top - sr.top + (top + costume.sink) * k;
    const x = own ? r.left - sr.left + own[0] * k : at.hx;
    const box = document.createElement("div");
    box.className = "flair costume";
    box.style.setProperty("--fl-ms", `${FLAIR_MS + 1800}ms`);
    const hat = document.createElement("div");
    hat.className = "fx hat";
    hat.innerHTML = `<img src="${BASE}/ui/season_${season.key}_${costume.art}.png?v=${VERSION}" alt="">`;
    Object.assign(hat.style, { left: `${x}px`, top: `${brim}px`, width: `${costume.width * at.ks}px` });
    box.append(hat);
    s.screen.appendChild(box);
    s.flairUntil = Date.now() + FLAIR_MS + 1800;
    this._speak(s, line, 4000, { catch: catchy });
    this._animate(s, s.pet, "perk", 320);
    this._later(s, FLAIR_MS + 1800, () => box.remove(), { group: "season", hidden: "tab", undo: () => box.remove() });
  }

  // Trick or treat: a sweet pops up at its feet. At Thanksgiving, the pet
  // thanks whoever cared for it most lately.
  _seasonTreat(s, season) {
    const at = this._flairAnchors(s);
    const box = s.screen.querySelector(".costume");
    if (!box) return;
    if (season.sweet) {
      const sweet = document.createElement("div");
      sweet.className = "fx pop";
      sweet.innerHTML = `<img src="${BASE}/ui/season_${season.key}_${season.sweet}.png?v=${VERSION}" alt="">`;
      Object.assign(sweet.style, { left: `${at.cx + at.half * 1.1}px`, top: `${at.fy}px`, width: `${48 * at.ks}px` });
      box.append(sweet);
    }
    this._sparkle(s);
    this._speak(s, season.thanks ? this._thanks(s) : season.treatSay ?? "a treat! thank you!! ♪", 3500);
  }

  // Thanks to everyone: never ranking who did the most.
  _thanks() {
    return "thank you all for taking care of me ♥";
  }

  // The season's flyer: one, or a flock in a V, from one side.
  _seasonFlyer(s, season) {
    const { art, cls, ms, flock = 1 } = season.flyer;
    const ltr = Math.random() < 0.5;
    const top = 8 + Math.random() * 22;
    for (let i = 0; i < flock; i++) {
      const lag = Math.abs(i - (flock - 1) / 2); // the leader in the middle, ahead
      this._later(s, lag * 450, () => this._seasonFly(s, season, art, cls, ms, { ltr, top: top + lag * 6 }), { group: "season" });
    }
  }

  // Something crosses the scene (a bat, the witch, the ghost): one image or
  // two flapping frames, from a random side unless told which.
  _seasonFly(s, season, art, cls, ms, { ltr = Math.random() < 0.5, top = null, walk = false } = {}) {
    const el = document.createElement("div");
    el.className = `sfly ${cls} ${ltr ? "ltr" : "rtl"}${walk ? " walk" : ""}`;
    el.style.setProperty("--fly-ms", `${ms}ms`);
    if (top !== null) el.style.top = `${top}%`;
    const frames = Array.isArray(art) ? art : [art];
    el.innerHTML = frames.map((n) =>
      `<img src="${BASE}/ui/season_${season.key}_${n}.png?v=${VERSION}" alt="">`).join("");
    if (frames.length > 1) el.classList.add("flap");
    s.seasonBox.append(el);
    this._later(s, ms + 200, () => el.remove(), { group: "season", hidden: "tab", undo: () => el.remove() });
    return el;
  }

  // A visitor comes by (a friendly ghost floats, a turkey walks); the pet
  // startles, then greets it. Both lines are flavour, said now or not at all (a
  // kept line, a game or a question wins), and each beat checks _visitorLive:
  // else the visit ends at once, its picture gone, like a world visitor's.
  _seasonVisitor(s, season) {
    const { art, cls, ms, startle, jump, greet } = season.visitor;
    this._seasonVisitEnd(s);
    const ltr = Math.random() < 0.5;
    const el = this._seasonFly(s, season, art, cls, ms, { ltr, walk: !!season.visitor.walk });
    s.flairUntil = Date.now() + ms; // nothing else meanwhile
    s.visitUntil = s.flairUntil; // a pat wiggles, no line
    s.nextVisitCheck = Math.max(s.nextVisitCheck || 0, s.flairUntil + VISIT_AFTER_MS); // a world one later
    const V = s.seasonVisit = { el, until: s.flairUntil };
    const at = (t, fn) => this._later(s, t, () => {
      if (s.seasonVisit !== V) return;
      if (this._visitorLive(s)) fn();
      else this._seasonVisitEnd(s);
    }, { group: "season.visit" });
    at(1400, () => {
      if (!this._mayInterrupt(s, FLAVOUR)) return;
      // The art faces right, so only a visitor on the left is faced (as a world visitor is,
      // card-visitors.js): turned as the startle begins, held through the greet.
      if (ltr && !calm()) this._look(s, ms - 1400 - 600);
      this._line(s, FLAVOUR, startle, 1800, { write: true });
      this._animate(s, s.pet, jump, jump === "perk" ? 320 : 800);
      if (season.chirp) this._chirp(s, season.chirp);
    });
    at(3400, () => {
      if (!this._mayInterrupt(s, FLAVOUR)) return;
      this._line(s, FLAVOUR, pick(unnamed(greet)), 3000);
      this._animate(s, s.pet, "perk", 320);
    });
    at(ms, () => this._seasonVisitEnd(s, { passed: true }));
  }

  // The seasonal visit's timers stop; cut short, its picture goes too.
  _seasonVisitEnd(s, { passed = false } = {}) {
    const V = s.seasonVisit;
    if (!V) return;
    s.seasonVisit = null;
    this._stop(s, { group: "season.visit" });
    if (!passed) V.el.remove();
    if (s.flairUntil === V.until) s.flairUntil = 0;
    if (s.visitUntil === V.until) s.visitUntil = 0;
  }
}

