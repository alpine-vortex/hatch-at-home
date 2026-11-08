class HatchPetCardVisitors extends HatchPetCardSeason {
  // --- World visitors (docs/plan-2026-10-31-visitors.md, v2) ----------------
  // Flavour only: nothing is sent or counted (the server credits the visit at its
  // window's end, seen or not). The card keeps only the day's localStorage flag
  // (hatch-visit-<device>-<day>), used up when a visit starts or is told missed.

  // The server's plan for today (house.visit: {day, id, hours, from, until}, epoch
  // seconds), null on a day with none. Undefined only for a true old server (the
  // channel up, its house with no visit key): then v1's own pick. With no channel
  // (not up yet, or failed: HA starting or reloading) null, so nothing is said or
  // played and the day's flag is left for the server's visit (v1's pick hashes the
  // device, the server's the entry, so they differ).
  _visitPlan(s) {
    if (s.house && "visit" in s.house) return s.house.visit || null;
    return s.subscribed ? undefined : null;
  }

  // The day the visit flag is keyed by: the server's day (finding #22: a browser in
  // another time zone crosses its own midnight inside one HA day), else the browser's.
  _visitDay(s) {
    const plan = this._visitPlan(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plan?.day || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }

  // Today's visitor for this pet, if it may come now: the server's plan inside its
  // window (or v1's pick: a visit day, inside its hours), and the screen's kind (night
  // or dim for a night visitor, else day).
  _visitorDue(s, date) {
    const list = visitorList(s.world);
    if (!list.length) return null;
    const dark = this._screenDark(s);
    const plan = this._visitPlan(s);
    if (plan !== undefined) {
      const v = plan && list.find((x) => x.id === plan.id);
      if (!v || (v.hours === "night") !== dark) return null;
      const t = (date ? date.getTime() : serverNow()) / 1000;
      return t >= plan.from && t < plan.until ? v : null;
    }
    date ||= new Date();
    const d = visitorDay(date, s.ids?.device);
    if (!d.visit) return null;
    const v = list[d.who];
    if (!v || (v.hours === "night") !== dark) return null;
    const start = v.hours === "night" ? d.night : d.day;
    return date.getHours() >= start && date.getHours() < start + 3 ? v : null;
  }

  // A first look's missed day visitor (s.lateVisit): once its first line is said and done,
  // it comes by, the look's other lines going on (its greet is a move, no line, while
  // they wait). Not over a link, game, call, the basket or a busy pet; given up after
  // LATE_VISIT_MS, when the usual check may still bring it. True: it started.
  _lateVisitTick(s, now) {
    const late = s.lateVisit;
    if (now - late.made > LATE_VISIT_MS) {
      s.lateVisit = null;
      return false;
    }
    if ((s.queue?.length || 0) > late.left) return false; // the first line not said yet
    late.after ??= Math.max(s.sayUntil || 0, now); // the line on show is done
    if (now < late.after || s !== this._slides[this._index] || this._booting || this._link || s.linking ||
      s.power || s.calling || this._basketShows(s) || !this._freeBody(s)) return false;
    s.lateVisit = null;
    const v = this._visitorLate(s);
    if (!v || !oncePerDay(`visit-${s.ids?.device}`, this._visitDay(s))) return false;
    this._visitorStart(s, v);
    return true;
  }

  // A night (or dim) screen: night visitors only.
  _screenDark(s) {
    return s.screen.classList.contains("night") || s.screen.classList.contains("dim");
  }

  // A day visitor whose window is over with nobody here to see it (the day's flag, used
  // by the caller, unset on this device): it comes by live at a daytime look instead of
  // the catch-up line (fresh-moment 3, owner Q3). Never on a dark screen (Q7).
  _visitorLate(s) {
    const v = this._visitorMissed(s);
    return v && v.hours !== "night" && !this._screenDark(s) ? v : null;
  }

  // Today's visitor if its window is over (the first look's catch-up line).
  _visitorMissed(s, date) {
    const list = visitorList(s.world);
    const plan = this._visitPlan(s);
    if (plan !== undefined) {
      const v = plan && list.find((x) => x.id === plan.id);
      return v && (date ? date.getTime() : serverNow()) / 1000 >= plan.until ? v : null;
    }
    return visitorMissed(list, date || new Date(), s.ids?.device);
  }

  // May a visit start? The pet on show VISIT_SHOWN_MS and past its first look, free
  // (_linkFree: idle and awake, nothing queued or said, no game, scene, status or egg),
  // no link, low-battery gag or call, not within VISIT_AFTER_MS of a link, and no
  // basket on show.
  _visitorFree(s, now = Date.now()) {
    return s === this._slides[this._index] && !this._booting && !!s.lookedFirst && !s.visitor &&
      !this._link && !s.linking && !s.power && !s.calling && (this._linkFree(s) || this._askOnly(s)) &&
      !this._basketShows(s) && // the basket's floor line: the visitor waits (review C7)
      now - (this._visitShown?.s === s ? this._visitShown.at : now) >= VISIT_SHOWN_MS &&
      now - (this._linkEndedAt ?? -Infinity) >= VISIT_AFTER_MS;
  }

  // Still fine to go on (each beat checks): the slide on show, awake, no game, scene,
  // link, gag, call or status. Else the visit ends at once, its picture gone.
  _visitorLive(s) {
    return s === this._slides[this._index] && !s.asleep && !this._owned(s) && !s.scene && !s.linking &&
      !s.power && !s.calling && !s.screen.classList.contains("show-status");
  }

  // From _tick, for the slide on show: at most one look every VISIT_CHECK_MS.
  _visitorTick(s) {
    const now = Date.now();
    if (this._visitShown?.s !== s) this._visitShown = { s, at: now };
    if (s.seasonVisit && !this._visitorLive(s)) this._seasonVisitEnd(s);
    if (s.visitor) {
      if (!this._visitorLive(s)) this._visitorEnd(s);
      return;
    }
    if (s.lateVisit && this._lateVisitTick(s, now)) return;
    if (now < (s.nextVisitCheck || 0)) return;
    s.nextVisitCheck = now + VISIT_CHECK_MS;
    if (!this._visitorFree(s, now)) return;
    const v = this._visitorDue(s) || this._visitorLate(s);
    if (v && oncePerDay(`visit-${s.ids?.device}`, this._visitDay(s))) {
      this._visitorStart(s, v);
      return;
    }
    // A no-visit day's rare guest from another world (E10 V-c): once a day, in its window.
    const g = !v && this._visitorGuest(s);
    if (g && oncePerDay(`guest-${s.ids?.device}`, this._visitDay(s))) this._visitorStart(s, g.v, { world: g.world, guest: true });
  }

  // --- Fresh-expand E10: a rare pair, a guest from another world (card only) --------

  // This pet's roll for a rare kind of day (pure: the device, the day and the kind).
  _rareDay(s, kind, odds) {
    return turnHash(`${s.ids?.device}|${this._visitDay(s).toDateString()}|${kind}`) % odds === 0;
  }

  // V-b: on a pair day, a friend of the planned visitor: its world's, the same hours, not
  // a crosser. Null otherwise. Not counted, not written anywhere.
  _visitorPair(s, v) {
    if (v.cross || !this._rareDay(s, "pair", PAIR_ODDS)) return null;
    return visitorList(s.world).find((x) => x.id !== v.id && x.hours === v.hours && !x.cross) || null;
  }

  // V-c: on a day the server plans no visit, a guest day: in the day or night window of
  // this screen's kind, a visitor from another world with those hours. {v, world} or null.
  _visitorGuest(s, date = new Date()) {
    if (!s.house || !("visit" in s.house) || s.house.visit !== null || !this._rareDay(s, "guest", GUEST_ODDS)) return null;
    const hours = this._screenDark(s) ? "night" : "day";
    const from = GUEST_HOURS[hours];
    if (date.getHours() < from || date.getHours() >= from + 3) return null;
    const all = Object.entries(this._worlds || {}).filter(([w]) => w !== s.worldKey)
      .flatMap(([w, world]) => visitorList(world).filter((x) => x.hours === hours).map((x) => ({ v: x, world: w })));
    if (!all.length) return null;
    return all[turnHash(`${s.ids?.device}|${this._visitDay(s).toDateString()}|guestwho`) % all.length];
  }

  // One visit: in from a side to the edge, the pet looks, then greets it (one line),
  // and it goes back the way it came; a crosser streaks straight over. Reduced motion:
  // the first frame, standing still at the edge for VISIT_CALM_MS; the greet's frame
  // and the line, no look or hop.
  _visitorStart(s, v, { ltr = Math.random() < 0.5, count = true, world = s.worldKey, guest = false } = {}) {
    this._visitorEnd(s);
    if (count && !guest) this._visitFriendCount(s, v);
    if (count && !guest && !v.cross) this._visitorReport(s);
    const isCalm = calm();
    const inMs = v.in || (v.cross ? 1800 : VISIT_IN_MS);
    const stay = (v.stay || VISIT_STAY_MS) * (sharedScreen() ? 2 : 1); // a shared screen: longer (E8 Sh-a)
    const greetAt = isCalm ? 600 : v.cross ? Math.round(inMs * 0.6) : inMs + 1000;
    const total = isCalm ? VISIT_CALM_MS : v.cross ? greetAt + 3000 : greetAt + stay + inMs;
    const frames = isCalm ? [1] : [1, 2];
    const el = document.createElement("div");
    el.className = `vis vis-${v.id} ${v.walk ? "walk" : "fly"} ${ltr ? "ltr" : "rtl"}` +
      `${frames.length > 1 ? " flap" : ""}${isCalm ? "" : v.cross ? " cross" : " in"}`;
    el.dataset.visitor = `${world}/${v.id}`;
    el.style.setProperty("--in-ms", `${inMs}ms`);
    el.innerHTML = frames.map((n) =>
      `<img src="${BASE}/ui/visitor_${world}_${v.id}_${n}.png?v=${VERSION}" alt="">`).join("");
    s.seasonBox.append(el);
    const now = Date.now();
    const V = s.visitor = { el, els: [el], v, until: now + total, greetAt, guest: guest ? world : null };
    if (!v.cross && !guest) { // seen here today, for the evening's today line (fresh-moment 4)
      try {
        localStorage.setItem(`hatch-visitseen-${s.ids?.device}`, JSON.stringify({ day: this._visitDay(s).toDateString(), name: v.name }));
      } catch (err) {
        // no storage: no visitor in the today line
      }
    }
    s.flairUntil = s.visitUntil = V.until; // nothing else meanwhile; a pat wiggles, no line
    s.nextVisitor = Math.max(s.nextVisitor || 0, now + total + VISIT_AFTER_MS); // a seasonal one later
    const at = (ms, fn) => this._later(s, ms, () => {
      if (s.visitor !== V) return;
      if (this._visitorLive(s)) fn();
      else this._visitorEnd(s);
    }, { group: "visitor" });
    // The art faces right, so only a visitor on the left is faced (UX8 F2): held through
    // the greet and the stay, never turned away from one coming in on the right.
    if (!isCalm && !v.cross && ltr) at(inMs, () => this._look(s, greetAt + stay - inMs));
    // A friend of its world along, now and then (E10 V-b): the other side, a little behind.
    const pal = !guest && this._visitorPair(s, v);
    if (pal) {
      V.pair = pal;
      at(isCalm ? 0 : PAIR_BEHIND_MS, () => {
        const el2 = el.cloneNode(false);
        el2.className = el.className.replace(/\bvis-\S+/, `vis-${pal.id}`).replace(/\b(ltr|rtl)\b/, ltr ? "rtl" : "ltr")
          .replace(/\b(walk|fly)\b/, pal.walk ? "walk" : "fly");
        el2.dataset.visitor = `${world}/${pal.id}`;
        el2.innerHTML = frames.map((n) =>
          `<img src="${BASE}/ui/visitor_${world}_${pal.id}_${n}.png?v=${VERSION}" alt="">`).join("");
        s.seasonBox.append(el2);
        V.els.push(el2);
      });
    }
    at(greetAt, () => this._visitorGreet(s, v));
    if (v.cross && !isCalm) at(inMs, () => el.remove());
    else if (!isCalm) at(greetAt + stay, () => V.els.forEach((x) => x.classList.replace("in", "out")));
    at(total, () => this._visitorEnd(s));
    return V;
  }

  // The greet: acts.cheer (else the excited frame and a hop; a child, the line only)
  // and one flavour line, said now or not at all (a kept line, a game or a question
  // wins; the visitor still passes). A baby says baby talk.
  _visitorGreet(s, v) {
    const asking = this._questionOn(s); // its bubble stays: the greet is a move, no line (5a)
    if (!asking && !this._mayInterrupt(s, FLAVOUR)) return;
    const before = s.poseUntil;
    this._reactFrames(s, "greet");
    // The wave frames (the link greeting's loader and fallbacks) replace the greet
    // pose when it ran; a child, or a species without waves, keeps the greet as it was.
    if (s.poseUntil && s.poseUntil !== before && s.drawn !== "child" && s.species?.waves?.[s.drawn]) {
      const mine = this._linkPose(s.species, s.drawn, s.speciesId, (f) => {
        if (s.poseFrames === mine) { s.poseFrames = f; this._show(s, s.pet, f[0]); }
      });
      s.poseFrames = mine;
      this._show(s, s.pet, mine[0]);
    }
    if (asking) return;
    const V = s.visitor;
    const baby = this._babySet(s, "visit");
    // A guest says where it's from; a pair, that there are two (E10); else the viewer's
    // favourite (F4); else a friend's line (E3), else the usual. Baby talk stays.
    const rare = !baby && (V?.guest ? VISIT_GUEST[V.guest] : V?.pair ? turnPick(PAIR_LINES, `${s.ids?.device}|pair`) : null);
    // The favourite: on the viewer's own screen, 1 visit in 2, with a hop and hearts.
    if (!baby && !rare && !sharedScreen() && s.mine?.fav_visitor === v.id && Math.random() < 0.5) {
      this._line(s, FLAVOUR, turnPick(FAVV_LINES.greet, `${s.ids?.device}|favv`)(v.name), 3000);
      if (!calm()) {
        this._animate(s, s.pet, "greethop", 1400);
        this._bondHearts(s);
      }
      return;
    }
    const friend = !rare && this._visitFriendLine(s, v);
    const { text } = rare || friend ? { text: rare || friend } : this._lines(s, "visit", pick([...VISIT_LINES, ...v.lines]), undefined, { nature: "visit" });
    this._line(s, FLAVOUR, text, 3000);
  }

  // Visitors become friends (fresh-expand E3, V-a). This pet's sighting days of each
  // visitor on this browser: {id: {n, day}}, one key per pet and generation (a new
  // generation hasn't met anyone yet). Never shown or sent; names no person.
  _visitFriendKey(s) {
    return `hatch-visitfriends-${s.ids?.device}-${this._state(s, "sensor.life_stage")?.attributes?.generation || 1}`;
  }

  _visitFriends(s) {
    try {
      const tally = JSON.parse(localStorage.getItem(this._visitFriendKey(s)) || "{}");
      return tally && typeof tally === "object" ? tally : {};
    } catch (err) {
      return {};
    }
  }

  // A live visit adds 1 on a day this visitor wasn't counted yet; this pet's keys from
  // other generations go, so one key per pet.
  // Tell the server the day's visitor was played here (UX8 F4, the social meter): on any
  // screen, a shared one too, which the hourly visit call never credits. The server counts
  // it once a day, inside the visit's window. Nobody's name goes.
  _visitorReport(s) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id || !this._visitPlan(s)?.id) return;
    this._hass.callWS({ type: "virtual_pet/greeted", entity_id: id }).catch(() => {
      // an older integration has no such command: the visit's own credit stands
    });
  }

  _visitFriendCount(s, v) {
    const key = this._visitFriendKey(s);
    const day = this._visitDay(s).toDateString();
    const tally = this._visitFriends(s);
    if (tally[v.id]?.day === day) return;
    tally[v.id] = { n: Math.min((Number(tally[v.id]?.n) || 0) + 1, 99), day };
    try {
      const mine = new RegExp(`^hatch-visitfriends-${s.ids?.device}-\\d+$`);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k !== key && mine.test(k)) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify(tally));
    } catch (err) {
      // no storage: no friends, the usual greet
    }
  }

  // A friend's greet half the time (not a baby: it keeps its baby talk), else null.
  _visitFriendLine(s, v) {
    const lines = VISIT_FRIENDS[v.id];
    if (!lines || this._babySet(s, "visit") || (Number(this._visitFriends(s)[v.id]?.n) || 0) < VISIT_FRIEND_AFTER) return null;
    return Math.random() < 0.5 ? turnPick(lines, `${s.ids?.device}|${v.id}`) : null;
  }

  _visitorEnd(s) {
    const V = s.visitor;
    if (!V) return;
    s.visitor = null;
    this._stop(s, { group: "visitor" });
    (V.els || [V.el]).forEach((x) => x.remove());
    if (s.flairUntil === V.until) s.flairUntil = 0;
    if (s.visitUntil === V.until) s.visitUntil = 0;
  }

  // --- The basket (docs/plan-2026-11-01-visitors-v2.md §3) ---------------------
  // The server rolls finds into the basket; house.basket says how many wait (0-3, no
  // ids: an older server sends no key, so no basket). Opening the card says nothing. A
  // tap sends virtual_pet/collect (a websocket command: who tapped isn't recorded) and
  // the reply's finds are shown one by one over the basket, the pet saying a line for
  // each (flavour). The server empties the basket for every screen at once; a screen
  // that didn't tap (or lost the race: an empty reply) just loses the basket, quietly.

  // How many wait, as the picture shows them (no number anywhere).
  _basketCount(s) {
    if (!findsShown()) return 0; // FINDS_SHOWN off: no basket, no tap, no reveal
    const n = s.house?.basket;
    return Number.isInteger(n) && n > 0 ? Math.min(n, 3) : 0;
  }

  // May the basket be tapped? The pet on show and free as for a visitor (_visitorLive:
  // awake, no game, scene, link, gag, call or status), out of its egg, not booting, and
  // no tap or reveal already going. Else a tap never reaches the server (review C1: a
  // basket emptied unseen is lost to this screen), and goes through to the screen.
  _basketLive(s) {
    return this._basketCount(s) > 0 && !s.egg && !!s.species && !this._booting &&
      !s.collecting && !s.reveal && this._visitorLive(s);
  }
  // Shown with something in it, live or not (compact too; the CSS hides it under the
  // status). While a tap waits on its reply, the picture is held as it was:
  // the server's publish of the empty basket can come first (review C2).
  _basketSync(s) {
    const b = s.basket;
    if (!b || s.collecting) return;
    const n = this._basketCount(s);
    const show = n > 0 && !s.reveal && !s.egg && !!s.species && !this._owned(s) && !s.scene;
    if (show) {
      const src = `${BASE}/ui/basket_${n}.png?v=${VERSION}`;
      const img = b.firstElementChild;
      if (img.getAttribute("src") !== src) img.src = src;
    }
    if (b.hidden === show) b.hidden = !show;
    // A find lands: the basket pops in with its first and rocks once; a fuller one only rocks. Seen live
    // (not on load: basketSeen starts undefined), and not under reduced motion.
    const before = s.basketSeen;
    s.basketSeen = n;
    if (show && before !== undefined && n > before && !calm()) {
      b.classList.remove("lands", "lands-more");
      this._animate(s, b, before === 0 ? "lands" : "lands-more", 1000);
    }
    const live = show && this._basketLive(s);
    b.classList.toggle("idle", !live);
    b.tabIndex = live ? 0 : -1;
  }

  // Is the basket on show (a visitor waits while it is: the same floor line)?
  _basketShows(s) {
    return !!s.reveal || !!s.collecting ||
      (!!s.basket && !s.basket.hidden && getComputedStyle(s.basket).display !== "none");
  }

  // The tap: once (re-entry guarded until the reply), then the reveal. An error keeps
  // the basket; an empty reply (another screen was first) shows nothing and says nothing.
  async _basketTap(s, e) {
    e?.stopPropagation(); // not the status, not a pat
    if (s !== this._slides[this._index] || (e && e.detail !== 0 && this._swiped)) return;
    this._basketSync(s);
    if (!this._basketLive(s)) return;
    const entity = s.ids?.["sensor.life_stage"];
    if (!entity) return;
    s.collecting = true;
    this._tapped(s.basket);
    let finds = null;
    try {
      const reply = await this._hass.callWS({ type: "virtual_pet/collect", entity_id: entity });
      finds = Array.isArray(reply?.finds) ? reply.finds : [];
    } catch (err) {
      console.warn("hatch-pet-card: the basket", err?.message || err);
    }
    if (s.ids?.["sensor.life_stage"] !== entity) return; // another pet here now
    s.collecting = false;
    // Only finds this card knows (a newer server's are skipped), at most the basket's three.
    const known = (finds || []).filter((f) => findOf(this._worlds, f?.world, f?.id)).slice(0, 3);
    if (finds && finds.length) {
      s.house = { ...(s.house || {}), basket: 0 }; // gone here too, whatever came first
    }
    if (known.length && s === this._slides[this._index]) this._revealStart(s, known);
    this._basketSync(s);
  }

  // The reveal: the basket drawn once, and every FIND_STEP_MS the next find pops up over
  // it, the pet says its line, and a first-ever find sparkles. Calm: the find appears,
  // still. Flavour, started by a person: a line goes out only when the bubble is free of
  // anyone else's; once one can't, the rest of the reveal is shown without lines. A pat
  // meanwhile wiggles; nothing else starts. Each beat checks _visitorLive, else it ends.
  _revealStart(s, finds) {
    this._revealEnd(s);
    const isCalm = calm();
    const el = document.createElement("div");
    el.className = "reveal";
    el.innerHTML = `<img class="rb" alt="" src="${BASE}/ui/basket_${Math.min(finds.length, 3)}.png?v=${VERSION}">` +
      '<img class="rf" alt="" hidden>';
    s.screen.append(el);
    const total = finds.length * FIND_STEP_MS;
    const R = s.reveal = { el, finds, until: Date.now() + total, quiet: false, said: null, shown: [] };
    s.flairUntil = s.visitUntil = R.until; // a pat wiggles, no line; nothing else meanwhile
    s.basket.hidden = true;
    const at = (ms, fn) => this._later(s, ms, () => {
      if (s.reveal !== R) return;
      if (this._visitorLive(s)) fn();
      else this._revealEnd(s);
    }, { group: "reveal" });
    finds.forEach((f, i) => at(i * FIND_STEP_MS, () => this._revealFind(s, R, f, isCalm)));
    at(total, () => this._revealEnd(s));
    return R;
  }

  // One find out of the basket: its picture, its sparkle (first-ever), its line.
  _revealFind(s, R, f, isCalm) {
    const img = R.el.querySelector(".rf");
    img.classList.remove("pop");
    img.src = `${BASE}/ui/find_${f.world}_${f.id}.png?v=${VERSION}`;
    img.dataset.find = `${f.world}/${f.id}`;
    img.hidden = false;
    if (!isCalm) {
      void img.offsetWidth; // restart the pop
      img.classList.add("pop");
    }
    R.shown.push(`${f.world}/${f.id}`);
    if (f.new) {
      const ring = document.createElement("span");
      ring.className = "burst";
      R.el.append(ring);
      this._later(s, 600, () => ring.remove(), { group: "reveal", hidden: "tab", undo: () => ring.remove() });
    }
    if (R.quiet) return;
    // The reveal's own line still up doesn't hold the next one; anyone else's does.
    const own = R.said && s.sayEntry?.text === R.said && s.sayUntil > Date.now();
    if (own) s.sayUntil = 0;
    if (!this._mayInterrupt(s, FLAVOUR)) {
      R.quiet = true;
      return;
    }
    R.said = this._findLine(s, f);
    this._line(s, FLAVOUR, R.said, FIND_LINE_MS);
  }

  // A find's line (§7): V3 when a visitor left it (its roster name, a new one too: the
  // sparkle says new), else V2 for a first-ever find, else one of V1 for the day. Baby
  // talk: BABY.find. Each from the find's own world (an old world's find, its own line).
  _findLine(s, f) {
    const find = findOf(this._worlds, f.world, f.id);
    const a = find?.a || find?.name || "something";
    const roster = this._worlds?.[f.world]?.visitors;
    const who = f.from && Array.isArray(roster) && roster.find((v) => v?.id === f.from)?.name;
    const normal = who ? FIND_LINES.left[0](a, who)
      : f.new ? FIND_LINES.fresh[0](a)
        : dailyPick(FIND_LINES.find, `${f.world}|${f.id}`)(a);
    return this._lines(s, "find", normal, undefined, { nature: who || f.new ? null : "find" }).text;
  }

  _revealEnd(s) {
    const R = s.reveal;
    if (!R) return;
    s.reveal = null;
    this._stop(s, { group: "reveal" });
    R.el.remove();
    if (s.flairUntil === R.until) s.flairUntil = 0;
    if (s.visitUntil === R.until) s.visitUntil = 0;
    this._basketSync(s);
  }
}

