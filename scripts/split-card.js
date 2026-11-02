#!/usr/bin/env node
// Cuts the old one-file card (custom_components/virtual_pet/frontend/hatch-pet-card.js
// before the move to src/card/) into the src/card/ parts. Kept only until every branch
// open at the move is ported (docs/plan-2026-11-02-card-split.md section 6); then delete.
//
//   node scripts/split-card.js [--out <dir>] [<old-card-file>]
//       cut <old-card-file> into <dir> (default src/card/), with manifest.txt
//   node scripts/split-card.js --verify <old-sha>
//       join src/card/, strip the header and the class wrappers, compare with the card at
//       <old-sha>; prints "identical" or the first differing line (exit 1)
//   node scripts/split-card.js --where <old-card-file> <line>
//       the part, the line in it and the method for a line of an OLD card file
//   node scripts/split-card.js --port <M> <B>
//       port branch B's card edit (merge-base M with the pre-move main) onto src/card/
//       with git apply --3way, part by part
//
// Seams are found by text, not line number, so any version of the old file cuts the same
// way: each anchor names the first code line of a part, and the seam snaps up over the
// comment block above it (blank lines inside the block included).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CARD = "custom_components/virtual_pet/frontend/hatch-pet-card.js";
const SRC = path.join(ROOT, "src", "card");

// [part, anchor, class name or null]. A class part's name is its link in the extends
// chain; the first link renames the old `class HatchPetCard extends HTMLElement`, the last
// keeps `HatchPetCard`. `after` means the part starts on the line after the match, no snap.
const PARTS = [
  ["prefs", null, null],
  ["world", /^const FEED_FULL_AT = /, null],
  ["lines", /^const BEE_FRAMES = /, null],
  ["lines-fresh", /^\/\/ --- fresh-expand copy \(/, null],
  ["ui-copy", { after: /^\/\/ --- end fresh-expand copy ---/ }, null],
  ["shell-data", /^\/\/ --- The moulded shell /, null],
  ["style", /^const STYLE = `/, null],
  ["card-base", /^class HatchPetCard extends HTMLElement \{$/, "HatchPetCardBase"],
  ["card-build", /^ {2}\/\/ --- Building /, "HatchPetCardBuild"],
  ["card-layout", /^ {2}_layout\(\) \{$/, "HatchPetCardLayout"],
  ["card-tick", /^ {2}_tick\(\) \{$/, "HatchPetCardTick"],
  ["card-looks", /^ {2}_firstLook\(/, "HatchPetCardLooks"],
  ["card-visit", /^ {2}_catchUp\(/, "HatchPetCardVisit"],
  ["card-moment", /^ {2}_moment\(/, "HatchPetCardMoment"],
  ["card-status", /^ {2}_renderStatus\(/, "HatchPetCardStatus"],
  ["card-sheets", /^ {2}\/\/ --- The shell picker /, "HatchPetCardSheets"],
  ["card-journal", /^ {2}_headCrop\(/, "HatchPetCardJournal"],
  ["card-actions", /^ {2}\/\/ --- Actions -/, "HatchPetCardActions"],
  ["card-games", /^ {2}\/\/ --- Games -/, "HatchPetCardGames"],
  ["card-season", /^ {2}\/\/ --- Seasons -/, "HatchPetCardSeason"],
  ["card-visitors", /^ {2}\/\/ --- World visitors /, "HatchPetCardVisitors"],
  ["card-link", /^ {2}\/\/ --- The infrared link /, "HatchPetCardLink"],
  ["card-flair", /^ {2}\/\/ --- Trait flair -/, "HatchPetCard"],
  ["editor", /^class HatchPetCardEditor extends HTMLElement \{$/, null],
  ["boot", /^HatchPetCard\.seasons = /, null],
];

const isComment = (l) => /^\s*\/\//.test(l);
const isBlank = (l) => /^\s*$/.test(l);

// Start line (0-based) of each part in the old file's lines.
function seams(lines) {
  const starts = [0];
  let from = 1;
  for (const [name, anchor] of PARTS.slice(1)) {
    const re = anchor.after || anchor;
    const hits = [];
    for (let i = from; i < lines.length; i++) if (re.test(lines[i])) hits.push(i);
    if (hits.length !== 1) {
      throw new Error(`split-card: anchor for "${name}" (${re}) matched ${hits.length} lines after line ${from}`);
    }
    let s = hits[0];
    if (anchor.after) s += 1;
    else {
      // Snap up over the comment block above: comment lines, and blank lines with a
      // comment line above them.
      while (s > from) {
        const up = lines[s - 1];
        if (isComment(up)) s--;
        else if (isBlank(up) && s - 2 >= from && isComment(lines[s - 2])) s--;
        else break;
      }
    }
    starts.push(s);
    from = s + 1;
  }
  return starts;
}

// text: the old card. Returns [{ name, start, end, text, shift }] (start/end 1-based,
// inclusive, in the old file; shift = lines a part adds above its first old line).
function cut(text) {
  if (!text.endsWith("\n")) throw new Error("split-card: the card does not end with a newline");
  const lines = text.slice(0, -1).split("\n");
  const starts = seams(lines);
  const parts = [];
  for (let k = 0; k < PARTS.length; k++) {
    const [name, , cls] = PARTS[k];
    const a = starts[k];
    const b = k + 1 < PARTS.length ? starts[k + 1] : lines.length;
    let body = lines.slice(a, b);
    let shift = 0;
    const prev = k > 0 ? PARTS[k - 1][2] : null;
    const next = k + 1 < PARTS.length ? PARTS[k + 1][2] : null;
    if (cls && !prev) {
      // The first link: rename the old class line.
      body[0] = body[0].replace(/^class HatchPetCard /, `class ${cls} `);
    } else if (cls) {
      body = [`class ${cls} extends ${prev} {`, ...body];
      shift = 1;
    }
    if (cls && next) {
      // Close this link before the blank line that ends it, so the join reads
      // "  }\n}\n\nclass Next extends This {\n" at every seam.
      if (body[body.length - 1] !== "") {
        throw new Error(`split-card: "${name}" does not end with an empty line before the next link`);
      }
      body = [...body.slice(0, -1), "}", ""];
    }
    parts.push({ name, start: a + 1, end: b, text: body.join("\n") + "\n", shift });
  }
  return parts;
}

function write(parts, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) fs.unlinkSync(path.join(dir, f));
  for (const p of parts) fs.writeFileSync(path.join(dir, `${p.name}.js`), p.text);
  fs.writeFileSync(path.join(dir, "manifest.txt"), parts.map((p) => `${p.name}.js`).join("\n") + "\n");
}

// The joined text back to the old file: drop the header, the class wrappers, and give the
// first link its old name.
function unwrap(joined) {
  const { HEADER } = require("./build-card.js");
  if (!joined.startsWith(HEADER)) throw new Error("split-card: the join has no GENERATED header");
  return joined
    .slice(HEADER.length)
    .replace(/\n\}\n\nclass \w+ extends \w+ \{\n/g, "\n\n")
    .replace(/^class HatchPetCardBase extends HTMLElement \{$/m, "class HatchPetCard extends HTMLElement {");
}

const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26, ...opts });

function verify(sha) {
  const old = git(["show", `${sha}:${CARD}`]);
  const back = unwrap(require("./build-card.js").join());
  if (back === old) {
    console.log("identical");
    return 0;
  }
  const a = old.split("\n");
  const b = back.split("\n");
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  console.log(`differs at old line ${i + 1}:\n  old:    ${a[i]}\n  joined: ${b[i]}`);
  return 1;
}

function where(file, line) {
  const parts = cut(fs.readFileSync(file, "utf8"));
  const p = parts.find((q) => line >= q.start && line <= q.end);
  if (!p) throw new Error(`split-card: line ${line} is past the end of ${file}`);
  const n = line - p.start + 1 + p.shift;
  const lines = p.text.split("\n");
  let method = "";
  for (let i = n - 1; i >= 0; i--) {
    const m = lines[i].match(/^ {2}(?:static |async |get |set )*([\w$]+)\s*(?:\(|=)/) ||
      lines[i].match(/^(?:const|let|var|function|class)\s+([\w$]+)/);
    if (m) { method = m[1]; break; }
  }
  console.log(`src/card/${p.name}.js:${n}${method ? `  (${method})` : ""}`);
}

function port(m, b) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "split-card-port-"));
  try {
    for (const [tag, rev] of [["M", m], ["B", b]]) write(cut(git(["show", `${rev}:${CARD}`])), path.join(tmp, tag));
    const names = fs.readFileSync(path.join(tmp, "M", "manifest.txt"), "utf8").trim().split("\n");
    let failed = 0;
    for (const f of names) {
      // The preimage blob must exist for --3way to fall back to a merge.
      git(["hash-object", "-w", path.join(tmp, "M", f)]);
      let patch = "";
      try {
        execFileSync("git", ["diff", "--no-index", "--full-index", `M/${f}`, `B/${f}`], { cwd: tmp, encoding: "utf8" });
        continue; // no change in this part
      } catch (e) {
        if (e.status !== 1) throw e;
        patch = e.stdout;
      }
      try {
        git(["apply", "--3way", "-p2", "--directory=src/card"], { input: patch, stdio: ["pipe", "inherit", "inherit"] });
        console.log(`ported src/card/${f}`);
      } catch {
        console.log(`CONFLICT src/card/${f}: resolve the markers`);
        failed++;
      }
    }
    return failed ? 1 : 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { PARTS, cut, unwrap };

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--verify") process.exit(verify(args[1] || "HEAD"));
    else if (args[0] === "--where") where(args[1], Number(args[2]));
    else if (args[0] === "--port") process.exit(port(args[1], args[2]));
    else {
      let out = SRC;
      if (args[0] === "--out") { out = path.resolve(args[1]); args.splice(0, 2); }
      const file = args[0];
      if (!file) throw new Error("usage: split-card.js [--out <dir>] <old-card-file> | --verify <sha> | --where <file> <line> | --port <M> <B>");
      const parts = cut(fs.readFileSync(file, "utf8"));
      write(parts, out);
      for (const p of parts) console.log(`${p.name.padEnd(14)} ${String(p.start).padStart(5)}-${String(p.end).padEnd(5)} ${p.text.split("\n").length - 1} lines`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
