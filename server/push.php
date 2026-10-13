<?php
// The push API. Two endpoints, both same-origin so no CORS is needed.
//
//   GET server/push.php?action=key    the VAPID public key, base64url
//   PUT server/push.php?action=sync   the reader's whole set of reminders
//
// The sync is a full snapshot rather than a diff, and that is the whole
// self-healing property: anything absent from the payload is deleted. A reader
// who unsubscribes, deletes a plan, or clears their browser's storage stops
// being reminded the next time the app loads, without the server having to be
// told which of those happened.
//
//   php -S localhost:8080 -t /var/www/bible.timkoop.com
//   curl 'http://localhost:8080/server/push.php?action=key'

require_once __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// A reader's whole library of plans is small, but this is an open endpoint on a
// public site, so the cap is enforced before anything is parsed.
const MAX_BODY_BYTES = 65536;
const MAX_REMINDERS = 50;
const MAX_ENDPOINT_LENGTH = 2048;

function respond($status, $payload)
{
	http_response_code($status);
	echo Push::json($payload);
	exit;
}

/**
 * A crude fixed-window rate limit, kept in the data directory.
 *
 * This is not much of a defence - it stops a page on another site from driving
 * this in a loop by accident. It does not stop anyone who reads this file,
 * because the endpoint takes no authentication: a shared secret in the client
 * would be readable by anyone who fetched it. What actually matters is that
 * sending a push needs a browser's endpoint URL, which is not something a
 * third party can guess, and a per-device token is the fix if this endpoint
 * ever needs to stop being open.
 */
function rateLimit($limit = 120)
{
	$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
	$dir = Push::dataDir() . '/rate';
	if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
	$file = $dir . '/' . preg_replace('/[^a-f0-9]/i', '', sha1($ip)) . '.json';
	$window = time() - 60;

	$handle = @fopen($file, 'c+');
	if ($handle === false) {
		return; // if we cannot count, we still serve; a full disk should not stop reminders
	}
	flock($handle, LOCK_EX);
	$raw = stream_get_contents($handle);
	$hits = json_decode($raw, true);
	if (!is_array($hits)) {
		$hits = [];
	}
	$hits = array_values(array_filter($hits, fn($at) => $at > $window));
	if (count($hits) >= $limit) {
		flock($handle, LOCK_UN);
		fclose($handle);
		respond(429, ['error' => 'too many requests']);
	}
	$hits[] = time();
	ftruncate($handle, 0);
	rewind($handle);
	fwrite($handle, Push::json($hits));
	fflush($handle);
	flock($handle, LOCK_UN);
	fclose($handle);

	// One sweep in fifty keeps the directory from growing without a second
	// mechanism to keep a cron job for.
	if (random_int(1, 50) === 1) {
		foreach (glob($dir . '/*.json') ?: [] as $stale) {
			$at = @filemtime($stale);
			if ($at !== false && $at < $window - 300) {
				@unlink($stale);
			}
		}
	}
}

rateLimit();

$action = $_GET['action'] ?? '';

if ($action === 'key') {
	if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
		respond(405, ['error' => 'method not allowed']);
	}
	respond(200, ['publicKey' => Push::publicKeyBase64()]);
}

if ($action !== 'sync') {
	respond(404, ['error' => 'unknown action']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
	respond(405, ['error' => 'method not allowed']);
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) > MAX_BODY_BYTES) {
	respond(413, ['error' => 'payload too large']);
}

$payload = json_decode($body, true);
if (!is_array($payload) || !isset($payload['reminders']) || !is_array($payload['reminders'])) {
	respond(400, ['error' => 'expected a reminders array']);
}
if (count($payload['reminders']) > MAX_REMINDERS) {
	respond(400, ['error' => 'too many reminders']);
}

// ---------- validation ----------

/**
 * Everything is checked before it is stored, because this endpoint takes input
 * from the internet and writes it into a table the send loop later trusts. A
 * reminder with a malformed timezone or a plan with no books would otherwise
 * turn into a warning every minute for as long as the row survived.
 */
function validateReminder($reminder)
{
	if (!is_array($reminder)) {
		return 'not an object';
	}
	$subscriptionId = $reminder['subscriptionId'] ?? null;
	if (!is_string($subscriptionId) || !preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $subscriptionId)) {
		return 'subscriptionId';
	}

	$plan = $reminder['plan'] ?? null;
	if (!is_array($plan)) {
		return 'plan';
	}
	if (!isset($plan['id']) || !is_string($plan['id']) || $plan['id'] === '') {
		return 'plan.id';
	}
	if (!isset($plan['books']) || (!is_string($plan['books']) && !is_array($plan['books']))) {
		return 'plan.books';
	}
	if (is_array($plan['books'])) {
		foreach ($plan['books'] as $slug) {
			if (!is_string($slug) || !preg_match('/^[a-z0-9-]{1,40}$/', $slug)) {
				return 'plan.books';
			}
		}
	}
	if (isset($plan['pace']) && !in_array($plan['pace'], ['perDay', 'duration'], true)) {
		return 'plan.pace';
	}
	// A plan shorter than the app's own would read nothing; an absurd one is
	// almost certainly a mistake rather than a plan.
	$days = $plan['days'] ?? null;
	if ($days !== null && (!is_int($days) && !ctype_digit((string) $days))) {
		return 'plan.days';
	}
	if ($days !== null && ((int) $days < 1 || (int) $days > 36500)) {
		return 'plan.days';
	}
	$perDay = $plan['perDay'] ?? null;
	if ($perDay !== null && (!is_int($perDay) && !ctype_digit((string) $perDay))) {
		return 'plan.perDay';
	}
	if ($perDay !== null && ((int) $perDay < 1 || (int) $perDay > 1000)) {
		return 'plan.perDay';
	}

	$order = $reminder['order'] ?? 'canonical';
	if (!in_array($order, ['canonical', 'chronological'], true)) {
		return 'order';
	}

	$start = $reminder['start'] ?? null;
	if (!is_string($start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) {
		return 'start';
	}
	if (Schedule::dateFromString($start) === null) {
		return 'start';
	}

	$notifyTime = $reminder['notifyTime'] ?? '08:00';
	if (!is_string($notifyTime) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $notifyTime)) {
		return 'notifyTime';
	}

	$timeZone = $reminder['timezone'] ?? 'UTC';
	if (!is_string($timeZone)) {
		return 'timezone';
	}
	try {
		new DateTimeZone($timeZone);
	} catch (Exception $e) {
		return 'timezone';
	}

	// "days" is unused today and is here for issue #76, which is about reading on
	// chosen days of the week. Empty means every day.
	$daysOfWeek = $reminder['days'] ?? '';
	if (!is_string($daysOfWeek) || !preg_match('/^[0-6,]{0,7}$/', $daysOfWeek)) {
		return 'days';
	}

	$push = $reminder['subscription'] ?? null;
	if (!is_array($push)) {
		return 'subscription';
	}
	$endpoint = $push['endpoint'] ?? null;
	if (!is_string($endpoint) || strlen($endpoint) > MAX_ENDPOINT_LENGTH) {
		return 'subscription.endpoint';
	}
	// A push endpoint is always https. The one exception is a loopback address
	// over plain http, so the test can run a mock push service locally.
	$host = parse_url($endpoint, PHP_URL_HOST);
	$loopback = str_starts_with($endpoint, 'http://')
		&& in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
	if (!str_starts_with($endpoint, 'https://') && !$loopback) {
		return 'subscription.endpoint';
	}
	$keys = $push['keys'] ?? null;
	if (!is_array($keys)) {
		return 'subscription.keys';
	}
	foreach (['p256dh', 'auth'] as $key) {
		// 65 bytes of public key and 16 of auth, base64url: 87 and 22
		// characters. A small margin covers a browser that pads differently.
		if (!isset($keys[$key]) || !is_string($keys[$key]) || !preg_match('/^[A-Za-z0-9_-]{16,100}$/', $keys[$key])) {
			return 'subscription.keys.' . $key;
		}
	}
	if (Crypto::fromBase64Url($keys['p256dh']) === false) {
		return 'subscription.keys.p256dh';
	}

	return null;
}

$now = Push::now();
$clean = [];
foreach ($payload['reminders'] as $reminder) {
	$problem = validateReminder($reminder);
	if ($problem !== null) {
		respond(400, ['error' => 'invalid field: ' . $problem]);
	}
	$clean[] = $reminder;
}

// ---------- store ----------

$pdo = Push::db();
try {
	$pdo->beginTransaction();

	$seenSubscriptions = [];
	foreach ($clean as $reminder) {
		$subscription = $reminder['subscription'];

		// The endpoint belongs to the browser, not to the plan: three reminders
		// on one device share one subscription with the push service and are
		// delivered over the same connection.
		$statement = $pdo->prepare(
			'SELECT id FROM endpoints WHERE endpoint = :endpoint'
		);
		$statement->execute([':endpoint' => $subscription['endpoint']]);
		$endpointId = $statement->fetchColumn();

		if ($endpointId === false) {
			$insert = $pdo->prepare(
				'INSERT INTO endpoints (endpoint, p256dh, auth, created_at, last_seen_at)
				 VALUES (:endpoint, :p256dh, :auth, :now, :now)'
			);
			$insert->execute([
				':endpoint' => $subscription['endpoint'],
				':p256dh' => $subscription['keys']['p256dh'],
				':auth' => $subscription['keys']['auth'],
				':now' => $now,
			]);
			$endpointId = $pdo->lastInsertId();
		} else {
			// The same browser can rotate its keys without changing endpoint.
			$update = $pdo->prepare(
				'UPDATE endpoints SET p256dh = :p256dh, auth = :auth, last_seen_at = :now
				 WHERE id = :id'
			);
			$update->execute([
				':p256dh' => $subscription['keys']['p256dh'],
				':auth' => $subscription['keys']['auth'],
				':now' => $now,
				':id' => $endpointId,
			]);
		}

		$statement = $pdo->prepare(
			'SELECT id, last_sent_local_date FROM reminders WHERE subscription_id = :id'
		);
		$statement->execute([':id' => $reminder['subscriptionId']]);
		$existing = $statement->fetch();

		// A reminder that has been moved to a different time, or whose plan
		// changed, has not been sent today for the new reading - so its
		// last-sent mark is cleared and the nudge can come again.
		$changed = $existing === false
			|| $existing['last_sent_local_date'] === null;
		if ($existing !== false) {
			$check = $pdo->prepare(
				'SELECT notify_time, start, plan_json FROM reminders WHERE id = :id'
			);
			$check->execute([':id' => $existing['id']]);
			$before = $check->fetch();
			$changed = $changed
				|| $before['notify_time'] !== $reminder['notifyTime']
				|| $before['start'] !== $reminder['start']
				|| $before['plan_json'] !== Push::json($reminder['plan']);
		}

		if ($existing === false) {
			$insert = $pdo->prepare(
				'INSERT INTO reminders
				 (subscription_id, endpoint_id, plan_json, read_order, start, notify_time,
				  timezone, days, enabled, last_sent_local_date, created_at, updated_at)
				 VALUES (:subscriptionId, :endpointId, :plan, :order, :start, :notifyTime,
				         :timezone, :days, 1, NULL, :now, :now)'
			);
			$insert->execute([
				':subscriptionId' => $reminder['subscriptionId'],
				':endpointId' => $endpointId,
				':plan' => Push::json($reminder['plan']),
				':order' => $reminder['order'],
				':start' => $reminder['start'],
				':notifyTime' => $reminder['notifyTime'],
				':timezone' => $reminder['timezone'],
				':days' => $reminder['days'] ?? '',
				':now' => $now,
			]);
		} else {
			$update = $pdo->prepare(
				'UPDATE reminders
				 SET endpoint_id = :endpointId, plan_json = :plan, read_order = :order,
				     start = :start, notify_time = :notifyTime, timezone = :timezone,
				     days = :days, enabled = 1, updated_at = :now
				     ' . ($changed ? ', last_sent_local_date = NULL' : '') . '
				 WHERE id = :id'
			);
			$update->execute([
				':endpointId' => $endpointId,
				':plan' => Push::json($reminder['plan']),
				':order' => $reminder['order'],
				':start' => $reminder['start'],
				':notifyTime' => $reminder['notifyTime'],
				':timezone' => $reminder['timezone'],
				':days' => $reminder['days'] ?? '',
				':now' => $now,
				':id' => $existing['id'],
			]);
		}

		$seenSubscriptions[] = $reminder['subscriptionId'];
	}

	// Anything the reader no longer has is a reminder they have turned off.
	// Deleting by absence is what makes the sync self-healing: unsubscribing,
	// deleting a custom plan, or clearing localStorage all land here.
	$stale = $pdo->prepare('SELECT id, subscription_id FROM reminders');
	$stale->execute();
	foreach ($stale->fetchAll() as $row) {
		if (!in_array($row['subscription_id'], $seenSubscriptions, true)) {
			$pdo->prepare('DELETE FROM reminders WHERE id = :id')->execute([':id' => $row['id']]);
		}
	}

	// And an endpoint with no reminders left on it is a browser that has
	// unsubscribed from us; keeping it would only leave a row to go stale.
	$pdo->exec('DELETE FROM endpoints WHERE id NOT IN (SELECT endpoint_id FROM reminders)');

	$pdo->commit();
} catch (Throwable $e) {
	if ($pdo->inTransaction()) {
		$pdo->rollBack();
	}
	Push::log('sync failed: ' . $e->getMessage());
	respond(500, ['error' => 'could not store the reminders']);
}

$count = $pdo->query('SELECT COUNT(*) FROM reminders')->fetchColumn();
Push::log('sync stored ' . count($clean) . ' reminder(s), ' . $count . ' in total');
respond(200, ['ok' => true, 'stored' => count($clean)]);