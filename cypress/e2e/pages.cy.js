describe('template spec', () => {

  beforeEach(() => {
    cy.visit('http://localhost:8000')
  })

  it('start', () => {
    cy.contains("Genesis")
    cy.contains("50")
    cy.contains("Exodus")
    cy.get("img[src='images/banner.png']").should("be.visible")
  })

  it("index page", () => {
    cy.get("div#dropdown").should("exist")
    cy.wait(100)
    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Index").click()

    cy.contains("Genesis")
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
    cy.contains("is based on the Berean Study Bible")
  })

})