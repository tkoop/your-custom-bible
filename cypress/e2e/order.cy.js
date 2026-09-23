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