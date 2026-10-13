<?php
// A stand-in push service, for the tests.
//
// It behaves like the real thing about as far as matters: it expects a POST
// carrying a VAPID Authorization header and an aes128gcm body, and it decrypts
// the payload with the private key half of the subscription it was set up with.
// So a test can assert on what a browser would actually have received, rather
// than on what we meant to send - which is the only way to be sure the
// hand-rolled crypto survives a round trip through the whole server.
//
// Its state is a JSON file named by MOCK_STATE. Run it as:
//
//   MOCK_STATE=/tmp/state.json php -S 127.0.0.1:8100 server/tests/MockPushService.php
//
// /gone and /expired answer the way a push service does when a browser has
// unsubscribed, so the pruning of dead endpoints can be tested for real.

require_once __DIR__ . '/../Crypto.php';

$stateFile = getenv('MOCK_STATE') ?: '/tmp/mock.json';
$state = json_decode(file_get_contents($stateFile), true);
if (!$state) {
	http_response_code(500);
	echo 'no state';
	exit;
}

/** Records what arrived, appending to the state file so a test can read it. */
function record($stateFile, $state, $entry)
{
	$results = $state['results'] ?? [];
	$results[] = $entry;
	$state['results'] = $results;
	file_put_contents($stateFile, json_encode($state));
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($path === '/gone' || $path === '/expired') {
	$status = $path === '/gone' ? 404 : 410;
	record($stateFile, $state, ['path' => $path, 'status' => $status]);
	http_response_code($status);
	echo 'gone';
	exit;
}

if ($path === '/refuse') {
	record($stateFile, $state, ['path' => $path, 'status' => 429]);
	http_response_code(429);
	echo 'slow down';
	exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
	http_response_code(405);
	exit;
}

$entry = ['path' => $path];

// "Authorization: vapid t=<jwt>, k=<public key>"
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$entry['hasVapidHeader'] = (bool) preg_match('/^vapid t=.+, k=.+$/', $authorization);

if (preg_match('/^vapid t=([^,]+), k=(.+)$/', $authorization, $matches)) {
	$token = trim($matches[1]);
	$publicKey = trim($matches[2]);
	$entry['publicKey'] = $publicKey;
	$parts = explode('.', $token);
	$entry['tokenParts'] = count($parts);
	if (count($parts) === 3) {
		$payload = json_decode(Crypto::fromBase64Url($parts[1]), true);
		$entry['aud'] = $payload['aud'] ?? null;
		$entry['sub'] = $payload['sub'] ?? null;
		$header = json_decode(Crypto::fromBase64Url($parts[0]), true);
		$entry['alg'] = $header['alg'] ?? null;
	}
}

// Decrypt exactly as a browser would.
$body = file_get_contents('php://input');
$entry['bodyLength'] = strlen($body);
$entry['contentEncoding'] = $_SERVER['HTTP_CONTENT_ENCODING'] ?? null;
$entry['contentType'] = $_SERVER['HTTP_CONTENT_TYPE'] ?? null;

try {
	$decrypted = Crypto::decrypt(
		[
			'body' => $body,
			'salt' => substr($body, 0, 16),
			'nonce' => hex2bin(str_pad($state['nonce'], 24, '0')),
		],
		['p256dh' => $state['p256dh'], 'auth' => $state['auth']],
		$state['senderPublicKey'],
	);
	$decoded = json_decode($decrypted, true);
	$entry['payload'] = $decoded;
	$entry['decrypted'] = is_array($decoded);
} catch (Throwable $e) {
	$entry['decrypted'] = false;
	$entry['error'] = $e->getMessage();
}

record($stateFile, $state, $entry);
http_response_code(201);
echo 'created';