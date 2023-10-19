describe('template spec', () => {

  beforeEach(() => {
    cy.visit('http://localhost:8000')
  })

  it('page back and forth', () => {
    cy.contains("Genesis")
    cy.contains("50").click()

    // Chapter 50
    cy.contains("Genesis 50 (YCB-CYL)")
    cy.contains("Then Joseph fell")
    cy.get("[data-cy=chapterLeft]:first").click()

    // Chapter 49
    cy.get("body").should("not.contain", "Then Joseph fell")
    cy.contains("Then Jacob called for his sons")
    cy.get("[data-cy=chapterRight]:first").click()

    // Chapter 50 again
    cy.get("body").should("not.contain", "Then Jacob called for his sons")
    cy.get("[data-cy=chapterRight]:first").click()

    // Exodus 1
    cy.contains("These are the names of the sons of Israel who went to Egypt")
    cy.contains("Exodus 1 (YCB-CYL)")

  })


})