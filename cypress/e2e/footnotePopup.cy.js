describe("footnote popup", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Jhn-1");
    cy.get("#chapter").should("contain", "John 1 (YCB-");
    cy.get("#chapter .reftext#v1").should("exist");
    cy.window().then((win) => win.document.fonts.ready);
  });

  // The notes are a setting like any other, and the letters in the text are
  // hidden along with them, so every spec that wants a letter asks for the notes
  // first and puts the menu away again.
  const footnotesOn = () => {
    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("div", "Footnotes").click();
    cy.get("#chapter span.fn", { timeout: 10000 }).should("be.visible");
    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");
  };

  const footnotesOff = () => {
    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("div", "Footnotes").click();
    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");
  };

  // A letter is a click, not a word: the handler answers the marker it is in
  // and nothing else, so the event is sent to the element itself. Which marker
  // is at which index is the chapter's business.
  const clickMarker = (index) => {
    cy.get("#chapter p span.fn").eq(index).then(($marker) => {
      $marker[0].scrollIntoView({ block: "center" });
      $marker[0].click();
    });
  };

  it("is off by default: the letters in the text are not tappable", () => {
    cy.get("#chapter p span.fn").first().should("not.be.visible");

    clickMarker(0);
    // Nothing opens, and there is no element for it to have opened into: the
    // popup is built the first time one is asked for.
    cy.wait(750);
    cy.get("#footnotePopup").should("not.exist");
  });

  it("opens the note a marker points at", () => {
    footnotesOn();

    clickMarker(0);

    cy.get("[data-cy='footnotePopup']", { timeout: 5000 }).should("be.visible");
    cy.get("#footnotePopup .word-popup-ref").should("have.text", "Footnote a");
    cy.get("#footnotePopup .footnote-popup-verse").should("have.text", "John 1:5");
    cy.get("#footnotePopup .footnote-popup-text")
      .invoke("text")
      .should("match", /Or\s*comprehended/);
  });

  it("keeps the italics the alternative readings were written with", () => {
    footnotesOn();

    clickMarker(0);

    cy.get("#footnotePopup .footnote-popup-text i").should("exist");
  });

  it("gives each marker its own note", () => {
    footnotesOn();

    clickMarker(1);

    cy.get("[data-cy='footnotePopup']").should("be.visible");
    cy.get("#footnotePopup .word-popup-ref").should("have.text", "Footnote b");
    cy.get("#footnotePopup .footnote-popup-verse").should("have.text", "John 1:14");
    cy.get("#footnotePopup .footnote-popup-text")
      .invoke("text")
      .should("match", /tabernacled/);
  });

  it("resolves every marker in the chapter to a note with words in it", () => {
    footnotesOn();

    cy.get("#chapter p span.fn").then(($markers) => {
      const letters = [...$markers].map((m) => m.textContent.trim());
      expect(letters.length).to.be.greaterThan(0);
      letters.forEach((letter) => {
        cy.window().then((win) => {
          const note = win.testFootnote(letter, null);
          expect(note, "note for " + letter).to.not.be.null;
          expect(note.letter).to.equal(letter);
          expect(note.text.length).to.be.greaterThan(0);
        });
      });
    });
  });

  it("marks the letters as tappable only while the notes are on screen", () => {
    footnotesOn();
    cy.get("#chapter p span.fn")
      .first()
      .should("have.css", "cursor", "pointer");

    footnotesOff();

    cy.get("#chapter p span.fn").first().should("not.be.visible");
    cy.get("#chapter p span.fn")
      .first()
      .should("have.css", "cursor", "default");
  });

  it("does not treat a letter in the footnote block as a marker", () => {
    footnotesOn();

    // The block is at the foot of the chapter and can sit under the app's own
    // chrome, so the click is sent to the element rather than aimed at a point.
    cy.get("#chapter div.fn span.footnotesbot")
      .first()
      .then(($letter) => {
        $letter[0].click();
      });

    cy.wait(750);
    cy.get("#footnotePopup").should("not.exist");
  });

  it("closes on the close button and on Escape", () => {
    footnotesOn();

    clickMarker(0);
    cy.get("[data-cy='footnotePopup']").should("be.visible");
    cy.get("[data-cy='footnotePopupClose']").click();
    cy.get("[data-cy='footnotePopup']").should("not.be.visible");

    clickMarker(0);
    cy.get("[data-cy='footnotePopup']").should("be.visible");
    cy.get("body").type("{esc}");
    cy.get("[data-cy='footnotePopup']").should("not.be.visible");
  });

  it("puts the word popup away when a footnote opens", () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Word study links").click();
    cy.get("#chapter .word-link", { timeout: 10000 }).should("exist");
    cy.get("#chapterTitle").click();
    cy.get("#settingsDropdown").should("not.be.visible");

    footnotesOn();

    // A word first, so there is a popup on screen for the footnote to dismiss.
    cy.get("#chapter .word-link")
      .first()
      .then(($word) => {
        $word[0].click();
      });
    cy.get("[data-cy='wordPopup']", { timeout: 5000 }).should("be.visible");

    clickMarker(0);

    cy.get("[data-cy='footnotePopup']").should("be.visible");
    cy.get("[data-cy='wordPopup']").should("not.be.visible");
  });
});
