describe("speed reader optimal recognition position", () => {
  const channels = (colour) => colour.match(/\d+/g).slice(0, 3).map(Number);
  const luminance = (rgb) =>
    rgb
      .map((channel) => channel / 255)
      .map((value) =>
        value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (total, value, index) =>
          total + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const contrast = (a, b) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort(
      (x, y) => y - x,
    );
    return (lighter + 0.05) / (darker + 0.05);
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("http://localhost:8000/#Gen-1");
    cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
    cy.window().then((win) => win.document.fonts.ready);
  });

  const openSpeedReader = () => {
    cy.window().then((win) => win.fireEvent({ name: "dotIconClicked" }));
    cy.get("#speedReader").should("be.visible");
    cy.get("#speedWord .orp", { timeout: 5000 }).should("exist");
    cy.get("#pausePlayBtn").click();
  };

  it("highlights one character of the word in a different colour", () => {
    openSpeedReader();

    cy.get("#speedWord").then(($word) => {
      const word = $word[0];
      const orp = word.querySelector(".orp");
      const text = word.textContent;
      const orpColour = channels(getComputedStyle(orp).color);
      const wordColour = channels(getComputedStyle(word).color);
      const surface = channels(
        getComputedStyle(orp.closest("#speedReader")).backgroundColor,
      );

      expect(text).to.match(/\S/);
      expect(orp.textContent).to.have.length(1);
      expect(text).to.contain(orp.textContent);
      expect(orpColour).to.not.deep.equal(wordColour);
      // 48px text only needs 3:1 against its background, but the point of the
      // colour is to stand out from the letters either side of it
      expect(contrast(orpColour, surface)).to.be.greaterThan(3);
      expect(contrast(orpColour, wordColour)).to.be.greaterThan(2);
    });
  });

  it("holds the highlighted character on the centre of the reader", () => {
    openSpeedReader();

    cy.get("#speedWord").then(($word) => {
      const orpBox = $word[0].querySelector(".orp").getBoundingClientRect();
      const frameBox = $word[0]
        .closest("#speedWordFrame")
        .getBoundingClientRect();

      expect(
        Math.abs(
          orpBox.left + orpBox.width / 2 - (frameBox.left + frameBox.width / 2),
        ),
      ).to.be.lessThan(1);
    });
  });

  it("reads every word of the chapter from that same focal point", () => {
    openSpeedReader();

    cy.window().then((win) => {
      const element = win.document.getElementById("speedWord");
      const frameBox = win.document
        .getElementById("speedWordFrame")
        .getBoundingClientRect();
      const centre = frameBox.left + frameBox.width / 2;
      let worst = 0;

      win.eval("words").forEach((word) => {
        win.showWord(word);
        const orpBox = element.querySelector(".orp").getBoundingClientRect();
        worst = Math.max(
          worst,
          Math.abs(orpBox.left + orpBox.width / 2 - centre),
        );
      });

      expect(worst).to.be.lessThan(1);
    });
  });

  it("sizes the reader so no word hangs outside it", () => {
    openSpeedReader();

    cy.window().then((win) => {
      const element = win.document.getElementById("speedWord");
      const reader = win.document.getElementById("speedReader");
      let tightest = Infinity;

      win.eval("words").forEach((word) => {
        win.showWord(word);
        const wordBox = element.getBoundingClientRect();
        const readerBox = reader.getBoundingClientRect();
        tightest = Math.min(
          tightest,
          wordBox.left - readerBox.left,
          readerBox.right - wordBox.right,
        );
      });

      expect(tightest).to.be.greaterThan(0);
    });
  });

  it("keeps the word clear of the play button", () => {
    openSpeedReader();

    cy.window().then((win) => {
      const element = win.document.getElementById("speedWord");
      const buttonBox = win.document
        .getElementById("pausePlayBtn")
        .getBoundingClientRect();

      win.showWord("generations");
      expect(element.getBoundingClientRect().bottom).to.be.lessThan(
        buttonBox.top,
      );
    });
  });

  it("reads the word from a letter slightly left of its middle", () => {
    cy.window().then((win) => {
      const orp = (word) => win.eval(`orpPosition(${JSON.stringify(word)})`);

      expect(orp("I")).to.equal(0);
      expect(orp("of")).to.equal(1);
      expect(orp("the")).to.equal(1);
      expect(orp("earth")).to.equal(1);
      expect(orp("heavens")).to.equal(2);
      expect(orp("beginning")).to.equal(2);
      expect(orp("generation")).to.equal(3);
      expect(orp("generation,")).to.equal(3);
      expect(orp("contemporaries")).to.equal(4);
      expect(orp('("God")')).to.equal(3);
      expect(orp("—")).to.equal(0);
    });
  });
});
