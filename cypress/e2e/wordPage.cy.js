// The word study page, reached from the popup over a word in the chapter and
// from its own URL.
describe("word study page", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Gen-1");
    cy.get("#chapter").should("contain", "Genesis 1");
    cy.window().then((win) => win.document.fonts.ready);
    // The word page is a component like the chapter, and components load one
    // after another, so the chapter can be on screen before this one is here.
    cy.window().should((win) => expect(win.showWordPage).to.be.a("function"));
  });

  // The click the popup listens for is a caret position, so the spec has to
  // aim at the word's own box rather than at the element holding it.
  const chapterRelative = ($p, needle) => {
    const p = $p[0];
    const win = p.ownerDocument.defaultView;
    const ref = win.document.createRange();
    const walker = win.document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const idx = textNode.nodeValue.indexOf(needle);
      if (idx !== -1) {
        ref.setStart(textNode, idx);
        ref.setEnd(textNode, idx + needle.length);
        const r = ref.getBoundingClientRect();
        const chapterRect = win.document
          .getElementById("chapter")
          .getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - chapterRect.left,
          y: r.top + r.height / 2 - chapterRect.top,
        };
      }
    }
    throw new Error("word " + needle + " not found");
  };

  const clickWord = (needle) => {
    cy.get("#chapter p.reg1")
      .first()
      .then(($p) => {
        const pos = chapterRelative($p, needle);
        cy.get("#chapter").click(pos.x, pos.y);
      });
  };

  const openStudyFor = (needle) => {
    clickWord(needle);
    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");
    cy.get("[data-cy='wordPopupStudy']").should("be.visible").click();
    cy.get("[data-cy='wordPage']").should("be.visible");
    cy.get("[data-cy='wordPage'] .word-status").should("have.text", "");
  };

  it("opens from the popup and shows the word's study", () => {
    openStudyFor("heavens");

    cy.location("hash").should("eq", "#word/H8064");
    cy.get("[data-cy='wordHeadword']")
      .should("not.be.empty")
      .and("have.attr", "dir", "rtl");
    cy.get("[data-cy='wordStrong']").should("contain", "Strong's H8064");
    cy.get("#wordContent h2").contains("Definition");
    cy.get(".word-definition").should("contain", "the heavens");
    cy.get("#wordContent h2").contains("How it is translated");
    cy.get("#wordContent h2").contains("Verses");
  });

  it("remembers the verse the reader came from and goes back to it", () => {
    openStudyFor("heavens");

    cy.get("[data-cy='wordOrigin']").should("contain", "Genesis 1:1");
    cy.get("[data-cy='wordBack']").should("contain", "Back to Genesis 1");

    cy.get("[data-cy='wordBack']").click();
    cy.get("#chapter").should("be.visible").and("contain", "Genesis 1");
    cy.get("#word").should("not.be.visible");
  });

  it("lists the renderings most used first, and filters the verses by one", () => {
    openStudyFor("heavens");

    cy.get("[data-cy='wordRendering']").should("have.length.greaterThan", 3);
    cy.get("[data-cy='wordRendering']")
      .first()
      .should("contain", "the heavens")
      .and("contain", "76");
    cy.get("[data-cy='wordRendering']")
      .eq(1)
      .should("contain", "of heaven")
      .and("contain", "52");

    cy.get("[data-cy='wordRenderingChoose']").first().click();
    cy.get(".word-filter").should("contain", "the heavens");
    cy.get("[data-cy='wordRendering']").first().should("have.class", "selected");

    // Verses are built per book, when the book is opened.
    cy.get("[data-cy='wordBook']").first().click();
    cy.get("[data-cy='wordBook']").first().should("have.attr", "open");
    cy.get("[data-cy='wordVerse']").first().should("contain", "1:1");

    cy.get(".word-filter-clear").click();
    cy.get(".word-filter").should("not.exist");
  });

  it("opens a verse in the chapter reader, scrolled to it", () => {
    openStudyFor("heavens");

    cy.get("[data-cy='wordBook']").eq(1).click();
    cy.get("[data-cy='wordBook']")
      .eq(1)
      .find("[data-cy='wordVerse']")
      .first()
      .then(($verse) => {
        // Read the reference before the click navigates away, then look for the
        // verse it named. Command arguments are built when they are queued, so
        // this has to happen inside the callback.
        const [chapter, verse] = $verse.text().split(":");
        cy.get("[data-cy='wordVerse']").first().click();
        cy.location("hash").should("eq", "#Exo-" + chapter);
        cy.get("#chapterTitle").should("contain", "Exodus " + chapter);
        // loadURL() scrolls to the verse the link asked for.
        cy.get("#chapter #v" + verse).should("exist");
      });
  });

  it("opens from its own URL", () => {
    cy.visit("http://localhost:8000/#word/G2424");

    cy.get("[data-cy='wordPage']").should("be.visible");
    cy.get("[data-cy='wordStrong']").should("contain", "Strong's G2424");
    cy.get("[data-cy='wordHeadword']").should("have.attr", "lang", "el");
    cy.get(".word-definition").should("contain", "Jesus");
    cy.get("[data-cy='wordRendering']").first().should("contain", "Jesus");
    // A word with no Strong's number has no page to offer.
    cy.get("[data-cy='wordOrigin']").should("not.exist");
    cy.get("[data-cy='wordBack']").should("contain", "Back");
  });

  it("says so when there is no study for the word", () => {
    cy.visit("http://localhost:8000/#word/H9999");

    cy.get("[data-cy='wordPage'] .word-status").should("contain", "no study");
  });

  it("will not open for a word with no Strong's number", () => {
    cy.window().then((win) => {
      expect(win.openWordStudy({ l: "Hebrew", s: "" }, null)).to.equal(false);
      expect(win.location.hash).to.equal("#Gen-1");
    });
  });
});
