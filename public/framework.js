

var eventListeners = []


/**
 * 
 * @param {*} filterFunction A function that receives an object and returns boolean if the fireFunction should be called
 * @param {*} fireFunction A function that gets called, passin in the event object if the above filterFunction returns true on it.
 */
function registerEventListener(filterFunction, fireFunction) {
  eventListeners.push({filterFunction, fireFunction})
}


function fireEvent(event) {
  for(var listener of eventListeners) {
    if (listener.filterFunction(event)) {
      listener.fireFunction(event)
    }
  }
}


async function loadComponent(elementId, fileName) {
  var response = await fetch(fileName)
  var text = await response.text()

  document.getElementById(elementId).innerHTML = text
  var scriptRegex = /\<script\>(.*)\<\/script\>/gms
  var matches = scriptRegex.exec(text)
  var script = matches[1]

  var scriptElement = document.createElement("script")
  scriptElement.text = script
  document.body.appendChild(scriptElement)
}