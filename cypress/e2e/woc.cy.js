describe("Words of Christ in Red", () => {
	beforeEach(() => {
		cy.visit("http://localhost:8000");
		// The settings panel is fetched after load, so wait for it to be in
		// the DOM before clicking the gear that opens it.
		cy.get("input[data-value=woc]").should("exist");
	});

	// The home page builds all three book orders into one picker, so reach the
	// book through the data-cy of its (unique) canonical chapter list.
	const openChapter = (book, chapter) => {
		cy.get(`[data-cy='home${book}']`).prev().click();
		cy.get(`[data-cy='home${book}'] a[data-chapter='${chapter}']`).click();
		cy.get("#chapterText");
	};

	const openMatthew5 = () => {
		openChapter("Matthew", 5);
		cy.get("#chapter").contains("Blessed are the poor in spirit");
	};

	const turnOn = () => {
		cy.get("#gearIcon").click();
		cy.get("div#settingsDropdown").should("be.visible");
		cy.get("input[data-value=woc]").check();
		cy.get("body").should("not.have.class", "woc-off");
	};

	// The --woc colour resolved to the rgb() form getComputedStyle gives for a
	// painted element, so the test does not hardcode a theme value.
	const wocColor = () =>
		cy.window().then((win) => {
			const probe = win.document.createElement("span");
			probe.style.color = "var(--woc)";
			win.document.body.appendChild(probe);
			const color = win.getComputedStyle(probe).color;
			probe.remove();
			return color;
		});

	const colorOf = (selector) =>
		cy.get(selector).then((el) => getComputedStyle(el[0]).color);

	// The colour of a paragraph that is not part of the Word of Christ markup.
	const bodyColor = () =>
		cy.get("#chapter .reg1")
			.first()
			.then((el) => getComputedStyle(el[0]).color);

	// Match a paragraph by its text rather than by a child element, because the
	// compile step wraps capitalised pronouns and "you" in their own spans, so a
	// phrase can straddle several of them. cy.contains() only looks at an
	// element's own text nodes, so search textContent and hand back the
	// paragraph.
	const blockWith = (text) =>
		cy.document().then((doc) => {
			const p = [...doc.querySelectorAll("#chapter p")].find((el) =>
				el.textContent.includes(text)
			);
			expect(p, `no paragraph containing "${text}"`).to.exist;
			return cy.wrap(p);
		});

	it("marks the Sermon on the Mount as the words of Christ", () => {
		openMatthew5();

		// Matthew 5:3 is a red-lettered block paragraph in the BSB epub.
		cy.get("#chapter p.indent1stlinered")
			.contains("Blessed are the poor in spirit")
			.should("have.class", "woc");

		// Its continuation paragraph is marked too.
		cy.get("#chapter p.indentred")
			.contains("for theirs is the kingdom of")
			.should("have.class", "woc");

		// The rest of the sermon runs on for many paragraphs and the epub does
		// not mark those individually, so the quotation opened in verse 3 has
		// to carry the red marking through to them.
		cy.get("#chapter p.calibre3")
			.contains("the salt of the earth")
			.should("have.class", "woc");

		// The narrative around the sermon is not Christ's speech.
		cy.get("#chapter p.reg1")
			.contains("When Jesus saw the crowds")
			.should("not.have.class", "woc");
	});

	it("leaves the text black while the setting is off", () => {
		openMatthew5();
		cy.get("body").should("have.class", "woc-off");

		bodyColor().then((body) => {
			// Still marked up, just not painted.
			cy.get("#chapter p.indent1stlinered")
				.contains("Blessed are the poor in spirit")
				.should("have.class", "woc");
			colorOf("#chapter p.indent1stlinered").should("equal", body);
		});
	});

	it("paints the words of Christ red when the setting is on", () => {
		openMatthew5();
		bodyColor().then((body) => {
			turnOn();

			wocColor().then((red) => {
				colorOf("#chapter p.indent1stlinered").should("equal", red);
				// The narrative stays the body colour.
				colorOf("#chapter p.reg1").should("equal", body);
			});
		});
	});

	it("remembers the setting across a reload", () => {
		turnOn();
		cy.get("#menuIcon").click();

		cy.reload();
		cy.get("body").should("not.have.class", "woc-off");

		openMatthew5();
		wocColor().then((red) => {
			colorOf("#chapter p.indent1stlinered").should("equal", red);
		});
	});

	it("does not mark chapters without red lettering", () => {
		openChapter("Genesis", 1);
		cy.get("#chapter").contains("In the beginning");

		cy.get("#chapter .woc").should("not.exist");
	});

	// The epub marks no red lettering at all in these chapters, and the
	// quotation it opens is never closed, so resources/woc_verses.tsv has to
	// list them by hand.
	describe("verses listed in resources/woc_verses.tsv", () => {
		it("forces red a speech the epub never marked", () => {
			openChapter("Matthew", 7);
			cy.get("#chapter").contains("Do not judge");

			// The opening of the sermon, the middle of it, and the last verse
			// Jesus speaks before the narrative takes over.
			blockWith("Do not judge, or").should("have.class", "woc");
			blockWith("look at the speck in").should("have.class", "woc");
			blockWith("not act on them").should("have.class", "woc");

			// Verse 28 is the narrator, not Christ.
			blockWith("When Jesus had finished saying these things").should(
				"not.have.class",
				"woc"
			);
		});

		it("leaves the headings inside a forced range unmarked", () => {
			openChapter("Matthew", 7);

			blockWith("Ask, Seek, Knock").should("have.class", "hdg");
			blockWith("Ask, Seek, Knock").should("not.have.class", "woc");
		});

		it("paints a whole parable red, including the characters' words", () => {
			openChapter("Matthew", 20);
			cy.get("#chapter").contains("For the kingdom of Heaven");

			// The landowner opening the parable.
			blockWith("For the kingdom of Heaven").should("have.class", "woc");

			// The workers grumbling, which are not Christ's words at all. The
			// house rule is that a parable is his, so these are red too.
			blockWith("Because no one has hired us").should("have.class", "woc");
			blockWith("also go into my vineyard").should("have.class", "woc");

			// The epilogue is narration again.
			blockWith("As Jesus was going up to Jerusalem").should(
				"not.have.class",
				"woc"
			);
		});

		it("forces black narration the quote heuristic carried over as red", () => {
			openChapter("John", 3);
			cy.get("#chapter").contains("God so loved the world");

			// Jesus' own words in the same chapter stay red.
			blockWith("about earthly things").should(
				"have.class",
				"woc"
			);

			// The evangelist's summary, not Christ speaking.
			blockWith("For God so loved the world").should("not.have.class", "woc");
			blockWith("And this is the verdict").should("not.have.class", "woc");
		});

		it("keeps the force-black verses black when the setting is on", () => {
			openChapter("John", 3);
			turnOn();

			wocColor().then((red) => {
				blockWith("about earthly things").should(
					"have.css",
					"color",
					red
				);
				blockWith("For God so loved the world").should(
					"not.have.css",
					"color",
					red
				);
			});
		});

		it("marks the letter salutation in Revelation that opens an unmarked block", () => {
			openChapter("Revelation", 2);
			cy.get("#chapter").contains("church in Ephesus write");

			blockWith("To the angel of the church in Ephesus").should(
				"have.class",
				"woc"
			);
		});
	});
});
