


var settings = {
  browseHistory: [],
  fontSize: 16,
  darkMode: false,
  spelling: "ca",
  name: "Yahweh",
  case: "upper",
  titles: false,
  footnotes: false,
  references: false,
  verses: false,
  you: "youpl",
}


registerEventListener(e=>e.name=="addBrowseHistory", function(event) {
  settings.browseHistory.push(event.data)
  saveSettingsToLocalStorage()
})



registerEventListener(e=>e.name=="setSetting", function(event) {
  settings[event.setting] = event.value

  fireEvent({name:"settingsUpdated"})
  saveSettingsToLocalStorage()
})

function loadSettingsFromLocalStorage() {
  var localStorageSettings = JSON.parse(localStorage?.settings ?? "{}")

  settings.fontSize = localStorageSettings?.fontSize ?? 16
  settings.darkMode = (localStorageSettings.mode == "dark")
  settings.spelling = localStorageSettings?.spelling  ?? "ca"
  settings.name = localStorageSettings?.name  ?? "Yaweh"
  settings.case = localStorageSettings?.case  ?? "lower"
  settings.titles = localStorageSettings?.titles  ?? false
  settings.footnotes = localStorageSettings?.footnotes  ?? false
  settings.references = localStorageSettings?.references  ?? false
  settings.verses = localStorageSettings?.verses  ?? false
  settings.you = localStorageSettings?.you  ?? "youpl"
  settings.browseHistory = JSON.parse(localStorage?.browseHistory ?? "[]")

  fireEvent({name:"settingsUpdated"})
}
loadSettingsFromLocalStorage()


function saveSettingsToLocalStorage() {
  var localStorageSettings = {
    fontSize: settings.fontSize,
    darkMode: settings.darkMode,
    spelling: settings.spelling,
    name: settings.name,
    case: settings.case,
    titles: settings.titles,
    footnotes: settings.footnotes,
    references: settings.references,
    verses: settings.verses,
    you: settings.you,
  }

  localStorage.settings = JSON.stringify(localStorageSettings)
  localStorage.browseHistory = JSON.stringify(settings.browseHistory)
}
