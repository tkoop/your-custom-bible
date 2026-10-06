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
});