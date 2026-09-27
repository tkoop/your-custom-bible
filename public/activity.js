// Activity types label why a chapter is being read. The current one is stored
// in settings.activity and copied onto every history entry, so a session of
// reading can be told apart at a glance on the history page. The first entry is
// the fallback: history recorded before activity types existed has no id, and
// reads as "Default". Colours live in style.css (.act-<id>), so the palette
// can differ per theme.
var ACTIVITY_TYPES = [
	{ id: "default", label: "Default" },
	{ id: "cotd", label: "COTD" },
	{ id: "devotions", label: "Devotions" },
	{ id: "biblestudy", label: "Bible Study" },
	{ id: "church", label: "Church" },
	{ id: "other1", label: "Other 1" },
	{ id: "other2", label: "Other 2" },
	{ id: "other3", label: "Other 3" },
];

function activityType(id) {
	for (var i = 0; i < ACTIVITY_TYPES.length; i++) {
		if (ACTIVITY_TYPES[i].id == id) return ACTIVITY_TYPES[i];
	}
	return ACTIVITY_TYPES[0];
}

function isActivityType(id) {
	return ACTIVITY_TYPES.some(function (type) {
		return type.id == id;
	});
}

function activityLabel(id) {
	return activityType(id).label;
}

function activityClass(id) {
	return "act-" + activityType(id).id;
}

function fillActivitySelect(select) {
	if (select.dataset.activityFilled) return;
	select.innerHTML = "";
	ACTIVITY_TYPES.forEach(function (type) {
		var option = document.createElement("option");
		option.value = type.id;
		option.textContent = type.label;
		select.appendChild(option);
	});
	select.dataset.activityFilled = "true";
	// the dropdowns are dismissed by a window click handler
	select.addEventListener("click", function (event) {
		event.stopPropagation();
	});
	select.addEventListener("change", function () {
		fireEvent({ name: "setSetting", setting: "activity", value: this.value });
	});
}

// Keeps every activity control on the page (the gear dropdown, the home page
// and the index page) showing the current setting, whichever one changed it.
function applyActivityControls() {
	document.querySelectorAll(".activity-picker").forEach(function (picker) {
		picker.className = "activity-picker " + activityClass(settings.activity);
	});
	document.querySelectorAll("select.activity-select").forEach(function (select) {
		fillActivitySelect(select);
		select.className = "activity-select " + activityClass(settings.activity);
		if (select.value != settings.activity) select.value = settings.activity;
	});
}

function activityPicker() {
	var picker = document.createElement("div");
	picker.className = "activity-picker";
	picker.setAttribute("data-cy", "activityPicker");

	var label = document.createElement("span");
	label.className = "activity-picker-label";
	label.textContent = "Activity";
	picker.appendChild(label);

	var select = document.createElement("select");
	select.className = "activity-select";
	select.setAttribute("aria-label", "Activity type");
	picker.appendChild(select);
	fillActivitySelect(select);

	return picker;
}

// Mounts the small top-right activity selector onto a page. Calling it again
// for the same container leaves the existing one in place.
function mountActivityPicker(container) {
	if (!container || container.firstChild) return;
	container.appendChild(activityPicker());
	applyActivityControls();
}

registerEventListener(
	(e) => e.name == "settingsUpdated",
	function () {
		applyActivityControls();
	},
);
