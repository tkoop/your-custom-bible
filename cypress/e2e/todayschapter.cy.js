describe("Today's Chapter", () => {
	beforeEach(() => {
		cy.visit("http://localhost:8001");
		// wait for the menu and chapter component scripts to finish loading
		cy.window().should("have.property", "goToTodaysChapter");
		cy.window().should("have.property", "totalChapterCount");
	});

	it("places Today's Chapter in the menu under Index", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#dropdown div").then(($items) => {
			const texts = $items.toArray().map((d) => d.textContent.trim());
			expect(texts.indexOf("Index")).to.be.lessThan(
				texts.indexOf("Chapter of the Day"),
			);
			expect(texts.indexOf("Chapter of the Day")).to.be.lessThan(
				texts.indexOf("History"),
			);
		});
	});

	it("maps the fixed anchor date to the day's chapter, wrapping", () => {
		cy.window().then((win) => {
			const total = win.totalChapterCount();
			expect(total).to.eq(1189);
			const anchor = new Date(2025, 2, 13); // March 13, 2025
			const addDays = (n) =>
				new Date(anchor.getTime() + n * 24 * 60 * 60 * 1000);

			// anchor = Genesis 1
			let gen = win.chapterIndexToBookAndChapter(
				win.todaysChapterIndex(anchor),
			);
			expect(gen.book.slug).to.eq("genesis");
			expect(gen.chapter).to.eq(1);

			// next day = Genesis 2
			gen = win.chapterIndexToBookAndChapter(win.todaysChapterIndex(addDays(1)));
			expect(gen.book.slug).to.eq("genesis");
			expect(gen.chapter).to.eq(2);

			// day before the cycle completes = Revelation 22
			const last = win.chapterIndexToBookAndChapter(
				win.todaysChapterIndex(addDays(total - 1)),
			);
			expect(last.book.slug).to.eq("revelation");
			expect(last.chapter).to.eq(22);

			// when the cycle completes it wraps back to Genesis 1
			gen = win.chapterIndexToBookAndChapter(win.todaysChapterIndex(addDays(total)));
			expect(gen.book.slug).to.eq("genesis");
			expect(gen.chapter).to.eq(1);
		});
	});

	it("opens today's chapter when clicked", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#todaysChapterItem").click();

		cy.window().then((win) => {
			const target = win.chapterIndexToBookAndChapter(
				win.todaysChapterIndex(),
			);
			cy.get("#chapter").should("contain", target.book.name + " " + target.chapter);
			cy.get("#chapter").should("contain", "YCB-CYL");
			cy.location("hash").should(
				"eq",
				"#" + target.book.abbr + "-" + target.chapter,
			);
		});
	});
});