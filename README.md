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

## License

+ The code is licensed under the MIT license (see `LICENSE`).
+ For the content license, see https://berean.bible/licensing.htm
