<?php
// Asserts that server/Schedule.php reproduces what public/plans.js says.
//
//   php server/ScheduleTest.php
//
// resources/planFixture.json is written by tools/buildPlanFixture.mjs, which
// runs the real plans.js. Every case here is one that file's answer for. If
// this test fails, plans.js has changed and the fixture has not been
// regenerated - which is the point: the port is not left to be quietly right.
//
// A case also carries its own instant and timezone, and the reader's local date
// is worked out from those before the notification is built, so the server has
// to agree about which day it is *for that reader* rather than for itself.

require_once __DIR__ . '/Schedule.php';

$root = dirname(__DIR__);
$fixture = json_decode(file_get_contents($root . '/resources/planFixture.json'), true);
if (!$fixture || !isset($fixture['cases'])) {
	fwrite(STDERR, "could not read resources/planFixture.json\n");
	exit(1);
}

$schedule = Schedule::load($root);

$passed = 0;
$failed = 0;

/**
 * The reader's own local date at an instant. The same conversion the send
 * script does, kept here so the test exercises it rather than trusting it.
 */
function localDate($instant, $timeZone)
{
	$date = new DateTimeImmutable($instant);
	$zone = new DateTimeZone($timeZone);
	return (new DateTimeFormatter())
		->format($date->setTimezone($zone));
}

class DateTimeFormatter
{
	public function format(DateTimeImmutable $date)
	{
		$months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
		$days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		unset($days);
		return sprintf(
			'%04d-%s-%s',
			(int) $date->format('Y'),
			$months[(int) $date->format('n') - 1],
			$date->format('d'),
		);
	}
}

foreach ($fixture['cases'] as $case) {
	$today = localDate($case['now'], $case['timeZone']);
	$notification = $schedule->notification(
		$case['plan'],
		$case['order'],
		$case['start'],
		$today,
	);

	if ($notification['body'] === $case['expect']['body']) {
		$passed++;
		continue;
	}

	$failed++;
	echo "  FAIL {$case['note']}\n";
	echo "         expected: {$case['expect']['body']}\n";
	echo "         got:      {$notification['body']}\n";
	if ($notification['day'] !== $case['expect']['day'] || $notification['totalDays'] !== $case['expect']['totalDays']) {
		echo "         day {$notification['day']} of {$notification['totalDays']}"
			. ", expected day {$case['expect']['day']} of {$case['expect']['totalDays']}\n";
	}
}

// A few properties that hold regardless of the fixture, and that a fixture
// alone would not catch if every case happened to miss them.

function checkProperty($name, $condition, $detail = '')
{
	global $passed, $failed;
	if ($condition) {
		$passed++;
	} else {
		$failed++;
		echo "  FAIL $name" . ($detail ? " ($detail)" : '') . "\n";
	}
}

// Each of these is a different plan, so each needs its own id: the chapter
// list is cached on id|order, exactly as it is in plans.js. Reusing one id here
// would hand back the first plan's chapters and quietly pass or fail on
// something other than what it looks like.
$wholeBible = $schedule->planChapterList(['id' => 'whole', 'books' => 'all'], 'canonical');
checkProperty('the whole Bible is 1189 chapters', count($wholeBible) === 1189, 'got ' . count($wholeBible));

// The chronological list deduplicates the superscript groups. The file in
// resources/ lists 1204 chapters; the one the browser reads lists 1189, and
// both of those have to come out here as the same 1189 chapters.
$chronoWhole = $schedule->planChapterList(['id' => 'whole-c', 'books' => 'all'], 'chronological');
checkProperty('the chronological whole Bible is also 1189 chapters', count($chronoWhole) === 1189, 'got ' . count($chronoWhole));

$canonicalPsalms = $schedule->planChapterList(['id' => 'psalms', 'books' => ['psalm']], 'canonical');
$chronoPsalms = $schedule->planChapterList(['id' => 'psalms-c', 'books' => ['psalm']], 'chronological');
checkProperty('the Psalms are 150 chapters in either order', count($canonicalPsalms) === 150 && count($chronoPsalms) === 150);

// Chronologically, Psalm 90 comes before Psalm 51 - the index's order is by
// date, not by number, and that is the whole point of it.
checkProperty(
	'the chronological Psalms are not in chapter order',
	$chronoPsalms[0]['chapter'] === 90,
	'first is Psalm ' . $chronoPsalms[0]['chapter'],
);

// Every chapter appears exactly once in either order: no duplicates, nothing
// lost.
foreach (['canonical' => $wholeBible, 'chronological' => $chronoWhole] as $order => $list) {
	$seen = [];
	foreach ($list as $chapter) {
		$seen[$chapter['slug'] . ':' . $chapter['chapter']] = true;
	}
	checkProperty("the $order whole Bible lists no chapter twice", count($seen) === 1189, 'got ' . count($seen));
}

checkProperty('Psalms is named Psalm in a label', Schedule::chapterRefName('Psalms') === 'Psalm');
checkProperty('other books keep their name', Schedule::chapterRefName('Genesis') === 'Genesis');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);