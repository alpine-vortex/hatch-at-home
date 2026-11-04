class HatchPetCardGames extends HatchPetCardCare {
  // --- Games ----------------------------------------------------------------
  // The server keeps the game and the score (virtual_pet.play_game); the card
  // only asks, and shows what happened.

  _startGame(s, button) {
    this._tapped(button, s);
    if (s.game) this._quitGame(s, null); // Play mid-game starts over
    this._clearAsk(s); // a game takes the screen
    const energy = Number.parseFloat(this._state(s, "sensor.energy")?.state);
    const refusal = s.asleep ? REFUSALS.asleep : energy < 15 ? REFUSALS.too_tired : null;
    if (refusal) {
      this._write(s, refusal, 3500);
      return;
    }
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    this._rimCue(s, button?.dataset?.action); // play's two-point pulse
    s.screen.querySelector(".flair")?.remove();
    // A beat before the picker (care reactions, ship A): the ball drops in from the pad, the pet
    // perks at it, 600 ms. The picker does not wait: it opens now and the beat plays over its fade.
    const ball = s.species?.props?.play;
    if (ball && !s.egg) this._propShow(s, ball, 900);
    this._reactFrames(s, "played");
    // The pet's game of the day leads the list (G-a); the last game played keeps the focus.
    const today = this._gameOfDay(s);
    const games = [...GAMES].sort((a, b) => (b.key === today) - (a.key === today));
    if (games.length === 1) {
      this._pickGame(s, games[0].key);
      return;
    }
    // The long prompt wraps to two lines (over the picker) on a slide under 300 px.
    // Once a day the wide prompt is the game of the day's line (G-a); the day after
    // someone picked tomorrow's game, it's that game's line instead (F6), once.
    const picked = this._followGame(s);
    // F6: at any width. Where the games can't sit clear of a long line, it is said for 2 s,
    // then "pick a game!" (see _pickerSay).
    const pickLine = picked && !picked.said && (picked.said = true) && picked.line;
    const dayLine = pickLine || (oncePerDay(`gamepick-${s.ids?.device}`) &&
      (this._typeKey(s) ? GAME_PICK_LINES[today] : GAME_PICK_LINES.generic));
    s.game = { picking: true, prompt: dayLine || (this._slideW < 300 ? PICK_SHORT : "what shall we play?") };
    // Built each time: the card's options decide which games are offered.
    s.gameBox.querySelector(".gpick").innerHTML = games.map((g) =>
      `<button data-game="${g.key}">${g.label}</button>`).join("");
    this._hopRow(s); // behind experimental_hop: the Hop of the Day row, outside .gpick (plan section 5)
    this._gameView(s, "pick");
    // A narrow card has room for one short line beside the close button.
    this._pickerSay(s, s.game, s.game.prompt);
    let last = null;
    try {
      last = localStorage.getItem(LAST_GAME_KEY);
    } catch (err) {
      // no storage here (a private window): start from the first game
    }
    const pick = s.gameBox.querySelector(`.gpick [data-game="${last}"]`) ||
      s.gameBox.querySelector(".gpick button");
    pick.focus({ preventScroll: true });
    if (!picked) this._pickerFollow(s); // F6: tomorrow's game, picked yesterday
  }

  // F6: the game someone picked yesterday for today (from this pet's follow-up), or null.
  _followGame(s) {
    const f = s.followGame;
    return f && f.day === new Date().toDateString() && GAMES.some((g) => g.key === f.key) ? f : null;
  }

  // Fetched as the picker opens (the server marks it said): the picked game moves to the
  // front with the focus, and the wide prompt becomes its line.
  async _pickerFollow(s) {
    const reply = await this._followFetch(s, "picker");
    if (reply?.kind !== "game" || !GAMES.some((g) => g.key === reply.choice)) return;
    const line = turnPick(GAME_TOMORROW.day, `${s.ids?.device}|gamepick`);
    s.followGame = { key: reply.choice, day: new Date().toDateString(), line, said: false };
    if (!s.game?.picking) return;
    const list = s.gameBox.querySelector(".gpick");
    const button = list?.querySelector(`[data-game="${reply.choice}"]`);
    if (!button) return;
    list.prepend(button);
    button.focus({ preventScroll: true });
    s.followGame.said = true;
    this._pickerSay(s, s.game, line);
  }

  // The picker's line in the bubble, with the games fitted under it. A long line the games
  // can't sit clear of (a phone's narrow screen) is said for 2 s, then "pick a game!" (F6).
  _pickerSay(s, g, line) {
    g.prompt = line;
    this._write(s, line, 60000);
    if (this._fitPicker(s) || line === PICK_SHORT) return;
    this._gameLater(s, g, 2000, () => {
      g.prompt = PICK_SHORT;
      this._write(s, PICK_SHORT, 60000);
      this._fitPicker(s);
    });
  }

  // The picker sits under the close button (and the one-line prompt beside
  // it), down to the screen's foot. A column of games that doesn't fit there
  // wraps into rows (.wrap), so no width from 300 to 420 hides or covers one.
  // True when the games sit clear of the prompt and the close button (F6).
  _fitPicker(s) {
    const pick = s.gameBox.querySelector(".gpick");
    const gx = s.gameBox.querySelector(".gx");
    if (!pick || !gx || pick.hidden) return true;
    const box = s.gameBox.getBoundingClientRect();
    if (!box.height) return true;
    pick.classList.remove("wrap", "tight", "snug");
    // The Hop row (flag on) sits at the foot, outside .gpick: it is measured too, so no game
    // button covers it, and the picker's room is the box less its strip.
    const row = s.gameBox.querySelector(".ghop");
    const rowOn = !!row && !row.hidden;
    if (row) {
      row.classList.remove("slot", "tight", "snug");
      row.style.cssText = "";
    }
    pick.style.marginRight = "";
    pick.querySelectorAll("button").forEach((b) => { b.style.marginRight = ""; });
    const buttons = [...pick.querySelectorAll("button")];
    // First the plain column where it has always been, if it covers nothing: not
    // the close button, not the prompt, and none cut off at the foot.
    pick.style.top = pick.style.bottom = "";
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const keep = [gx, s.bubble].filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect())
      .filter((r) => r.height);
    if (rowOn) keep.push(row.getBoundingClientRect());
    if (buttons.every((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom + 4 <= box.bottom && !keep.some((k) => hit(r, k));
    })) return true;
    // The row's strip: the picker ends above it.
    const strip = () => (rowOn ? `${Math.round(box.bottom - row.getBoundingClientRect().top + 4)}px` : "2%");
    // The games' height, from the first one's top to the last one's foot, + the press shadow.
    const need = () => Math.max(...buttons.map((b) => b.offsetTop + b.offsetHeight)) -
      Math.min(...buttons.map((b) => b.offsetTop)) + 4;
    // Last resort on the smallest LCD (a 284 px card: two rows of 44 px don't fit under the close
    // button): `snug`, 36 px buttons and a 2 px gap. Only after the usual sizes have left a game
    // under the close button, the row or past the foot.
    let snugOk = false;
    const rows = () => {
      pick.classList.remove("wrap", "tight", "snug");
      if (need() > pick.clientHeight) pick.classList.add("wrap");
      if (need() > pick.clientHeight) pick.classList.add("tight");
      if (snugOk) pick.classList.add("snug"); // the last resort stays on once it was needed
      return need() <= pick.clientHeight;
    };
    const place = () => {
      row?.classList.remove("slot", "tight", "snug");
      if (row) row.style.cssText = "";
      buttons.forEach((b) => { b.style.marginRight = b.style.gridColumn = b.style.justifySelf = b.style.width = ""; });
      pick.style.bottom = strip();
      // Under the close button and, if it fits there, under a wrapped prompt too (F6).
      const bubble = keep.find((r) => r.left < box.left + box.width / 2);
      const under = snugOk ? 0 : Math.max(gx.getBoundingClientRect().bottom, bubble?.bottom || 0);
      const gap = snugOk ? 3 : 6;
      pick.style.top = `${Math.round(Math.max(under, snugOk ? gx.getBoundingClientRect().bottom : 0) - box.top + gap)}px`;
      let clear = rows();
      if (!clear) {
        pick.style.top = `${Math.round(gx.getBoundingClientRect().bottom - box.top + gap)}px`;
        rows();
      }
      if (rowOn && !rows()) clear = this._fitHopSlot(s, row, pick, box, rows) && clear;
      row?.classList.toggle("snug", pick.classList.contains("snug"));
      return clear;
    };
    let clear = place();
    // A game under the close button, the row, or past the foot: the snug sizes, once.
    const sound = () => {
      const kept = [gx, row].filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect());
      return buttons.every((b) => {
        const r = b.getBoundingClientRect();
        return r.bottom <= box.bottom + 0.5 && !kept.some((k) => hit(r, k));
      });
    };
    if (!sound()) {
      snugOk = true;
      place();
      // Snug sits under the close button only: clear if the prompt is not under the games.
      const bub = s.bubble && !s.bubble.hidden && s.bubble.getBoundingClientRect();
      clear = sound() && !(bub?.height && buttons.some((b) => hit(b.getBoundingClientRect(), bub)));
    }
    return clear;
  }

  // The strip left no room for the games (a 300 px card): the row joins the last line of the
  // wrapped games instead, to the right of the last button, shrunk to its label. The games go
  // back to the foot; the last one steps left by half the row so the pair is centred. If even
  // that has no room the row stays at the foot, label only.
  _fitHopSlot(s, row, pick, box, rows) {
    pick.style.bottom = "2%";
    rows();
    const buttons = [...pick.querySelectorAll("button")];
    const last = buttons[buttons.length - 1];
    row.classList.add("tight");
    if (pick.classList.contains("snug") && buttons.length % 2) {
      // Two even columns: the row takes the empty cell beside the last game.
      last.style.gridColumn = "1";
      last.style.justifySelf = "stretch";
      last.style.width = "auto";
      const at = last.getBoundingClientRect();
      row.classList.add("slot");
      row.style.cssText = `left:${Math.round(at.right + 3 - box.left)}px;top:${Math.round(at.top - box.top)}px;` +
        `height:${Math.round(at.height)}px;bottom:auto;right:auto;width:${Math.round(at.width)}px`;
      return rows();
    }
    row.style.cssText = "width: max-content; right: auto";
    const need = row.offsetWidth + 4;
    row.style.cssText = "";
    const lr = last.getBoundingClientRect();
    const sameLine = buttons.filter((b) => Math.abs(b.getBoundingClientRect().top - lr.top) < 4);
    if (sameLine.length === 1 && box.width - lr.width - 8 >= need) {
      last.style.marginRight = `${need}px`;
      const at = last.getBoundingClientRect();
      row.classList.add("slot");
      row.style.cssText = `left:${Math.round(at.right + 4 - box.left)}px;top:${Math.round(at.top - box.top)}px;` +
        `height:${Math.round(at.height)}px;bottom:auto;right:auto;width:${need - 4}px`;
      return rows();
    }
    row.style.cssText = "";
    pick.style.bottom = `${Math.round(box.bottom - row.getBoundingClientRect().top + 4)}px`;
    return rows();
  }

  // Show the picker ("pick") or a game's overlay (its key): the score and the number. A server game's two
  // inputs are on the shell (SHELL_MODES, entered by _pickGame), not in the overlay.
  _gameView(s, view) {
    const box = s.gameBox;
    box.hidden = false;
    box.classList.toggle("dig", view === "dig");
    box.classList.toggle("hop", view === "hop"); // the board's keys are the overlay's own (card-board.js)
    box.querySelector(".gpick").hidden = view !== "pick";
    const row = box.querySelector(".ghop");
    if (row) row.hidden = view !== "pick";
    const hopb = box.querySelector(".hopb");
    if (hopb) hopb.hidden = view !== "hop";
    s.gameNum.hidden = view !== "higher_lower" && view !== "dig";
    s.gameScore.hidden = view === "pick" || view === "hop";
  }

  async _pickGame(s, kind) {
    if (!s.game) return;
    try {
      localStorage.setItem(LAST_GAME_KEY, kind);
    } catch (err) {
      // no storage: the picker just won't remember
    }
    const g = s.game = { kind, round: 0, wins: 0, busy: false };
    s.pet.classList.remove("go-left", "go-right");
    this._gameView(s, kind);
    // The shell takes the game's two inputs and quit (slice 2). The focus goes to the first live slot
    // (before the busy flip below, so it is not quit). The same kind again (the F13 restart) only repaints.
    this._modeEnter(s, SHELL_MODES[kind], { from: s.buttons.play });
    // Playing together is the hello (F7): the day's "hi, <name>!" doesn't wait out the game.
    if (!s.greeted) this._greetSpent(s);
    this._reactFrames(s, "ready", { inGame: true }); // acts.ready, if the species has it
    const ready = s.species?.acts?.ready;
    if (!(Array.isArray(ready) || ready === true) && !calm()) this._animate(s, s.pet, "perk", 300); // F5: else a perk
    s.gameScore.textContent = "round 1/5";
    // The server keeps the game: a start while one of this kind runs carries
    // on (same round, wins and number), so the card adopts what it replies.
    g.busy = true;
    this._modeSync(s); // every slot but quit is blocked while the server answers
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: kind });
    if (!info) return;
    g.busy = false;
    g.round = info.round;
    g.wins = info.wins;
    g.lastAt = Date.now();
    this._modeSync(s);
    s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
    // The prompt is kept on the game: a care line said over it gives way to it again.
    if (kind === "dig") {
      // A fresh pile, or a parked dig carried on: the same round, bank and basket.
      g.basket = info.basket;
      this._digShow(s, info);
      g.prompt = "dig or keep?";
      const watcher = this._digWatcher(s);
      // A parked dig carried on says so first (F8), then the visitor, then the prompt.
      const resumed = !!(info.round || info.wins || info.basket);
      const said = [resumed && GAME_COPY.back, watcher && DIG_WATCH(watcher.name), g.prompt].filter(Boolean);
      this._write(s, said[0]);
      said.slice(1).forEach((line, i) => this._gameLater(s, g, 1500 * (i + 1), () => this._write(s, line, 60000)));
      s.sayUntil = Date.now() + 60000;
      // Keep is blocked on an empty basket: start on dig then (slot 4, else slot 1).
      this._modeButtons(s)[info.basket ? 0 : 3].focus({ preventScroll: true });
      return;
    } else if (kind === "left_right") {
      this._write(s, (g.prompt = "left or right? guess where i'll go!"));
    } else {
      // Higher or Lower shows its number before the next guess.
      this._showNumber(s, info.number);
      g.prompt = "will the next one be higher or lower?";
      if (!this._luckyNumber(s, g, info.number)) this._write(s, g.prompt);
    }
    s.sayUntil = Date.now() + 60000;
    this._modeButtons(s)[0].focus({ preventScroll: true });
  }

  // A delayed step of game `g`: dropped if the game ended or was replaced, and
  // cleared with the game (_endGame).
  _gameLater(s, g, ms, fn) {
    const timers = s.gameTimers ??= new Set();
    const id = setTimeout(() => {
      timers.delete(id);
      if (s.game === g) fn();
    }, ms);
    timers.add(id);
  }

  _showNumber(s, n) {
    s.gameNum.innerHTML = digit(n, 3);
    s.gameNum.dataset.n = String(n);
  }

  // A new number as a flip-clock does it: the old digit tips away (rotateX 0 -> 90, two steps), the new one
  // is swapped in while it is a line, and tips back, .16 s in all (`.gnum.flip`). A win keeps the perk
  // after it (`.win`). data-n is the new number at once. Reduced motion: the number, instantly.
  _flipNumber(s, n, win = false) {
    if (calm()) return this._showNumber(s, n);
    s.gameNum.dataset.n = String(n);
    s.gameNum.classList.toggle("win", win);
    this._animate(s, s.gameNum, "flip", win ? 500 : 250);
    setTimeout(() => { if (s.gameNum.dataset.n === String(n)) s.gameNum.innerHTML = digit(n, 3); }, FLIP_SWAP_MS);
  }

  // One play_game call; ends the game (with a line) on a failure or refusal.
  // A reply for a game that was stopped (or replaced) meanwhile is dropped.
  async _playCall(s, data) {
    const id = s.ids?.["sensor.mood"];
    if (!id) return null;
    const game = s.game;
    let info;
    try {
      const res = await this._hass.callService(
        "virtual_pet", "play_game", { entity_id: id, ...data, ...digShared(data.game) }, undefined, false, true);
      info = res?.response;
    } catch (err) {
      if (s.game === game) this._endGame(s, "hmm, that didn't work");
      return null;
    }
    if (s.game !== game) return null; // stopped while waiting
    if (!info || info.result !== "ok") {
      // A known refusal is said once, by _react, from the care log; only an
      // unknown result gets a line here. no_game is never logged (a Higher or
      // Lower game the server dropped for idling): said here.
      // A dig: keep on an empty basket means another screen kept it first (the same
      // person's: adopt the server's round, F16; anyone else's ends); no game while
      // theirs is parked means another screen of theirs put it aside (closes quietly).
      if (data.game === "dig" && info?.result === "empty_basket" && info.yours) {
        this._digAdopt(s, game, info);
        return null;
      }
      if (info?.result === "no_game" && !info.parked && data.guess && data.game !== "dig") {
        // F13: the server lost this game (a restart, the idle drop): the line comes true, a
        // new game starts after it (taps are ignored meanwhile: the game is still busy).
        this._write(s, REFUSALS.no_game, 60000);
        this._gameLater(s, game, 1500, () => this._pickGame(s, data.game));
        return null;
      }
      this._endGame(s, info?.result === "empty_basket" ? "oh! someone else is playing with me"
        : info?.result === "no_game" && info.parked ? GAME_COPY.parked
        : info?.result === "no_game" ? REFUSALS.no_game : REFUSALS[info?.result] ? null : "not now");
      return null;
    }
    return info;
  }

  async _guess(s, side) {
    if (!s.game || s.game.busy || !s.game.kind) return;
    const kind = s.game.kind;
    const game = GAMES.find((g) => g.key === kind);
    const guess = game.guesses[side === "left" ? 0 : 1];
    if (kind === "dig") {
      await this._digTap(s, guess); // a tap isn't a round: its own checks, not the ones below
      return;
    }
    const g = s.game;
    g.busy = true;
    const mark = g.tap = (g.tap || 0) + 1;
    this._modeSync(s);
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: kind, guess });
    if (!info) return;
    // Round 1 while we are past it can only be a new game (the server's `restarted`
    // flag is lost across an HA restart): adopt it the same way.
    if (info.restarted || (info.round === 1 && g.round > 0)) {
      // The server dropped our game for idling and this guess began a new one:
      // it is round 1 of that game, said as any round.
      g.round = 0;
      g.wins = 0;
    }
    if (info.round !== g.round + 1) {
      // Another viewer guessed on the same server game meanwhile.
      this._endGame(s, "oh! someone else is playing with me");
      return;
    }
    g.round = info.round;
    g.wins = info.wins;
    g.lastAt = Date.now();
    if (kind === "higher_lower") {
      this._flipNumber(s, info.number, !!info.correct);
      this._animate(s, s.pet, "perk", 300);
      this._write(s, info.correct ? `yes! ${info.number}` : `nope, ${info.number}!`);
    } else {
      s.pet.classList.add(`go-${info.went}`);
      this._write(s, info.correct ? "yes! you found me" : `nope, i went ${info.went}!`);
    }
    this._chirp(s, info.correct ? "tap" : "buzz"); // F14
    s.gameScore.textContent = `round ${info.round}/${info.rounds} · ${info.wins} right`;
    const prompt = kind === "higher_lower" ? "higher or lower?" : "one more! left or right?";
    const at = Date.now();
    // F1: the buttons come back as before, but the result stays in the bubble until it can
    // be read (GAME_READ_MS since this guess); a game's last guess waits longer (GAME_END_MS).
    this._gameLater(s, g, info.done ? GAME_END_MS : 900, () => {
      s.pet.classList.remove("go-left", "go-right");
      if (info.done) {
        if (info.won) this._chirp(s, "win");
        this._endGame(s, info.won ? `${info.wins}/${info.rounds}! you win ♪` :
          `${info.wins}/${info.rounds}. let's play another time ♪`);
        this._gameEndType(s, info.won);
        return;
      }
      g.busy = false;
      this._modeSync(s);
      s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
      g.prompt = prompt;
      if (kind === "higher_lower" && this._luckyNumber(s, g, info.number)) return;
      this._promptLater(s, g, mark, at);
    });
  }

  // F1: the bubble asks again only when nothing has been tapped since `mark` for
  // GAME_READ_MS (counted from that tap): a tap in between has its own result to show.
  _promptLater(s, g, mark, since = Date.now()) {
    const wait = Math.max(0, GAME_READ_MS - (Date.now() - since));
    this._gameLater(s, g, wait, () => {
      if (g.tap === mark && !g.busy) this._write(s, g.prompt, 60000);
    });
  }

  // --- Fresh-expand E5: games and dig --------------------------------------------

  // G-a: this pet's game of the day (the same all day; a type leans to its game).
  _gameOfDay(s) {
    const picked = this._followGame(s); // F6: someone's pick for today leads
    return picked ? picked.key : dailyPick(gameDayList(this._typeKey(s)), `${s.ids?.device}|game`);
  }

  // G-b: this pet's lucky number today, 1-9 (the server's numbers).
  _lucky(s) {
    return dailyPick([1, 2, 3, 4, 5, 6, 7, 8, 9], `${s.ids?.device}|lucky`);
  }

  // When higher or lower shows the lucky number: a sparkle and the line over the
  // number for 1.5 s, then the prompt; once a game, no score change. True: said.
  _luckyNumber(s, g, n) {
    if (g.lucky || n !== this._lucky(s)) return false;
    g.lucky = true;
    this._sparkle(s);
    this._write(s, LUCKY_LINE);
    this._gameLater(s, g, 1500, () => this._write(s, g.prompt, 60000));
    return true;
  }

  // G-c: the count line stays; half the time a teen or adult's own line 4 s later.
  _gameEndType(s, won) {
    const key = won ? "game_win" : "game_lose";
    const own = this._persona(s)?.[key];
    if (!own || Math.random() >= GAME_TYPE_ODDS) return;
    const line = this._fresh(s, key, own);
    setTimeout(() => { if (!s.game) this._line(s, FLAVOUR, line, 3500); }, GAME_TYPE_MS);
  }

  // D-a: a walking day visitor that came by here today watches a dig on a day screen:
  // its first frame, still, at the pile's other side, behind the buttons. The visitor, or null.
  _digWatcher(s) {
    const name = this._visitSeen(s);
    const v = name && visitorList(s.world).find((x) => x.name === name);
    if (!v || !v.walk || v.hours === "night" || this._screenDark(s)) return null;
    const img = document.createElement("img");
    img.className = "gwatch";
    img.alt = "";
    img.dataset.visitor = `${s.worldKey}/${v.id}`;
    img.src = `${BASE}/ui/visitor_${s.worldKey}_${v.id}_1.png?v=${VERSION}`;
    s.gameBox.prepend(img);
    return v;
  }

  // Berry dig: the pile's leaves left in .gnum, the bank and basket on the
  // score line, keep only with something in the basket.
  _digShow(s, info, flip = false, win = false) {
    if (flip) this._flipNumber(s, info.leaves, win);
    else this._showNumber(s, info.leaves);
    s.gameNum.setAttribute("aria-label", `${info.leaves} leaves left`);
    s.gameScore.classList.add("two");
    s.gameScore.textContent = `round ${Math.min(info.round + 1, info.rounds)}/${info.rounds}\n` +
      `${info.wins} banked · basket ${info.basket}`;
    this._modeSync(s); // keep reads the basket (blocked when empty), both read busy
  }

  // One tap of a Berry dig. A dig that finds a berry doesn't finish a round, so
  // the reply must follow from the card's own game: a berry is the same round
  // and bank with one more in the basket; a bee is the next round, the same
  // bank; a keep (or the sixth berry) is the next round with the basket banked.
  // Anything else means someone else is playing the same server game.
  async _digTap(s, guess) {
    const g = s.game;
    if (guess === "keep" && !g.basket) {
      // Nothing to keep: the server would refuse it. Say so (F12), then the prompt again.
      const mark = g.tap = (g.tap || 0) + 1;
      this._write(s, GAME_COPY.empty, 60000, MINE);
      this._gameLater(s, g, 2000, () => {
        if (g.tap === mark && !g.busy) this._write(s, g.prompt, 60000);
      });
      return;
    }
    g.busy = true;
    const mark = g.tap = (g.tap || 0) + 1;
    this._modeSync(s);
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: "dig", guess });
    if (!info) return;
    const next = info.round === g.round + 1 && info.basket === 0;
    const fits = info.found === "berry" && !info.round_over
      ? info.round === g.round && info.wins === g.wins && info.basket === g.basket + 1
      : info.found === "bee" ? next && info.wins === g.wins
      : info.found === "kept" ? next && info.wins === g.wins + g.basket
      : info.found === "berry" && next && info.wins === g.wins + g.basket + 1;
    // F16: out of step but the server says it is this person's own dig (their other
    // screen played): adopt the server's round, bank and basket, say so once. Anyone
    // else's reply out of step still ends.
    const adopted = !fits && !!info.yours && !!info.found;
    if (!fits && !adopted) {
      this._endGame(s, "oh! someone else is playing with me");
      return;
    }
    const say = (line) => this._write(s, adopted ? GAME_COPY.dugThere : line);
    g.round = info.round;
    g.wins = info.wins;
    g.basket = info.basket;
    g.lastAt = Date.now();
    this._digShow(s, info, true, info.found !== "bee"); // a berry or a safe basket is a win: the counter perks
    if (info.found === "bee") {
      s.propEl.src = BEE_FRAMES[0];
      s.propEl.style.left = "10%"; // beside the pile, clear of the score and the buttons
      s.propEl.style.bottom = "40%";
      s.propEl.style.transform = "";
      s.propEl.hidden = false;
      say("bzz! the berries rolled away");
      this._reactFrames(s, "refused", { inGame: true }); // F5: a bored look at the bee
      this._chirp(s, "buzz"); // F14
    } else if (info.round_over) {
      this._animate(s, s.pet, "perk", 300);
      say("safe in the basket ♪");
      this._chirp(s, "tap");
    } else if (Math.random() < SHINY_ODDS) {
      this._sparkle(s); // D-b: a shiny one, said only (the berry is the server's, the same)
      say(SHINY_LINE);
      this._animate(s, s.pet, "perk", 300); // F5
      this._chirp(s, "tap");
    } else {
      say("a berry!");
      this._animate(s, s.pet, "perk", 300); // F5
      this._chirp(s, "tap");
    }
    const at = Date.now();
    // F1: keep and dig come back on the same timers as before; the result stays in the
    // bubble until GAME_READ_MS after the tap, and the game's last one a little longer.
    this._gameLater(s, g, info.done ? GAME_END_MS : info.round_over ? 900 : 300, () => {
      s.propEl.hidden = true;
      if (info.done) {
        if (info.won) this._chirp(s, "win");
        this._endGame(s, info.won ? `${info.wins} berries! you win ♪` : `${berries(info.wins)}. let's dig another time ♪`);
        this._gameEndType(s, info.won);
        return;
      }
      g.busy = false;
      this._digShow(s, info);
      g.prompt = "dig or keep?";
      this._promptLater(s, g, mark, at);
      // Keep is blocked on an empty basket: focus on it moves to dig.
      const [keep, dig] = [this._modeButtons(s)[0], this._modeButtons(s)[3]];
      if (!g.basket && this.shadowRoot?.activeElement === keep) dig.focus({ preventScroll: true });
    });
  }

  // F16: keep on an empty basket, from this person's own other screen having kept it
  // first: the reply carries where the dig stands, no tap of ours was played. Adopt it.
  _digAdopt(s, g, info) {
    g.round = info.round;
    g.wins = info.wins;
    g.basket = info.basket;
    g.lastAt = Date.now();
    g.busy = false;
    g.prompt = "dig or keep?";
    this._digShow(s, info, true);
    this._write(s, GAME_COPY.dugThere, 60000);
    s.sayUntil = Date.now() + 60000;
    this._modeButtons(s)[3].focus({ preventScroll: true });
  }
}

