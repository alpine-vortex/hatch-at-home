// The "things you told me" page (memory plan M3a, docs/plan-2026-11-02-memory.md sections 8,
// 9 and 9a). The person's own memory, fetched on open by virtual_pet/memory_get (shared:
// false), shown after one confirm tap, each item with a two-tap "forget this"
// (virtual_pet/memory_forget). This is the only part that names those two commands. Nothing
// of it is kept: not in localStorage, not in `mine`, and not in `statusHtml` (the page's
// HTML is a skeleton; every value goes in as textContent after it is drawn). Its fields
// (s.memoryPage, s.memoryData, s.memoryLoad, s.memoryIdle) go on every one of the five
// teardown paths (section 9): the channel turning memory off (_channel), a shared-screen flip
// (_goShared), the sheet closing or the slide changing (_toggleStatus, _forget, _go), a
// reply landing late (memoryEpoch), and a hidden tab or 2 minutes idle (_onHidden, the timer).
const MEMORY_IDLE_MS = 2 * 60 * 1000;
const MEMORY_STICKER_TAGS = ["exam", "match", "show", "trip", "party", "lesson"]; // M3b: the six that get one

class HatchPetCardMemory extends HatchPetCardJournal {
  // The status sheet's link: only on the person's own screen while memory is on for them
  // and this pet allows it (both known; with no `mine` yet, the card-wide flag and the
  // slide's visit reply, M3 P3-2).
  _memoryLinkShown(s) {
    return !sharedScreen() && this._mineSwitch(s, "memory_on", this._memoryOn) === true &&
      this._mineSwitch(s, "memory_allowed", s.memoryAllowed) === true;
  }

  _memoryLinkHtml(s) {
    return this._memoryLinkShown(s) ? `<button class="mlink">${escape(MEMORY_PAGE.link)}</button>` : "";
  }

  _memoryLinkWire(s) {
    s.status.querySelector(".mlink")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      if (!this._memoryLinkShown(s)) return;
      this._memoryPageClose(s); // a fresh page: no reply from an earlier open draws on it
      s.memoryPage = "gate"; // the one confirm tap first (R3)
      s.journal = false;
      s.finds = false;
      s.everyWorld = false;
      s.settings = false;
      this._memoryTouch(s);
      this._memoryRedraw(s);
      s.status.scrollTop = 0;
      this._wipe(s);
      s.status.querySelector(".sback")?.focus({ preventScroll: true });
    });
  }

  // The page closes (any of the five paths): its fields and its DOM go, and the reply or
  // forget still in flight finds its epoch stale. True if a page was open. With the sheet
  // still up, the status page is drawn in its place.
  _memoryPageClose(s, redraw = true) {
    const open = !!s.memoryPage;
    s.memoryEpoch = (s.memoryEpoch || 0) + 1;
    s.memoryPage = false;
    s.memoryData = null;
    s.memoryLoad = null;
    s.memoryFailed = false;
    clearTimeout(s.memoryIdle);
    s.memoryIdle = null;
    if (s.confirm?.key?.startsWith("memory_item")) s.confirm = null;
    s.statusHtml = null; // the cached copy of the DOM goes too
    if (!s.status) return open;
    if (s.status.querySelector('.shead[data-page="memory"], .mempage')) {
      s.status.innerHTML = ""; // dropped from the DOM, not just hidden
    }
    if (open && redraw && s.screen?.classList.contains("show-status")) this._memoryRedraw(s);
    return open;
  }

  // The idle timer: one, reset by a tap in the page, cleared on close (FM 2026-11-05).
  _memoryTouch(s) {
    clearTimeout(s.memoryIdle);
    s.memoryIdle = setTimeout(() => {
      s.memoryIdle = null;
      this._memoryPageClose(s);
    }, MEMORY_IDLE_MS);
  }

  _memoryRedraw(s) {
    this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
  }

  // One read per open; a reply for another pet, after a close, or across a shared-screen
  // flip is dropped (path 4).
  _memoryFetch(s, quiet = false) {
    if (s.memoryLoad) return s.memoryLoad;
    const id = s.ids?.["sensor.life_stage"];
    const epoch = s.memoryEpoch || 0;
    const shared = sharedScreen();
    const stale = () => (s.memoryEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id ||
      sharedScreen() !== shared || s.memoryPage !== "open";
    const seq = s.memoryReadSeq = (s.memoryReadSeq || 0) + 1; // only the latest read may land
    const latest = () => s.memoryReadSeq === seq;
    if (!quiet) s.memoryFailed = false;
    const load = (async () => {
      let reply = null;
      try {
        if (!id || shared) throw new Error("not here");
        reply = await this._hass.callWS({ type: "virtual_pet/memory_get", entity_id: id, shared: false });
        if (!reply || typeof reply !== "object" || !Array.isArray(reply.tags)) throw new Error("no page");
      } catch (err) {
        // Never redraw inside the caller: _renderMemory calls this while building its HTML, and
        // a sync failure (no pet id) would be overwritten by the outer render (F4).
        await null;
        if (stale() || !latest()) return;
        s.memoryLoad = null;
        if (quiet && s.memoryData) return; // a re-read after a forget: the rows on show stay
        s.memoryFailed = true;
        this._memoryRedraw(s);
        return;
      }
      if (stale() || !latest()) return;
      s.memoryLoad = null;
      s.memoryData = reply;
      s.memoryRev = (s.memoryRev || 0) + 1;
      this._memoryRedraw(s);
    })();
    s.memoryLoad = load;
    return load;
  }

  // The card's short date for a server day ("YYYY-MM-DD"), in the viewer's own words.
  _memoryDay(day) {
    const [y, m, d] = String(day).split("-").map(Number);
    if (!y || !m || !d) return "";
    return new Date(y, m - 1, d).toLocaleDateString(this._hass?.locale?.language || undefined,
      { month: "short", day: "numeric" });
  }

  // The server's day ("YYYY-MM-DD", the house's time zone) on the card's server clock.
  _memoryToday() {
    const zone = this._hass?.config?.time_zone;
    try {
      return new Date(serverNow()).toLocaleDateString("en-CA", zone ? { timeZone: zone } : undefined);
    } catch (err) {
      return new Date(serverNow()).toLocaleDateString("en-CA");
    }
  }

  // M3b: one sticker per big-day tag of the six, on and after the tagged day (never before),
  // derived from `tags`; no count, nothing kept. A weekend entry or another tag gets none.
  _memoryStickers(data) {
    const today = typeof data?.today === "string" ? data.today : this._memoryToday(); // the server's own day first
    const have = new Set((Array.isArray(data?.tags) ? data.tags : [])
      .filter((e) => e && e.kind === "big_day" && typeof e.day === "string" && e.day <= today).map((e) => e.tag));
    return MEMORY_STICKER_TAGS.filter((tag) => have.has(tag));
  }

  // The rows the page lists, each with its text and (but a favourite) its forget key.
  _memoryRows(s, data) {
    const P = MEMORY_PAGE;
    const label = (tag) => MEMORY_TAG_CHIPS.labels[tag] || "";
    const day = (d) => this._memoryDay(d);
    const told = data.since_told && typeof data.since_told === "object" ? data.since_told : {};
    const fav = [["fav_weather", P.fav_weather], ["fav_season", P.fav_season]]
      .filter(([kind]) => typeof s.mine?.[kind] === "string" && s.mine[kind] && typeof told[kind] === "string")
      .map(([kind, line]) => ({ text: line(s.mine[kind], day(told[kind])), fav: kind }));
    // A tagged day or weekend, newest first; a weekend says so before its tag's label.
    const days = [...(data.tags || [])].filter((e) => label(e.tag))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
      .map((e) => ({
        text: P.day_row(e.kind === "weekend" ? `${P.weekend} ${label(e.tag)}` : label(e.tag), day(e.day)),
        key: { list: "tags", day: e.day, kind: e.kind },
      }));
    const picks = data.picks && typeof data.picks === "object" ? data.picks : {};
    const pickLabel = {
      dream: (v) => (["stars", "sea", "snacks", "you"].includes(v) ? v : ""),
      game: (v) => GAMES.find((g) => g.key === v)?.label || "",
      guess: (v) => (["rain", "sun"].includes(v) ? v : ""),
    };
    const picked = [];
    for (const kind of ["dream", "game", "guess"]) {
      for (const e of Array.isArray(picks[kind]) ? picks[kind] : []) {
        const value = pickLabel[kind](e.pick);
        if (value) picked.push({ day: e.day, text: P[`pick_${kind}`](value, day(e.day)), key: { list: kind, day: e.day } });
      }
    }
    for (const e of Array.isArray(picks.great) ? picks.great : []) {
      picked.push({ day: e.day, text: P.pick_great(day(e.day)), key: { list: "great", day: e.day } });
    }
    picked.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    const patterns = (data.patterns || [])
      .filter((p) => Number.isInteger(p.weekday) && P.weekdays[p.weekday] && label(p.tag))
      .map((p) => ({
        text: P.pattern(P.weekdays[p.weekday], label(p.tag)),
        key: { list: "pattern", tag: p.tag, weekday: p.weekday },
      }));
    return { fav, days, picks: picked, patterns };
  }

  _memoryStickerHtml(data) {
    const tags = this._memoryStickers(data);
    if (!tags.length) return "";
    return `<div class="mstickers" role="list">${tags.map((tag) => {
      const label = MEMORY_TAG_CHIPS.labels[tag];
      return `<span class="msticker" role="listitem" aria-label="${escape(label)}">` +
        `${pixelIcon(`icon_sticker_${tag}`, 32)}</span>`;
    }).join("")}</div>`;
  }

  // The page: a skeleton of fixed copy and empty slots, then every value as textContent.
  _renderMemory(s) {
    const P = MEMORY_PAGE;
    const band = this._pageBand("‹ status", escape(P.title), "memory");
    let html;
    let rows = null;
    const data = s.memoryData;
    if (s.memoryPage === "gate") {
      html = `${band}<div class="mempage"><div class="log mgate">${escape(P.gate_q)}</div>` +
        `<button class="bell mshow">${escape(P.gate_yes)}</button></div>`;
    } else if (s.memoryFailed) {
      html = `${band}<div class="mempage"><div class="log">${escape(P.failed)}</div></div>`;
    } else if (!data) {
      if (!s.memoryLoad) this._memoryFetch(s);
      html = `${band}<div class="mempage"><div class="log">${escape(P.loading)}</div></div>`;
    } else {
      rows = this._memoryRows(s, data);
      const slot = (row, i, group) => `<div class="row srow mrow"><span class="mtext"></span>` +
        (row.fav ? `<span><button class="bell maskagain" data-i="${i}" data-group="${group}"></button></span>`
          : `<span><button class="bell mforget" data-i="${i}" data-group="${group}"></button></span>`) + "</div>";
      const section = (head, group) => (rows[group].length
        ? `<div class="sec">${escape(head)}</div>${rows[group].map((r, i) => slot(r, i, group)).join("")}` : "");
      const any = rows.fav.length || rows.days.length || rows.picks.length || rows.patterns.length;
      html = `${band}<div class="mempage" data-rev="${s.memoryRev || 0}">` +
        (data.since ? `<div class="shellnote msince"></div>` : "") +
        this._memoryStickerHtml(data) +
        (any ? section(P.h_fav, "fav") + section(P.h_days, "days") + section(P.h_picks, "picks") +
          section(P.h_pattern, "patterns") : `<div class="log">${escape(P.empty)}</div>`) +
        `<div class="shellnote mnever">${escape(P.never)}</div>` +
        (any ? `<div class="shellnote mkept">${escape(P.kept_note)}</div>` : "") +
        `<button class="bell mstop">${escape(P.stop)}</button>` +
        `<div class="status-feedback" role="status" aria-live="polite" hidden></div></div>`;
    }
    if (!this._setStatus(s, html)) return;
    const page = s.status.querySelector(".mempage");
    page?.addEventListener("click", () => this._memoryTouch(s));
    page?.addEventListener("keydown", () => this._memoryTouch(s));
    s.status.querySelector(".sback")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      s.refocus = ".mlink";
      this._memoryPageClose(s);
      this._refocus(s);
    });
    s.status.querySelector(".mshow")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      if (s.memoryPage !== "gate" || !this._memoryLinkShown(s)) return;
      s.memoryPage = "open";
      this._memoryFetch(s);
      this._memoryRedraw(s);
    });
    if (!rows) return;
    if (data.since) s.status.querySelector(".msince").textContent = P.since(this._memoryDay(data.since));
    s.status.querySelectorAll(".mrow").forEach((el) => {
      const button = el.querySelector("button");
      const row = rows[button.dataset.group][Number(button.dataset.i)];
      el.querySelector(".mtext").textContent = row.text;
      if (row.fav) {
        this._memoryAskAgainWire(s, button, row.fav);
        return;
      }
      const key = this._memoryItemKey(row.key);
      const sure = confirmArmed(s, key);
      button.textContent = sure ? (row.key.list === "pattern" ? P.forget_pattern_sure : P.forget_sure) : P.forget;
      button.setAttribute("aria-label", sure ? button.textContent : P.aria_forget(row.text));
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        this._tapped(button);
        this._memoryForget(s, row, button);
      });
    });
    s.status.querySelector(".mstop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      this._tapped(button);
      // memory_off's own two taps ("sure? tap again"); then off, and the page goes at once.
      if (!this._confirmed(s, "memory_off", button, () => this._memoryRedraw(s))) return;
      this._memoryPageClose(s);
      this._setMemory(s, false, button);
    });
  }

  _memoryItemKey(key) {
    return `memory_item:${key.list}:${key.day || ""}:${key.kind || ""}:${key.tag || ""}:${key.weekday ?? ""}`;
  }

  // "forget this": two taps (a tap-to-confirm, as _confirmed), then one memory_forget with
  // the item's key, then the page reads again (a pattern's window may show an older run).
  async _memoryForget(s, row, button) {
    const P = MEMORY_PAGE;
    const key = this._memoryItemKey(row.key);
    if (!confirmTap(s, key)) {
      button.textContent = row.key.list === "pattern" ? P.forget_pattern_sure : P.forget_sure;
      button.setAttribute("aria-label", button.textContent);
      s.statusHtml = null;
      clearTimeout(s.confirmTimer);
      s.confirmTimer = setTimeout(() => { if (s.memoryPage === "open") this._memoryRedraw(s); },
        s.confirm.at + CONFIRM_MS + 50 - Date.now());
      return;
    }
    if (button.classList.contains("pending")) return;
    button.classList.add("pending");
    const id = s.ids?.["sensor.life_stage"];
    const epoch = s.memoryEpoch || 0;
    const stale = () => (s.memoryEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id ||
      sharedScreen() || s.memoryPage !== "open";
    try {
      if (!id || sharedScreen()) return;
      await this._hass.callWS({ type: "virtual_pet/memory_forget", entity_id: id, shared: false, ...row.key });
    } catch (err) {
      if (stale()) return;
      s.statusHtml = null;
      this._memoryRedraw(s);
      this._statusMessage(s, SETTINGS_AGAIN.failed);
      return;
    }
    if (stale()) return;
    // The item is gone: drop it from the rows on show at once, then read again (a pattern's
    // window may slide onto an older run). A failed re-read keeps these rows (F1).
    const d = s.memoryData;
    if (d) {
      const k = row.key;
      const keep = (e) => !(e.day === k.day && (k.list !== "tags" || e.kind === k.kind));
      if (k.list === "tags") d.tags = (d.tags || []).filter(keep);
      else if (k.list === "pattern") {
        d.patterns = (d.patterns || []).filter((p) => !(p.tag === k.tag && p.weekday === k.weekday));
        // The server drops that tag's big_day entries on that weekday within the tag's last
        // five by day (people.py forget_pattern); the stickers follow `tags`.
        const wd = (day) => { const [y, m, dd] = String(day).split("-").map(Number); return (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; };
        const mine = (d.tags || []).filter((e) => e && e.kind === "big_day" && e.tag === k.tag && typeof e.day === "string")
          .map((e) => e.day).sort().slice(-5);
        const gone = new Set(mine.filter((day) => wd(day) === k.weekday));
        d.tags = (d.tags || []).filter((e) => !(e && e.kind === "big_day" && e.tag === k.tag && gone.has(e.day)));
      }
      else if (Array.isArray(d.picks?.[k.list])) d.picks[k.list] = d.picks[k.list].filter(keep);
    }
    s.memoryRev = (s.memoryRev || 0) + 1;
    s.statusHtml = null;
    this._memoryRedraw(s);
    this._statusMessage(s, P.forgot); // once, to the live region
    s.memoryLoad = null;
    this._memoryFetch(s, true);
  }

  // A favourite's "ask me again" (M0-c's own action, its own two taps), from the page.
  _memoryAskAgainWire(s, button, kind) {
    const confirm = `ask_again_${kind}`;
    const sure = confirmArmed(s, confirm);
    button.textContent = sure ? "sure? tap again" : SETTINGS_AGAIN.askAgain;
    button.setAttribute("aria-label", sure ? CONFIRM_ARIA[confirm] : `${kind === "fav_weather" ? "favourite weather" : "favourite season"}: ${SETTINGS_AGAIN.askAgain}`);
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(button);
      if (!this._confirmed(s, confirm, button, () => this._memoryRedraw(s))) return;
      const epoch = s.memoryEpoch || 0;
      this._hass.callWS({ type: "virtual_pet/ask_again", entity_id: s.ids?.["sensor.life_stage"], kind, shared: false })
        .then(() => {
          this._setMine(kind, null);
          if ((s.memoryEpoch || 0) !== epoch || s.memoryPage !== "open") return;
          s.memoryData = null;
          s.memoryLoad = null;
          this._memoryRedraw(s);
        })
        .catch(() => {
          if ((s.memoryEpoch || 0) !== epoch || s.memoryPage !== "open") return;
          this._memoryRedraw(s);
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        });
    });
  }
}
