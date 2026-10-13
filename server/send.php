<?php
// Sends the day's reminders. Run once a minute by cron:
//
//   * * * * * /usr/bin/php /var/www/bible.timkoop.com/server/send.php >> /var/lib/yourcustombible/push.log 2>&1
//
// A reminder is due when it is past the reader's chosen time *in the reader's
// own timezone*, and has not already been sent on that reader's local date.
//
// The local date is stored rather than a timestamp, and that is what makes
// daylight saving harmless: an hour that repeats does not send a second
// notification, and an hour that vanishes still sends the nudge on the day.
//
//   php server/send.php --dry-run    work out what would be sent, send nothing
//   php server/send.php --reader=sub-123   just one reader, for testing

require_once __DIR__ . '/lib.php';

$options = [];
foreach (array_slice($argv, 1) as $argument) {
	if (preg_match('/^--([a-z-]+)(?:=(.*))?$/', $argument, $matches)) {
		$options[$matches[1]] = $matches[2] ?? '1';
	}
}
$dryRun = isset($options['dry-run']);
$onlyReader = $options['reader'] ?? null;

$pdo = Push::db();
$keys = Push::keys();

$statement = $pdo->prepare(
	'SELECT r.*, e.endpoint, e.p256dh, e.auth
	 FROM reminders r JOIN endpoints e ON e.id = r.endpoint_id
	 WHERE r.enabled = 1'
	 . ($onlyReader ? ' AND r.subscription_id = :reader' : '')
);
$statement->execute($onlyReader ? [':reader' => $onlyReader] : []);
$reminders = $statement->fetchAll();

$schedule = Schedule::load();

/**
 * Whether a reminder falls on this reader's weekday. "days" is empty until
 * issue #76 lands and a reader can choose which days to read on; the column
 * exists now so that adding it is a UI change rather than a migration, and so
 * that a value written by a future client is honoured rather than ignored.
 */
function isDueDay($days, $instant, $timeZone)
{
	if ($days === null || $days === '') {
		return true;
	}
	$weekday = (int) (new DateTimeImmutable($instant))
		->setTimezone(new DateTimeZone($timeZone))
		->format('w');
	return in_array((string) $weekday, explode(',', $days), true);
}

/**
 * One push. Returns the HTTP status, or null when nothing was sent.
 *
 * 404 and 410 are the push service saying the browser has gone: the
 * subscription is dead and will never deliver again, so the endpoint and
 * everything on it are removed rather than retried forever.
 */
function sendPush($keys, $endpoint, $p256dh, $auth, $payload)
{
	$body = Crypto::encrypt(
		$payload,
		['p256dh' => $p256dh, 'auth' => $auth],
		$keys['publicKey'],
		// null unless YCB_TEST_NONCE is set, in which case Crypto uses it so
		// the test's mock service can decrypt what arrived.
		Push::testNonce(),
	)['body'];

	$headers = [
		'Authorization: vapid t=' . Vapid::token($keys['privateKey'], $endpoint, Push::subject())
			. ', k=' . $keys['publicKey'],
		'Content-Type: application/octet-stream',
		'Content-Encoding: aes128gcm',
		'Content-Length: ' . strlen($body),
		'TTL: 86400',
	];

	$handle = curl_init($endpoint);
	curl_setopt_array($handle, [
		CURLOPT_POST => true,
		CURLOPT_POSTFIELDS => $body,
		CURLOPT_HTTPHEADER => $headers,
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_TIMEOUT => 20,
		CURLOPT_CONNECTTIMEOUT => 10,
	]);
	$response = curl_exec($handle);
	$status = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
	if ($response === false) {
		$status = 0;
	}
	curl_close($handle);

	return ['status' => $status, 'body' => (string) $response];
}

$sent = 0;
$skipped = 0;
$failed = 0;

foreach ($reminders as $reminder) {
	$now = Push::now();
	$timeZone = $reminder['timezone'];

	try {
		$localDate = Push::localDate($now, $timeZone);
		$localMinutes = Push::localMinutesPastMidnight($now, $timeZone);
	} catch (Exception $e) {
		Push::log("reminder {$reminder['subscription_id']} has an unusable timezone: $timeZone");
		$failed++;
		continue;
	}

	// Already sent today, for this reader, on this reader's day.
	if ($reminder['last_sent_local_date'] === $localDate) {
		$skipped++;
		continue;
	}
	// Before the chosen time.
	if ($localMinutes < Push::minutesOfDay($reminder['notify_time'])) {
		$skipped++;
		continue;
	}
	// Not a day this reader reads on.
	if (!isDueDay($reminder['days'], $now, $timeZone)) {
		// Deliberately not stamped: a skipped day is not a sent one, and the
		// reminder should still fire if the row is revisited later the same day.
		$skipped++;
		continue;
	}

	$plan = json_decode($reminder['plan_json'], true);
	if (!is_array($plan)) {
		Push::log("reminder {$reminder['subscription_id']} has an unreadable plan");
		$failed++;
		continue;
	}

	$notification = $schedule->notification(
		$plan,
		$reminder['read_order'],
		$reminder['start'],
		$localDate,
	);

	// A plan that has not started yet has nothing to remind anyone about, and
	// "nothing scheduled today - a rest day" would be a lie: there is no
	// reading under way to have a rest from.
	if ($notification['startsIn'] > 0) {
		$skipped++;
		continue;
	}

	if ($dryRun) {
		echo "[dry run] {$reminder['subscription_id']} "
			. "($localDate " . substr($reminder['notify_time'], 0, 2) . ':'
			. substr($reminder['notify_time'], 3, 2) . " $timeZone)\n"
			. "  {$notification['title']}\n"
			. "  {$notification['body']}\n";
		$sent++;
		continue;
	}

	$payload = Push::json([
		'title' => $notification['title'],
		'body' => $notification['body'],
		'data' => [
			'subscriptionId' => $reminder['subscription_id'],
			'url' => './#',
		],
	]);

	// The 4KB a push service will carry. The bodies are a sentence or two, but
	// a custom plan reading fifty scattered chapters can make a long label, and
	// a payload that is too big is rejected outright rather than trimmed.
	if (strlen($payload) > 3500) {
		$payload = Push::json([
			'title' => $notification['title'],
			'body' => (is_array($plan) && !empty($plan['name']) ? $plan['name'] : 'Plan') . ' - open the app for today',
			'data' => ['subscriptionId' => $reminder['subscription_id'], 'url' => './#'],
		]);
		Push::log("reminder {$reminder['subscription_id']} body was too long and was shortened");
	}

	try {
		$result = sendPush(
			$keys,
			$reminder['endpoint'],
			$reminder['p256dh'],
			$reminder['auth'],
			$payload,
		);
	} catch (Throwable $e) {
		Push::log("reminder {$reminder['subscription_id']} could not be prepared: " . $e->getMessage());
		$failed++;
		continue;
	}

	$status = $result['status'];

	if ($status === 201 || $status === 200 || $status === 202) {
		$mark = $pdo->prepare('UPDATE reminders SET last_sent_local_date = :date WHERE id = :id');
		$mark->execute([':date' => $localDate, ':id' => $reminder['id']]);
		Push::log("sent {$reminder['subscription_id']}: {$notification['body']}");
		$sent++;
		continue;
	}

	// The browser is gone. Take the endpoint and everything behind it with it,
	// or the loop would retry a dead subscription every minute for ever.
	if ($status === 404 || $status === 410) {
		Push::log("endpoint for {$reminder['subscription_id']} is gone ($status); removing it");
		// The reminders are deleted explicitly as well as by the cascade, so
		// that pruning does not depend on a pragma having been set on the
		// connection that happens to be doing it.
		$pdo->prepare('DELETE FROM reminders WHERE endpoint_id = :id')
			->execute([':id' => $reminder['endpoint_id']]);
		$pdo->prepare('DELETE FROM endpoints WHERE id = :id')
			->execute([':id' => $reminder['endpoint_id']]);
		continue;
	}

	// The service is telling us to slow down. Nothing is stamped, so this
	// reminder simply tries again on the next tick rather than being lost.
	Push::log("reminder {$reminder['subscription_id']} was refused with $status: " . substr($result['body'], 0, 200));
	$failed++;
}

$summary = sprintf(
	'%d sent, %d not due, %d failed (of %d reminders)',
	$sent,
	$skipped,
	$failed,
	count($reminders),
);
if (!$dryRun) {
	Push::log($summary);
} else {
	echo $summary . "\n";
}

exit($failed > 0 ? 1 : 0);