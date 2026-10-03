describe("advanced menu", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000");
    // #dropdown is in the static HTML, so it proves nothing: wait for the
    // advanced component's script to have registered its listeners.
    cy.window().should("have.property", "hideAdvancedMenu");
    cy.openChapter();
  });

  // The brand goes home and the lines icon opens another menu, so neither is a
  // neutral blur: this is empty header chrome, which just dismisses the menus.
  const clickAway = () => cy.get("#header").click("left");

  const gearMenu = () => cy.get("#settingsDropdown");
  const advancedMenu = () => cy.get("#advancedDropdown");
  const showAdvancedToggle = () =>
    cy.get("#advancedDropdown input[data-value='showAdvanced']");

  const advancedLabels = [
    "Activity",
    "Chronological",
    "Page Turning",
    "Word study links",
    "Font",
    "Mode",
  ];

  it("keeps the advanced settings out of the gear menu", () => {
    cy.get("#gearIcon").should("be.visible").click();
    gearMenu().should("be.visible");
    gearMenu().contains("Advanced").should("be.visible");

    // Still in the gear menu...
    gearMenu().contains("Titles").should("be.visible");

    // ...but the advanced settings live somewhere else.
    advancedLabels.forEach((label) => gearMenu().should("not.contain", label));
    gearMenu().should("not.contain", "Show advanced menu");
  });

  it("opens from the gear menu and takes its own header button with it", () => {
    cy.get("#advancedIcon").should("not.be.visible");

    cy.openAdvancedMenu();
    cy.get("#advancedIcon").should("be.visible");
    advancedLabels.forEach((label) =>
      advancedMenu().contains(label).should("be.visible")
    );
    // The reading modes live here too, and the menu is chapter-only, so they
    // are simply always listed.
    cy.get("#readToMeItem").should("be.visible");
    cy.get("#speedReadItem").should("be.visible");

    // "Show advanced menu" is off, so a click elsewhere takes the menu and the
    // button away again.
    clickAway();
    advancedMenu().should("not.be.visible");
    cy.get("#advancedIcon").should("not.be.visible");
  });

  it("keeps the button once Show advanced menu is on", () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Show advanced menu").click();
    showAdvancedToggle().should("be.checked");
    cy.get("#advancedIcon").should("be.visible");

    // A click elsewhere closes the menu but leaves the button in the header.
    clickAway();
    advancedMenu().should("not.be.visible");
    cy.get("#advancedIcon").should("be.visible");

    // ...and the button on its own opens the menu.
    cy.get("#advancedIcon").click();
    advancedMenu().should("be.visible");
    cy.get("#advancedIcon").click();
    advancedMenu().should("not.be.visible");
  });

  it("remembers Show advanced menu across a reload", () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Show advanced menu").click();
    showAdvancedToggle().should("be.checked");

    // A reload restores the chapter hash, and the button comes back with it.
    cy.reload();
    cy.get("#chapter").should("be.visible");
    cy.get("#advancedIcon").should("be.visible");

    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Show advanced menu").click();
    showAdvancedToggle().should("not.be.checked");
    clickAway();
    cy.get("#advancedIcon").should("not.be.visible");
  });

  it("is chapter-only, like the gear menu", () => {
    // Off-chapter the gear button is gone, so neither menu can be reached.
    cy.get("#menuIcon").click();
    cy.get("#dropdown").contains("Home").click();
    cy.get("#home").should("be.visible");
    cy.get("#gearIcon").should("not.be.visible");
    cy.get("#advancedIcon").should("not.be.visible");

    // Reading a chapter brings them back, and the setting survives the trip.
    cy.get("#brand").click();
    cy.get("#home").should("be.visible");
    cy.openChapter();
    cy.get("#gearIcon").should("be.visible");
  });

  it("closes when you navigate away mid-read", () => {
    cy.openAdvancedMenu();
    cy.get("#advancedDropdown").contains("Show advanced menu").click();
    showAdvancedToggle().should("be.checked");
    cy.get("#advancedIcon").should("be.visible");

    cy.get("#menuIcon").click();
    cy.get("#dropdown").contains("Home").click();
    cy.get("#home").should("be.visible");
    advancedMenu().should("not.be.visible");
    cy.get("#advancedIcon").should("not.be.visible");
  });
});
