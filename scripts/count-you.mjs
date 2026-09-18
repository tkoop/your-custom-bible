import fs from "node:fs";
import readline from "node:readline";

const EN_TEXT_COL = 19;
const VERSE_ID_COL = 13;
const PARSING_COL = 9;
const PARSING_LONG_COL = 10;

const YOU_RE = /\b(ye|you|your|yours|yourself|yourselves)\b/gi;

const S_MARK_RE =
  /\b2(?:ms|fs|s)\b|\b(?:second|2nd)\s+person\b(?:(?!\b(?:singular|plural)\b).)*?\bsingular\b/i;
const P_MARK_RE =
  /\b2(?:mp|fp|p)\b|\b(?:second|2nd)\s+person\b(?:(?!\b(?:singular|plural)\b).)*?\bplural\b/i;
const IMP_RE = /\bImp-([mf])([sp])\b/i;
const OTHER_PERSON_RE = /[13][msfpc]\b|\bfirst person\b|\bthird person\b/i;
const HEB_FORM_RE = /(?:Prtcpl|Adj)-[mf]([sp])\b/i;
const GR_FORM_RE = /\b[A-Z]{2}([SP])\b/;

function rowMark(f) {
  const p9 = f[PARSING_COL - 1];
  const p10 = f[PARSING_LONG_COL - 1];
  const p = `${p9} ${p10}`;
  const s = S_MARK_RE.test(p);
  const pl = P_MARK_RE.test(p);
  if (s && !pl) return { mark: "2s", type: "person" };
  if (pl && !s) return { mark: "2p", type: "person" };
  const imp = p.match(IMP_RE);
  if (imp)
    return { mark: imp[2].toLowerCase() === "p" ? "2p" : "2s", type: "imperative" };
  if (!OTHER_PERSON_RE.test(p)) {
    const heb = p9.match(HEB_FORM_RE);
    if (heb)
      return {
        mark: heb[1].toLowerCase() === "p" ? "2p" : "2s",
        type: "form",
      };
    if (/Part|N-|Adj/i.test(p9) || /\b(?:Noun|Adjective|Participle)/i.test(p10)) {
      const gr = p9.match(GR_FORM_RE);
      if (gr) return { mark: gr[1] === "P" ? "2p" : "2s", type: "form" };
    }
  }
  return { mark: null, type: "none" };
}

function resolveNearest(i, rows) {
  let best = null;
  let bestDist = Infinity;
  for (let j = 0; j < rows.length; j++) {
    const m = rows[j].resolved;
    if (m !== "2s" && m !== "2p") continue;
    const d = Math.abs(i - j);
    if (d < bestDist || (d === bestDist && j > i)) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

const out = process.argv[2];
const rl = readline.createInterface({
  input: fs.createReadStream("resources/bsb_tables.tsv"),
  crlfDelay: Infinity,
});

const perVerse = new Map();
const stat = { person: 0, imperative: 0, consensus: 0, form: 0, nearest: 0, default: 0 };
let first = true;
let currentId = null;
let context = [];

function processVerse(rows, verseId) {
  const consSet = new Set();
  for (const r of rows) {
    if (r.type === "person" || r.type === "imperative") consSet.add(r.mark);
  }
  const unanimous = consSet.size === 1 ? [...consSet][0] : null;
  for (const r of rows) {
    if (r.resolved) continue;
    if (r.type === "person" || r.type === "imperative") {
      r.resolved = r.mark;
      stat[r.type] += r.count;
      continue;
    }
    if (unanimous) {
      r.resolved = unanimous;
      stat.consensus += r.count;
      continue;
    }
    if (r.type === "form") {
      r.resolved = r.mark;
      stat.form += r.count;
    }
  }
  const idx = new Map(rows.map((r, i) => [r, i]));
  for (const r of rows) {
    if (r.resolved) continue;
    const n = resolveNearest(idx.get(r), rows);
    r.resolved = n || "2s";
    stat[n ? "nearest" : "default"] += r.count;
  }
  const booleans = [];
  for (const r of rows) for (let c = 0; c < r.count; c++) booleans.push(r.resolved === "2p");
  perVerse.set(verseId, booleans);
}

for await (const line of rl) {
  if (first) {
    first = false;
    continue;
  }
  const f = line.split("\t");
  const id = (f[VERSE_ID_COL - 1] || "").trim();
  if (id) {
    if (currentId) processVerse(context, currentId);
    currentId = id;
    context = [];
  }
  if (!currentId) continue;
  const count = [...(f[EN_TEXT_COL - 1] || "").matchAll(YOU_RE)].length;
  if (count === 0) continue;
  const { mark, type } = rowMark(f);
  context.push({ count, mark, type });
}
if (currentId) processVerse(context, currentId);

let totalYou = 0;
for (const arr of perVerse.values()) totalYou += arr.length;

console.error("Total you-matches:", totalYou, "in", perVerse.size, "verses");
console.error("  from parsing:", stat.person, " imperatives:", stat.imperative);
console.error("  unanimous-consensus:", stat.consensus, " form-number:", stat.form);
console.error("  nearest-marker:", stat.nearest, " defaulted singular:", stat.default);

if (out) {
  fs.writeFileSync(
    out,
    [...perVerse.entries()]
      .map(([v, arr]) => `${v}\t${JSON.stringify(arr)}`)
      .join("\n") + "\n"
  );
  console.error("Wrote", out);
}