<?php
// Round-trip tests for the hand-rolled push crypto.
//
// These are the tests that matter most in the server: the VAPID signing and the
// aes128gcm encryption cannot be checked by reading them, and a mistake in
// either produces a notification that silently never arrives. So we encrypt,
// then decrypt with the same derivation run backwards, and separately verify
// the ES256 signature against a public key.
//
//   php server/CryptoTest.php

require_once __DIR__ . '/Crypto.php';
require_once __DIR__ . '/Vapid.php';

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

// A stand-in for a browser's subscription: p256dh is an uncompressed P-256
// point, auth is 16 bytes. Neither has a private half here, which is exactly
// why this can only prove the server's own half is self-consistent - the real
// receipt arrives from a browser.
function fakeSubscription()
{
    $keys = Vapid::generateKeys();
    return [
        'subscription' => [
            'p256dh' => Vapid::publicKeyBase64($keys['publicKey']),
            'auth' => Crypto::base64UrlEncode(random_bytes(16)),
        ],
        'senderKeys' => $keys,
    ];
}

// The reverse of Vapid::derToRaw, and needed for one reason only: JWS carries a
// raw P1363 signature, but openssl_verify() expects ASN.1 DER. So the signature
// goes back into DER here to be checked. Nothing on the sending path needs this.
function rawToDer($raw)
{
    $parts = [];
    foreach ([substr($raw, 0, 32), substr($raw, 32, 32)] as $value) {
        $value = ltrim($value, "\x00");
        // A DER integer is signed, so a value with the high bit set needs a
        // leading zero to stop it reading as negative.
        if ($value === '' || (ord($value[0]) & 0x80)) {
            $value = "\x00" . $value;
        }
        $parts[] = "\x02" . chr(strlen($value)) . $value;
    }
    $body = implode('', $parts);
    return "\x30" . chr(strlen($body)) . $body;
}

echo "aes128gcm\n";
{
    $fake = fakeSubscription();
    $plaintext = json_encode(['title' => 'Reading plan reminder', 'body' => 'Gospels - today: John 3']);

    $encrypted = Crypto::encrypt($plaintext, $fake['subscription'], Vapid::publicKeyBase64($fake['senderKeys']['publicKey']));
    $decrypted = Crypto::decrypt($encrypted, $fake['subscription'], Vapid::publicKeyBase64($fake['senderKeys']['publicKey']));

    check('round-trips the plaintext', $decrypted === $plaintext, 'got: ' . $decrypted);
    check('salt is 16 bytes', strlen($encrypted['salt']) === 16);
    check('nonce is 12 bytes', strlen($encrypted['nonce']) === 12);

    // The wire format: salt(16) | recordsize(4) | keyidlen(1) | keyid(65) | ciphertext | tag(16)
    $body = $encrypted['body'];
    check('body starts with the salt', substr($body, 0, 16) === $encrypted['salt']);
    check('record size is 4096', unpack('N', substr($body, 16, 4))[1] === 4096);
    check('keyid length is 65', ord($body[20]) === 65);
    check('keyid is the sender public key', substr($body, 21, 65) === $fake['senderKeys']['publicKey']);
    check('body ends with a 16 byte tag', strlen($body) > 21 + 65 + 16);

    // Padding must take the plaintext up to a whole 4096-byte record. GCM's
    // ciphertext is the padded plaintext; the 16-byte tag is appended to it and
    // is not itself padded, so it comes off before the multiple is checked.
    $ciphertextLength = strlen($body) - 21 - 65 - 16;
    check('padded to a whole record', ($ciphertextLength % 4096) === 0, "ciphertext is $ciphertextLength");
}

echo "aes128gcm, tampering\n";
{
    $fake = fakeSubscription();
    $plaintext = 'today: Genesis 1';
    $senderPublic = Vapid::publicKeyBase64($fake['senderKeys']['publicKey']);

    $encrypted = Crypto::encrypt($plaintext, $fake['subscription'], $senderPublic);
    $body = $encrypted['body'];
    // Flip a bit in the middle of the ciphertext.
    $position = 21 + 65 + 10;
    $body[$position] = chr(ord($body[$position]) ^ 0xff);

    $threw = false;
    try {
        Crypto::decrypt(['body' => $body, 'salt' => $encrypted['salt'], 'nonce' => $encrypted['nonce']], $fake['subscription'], $senderPublic);
    } catch (RuntimeException $e) {
        $threw = true;
    }
    check('a modified ciphertext does not decrypt', $threw);

    // The wrong auth secret must not decrypt it either - this is the AAD.
    $wrong = $fake['subscription'];
    $wrong['auth'] = Crypto::base64UrlEncode(random_bytes(16));
    $threw = false;
    try {
        Crypto::decrypt($encrypted, $wrong, $senderPublic);
    } catch (RuntimeException $e) {
        $threw = true;
    }
    check('the wrong auth secret does not decrypt it', $threw);
}

echo "VAPID\n";
{
    $keys = Vapid::generateKeys();
    $endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

    check('audience is read from the endpoint', Vapid::audience($endpoint) === 'https://fcm.googleapis.com');

    $token = Vapid::token($keys['privateKey'], $endpoint, 'mailto:admin@timkoop.com');
    $parts = explode('.', $token);
    check('token has three parts', count($parts) === 3);

    $header = json_decode(Crypto::fromBase64Url($parts[0]), true);
    check('header alg is ES256', $header['alg'] === 'ES256');
    check('header typ is JWT', $header['typ'] === 'JWT');

    $payload = json_decode(Crypto::fromBase64Url($parts[1]), true);
    check('payload aud is the endpoint origin', $payload['aud'] === 'https://fcm.googleapis.com');
    check('payload sub is the contact', $payload['sub'] === 'mailto:admin@timkoop.com');
    check('payload exp is in the future', $payload['exp'] > time());

    // The signature must be raw 64 bytes, not DER. A DER signature here is the
    // bug this assertion exists to catch.
    $signature = Crypto::fromBase64Url($parts[2]);
    check('signature is 64 raw bytes', strlen($signature) === 64, 'got ' . strlen($signature));

    // And it must actually verify against the public key, which means putting the
    // raw signature back into DER for OpenSSL. The PEM comes from OpenSSL rather
    // than being rebuilt from the raw point by hand.
    $der = rawToDer($signature);
    check('converts back to a DER signature', strlen($der) > 64 && ord($der[0]) === 0x30);

    $verified = openssl_verify($parts[0] . '.' . $parts[1], $der, $keys['publicPem'], OPENSSL_ALGO_SHA256);
    check('the signature verifies against the public key', $verified === 1, 'openssl_verify said ' . var_export($verified, true));

    // A signature over different bytes must not verify - otherwise the test
    // would pass on a key that signs nothing in particular.
    $tampered = $parts[1] . '.' . $parts[0];
    $bad = openssl_verify($tampered, $der, $keys['publicPem'], OPENSSL_ALGO_SHA256);
    check('a signature over other bytes does not verify', $bad === 0, 'openssl_verify said ' . var_export($bad, true));
}

echo "VAPID, DER conversion\n";
{
    // A DER integer that is short, and one that carries the extra leading zero
    // OpenSSL adds to keep the high bit clear. Both must come out 32 bytes.
    $short = pack('H*', '3006020101020102');
    check('a short signature pads out to 64 bytes', strlen(Vapid::derToRaw($short)) === 64);

    $padded = pack('H*', '3007' . '020200' . '01' . '020101');
    check('a leading zero byte is stripped, not counted', strlen(Vapid::derToRaw($padded)) === 64);

    $rejected = false;
    try {
        Vapid::derToRaw('not der at all');
    } catch (RuntimeException $e) {
        $rejected = true;
    }
    check('a malformed signature is refused', $rejected);
}

echo "base64url\n";
{
    $bytes = random_bytes(65);
    check('round-trips', Crypto::fromBase64Url(Crypto::base64UrlEncode($bytes)) === $bytes);

    // Lengths that are not a multiple of 4 need the padding restored, and a
    // 65-byte key (which is what applicationServerKey is) is exactly that case.
    check('a 65 byte key survives the padding rules', strlen(Crypto::fromBase64Url(Vapid::publicKeyBase64(random_bytes(65)))) === 65);
    check('url-safe alphabet only', preg_match('/^[A-Za-z0-9\-_]+$/', Crypto::base64UrlEncode($bytes)) === 1);
}

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);