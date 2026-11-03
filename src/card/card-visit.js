class HatchPetCardVisit extends HatchPetCardLooks {
  // The kept moments since said that this look should catch up: [line, at],
  // oldest first, the newest room of them. The public list, and on a personal
  // screen the viewer's own (s.privateMoments); never friend_home or tucked_in
  // (CATCHUP_SKIP) and never flavour; at most one care_miss.
  _catchUp(s, said, room, { news = false } = {}) {
    if (room <= 0) return [];
    const pub = (this._state(s, "sensor.last_care")?.attributes.moments || []).filter((m) => !CHANNEL_ONLY.has(m.type));
    const own = sharedScreen() ? [] : s.privateMoments || [];
    // Already waiting in the queue (a kept line queued while off show): not said twice.
    const waiting = new Set((s.queue || []).filter((q) => q.at).map((q) => new Date(q.at).getTime()));
    const seen = new Set();
    const missed = [...pub, ...own]
      .filter((m) => m?.type && MOMENT_CLASS[m.type] === KEPT && !CATCHUP_SKIP.has(m.type) &&
        new Date(m.at).getTime() > said && !waiting.has(new Date(m.at).getTime()) && !seen.has(momentKey(m)) && seen.add(momentKey(m)))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    // Back after days (E8 A-a): what happened goes before the care misses.
    if (news) missed.sort((a, b) => (a.type === "care_miss") - (b.type === "care_miss"));
    const out = [];
    let miss = false;
    for (const m of missed) {
      if (out.length >= room) break;
      // Care misses say one line between them (the newest), leaving room for the rest.
      if (m.type === "care_miss" && miss) continue;
      if (m.type === "care_miss") miss = true;
      const text = this._catchUpLine(s, m);
      if (text) out.push([text, m.at, m.type]);
    }
    return out.reverse();
  }

  // A missed milestone in the words of the next look (C5), or its own line.
  _catchUpLine(s, m) {
    if (m.type === "stage_changed") {
      if (m.stage === "baby" || !m.stage) return null; // hatching says hello
      const a = /^[aeiou]/.test(m.stage) ? "an" : "a";
      return this._lines(s, "catchup_stage", `guess what! i'm ${a} ${m.stage} now!`).text;
    }
    if (m.type === "trait_learned") {
      return this._lines(s, "catchup_trait", `I learned something: ${String(m.trait).replaceAll("_", " ")}!`).text;
    }
    if (m.type === "hatched") return this._lines(s, "catchup_hatched", "hello! i hatched while you were away").text;
    // The rest say what they would have said then (nothing else happens).
    const said = [];
    this._moment(s, m, said);
    return said[0] || null;
  }

  // "while you were out, I napped, watched the rain and had a snack!": up to
  // three things from the moments and care since the device last looked.
  _awayNote(s, since) {
    const bits = this._dayBits(s, since);
    // A nap alone isn't news (fresh-moment 2, owner Q2): no note.
    if (bits.every((b) => b === "napped")) return null;
    const list = bits.slice(0, 2); // two at most: a bubble on a 330 px card
    return `while you were out, I ${list.join(" and ")}!`;
  }

  // What the pet did since then, newest first, as bits ("watched TV"): its moments, the
  // finds while shown, then care unless care is false (the away note's, and the
  // evening's today line's, which leaves care out).
  _dayBits(s, since, care = true) {
    const lastCare = this._state(s, "sensor.last_care")?.attributes || {};
    const after = (at) => new Date(at).getTime() > since;
    const bits = [];
    const add = (b) => { if (b && !bits.includes(b)) bits.push(b); };
    const MOMENT_BITS = {
      fell_asleep: "napped", woke_up: "napped", watching: "watched TV", listening: "listened to music",
      tv_on: "watched TV", music_on: "listened to music", // the public stand-ins, with no title
      news: "heard some news", sunset: "watched the sunset", wish_granted: "got my wish",
      trait_learned: "learned something new", first_snow: "saw the first snow",
      first_warm: "felt the first warm day", first_fog: "saw the first fog", // E12 Se-a
      robot_out: HOUSE_LINES.bits.robot, robot_home: HOUSE_LINES.bits.robot, // H4
      appliance_done: HOUSE_LINES.bits.machine, // H6
    };
    const houseBit = (m) => HOUSE_LINES.bits[Object.hasOwn(HOUSE_CATEGORY, m.category ?? "") ? HOUSE_CATEGORY[m.category].bit : ""]; // H8
    const WEATHER_BITS = { rain_started: "watched the rain", snow_started: "saw snow", rainbow: "saw a rainbow", sun_out: "sunbathed" };
    const CARE_BITS = { feed: "had a meal", snack: "had a snack", play: "played", game: "played a game", clean: "had a bath", chore_treat: "got a chore treat" };
    let found = 0; // "found <a find>": one a find (V8), newest first, FOUND_BITS at most
    for (const m of [...(lastCare.moments || [])].reverse()) {
      if (!after(m.at)) continue;
      if (m.type === "found") {
        if (findsShown() && found < FOUND_BITS && foundBit(this._worlds, m)) {
          found++;
          add(foundBit(this._worlds, m));
        }
        continue;
      }
      add(m.type === "weather" ? WEATHER_BITS[m.change]
        : m.type === "house_answered" ? HOUSE_LINES.bits[HOUSE_REQUEST[m.request]]
        : m.type === "season_start" ? Object.hasOwn(SEASON_START_BITS, m.season ?? "") && SEASON_START_BITS[m.season]
        : m.type === "house_moment" ? houseBit(m) : MOMENT_BITS[m.type]);
    }
    for (const e of care ? [...(lastCare.log || [])].reverse() : []) {
      if (after(e.at) && (e.result === "ok" || e.result === "won" || e.result === "lost")) add(CARE_BITS[e.action]);
    }
    return bits;
  }

  // The evening's line about the pet's own day (fresh-moment 4, owner Q4), a teen's or
  // adult's: today's wish come true (unless this look's catch-up just told it), else a
  // visitor seen here today, else the newest of today's moments as a bit (not a nap, no
  // care), else its type's line. Names nobody and never an open wish, so a shared
  // screen gets it too. null: nothing to say (the away note's turn).
  _todayLine(s, wishTold = false) {
    const life = this._state(s, "sensor.life_stage");
    if (life?.state !== "teen" && life?.state !== "adult") return null;
    const wish = life.attributes?.wish;
    const toldLive = usedToday(`todaywish-${s.ids?.device}`); // said live already (E6 W-b)
    if (wish?.granted && !wishTold && !toldLive && TODAY_WISH[wish.kind]) return TODAY_WISH[wish.kind];
    const seen = this._visitSeen(s);
    if (seen) return `a ${seen} visited me today ♪`;
    const midnight = new Date().setHours(0, 0, 0, 0);
    const bit = this._dayBits(s, midnight, false) // a find's bit, once shown, only if the line fits
      .find((b) => b !== "napped" && b !== "got my wish" && `today I ${b}! ♪`.length <= 40);
    if (bit) return `today I ${bit}! ♪`;
    const type = this._persona(s);
    return type ? dailyPick(type.today, `${s.ids?.device}|today`) : null;
  }

  // The evening, for the today line: from TODAY_FROM_HOUR on this device's clock.
  _evening() {
    return new Date().getHours() >= TODAY_FROM_HOUR;
  }

  // The name of today's world visitor if it came by live on this device (for the today
  // line), else null. One key per device, overwritten: nothing piles up.
  _visitSeen(s) {
    try {
      const seen = JSON.parse(localStorage.getItem(`hatch-visitseen-${s.ids?.device}`) || "null");
      return seen?.day === this._visitDay(s).toDateString() ? seen.name : null;
    } catch (err) {
      return null;
    }
  }

  _hourHello(first) {
    const hour = new Date().getHours();
    return !first
      ? (hour < 12 ? "morning!" : hour < 18 ? "hi!" : "evening!")
      : hour < 12 ? `morning, ${first}!` : hour < 18 ? `hi, ${first}!` : `evening, ${first}!`;
  }

  // Today's greeting is said already (the hatch's hello): no "hi, <name>!" for this person on this device.
  _greetSpent(s) {
    s.greeted = true;
    try {
      localStorage.setItem(`hatch-greet-${this._hass.user?.id}-${s.ids?.device}`, String(Date.now()));
    } catch (err) {
      // no storage: once per page load, as _greet
    }
  }

  _greet(s) {
    if (s.greeted || !this._channelHeard(s) || !this._free(s)) return;
    // An egg doesn't talk (C15'): the greeting waits for the hatch, and its key stays unwritten (F2).
    if (this._state(s, "sensor.life_stage")?.state === "egg") return;
    s.greeted = true;
    const user = this._hass.user;
    const bond = this._bond(s);
    const level = bond?.level || 0;
    const nickname = level >= BOND.nickname ? bond.nickname : null;
    const shared = sharedScreen(); // no names on a shared screen
    const first = shared ? null : short(user?.name?.trim().split(/\s+/)[0], 16) || nickname;
    if (!first && !shared) return;
    const key = `hatch-greet-${user?.id}-${s.ids?.device}`;
    try {
      if (Date.now() - Number(localStorage.getItem(key) || 0) < GREET_EVERY_MS) return;
      localStorage.setItem(key, String(Date.now()));
    } catch (err) {
      // no storage (private window): greet anyway, once per page load
    }
    const hello = this._hourHello(first);
    // Baby talk (never on a shared screen, so only with a name): each set swaps
    // on its own, and names go in after the choice.
    const baby = (key, name, normal) => this._babySet(s, key)?.map((line) => line(name)) || normal;
    const lines = first ? baby("greet", first, [hello, `${first}!! hi!`, hello]) : [hello, "hi hi!", hello];
    if (level >= BOND.warm) lines.push(...baby("greet.warm", first, [`${first}! I missed you ♥`, `yay, ${first}'s here!`]));
    if (nickname) lines.push(...baby("greet.nickname", nickname, [`hi, ${nickname}!`, `${nickname}!! ♥`, `there's my ${nickname}!`]));
    // Its personality's hellos, filled the same way: half the time, one of
    // those. A shared screen gets the nameless ones; the bond lines need the
    // viewer's own bond (none on a shared screen), never the level alone.
    const type = this._persona(s);
    const own = !type ? [] : first ? type.hello.map((line) => line(first)) : [...type.hello_shared];
    if (type && bond && first && bond.level >= BOND.warm) own.push(...type.hello_warm.map((line) => line(first)));
    if (type && bond && first && bond.level >= BOND.hearts) own.push(...type.hello_hearts.map((line) => line(first)));
    // Resting (R1): now and then it was daydreaming; otherwise the usual hello.
    const daydream = s.resting && Math.random() < REST_DAYDREAM_ODDS
      && this._lines(s, "rest.visit", REST_LINES.visit).text;
    this._speak(s, daydream || pick(own.length && Math.random() < 0.5 ? own : lines), 4000);
    const isCalm = calm();
    if (level >= BOND.hop && !isCalm) this._animate(s, s.pet, "greethop", 1400);
    else this._animate(s, s.pet, "perk", 320);
    if (level >= BOND.hearts && !isCalm) this._bondHearts(s);
  }

  // The creature's own words (food, home), for its stage (a moth isn't a
  // caterpillar): species.json "words", with per-stage overrides.
  _words(s) {
    const words = s.species?.words || {};
    const stage = this._state(s, "sensor.life_stage")?.state;
    return { food: words.food, home: words.home, ...(words[stage] || {}) };
  }

  // The viewer's own bond with this pet: {level, nickname?, favourite?} or null.
  _bond(s) {
    if (sharedScreen()) return null; // nobody's bond on a shared screen
    return s.mine?.bond || null;
  }

  // Tell the pet who's looking in (for the bond, and a "come say hi" wish).
  _visit(s) {
    const id = s.ids?.["sensor.life_stage"];
    // Not before the first look has run (it needs the creature and the
    // channel's first word): it says what's queued.
    if (!id || !s.species || !this._channelHeard(s) || !this._hass.user || sharedScreen() ||
      Date.now() - (s.visitedAt || 0) < VISIT_EVERY_MS || this._resumeHeld()) return;
    s.visitedAt = Date.now();
    // Only kept lines count: a waiting beat or flavour may yet be dropped.
    const queued = Math.min((s.queue || []).filter((q) => lineClass(q) >= KEPT).length + (s.following ? 1 : 0), 6);
    this._hass.callService("virtual_pet", "visit", { entity_id: id, queued }, undefined, false, true)
      .then((res) => {
        const reply = res?.response || {};
        if (s.ids?.["sensor.life_stage"] !== id) return; // the slide shows another pet now
        if (reply.counted === false) {
          // Not counted (it was asleep, or too soon): try again in a few minutes,
          // so the morning's lines come soon after it wakes.
          s.visitedAt = Date.now() - VISIT_EVERY_MS + VISIT_RETRY_MS;
        }
        if (sharedScreen()) return; // switched while the reply was on its way
        if (typeof reply.my_day === "boolean") this._myDay = reply.my_day;
        if (typeof reply.baby_talk === "boolean") setBabyTalk(this._hass.user?.id, reply.baby_talk);
        if (typeof reply.birthday_kept === "boolean") this._birthdayKept = reply.birthday_kept;
        if (typeof reply.birthday_phone === "boolean") this._birthdayPhone = reply.birthday_phone;
        // Memory (plan M1a): two booleans, as the channel's mine has them; never what is kept.
        if (typeof reply.memory_on === "boolean") this._memoryOn = reply.memory_on;
        if (typeof reply.memory_allowed === "boolean") s.memoryAllowed = reply.memory_allowed; // this pet's own option
        if (reply.follow === 1) this._followOk = true; // F1: it takes typed text and follow-ups
        (reply.notes || []).forEach((note) => this._note(s, note, !!reply.made_room));
        const ask = reply.ask;
        if (QUESTIONS[ask] && !s.asking) {
          s.asking = true;
          (s.queue ??= []).push({ text: this._askLine(ask), ms: ASK_MS, ask: true, cls: KEPT, perk: true, then: () => this._ask(s, ask, id) });
        }
      })
      .catch(() => {
        // an older integration has no visit: no bond yet, nothing else changes
      });
  }

  // Something the pet has to tell only the viewer (from the visit).
  _note(s, note, madeRoom = false) {
    // F2 (FM Q4 A): with the dream's pick on the sensor, the first look tells everyone its
    // story once a day here (dream-<device>). The asker's note carries it: the story too
    // when the look had no room for it (the key unspent, so spent now), then the tail
    // ("you": their own story, then the tail). Nobody else's note repeats it.
    const picked = note.kind === "dream" && this._state(s, "sensor.life_stage")?.attributes?.dream;
    if (picked?.kind === "picked" && picked.pick === note.pick && Object.hasOwn(DREAM_STORIES, note.pick)) {
      if (!note.yours) return;
      const device = s.ids?.device;
      const untold = oncePerDay(`dream-${device}`);
      if (untold && note.pick !== "you") {
        this._queue(s, this._dreamStory(s, note.pick), 5000, { personal: true });
        this._dreamStoryTold(s, note.pick);
      }
      if (note.pick === "you") this._queue(s, turnPick(this._storyList(s, "you"), `${device}|dream|you`), 5000, { personal: true });
      this._queue(s, turnPick(DREAM_TAIL, `${device}|dreamtail`), 4000, { personal: true });
      return;
    }
    let line = NOTES[note.kind]?.(note, s.ids?.device);
    if (!line) return;
    if (note.kind === "fav_weather") oncePerDay(`favweather-said-${s.ids?.device}`); // the sky reaction skips this day (species nature)
    if (CELEBRATION_NOTES.has(note.kind) && madeRoom && s.queue) {
      // The look was full and the server made room for a celebration: it
      // takes the away note's place (if that isn't said yet).
      const away = s.queue.findIndex((q) => q.opts?.away);
      if (away >= 0) s.queue.splice(away, 1);
    }
    if (note.kind === "your_birthday") {
      const bond = this._bond(s);
      const name = (bond?.level >= BOND.nickname && bond.nickname) || short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
      if (!note.quiet && name) line = `happy birthday, ${name}!! ♥`;
      (s.queue ??= []).push({ text: line, ms: 5000, personal: true, cls: KEPT, perk: true, then: () => {
        if (!note.quiet) this._chirp(s, "birthday");
        this._sparkle(s);
      } });
      return;
    }
    if (note.kind === "up_early") { // said while it sleeps: not queued behind its sleep
      this._speak(s, line, 5000);
      return;
    }
    this._queue(s, line, 5000, { personal: true });
    if (note.kind === "friends_for") {
      this._sparkle(s);
      if (!calm()) this._bondHearts(s);
    }
  }

  // E14: the week strip, oldest first, from the life stage sensor's `week`: no fixed seven
  // slots, no blanks, no counts. Each day's label says what its glyphs show.
  _weekStrip(s) {
    const week = this._state(s, "sensor.life_stage")?.attributes.week;
    if (!Array.isArray(week)) return "";
    const list = visitorList(this._worlds?.[s.worldKey]);
    const cells = week.map((c) => {
      if (!c || typeof c.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.day)) return "";
      const v = findsShown() && c.visit && list.find((x) => x.id === c.visit && x.name);
      const words = [c.dream && WEEK_WORD.dream, WEEK_WORD[c.weather], v && `the ${v.name}`].filter(Boolean);
      if (!words.length) return "";
      const day = DAY_SHORT[new Date(`${c.day}T12:00`).getDay()];
      const icons = (c.dream ? "✦" : "") + (WEEK_GLYPH[c.weather] || "") +
        (v ? `<img src="${BASE}/ui/visitor_${s.worldKey}_${v.id}_1.png?v=${VERSION}" alt="">` : "");
      return `<span class="wday" role="listitem" aria-label="${escape(`${day}: ${words.join(", ")}`)}">` +
        `<b aria-hidden="true">${day}</b><span aria-hidden="true">${icons}</span></span>`;
    }).filter(Boolean);
    return cells.length ? `<div class="jweek" role="list" aria-label="this week">${cells.join("")}</div>` : "";
  }

  // A question's line from the visit's ask. (The big day's evening comes as its follow
  // beat now, audit s2635 H1, which names it as the beats do; here only this browser's copy.)
  _askLine(kind) {
    const it = kind === "big_how" && this._followIt({ kind: "big_day" }, false);
    return it ? BIG_DAY.howText(it) : QUESTIONS[kind].q;
  }

  // While it asks, the pet steps back (F8): up so its feet stand on the chips' top, smaller to fit
  // under the bubble, or, when the bubble and the chips leave no room, beside the bubble. Measured
  // once the chips and the line are on show; the CSS (--ask-dx/dy/f) does the move, in 2 steps.
  _askPlace(s, box) {
    const scr = s.screen;
    const pet = s.pet;
    if (!pet || pet.offsetParent !== scr || !scr.clientHeight) return;
    scr.style.removeProperty("--ask-bw");
    box.classList.remove("nopet");
    const k = Number(pet.style.scale) || 1;
    const W = scr.clientWidth;
    const petH = pet.offsetHeight * k;
    const petW = pet.offsetWidth * k;
    const stand = box.offsetTop - 4; // where its feet go
    const bubble = s.bubble.offsetHeight ? s.bubble : null;
    const under = bubble ? bubble.offsetTop + bubble.offsetHeight + 2 : 0;
    let f = Math.min(0.9, (stand - under) / petH);
    let dx = 0;
    if (f < 0.6) { // no room under the bubble: beside it, in a column of its own (UX7 F1)
      // Never above the screen: the pet's top stays 2 px down, so it may shrink under .4.
      f = Math.min(0.9, Math.max(0.25, (stand - 2) / petH));
      const w = petW * f;
      const inset = W * (scr.closest(".porthole") ? 0.09 : 0.04); // the porthole's rim eats the right edge
      dx = W - inset - w / 2 - W / 2;
      if (bubble) { // the bubble wraps in what is left of the row, so the two never overlap
        // The bubble's max-width is its text's: its padding and border come on top.
        const chrome = () => bubble.offsetWidth - parseFloat(getComputedStyle(bubble).width);
        const room = (taken) => `${Math.max(60, Math.floor(taken - bubble.offsetLeft - chrome()))}px`;
        scr.style.setProperty("--ask-bw", room(W - inset - w - 6));
        // Wrapped, the bubble may still reach down into the chips: then there is no room for the pet
        // at all. Its head goes in the bubble instead, and the bubble takes its whole width again.
        if (bubble.offsetTop + bubble.offsetHeight > box.offsetTop - 2 || f < 0.3) {
          box.classList.add("nopet");
          scr.style.setProperty("--ask-bw", room(W - inset));
          this._headCrop(s, bubble, 14, 3);
          dx = 0;
        }
      }
    }
    const dy = Math.min(0, stand - (pet.offsetTop + pet.offsetHeight));
    scr.style.setProperty("--ask-dx", `${Math.round(dx)}px`);
    scr.style.setProperty("--ask-dy", `${Math.round(dy)}px`);
    scr.style.setProperty("--ask-f", f.toFixed(2));
  }

  // A question with its answers as buttons (the line is already in the bubble).
  _ask(s, kind, entity = s.ids?.["sensor.life_stage"]) {
    const question = QUESTIONS[kind];
    if (!question || s.game || s.ids?.["sensor.life_stage"] !== entity) {
      s.asking = false; // a game, or another pet on this slide now: not now
      return;
    }
    s.screen.querySelector(".askday")?.remove();
    if (s.confirm?.key === "lay_egg") s.confirm = null; // an armed lay can't carry on under a question (F1)
    const box = document.createElement("div");
    box.className = "askday";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", question.q);
    const mine = this._state(s, "sensor.life_stage")?.attributes.catchphrase || "mine";
    const answers = question.options ? question.options(s)
      : Object.keys(kind === "big_how" ? QUESTIONS.how_day.answers : question.answers);
    box.classList.toggle("many", answers.length > 3);
    box.classList.toggle("bdaybox", kind === "birthday");
    box.classList.toggle("wide", answers.length > 6); // seven days: four and three, not three rows
    box.innerHTML = (question.picker?.() || "") + answers
      .map((a) => `<button data-answer="${escape(a)}">${escape(question.label?.(a, s, mine) ?? a)}</button>`).join("");
    const done = () => {
      box.remove();
      s.asking = false;
      clearTimeout(s.askTimer);
    };
    // No tap in the box reaches the screen behind (it would open the status),
    // and while someone is picking, it stays.
    for (const type of ["click", "change", "pointerdown", "pointerup"]) box.addEventListener(type, (e) => e.stopPropagation());
    const wait = () => {
      clearTimeout(s.askTimer);
      s.askTimer = setTimeout(done, ASK_MS);
    };
    box.addEventListener("focusin", wait);
    box.addEventListener("change", wait);
    box.addEventListener("click", (e) => {
      const stepper = e.target.closest("button[data-step]");
      if (stepper) {
        wait();
        question.step?.(box, stepper.dataset.step, Number(stepper.dataset.dir));
        this._tapped(stepper);
        return;
      }
      let answer = e.target.closest("button")?.dataset.answer;
      if (!answer) return;
      if (question.value) answer = question.value(box, answer);
      if (!answer) return;
      this._tapped(e.target.closest("button"));
      done();
      s.answeredAt = Date.now();
      // The question line's own hold ends with its answer (F4): the next line is not kept
      // waiting behind it.
      s.sayUntil = 0;
      // The big day's "yes": which day, as its own ask (opp #2); no reply line before it.
      if (kind === "big_day" && answer === "yes") {
        s.asking = true;
        (s.queue ??= []).push({ text: BIG_DAY.which, ms: ASK_MS, ask: true, cls: KEPT, perk: true,
          then: () => this._ask(s, "big_day_day", entity) });
        this._sayQueued(s);
        return;
      }
      const howLike = kind === "how_day" || kind === "big_how"; // opp #1: how_day's replies
      const lines = howLike ? QUESTIONS.how_day.answers[answer]
        : question.answers[answer] ?? question.answers[e.target.closest("button").dataset.answer];
      // how_day's answers in the type's own words half the time (fresh-expand E7, Q-a).
      // The reply is the viewer's own act: kept like a care press, so no flavour line or
      // beat replaces it a moment later (F5).
      this._line(s, MINE, question.reply ? question.reply(answer, s, mine)
        : howLike ? this._lines(s, `reply_${answer}`, pick(lines)).text : pick(lines), 4500);
      const isCalm = calm();
      if (["great", "you"].includes(answer) && !isCalm) this._animate(s, s.pet, "greethop", 1400);
      else if (["tough", "not really"].includes(answer) && !isCalm) this._bondHearts(s);
      else this._animate(s, s.pet, "perk", 320);
      if (question.keep) this._keepAnswer(s, kind, answer, entity);
      // Follow-ups (F1, E13): a tough day goes to the server (memory only, a softer
      // morning tomorrow); a big day's "yes" asks what it is first. Never stashed.
      if (howLike && answer === "tough") this._sendFollow(s, entity, kind, "tough");
      if (kind === "big_day_day") this._askTextStart(s, entity, "big_day", answer);
      if (kind === "weekend" && answer === "yes") this._askTextStart(s, entity, kind);
      if (kind === "game") this._sendFollow(s, entity, "game", answer); // F6: the choice
      if (kind === "trick" && answer === "yes") this._sendFollow(s, entity, "trick", "yes");
      if (kind === "phone" && answer === "yes") {
        this._setNotify(s, true).then((ok) => {
          if (!ok && s.ids?.["sensor.life_stage"] === entity) this._write(s, "hm, that one slipped away ♪", 3500);
        });
      }
    });
    s.screen.append(box);
    this._askPlace(s, box);
    s.askTimer = setTimeout(done, ASK_MS);
    // The phone question is asked for good only once it's on screen (top10 1a): one
    // dropped before this comes again another day. A websocket answer, off the bus.
    if (kind === "phone") {
      this._hass.callWS({ type: "virtual_pet/answer", entity_id: entity, question: "phone", answer: "shown" })
        .catch(() => {}); // an older server, or a lost reply: it may ask again, once
    }
  }

  // A websocket command, not a service call: answers stay off the event bus.
  // A failure is retried once, quietly. If that fails too, the pet says so and a
  // once-question is kept on this device for later. The bubble is written only
  // while the slide still shows the pet that was asked.
  _keepAnswer(s, kind, answer, entity) {
    const user = this._hass.user?.id;
    const send = () => this._hass.callWS({ type: "virtual_pet/answer", entity_id: entity, question: kind, answer });
    const kept = () => {
      if (kind === "birthday") {
        this._birthdayKept = answer !== "skip";
        this._setMine("birthday_kept", answer !== "skip"); // the channel's push confirms it
      }
    };
    send().then(kept).catch(() => {
      setTimeout(() => {
        send().then(kept).catch((err) => {
          // The server will not take it (the same person answered on another screen, or the
          // question ran out): the pet said it will remember, and nothing slipped. Silent (F6).
          if (err?.code === "not_asked" || err?.code === "invalid_answer") return;
          // A stashed kind is resent quietly later (_resendAnswers): not lost either.
          if (user && STASHED_QUESTIONS.includes(kind) && !sharedScreen()) {
            const list = stashedAnswers(user).filter((a) => a.question !== kind);
            list.push({ question: kind, answer, at: Date.now(), entity });
            saveStashedAnswers(user, list);
            return;
          }
          if (s.ids?.["sensor.life_stage"] === entity) this._line(s, MINE, "hm, that one slipped away ♪", 3500, { write: true });
        });
      }, ANSWER_RETRY_MS);
    });
  }

  // Hearts that float up around the pet: only for someone it's very close to.
  // The infrared link's hearts are "linkhearts", so they never touch a bond's.
  _bondHearts(s, kind = "bondhearts", n = 4) {
    s.screen.querySelector(`.${kind}`)?.remove();
    const box = document.createElement("div");
    box.className = kind;
    box.setAttribute("aria-hidden", "true");
    [[-34, 0], [30, 0.35], [-8, 0.7], [16, 1.05]].slice(0, n).forEach(([x, delay]) => {
      const img = document.createElement("img");
      img.src = `${BASE}/ui/stat_heart_full.png?v=${VERSION}`;
      img.alt = "";
      img.style.setProperty("--x", `${x}px`);
      img.style.animationDelay = `${delay}s`;
      box.append(img);
    });
    s.screen.append(box);
    setTimeout(() => box.remove(), 2800);
  }

  // The frames to draw now: a reaction pose while one runs, else the mood's.
  _frames(s) {
    const all = s.scene ? s.scene.frames || s.frames || []
      : s.linking && s.linkFrames?.length ? s.linkFrames
      : s.poseUntil && Date.now() < s.poseUntil ? s.poseFrames
      : s.patPoseUntil > Date.now() && s.patPoseFrames ? s.patPoseFrames : s.frames || [];
    return all.length > 1 && calm() ? all.slice(0, 1) : all; // calm: a still picture
  }

  _animate(s, el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  // A chirp, if this device turned sounds on and the pet is up at a sane hour.
  // Only the pet on show chirps: the shelf's other slides update too.
  _chirp(s, name) {
    if (!soundsOn() || !this._mayPlay(s)) return;
    // Two cards on one pet (a big and a small one, or two views) see the same event: only the first
    // chirps. Another card's chirp for this pet and this sound under 300 ms ago is the same one (UX7 F9);
    // this card's own quick repeats (taps in a game) all play.
    const device = s.ids?.device;
    const now = Date.now();
    if (lastChirp.card && lastChirp.card !== this && lastChirp.name === name && lastChirp.device === device
      && now - lastChirp.at < 300) return;
    lastChirp = { card: this, name, device, at: now };
    try {
      playChirp(name);
    } catch (err) {
      // no WebAudio: stay quiet
    }
  }

  // The pet on show, up at a sane hour, on a page in view: it may make a sound.
  _mayPlay(s) {
    if (s !== this._slides[this._index]) return false;
    const hour = new Date().getHours();
    const late = hour >= QUIET_HOURS[0] || hour < QUIET_HOURS[1];
    return !s.asleep && !s.lightsOut && !late && document.visibilityState === "visible";
  }

  // A sample from a settings tap: _mayPlay's rules. Returns the status note that
  // says why it stayed quiet ("" when it was skipped for another reason), or null
  // when it may play. The tap itself still unlocks audio (see the callers).
  _maySample(s) {
    if (this._mayPlay(s)) return null;
    const hour = new Date().getHours();
    if (hour >= QUIET_HOURS[0] || hour < QUIET_HOURS[1]) return "sounds are on: quiet till morning ♪";
    if (s.lightsOut) return "sounds are on: shh, it's napping"; // lights out puts it to sleep too
    if (s.asleep) return "sounds are on: shh, it's sleeping";
    return "";
  }

  // Heat shimmer (fx-heat) or cool wisps (fx-cool) over the screen for 2.5 s as the house
  // answers: a CSS stand-in until the art (house_heat, house_cool) lands.
  // One house effect at a time: a new one replaces the last.
  _houseFx(s, cls) {
    s.screen.classList.remove("fx-heat", "fx-cool", "fx-suds", "fx-tumble", "fx-chime");
    s.screen.classList.add(cls);
    clearTimeout(s.houseFxTimer);
    s.houseFxTimer = setTimeout(() => s.screen.classList.remove(cls), 2500);
  }

  // The robot vacuum's stand-in (fx-robot, 6 s across the floor line) until the art
  // (house_robot) lands; the screen's width sets how far it goes.
  _robotFx(s) {
    s.screen.style.setProperty("--robot-w", `${(s.screen.clientWidth || 400) - 22}px`);
    s.screen.classList.add("fx-robot");
    clearTimeout(s.robotTimer);
    s.robotTimer = setTimeout(() => s.screen.classList.remove("fx-robot"), 6000);
  }

  _sparkle(s) {
    const ring = document.createElement("span");
    ring.className = "burst big";
    s.screen.append(ring);
    setTimeout(() => ring.remove(), 600);
  }
}

