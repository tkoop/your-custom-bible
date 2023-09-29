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


import { readdir, writeFile, open } from 'node:fs/promises'
import { parse } from 'node-html-parser'	// https://www.npmjs.com/package/node-html-parser
import { words } from './words.mjs'

parseChapters()


async function parseChapters() {
	console.log("Parsing BSB...")

	const fromDir = 'bsb/bsb - final - 7-18-21/OEBPS/Text'
	const toDir = 'public/chapters'
	const filenames = await readdir(fromDir)

	var foundWords = {}

	for(const filename of filenames) {
		const fromFile = await open(fromDir + "/" + filename)
		var html = await fromFile.readFile()
		fromFile.close()
		var doc = parse(html)
		const title = doc.querySelector("title").text
		if (!title.endsWith("BSB")) continue
		
		// Convert title to file name
		var newFilename = title.substring(0, title.length - 4)
		newFilename = newFilename.toLocaleLowerCase()
		newFilename = newFilename.replaceAll(" ", "-")

		// Remove certain things
		doc.querySelector("#topheading")?.remove()
		doc.querySelector(".bsbheading")?.remove()
		doc.querySelector(".calibre8")?.remove()	// The "Home" link on the bottom

		// Remove tags
		doc.querySelectorAll("a").forEach( (el) => {
			if (el.getAttribute("id") == "fn") return
			el.replaceWith(el.innerHTML)  
		})

		// Save the file
		var body = doc.querySelector("body").innerHTML

		// Footnotes begins
		var footNotesAt = body.indexOf('<a class="pcalibre2 pcalibre1 pcalibre pcalibre3" id="fn">')
		if (footNotesAt >= 0) {
			body = body.substring(0, footNotesAt) + "<div class='fn'>" + body.substring(footNotesAt) + "</div>"
		}

		// Spelling
		for(var word in words) {
			const regex = new RegExp('\\b('+word+')\\b', 'gm')
			var replacement = ""
			replacement += "<span class='spell ca'>" + words[word].ca + "</span>"
			replacement += "<span class='spell gb'>" + words[word].gb + "</span>"
			replacement += "<span class='spell us'>" + words[word].us + "</span>"

			body = body.replace(regex, replacement)
		}

		writeFile(toDir + "/" + newFilename + ".html", body)
	}
}


function parseHTML(html) {
	let pos = getNextChapterStart(html, 0)
	let nextPos = getNextChapterStart(html, pos + 239)
	let chapterCount = 0
	let books = []	//	each item is an object containing "name", "slug", "chapters"

	while (nextPos > 0) {
		let chapterHTML = html.substring(pos, nextPos)
		let parsed = parseTitle(chapterHTML)
		let book = parsed.book
		let chapter = parsed.chapter
		let slug = parsed.slug

		if (books.length > 0 && books[books.length - 1].slug == slug) {
			// book already exists
			books[books.length - 1].chapters++
		} else {
			// make a new book
			books.push({
				name: book,
				slug: slug,
				chapters: 1,
			})
		}

		console.log(chapterCount + ", " + pos + ", " + book + ":" + chapter)

		saveChapter(slug, chapter, chapterHTML)

		chapterCount++

		pos = nextPos
		nextPos = getNextChapterStart(html, nextPos + 239)
	}

	chapterHTML = html.substring(pos, html.indexOf("</body>", pos))
	let parsed = parseTitle(chapterHTML)
	let book = parsed.book
	let chapter = parsed.chapter
	let slug = parsed.slug

	saveChapter(slug, chapter, chapterHTML)
	books[books.length - 1].chapters++

	console.log(chapterCount + ", till the end, " + book + ":" + chapter)

	console.log(JSON.stringify(books))

	fs.writeFile("public/books.js", "var books = " + JSON.stringify(books), (err) => {
		if (err) console.log(err);
		console.log("Successfully wrote public/books.js.");
	});
}

function saveChapter(slug, chapter, chapterHTML) {
	chapterHTML = chapterHTML.replace(/.*#eeeeee.*\n/g, "")
	chapterHTML = chapterHTML.replace(/.*:\/\/biblehub\.com.*\n/g, "")
	chapterHTML = chapterHTML.replace(/.*\[Online\].*\n/g, "")
	chapterHTML = chapterHTML.replace(/ color="#001320"/g, "")
	chapterHTML = chapterHTML.replace(/face="Tahoma, serif"/g, "")
	chapterHTML = chapterHTML.replace(/; line-height: 0.51cm/g, "")

	fs.writeFile("public/chapters/" + slug + "-" + chapter + ".html", chapterHTML, (err) => {
		if (err) console.log(err);
		console.log("Successfully wrote public/chapters/" + slug + "-" + chapter + ".html");
	});

}

function parseTitle(html) {
	let fontHTML = '<font color="#001320"><font face="Tahoma, serif"><font size="5" style="font-size: 17pt"><b>'
	let start = html.indexOf(fontHTML) + fontHTML.length
	let end = html.indexOf("<", start)
	let bookName = html.substring(start, end)
	let parts = bookName.trim().split(/\s/).map(x => x.trim())

	let book, chapter

	if (parts.length == 4) {
		book = parts[0] + " " + parts[1] + " " + parts[2]	// e.g. "Song of Solomon"
		chapter = parts[3]
	} else if (parts.length == 3) {
		book = parts[0] + " " + parts[1]	// e.g. "1 John"
		chapter = parts[2]
	} else {
		book = parts[0]
		chapter = parts[1]
	}

	return {book, chapter, slug:book.replace(/\s/g, "-").toLowerCase()}
}

function getNextChapterStart(html, start) {
	let fontPos = html.indexOf('<font color="#001320"><font face="Tahoma, serif"><font size="5" style="font-size: 17pt"><b>', start)
	if (fontPos < 0) return null
	return html.lastIndexOf("<p", fontPos)
}
