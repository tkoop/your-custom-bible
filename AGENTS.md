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

## Cache-busting rule (IMPORTANT)

Browsers cache this app's static assets aggressively:

- The server sends `Cache-Control: public, max-age=0` for everything in
  `public/`.
- The service worker (`serviceWorker.js`) uses a `NetworkFirst` strategy.
- Assets are loaded with a `?version=N` query string for cache-busting.

**Before committing any change, bump the `?version=` query string for any
file under `public/` whose content changed.** Increment the number each time:

- Start/raise any resource that has no version param yet (add `?version=1`).
- `style.css` is currently at `?version=47`; leave it unless it changes.

Files involved (all referenced from `public/index.html`):

- `style.css`
- `images/logo.png`, `images/banner.png`
- `manifest.json`
- `framework.js`, `activity.js`, `settings.js`, `books.js`, `translations.js`
- Components fetched via `loadComponent()`: `components/menu.html`,
  `components/chapter.html`, `components/word.html`,
  `components/home.html`, `components/about.html`,
  `components/history.html`, `components/search.html`,
  `components/settings.html`, `components/advanced.html`,
  `components/speedReader.html`, `components/readToMe.html`,
  `components/share.html`
- Fonts referenced from `style.css` via `@font-face`: files under `fonts/`
- `serviceWorker.js` (bump its `?version=` too when its logic changes)

`public/wordData/*.json` and `public/lexicon/*.json` are fetched with their own
`?version=1`, inside `chapter.html` and `word.html`.

If a change does not touch any cached file (e.g. only tests or docs), no bump
is needed.