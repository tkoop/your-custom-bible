const base = "http://localhost:8001";

function waitForComponents() {
	cy.get("#dropdown div").should("have.length.greaterThan", 0);
	cy.window().should("have.property", "planSubscriptions");
}

function openPlansPage() {
	cy.get("#menuIcon").click();
	cy.get("#dropdown").should("be.visible");
	cy.get("[data-cy='plansMenuItem']").click();
	cy.get("#plans").should("be.visible");
	cy.location("hash").should("eq", "#plans");
}

// A date the plans page's date input will take, n days back from today, in the
// reader's own timezone - the same day the app counts with.
function daysAgo(n) {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

// The same day as the plan page writes it out, so a spec can say which day a
// row is showing rather than only counting rows.
function dayLabel(n) {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

describe("reading plans", () => {
	beforeEach(() => {
		cy.clearLocalStorage();
		cy.visit(base);
		waitForComponents();
		cy.get("#home").should("be.visible");
	});

	it("offers Reading Plans in the menu, under Chapter of the Day", () => {
		cy.get("#menuIcon").click();
		cy.get("#dropdown").should("be.visible");
		cy.get("#dropdown div").then(($items) => {
			const texts = $items.toArray().map((d) => d.textContent.trim());
			expect(texts.indexOf("Chapter of the Day")).to.be.lessThan(
				texts.indexOf("Reading Plans"),
			);
			expect(texts.indexOf("Reading Plans")).to.be.lessThan(
				texts.indexOf("History"),
			);
		});
	});

	it("opens the Reading Plans page from its own hash", () => {
		cy.visit(base + "/#plans");
		waitForComponents();
		cy.get("#plans").should("be.visible");
		cy.get("#plans").contains("Reading Plans");
	});

	it("lists the seven built-in plans with what each one covers", () => {
		openPlansPage();
		cy.get("#plansBuiltInList .plans-row").should("have.length", 7);
		[
			"Read the whole Bible in a year",
			"Read the New Testament in a year",
			"Read the Gospels in a year",
			"Read the Gospels in 2 months",
			"Read one chapter a day from the whole Bible",
			"Read one Psalm a day",
			"Read one Proverb a day",
		].forEach((name) => {
			cy.get("#plansBuiltInList .plans-row").contains(name).should("exist");
		});
		cy.get("[data-cy='planRow-bible-1-year'] .plans-plan-line").should(
			"contain",
			"1189 chapters",
		);
		cy.get("[data-cy='planRow-psalms-1-chapter-a-day'] .plans-plan-line").should(
			"contain",
			"150 chapters",
		);
		cy.get("#plansSubscriptionList").should("contain", "No plans yet");
	});

	it("says how long a chapters-a-day plan takes, in small print", () => {
		openPlansPage();
		// A plan of so many chapters a day has no end date of its own, so what it
		// adds up to is stated under the pace.
		cy.get("[data-cy='planRow-bible-1-chapter-a-day'] .plans-plan-length").should(
			"have.text",
			"Takes 1189 days, about 3 years 3 months",
		);
		cy.get("[data-cy='planRow-psalms-1-chapter-a-day'] .plans-plan-length").should(
			"have.text",
			"Takes 150 days, about 5 months",
		);
		// Short enough to count in days, so it says so and leaves it there.
		cy.get("[data-cy='planRow-proverbs-1-chapter-a-day'] .plans-plan-length").should(
			"have.text",
			"Takes 31 days",
		);
		// A plan with a duration already said so in the line above it.
		cy.get("[data-cy='planRow-bible-1-year']").should(
			"contain",
			"3-4 chapters a day over 365 days",
		);
		cy.get("[data-cy='planRow-bible-1-year'] .plans-plan-length").should(
			"not.exist",
		);
	});

	it("subscribes to a plan and shows it on the home page", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planSubscribe']").click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']")
			.should("have.length", 1)
			.and("contain", "Read the whole Bible in a year")
			.and("contain", "Day 1 of 365");

		cy.get("#brand").click();
		cy.get("#home").should("be.visible");
		cy.get("#homePlans [data-cy='homePlanCard']")
			.should("have.length", 1)
			.and("contain", "Read the whole Bible in a year")
			.and("contain", "Day 1 of 365")
			.and("contain", "Genesis 1-3");
	});

	it("opens today's chapters of a plan from the home page", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-gospels-2-months'] [data-cy='planSubscribe']").click();
		cy.get("#brand").click();
		cy.get("#homePlans [data-cy='homePlanRead']").click();
		cy.get("#chapter").should("be.visible");
		cy.get("#chapter").should("contain", "Matthew 1");
		cy.location("hash").should("eq", "#Mat-1");
	});

	it("refuses a second subscription to the same plan on the same day", () => {
		openPlansPage();
		// The list is re-read after every change, so the button is asked for
		// again rather than clicked twice off one handle.
		cy.get("[data-cy='planRow-psalms-1-chapter-a-day'] [data-cy='planSubscribe']")
			.click();
		cy.get("[data-cy='planRow-psalms-1-chapter-a-day'] [data-cy='planSubscribe']")
			.click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']").should(
			"have.length",
			1,
		);
		cy.get("[data-cy='planRow-psalms-1-chapter-a-day']").should(
			"contain",
			"Subscribed",
		);
	});

	it("opens a plan on its own page, with every day and its date", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planStartDate']")
			.clear()
			.type(daysAgo(10));
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planSubscribe']").click();
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planSeeEveryDay']").click();

		cy.location("hash").should("eq", "#plan/bible-1-year");
		cy.get("#plan").should("be.visible");
		cy.get("#plan").contains("Read the whole Bible in a year");
		cy.get("#plan").should("contain", "the day it was subscribed");
		// A plan the reader is on is laid out from the day they began it, so the
		// days run from ten days ago and today is the eleventh.
		cy.get("#planDays [data-cy='planDay']").should("have.length", 365);
		cy.get("#planDays").should("contain", "Day 1");
		cy.get("#planDays [data-cy='planDay']")
			.first()
			.should("contain", dayLabel(10));
		cy.get("#planDays .plan-day-today").should("contain", dayLabel(0));
		cy.get("#planDays .plan-day-today").should("contain", "Day 11");
		cy.get("#planDays .plan-day-today").should("contain", "Genesis 33");
		cy.get("#planDays [data-cy='planDay']").last().should("contain", "Day 365");
		cy.get("#planDays [data-cy='planDay']").last().should(
			"contain",
			"Revelation 19, 20, 21, 22",
		);
	});

	it("lays out a plan nobody is on from today, rest days and all", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-gospels-1-year'] [data-cy='planSeeEveryDay']").click();
		cy.location("hash").should("eq", "#plan/gospels-1-year");
		cy.get("#plan").should("contain", "since you are not on this plan yet");
		cy.get("#planDays [data-cy='planDay']").should("have.length", 365);
		// 89 chapters over 365 days is a chapter every fourth day or so, so most
		// of the plan is days with nothing in them.
		cy.get("#planDays .plan-day-rest").should("have.length", 276);
		cy.get("#planDays .plan-day-today").should("contain", "Day 1");
		cy.get("#planDays").should("contain", "Matthew 1");
		cy.get("#planDays").should("contain", "John 21");
	});

	it("opens a day of the plan from the plan page", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-gospels-2-months'] [data-cy='planSeeEveryDay']").click();
		cy.get("#planDays [data-cy='planDay']").first().contains("Matthew 1").click();
		cy.get("#chapter").should("be.visible");
		cy.get("#chapter").should("contain", "Matthew 1");
		cy.location("hash").should("eq", "#Mat-1");
	});

	it("shows a custom plan's own days", () => {
		openPlansPage();
		cy.get("#plansNameInput").type("Gospels a day");
		["matthew", "mark", "luke", "john"].forEach((slug) =>
			cy.get(`[data-cy='plansBook-${slug}']`).check(),
		);
		cy.get("input[name=plansPace][value=perDay]").check();
		cy.get("[data-cy='plansSaveButton']").click();
		cy.get("#plansOwnList [data-cy='planSeeEveryDay']").click();
		cy.get("#plan").should("contain", "Gospels a day");
		cy.get("#planDays [data-cy='planDay']").should("have.length", 89);
		cy.get("#planDays [data-cy='planDay']").first().should("contain", "Matthew 1");
		cy.get("#planDays [data-cy='planDay']").last().should("contain", "John 21");
	});

	it("says so when the hash names no plan", () => {
		cy.visit(base + "/#plan/no-such-plan");
		waitForComponents();
		cy.get("#plan").should("be.visible");
		cy.get("#plan").should("contain", "No such plan");
		cy.get("[data-cy='planPageBack']").click();
		cy.get("#plans").should("be.visible");
	});

	it("asks for an order and a start date, then subscribes", () => {
		openPlansPage();
		// Order, then the date, then the button: the date is part of the
		// subscribe flow and defaults to today.
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planOrderSelect']")
			.should("have.value", "canonical")
			.select("chronological");
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planStartDate']").should(
			"have.value",
			daysAgo(0),
		);
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planSubscribe']").click();

		cy.get("#plansSubscriptionList [data-cy='planSubscription']")
			.should("have.length", 1)
			.and("contain", "Read the whole Bible in a year")
			.and("contain", "Chronological")
			.and("contain", "Day 1 of 365");
		// Nothing to set once it is on: the date was chosen by subscribing.
		cy.get("#plansSubscriptionList input[type='date']").should("not.exist");
	});

	it("starts a subscription on the day the reader picked", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planStartDate']")
			.clear()
			.type(daysAgo(10));
		cy.get("[data-cy='planRow-bible-1-year'] [data-cy='planSubscribe']").click();
		cy.window().then((win) => {
			expect(win.planSubscriptions()[0].start).to.eq(daysAgo(10));
		});
		cy.get("#plansSubscriptionList [data-cy='planSubscription']").should(
			"contain",
			"Day 11 of 365",
		);
		// 30 chapters in, spread over 365 days: 3.26 a day, so day 11 takes 3.
		cy.get("#plansSubscriptionList").should("contain", "Genesis 33-35");
	});

	it("says a plan is complete, and offers to go round again", () => {
		openPlansPage();
		cy.get(
			"[data-cy='planRow-proverbs-1-chapter-a-day'] [data-cy='planStartDate']",
		)
			.clear()
			.type("2020-01-01");
		cy.get(
			"[data-cy='planRow-proverbs-1-chapter-a-day'] [data-cy='planSubscribe']",
		).click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']")
			.should("contain", "Complete")
			.and("contain", "The last day was Proverbs 31");
		cy.get("[data-cy='planReadToday']").should("not.exist");

		cy.get("[data-cy='planContinue']").click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']")
			.should("contain", "Pass 2")
			.and("contain", "Day 1 of 31");
		// Continuing restarts the plan from today, however long ago it ran out.
		cy.get("#plansSubscriptionList").should("contain", "Proverbs 1");
		cy.window().then((win) => {
			expect(win.planSubscriptions()[0].start).to.eq(daysAgo(0));
		});
	});

	it("a custom plan keeps its books, pace and order, and can be subscribed to", () => {
		openPlansPage();
		cy.get("#plansNameInput").type("Front Pages");
		cy.get("[data-cy='plansBook-genesis']").check();
		cy.get("[data-cy='plansBook-exodus']").check();
		cy.get("[data-cy='plansBook-matthew']").check();
		cy.get("[data-cy='plansSummary']").should("contain", "3 books");
		cy.get("#plansDurationSelect").select("30");
		cy.get("[data-cy='plansSummary']").should(
			"contain",
			"3-4 chapters a day over 30 days",
		);
		cy.get("[data-cy='plansOrderChronological']").click();
		cy.get("[data-cy='plansSaveButton']").click();

		cy.get("#plansOwnList .plans-row").should("have.length", 1);
		cy.get("#plansOwnList .plans-row")
			.contains("Front Pages")
			.closest(".plans-row")
			.should("contain", "Genesis, Exodus and Matthew")
			.and("contain", "118 chapters");

		cy.get("#plansOwnList [data-cy='planSubscribe']").click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']")
			.should("have.length", 1)
			.and("contain", "Front Pages")
			.and("contain", "Chronological")
			.and("contain", "Day 1 of 30");
		// Chronological order puts Job second, so the first day of this plan
		// still starts at Genesis 1.
		cy.get("#plansSubscriptionList").should("contain", "Genesis 1-3");
	});

	it("asks for a name and at least one book before a plan can be saved", () => {
		openPlansPage();
		// Nothing is wrong with a form nobody has filled in yet.
		cy.get("[data-cy='plansFormError']").should("not.be.visible");
		cy.get("[data-cy='plansSaveButton']").click();
		cy.get("[data-cy='plansFormError']").should("contain", "Give the plan a name.");
		cy.get("#plansNameInput").type("Nothing");
		cy.get("[data-cy='plansSaveButton']").click();
		cy.get("[data-cy='plansFormError']").should(
			"contain",
			"Choose at least one book.",
		);
		cy.get("#plansOwnSection").should("not.be.visible");
	});

	it("edits a plan and deletes it, taking its subscriptions with it", () => {
		openPlansPage();
		cy.on("window:confirm", () => true);
		cy.get("#plansNameInput").type("Scratch");
		cy.get("[data-cy='plansBook-judges']").check();
		cy.get("[data-cy='plansSaveButton']").click();
		cy.get("#plansOwnList [data-cy='planSubscribe']").click();
		cy.get("#plansSubscriptionList [data-cy='planSubscription']").should(
			"contain",
			"Scratch",
		);

		cy.get("#plansOwnList [data-cy='planEdit']").click();
		cy.get("#plansNameInput").should("have.value", "Scratch");
		cy.get("#plansCreateHeading").should("contain", "Edit plan");
		cy.get("[data-cy='plansBook-ruth']").check();
		cy.get("[data-cy='plansSaveButton']").click();
		cy.get("#plansOwnList .plans-row").should("have.length", 1);
		cy.get("#plansOwnList").should("contain", "Judges and Ruth");

		cy.get("#plansOwnList [data-cy='planDelete']").click();
		cy.get("#plansOwnSection").should("not.be.visible");
		cy.get("#plansSubscriptionList").should("contain", "No plans yet");
	});

	it("unsubscribes and the home card goes with it", () => {
		openPlansPage();
		cy.get("[data-cy='planRow-proverbs-1-chapter-a-day'] [data-cy='planSubscribe']")
			.click();
		cy.get("#plansSubscriptionList [data-cy='planUnsubscribe']").click();
		cy.get("#plansSubscriptionList").should("contain", "No plans yet");
		cy.get("#brand").click();
		cy.get("#homePlans").should("contain", "No plans yet");
		cy.get("#homePlans [data-cy='homePlanCard']").should("not.exist");
	});

	it("spreads a fractional pace so the plan lands on its last day", () => {
		cy.window().then((win) => {
			const plan = win.planById("bible-1-year");
			expect(win.planTotalChapters(plan)).to.eq(1189);
			expect(win.planTotalDays(plan, 1189)).to.eq(365);

			// 1189 chapters over 365 days is 3.26 a day, so the days are three or
			// four rather than a rounded four every day and a fortnight left over.
			const reading = win
				.planChapterList(plan, "canonical")
				.map((c) => c.slug + ":" + c.chapter);
			const days = [];
			for (let day = 0; day < 365; day++) {
				const chapters = win.planDayChapters(plan, "canonical", day);
				expect(chapters.length).to.be.within(3, 4);
				days.push(...chapters.map((c) => c.slug + ":" + c.chapter));
			}
			// Day by day, the plan reads its own list: every chapter once, in
			// order, and the last day ends on Revelation 22.
			expect(days).to.deep.eq(reading);
			expect(new Set(days).size).to.eq(1189);
			expect(days[days.length - 1]).to.eq("revelation:22");
		});
	});

	it("a chronological plan reads the same chapters in the app's book order", () => {
		cy.window().then((win) => {
			const plan = win.planById("bible-1-year");
			const canonical = win
				.planChapterList(plan, "canonical")
				.map((c) => c.slug + ":" + c.chapter);
			const chronological = win
				.planChapterList(plan, "chronological")
				.map((c) => c.slug + ":" + c.chapter);
			// Chronological changes the order of the books, never which chapters
			// a plan covers, so a reader on either setting reads all 1189.
			expect(chronological.length).to.eq(1189);
			expect([...canonical].sort()).to.deep.eq([...chronological].sort());
			// Job is dated early in the Bible, so it comes before Exodus here.
			const job = chronological.indexOf("job:1");
			const exodus = chronological.indexOf("exodus:1");
			expect(job).to.be.lessThan(exodus);
			expect(win.planChronoBookSlugs).to.have.length(66);
		});
	});

	it("a plan with more days than chapters has rest days", () => {
		cy.window().then((win) => {
			// The 89 chapters of the Gospels spread over a year leave 276 days
			// with nothing in them, which the card has to be able to say.
			const plan = win.planById("gospels-1-year");
			const days = win.planTotalDays(plan, 89);
			expect(days).to.eq(365);
			const read = [];
			for (let day = 0; day < days; day++) {
				read.push(...win.planDayChapters(plan, "canonical", day));
			}
			expect(read.length).to.eq(89);
			expect(win.planReadingsLabel([])).to.eq("");
		});
	});
});