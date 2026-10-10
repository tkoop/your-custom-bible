// Reading plans.
//
// A plan is a list of books with a name and a pace. The pace is either a
// duration to spread the chapters over, or a number of chapters a day; the
// seven built-in plans below are the common schemes, and a reader's own plans
// live alongside them in localStorage.
//
// A subscription is a plan plus a start date. Which day it is on, how far
// through it is and what to read today all fall out of those two facts, so a
// subscription stores nothing else: there is no log to keep, and a day that
// goes unread needs no catching up.

var GOSPEL_SLUGS = ["matthew", "mark", "luke", "john"];

// Matthew is where the Old Testament ends, so the plans that name half the
// Bible say so rather than listing every slug.
var NEW_TESTAMENT_SLUGS = books
	.slice(books.findIndex((book) => book.slug == "matthew"))
	.map((book) => book.slug);

// The durations offered when building a plan. A month is 30 days and a year
// 365, which is what makes "the whole Bible in a year" the 1189 chapters over
// 365 days that the plans page quotes back to the reader.
var PLAN_DURATIONS = [
	{ label: "1 month", days: 30 },
	{ label: "2 months", days: 60 },
	{ label: "3 months", days: 90 },
	{ label: "6 months", days: 180 },
	{ label: "9 months", days: 270 },
	{ label: "1 year", days: 365 },
	{ label: "18 months", days: 540 },
	{ label: "2 years", days: 730 },
	{ label: "3 years", days: 1095 },
	{ label: "4 years", days: 1460 },
];

// books: "all" or a list of book slugs. pace: "duration" (with days) or
// "perDay" (with perDay). order is the reader's choice for this plan, kept
// here so a custom plan remembers it. label says what the plan covers, because
// "the New Testament" reads better on the plans page than 27 book names.
var BUILT_IN_PLANS = [
	{
		id: "bible-1-year",
		name: "Read the whole Bible in a year",
		books: "all",
		label: "the whole Bible",
		pace: "duration",
		days: 365,
	},
	{
		id: "new-testament-1-year",
		name: "Read the New Testament in a year",
		books: NEW_TESTAMENT_SLUGS,
		label: "the New Testament",
		pace: "duration",
		days: 365,
	},
	{
		id: "gospels-1-year",
		name: "Read the Gospels in a year",
		books: GOSPEL_SLUGS,
		label: "the Gospels",
		pace: "duration",
		days: 365,
	},
	{
		id: "gospels-2-months",
		name: "Read the Gospels in 2 months",
		books: GOSPEL_SLUGS,
		label: "the Gospels",
		pace: "duration",
		days: 60,
	},
	{
		id: "bible-1-chapter-a-day",
		name: "Read one chapter a day from the whole Bible",
		books: "all",
		label: "the whole Bible",
		pace: "perDay",
		perDay: 1,
	},
	{
		id: "psalms-1-chapter-a-day",
		name: "Read one Psalm a day",
		books: ["psalm"],
		pace: "perDay",
		perDay: 1,
	},
	{
		id: "proverbs-1-chapter-a-day",
		name: "Read one Proverb a day",
		books: ["proverbs"],
		pace: "perDay",
		perDay: 1,
	},
];

// ---------- Custom plans ----------

function customPlans() {
	return JSON.parse(localStorage?.readingPlans ?? "[]");
}

function saveCustomPlans(plans) {
	localStorage.readingPlans = JSON.stringify(plans);
}

function customPlanIds() {
	return customPlans()
		.map((plan) => plan.id)
		.filter(Boolean);
}

function nextCustomPlanId() {
	// Timestamps keep two plans made in the same millisecond apart, which is as
	// likely as it sounds when a form is submitted twice.
	return "custom-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
}

function planById(id) {
	for (var i = 0; i < BUILT_IN_PLANS.length; i++) {
		if (BUILT_IN_PLANS[i].id == id) return BUILT_IN_PLANS[i];
	}
	var custom = customPlans();
	for (var j = 0; j < custom.length; j++) {
		if (custom[j].id == id) return custom[j];
	}
	return null;
}

function allPlans() {
	return BUILT_IN_PLANS.concat(customPlans());
}

// ---------- The chapters of a plan ----------

// The chronological order the app already uses for its index is the order the
// books appear in chronoChapters.json, which is a hand-kept copy (see
// AGENTS.md). Only the book order is taken from it: the file's chapter
// numbering is not a reading order - it is four chapters short of Leviticus,
// nine long of 2 Kings, and the Psalms are renumbered into superscription
// groups - and a plan that skipped chapters would be no plan at all. So both
// orders take the chapters of each book from books.js and differ only in the
// order the books come in, and the two are the same chapters either way.
var planChronoBookSlugs = null;

var planChronoReady = fetch("chronoChapters.json?version=1")
	.then((response) => response.json())
	.then(function (entries) {
		var slugs = [];
		entries.forEach(function (entry) {
			// The file spells the Psalms "Psalm" in the superscription groups.
			var name = entry.book == "Psalm" ? "Psalms" : entry.book;
			var book = books.find((candidate) => candidate.name == name);
			if (book && slugs.indexOf(book.slug) == -1) slugs.push(book.slug);
		});
		planChronoBookSlugs = slugs;
		return slugs;
	});

// A chronological plan cannot be laid out until that copy of the order has
// arrived. Rendering waits for it rather than guessing, and asking again after
// it lands costs nothing.
function whenPlanDataReady(render) {
	if (planChronoBookSlugs) render();
	else planChronoReady.then(render);
}

function planBookSlugs(plan) {
	return plan.books == "all" ? books.map((book) => book.slug) : plan.books;
}

function planOrder(plan, order) {
	return order || plan.order || "canonical";
}

function planBookList(plan, order) {
	var slugs = planBookSlugs(plan);
	var wanted = {};
	slugs.forEach((slug) => (wanted[slug] = true));
	var inPlan = books.filter((book) => wanted[book.slug]);
	if (planOrder(plan, order) != "chronological" || !planChronoBookSlugs) {
		return inPlan;
	}
	var byslug = {};
	inPlan.forEach((book) => (byslug[book.slug] = book));
	var ordered = [];
	planChronoBookSlugs.forEach((slug) => {
		if (byslug[slug]) ordered.push(byslug[slug]);
	});
	return ordered;
}

// The reading list itself: every chapter of every book in the plan, in order.
// Built once per plan and order: the pages ask for the same lists repeatedly -
// every subscription on the home page, every row on the plans page - and the
// whole Bible is 1189 chapters to walk each time. A custom plan's list changes
// when the plan is edited, so the cache is emptied then. fresh skips the cache
// for the plan being built on the page, whose book list changes as it is filled
// in and so has no stable identity to key on.
var planChapterLists = {};

function clearPlanChapterLists() {
	planChapterLists = {};
}

function planChapterList(plan, order, fresh) {
	var key = plan.id + "|" + planOrder(plan, order);
	if (!fresh && planChapterLists[key]) return planChapterLists[key];

	var chapters = [];
	planBookList(plan, order).forEach(function (book) {
		for (var chapter = 1; chapter <= book.chapters; chapter++) {
			chapters.push({
				name: book.name,
				slug: book.slug,
				chapter: chapter,
			});
		}
	});

	// A chronological list is only worth keeping once the order it needs has
	// arrived; before that it would be a canonical one filed under the wrong key.
	if (
		!fresh &&
		(planOrder(plan, order) != "chronological" || planChronoBookSlugs)
	) {
		planChapterLists[key] = chapters;
	}
	return chapters;
}

function planTotalChapters(plan, order, fresh) {
	return planChapterList(plan, order, fresh).length;
}

// A plan lasts either as long as its duration says, or for as many days as it
// takes to get through the chapters at its pace - a book list read at three
// chapters a day ends when the chapters run out, not on a date.
function planTotalDays(plan, totalChapters) {
	if (plan.pace == "perDay") {
		var count = Math.max(1, Math.floor(plan.perDay) || 1);
		return Math.max(1, Math.ceil(totalChapters / count));
	}
	return Math.max(1, Math.floor(plan.days) || 1);
}

// Where one day's reading starts and ends in the list, counted from day 0. The
// day boundaries are taken from the whole list rather than from a rounded-up
// chapters-a-day figure, so 1189 chapters over 365 days gives a day of four
// and a day of three in proportion rather than four every day and a fortnight
// off the end. The day is clamped, so the last day of the plan is the same
// range however far past it the reader is.
function planDayRange(plan, order, day) {
	var total = planTotalChapters(plan, order);
	var days = planTotalDays(plan, total);
	if (total == 0 || days < 1) return { start: 0, end: 0 };
	var clamped = Math.min(Math.max(day, 0), days - 1);
	return {
		start: Math.floor((clamped * total) / days),
		end: Math.floor(((clamped + 1) * total) / days),
	};
}

function planDayChapters(plan, order, day) {
	var range = planDayRange(plan, order, day);
	return planChapterList(plan, order).slice(range.start, range.end);
}

// A plan of "X chapters a day" says nothing about how long it lasts: one
// chapter a day through the whole Bible is 1189 days of reading, which is
// three years rather than anything a reader would recognise as a plan. So the
// length is stated alongside the pace, in days first because that is the
// number the schedule is built from, and then in the words people count in.
function planRoughSpan(days) {
	if (days >= 365) {
		var years = Math.floor(days / 365);
		var months = Math.round((days - years * 365) / 30);
		return (
			"about " +
			years +
			(years == 1 ? " year" : " years") +
			(months
				? " " + months + (months == 1 ? " month" : " months")
				: "")
		);
	}
	if (days >= 60) return "about " + Math.round(days / 30) + " months";
	return "";
}

function planLengthLabel(plan, order, fresh) {
	var total = planTotalChapters(plan, order, fresh);
	var days = planTotalDays(plan, total);
	var label = days + (days == 1 ? " day" : " days");
	var rough = planRoughSpan(days);
	return rough ? label + ", " + rough : label;
}

// The pace as the reader would say it: "3-4 chapters a day", and for a duration
// the length of it in days, because that is the other half of the promise. A
// plan with more days than chapters - the Gospels spread over a year - has days
// with nothing in them, so its pace is described by the gap instead.
function planPaceLabel(plan, order, fresh) {
	var total = planTotalChapters(plan, order, fresh);
	var days = planTotalDays(plan, total);
	var count = plan.pace == "perDay" ? Math.max(1, Math.floor(plan.perDay) || 1) : 0;
	var label;
	if (plan.pace == "perDay") {
		label = count == 1 ? "1 chapter a day" : count + " chapters a day";
	} else if (total < days) {
		var gap = Math.max(1, Math.round(days / total));
		label = gap == 1 ? "1 chapter a day" : "1 chapter every " + gap + " days";
	} else {
		var smallest = Math.floor(total / days);
		var largest = Math.ceil(total / days);
		if (smallest == largest) {
			label =
				smallest == 1 ? "1 chapter a day" : smallest + " chapters a day";
		} else {
			label = smallest + "-" + largest + " chapters a day";
		}
	}
	return plan.pace == "perDay" || days <= 1
		? label
		: label + " over " + days + " days";
}

// What the plan covers, for a reader rather than for the page. A custom plan
// has no label of its own, so it is worked out from the books: all of them,
// then one or a few by name, then a count, because a line of 27 book names is
// not a description.
function planBookLabel(plan) {
	if (plan.label) return plan.label;
	var slugs = planBookSlugs(plan);
	if (slugs.length == books.length) return "the whole Bible";
	var names = slugs.map(function (slug) {
		var book = books.find((candidate) => candidate.slug == slug);
		return book ? book.name : slug;
	});
	if (names.length == 1) return names[0];
	if (names.length <= 4) {
		return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
	}
	return names.length + " books";
}

// "Genesis 1-3, 5", for a day that stays inside one book, so a reader can see
// the shape of the day before opening it.
function planReadingsLabel(chapters) {
	var parts = [];
	var run = null;
	function close() {
		if (!run) return;
		parts.push(
			run.start == run.end
				? chapterRefName(run.name) + " " + run.start
				: chapterRefName(run.name) + " " + run.start + "-" + run.end,
		);
		run = null;
	}
	chapters.forEach(function (chapter) {
		if (run && run.name == chapter.name && chapter.chapter == run.end + 1) {
			run.end = chapter.chapter;
			return;
		}
		close();
		run = { name: chapter.name, start: chapter.chapter, end: chapter.chapter };
	});
	close();
	return parts.join(", ");
}

// ---------- The whole plan, day by day ----------

// Which of a plan's subscriptions the schedule is the one for: the most recent
// start date, since that is the reading under way. None, and the schedule is
// counted from today - a list of dates has to start somewhere, and there is
// nothing truer than now for a plan the reader has not begun.
function planCurrentSubscription(plan) {
	var subscribed = planSubscriptions().filter(function (subscription) {
		return subscription.planId == plan.id;
	});
	if (subscribed.length == 0) return null;
	return subscribed.reduce(function (later, subscription) {
		return subscription.start > later.start ? subscription : later;
	});
}

function planScheduleStart(plan) {
	var subscription = planCurrentSubscription(plan);
	return subscription ? subscription.start : todayDateString();
}

function planScheduleOrder(plan) {
	var subscription = planCurrentSubscription(plan);
	return subscription
		? subscriptionOrder(subscription)
		: planOrder(plan);
}

// Every day of a plan with the date it falls on, so a reader can see the whole
// shape of it rather than only today: the Gospels over a year is a chapter every
// four days with long stretches in between, and that is only visible in a list.
function planSchedule(plan, order, start) {
	var days = planTotalDays(plan, planTotalChapters(plan, order));
	var from = planDateFromString(start || planScheduleStart(plan));
	var schedule = [];
	for (var day = 0; day < days; day++) {
		var date = new Date(from.getTime());
		date.setDate(date.getDate() + day);
		schedule.push({
			day: day + 1,
			date: date,
			dateString: planDateString(date),
			chapters: planDayChapters(plan, order, day),
		});
	}
	return schedule;
}

// "Tue 13 Oct 2026", in the words a reader would say the day out loud. en-GB
// puts the day before the month, which is what the history page already uses.
function planDayLabel(date) {
	return date.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function planIsSubscribed(plan) {
	return planSubscriptions().some(function (subscription) {
		return subscription.planId == plan.id;
	});
}

// ---------- Subscriptions ----------

function planSubscriptions() {
	return JSON.parse(localStorage?.subscriptions ?? "[]");
}

function savePlanSubscriptions(subscriptions) {
	localStorage.subscriptions = JSON.stringify(subscriptions);
}

function subscriptionPlan(subscription) {
	return planById(subscription.planId);
}

function subscriptionOrder(subscription) {
	var plan = subscriptionPlan(subscription);
	return plan ? planOrder(plan, subscription.order) : "canonical";
}

function subscriptionTotalChapters(subscription) {
	var plan = subscriptionPlan(subscription);
	return plan ? planTotalChapters(plan, subscription.order) : 0;
}

// A "YYYY-MM-DD" day read as a local date: a subscription starts on the day it
// was made whatever timezone that was in, and a schedule walks whole days from
// there rather than adding 86400000 milliseconds to a timestamp.
function planDateFromString(start) {
	var parts = String(start || "").split("-");
	if (parts.length != 3) return null;
	var date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
	return isNaN(date.getTime()) ? null : date;
}

function planDateString(date) {
	return (
		date.getFullYear() +
		"-" +
		String(date.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(date.getDate()).padStart(2, "0")
	);
}

function planDaysSince(start) {
	var then = planDateFromString(start);
	if (!then) return 0;
	var today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((today - then) / 86400000);
}

// Everything the home card and the plans page say about where a subscription
// has got to. day is 1-based for the reader and 0-based in the list, and the
// two are both here so neither caller has to remember which is which.
function subscriptionState(subscription) {
	var plan = subscriptionPlan(subscription);
	var totalChapters = subscriptionTotalChapters(subscription);
	var totalDays = plan ? planTotalDays(plan, totalChapters) : 0;
	// The whole position comes from the start date. A pass is only a count of
	// how many times the plan has been read, kept for the card to say so;
	// continuing restarts the plan from today rather than counting a lap of a
	// calendar the reader is no longer on.
	var passes = Math.max(1, Math.floor(subscription.passes) || 1);
	var elapsed = planDaysSince(subscription.start);
	// A start date in the future is a plan the reader has lined up, not one to
	// catch up on.
	var startsIn = elapsed < 0 ? -elapsed : 0;
	// Today lands on the last day of the plan once it is over, so the plan's
	// final day is still known and still shown.
	var day = Math.min(Math.max(elapsed + 1, 1), Math.max(totalDays, 1));
	var readTo = plan
		? planDayRange(plan, subscription.order, elapsed)
		: { start: 0, end: 0 };
	return {
		passes: passes,
		totalDays: totalDays,
		totalChapters: totalChapters,
		day: day,
		startsIn: startsIn,
		complete: !!plan && elapsed >= totalDays,
		// How much of the plan the reader has been through by the end of today -
		// which is nothing at all while the plan has yet to start.
		percent: totalChapters && !startsIn
			? Math.min(100, Math.round((readTo.end / totalChapters) * 100))
			: 0,
		readTo: readTo,
		chapters:
			startsIn || !plan
				? []
				: planDayChapters(plan, subscription.order, day - 1),
	};
}

function subscriptionIsSubscribed(plan, start) {
	return planSubscriptions().some(function (subscription) {
		return subscription.planId == plan.id && subscription.start == start;
	});
}

// Subscribing twice to the same plan on the same day would put two identical
// cards on the home page, so that is the one repeat refused; the same plan from
// a different start date is a second reading of it, and gets its own card.
function subscribeToPlan(plan, order, start) {
	var when = start || todayDateString();
	if (subscriptionIsSubscribed(plan, when)) return null;
	var subscriptions = planSubscriptions();
	var subscription = {
		id:
			"sub-" +
			Date.now() +
			"-" +
			Math.floor(Math.random() * 10000),
		planId: plan.id,
		order: planOrder(plan, order),
		start: when,
		passes: 1,
	};
	subscriptions.push(subscription);
	savePlanSubscriptions(subscriptions);
	fireEvent({ name: "plansUpdated" });
	return subscription;
}

function unsubscribeFromPlan(id) {
	savePlanSubscriptions(
		planSubscriptions().filter((subscription) => subscription.id != id),
	);
	fireEvent({ name: "plansUpdated" });
}

function updateSubscription(id, changes) {
	var subscriptions = planSubscriptions();
	var changed = false;
	subscriptions.forEach(function (subscription) {
		if (subscription.id != id) return;
		Object.keys(changes).forEach(function (key) {
			if (subscription[key] == changes[key]) return;
			subscription[key] = changes[key];
			changed = true;
		});
	});
	// Nothing to save is nothing to re-read. A date input fires its change event
	// on the way to the next control, and rebuilding the list then would put a
	// fresh button under a click that has already started - swallowing it.
	if (!changed) return;
	savePlanSubscriptions(subscriptions);
	fireEvent({ name: "plansUpdated" });
}

// Another reading of the plan the reader is already on. The plan ran out on its
// own schedule - it may have finished years ago - so continuing restarts it from
// today rather than counting a lap of a calendar nobody is on, and the pass
// count is what remembers this was not the first time.
function continueSubscription(subscription) {
	updateSubscription(subscription.id, {
		start: todayDateString(),
		passes: (Math.floor(subscription.passes) || 1) + 1,
	});
}

function deleteCustomPlan(id) {
	var plan = planById(id);
	if (!plan || plan.custom !== true) return;
	saveCustomPlans(customPlans().filter((candidate) => candidate.id != id));
	// A subscription to a plan that no longer exists has nothing to read, so it
	// goes with it rather than sitting on the home page as a broken card.
	savePlanSubscriptions(
		planSubscriptions().filter((subscription) => subscription.planId != id),
	);
	clearPlanChapterLists();
	fireEvent({ name: "plansUpdated" });
}

function saveCustomPlan(plan) {
	var plans = customPlans();
	var existing = -1;
	plans.forEach(function (candidate, index) {
		if (candidate.id == plan.id) existing = index;
	});
	var stored = Object.assign({}, plan, { custom: true });
	if (existing == -1) plans.push(stored);
	else plans[existing] = stored;
	saveCustomPlans(plans);
	clearPlanChapterLists();
	fireEvent({ name: "plansUpdated" });
	return stored;
}

// Opens the first chapter of a plan's day. A day with no chapters in it is a
// rest day, which only a plan with more days than chapters produces.
function readPlanDay(subscription) {
	var state = subscriptionState(subscription);
	if (state.chapters.length == 0) return false;
	var first = state.chapters[0];
	loadThisChapter(first.name, first.slug, first.chapter);
	return true;
}