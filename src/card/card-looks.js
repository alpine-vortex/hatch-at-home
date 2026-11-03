class HatchPetCardLooks extends HatchPetCardTick {
  // The first look at this pet on this device: what happened while you were
  // out, this morning's dream and today's wish (each once a day per device).
  _firstLook(s) {
    if (!this._channelHeard(s)) return; // the viewer's bond and wish first
    if (this._resumeHeld()) return; // fresh states first
    const away = this._state(s, "sensor.mood")?.state === "away";
    if (s.lookedFirst || !s.species || s.asleep || away || this._eggMinutes(this._state(s, "sensor.life_stage")) !== null) return;
    s.lookedFirst = true;
    followTextSweep(); // M1, again at each first look
    s.firstMoveAt = Date.now() + FIRST_MOVE_MS;
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const device = s.ids?.device;
    // At most FIRST_LOOK_LINES lines, in this order, the newest first; what doesn't fit isn't said
    // (the dream and wish come again at the next first look; the visit's notes
    // are budgeted on the server from what's queued here).
    const lines = [];
    const mark = this._seenRead(device);
    // The fresh-expand extras below (the cure, L10, the trick, the promise) leave a waiting
    // gift its slot (audit 2026-11-01b B1): the gift's place in the look stays as it was.
    const extras = FIRST_LOOK_LINES - (this._giftDue(s) ? 1 : 0);
    const home = (s.privateMoments || []).find((m) => m.type === "friend_home");
    const at = home && new Date(home.at).getTime();
    const homeWelcome = at && !sharedScreen() && Date.now() - at < FRIEND_WELCOME_MS && this._welcomeDue(s, at);
    // Back after two days or more (E8 A-a): a hop and a welcome first, the news before the
    // care misses, and no away note (this takes its slot). Once per return: seen is rewritten.
    // A close friend's own "welcome home" says it instead (one welcome, room for the news).
    const longAway = !!mark?.seen && Date.now() - mark.seen >= LONG_AWAY_MS;
    if (longAway) {
      if (!homeWelcome) lines.push([turnPick(WELCOME_BACK, `${device}|welcome`), 4500]);
      if (!calm()) this._animate(s, s.pet, "greethop", 1400);
    }
    if (homeWelcome) {
      // A close friend who came home while the card was closed: welcome them first.
      const bond = this._bond(s);
      const first = short(this._hass.user?.name?.trim().split(/\s+/)[0]);
      lines.push([`welcome home, ${(bond?.level >= BOND.nickname && bond.nickname) || first || "friend"}! ♥`, 5000]);
      if (HOME_WEATHER[home.weather]) lines.push([HOME_WEATHER[home.weather], 4500]);
    }
    let wishTold = false;
    // Kept milestones said nowhere here (the card was closed): once, as lines of
    // this look. A browser with no record yet starts from now, so a new one
    // never replays the house's history.
    if (typeof mark?.said === "number") {
      for (const [text, at, type] of this._catchUp(s, mark.said, FIRST_LOOK_LINES - lines.length, { news: longAway })) {
        lines.push([text, 5000, { at }]);
        if (type === "wish_granted") wishTold = true; // the today line won't tell it again
      }
    } else {
      this._seenWrite(device, { said: serverNow() });
    }
    // A week old (gaps-seams 1b): on a first look during its 8th day, once per pet and
    // generation on this browser.
    if (stage.age_days >= 7 && stage.age_days < 8 && lines.length < FIRST_LOOK_LINES && onceEver(`week-${device}-${stage.generation || 1}`)) {
      lines.push([this._pick(WEEK_OLD), 5000]);
    }
    const dreamt = s.house?.dream || stage.dream; // a show or song's, from the house
    // The hold ran out on states that may be yesterday's: no dream or wish this look (their
    // keys stay unused for the next).
    const stale = !!this._resumedAt;
    const dreamLine = !stale && this._dreamText(s, dreamt);
    if (dreamLine && lines.length < FIRST_LOOK_LINES && oncePerDay(`dream-${device}`)) {
      lines.push([dreamLine, 5000]);
      if (dreamt.kind === "picked") this._dreamStoryTold(s, dreamt.pick); // its callback (F2)
    }
    const wish = !stale && stage.wish?.open !== false && !stage.wish?.granted && stage.wish && this._wishLine(stage.wish, s);
    if (wish && lines.length < FIRST_LOOK_LINES && oncePerDay(`wish-${device}`)) lines.push([this._wishSaid(s, stage.wish, wish), 5000, { type: "wish" }]);
    // The day after a cure seen here (E4 M-a): after the wish, before the away note.
    const cured = lines.length < extras && this._curedLine(s);
    if (cured) lines.push([cured, 4500]);
    // A follow-up beat for the viewer (F1, E13, F5, F7), when their mine says one may wait:
    // its slot kept here, as the gift's (the reply is async), after the cure and before
    // the rest (FM Q2 A on the reconcile). A reply of {} leaves it unsaid.
    // A waiting gift keeps its own slot over it, as over the other fresh-expand extras.
    let follow = this._followWanted(s, "look") && lines.length < extras;
    const cap = FIRST_LOOK_LINES - (follow ? 1 : 0);
    const capExtras = extras - (follow ? 1 : 0);
    // What happened while you were out comes after what's new (fresh-moment 2, owner Q2).
    // From TODAY_FROM_HOUR, once a day here: a line about its day, in the away note's place.
    const today = !longAway && this._evening() && lines.length < cap && this._todayLine(s, wishTold);
    const seen = mark?.seen || 0;
    if (today && oncePerDay(`today-${device}`)) lines.push([today, 5000, { away: true }]);
    else if (!longAway && seen && Date.now() - seen >= AWAY_NOTE_AFTER_MS && lines.length < cap) {
      const note = this._awayNote(s, seen);
      if (note) lines.push([note, 5500, { away: true }]);
    }
    // A best friend's own screen, at most once a week (E8 B-a).
    const fav = lines.length < capExtras && this._favLine(s);
    if (fav) {
      lines.push([fav, 4500]);
      this._chirp(s, "win");
    }
    // An adult's new trick, the first look of the month it learns one (E8 LS-a).
    const trick = lines.length < capExtras && this._trickNew(s, stage);
    if (trick) {
      lines.push([turnPick(TRICK_LINES, `${device}|trick`), 4500]);
      s.trickSaid = new Date().toDateString(); // F7's payoff skips this look's (Q5 A)
      if (!calm()) setTimeout(() => this._trickMove(s, trick), 600);
    }
    // A dream story told here 2-4 days ago, once (F2).
    const callback = !stale && lines.length < capExtras && this._dreamCallback(s);
    if (callback) lines.push([callback, 4500]);
    // The pet's own promise (F3): day 0 says it, day 4 (to 7) the payoff, with the move.
    const promise = lines.length < capExtras && this._promiseLook(s);
    if (promise) {
      lines.push([promise.line, 4500]);
      if (promise.move) setTimeout(() => this._promiseMove(s, promise.move), 600);
    }
    // Last, and only if there is room: an adult on how it was raised, once a week.
    const raised = this._state(s, "sensor.life_stage")?.state === "adult" && UPBRINGING_LINES[stage.upbringing];
    if (raised && lines.length < cap && upbringingDue(device)) lines.push([raised, 5000]);
    // Then a gift waiting for the viewer (visitors v2 §5): its slot is kept here, as the
    // reply that says it is async; it wins over the missed visitor (review Q3).
    let gift = this._giftDue(s) && lines.length < cap;
    if (!gift && follow && this._giftDue(s) && lines.length < FIRST_LOOK_LINES) {
      follow = false; // the gift's place stays as it was: the beat waits for a later look
      gift = true;
    }
    const room = FIRST_LOOK_LINES - (gift ? 1 : 0) - (follow ? 1 : 0);
    // Very last, flavour: today's visitor came and went with nobody here to see it
    // (its window over, the day's visit flag unset). Said once, and the flag used up,
    // so the visit can't also play; only with room, so it never pushes a line out.
    // A day visitor on a day screen isn't told: it comes by live instead (_visitorLate).
    const missed = !this._visitorLate(s) && this._visitorMissed(s);
    if (missed && lines.length < room && oncePerDay(`visit-${device}`, this._visitDay(s))) {
      const baby = this._babyStage(s) === "baby";
      // Their favourite, on their own screen, in its own line (opp #4).
      const fav = !baby && !sharedScreen() && s.mine?.fav_visitor === missed.id && FAVV_LINES.missed(missed.name);
      lines.push([baby ? "hi hi! ♪" : fav || missed.catchup || `a ${missed.name} came by today ♪`, 4500, { cls: FLAVOUR }]);
    }
    for (const [text, ms, opts] of lines.slice(0, FIRST_LOOK_LINES)) this._queue(s, text, ms, opts);
    // A missed day visitor comes by right after this look's first line, not after them
    // all (fresh-moment 3, review s2622 #7): _visitorTick starts it once the queue is down
    // to the rest and the line on show is done.
    s.lateVisit = this._visitorLate(s) ? { left: Math.max(Math.min(lines.length, FIRST_LOOK_LINES) - 1, 0), made: Date.now() } : null;
    s.giftAgain = false; // this look is the one a tab coming back would have had
    if (gift) this._giftTake(s);
    if (follow) this._followFetch(s);
  }

  // --- Follow-ups (fresh-expand F1, E13) ------------------------------------------
  // The viewer's own: never on a shared screen. The text they type is sent once over the
  // websocket (never a service, so never on the bus), said back only in the reply to
  // them, and written as text. Nothing of it is kept in this browser.

  // at: "look" (a first look, a tab's return, the evening) or "picker" (F6); only when
  // the viewer's own mine says a beat may wait there today.
  _followWanted(s, at = "look") {
    return !sharedScreen() && !!this._hass?.user && !!s.ids?.["sensor.life_stage"] && !s.following &&
      Array.isArray(s.mine?.follow_at) && s.mine.follow_at.includes(at);
  }

  // One virtual_pet/follow: the server marks the beat said for this person (their other
  // screens get {}). An older server has no command: nothing is said.
  async _followFetch(s, at = "look") {
    const entity = s.ids?.["sensor.life_stage"];
    if (!this._followWanted(s, at)) return null;
    const clock = this._followClock(s);
    // Audit 0.43.0 F-01: an evening's "how did it go?" would take the open question's
    // answer (and may not show): wait for a later tick, not consumed.
    if (at === "look" && clock.eve && (s.asking || s.game)) return null;
    s.following = true;
    let reply = null;
    try {
      reply = await this._hass.callWS({ type: "virtual_pet/follow", entity_id: entity, at });
      // F-02: the evening is tried once a day, but only once the server has answered.
      // A deferred evening (the server's open question first) isn't tried yet.
      if (at === "look" && clock.eve && !reply?.deferred) s.followEve = clock.day;
      else if (at === "look" && clock.eve) s.followRetry = Date.now() + FOLLOW_RETRY_MS;
    } catch (err) {
      reply = null; // an older server: no follow-ups; a failed call tries again later
      if (at === "look" && clock.eve) s.followRetry = Date.now() + FOLLOW_RETRY_MS;
    }
    s.following = false;
    if (!reply?.kind || sharedScreen() || s.ids?.["sensor.life_stage"] !== entity) return null;
    if (at === "picker") return reply; // F6: the picker says it
    // Audit s2635 H1: a big day's evening is its "how did it go?" (opp #1), asked in this
    // slot with how_day's buttons; the plain evening line only when an ask can't show.
    if (reply.ask === "big_how" && !s.asking && !s.game) {
      const it = this._followIt(reply);
      s.asking = true;
      (s.queue ??= []).push({ text: it ? BIG_DAY.howText(it) : BIG_DAY.how, ms: ASK_MS, ask: true, cls: KEPT, perk: true,
        then: () => this._ask(s, "big_how", entity) });
      return reply;
    }
    // F7: one trick line a look: LS-a's monthly one said here today wins (Q5 A).
    if (reply.kind === "trick" && s.trickSaid === new Date().toDateString()) return null;
    const line = this._followLine(s, reply);
    if (!line) return null;
    const soft = reply.kind === "soft";
    const move = reply.kind === "trick" && this._trickToShow(s);
    if (move) s.followTrick = { move, day: new Date().toDateString() }; // in its idle moves today
    this._queue(s, line, 5000, {
      personal: true, type: "follow", still: () => !sharedScreen(),
      then: soft && !calm() ? () => this._bondHearts(s) : move && !calm() ? () => this._trickMove(s, move) : undefined,
    });
    return reply;
  }

  // F7: a trick the pet hasn't learned yet (a teen's first; an adult's next), or null.
  _trickToShow(s) {
    const st = this._state(s, "sensor.life_stage");
    const learned = st?.state === "adult" ? tricksBy(trickMonth(st.attributes?.age_days)) : [];
    return TRICKS.find((t) => !learned.includes(t)) || null;
  }

  // The day and whether it is the evening, by Home Assistant's clock (audit 0.43.0 F-03):
  // the server decides the beats by it, so the gate and the daily marker follow it. An
  // older server sends none: this browser's clock, as before.
  _followClock(s) {
    const m = s.mine;
    if (typeof m?.follow_day === "string" && typeof m.follow_evening === "boolean") {
      return { day: m.follow_day, eve: m.follow_evening };
    }
    const now = new Date();
    return { day: now.toDateString(), eve: now.getHours() >= FOLLOW_EVENING_HOUR };
  }

  // Once at the first tick from FOLLOW_EVENING_HOUR on a day (a big day's evening beat).
  _followEvening(s) {
    const clock = this._followClock(s);
    if (!s.lookedFirst || s.asleep || !clock.eve) return;
    if (s.followEve === clock.day || !this._followWanted(s) || !this._channelHeard(s)) return;
    if (s.queue?.length || s.asking || s.game) return; // the first look's lines first: a fourth would crowd them
    if (s.followRetry && Date.now() < s.followRetry) return; // a deferred or failed try waits, not every tick
    this._followFetch(s);
  }

  // A beat's line: E13's soft morning (the type's 2 and the shared 4; a baby's own), or
  // a big day's morning or evening, with their words or the type's and the shared 3.
  _followLine(s, reply) {
    const device = s.ids?.device;
    const type = PERSONA[this._typeKey(s)] || {};
    if (reply.kind === "soft") {
      const baby = this._babySet(s, "soft");
      return baby ? pick(baby) : turnPick([...(type.soft || []), ...SOFT_MORNING], `${device}|soft`);
    }
    if (reply.kind === "big_day" && (reply.beat === "morning" || reply.beat === "evening")) {
      const am = reply.beat === "morning";
      const it = this._followIt(reply);
      const salt = `${device}|bigday|${reply.beat}`;
      if (it) return turnPick(am ? BIG_DAY.amText : BIG_DAY.pmText, salt)(it);
      return turnPick([...((am ? type.bigday_am : type.bigday_pm) || []), ...(am ? BIG_DAY.am : BIG_DAY.pm)], salt);
    }
    if (reply.kind === "weekend" && reply.beat === "monday") {
      const it = this._followIt(reply);
      return it ? turnPick(WEEKEND.monText, `${device}|weekend`)(it) : turnPick(WEEKEND.mon, `${device}|weekend`);
    }
    if (reply.kind === "trick" && reply.beat === "shown") return turnPick(TRICK_ASK.shown, `${device}|trickshown`);
    return null;
  }

  // Their words for this beat: this browser's own copy (it typed them), else the server's
  // on a phone or the app only (owner Q2 A); else none, and the plain line is said.
  _followIt(reply, server = true) {
    const user = this._hass?.user?.id;
    const own = user && followTextRead(user, reply.kind);
    if (own) return cleanTyped(own);
    return server && phoneLike() ? cleanTyped(reply.text) : null;
  }

  // A follow-up answer, fire and forget: only to a server that takes them, never on a
  // shared screen, never stashed or retried. shared: false, so the server may keep a game
  // pick or a great day in their memory (memory plan R3, M1 B1).
  _sendFollow(s, entity, question, answer, text = null, day = null) {
    if (!this._followOk || sharedScreen() || !entity) return Promise.resolve(false);
    const msg = { type: "virtual_pet/answer", entity_id: entity, question, answer, shared: false };
    if (text) msg.text = text;
    if (day) msg.day = day; // the big day's (opp #2)
    return this._hass.callWS(msg).then((r) => r || true, () => false);
  }

  // After a big day's "yes": "what is it?", then one input with "ok" and "skip". However
  // it ends (ok, skip, empty, the time, a slide switch, the tab hiding) the "yes" is sent
  // once, with the text only if there is one.
  _askTextStart(s, entity, kind = "big_day", day = null) {
    if (!this._followOk || sharedScreen()) {
      this._sendFollow(s, entity, kind, "yes", null, day);
      return;
    }
    const step = s.textStep = { entity, kind, day, sent: false, until: Date.now() + ASK_MS * 2 };
    s.asking = true;
    (s.queue ??= []).push({ text: BIG_DAY.what, ms: ASK_MS, ask: true, cls: KEPT, perk: true, then: () => this._askText(s, step) });
  }

  _askText(s, step) {
    if (s.textStep !== step || s.ids?.["sensor.life_stage"] !== step.entity || sharedScreen()) {
      this._askTextEnd(s);
      return;
    }
    s.screen.querySelector(".askday")?.remove();
    const box = document.createElement("div");
    box.className = "askday asktext";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", BIG_DAY.what);
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = FOLLOW_TEXT_MAX;
    input.autocomplete = "off";
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", BIG_DAY.what);
    const ok = document.createElement("button");
    ok.textContent = "ok";
    const skip = document.createElement("button");
    skip.textContent = "skip";
    // Nothing typed here reaches the screen behind, or HA's own shortcuts (e, c, a, m).
    for (const type of ["click", "change", "pointerdown", "pointerup", "keydown", "keyup", "keypress"]) {
      box.addEventListener(type, (e) => e.stopPropagation());
    }
    ok.addEventListener("click", () => this._askTextEnd(s, cleanTyped(input.value), true));
    skip.addEventListener("click", () => this._askTextEnd(s, null, true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._askTextEnd(s, cleanTyped(input.value), true);
    });
    box.append(input, ok, skip);
    s.screen.append(box);
    this._askPlace(s, box);
    step.box = box;
    step.until = Date.now() + ASK_MS + 1000;
    step.timer = setTimeout(() => this._askTextEnd(s), ASK_MS);
  }

  _askTextEnd(s, text = null, said = false) {
    const step = s.textStep;
    if (!step || step.sent) return;
    step.sent = true;
    s.textStep = null;
    step.box?.remove();
    clearTimeout(step.timer);
    s.asking = false;
    if (s.queue?.length) s.queue = s.queue.filter((q) => q.text !== BIG_DAY.what || !q.ask);
    // "I'll remember" only once the server kept it (a step ending past midnight is refused).
    const kind = step.kind || "big_day";
    const user = this._hass?.user?.id;
    this._sendFollow(s, step.entity, kind, "yes", text, step.day).then((ok) => {
      if (ok && text && user && typeof ok.until === "string") followTextKeep(user, kind, text, ok.until);
      else if (ok && user) followTextKeep(user, kind, "", "0000-00-00"); // no words: an old copy goes
      if (ok && said && s.ids?.["sensor.life_stage"] === step.entity) this._line(s, MINE, BIG_DAY.kept, 3500);
    });
  }

  // --- Gifts (plan visitors v2 §5) ----------------------------------------------
  // Only the viewer's own `mine.gift`, never on a shared screen (there it waits), and
  // nothing of it in localStorage. Said at a first look, or when the tab comes back
  // after being hidden at least AWAY_NOTE_AFTER_MS (owner Q1); never while watching.

  _giftDue(s) {
    return findsShown() && !!s.mine?.gift && !sharedScreen() && !s.gifting;
  }

  // The take: one virtual_pet/collect {gift}, and only a non-empty reply speaks (another
  // screen of the same person may have taken it: {gift: null}). The reply alone decides:
  // the server's push of mine.gift = null to this screen arrives before it. An error (an
  // older server, or `shared`) is no gift.
  async _giftTake(s) {
    const entity = s.ids?.["sensor.life_stage"];
    if (!entity || !this._hass || !findsShown()) return;
    s.gifting = true;
    const epoch = s.giftEpoch = (s.giftEpoch || 0) + 1;
    let gift = null;
    try {
      const reply = await this._hass.callWS({ type: "virtual_pet/collect", entity_id: entity, gift: true, shared: false });
      gift = reply?.gift || null;
    } catch (err) {
      console.warn("hatch-pet-card: the gift", err?.message || err);
    }
    if (s.giftEpoch !== epoch || s.ids?.["sensor.life_stage"] !== entity) return; // dropped meanwhile
    s.gifting = false;
    const find = gift && typeof gift.world === "string" && findOf(this._worlds, gift.world, gift.id);
    if (!find || sharedScreen()) return; // one this card doesn't know: nothing
    const g = { id: find.id, world: gift.world };
    this._queue(s, this._giftLine(s, find), GIFT_LINE_MS, {
      type: "gift", still: () => !sharedScreen(), then: () => this._giftPop(s, g),
    });
  }

  // V5 for an ordinary find, V6 for a gift-only one, V7 (BABY.gift) for a baby.
  _giftLine(s, find) {
    const normal = !find.gift_only ? GIFT_LINES.find(find.name)
      : GIFT_MADE.includes(find.id) ? GIFT_LINES.made : GIFT_LINES.found;
    const baby = this._babySet(s, "gift");
    return baby ? pick(baby) : normal;
  }

  // The gift pops up above the pet as its line is said (a reveal's look, with no basket,
  // the basket left as it is, no sparkle); still under reduced motion. Gone with the line.
  _giftPop(s, g) {
    this._giftPopEnd(s);
    if (sharedScreen() || !s.screen) return;
    const el = document.createElement("div");
    el.className = "reveal gift";
    el.innerHTML = '<img class="rf" alt="">';
    const img = el.firstChild;
    img.src = `${BASE}/ui/find_${g.world}_${g.id}.png?v=${VERSION}`;
    img.dataset.find = `${g.world}/${g.id}`;
    if (!calm()) img.classList.add("pop");
    s.screen.append(el);
    const until = Date.now() + GIFT_LINE_MS;
    const P = s.giftPop = { el, until, timer: setTimeout(() => this._giftPopEnd(s), GIFT_LINE_MS) };
    if (!(s.flairUntil > until)) s.flairUntil = P.until; // a pat wiggles; nothing else starts
    if (!(s.visitUntil > until)) s.visitUntil = P.until;
  }

  // The pop gone (its line's time is up, or the slide's gift is dropped).
  _giftPopEnd(s) {
    const P = s.giftPop;
    if (P) {
      s.giftPop = null;
      clearTimeout(P.timer);
      P.el.remove();
      if (s.flairUntil === P.until) s.flairUntil = 0;
      if (s.visitUntil === P.until) s.visitUntil = 0;
    }
  }

  // The gift's state on a slide forgotten: the pop, its line, and a take still on its
  // way (its reply is dropped). On a shared screen, another pet, or the card leaving.
  _dropGift(s) {
    this._giftPopEnd(s);
    s.giftEpoch = (s.giftEpoch || 0) + 1;
    s.gifting = false;
    if (s.queue?.length) s.queue = s.queue.filter((q) => q.type !== "gift");
  }

  // Owner Q1: the tab came back after being hidden at least AWAY_NOTE_AFTER_MS, and a
  // gift waits: taken now, under the first look's own conditions (each tick until they
  // hold, for the slide on show). A first look in between uses it up.
  _giftReturn(s) {
    if (!s.giftAgain || !s.lookedFirst || !this._channelHeard(s)) return;
    const away = this._state(s, "sensor.mood")?.state === "away";
    if (!s.species || s.asleep || away || this._eggMinutes(this._state(s, "sensor.life_stage")) !== null) return;
    s.giftAgain = false;
    if (this._giftDue(s)) this._giftTake(s);
    if (this._followWanted(s)) this._followFetch(s); // F1: a beat may be due now
  }

  // Each "came home" is welcomed once in this browser, by any pet (seen live,
  // or at the next look).
  // This pet's own entry on the integration page, as HA's frontend opens it after a config
  // flow; the plain integration page when the device carries no entry id.
  _petEntryPath(s) {
    const entry = this._hass.devices?.[s.ids?.device]?.config_entries?.[0];
    return `/config/integrations/integration/virtual_pet${entry ? `#config_entry=${entry}` : ""}`;
  }

  _welcomeDue(s, at) {
    const key = `hatch-welcomed-${this._hass.user?.id}`;
    try {
      // Each pet reports the same arrival a moment apart: one welcome for it.
      if (Number(localStorage.getItem(key) || 0) + WELCOME_SAME_ARRIVAL_MS >= at) return false;
      localStorage.setItem(key, String(at));
    } catch (err) {
      // no storage: once per page load
    }
    return true;
  }

  // Today's wish in the pet's words and short: [line, status text], or null.
  // One aimed at the viewer (their own "mine") speaks to them; everyone else,
  // and every shared screen, sees the plain wish.
  _wishLine(wish, s) {
    if (!WISHES[wish.kind]) return null;
    if (!this._aimedAtMe(wish, s)) return WISHES[wish.kind];
    const bond = this._bond(s);
    const aimed = WISHES_FOR[wish.kind];
    return [withName(aimed[0], bond?.level >= BOND.nickname ? bond.nickname : null), aimed[1]("you")];
  }

  _aimedAtMe(wish, s) {
    return !!(WISHES_FOR[wish.kind] && s.mine?.wish_for_you && !sharedScreen());
  }

  // The wish as the pet says it: in baby talk if it's on (not an aimed wish:
  // that keeps its words; the status screen's short text never changes).
  _wishSaid(s, wish, line, date = turnNow()) {
    if (this._aimedAtMe(wish, s)) return line[0];
    // W-a (fresh-expand E6): its first line and WISH_MORE's take turns, a day each.
    const more = WISH_MORE[wish.kind];
    const said = more ? turnPick([line[0], ...more], `${s.ids?.device}|wish|${wish.kind}`, date) : line[0];
    return this._lines(s, `WISHES.${wish.kind}`, said).text;
  }

  // An open wish comes up once more after the first look (never all day), and
  // only while it can still come true (the server's "open").
  _wishMention(s) {
    const now = Date.now();
    const [lo, hi] = WISH_MENTION_MS;
    const today = new Date().toDateString();
    if (s.wishDay !== today) { // a new day (a tablet left on overnight): a new mention
      s.wishDay = today;
      s.nextWish = 0;
    }
    if (!s.nextWish) s.nextWish = now + lo + Math.random() * (hi - lo);
    if (now < s.nextWish || !this._free(s)) return;
    const wish0 = this._state(s, "sensor.life_stage")?.attributes.wish;
    if (!wish0 || wish0.granted || wish0.open === false) return; // not yet, or not now: keep it
    s.nextWish = Infinity;
    const wish = this._state(s, "sensor.life_stage")?.attributes.wish;
    const line = wish && !wish.granted && wish.open !== false && this._wishLine(wish, s);
    if (line && oncePerDay(`wishmention-${s.ids?.device}`)) this._queue(s, this._wishSaid(s, wish, line), 4500, { type: "wish" });
  }

  // When this device last saw the pet (for the away note), every minute.
  _seen(s) {
    const now = Date.now();
    if (this._resumeHeld()) return; // a tab back: its first look reads the old mark first (fresh-moment 1)
    if (s.seenAt && now - s.seenAt < 60000) return;
    s.seenAt = now;
    this._seenWrite(s.ids?.device, { seen: now }); // said stays as it is
  }
}

