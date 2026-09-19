# Words of Christ (red letter) source data

`red_letter_verses.json` is the red-letter dataset from
[kennethreitz/kjvstudy.org](https://github.com/kennethreitz/kjvstudy.org)
(`kjvstudy_org/data/red_letter_verses.json`), downloaded once and vendored
here so compiles are reproducible.

Content and license:

- The verse text itself is the King James Version (1769 Cambridge edition),
  which is in the public domain.
- The JSON structure / dataset is MIT-licensed (see the upstream repo).
- Format: `"Book Chapter:Verse": "full"` when the entire verse is Christ's
  speech, or the exact spoken text for partial verses. Covers the Gospels,
  Acts, and Revelation (2,007 verses).

At compile time, `compile.mjs` aligns this KJV-derived spoken text (or the
whole verse) against the BSB canonical verse text and emits
`public/woc.js` with per-verse word-index ranges. Those ranges are then
injected directly into the compiled chapter HTML as `<span class="woc">`
so the app has no runtime lookup.

Upstream commit used:
- Repo: https://github.com/kennethreitz/kjvstudy.org
- Path: kjvstudy_org/data/red_letter_verses.json (fetched 2026-09-19)