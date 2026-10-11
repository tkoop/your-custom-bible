importScripts(
	"https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js"
);

workbox.routing.registerRoute(
	new RegExp("/.*"),
	new workbox.strategies.NetworkFirst()
);

// A plan notification was tapped: open the app, which lands on the home page and
// from there the reader can tap the plan's Read today button.
self.addEventListener("notificationclick", function (event) {
	event.notification.close();
	event.waitUntil(
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(
			function (windowClients) {
				for (var i = 0; i < windowClients.length; i++) {
					var client = windowClients[i];
					if ("focus" in client) return client.focus();
				}
				if (clients.openWindow) return clients.openWindow("./");
				return undefined;
			},
		),
	);
});
