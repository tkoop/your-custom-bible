// Emits resources/books.json from public/books.js.
//
// The server needs the book list - names, slugs, abbreviations and chapter
// counts - to work out what a reading plan reads today, and PHP cannot read
// JavaScript. books.js stays the single source; this writes out the part the
// server needs so there is nothing to keep in step by hand.
//
// books.js opens with a plain array literal terminated by "];", and everything
// after that line is functions. So this reads the literal out of the source
// rather than evaluating it, which means no JavaScript is executed and no
// tooling has to be kept in the repository to run it.
//
// Run by hand, like the other build pipelines:
//   node tools/buildBooksJson.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const source = fs.readFileSync(path.join(root, "public", "books.js"), "utf8");

// The array literal that starts at "var books = [" and runs to its own "]".
const start = source.indexOf("[", source.indexOf("var books"));
if (start === -1) {
	throw new Error("could not find the books array in books.js");
}

let depth = 0;
let end = -1;
let inString = null;
for (let i = start; i < source.length; i++) {
	const c = source[i];
	if (inString) {
		if (c === "\\") {
			i++; // an escape, so the next character is not a delimiter
		} else if (c === inString) {
			inString = null;
		}
		continue;
	}
	if (c === '"' || c === "'") {
		inString = c;
		continue;
	}
	if (c === "[") depth++;
	else if (c === "]") {
		depth--;
		if (depth === 0) {
			end = i + 1;
			break;
		}
	}
}
if (end === -1) {
	throw new Error("the books array is not closed");
}

// The literal is JavaScript, not JSON: the keys are bare identifiers. They are
// quoted here rather than the literal being evaluated, so this reads the file
// without running any of it. Every key in books.js is a plain identifier, and
// the checks below reject anything that did not come out whole.
const literal = source.slice(start, end);
const books = JSON.parse(
	literal
		.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
		// The last book carries a trailing comma, which JSON does not allow.
		.replace(/,(\s*[\]}])/g, "$1"),
);

if (!Array.isArray(books) || books.length === 0) {
	throw new Error("the books array came out empty");
}
for (const book of books) {
	for (const key of ["name", "slug", "abbr", "chapters"]) {
		if (book[key] === undefined) {
			throw new Error(`a book is missing ${key}: ${JSON.stringify(book)}`);
		}
	}
}

// The chapters the app's own plans count over, so a build that silently loses a
// book shows up here rather than as a plan that reads 1188 chapters.
const totalChapters = books.reduce((sum, book) => sum + book.chapters, 0);
if (totalChapters !== 1189) {
	throw new Error(`the books total ${totalChapters} chapters, expected 1189`);
}

fs.writeFileSync(
	path.join(root, "resources", "books.json"),
	JSON.stringify(books, null, "\t") + "\n",
);
console.log(`wrote resources/books.json: ${books.length} books, ${totalChapters} chapters`);