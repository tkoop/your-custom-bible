# AGENTS.md

## Project notes

- Static PWA. Serve locally with `npm run serve` (serves `public/`).
- Tests: Cypress (E2E). Note: `node_modules/.bin/cypress` is broken in this repo;
  use `node node_modules/cypress/bin/cypress run -b chromium` instead.
- Verify browser behavior with headless Chromium CDP when Cypress can't run
  (e.g. missing Xvfb).

## Cache-busting rule (IMPORTANT)

Browsers cache this app's static assets aggressively:

- The server sends `Cache-Control: public, max-age=0` for everything in
  `public/`.
- The service worker (`serviceWorker.js`) uses a `NetworkFirst` strategy.
- Assets are loaded with a `?version=N` query string for cache-busting.

**Before committing any change, bump the `?version=` query string for any
file under `public/` whose content changed.** Increment the number each time:

- Start/raise any resource that has no version param yet (add `?version=1`).
- `style.css` is currently at `// 2`; leave it unless it changes.

Files involved (all referenced from `public/index.html`):

- `style.css`
- `images/logo.png`, `images/banner.png`
- `manifest.json`
- `framework.js`, `settings.js`, `books.js`
- Components fetched via `loadComponent()`: `components/menu.html`,
  `components/chapter.html`, `components/about.html`,
  `components/history.html`, `components/speedReader.html`
- Fonts referenced from `style.css` via `@font-face`: files under `fonts/`
- `serviceWorker.js` (bump its `?version=` too when its logic changes)

If a change does not touch any cached file (e.g. only tests or docs), no bump
is needed.