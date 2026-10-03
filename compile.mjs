/*

Stage 1 of the chapter build: the BSB.

Reads the unzipped epub in bsb/ and writes the marked-up chapter fragment
that stage 2 turns into the finished file:

    https://berean.bible/downloads.htm  "Berean Standard Bible - eBible (.epub)"
    wget https://bereanbible.com/bsb.epub
    unzip bsb.epub -d bsb

The epub's files live in bsb/bsb - final - 7-18-21/OEBPS/Text. Each one is
parsed, renamed to its book and chapter name like "1-chronicles-12.html", and
written into public/translations/bsb.

Everything here is specific to this translation, which is the point: a second
translation gets its own stage 1 and shares stage 2 (decorate.mjs). What
belongs here is whatever needs the plural-you table, the epub's own markup,
or a hand-checked list of verses.

*/

import { readdir, writeFile, open, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser"; // https://www.npmjs.com/package/node-html-parser
import { isPlural, isSingular } from "./pluralYous.mjs";
import {
	VOID_TAGS,
	addVerseIds,
	decorateChapter,
	extractVerseTexts,
	markYouSpans,
} from "./decorate.mjs";

// ---------- Words of Christ (red letter) ----------

// The BSB epub marks Christ's direct speech in two ways: a bare <span> (no
// class) for speech that runs inline, and a paragraph class ending in "red"
// (WOC_RED_CLASSES) for speech set as its own indented block. This pass adds
// the woc class to both so the runtime can render them in red when the
// "Words of Christ" setting is on.
//
// Long speeches (the Sermon on the Mount, the letters in Revelation) run on
// for many paragraphs with only the first one marked, so speech that spills
// past the end of its inline <span> or its red block keeps the red marking on
// the following blocks too, until the closing quotation mark.

// True when the tag's class attribute lists any of the given class names.
function hasClass(tagInner, names) {
	var match = /class=(["'])(.*?)\1/.exec(tagInner);
	if (!match) return false;
	return match[2]
		.trim()
		.split(/\s+/)
		.some((name) => names.has(name));
}

const WOC_CLASS = new Set(["woc"]);

function addWocClass(tag) {
	if (hasClass(tag, WOC_CLASS)) return tag;
	if (/class=/.test(tag)) {
		return tag.replace(
			/class=(["'])(.*?)\1/,
			(_, quote, value) => "class=" + quote + value + " woc" + quote
		);
	}
	return tag.replace(/\s*>$/, ' class="woc">');
}

const WOC_BLOCK_TAGS = new Set(["p", "div"]);

// Indent classes the BSB epub uses for red-lettered blocks. calibre3 is also
// an indent class, but the epub applies it to non-red text too (for example
// the "BOOK I" divider in Psalm 1), so it is deliberately not listed here.
const WOC_RED_CLASSES = new Set([
	"indentred",
	"indentred1",
	"indent1stlinered",
	"tab1stlinered",
]);

function hasWocRedClass(tagInner) {
	return hasClass(tagInner, WOC_RED_CLASSES);
}

function markWordsOfChrist(body, book, chapter) {
	var out = "";
	var i = 0;
	var stack = []; // open tags, each {tag, bare, red}
	var quoteDepth = 0; // unclosed " quotes inside the current woc span
	var continuing = false; // quoted speech continues past its </span> or </p>

	while (i < body.length) {
		var ch = body[i];

		if (ch == "<") {
			var end = body.indexOf(">", i);
			if (end < 0) {
				out += body.slice(i);
				break;
			}
			var raw = body.slice(i, end + 1);
			var inner = body.slice(i + 1, end);
			var closing = inner[0] == "/";
			if (closing) inner = inner.slice(1);
			var selfClosing = /\/\s*$/.test(inner);
			var tagName = inner.trim().split(/[\s\/]/)[0].toLowerCase();

			if (closing) {
				var el = stack.pop();
				if (el && (el.bare || el.red) && quoteDepth > 0) continuing = true;
				out += raw;
			} else if (selfClosing || VOID_TAGS.has(tagName)) {
				out += raw;
			} else {
				var bare = tagName == "span" && inner.indexOf("=") < 0;
				stack.push({ tag: tagName, bare, red: hasWocRedClass(inner) });
				if (bare) {
					quoteDepth = 0;
					out += raw.replace("<span>", '<span class="woc">');
				} else if (WOC_BLOCK_TAGS.has(tagName) &&
					(continuing || hasWocRedClass(inner))
				) {
					out += addWocClass(raw);
				} else {
					out += raw;
				}
			}
			i = end + 1;
			continue;
		}

		if (ch == "“") {
			quoteDepth++;
		} else if (ch == "”") {
			if (quoteDepth > 0) {
				quoteDepth--;
				if (quoteDepth == 0) continuing = false;
			}
		}
		out += ch;
		i++;
	}

	return out;
}

// The quote heuristic above is only as good as the epub's punctuation, and in a
// few places it is wrong: a speech the epub never marked at all stays black, and
// a quotation it forgot to close runs on into the narration that follows.
// resources/woc_verses.tsv lists those verses by hand, both the ones to force
// red and the ones to force back to black.

const WOC_OVERRIDE_FILE = join("resources", "woc_verses.tsv");

// Blocks that sit between verse bodies and are never scripture text: the
// hidden chapter nav block, headings, and cross-reference lines.
const WOC_NON_VERSE_CLASSES = new Set([
	"calibre2",
	"hdg",
	"subhdg",
	"cross",
	"inscrip1",
]);

function loadWocOverrides() {
	var overrides = new Map();
	var text = readFileSync(WOC_OVERRIDE_FILE, "utf8");

	for (var line of text.split("\n")) {
		if (!line.trim() || line.startsWith("#")) continue;
		var [reference, state] = line.split("\t");
		if (state != "red" && state != "black") {
			throw new Error("Bad woc state in " + WOC_OVERRIDE_FILE + ": " + state);
		}
		var space = reference.indexOf(" ");
		var colon = reference.indexOf(":");
		if (space < 0 || colon < space) throw new Error("Bad woc override: " + line);
		var chapter = reference.slice(space + 1, colon);
		if (isNaN(Number(chapter))) {
			throw new Error("Bad woc chapter in " + WOC_OVERRIDE_FILE + ": " + line);
		}
		var chapterKey = (reference.slice(0, space) + " " + chapter).toLowerCase();
		var verses = new Set();
		for (var part of reference.slice(colon + 1).split(/\s+/)) {
			if (!part) continue;
			var range = part.split("-").map(Number);
			if (range.some(isNaN)) throw new Error("Bad woc verse: " + line);
			for (var v = range[0]; v <= (range[1] ?? range[0]); v++) verses.add(v);
		}
		var entry = overrides.get(chapterKey) || { red: new Set(), black: new Set() };
		for (var verse of verses) entry[state].add(verse);
		overrides.set(chapterKey, entry);
	}

	return overrides;
}

var wocOverrides = loadWocOverrides();

function withoutWocClass(tag) {
	var match = /class=(["'])(.*?)\1/.exec(tag);
	if (!match) return tag;
	var classes = match[2].trim().split(/\s+/).filter((c) => c && c != "woc");
	return classes.length
		? tag.replace(/class=(["']).*?\1/, "class=$1" + classes.join(" ") + "$1")
		: tag.replace(/\s*class=(["']).*?\1/, "");
}

// Runs after markWordsOfChrist, so a listed verse always wins over the
// heuristic. Only the scripture blocks are touched; the footnote block that
// closes each chapter is left alone, as are the headings inside a range.
function applyWocOverrides(body, book, chapter) {
	var entry = wocOverrides.get((book + " " + chapter).toLowerCase());
	if (!entry) return body;

	var footnote = body.indexOf('<div class="fn"');
	var end = footnote < 0 ? body.length : footnote;
	var out = [];
	var buf = ""; // text inside the block currently being read
	var open = null; // its opening <p>, held back until we know its verse
	var verse = 0; // the verse the last block belonged to
	var blockVerse = 0; // the verse this block opens with, 0 if it opens mid-verse

	for (var i = 0; i < end; i++) {
		if (body[i] != "<") {
			buf += body[i];
			continue;
		}

		var gt = body.indexOf(">", i);
		if (gt < 0 || gt > end) {
			buf += body.slice(i);
			break;
		}
		var raw = body.slice(i, gt + 1);
		var inner = body.slice(i + 1, gt);
		var closing = inner[0] == "/";
		if (closing) inner = inner.slice(1);
		var tag = inner.trim().split(/[\s\/]/)[0].toLowerCase();

		if (closing) {
			if (open && tag == "p") {
				buf += raw; // the </p> belongs to the block being held
				// A block belongs to the verse it opens with. The epub often
				// ends a block with the number of the verse that follows, so
				// only the first anchor in the block counts.
				if (blockVerse) verse = blockVerse;
				var forced = entry.red.has(verse)
					? true
					: entry.black.has(verse)
						? false
						: null;
				if (forced === null) {
					out.push(open, buf);
				} else {
					out.push(
						hasClass(open, WOC_NON_VERSE_CLASSES)
							? open
							: forced
								? addWocClass(open)
								: withoutWocClass(open)
					);
					out.push(buf);
				}
				open = null;
				buf = "";
				blockVerse = 0;
			} else {
				buf += raw;
			}
		} else {
			var anchor = /^<span[^>]*class=(["'])reftext\1[^>]*\bid="v(\d+)"/.exec(raw);
			if (anchor && open && !blockVerse) blockVerse = Number(anchor[2]);
			if (tag == "p" && !open) {
				// Everything read so far belongs before this block.
				out.push(buf);
				open = raw;
				buf = "";
			} else {
				buf += raw;
			}
		}
		i = gt;
	}

	out.push(open || "", buf);
	return out.join("") + body.slice(end);
}

// The epub's footnote block starts at the link that carries id="fn", and
// chapter.html only recognises it as the <div class="fn"> that closes the
// scripture.
function wrapFootnotes(body) {
	var footNotesAt = body.indexOf(
		'<a class="pcalibre2 pcalibre1 pcalibre pcalibre3" id="fn">'
	);
	if (footNotesAt < 0) return body;
	return (
		body.substring(0, footNotesAt) +
		'<div class="fn">' +
		body.substring(footNotesAt) +
		"</div>"
	);
}

// God's Name. The epub writes the divine name in small caps as plain text,
// so each form is matched here and wrapped. The span's data-name is what the
// reader gets back when they ask for the name as printed.
function markDivineNames(body) {
	body = body.replaceAll(
		"The LORD",
		'<span class="lord" data-name="The LORD">The LORD</span>'
	);
	body = body.replaceAll(
		"the LORD",
		'<span class="lord" data-name="the LORD">the LORD</span>'
	);
	body = body.replaceAll(
		"O LORD",
		'O <span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		", LORD",
		', <span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		">LORD",
		'><span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		"One LORD",
		'One <span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		"mighty LORD",
		'mighty <span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		"our LORD",
		'our <span class="lord" data-name="LORD">LORD</span>'
	);
	body = body.replaceAll(
		"THE LORD",
		'<span class="caplord" data-name="THE LORD">THE LORD</span>'
	);

	return body;
}

// Which of this chapter's you-words are plural, and which singular. The table
// was built by scripts/count-you.mjs out of the BSB translation tables.
function youResolver(book, chapter) {
	return function (verse, youCount) {
		if (isPlural(book, chapter, verse, youCount)) return "youpl";
		if (isSingular(book, chapter, verse, youCount)) return "yousg";
		return "";
	};
}

async function parseChapters() {
	console.log("Parsing BSB...");

	const fromDir = "bsb/bsb - final - 7-18-21/OEBPS/Text";
	const toDir = "public/translations/bsb";
	const filenames = await readdir(fromDir);

	await mkdir(toDir, { recursive: true });

	var searchRecords = [];

	for (const filename of filenames) {
		const fromFile = await open(fromDir + "/" + filename);
		var html = await fromFile.readFile();
		fromFile.close();
		var doc = parse(html);
		const title = doc.querySelector("title").text;
		if (!title.endsWith("BSB")) continue;

		// Convert title to file name
		var newFilename = title.substring(0, title.length - 4);
		newFilename = newFilename.toLocaleLowerCase();
		newFilename = newFilename.replaceAll(" ", "-");

		var book = newFilename.substring(0, newFilename.lastIndexOf("-"));
		var chapter = newFilename.substring(newFilename.lastIndexOf("-") + 1);

		// Remove certain things
		doc.querySelector("#topheading")?.remove();
		doc.querySelector(".bsbheading")?.remove();
		doc.querySelector(".calibre8")?.remove(); // The "Home" link on the bottom

		// Remove tags
		doc.querySelectorAll("a").forEach((el) => {
			if (el.getAttribute("id") == "fn") return;
			el.replaceWith(el.innerHTML);
		});

		// ---- stage 1: this translation's markup ----

		var body = wrapFootnotes(doc.querySelector("body").innerHTML);
		body = markDivineNames(body);
		body = markYouSpans(body, youResolver(book, chapter));

		// The verse ids the runtime scrolls to, and that the overrides below
		// match on.
		body = addVerseIds(body);

		// Words of Christ (red letter)
		body = markWordsOfChrist(body, book, chapter);
		body = applyWocOverrides(body, book, chapter);

		// ---- stage 2: the markup every translation shares ----

		body = decorateChapter(body);

		// Collect canonical verse text for the search index
		var verseTexts = extractVerseTexts(body);
		for (const [verseNum, text] of verseTexts) {
			searchRecords.push([book, parseInt(chapter, 10), verseNum, text]);
		}

		writeFile(toDir + "/" + newFilename + ".html", body);
	}

	console.log("Writing search.json with " + searchRecords.length + " verses...");

	// Sort into canonical Bible order (Genesis -> Revelation), using the slug
	// order from books.js as the source of truth.
	var booksSrc = readFileSync(join("public", "books.js"), "utf8");
	var bookOrder = [...booksSrc.matchAll(/slug:\s*"([^"]+)"/g)].map(function (m) {
		return m[1];
	});
	var bookRank = new Map(bookOrder.map(function (slug, i) {
		return [slug, i];
	}));
	searchRecords.sort(function (a, b) {
		if (a[0] !== b[0]) return bookRank.get(a[0]) - bookRank.get(b[0]);
		if (a[1] !== b[1]) return a[1] - b[1];
		return a[2] - b[2];
	});

	writeFile("public/search.json", JSON.stringify(searchRecords));
}

parseChapters();