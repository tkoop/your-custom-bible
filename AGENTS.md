# AGENTS.md

## Project notes

- Static PWA. Serve locally with `npm run serve` (serves `public/`).
- Tests: Cypress (E2E). Note: `node_modules/.bin/cypress` is broken in this repo;
  use `node node_modules/cypress/bin/cypress run -b chromium` instead.
- Verify browser behavior with headless Chromium CDP when Cypress can't run
  (e.g. missing Xvfb).

## Data pipeline

There are five independent build pipelines. Only the first is wired to an
npm script; the rest are run by hand when their inputs or logic change.

1. `npm run compile` turns the unzipped BSB epub in `bsb/` into
   `public/translations/bsb/*.html` and `public/search.json`. It does not read
   any file under `resources/`.
2. `scripts/count-you.mjs <out.tsv>` resolves whether each `you`/`your`/`yours`
   in a verse is 2nd-person singular or plural, from the parsing codes.
   Output: `resources/bsb_you_counts.tsv`.
3. `scripts/build-plurals.mjs` combines that with the tables to emit
   `pluralYous.mjs`, which `compile.mjs` imports for the `youpl`/`yousg` spans.
4. `tools/buildWordData.mjs` emits `public/wordData/<book>.json` for the word
   study popup.
5. `tools/buildLexicon.mjs` reads that back, plus the Strong's dictionaries in
   `resources/`, and emits `public/lexicon/<Key>.json`, one file per Strong's
   number, for the word study page. Run it after step 4.
6. `tools/buildBooksJson.mjs` emits `resources/books.json` from the book array
   at the top of `public/books.js`, for the push server (see "Plan reminders").
7. `tools/buildPlanFixture.mjs` runs `public/plans.js` itself and emits
   `resources/planFixture.json`: the notification bodies the server has to be
   able to reproduce. It exists to pin the port in `server/Schedule.php`, and
   `server/ScheduleTest.php` fails if the two disagree.

6 and 7 are run together by `npm run pushfixtures`.

## Chapter build, stage 1 and stage 2

The chapter build is two stages, split at "marked-up fragment":

- **Stage 1** is one file per translation, and is the only place that needs to
  know which translation it is reading. `compile.mjs` is the BSB's: it reads the
  epub, and it is where the plural-you table, the epub's own markup and
  `resources/woc_verses.tsv` live. It emits a fragment - chapter HTML with the
  `youpl`/`yousg` and `lord`/`caplord` spans, the verse `id`s, the footnote block
  and the `woc` classes already in place. `CHAPTER_HTML_FORMAT.md` is the
  contract.
- **Stage 2** is `decorate.mjs`, shared by every translation. `decorateChapter()`
  takes a fragment and returns the finished chapter file, adding only the
  spelling variants and the `cap`/`nocap`/`bsb` variants.

The two stages share one scanner, so the split is about *who decides*, not about
parsing the same text twice: `scanCapitalCase()` runs with a plural resolver in
stage 1 (it writes the you spans and nothing else) and without one in stage 2
(where it reads the you spans stage 1 wrote and wraps each one in its case
variants). That is why stage 2 needs no knowledge of which translation it is
reading, and why `decorate.mjs` imports neither `pluralYous.mjs` nor
`words.mjs`'s caller-side data.

To add a translation: give it a stage 1 that emits a conforming fragment, add
its directory under `public/translations/`, and list it in
`public/translations.js`. Nothing in stage 2 changes.

**The regression test for any change here:** run `npm run compile` and
`git status` must be clean. Stage 1 and stage 2 run in one pass today, so a
reorder or a boundary slip shows up as 1189 modified chapter files.

Stage 2's spelling pass keys on US spellings (`words.mjs` is a US -> ca/gb/us
table), so a fragment written in an already-British spelling gets no spelling
variants.

Steps 2-4 all read `resources/bsb_tables.tsv`. **That file is a download, not
a build output** - "BSB Translation Tables - tsv" from
https://berean.bible/downloads.htm. Do not try to generate it; re-download it
if it needs updating. The same download page offers the same tables as an
xlsx; that one used to be committed as `bsb_tables.xlsx` and no script ever
read it, so it was dropped from the repo along with the rest of the history.

Step 5 also reads `resources/strongs-hebrew-dictionary.js` and
`resources/strongs-greek-dictionary.js`. **Those are downloads too**, taken from
https://github.com/openscriptures/strongs at commit
`0acd2f251c2d35ff8db2dece4e0593979d3ac223` (`hebrew/` and `greek/`). They are
Strong's Dictionaries of Hebrew and Greek - James Strong, 1890 (Greek) and 1894
(Hebrew) - in Open Scriptures' JSON form, **CC-BY-SA**, which is why the word
page credits them and the About page says where they came from. Re-download from
that commit rather than from `master`, so the lexicon stays byte-for-byte
reproducible. The Greek file gives a transliteration but no pronunciation; the
Hebrew file gives both.

`resources/ChronoChapters.json` -> `public/chronoChapters.json` is a
by-hand copy, there is no script for it.

Every output above is committed and regenerates byte-for-byte from the
committed inputs, so a clean `git status` after running a pipeline is the
signal that nothing drifted.

## Word study page (`public/lexicon/`)

The popup answers "what is this word *here*"; the page answers "what is this
word". A page is keyed on the Strong's number - `H0430`, `G2424` - because the
same inflected word appears in thousands of verses and the number is the only
thing they share. About 4,000 rows in the tables (Hebrew particles mostly) carry
no Strong's number at all and have no page: they stay popup-only, and the
popup's "Word study" button is hidden for them.

One file per word, fetched whole by `components/word.html`, so a page is one
request whatever the word's size. Two things go in a file, and they are worth
keeping apart: the counts are all out of the BSB's own use of the word, while
the definition is out of Strong's. There is no dictionary entry anywhere in
`bsb_tables.tsv`, so the BSB half is not a lexicon definition - it is what the
translation does with the word.

- `k` `s` `l` - the key, the Strong's number, the language.
- `n` `vc` `bc` `vs` `vd` - occurrences, distinct verses, distinct books, verse
  references in this file, and the verses this file does not list.
- `rc` `rd` `oc` `tc` `pc` - distinct English renderings (total, and how many
  were cut), and the same for spellings, transliterations and parsing codes.
- `o` `t` `p` - the spellings in the original script, the transliterations and
  the parsing codes, each most used first.
- `g` - one record per English rendering: `e` the rendering, `n` its count, `b`
  the books it appears in paired with that book's verse keys.
- `m` `x` `pr` - Strong's headword, transliteration and pronunciation.
- `d` `r` - Strong's definition and where the word comes from. `r` is full of
  other Strong's numbers and the page turns each into a link to that word's page.

Twenty of the numbers the tables use have no definition field at all. Their
derivation reads as one - "a primary particle, denoting a supposition, wish,
possibility or uncertainty" is filed under G0302's derivation - so the page shows
that and the BSB's own usage below it, and says which it is quoting.

A Greek entry is often mostly derivation: Strong's derivation for G2316 carries
the main sense and its definition field holds only the tail. So the page quotes
the two together, as the printed dictionary does, and shows the derivation again
under "Built from" only when it names words worth linking.

Every cut list keeps its true total alongside it, and the page says what it is
not showing. Renderings are grouped on their bare words - a row's English text
carries the punctuation of the sentence it sits in, so "Jesus", "Jesus," and
"Jesus." are one rendering - and are shown under the spelling the BSB used most,
so a name keeps its capitals.

## Footnotes (`div.fn` at the foot of the chapter)

The notes are part of the chapter file - stage 1 writes them and
`CHAPTER_HTML_FORMAT.md` is the contract - and there is no separate data for
them, unlike the word popup's `wordData/`. They are a flat run of nodes at the
foot of the chapter: a `.fnverse` number, a `.footnotesbot` letter, then the
words of the note, then the next verse number. Nothing wraps a note, so
`footnoteIndex()` in `chapter.html` reads them back out of the DOM once per
chapter and keeps them as the nodes they were - the alternative readings the
BSB italicises are `<i>` elements in the note, and the popup shows the note as
it is written rather than as a flattened string.

A marker in the text is `<span class="fn">` carrying the letter, and a click on
one opens its note in the same card the word popup uses. A letter only happens
once in a chapter, so `findFootnote()` matches on the verse and the letter and
falls back to the letter alone - a psalm's superscription carries a marker with
no verse number before it.

The markers are hidden with the notes, so they only take a click, and only take
a pointer cursor (`body.fn-on`), while `settings.footnotes` is on.

## Shared links (chapter URL)

A chapter hash may carry the four settings the `YCB-` version tag is built
from, after a `?`:

    #Gen-1?s=us&n=YHWH&c=upper&y=youall

`settings.js` owns this: `shareableSettings` maps the short keys to setting
names, `shareableValues` lists the values the gear menu offers, and
`applySharedSettings()` is called from `updatePage()` in `index.html` before the
chapter is fetched. A URL is untrusted input, so a value not on those lists is
ignored - `settings.name` reaches the page through `innerHTML` and
`settings.spelling` through a CSS selector.

Settings from a link are applied but never saved: the reader's own values stay
in `localStorage`. The gear menu says so - a "Using shared settings" notice
stands in for the four rows, and a muted `shared` marker sits beside the version
tag in the chapter title. The reader either `adoptSharedSettings()`, which keeps
what the link brought as their own and drops the query from the address bar, or
`discardSharedSettings()`, which puts their own values back. Neither happens by
accident: nothing else writes to `sharedSettings`, and the four rows are hidden
while it holds anything.

## Reading plans

A **plan** is a list of books, a name and a pace. The pace is either a duration
to spread the chapters over, or a number of chapters a day. Seven plans are
built in - `BUILT_IN_PLANS` in `public/plans.js` - and a reader's own are built
on the Reading Plans page, which is `#plans`, reached from the three-line menu.

A **subscription** is a plan plus a start date. Everything else about it is
worked out from those two facts: which day it is on, how far through it is, what
to read today. Nothing is logged and nothing is ticked off, so there is no record
to fall out of step with the date and a day missed needs no catching up. A
subscription is stored as

    { id, planId, order, start, passes }

in `localStorage.subscriptions`; a reader's own plans are in
`localStorage.readingPlans`, shaped like a built-in one plus `custom: true`.
`passes` counts how many times the plan has been read and is shown on the card,
but it is not part of the arithmetic: `continueSubscription()` restarts the plan
from today rather than counting a lap of a calendar the reader is no longer on.

The start date is part of subscribing, not of the subscription: a plan row asks
for the order, then the date (today by default), then offers Subscribe, and
nothing shows a date once the plan is on. Moving a running plan's start would
be a second reading of it, not an edit, so that is what it would take.

A plan is also a page of its own, `#plan/<id>`, reached by "See every day" on a
plan row. It lays out **every** day with the date it falls on, because the shape
of a plan is the thing a reader cannot see from today's card: the Gospels over a
year is a chapter every fourth day with long stretches of rest days between. A
plan the reader is on is laid out from the day they began it - the most recent
subscription, which is the reading under way - and one they are not on is laid
out from today, since a list of dates has to start somewhere. Each day is
`planSchedule()`: the number, the date, and the chapters, each one a link.

The link carries the order and the start date the row is showing now -
`#plan/<id>?order=chronological&start=2026-09-30` - so the page shows what
subscribing there would give rather than the plan's defaults. Both are checked
against what the app offers on arrival, as untrusted input like any other part
of a hash, and with neither present the page falls back to the subscription and
then to today. The row keeps what the reader has set in `plansRowSettings`,
because the list is re-read after every subscription and a row rebuilt from the
plan would take their date and order back to today's and canonical.

A chapter opened from a plan carries the day with it, so the arrows either side
walk that day's reading rather than round the Bible - which matters on a
chronological plan, where the next chapter is not the next one in the Bible.
`armPlanReading()` is called *before* the chapter is asked for, because the
chapter is fetched and rendered afterwards and the note about the plan is written
as it renders; `loadPlanChapter()` marks the load as the plan's own so the clear
in `loadThisChapter()` does not throw it away. Any other way into a chapter is
the reader choosing one, so it drops the plan: the note is what tells them why
the arrows are behaving, and its absence is what tells them they have left.

The arrows carry a mark for it, the way they do in chronological order: an open
book in the corner of each, which is the Reading Plans page's own icon. It is
`body.plan-nav`, set per chapter rather than by the settings, because the reading
under way changes with every chapter and the clock's mark comes from the gear
menu. Only one mark shows at a time - while a plan has the arrows they follow
the plan, so a clock in the corner would be describing something else.

**Non-ASCII in a `public/*.js` file reaches the browser mangled.** Those are
`<script src>` tags, and `index.html` declares `<meta name="encoding">`, which is
not the `charset` the spec wants, so the file is decoded with whatever the
browser's fallback is. The components are fetched by `loadComponent()` and read
as UTF-8, so they can hold literal characters. `plans.js` writes its one
middot as `\u00b7` for that reason - the other script files are ASCII only.

The day boundaries are taken from the whole list, not from a rounded-up
chapters-a-day figure, so 1189 chapters over 365 days gives a day of three and a
day of four in proportion rather than four every day and a fortnight left over.
A plan with more days than chapters - the Gospels spread over a year - has days
with nothing in them, and the card has to be able to say so.

`order` is the subscription's, not the plan's: the same plan read canonically by
one reader and chronologically by another stays right for both. A chronological
plan reads the **index's** sequence, chapter by chapter, not a book order with
the chapters inside it: `plans.js` flattens `chronoChapters.json` the same way
the index walks it, so Psalm 51 stands between 2 Samuel 12 and 13 and the Songs
stand after Proverbs, as they do there. Reading whole books in that order would
have been the same 1189 chapters in a different sequence, which is not the same
thing to read.

That file is hand-kept and lists each of the 1189 chapters exactly once in
chronological order, and it is the single source every chronological feature
reads: `plans.js` flattens it for reading plans, `chapter.html` walks it for
the index page's chronological view and for the chronological chapter arrows.
A plan over the whole Bible reads the Songs where the index puts them, and a
plan over the Psalms alone reads them in date order (90, 59, 52, 34, 56 …)
rather than 1 to 150.

## Plan reminders (the push server)

A subscription can be given a **reminder**: a daily notification, at a time the
reader picks, saying the plan's name and what is read that day. This was first
built with the `TimestampTrigger` API, which fires from the browser - no server
needed, but Chrome only, and it needs the browser to be running. It is now sent
by the server, which arrives with the app closed and works on iOS.

**The server is PHP, in `server/`, and it is not part of `public/`.** There is no
reverse proxy and no separate service: Apache serves `public/` as static files
and runs `server/push.php` directly. The deploy script needed no change at all.

```
server/
├── push.php        GET ?action=key, PUT ?action=sync
├── send.php        the cron entry point; also --dry-run
├── Schedule.php    plans.js's arithmetic, ported
├── Vapid.php       ES256 JWT
├── Crypto.php      HKDF-SHA256 + aes128gcm
├── lib.php         paths, keys, database, helpers
├── *Test.php       run with `npm run testserver`
└── tests/          a stand-in push service that decrypts what arrives
```

State lives in `/var/lib/yourcustombible/` - `vapid.json` and `push.db` - and
**never inside the checkout**. The deploy script runs `git clean -f`, which
deletes untracked files, so a key or database file in the repository would be
removed on every deploy. `YCB_DATA_DIR` moves it, which is what the tests use.

`tools/testPushUi.mjs` (`npm run testui`) drives headless Chromium over CDP,
which is how the browser checks run here: Xvfb is not installed, so Cypress
cannot start. `tools/cdp.mjs` is the small driver it uses.

### Why there is a port, and what keeps it honest

The server has to say the same thing the browser would, or a notification
contradicts the card on the home page. PHP cannot run `plans.js`, so
`server/Schedule.php` is a port of its arithmetic - and a port drifts. It is
pinned instead: `tools/buildPlanFixture.mjs` runs the real `plans.js` and writes
down every answer, and `server/ScheduleTest.php` asserts the PHP reproduces all
of them. When `plans.js` changes, regenerate with `npm run pushfixtures`; if the
output moves, `git status` shows it. That is the same signal the other pipelines
give, and it is the reason the port is allowed to exist at all.

Two things the port reads that are worth knowing:

- `public/chronoChapters.json`, **not** `resources/ChronoChapters.json`. The two
  are not the same file - the one in `resources/` still carries the repeated
  superscript groups and lists 1204 chapters, the one the browser fetches lists
  each of the 1189 once. Reading the wrong one gives a chronological plan a
  different list.
- `resources/books.json`, generated from `books.js`, so the book list is not
  maintained twice.

### The sync is a snapshot, not a diff

Every sync `PUT`s the reader's whole set of reminders, and the server **deletes
anything absent from it**. That is what makes it self-healing: unsubscribing,
deleting the plan behind a reminder, or clearing the browser's storage all take
effect on the next load, without the server being told which happened. It runs
on `plansUpdated`, which also fires when a page re-reads the list, so
`public/push.js` debounces it.

A reader's own plans are sent with their reminder, which is how a plan that
exists only in that browser can have a reminder at all.

### Sending

`send.php` runs once a minute. A reminder is due when it is past the reader's
time **in the reader's own timezone** - which is why a reminder carries one -
and has not been sent on that reader's local date. The date is stored as a date
rather than a timestamp, which is what makes daylight saving harmless.

`404`/`410` from a push service means the browser has gone: the endpoint and
everything on it are removed rather than retried for ever. `429` leaves the
reminder alone and unstamped, so it simply tries again.

### The crypto is hand-rolled

`web-push` is an npm package and this is PHP, so `Vapid.php` and `Crypto.php`
implement it. That is the cost of choosing PHP over a Node service, and it is
the part most worth reviewing. Two things about it are easy to get wrong and are
tested because they were got wrong first:

- `openssl_pkey_get_details()['key']` returns the **public** key PEM in PHP 8 on
  OpenSSL 3. Signing needs `openssl_pkey_export()`.
- `openssl_sign` returns ECDSA in **DER**; JWS and web push carry it raw
  (`P1363`). Everything goes through `derToRaw()` on the way out.
  `openssl_verify()` wants DER again, which is why the tests convert back.

A public key is raw binary and therefore not valid UTF-8, so `json_encode()`
returns `false` for it silently; the stored key is base64url for that reason.

`npm run testserver` decrypts what the server sends, through a stand-in push
service, rather than only checking that the server agrees with itself.

### Setting the server up

1. The vhost must run PHP. `server/probe.php` answers the question: load it and
   a `ycb-php-ok` line means yes, while the source means no. Delete it after.
2. If `public/` is the document root rather than the checkout, set
   `window.YCB_PUSH_API = "/server/push.php"` in `index.html`.
3. Make `/var/lib/yourcustombible/` and let it be writable by the web server.
   The key pair is generated on first use.
4. Add the cron line:
   `* * * * * /usr/bin/php /var/www/bible.timkoop.com/server/send.php`

The key pair is worth backing up: regenerating it invalidates every
subscription, and every reader has to turn their reminders on again.

## Cache-busting rule (IMPORTANT)

Browsers cache this app's static assets aggressively:

- The server sends `Cache-Control: public, max-age=0` for everything in
  `public/`.
- The service worker (`serviceWorker.js`) uses a `NetworkFirst` strategy.
- Assets are loaded with a `?version=N` query string for cache-busting.

**Before committing any change, bump the `?version=` query string for any
file under `public/` whose content changed.** Increment the number each time:

- Start/raise any resource that has no version param yet (add `?version=1`).
- `style.css` is currently at `?version=65`; leave it unless it changes.

Files involved (all referenced from `public/index.html`):

- `style.css`
- `images/logo.png`, `images/banner.png`
- `manifest.json`
- `framework.js`, `activity.js`, `settings.js`, `books.js`,
  `translations.js`, `plans.js`, `push.js`
- Components fetched via `loadComponent()`: `components/menu.html`,
  `components/chapter.html`, `components/word.html`,
  `components/home.html`, `components/about.html`,
  `components/history.html`, `components/search.html`,
  `components/settings.html`, `components/advanced.html`,
  `components/speedReader.html`, `components/readToMe.html`,
  `components/share.html`, `components/plans.html`,
  `components/plan.html`
- Fonts referenced from `style.css` via `@font-face`: files under `fonts/`
- `serviceWorker.js` (bump its `?version=` too when its logic changes)

`public/wordData/*.json` and `public/lexicon/*.json` are fetched with their own
`?version=1`, inside `chapter.html` and `word.html`.

If a change does not touch any cached file (e.g. only tests or docs), no bump
is needed.