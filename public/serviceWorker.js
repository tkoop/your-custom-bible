importScripts(
	"https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js"
);

workbox.routing.registerRoute(
	new RegExp("/.*"),
	new workbox.strategies.NetworkFirst()
);

// A push arrives here. What it says was worked out by the server from the same
// subscription the reader's own pages use - server/Schedule.php is plans.js's
// arithmetic ported, and resources/planFixture.json keeps the two agreeing - so
// the body is simply shown.
//
// This was once a TimestampTrigger: the browser scheduled the notification
// itself at a time the reader chose. Firing from the server instead is what
// makes it arrive with the app closed, and on a phone.
self.addEventListener("push", function (event) {
	var payload = {};
	if (event.data) {
		try {
			payload = event.data.json();
		} catch (e) {
			// A push with no usable body still deserves a notification rather
			// than being dropped silently.
			payload = {};
		}
	}
	var data = payload.data || {};
	var title = payload.title || "Your Custom Bible";
	var options = {
		body: payload.body || "",
		icon: "images/logo.png",
		badge: "images/logo.png",
		// One notification per subscription: a second day's nudge replaces the
		// last rather than stacking up, and tagging by subscription keeps two
		// plans from overwriting each other.
		tag: payload.tag || (data.subscriptionId ? "plan-" + data.subscriptionId : "ycb-push"),
		renotify: true,
		data: data,
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

// A plan notification was tapped: open the app, which lands on the home page and
// from there the reader can tap the plan's Read today button.
self.addEventListener("notificationclick", function (event) {
	event.notification.close();
	var target = event.notification.data && event.notification.data.url;
	event.waitUntil(
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(
			function (windowClients) {
				for (var i = 0; i < windowClients.length; i++) {
					var client = windowClients[i];
					if ("focus" in client) {
						// A window that is already open: bring it forward rather
						// than opening a second copy of the app.
						if (client.navigate && target) {
							return client.navigate(target).then(function (navigated) {
								return navigated ? navigated.focus() : client.focus();
							});
						}
						return client.focus();
					}
				}
				if (clients.openWindow) return clients.openWindow(target || "./");
				return undefined;
			},
		),
	);
});