describe("reference jump", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#index");
    cy.get("#index [data-cy='refJumpInput']").should("exist");
  });

  const field = () => cy.get("#index [data-cy='refJumpInput']");
  const options = () => cy.get("#index [data-cy='refJumpOption']");
  const type = (text) => field().clear().type(text);

  const chapterTitle = () =>
    cy.get("#chapterTitle").invoke("text").then((t) => t.replace(/\s+/g, " "));

  it("has the field at the top of the index page, without opening the keyboard", () => {
    // Above the books: the field is the first thing in the list, not one more
    // row of it.
    cy.get("#index .ref-jump").should("have.length", 1);
    cy.get("#index").then(($index) => {
      expect($index[0].firstElementChild.className).to.equal("ref-jump");
    });
    // Nothing is focused, so a phone does not bring its keyboard up over the
    // list the reader came here for.
    cy.window().then((win) => {
      expect(win.document.activeElement.tagName).to.equal("BODY");
    });
  });

  it("offers the references under the field as it is typed", () => {
    type("jn 3:16");
    options().should("have.length", 1).and("contain", "John 3:16");

    // Every keystroke is answered: the book on its own offers its first chapter.
    type("{selectall}gen");
    options().should("have.length", 1).and("contain", "Genesis 1");

    // An ambiguous book offers them all, best first.
    type("{selectall}p");
    options().should("have.length.greaterThan", 2);
    options().first().should("contain", "Psalm 1");
  });

  it("reads a book abbreviation", () => {
    type("1 co 13");
    options().should("have.length", 1).and("contain", "1 Corinthians 13");

    type("{selectall}ps 23");
    options().should("have.length", 1).and("contain", "Psalm 23");

    type("{selectall}gn1");
    options().should("have.length", 1).and("contain", "Genesis 1");
  });

  it("takes a chapter the book does not have as no match at all", () => {
    type("gen 51");
    options().should("not.exist");
    type("{selectall}zzz");
    options().should("not.exist");

    // Nothing to pick, so Enter leaves the reader where they were.
    field().type("{enter}");
    cy.get("#index").should("be.visible");
    cy.get("#chapter").should("not.be.visible");
  });

  it("goes to the chapter on Enter", () => {
    type("jn 3");
    options().should("contain", "John 3");
    field().type("{enter}");

    cy.get("#chapterTitle").should("contain", "John 3");
    chapterTitle().should("match", /^John 3 \(YCB-/);
    // A chapter with no verse in it has nothing to mark.
    cy.get("#chapter .chapter-hl").should("not.exist");
    cy.get("[data-cy='clearHighlights']").should("not.be.visible");
  });

  it("goes to the chapter when an offer is tapped", () => {
    type("ps 23");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "Psalm 23");
    // A picked reference is spent, so the field is empty next time.
    cy.get("#index [data-cy='refJumpInput']").should("have.value", "");
  });

  it("goes to the second offer with the arrow keys", () => {
    type("p");
    options().first().should("contain", "Psalm 1");
    field().type("{downarrow}");
    options().eq(1).should("have.class", "selected");
    field().type("{enter}");

    cy.get("#chapterTitle").should("contain", "Proverbs 1");
  });

  it("dismisses the offers on Escape", () => {
    type("gen");
    options().should("exist");
    field().type("{esc}");
    options().should("not.exist");
  });

  it("scrolls to a verse and marks it, with the button to take it away", () => {
    type("jn 3:16");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "John 3");
    cy.get("#chapter #v16").should("exist");
    // The verse is on screen, not merely somewhere in the chapter.
    cy.window().then((win) => {
      const box = win.document.getElementById("v16").getBoundingClientRect();
      expect(box.top).to.be.at.least(0);
      expect(box.bottom).to.be.at.most(win.innerHeight);
    });

    // The verse is marked whole, from its own marker to the next one.
    cy.get("#chapter .chapter-hl").should("exist");
    cy.get("#chapter .chapter-hl").then(($marks) => {
      const marked = [...$marks].map((m) => m.textContent).join(" ");
      expect(marked).to.contain("For God so loved the world");
      // Nothing from the verses either side of it is caught in the mark.
      expect(marked).to.not.contain("that whoever believes");
      expect(marked).to.not.contain("For God did not send");
    });
    cy.get("[data-cy='clearHighlights']")
      .should("be.visible")
      .and("contain", "Hide highlight");

    cy.get("[data-cy='clearHighlights']").click();
    cy.get("#chapter .chapter-hl").should("not.exist");
    cy.get("[data-cy='clearHighlights']").should("not.be.visible");
  });

  it("stops at the next verse inside the same paragraph", () => {
    // 1 Chronicles 11 opens two verses into one paragraph, so the mark has to
    // stop in the middle of it rather than at the end.
    type("1 chr 11:2");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "1 Chronicles 11");
    cy.get("#chapter .chapter-hl").then(($marks) => {
      const marked = [...$marks].map((m) => m.textContent).join(" ");
      expect(marked).to.contain("Even in times past");
      expect(marked).to.not.contain("Then all Israel came together");
      expect(marked).to.not.contain("Jabeshiel");
    });
  });

  it("leaves a heading that stands between two verses unmarked", () => {
    // The day headings in Genesis 1 sit between verses, so they belong to
    // neither of them.
    type("gen 1:2");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "Genesis 1");
    cy.get("#chapter .chapter-hl").then(($marks) => {
      const marked = [...$marks].map((m) => m.textContent).join(" ");
      expect(marked).to.contain("Now the earth was formless");
      expect(marked).to.not.contain("The First Day");
    });
  });

  it("lands on the page the verse is on when the chapter paginates", () => {
    // Page turning is switched on with a chapter open, since the menu that
    // holds it is chapter-only.
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.openChapter();
    cy.openAdvancedMenu();
    cy.get("input[data-value=pageturning]").check({ force: true });
    cy.get("#header").click("left");

    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.get("#menuIcon").click();
    cy.get("#dropdown div").contains("Index").click();
    cy.get("#index").should("be.visible");

    // Psalm 119 runs to many pages; its last verse is nowhere near the first.
    type("ps 119:176");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "Psalm 119");
    cy.get("#chapter").should("have.class", "page-turn");
    cy.get("#pageTurnCount")
      .invoke("text")
      .should("match", /^(?!1 \/)\d+ \/ \d+$/);
    // ...and the verse itself comes inside the viewport, which is what paging to
    // it is for. The verse number is hidden - that is a setting - so the verse's
    // paragraph is what has a position, and the page slides, so this waits for
    // it to arrive.
    cy.get("#chapter #v176").should(($marker) => {
      const box = $marker[0].closest("p").getBoundingClientRect();
      const viewport = $marker[0].closest("#pageTurnViewport").getBoundingClientRect();
      expect(box.left).to.be.at.least(viewport.left - 1);
      expect(box.right).to.be.at.most(viewport.right + 1);
      expect(box.top).to.be.at.least(viewport.top - 1);
      expect(box.bottom).to.be.at.most(viewport.bottom + 1);
    });
    cy.get("#chapter .chapter-hl").should("exist");
  });

  it("has the same field at the top of the home page picker", () => {
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    const homeField = cy.get("#homePicker [data-cy='homerefJumpInput']");
    homeField.should("exist");
    cy.get("#homePicker").then(($picker) => {
      expect($picker[0].firstElementChild.className).to.equal("ref-jump");
    });

    homeField.type("1 th 5");
    cy.get("#homePicker [data-cy='homerefJumpOption']")
      .should("have.length", 1)
      .and("contain", "1 Thessalonians 5")
      .click();

    cy.get("#chapterTitle").should("contain", "1 Thessalonians 5");
  });

  it("does not carry a verse into the next chapter", () => {
    type("jn 3:16");
    options().first().click();
    cy.get("#chapter .chapter-hl").should("exist");

    cy.get("[data-cy='chapterRight']").first().click();
    cy.get("#chapterTitle").should("contain", "John 4");
    cy.get("#chapter .chapter-hl").should("not.exist");
    cy.get("[data-cy='clearHighlights']").should("not.be.visible");
  });

  it("leaves a verse the chapter does not have unmarked", () => {
    // John 1 has 51 verses; 99 is a number this chapter cannot answer.
    type("jn 1:99");
    options().first().click();

    cy.get("#chapterTitle").should("contain", "John 1");
    cy.get("#chapter .chapter-hl").should("not.exist");
    cy.get("[data-cy='clearHighlights']").should("not.be.visible");
  });
});