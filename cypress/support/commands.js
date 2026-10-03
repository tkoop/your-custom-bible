// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

// The gear and advanced menus only exist on a chapter page, so specs that need
// one of them open a chapter first.
Cypress.Commands.add("openChapter", (book = "Genesis", chapter = "1") => {
	cy.get("#home", { timeout: 10000 }).should("be.visible");
	// The home picker can be showing any of its three orders, and only the
	// canonical list is keyed by book name, so switch to it when it is not the
	// one on show.
	cy.get(".index-order-button.active")
		.then(($active) => {
			if (!$active.is(":contains('Canonical')"))
				cy.contains(".index-order-button", "Canonical").click();
		});
	cy.get("#homePicker .index-book")
		.contains(book)
		.then(($book) => {
			// Tapping the book toggles its chapter list, and a spec may have
			// left it open, so only tap when it is closed.
			return cy
				.get(`[data-cy='home${book}']`)
				.then(($chapters) => {
					if (!$chapters.is(":visible")) cy.wrap($book).click();
				});
		});
	cy.get(`[data-cy='home${book}']`, { timeout: 10000 })
		.contains(chapter)
		.click();
	cy.get("#chapter").should("be.visible");
	cy.get("#gearIcon").should("be.visible");
});

// The advanced settings live in their own dropdown, reached from the gear
// menu's "Advanced" item. Both routes show the same panel, so specs can pick
// whichever is less code.
Cypress.Commands.add("openAdvancedMenu", () => {
	cy.get("#gearIcon").should("be.visible").click();
	cy.get("#settingsDropdown").should("be.visible");
	cy.get("#settingsDropdown").contains("Advanced").click();
	cy.get("#advancedDropdown").should("be.visible");
});
