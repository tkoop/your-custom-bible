describe("home page", () => {
	beforeEach(() => {
		cy.clearLocalStorage();
		cy.visit("http://localhost:8001");
		cy.window().should("have.property", "goToTodaysChapter");
		cy.window().should("have.property", "buildIndex");
	});

	it("shows the home page on first landing", () => {
		cy.get("#home").should("be.visible");
		cy.contains("#home", "Chapter of the Day");
		cy.contains("#home", "Continue where you left off");
		cy.contains("#home", "Search");
		cy.contains("#home", "Chapter Picker");
		cy.location("hash").should("eq", "#");
	});

	it("menu has Home at the top and it navigates home", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#dropdown div").then(($items) => {
			const texts = $items.toArray().map((d) => d.textContent.trim());
			expect(texts[0]).to.eq("Home");
			expect(texts.indexOf("Home")).to.be.lessThan(texts.indexOf("Index"));
		});
		cy.get("#dropdown div").contains("Home").click();
		cy.get("#home").should("be.visible");
		cy.location("hash").should("eq", "#");
	});

	it("logo goes home", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown div").contains("Index").click();
		cy.get("#index").should("be.visible");
		cy.get("#brand").click();
		cy.get("#home").should("be.visible");
		cy.get("#index").should("not.be.visible");
		cy.location("hash").should("eq", "#");
	});

	it("a specific hash on landing opens that page directly", () => {
		cy.visit("http://localhost:8001/#Genesis-1");
		cy.get("#chapter").should("contain", "Genesis 1");
		cy.get("#home").should("not.be.visible");
		cy.get("#index").should("not.be.visible");
	});

	it("chapter picker card opens a chapter", () => {
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
		cy.location("hash").should("eq", "#Gen-1");
	});

	it("Chapter of the Day card opens today's chapter", () => {
		cy.window().then((win) => {
			const target = win.chapterIndexToBookAndChapter(win.todaysChapterIndex());
			cy.get("#homeTodayChapter").should(
				"contain",
				target.book.name + " " + target.chapter,
			);
		});
		cy.get("[data-cy='homeTodayButton']").click();
		cy.window().then((win) => {
			const target = win.chapterIndexToBookAndChapter(win.todaysChapterIndex());
			cy.get("#chapter").should(
				"contain",
				target.book.name + " " + target.chapter + " (YCB-CYL)",
			);
			cy.location("hash").should(
				"eq",
				"#" + target.book.abbr + "-" + target.chapter,
			);
		});
	});

	it("Continue card shows recent history and links back", () => {
		cy.get("#homeContinue").should("contain", "No history yet");

		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("3").click();
		cy.get("#chapter").should("contain", "Genesis 3 (YCB-CYL)");

		cy.get("#brand").click();
		cy.get("#homeContinue").should("contain", "Genesis 3");

		cy.get("#homeContinue").contains("Genesis 3").click();
		cy.get("#chapter").should("contain", "Genesis 3 (YCB-CYL)");
	});

	it("Continue card links to the History page", () => {
		cy.get("[data-cy='homeContinue']").contains("Full history").click();
		cy.get("#history").should("be.visible");
		cy.location("hash").should("eq", "#history");
	});

	it("search card opens the search page and runs the query", () => {
		cy.get("#homeSearchInput").type("let there be light");
		cy.get("#homeSearchInput").type("{enter}");
		cy.get("#search").should("be.visible");
		cy.get(".search-result", { timeout: 10000 }).should(
			"have.length.greaterThan",
			0,
		);
		cy.get(".search-ref").first().should("contain", "Genesis 1:3");
	});
});