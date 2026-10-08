describe("word lookup popup", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Gen-1");
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYLP)");
    cy.get("#chapter .reftext#v1").should("exist");
    cy.window().then((win) => win.document.fonts.ready);
  });

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

  // The popup belongs to the reader who turned the links on, so every spec that
  // wants one asks for the links first, and puts the menus away again so a panel
  // cannot be left sitting over the word being clicked.
  const wordStudyLinksOn = () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");
    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");
    cy.get("#advancedDropdown").should("not.be.visible");
  };

  const clickInVerse = (needle) => {
    cy.get("#chapter p.reg1")
      .first()
      .then(($p) => {
        const pos = chapterRelative($p, needle);
        cy.get("#chapter").click(pos.x, pos.y);
      });
  };

  it("shows popup with Hebrew info for a clicked word", () => {
    wordStudyLinksOn();
    clickInVerse("heavens");

    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");
    cy.get(".word-popup-ref").should("contain", "Genesis 1:");
    cy.get(".word-popup-orig").should("not.be.empty");
    cy.get(".word-popup-strong").should("contain", "Strong's H");
  });

  it("looks up the entry for a specific word via testLookup", () => {
    cy.window().then((win) => {
      return win.testLookup("genesis", 1, 1, "God").then((entry) => {
        expect(entry).to.not.be.null;
        expect(entry.o).to.contain("א"); // Hebrew original
        expect(entry.s).to.equal("430");
        expect(entry.l).to.equal("Hebrew");
      });
    });

    cy.window().then((win) => {
      return win.testLookup("genesis", 1, 2, "earth").then((entry) => {
        expect(entry).to.not.be.null;
        expect(entry.s).to.be.a("string");
      });
    });
  });

  it("does not open a popup for a word with no data", () => {
    cy.window().then((win) => {
      return win.testLookup("genesis", 1, 1, "zzznotaword").then((entry) => {
        expect(entry).to.be.null;
      });
    });
  });

  it("closes the popup when the close button is clicked", () => {
    wordStudyLinksOn();
    clickInVerse("earth");

    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");
    cy.get("[data-cy='wordPopupClose']").click();
    cy.get("[data-cy='wordPopup']").should("not.be.visible");
  });

  it("is off by default: no underlines, and a word is not tappable", () => {
    cy.get("#chapter .word-link").should("not.exist");

    clickInVerse("heavens");

    // Nothing opens: the popup is built the first time a word is looked up, so
    // there is no element for it to have been. The wait is for the lookup that
    // would otherwise have been in flight.
    cy.wait(750);
    cy.get("#wordPopup").should("not.exist");
  });

  it("shows dotted underlines with pointer cursor when Word study links is on", () => {
    wordStudyLinksOn();

    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");
    cy.get("#chapter .word-link")
      .first()
      .should("have.css", "text-decoration-style", "dotted")
      .and("have.css", "cursor", "pointer");

    cy.get("#chapter .word-link").first().then(($el) => {
      const text = $el.text();
      expect(text.trim().length).to.be.greaterThan(0);
    });
  });

  it("stops opening the popup when Word study links is turned off again", () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");

    // The underlines come and go with the setting, word for word.
    cy.get("#advancedDropdown").should("be.visible");
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link").should("not.exist");

    cy.get("#advancedDropdown").should("be.visible");
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");

    cy.get("#advancedDropdown").should("be.visible");
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link").should("not.exist");

    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");

    // A word that was tappable a moment ago is not tappable now.
    clickInVerse("heavens");
    cy.wait(750);
    cy.get("#wordPopup").should("not.exist");
  });
});