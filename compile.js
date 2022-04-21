console.log("compiling...")

var fs = require("fs")

doIt()

function doIt() {

	fs.readFile("brb.html", function (err, buffer) {
		parseHTML(buffer.toString())
	})
}

function parseHTML(html) {
	let pos = getNextChapterStart(html, 0)
	let nextPos = getNextChapterStart(html, pos + 239)
	let chapterCount = 0
	let books = []	//	each item is an object containing "name", "slug", "chapters"

	while (nextPos > 0) {

		let chapterHTML = html.substring(pos, nextPos)
		let bookChapter = parseTitle(chapterHTML)

		let book = bookChapter[0]
		let chapter = bookChapter[1]
		let slug = book.replace(/\s/g, "-").toLowerCase()

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

		chapterHTML = chapterHTML.replace(/.*#eeeeee.*\n/g, "")
		chapterHTML = chapterHTML.replace(/.*:\/\/biblehub\.com.*\n/g, "")
		chapterHTML = chapterHTML.replace(/.*\[Online\].*\n/g, "")
		chapterHTML = chapterHTML.replace(/ color="#001320"/g, "")

		fs.writeFile("public/chapters/" + slug + "-" + chapter + ".html", chapterHTML, (err) => {
			if (err) console.log(err);
			console.log("Successfully wrote public/chapters/" + slug + "-" + chapter + ".html");
		});

		chapterCount++

		pos = nextPos
		nextPos = getNextChapterStart(html, nextPos + 239)
	}

	let chapterHTML = html.substring(pos)
	let bookChapter = parseTitle(chapterHTML)

	let book = bookChapter[0]
	let chapter = bookChapter[1]

	console.log(chapterCount + ", till the end, " + book + ":" + chapter)

	console.log(JSON.stringify(books))

	fs.writeFile("public/books.js", "var books = " + JSON.stringify(books), (err) => {
		if (err) console.log(err);
		console.log("Successfully wrote public/books.js.");
	});

}



function parseTitle(html) {
	let fontHTML = '<font color="#001320"><font face="Tahoma, serif"><font size="5" style="font-size: 17pt"><b>'
	let start = html.indexOf(fontHTML) + fontHTML.length
	let end = html.indexOf("<", start)
	let bookName = html.substring(start, end)
	let parts = bookName.trim().split(/\s/).map(x => x.trim())

	if (parts.length == 3) {
		return [parts[0] + " " + parts[1], parts[2]]
	}
	return [parts[0], parts[1]]

}

function getNextChapterStart(html, start) {
	let fontPos = html.indexOf('<font color="#001320"><font face="Tahoma, serif"><font size="5" style="font-size: 17pt"><b>', start)
	if (fontPos < 0) return null
	return html.lastIndexOf("<p", fontPos)
}



