<?php
// Temporary probe: answers one question and nothing else - does this vhost run
// PHP, or does it hand back the source? Load it at
// https://bible.timkoop.com/server/probe.php
//
// If the page shows the nonce below, PHP is on. If it shows this source, the
// vhost is serving it as a static file and needs PHP enabled.
//
// Delete this file once it has answered.

header("Content-Type: text/plain; charset=utf-8");

echo "ycb-php-ok " . phpversion() . " " . php_sapi_name() . "\n";