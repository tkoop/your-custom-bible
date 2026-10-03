// One entry per translation the app can read. `path` is the directory under
// public/ holding that translation's chapter files, named the same way as the
// entry's `id`.
//
// Only one translation is served today, so which one a reader is reading is not
// a setting yet - it is whatever is first in this list. Adding a second one is
// what turns currentTranslation() into a choice.
var translations = [
	{
		id: "bsb",
		name: "Berean Standard Bible",
		path: "translations/bsb",
	},
];

function currentTranslation() {
	return translations[0];
}

function chapterUrl(slug, chapter) {
	return "./" + currentTranslation().path + "/" + slug + "-" + chapter + ".html";
}