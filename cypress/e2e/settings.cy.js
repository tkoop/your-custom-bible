
describe('template spec', () => {

  beforeEach(() => {
    cy.visit('http://localhost:8000')
  })

  it('titles', () => {
    cy.contains("50").click()
    cy.contains("Mourning and Burial for Jacob").should("not.be.visible")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Titles").click()

    cy.contains("Mourning and Burial for Jacob").should("be.visible")

    cy.get("div#dropdown").contains("Titles").click()

    cy.contains("Mourning and Burial for Jacob").should("not.be.visible")

  })

  it('verses', () => {
    cy.contains("50").click()
    cy.contains("Then Joseph fell")
    cy.get(".reftext").contains("7").should("not.be.visible")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Verses").click()

    cy.get(".reftext").contains("7").should("be.visible")

    cy.get("div#dropdown").contains("Verses").click()

    cy.get(".reftext").contains("7").should("not.be.visible")
  })


  it('references', () => {
    cy.contains("46").click()
    cy.contains("So Israel set out")
    cy.contains("probably including Joseph’s grandsons").should("not.be.visible")
    cy.get("span.fn").contains("b").should("not.be.visible")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")
    cy.get("div#dropdown").contains("Footnotes").click()

    cy.contains("probably including Joseph’s grandsons").should("be.visible")
    cy.get("span.fn").contains("b").should("be.visible")

    cy.get("div#dropdown").contains("Footnotes").click()

    cy.contains("probably including Joseph’s grandsons").should("not.be.visible")
    cy.get("span.fn").contains("b").should("not.be.visible")
  })

  it("spelling", () => {
    cy.get("[data-cy='2 Peter']").contains("1").click()
    cy.contains("Grace and peace be multiplied to you")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")

    // Canadian
    cy.get("div#dropdown select#spelling").select("ca")
    cy.contains("near-sighted").should("be.visible")

    // USA
    cy.get("div#dropdown select#spelling").select("us")
    cy.contains("nearsighted").should("be.visible")

    // British
    cy.get("div#dropdown select#spelling").select("gb")
    cy.contains("short-sighted").should("be.visible")
  })
  

  it("case", () => {
    cy.get("[data-cy='Proverbs']").contains("21").click()
    cy.contains("The king’s heart is a waterway in the hand of")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")

    // Lower
    cy.get("div#dropdown select#case").select("lower")
    cy.get("span.nocap").contains("righteous").should("be.visible")
    cy.get("span.nocap").contains("one").should("be.visible")
    cy.get("span.cap").contains("Righteous").should("not.be.visible")
    cy.get("span.cap").contains("One").should("not.be.visible")

    // Upper
    cy.get("div#dropdown select#case").select("upper")
    cy.get("span.cap").contains("Righteous").should("be.visible")
    cy.get("span.cap").contains("One").should("be.visible")
    cy.get("span.nocap").contains("righteous").should("not.be.visible")
    cy.get("span.nocap").contains("one").should("not.be.visible")
  })


  it.only("God's name", () => {
    cy.get("[data-cy='Proverbs']").contains("21").click()
    cy.contains("The king’s heart is a waterway in the hand of")

    cy.get("#menuIcon").should("be.visible").click()
    cy.get("div#dropdown").should("be.visible")

    cy.get("div#dropdown select#name").select("God")
    cy.get("#chapter").contains("God").should("be.visible")
    cy.get("#chapter").should("not.contain", "the LORD")
    cy.get("#chapter").should("not.contain", "Yahweh")

    cy.get("div#dropdown select#name").select("LORD")
    cy.get("#chapter").contains("the LORD").should("be.visible")
    cy.get("#chapter").should("not.contain", "God")
    cy.get("#chapter").should("not.contain", "Yahweh")

    cy.get("div#dropdown select#name").select("Yahweh")
    cy.get("#chapter").contains("Yahweh").should("be.visible")
    cy.get("#chapter").should("not.contain", "God")
    cy.get("#chapter").should("not.contain", "the LORD")
  })

})