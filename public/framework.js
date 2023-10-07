

function loadElement(elementId, url) {
  document.getElementById(elementId).innerHTML = ""
  
  fetch(url).then(response => response.text()).then(html => {
//    document.getElementById(elementId).innerHTML = html
    const page = document.createElement(html);
    // document.body.appendChild(para);
    document.getElementById(elementId).appendChild(page)
  })

}


function showPage(page) {
  document.querySelectorAll(".page").forEach(e => e.style.display = "none")
  document.getElementById(page).style.display = "block"
  window.scrollTo(0, 0)
}




if (window.location.hostname != "localhost") {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./serviceWorker.js', {
        scope: "./"
      }).then(function (registration) {
        console.log('ServiceWorker registered successfully, scope: ', registration.scope);
      }, function (err) {
        console.log('ServiceWorker registration failed: ', err);
      });
      window.IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches;
    });
  }
}


window.addEventListener('popstate', (event) => {
  if (event.state == null || event.state == "index") {
    showPage("index")
  } else if (event.state == "history") {
    showPage("history")
  } else {
    loadURL(event.state)
  }
})
