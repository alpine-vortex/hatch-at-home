const FETCH_STYLE = `
  .screen .fetch-home, .screen .fetch-aim, .screen .fetch-recall {
    position: absolute; display: grid; place-items: center; box-sizing: border-box;
    min-width: 44px; min-height: 44px; padding: 0; cursor: pointer; pointer-events: auto;
    font: inherit; line-height: 1; -webkit-tap-highlight-color: transparent;
  }
  .screen .fetch-home {
    top: min(74%, calc(100% - 24px)); right: max(2px, calc(17% - 22px));
    width: 44px; height: 44px; translate: 0 -50%; z-index: 3;
    border: 0; border-radius: 50%; background: transparent;
  }
  .screen .fetch-home[hidden], .screen.show-status .fetch-home, .slide.away-slide .fetch-home,
  .screen:has(> .askday, > .game:not([hidden]), > .boot:not([hidden])) .fetch-home { display: none; }
  .screen .fetch-home img { position: static; width: 26px; height: 26px; }
  .screen .fetch-home:hover { background: rgb(255 253 245 / .24); }
  .screen:has(> .fetch-home:not([hidden])), .screen.fetching {
    -webkit-tap-highlight-color: transparent;
  }
  .screen.fetching > .activity-panel { background: transparent; }
  .screen.fetching > :is(.pet, .ghost, .perch, .drape, .sitter, .bubble, .awaylabel, .basket, .pat) {
    visibility: hidden;
  }
  .screen .fetch-arena { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .screen .fetch-dog {
    width: var(--fetch-dog-width, 47%); aspect-ratio: 1; translate: -50% -87.5%;
  }
  .screen .fetch-ball {
    width: 26px; height: 26px; translate: -50% -50%;
    filter: drop-shadow(0 1px 0 #38291d);
  }
  .screen :is(.fetch-aim, .fetch-recall) {
    translate: -50% -50%; padding: 0 7px; border: 2px solid #3a2a1a; border-radius: 12px;
    background: #fffdf5; color: #3a2a1a; box-shadow: 2px 2px 0 #3a2a1a;
    font-size: 13px;
  }
  ha-card.bigtext .screen :is(.fetch-aim, .fetch-recall) { font-size: 16px; }
  .screen .fetch-aim { top: 51%; }
  .screen .fetch-aim.straight { left: 22%; }
  .screen .fetch-aim.bank { left: 78%; }
  .screen .fetch-recall { top: 65%; left: 76%; width: max-content; white-space: nowrap; }
  .screen .fetch-aim span { display: block; text-align: center; }
  .screen :is(.fetch-home, .fetch-aim, .fetch-recall):focus-visible {
    outline: 3px solid #fffdf5; outline-offset: -2px; box-shadow: inset 0 0 0 5px #3a2a1a;
  }
`;

// Coordinates are LCD percentages. The dog's point is between its front and
// back paws, not the centre of its frame. Direction changes at a waypoint.
const FETCH_HOME = {
  ball: [83, 74],
  dog: [51, 86, 1],
};
const FETCH_FAR_EDGE = 93;
const FETCH_ROLLS = {
  straight: {
    label: "Straight roll",
    outcome: "Caught it on the roll!",
    duration: 790,
    ball: [[0, ...FETCH_HOME.ball], [220, 50, 79], [530, 26, 84], [675, 21, 85]],
    dog: [[0, 51, 86, -1], [180, 51, 86, -1], [580, 32, 89, -1], [675, 32, 89, -1]],
  },
  bank: {
    label: "Banked roll",
    outcome: "It bounced past!",
    duration: 1330,
    ball: [[0, ...FETCH_HOME.ball], [290, FETCH_FAR_EDGE, 72], [530, 72, 66], [980, 43, 64], [1320, 34, 64]],
    dog: [[0, ...FETCH_HOME.dog], [140, ...FETCH_HOME.dog], [560, 78, 81, -1], [655, 78, 81, -1],
      [1030, 61, 76, -1], [1320, 51, 75, -1]],
  },
};

function fetchPoint(path, elapsed) {
  const next = path.findIndex(([at]) => at > elapsed);
  if (next < 0) return path.at(-1).slice(1);
  const [at, x, y, facing] = path[next - 1];
  const [until, endX, endY] = path[next];
  const progress = (elapsed - at) / (until - at);
  return [x + (endX - x) * progress, y + (endY - y) * progress, facing];
}

function fetchReturn(roll) {
  const [x, y] = fetchPoint(roll.dog, roll.duration);
  const [ballX, ballY] = fetchPoint(roll.ball, roll.duration);
  // Pick up the ball, turn back together, then nudge it to the launch spot.
  const pickup = [Math.min(x, ballX + 8), Math.min(y, ballY + 15)];
  const handoff = [62, 74];
  return {
    duration: 970,
    ball: [[0, ballX, ballY], [180, ballX, ballY], [300, pickup[0] + 9, pickup[1] - 14],
      [690, ...handoff], [970, ...FETCH_HOME.ball]],
    dog: [[0, x, y, -1], [180, ...pickup, -1], [300, ...pickup, 1], [690, ...FETCH_HOME.dog]],
  };
}

class HatchPetCardFetch extends HatchPetCardActivity {
  _fetchCanOpen(s) {
    return s.worldKey === "hearth" && s.speciesId === "corgi" && this._patOn(s) &&
      s.species.stages.includes(s.drawn) && !s.egg && !s.asleep && !s.lightsOut &&
      !s.calling && !s.sick && s.moodState !== "sick" &&
      !s.visitor && !s.seasonVisit && !s.reveal && !s.collecting;
  }

  _fetchAffordance(s) {
    const play = s.species?.props?.play;
    const fetching = s.fetch;
    if (fetching && (s.worldKey !== "hearth" || s.speciesId !== "corgi" || s.drawn !== fetching.stage || s.lightsOut)) {
      this._activityClose(s, "changed");
    }
    const visible = !!play && this._fetchCanOpen(s);
    if (visible && !s.fetchButton) {
      const button = document.createElement("button");
      button.className = "fetch-home";
      button.type = "button";
      button.setAttribute("aria-label", "Play fetch");
      button.title = "Play fetch";
      const ball = document.createElement("img");
      ball.alt = "";
      ball.src = spriteSrc(s.speciesId, play);
      button.append(ball);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail !== 0 && this._swiped) return;
        this._fetchOpen(s, button);
      });
      s.screen.append(button);
      s.fetchButton = button;
    }
    if (s.fetchButton) s.fetchButton.hidden = !visible;
  }

  _fetchOpen(s, from) {
    if (!this._fetchCanOpen(s) || s.fetch) return;
    const stage = s.drawn;
    const sp = s.species;
    const ready = sp.acts?.ready?.includes(stage) ? [`${stage}_ready_1`, `${stage}_ready_2`] : null;
    const signature = stage === "adult" ? sp.signature?.adult : null;
    const poses = signature || ready || this._petFrames(sp, stage, "excited", false);
    const f = s.fetch = {
      stage, poses, pose: poses[0], phase: "aim", direction: null,
      ball: FETCH_HOME.ball, dog: FETCH_HOME.dog,
    };
    const opened = this._activityOpen(s, {
      id: "fetch",
      title: "Fetch",
      text: () => this._fetchText(f),
      scene: true,
      holdCapFocus: true,
      from,
      buttons: () => this._fetchButtons(s, f),
      render: (box) => this._fetchRender(box, s, f),
      close: () => this._fetchClosed(s),
    });
    if (!opened) {
      s.fetch = null;
      return;
    }
    s.screen.classList.add("fetching");
    this._fetchAffordance(s);
  }

  _fetchText(f) {
    if (f.phase === "aim") return "Aim left or right.";
    if (f.phase === "returning") return "Here they come…";
    const roll = FETCH_ROLLS[f.direction];
    return f.phase === "rolling" ? `${roll.label}…` : roll.outcome;
  }

  _fetchButtons(s, f) {
    return [
      { label: "Straight roll", cap: "straight", icon: "icon_mode_left", keys: ["ArrowLeft"],
        disabled: f.phase !== "aim", act: () => this._fetchRoll(s, "straight") },
      { label: "Banked roll", cap: "bank", icon: "icon_mode_right", keys: ["ArrowRight"],
        disabled: f.phase !== "aim", act: () => this._fetchRoll(s, "bank") },
      { label: "Call Back", cap: "call back", icon: "icon_mode_undo", keys: ["ArrowDown"],
        disabled: f.phase !== "settled", act: () => this._fetchRecall(s) },
    ];
  }

  _fetchRender(box, s, f) {
    const arena = document.createElement("div");
    arena.className = "fetch-arena";
    const dog = document.createElement("img");
    dog.className = "fetch-dog";
    dog.alt = "";
    dog.style.setProperty("--fetch-dog-width", `${46.5 * (s.species.scale?.[f.stage] || 1)}%`);
    const ball = document.createElement("img");
    ball.className = "fetch-ball";
    ball.alt = "";
    this._show(s, ball, s.species.props.play);
    arena.append(dog, ball);
    if (f.phase === "aim") {
      const straight = this._fetchTarget(s, 0, "fetch-aim straight", "←", "Straight", "Straight roll");
      const bank = this._fetchTarget(s, 1, "fetch-aim bank", "↱", "Bank", "Banked roll");
      arena.append(straight, bank);
    } else if (f.phase === "settled") {
      arena.append(this._fetchTarget(s, 2, "fetch-recall", "", "Call Back"));
    }
    box.append(arena);
    f.els = { arena, dog, ball };
    this._fetchPaint(s, f);
  }

  _fetchTarget(s, slot, className, arrow, label, aria = label) {
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.setAttribute("aria-label", aria);
    if (arrow) {
      const mark = document.createElement("span");
      mark.textContent = arrow;
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.append(label);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.detail !== 0 && this._swiped) return;
      if (s.fetch?.els?.arena.contains(button)) this._modeClick(s, slot);
    });
    return button;
  }

  _fetchPaint(s, f) {
    const { dog, ball } = f.els;
    ball.style.left = `${f.ball[0]}%`;
    ball.style.top = `${f.ball[1]}%`;
    dog.style.left = `${f.dog[0]}%`;
    dog.style.top = `${f.dog[1]}%`;
    dog.style.scale = `${f.dog[2]} 1`;
    this._show(s, dog, f.pose);
  }

  _fetchMoveFocus(s, f, slot) {
    const active = this.shadowRoot?.activeElement;
    const caps = this._modeButtons(s);
    if (active && (f.els?.arena.contains(active) || caps.slice(0, 3).includes(active))) {
      caps[slot]?.focus({ preventScroll: true });
    }
  }

  _fetchRoll(s, direction) {
    const f = s.fetch;
    if (f?.phase !== "aim" || !Object.hasOwn(FETCH_ROLLS, direction)) return;
    f.direction = direction;
    this._fetchMoveFocus(s, f, direction === "straight" ? 0 : 1);
    this._fetchRun(s, f, FETCH_ROLLS[direction], "rolling", "settled", 2);
  }

  _fetchRecall(s) {
    const f = s.fetch;
    if (f?.phase !== "settled") return;
    this._fetchMoveFocus(s, f, 2);
    this._fetchRun(s, f, fetchReturn(FETCH_ROLLS[f.direction]), "returning", "aim", 0);
  }

  _fetchRun(s, f, route, moving, done, focus) {
    const paint = (elapsed) => {
      f.ball = fetchPoint(route.ball, elapsed);
      f.dog = fetchPoint(route.dog, elapsed);
      // Alternate the two available poses only while moving; the catch has a still.
      const frame = elapsed === route.duration ? 0 : Math.floor(elapsed / 130) % f.poses.length;
      f.pose = f.poses[frame];
    };
    const finish = () => {
      if (s.fetch !== f || f.phase !== moving) return;
      f.phase = done;
      paint(route.duration);
      this._activityUpdate(s);
      this._fetchMoveFocus(s, f, focus);
    };
    f.phase = moving;
    if (calm()) {
      finish();
      return;
    }
    paint(0);
    this._activityUpdate(s);
    const started = performance.now();
    const tick = (now) => {
      if (s.fetch !== f || f.phase !== moving) return;
      const elapsed = Math.max(0, now - started);
      if (elapsed >= route.duration || calm()) {
        finish();
        return;
      }
      paint(elapsed);
      this._fetchPaint(s, f);
      frame();
    };
    const frame = () => this._director.frame(s, tick, { key: "fetch.motion", hidden: "tab", undo: finish });
    frame();
  }

  _fetchClosed(s) {
    s.fetch = null;
    this._stop(s, { key: "fetch.motion" });
    s.screen.classList.remove("fetching");
  }
}
