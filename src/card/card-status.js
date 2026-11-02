class HatchPetCardStatus extends HatchPetCardMoment {
  _renderStatus(s, log) {
    if (s.laySheet) {
      this._renderLaySheet(s);
      return;
    }
    if (s.nameSheet) {
      this._renderNameSheet(s);
      return;
    }
    if (s.everyWorld) {
      this._renderEveryWorld(s);
      return;
    }
    if (s.finds) {
      this._renderFinds(s);
      return;
    }
    if (s.journal) {
      this._renderJournal(s);
      return;
    }
    if (s.settings) {
      if (s.picker && !this._shellPickable(s)) this._closePicker(s);
      if (s.picker) this._renderPicker(s);
      else this._renderSettings(s);
      return;
    }
    const value = (key) => {
      const v = Number.parseFloat(this._state(s, `sensor.${key}`)?.state);
      return Number.isFinite(v) ? v : null;
    };
    const hearts = (v, full = Infinity) => {
      if (v === null) return "–";
      // 4 hearts, in halves, to the nearest; a pet the server calls full is full.
      const halves = v >= full ? 8 : Math.round(v / 12.5);
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < 4; i++) {
        const left = halves - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="${Math.round(v)} of 100">${out}</span>`;
    };
    const stageAttrs = this._state(s, "sensor.life_stage")?.attributes || {};
    const traits = (stageAttrs.traits || []).map((t) => traitLabel(t, stageAttrs.trait_levels?.[t],
      t === stageAttrs.inherited_trait));
    // The trait it's closest to learning, while it has room for another.
    const held = new Set(stageAttrs.traits || []);
    const cap = stageAttrs.trait_cap ?? TRAIT_CAP;
    const nextTrait = held.size < cap
      ? Object.entries(stageAttrs.trait_progress || {})
        .filter(([t, p]) => !held.has(t) && FLAIR[t] && p > 0.05 && p < 1)
        .sort((a, b) => b[1] - a[1])[0]
      : null;
    // The viewer's own bond, in five hearts (a half heart a level).
    const bond = this._bond(s);
    const bondHearts = (level) => {
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < BOND.max / 2; i++) {
        const left = level - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="bond level ${level} of ${BOND.max}">${out}</span>`;
    };
    // The social meter (top10 §6): the pet's week beyond the house, five hearts in
    // halves; hidden at 0 and from an older server.
    const social = Number(stageAttrs.social_level) || 0;
    const socialHearts = (level) => {
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < SOCIAL_MAX / 2; i++) {
        const left = level - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="friends this week: ${level} of ${SOCIAL_MAX}">${out}</span>`;
    };
    const ic = (n) => pixelIcon(n, 18);
    const bar = (v) => v === null ? "–"
      : `<div class="bar" role="img" aria-label="${Math.round(v)} of 100"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 3).map((e) =>
      `<div>${escape(e.action.replace("_", " "))}${e.by && !sharedScreen() ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}` +
      `${e.result && e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))}${e.score ? ` ${escape(e.score)}` : ""})` : ""}</div>`);
    const row = (iconName, label, value) =>
      `<div class="row">${iconName ? ic(iconName) : "<span></span>"}<span>${label}</span>${value}</div>`;
    const adult = this._state(s, "sensor.life_stage")?.state === "adult";
    const teenOrAdult = adult || this._state(s, "sensor.life_stage")?.state === "teen";
    const isEgg = this._state(s, "sensor.life_stage")?.state === "egg";
    // The creature picked for the next egg (if any), and its world if that changes.
    // Only an offered one (raised, S2) is named: a pick made in HA outside the offer reads as
    // a surprise, and an adult always has the row (S2, N7).
    const offerNow = this._eggOffer(s);
    const picked = offerNow?.choice?.name.toLowerCase();
    const heldPick = stageAttrs.next_egg && !picked ? SETUP_COPY.eggSurprise : null; // any stage
    const nextEgg = [picked || heldPick || (adult ? SETUP_COPY.eggSurprise : null),
      stageAttrs.next_world && `in ${stageAttrs.next_world}`].filter(Boolean).join(" ");
    const nextStage = growsUp(this._state(s, "sensor.life_stage")?.state, stageAttrs.age_days);
    // What it would like most, above today's wish; none asleep, away or in the egg.
    const moodNow = this._state(s, "sensor.mood");
    const wantKey = moodNow?.attributes.reason_key;
    const wantsNow = (moodNow?.attributes.flags || []).includes("sick") ? "sick"
      : (moodNow?.attributes.requests || []).find((r) => r !== "lay_egg" && WANT_WORDS[r]
        && this._state(s, `button.${r}`));
    const want = s.asleep || moodNow?.state === "away" || isEgg ? null
      : (String(wantKey).startsWith("call_") && WANT_WORDS[wantKey]) || WANT_WORDS[wantsNow]
        || (isHeavy(value("weight")) ? "a game, to run it off" : null);
    // How care is going, beside the upbringing it shapes (top10 4a; was in settings).
    const careMisses = this._state(s, "sensor.care_misses");
    // A new pet's page doesn't open on zeros that count failures: the two rows come with the first miss (UX fix 4, F12).
    const missed = Number.parseFloat(careMisses?.state) || 0;
    const whined = Number(careMisses?.attributes.discipline_misses) || 0;
    const misses = missed || whined
      ? row(null, "missed calls", `<span>${missed}</span>`) + row(null, "ignored whines", `<span>${whined}</span>`) : "";
    // Today's wish comes first of the rest: it changes daily, the rest is there every day.
    // Its day so far (E9 St-a): the evening's today line, else today's dream. A page, not a bubble.
    // Resting (R1): said on its page whatever its pose (a sick resting pet shows sick); away
    // shows the sitter's sign instead.
    const restNow = !isEgg && moodNow?.state !== "away" && (moodNow?.attributes.flags || []).includes("resting");
    const today = !isEgg && ((this._evening() && this._todayLine(s)) || this._dreamSaid(s));
    // An egg has no meters or traits to read: "you two" and when it hatches (UX fix 2, F12).
    // The status is the pet's own page: its head and name at the band's left (UX fix 2, F10).
    const petName = this._hass.devices?.[s.ids?.device]?.name_by_user || this._hass.devices?.[s.ids?.device]?.name || "";
    const who = petName ? `<span class="who">${isEgg ? "" : `<span class="whohead"></span>`}<span class="whoname">${escape(petName)}</span></span>` : "";
    const band = `<div class="shead">${who}${this._gearButton()}</div>`;
    const eggLeft = isEgg ? this._eggMinutes(this._state(s, "sensor.life_stage")) : null;
    const eggRow = eggLeft === null ? "" : row(null, "hatching", `<span>${escape(eggLeft <= 6 ? STATUS_COPY.eggCracking
      : eggLeft <= 15 ? STATUS_COPY.eggSoon : STATUS_COPY.eggGrowing)}</span>`);
    // The first day (egg and baby) can still be named, by anyone (settings S3, N11).
    const nameRow = (isEgg || this._state(s, "sensor.life_stage")?.state === "baby") && petName
      ? row(null, SETUP_COPY.nameRow, `<span class="nameval"><span class="nm">${escape(petName)}</span>` +
        `<button class="bell namechange">${SETUP_COPY.nameChange}</button></span>`) : "";
    const html = isEgg ? `
      ${band}
      ${bond ? row(null, "you two", bondHearts(bond.level)) : ""}
      ${eggRow}
      ${nameRow}
      <button class="jlink">journal ›</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>` : `
      ${band}
      ${restNow ? `<div class="stoday restnow">${REST_LABEL}</div>` : ""}
      ${today ? `<div class="stoday">${escape(today)}</div>` : ""}
      ${want ? row(null, "would like", `<span>${escape(want)}</span>`) : ""}
      ${stageAttrs.wish && WISHES[stageAttrs.wish.kind] ? row(null, "wish", stageAttrs.wish.granted
        ? `<span>♥ came true!</span>` : `<span>♡ ${escape(this._wishLine(stageAttrs.wish, s)[1])}</span>`) : ""}
      ${bond ? row(null, "you two", bondHearts(bond.level)) : ""}
      ${row("icon_feed", "hunger", hearts(value("hunger"), FEED_FULL_AT))}
      ${row("icon_play", "happy", hearts(value("happiness")))}
      ${row("stat_energy", "energy", bar(value("energy")))}
      ${row("stat_health", "health", bar(value("health")))}
      ${row("stat_discipline", "discipline", bar(value("discipline")))}
      ${social > 0 && !isEgg ? row("stat_heart_full", "friends", socialHearts(social)).replace('class="row"', 'class="row friendsrow" role="button" tabindex="0"') : ""}
      ${row(null, "weight", `<span>${weightLabel(value("weight"))}</span>`)}
      ${row(null, traits.length > cap ? "traits" : `traits ${traits.length}/${cap}`, `<span>${traits.length ? traits.join(" · ") : "none yet"}</span>`)}
      ${nextTrait ? row(null, "learning", `<span class="tnext">${traitIcon(nextTrait[0])}` +
        `<span class="tname">${escape(nextTrait[0].replaceAll("_", " "))}</span>${bar(Math.round(nextTrait[1] * 100))}</span>`) : ""}
      ${stageAttrs.upbringing ? row(null, adult ? "raised" : "growing up", `<span>${escape(stageAttrs.upbringing)}</span>`) : ""}
      ${isEgg ? "" : misses}
      ${stageAttrs.personality && teenOrAdult ? row(null, "personality", `<span>${escape(stageAttrs.personality.replaceAll("_", " "))}</span>`) : ""}
      ${nextStage ? row(null, nextStage[0], `<span>${nextStage[1]}</span>`) : ""}
      ${nextEgg ? row(null, "next egg", `<span>${escape(nextEgg)}</span>`) : ""}
      ${nameRow}
      <div class="log">${lines.join("") || "<div>all new here ♪</div>"}</div>
      <button class="jlink">journal ›</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    // The friends row says what it counts (UX8 F9); the tap is not a tap on the screen behind.
    const friends = s.status.querySelector(".friendsrow");
    friends?.addEventListener("click", (e) => {
      e.stopPropagation();
      const at = friends.getBoundingClientRect(); // the note must not cover the row (as _tapped)
      this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
      this._statusMessage(s, STATUS_COPY.friendsHint);
    });
    friends?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); friends.click(); }
    });
    const head = s.status.querySelector(".whohead");
    if (head) this._headCrop(s, head, 14, 3);
    this._journalLink(s, true);
    this._gearLink(s);
    s.status.querySelector(".namechange")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._openName(s, "status");
    });
  }

  // The settings sheet, in the status box like the journal: the viewer's own
  // switches (none on a shared screen), then this browser's.
  _renderSettings(s) {
    const bond = this._bond(s);
    const notifying = !!s.mine?.notify_me;
    const myDay = this._mineSwitch(s, "my_day", this._myDay);
    const birthdayKept = this._mineSwitch(s, "birthday_kept", this._birthdayKept);
    const birthdayPhone = this._mineSwitch(s, "birthday_phone", this._birthdayPhone);
    const row = (iconName, label, value) =>
      `<div class="row srow"><span>${label}</span>${value}</div>`;
    // A two-tap "forget", armed or not (confirmTap).
    const forgetButton = (cls, key, aria) => {
      const sure = confirmArmed(s, key);
      return `<span><button class="bell ${cls}" aria-label="${sure ? CONFIRM_ARIA[key] : aria}">${sure ? "sure? tap again" : "forget"}</button></span>`;
    };
    // Their favourites, each with "ask me again" (memory plan M0-c): only on their own
    // screen, with a bond, for a favourite that is set. The values come from mine (their
    // own channel); a favourite visitor shows by name.
    const favRows = !bond || sharedScreen() ? "" : [
      ["fav_weather", "favourite weather", s.mine?.fav_weather],
      ["fav_season", "favourite season", s.mine?.fav_season],
      ["fav_visitor", "favourite visitor", s.mine?.fav_visitor
        && (visitorList(s.world).find((v) => v.id === s.mine.fav_visitor)?.name || s.mine.fav_visitor)],
    ].filter(([, , value]) => typeof value === "string" && value).map(([kind, label, value]) => {
      const sure = confirmArmed(s, `ask_again_${kind}`);
      return row(null, label, `<span><span class="favvalue">${escape(value)}</span> <button class="bell askagain" data-kind="${kind}" aria-label="${sure ? CONFIRM_ARIA[`ask_again_${kind}`] : `${label}: ${SETTINGS_AGAIN.askAgain}`}">${sure ? "sure? tap again" : SETTINGS_AGAIN.askAgain}</button></span>`);
    }).join("");
    // The pet's shell, for everyone who sees it: only if the server offers it, and
    // read-only (no pet name either) on a shared screen.
    const shellOptions = this._state(s, "sensor.life_stage")?.attributes.shell_finish_options;
    const shellName = escape(this._shellName(s, this._shellChoice(s)));
    const shellSwatch = `<span class="sw" style="background: ${finishSwatch(this._shellKey(s), s.world.shell?.color || "#e8834a")}"></span>`;
    // What the house shows it (top10 2b): the kinds the server lists, never an
    // entity; everyone sees it, and an admin gets a link to the options.
    const senses = this._state(s, "sensor.life_stage")?.attributes.senses;
    const notices = !Array.isArray(senses) ? ""
      : row(null, "notices", `<span class="senses">${senses.length ? senses.map(escape).join(" · ") : "just the clock"}</span>`)
        + (this._hass.user?.is_admin && !sharedScreen() ? `<button class="wlink connect">connect more ›</button>` : "");
    // Its bedtime and wake time (S7, N21): a read-only target, the household's own, on shared
    // screens too. An older server sends none.
    const sleep = this._state(s, "sensor.life_stage")?.attributes.sleep_times;
    const bedtime = sleep && typeof sleep.bedtime === "string" && typeof sleep.wake === "string"
      ? row(null, "bedtime", `<span class="sleeptimes">${escape(sleepLine(sleep, this._hass))}</span>`).replace('class="row srow"', 'class="row srow sleeprow"') : "";
    // The pet's group: what it notices, its bedtime, then the shell, where the server offers it
    // (read-only on a shared screen). Misses and whines moved to the status page
    // (top10 4a), so an older server's sheet has no pet group at all.
    const hasShell = Array.isArray(shellOptions);
    // Resting (R1): the household's switch, with what it means; hidden for an egg (one that
    // slipped through a downgrade keeps the row, so it can be woken). An older server has none.
    const restEnt = this._state(s, "switch.resting");
    const restOn = restEnt?.state === "on";
    const resting = restEnt && (restOn || this._state(s, "sensor.life_stage")?.state !== "egg")
      ? restRow(restOn, sharedScreen(), this._linkName(s)) : "";
    const shellRows = !hasShell && !notices && !bedtime && !resting ? ""
      : sharedScreen()
        ? `<div class="sec">for the pet</div>
      ${notices}
      ${bedtime}
      ${resting}
      ${hasShell ? `${row(null, "shell", `<span class="shellro">${shellSwatch}${shellName}</span>`)}
      <div class="shellnote">ask a grown-up to change it</div>` : ""}`
        : `<div class="sec">for ${escape(this._linkName(s))}</div>
      ${notices}
      ${bedtime}
      ${resting}
      ${hasShell ? row(null, "shell", `<span><button class="bell shellrow" aria-label="shell: ${shellName}, change">${shellSwatch}${shellName}</button></span>`) : ""}`;
    // The pet this person's card opens on (favourite §5.3), with 2+ pets, on their own screen,
    // once the channel has said: no ranking word, just where the card opens. An admin also
    // sets where shared screens open (the household's). An older server sends neither.
    const petName = escape(this._linkName(s));
    const several = (this._slides || []).filter((x) => x.ids && !x.empty).length > 1;
    const openRow = (cls, label, on) =>
      row(null, label, `<span><button class="bell ${cls}" aria-label="${spoken(label)}" aria-pressed="${on}">${on ? "on" : "off"}</button></span>`);
    const openOn = !several || sharedScreen() || typeof s.mine?.open_on !== "boolean" ? ""
      : openRow("openon", OPEN_ON_COPY.mine(petName), s.mine.open_on)
        + (this._hass.user?.is_admin && typeof s.mine.house_open_on === "boolean"
          ? openRow("openhouse", OPEN_ON_COPY.house(petName), s.mine.house_open_on) : "");
    // Who each part changes: the pet (everyone), the viewer (follows their login),
    // or this browser.
    const html = `
      <div class="shead"><button class="sback">${SETTINGS_COPY.backToStatus}</button>${SAY_NOTE}</div>
      <div class="sec">this screen</div>
      <div class="ssub">sound</div>
      ${row(null, "sounds here", `<span><button class="bell sound" aria-label="sounds here" aria-pressed="${soundsOn()}">${soundsOn() ? "on" : "off"}</button></span>`)}
      ${s.species?.voice ? (soundsOn()
        ? row(null, "babble", `<span><button class="bell babble" aria-label="babble: the pet's voice as it talks, on this device" aria-pressed="${babbleOn()}">${babbleOn() ? "on" : "off"}</button></span>`)
        // "sounds here" is the master: babble waits for it (its own switch keeps its setting)
        : row(null, "babble", `<span><button class="bell babble" aria-label="babble: needs sounds here first" aria-pressed="false" aria-disabled="true">needs sounds</button></span>`)) : ""}
      <div class="ssub">look</div>
      ${row(null, "screen effects here", `<span><button class="bell lcdfx" aria-label="screen effects here" aria-pressed="${lcdOn()}">${lcdOn() ? "on" : "off"}</button></span>`)}
      ${row(null, "holiday names", `<span><button class="bell named" aria-label="holiday names" aria-pressed="${namedHolidays()}">${namedHolidays() ? "on" : "off"}</button></span>`)}
      ${row(null, "mono screen", `<span><button class="bell mono" aria-label="mono screen: ${monoOn() ? "on" : "off"}, change" aria-pressed="${monoOn()}">${monoOn() ? "on" : "off"}</button></span>`)}
      ${row(null, "big text", `<span><button class="bell bigtext" aria-label="big text: larger words on this screen's pages" aria-pressed="${bigOn()}">${bigOn() ? "on" : "off"}</button></span>`)}
      ${sharedScreen() ? "" : `<div class="sec">for you</div>`}
      ${sharedScreen() ? "" : row(null, "notify me", `<span><button class="bell notify" aria-label="notify me" aria-pressed="${notifying}">${notifying ? "on" : "off"}</button></span>`)}
      ${bond && myDay === undefined ? row(null, "my day", `<span>…</span>`) : ""}
      ${bond && myDay !== undefined ? row(null, "my day", `<span><button class="bell myday" aria-label="my day: let the pet notice your steps, sleep, alarm and trips" aria-pressed="${!!myDay}">${myDay ? "on" : "off"}</button></span>`) : ""}
      ${birthdayKept && !sharedScreen() ? row(null, "my birthday", forgetButton("forgetbday", "forget_birthday", "forget my birthday")) +
        row(null, "birthday on my phone", `<span><button class="bell bdayphone" aria-label="birthday on my phone: a happy birthday message on your phone on the day" aria-pressed="${!!birthdayPhone}">${birthdayPhone ? "on" : "off"}</button></span>`) : ""}
      ${sharedScreen() ? "" : row(null, "baby talk", `<span><button class="bell babytalk" aria-label="baby talk: simpler words while a pet is a baby or child" aria-pressed="${babyTalk(this._hass.user?.id)}">${babyTalk(this._hass.user?.id) ? "on" : "off"}</button></span>`)}
      ${favRows}
      ${openOn}
      ${sharedScreen() ? "" : row(null, "my data", forgetButton("forgetme", "forget_me", "forget my data: your birthday, answers and settings for every pet; your bonds stay"))}
      ${shellRows}
      <div class="sec">shared screen</div>
      ${row(null, "shared screen", `<span><button class="bell shared" aria-label="shared screen: nothing personal on this device" aria-pressed="${sharedScreen()}">${sharedScreen() ? "on" : "off"}</button></span>`)}
      <div class="shellnote sharednote">a family tablet? give it its own login, and we'll make friends ♥</div>
      ${this._hass.user?.is_admin && !sharedScreen() ? `<div class="shellnote sharedprivacy">${SETUP_COPY.sharedPrivacy}</div>` : ""}`;
    if (!this._setStatus(s, html)) return;
    s.status.querySelector(".sback").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.settings = false;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".gear")?.focus({ preventScroll: true });
    });
    // A heading (or the back row beside its button) is not a button: a tap on it
    // leaves the sheet open.
    s.status.querySelectorAll(".sec, .ssub, .shead, .shellnote").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".bell.shellrow")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      s.picker = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".pback")?.focus({ preventScroll: true });
    });
    // An admin's way to the pet's options (Settings → Devices & services → Hatch at Home).
    s.status.querySelector(".connect")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      goHA(this._petEntryPath(s));
    });
    s.status.querySelector(".bell.resting")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setResting(s, button.getAttribute("aria-pressed") !== "true", button);
    });
    for (const [cls, scope] of [["openon", "me"], ["openhouse", "house"]]) {
      s.status.querySelector(`.bell.${cls}`)?.addEventListener("click", (e) => {
        e.stopPropagation();
        const button = e.currentTarget;
        if (button.classList.contains("pending")) return; // a call is in flight (F3)
        this._tapped(button);
        this._setOpenOn(s, button.getAttribute("aria-pressed") !== "true", scope, button);
      });
    }
    s.status.querySelector(".bell.myday")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setMyDay(s, button.getAttribute("aria-pressed") !== "true", button); // its value now, not at draw
    });
    // No "notify me" row on a shared screen.
    s.status.querySelector(".bell.notify")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setNotify(s, button.getAttribute("aria-pressed") !== "true", button); // its value now, not at draw
    });
    s.status.querySelector(".bell.shared").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !sharedScreen();
      try {
        localStorage.setItem(SHARED_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      if (on) this._goShared();
      else this._goPersonal();
      this._settingsChanged(s, on ? "sharedOn" : null);
      window.dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { on, from: this } }));
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._statusMessage(s, on ? SETTINGS_COPY.sharedOn : SETTINGS_AGAIN.sharedOff);
    });
    s.status.querySelector(".bell.sound").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !soundsOn();
      try {
        localStorage.setItem(SOUND_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeepSounds);
        return; // no storage: sounds stay off
      }
      let skipped = null;
      try {
        if (on) {
          unlockAudio(); // inside the tap: phones need it even when the sample is skipped
          skipped = this._maySample(s);
          if (skipped === null) playChirp("win"); // a sample
        }
      } catch (err) {
        // no WebAudio: the setting stays, and stays quiet
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      if (skipped) this._statusMessage(s, skipped);
    });
    s.status.querySelector(".bell.lcdfx").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !lcdOn();
      try {
        localStorage.setItem(LCD_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep); // F9: not silent
        return; // no storage: the effects stay as they are
      }
      this._card.classList.toggle("lcd-on", on);
      this._settingsChanged(s, on ? null : "effectsOff");
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.named").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !namedHolidays();
      try {
        if (on) localStorage.removeItem(NAMED_KEY);
        else localStorage.setItem(NAMED_KEY, "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.mono").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !monoOn();
      try {
        if (on) localStorage.setItem(MONO_KEY, "4");
        else localStorage.removeItem(MONO_KEY);
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep); // F9: not silent
        return; // no storage: the screen stays as it is
      }
      this._card.classList.toggle("mono", on);
      this._settingsChanged(s, on ? "monoOn" : "monoOff");
      window.dispatchEvent(new CustomEvent(MONO_EVENT)); // any other card on this page
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.bigtext").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !bigOn();
      try {
        if (on) localStorage.setItem(BIG_KEY, "on");
        else localStorage.removeItem(BIG_KEY);
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      this._card.classList.toggle("bigtext", on);
      window.dispatchEvent(new CustomEvent(MONO_EVENT)); // any other card on this page (_onMono)
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.bdayphone")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      const enabled = button.getAttribute("aria-pressed") !== "true";
      button.classList.add("pending");
      button.setAttribute("aria-pressed", String(enabled)); // at once, so a second tap undoes it
      button.textContent = enabled ? "on" : "off";
      this._hass.callWS({ type: "virtual_pet/birthday_phone", entity_id: s.ids?.["sensor.life_stage"], enabled })
        .then(() => {
          this._birthdayPhone = enabled;
          this._setMine("birthday_phone", enabled);
          this._statusMessage(s, enabled ? SETTINGS_COPY.phoneOn : SETTINGS_COPY.phoneOff);
          this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
        })
        .catch(() => {
          button.setAttribute("aria-pressed", String(!enabled));
          button.textContent = !enabled ? "on" : "off";
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        })
        .finally(() => button.classList.remove("pending"));
    });
    s.status.querySelector(".bell.babytalk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setBabyTalk(s, button.getAttribute("aria-pressed") !== "true", button);
    });
    const redrawStatus = () => this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    s.status.querySelector(".bell.forgetbday")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      if (!this._confirmed(s, "forget_birthday", e.currentTarget, redrawStatus)) return;
      this._hass.callWS({ type: "virtual_pet/forget_birthday", entity_id: s.ids?.["sensor.life_stage"] })
        .then(() => {
          this._birthdayKept = false;
          this._birthdayPhone = false;
          this._setMine("birthday_kept", false);
          this._setMine("birthday_phone", false);
          redrawStatus(); // first: a redraw replaces the message's line
          this._statusMessage(s, SETTINGS_AGAIN.forgotBirthday);
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        });
    });
    // "forget my data": this person's record in the people store, for every
    // pet (not their bonds), and this browser's copies of it.
    s.status.querySelector(".bell.forgetme")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      if (!this._confirmed(s, "forget_me", e.currentTarget, redrawStatus)) return;
      const user = this._hass.user?.id;
      this._hass.callWS({ type: "virtual_pet/forget_me" })
        .then(() => {
          setBabyTalk(user, false);
          this._myDay = false;
          this._birthdayKept = false;
          this._birthdayPhone = false;
          for (const key of ["my_day", "baby_talk", "birthday_kept", "birthday_phone", "open_on"]) this._setMine(key, false);
          for (const key of ["fav_weather", "fav_season", "fav_visitor"]) this._setMine(key, null); // M0-c's, gone too
          this._openOnSync(); // the heart and the copy of the pet their card opened on
          for (const slide of this._slides || []) { // lines told only to them
            if (slide.queue) slide.queue = slide.queue.filter((q) => !q.personal && !q.opts?.personal && !q.ask);
          }
          try {
            localStorage.removeItem(`hatch-welcomed-${user}`);
            localStorage.removeItem(openOnKey(user, false)); // the pet their card opened on (§5.2)
            const greets = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key?.startsWith(`hatch-greet-${user}-`)) greets.push(key);
            }
            greets.forEach((key) => localStorage.removeItem(key));
            localStorage.removeItem(ANSWERS_KEY + user);
            localStorage.removeItem(FOLLOW_TEXT_KEY + user); // their typed words (Q1 A)
          } catch (err) {
            // no storage (a private window): nothing kept here
          }
          redrawStatus(); // first: a redraw replaces the message's line
          this._statusMessage(s, SETTINGS_AGAIN.forgotMe);
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        });
    });
    // "ask me again": two taps, then the favourite is dropped on the server and the pet
    // asks it afresh on a later look. On this card the row goes with the value.
    s.status.querySelectorAll(".bell.askagain").forEach((button) => button.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const kind = button.dataset.kind;
      if (!this._confirmed(s, `ask_again_${kind}`, e.currentTarget, redrawStatus)) return;
      this._hass.callWS({ type: "virtual_pet/ask_again", entity_id: s.ids?.["sensor.life_stage"], kind, shared: false })
        .then(() => {
          this._setMine(kind, null);
          redrawStatus();
        })
        .catch(() => {
          redrawStatus(); // the row again, not "sure?"
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        });
    }));
    s.status.querySelector(".bell.babble")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!soundsOn()) return; // disabled: sounds here is off
      this._tapped(e.currentTarget);
      const on = !babbleOn();
      try {
        localStorage.setItem(BABBLE_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeepSounds);
        return;
      }
      let skipped = null;
      try {
        if (on) { // a sample; this tap also unlocks audio on phones
          unlockAudio();
          skipped = this._maySample(s);
          if (skipped === null) audio.resume().then(() => babble(`${s.species.voice.sound} hello there`, s.species.voice));
        }
      } catch (err) {
        // no WebAudio
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      if (skipped) this._statusMessage(s, skipped);
    });
  }
}

