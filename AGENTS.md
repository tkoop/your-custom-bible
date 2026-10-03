# AGENTS.md

## Project notes

- Static PWA. Serve locally with `npm run serve` (serves `public/`).
- Tests: Cypress (E2E). Note: `node_modules/.bin/cypress` is broken in this repo;
  use `node node_modules/cypress/bin/cypress run -b chromium` instead.
- Verify browser behavior with headless Chromium CDP when Cypress can't run
  (e.g. missing Xvfb).

## Data pipeline

There are four independent build pipelines. Only the first is wired to an
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

`resources/ChronoChapters.json` -> `public/chronoChapters.json` is a
by-hand copy, there is no script for it.

Every output above is committed and regenerates byte-for-byte from the
committed inputs, so a clean `git status` after running a pipeline is the
signal that nothing drifted.

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
- `style.css` is currently at `?version=34`; leave it unless it changes.

Files involved (all referenced from `public/index.html`):

- `style.css`
- `images/logo.png`, `images/banner.png`
- `manifest.json`
- `framework.js`, `activity.js`, `settings.js`, `books.js`, `translations.js`
- Components fetched via `loadComponent()`: `components/menu.html`,
  `components/chapter.html`, `components/home.html`, `components/about.html`,
  `components/history.html`, `components/search.html`,
  `components/settings.html`, `components/advanced.html`,
  `components/speedReader.html`, `components/readToMe.html`,
  `components/share.html`
- Fonts referenced from `style.css` via `@font-face`: files under `fonts/`
- `serviceWorker.js` (bump its `?version=` too when its logic changes)

If a change does not touch any cached file (e.g. only tests or docs), no bump
is needed.