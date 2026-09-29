### Berean Bible

This project endevours to be a Bible reader for the Berean Bible, as a PWA.

The content of this Bible comes from https://berean.bible/downloads.htm 

This project is not associated with the creators of the Berean Bible.


## To Make It

Download the Berean Study Bible from https://berean.bible/downloads.htm as an epub file.  (This has already been done for you and lives in the root directory as brb.docx)  Rename it to .zip and unzip it.  (This also has been done for you and lives in the root directory as /brb)

Run this command to parse the chapter html files into individual chapter files that will be put into public/chapters.

```
npm run compile
```

You don't actually have to do this either, because this has also been done for you.

## To Use It

The first time, you'll need to run this. (It installs the simple server.)
```
npm ci
```

After that, run this to get a simple web server going:
```
npm run serve
```

Then point your web browser to http://localhost:8000, which will serve out the /public directory.

## Word Study Data (optional)

The app's word study popup is backed by the Berean interlinear tables, which
are built by a separate set of scripts. Their input is
`resources/bsb_tables.tsv`, a **downloaded file, not a generated one** - the
"BSB Translation Tables - tsv" from
https://berean.bible/downloads.htm (https://bereanbible.com/bsb_tables.tsv).
It is 754,647 rows of 23 columns, one row per English word, with
transliteration, parsing codes, Strong's numbers and the original text.

The same download page also offers the same tables as an xlsx, which is what
`bsb_tables.xlsx` was. No script ever read it, so it has been removed from the
repository.

To rebuild the derived data:

```
node scripts/count-you.mjs resources/bsb_you_counts.tsv   # you/your singular vs plural, per verse
node scripts/build-plurals.mjs                            # -> pluralYous.mjs, used by compile.mjs
node tools/buildWordData.mjs                              # -> public/wordData/*.json, the word study popup
```

All three outputs are committed, so you only need to run these if you change
the scripts or pick up a newer copy of the tables. They currently regenerate
byte-for-byte identically from the committed `resources/bsb_tables.tsv`.

## License

+ The code is licensed under the MIT license (see `LICENSE`).
+ For the content license, see https://berean.bible/licensing.htm
