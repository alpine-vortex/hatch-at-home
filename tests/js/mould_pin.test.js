// The shell mould's hit test (inRound) pinned: the allocation-free form must give the same
// answer as the original closure form on every half-cell of many boxes and radii, and the grid's
// hash is fixed so a later change cannot drift the shell's pixels silently.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const vm = require("vm");
const src = require("./card-source");

const ctx = {};
vm.runInNewContext(
  src.match(/\nconst NEAR8 = .*\n/)[0] + src.match(/\nfunction cornerIn\([\s\S]*?\n\}\n/)[0] +
    src.match(/\nfunction inRound\([\s\S]*?\n\}\n/)[0] + "this.inRound = inRound; this.NEAR8 = NEAR8;", ctx);

// The original, as it stood on 28172956.
function oldInRound(x, y, w, h, rad) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const f = Math.min(1, w / (rad[0][0] + rad[1][0] || 1), w / (rad[3][0] + rad[2][0] || 1),
    h / (rad[0][1] + rad[3][1] || 1), h / (rad[1][1] + rad[2][1] || 1));
  const c = rad.map(([a, b]) => [a * f, b * f]);
  const corner = (cx, cy, [a, b], sx, sy) => !a || !b || sx * (x - cx) < 0 || sy * (y - cy) < 0 ||
    ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
  return corner(c[0][0], c[0][1], c[0], -1, -1) && corner(w - c[1][0], c[1][1], c[1], 1, -1) &&
    corner(w - c[2][0], h - c[2][1], c[2], 1, 1) && corner(c[3][0], h - c[3][1], c[3], -1, 1);
}

const boxes = [[40, 30], [64, 64], [37, 51], [90, 22]];
const radii = [
  [[0, 0], [0, 0], [0, 0], [0, 0]],
  [[8, 8], [8, 8], [8, 8], [8, 8]],
  [[30, 20], [5, 9], [0, 4], [12, 12]],
  [[50, 50], [50, 50], [50, 50], [50, 50]],
  [[3.5, 7.25], [11, 2], [20, 20], [1, 1]],
];

test("inRound matches the original and its grid hash is pinned", () => {
  const h = crypto.createHash("sha256");
  for (const [w, hh] of boxes) for (const rad of radii) {
    let row = "";
    for (let y = -1; y <= hh + 1; y += 0.5) for (let x = -1; x <= w + 1; x += 0.5) {
      const a = ctx.inRound(x, y, w, hh, rad);
      assert.strictEqual(a, oldInRound(x, y, w, hh, rad), `${w}x${hh} at ${x},${y}`);
      row += a ? "1" : "0";
    }
    h.update(row);
  }
  assert.strictEqual(h.digest("hex").slice(0, 16), "988370aebd72182e");
});
