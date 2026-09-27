const base = "http://localhost:8000";

function openGear() {
	cy.get("#gearIcon").click();
	cy.get("#settingsDropdown").should("be.visible");
}

function waitForComponents() {
	cy.get("#dropdown div").should("have.length.greaterThan", 0);
	cy.window().should("have.property", "goToTodaysChapter");
}

function goToHistory() {
	waitForComponents();
	cy.get("#menuIcon").click();
	cy.get("#dropdown").should("be.visible");
	cy.get("#dropdown").contains("History").click();
	cy.get("#history").should("be.visible");
}

function hexToRgb(hex) {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
	return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

describe("activity types", () => {
	beforeEach(() => {
		cy.clearLocalStorage();
		cy.visit(base);
		cy.window().should("have.property", "ACTIVITY_TYPES");
		waitForComponents();
		cy.get("#home").should("be.visible");
	});

	it("lists the eight activity types in the gear dropdown", () => {
		openGear();
		cy.get("#settingsDropdown select#activity")
			.find("option")
			.should("have.length", 8)
			.then(($options) => {
				expect($options.toArray().map((o) => o.textContent)).to.deep.eq([
					"Default",
					"COTD",
					"Devotions",
					"Bible Study",
					"Church",
					"Other 1",
					"Other 2",
					"Other 3",
				]);
			});
		cy.get("#settingsDropdown select#activity").should("have.value", "default");
	});

	it("has a small activity selector on the home and index pages", () => {
		cy.get("#homeActivity [data-cy='activityPicker']").should("be.visible");
		cy.get("#homeActivity select").should("have.value", "default");

		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#dropdown").contains("Index").click();
		cy.get("#index").should("be.visible");
		cy.get("#index [data-cy='activityPicker']").should("be.visible");
		cy.get("#index select").should("have.value", "default");
	});

	it("keeps every selector in sync and stores the choice", () => {
		cy.get("#homeActivity select").select("church");

		openGear();
		cy.get("#settingsDropdown select#activity").should("have.value", "church");
		// picking an option must not close the dropdown
		cy.get("#settingsDropdown").should("be.visible");
		cy.window().then((win) => {
			expect(win.settings.activity).to.eq("church");
			expect(JSON.parse(win.localStorage.settings).activity).to.eq("church");
		});

		cy.get("#settingsDropdown select#activity").select("biblestudy");
		cy.get("#homeActivity select").should("have.value", "biblestudy");
		cy.get("#index select").should("have.value", "biblestudy");
	});

	it("tags new history entries with the selected activity", () => {
		cy.get("#homeActivity select").select("devotions");
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");

		goToHistory();
		cy.get(".history-day .history-entry").should("have.length", 1);
		cy.get(".history-entry").should("have.class", "act-devotions");
		cy.get(".history-legend-item").should("have.length", 1).and("contain", "Devotions");
	});

	it("draws history entries and the legend in the activity colour", () => {
		cy.get("#homeActivity select").select("other3");
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("2").click();
		cy.get("#chapter").should("contain", "Genesis 2 (YCB-CYL)");

		goToHistory();
		cy.window().then((win) => {
			const pill = win.document.querySelector(".history-entry");
			const swatch = win.document.querySelector(".history-legend-swatch");
			const colour = hexToRgb(
				win.getComputedStyle(pill).getPropertyValue("--activity-color"),
			);
			expect(colour).to.eq("rgb(189, 42, 110)");
			expect(win.getComputedStyle(pill).borderTopColor).to.eq(colour);
			expect(win.getComputedStyle(swatch).backgroundColor).to.eq(colour);
		});
	});

	it("keeps a legend entry for every activity used", () => {
		cy.get("#homeActivity select").select("devotions");
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");

		cy.get("#brand").click();
		cy.get("#homeActivity select").select("church");
		// the book is still open in the picker from the first read
		cy.get("#homePicker [data-cy='homeGenesis']").contains("2").click();
		cy.get("#chapter").should("contain", "Genesis 2 (YCB-CYL)");

		goToHistory();
		cy.get(".history-entry.act-devotions").should("have.length", 1);
		cy.get(".history-entry.act-church").should("have.length", 1);
		cy.get(".history-legend-item")
			.should("have.length", 2)
			.then(($items) => {
				expect($items.toArray().map((i) => i.textContent.trim())).to.deep.eq([
					"Devotions",
					"Church",
				]);
			});
	});

	it("filters the history by activity type", () => {
		cy.get("#homeActivity select").select("devotions");
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");

		cy.get("#brand").click();
		cy.get("#homeActivity select").select("church");
		// the book is still open in the picker from the first read
		cy.get("#homePicker [data-cy='homeGenesis']").contains("2").click();
		cy.get("#chapter").should("contain", "Genesis 2 (YCB-CYL)");

		goToHistory();
		cy.get(".history-entry").should("have.length", 2);
		cy.get("#historyFilterSelect option").then(($options) => {
			expect($options.toArray().map((o) => o.value)).to.deep.eq([
				"all",
				"devotions",
				"church",
			]);
		});

		cy.get("#historyFilterSelect").select("devotions");
		cy.get("#historyFilterSelect").should("have.class", "act-devotions");
		cy.get(".history-entry")
			.should("have.length", 1)
			.and("have.class", "act-devotions")
			.and("contain", "Genesis 1");

		cy.get("#historyFilterSelect").select("church");
		cy.get(".history-entry").should("have.length", 1).and("contain", "Genesis 2");

		cy.get("#historyFilterSelect").select("all");
		cy.get(".history-entry").should("have.length", 2);
	});

	it("hides days with no entries for the filtered activity", () => {
		cy.window().then((win) => {
			win.localStorage.browseHistory = JSON.stringify([
				{
					name: "Genesis",
					slug: "genesis",
					chapter: 1,
					date: "2026-09-25",
					finished: false,
					activity: "devotions",
				},
				{
					name: "John",
					slug: "john",
					chapter: 1,
					date: "2026-09-26",
					finished: false,
					activity: "church",
				},
			]);
		});
		cy.visit(base);

		goToHistory();
		cy.get(".history-entry").should("have.length", 2);
		cy.get("#historyLinks h3").should("have.length", 2);

		cy.get("#historyFilterSelect").select("devotions");
		cy.get(".history-entry").should("have.length", 1).and("contain", "Genesis 1");
		cy.get("#historyLinks h3").should("have.length", 1);
	});

	it("resumes the activity of the clicked history entry", () => {
		cy.get("#homeActivity select").select("devotions");
		cy.get("#homePicker").contains("Genesis").click();
		cy.get("#homePicker [data-cy='homeGenesis']").contains("1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");

		cy.get("#brand").click();
		cy.get("#homeActivity select").select("church");
		cy.get("#homePicker [data-cy='homeGenesis']").contains("2").click();
		cy.get("#chapter").should("contain", "Genesis 2 (YCB-CYL)");

		goToHistory();
		cy.get(".history-entry.act-devotions").contains("Genesis 1").click();
		cy.get("#chapter").should("contain", "Genesis 1 (YCB-CYL)");
		cy.window().should((win) => {
			expect(win.settings.activity).to.eq("devotions");
			expect(JSON.parse(win.localStorage.settings).activity).to.eq("devotions");
		});

		// the re-read chapter is recorded under the resumed activity
		goToHistory();
		cy.get(".history-entry.act-devotions").should("have.length", 2);
		cy.get(".history-entry.act-church").should("have.length", 1);
	});

	it("switches to COTD from the home page and keeps it for the next chapter", () => {
		cy.get("[data-cy='homeTodayButton']").click();
		cy.window().should((win) => {
			expect(win.settings.activity).to.eq("cotd");
		});

		cy.get("[data-cy='chapterRight']:first").click();
		cy.window().should((win) => {
			expect(win.settings.activity).to.eq("cotd");
		});

		goToHistory();
		cy.get(".history-entry.act-cotd").should("have.length", 2);
		cy.get(".history-legend-item").should("have.length", 1).and("contain", "COTD");
		cy.get("#homeActivity select").should("have.value", "cotd");
	});

	it("switches to COTD from the menu", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#todaysChapterItem").click();
		cy.window().should((win) => {
			expect(win.settings.activity).to.eq("cotd");
		});
	});

	it("reads history saved before activity types existed as Default", () => {
		cy.window().then((win) => {
			win.localStorage.browseHistory = JSON.stringify([
				{
					name: "Genesis",
					slug: "genesis",
					chapter: 2,
					date: "2025-01-01",
					finished: true,
				},
			]);
		});
		cy.visit(base);

		goToHistory();
		cy.get(".history-entry").should("have.class", "act-default");
		cy.get(".history-legend-item").should("contain", "Default");
		cy.contains("Genesis 2*");
	});

	it("gives every activity type a distinct colour in both themes", () => {
		cy.window().then((win) => {
			const probeColours = () => {
				const colours = {};
				win.ACTIVITY_TYPES.forEach((type) => {
					const probe = win.document.createElement("div");
					probe.className = "act-" + type.id;
					win.document.body.appendChild(probe);
					const colour = win
						.getComputedStyle(probe)
						.getPropertyValue("--activity-color")
						.trim();
					probe.remove();
					expect(colour, type.label).to.match(/^#[0-9a-f]{6}$/i);
					colours[colour] = (colours[colour] || []).concat(type.label);
				});
				return colours;
			};

			["", "dark"].forEach((mode) => {
				win.document.body.classList.toggle("dark", mode === "dark");
				const colours = probeColours();
				expect(Object.keys(colours).length, mode || "light").to.eq(8);
				const shared = Object.keys(colours).filter((c) => colours[c].length > 1);
				expect(shared, "reused colours in " + (mode || "light")).to.deep.eq([]);
			});
		});
	});
});
