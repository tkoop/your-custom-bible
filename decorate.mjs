/*

The shared half of the chapter build.

	The input is a "marked-up fragment": chapter HTML whose you/your/yours are
	already wrapped in youpl/yousg spans and whose divine name is already in
	lord/caplord spans, as CHAPTER_HTML_FORMAT.md describes. The output is the
	finished chapter file, carrying the spelling and capitalisation variants a
	reader's settings switch between.

	Stage 1 produces that fragment per translation and is where anything that has
	to know which translation it is reading belongs - so decorate.mjs imports
	neither the plural-you table nor the BSB's word lists, and markYouSpans()
	takes its plural resolver as an argument rather than importing one.

	addVerseIds() is the other way round: it is part of the fragment contract, so
	stage 1 calls it rather than decorateChapter(). A fragment that already has
	verse ids, written by hand, is left alone.

*/

import { words } from "./words.mjs";

function upperFirst(word) {
	return word[0].toUpperCase() + word.substring(1);
}

// A no-op on a fragment that already carries the ids, so it is safe to run on
// markup that was written by hand.
export function addVerseIds(body) {
	return body.replace(
		/<span class="reftext">(\d+)<\/span>/g,
		'<span class="reftext" id="v$1">$1</span>'
	);
}

// Shared with stage 1, which walks tags to find the bare spans and indented
// blocks the epub uses for Christ's speech.
export const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link"]);

// Extract the canonical text of each verse from a finished chapter file, which
// is what the search index is built from. Returns an array of
// [verseNumber, text].
export function extractVerseTexts(body) {
	var main = body;

	// Cut off the footnotes block.
	var fnIdx = main.indexOf('<div class="fn">');
	if (fnIdx >= 0) main = main.substring(0, fnIdx);

	// Drop headings and cross references entirely.
	main = main.replace(/<p class="hdg">[\s\S]*?<\/p>/g, " ");
	main = main.replace(/<p class="subhdg">[\s\S]*?<\/p>/g, " ");
	main = main.replace(/<span class="cross1">[\s\S]*?<\/span>/g, " ");

	// Mark verse boundaries with a sentinel (the source contains no \u0001).
	// addVerseIds has usually been through by now, so the marker may already
	// carry its id.
	main = main.replace(
		/<span class="reftext"(?: id="v\d+")?>(\d+)<\/span>/g,
		"\u0001$1\u0002"
	);

	// Walk the tags, suppressing spans that hold alternate display variants
	// (cap/nocap, footnotes, spelling variants other than the "us" form).
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

function applySpelling(body) {
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

	return body;
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

export function isWordCharacter(char) {
	if (char.toLowerCase() !== char.toUpperCase()) return true;

	const chars = "0123456789-'";
	if (chars.indexOf(char) >= 0) return true;

	return false;
}

var reportedAllows = {};
var reportedBads = {};

// resolveYou is stage 1's resolver: it answers "youpl", "yousg" or "" for the
// verse-th and you-word in the chapter. Passing nothing runs the scan as stage 2,
// where the you spans are already in the text and the job is only to add the
// capitalisation variants around whatever class the enclosing span already has.
function scanCapitalCase(body, resolveYou) {
	var beginning = true; // Expecting the beginning of a sentence? We expect a capital letter.
	var inTag = false; // In a tag? We'll ignore everything here.
	var inWord = false; // In a word?
	// var inHeading = false
	// var inRefText = false
	var closingTag = false;
	var verse = 0;

	var tags = []; // a stack of tags. Each item is an array of words. Push and pop.
	var tagStarts = []; // where in body each of those tags opened, in step with tags

	var index = 0;
	var word = "";
	var youCount = 0;
	var youWrap = null; // set when a you-word also needs cap/nocap/bsb variants
	var youSpanAt = -1; // where the you span around that word starts
	var prevCh = ""; // last text character (not inside a tag)

	// prettier-ignore
	var badCapitalWords = ["King", "Anointed", "Offspring", "Alpha", "Omega", "End", "Beginning", "Lamb", "Amen", "Witness", "Originator", "Living", "Spirit", "He", "His", "Us", "Our", "Most", "High", "Chief", "Creator", "Man", "Oak", "You", "Me", "Him", "Almighty", "My", "Your", "Garden", "Overseer", "One", "Judge", "Wilderness", "Himself", "The", "Will", "Provide", "Myself", "Bring", "Book", "Feast", "Unleavened", "Bread", "Ten", "Commandments", "Covenant", "Ark", "Desert", "Feast", "Most", "Holy", "Place", "Is", "My", "Banner", "Law", "Meeting", "Mine", "Name", "Place", "Presence", "Tent", "Testimony", "Weeks", "Baby", "Baptist", "Beginning", "Being", "Beloved", "Branch", "Blessed", "Blood", "Breach", "Broad", "Brook", "Brothers", "Canal", "City", "Chosen", "Corner", "Days", "Day", "Dawn", "Daughter", "Destiny", "Destroy", "Eastern", "Dwelling", "Dung", "Dove", "Diviners", "Divine", "Distant", "Elevin", "Everlasting", "Excellency", "Fair", "Faithful", "Fast", "Father", "Favor", "Fear", "Field", "First", "Freedmen", "Fountain", "Forum", "Fortune", "Forsaken", "Forest", "Fool", "Folly", "Fish", "Gate", "Glory", "Goats", "Greater", "Great", "Inspection", "Land", "Light", "Life", "Magesty", "Lower", "Lawgiver", "Launderer", "Last", "Lion", "Lily", "Lilies", "Majestic", "Majesty", "Maker", "Messenger", "Messiah", "Mighty", "Middle", "Moon", "Moons", "Monument", "Morning", "Mountain", "Mysteries", "New", "Oaks", "Not", "Ovens", "Out", "Prophets", "Province", "Pool", "Prophet", "Prophets", "Protector", "Rabbi", "Righteous", "Righteousness", "Rock", "Rocks", "Root", "Salvation", "Salt", "Savior", "Saviour", "Scripture", "Scriptures", "Sea", "Second", "Seer", "Seers", "Serpent", "Servant", "Seven", "Sheep", "Shepherd", "Shepherds", "Son", "Song", "Songs", "Slaughter", "Skull", "Sought", "Sovereign", "Spirits", "Spring", "Star", "Still", "Stoic", "Stone", "Street", "Streets", "Strength", "Supper", "Teacher", "Taverns", "Thunder", "Three", "Thirty", "Their", "Tower", "Travelers", "Treatise", "Tower", "Twelve", "Twin", "True", "Truth", "Union", "Valley", "Word", "Yours", "Yourself"]

	var replacements = []; // each item in array is an object with keys:
	// "at" (index in string to start replacing),
	// "length" (length of word to remove),
	// "replacement" (the string to replace those characters with)

	// The you span the word being read sits inside, and where that span starts.
// Stage 1 is the pass that creates those spans; stage 2 only has to read them,
// and has to cover the whole span when it builds the variants. The scanner
// reads a quoted attribute value as part of the word - an apostrophe is a word
// character to it - so the quotes come off first.
	function enclosingYouSpan() {
		for (var i = tags.length - 1; i >= 0; i--) {
			var cls = null;
			for (var j = 0; j < tags[i].length; j++) {
				var name = tags[i][j].replace(/^["']|["']$/g, "");
				if (name == "yousg") cls = "yousg";
				else if (name == "youpl") cls = "youpl";
			}
			if (cls) return { cls: cls, at: tagStarts[i] };
		}
		return null;
	}

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

			if (resolveYou) {
				var thisCls = resolveYou(verse, youCount);
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
				// Stage 2. The span stage 1 put around this word is all that
				// has to be carried over into the capitalisation variants, and
				// only when the capital logic below is going to emit them.
				var span = enclosingYouSpan();
				if (span) {
					youWrap = span.cls;
					youSpanAt = span.at;
				}
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
					// Stage 1 runs this scan only to decide which you-words the
					// capitalisation stage will take over, so it keeps the
					// sentence tracking and the report but writes nothing: the
					// variants belong to stage 2.
					if (!resolveYou) {
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
						// Stage 1 already wrote the you span around this word, so
						// the variants have to take the span's place rather than
						// the word's - the span is a leaf, so it ends with the
						// </span> closing where we are now.
						var at = index - thisWord.length;
						var length = thisWord.length;
						if (youWrap && youSpanAt >= 0) {
							at = youSpanAt;
							length = index - at + "</span>".length;
						}
						replacements.push({
							at: at,
							length: length,
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
					}

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
					tagStarts.pop();
				}
				// console.log(JSON.stringify(tags))
				word = "";
				inTag = false;
				if (tags.length >= 1 && tags[tags.length - 1][0] == "br") {
					// This was a <br> tag, so let's not store it.
					// console.log("popping br")
					tags.pop();
					tagStarts.pop();
				}
				continue;
			}
			if (isWordCharacter(ch)) {
				word = word + ch;
			} else {
				if (ch == "/") {
					closingTag = true;
					// We just pushed a new empty tag, so we'll undo that here
					tags.pop();
					tagStarts.pop();
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
			// Yes, but maybe it's a closing tag, so we'll pop it if it is a closing tag
			tags.push([]);
			tagStarts.push(index);
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

// Stage 1. Wraps every you/your/yours in a youpl or yousg span, using the
// resolver stage 1 built from that translation's parsing codes.
export function markYouSpans(body, resolveYou) {
	return scanCapitalCase(body, resolveYou);
}

// Stage 2. A marked-up fragment in, a finished chapter file out.
export function decorateChapter(body) {
	body = applySpelling(body);
	body = scanCapitalCase(body, null);
	body = upperCaseWords(body);
	return body;
}
