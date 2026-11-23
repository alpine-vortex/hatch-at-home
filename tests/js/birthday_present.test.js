// Birthday plan 8.3: a present from the pet. The card's own _giftTake (timer_trace): on your own party
// day any gift is the present, wrapped with its line, then opened with the gift's own line.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const spec = (party) => ({
  methods: ["_giftTake", "_queueBirthdayPresent"],
  consts: ["PARTY_PRESENT", "PRESENT_OPEN_MS", "GIFT_LINE_MS"],
  watch: ["_queue", "_giftPop", "_confetti", "_chirp"],
  returns: { _yourPartyOn: party, _birthdayName: "Bee", _giftLine: "made this for you ♥" },
  fields: { _hass: { callWS: async () => ({ gift: { id: "acorncup", world: "woodland" } }) } },
  globals: {
    findsShown: () => true, sharedScreen: () => false, findOf: (_w, world, id) => ({ id, world }),
    yourPartyLine: (l, n) => l.replace("{n}", n),
  },
  slide: () => ({ ids: { "sensor.life_stage": "sensor.pip_life_stage" } }),
});
const queued = (w) => w.calls.filter((c) => c.name === "_queue").map((c) => c.args);

test("on your party day: the wrapped present first, then the find with confetti", async () => {
  const w = world(spec(true));
  await w.card._giftTake(w.slide);
  const q = queued(w);
  assert.deepStrictEqual(q.map((a) => [a[1], a[2], a[3].type]), [
    ["happy birthday, Bee! i got you something ♥", 3000, "gift"],
    ["made this for you ♥", 5000, "gift"],
  ]);
  q[0][3].then();
  const pops = () => w.calls.filter((c) => c.name === "_giftPop").map((c) => c.args.slice(1));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pops())), [[{ id: "acorncup", world: "woodland" }, true]]);
  q[1][3].then();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pops()[1])), [{ id: "acorncup", world: "woodland" }]);
  assert.strictEqual(w.calls.filter((c) => c.name === "_confetti").length, 1);
});

test("any other day: the gift as it always was", async () => {
  const w = world(spec(false));
  await w.card._giftTake(w.slide);
  assert.deepStrictEqual(queued(w).map((a) => a[1]), ["made this for you ♥"]);
});

test("the art is the plan's, beside the finds' size", () => {
  assert.match(src, /const PARTY_PRESENT = "happy birthday, \{n\}! i got you something ♥";/);
  const fs = require("fs");
  const png = fs.readFileSync(`${__dirname}/../../custom_components/virtual_pet/frontend/ui/party_present.png`);
  assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [64, 64], "a find's 64 x 64");
});
