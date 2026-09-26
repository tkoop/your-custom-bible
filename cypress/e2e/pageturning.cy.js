describe("page turning", () => {
	beforeEach(() => {
		cy.visit("http://localhost:8001");
		cy.window().should("have.property", "hideDropDown"); // menu component loaded
		// the app now lands on Home; the picker tests run on the Index page
		cy.get("#menuIcon").click();
		cy.get("#dropdown div").contains("Index").click();
		cy.get("#index").should("be.visible");
	});

	function enablePageTurning() {
		cy.get("input[data-value=pageturning]").should("exist");
		cy.get("#gearIcon").click();
		cy.get("#settingsDropdown").should("be.visible");
		cy.get("input[data-value=pageturning]").check({ force: true });
		cy.get("#menuIcon").click(); // close dropdown
	}

	// A touch swipe across the page-turn viewport: press at (x1, y1), release at
	// (x2, y2).
	function swipe(x1, y1, x2, y2) {
		gesture("touch", x1, y1, x2, y2);
	}

	// The same drag, but with a mouse.
	function drag(x1, y1, x2, y2) {
		gesture("mouse", x1, y1, x2, y2);
	}

	function gesture(pointerType, x1, y1, x2, y2) {
		const init = {
			pointerId: 1,
			pointerType: pointerType,
			isPrimary: true,
			clientX: x1,
			clientY: y1,
			button: 0,
		};
		cy.get("#pageTurnViewport").trigger("pointerdown", init);
		cy.get("#pageTurnViewport").trigger("pointerup", {
			...init,
			clientX: x2,
			clientY: y2,
		});
	}

	it("pagination on, off, and page navigation", () => {
		enablePageTurning();

// Open Psalm 119 (176 verses -> multiple pages)
		cy.get("#index").contains("Psalms").click();
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
		cy.get("#chapterText")
			.invoke("css", "column-width")
			.should("eq", "auto");
		cy.get("#chapterText").invoke("css", "transform").should("eq", "none");
		cy.get(".chapter-nav.bottom").should("be.visible");
	});

	it("recalculates pages on window resize", () => {
		enablePageTurning();
		cy.get("#index").contains("Psalms").click();
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
		cy.get("#index").contains("Genesis").click();
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

	it("does not mark a chapter finished until the last page is reached", () => {
		enablePageTurning();
		cy.get("#index").contains("Psalms").click();
		cy.get("[data-cy='Psalms'] a[data-chapter='119']").click();
		cy.get("#chapter").should("have.class", "page-turn");
		cy.get(".page-turn-dot").should("have.length.greaterThan", 1);

		// just opened on page 1 of many -> must NOT be marked finished
		cy.window().then((win) => {
			const history = JSON.parse(win.localStorage.getItem("browseHistory"));
			expect(history[history.length - 1].finished).to.eq(false);
		});

		// jump to the last page via the last dot -> now it is finished
		cy.get(".page-turn-dot").last().click();
		cy.get("#pageTurnRight").should("be.disabled");
		cy.window().then((win) => {
			const history = JSON.parse(win.localStorage.getItem("browseHistory"));
			expect(history[history.length - 1].finished).to.eq(true);
		});
	});

	it("pages on a horizontal swipe and ignores other gestures", () => {
		enablePageTurning();
		cy.get("#index").contains("Psalms").click();
		cy.get("[data-cy='Psalms'] a[data-chapter='119']").click();
		cy.get("#chapter").should("have.class", "page-turn");

		// swipe left -> next page
		swipe(300, 400, 120, 400);
		cy.get("#pageTurnCount").invoke("text").should("match", /^2 \/ \d+$/);

		// swipe right -> back to the first page
		swipe(120, 400, 300, 400);
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);

		// a mostly vertical drag must not page
		swipe(300, 200, 320, 500);
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);

		// a short drag must not page
		swipe(300, 400, 280, 400);
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);

		// swiping back past the first page changes nothing
		swipe(120, 400, 400, 400);
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);
		cy.get("#pageTurnLeft").should("be.disabled");
	});

	it("does not page when a mouse drag selects text", () => {
		enablePageTurning();
		cy.get("#index").contains("Psalms").click();
		cy.get("[data-cy='Psalms'] a[data-chapter='119']").click();
		cy.get("#chapter").should("have.class", "page-turn");

		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);

		// select some text, then drag across it like a selection drag
		cy.window().then((win) => {
			const text = win.document.getElementById("chapterText");
			const range = win.document.createRange();
			range.selectNodeContents(text.querySelector("p") || text);
			const selection = win.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		});
		drag(400, 400, 100, 400);
		cy.get("#pageTurnCount").invoke("text").should("match", /^1 \/ \d+$/);
	});
});