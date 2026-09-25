describe("word lookup popup", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Gen-1");
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
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

  it("shows popup with Hebrew info for a clicked word", () => {
    cy.get("#chapter p.reg1")
      .first()
      .then(($p) => {
        const pos = chapterRelative($p, "heavens");
        cy.get("#chapter").click(pos.x, pos.y);
      });

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
    cy.get("#chapter p.reg1")
      .first()
      .then(($p) => {
        const pos = chapterRelative($p, "earth");
        cy.get("#chapter").click(pos.x, pos.y);
      });

    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");
    cy.get("[data-cy='wordPopupClose']").click();
    cy.get("[data-cy='wordPopup']").should("not.be.visible");
  });

  it("shows dotted underlines with pointer cursor when Word study links is on", () => {
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

  it("removes underlines when Word study links is off but popup still works", () => {
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");

    cy.get("#gearIcon").should("be.visible").click();
    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link").should("not.exist");

    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");

    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link").should("not.exist");

    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown").should("not.be.visible");

    cy.get("#chapter p.reg1")
      .first()
      .then(($p) => {
        const pos = chapterRelative($p, "heavens");
        cy.get("#chapter").click(pos.x, pos.y);
      });

    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");
  });
});