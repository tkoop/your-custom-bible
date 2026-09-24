describe("bible order picker", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000");
  });

  it("shows canonical by default and switches to chronological", () => {
    cy.contains(".index-order-button.active", "Canonical");
    cy.get("#canonicalSections").should("be.visible");
    cy.get("#chronoSections").should("not.be.visible");

    cy.contains(".index-order-button", "Chronological").click();
    cy.contains(".index-order-button.active", "Chronological");
    cy.get("#canonicalSections").should("not.be.visible");
    cy.get("#chronoSections").should("be.visible");

    cy.contains(".index-section-title", "From Creation to the Law");
    cy.contains(".index-section-title", "The Conquest and the Judges");
    cy.contains(".index-section-title", "The United Kingdom");
    cy.contains(".index-section-title", "From the Divided Kingdom to the Restoration");
    cy.contains(".index-section-title", "The Life of Christ");
    cy.contains(".index-section-title", "The Early Church");

    cy.get("[data-cy='chrono-0']").should("contain", "Genesis");
    cy.get("[data-cy='chronoChapters-0']").should("not.be.visible");
    cy.get("[data-cy='chrono-0']").click();
    cy.get("[data-cy='chronoChapters-0']").should("be.visible");
    cy.get("[data-cy='chronoChapters-0']").contains("10").click();

    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYL)");
  });

  it("remembers the chosen order", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.reload();
    cy.contains(".index-order-button.active", "Chronological");
    cy.get("#chronoSections").should("be.visible");
    cy.get("input[data-value=order]").should("be.checked");
  });

  it("gear menu sets and syncs the order", () => {
    cy.get("#settingsDropdown").should("contain", "Chronological");
    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown").should("be.visible");
    cy.get("#settingsDropdown").contains("Chronological").should("be.visible");
    cy.get("#settingsDropdown input[data-value=order]").check();

    cy.get("#chronoSections").should("be.visible");
    cy.get("#canonicalSections").should("not.be.visible");
    cy.get("#order-canonical").should("not.have.class", "active");
    cy.get("#order-chronological").should("have.class", "active");

    cy.get("#settingsDropdown input[data-value=order]").uncheck();
    cy.get("#canonicalSections").should("be.visible");
    cy.get("#chronoSections").should("not.be.visible");
    cy.get("#order-canonical").should("have.class", "active");
  });

  it("alphabetical view has no headings and does not persist", () => {
    cy.contains(".index-order-button", "Alphabetical").click();
    cy.get("#alphabeticalSections").should("be.visible");
    cy.get("#canonicalSections").should("not.be.visible");
    cy.get("#chronoSections").should("not.be.visible");

    // alphabetical list has no headings
    cy.get("#alphabeticalSections .index-section-title").should("not.exist");

    // first pill alphabetically is "1 Chronicles"
    cy.get("#alphabeticalSections .index-book").first().should("contain", "1 Chronicles");

    // open a book and read a chapter
    cy.get("[data-cy='alpha-Revelation']").click();
    cy.get("[data-cy='alphaChapters-Revelation']").contains("1").click();
    cy.get("#chapter").should("contain", "Revelation 1 (YCB-CYL)");

    // the view stays alphabetical until reload
    cy.get("#brand").click();
    cy.contains(".index-order-button.active", "Alphabetical");

    // the saved order setting is untouched (still canonical)
    cy.get("#settingsDropdown").should("contain", "Chronological");
    cy.get("#gearIcon").click();
    cy.get("input[data-value=order]").should("not.be.checked");
    cy.get("#gearIcon").click();

    // reload falls back to the saved canonical order
    cy.reload();
    cy.contains(".index-order-button.active", "Canonical");
    cy.get("#canonicalSections").should("be.visible");
    cy.get("#alphabeticalSections").should("not.be.visible");
  });

  it("shows the chronological clock icon in the right places", () => {
    // index picker button has the clock icon after the word
    cy.get("#order-chronological svg").should("exist");

    // gear menu shows the icon after "Chronological"
    cy.get("#settingsDropdown").should("contain", "Chronological");
    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown .chrono-label svg").should("exist");
    cy.get("#gearIcon").click();

    // canonical mode: no clock icon on the nav arrows
    cy.contains("Genesis").click();
    cy.get("[data-cy='Genesis']").contains("1").click();
    cy.get("body").should("not.have.class", "chrono-nav");
    cy.get(".chapter-nav .chrono-corner").should("not.be.visible");

    // chronological mode: clock icon appears in the arrow corners
    cy.get("#brand").click();
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("body").should("have.class", "chrono-nav");
    cy.get("[data-cy='chrono-0']").click();
    cy.get("[data-cy='chronoChapters-0']").contains("10").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYL)");
    cy.get(".chapter-nav .chrono-corner").should("be.visible");
  });

  it("chapter arrows follow chronological order", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("[data-cy='chrono-0']").click();
    cy.get("[data-cy='chronoChapters-0']").contains("10").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYL)");

    // next chronologically goes to Job 1 (Json places Job right after Gen 1-10)
    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Job 1 (YCB-CYL)");

    // back to Genesis 10
    cy.get("[data-cy=chapterLeft]:first").click();
    cy.get("#chapter").should("contain", "Genesis 10 (YCB-CYL)");
  });

  it("chronological arrows wrap around the sequence", () => {
    cy.contains(".index-order-button", "Chronological").click();
    cy.get("[data-cy='chrono-196']").click();
    cy.get("[data-cy='chronoChapters-196']").contains("22").click();
    cy.get("#chapter").should("contain", "Revelation 22 (YCB-CYL)");

    // next after the last chapter wraps to the first
    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
  });

  it("canonical arrows are unchanged", () => {
    cy.contains("Genesis").click();
    cy.get("[data-cy='Genesis']").contains("50").click();
    cy.get("#chapter").should("contain", "Genesis 50 (YCB-CYL)");

    cy.get("[data-cy=chapterRight]:first").click();
    cy.get("#chapter").should("contain", "Exodus 1 (YCB-CYL)");
  });
});