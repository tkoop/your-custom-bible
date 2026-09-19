describe('template spec', () => {

  beforeEach(() => {
    cy.visit('http://localhost:8000')
  })

  it('start', () => {
    cy.contains("Genesis")
    cy.contains("Exodus")
    cy.get("[data-cy='Genesis']").should("not.be.visible")
    cy.contains("Genesis").click()
    cy.get("[data-cy='Genesis']").should("be.visible")
    cy.contains("50")
    cy.get(".brand-title").should("contain", "Your Custom Bible")
  })

  it("index page", () => {
    cy.get("div#dropdown").should("exist")
    cy.wait(100)
    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Index").click()

    cy.contains("Genesis").click()
    cy.contains("50")
    cy.contains("Exodus")
  })

  it("history page", () => {
    cy.get("div#dropdown").should("exist")
    cy.wait(100)
    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("History").click()

    cy.contains("Genesis").should("not.be.visible")
    cy.contains("No history")
  })

  it("about page", () => {
    cy.get("div#dropdown").should("exist")
    cy.wait(100)
    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("About").click()

    cy.contains("Genesis").should("not.be.visible")
    cy.contains("is based on the Berean Standard Bible")
  })

  it("search page", () => {
    cy.get("div#dropdown").should("exist")
    cy.wait(100)
    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Search").click()

    cy.get("#searchInput").type("let there be light")
    cy.contains(".brand-title", "Your Custom Bible")
    cy.get(".search-result", { timeout: 10000 })
      .should("have.length.greaterThan", 0)
    cy.get(".search-ref").first().should("contain", "Genesis 1:3")
    cy.get(".search-result mark").should("have.length.greaterThan", 0)

    cy.get(".search-result").first().click()
    cy.wait(1000)
    cy.get("#chapter").should("contain", "Genesis 1")
  })

})