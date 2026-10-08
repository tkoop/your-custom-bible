// The word study page, reached from the popup over a word in the chapter and
// from its own URL.
describe("word study page", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Gen-1");
    // "#chapter" holds the component's own markup until a chapter is fetched
    // into it, and that markup mentions Genesis 1 in a comment, so wait for the
    // title that only a loaded chapter has.
    cy.get("#chapterTitle", { timeout: 10000 }).should("contain", "Genesis 1");
    cy.window().then((win) => win.document.fonts.ready);
    // The word page is a component like the chapter, and components load one
    // after another, so the chapter can be on screen before this one is here.
    cy.window().should((win) => expect(win.showWordPage).to.be.a("function"));
    // A word is only tappable for the reader who turned the links on, and every
    // spec here starts by tapping one to open the study.
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");
    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");
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
    cy.get("#wordContent h2").contains("How it is translated");
    cy.get("#wordContent h2").contains("Verses");
  });

  it("shows Strong's dictionary entry for the word", () => {
    openStudyFor("heavens");

    cy.get("[data-cy='wordStrongsEntry']").within(() => {
      cy.get("dt").should("have.length", 3); // headword, transliteration, sound
      cy.contains("dt", "Headword");
      cy.contains("dt", "Pronounced").next().should("not.be.empty");
    });
    cy.get("[data-cy='wordDefinition']").should("contain", "the sky");
    cy.get(".word-usage").should("contain", "In the BSB:");
    cy.get(".word-credit").should("contain", "Strong's Dictionaries");
    cy.get("#wordContent h2").should("not.contain", "King James");
  });

  it("links the words a Strong's entry is built from", () => {
    // H0430 is a plural of H0433, so its definition names the word it is made of.
    cy.visit("http://localhost:8000/#word/H0430");
    cy.get("[data-cy='wordDefinition']").should(
      "contain",
      "gods in the ordinary sense",
    );
    cy.get("[data-cy='wordDerivation']").should("contain", "plural of");
    cy.get("[data-cy='wordDefinition'] a.word-ref")
      .first()
      .should("have.attr", "href", "#word/H0433")
      .click();

    cy.location("hash").should("eq", "#word/H0433");
    cy.get("[data-cy='wordStrong']").should("contain", "Strong's H0433");
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

  it("marks the word's renderings in the chapter a verse link opens", () => {
    openStudyFor("heavens");

    // The renderings the page lists are the words the chapter can be marked
    // with: this word, wherever the translation renders it, and nothing else.
    cy.get("[data-cy='wordRendering']")
      .then(($rows) =>
        [...$rows].map((row) =>
          row.getAttribute("data-rendering").toLowerCase(),
        ),
      )
      .as("renderings");

    cy.get("[data-cy='wordBook']").eq(1).click();
    cy.get("[data-cy='wordBook']")
      .eq(1)
      .find("[data-cy='wordVerse']")
      .first()
      .then(($verse) => {
        const [chapter, verse] = $verse.text().split(":");
        cy.get("[data-cy='wordVerse']").first().click();
        cy.get("#chapterTitle").should("contain", "Exodus " + chapter);

        cy.get("#chapter .chapter-hl").should("have.length.greaterThan", 0);
        cy.get("@renderings").then((renderings) => {
          cy.get("#chapter .chapter-hl").each(($mark) => {
            expect(renderings).to.include($mark.text().toLowerCase());
          });
        });
        // The verse the link named is one of them.
        cy.get("#chapter #v" + verse)
          .closest("p")
          .find(".chapter-hl")
          .should("exist");
        cy.get("[data-cy='clearHighlights']")
          .should("be.visible")
          .and("contain", "Clear highlights")
          .click();
        cy.get("#chapter .chapter-hl").should("not.exist");
      });
  });

  it("marks only the rendering the reader picked", () => {
    openStudyFor("heavens");

    // "the heavens" is the rendering Genesis 1:1 uses, so the marks on it are
    // the phrase and not the single word on its own.
    cy.get("[data-cy='wordRendering']").first().should("contain", "the heavens");
    cy.get("[data-cy='wordRenderingChoose']").first().click();

    cy.get("[data-cy='wordBook']").first().click();
    cy.get("[data-cy='wordBook']")
      .first()
      .find("[data-cy='wordVerse']")
      .first()
      .click();

    cy.get("#chapter .chapter-hl").should("have.length.greaterThan", 0);
    cy.get("#chapter .chapter-hl").each(($mark) => {
      expect($mark.text().toLowerCase()).to.equal("the heavens");
    });
  });

  it("opens from its own URL", () => {
    cy.visit("http://localhost:8000/#word/G2424");

    cy.get("[data-cy='wordPage']").should("be.visible");
    cy.get("[data-cy='wordStrong']").should("contain", "Strong's G2424");
    cy.get("[data-cy='wordHeadword']").should("have.attr", "lang", "el");
    cy.get(".word-usage").should("contain", "Jesus");
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
