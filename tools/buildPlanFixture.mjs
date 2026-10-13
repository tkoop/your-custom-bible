// Emits resources/planFixture.json: the notification bodies the server has to
// be able to reproduce.
//
// plans.js works out what a subscription reads today, and the server has to
// agree with it exactly - otherwise a push notification contradicts the card on
// the reader's home page. PHP cannot run plans.js, so server/Schedule.php is a
// port, and a port drifts.
//
// This is the thing that stops it drifting. It runs the real plans.js and writes
// down what it says, and server/ScheduleTest.php asserts the PHP reproduces
// every case. When plans.js changes, regenerate this; if the output moves, git
// status says so, which is the same signal the other build pipelines give.
//
//   node tools/buildPlanFixture.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, "public");

// Every case is worked out against this instant, so the file does not change
// from one day to the next. 12:00 UTC is midday for nearly every zone, which
// keeps the reader's local date the same as the UTC one in the main matrix.
const NOW = "2026-10-12T12:00:00Z";

// A reader-built plan, to prove the port reads a plan it has never seen rather
// than only the seven that ship in plans.js.
const CUSTOM_PLAN = {
	id: "custom-fixture-plan",
	name: "Ruth and Psalms",
	books: ["ruth", "psalm"],
	pace: "perDay",
	perDay: 3,
	custom: true,
};

// ---------- load the app's own plans.js ----------

const context = vm.createContext({ console });

vm.runInContext(fs.readFileSync(path.join(publicDir, "books.js"), "utf8"), context, {
	filename: "books.js",
});

// The only browser global plans.js touches while it loads: it fetches the
// chronological order. Reading it off disk keeps this a pure function of the
// committed files.
context.fetch = (url) =>
	Promise.resolve({
		json: () =>
			JSON.parse(
				fs.readFileSync(
					path.join(publicDir, String(url).split("?")[0]),
					"utf8",
				),
			),
	});
context.localStorage = { readingPlans: "[]", subscriptions: "[]" };
// plans.js registers an event listener while it loads, to keep the push server
// in step with the subscriptions. Nothing here raises events, so it is a no-op
// - but it has to exist or the file will not run outside a browser at all.
context.registerEventListener = () => {};
context.fireEvent = () => {};
context.pushSupported = () => true;
context.pushSync = () => {};

vm.runInContext(fs.readFileSync(path.join(publicDir, "plans.js"), "utf8"), context, {
	filename: "plans.js",
});

await context.planChronoReady;

// ---------- pin "today" ----------

// plans.js works out where a subscription has got to by comparing its start
// date against a new Date(). Pinning that is what makes the file reproducible:
// the same commit always produces the same fixture.
const RealDate = Date;
let pinnedToday = null;

function ShimDate(...args) {
	if (args.length === 0) return new RealDate(pinnedToday);
	return new RealDate(...args);
}
ShimDate.now = () => new RealDate(pinnedToday).getTime();
ShimDate.parse = RealDate.parse;
ShimDate.UTC = RealDate.UTC;
context.Date = ShimDate;
context.Date.prototype = RealDate.prototype;

/** The reader's local date at an instant, in their own timezone. */
function localDate(instant, timeZone) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new RealDate(instant));
}

/** "YYYY-MM-DD" shifted by whole days, used to place a case on a chosen day. */
function shiftDays(dateString, days) {
	const [y, m, d] = dateString.split("-").map(Number);
	const date = new RealDate(Date.UTC(y, m - 1, d));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** The notification the server has to reproduce. Mirrors plans.js's notifyBody. */
function notification(planId, order, start, timeZone) {
	const today = localDate(NOW, timeZone);
	pinnedToday = new RealDate(`${today}T00:00:00`);
	const subscription = {
		id: "fixture",
		planId,
		order,
		start,
		passes: 1,
	};
	const plan = context.planById(planId);
	const state = context.subscriptionState(subscription);
	const name = plan ? plan.name : "Plan";
	let body;
	if (state.complete) {
		body = `${name} - finished. Ready to go round again?`;
	} else if (!state.chapters.length) {
		body = `${name} - nothing scheduled today. A rest day.`;
	} else {
		body = `${name} - today: ${context.planReadingsLabel(state.chapters)}`;
	}
	return { title: "Reading plan reminder", body, day: state.day, totalDays: state.totalDays };
}

// ---------- the cases ----------

const builtIn = vm.runInContext("BUILT_IN_PLANS", context);
const cases = [];

// Every built-in plan, both orders, at several points in it: the first days,
// a month in, and a long way past the end where the plan has finished. The
// chronological order matters as much as the canonical one - it is a different
// list of chapters, not the same list sorted differently.
const DAYS = [1, 2, 3, 7, 30, 200, 100000];

for (const plan of builtIn) {
	for (const order of ["canonical", "chronological"]) {
		// planTotalDays takes the chapter count, not the order - the two orders can
		// have different chapter lists, so the count is worked out per order
		// before the number of days follows from it.
		// planTotalDays takes the chapter count, not the order - the two orders can
		// have different chapter lists, so the count is worked out per order.
		const totalDays = vm.runInContext(
			`(function () {
				var plan = planById(${JSON.stringify(plan.id)});
				return planTotalDays(plan, planTotalChapters(plan, ${JSON.stringify(order)}));
			})()`,
			context,
		);
		for (const day of DAYS) {
			// Deliberately not clamped to the plan's length. A subscription only
			// reads as finished once today is *past* its last day, so a case
			// that stopped at the final day would never reach that branch of
			// the notification body at all.
			const start = shiftDays(NOW.slice(0, 10), -(day - 1));
			cases.push({
				note: `${plan.id} ${order} day ${day}`,
				plan,
				order,
				start,
				now: NOW,
				timeZone: "America/Chicago",
				expect: notification(plan.id, order, start, "America/Chicago"),
			});
		}
	}
}

// A plan the reader built, which the server has never seen before and can only
// handle by reading the plan it is sent. plans.js keeps those in
// localStorage.readingPlans, so that is where it goes here - without it
// planById() would not find the plan and every case below would quietly report
// "Plan" instead of the plan's name.
context.localStorage.readingPlans = JSON.stringify([CUSTOM_PLAN]);

for (const order of ["canonical", "chronological"]) {
	const start = shiftDays(NOW.slice(0, 10), -9);
	cases.push({
		note: `custom plan ${order}`,
		plan: CUSTOM_PLAN,
		order,
		start,
		now: NOW,
		timeZone: "Europe/London",
		expect: notification(CUSTOM_PLAN.id, order, start, "Europe/London"),
	});
}

// A start date in the future, which is a plan lined up rather than one to catch
// up on, and which has nothing to say for days yet.
cases.push({
	note: "starts in three days",
	plan: builtIn[0],
	order: "canonical",
	start: shiftDays(NOW.slice(0, 10), 3),
	now: NOW,
	timeZone: "America/Chicago",
	expect: notification(builtIn[0].id, "canonical", shiftDays(NOW.slice(0, 10), 3), "America/Chicago"),
});

// The same instant read in zones either side of UTC, so the server has to work
// out the reader's own date rather than assume it is the server's.
const ZONE_CASES = [
	["Pacific/Auckland", "2026-10-12T02:00:00Z", "2026-10-12"],
	["Pacific/Honolulu", "2026-10-12T12:00:00Z", "2026-10-12"],
	["America/Chicago", "2026-10-12T02:00:00Z", "2026-10-11"],
	["Europe/London", "2026-10-12T02:00:00Z", "2026-10-12"],
	["Pacific/Kiritimati", "2026-10-12T12:00:00Z", "2026-10-13"],
];
for (const [timeZone, now, expectedDate] of ZONE_CASES) {
	const start = shiftDays(expectedDate, -(5 - 1));
	const savedNow = NOW;
	const plan = builtIn[2];
	// notification() works against the fixed NOW, so this case is worked out
	// here by hand with its own instant.
	const today = localDate(now, timeZone);
	if (today !== expectedDate) {
		throw new Error(
			`${timeZone} at ${now} should read ${expectedDate} but Intl says ${today}`,
		);
	}
	pinnedToday = new RealDate(`${today}T00:00:00`);
	const state = context.subscriptionState({
		id: "fixture",
		planId: plan.id,
		order: "canonical",
		start,
		passes: 1,
	});
	const name = context.planById(plan.id).name;
	cases.push({
		note: `${timeZone} at ${now}`,
		plan,
		order: "canonical",
		start,
		now,
		timeZone,
		expect: {
			title: "Reading plan reminder",
			body: `${name} - today: ${context.planReadingsLabel(state.chapters)}`,
			day: state.day,
			totalDays: state.totalDays,
		},
	});
	// `savedNow` is not used; every case carries its own instant.
	void savedNow;
}

// ---------- write ----------

const fixture = { now: NOW, generatedFrom: "public/plans.js", cases };
fs.writeFileSync(
	path.join(root, "resources", "planFixture.json"),
	JSON.stringify(fixture, null, "\t") + "\n",
);

const restDays = cases.filter((c) => c.expect.body.includes("rest day")).length;
const finished = cases.filter((c) => c.expect.body.includes("finished")).length;
console.log(
	`wrote resources/planFixture.json: ${cases.length} cases ` +
		`(${restDays} rest days, ${finished} finished)`,
);