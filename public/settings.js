var settings = {
	browseHistory: [],
	fontSize: 16,
	mode: "auto",
	spelling: "ca",
	name: "Yahweh",
	case: "upper",
	titles: false,
	footnotes: false,
	references: false,
	verses: false,
	you: "youpl",
	woc: false,
	order: "canonical",
	pageturning: false,
	wordStudyLinks: false,
};

registerEventListener(
	(e) => e.name == "addBrowseHistory",
	function (event) {
		settings.browseHistory.push(event.data);
		saveSettingsToLocalStorage();
	}
);

registerEventListener(
	(e) => e.name == "setSetting",
	function (event) {
		settings[event.setting] = event.value;

		fireEvent({ name: "settingsUpdated" });
		saveSettingsToLocalStorage();
	}
);

function todayDateString() {
	var d = new Date();
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

function normalizeDateString(date) {
	if (typeof date == "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
	// legacy format like "Wed Sep 23" (no year, stored by older builds)
	var parsed = new Date(Date.parse(date));
	if (isNaN(parsed.getTime())) return date;
	var d = new Date(parsed);
	d.setFullYear(new Date().getFullYear());
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

function loadSettingsFromLocalStorage() {
	var localStorageSettings = JSON.parse(localStorage?.settings ?? "{}");

	settings.fontSize = localStorageSettings?.fontSize ?? 16;
	settings.mode =
		localStorageSettings?.mode ??
		(localStorageSettings?.darkMode ? "dark" : "auto");
	settings.spelling = localStorageSettings?.spelling ?? "ca";
	settings.name = localStorageSettings?.name ?? "Yaweh";
	settings.case = localStorageSettings?.case ?? "lower";
	settings.titles = localStorageSettings?.titles ?? false;
	settings.footnotes = localStorageSettings?.footnotes ?? false;
	settings.references = localStorageSettings?.references ?? false;
	settings.verses = localStorageSettings?.verses ?? false;
	settings.you = localStorageSettings?.you ?? "youpl";
	settings.woc = localStorageSettings?.woc ?? false;
	settings.wordStudyLinks = localStorageSettings?.wordStudyLinks ?? false;
	settings.browseHistory = JSON.parse(localStorage?.browseHistory ?? "[]");

	// normalize legacy date strings and persist the cleanup if anything changed
	var migrated = false;
	settings.browseHistory.forEach(function (entry) {
		if (entry && entry.date) {
			var normalized = normalizeDateString(entry.date);
			if (normalized != entry.date) {
				entry.date = normalized;
				migrated = true;
			}
		}
	});
	if (migrated) saveSettingsToLocalStorage();
	settings.order =
		localStorageSettings?.order ??
		(localStorage.bibleOrder == "chronological" ? "chronological" : "canonical");
	settings.pageturning = localStorageSettings?.pageturning ?? false;

	fireEvent({ name: "settingsUpdated" });
}
loadSettingsFromLocalStorage();

function saveSettingsToLocalStorage() {
	var localStorageSettings = {
		fontSize: settings.fontSize,
		mode: settings.mode,
		spelling: settings.spelling,
		name: settings.name,
		case: settings.case,
		titles: settings.titles,
		footnotes: settings.footnotes,
		references: settings.references,
		verses: settings.verses,
		you: settings.you,
		woc: settings.woc,
		order: settings.order,
		pageturning: settings.pageturning,
		wordStudyLinks: settings.wordStudyLinks,
	};

	localStorage.settings = JSON.stringify(localStorageSettings);
	localStorage.browseHistory = JSON.stringify(settings.browseHistory);
}
