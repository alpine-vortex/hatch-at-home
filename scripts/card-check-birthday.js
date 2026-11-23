// The birthday scenario runs in shard 1 against the packaged card. A separate
// synthetic login keeps the dev viewer's birthday, bond and journal untouched.
const { randomUUID } = require("node:crypto");

const ENTITY = "sensor.checkpip_life_stage";
const DASHBOARD = "/pet-bench/pet";

function dates(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const today = date.toISOString().slice(5, 10);
  date.setUTCDate(date.getUTCDate() + 1);
  return { today, tomorrow: date.toISOString().slice(5, 10) };
}

async function birthdayCheck({ browser, page, base, bootVersion, check }) {
  const username = `birthday-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const profile = await page.evaluate(async ({ username, password }) => {
    const hass = document.querySelector("home-assistant").hass;
    const { user } = await hass.callWS({
      type: "config/auth/create", name: "Birthday Test", group_ids: ["system-users"],
    });
    await hass.callWS({
      type: "config/auth_provider/homeassistant/create", user_id: user.id, username, password,
    });
    return { id: user.id, zone: hass.config.time_zone };
  }, { username, password });
  const { tomorrow } = dates(profile.zone);
  const context = await browser.newContext({ viewport: { width: 420, height: 860 }, timezoneId: profile.zone });
  const errors = [];
  const configure = (birthday) => page.evaluate(async ({ user, birthday }) => {
    const hass = document.querySelector("home-assistant").hass;
    await hass.callService("virtual_pet", "set_person_birthday", {
      user_id: user, birthday, birthday_phone: false, call_me: "Birthday Test",
    });
    await hass.callService("switch", "turn_off", { entity_id: "switch.checkpip_lights_out" });
  }, { user: profile.id, birthday });
  const delivery = () => page.evaluate(async (user) => {
    const hass = document.querySelector("home-assistant").hass;
    const result = await hass.callService("virtual_pet", "person_check", { user_id: user }, undefined, false, true);
    return result.response.birthday_delivery;
  }, profile.id);
  const ready = async (view) => {
    await view.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user, null, { timeout: 30000 });
    await view.locator("hatch-pet-card .statusbtn").first().waitFor({ timeout: 30000 });
  };
  async function open(phase, signIn = false) {
    const view = await context.newPage();
    view.on("pageerror", (error) => errors.push(String(error)));
    await view.addInitScript(({ phase, bootVersion, entity }) => {
      localStorage.setItem("hatch-booted", bootVersion);
      window.birthdaySpeech = [];
      customElements.whenDefined("hatch-pet-card").then(() => {
        const proto = customElements.get("hatch-pet-card").prototype;
        const speak = proto._speak;
        proto._speak = function (slide, line, ...options) {
          if (slide === this._slides?.[this._index] && !document.hidden) window.birthdaySpeech.push(line);
          return speak.call(this, slide, line, ...options);
        };
        if (phase === "interrupt-greeting") {
          // Simulate a page closed between the DOM write and its paint confirmation.
          proto._birthdayPainted = () => {};
        } else if (phase === "rollover") {
          const channel = proto._channel;
          proto._channel = function (slide, msg, user) {
            if (Array.isArray(msg.moments) && msg.mine?.birthday_in === 0 &&
                slide.ids?.["sensor.life_stage"] === entity) {
              // This card last heard its countdown yesterday. The server is already on day 0.
              msg = { ...msg, mine: { ...msg.mine, birthday_in: 1,
                birthday_until: Math.floor(Date.parse(msg.now) / 1000) - 1 } };
            }
            return channel.call(this, slide, msg, user);
          };
          // Simulate the tab closing after collection and before the ceremony.
          proto._queueBirthdayPresent = () => {};
        }
      });
    }, { phase, bootVersion, entity: ENTITY });
    if (signIn) {
      await view.goto(base);
      await view.locator('input[autocomplete="username"]').first().fill(username);
      await view.locator('input[type="password"]').first().fill(password);
      await view.keyboard.press("Enter");
      await view.waitForFunction(() => !!document.querySelector("home-assistant")?.hass?.user);
    }
    await view.goto(base + DASHBOARD);
    await ready(view);
    return view;
  }
  const firstLine = async (view) => {
    await view.waitForFunction(() => window.birthdaySpeech?.length, null, { timeout: 22000 });
    return view.evaluate(() => window.birthdaySpeech[0]);
  };
  // HA persists diagnostics after the card has painted, which can be a few frames
  // after a matching line first appears.
  const waitForDelivery = async (predicate) => {
    const end = Date.now() + 12000;
    let status;
    do {
      status = await delivery();
      if (predicate(status)) return status;
      await page.waitForTimeout(200);
    } while (Date.now() < end);
    return status;
  };

  try {
    await configure(tomorrow);
    const countdown = await open("countdown", true);
    const countdownLine = await firstLine(countdown);
    check("birthday: tomorrow's private countdown is the first speech", /tomorrow|one more sleep/i.test(countdownLine), countdownLine);
    await countdown.close();

    await configure(dates(profile.zone).today);
    const interrupted = await open("interrupt-greeting");
    const interruptedLine = await firstLine(interrupted);
    await interrupted.close();
    const waiting = await delivery();
    check("birthday: closing before confirmation leaves the annual greeting pending",
      /happy birthday/i.test(interruptedLine) && waiting.greeting === "pending", JSON.stringify(waiting));

    const rollover = await open("rollover");
    const birthdayLine = await firstLine(rollover);
    const receipt = await waitForDelivery((status) => status.greeting === "confirmed" &&
      status.presents.some((pet) => pet.pet === "Checkpip" && pet.reveal_pending));
    check("birthday: the server day replaces a stale countdown and confirms the reoffered greeting",
      /happy birthday/i.test(birthdayLine) && receipt.greeting === "confirmed", birthdayLine);
    check("birthday: the gift is collected and can still be revealed", receipt.presents.some((pet) =>
      pet.pet === "Checkpip" && pet.status === "collected" && pet.reveal_pending), JSON.stringify(receipt));
    await rollover.close();

    const resumed = await open("resumed");
    await resumed.locator(".reveal.gift img[src*='party_present.png']").first().waitFor({ state: "visible", timeout: 14000 });
    await resumed.locator(".reveal.gift img[src*='flowercrown.png']").first().waitFor({ state: "visible", timeout: 10000 });
    const finished = await waitForDelivery((status) => status.presents.some((pet) =>
      pet.pet === "Checkpip" && pet.status === "collected" && !pet.reveal_pending));
    check("birthday: an interrupted present finishes its reveal after reopening",
      finished.presents.some((pet) => pet.pet === "Checkpip" && pet.status === "collected" && !pet.reveal_pending), JSON.stringify(finished));
    check("birthday: no browser errors", errors.length === 0, errors.join(" | "));
    await resumed.evaluate(() => document.querySelector("home-assistant").hass.callWS({ type: "virtual_pet/forget_me" }));
  } finally {
    await context.close();
  }
}

module.exports = birthdayCheck;
