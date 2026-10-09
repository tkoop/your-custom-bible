var books = [
	{ name: "Genesis", slug: "genesis", abbr: "Gen", chapters: 50 },
	{ name: "Exodus", slug: "exodus", abbr: "Exo", chapters: 40 },
	{ name: "Leviticus", slug: "leviticus", abbr: "Lev", chapters: 27 },
	{ name: "Numbers", slug: "numbers", abbr: "Num", chapters: 36 },
	{ name: "Deuteronomy", slug: "deuteronomy", abbr: "Deu", chapters: 34 },
	{ name: "Joshua", slug: "joshua", abbr: "Jos", chapters: 24 },
	{ name: "Judges", slug: "judges", abbr: "Jdg", chapters: 21 },
	{ name: "Ruth", slug: "ruth", abbr: "Rut", chapters: 4 },
	{ name: "1 Samuel", slug: "1-samuel", abbr: "1Sa", chapters: 31 },
	{ name: "2 Samuel", slug: "2-samuel", abbr: "2Sa", chapters: 24 },
	{ name: "1 Kings", slug: "1-kings", abbr: "1Ki", chapters: 22 },
	{ name: "2 Kings", slug: "2-kings", abbr: "2Ki", chapters: 25 },
	{ name: "1 Chronicles", slug: "1-chronicles", abbr: "1Ch", chapters: 29 },
	{ name: "2 Chronicles", slug: "2-chronicles", abbr: "2Ch", chapters: 36 },
	{ name: "Ezra", slug: "ezra", abbr: "Ezr", chapters: 10 },
	{ name: "Nehemiah", slug: "nehemiah", abbr: "Neh", chapters: 13 },
	{ name: "Esther", slug: "esther", abbr: "Est", chapters: 10 },
	{ name: "Job", slug: "job", abbr: "Job", chapters: 42 },
	{ name: "Psalms", slug: "psalm", abbr: "Psa", chapters: 150 },
	{ name: "Proverbs", slug: "proverbs", abbr: "Pro", chapters: 31 },
	{ name: "Ecclesiastes", slug: "ecclesiastes", abbr: "Ecc", chapters: 12 },
	{ name: "Song of Solomon", slug: "song-of-solomon", abbr: "Sng", chapters: 8 },
	{ name: "Isaiah", slug: "isaiah", abbr: "Isa", chapters: 66 },
	{ name: "Jeremiah", slug: "jeremiah", abbr: "Jer", chapters: 52 },
	{ name: "Lamentations", slug: "lamentations", abbr: "Lam", chapters: 5 },
	{ name: "Ezekiel", slug: "ezekiel", abbr: "Eze", chapters: 48 },
	{ name: "Daniel", slug: "daniel", abbr: "Dan", chapters: 12 },
	{ name: "Hosea", slug: "hosea", abbr: "Hos", chapters: 14 },
	{ name: "Joel", slug: "joel", abbr: "Jol", chapters: 3 },
	{ name: "Amos", slug: "amos", abbr: "Amo", chapters: 9 },
	{ name: "Obadiah", slug: "obadiah", abbr: "Oba", chapters: 1 },
	{ name: "Jonah", slug: "jonah", abbr: "Jon", chapters: 4 },
	{ name: "Micah", slug: "micah", abbr: "Mic", chapters: 7 },
	{ name: "Nahum", slug: "nahum", abbr: "Nah", chapters: 3 },
	{ name: "Habakkuk", slug: "habakkuk", abbr: "Hab", chapters: 3 },
	{ name: "Zephaniah", slug: "zephaniah", abbr: "Zep", chapters: 3 },
	{ name: "Haggai", slug: "haggai", abbr: "Hag", chapters: 2 },
	{ name: "Zechariah", slug: "zechariah", abbr: "Zec", chapters: 14 },
	{ name: "Malachi", slug: "malachi", abbr: "Mal", chapters: 4 },
	{ name: "Matthew", slug: "matthew", abbr: "Mat", chapters: 28 },
	{ name: "Mark", slug: "mark", abbr: "Mrk", chapters: 16 },
	{ name: "Luke", slug: "luke", abbr: "Luk", chapters: 24 },
	{ name: "John", slug: "john", abbr: "Jhn", chapters: 21 },
	{ name: "Acts", slug: "acts", abbr: "Act", chapters: 28 },
	{ name: "Romans", slug: "romans", abbr: "Rom", chapters: 16 },
	{ name: "1 Corinthians", slug: "1-corinthians", abbr: "1Co", chapters: 16 },
	{ name: "2 Corinthians", slug: "2-corinthians", abbr: "2Co", chapters: 13 },
	{ name: "Galatians", slug: "galatians", abbr: "Gal", chapters: 6 },
	{ name: "Ephesians", slug: "ephesians", abbr: "Eph", chapters: 6 },
	{ name: "Philippians", slug: "philippians", abbr: "Phi", chapters: 4 },
	{ name: "Colossians", slug: "colossians", abbr: "Col", chapters: 4 },
	{ name: "1 Thessalonians", slug: "1-thessalonians", abbr: "1Th", chapters: 5 },
	{ name: "2 Thessalonians", slug: "2-thessalonians", abbr: "2Th", chapters: 3 },
	{ name: "1 Timothy", slug: "1-timothy", abbr: "1Ti", chapters: 6 },
	{ name: "2 Timothy", slug: "2-timothy", abbr: "2Ti", chapters: 4 },
	{ name: "Titus", slug: "titus", abbr: "Tit", chapters: 3 },
	{ name: "Philemon", slug: "philemon", abbr: "Phm", chapters: 1 },
	{ name: "Hebrews", slug: "hebrews", abbr: "Heb", chapters: 13 },
	{ name: "James", slug: "james", abbr: "Jas", chapters: 5 },
	{ name: "1 Peter", slug: "1-peter", abbr: "1Pe", chapters: 5 },
	{ name: "2 Peter", slug: "2-peter", abbr: "2Pe", chapters: 3 },
	{ name: "1 John", slug: "1-john", abbr: "1Jn", chapters: 5 },
	{ name: "2 John", slug: "2-john", abbr: "2Jn", chapters: 1 },
	{ name: "3 John", slug: "3-john", abbr: "3Jn", chapters: 1 },
	{ name: "Jude", slug: "jude", abbr: "Jud", chapters: 1 },
	{ name: "Revelation", slug: "revelation", abbr: "Rev", chapters: 22 },
];

function chapterRefName(bookName) {
	return bookName == "Psalms" ? "Psalm" : bookName;
}

// ---------- Free text references ----------
//
// The jump fields on the index page and on the home page's chapter picker take
// what a reader would type rather than a book picked from a list: "jn 3:16",
// "gen", "1 co 13". A book is any part of its name or its abbreviation, so
// "phil" reaches Philippians and "song" reaches Song of Solomon. Everything
// between the letters and the numbers is a separator, which is what lets "Jn
// 3.16" and "jn 3 16" land in the same place.

var refAliases = {
	gn: "genesis",
	lv: "leviticus",
	dt: "deuteronomy",
	ps: "psalm",
	psa: "psalm",
	sol: "song-of-solomon",
	sos: "song-of-solomon",
	jn: "john",
	joh: "john",
	mk: "mark",
	lk: "luke",
	rv: "revelation",
};

// Psalm 119 is the longest chapter in the Bible, so nothing above this is a
// verse number.
var refMaxVerse = 176;

// Letters and digits only, so "1 co" and "1co" are the same book.
function squashRef(text) {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// What a book scores against what was typed, zero meaning it is not that book.
// The bands only rank the answers: the whole name, then a name we hold on file,
// then the abbreviation, and inside a band the closer the match the higher.
function scoreRefBook(book, typed) {
	var squashed = squashRef(typed);
	if (!squashed) return 0;
	if (squashRef(book.name) == squashed) return 1000;
	if (refAliases[squashed] == book.slug) return 950;
	if (squashRef(book.abbr) == squashed) return 900;
	// A long name with a short prefix is a worse match than the other way round,
	// so the length of what was typed counts up to a point.
	var near = 100 - Math.min(squashed.length, 99);
	if (squashRef(book.name).indexOf(squashed) == 0) return 800 + near;
	if (squashRef(book.abbr).indexOf(squashed) == 0) return 700 + near;
	// A word of the name, so "song" finds Song of Solomon and "phil" finds
	// Philemon as well as Philippians. The numbered books are left out of this:
	// "john" would offer "1 John" beside John, and a question about 1 John is a
	// question asked with the 1 in it.
	var numbered = book.name.charAt(0) >= "0" && book.name.charAt(0) <= "9";
	if (numbered) return 0;
	var words = book.name.split(" ");
	for (var i = 0; i < words.length; i++) {
		if (squashRef(words[i]).indexOf(squashed) == 0) return 600 + near;
	}
	return 0;
}

// The chapter, and the verse when a second number follows. The two are told
// apart by their order, so "3-16" is chapter 3, verse 16 and there is no way to
// read it as a range.
function parseRefNumbers(numbers) {
	var m = /^(\d{1,3})(?:[\s:.\-]*(\d{1,3}))?$/.exec(numbers);
	if (!m) return null;
	return {
		chapter: parseInt(m[1], 10),
		verse: m[2] === undefined ? null : parseInt(m[2], 10),
	};
}

function refLabel(book, chapter, verse) {
	return chapterRefName(book.name) + " " + chapter + (verse ? ":" + verse : "");
}

// What the field offers for what has been typed: every book it could be, each at
// the chapter that was typed, or at its first when no chapter was. Ordered by how
// well the book matched, then by how short the name is, then in Bible order -
// "j" has a dozen answers and only one of them can be the first.
function refSuggestions(text, limit) {
	var clean = (text || "")
		.toLowerCase()
		.replace(/[:.,;]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!clean) return [];

	// The book is what comes before the numbers. A book's own name can begin
	// with a digit, so the split is made at the last run of digits rather than
	// at the first one in the text.
	var m = /^(.*?)(\d[\d\s:.\-]*)$/.exec(clean);
	var typed = m ? m[1].trim() : clean;
	// A separator with nothing after it is a half-typed reference, not a broken
	// one, so "gen 1:" still offers Genesis 1.
	var numbers = m ? parseRefNumbers(m[2].trim().replace(/[\s:.\-]+$/, "")) : null;
	if (m && !numbers) return [];

	var matches = [];
	books.forEach(function (book, index) {
		var score = scoreRefBook(book, typed);
		if (!score) return;
		var chapter = numbers ? numbers.chapter : 1;
		if (chapter < 1 || chapter > book.chapters) return;
		var verse = numbers ? numbers.verse : null;
		if (verse !== null && (verse < 1 || verse > refMaxVerse)) return;
		matches.push({ book: book, index: index, chapter: chapter, verse: verse, score: score });
	});

	matches.sort(function (a, b) {
		if (b.score != a.score) return b.score - a.score;
		if (a.book.name.length != b.book.name.length) return a.book.name.length - b.book.name.length;
		return a.index - b.index;
	});

	var suggestions = [];
	var max = limit || 8;
	for (var i = 0; i < matches.length && i < max; i++) {
		var match = matches[i];
		suggestions.push({
			book: match.book,
			chapter: match.chapter,
			verse: match.verse,
			label: refLabel(match.book, match.chapter, match.verse),
		});
	}
	return suggestions;
}
