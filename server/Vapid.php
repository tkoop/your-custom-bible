<?php
// VAPID (RFC 8292): the key pair a push service trusts, and the ES256 JWT that
// proves to it that a request comes from us rather than from anyone who happens
// to have seen a subscription's endpoint URL.
//
// The JWT is the fiddly part. OpenSSL's openssl_sign returns ECDSA in ASN.1 DER,
// where each of r and s carries its own length prefix. JWS wants them raw and
// fixed-width, concatenated - P1363 - so every signature goes through
// derToRaw() on its way out. Getting that wrong produces a signature that looks
// present and is rejected, which is the same as no notification at all.

class Vapid
{
    const JWT_LIFETIME = 43200; // 12 hours, the longest a push service accepts.

    /**
     * The audience is the push service the endpoint belongs to, so it is worked
     * out from the endpoint rather than configured. FCM, Mozilla's autopush and
     * Apple's service all sit under their own origin.
     */
    public static function audience($endpoint)
    {
        $parts = parse_url($endpoint);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            throw new RuntimeException('cannot read an audience from endpoint: ' . $endpoint);
        }
        return $parts['scheme'] . '://' . $parts['host'];
    }

    /**
     * A fresh P-256 key pair. The private key stays on the server; only the
     * public key is ever sent to a browser, as applicationServerKey.
     */
    public static function generateKeys()
    {
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        if ($key === false) {
            throw new RuntimeException('could not generate a P-256 key: ' . openssl_error_string());
        }

        // The private key has to come from openssl_pkey_export(). In PHP 8 on
        // OpenSSL 3, openssl_pkey_get_details()['key'] hands back the *public*
        // key PEM, and passing that to openssl_sign() fails with "cannot be
        // coerced into a private key" - a signature that is never produced
        // rather than one that is wrong.
        $privateKey = '';
        if (!openssl_pkey_export($key, $privateKey)) {
            throw new RuntimeException('could not export the private key: ' . openssl_error_string());
        }

        $details = openssl_pkey_get_details($key);
        if (!isset($details['ec']['x'], $details['ec']['y'])) {
            throw new RuntimeException('OpenSSL did not return the EC public point');
        }

        $publicKey = "\x04"
            . self::toFixedWidth($details['ec']['x'])
            . self::toFixedWidth($details['ec']['y']);

        return [
            'privateKey' => $privateKey,
            'publicKey' => $publicKey,
            // The same public key in PEM, which is what openssl_verify() wants.
            // Kept because it costs nothing next to the raw point and saves
            // anyone from rebuilding the SPKI wrapper by hand.
            'publicPem' => $details['key'],
        ];
    }

    /**
     * The uncompressed point as base64url, which is the form applicationServerKey
     * and the body header both want.
     */
    public static function publicKeyBase64($publicKey)
    {
        return Crypto::base64UrlEncode($publicKey);
    }

    /**
     * The signed token for one send. $subject is a contact address for whoever
     * is running the service - push services are told to have one.
     */
    public static function token($privateKey, $endpoint, $subject)
    {
        $header = ['typ' => 'JWT', 'alg' => 'ES256'];
        $payload = [
            'aud' => self::audience($endpoint),
            'exp' => time() + self::JWT_LIFETIME,
            'sub' => $subject,
        ];

        $signingInput = self::base64Url(json_encode($header))
            . '.'
            . self::base64Url(json_encode($payload));

        $der = '';
        if (!openssl_sign($signingInput, $der, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('could not sign the VAPID token: ' . openssl_error_string());
        }

        return $signingInput . '.' . self::base64Url(self::derToRaw($der));
    }

    public static function base64Url($value)
    {
        return Crypto::base64UrlEncode($value);
    }

    /**
     * ASN.1 DER ECDSA signature to the raw, fixed-width r||s that JWS carries.
     *
     *   SEQUENCE { INTEGER r, INTEGER s }
     *
     * A DER integer is signed, so a leading zero byte may be present to keep the
     * high bit clear, and the value may be shorter than 32 bytes. JWS wants
     * exactly 32 of each, so leading zeros are stripped and then padded back out
     * on the left.
     */
    public static function derToRaw($der)
    {
        $pos = 0;
        if (ord($der[$pos++]) !== 0x30) {
            throw new RuntimeException('not a DER signature: expected a SEQUENCE');
        }
        self::readLength($der, $pos); // the sequence's own length, not needed

        if (ord($der[$pos++]) !== 0x02) {
            throw new RuntimeException('not a DER signature: expected an INTEGER for r');
        }
        $rLength = self::readLength($der, $pos);
        $r = substr($der, $pos, $rLength);
        $pos += $rLength;

        if (ord($der[$pos++]) !== 0x02) {
            throw new RuntimeException('not a DER signature: expected an INTEGER for s');
        }
        $sLength = self::readLength($der, $pos);
        $s = substr($der, $pos, $sLength);

        return self::toFixedWidth(ltrim($r, "\x00"))
            . self::toFixedWidth(ltrim($s, "\x00"));
    }

    /**
     * DER lengths are short form below 128 and long form above, where the first
     * byte counts the bytes that follow that hold the length.
     */
    private static function readLength($der, &$pos)
    {
        $first = ord($der[$pos++]);
        if ($first < 0x80) {
            return $first;
        }
        $count = $first & 0x7f;
        $length = 0;
        for ($i = 0; $i < $count; $i++) {
            $length = ($length << 8) | ord($der[$pos++]);
        }
        return $length;
    }

    /**
     * Exactly 32 bytes, zero-padded on the left. A point coordinate or an
     * ECDSA value that happens to be short is left-padded, never truncated.
     */
    private static function toFixedWidth($bytes)
    {
        $bytes = ltrim($bytes, "\x00");
        if (strlen($bytes) > 32) {
            throw new RuntimeException('value is longer than 32 bytes');
        }
        return str_pad($bytes, 32, "\x00", STR_PAD_LEFT);
    }
}