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
import { info } from 'node:console'

parseChapters()

var capWords = {}	// words are keys, values are "true"


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

		// God's Name
		body = body.replaceAll('The LORD', '<span class="lord" data-name="The LORD">The LORD</span>')
		body = body.replaceAll('the LORD', '<span class="lord" data-name="the LORD">the LORD</span>')
		body = body.replaceAll('O LORD', 'O <span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll(', LORD', ', <span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll('\>LORD', '><span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll('One LORD', 'One <span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll('mighty LORD', 'mighty <span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll('our LORD', 'our <span class="lord" data-name="LORD">LORD</span>')
		body = body.replaceAll('THE LORD', '<span class="caplord" data-name="THE LORD">THE LORD</span>')

		// Capitalized Divine Names
		if (newFilename.startsWith("genesis")) body = parseDivineNames(body)


		writeFile(toDir + "/" + newFilename + ".html", body)
	}

	console.log("Cap words: " + Object.keys(capWords).sort().map(w=>w+":"+capWords[w]).join(", "))
}

function isLetter(char) {
  return char.toLowerCase() !== char.toUpperCase()
}

function parseDivineNames(body) {
	var beginning = true	// Expecting the beginning of a sentence? We expect a capital letter.
	var inTag = false	// In a tag? We'll ignore everything here.
	var inWord = false // In a word?
	var inHeading = false
	var inRefText = false
	var closingTag = false
	// var inQuote = false

	var tags = []	// a stack of tags. Each item is an array of words. Push and pop.

	var index = 0
	var word = ""

	function processWord(thisWord, index) {
		var inFootnote = (tags.length > 0 && tags[0][2] == "fn")

		// console.log("word: '" + thisWord + "' beginning? ", beginning, " heading?", inHeading, " inreftext", inRefText)
		if (inHeading || inRefText || inFootnote) {
			beginning = false
			word = ""
			return
		}

		if (thisWord == "I") {
			beginning = false
			word = ""
			return
		}

		if (thisWord.substring(0, 1) == thisWord.substring(0, 1).toUpperCase()) {
			if (beginning) {
				// All is good. It's a capital at the beginning of a sentence.
			} else {
				// Capital not at beginning of sentence. Alert!
				// console.log(`Capital word found: '${thisWord}'`)
				capWords[thisWord] = (capWords[thisWord] ?? 0) + 1
				if (thisWord == "But") {
					console.log(body.substring(index-50, index+20))
				}
			}
		} else {
			if (beginning) {
				// Lower case at start of sentence. :(
			} else {
				// Lower case in middle of sentence
			}
		}
		// console.log("setting beginning to false")
		beginning = false
		word = ""
	}

	for(var index=0; index<body.length; index++) {
		var ch = body.substring(index, index+1)
		// console.log(`beginning is ${beginning}, inTag is ${inTag}, inWord is ${inWord} and we're looking at a '${ch}'`)

		if (inTag) {
			if (ch == ">") {
				// console.log("end tag word: " + word)
				if (closingTag && word == "p") {
					inHeading = false
					beginning = true	// we just came across a <p> or </p> tag
				}
				if (closingTag && word == "span") {
					inRefText = false
				}
				if (closingTag) {
					tags.pop()
				}
				// console.log(JSON.stringify(tags))
				word = ""
				inTag = false
				if (tags.length >= 1 && tags[tags.length - 1][0] == "br") {
					// This was a <br> tag, so let's not store it.
					tags.pop()
				}
				continue
			}
			if (isLetter(ch)) {
				word = word + ch
			} else {
				if (ch == "/") {
					closingTag = true
					tags.pop()	// We just pushed a new empty tag, so we'll undo that here
				}
				if (word != "") {
					// console.log("tag word: '" + word + "'")
					if (word == "reftext") {
						inRefText = true
					}
					if (word == "hdg" || word == "subhdg") {
						inHeading = true
					}
				}
				if (word != "") tags[tags.length-1].push(word)
				word = ""
			}
			continue
		}

		if (ch == "<") {
			tags.push([])	// Yes, but maybe it's a closing tag, so we'll pop it if it is a closing tag
			closingTag = false
			if (word != "") processWord(word, index)
			inTag = true
			continue
		}
		
		if (ch == "“") {	// opening quotation mark
			// inQuote = true
			beginning = true
		}

		/*
		if (ch == "”") {	// closing quotation mark
			inQuote = false
			beginning = false
	}
	*/

		if (ch == "." || ch == "?" || ch == "!") {
			if (word != "") processWord(word, index)
			beginning = true
			continue
		}

		if (!inWord && isLetter(ch)) {
			word = ch
			inWord = true
			continue
		}

		if (inWord && isLetter(ch)) {
			word = word + ch
			continue
		} 

		if (inWord && !isLetter(ch)) {
			if (word != "") processWord(word, index)
			inWord = false
			continue
		} 
	}


	console.log("parsing")

	return body
}
