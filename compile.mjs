/*

Step 1
On this page https://berean.bible/downloads.htm download "Berean Standard Bible - eBible (.epub)" as bsb.epub
wget https://bereanbible.com/bsb.epub

Step 2
An epub is the same as a zip file, so unzip bsb.epub to the bsb directory
unzip bsb.epub -d bsb 

Step 3
There should be many files in bsb/bsb - final - 7-18-21/OEBPS/Text
Parse those files, renaming them to be their book and chapter name like "1-chronicles-12.html" and put them into public/chapters

*/

import { readdir, writeFile, open } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser"; // https://www.npmjs.com/package/node-html-parser
import { words } from "./words.mjs";
import { isPlural, isSingular } from "./pluralYous.mjs";
import { info } from "node:console";

parseChapters();

function upperFirst(word) {
	return word[0].toUpperCase() + word.substring(1);
}

function addVerseIds(body) {
	return body.replace(
		/<span class="reftext">(\d+)<\/span>/g,
		'<span class="reftext" id="v$1">$1</span>'
	);
}

const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link"]);

// Extract the canonical (BSB) text of each verse from a compiled chapter body.
// Returns an array of [verseNumber, text].
function extractVerseTexts(body) {
	var main = body;

	// Cut off the footnotes block.
	var fnIdx = main.indexOf('<div class="fn">');
	if (fnIdx >= 0) main = main.substring(0, fnIdx);

	// Drop headings and cross references entirely.
	main = main.replace(/<p class="hdg">[\s\S]*?<\/p>/g, " ");
	main = main.replace(/<p class="subhdg">[\s\S]*?<\/p>/g, " ");
	main = main.replace(/<span class="cross1">[\s\S]*?<\/span>/g, " ");

	// Mark verse boundaries with a sentinel (the source contains no \u0001).
	main = main.replace(
		/<span class="reftext">(\d+)<\/span>/g,
		"\u0001$1\u0002"
	);

	// Walk the tags, suppressing spans that hold alternate display variants
	// (cap/nocap, footnotes, spelling variants other than the BSB "us" form).
	var suppressClasses = ["cap", "nocap", "fn", "reftext", "hdg", "subhdg"];
	var out = "";
	var tagRe = /<(\/)?([A-Za-z0-9]+)([^>]*)>/g;
	var m;
	var last = 0;
	var stack = [];
	var skip = 0;
	while ((m = tagRe.exec(main)) !== null) {
		if (skip === 0) out += main.substring(last, m.index);
		last = m.index + m[0].length;
		var closing = !!m[1];
		var tagName = m[2].toLowerCase();
		var attrs = m[3];
		var selfClosing = /\/\s*>$/.test(m[0]);

		if (selfClosing || VOID_TAGS.has(tagName)) continue;

		if (closing) {
			skip -= stack.pop() || 0;
			continue;
		}

		var cm = attrs.match(/class=['"]([^'"]*)['"]/);
		var classes = cm ? cm[1].split(/\s+/) : [];
		var repress = classes.some((c) => suppressClasses.includes(c));
		if (!repress && classes.includes("spell")) {
			repress = classes.includes("ca") || classes.includes("gb");
		}
		stack.push(repress ? 1 : 0);
		skip += repress ? 1 : 0;
	}
	if (skip === 0) out += main.substring(last);

	// Split out the verses.
	var verses = [];
	var parts = out.split("\u0001");
	for (var i = 1; i < parts.length; i++) {
		var sec = parts[i];
		var end = sec.indexOf("\u0002");
		if (end < 0) break;
		var num = parseInt(sec.substring(0, end), 10);
		var text = sec.substring(end + 1).replace(/\s+/g, " ").trim();
		if (text) verses.push([num, text]);
	}
	return verses;
}

function upperCaseWords(body) {
	const heavenHtml =
		"<span class='nocap'>Heaven</span>" +
		"<span class='cap'>heaven</span>" +
		"<span class='bsb'>heaven</span>";
	body = body.replace(/\bheaven\b/g, heavenHtml);

	const earthHtml =
		"<span class='nocap'>Earth</span>" +
		"<span class='cap'>Earth</span>" +
		"<span class='bsb'>earth</span>";
	body = body.replace(/(?<!\bthe\s)\bearth\b/g, earthHtml);

	const hellHtml =
		"<span class='nocap'>Hell</span>" +
		"<span class='cap'>Hell</span>" +
		"<span class='bsb'>hell</span>";
	body = body.replace(/\bhell\b/g, hellHtml);

	return body;
}

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

async function parseChapters() {
	console.log("Parsing BSB...");

	const fromDir = "bsb/bsb - final - 7-18-21/OEBPS/Text";
	const toDir = "public/chapters";
	const filenames = await readdir(fromDir);

	var foundWords = {};

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

		// Save the file
		var body = doc.querySelector("body").innerHTML;

		// Footnotes begins
		var footNotesAt = body.indexOf(
			'<a class="pcalibre2 pcalibre1 pcalibre pcalibre3" id="fn">'
		);
		if (footNotesAt >= 0) {
			body =
				body.substring(0, footNotesAt) +
				'<div class="fn">' +
				body.substring(footNotesAt) +
				"</div>";
		}

		// Spelling
		for (var word in words) {
			var regex = new RegExp("\\b(" + word + ")\\b", "gm");
			var replacement = "";
			replacement += "<span class='spell ca'>" + words[word].ca + "</span>";
			replacement += "<span class='spell gb'>" + words[word].gb + "</span>";
			replacement += "<span class='spell us'>" + words[word].us + "</span>";
			body = body.replace(regex, replacement);

			var wordCa = upperFirst(words[word].ca);
			var wordGb = upperFirst(words[word].gb);
			var wordUs = upperFirst(words[word].us);
			regex = new RegExp("\\b(" + upperFirst(word) + ")\\b", "gm");
			replacement = "";
			replacement += "<span class='spell ca'>" + wordCa + "</span>";
			replacement += "<span class='spell gb'>" + wordGb + "</span>";
			replacement += "<span class='spell us'>" + wordUs + "</span>";
			body = body.replace(regex, replacement);
		}

		// God's Name
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

		// Capitalized Divine Names
		// console.log(newFilename, `'${book}', '${chapter}'`)
		//		if (newFilename.startsWith("1-timothy")) {
		//	body = parseDivineNamesAndYalls(body, book, chapter)
		//	}
		body = parseDivineNamesAndYalls(body, book, chapter);

		// Make upper case words that should be upper case
		body = upperCaseWords(body);

		// Collect canonical verse text for the search index
		var verseTexts = extractVerseTexts(body);
		for (const [verseNum, text] of verseTexts) {
			searchRecords.push([book, parseInt(chapter, 10), verseNum, text]);
		}

		// Add per-verse anchors so search results can scroll to a verse
		body = addVerseIds(body);

		// Words of Christ (red letter)
		body = markWordsOfChrist(body, book, chapter);
		body = applyWocOverrides(body, book, chapter);

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

	// console.log("Cap words: " + Object.keys(reportedAllows).sort().map(w=>w+":"+reportedAllows[w]).join(", "))
	// console.log("Cap words: " + Object.keys(reportedAllows).sort())
}

function isWordCharacter(char) {
	if (char.toLowerCase() !== char.toUpperCase()) return true;

	const chars = "0123456789-'";
	if (chars.indexOf(char) >= 0) return true;

	return false;
}

var reportedAllows = {};
var reportedBads = {};

function parseDivineNamesAndYalls(body, book, chapter) {
	// console.log(book, chapter)
	var beginning = true; // Expecting the beginning of a sentence? We expect a capital letter.
	var inTag = false; // In a tag? We'll ignore everything here.
	var inWord = false; // In a word?
	// var inHeading = false
	// var inRefText = false
	var closingTag = false;
	var verse = 0;

	var tags = []; // a stack of tags. Each item is an array of words. Push and pop.

	var index = 0;
	var word = "";
	var youCount = 0;
	var youWrap = null; // set when a you-word also needs cap/nocap/bsb variants
	var prevCh = ""; // last text character (not inside a tag)

	// prettier-ignore
	var badCapitalWords = ["King", "Anointed", "Offspring", "Alpha", "Omega", "End", "Beginning", "Lamb", "Amen", "Witness", "Originator", "Living", "Spirit", "He", "His", "Us", "Our", "Most", "High", "Chief", "Creator", "Man", "Oak", "You", "Me", "Him", "Almighty", "My", "Your", "Garden", "Overseer", "One", "Judge", "Wilderness", "Himself", "The", "Will", "Provide", "Myself", "Bring", "Book", "Feast", "Unleavened", "Bread", "Ten", "Commandments", "Covenant", "Ark", "Desert", "Feast", "Most", "Holy", "Place", "Is", "My", "Banner", "Law", "Meeting", "Mine", "Name", "Place", "Presence", "Tent", "Testimony", "Weeks", "Baby", "Baptist", "Beginning", "Being", "Beloved", "Branch", "Blessed", "Blood", "Breach", "Broad", "Brook", "Brothers", "Canal", "City", "Chosen", "Corner", "Days", "Day", "Dawn", "Daughter", "Destiny", "Destroy", "Eastern", "Dwelling", "Dung", "Dove", "Diviners", "Divine", "Distant", "Elevin", "Everlasting", "Excellency", "Fair", "Faithful", "Fast", "Father", "Favor", "Fear", "Field", "First", "Freedmen", "Fountain", "Forum", "Fortune", "Forsaken", "Forest", "Fool", "Folly", "Fish", "Gate", "Glory", "Goats", "Greater", "Great", "Inspection", "Land", "Light", "Life", "Magesty", "Lower", "Lawgiver", "Launderer", "Last", "Lion", "Lily", "Lilies", "Majestic", "Majesty", "Maker", "Messenger", "Messiah", "Mighty", "Middle", "Moon", "Moons", "Monument", "Morning", "Mountain", "Mysteries", "New", "Oaks", "Not", "Ovens", "Out", "Prophets", "Province", "Pool", "Prophet", "Prophets", "Protector", "Rabbi", "Righteous", "Righteousness", "Rock", "Rocks", "Root", "Salvation", "Salt", "Savior", "Saviour", "Scripture", "Scriptures", "Sea", "Second", "Seer", "Seers", "Serpent", "Servant", "Seven", "Sheep", "Shepherd", "Shepherds", "Son", "Song", "Songs", "Slaughter", "Skull", "Sought", "Sovereign", "Spirits", "Spring", "Star", "Still", "Stoic", "Stone", "Street", "Streets", "Strength", "Supper", "Teacher", "Taverns", "Thunder", "Three", "Thirty", "Their", "Tower", "Travelers", "Treatise", "Tower", "Twelve", "Twin", "True", "Truth", "Union", "Valley", "Word", "Yours", "Yourself"]

	var replacements = []; // each item in array is an object with keys:
	// "at" (index in string to start replacing),
	// "length" (length of word to remove),
	// "replacement" (the string to replace those characters with)

	function processWord(thisWord, index) {
		// console.log(beginning, thisWord, JSON.stringify(tags))
		word = "";
		youWrap = null;

		var nextWordIsName = false;
		if (thisWord == "King") {
			var nwm = body
				.substring(index)
				.match(/[\s\u00A0]*([A-Za-z]+)/);
			nextWordIsName =
				nwm &&
				nwm[1].substring(0, 1) == nwm[1].substring(0, 1).toUpperCase();
		}

		if (tags.length > 0 && tags[tags.length - 1][2] == "reftext") {
			// console.log("found verse ", thisWord)
			verse = thisWord;
			youCount = 0;
			return;
		}

		if (Number.parseInt(thisWord) == thisWord) return;

		if (
			tags.length > 0 &&
			(tags[tags.length - 1][2] == "fn" || tags[0][2] == "fn")
		) {
			return;
		}

		if (
			tags.length > 0 &&
			(tags[tags.length - 1][2] == "hdg" ||
				tags[tags.length - 1][2] == "subhdg")
		) {
			beginning = true;
			return;
		}

		if (tags.length > 0 && tags[tags.length - 1][2] == "cross1") {
			beginning = true;
			return;
		}

		var thisWordLower = thisWord.toLowerCase();
		if (
			thisWordLower == "you" ||
			thisWordLower == "your" ||
			thisWordLower == "yours"
		) {
			var isBadCapitalWord =
				!beginning &&
				thisWord.substring(0, 1) ==
					thisWord.substring(0, 1).toUpperCase() &&
				badCapitalWords.includes(thisWord);

			if (!isBadCapitalWord) {
				var thisCls = "";
				if (isPlural(book, chapter, verse, youCount)) thisCls = "youpl";
				else if (isSingular(book, chapter, verse, youCount)) thisCls = "yousg";
				if (thisCls != "") {
					replacements.push({
						at: index - thisWord.length,
						length: thisWord.length,
						replacement:
							"<span class='" +
							thisCls +
							"' data-word='" +
							thisWord +
							"'>" +
							thisWord +
							"</span>",
					});
				}
			} else {
				// The capital logic below will emit cap/nocap/bsb variants for
				// this same word; wrap each variant instead so the two spans
				// don't overwrite each other.
				if (isPlural(book, chapter, verse, youCount)) youWrap = "youpl";
				else if (isSingular(book, chapter, verse, youCount))
					youWrap = "yousg";
			}
			youCount++;
		}

		if (thisWord.substring(0, 1) == thisWord.substring(0, 1).toUpperCase()) {
			if (beginning) {
				// All is good. It's a capital at the beginning of a sentence.
				// console.log("Good capital word at beginning of sentence. beginning is now false.")
				beginning = false;
			} else {
				// Capital not at beginning of sentence. Alert!
				if (badCapitalWords.includes(thisWord) && !nextWordIsName) {
					var youInner;
					if (youWrap)
						youInner =
							"<span class='" +
							youWrap +
							"' data-word='" +
							thisWord +
							"'>" +
							thisWord +
							"</span>";
					replacements.push({
						at: index - thisWord.length,
						length: thisWord.length,
						replacement:
							"<span class='cap'>" +
							(youWrap ? youInner : thisWord) +
							"</span><span class='nocap'>" +
							(youWrap
								? "<span class='" +
								  youWrap +
								  "' data-word='" +
								  thisWord.toLowerCase() +
								  "'>" +
								  thisWord.toLowerCase() +
								  "</span>"
								: thisWord.toLowerCase()) +
							"</span><span class='bsb'>" +
							(youWrap ? youInner : thisWord) +
							"</span>",
					});

					if (reportedBads[thisWord] != undefined) {
						reportedBads[thisWord] = reportedBads[thisWord] + 1;
					} else {
						// console.log(`Bad capital word found!!!!!!!!!!!!!!!!!!!!!! '${thisWord}'`)
						reportedBads[thisWord] = 0;
					}
				} else {
					if (reportedAllows[thisWord] != undefined) {
						reportedAllows[thisWord] = reportedAllows[thisWord] + 1;
					} else {
						// console.log(`Capital, but we'll allow it: '${thisWord}'`)
						reportedAllows[thisWord] = 0;
					}
				}
			}
		} else {
			if (beginning) {
				// Lower case at start of sentence. :(
				// console.log("Lower case word at beginning of sentence. beginning is now false.")
				beginning = false;
			} else {
				// Lower case in middle of sentence
			}
		}
	}

	for (index = 0; index < body.length; index++) {
		var ch = body.substring(index, index + 1);
		// console.log(`beginning is ${beginning}, inTag is ${inTag}, inWord is ${inWord} and we're looking at a '${ch}'`)

		if (inTag) {
			if (ch == ">") {
				// console.log("end tag word: " + word)
				if (closingTag && word == "p") {
					var closedTag = tags[tags.length - 1] || [];
					if (
						closedTag.indexOf("hdg") >= 0 ||
						closedTag.indexOf("subhdg") >= 0 ||
						closedTag.indexOf("acrostic") >= 0 ||
						closedTag.indexOf("selah") >= 0
					) {
						beginning = true;
					} else if (!beginning && ".?!:".indexOf(prevCh) >= 0) {
						beginning = true;
					}
				}
				// if (closingTag && word == "span") {
				// 	inRefText = false
				// }
				if (closingTag) {
					// console.log("should pop tag ", JSON.stringify(tags[tags.length-1]))
					tags.pop();
				}
				// console.log(JSON.stringify(tags))
				word = "";
				inTag = false;
				if (tags.length >= 1 && tags[tags.length - 1][0] == "br") {
					// This was a <br> tag, so let's not store it.
					// console.log("popping br")
					tags.pop();
				}
				continue;
			}
			if (isWordCharacter(ch)) {
				word = word + ch;
			} else {
				if (ch == "/") {
					closingTag = true;
					tags.pop(); // We just pushed a new empty tag, so we'll undo that here
				}
				if (word != "") {
					// console.log("tag word: '" + word + "'")
					// if (word == "reftext") {
					// 	inRefText = true
					// }
					// if (word == "hdg" || word == "subhdg") {
					// 	inHeading = true
					// }
				}
				// console.log("Adding word '" + word + "'")
				if (word != "") tags[tags.length - 1].push(word);
				word = "";
			}
			continue;
		}

		if (ch != "<") prevCh = ch;
		if (ch == "<") {
			if (word != "") processWord(word, index);
			tags.push([]); // Yes, but maybe it's a closing tag, so we'll pop it if it is a closing tag
			closingTag = false;
			inTag = true;
			continue;
		}

		if (ch == "“") {
			// opening quotation mark
			// inQuote = true
			beginning = true;
		}

		if (ch == "‘") {
			var previousCh = body.substring(index - 1, index);
			if (previousCh == " " || previousCh == ">") {
				// previous char was a space, so this must be the beginning of a quote
				// console.log("in quote")
				// inQuote = true
				beginning = true;
			} else {
				// The previous char was a letter, so this is either an apostrophe, like in << haven't >>, or it is the end of quotation, like << yes', she said >>
				// Either way we are not at the beginning
				beginning = false;
			}
		}

		/*
		if (ch == "”") {	// closing quotation mark
			inQuote = false
			beginning = false
	}
	*/

		if (ch == "." || ch == "?" || ch == "!" || ch == ":") {
			if (word != "") processWord(word, index);
			beginning = true;
			continue;
		}

		if (!inWord && isWordCharacter(ch)) {
			word = ch;
			inWord = true;
			continue;
		}

		if (inWord && isWordCharacter(ch)) {
			word = word + ch;
			continue;
		}

		if (inWord && !isWordCharacter(ch)) {
			if (word != "") processWord(word, index);
			inWord = false;
			continue;
		}
	}

	for (var i = replacements.length - 1; i >= 0; i--) {
		var rep = replacements[i];
		body =
			body.substring(0, rep.at) +
			rep.replacement +
			body.substring(rep.at + rep.length);
	}

	return body;
}
