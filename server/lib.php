<?php
// Paths, the VAPID key pair, the database, and the small helpers the rest of
// the server shares.
//
// Everything this writes lives outside the checkout, under /var/lib, and that
// is not a preference. The deploy script runs "git clean -f", which deletes
// untracked files, and a .env or a database file inside the checkout would be
// removed on every deploy - silently, among a line of ordinary output. Putting
// them outside the repo means there is nothing for it to clean.
//
// A backup is worth taking: regenerating the key pair invalidates every
// subscription, and every reader would have to turn their reminders on again.

require_once __DIR__ . '/Vapid.php';
require_once __DIR__ . '/Crypto.php';
require_once __DIR__ . '/Schedule.php';

class Push
{
    /** Where the key pair and the database live. */
    public static function dataDir()
    {
        return getenv('YCB_DATA_DIR') ?: dirname(__DIR__);
    }
    public static function envFile()
    {
        if (getenv('YCB_ENV_FILE')) {
            return getenv('YCB_ENV_FILE');
        }
        // The deployed app sits at /var/www/bible.timkoop.com.
        return dirname(__DIR__) . "/.env";
    }

    public static function readEnv($key)
    {
        $path = self::envFile();
        if (!is_file($path)) {
            return null;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === "" || str_starts_with($line, "#")) {
                continue;
            }
            $equals = strpos($line, "=");
            if ($equals === false) {
                continue;
            }
            $name = trim(substr($line, 0, $equals));
            if ($name !== $key) {
                continue;
            }
            $value = trim(substr($line, $equals + 1));
            if ($value !== "" && ($value[0] === chr(34) || $value[0] === chr(39))) {
                $quote = $value[0];
                $end = strrpos($value, $quote, 1);
                if ($end !== false && $end > 0) {
                    $value = substr($value, 1, $end - 1);
                }
            } elseif (($hash = strpos($value, " #")) !== false) {
                $value = trim(substr($value, 0, $hash));
            }
            return $value;
        }
        return null;
    }
    public static function writeEnv($key, $value)
    {
        $path = self::envFile();
        $lines = is_file($path) ? file($path) : array();
        $lines[] = "$key=$value";
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $raw = implode("\n", array_map("rtrim", $lines)) . "\n";
        file_put_contents($path, $raw, LOCK_EX);
    }


    public static function dbPath()
    {
        return self::dataDir() . '/push.db';
    }

    public static function keysPath()
    {
        return self::dataDir() . '/vapid.json';
    }

    /**
     * The contact a push service is told to have for whoever runs this. The
     * VAPID spec requires a subject, and a mailto: address is the simplest one
     * that does not imply a server that does not exist.
     */
    public static function subject()
    {
        return getenv('YCB_VAPID_SUBJECT') ?: 'mailto:admin@timkoop.com';
    }

    // ---------- the key pair ----------

    /**
     * The VAPID key pair, generated on first run and then read from disk.
     *
     * Only the public half is ever sent to a browser. The private half signs
     * every request, so losing it means every stored subscription stops working
     * and every reader has to subscribe again.
     */
    public static function keys()
    {
        // First, the .env file, which is where the key pair now lives. That is
        // what Deployable's Environment tab edits, and unlike /var/lib it does
        // not need to be backed up separately.
        $privateRaw = self::readEnv('YCB_VAPID_PRIVATE_PEM_B64');
        $publicKey = self::readEnv('YCB_VAPID_PUBLIC_KEY');
        if (is_string($privateRaw) && is_string($publicKey)) {
            $private = base64_decode($privateRaw, true);
            if ($private !== false) {
                return ['privateKey' => $private, 'publicKey' => Crypto::fromBase64Url($publicKey)];
            }
        }

        // A .env written before the move had no .et prefix keys. Fall back to a
        // PEM stored under YCB_VAPID_PRIVATE_KEY, in case the user still holds
        // an older file. This is only here for backwards compatibility.
        $privatePem = self::readEnv('YCB_VAPID_PRIVATE_KEY');
        if (is_string($privatePem) && is_string($publicKey)) {
            $private = @openssl_pkey_get_private($privatePem);
            if ($private) {
                $details = openssl_pkey_get_details($private);
                $pem = '';
                if (openssl_pkey_export($private, $pem)) {
                    return ['privateKey' => $pem, 'publicKey' => Crypto::fromBase64Url($publicKey)];
                }
            }
        }

        // An installation that has not moved its keys yet, or the tests
        // pointing at YCB_DATA_DIR, keep the JSON file. They will be moved the
        // next time the generation path runs, or never if the file stays.
        $path = self::keysPath();
        if (is_file($path)) {
            $stored = json_decode(file_get_contents($path), true);
            if (is_array($stored) && isset($stored['privateKey'], $stored['publicKey'])) {
                return $stored;
            }
        }

        // Generate, and write to the .env where deployable and the administrator
        // can both see them. The same generation runs once on first use.
        $keys = Vapid::generateKeys();
        $stored = [
            'privateKey' => $keys['privateKey'],
            'publicKey' => $keys['publicKey'],
        ];
        self::writeEnv('YCB_VAPID_PRIVATE_PEM_B64', base64_encode($stored['privateKey']));
        self::writeEnv('YCB_VAPID_PUBLIC_KEY', Vapid::publicKeyBase64($stored['publicKey']));
        self::log('generated a new VAPID key pair and wrote it to ' . self::envFile());
        return ['privateKey' => $stored['privateKey'], 'publicKey' => $stored['publicKey']];
    }
    public static function publicKeyBase64()
    {
        $keys = self::keys();
        return Vapid::publicKeyBase64($keys['publicKey']);
    }

    // ---------- the database ----------

    public static function ensureDir()
    {
        $dir = self::dataDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('could not create ' . $dir);
        }
        return $dir;
    }

    public static function db()
    {
        self::ensureDir();
        $pdo = new PDO('sqlite:' . self::dbPath());
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        // Off by default in SQLite, and without it the ON DELETE CASCADE on
        // reminders.endpoint_id never fires - so pruning a dead endpoint would
        // leave its reminders behind as orphans.
        $pdo->exec('PRAGMA foreign_keys = ON');
        self::migrate($pdo);
        return $pdo;
    }

    private static function migrate($pdo)
    {
        // A nowdoc rather than a quoted string: nothing inside is escaped, so
        // the SQL reads as SQL. In a single-quoted PHP string every quote in the
        // DEFAULT clauses needs a backslash, and a missing one silently ends the
        // string and turns the rest of the schema into a parse error.
        $schema = <<<'SQL'
CREATE TABLE IF NOT EXISTS endpoints (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint      TEXT    NOT NULL UNIQUE,
    p256dh        TEXT    NOT NULL,
    auth          TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    last_seen_at  TEXT    NOT NULL
);

-- read_order, not "order": ORDER is a SQLite keyword, so it would have to be
-- quoted at every use. The column is about which sequence a plan is read in,
-- which is what "read_order" says anyway.
CREATE TABLE IF NOT EXISTS reminders (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id       TEXT    NOT NULL UNIQUE,
    endpoint_id           INTEGER NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    plan_json             TEXT    NOT NULL,
    read_order            TEXT    NOT NULL DEFAULT 'canonical',
    start                 TEXT    NOT NULL,
    notify_time           TEXT    NOT NULL DEFAULT '08:00',
    timezone              TEXT    NOT NULL DEFAULT 'UTC',
    days                  TEXT    NOT NULL DEFAULT '',
    enabled               INTEGER NOT NULL DEFAULT 1,
    last_sent_local_date  TEXT,
    created_at            TEXT    NOT NULL,
    updated_at            TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS reminders_enabled ON reminders (enabled);
SQL;

        $pdo->exec($schema);
    }

    // ---------- helpers ----------

    /**
     * The reader's own local date at an instant.
     *
     * This is the reason a reminder carries a timezone at all. The nudge is for
     * 8am where the reader is, and asking for "today" in the server's zone
     * would send it at the wrong point in their day - or on the wrong day, for
     * anyone far enough from the server.
     */
    public static function localDate($instant, $timeZone)
    {
        $zone = new DateTimeZone($timeZone);
        $date = (new DateTimeImmutable($instant))->setTimezone($zone);
        return $date->format('Y-m-d');
    }

    public static function localMinutesPastMidnight($instant, $timeZone)
    {
        $zone = new DateTimeZone($timeZone);
        $date = (new DateTimeImmutable($instant))->setTimezone($zone);
        return ((int) $date->format('G')) * 60 + (int) $date->format('i');
    }

    /** "HH:MM" as minutes past midnight, for comparing against the clock. */
    public static function minutesOfDay($time)
    {
        if (!preg_match('/^(\d{2}):(\d{2})$/', (string) $time, $matches)) {
            return 8 * 60;
        }
        return ((int) $matches[1]) * 60 + (int) $matches[2];
    }

    public static function json($value)
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function log($message)
    {
        $line = '[' . gmdate('c') . '] ' . $message . "\n";
        $dir = self::dataDir();
        if (is_dir($dir) || is_dir(self::ensureDir())) {
            @file_put_contents($dir . '/push.log', $line, FILE_APPEND);
        } else {
            error_log(rtrim($line));
        }
    }

    public static function now()
    {
        return gmdate('c');
    }

    /**
     * A nonce for Crypto::encrypt(), or null.
     *
     * This exists so the end-to-end test can decrypt what the server sent: the
     * nonce never travels on the wire, so a mock push service cannot work it
     * out, and the only way to check the whole path is to arrange for the
     * server to use one it already knows.
     *
     * It is unset in production and the send path passes it straight through,
     * where Crypto draws 12 random bytes whenever it is null. Nothing here
     * weakens a real message: the nonce is still unique per send, because
     * nothing sets this outside a test.
     */
    public static function testNonce()
    {
        $hex = getenv('YCB_TEST_NONCE');
        if (!$hex) {
            return null;
        }
        $bytes = hex2bin(str_pad($hex, 24, '0'));
        return $bytes === false ? null : $bytes;
    }
}