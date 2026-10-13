// Browser checks for the plan reminder UI, run against headless Chromium.
//
//   node tools/testPushUi.mjs
//
// AGENTS.md records that Xvfb is missing on this machine, so Cypress cannot
// start. These are the browser checks that would otherwise be Cypress tests:
// the bell, the time picker, and what the client sends the server.
//
// The app is served by `php -S` from the repository root rather than by the
// plain static server, so the real server/push.php answers and the sync this
// triggers is a genuine round trip rather than a stubbed fetch.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
	if (condition) {
		passed++;
		console.log(`  ok   ${name}`);
	} else {
		failed++;
		console.log(`  FAIL ${name}${detail ? ` (${detail})` : ""}`);
	}
}

const dataDir = mkdtempSync(join(tmpdir(), "ycb-ui-"));
const port = 8600 + Math.floor(Math.random() * 300);

const server = spawn(
	"php",
	["-S", `127.0.0.1:${port}`, "-t", root],
	{ env: { ...process.env, YCB_DATA_DIR: dataDir }, stdio: "ignore" },
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Give the server a moment to bind.
for (let attempt = 0; attempt < 50; attempt++) {
	await wait(100);
	try {
		await fetch(`http://127.0.0.1:${port}/public/index.html`);
		break;
	} catch (e) {}
}

const origin = `http://127.0.0.1:${port}`;
const browser = await launch();

try {
	const page = browser.page;
	await page.goto(`${origin}/public/index.html`);

	// The app is served from public/ in this test, so the API is a level up -
	// the same situation as a document root of public/ on the real server.
	await page.evaluate('window.YCB_PUSH_API = "/server/push.php"; true');
	await page.waitFor("typeof pushSync === 'function'", { label: "push.js to load" });
	await page.waitFor("typeof planSubscriptions === 'function'", {
		label: "plans.js to load",
	});

	console.log("scripts loaded");
	check("push.js is loaded", await page.evaluate("typeof pushSync === 'function'"));
	check("the API is overridable", await page.evaluate('pushApi("key").indexOf("/server/push.php") === 0'));

	// The server's key, fetched for real, through the same helper the app uses.
	const key = await page.evaluate(
		'fetch(pushApi("key")).then(r => r.json()).then(j => j.publicKey)',
	);
	check("the server returns a VAPID key of the right shape", typeof key === "string" && key.length === 87, String(key).slice(0, 20));

	// A subscription to remind about.
	await page.evaluate(`(function () {
		savePlanSubscriptions([{
			id: "sub-ui",
			planId: "bible-1-chapter-a-day",
			order: "canonical",
			start: todayDateString(),
			passes: 1,
			notifyTime: "07:20",
		}]);
		return true;
	})()`);

	console.log("\nthe payload the client would send");
	const reminders = await page.evaluate("pushReminders()");
	check("one reminder is built", Array.isArray(reminders) && reminders.length === 1);
	if (reminders && reminders.length) {
		check("it carries the chosen time", reminders[0].notifyTime === "07:20");
		check("it carries the plan", reminders[0].plan && reminders[0].plan.id === "bible-1-chapter-a-day");
		check("it carries a timezone", typeof reminders[0].timezone === "string" && reminders[0].timezone.length > 0, reminders[0].timezone);
	}

	console.log("\nthe plans page");
	await page.evaluate('window.location.hash = "#plans"; true');
	await page.waitFor('document.querySelector("[data-cy=planRow-psalms-1-chapter-a-day]") !== null', {
		label: "the plans page",
	});

	// Subscribe, so there is a second subscription row to look at. Rows are
	// addressed by subscription id, because a reader can be on the same plan
	// twice from two start dates and the plan's id does not tell them apart.
	await page.evaluate(
		'subscribeToPlan(planById("psalms-1-chapter-a-day"), "canonical", todayDateString()) !== null',
	);
	await page.waitFor(
		'document.querySelector(\'[data-subscription="sub-ui"] [data-cy=planNotify]\') !== null',
		{ label: "a subscription row" },
	);

	check(
		"a subscription row has a bell",
		await page.evaluate(
			'document.querySelector(\'[data-subscription="sub-ui"] [data-cy=planNotify]\') !== null',
		),
	);
	check(
		"the row that already has a reminder shows its time",
		await page.evaluate(
			'document.querySelector(\'[data-subscription="sub-ui"] [data-cy=planNotifyTime]\').value === "07:20"',
		),
	);

	const psalms = await page.evaluate(
		'planSubscriptions().filter(s => s.planId === "psalms-1-chapter-a-day")[0].id',
	);
	check(
		"a row with no reminder shows no time picker",
		await page.evaluate(
			`document.querySelector('[data-subscription="${psalms}"] [data-cy=planNotifyTime]') === null`,
		),
	);

	// Turn the reminder on for the second subscription. Headless Chromium on
	// http://localhost will not grant a push subscription, so the bell is
	// expected to turn itself back off rather than sit there promising a nudge
	// that cannot arrive - which is the behaviour worth checking.
	await page.evaluate(
		`document.querySelector('[data-subscription="${psalms}"] [data-cy=planNotify]').click()`,
	);
	await wait(2000);
	const afterOn = await page.evaluate(
		`planSubscriptions().filter(s => s.id === "${psalms}")[0].notifyTime || ""`,
	);
	check(
		"the bell refuses to stay on when the browser cannot subscribe",
		afterOn === "",
		`notifyTime was "${afterOn}"`,
	);
	check(
		"the other subscription's reminder is untouched",
		await page.evaluate(
			'planSubscriptions().filter(s => s.id === "sub-ui")[0].notifyTime === "07:20"',
		),
	);

	// The one thing neither suite can prove on its own: that what the client
	// sends is what the server accepts. Headless Chromium will not issue a push
	// subscription over http, so the browser's half is stood in for - and then
	// the real server/push.php has to accept the payload push.js built, fields
	// and validation included.
	console.log("\nthe client and the server agree on the payload");

	const standIn = `(function () {
		var subscription = {
			endpoint: "https://fcm.googleapis.com/fcm/send/ui-test-endpoint",
			keys: {
				p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
				auth: "8eDyX_uCN0XRhSbY5hs7Hg",
			},
		};
		navigator.serviceWorker.getRegistration = function () {
			return Promise.resolve({
				pushManager: {
					getSubscription: function () {
						return Promise.resolve({ toJSON: function () { return subscription; } });
					},
				},
			});
		};
		pushSync();
		return true;
	})()`;
	await page.evaluate(standIn);
	await wait(3000);

	// What the server kept, read from its own database rather than from
	// anything the client says about it.
	function serverRows() {
		const script = `<?php
			$p = new PDO("sqlite:${dataDir}/push.db");
			$out = [];
			foreach ($p->query("SELECT subscription_id, notify_time, timezone, plan_json FROM reminders") as $r) {
				$out[] = ["id" => $r["subscription_id"], "time" => $r["notify_time"], "tz" => $r["timezone"], "plan" => json_decode($r["plan_json"], true)["id"]];
			}
			echo json_encode($out);
		?>`;
		const file = join(dataDir, "read.php");
		writeFileSync(file, script);
		try {
			return JSON.parse(execFileSync("php", [file]).toString());
		} finally {
			rmSync(file, { force: true });
		}
	}

	const rows = serverRows();
	check("the server stored the reminder", rows.length === 1, JSON.stringify(rows));
	if (rows.length === 1) {
		check("with the right subscription", rows[0].id === "sub-ui", rows[0].id);
		check("with the chosen time", rows[0].time === "07:20", rows[0].time);
		check("and the plan it reads", rows[0].plan === "bible-1-chapter-a-day", rows[0].plan);
		check("and a timezone to send it in", typeof rows[0].tz === "string" && rows[0].tz.length > 0, rows[0].tz);
	}

} finally {
	await browser.close();
	server.kill();
	rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);