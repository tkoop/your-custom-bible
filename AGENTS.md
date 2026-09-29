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

1. `npm run compile` (`compile.mjs`) turns the unzipped BSB epub in `bsb/`
   into `public/chapters/*.html` and `public/search.json`. It does not read
   any file under `resources/`.
2. `scripts/count-you.mjs <out.tsv>` resolves whether each `you`/`your`/`yours`
   in a verse is 2nd-person singular or plural, from the parsing codes.
   Output: `resources/bsb_you_counts.tsv`.
3. `scripts/build-plurals.mjs` combines that with the tables to emit
   `pluralYous.mjs`, which `compile.mjs` imports for the `youpl`/`yousg` spans.
4. `tools/buildWordData.mjs` emits `public/wordData/<book>.json` for the word
   study popup.

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

## Cache-busting rule (IMPORTANT)

Browsers cache this app's static assets aggressively:

- The server sends `Cache-Control: public, max-age=0` for everything in
  `public/`.
- The service worker (`serviceWorker.js`) uses a `NetworkFirst` strategy.
- Assets are loaded with a `?version=N` query string for cache-busting.

**Before committing any change, bump the `?version=` query string for any
file under `public/` whose content changed.** Increment the number each time:

- Start/raise any resource that has no version param yet (add `?version=1`).
- `style.css` is currently at `?version=32`; leave it unless it changes.

Files involved (all referenced from `public/index.html`):

- `style.css`
- `images/logo.png`, `images/banner.png`
- `manifest.json`
- `framework.js`, `activity.js`, `settings.js`, `books.js`
- Components fetched via `loadComponent()`: `components/menu.html`,
  `components/chapter.html`, `components/home.html`, `components/about.html`,
  `components/history.html`, `components/search.html`,
  `components/settings.html`, `components/speedReader.html`
- Fonts referenced from `style.css` via `@font-face`: files under `fonts/`
- `serviceWorker.js` (bump its `?version=` too when its logic changes)

If a change does not touch any cached file (e.g. only tests or docs), no bump
is needed.