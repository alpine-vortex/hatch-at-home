"""Screenshot the real card's device in the scratch HA, before and with each mockup.

Start HA (port 8404), run setup_ha.py once, then:
  python3 dev/shell-mockups/shoot.py <plan> [out_dir]
Plans: before, directions, probe. Injects common.js, dir-*.css and dir-*.js into the
card's shadow root; nothing in the card's own source changes.
"""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

HA = "http://localhost:8404"
HERE = pathlib.Path(__file__).parent
PLAN = sys.argv[1] if len(sys.argv) > 1 else "before"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else HERE / "shots")
OUT.mkdir(parents=True, exist_ok=True)
WORLDS = json.loads((HERE.parent.parent / "custom_components/virtual_pet/frontend/worlds.json").read_text())
# PR #69's special finishes, copied so the mockups can be checked against them unmerged.
EXTRA = (HERE / "pr69-finishes.css").read_text() if (HERE / "pr69-finishes.css").exists() else ""
CSS = "\n".join((HERE / f).read_text() for f in ["dir-a.css", "dir-b.css", "dir-c.css"] if (HERE / f).exists())
JS = "\n".join((HERE / f).read_text() for f in ["common.js", "dir-b.js", "dir-c.js"] if (HERE / f).exists())

# Alternate colours: one pale, one dark, where highlights and shadows break first.
PALE = {"color": "#f1e4c6", "bezel": "#fff8ea"}
DARK = {"color": "#33405c", "bezel": "#d9dcea"}


def open_card(page):
    page.goto(HA + "/")
    page.wait_for_selector('input[autocomplete="username"]', timeout=60000)
    page.locator('input[autocomplete="username"]').first.fill("dev")
    page.locator('input[type="password"]').first.fill("devdevdev")
    page.keyboard.press("Enter")
    page.wait_for_function("() => !!document.querySelector('home-assistant')?.hass?.user", timeout=60000)
    page.goto(HA + "/pet-bench/pet")
    page.wait_for_timeout(16000)  # the frontend reloads itself once after the first load
    page.wait_for_selector("hatch-pet-card .statusbtn", timeout=30000)
    card = page.locator("hatch-pet-card")
    card.evaluate("""(el, [css, js]) => {
      el.setConfig({ ...el._config, seasonal: false });
      const real = el._hass;
      Object.defineProperty(el, "hass", { set() {}, get() { return this._hass; }, configurable: true });
      el._hass = real;
      el._slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; s.nextIdle = Date.now() + 1e9; });
      const style = document.createElement("style");
      style.id = "mock"; style.textContent = css;
      el.shadowRoot.append(style);
      (0, eval)(js);
    }""", [EXTRA + "\n" + CSS, JS])
    return card


def scene(card, night):
    card.evaluate("""(el, night) => {
      const s = el._slides[el._index];
      const states = { ...el._hass.states };
      states["sun.sun"] = { ...states["sun.sun"], state: night ? "below_horizon" : "above_horizon" };
      for (const [id, st] of Object.entries(states)) {
        if (!Object.values(s.ids).includes(id)) continue;
        if (id.startsWith("sensor.") && st.attributes?.flags) states[id] = { ...st, state: "content", attributes: { ...st.attributes, flags: [] } };
        if (id.startsWith("binary_sensor.") && id.includes("asleep")) states[id] = { ...st, state: "off" };
      }
      el._hass = { ...el._hass, states };
      el._sig = null;
      el._update();
    }""", night)


def dress(card, shell, direction, world=None):
    return card.evaluate("""async (el, [shell, dir, world]) => {
      const s = el._slides[el._index];
      s.world.shell = shell;
      if (world) { s.world.trim = world.trim; s.world.label = world.label; s.world.name = world.name; }
      el._card.classList.remove("mock-a", "mock-b", "mock-c");
      if (dir) el._card.classList.add("mock-" + dir);
      el._renderSlide(s);
      s.bubble.style.display = "none";
      await new Promise((r) => setTimeout(r, 250));
      if (window.mockDress) await window.mockDress(s.device, dir, shell);
      await new Promise((r) => setTimeout(r, 150));
      const pet = s.pet;
      return { petW: pet.getBoundingClientRect().width, petNat: pet.naturalWidth,
               dev: s.device.getBoundingClientRect().width };
    }""", [shell, direction, world])


def shot(page, name):
    page.locator("hatch-pet-card .slide:not(.away-slide) .device").screenshot(path=str(OUT / f"{name}.png"))


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in ([420, 330] if PLAN not in ("probe", "quick") else [420]):
            for night in ((False, True) if PLAN not in ("probe", "quick") else (False,)):
                ctx = browser.new_context(viewport={"width": width, "height": 900},
                                          color_scheme="dark" if night else "light", device_scale_factor=2)
                page = ctx.new_page()
                page.on("pageerror", lambda e: print("PAGEERROR", e))
                card = open_card(page)
                scene(card, night)
                when = "night" if night else "day"
                if PLAN == "probe":
                    print(dress(card, WORLDS["woodland"]["shell"], None))
                    shot(page, "probe")
                    return
                for key, world in WORLDS.items():
                    shape = world["shell"]["shape"]
                    if PLAN == "before":
                        dress(card, world["shell"], None, world)
                        shot(page, f"before_{shape}_{when}_{width}")
                        continue
                    variants = [("native", world["shell"])]
                    if width == 420 and not night and PLAN != "quick":
                        variants += [("pale", {**world["shell"], **PALE, "finish": None}),
                                     ("dark", {**world["shell"], **DARK, "finish": None}),
                                     ("glitter", {**world["shell"], "finish": "glitter"})]
                    for tag, shell in variants:
                        for d in DIRS:
                            dress(card, shell, d, world)
                            shot(page, f"{d or 'before'}_{shape}_{tag}_{when}_{width}")
                ctx.close()
        browser.close()


DIRS = [x for x in (sys.argv[3] if len(sys.argv) > 3 else "-abc") if x != "-"]
DIRS = [None if x == "-" else x for x in (["-"] if "-" in (sys.argv[3] if len(sys.argv) > 3 else "-abc") else []) + DIRS]
run()
