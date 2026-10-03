describe("share", () => {
  const sharePanel = () => cy.get("#sharePanel");
  const shareUrl = () => cy.get('[data-cy="shareUrl"]');

  const openShare = () => {
    cy.openAdvancedMenu();
    cy.get("#shareItem").click();
    sharePanel().should("be.visible");
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000");
    // The share component's script has to have registered its listener before
    // anything can fire shareClicked at it.
    cy.window().should("have.property", "openShare");
    cy.openChapter();
  });

  it("offers the chapter and the four settings in one link", () => {
    openShare();

    cy.get('[data-cy="shareRef"]').should("have.text", "Genesis 1");
    cy.get('[data-cy="shareTag"]').should("have.text", " (YCB-CYLP)");
    shareUrl().should(
      "have.value",
      "http://localhost:8000/#Gen-1?s=ca&n=Yahweh&c=lower&y=youpl",
    );
  });

  it("carries the settings the reader has actually chosen", () => {
    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown select#name").select("Elohim");
    cy.get("#settingsDropdown select#you").select("yall");
    // A select leaves the gear menu open, so dismiss it the way a reader would
    // before reaching for another menu.
    cy.get("#header").click("left");

    openShare();
    shareUrl().should(
      "have.value",
      "http://localhost:8000/#Gen-1?s=ca&n=Elohim&c=lower&y=yall",
    );
    cy.get('[data-cy="shareTag"]').should("have.text", " (YCB-CELV)");
  });

  it("copies the link and says so", () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, "writeText").as("writeText").resolves();
    });

    openShare();
    cy.get('[data-cy="shareCopy"]').click();

    cy.get("@writeText").should(
      "have.been.calledWith",
      "http://localhost:8000/#Gen-1?s=ca&n=Yahweh&c=lower&y=youpl",
    );
    cy.get('[data-cy="shareCopy"]').should("have.text", "Copied");
    cy.get('[data-cy="shareStatus"]').should("contain", "Link copied");
  });

  it("dismisses on Escape, on the backdrop and on the close button", () => {
    // The dialog takes the focus when it opens, which is where Escape lands.
    openShare();
    cy.get("#shareSheet").type("{esc}");
    sharePanel().should("not.be.visible");

    openShare();
    // The sheet covers the middle of the backdrop, which is the whole point of it,
// so this asks for a click Cypress would otherwise refuse to aim.
    cy.get('[data-cy="shareBackdrop"]').click({ force: true });
    sharePanel().should("not.be.visible");

    openShare();
    cy.get('[data-cy="shareClose"]').click();
    sharePanel().should("not.be.visible");
  });

  it("leaves no scroll lock behind", () => {
    openShare();
    cy.get("body").should("have.class", "share-open");
    cy.get('[data-cy="shareClose"]').click();
    cy.get("body").should("not.have.class", "share-open");
  });

  // A hash-only change is a same-document navigation, so cy.visit alone would
  // leave the app running from the previous URL; the reload is what applies
  // the settings a shared link carries.
  const visitShared = (query) => {
    cy.visit(`http://localhost:8000/#Gen-1${query}`);
    cy.reload();
    cy.get("#chapter").should("be.visible");
  };

  // The reader's own settings, set before a shared link is opened.
  const seedOwnSettings = () =>
    cy.window().then((win) => {
      win.localStorage.settings = JSON.stringify({
        spelling: "ca",
        name: "Jehovah",
        case: "lower",
        you: "you",
      });
    });

  it("opens a shared chapter as it was shared", () => {
    seedOwnSettings();

    visitShared("?s=us&n=YHWH&c=upper&y=yall");

    // The chapter reads as the sharer sees it, and says where that came from.
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-UWUV)");
    cy.get("#chapter").should("contain", "y'all");
    cy.get(".version-shared").should("be.visible");

    // The settings came from the link, so they are not the reader's own and
    // must not be written over the ones they had.
    cy.window().then((win) => {
      const stored = JSON.parse(win.localStorage.settings);
      expect(stored.name).to.eq("Jehovah");
      expect(stored.you).to.eq("you");
      expect(stored.case).to.eq("lower");
      expect(stored.spelling).to.eq("ca");
    });
  });

  it("puts the shared settings notice where the four settings would be", () => {
    visitShared("?s=us&n=YHWH&c=upper&y=yall");

    cy.get("#gearIcon").click();
    cy.get("#settingsDropdown").contains("Using shared settings").should(
      "be.visible",
    );
    // The settings are not the reader's to change while the link holds them,
    // so their rows give way to the notice; what they are is in the version tag.
    cy.get("#settingsDropdown .version-setting").should("have.length", 4);
    cy.get("#settingsDropdown .version-setting").each(($row) => {
      cy.wrap($row).should("not.be.visible");
    });
    cy.get("#settingsDropdown select#name").should("not.be.visible");

    // Nothing to decide without a link, so there is no notice to show.
    cy.get('[data-cy="discardShared"]').click();
    cy.get("#sharedNote").should("not.be.visible");
    cy.get("#settingsDropdown .version-setting").first().should("be.visible");
  });

  it("adopts the shared settings and drops the query", () => {
    seedOwnSettings();
    visitShared("?s=us&n=YHWH&c=upper&y=yall");

    cy.get("#gearIcon").click();
    cy.get('[data-cy="adoptShared"]').click();

    // The version on screen does not change - the reader is keeping it - but
    // it is theirs now, and the address bar stops claiming otherwise.
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-UWUV)");
    cy.location("hash").should("eq", "#Gen-1");
    cy.get(".version-shared").should("not.be.visible");
    cy.get("#settingsDropdown select#name").should("have.value", "YHWH");
    cy.get("#settingsDropdown select#you").should("have.value", "yall");

    // And it survives a reload, because it was written to localStorage.
    cy.reload();
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-UWUV)");
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.settings).name).to.eq("YHWH");
    });
  });

  it("discards the shared settings and keeps the reader's own", () => {
    seedOwnSettings();
    visitShared("?s=us&n=YHWH&c=upper&y=yall");

    cy.get("#gearIcon").click();
    cy.get('[data-cy="discardShared"]').click();

    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CJLY)");
    cy.location("hash").should("eq", "#Gen-1");
    cy.get(".version-shared").should("not.be.visible");
    cy.get("#settingsDropdown select#name").should("have.value", "Jehovah");
    cy.get("#settingsDropdown select#you").should("have.value", "you");

    cy.reload();
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CJLY)");
  });

  it("adopts only what the link carried", () => {
    seedOwnSettings();
    // A link need not carry all four: the ones it leaves out stay the
    // reader's own, adopted or not.
    visitShared("?n=Elohim");

    cy.get("#gearIcon").click();
    cy.get('[data-cy="adoptShared"]').click();
    cy.location("hash").should("eq", "#Gen-1");

    cy.reload();
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CELY)");
    cy.window().then((win) => {
      const stored = JSON.parse(win.localStorage.settings);
      expect(stored.name).to.eq("Elohim");
      expect(stored.you).to.eq("you");
      expect(stored.case).to.eq("lower");
    });
  });

  it("follows a shared link for the chapter already on screen", () => {
	// Same chapter, somebody else's settings: a same-document navigation, which
	// the router only hears about through popstate/hashchange.
    cy.window().then((win) => {
      win.location.hash = "#Gen-1?s=us&n=YHWH&c=upper&y=yall";
    });
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-UWUV)");
    cy.get("#chapter").should("contain", "y'all");
  });

  it("keeps the shared settings in the URL as the reading moves on", () => {
    visitShared("?s=us&n=YHWH&c=upper&y=yall");

    cy.get('[data-cy="chapterRight"]').first().click();
    cy.get("#chapter").should("contain", "Genesis 2 (YCB-UWUV)");
    cy.location("hash").should("eq", "#Gen-2?s=us&n=YHWH&c=upper&y=yall");

    // A reload of that URL comes back with the same version on screen.
    cy.reload();
    cy.get("#chapter").should("contain", "Genesis 2 (YCB-UWUV)");
  });

  it("ignores values the gear menu does not offer", () => {
    // A URL is untrusted input: settings.name is written into the page, and
    // settings.spelling into a CSS selector.
    visitShared("?s=uk&n=<img src=x onerror=alert(1)>&c=zzz&y=drop+table");

    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYLP)");
    cy.get("#chapter img").should("not.exist");
    cy.window().then((win) => {
      expect(win.settings.name).to.eq("Yahweh");
      expect(win.settings.spelling).to.eq("ca");
    });
  });
});