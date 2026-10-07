describe("search page", () => {
	beforeEach(() => {
		cy.clearLocalStorage();
		cy.visit("http://localhost:8000/#search");
		cy.get("#search").should("exist");
	});

	const search = (q) => {
		cy.get("#searchInput").clear().type(q);
		cy.get("#searchStatus")
			.invoke("text")
			.should("match", /\d+ matches? \u00b7 \d+ ms/);
	};

	const matchCount = () =>
		cy.get("#searchStatus").invoke("text").then((t) => parseInt(t, 10));

	it("has the partial checkbox on by default", () => {
		cy.get("#searchPartial").should("be.checked");
	});

	it("matches inside words when partial is checked", () => {
		search("hea");
		cy.get("#searchStatus").should("contain", "matches");
		cy.get(".search-result")
			.first()
			.find(".search-text mark")
			.should("contain", "hea");
	});

	it("matches whole words only when partial is unchecked", () => {
		search("bear");
		matchCount().then((partialCount) => {
			cy.get("#searchPartial").uncheck();
			matchCount().then((wholeCount) => {
				expect(partialCount).to.equal(266);
				expect(wholeCount).to.equal(149);
			});
		});
		cy.get("#searchPartial").should("not.be.checked");
	});

	it("gives no results for a partial-only fragment", () => {
		search("ea");
		cy.get("#searchPartial").uncheck();
		cy.get("#searchStatus").should("contain", "0 matches");
		cy.get(".search-result").should("not.exist");
	});

	it("finds the whole word when partial is unchecked", () => {
		search("earth");
		cy.get("#searchPartial").uncheck();
		matchCount().then((n) => expect(n).to.be.greaterThan(0));
		cy.get(".search-result .search-text mark").should("contain", "earth");
	});

	it("does not highlight partial matches inside words", () => {
		search("ear");
		cy.get("#searchPartial").uncheck();
		cy.get(".search-result .search-text mark").should("contain", "ear");
		cy.get(".search-result")
			.first()
			.find(".search-text")
			.invoke("text")
			.then((text) => {
				expect(text).to.not.contain("bear");
				expect(text).to.not.contain("hear");
			});
	});

	it("respects whole words in each-word mode", () => {
		search("bear");
		cy.get('input[name="searchMode"][value="words"]').check();
		cy.get("#searchPartial").uncheck();
		matchCount().then((wholeCount) => {
			cy.get("#searchPartial").check();
			matchCount().then((partialCount) => {
				expect(wholeCount).to.be.lessThan(partialCount);
			});
		});
	});

	it("keeps whole words for exact phrases", () => {
		search("ing one");
		cy.get("#searchPartial").uncheck();
		cy.get("#searchStatus").should("contain", "0 matches");
		cy.get(".search-result").should("not.exist");
		cy.get("#searchPartial").check();
		cy.get("#searchStatus").should("contain", "matches");
		cy.get(".search-result").should("exist");
	});

	it("persists the partial choice and records it in history", () => {
		search("mercy");
		cy.get("#searchPartial").uncheck();
		cy.get("#searchInput").type("{enter}");
		cy.get(".search-history-chip").first().should("contain", "mercy");
		cy.get(".search-history-chip").first().should("not.contain", "partial");

		cy.reload();
		cy.get("#searchPartial").should("not.be.checked");
		cy.get(".search-history-chip").first().should("not.contain", "partial");

		cy.get(".search-history-chip").first().click();
		cy.get("#searchPartial").should("not.be.checked");
	});

	it("records partial searches in history", () => {
		search("mercy");
		cy.get("#searchInput").type("{enter}");
		cy.get(".search-history-chip").first().should("contain", "partial");
	});

	it("marks the words it searched for in the chapter a result opens", () => {
		search("the heavens");
		cy.get(".search-result").first().click();

		cy.get("#chapterTitle").should("contain", "Genesis 1");
		cy.get("#chapter .chapter-hl").should("have.length.greaterThan", 0);
		// Each mark is a whole match of the phrase, nothing of it or part of it.
		cy.get("#chapter .chapter-hl").each(($mark) => {
			expect($mark.text().toLowerCase()).to.equal("the heavens");
		});
		cy.get("[data-cy='clearHighlights']")
			.should("be.visible")
			.and("contain", "Clear highlights");
		// The words are marked wherever the chapter has them, not only in the
		// verse the result named.
		cy.get("#chapter #v1").closest("p").find(".chapter-hl").should("exist");
	});

	it("marks each searched word separately in each-word mode", () => {
		search("formless void");
		cy.get('input[name="searchMode"][value="words"]').check();
		cy.get(".search-result").first().click();

		cy.get("#chapterTitle").should("contain", "Genesis 1");
		cy.get("#chapter .chapter-hl").then(($marks) => {
			const marked = [...$marks].map((m) => m.textContent.toLowerCase());
			expect(marked).to.include("formless");
			expect(marked).to.include("void");
		});
	});

	it("marks the divine name the settings spell differently", () => {
		// The BSB's text says "the LORD", and the reader may be reading it as
		// Yahweh, so the words the search was run on are marked where they are
		// printed rather than where the translation wrote them.
		search("the LORD");
		cy.get(".search-result").first().click();

		cy.get("#chapter").should("contain", "Yahweh");
		cy.get("#chapter .chapter-hl").should("have.length.greaterThan", 0);
		cy.get("#chapter .chapter-hl").each(($mark) => {
			expect($mark.text()).to.equal("Yahweh");
		});

		// The name is rewritten in place, so the marks have to follow it.
		cy.get("#gearIcon").click();
		cy.get("div#settingsDropdown select#name").select("Jehovah");
		cy.get("#chapter .chapter-hl").each(($mark) => {
			expect($mark.text()).to.equal("Jehovah");
		});
	});

	it("takes the marks away when the button is pressed", () => {
		search("the heavens");
		cy.get(".search-result").first().click();
		cy.get("#chapter .chapter-hl").should("exist");

		cy.get("[data-cy='clearHighlights']").click();
		cy.get("#chapter .chapter-hl").should("not.exist");
		cy.get("[data-cy='clearHighlights']").should("not.be.visible");
		// The text is left as it was, still whole.
		cy.get("#chapter").should("contain", "God created the heavens");
	});

	it("does not carry the marks into the next chapter", () => {
		search("the heavens");
		cy.get(".search-result").first().click();
		cy.get("#chapter .chapter-hl").should("exist");

		cy.get("[data-cy='chapterRight']").first().click();
		cy.get("#chapterTitle").should("contain", "Genesis 2");
		cy.get("#chapter .chapter-hl").should("not.exist");
		cy.get("[data-cy='clearHighlights']").should("not.be.visible");
	});

	it("clears the marks when the reader leaves the chapter for another page", () => {
		search("the heavens");
		cy.get(".search-result").first().click();
		cy.get("#chapter .chapter-hl").should("exist");

		cy.get("#brand").click();
		cy.get("#home").should("be.visible");
		cy.get("#chapter .chapter-hl").should("not.exist");

		cy.go("back");
		cy.get("#chapterTitle").should("contain", "Genesis 1");
		cy.get("#chapter .chapter-hl").should("not.exist");
		cy.get("[data-cy='clearHighlights']").should("not.be.visible");
	});
});
