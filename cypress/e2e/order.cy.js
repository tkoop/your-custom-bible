describe("bible order picker", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000");
  });

  it("shows canonical by default and switches to chronological", () => {
    cy.contains(".index-order-button.active", "Canonical");
    cy.get("#homePicker .index-canonical").should("be.visible");
    cy.get("#homePicker .index-chronological").should("not.be.visible");

    cy.contains(".index-order-button", "Chronological").click();
    cy.contains(".index-order-button.active", "Chronological");
    cy.get("#homePicker .index-canonical").should("not.be.visible");
    cy.get("#homePicker .index-chronological").should("be.visible");

    cy.contains(".index-section-title", "From Creation to the Law");
    cy.contains(".index-section-title", "The Conquest and the Judges");
    cy.contains(".index-section-title", "The United Kingdom");
    cy.contains(".index-section-title", "From the Divided Kingdom to the Restoration");
    cy.contains(".index-section-title", "The Life of Christ");
    cy.contains(".index-section-title", "The Early Church");

    cy.get("[data-cy='homechrono-0']").should("contain", "Genesis");
    cy.get("[data-cy='homechronoChapters-0']").should("not.be.visible");
    cy.get("[data-cy='homechrono-0']").click();
    cy.get("[data-cy='homechronoChapters-0']").should("be.visible");
    cy.get("[data-cy='homechronoChapters-0']").contains("10").click();

    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYLP)");
  });

  it("remembers the chosen order", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.reload();
    cy.contains(".index-order-button.active", "Chronological");
    cy.get("#homePicker .index-chronological").should("be.visible");
    cy.get("input[data-value=order]").should("be.checked");
  });

  it("advanced menu sets and syncs the order", () => {
    cy.openChapter();
    cy.get("#advancedDropdown").should("contain", "Chronological");
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Chronological").should("be.visible");
    cy.get("#advancedDropdown input[data-value=order]").check();

    // The picker it drives is on the home page, and the advanced menu is
    // chapter-only, so the two are checked in turn.
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.get("#homePicker .index-chronological").should("be.visible");
    cy.get("#homePicker .index-canonical").should("not.be.visible");
    cy.get("#order-canonical").should("not.have.class", "active");
    cy.get("#order-chronological").should("have.class", "active");

    cy.openChapter();
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown input[data-value=order]").uncheck();
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.get("#homePicker .index-canonical").should("be.visible");
    cy.get("#homePicker .index-chronological").should("not.be.visible");
    cy.get("#order-canonical").should("have.class", "active");
  });

  it("alphabetical view has no headings and does not persist", () => {
    cy.contains(".index-order-button", "Alphabetical").click();
    cy.get("#homePicker .index-alphabetical").should("be.visible");
    cy.get("#homePicker .index-canonical").should("not.be.visible");
    cy.get("#homePicker .index-chronological").should("not.be.visible");

    // alphabetical list has no headings
    cy.get("#homePicker .index-alphabetical .index-section-title").should("not.exist");

    // first pill alphabetically is "1 Chronicles"
    cy.get("#homePicker .index-alphabetical .index-book").first().should("contain", "1 Chronicles");

    // open a book and read a chapter
    cy.get("[data-cy='homealpha-Revelation']").click();
    cy.get("[data-cy='homealphaChapters-Revelation']").contains("1").click();
    cy.get("#chapter").should("contain", "Revelation 1 (YCB-CYLP)");

    // the view stays alphabetical until reload
    cy.get("#brand").click();
    cy.contains(".index-order-button.active", "Alphabetical");

    // the saved order setting is untouched (still canonical), and reading it
    // needs a chapter because the advanced menu is chapter-only
    cy.openChapter("Genesis", "50");
    cy.get("#advancedDropdown").should("contain", "Chronological");
    cy.openAdvancedMenu();
    cy.get("input[data-value=order]").should("not.be.checked");
    cy.get("#gearIcon").click();

    // reload falls back to the saved canonical order. It restores the chapter
    // hash, so step back to the picker to look at it.
    cy.reload();
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.contains(".index-order-button.active", "Canonical");
    cy.get("#homePicker .index-canonical").should("be.visible");
    cy.get("#homePicker .index-alphabetical").should("not.be.visible");
  });

  it("shows the chronological clock icon in the right places", () => {
    // index picker button has the clock icon after the word
    cy.get("#order-chronological svg").should("exist");

    // advanced menu shows the icon after "Chronological"
    cy.openChapter();
    cy.get("#advancedDropdown").should("contain", "Chronological");
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown .chrono-label svg").should("exist");
    cy.get("#gearIcon").click();

    // canonical mode: no clock icon on the nav arrows
    cy.get("#brand").click();
    cy.openChapter("Genesis", "1");
    cy.get("body").should("not.have.class", "chrono-nav");
    cy.get(".chapter-nav .chrono-corner").should("not.be.visible");

    // chronological mode: clock icon appears in the arrow corners
    cy.get("#brand").click();
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("body").should("have.class", "chrono-nav");
    cy.get("[data-cy='homechrono-0']").click();
    cy.get("[data-cy='homechronoChapters-0']").contains("10").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYLP)");
    cy.get(".chapter-nav .chrono-corner").should("be.visible");
  });

  it("chapter arrows follow chronological order", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("[data-cy='homechrono-0']").click();
    cy.get("[data-cy='homechronoChapters-0']").contains("10").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYLP)");

    // next chronologically goes to Job 1 (Json places Job right after Gen 1-10)
    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Job 1 (YCB-CYLP)");

    // back to Genesis 10
    cy.get("[data-cy=chapterLeft]:first").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYLP)");
  });

  it("chronological arrows wrap around the sequence", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("[data-cy='homechrono-196']").click();
    cy.get("[data-cy='homechronoChapters-196']").contains("22").click();
    cy.get("#chapter").should("contain", "Revelation 22 (YCB-CYLP)");

    // next after the last chapter wraps to the first
    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYLP)");
  });

  it("canonical arrows are unchanged", () => {
    cy.contains("Genesis").click();
    cy.get("[data-cy='homeGenesis']").contains("50").click();
    cy.get("#chapter").should("contain", "Genesis 50 (YCB-CYLP)");

    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Exodus 1 (YCB-CYLP)");
  });
});