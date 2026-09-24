describe("page turning", () => {
	beforeEach(() => {
		cy.visit("http://localhost:8001");
	});

	function enablePageTurning() {
		cy.get("input[data-value=pageturning]").should("exist");
		cy.get("#gearIcon").click();
		cy.get("#settingsDropdown").should("be.visible");
		cy.get("input[data-value=pageturning]").check({ force: true });
		cy.get("#menuIcon").click(); // close dropdown
	}

	it("pagination on, off, and page navigation", () => {
		enablePageTurning();

// Open Psalm 119 (176 verses -> multiple pages)
		cy.contains("Psalms").click();
		cy.get("[data-cy='Psalms'] a[data-chapter='119']").click();

		cy.get("#chapter").should("have.class", "page-turn");
		cy.get("#pageTurnViewport").should("be.visible");
		cy.get("#pageTurnCount")
			.invoke("text")
			.then((t) => {
				expect(t.trim()).to.match(/^1 \/ \d+$/);
				const total = parseInt(t.trim().split("/")[1]);
				expect(total).to.be.greaterThan(1);
			});
		cy.get(".page-turn-dot").should("have.length.greaterThan", 1);
		cy.get("#pageTurnLeft").should("be.disabled");
		cy.get("#pageTurnRight").should("be.enabled");

		// moving to page 2
		cy.get("#pageTurnRight").click();
		cy.get("#pageTurnCount").invoke("text").should("match", /^2 \/ \d+$/);
		cy.get(".page-turn-dot.active").invoke("attr", "data-page").should("eq", "1");
		cy.get("#pageTurnLeft").should("be.enabled");

		// jump to the last page via the last dot
		cy.get(".page-turn-dot").last().click();
		cy.get("#pageTurnRight").should("be.disabled");

		// jump back to page 1 via the first dot
		cy.get(".page-turn-dot").first().click();
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);
		cy.get("#pageTurnLeft").should("be.disabled");

		// body must not scroll
		cy.window().then((win) => {
			expect(win.scrollY).to.eq(0);
		});

		// toggle off -> normal scroll layout restored
		cy.get("#gearIcon").click();
		cy.get("input[data-value=pageturning]").uncheck({ force: true });
		cy.get("#menuIcon").click();
		cy.get("#chapter").should("not.have.class", "page-turn");
		cy.get("#pageTurnViewport").should("not.exist");
		cy.get("#pageTurnControls").should("not.exist");
		cy.get("#chapterText").should("exist");
		cy.get(".chapter-nav.bottom").should("be.visible");
	});

	it("recalculates pages on window resize", () => {
		enablePageTurning();
		cy.contains("Psalms").click();
		cy.get("[data-cy='Psalms'] a[data-chapter='119']").click();
		cy.get("#chapter").should("have.class", "page-turn");

		cy.get("#pageTurnCount").invoke("text").then((before) => {
			const beforeTotal = parseInt(before.trim().split("/")[1]);
			cy.viewport(500, 700);
			cy.get("#pageTurnCount").invoke("text").should((after) => {
				const afterTotal = parseInt(after.trim().split("/")[1]);
				expect(afterTotal).to.be.greaterThan(1);
				// narrower viewport => at least as many pages
				expect(afterTotal).to.be.gte(beforeTotal);
			});
		});
	});

	it("keeps the paging UI when moving between chapters with the nav arrows", () => {
		enablePageTurning();
		cy.contains("Genesis").click();
		cy.get("[data-cy='Genesis'] a[data-chapter='1']").click();
		cy.get("#chapter").should("have.class", "page-turn");
		cy.get("#pageTurnControls").should("be.visible");

		// next chapter via the top nav arrow
		cy.get("[data-cy=chapterRight]").first().click();
		cy.get("#chapter").should("contain", "Genesis 2 (YCB-CYL)");
		cy.get("#chapter").should("have.class", "page-turn");
		cy.get("#pageTurnViewport").should("be.visible");
		cy.get("#pageTurnControls").should("be.visible");
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);

		// previous chapter via the top nav arrow
		cy.get("[data-cy=chapterLeft]").first().click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
		cy.get("#chapter").should("have.class", "page-turn");
		cy.get("#pageTurnViewport").should("be.visible");
		cy.get("#pageTurnControls").should("be.visible");
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);
	});
});