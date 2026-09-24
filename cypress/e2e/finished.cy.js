describe("chapter finished tracking", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000");
  });

  it("marks a chapter finished only after scrolling to the end", () => {
    // load a long chapter (Psalms 119) without reaching the end
    cy.contains("Psalms").click();
    cy.get("[data-cy='Psalms']").contains("119").click();
    cy.get("#chapter").should("contain", "Psalms 119 (YCB-CYL)");

    // the stored date uses a parseable YYYY-MM-DD format, not the legacy one
    cy.then(() => {
      const history = JSON.parse(localStorage.getItem("browseHistory"));
      expect(history[0].date).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    // not finished yet: no asterisk in history
    cy.get("#menuIcon").click();
    cy.get("div#dropdown").should("be.visible");
    cy.get("div#dropdown").contains("History").click();
    cy.contains("Psalms 119");
    cy.contains("Psalms 119*").should("not.exist");
    cy.contains("* = finished to the end of the chapter");

    // go back to the chapter and scroll to the very end
    cy.go("back");
    cy.get("#chapter").should("contain", "Psalms 119 (YCB-CYL)");
    cy.scrollTo("bottom");
    cy.wait(300);

    // now history shows the asterisk
    cy.get("#menuIcon").click();
    cy.get("div#dropdown").contains("History").click();
    cy.contains("Psalms 119*");
  });

  it("migrates legacy dates (wrong year) to the current year", () => {
    cy.clearLocalStorage();
    cy.window().then((win) => {
      win.localStorage.setItem(
        "browseHistory",
        JSON.stringify([
          {
            name: "Genesis",
            slug: "genesis",
            chapter: "1",
            date: "Wed Sep 23",
            finished: false,
          },
        ])
      );
    });
    cy.reload();
    cy.get("#chapter", { timeout: 10000 }).should("contain", "Genesis 1");
    cy.wait(100);

    cy.get("#menuIcon").click();
    cy.get("div#dropdown").should("be.visible");
    cy.get("div#dropdown").contains("History").click();
    cy.get("#historyLinks").should("contain", String(new Date().getFullYear()));
    cy.get("#historyLinks").should("not.contain", "2001");
  });
});