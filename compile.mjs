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

// Book name (from the KJV red-letter dataset) -> BSB slug.
const WOC_BOOK_SLUG = {
	Matthew: "matthew",
	Mark: "mark",
	Luke: "luke",
	John: "john",
	Acts: "acts",
	Revelation: "revelation",
};

function levenshtein(a, b) {
	const m = a.length;
	const n = b.length;
	const col = n + 1;
	const d = new Uint32Array((m + 1) * col);
	for (let i = 0; i <= m; i++) d[i * col] = i;
	for (let j = 0; j <= n; j++) d[j] = j;
	for (let j = 1; j <= n; j++) {
		for (let i = 1; i <= m; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i * col + j] = Math.min(
				d[(i - 1) * col + j] + 1,
				d[i * col + j - 1] + 1,
				d[(i - 1) * col + j - 1] + cost,
			);
		}
	}
	return d[m * col + n];
}

const WOC_CLEANER = /[^\p{L}\p{N}]+/gu;

// KJV relic forms and 2nd/3rd-person singular relics, mapped to the spellings
// used by the BSB translation. Lets archaic wording ("I say unto you", "thou
// shalt", "he saith") still be located inside a BSB verse so red-letter ranges
// survive the KJV->BSB paraphrase drift.
const WOC_LEMMA = {
	thou: ["you"],
	thee: ["you"],
	thy: ["your"],
	thine: ["your"],
	ye: ["you"],
	unto: ["to"],
	verily: ["truly"],
	say: ["tell"],
	saith: ["says", "said", "say"],
	sayest: ["say"],
	spake: ["spoke"],
	whence: ["where"],
	whither: ["where"],
	shew: ["show"],
	sheweth: ["shows"],
	shewed: ["showed"],
	hath: ["has"],
	hast: ["have"],
	hadst: ["had"],
	art: ["are"],
	wast: ["were"],
	wert: ["were"],
	wilt: ["will"],
	shalt: ["shall"],
	canst: ["can"],
	wouldest: ["would"],
	couldest: ["could"],
	shouldest: ["should"],
	mightest: ["might"],
	mayest: ["may"],
	except: ["unless"],
	whole: ["healed"],
	cock: ["rooster"],
	behold: ["look"],
	seest: ["see"],
	holdeth: ["holds"],
	knoweth: ["knows"],
	cometh: ["comes"],
	goeth: ["goes"],
	sitteth: ["sits"],
	stoodest: ["stood"],
};

// Modern spellings a KJV relic token can take: special-case overrides, then the
// regular "-eth" -> "-es/-s" and "-est" -> "" relic inflections.
function wocModern(a) {
	if (WOC_LEMMA[a]) return WOC_LEMMA[a];
	if (a.endsWith("eth")) {
		const base = a.slice(0, -3);
		return [base + "es", base + "s"];
	}
	if (a.endsWith("est")) {
		return [a.slice(0, -3)];
	}
	return null;
}

// Similarity (0..1) between one KJV and one BSB word token. Exact matches are
// preferred; small spelling differences (fulfil/fulfill, worshipt/worship) and
// KJV relic forms (verily/truly, ye/you, cometh/comes) are tolerated so the
// KJV-derived spoken text can be located inside the BSB verse.
function wocTokenSim(a, b) {
	const aa = a.toLowerCase().replace(WOC_CLEANER, "");
	const bb = b.toLowerCase().replace(WOC_CLEANER, "");
	if (aa === bb) return 1;
	if (!aa.length || !bb.length) return 0;
	const maxLen = Math.max(aa.length, bb.length);
	const dist = levenshtein(aa, bb);
	if (dist === 0) return 1;
	if (dist <= Math.max(1, Math.round(maxLen * 0.3))) return 0.5;
	const modern = wocModern(aa);
	if (modern && modern.includes(bb)) return 0.85;
	return 0;
}

// Local (Smith-Waterman) alignment of the KJV spoken words against the BSB
// verse words. Returns the BSB token range {start,end} inclusive plus the
// fraction of KJV words that aligned, or null when the match is too weak.
// A backpointer matrix (stored during fill, tie-break diag > up > left) is
// followed for the traceback so it always reproduces the filled scores.
function alignSpeech(kjvWords, bsbWords) {
	const n = kjvWords.length;
	const m = bsbWords.length;
	if (!n || !m) return null;

	const col = m + 1;
	const S = new Float32Array((n + 1) * col);
	const P = new Int8Array((n + 1) * col); // 0 reset, 1 diag, 2 up, 3 left
	let best = { score: 0, i: 0, j: 0 };
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const sim = wocTokenSim(kjvWords[i - 1], bsbWords[j - 1]);
			const diag = S[(i - 1) * col + (j - 1)] + (sim > 0 ? 1 + sim : -1);
			const up = S[(i - 1) * col + j] - 1;
			const left = S[i * col + (j - 1)] - 1;
			let v = 0;
			let p = 0;
			if (diag > v) {
				v = diag;
				p = 1;
			}
			if (up > v) {
				v = up;
				p = 2;
			}
			if (left > v) {
				v = left;
				p = 3;
			}
			S[i * col + j] = v;
			P[i * col + j] = p;
			if (v > best.score) best = { score: v, i, j };
		}
	}
	if (best.score <= 0) return null;

	let { i, j } = best;
	let strength = 0;
	const matchedB = [];
	while (i > 0 && j > 0 && S[i * col + j] > 0) {
		const p = P[i * col + j];
		if (p === 1) {
			const sim = wocTokenSim(kjvWords[i - 1], bsbWords[j - 1]);
			matchedB.push(j - 1);
			strength += sim;
			i--;
			j--;
		} else if (p === 2) {
			i--;
		} else if (p === 3) {
			j--;
		} else {
			break;
		}
	}
	const coverage = strength / n;
	if (coverage < 0.5) return null;
	return {
		start: Math.min(...matchedB),
		end: Math.max(...matchedB),
		coverage,
	};
}

// Token ranges of the outermost quotation spans in a verse (BSB uses curly
// quotes). Returns [startTokenIdx, endTokenIdx] pairs.
function quoteSpans(bsbText) {
	const tokens = bsbText.split(/\s+/);
	const ranges = [];
	let openIdx = -1;
	let depth = 0;
	tokens.forEach((tok, idx) => {
		let opens = 0;
		let closes = 0;
		for (const ch of tok) {
			if (ch === "\u201c" || ch === "\u2018") opens++;
			else if (ch === "\u201d" || ch === "\u2019") closes++;
		}
		for (let k = 0; k < opens; k++) {
			if (depth === 0) openIdx = idx;
			depth++;
		}
		for (let k = 0; k < closes; k++) {
			if (depth > 0) {
				depth--;
				if (depth === 0 && openIdx >= 0) {
					ranges.push([openIdx, idx]);
					openIdx = -1;
				}
			}
		}
	});
	return ranges;
}

// Work out which BSB token range of a verse holds the spoken words: prefer the
// strongest of direct word alignment and the best-matching quotation span.
function resolveWocRange(kjvWords, bsbText) {
	const bsbWords = bsbText.split(/\s+/);
	if (!kjvWords.length) return null;

	const direct = alignSpeech(kjvWords, bsbWords);

	let bestQuote = null;
	for (const [s, e] of quoteSpans(bsbText)) {
		let hits = 0;
		for (let i = s; i <= e; i++) {
			for (const kw of kjvWords) {
				if (wocTokenSim(kw, bsbWords[i]) === 1) {
					hits++;
					break;
				}
			}
		}
		const cov = hits / kjvWords.length;
		if (!bestQuote || cov > bestQuote.cov) bestQuote = { start: s, end: e, cov };
	}

	let chosen = null;
	if (direct && bestQuote) {
		chosen =
			bestQuote.cov >= direct.coverage && bestQuote.cov > 0.6
				? { start: bestQuote.start, end: bestQuote.end, coverage: bestQuote.cov }
				: { start: direct.start, end: direct.end, coverage: direct.coverage };
	} else if (direct) {
		chosen = { start: direct.start, end: direct.end, coverage: direct.coverage };
	} else if (bestQuote && bestQuote.cov >= 0.5) {
		chosen = {
			start: bestQuote.start,
			end: bestQuote.end,
			coverage: bestQuote.cov,
		};
	}
	if (!chosen) return null;
	return { ranges: restrictToQuotes(bsbText, chosen), coverage: chosen.coverage };
}

// Split a resolved range into the quoted regions of the verse. Narration that
// splits a quote in the BSB text (e.g. “Truly,” Jesus declared, “I am!”) sits
// between quotation spans, so returning one segment per span keeps narrator
// words out of the red letters. Verses without any quote keep the whole range
// (best effort).
function restrictToQuotes(bsbText, range) {
	const spans = quoteSpans(bsbText);
	if (!spans.length) return [[range.start, range.end]];
	const segments = [];
	for (const [qs, qe] of spans) {
		const a = Math.max(range.start, qs);
		const b = Math.min(range.end, qe);
		if (a <= b) segments.push([a, b]);
	}
	if (!segments.length) return [[range.start, range.end]];
	return segments;
}

// Load data/red_letter_verses.json and key it by "slug-chapter-verse".
function loadWordsOfChristData() {
	const raw = readFileSync("data/red_letter_verses.json", "utf8");
	const data = JSON.parse(raw).verses;
	const out = {};
	for (const ref in data) {
		const m = ref.match(/^([A-Za-z]+) (\d+):(\d+)$/);
		if (!m) continue;
		const slug = WOC_BOOK_SLUG[m[1]];
		if (!slug) continue;
		out[slug + "-" + m[2] + "-" + m[3]] = data[ref];
	}
	return out;
}

// Inject <span class="woc"> markup into a compiled chapter body.
//
// The markup must render red in every display variant (case plain/upper/lower,
// and any spelling), so for a red word we add the "woc" class either to the
// word's own span (span variants, youpl/yousg, lord) or, when the word is a
// bare text node, by wrapping it in a fresh <span class="woc">. cap/nocap and
// spell-ca/gb siblings that carry the same word get the class as well.
function injectWordsOfChrist(body, wocRanges) {
	const verseKeys = Object.keys(wocRanges || {});
	if (!verseKeys.length) return body;

	const fnIdx = body.indexOf('<div class="fn">');
	const src = fnIdx >= 0 ? body.slice(0, fnIdx) : body;

	const SUPPRESS = ["reftext", "fn", "cross1", "hdg", "subhdg", "cap", "nocap"];
	const tagRe = /<(\/)?([A-Za-z0-9]+)([^>]*)>/g;
	const wsRe = /\s/;

	let concat = ""; // canonical text emitted so far (same rules as extractVerseTexts)
	const charMap = []; // charMap[i] = source offset of concat[i]
	let lastWs = true;
	let tokenCount = 0; // number of tokens currently in concat

	const stack = []; // open element entries
	let pendingVariants = []; // variant spans opened since the last token start
	const variantsByIdx = []; // variant spans opened while a token was in progress
	let skip = 0;
	let m;
	let lastPos = 0;

	const attrs = []; // per token: {variants, elem}
	const boundaries = []; // {tokenIndex, num} verse boundaries
	const spanAtToken = []; // per token: deepest non-suppressed span at its last char

	function emit(from, to) {
		if (skip > 0 || to <= from) return;
		const text = src.slice(from, to);
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (wsRe.test(ch)) {
				lastWs = true;
			} else {
				if (lastWs) {
					// a new canonical token begins at this character
					attrs.push({ variants: pendingVariants, elem: wordElement() });
					pendingVariants = [];
					tokenCount++;
				}
				// deepest span open at this char (the span that owns this token's
				// final character ends up in spanAtToken[tokenCount - 1])
				spanAtToken[tokenCount - 1] = wordElement();
				lastWs = false;
			}
			charMap.push(from + i);
			concat += ch;
		}
	}

	function wordElement() {
		for (let i = stack.length - 1; i >= 0; i--) {
			const e = stack[i];
			if (!e.suppressed && e.tag === "span") return e;
		}
		return null;
	}

	while ((m = tagRe.exec(src)) !== null) {
		emit(lastPos, m.index);
		lastPos = m.index + m[0].length;

		const closing = !!m[1];
		const tagName = m[2].toLowerCase();
		const tagAttrs = m[3];
		const selfClosing = /\/\s*>$/.test(m[0]);

		if (closing) {
			const e = stack.pop() || { suppress: 0 };
			if (e.tag === "span" && !e.suppressed) {
				e.closeCount = tokenCount;
				e.closeEnd = m.index + m[0].length;
			}
			skip -= e.suppress || 0;
			continue;
		}
		if (selfClosing || VOID_TAGS.has(tagName)) continue;

		const cm = tagAttrs.match(/class=['"]([^'"]*)['"]/);
		const classes = cm ? cm[1].split(/\s+/) : [];
		const isVariant =
			classes.includes("cap") ||
			classes.includes("nocap") ||
			(classes.includes("spell") && (classes.includes("ca") || classes.includes("gb")));
		const suppressed =
			classes.some((c) => SUPPRESS.includes(c)) ||
			isVariant ||
			(classes.includes("spell") && !classes.includes("us"));

		if (isVariant) {
			// A variant span is owned by the token currently being emitted (its
			// suppressed text belongs to that token), or - if no token is in
			// progress - by the next token (the cap/nocap case, opened right
			// before the bsb word starts).
			const owner = lastWs ? -1 : tokenCount - 1;
			if (owner >= 0) {
				(variantsByIdx[owner] = variantsByIdx[owner] || []).push({ start: m.index, end: m.index + m[0].length });
			} else {
				pendingVariants.push({ start: m.index, end: m.index + m[0].length });
			}
		}

		if (tagName === "span" && classes.includes("reftext")) {
			const vn = tagAttrs.match(/id="v(\d+)"/);
			if (vn) {
				boundaries.push({ tokenIndex: tokenCount, num: parseInt(vn[1], 10) });
			}
		}

		const entry = {
			tag: tagName,
			suppressed,
			suppress: suppressed ? 1 : 0,
			openCount: tokenCount,
			closeCount: undefined,
		};
		if (tagName === "span") entry.start = m.index, (entry.end = m.index + m[0].length);
		stack.push(entry);
		skip += suppressed ? 1 : 0;
	}
	emit(lastPos, src.length);

	// Split the canonical text into tokens and recover their source offsets.
	// Whitespace that leads/trails the whole chapter is dropped so the token
	// list aligns 1:1 with the `attrs` array (token index, not char index).
	const tokens = [];
	{
		// Strip leading whitespace only for index alignment with charMap;
		// trailing whitespace is dropped so no phantom empty token appears.
		const leadMatch = concat.match(/^\s*/);
		const base = leadMatch[0].length;
		const trimmed = concat.slice(base).trimEnd();
		const tokenTexts = trimmed.split(/\s+/).filter(function (t) {
			return t.length > 0;
		});
		let pos = 0;
		for (const text of tokenTexts) {
			const start = trimmed.indexOf(text, pos);
			pos = start + text.length;
			tokens.push({
				text,
				bodyStart: charMap[base + start],
				bodyEnd: charMap[base + start + text.length - 1] + 1,
				attrs: attrs[tokens.length] || { variants: [], elem: null },
			});
		}
	}

	// Verse number per token index (tokens before the first reftext -> 0).
	const verseForToken = new Uint16Array(tokens.length);
	const verseStart = {}; // verse num => first token index
	{
		let bi = 0;
		for (let i = 0; i < tokens.length; i++) {
			while (bi + 1 < boundaries.length && boundaries[bi + 1].tokenIndex <= i) bi++;
			const v = boundaries.length ? boundaries[bi].num : 0;
			verseForToken[i] = v;
			if (!(v in verseStart)) verseStart[v] = i;
		}
	}

	// Collect edits (applied to `body` from last offset to first).
	const edits = [];
	const markedSpans = new Set();

	const addClassToTag = (spanInfo) => {
		const key = spanInfo.start + ":" + spanInfo.end;
		if (markedSpans.has(key)) return;
		markedSpans.add(key);
		const tagSrc = body.slice(spanInfo.start, spanInfo.end);
		const replaced = tagSrc.replace(/class=['"]([^'"]*)['"]/, (m0, cls) => {
			return "class='" + cls + (cls.length ? " " : "") + "woc'";
		});
		if (replaced !== tagSrc) {
			edits.push({ start: spanInfo.start, end: spanInfo.end, replacement: replaced });
		}
	};

	const inRange = (i) => {
		const verseNum = verseForToken[i];
		const ranges = wocRanges[verseNum];
		if (!ranges) return false;
		const base = verseStart[verseNum];
		for (const [s, e] of ranges) {
			if (i >= base + s && i <= base + e) return true;
		}
		return false;
	};

	// A word that sits alone inside its own span is colored by adding the class
	// to that span (and its cap/nocap, spell-ca/gb siblings). This survives the
	// settings-driven innerHTML swaps such as youpl / God's name. Returns the
	// spans to class, or [] if the token should instead be wrapped.
	const aloneSpans = (i) => {
		const { variants, elem } = tokens[i].attrs;
		if (
			!elem ||
			!("closeCount" in elem) ||
			elem.openCount !== i ||
			elem.closeCount !== i + 1 ||
			elem.start === undefined
		)
			return [];
		return [elem].concat(variants).concat(variantsByIdx[i] || []);
	};

	// Contiguous in-range tokens are wrapped in a single <span class="woc">,
	// respecting verse and paragraph boundaries so the wrapper never straddles
	// a reftext anchor or a </p>/<p>. Words that are alone in a span are left
	// to addClassToTag above, so they break any pending run.
	let run = null;
	const flush = () => {
		if (!run) return;
		const first = tokens[run.start];
		const last = tokens[run.endIdx];
		// A token whose text spans suppressed markup (e.g. 'Honor inside the
		// spelling triplets) must end at the containing span's close tag, not
		// at its last character, or the wrap would slice through a tag.
		const endEl = spanAtToken[run.endIdx];
		const endOff =
			endEl && endEl.closeEnd && endEl.closeCount === run.endIdx + 1 ? endEl.closeEnd : last.bodyEnd;
		edits.push({
			start: first.bodyStart,
			end: endOff,
			replacement: '<span class="woc">' + body.slice(first.bodyStart, endOff) + "</span>",
		});
		run = null;
	};
	for (let i = 0; i < tokens.length; i++) {
		if (!inRange(i)) {
			flush();
			continue;
		}
		const spans = aloneSpans(i);
		if (spans.length) {
			flush();
			spans.forEach(addClassToTag);
			continue;
		}
		if (run && /<\/p>|<p[\s>]/.test(body.slice(tokens[run.endIdx].bodyEnd, tokens[i].bodyStart))) {
			flush();
		}
		if (!run) run = { start: i, endIdx: i };
		else run.endIdx = i;
	}
	flush();

	edits.sort((a, b) => b.start - a.start);
	for (const edit of edits) {
		body = body.slice(0, edit.start) + edit.replacement + body.slice(edit.end);
	}
	return body;
}

async function parseChapters() {
	console.log("Parsing BSB...");

	const fromDir = "bsb/bsb - final - 7-18-21/OEBPS/Text";
	const toDir = "public/chapters";
	const filenames = await readdir(fromDir);

	var foundWords = {};

	var searchRecords = [];

	var chaptersToWrite = [];

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

		chaptersToWrite.push({
			slug: book,
			chapterNum: parseInt(chapter, 10),
			body,
		});
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

	// ---- Words of Christ (red letter) ----
	// Align the KJV-derived spoken text against the canonical BSB verse text and
	// remember a per-verse token range: [startWord, endWord] inclusive.
	var wocData = loadWordsOfChristData();
	var wocRangeByRef = {}; // "slug-ch-v" -> [startWord, endWord]
	var wocFull = 0;
	var wocPartialAligned = 0;
	var wocSkipped = 0;
	for (const rec of searchRecords) {
		const ref = rec[0] + "-" + rec[1] + "-" + rec[2];
		const val = wocData[ref];
		if (!val) continue;
		if (val === "full") {
			const count = rec[3].split(/\s+/).length;
			wocRangeByRef[ref] = [[0, count - 1]];
			wocFull++;
		} else {
			const kjvWords = val.split(/\s+/);
			const r = resolveWocRange(kjvWords, rec[3]);
			if (r) {
				wocRangeByRef[ref] = r.ranges;
				wocPartialAligned++;
			} else {
				wocSkipped++;
			}
		}
	}
	console.log(
		"Words of Christ: " +
			wocFull +
			" full verses, " +
			wocPartialAligned +
			" partial aligned, " +
			wocSkipped +
			" skipped",
	);

	// Inject <span class="woc"> into each compiled chapter and write it out.
	for (const ch of chaptersToWrite) {
		const chapterRanges = {};
		for (const ref in wocRangeByRef) {
			const key = ch.slug + "-" + ch.chapterNum + "-";
			if (ref.indexOf(key) === 0) {
				chapterRanges[parseInt(ref.slice(key.length), 10)] = wocRangeByRef[ref];
			}
		}
		const out = injectWordsOfChrist(ch.body, chapterRanges);
		writeFile(toDir + "/" + ch.slug + "-" + ch.chapterNum + ".html", out);
	}

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
