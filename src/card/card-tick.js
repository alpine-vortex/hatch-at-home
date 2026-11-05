class HatchPetCardTick extends HatchPetCardSitter {
  // The excited celebration ended (EXCITED_POSE_MS): the mood stays, the frames go to content. _update only
  // runs on a hass push, so the tick does the redraw.
  _excitedSettle(s) {
    if (!s.excitedPosed || (!calm() && excitedPosed(s.excitedSince, Date.now()))) return;
    s.frames = this._shownFrames(s, "excited");
    s.framesKey = s.frames.join(",");
    s.frame = 0;
  }

  _tick() {
    if (!this._slides || !this._visible || document.hidden) return;
    this._ticks = (this._ticks || 0) + 1;
    this._director?.tick(); // expires a glass effect past its time (a missed animationend)
    // A screen left on overnight (a wall tablet never hides): a new day is a new look.
    const day = new Date().toDateString();
    if (this._lookDay !== day) {
      if (this._lookDay) this._newLook(this._slides);
      this._lookDay = day;
    }
    this._slides.forEach((s, i) => {
      if (s.poseUntil && Date.now() > s.poseUntil) s.poseUntil = 0;
      if (s.patPoseUntil && Date.now() > s.patPoseUntil) s.patPoseUntil = 0;
      this._excitedSettle(s);
      const frames = this._frames(s);
      const seen = Math.abs(i - this._index) <= 1; // the pet on show and the peeking ones
      if (seen && frames.length && !s.scene && !(s.asleep && this._ticks % 2) && !(s.turnUntil > Date.now())) {
        const was = s.pet.getAttribute("src");
        s.frame = (s.frame + 1) % frames.length;
        this._show(s, s.pet, frames[s.frame]);
        if (was && was !== s.pet.getAttribute("src")) this._ghostFrame(s, was);
      }
      if (s.propUntil && Date.now() > s.propUntil) {
        this._show(s, s.prop, null);
        s.propUntil = 0;
      }
      if (s.sayUntil && Date.now() > s.sayUntil) s.sayUntil = 0;
      // F1: the typed step ends (with no text) on a slide switch, a hidden tab or its time.
      if (s.textStep && (document.hidden || s !== this._slides[this._index] || Date.now() > s.textStep.until)) {
        this._askTextEnd(s);
      }
      this._modeGuard(s); // a shell mode's idle exit, which must not wait for a hass push
      if (seen) this._sitterTick(s); // the sitter's frame, step and idle: the one timer (sitter plan S3a)
      this._patSync(s);
      this._basketSync(s);
      if (s === this._slides[this._index] && !s.reloading && !s.empty) { // a reloading pet greets and asks nothing
        if (!this._booting) this._greet(s); // the boot screen waits: only the speaking does
        this._powerTick(s);
        this._firstLook(s); // before the visit: it tells the server what's queued
        this._giftReturn(s);
        this._followEvening(s);
        this._visit(s);
        if (!this._booting) {
          this._sayQueued(s);
          this._wishMention(s);
          this._socialFull(s);
        }
        this._seen(s);
        this._idle(s);
        this._eggWobble(s);
        this._flairTick(s);
        this._firstMove(s);
        this._seasonTick(s);
        this._partyTick(s);
        this._linkTick(s);
        this._visitorTick(s);
      }
      if (s === this._slides[this._index]) this._rareGlass(s, Date.now()); // the rare glass mark's gate (slice 6)
      if (!s.sayUntil && s.species && !s.reloading && !s.empty) {
        const mood = this._state(s, "sensor.mood");
        // A game waiting on a guess asks again (a care line said over it is done).
        const prompt = s.game?.prompt;
        const text = prompt || this._say(s, mood);
        if (prompt) this._write(s, text, 60000);
        else if (s.bubble.textContent !== text) this._write(s, text);
      }
    });
  }

  // Ghosting: a slow LCD leaves a fading trace where the pet was. Only the pet on
  // show, with screen effects on, never with reduced motion or more contrast, and
  // The fades are Web Animations,
  // which the reduced-motion CSS rule doesn't reach: hence the checks here.
  _ghosting(s) {
    const media = (q) => window.matchMedia?.(q).matches;
    return s === this._slides[this._index] && this._visible && !document.hidden && !s.linking &&
      this._card.classList.contains("lcd-on") && s.pet.style.display !== "none" && !s.scene &&
      !calm() &&
      !media("(prefers-contrast: more)");
  }

  // A frame swap: the old frame fades from 35% to nothing. Not while the pet is
  // turned or mid-animation (a hop, a sway, a move), where the trace would sit
  // where the pet isn't.
  _ghostFrame(s, src) {
    if (!this._ghosting(s) || s.pet.classList.contains("look") || s.pet.getAnimations().length ||
      s.ghostUntil > Date.now()) return;
    s.ghost.setAttribute("src", src);
    s.ghost.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 180, easing: "linear" });
  }

  // A wander or a game move: the ghost follows the pet 120 ms behind (its CSS
  // transition-delay), at 30%, leaving a short smear that catches up.
  _ghostTrail(s) {
    s.ghost.getAnimations().forEach((a) => a.cancel());
    if (!this._ghosting(s)) return;
    const cs = getComputedStyle(s.pet); // the first transition is the translate
    const move = parseFloat(cs.transitionDuration) * 1000 || 250;
    const turn = parseFloat(cs.transitionDelay) * 1000 || 0; // a wander left turns first
    const duration = turn + move + 120 + 180;
    s.ghost.setAttribute("src", s.pet.getAttribute("src"));
    s.ghost.animate([{ opacity: 0.3 }, { opacity: 0.3, offset: (turn + move + 120) / duration }, { opacity: 0 }],
      { duration });
    s.ghostUntil = Date.now() + duration;
  }

  // The backlight: the screen glows for a while; a second tap starts the while
  // again. Nothing else changes (no lights out, no waking, no line).
  _backlight(s) {
    clearTimeout(s.litTimer);
    s.screen.classList.add("lit");
    this._chirp(s, "click");
    s.litTimer = setTimeout(() => s.screen.classList.remove("lit"), BACKLIGHT_MS);
  }

  // Nothing else is going on: is the pet free for a small idle behaviour?
  _free(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !this._owned(s) && !s.scene && IDLE_MOODS.has(s.moodState) &&
      !s.screen.classList.contains("show-status") &&
      !(s.sayUntil > now) && !(s.poseUntil > now) && !(s.propUntil > now) &&
      !(s.flairUntil > now) && !(s.movingUntil > now);
  }

  // Free but for a line being said: a move with no words may play over it (fresh-moment 7).
  _freeBody(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !this._owned(s) && !s.scene && !s.linking && !s.power && !s.visitor &&
      IDLE_MOODS.has(s.moodState) && !s.screen.classList.contains("show-status") &&
      !(s.poseUntil > now) && !(s.propUntil > now) && !(s.flairUntil > now) && !(s.movingUntil > now);
  }

  // Only a question on show, its 60 s hold the one thing busy: a visitor or flair may
  // still come (fresh-moment 5a), the question keeping its bubble and buttons.
  _askOnly(s) {
    return this._questionOn(s) && !!this._freeBody(s) && !s.queue?.length &&
      this._state(s, "sensor.life_stage")?.state !== "egg";
  }

  // A first look's one early move (fresh-moment 7), so a 30 s look sees the pet do
  // something, not only talk: its flair (traits), else a look around (not when calm).
  // Over a line, as it has no bubble. Then flair and idle keep their own timers.
  _firstMove(s) {
    const now = Date.now();
    if (!s.firstMoveAt || now < s.firstMoveAt) return;
    if (!this._freeBody(s)) {
      if (now - s.firstMoveAt > FIRST_MOVE_LATE_MS) s.firstMoveAt = 0;
      return;
    }
    s.firstMoveAt = 0;
    if (this._flair(s).length) {
      const [lo, hi] = FLAIR_EVERY_MS;
      s.nextFlair = now + lo + Math.random() * (hi - lo);
    } else if (!calm()) {
      this._look(s, 1800);
    }
  }

  // A wander or a look moves the pet off its spot for a while; a hat placed
  // then would be left hovering where the pet was.
  _moving(s, ms) {
    s.movingUntil = Math.max(s.movingUntil || 0, Date.now() + ms);
  }

  _look(s, ms) {
    this._moving(s, ms + 250);
    s.pet.classList.add("look");
    setTimeout(() => s.pet.classList.remove("look"), ms);
  }

  // A wander: a slide a little to one side and back after `ms`. The art faces right, so a
  // wander left turns first (the paper flip, .2 s, then the slide; see `.pet.wander-l`) and
  // turns back as it heads home. Callers have checked calm().
  _wander(s, ms) {
    const side = pick(["wander-l", "wander-r"]);
    s.pet.classList.add(side);
    if (side === "wander-l") s.pet.classList.add("look");
    this._moving(s, ms + 900); // out, and the slide back
    setTimeout(() => s.pet.classList.remove(side, "look"), ms);
  }

  // A new sprite for a changed stage (a hatch, a stage-up, an egg laid) goes in edge-on: the paper flip
  // turns the old one away (rotate y 0 -> 90, .1 s), `put` swaps the art and the scale while it is a
  // line, and the new one turns back (90 -> 0, .1 s): `@keyframes turn-swap`, the `turn` class. The
  // moment's born/stretch and sparkle wait for it (_afterTurn): both are an `animation` on the pet.
  // Callers have checked calm(). A hat waits as for a look (_moving).
  _swapFlip(s, put) {
    this._moving(s, TURN_MS + 250);
    s.turnUntil = Date.now() + TURN_MS;
    s.pet.classList.remove("turn");
    void s.pet.offsetWidth; // restart
    s.pet.classList.add("turn");
    setTimeout(put, TURN_MS / 2);
    setTimeout(() => s.pet.classList.remove("turn"), TURN_MS);
  }

  // Run `fn` now, or when a swap flip has finished (the moment's pop and sparkle land on the new sprite).
  _afterTurn(s, fn) {
    const wait = (s.turnUntil || 0) - Date.now();
    if (wait > 0) setTimeout(fn, wait);
    else fn();
  }

  // Idle life: every so often, something small. Calm when motion is reduced.
  // Baby talk for this pet and viewer: "baby" or "child" while it's on and the
  // pet is one (its life_stage state: s.drawn is the drawn stage), else null.
  _babyStage(s) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    return (stage === "baby" || stage === "child") && babyTalk(this._hass?.user?.id) ? stage : null;
  }

  // The baby talk lines for a key at this pet's stage, or null (normal lines).
  _babySet(s, key) {
    const stage = this._babyStage(s);
    return (stage && BABY[key]?.[stage]) || null;
  }

  // The pet's own lines by its personality (PERSONA), for a teen or an adult
  // that has one, else null. Babies and children never have a type.
  _persona(s) {
    const st = this._state(s, "sensor.life_stage");
    return (st?.state === "teen" || st?.state === "adult") && PERSONA[st.attributes?.personality] || null;
  }

  // The pet's personality key, for a teen or an adult whose type the card knows, else null.
  _typeKey(s) {
    const st = this._state(s, "sensor.life_stage");
    const key = st?.attributes?.personality;
    return (st?.state === "teen" || st?.state === "adult") && Object.hasOwn(PERSONA, key) ? key : null;
  }

  // Kindred (2b): both have a type, and it's the same or KINDRED's partner.
  _kindred(a, b) {
    const [x, y] = [this._typeKey(a), this._typeKey(b)];
    return !!x && !!y && (x === y || KINDRED[x] === y);
  }

  // A line in baby talk, else half the time in its personality's words, else
  // the normal one: {text, baby}. A baby line never carries the catchphrase
  // (callers pass catch: !baby); a personality line may, as the normal one does.
  // { fresh: true } (fresh-expand E1): the type's lines by _fresh, and never the same
  // text as this key said last on this slide (the other side of the coin instead).
  // { nature: "<key>" } (species nature N2) opts in to the species' action line: after the persona's
  // coin has failed, a teen or adult's habit cell for the key, 1 time in SPECIES_LINE_ODDS, said bare;
  // the result then also carries its move ({text, baby, move}). Without it, nothing changes.
  _lines(s, key, normal, arg, { fresh = false, nature: natureKey = null } = {}) {
    const set = this._babySet(s, key);
    const own = !set && this._persona(s)?.[key];
    const take = (list) => (fresh ? this._fresh(s, key, list) : pick(list));
    const fill = (line) => (typeof line === "function" ? line(arg) : line);
    let line = set ? take(set) : own && Math.random() < 0.5 ? take(own) : null;
    if (fresh && !set && own) {
      const said = (s.lastPick ??= {})[`${key}:said`];
      const text = line === null ? normal : fill(line);
      if (text === said) line = line === null ? take(own) : null;
      s.lastPick[`${key}:said`] = line === null ? normal : fill(line);
    }
    if (line === null) {
      const cell = natureKey && !set ? this._natureCell(s, natureKey) : null;
      if (cell) return { text: cell.text, baby: false, move: cell.move || null };
      return natureKey ? { text: normal, baby: false, move: null } : { text: normal, baby: false };
    }
    return natureKey ? { text: fill(line), baby: !!set, move: null } : { text: fill(line), baby: !!set };
  }

  // The species' cells for a key (species nature N2): own[species], else company, else habit; the
  // first level that has the key wins whole. Each is { text, move } with the {home} word filled in;
  // a cell with no home word drops out. No nature, no key, or a pet that is not a teen or adult: [].
  _natureCells(s, key) {
    const st = this._state(s, "sensor.life_stage")?.state;
    const n = nature(s.species);
    if (!n || (st !== "teen" && st !== "adult")) return [];
    const L = SPECIES_LINES;
    const cells = L.own[s.speciesId]?.[key] || L.company[n.company]?.[key] || L.habit[n.habit]?.[key];
    if (!cells) return [];
    const home = this._words(s).home;
    return cells.map((c) => ({ text: typeof c.text === "function" ? c.text(home) : c.text, move: c.move })).filter((c) => c.text);
  }

  // One species cell or null: the pool, then the roll (drawn only for a non-empty pool), then the pick.
  _natureCell(s, key) {
    const pool = this._natureCells(s, key);
    return pool.length && Math.random() < SPECIES_LINE_ODDS ? pick(pool) : null;
  }

  // A random line, never the one this key gave last on this slide (memory only).
  _fresh(s, key, list) {
    if (!list?.length) return undefined;
    const last = (s.lastPick ??= {})[key];
    const pool = list.length > 1 ? list.filter((line) => line !== last) : list;
    const line = pick(pool.length ? pool : list);
    s.lastPick[key] = line;
    return line;
  }

  // The moves _idle picks from (P3): the common ones, and the copies this
  // pet's type adds (IDLE_ADDS). Calm leaves only mumble and pose, whatever the type.
  _idleMoves(s, hasPose, isCalm) {
    const moves = ["mumble"];
    if (hasPose) moves.push("pose", "pose");
    if (!isCalm) {
      moves.push("look", "look", "wander", "perk", "speck");
      if (s.moodState === "excited") moves.push("hop", "hop");
      moves.push(...this._typeAdds(s));
      moves.push(...this._speciesAdds(s));
      moves.push(...this._tricks(s)); // an adult's monthly tricks (E8 LS-a)
    }
    return moves;
  }

  // --- Fresh-expand E8: an adult's tricks, a best friend's line ---------------------

  // The tricks an adult has learned (one a month from its 14th day), else none.
  _tricks(s) {
    const st = this._state(s, "sensor.life_stage");
    const learned = st?.state === "adult" ? tricksBy(trickMonth(st.attributes?.age_days)) : [];
    // F7: the trick it showed someone today joins them for the day.
    const shown = s.followTrick?.day === new Date().toDateString() ? s.followTrick.move : null;
    return shown && !learned.includes(shown) ? [...learned, shown] : learned;
  }

  // The trick new this month, the first look of the month on this browser (once), or null.
  _trickNew(s, stage) {
    if (this._state(s, "sensor.life_stage")?.state !== "adult") return null;
    const month = trickMonth(stage.age_days);
    if (month < 1 || month > TRICKS.length) return null;
    return onceEver(`trick-${s.ids?.device}-${stage.generation || 1}-${month}`) ? TRICKS[month - 1] : null;
  }

  // One trick: a spin, a double perk or a look around (CSS moves; none when calm).
  _trickMove(s, move) {
    if (calm()) return;
    if (move === "spin") {
      this._animate(s, s.pet, "spin", 900);
      this._moving(s, 900);
    } else if (move === "perk2") {
      this._animate(s, s.pet, "perk", 320);
      setTimeout(() => this._animate(s, s.pet, "perk", 320), 420);
    } else {
      this._look(s, 1800);
    }
  }

  // A best friend (bond 10) on their own screen: a line at most once a week, or null.
  _favLine(s) {
    if (sharedScreen() || this._bond(s)?.level !== BOND.max) return null;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = monday.toDateString();
    const key = `hatch-fav-${s.ids?.device}`;
    try {
      if (localStorage.getItem(key) === week) return null;
      localStorage.setItem(key, week);
    } catch (err) {
      return null;
    }
    return turnPick(FAV_LINES, `${s.ids?.device}|fav`);
  }

  // --- Fresh-expand F3: the pet's own promise ------------------------------------

  // At a first look, a teen or adult's promise beat today: {line, move} or null. Day 0
  // the promise; days 4-7 the payoff once a cycle (one overwritten key per pet).
  _promiseLook(s, date = turnNow()) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (stage !== "teen" && stage !== "adult") return null;
    const device = s.ids?.device;
    const p = promiseDay(device, date);
    const paidKey = `hatch-promise-${device}`;
    if (p.day === 0) {
      return oncePerDay(`promise-${device}`, date) ? { line: PROMISE_LINES[p.topic][0], move: null } : null;
    }
    if (p.day < PROMISE_PAYOFF[0] || p.day > PROMISE_PAYOFF[1]) return null;
    try {
      if (localStorage.getItem(paidKey) === String(p.cycle)) return null;
      if (!oncePerDay(`promise-${device}`, date)) return null;
      localStorage.setItem(paidKey, String(p.cycle));
    } catch (err) {
      return null;
    }
    return { line: PROMISE_LINES[p.topic][1], move: p.topic };
  }

  // Practice, days 1-3: now and then an idle does the move small, with its line once a day.
  _promisePractice(s, date = turnNow()) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (stage !== "teen" && stage !== "adult") return false;
    const p = promiseDay(s.ids?.device, date);
    if (p.day < 1 || p.day > 3 || Math.random() >= PROMISE_PRACTICE_ODDS) return false;
    if (!oncePerDay(`promise-${s.ids?.device}`, date)) return false;
    this._line(s, FLAVOUR, PROMISE_MID, 3000);
    this._promiseMove(s, p.topic, true);
    return true;
  }

  // The topic's move: small (practice) or the payoff's (a hop 1.4x as high, a full spin,
  // two chirps). None when calm (the line still comes).
  _promiseMove(s, topic, small = false) {
    if (topic === "song") {
      this._chirp(s, "win");
      if (!small) setTimeout(() => this._chirp(s, "win"), 500);
      return;
    }
    if (calm()) return;
    if (topic === "hop") this._animate(s, s.pet, small ? "perk" : "bighop", small ? 320 : 1400);
    else this._animate(s, s.pet, small ? "pat-soft" : "spin", small ? 300 : 900);
    this._moving(s, small ? 400 : 1400);
  }

  // The moves a teen or adult's type adds to its idle list (IDLE_ADDS), in the table's order.
  _typeAdds(s) {
    const st = this._state(s, "sensor.life_stage");
    return (st?.state === "teen" || st?.state === "adult") && IDLE_ADDS[st.attributes?.personality] || [];
  }

  // The moves a teen or adult's habit adds to its idle list (SPECIES_ADDS): copies of existing
  // moves, flavour only. None without a nature.
  _speciesAdds(s) {
    const st = this._state(s, "sensor.life_stage");
    const n = nature(s.species);
    return n && (st?.state === "teen" || st?.state === "adult") && SPECIES_ADDS[n.habit] || [];
  }

  // The idle cadence's scale for this species' pace: 1 for a calm card, a baby or no nature.
  _idleScale(s) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    return !nature(s.species) || calm() || stage === "baby" || stage === "egg" ? 1 : PACE_SCALE[paceOf(s.species)];
  }

  // An egg on show rocks by itself, sparsely: once every 40-90 s, twice in a row (a double
  // rock) in the crack stage. The same `rock` a pat gives. Nothing under calm motion.
  _eggWobble(s) {
    if (!s.egg || calm()) return;
    const now = Date.now();
    if (!s.nextWobble) s.nextWobble = now + EGG_WOBBLE_MIN_MS + Math.random() * EGG_WOBBLE_SPREAD_MS;
    if (now < s.nextWobble) return;
    s.nextWobble = now + EGG_WOBBLE_MIN_MS + Math.random() * EGG_WOBBLE_SPREAD_MS;
    if (s.asleep || this._owned(s) || s.scene || s.linking || s.power || s.visitor || s.calling ||
        s.screen.classList.contains("show-status") || s.sayUntil > now || s.poseUntil > now ||
        s.movingUntil > now) return;
    const cracking = this._eggMinutes(this._state(s, "sensor.life_stage")) <= 6;
    this._animate(s, s.pet, cracking ? "rock2" : "rock", cracking ? 1200 : 600);
    this._moving(s, cracking ? 1200 : 600);
  }

  // The simple idle body moves (also a species line's move): look and wander are the persistent
  // classes with their own _moving, the rest one-shot animations. The habit moves (settle, munch,
  // rock) are CSS that was already there.
  _idleMove(s, move) {
    if (move === "look") this._look(s, 1800);
    else if (move === "wander") this._wander(s, 2200);
    else if (move === "perk") this._animate(s, s.pet, "perk", 320);
    else if (move === "settle") this._animate(s, s.pet, "settle", 2500);
    else if (move === "munch") this._animate(s, s.pet, "munch", 1500);
    else if (move === "rock") this._animate(s, s.pet, "rock", 600);
  }

  _idle(s) {
    const now = Date.now();
    const scale = s.vroom ? 1 : this._idleScale(s); // a multiplier, no draw: the Math.random order is as before
    if (!s.nextIdle) s.nextIdle = now + scale * (IDLE_MIN_MS / 2 + Math.random() * IDLE_SPREAD_MS);
    if (now < s.nextIdle) return;
    s.nextIdle = now + scale * (IDLE_MIN_MS + Math.random() * (s.vroom ? 20000 : IDLE_SPREAD_MS)); // vroom: every 20-40 s
    if (!this._free(s)) return;
    const isCalm = calm();
    // A child picks from its own extras; a later stage has at most its species.json "signature" pose
    // (N4: the adult's, two frames), the one idle thing it does that the others don't.
    const sig = s.drawn !== "child" && s.species.signature?.[s.drawn];
    const own = s.drawn === "child"
      ? Object.keys(s.species.extras || {}).filter((k) => !SHARED_POSES.has(k))
      : Array.isArray(sig) && sig.length ? ["signature"] : [];
    if (this._promisePractice(s)) return; // the promise's practice, days 1-3 (F3)
    if (this._skyReact(s, isCalm)) return; // its sky is up: a body reaction, once a day (species nature)
    // While a robot is cleaning (vroom) it is the choice: across the floor, and the pet perks.
    const move = s.vroom && !isCalm && !s.screen.classList.contains("fx-robot")
      ? "robot" : pick(this._idleMoves(s, own.length > 0, isCalm));
    if (move === "robot") {
      this._robotFx(s);
      this._animate(s, s.pet, "perk", 320);
    } else if (move === "pose") {
      const frames = s.drawn === "child" ? s.species.extras[pick(own)] : sig;
      s.poseFrames = Array.isArray(frames) ? frames : [frames];
      s.poseUntil = now + 2500;
      this._show(s, s.pet, s.poseFrames[0]);
    } else if (IDLE_BODY_MOVES.has(move)) {
      this._idleMove(s, move);
    } else if (move === "spin" || move === "perk2") {
      this._trickMove(s, move);
    } else if (move === "hop") {
      this._animate(s, s.pet, "greethop", 1400); // two happy bounces (_render clears "hop")
    } else if (move === "speck") {
      const speck = document.createElement("span");
      const rtl = Math.random() < 0.5;
      speck.className = `speck${rtl ? " rtl" : ""}`;
      s.screen.append(speck);
      this._moving(s, 2700);
      setTimeout(() => this._look(s, 1300), rtl ? 1200 : 0); // follows it across
      setTimeout(() => speck.remove(), 2700);
    } else {
      const words = this._words(s);
      const lines = this._babySet(s, `idle.${IDLE_LINES.has(s.moodState) ? s.moodState : "default"}`) || {
        sleepy: ["*yawn*", "mm... sleepy", ...(words.home ? [`my ${words.home} looks cozy...`] : [])],
        bored: ["hmm...", "*rolls around*", "I could go for a game ♪"],
        excited: ["hehe!", "wheee"],
        hungry: ["*tummy rumbles*", "a snack sounds good...", ...(words.food ? [`mmm... ${words.food}...`] : [])],
        dirty: ["ew...", "*sniff sniff*"],
      }[s.moodState] || ["♪ hm hm hm ♪", "...", "*looks around*", "la la la"];
      // A teen or adult says its type's idle lines half the time, except for the
      // body's own (sleepy, hungry, dirty, sick), which stay normal.
      const bodily = ["sleepy", "hungry", "dirty", "sick"].includes(s.moodState);
      const key = s.moodState === "bored" ? "idle_bored" : s.moodState === "excited" ? "idle_excited" : "idle";
      // Now and then a neighbour on the shelf, by name (gaps-seams 5b): flavour, nothing counted.
      const others = this._slides.filter((x) => x !== s);
      const neighbour = !bodily && !this._babyStage(s) && others.length && Math.random() < NEIGHBOUR_ODDS
        && this._linkName(pick(others));
      const normal = pick(lines);
      // Resting (R1): its own easy-going lines, unless its body has something to say.
      const restful = s.resting && !bodily && (this._babySet(s, "idle.resting") || RESTING_IDLE);
      // The species' own action line (N2) for the content and cozy idle only, with its move (not when calm).
      const said = restful || neighbour || bodily ? null
        : this._lines(s, key, normal, undefined, key === "idle" ? { nature: "idle" } : {});
      this._write(s, restful ? pick(restful)
        : neighbour ? pick(NEIGHBOUR_LINES)(neighbour) : bodily ? normal : said.text, 2500);
      s.plain = s.bubble.textContent; // idle chatter isn't read out
      if (said?.move && !isCalm) this._idleMove(s, said.move);
    }
  }

  // Hello to whoever is looking, by first name, now and then (this browser only).
  // --- Daily check-ins ----------------------------------------------------

  // Every line put straight into the bubble. With ms, it holds the bubble that
  // long; without, the hold stays as it was (a game keeps its own).
  _write(s, text, ms, cls = 0) {
    this._stopTyping(s);
    s.plain = undefined;
    s.bubble.textContent = text;
    if (ms !== undefined) s.sayUntil = Date.now() + ms;
    s.sayClass = cls; // what's held in the bubble (PR 2a)
    s.sayEntry = null;
  }

  // A line that may carry the creature's sound, typed out at its pace (and
  // babbled, if this browser wants that). Screen readers get the plain line,
  // once; the sound is hidden from them. With catch: true (lines that name
  // nobody), every third such voiced line ends with its catchphrase.
  _speak(s, said, ms = 4500, { catch: catchy = false, cls = 0 } = {}) {
    const voice = s.species?.voice;
    const sound = this._soundFor(s, said);
    if (bigOn() && ms <= 10000) ms = Math.round(ms * 1.5); // larger words are read slower (F9); a question keeps its own 60 s
    let text = said;
    if (sound && catchy && !said.includes("?")) {
      s.catchCount = (s.catchCount || 0) + 1;
      const phrase = this._state(s, "sensor.life_stage")?.attributes.catchphrase;
      if (s.catchCount % 3 === 0 && phrase && `${sound} ${said} ${phrase}`.length <= VOICE_MAX) text = `${said} ${phrase}`;
    }
    const onShow = s === this._slides[this._index];
    const isCalm = calm();
    const pace = voice?.pace;
    this._stopTyping(s);
    if (sound) s.voicedAt = Date.now();
    s.plain = sound ? `${sound} ${text}` : text;
    s.bubble.textContent = "";
    if (sound) {
      const snd = document.createElement("span");
      snd.className = "snd";
      snd.setAttribute("aria-hidden", "true");
      snd.textContent = `${sound} `;
      s.bubble.append(snd);
    }
    let typingMs = 0;
    const status = s.screen.classList.contains("show-status");
    if (onShow && !isCalm && !status && pace > 0 && this._visible && !document.hidden) {
      const chars = graphemes(text); // an emoji is never split
      const typed = document.createElement("span");
      const rest = document.createElement("span");
      rest.className = "untyped";
      rest.textContent = text;
      s.bubble.append(typed, rest);
      const start = Date.now();
      typingMs = (chars.length / pace) * 1000;
      const job = { finish: () => { typed.textContent = text; rest.textContent = ""; } };
      job.timer = setInterval(() => {
        if (s.typing !== job) return;
        // By the time gone by, so a tab that was held back catches up.
        const n = Math.min(chars.length, Math.floor(((Date.now() - start) / 1000) * pace));
        typed.textContent = chars.slice(0, n).join("");
        rest.textContent = chars.slice(n).join("");
        if (n >= chars.length) this._stopTyping(s, false);
      }, 40);
      s.typing = job;
      s.bubble.dataset.typing = "1";
      if (sound && soundsOn() && babbleOn() && this._mayPlay(s) && !this._owned(s)) { // "sounds here" is the master (UX7 F11)
        try {
          s.babbling = babble(text, voice);
        } catch (err) {
          // no WebAudio: it types quietly
        }
      }
    } else {
      s.bubble.append(text);
    }
    s.sayUntil = Date.now() + typingMs + ms;
    s.sayClass = cls;
    s.sayEntry = null;
    const plain = spoken(text);
    if (onShow && plain && s.live.textContent !== plain) s.live.textContent = plain;
  }

  // The sound a line opens with, in the mood of its first sentence ("tweet!",
  // "tweet tweet!!", "tweet?", "tweet..."), or null: no voice (or still an
  // egg), said one lately, the line has an opener of its own, or it wouldn't fit.
  _soundFor(s, text) {
    const sound = s.species?.voice?.sound;
    if (!sound || s.hatchesAt || Date.now() - (s.voicedAt || 0) < VOICE_QUIET_MS) return null;
    const line = String(text).trim();
    if (OPENERS.test(line) || line.toLowerCase().startsWith(sound)) return null;
    const mark = line.match(/!!|[!?]|\.\.\./)?.[0]; // not "…": that's a cut title
    const form = mark === "!!" ? `${sound} ${sound}!!`
      : mark === "?" ? `${sound}?`
      : mark === "..." ? `${sound}...`
      : `${sound}!`;
    return form.length + 1 + line.length > VOICE_MAX ? null : form;
  }

  // Typing done at once (the whole line shows); its babble stops too, unless
  // the line simply finished.
  _stopTyping(s, hush = true) {
    const job = s.typing;
    if (job) {
      s.typing = null;
      clearInterval(job.timer);
      job.finish();
      delete s.bubble.dataset.typing;
    }
    if (hush && s.babbling) {
      stopBabble(s.babbling);
      s.babbling = null;
    }
  }

  // Lines waiting for the bubble (a dream, the away note, a wish), said one at
  // a time once nothing else is being said. Kept unless opts.cls says otherwise.
  // still() false drops it unsaid; then() runs when it is said.
  _queue(s, text, ms = 4500, opts = {}) {
    const { cls = KEPT, at, type, still, then, ...rest } = opts;
    (s.queue ??= []).push({ text, ms, opts: rest, cls, at, type, still, then, perk: true });
  }

  // A reaction to care, at every stage: that stage's mood frame for REACT_MS and a bounded
  // move. A child has no act poses (_actPose), so it wears its mood frame (the plan's
  // rung 3, docs/plan-2026-11-02-care-reactions.md section 7); `frames` is the child's own
  // species pose (rung 1, set by _react), kept as the frames with the move added. Not over
  // a scene, a link, the low-battery gag, sleep or the egg; a game only with `inGame`.
  // Under reduced motion only the frame changes (calm() shows its first). With ms
  // (a win beat), the frame and the move both last that long.
  _reactFrames(s, kind, { inGame = false, ms, frames, variant } = {}) {
    const r = REACTIONS[kind];
    if (!r || !s.species || s.scene || s.linking || s.power ||
      s.asleep || s.egg || (this._owned(s) && !inGame)) return;
    // Not care: a child's visitor greet is the line only, and its bored look at a game's bee
    // (card-games) stays as it was. Ship A lifts the guard for care.
    if (s.drawn === "child" && (kind === "greet" || (kind === "refused" && inGame))) return;
    if (frames) { // rung 1: the species pose is already on show (_react), only the move is left
      this._reactMove(s, kind, r, { inGame, ms });
      this._poseEnd(s);
      return;
    }
    const sp = s.species;
    if (r.poseOnly && !(Array.isArray(sp.acts?.[STAGE_POSES[kind]]) || sp.acts?.[STAGE_POSES[kind]] === true)) return;
    const moodOf = (m) => {
      const out = [];
      const name = sp.moods?.includes(m) ? m : "content";
      for (let i = 1; i <= (sp.frames || 1); i++) out.push(`${s.drawn}_${name}_${i}`);
      return out;
    };
    const mood = sp.moods?.includes(r.mood) ? r.mood : "content";
    const moodFrames = moodOf(r.mood);
    const own = this._actPose(sp, s.drawn, s.speciesId, STAGE_POSES[kind], () => {
      if (s.poseFrames !== own) return;
      if (r.poseOnly) { // no mood stand-in: the reaction just ends
        s.poseUntil = 0;
        s.poseFrames = [];
        this._show(s, s.pet, s.frames?.[0]);
        return;
      }
      s.poseFrames = moodFrames; // the act's art did not load: back to the mood frames
      this._show(s, s.pet, moodFrames[0]);
    });
    if (r.poseOnly && !own) return; // the act's art failed before: nothing, a running reaction untouched
    s.poseFrames = own || moodFrames;
    s.poseUntil = Date.now() + (kind === "ready" ? READY_MS : ms ?? REACT_MS);
    // A yawn (not_sleepy): the sleepy face first, then the excited one with a hop (ship A, 5.5).
    if (variant === "yawn" && !calm() && sp.moods?.includes("sleepy")) {
      const yawn = moodOf("sleepy");
      s.poseFrames = yawn;
      this._show(s, s.pet, yawn[0]);
      setTimeout(() => {
        if (s.poseFrames !== yawn || !s.poseUntil) return;
        s.poseFrames = moodOf("excited");
        this._show(s, s.pet, s.poseFrames[0]);
        this._animate(s, s.pet, "greethop", 700);
      }, 900);
      this._poseEnd(s);
      return;
    }
    this._show(s, s.pet, s.poseFrames[0]);
    this._reactMove(s, kind, r, { inGame, ms, variant });
    this._poseEnd(s);
  }

  // The pose ends on a beat, with its prop (plan 6): a timer at poseUntil puts the mood
  // frames back, instead of waiting up to a tick (700 ms) for _frames to notice.
  _poseEnd(s) {
    const until = s.poseUntil;
    if (!until) return;
    setTimeout(() => {
      if (s.poseUntil !== until) return; // a newer pose owns the end
      s.poseUntil = 0;
      s.frame = 0;
      const frames = this._frames(s);
      if (frames.length && !s.scene) this._show(s, s.pet, frames[0]);
    }, Math.max(0, until - Date.now()) + 30);
  }

  // A care prop onto the floor (or above the head with `cls`), dropped in, then leaving in two
  // steps 300 ms before propUntil by a timer, not the tick (plan 6). `still` skips the
  // flourish under reduced motion (the global CSS rule already stills the animation).
  _propShow(s, sprite, ms, cls = "") {
    const el = s.prop;
    clearTimeout(s.propOutTimer);
    el.className = `prop ${cls}`.trim();
    el.style.animation = "none";
    void el.offsetWidth; // restart the drop
    el.style.animation = "";
    this._show(s, el, sprite);
    const until = Date.now() + ms;
    s.propUntil = until;
    s.propOutTimer = setTimeout(() => {
      if (s.propUntil === until && !calm()) el.classList.add("prop-out");
    }, Math.max(0, ms - 300));
  }

  // A choice from a short list that is never the one made last time for `key` (plan 4.7, the
  // no-repeat pick for the floor and the scenes; a bench may pin it with s.pinVariant[key]).
  // A conditional variant is filtered out of `list` before the call.
  _careVariant(s, key, list) {
    const pinned = s.pinVariant?.[key];
    if (pinned && list.includes(pinned)) return pinned;
    const last = (s.lastVariant ||= {})[key];
    const pool = list.length > 1 ? list.filter((v) => v !== last) : list;
    return (s.lastVariant[key] = pick(pool));
  }

  // The CSS move of a reaction (none under reduced motion).
  _reactMove(s, kind, r, { inGame = false, ms, variant } = {}) {
    if (calm() || !r.move) return;
    if (variant === "shake") { // a head shake: the flip, back, and the flip again
      this._look(s, 300);
      const until = s.poseUntil; // the second flip only while this reaction is still the one on show
      setTimeout(() => { if (until && s.poseUntil === until) this._look(s, 300); }, 550);
      this._moving(s, 1200);
      return;
    }
    if (variant === "spin") { // a praised adult turns right round
      this._animate(s, s.pet, "twirl", 600);
      return;
    }
    if (variant === "flop") {
      this._animate(s, s.pet, "settle", ms ?? r.ms);
      return;
    }
    const move = kind === "praised" ? this._praiseMove(s, inGame) : r.move;
    const moveMs = ms ?? r.ms;
    if (move === "wander") {
      this._wander(s, moveMs);
      return;
    }
    this._animate(s, s.pet, move, moveMs);
    if (move === "look") this._moving(s, moveMs + 250);
  }

  // "Praised" moves the way its type likes (P3): the first move the type's row
  // adds that looks happy (not mumble, which is speech, nor look, the refusal's
  // turn-away), else the plain greethop. A hop is played as greethop (_render
  // clears "hop" on every update); in a game a wander is a perk, so the pet is
  // back in the middle for the next round.
  _praiseMove(s, inGame = false) {
    const move = this._typeAdds(s).find((m) => m !== "mumble" && m !== "look") || REACTIONS.praised.move;
    if (move === "hop") return "greethop";
    return inGame && move === "wander" ? "perk" : move;
  }

  // An open question is on show (its answer buttons).
  _questionOn(s) {
    return !!s.screen?.querySelector(".askday");
  }

  // The pat's box is up: the pet on show, out and about, with nothing over it (the CSS
  // also hides it at once for the status, a game, a question, a link and the boot screen).
  _patOn(s) {
    return !!s.species && !s.reloading && !s.empty && s === this._slides[this._index] && !this._booting && !s.scene && !s.linking &&
      !s.power && !this._owned(s) && !this._questionOn(s) &&
      !s.screen.classList.contains("show-status");
  }

  // The pat's box shown or hidden (each tick, and at once where something covers it).
  // Hidden with focus on it: the focus moves to the Status button, not the page.
  _patSync(s, hide = !this._patOn(s)) {
    if (hide && !s.pat.hidden && this.shadowRoot?.activeElement === s.pat) this._card?.querySelector(".statusbtn")?.focus();
    if (hide && s.patRun) { // a scene, a slide change, the status or a game ends the run (plan 5.4)
      s.patRun = null;
      this._patLeanOff(s);
    }
    s.pat.hidden = hide;
  }

  // May a pat say its line? Not over a kept line or one waiting, a game, a question, a
  // call, the low-battery gag or a visitor (world or seasonal): then it is a wiggle only
  // (rapid pats can't cut off news, nor a pat the greeting).
  // A milestone line (the flop, the giggle) may replace the pat's own line still on show (`own`): a ladder
  // reaches its tenth pat inside the 2.5 s the first one's line is held.
  _patMayTalk(s, own = false) {
    const heldOwn = own && s.patSaid && s.sayEntry?.text === s.patSaid;
    return !s.calling && !s.power && !this._owned(s) && !this._questionOn(s) && !(s.visitUntil > Date.now()) &&
      (heldOwn || !(s.sayUntil > Date.now() && s.sayClass >= KEPT)) && !s.queue?.some((q) => lineClass(q) >= KEPT);
  }

  // A pat's line: the viewer's own, remembered as the pat's so a milestone may replace it.
  _patSay(s, text) {
    s.patSaid = text;
    this._line(s, MINE, text, PAT_MS);
  }

  // acts.pat for ~900 ms on a pat (R2), kept in s.patPoseUntil so `reacting` in the
  // next pat is as before. Not over a reaction or a call; unloadable: today's pat only. A child
  // pats with its own child_pat frames where its species.json lists "child" in acts.pat (care ship E).
  _patPose(s, reacting) {
    if (reacting || s.calling || s.asleep) return;
    const own = this._actPose(s.species, s.drawn, s.speciesId, "pat", () => {
      if (s.patPoseFrames !== own) return;
      s.patPoseUntil = 0;
      s.patPoseFrames = null;
      this._show(s, s.pet, s.frames?.[0]);
    });
    if (!own) return;
    s.patPoseFrames = own;
    s.patPoseUntil = Date.now() + PAT_POSE_MS;
    this._show(s, s.pet, own[0]);
  }

  // A pat (PR 3b, O01): card only, nothing is sent or stored. Where it lands matters (plan 5.4 of
  // docs/plan-2026-11-02-care-reactions.md): the head leans in, the body wiggles; a run of pats (s.patRun,
  // patStep) escalates: lean, a heart or a giggle, the habit move, a purr, then at the tenth a contented
  // flop and 8 s of soft pats (the first mate's call, plan 1: it saturates, it is never annoyed). A C10 line
  // by mood, at most one per PAT_COOLDOWN_MS (a milestone line may break the cooldown, not _patMayTalk).
  // Asleep: a slow perk, and a stir at the third. An egg rocks, a double rock at the third. Under reduced
  // motion the pose, the frame and the line only.
  _pat(s, e) {
    if (!this._patOn(s)) return; // let the tap reach the screen (status) or bring the slide forward
    e.stopPropagation();
    if (e.detail !== 0 && this._swiped) return; // the end of a swipe; a key after one still pats
    const now = Date.now();
    const still = calm();
    const step = patStep(s.patRun, now); // every pat counts, before the cooldown and `reacting`
    s.patRun = step.run;
    if (s.egg) return this._patEgg(s, step, still, now);
    if (s.asleep) return this._patAsleep(s, step, still, now);
    const spot = patZone(Number.isFinite(e.clientX) ? s.pat.getBoundingClientRect() : null, e.clientX, e.clientY, e.detail);
    // A reaction running plays whole: the pat still speaks, but adds no move of its own.
    const reacting = s.poseUntil > now;
    if (step.quiet) { // the 8 s after the flop: a soft pat, the cozy frame kept, no line, nothing counted
      this._tapped(s.pat);
      if (!still) {
        this._animate(s, s.pet, "pat-soft", 300);
        this._moving(s, 400);
      }
      return;
    }
    const moved = this._patMove(s, step, spot, reacting, still);
    const sleepyOrSick = ["sleepy", "sick"].includes(s.moodState);
    // The tenth and the body's third pat have a line of their own; sleepy and sick keep their one line (it's news).
    const milestone = !sleepyOrSick && (step.flop ? "flop" : step.n === 3 && spot.zone === "body" ? "ticklish" : null);
    const cooling = now - (s.patAt || 0) < PAT_COOLDOWN_MS;
    if ((cooling && !milestone) || !this._patMayTalk(s, !!milestone)) {
      this._tapped(s.pat);
      if (!still && !reacting && !moved) {
        this._animate(s, s.pet, "pat-soft", 300);
        this._moving(s, 400);
      }
      return;
    }
    this._tapped(s.pat, reacting || moved === "anim" ? undefined : s);
    s.patAt = now;
    if (milestone) {
      this._patSay(s, this._fresh(s, `pat:${milestone}`, PAT_RUN_LINES[milestone]));
      return;
    }
    // Sleepy and sick keep their one line (it's news); otherwise the type's own words in
    // turn with the mood's (P-a), and now and then the sweet spot (P-b): never counted, and out of the
    // ladder from the fourth pat (the habit move and the purr own that beat).
    const plain = !sleepyOrSick;
    const lastSaid = (s.lastPick ??= {})["pat:said"];
    if (plain && step.n <= PAT_SPOT_MAX_N && this._state(s, "sensor.life_stage")?.state !== "baby" && lastSaid !== PAT_SPOT && Math.random() < PAT_SPOT_ODDS) {
      s.lastPick["pat:said"] = PAT_SPOT;
      this._patSay(s, PAT_SPOT);
      if (!still && !reacting) {
        this._animate(s, s.pet, "greethop", 1400);
        this._bondHearts(s);
      }
      return;
    }
    const mood = PAT_LINES[s.moodState] || PAT_LINES.content;
    this._patSay(s, plain ? this._lines(s, "pat", mood, undefined, { fresh: true }).text : mood);
  }

  // The step a pat has reached on the ladder (the table of plan 5.4); returns "anim" if a class move
  // played, "lean" if only a pose or a lean did, else "". `reacting` suppresses everything but the
  // flop (it is the run's one saturation and must play; a newer pose wins). The pet may be a child:
  // no acts.pat, so the lean and the wiggle are on its frame, and its extras take the habit step.
  _patMove(s, { n, flop }, spot, reacting, still) {
    if (flop) return this._patFlop(s, still);
    if (reacting) return "";
    const head = spot.zone === "head";
    if (n <= 3) {
      if (!head) {
        if (n === 3) { // ticklish: the excited frame and a giggle (the line is _pat's)
          this._reactFrames(s, "tickled");
          return "anim";
        }
        if (still) return "";
        this._animate(s, s.pet, "rock2", 1250);
        this._moving(s, 1300);
        return "anim";
      }
      this._patPose(s, false);
      const leaned = this._patLean(s, spot.side, n === 1 ? PAT_LEAN_MS : PAT_LEAN_LONG_MS);
      if (n === 3 && !still) this._bondHearts(s, "bondhearts", 1);
      return leaned || n === 1 ? "lean" : "";
    }
    if (s.calling) return "";
    this._patLeanOff(s); // a habit move may wander, and a purr is still: the lean is let go
    if (n <= 6) { // the habit move: the cheer act and the type's move; a child its own pose where it has one
      const extra = s.drawn === "child" && s.species?.extras?.[s.species?.reactions?.praise];
      const frames = extra ? [].concat(extra) : null;
      if (frames) {
        s.poseFrames = frames;
        s.poseUntil = Date.now() + REACTIONS.praised.ms;
        this._show(s, s.pet, frames[0]);
      }
      this._reactFrames(s, "praised", { ms: REACTIONS.praised.ms, frames });
      return "anim";
    }
    this._reactFrames(s, "patted", { ms: REACTIONS.patted.ms });
    return "anim";
  }

  // The tenth pat: a contented flop (the cozy frame, settle 2.5 s) and the cozy frame kept for the quiet.
  _patFlop(s, still) {
    if (s.calling) return "";
    this._patLeanOff(s);
    this._reactFrames(s, "flopped", { ms: REACTIONS.flopped.ms });
    if (s.poseUntil) { // the frame outlasts the settle: the 8 s the run is quiet
      s.poseUntil = Date.now() + PAT_QUIET_MS;
      this._poseEnd(s);
    }
    return still ? "" : "anim";
  }

  // The lean (plan 5.4): +-5deg about the feet toward the tapped side, held while pats keep coming and
  // let go `holdMs` after the last. `rotate` is one property (plan 4.9): none while .look or a wander is
  // on the pet, nor under reduced motion, nor for a pat with no side (a key). Returns whether it leans.
  _patLean(s, side, holdMs) {
    const c = s.pet.classList;
    if (calm() || !side || c.contains("look") || [...c].some((k) => k.startsWith("wander-"))) return false;
    clearTimeout(s.leanTimer);
    clearTimeout(s.leanRelTimer);
    c.remove("lean-rel");
    c.remove(side === "l" ? "lean-r" : "lean-l");
    c.toggle("lean-sick", s.moodState === "sick"); // slower, in and out
    c.add(side === "l" ? "lean-l" : "lean-r");
    s.leanTimer = setTimeout(() => this._patLeanOff(s), holdMs);
    this._moving(s, holdMs + 300); // the pet is off true: no idle look or wander, no hat placed, till it lets go
    return true;
  }

  // Let the lean go, over .3 s (.45 s when sick), then drop its classes.
  _patLeanOff(s) {
    clearTimeout(s.leanTimer);
    const c = s.pet?.classList;
    if (!c || !(c.contains("lean-l") || c.contains("lean-r"))) return;
    clearTimeout(s.leanRelTimer);
    c.add("lean-rel");
    c.remove("lean-l", "lean-r");
    s.leanRelTimer = setTimeout(() => c.remove("lean-rel", "lean-sick"), c.contains("lean-sick") ? 450 : 300);
  }

  // An asleep pat: the slow perk as ever; the third stirs it (the sleepy face for 500 ms, a small turn)
  // and it stays asleep; "mm..." now and then (1 in 4, through the cooldown and _patMayTalk).
  _patAsleep(s, step, still, now) {
    this._tapped(s.pat);
    if (!still) {
      this._animate(s, s.pet, "pat-slow", 1100);
      this._moving(s, 1100);
    }
    if (step.n !== 3 || step.quiet) return;
    const sp = s.species;
    if (sp?.moods?.includes("sleepy")) {
      const frames = [];
      for (let i = 1; i <= (sp.frames || 1); i++) frames.push(`${s.drawn}_sleepy_${i}`);
      s.poseFrames = frames;
      s.poseUntil = now + 500;
      this._show(s, s.pet, frames[0]);
      this._poseEnd(s);
    }
    if (!still) this._look(s, 350);
    if (Math.random() < 0.25 && now - (s.patAt || 0) >= PAT_COOLDOWN_MS && this._patMayTalk(s)) {
      s.patAt = now;
      this._patSay(s, PAT_RUN_LINES.asleep[0]);
    }
  }

  // An egg's pat: a rock and one "♪" (F2); the third pat of a run a double rock (the cracking egg's own
  // `rock2`), and the egg's wiggle frames where the species has them. No bond, no server call.
  _patEgg(s, step, still, now) {
    this._tapped(s.pat);
    const third = step.n === 3 && !step.quiet;
    const wiggle = third && s.species?.egg?.wiggle;
    if (wiggle?.length) {
      s.poseFrames = wiggle;
      s.poseUntil = now + 1200;
      this._show(s, s.pet, wiggle[0]);
      this._poseEnd(s);
    }
    if (!still) {
      this._animate(s, s.pet, third ? "rock2" : "rock", third ? 1200 : 600);
      this._moving(s, third ? 1200 : 600);
    }
    if (now - (s.patAt || 0) >= PAT_COOLDOWN_MS || !s.sayUntil || now > s.sayUntil) {
      s.patAt = now;
      this._chirp(s, "tap");
      this._line(s, MINE, EGG_PAT_LINE, PAT_MS);
    }
  }

  // May a line of this class go into the bubble now? Only a higher class
  // interrupts what's held, and nothing below kept interrupts a game or a
  // question. A line waiting in the queue at this class or above goes first.
  // A call holds lines below kept, except its own news (C6, which comes with the sick call).
  _mayInterrupt(s, cls, type) {
    if (cls >= MINE) return true;
    if (this._owned(s) || this._questionOn(s) || (s.calling && cls < KEPT && type !== "became_sick")) return false;
    if (s.queue?.some((q) => lineClass(q) >= cls)) return false;
    return !(s.sayUntil > Date.now()) || cls > (s.sayClass || 0);
  }

  // One classed line (PR 2a): said now if it may interrupt, else it waits in
  // the queue (kept, care, beats) or, flavour, waits a little or is dropped.
  // then runs when it is said (its sparkle, chirp, move); at is a kept
  // moment's time, noted as said for the catch-up.
  _line(s, cls, text, ms = 4500, { then, at, write, type, perk, still, ...opts } = {}) {
    const entry = { text, ms, cls, then, at, write, type, perk, still, opts };
    // A kept line for a slide that is not on show waits in its queue (said, and
    // marked said, when the slide comes to show) instead of being spent unseen.
    const offShow = cls === KEPT && s !== this._slides?.[this._index];
    if (!offShow && this._mayInterrupt(s, cls, type)) {
      this._sayLine(s, entry);
      return;
    }
    const now = Date.now();
    if (cls === FLAVOUR) {
      // During a kept line, a game or a question (or with a kept line next): dropped.
      if (this._owned(s) || this._questionOn(s) || (s.sayUntil > now && s.sayClass >= KEPT) ||
        s.queue?.some((q) => lineClass(q) >= KEPT)) return;
      const wait = Math.max(0, (s.sayUntil || 0) - now) +
        (s.queue || []).reduce((n, q) => n + (q.ms || 0), 0);
      if (wait > FLAVOUR_WAIT_MS) return;
      entry.dropAt = now + FLAVOUR_WAIT_MS;
    }
    (s.queue ??= []).push(entry);
    if (offShow) this._capOffShow(s);
  }

  // A slide that is not on show keeps at most FIRST_LOOK_LINES kept moments
  // waiting (the newest), and one care miss (the newest), as the catch-up
  // merges them. The dropped ones are older than what stays: saying the newer
  // marks them said, so the catch-up never brings them back.
  _capOffShow(s) {
    const time = (q) => new Date(q.at).getTime() || 0;
    const kept = s.queue.filter((q) => q.cls === KEPT && q.at).sort((a, b) => time(b) - time(a));
    const drop = new Set();
    let miss = false;
    const rest = [];
    for (const q of kept) {
      if (q.type === "care_miss") {
        if (miss) { drop.add(q); continue; }
        miss = true;
      }
      rest.push(q);
    }
    rest.slice(FIRST_LOOK_LINES).forEach((q) => drop.add(q));
    if (drop.size) s.queue = s.queue.filter((q) => !drop.has(q));
  }

  // Into the bubble: a queued line or one said at once.
  _sayLine(s, q) {
    const now = Date.now();
    const cls = lineClass(q);
    const was = s.sayEntry;
    if (cls >= MINE && was && lineClass(was) === KEPT && s.sayUntil > now &&
      now - was.shownAt < was.ms / 2) {
      // The viewer's own press cut off a kept line early: it's said again after.
      // For what is left of its time, and a question's only while it is still open (F15).
      const left = was.shownAt + was.ms - now;
      if (left > 0 && (!was.ask || this._questionOn(s))) {
        (s.queue ??= []).unshift({ ...was, ms: left, then: null, shownAt: undefined });
      }
    }
    if (q.write) this._write(s, q.text, q.ms, cls);
    else this._speak(s, q.text, q.ms, { ...q.opts, cls });
    s.sayEntry = { ...q, shownAt: now };
    if (q.perk) this._animate(s, s.pet, "perk", 320);
    if (q.at && cls === KEPT) this._markSaid(s, q.at);
    q.then?.();
  }

  _sayQueued(s) {
    const now = Date.now();
    if (!s.queue?.length) return;
    s.queue = s.queue.filter((q) => !(q.dropAt < now)); // flavour that waited too long
    // Asleep: kept lines wait until it's up (they were said once, on the
    // server's side); only a question is dropped, it may come another day. A
    // beat ("good night...") or flavour may still be said, as it would have been.
    if (s.asleep && s.queue.some((q) => q.ask)) this._clearAsk(s);
    if (!s.queue.length || s.sayUntil > now || this._owned(s) || s.power || s.screen.classList.contains("show-status")) return;
    let ready = s.asleep ? s.queue.filter((q) => lineClass(q) < KEPT) : s.queue;
    // A call's own words hold: while it's calling, only a kept line (not a wish) is said (2c).
    if (s.calling) ready = ready.filter((q) => q.type === "became_sick" || (lineClass(q) >= KEPT && q.type !== "wish"));
    if (!ready.length) return;
    // The highest class first; in a class, the queue's order. A line whose
    // still() says it no longer fits (e.g. 2b's C6 once it's well) is dropped.
    const top = Math.max(...ready.map(lineClass));
    const next = ready.find((q) => lineClass(q) === top);
    s.queue.splice(s.queue.indexOf(next), 1);
    if (next.still && !next.still()) {
      this._sayQueued(s);
      return;
    }
    this._sayLine(s, next);
  }

  // hatch-seen-<device>: { seen, said }. seen is when this device last looked
  // (its own clock, for the away note); said is the newest kept moment's at
  // this browser has said (the server's clock, for the catch-up). An older card
  // stored seen alone, as a number.
  _seenRead(device) {
    try {
      const raw = localStorage.getItem(`hatch-seen-${device}`);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (typeof v === "number") return { seen: v, said: null };
      return { seen: Number(v?.seen) || 0, said: typeof v?.said === "number" ? v.said : null };
    } catch (err) {
      return null; // no storage, or not ours
    }
  }

  _seenWrite(device, patch) {
    try {
      const was = this._seenRead(device) || {};
      localStorage.setItem(`hatch-seen-${device}`, JSON.stringify({ ...was, ...patch }));
    } catch (err) {
      // no storage
    }
  }

  // A kept moment was said here: the catch-up won't say it (or anything older) again.
  _markSaid(s, at) {
    const t = new Date(at).getTime();
    const device = s.ids?.device;
    if (!Number.isFinite(t) || !device) return;
    const said = this._seenRead(device)?.said;
    if (said === null || said === undefined || t > said) this._seenWrite(device, { said: t });
  }

  // A new look on the same page (fresh-moment 1): the greeting, the first look, the visit
  // and the wish mention start over; each line's own once-key still stops a double. A
  // tab back from hiding also says a gift waiting, and leaves what happened meanwhile
  // to the catch-up (no live replay of moments, as _forget).
  _newLook(slides, { resumed = false } = {}) {
    for (const x of slides) {
      x.lookedFirst = x.greeted = false;
      x.visitedAt = x.nextWish = 0;
      if (resumed) {
        x.giftAgain = true;
        x.lastMoment = x.lastLogAt = undefined;
      }
    }
  }

  // A tab just back after a long while, its states not yet fresh (fresh-moment 1).
  _resumeHeld() {
    return !!this._resumedAt && Date.now() - this._resumedAt < RESUME_HOLD_MS;
  }
}

