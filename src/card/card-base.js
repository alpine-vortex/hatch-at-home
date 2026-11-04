class HatchPetCardBase extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return document.createElement("hatch-pet-card-editor");
  }

  setConfig(config) {
    if (!pruneDatedKeys.done) {
      pruneDatedKeys.done = true;
      this._pruneKeys();
    }
    this._config = config || {};
    this._sig = null;
    this._epoch = (this._epoch || 0) + 1; // every slide draws again
    this._index = this._index || 0;
  }

  _pruneKeys() {
    pruneDatedKeys();
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    this._syncTheme();
    if (this._resumedAt && !document.hidden && hass?.states !== this._resumeStates) {
      this._resumedAt = this._resumeStates = null; // fresh states: the look may begin
    }
    this._listenReady(hass?.connection);
    this._watchServerClock(hass);
    this._resendAnswers();
    this._update();
  }

  // HA's own dark mode, as ha-dark / ha-light on the card (the glow finish lights up in a dark theme);
  // neither class when the theme doesn't say (an older HA): the OS's colour scheme decides then.
  _syncTheme() {
    const dark = this._hass?.themes?.darkMode;
    this._card?.classList.toggle("ha-dark", dark === true);
    this._card?.classList.toggle("ha-light", dark === false);
  }

  // Answers kept on this device (a failed save, twice) go out one by one when
  // the card has a user. The server saying it did not ask, or that it is not an
  // answer, drops it (the first try may have arrived and only its reply been
  // lost); any other error keeps it for later.
  async _resendAnswers() {
    const user = this._hass?.user?.id;
    if (!user || this._resending || sharedScreen() || Date.now() < (this._resendAfter || 0)) return;
    let list = stashedAnswers(user);
    if (!list.length) return;
    this._resending = true;
    try {
      const fresh = (a) => a && Date.now() - a.at < ANSWER_KEEP_DAYS * 86400000;
      list = list.filter(fresh);
      for (const a of [...list]) {
        try {
          await this._hass.callWS({ type: "virtual_pet/answer", entity_id: a.entity, question: a.question, answer: a.answer,
            shared: false }); // never on a shared screen (above): memory may keep it (plan R3)
        } catch (err) {
          if (err?.code !== "not_asked" && err?.code !== "invalid_answer") {
            this._resendAfter = Date.now() + ANSWER_RESEND_EVERY_MS;
            break;
          }
        }
        list = list.filter((x) => x !== a);
      }
      saveStashedAnswers(user, list);
    } finally {
      this._resending = false;
    }
  }

  // Every state event carries the server's own time_fired: one reading gives
  // the clock offset (noteServerTime), then the subscription is dropped (a
  // standing one would stream every state change in the house to this tab).
  // Read again after an hour, or on a new connection; shared by all cards.
  _watchServerClock(hass) {
    const conn = hass?.connection;
    if (!conn?.subscribeEvents) return;
    const seen = SERVER_CLOCK.get(conn);
    if (seen && (seen.busy || Date.now() - seen.at < SERVER_CLOCK_EVERY_MS)) return;
    const mark = { at: seen?.at ?? 0, busy: true };
    SERVER_CLOCK.set(conn, mark);
    let unsub = null;
    let done = false;
    const finish = () => { if (unsub) unsub(); };
    Promise.resolve(conn.subscribeEvents((ev) => {
      if (done) return;
      done = true;
      noteServerTime(ev?.time_fired);
      Object.assign(mark, { at: Date.now(), busy: false });
      finish();
    }, "state_changed")).then((fn) => {
      unsub = fn;
      if (done) finish();
    }).catch(() => { mark.busy = false; }); // a later card tries again
  }

  // A hidden tab: lines are said whole, and babbles stop.
  _onHidden = () => {
    if (document.hidden) {
      (this._slides || []).forEach((x) => this._stopTyping(x));
      this._hiddenAt ??= Date.now();
      this._dirPause();
      return;
    }
    this._dirView(this._slides?.[this._index]); // back in view: the ambience, and a first view's echo
    // Back after a long while (owner Q1): a new look, as a fresh page would have, a gift
    // waiting too (fresh-moment 1). The look waits for fresh states (RESUME_HOLD_MS at
    // most): a phone back from sleep holds yesterday's, and a set hass with the same
    // states object (a connection change) isn't fresh.
    if (this._hiddenAt && Date.now() - this._hiddenAt >= AWAY_NOTE_AFTER_MS) {
      this._newLook(this._slides || [], { resumed: true });
      this._resumedAt = Date.now();
      this._resumeStates = this._hass?.states;
    }
    this._hiddenAt = null;
    this._touchedAt = null; // a new look begins at its first touch (gaps-seams 5a)
  };

  connectedCallback() {
    followTextSweep(); // M1: no typed words past their day
    this._timer = setInterval(() => this._tick(), 700);
    if (this._card) document.addEventListener("visibilitychange", this._onHidden);
    if (this._resize && this._viewport) this._resize.observe(this._viewport);
    if (this._io && this._card) this._io.observe(this._card);
    // A shared screen turned on in another card on this page, or another tab.
    window.addEventListener(SHARED_EVENT, this._onSharedEvent);
    window.addEventListener("storage", this._onSharedStorage);
    // Mono screen turned on or off in another card on this page, or another tab
    // (or while the card was away).
    window.addEventListener(MONO_EVENT, this._onMono);
    window.addEventListener("storage", this._onMonoStorage);
    this._card?.classList.toggle("mono", monoOn());
    this._card?.classList.toggle("bigtext", bigOn());
    // Shared screen turned on or off while the card was away (its listeners
    // were off): catch up now, before a queued personal line is said.
    if (this._slides?.length && sharedScreen() !== this._sharedSeen) {
      if (sharedScreen()) this._goShared();
      else this._goPersonal();
    }
    // Back on the page: the private channel again (it closed when the card left).
    if (this._hass) {
      this._listenReady(this._hass.connection);
      for (const s of this._slides || []) this._subscribe(s);
    }
    if (!document.querySelector("[data-hatch-font]")) {
      // Tiny5 (SIL OFL), served by the integration so it works offline. It
      // stays legible at button-label sizes, where most pixel fonts blur.
      const style = document.createElement("style");
      style.dataset.hatchFont = "";
      style.textContent = `@font-face { font-family: 'Tiny5';
        src: url(${BASE}/fonts/Tiny5.woff2?v=${VERSION}) format('woff2'); font-display: swap; }`;
      document.head.append(style);
    }
  }

  // Who owns the screen (shell modes plan 3.7): a game (the picker on), or a shell mode that owns it
  // (`owns: false` opts out). Every "may this happen now" read asks this, not s.game, so a mode that is
  // not a game keeps moments, visitors, wander, scenes and the link off too (tests/js/owned_reads.test.js).
  _owned(s) {
    return !!s?.game || !!(s?.mode && s.mode.owns !== false);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    clearTimeout(this._headTimer);
    this._headTimer = 0;
    this._linkEnd();
    this._resize?.disconnect();
    this._io?.disconnect();
    document.removeEventListener("visibilitychange", this._onHidden);
    this._director?.reset();
    window.removeEventListener(SHARED_EVENT, this._onSharedEvent);
    window.removeEventListener("storage", this._onSharedStorage);
    window.removeEventListener(MONO_EVENT, this._onMono);
    window.removeEventListener("storage", this._onMonoStorage);
    this._listenReady(null);
    // A game stops with the card, and so
    // does a line typing out, and the private channel.
    for (const s of this._slides || []) {
      if (s.game) this._endGame(s, null);
      this._modeExit(s, "teardown"); // a shell mode too (a no-op once the game's end has left it)
      this._sceneEnd(s, { quiet: true }); // a care scene's rAF and its blanket's timers go with the card
      this._drapeStop(s);
      this._stopTyping(s);
      this._powerEnd(s);
      s.powerPending = null;
      this._dropPhotos(s);
      this._giftPopEnd(s); // a take on its way, or its line, is still said on return
      this._dropFinds(s);
      this._unsubscribe(s);
    }
  }

  // --- The private channel (virtual_pet/subscribe) -----------------------------
  //
  // Each slide subscribes to its pet: the viewer's own view ("mine": their
  // bond and switches), the house's ("house": the latest show or song, a dream
  // of one) and moments told to this connection alone. Subscribed without the
  // library's own resubscribe, which never says when it fails: the card does
  // it on the connection's "ready", through its own retries.

  // The connection whose reconnects resubscribe every slide (null: none).
  _listenReady(conn) {
    if (conn === this._readyConn) return;
    this._readyConn?.removeEventListener?.("ready", this._onReady);
    this._readyConn = conn?.addEventListener ? conn : null;
    this._readyConn?.addEventListener("ready", this._onReady);
  }

  // A new socket: the old subscriptions died with the old one (nothing to
  // unsubscribe), so every slide asks again.
  _onReady = () => {
    for (const s of this._slides || []) {
      s.unsub = null;
      if (!s.gone) this._subscribe(s, true); // a removed pet stays unasked
    }
  };

  // Subscribe the slide to its pet, unless it already is (to the same pet, on
  // the same kind of screen). `again`: whatever it had, ask afresh.
  _subscribe(s, again = false) {
    const id = s.ids?.["sensor.life_stage"];
    const conn = this._hass?.connection;
    if (!id || !conn?.subscribeMessage || !this.isConnected) return;
    const shared = sharedScreen();
    const key = `${id}|${shared}`;
    if (!again && s.subKey === key && (s.unsub || s.subPending || s.retryTimer || s.gone)) return;
    this._unsubscribe(s, false);
    if (s.subKey !== key) s.retries = 0;
    s.subKey = key;
    s.gone = false;
    const gen = (s.subGen = (s.subGen || 0) + 1);
    const user = this._hass.user?.id;
    s.subPending = true;
    // The first look waits this long at most for the channel's first word.
    if (!s.subscribed && !s.subscribeFailed && !s.waitTimer) {
      s.waitTimer = setTimeout(() => {
        s.waitTimer = null;
        if (!s.subscribed) s.subscribeFailed = true;
      }, SUBSCRIBE_WAIT_MS);
    }
    Promise.resolve(conn.subscribeMessage((msg) => {
      if (s.subGen === gen) this._channel(s, msg, user);
    }, { type: "virtual_pet/subscribe", entity_id: id, shared }, { resubscribe: false }))
      .then((unsub) => {
        if (s.subGen !== gen) { // moved on while it was asked
          Promise.resolve(unsub?.()).catch(() => {});
          return;
        }
        s.subPending = false;
        s.unsub = () => Promise.resolve(unsub?.()).catch(() => {});
        if (s.gone) this._unsubscribe(s, false); // gone before the reply landed
      })
      .catch(() => {
        // no_pet (mid-reload), unknown_command (HA still starting, or an
        // older server): go ahead without it, and ask again, for good.
        if (s.subGen !== gen) return;
        s.subPending = false;
        s.subscribeFailed = true;
        const n = s.retries || 0;
        s.retries = n + 1;
        s.retryTimer = setTimeout(() => {
          s.retryTimer = null;
          if (s.subGen === gen && this._slides?.includes(s)) this._subscribe(s, true);
        }, SUBSCRIBE_RETRY_MS[n] ?? SUBSCRIBE_RETRY_LAST_MS);
      });
  }

  // Stop the slide's subscription and its retries (`all`: and the wait for it).
  _unsubscribe(s, all = true) {
    s.subGen = (s.subGen || 0) + 1; // a reply still on its way is dropped
    s.subPending = false;
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    if (all) {
      clearTimeout(s.waitTimer);
      s.waitTimer = null;
      s.subKey = null;
    }
    s.unsub?.();
    s.unsub = null;
  }

  // The channel has spoken (or failed): the first look and hello may go.
  _channelHeard(s) {
    return !!(s.subscribed || s.subscribeFailed);
  }

  // One message on the slide's channel: the whole view (on subscribe, and
  // again after the pet reloads), a part that changed, a moment, or "gone".
  _channel(s, msg, user) {
    if (!msg || typeof msg !== "object") return;
    const shared = sharedScreen();
    if (msg.gone) { // the pet was removed: nothing more will come
      this._powerEnd(s);
      s.powerPending = null;
      this._unsubscribe(s, false);
      s.gone = true;
      return;
    }
    if (Array.isArray(msg.moments)) {
      // The whole view: a reset, every time. Its moments are what happened
      // already (for the first look), so nothing in it is said now.
      if (msg.now) noteServerTime(msg.now);
      s.mine = shared ? null : msg.mine || null;
      s.house = msg.house || null;
      if (!s.privateSeen) s.privateSeen = new Set();
      if (!s.mediaSeen) s.mediaSeen = new Set();
      for (const m of msg.moments) {
        if (!m?.type) continue;
        if (MEDIA_MOMENTS.has(m.type)) s.mediaSeen.add(m.at);
        else this._keepMoment(s, m);
      }
      if (s.house?.media?.at) s.mediaSeen.add(s.house.media.at);
      this._powerNews(s);
      // Device-alive: the ambient state first, then the ring for the first view (3B, M6/M7).
      this._dirSync(s);
      if (!s.dirViewed) s.dirRecent = Array.isArray(msg.device_fx_recent) ? msg.device_fx_recent : null;
      s.subscribed = true;
      s.subscribeFailed = false;
      s.retries = 0;
      clearTimeout(s.waitTimer);
      s.waitTimer = null;
      this._dirView(s); // the first snapshot of a slide on show is its first view
    } else {
      if ("mine" in msg) s.mine = shared ? null : msg.mine || null;
      if ("house" in msg) {
        s.house = msg.house || null;
        this._powerNews(s);
        this._basketSync(s); // a basket emptied on another screen just goes, no line
        this._dirSync(s); // the glass follows the house's device_fx.current
      }
      const m = msg.moment;
      if (m?.type) {
        // Said only if it's new here and just happened (the server's clock).
        const fresh = serverNow() - new Date(m.at).getTime() < 15000;
        if (MEDIA_MOMENTS.has(m.type)) {
          if (!s.mediaSeen) s.mediaSeen = new Set();
          if (!s.mediaSeen.has(m.at)) {
            s.mediaSeen.add(m.at);
            if (fresh) this._channelMoment(s, m);
          }
        } else if (this._keepMoment(s, m) && fresh) {
          this._channelMoment(s, m);
        }
      }
      // A house onset ({"fx": entry}, after the house part of the same push): a pulse on the glass
      // and nothing else, so before the early return and the redraw below (6.3).
      if (msg.fx && typeof msg.fx === "object") this._dirLive(s, msg.fx);
      if (!("mine" in msg) && !("house" in msg)) return; // a moment draws nothing
    }
    // The viewer's own baby talk, kept for the next page load (by whose it is).
    if (s.mine && typeof s.mine.baby_talk === "boolean" && user && user === this._hass?.user?.id) {
      setBabyTalk(user, s.mine.baby_talk);
    }
    if (!user || user === this._hass?.user?.id) this._openOnSync();
    s.statusHtml = null;
    this._redraw(s);
  }

  // Where this browser keeps its copy of the opening pet: the person's, or a shared screen's.
  _openKey() {
    return openOnKey(this._hass?.user?.id, sharedScreen());
  }

  // The opening pet (favourite §5.3), as the channels report it: the copy follows every
  // snapshot (the pet reporting it, or none: a copy one of these pets no longer reports
  // goes). The first time, with no copy, the card moves to it only inside OPEN_ON_WAIT_MS of
  // its first draw and before any swipe.
  _openOnSync() {
    const key = this._openKey();
    if (!key) return;
    const shared = sharedScreen();
    const heard = (this._slides || []).filter((x) => x.ids?.device && x.subscribed);
    const on = heard.find((x) => (shared ? x.house?.house_open_on : x.mine?.open_on) === true);
    const kept = openOnRead(key);
    if (on) {
      if (kept !== on.ids.device) openOnWrite(key, on.ids.device);
    } else if (kept && heard.some((x) => x.ids.device === kept)) {
      openOnWrite(key, null);
    }
    if (on && !this._openedOn && !this._userMoved && this._openFrom
      && Date.now() - this._openFrom < OPEN_ON_WAIT_MS) {
      this._openedOn = true;
      const i = this._slides.indexOf(on);
      if (i >= 0 && i !== this._index) this._go(i, true);
    }
  }

  // A channel moment is said now, or after the boot screen (only the speaking
  // waits, as _greet does).
  _channelMoment(s, m) {
    if (this._booting) (s.bootMoments ||= []).push(m);
    else this._moment(s, m);
  }

  // A private moment, kept for the first look (newest first): false if it was
  // already here.
  _keepMoment(s, m) {
    const key = momentKey(m);
    if (!s.privateSeen) s.privateSeen = new Set();
    if (s.privateSeen.has(key)) return false;
    s.privateSeen.add(key);
    s.privateMoments = [m, ...(s.privateMoments || [])]
      .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, MOMENTS_KEPT);
    return true;
  }

  // For card-check: what the channel would have said.
  _mineFor(s, mine) {
    s.mine = mine;
    s.statusHtml = null;
    this._redraw(s);
  }

  _houseFor(s, house) {
    s.house = house;
    s.statusHtml = null;
    this._redraw(s);
  }

  // --- Finding the pets --------------------------------------------------------

  // HA hands the card a new hass on every state change in the house, but the
  // registries only change when entities do: the pets' entities are worked out
  // once per registry (and config), not on every update.
  _devices() {
    const hass = this._hass;
    const c = this._devCache;
    if (c && c.entities === hass.entities && c.devices === hass.devices && c.config === this._config) {
      return c.list;
    }
    const list = this._findDevices();
    this._devCache = { entities: hass.entities, devices: hass.devices, config: this._config, list };
    return list;
  }

  _findDevices() {
    const hass = this._hass;
    // Pets picked in the editor (devices), or by any one entity of each (YAML).
    const wanted = [].concat(this._config.entities || [], this._config.entity || []);
    const deviceIds = [...(this._config.devices || [])].filter((d) => hass.devices?.[d]);
    if (wanted.length || this._config.devices?.length) {
      for (const id of wanted) {
        const d = hass.entities?.[id]?.device_id;
        if (d && !deviceIds.includes(d)) deviceIds.push(d);
      }
    } else {
      for (const e of Object.values(hass.entities || {})) {
        if (e.platform === "virtual_pet" && e.translation_key === "life_stage" && e.device_id) {
          deviceIds.push(e.device_id);
        }
      }
    }
    const byDevice = Object.fromEntries(deviceIds.map((device) => [device, { device }]));
    for (const e of Object.values(hass.entities || {})) {
      const ids = e.platform === "virtual_pet" && byDevice[e.device_id];
      if (ids) ids[`${e.entity_id.split(".")[0]}.${e.translation_key}`] = e.entity_id;
    }
    return deviceIds.map((device) => byDevice[device]);
  }
}

