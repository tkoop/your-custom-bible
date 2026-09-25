import fs from "fs";
import vm from "vm";
import path from "path";

// Read the book list from the app itself to get name -> slug mapping.
const booksSrc = fs.readFileSync("public/books.js", "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(booksSrc + "\nthis.books = books;", sandbox);
const books = sandbox.books;
const slugByName = {};
for (const b of books) slugByName[b.name] = b.slug;
// TSV uses "Psalm" where the app uses "Psalms"
slugByName["Psalm"] = slugByName["Psalms"];

const tsv = fs.readFileSync("resources/bsb_tables.tsv", "utf8").split("\n");
tsv.shift(); // header

// { slug -> { verseNum -> [entry, ...] } }
const data = {};
const unmapped = new Set();

let curBook = null;
let curVerse = null;

for (const line of tsv) {
	const f = line.replace(/\r$/, "").split("\t");
	if (f.length < 23) continue;

	const lang = f[4];
	const orig = f[6] || f[5];
	const translit = f[7];
	const parse = f[9] || f[8];
	const strong = f[10] || f[11];
	const verseKey = f[12];
	const eng = f[18];
	let pnc = f[19] || "";

	if (!lang || !orig || !translit) continue;

	// A new verse begins on rows that carry a VerseId like "Genesis 1:1".
	if (verseKey) {
		const m = verseKey.match(/^(.*?)\s+(\d+):(\d+)$/);
		if (!m) {
			curBook = null;
			curVerse = null;
			continue;
		}
		const slug = slugByName[m[1]];
		curBook = slug || "UNKNOWN";
		if (slug) curVerse = m[2] + ":" + m[3];
		else {
			unmapped.add(m[1]);
			curVerse = null;
		}
	}
	if (!curBook || !curVerse) continue;

	// Only rows that map to actual displayed English text are tappable.
	if (!/[A-Za-z]/.test(eng)) continue;

	const words = eng
		.toLowerCase()
		.split(/[^a-z']+/)
		.filter((w) => /[a-z]/.test(w))
		.map((w) => w.replace(/^'+|'+$/g, ""));

	if (words.length == 0) continue;

	if (!data[curBook]) data[curBook] = {};
	if (!data[curBook][curVerse]) data[curBook][curVerse] = [];

	data[curBook][curVerse].push({
		e: (eng.trim() + pnc).trim(),
		o: orig,
		t: translit,
		p: parse,
		s: strong,
		l: lang,
		w: words,
	});
}

const outDir = "public/wordData";
fs.mkdirSync(outDir, { recursive: true });

let totalBytes = 0;
for (const slug of Object.keys(data)) {
	const payload = JSON.stringify({ verses: data[slug] });
	fs.writeFileSync(path.join(outDir, slug + ".json"), payload);
	totalBytes += payload.length;
}

console.log("books generated:", Object.keys(data).length);
console.log("total size:", (totalBytes / 1024 / 1024).toFixed(1), "MB");
if (unmapped.size) {
	console.log("unmapped verseId book names:", [...unmapped].sort().join(", "));
} else {
	console.log("all verseId book names mapped to apps books.js");
}