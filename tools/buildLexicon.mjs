// Builds public/lexicon, one file per Strong's number, out of the per-book word
// data that tools/buildWordData.mjs writes. Run it after buildWordData:
//
//	node tools/buildWordData.mjs
//	node tools/buildLexicon.mjs
//
// The word study popup needs one entry - the row a click landed on - which is
// what wordData holds. A page for the word itself needs everything else that is
// known about the word, and that is the whole Bible rather than the chapter on
// screen, so it cannot live in a file fetched per chapter. Hence a directory of
// small files, one per Strong's number, that the page fetches whole.
//
// Two things go into a file. The counts are out of the BSB's own usage - how
// often each spelling, transliteration, parsing code and English rendering
// occurs, and where - which is what lets the page say what the translation does
// with the word. The definition is out of Strong's Dictionaries of Hebrew and
// Greek, because bsb_tables.tsv has no dictionary in it at all.
// AGENTS.md documents the shape of a lexicon file.

import fs from "fs";
import vm from "vm";
import path from "path";

// How much of each list is kept. The tables hold one row per English word, so
// a common word has thousands of rows behind it and its file would be megabytes.
// Every cut list carries its true total in the file, so the page says what it
// is not showing rather than quietly trimming it.
const MAX_RENDERINGS = 40; // distinct English renderings, most used first
const MAX_VERSES = 2000; // verse references across the whole entry
const MAX_SPELLINGS = 8; // spellings of the word in the original script
const MAX_TRANSLITERATIONS = 6;
const MAX_PARSINGS = 8;

// Strong's numbers are per language - H1 and G1 are unrelated words - so the key
// carries the letter. Hebrew covers the Aramaic words too, which the Strong's
// numbering puts in the same sequence.
function wordKey(lang, strong) {
	if (!strong || !/^[0-9]+$/.test(strong)) return null;
	return (lang == "Greek" ? "G" : "H") + strong.padStart(4, "0");
}

// A verse reference is a book's position in books.js - canonical order - plus
// the verse key the word data is keyed by, so the page can lay verses out in
// reading order without carrying the book list into every file.
const booksSrc = fs.readFileSync("public/books.js", "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(booksSrc + "\nthis.books = books;", sandbox);
const bookIndexBySlug = {};
sandbox.books.forEach(function (book, index) {
	bookIndexBySlug[book.slug] = index;
});

// Strong's own dictionaries, keyed on the same numbers the tables use, so the
// two join without a lookup table. Each file is a CommonJS module that exports
// its entries as an object keyed on unpadded numbers ("H430", "G2424"), so the
// keys are padded here and the module is loaded in a sandbox - the same two
// moves buildWordData.mjs makes to read books.js. AGENTS.md records where they
// come from and under what licence.
function loadStrongs(file) {
	const box = { module: { exports: null } };
	vm.createContext(box);
	vm.runInContext(fs.readFileSync(file, "utf8"), box);
	const entries = {};
	for (const [number, entry] of Object.entries(box.module.exports)) {
		const letter = number[0];
		entries[letter + String(parseInt(number.slice(1), 10)).padStart(4, "0")] = entry;
	}
	return entries;
}

// The text is Strong's, with the typographic leftovers taken off: the leading
// and doubled spaces, and the braces he put round an entry that is only a
// cross-reference to another word. His numbers are written with five digits in
// places and four in others ("H03091"), so they are brought to the four digits
// the rest of the app uses - the page turns them into links to those words.
function cleanStrongsText(text) {
	if (!text) return "";
	return text
		.replace(/[{}]/g, "")
		.replace(/\b([HG])0*(\d+)\b/g, function (match, letter, digits) {
			return letter + String(parseInt(digits, 10)).padStart(4, "0");
		})
		.replace(/\s+/g, " ")
		.trim();
}

// Stable descending order: most used first, then alphabetical, so a rebuild
// that saw the same counts wrote the same bytes.
function byCountThenName(a, b) {
	if (b[1] != a[1]) return b[1] - a[1];
	return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

// A row's English text carries the punctuation of the sentence it sits in, so
// "Jesus", "Jesus," and "Jesus." are three strings for one rendering, and a
// capital only says where the sentence turned over. Renderings are grouped on
// the bare words; the spelling a word is shown under is the one the BSB used
// most, so a name keeps its capitals.
//
// Brackets are left alone: "These [are]" ends in one, and taking it off would
// break the pair the BSB draws around a supplied word.
const TRAILING_PUNCTUATION = /[\s.,;:!?'"“”‘’…-]+$/u;

function renderingKey(english) {
	return english.replace(TRAILING_PUNCTUATION, "").toLowerCase();
}

function bump(counts, value) {
	if (!value) return;
	counts.set(value, (counts.get(value) || 0) + 1);
}

// "1:2" before "1:10", and chapter 2 before chapter 10.
function verseSort(a, b) {
	const aParts = a.split(":");
	const bParts = b.split(":");
	if (aParts[0] != bParts[0]) return parseInt(aParts[0], 10) - parseInt(bParts[0], 10);
	return parseInt(aParts[1], 10) - parseInt(bParts[1], 10);
}

const wordDataDir = "public/wordData";
const outDir = "public/lexicon";

if (!fs.existsSync(wordDataDir)) {
	console.error("no " + wordDataDir + " - run tools/buildWordData.mjs first");
	process.exit(1);
}

const strongs = {
	...loadStrongs("resources/strongs-hebrew-dictionary.js"),
	...loadStrongs("resources/strongs-greek-dictionary.js"),
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const words = {};
let skippedRows = 0;

for (const file of fs.readdirSync(wordDataDir).sort()) {
	if (!file.endsWith(".json")) continue;
	const bookIndex = bookIndexBySlug[file.slice(0, -5)];
	if (bookIndex === undefined) {
		console.warn("no book for " + file + ", skipped");
		continue;
	}

	const data = JSON.parse(fs.readFileSync(path.join(wordDataDir, file), "utf8"));
	for (const verseKey of Object.keys(data.verses)) {
		for (const entry of data.verses[verseKey]) {
			const key = wordKey(entry.l, entry.s);
			// The tables leave about 4,000 rows without a Strong's number, Hebrew
			// particles mostly. There is nothing to key those by, so they stay
			// popup-only.
			if (!key) {
				skippedRows++;
				continue;
			}

			let word = words[key];
			if (!word) {
				word = words[key] = {
					strong: entry.s,
					lang: entry.l,
					count: 0,
					spellings: new Map(),
					transliterations: new Map(),
					parsings: new Map(),
					// English rendering -> { count, spellings, books }
					renderings: new Map(),
					verses: new Set(),
					books: new Set(),
				};
			}

			word.count++;
			bump(word.spellings, entry.o);
			bump(word.transliterations, entry.t);
			bump(word.parsings, entry.p);
			word.verses.add(bookIndex + ":" + verseKey);
			word.books.add(bookIndex);

			let rendering = word.renderings.get(renderingKey(entry.e));
			if (!rendering) {
				rendering = { count: 0, spellings: new Map(), books: new Map() };
				word.renderings.set(renderingKey(entry.e), rendering);
			}
			rendering.count++;
			bump(rendering.spellings, entry.e);
			const verseRef = bookIndex + ":" + verseKey;
			let inBook = rendering.books.get(bookIndex);
			if (!inBook) {
				inBook = new Set();
				rendering.books.set(bookIndex, inBook);
			}
			inBook.add(verseKey);
		}
	}
}

// Spend one verse budget across the renderings that use the verses most, so a
// word used thousands of times still opens in one small request. A rendering
// gets an empty book list once the budget is gone, which is how the page tells
// a rendering it knows nothing about apart from one it has run out of room for.
//
// A verse can carry the same word under two renderings - "[God] Jesus Christ"
// holds two - so the references that were kept are counted once, against the
// distinct verses the word appears in.
function placeVerses(renderings, budget) {
	const placed = [];
	const kept = new Set();
	let left = budget;

	for (const rendering of renderings) {
		if (left == 0) {
			placed.push({ rendering: rendering, books: [] });
			continue;
		}
		const books = [];
		for (const bookIndex of [...rendering.books.keys()].sort((a, b) => a - b)) {
			if (left == 0) break;
			const verses = [...rendering.books.get(bookIndex)].sort(verseSort);
			for (const verse of verses) {
				if (left == 0) break;
				books.push([bookIndex, verse]); // one pair per verse, kept in order
				kept.add(bookIndex + ":" + verse);
				left--;
			}
		}
		placed.push({ rendering: rendering, books: mergeBookVerses(books) });
	}

	return { placed: placed, kept: kept };
}

// The verses of one rendering, per book, as the space separated lists a file
// holds them in.
function mergeBookVerses(pairs) {
	const byBook = new Map();
	for (const [bookIndex, verse] of pairs) {
		let list = byBook.get(bookIndex);
		if (!list) {
			list = [];
			byBook.set(bookIndex, list);
		}
		list.push(verse);
	}
	return [...byBook].map(function (pair) {
		return [pair[0], pair[1].join(" ")];
	});
}

function cap(list, limit) {
	return list.length > limit ? list.slice(0, limit) : list;
}

let totalBytes = 0;
let versesKeptTotal = 0;
let wordsWritten = 0;
let dictionaryEntries = 0;
let missingDefinitions = 0;
let wordsByLanguage = {};

for (const key of Object.keys(words).sort()) {
	const word = words[key];
	delete words[key]; // let go of it as the file goes out

	// The renderings come out of a Map keyed on the bare words, so they are
	// reshaped before they are sorted: most used first, then alphabetical.
	const renderings = [...word.renderings]
		.map(function (pair) {
			const spellings = [...pair[1].spellings].sort(byCountThenName);
			return {
				text: spellings[0][0].replace(TRAILING_PUNCTUATION, ""),
				count: pair[1].count,
				books: pair[1].books,
			};
		})
		.sort(function (a, b) {
			if (b.count != a.count) return b.count - a.count;
			return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
		})
		.slice(0, MAX_RENDERINGS);

	const verses = placeVerses(renderings, MAX_VERSES);
	versesKeptTotal += verses.kept.size;

	const payload = {
		k: key,
		s: word.strong,
		l: word.lang,
		// How much of the word there is
		n: word.count, // occurrences in the BSB
		vc: word.verses.size, // distinct verses it appears in
		bc: word.books.size, // distinct books it appears in
		rc: word.renderings.size, // distinct English renderings, before any cut
		oc: word.spellings.size, // distinct spellings, before any cut
		tc: word.transliterations.size, // distinct transliterations
		pc: word.parsings.size, // distinct parsing codes
		vs: verses.kept.size, // verse references in this file
		vd: word.verses.size - verses.kept.size, // verses this file does not list
		rd: word.renderings.size - renderings.length, // renderings with no verses
		// What the word looks like
		o: cap([...word.spellings].sort(byCountThenName), MAX_SPELLINGS),
		t: cap([...word.transliterations].sort(byCountThenName), MAX_TRANSLITERATIONS),
		p: cap([...word.parsings].sort(byCountThenName), MAX_PARSINGS),
		// How it is translated, most used first
		g: verses.placed.map(function (entry) {
			return {
				e: entry.rendering.text,
				n: entry.rendering.count,
				b: entry.books.filter((pair) => pair[1]),
			};
		}),
	};

	// What Strong's dictionaries make of it. Nineteen of the numbers the tables
	// use have no definition at all, so the fields that came out empty are left
	// out rather than written as blanks.
	const entry = strongs[key];
	if (entry) {
		const lemma = cleanStrongsText(entry.lemma);
		const transliteration = cleanStrongsText(entry.xlit || entry.translit);
		const pronunciation = cleanStrongsText(entry.pron);
		const definition = cleanStrongsText(entry.strongs_def);
		const derivation = cleanStrongsText(entry.derivation);
		if (lemma) payload.m = lemma; // the headword the dictionary lists
		if (transliteration) payload.x = transliteration;
		if (pronunciation) payload.pr = pronunciation; // Hebrew only; the Greek
		// dictionaries this comes from give a transliteration but no respelling
		if (definition) payload.d = definition;
		if (derivation) payload.r = derivation; // where the word comes from
	}

	const text = JSON.stringify(payload);
	fs.writeFileSync(path.join(outDir, key + ".json"), text);
	totalBytes += text.length;
	wordsWritten++;
	wordsByLanguage[word.lang] = (wordsByLanguage[word.lang] || 0) + 1;
	dictionaryEntries++;
	if (!payload.d) missingDefinitions++;
}

console.log("words written:", wordsWritten, wordsByLanguage);
console.log("total size:", (totalBytes / 1024 / 1024).toFixed(1), "MB");
console.log("verse references kept:", versesKeptTotal);
console.log("rows with no Strong's number, popup only:", skippedRows);
console.log("with a Strong's entry:", dictionaryEntries, "with no definition:", missingDefinitions);
