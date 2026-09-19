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

// The BSB epub marks Christ's direct speech with a bare <span> (no class).
// This pass turns those spans into <span class="woc"> so the runtime can
// render them in red when the "Words of Christ" setting is on. Quoted speech
// that spills past the closing </span> (e.g. Matthew 16:28 ends in its own
// paragraph) keeps its red marking by colouring the continuation block.

function addWocClass(tag) {
	if (/class=/.test(tag)) {
		return tag.replace(
			/class=(["'])(.*?)\1/,
			(_, quote, value) => "class=" + quote + value + " woc" + quote
		);
	}
	return tag.replace(/\s*>$/, ' class="woc">');
}

const WOC_BLOCK_TAGS = new Set(["p", "div"]);

function markWordsOfChrist(body, book, chapter) {
	var out = "";
	var i = 0;
	var stack = []; // open tags, each {tag, bare}
	var quoteDepth = 0; // unclosed " quotes inside the current woc span
	var continuing = false; // quoted speech continues past its </span>

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
				if (el && el.bare && quoteDepth > 0) continuing = true;
				out += raw;
			} else if (selfClosing || VOID_TAGS.has(tagName)) {
				out += raw;
			} else {
				var bare = tagName == "span" && inner.indexOf("=") < 0;
				stack.push({ tag: tagName, bare });
				if (bare) {
					quoteDepth = 0;
					out += raw.replace("<span>", '<span class="woc">');
				} else if (continuing && WOC_BLOCK_TAGS.has(tagName)) {
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

	// prettier-ignore
	var badCapitalWords = ["Offspring", "Alpha", "Omega", "End", "Beginning", "Lamb", "Amen", "Witness", "Originator", "Living", "Spirit", "He", "His", "Us", "Our", "Most", "High", "Chief", "Creator", "Man", "Oak", "You", "Me", "Him", "Almighty", "My", "Your", "Garden", "Overseer", "One", "Judge", "Wilderness", "Himself", "The", "Will", "Provide", "Myself", "Bring", "Book", "Feast", "Unleavened", "Bread", "Ten", "Commandments", "Covenant", "Ark", "Desert", "Feast", "Most", "Holy", "Place", "Is", "My", "Banner", "Law", "Meeting", "Mine", "Name", "Place", "Presence", "Tent", "Testimony", "Weeks", "Baby", "Baptist", "Beginning", "Being", "Beloved", "Branch", "Blessed", "Blood", "Breach", "Broad", "Brook", "Brothers", "Canal", "City", "Chosen", "Corner", "Days", "Day", "Dawn", "Daughter", "Destiny", "Destroy", "Eastern", "Dwelling", "Dung", "Dove", "Diviners", "Divine", "Distant", "Elevin", "Everlasting", "Excellency", "Fair", "Faithful", "Fast", "Father", "Favor", "Fear", "Field", "First", "Freedmen", "Fountain", "Forum", "Fortune", "Forsaken", "Forest", "Fool", "Folly", "Fish", "Gate", "Glory", "Goats", "Greater", "Great", "Inspection", "Land", "Light", "Life", "Magesty", "Lower", "Lawgiver", "Launderer", "Last", "Lion", "Lily", "Lilies", "Majestic", "Majesty", "Maker", "Messenger", "Messiah", "Mighty", "Middle", "Moon", "Moons", "Monument", "Morning", "Mountain", "Mysteries", "New", "Oaks", "Not", "Ovens", "Out", "Prophets", "Province", "Pool", "Prophet", "Prophets", "Protector", "Rabbi", "Righteous", "Righteousness", "Rock", "Rocks", "Root", "Salvation", "Salt", "Savior", "Saviour", "Scripture", "Scriptures", "Sea", "Second", "Seer", "Seers", "Serpent", "Servant", "Seven", "Sheep", "Shepherd", "Shepherds", "Son", "Song", "Songs", "Slaughter", "Skull", "Sought", "Sovereign", "Spirits", "Spring", "Star", "Still", "Stoic", "Stone", "Street", "Streets", "Strength", "Supper", "Teacher", "Taverns", "Thunder", "Three", "Thirty", "Their", "Tower", "Travelers", "Treatise", "Tower", "Twelve", "Twin", "True", "Truth", "Union", "Valley", "Word", "Yours", "Yourself"]

	var replacements = []; // each item in array is an object with keys:
	// "at" (index in string to start replacing),
	// "length" (length of word to remove),
	// "replacement" (the string to replace those characters with)

	function processWord(thisWord, index) {
		// console.log(beginning, thisWord, JSON.stringify(tags))
		word = "";
		youWrap = null;

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
				if (badCapitalWords.includes(thisWord)) {
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
					// inHeading = false
					beginning = true; // we just came across a <p> or </p> tag
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
