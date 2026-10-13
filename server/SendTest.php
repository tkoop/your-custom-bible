<?php
// The whole path, end to end: a reminder is registered through the real API,
// the real send script runs, and a stand-in push service decrypts what arrived.
//
//   php server/SendTest.php
//
// This is the test that would have caught the encryption being wrong in a way
// that round-tripping within Crypto alone cannot: it goes through the VAPID
// header, the body layout and the actual JSON payload a browser would show.
//
// Everything it touches is under a temporary data directory, so it neither reads
// nor writes the real key pair or database.

require_once __DIR__ . '/lib.php';

$dataDir = sys_get_temp_dir() . '/ycb-sendtest-' . random_int(1000, 9999);
putenv('YCB_DATA_DIR=' . $dataDir);
putenv('MOCK_STATE=' . $dataDir . '/mock.json');

$root = dirname(__DIR__);
$passed = 0;
$failed = 0;

function check($name, $condition, $detail = '')
{
	global $passed, $failed;
	if ($condition) {
		$passed++;
		echo "  ok   $name\n";
	} else {
		$failed++;
		echo "  FAIL $name" . ($detail ? " ($detail)" : '') . "\n";
	}
}

function results()
{
	global $dataDir;
	$state = json_decode(file_get_contents(getenv('MOCK_STATE')), true);
	return $state['results'] ?? [];
}

function resetResults()
{
	global $dataDir;
	$state = json_decode(file_get_contents(getenv('MOCK_STATE')), true);
	$state['results'] = [];
	file_put_contents(getenv('MOCK_STATE'), json_encode($state));
}

function runSend($extra = '')
{
	global $root, $dataDir;
	$command = sprintf(
		'YCB_DATA_DIR=%s YCB_TEST_NONCE=%s MOCK_STATE=%s php %s/server/send.php %s 2>&1',
		escapeshellarg($dataDir),
		escapeshellarg(getenv('YCB_TEST_NONCE')),
		escapeshellarg(getenv('MOCK_STATE')),
		escapeshellarg($root),
		escapeshellarg($extra),
	);
	return shell_exec($command);
}

// ---------- a browser's own key pair ----------

// The mock service holds the private half, as a browser's PushManager would.
// Only the public point and the auth secret are ever sent to the server.
$browser = Vapid::generateKeys();
$nonce = 'a1b2c3d4e5f60718293a4b5c';
putenv('YCB_TEST_NONCE=' . $nonce);

$state = [
	'p256dh' => Vapid::publicKeyBase64($browser['publicKey']),
	'auth' => Crypto::base64UrlEncode(random_bytes(16)),
	'nonce' => $nonce,
	'senderPublicKey' => null, // filled in below, once the server has keys
	'results' => [],
];
Push::ensureDir();
file_put_contents(getenv('MOCK_STATE'), json_encode($state));

// The server's own VAPID key pair, which the mock needs in order to decrypt:
// the sender's public key travels in the body header.
Push::keys();
$state['senderPublicKey'] = Push::publicKeyBase64();
file_put_contents(getenv('MOCK_STATE'), json_encode($state));

// ---------- the mock service ----------

$port = 8150 + random_int(0, 200);
$descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
$server = proc_open(
	sprintf('MOCK_STATE=%s php -S 127.0.0.1:%d %s', escapeshellarg(getenv('MOCK_STATE')), $port, escapeshellarg(__DIR__ . '/tests/MockPushService.php')),
	$descriptors,
	$pipes,
);
if (!is_resource($server)) {
	fwrite(STDERR, "could not start the mock service\n");
	exit(1);
}

// Wait for it to answer before anything depends on it.
$ready = false;
for ($attempt = 0; $attempt < 50; $attempt++) {
	usleep(100000);
	$probe = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
	if ($probe) {
		fclose($probe);
		$ready = true;
		break;
	}
}
if (!$ready) {
	fwrite(STDERR, "the mock service never came up\n");
	proc_terminate($server);
	exit(1);
}

$endpoint = "http://127.0.0.1:$port/send";

/** Registers a reminder through the real API, the way a browser would. */
function syncReminders($endpoint, $plan, $start, $notifyTime, $timeZone, $order = 'canonical', $id = 'sub-test')
{
	global $API;
	$state = json_decode(file_get_contents(getenv('MOCK_STATE')), true);
	$payload = [
		'reminders' => [[
			'subscriptionId' => $id,
			'plan' => $plan,
			'order' => $order,
			'start' => $start,
			'notifyTime' => $notifyTime,
			'timezone' => $timeZone,
			'days' => '',
			'subscription' => [
				'endpoint' => $endpoint,
				'keys' => ['p256dh' => $state['p256dh'], 'auth' => $state['auth']],
			],
		]],
	];
	$context = stream_context_create(['http' => [
		'method' => 'PUT',
		'header' => "Content-Type: application/json\r\n",
		'content' => json_encode($payload),
		'ignore_errors' => true,
	]]);
	return file_get_contents($API . '?action=sync', false, $context);
}

$API = "http://127.0.0.1:8099/server/push.php";

// ---------- the app's own API ----------

// The test drives the real server/push.php rather than reaching into the
// database, because the point is that a reader's browser talking to the real
// endpoint produces something the real send script can use.
$apiPort = 8300 + random_int(0, 200);
$api = proc_open(
	sprintf(
		'YCB_DATA_DIR=%s php -S 127.0.0.1:%d -t %s',
		escapeshellarg($dataDir),
		$apiPort,
		escapeshellarg($root),
	),
	$descriptors,
	$apiPipes,
);
if (!is_resource($api)) {
	fwrite(STDERR, "could not start the API\n");
	proc_terminate($server);
	exit(1);
}
for ($attempt = 0; $attempt < 50; $attempt++) {
	usleep(100000);
	$probe = @fsockopen('127.0.0.1', $apiPort, $errno, $errstr, 0.2);
	if ($probe) {
		fclose($probe);
		break;
	}
}
$API = "http://127.0.0.1:$apiPort/server/push.php";

$plan = [
	'id' => 'bible-1-chapter-a-day',
	'name' => 'Read one chapter a day from the whole Bible',
	'books' => 'all',
	'label' => 'the whole Bible',
	'pace' => 'perDay',
	'perDay' => 1,
];
$today = '2026-10-12';

// ---------- one reminder, sent ----------

echo "a reminder that is due\n";
syncReminders($endpoint, $plan, $today, '00:00', 'America/Chicago');
resetResults();
runSend();

$arrived = results();
check('one push arrived', count($arrived) === 1, 'got ' . count($arrived));

if ($arrived) {
	$push = $arrived[0];
	check('it carried a VAPID header', !empty($push['hasVapidHeader']));
	check('the token is ES256', ($push['alg'] ?? null) === 'ES256');
	check('the audience is the endpoint origin', ($push['aud'] ?? null) === 'http://127.0.0.1', var_export($push['aud'] ?? null, true));
	check('it names a contact as its subject', !empty($push['sub']), var_export($push['sub'] ?? null, true));
	check('the body is aes128gcm', ($push['contentEncoding'] ?? null) === 'aes128gcm');
	check('the browser could decrypt it', !empty($push['decrypted']), $push['error'] ?? '');
	if (!empty($push['payload'])) {
		check(
			'the title is the reminder title',
			($push['payload']['title'] ?? null) === 'Reading plan reminder',
			var_export($push['payload']['title'] ?? null, true),
		);
		check(
			'the body names the plan and today\'s chapters',
			($push['payload']['body'] ?? '') === 'Read one chapter a day from the whole Bible - today: Genesis 1',
			var_export($push['payload']['body'] ?? null, true),
		);
		check(
			'the payload points back at the subscription',
			($push['payload']['data']['subscriptionId'] ?? null) === 'sub-test',
		);
	}
}

echo "\nnot sending twice in one day\n";
resetResults();
runSend();
check('a second run sends nothing', count(results()) === 0, count(results()) . ' arrived');

echo "\na reader in another timezone\n";
// 23:30 in Auckland is still the same calendar day further west, and a
// reminder already sent there must not be sent again just because the server's
// date moved on.
syncReminders($endpoint, $plan, $today, '00:00', 'Pacific/Auckland', 'canonical', 'sub-nz');
resetResults();
runSend();
check('a reader on the other side of the date line is sent once', count(results()) === 1, count(results()) . ' arrived');

echo "\na plan that has not started\n";
syncReminders($endpoint, $plan, '2026-12-01', '00:00', 'America/Chicago', 'canonical', 'sub-future');
resetResults();
runSend();
check('nothing is sent for a plan that has not started', count(results()) === 0, count(results()) . ' arrived');

echo "\na finished plan\n";
syncReminders($endpoint, $plan, '2020-01-01', '00:00', 'America/Chicago', 'canonical', 'sub-done');
resetResults();
runSend();
$done = results();
check('a finished plan still says so', count($done) === 1, count($done) . ' arrived');
if ($done && !empty($done[0]['payload'])) {
	check(
		'and the body offers another go round',
		str_contains($done[0]['payload']['body'], 'finished'),
		$done[0]['payload']['body'],
	);
}

echo "\na reader who has turned their reminder off\n";
syncReminders($endpoint, $plan, $today, '00:00', 'America/Chicago', 'canonical', 'sub-off');
// An empty sync is what a browser sends once the reader has no reminders left.
$state = json_decode(file_get_contents(getenv('MOCK_STATE')), true);
$context = stream_context_create(['http' => [
	'method' => 'PUT',
	'header' => "Content-Type: application/json\r\n",
	'content' => json_encode(['reminders' => []]),
	'ignore_errors' => true,
]]);
file_get_contents($API . '?action=sync', false, $context);
resetResults();
runSend();
check('nothing is sent after the reminder is removed', count(results()) === 0, count(results()) . ' arrived');

echo "\na browser that has unsubscribed\n";
// /expired is the 410 a push service returns for a subscription the browser
	// has dropped. 410 is the common one, so it is the one worth proving.
	$goneEndpoint = "http://127.0.0.1:$port/expired";
syncReminders($goneEndpoint, $plan, $today, '00:00', 'America/Chicago', 'canonical', 'sub-gone');
resetResults();
runSend();
// The mock records the attempt itself, so one arrival here is the send being
// made once and refused - not a retry. What matters is that it happens only
// once and that the reminder does not survive it.
$attempts = results();
check('the push service refused it once', count($attempts) === 1 && ($attempts[0]['status'] ?? 0) === 410, json_encode($attempts));
$pdo = Push::db();
$left = $pdo->query("SELECT COUNT(*) FROM reminders WHERE subscription_id = 'sub-gone'")->fetchColumn();
check('the dead reminder is deleted', (int) $left === 0, "$left left");
$orphanEndpoint = $pdo->query("SELECT COUNT(*) FROM endpoints WHERE endpoint LIKE '%/expired'")->fetchColumn();
check('and its endpoint goes with it', (int) $orphanEndpoint === 0, "$orphanEndpoint left");
resetResults();
runSend();
check('nothing is retried to a dead endpoint', count(results()) === 0, count(results()) . ' arrived');

echo "\na push service that is asking us to slow down\n";
$refuseEndpoint = "http://127.0.0.1:$port/refuse";
syncReminders($refuseEndpoint, $plan, $today, '00:00', 'America/Chicago', 'canonical', 'sub-refused');
resetResults();
runSend();
$stillThere = $pdo->query("SELECT COUNT(*) FROM reminders WHERE subscription_id = 'sub-refused'")->fetchColumn();
check('a refused reminder is kept, not lost', (int) $stillThere === 1, "$stillThere left");
$unmarked = $pdo->query("SELECT last_sent_local_date FROM reminders WHERE subscription_id = 'sub-refused'")->fetchColumn();
check('and is not marked as sent', $unmarked === null, var_export($unmarked, true));

// ---------- tidy up ----------

proc_terminate($server);
proc_terminate($api);
foreach (array_merge($pipes, $apiPipes) as $pipe) {
	if (is_resource($pipe)) {
		fclose($pipe);
	}
}
exec('rm -rf ' . escapeshellarg($dataDir));

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);