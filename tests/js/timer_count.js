// The ratchet's counter (docs/plan-2026-11-06-director-migration.md 5.0, Appendix B): per card part, the bare
// timer identifiers left once comments are stripped. Strings and templates stay (a timer named in one would
// still count); a regex literal is skipped whole so a `//` inside one is not read as a comment.
// `node tests/js/timer_count.js` prints the table for the parts as they stand.
const fs = require("fs");
const path = require("path");

const CARD = path.join(__dirname, "..", "..", "src", "card");
const NAMES = ["setTimeout", "setInterval", "requestAnimationFrame", "clearTimeout", "clearInterval", "cancelAnimationFrame"];
const ANIMATE = ".animate(";
const COLUMNS = [...NAMES, ANIMATE];

// The text with every comment replaced by a space (line breaks kept). A small scanner: strings, template
// literals (with `${}` nesting), regex literals and the two comment forms.
function stripComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  const stack = []; // open template literals: the brace depth at which each `${` began
  let depth = 0;
  let prev = ""; // the last significant character outside comments, for the regex-or-divide guess
  let prevWord = "";
  const regexAfter = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);
  const startsRegex = () => !prev || "(,=:[!&|?{};+-*%<>~^".includes(prev) || regexAfter.has(prevWord);
  const template = () => {
    // inside a template literal, from just after its opening backtick or a closing `}`
    while (i < n) {
      const c = text[i];
      if (c === "\\") { out += text.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { out += c; i++; prev = "`"; prevWord = ""; return; }
      if (c === "$" && text[i + 1] === "{") { out += "${"; i += 2; stack.push(depth); depth++; prev = "{"; prevWord = ""; return; }
      out += c;
      i++;
    }
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && text[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      prev = c;
      prevWord = "";
      continue;
    }
    if (c === "`") {
      out += c;
      i++;
      template();
      continue;
    }
    if (c === "/" && startsRegex()) {
      let j = i + 1;
      let cls = false;
      while (j < n && text[j] !== "\n") {
        const r = text[j];
        if (r === "\\") { j += 2; continue; }
        if (r === "[") cls = true;
        else if (r === "]") cls = false;
        else if (r === "/" && !cls) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(text[j])) j++;
      out += text.slice(i, j);
      i = j;
      prev = "/";
      prevWord = "";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      if (stack.length && stack[stack.length - 1] === depth - 1) {
        stack.pop();
        depth--;
        out += c;
        i++;
        template();
        continue;
      }
      depth--;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
      prevWord = text.slice(i, j);
      prev = "a";
      out += prevWord;
      i = j;
      continue;
    }
    if (!/\s/.test(c)) {
      prev = c;
      prevWord = "";
    }
    out += c;
    i++;
  }
  return out;
}

// One part's counts: { setTimeout: n, ..., ".animate(": n }, zeros left out.
function countText(text) {
  const code = stripComments(text);
  const row = {};
  for (const name of NAMES) {
    const k = (code.match(new RegExp(`(?<![\\w$])${name}(?![\\w$])`, "g")) || []).length;
    if (k) row[name] = k;
  }
  const a = code.split(ANIMATE).length - 1;
  if (a) row[ANIMATE] = a;
  return row;
}

// Every part but style.js (CSS): { "card-tick": {...}, ... }, parts with nothing left out.
function countParts(dir = CARD) {
  const table = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "style.js").sort()) {
    const row = countText(fs.readFileSync(path.join(dir, file), "utf8"));
    if (Object.keys(row).length) table[file.replace(/\.js$/, "")] = row;
  }
  return table;
}

module.exports = { stripComments, countText, countParts, COLUMNS };

if (require.main === module) {
  const table = countParts();
  const total = {};
  console.log(`| file | ${COLUMNS.join(" | ")} |`);
  for (const [file, row] of Object.entries(table)) {
    for (const k of COLUMNS) total[k] = (total[k] || 0) + (row[k] || 0);
    console.log(`| ${file} | ${COLUMNS.map((k) => row[k] || "").join(" | ")} |`);
  }
  console.log(`| total | ${COLUMNS.map((k) => total[k] || 0).join(" | ")} |`);
}
