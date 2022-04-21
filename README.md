### Berean Readers Bible

This project endevours to be a Bible reader for the Berean Readers Bible, as a PWA.

The content of this Bible comes from https://berean.bible/downloads.htm 

This project is not associated with the creators of the Berean Readers Bible.


## To Make It

Download the Berean Readers Bible from https://berean.bible/downloads.htm as a Word document.  (This has already been done for you and lives in the root directory as brb.docx)  Open it with Libre Office and save it as html.  (This also has been done for you and lives in the root directory as brb.html)

Run this command to parse brb.html into individual chapter files that will be put into public/chapters.  This will also create the public/books.js file.

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

