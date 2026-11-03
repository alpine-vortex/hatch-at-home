class HatchPetCardMoment extends HatchPetCardVisit {
  // Something happened in HA: show it. From sensor.last_care "moments", or
  // from the private channel (the viewer's own moments, the house's shows).
  _moment(s, m, capture = null) {
    // Each line goes out with the moment's class (PR 2a): said now, or queued,
    // or (flavour) dropped; fx is what happens as it is said. With capture (the
    // catch-up), only the words are kept: nothing is said and nothing moves.
    const cls = MOMENT_CLASS[m.type] ?? FLAVOUR;
    const at = cls === KEPT ? m.at : undefined;
    let lined = false;
    const line = (text, ms = 4500, fx, opts = {}) => {
      lined = true;
      if (capture) capture.push(text);
      else this._line(s, cls, text, ms, { then: fx, at, type: m.type, ...opts });
    };
    const say = (text, ms, fx) => line(text, ms, fx, { write: true });
    const speak = (text, ms, fx) => line(text, ms, fx, { catch: true }); // may carry its sound
    const now = (fx) => { if (!capture) fx(); }; // no line: it happens at once
    switch (m.type) {
      case "care_miss":
        // Only the catch-up says it: live, the viewer was here all along. Unsaid,
        // it is marked said, so the catch-up won't bring it back either.
        if (capture) say(this._lines(s, "care_miss", "...oh, there you are ♥").text, 5000); // never guilt
        break;
      case "discipline_miss":
        say("ok, ok... ♪");
        break;
      case "became_sick": // feeling poorly (2b): said once, dropped if it's well by then
        // From weight, the public moment keeps its cause (gaps-seams 2b): it says why.
        line(m.cause === "weight" ? (this._babyStage(s) ? SICK_WEIGHT_BABY : pick(SICK_WEIGHT))
          : this._lines(s, "became_sick", "I don't feel so good...").text, 4500,
          () => this._animate(s, s.pet, "droop", 2800),
          { write: true, still: () => this._isSick(s) });
        break;
      case "call_answered":
        if (m.reason === "fake" && m.answer !== "spoiled") { // only a fair scold sulks
          say("ok... sorry", 4500, () => this._animate(s, s.pet, "sulk", 800));
        }
        break;
      case "hatched":
        // The first meeting (UX fix 4, F3): on a personal screen it says the viewer's name, then
        // "nice to meet you". That spends today's greeting, so the normal one doesn't repeat it.
        {
          const first = sharedScreen() ? null : short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
          say(first ? `hello, ${first}! ♥` : "hello!", 4500, () => {
            this._chirp(s, "hatch");
            this._animate(s, s.pet, "born", 500);
            this._sparkle(s);
          });
          if (!capture) {
            this._line(s, KEPT, "nice to meet you ♥", 4500, { type: m.type });
            this._greetSpent(s);
          }
        }
        break;
      case "stage_changed":
        if (m.stage === "baby") break; // hatching says hello
        say(m.stage === "adult"
          ? "all grown up! ♥" // the upbringing is on the status screen, not announced
          : `i'm a ${m.stage} now!`, 4500, () => {
          this._animate(s, s.pet, "stretch", 1100);
          this._sparkle(s);
        });
        // A new teen tells its personality, in a bubble of its own after this one
        // (kept too, so it waits its turn).
        if (m.stage === "teen" && PERSONA[m.personality] && !capture) {
          this._line(s, KEPT, pick(PERSONA[m.personality].reveal), 4500, { catch: true, type: m.type, perk: true });
        }
        break;
      case "trait_learned":
      case "trait_deepened":
        say(`${m.type === "trait_learned" ? "new trait" : "deeper trait"}: ` +
          `${String(m.trait).replaceAll("_", " ")} ${"★".repeat(m.level || 1)}`, 4500, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
          // Show what the new trait looks like, so its flair means something later.
          setTimeout(() => this._flair(s, m.trait), 700);
        });
        break;
      case "egg_laid":
        say("see you in the journal!", 4500, () => {
          this._animate(s, s.pet, "born", 500);
          this._sparkle(s);
        });
        break;
      case "woke_up":
        if (m.how === "morning") {
          say(this._wakeLine(s), 4500, () => this._animate(s, s.pet, "stretch", 1100));
          if (!capture) this._newLook([s]); // up for the day, seen live: the morning's look begins (fresh-moment 1)
        } else if (m.how === "night") {
          // A wake scene in the sleep window says its own groggy line: not this one before it, nor after.
          if (!capture && (s.scene?.kind === "lights" || Date.now() - (s.stretched || 0) < WAKE_STRETCH_MS)) break;
          say("...so sleepy");
        } else if (m.how === "lights") {
          // lights on: a stretch, no line (plan 5.5); not while a wake scene plays, nor two after one (its own stretch)
          now(() => { if (!s.asleep && !s.scene && !calm() && !(Date.now() - (s.stretched || 0) < WAKE_STRETCH_MS)) this._animate(s, s.pet, "stretch", 1100); });
        }
        break;
      case "fell_asleep":
        if (m.how === "collapsed") {
          say("so... sleepy... zzz", 5000);
        } else if (m.how === "house" || m.how === "lights") {
          // A tuck this card's own lights scene plays says its own sigh and thanks (care reactions D, plan 4.3b):
          // nothing here while it lives, nor just after it said them. A tuck seen live from elsewhere is today's.
          if (m.how === "lights" && !capture && (s.scene?.kind === "lights" || Date.now() - (s.tuckedAt || 0) < WAKE_STRETCH_MS)) break;
          // The pet's first bedtime (its first day, one per pet and generation on this browser):
          // its own line, spent when it is said, not in the catch-up and not for an egg.
          const { text, ms, then } = this._tuckLine(s, capture);
          say(text, ms, then);
        }
        break;
      case "rest_ended": // R1: back from resting, with a stretch (no line going in: rest_started)
        say(this._lines(s, "rest.back", pick(REST_LINES.back)).text, 4500,
          () => this._animate(s, s.pet, "stretch", 1100));
        break;
      case "good_morning":
        speak(this._lines(s, "good_morning", pick(this._clockLines(s, "good_morning") || ["morning!! you're up!", "morning! ♪"])).text, 4500,
          () => this._animate(s, s.pet, "stretch", 1100));
        break;
      case "sunset":
        speak(this._lines(s, "sunset", pick(this._clockLines(s, "sunset") || ["ooh, the sunset...", "pretty sky tonight", "the sun's going down"])).text, 4500,
          () => this._look(s, 3000));
        break;
      case "sunrise":
        speak(pick(["the sun's up!", "good morning, sun!"]), 4500, () => this._look(s, 2500));
        break;
      case "watching": {
        if (!m.title) break;
        // A long title gets the short lines, so the bubble leaves the pet in view.
        const title = short(m.title);
        line(pick([`ooh, ${title}!`, `*watches ${title}*`, `${title}! I love this one`]), 4500,
          () => this._animate(s, s.pet, "perk", 320));
        break;
      }
      case "listening":
        if (!m.title) break;
        line(m.artist && Math.random() < 0.5
          ? `♪ ooh, ${short(m.artist)}! ♪`
          : `♪ ${short(m.title)} ♪`);
        break;
      case "news_live": // the same, said on the channel only (house_words_private, H8)
      case "news": { // virtual_pet.share_news: a passing moment, like a TV title
        const h = String(m.headline || "");
        if (!h || s.game) break; // a game's prompt owns the bubble: dropped, like asleep
        // A long headline gets only the shortest lead-in (the bubble holds ~60).
        const lines = h.length > 45 ? [`news! ${h}`]
          : [`did you hear? ${h}`, `did you hear? ${h}`, `guess what? ${h}`, `ooh, news! ${h}`];
        // A short topic only, so the bubble stays small ("World News news!" never).
        const topic = String(m.topic || "");
        if (topic && topic.length <= 12 && h.length <= 45 && !/news$/i.test(topic)) {
          lines.push(`${topic} news! ${h}`);
        }
        const said = pick(lines);
        // Long enough to read; a headline gets no catchphrase.
        line(said, 4000 + said.length * 50, () => this._animate(s, s.pet, "perk", 320));
        break;
      }
      case "weather": { // the weather just changed (or a hot or freezing day)
        if (s.game) break; // a game's prompt owns the bubble
        const t = degrees(m.temperature);
        const lines = {
          rain_started: ["ooh, it's raining!", "pitter patter...", "here comes the rain!"],
          rain_stopped: ["the rain stopped!", "all dry now~"],
          rainbow: ["the rain stopped... a rainbow!", "ooh, a rainbow! so pretty"],
          snow_started: ["it's snowing!! ❄", "snowflakes!! ❄"],
          sun_out: ["the sun came out!", "ooh, sunshine!"],
          hot: t ? [`${t} out there! phew`, `so hot out... ${t}!`] : ["so hot out there!"],
          cold: t ? [`brr, ${t} outside!`, `${t} out there... brr`] : ["brr, so cold out!"],
        }[m.change];
        if (!lines) break;
        if (!capture) s.skySaid = Date.now(); // the sky reaction waits a minute (_skyReact)
        (m.change === "cold" ? say : speak)(pick(lines), 4500, () => { // a sulk gets no cheery sound
          if (m.change === "rainbow" || m.change === "snow_started") this._sparkle(s);
          if (m.change === "cold") this._animate(s, s.pet, "sulk", 800);
          else this._look(s, 2500);
        });
        break;
      }
      case "house_answered": { // the heating (cooling) came on for a chilly (warm) pet (H3)
        if (s.game) break;
        const kind = HOUSE_REQUEST[m.request];
        if (!kind) break;
        speak(pick(HOUSE_LINES[kind]), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          this._houseFx(s, kind === "heating" ? "fx-heat" : "fx-cool");
        });
        break;
      }
      case "robot_out": // a robot vacuum started a run: the stand-in crosses the floor (H4)
      case "robot_home": { // ... and went home: a word, no robot
        if (s.game) break;
        speak(pick(HOUSE_LINES[m.type]), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          if (m.type === "robot_out") this._robotFx(s);
        });
        break;
      }
      case "appliance_done": { // a washer, dryer or dishwasher finished its cycle (H6)
        if (s.game) break;
        const kind = ["washer", "dishwasher", "dryer"].includes(m.kind) ? m.kind : "machine"; // only the kind comes in
        const lines = HOUSE_LINES[kind];
        speak(pick(lines), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          this._houseFx(s, kind === "dryer" ? "fx-tumble" : "fx-suds");
        });
        break;
      }
      case "doorbell_live": { // a doorbell press, said live and kept nowhere: a startle and two notes (H5)
        if (s.game) break; // a game's prompt owns the bubble
        // The startle and the chime are the bell's own: at once, not waiting on the
        // line (a FLAVOUR line can wait up to FLAVOUR_WAIT_MS, or be dropped).
        now(() => {
          this._animate(s, s.pet, REACT_POSE.startle.move, REACT_POSE.startle.ms);
          this._houseFx(s, "fx-chime");
        });
        speak(pick(HOUSE_LINES.doorbell), 4500);
        break;
      }
      case "house_moment": // virtual_pet.react: something in the house, by category (H8)
      case "house_live": { // ... said on the channel only: it says someone's home, or the words are kept off the sensor
        if (s.game) break; // a game's prompt owns the bubble
        const cat = Object.hasOwn(HOUSE_CATEGORY, m.category ?? "") ? HOUSE_CATEGORY[m.category] : null;
        if (!cat) break;
        const custom = m.category === "custom";
        const reaction = custom ? (Object.hasOwn(REACT_POSE, m.reaction ?? "") ? m.reaction : "hop") : cat.react;
        const pose = REACT_POSE[reaction];
        const fx = () => {
          this._animate(s, s.pet, pose.move, pose.ms);
          if (pose.sparkle) this._sparkle(s);
          if (cat.fx) this._houseFx(s, cat.fx);
        };
        const words = custom ? String(m.text || "") : "";
        // The player's own words get no catchphrase (as a headline); the pet's lines may.
        if (words) line(words, 4000 + words.length * 50, fx);
        else speak(pick(custom ? HOUSE_MOMENT_LINES.custom[reaction] : HOUSE_MOMENT_LINES[m.category]), 4500, fx);
        break;
      }
      case "forecast": { // something worth a word in today's or tomorrow's forecast
        if (s.game) break;
        const today = m.when === "today";
        const hi = degrees(m.high);
        const lines = {
          storm: today ? ["thunder later... eek"] : ["storms tomorrow... eek"],
          snow: today ? ["ooh, snow today!", "it might snow today!!"] : ["snow tomorrow!!", "snow tomorrow! I can't wait ❄"],
          hot: hi ? [today ? `hot one today: ${hi}!` : `${hi} tomorrow! phew`] : [today ? "hot one today!" : "hot tomorrow, phew"],
          cold: hi ? [today ? `cold one today: ${hi}, brr` : `brr, only ${hi} tomorrow`] : [today ? "cold one today, brr" : "cold tomorrow, brr"],
          warmer: hi ? [today ? `warmer today: ${hi}!` : `warmer tomorrow: ${hi}!`] : [today ? "warmer today!" : "warmer tomorrow!"],
          colder: hi ? [today ? `colder today, only ${hi}` : `colder tomorrow... ${hi}`] : [today ? "colder today..." : "colder tomorrow..."],
          rain: today ? ["rain later today...", "rain's coming later"] : ["rain tomorrow... a blanket day ♪"],
          sunny: today ? ["sunny today! yay"] : ["sun tomorrow! yay"],
        }[m.kind];
        if (!lines) break;
        if (!capture) s.skySaid = Date.now();
        (["storm", "cold", "colder"].includes(m.kind) ? say : speak)(pick(lines), 5000, () => {
          if (m.kind === "cold" || m.kind === "colder") this._animate(s, s.pet, "sulk", 800);
          else this._animate(s, s.pet, "perk", 320);
        });
        break;
      }
      case "wish_granted": { // lines that arrive together queue, so none is lost
        // W-b (fresh-expand E6): half the time live, what it got (TODAY_WISH); the evening's
        // today line then doesn't tell the wish again.
        const got = !capture && TODAY_WISH[m.kind] && !this._babySet(s, "wish_granted") && Math.random() < 0.5;
        if (got) oncePerDay(`todaywish-${s.ids?.device}`);
        const granted = got ? { text: TODAY_WISH[m.kind], baby: false }
          : this._lines(s, "wish_granted", pick(["my wish came true! thank you ♥", "yay, my wish! ♥", "best day ever! ♥"]));
        line(granted.text, 4500, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
        }, { catch: !granted.baby, perk: true });
        break;
      }
      case "bond_up": { // only the person whose bond it is gets it (the channel)
        if (sharedScreen()) break; // nothing personal on a shared screen
        const game = GAMES.find((g) => g.key === m.favourite);
        line(game ? `${game.label} is our game now! ♥`
          : m.nickname ? `I'll call you ${m.nickname} now ♥`
          : m.level >= BOND.max ? "you're my very best friend ♥"
          : m.level === BOND.max - 1 ? "you make every day better ♥"
          : m.level >= BOND.hearts ? "I'm always so happy when you're here ♥"
          : this._lines(s, "bond_up", pick(["I like you a lot, you know ♥", "we're getting close! ♥", "you're the best ♥"])).text, 5000, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
        }, { perk: true });
        break;
      }
      case "friend_home": { // the viewer, a close friend, came home (the channel)
        if (sharedScreen() || capture) break; // a shared screen has someone_home
        if (!this._welcomeDue(s, new Date(m.at).getTime())) break;
        line(this._lines(s, "friend_home", pick(["you're home!! ♥", "yay, you're back! ♥"])).text, 4500, () => {
          if (!calm()) this._animate(s, s.pet, "greethop", 1400);
        });
        if (HOME_WEATHER[m.weather]) this._line(s, KEPT, HOME_WEATHER[m.weather], 4500, { type: m.type, perk: true });
        s.visitedAt = 0; // look in again now: the pet may want to ask about your day
        this._visit(s);
        break;
      }
      case "someone_home": // anyone signed in came home: nameless, shared screens only
        if (!sharedScreen()) break; // their own card says "you're home!!"
        line("someone's home!! ♥", 4000, () => this._animate(s, s.pet, "perk", 320));
        break;
      case "bond_record": { // only its person
        if (sharedScreen()) break; // nothing personal on a shared screen
        const game = GAMES.find((g) => g.key === m.game);
        const best = m.game === "dig" ? berries(m.wins) : `${m.wins}/5`; // the dig's best is berries banked
        line(`new best at ${game ? game.label : "a game"}! ${best} ♥`, 4500, () => this._sparkle(s), { perk: true });
        break;
      }
      case "tucked_in": {
        if (sharedScreen()) break; // nothing personal on a shared screen
        const bond = this._bond(s);
        const name = short((bond?.level >= BOND.nickname && bond.nickname) ||
          this._hass.user?.name?.trim().split(/\s+/)[0], 16);
        // Instead of the plain goodnight just said (or waiting), not after it.
        if (!capture && s.queue) s.queue = s.queue.filter((q) => q.type !== "fell_asleep");
        const thanks = withName(this._lines(s, "tucked_in", "thank you for tucking me in ♥").text, name);
        // This card's own tuck scene, before its sigh: the thanks is the scene's line (it says it there),
        // not a second one around the goodnight.
        const sc = s.scene;
        if (!capture && sc?.kind === "lights" && !sc.wake && !sc.fired.has("sigh")) {
          sc.thanks = { text: thanks, ms: 4000 };
          break;
        }
        line(thanks, 4000);
        break;
      }
      case "bond_favourite":
        if (!sharedScreen()) line(pick(["our favourite game! ♥", "i love playing this with you ♥"]), 4500, null, { perk: true });
        break;
      case "favourite_snack": // at most once a day (the server's); a holiday snack says its own
        if (!seasonNow(this._config)?.snack) {
          const food = short(m.food, 16);
          const said = this._lines(s, "favourite_snack", `${food}, my favourite!!`, food);
          // A snack scene playing it has the day's bighop and sparkle at its delight (plan 5.2): the
          // moment's own perk would be a second hop.
          const scene = s.scene?.kind === "snack" ? s.scene : null;
          if (scene) scene.fav = true;
          line(said.text, 4500, null, { catch: !said.baby, perk: !scene });
        }
        break;
      case "tv_off_late":
        say(pick(["*yawn* bedtime soon...", "all done! sleepy now..."]));
        break;
      case "first_snow":
        speak("the first snow!! ❄", 4500, () => {
          this._sparkle(s);
          this._animate(s, s.pet, "stretch", 1100);
        });
        break;
      case "first_frost":
        speak("brr, frost outside!", 4500, () => this._animate(s, s.pet, "sulk", 800));
        break;
      case "first_warm": // E12 Se-a
        speak(SEASON_FIRST_LINES.warm, 4500, () => this._animate(s, s.pet, "stretch", 1100));
        break;
      case "first_fog":
        speak(SEASON_FIRST_LINES.fog, 4500, () => this._look(s, 900));
        break;
      case "season_start": // ha-signals H7: a season's first day, with a sparkle
        if (Object.hasOwn(SEASON_START_LINES, m.season ?? "")) speak(pick(SEASON_START_LINES[m.season]), 4500, () => this._sparkle(s));
        break;
      case "pooped":
        now(() => {
          const img = s.poops[(m.count || 1) - 1];
          if (img) this._animate(s, img, "born", 450);
        });
        break;
    }
    // A kept moment with no line here (a baby's stage, a shared screen) is
    // done with all the same: the catch-up won't bring it back.
    if (!capture && !lined && at) this._markSaid(s, at);
  }

  // Fresh care (newest first): the viewer's own press is "mine" (the first new
  // entry with its action that arrives within MINE_MATCH_MS of it: by arrival,
  // never the two clocks, and never by the shared display name). Two kinds in
  // one update give the newest's reaction with one combined line (C4).
  _care(s, fresh) {
    // The viewer's recent presses, oldest first: two quick taps both count.
    // Each fresh entry uses up one matching press, so none is left to claim later care.
    // Claimed by kind (a lights_out entry is a lights press; plan 4.5).
    const pressed = (s.pressed || []).filter((p) => Date.now() - p.pressedAt < MINE_MATCH_MS);
    const claimed = new Set();
    for (const e of fresh) {
      const i = pressed.findIndex((p) => sceneKind(p.action) === sceneKind(e.action));
      if (i >= 0) {
        pressed.splice(i, 1);
        claimed.add(e);
      }
    }
    s.pressed = pressed;
    // Every entry is offered to the scenes, newest first, not only the newest: a feed and a
    // partner's praise in one update both count. What a scene takes is not played again.
    const rest = fresh.filter((e) => !this._sceneOffer(s, e, claimed.has(e)));
    if (!rest.length) return;
    const mine = rest.some((e) => claimed.has(e));
    const [newest] = rest;
    const other = rest.find((e) => e.action !== newest.action);
    const both = other && CARE_NOUNS[other.action] && CARE_NOUNS[newest.action] &&
      ["ok", "won", "lost"].includes(other.result) && ["ok", "won", "lost"].includes(newest.result)
      ? `${CARE_NOUNS[other.action]} and ${CARE_NOUNS[newest.action]}! ♥` : null;
    // While a scene plays, the rest is said only: no pose, no prop (the pet is busy eating).
    this._react(s, newest, { mine, both, busy: !!s.scene, offered: true });
  }

  _isSick(s) {
    return (this._state(s, "sensor.mood")?.attributes.flags || []).includes("sick");
  }

  // --- Fresh-expand E4: wake, bedtime, meals, medicine ---------------------------

  // Today's dream, if the states are today's (as the first look reads it).
  _dreamToday(s) {
    return !this._resumedAt && (s.house?.dream || this._state(s, "sensor.life_stage")?.attributes?.dream) || null;
  }

  // Today's dream as the first look says it (DREAMS), or null (E9 J-a, St-a).
  _dreamSaid(s) {
    return this._dreamText(s, this._dreamToday(s));
  }

  // --- Fresh-expand F2: dream stories ------------------------------------------------

  // A dream as said: a picked one's story (F2), else its DREAMS line; null if none.
  _dreamText(s, dream, date = turnNow()) {
    if (!dream) return null;
    if (dream.kind === "picked") return this._dreamStory(s, dream.pick, date);
    return DREAMS[dream.kind]?.(dream, this._words(s), this._worlds) || null;
  }

  // A picked dream's story for everyone: the shared two and the type's own, in turns per
  // pet; "you" names no one (DREAM_FRIENDS). Null with no pick (an older server).
  _dreamStory(s, pick, date = turnNow()) {
    if (!Object.hasOwn(DREAM_STORIES, pick)) return null;
    if (pick === "you") return DREAM_FRIENDS;
    return turnPick(this._storyList(s, pick), `${s.ids?.device}|dream|${pick}`, date);
  }

  _storyList(s, pick) {
    return [...DREAM_STORIES[pick], ...(PERSONA[this._typeKey(s)]?.[`dream_${pick}`] || [])];
  }

  // A told stars, sea or snacks story, kept to come back once (one key per pet, overwritten).
  _dreamStoryTold(s, pick, date = turnNow()) {
    if (!Object.hasOwn(DREAM_CALLBACK, pick)) return;
    try {
      localStorage.setItem(`hatch-dreamstory-${s.ids?.device}`, JSON.stringify({ pick, day: dayOrdinal(date) }));
    } catch (err) {
      // private mode: no callback
    }
  }

  // Its callback, 2-4 days after the story (by the pet and the story's day), once; a week
  // on, it lapses.
  _dreamCallback(s, date = turnNow()) {
    const key = `hatch-dreamstory-${s.ids?.device}`;
    try {
      const told = JSON.parse(localStorage.getItem(key) || "null");
      if (!told || !Object.hasOwn(DREAM_CALLBACK, told.pick) || !Number.isInteger(told.day)) return null;
      const ago = dayOrdinal(date) - told.day;
      const wait = DREAM_CALLBACK_DAYS[turnHash(`${s.ids?.device}|dreamcb|${told.day}`) % DREAM_CALLBACK_DAYS.length];
      if (ago < wait) return null;
      localStorage.removeItem(key);
      return ago <= 7 ? DREAM_CALLBACK[told.pick] : null;
    } catch (err) {
      return null;
    }
  }

  // Species nature, clock (N1): the sunset's or the morning's own lines for this species' clock,
  // or null (no nature: the usual lines). The moment's own rules decide when it is said.
  _clockLines(s, moment) {
    const n = nature(s.species);
    return n && CLOCK_LINES[moment]?.[n.clock] || null;
  }

  // Species nature, sky (N1): when the house has this species' sky up, its body reacts, once a
  // day, as one of its idle choices: a short action line and a perk (a settle for a slow one).
  // Body only, never a liking. Not for an egg, a baby or a child (plan section 10), a resting pet, a day the person's own
  // favourite-weather note was said, or within a minute of a weather line. The day's key is
  // spent only by a reaction, so a skipped look leaves it for a later one. True if it reacted.
  _skyReact(s, isCalm) {
    const n = nature(s.species);
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (!n || s.resting || s.egg || ["egg", "baby", "child"].includes(stage) || this._babyStage(s)) return false;
    if (Date.now() - (s.skySaid || 0) < SKY_WAIT_MS) return false;
    const device = s.ids?.device;
    if (usedToday(`favweather-said-${device}`)) return false;
    const flags = this._state(s, "sensor.mood")?.attributes.flags || [];
    if (!SKY_FLAGS[n.sky].some((f) => flags.includes(f))) return false;
    if (!oncePerDay(`sky-${device}`)) return false;
    this._write(s, pick(SKY_REACT[n.sky]), 3000);
    s.plain = s.bubble.textContent; // idle chatter isn't read out
    if (!isCalm) {
      if (paceOf(s.species) === "slow") this._animate(s, s.pet, "settle", 2500);
      else this._animate(s, s.pet, "perk", 320);
    }
    return true;
  }

  // S-a: a morning wake, in turns per pet; the dream line only on a dream day.
  _wakeLine(s, date = turnNow()) {
    const line = turnPick(WAKE_LINES, `${s.ids?.device}|wake`, date);
    return line === WAKE_LINES[WAKE_LINES.length - 1] && !this._dreamToday(s) ? WAKE_LINES[0] : line;
  }

  // The once-ever key of this pet's first bedtime while it is still due (a hatched pet in
  // its first day that has not said it), else null.
  _firstNightKey(s) {
    const stage = this._state(s, "sensor.life_stage");
    // A baby only: the first day ends before a pet is a child (and a test pet of 0 days can be any stage).
    if (stage?.state !== "baby" || !(stage.attributes?.age_days < 1)) return null;
    const key = `firstnight-${s.ids?.device}-${stage.attributes.generation || 1}`;
    return onceSeen(key) ? null : key;
  }

  // S-b: lights out after a visitor seen here today, else after today's sunset: once a
  // day on this device. Null: the usual line.
  _nightLine(s) {
    const seen = this._visitSeen(s);
    const midnight = new Date().setHours(0, 0, 0, 0);
    const sunset = (this._state(s, "sensor.last_care")?.attributes?.moments || [])
      .some((m) => m.type === "sunset" && new Date(m.at).getTime() > midnight);
    if (!seen && !sunset) return null;
    if (!oncePerDay(`nightcb-${s.ids?.device}`)) return null;
    return seen ? turnPick(NIGHT_VISITOR, `${s.ids?.device}|night`)(seen) : NIGHT_SUNSET;
  }

  // F-a, F-b: a feed's line, [text, ms] or null. The crumb now and then on a day a
  // visitor came by here (once a day); else half "yum" (its own food, in its own words),
  // half the meal of the hour. Baby talk keeps "yum".
  _mealLine(s, food, hour = new Date().getHours()) {
    const seen = this._visitSeen(s);
    if (seen && Math.random() < CRUMB_ODDS && oncePerDay(`crumb-${s.ids?.device}`)) {
      return [CRUMB_LINE(seen), 2500];
    }
    const part = mealPart(hour);
    const yum = food && (!part || this._babySet(s, "yum") || Math.random() < 0.5);
    if (yum) return [this._lines(s, "yum", `yum, ${food}!`, food).text, 2500];
    return part ? [this._fresh(s, "meal", MEAL_LINES[part]), 2500] : null;
  }

  // M-a: a cure seen here marks the day; the next day's first look says a line, once.
  _curedMark(s) {
    try {
      localStorage.setItem(`hatch-cured-${s.ids?.device}`, new Date().toDateString());
    } catch (err) {
      // no storage: no line tomorrow
    }
  }

  // The day-after line, or null (and a cure older than yesterday is forgotten).
  _curedLine(s) {
    const key = `hatch-cured-${s.ids?.device}`;
    try {
      const day = localStorage.getItem(key);
      if (!day) return null;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (day === new Date().toDateString()) return null; // tomorrow
      localStorage.removeItem(key);
      if (day !== yesterday.toDateString() || this._isSick(s) || !oncePerDay(`curedcb-${s.ids?.device}`)) return null;
      return turnPick(CURED_LINES, `${s.ids?.device}|cured`);
    } catch (err) {
      return null;
    }
  }

  // M-b: now and then a clean's extra bubble drifts up and pops. No line; none when calm.
  _bubblePop(s) {
    if (calm() || Math.random() >= BUBBLE_POP_ODDS) return;
    const img = document.createElement("img");
    img.className = "bubblepop";
    img.alt = "";
    img.src = `${BASE}/ui/prop_bubbles_1.png?v=${VERSION}`;
    s.prop.after(img);
    return { img, timer: setTimeout(() => img.remove(), 1300) };
  }

  // Medicine that worked (2b, C8): the viewer's own is theirs, someone else's a beat.
  _allBetter(s, mine) {
    this._line(s, mine ? MINE : BEAT, this._lines(s, "all_better", "all better! ♪").text,
      mine ? Math.max(3000, MINE_MS) : 3000, { write: true, type: "care" });
  }

  // What any care entry does, scene or not: the costume goes, a cure marks the day, a clean
  // may pop a bubble.
  _careMarks(s, entry) {
    s.screen.querySelector(".costume")?.remove(); // care takes the stage
    if (entry.action === "medicine" && entry.result === "ok") this._curedMark(s); // E4 M-a: a line at tomorrow's first look
    if (entry.action === "clean" && entry.result === "ok") this._bubblePop(s); // E4 M-b
  }

  // `offered`: _care has offered it to the scenes already; `busy`: a scene plays, so the
  // line only.
  _react(s, entry, { mine = false, both = null, busy = false, offered = false } = {}) {
    // A scene's own answer (the scene shows it, and its cheer says it when it ends).
    if (!offered && this._sceneOffer(s, entry, mine)) return;
    this._careMarks(s, entry);
    const cured = entry.action === "medicine" && entry.result === "ok";
    // One line at the end, of the press's class: the viewer's own is never
    // overwritten for MINE_MS; someone else's care waits its turn.
    let said = null;
    const out = () => {
      if (both) said = [both, 2500];
      if (!said) return;
      const [text, ms] = said;
      this._line(s, mine ? MINE : BEAT, text, mine ? Math.max(ms, MINE_MS) : ms, { write: true, type: "care" });
    };
    if (entry.action === "chore_treat") {
      said = ["a treat! someone did a chore ♪", 3500];
    }
    if (cured) said = [this._lines(s, "all_better", "all better! ♪").text, 3000];
    // A fake call whined for a praise, snack or play (spoiled) is taken as an ok, then the pet is smug.
    const spoiled = entry.result === "spoiled" && SPOILED_BY.has(entry.action);
    if (["ok", "won", "lost"].includes(entry.result) || spoiled) {
      const key = PROP_FOR[entry.action] || entry.action;
      // A won game's log can land just before the card closes the game: still its reaction.
      const inGame = entry.result === "won" || entry.result === "lost";
      const ok = entry.result === "ok" || spoiled;
      // A lost game: a good sport, acts.aww, else the content frames settle.
      const kind = entry.result === "lost" ? "lost" : entry.result === "won" ? "praised"
        : ok && (entry.action === "feed" || entry.action === "snack") ? "fed"
        : ok && entry.action === "praise" ? "praised"
        : ok && entry.action === "blanket" ? "tucked"
        : ok && entry.action === "scold" ? "scolded"
        : ok && entry.action === "fan" ? "aired" : null;
      // Praise: a spin for an adult now and then, else the type's move; both with hearts.
      const praise = kind === "praised" && !inGame;
      const variant = praise && s.drawn === "adult" ? this._careVariant(s, "praise", ["hearts", "spin"]) : undefined;
      const long = kind === "scolded" || kind === "aired" ? REACTIONS[kind].ms : undefined; // a flinch is short, a lean is long
      // The child's ladder (plan section 7): rung 1, the species' own reaction pose, with the
      // stage's move; else rung 3, the mood frame (_reactFrames), with the same move.
      const pose = s.species?.reactions?.[entry.result === "won" ? "won" : entry.action];
      const poseFrames = s.drawn === "child" && s.species?.extras?.[pose];
      if (busy) {
        // a scene has the stage: the line only
      } else if (poseFrames) {
        s.poseFrames = Array.isArray(poseFrames) ? poseFrames : [poseFrames];
        s.poseUntil = Date.now() + 2500;
        this._show(s, s.pet, s.poseFrames[0]);
        if (kind) this._reactFrames(s, kind, { inGame, frames: s.poseFrames, variant });
      } else if (kind) {
        this._reactFrames(s, kind, { inGame, ms: long, variant });
      }
      if (!busy && praise && !spoiled && !calm() && !s.asleep) this._bondHearts(s, "carehearts", variant === "spin" ? 1 : 2);
      if (entry.action === "fan" && !busy) { // the fan stands by, and its breeze crosses the scene
        s.screen.classList.add("breezy");
        clearTimeout(s.breezeTimer);
        s.breezeTimer = setTimeout(() => s.screen.classList.remove("breezy"), 2600);
      }
      const food = this._words(s).food;
      // The pet asked for the blanket or the fan by name: it thanks you (F11).
      if (entry.result === "ok" && (entry.action === "blanket" || entry.action === "fan")) {
        said = [TALK_COPY[entry.action], 3000];
      }
      if (entry.action === "feed" && entry.result === "ok") said = this._mealLine(s, food); // E4 F-a, F-b
      if (entry.action === "praise" && !spoiled) {
        said = [this._lines(s, "praise", "♥", undefined, { fresh: true }).text, 2500]; // P-c: a baby keeps "♥"
      }
      const season = seasonNow(this._config);
      const candy = season?.snack && key === "snack" ? `../ui/season_${season.key}_${season.snack}` : null;
      if (candy) {
        said = [pick(season.snackLines || ["a treat! ♪"]), 2500];
      }
      const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
      if (entry.action === "snack" && isHeavy(Number.isFinite(weight) ? weight : null) && Math.random() < 0.5) {
        said = [pick(HEAVY_SNACK), 3000];
      }
      if (spoiled) said = [this._lines(s, "REFUSALS.spoiled", REFUSALS.spoiled).text, 3500]; // "hehe, whining works"
      const prop = candy || s.species?.props?.[key] || FALLBACK_PROPS[key];
      if (prop && !busy && entry.action !== "play") { // a play is the ball beat at the tap (_startGame), not a prop here
        // The star rises above the head, the finger wags above it, the fan slides in; else it drops.
        const cls = entry.action === "praise" ? "above rise" : entry.action === "scold" ? "above wag"
          : entry.action === "fan" ? "slide" : "";
        this._propShow(s, prop, entry.action === "fan" ? 2600 : 2500, cls);
      }
      // The smug beat (plan 4.4): two rocks after the praise, snack or play it was whining for.
      if (spoiled && !busy && !calm()) {
        setTimeout(() => {
          if (!s.scene && !s.asleep && !s.game) this._animate(s, s.pet, "rock2", 1250);
        }, 1300);
      }
      out();
      return;
    }
    const line = REFUSALS[entry.result];
    if (REACT_REFUSALS.has(entry.result) && !busy) {
      // A refusal is a turn-away, a head shake, a yawn or a flop (not the same one twice).
      const pool = REFUSAL_VARIANTS[entry.result] || REFUSAL_POOL;
      const pick1 = this._careVariant(s, `refused.${entry.result}`, pool);
      this._reactFrames(s, "refused", { variant: pick1 === "look" ? undefined : pick1 });
      if (entry.result === "unfair") { // the finger wags at a pet that did nothing
        const finger = s.species?.props?.scold || FALLBACK_PROPS.scold;
        this._propShow(s, finger, 1800, "above wag");
      }
    }
    if (line) {
      said = [this._lines(s, `REFUSALS.${entry.result}`, line).text, 3500];
    }
    out();
  }
}

