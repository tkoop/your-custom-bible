// Server-side push for reading plans.
//
// A subscription with a notifyTime set is kept in step with the server, which
// holds a push subscription and sends the day's reading from cron. This file is
// only the transport: what a reminder says is worked out by plans.js here and
// by server/Schedule.php there, from the same subscription.
//
// What the server stores is a snapshot, not a diff. Every sync sends the whole
// list, and anything missing from it is deleted server-side, so turning a
// reminder off - or clearing this browser's storage entirely - takes effect on
// the next load without anything having to be told which of those happened.
//
// ASCII only, like the other files in public/: these are <script src> tags and
// index.html's <meta name="encoding"> is not the charset the spec wants, so a
// non-ASCII character here reaches the browser mangled.

// Where the API lives. It is a sibling of public/ in the repository, so the
// default suits a document root that is the checkout itself. An app served
// from public/ as the document root needs the override, because "server/" then
// resolves inside public/ where there is no server directory:
//
//   window.YCB_PUSH_API = "/server/push.php";
//
// It is read at call time, so setting it after load is fine - which is what the
// tests do.
function pushApiBase() {
	return window.YCB_PUSH_API || "server/push.php";
}

function pushApi(action) {
	return pushApiBase() + "?action=" + action;
}

// Whether this browser can be sent a push at all. iOS only allows it to an app
// that has been added to the Home Screen, which is why this is asked at the
// moment the reader asks for a reminder rather than at load.
function pushSupported() {
	return (
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

// The server's VAPID public key, kept in localStorage because it cannot change
// without invalidating every subscription.
function pushPublicKey() {
	var cached = null;
	try {
		cached = localStorage.pushPublicKey;
	} catch (e) {}
	if (cached) return Promise.resolve(cached);
	return fetch(pushApi("key"))
		.then(function (response) {
			if (!response.ok) throw new Error("the push key request failed");
			return response.json();
		})
		.then(function (body) {
			try {
				localStorage.pushPublicKey = body.publicKey;
			} catch (e) {}
			return body.publicKey;
		});
}

// applicationServerKey is a Uint8Array; the key arrives as base64url.
function pushKeyBytes(base64) {
	var padded = base64.replace(/-/g, "+").replace(/_/g, "/");
	while (padded.length % 4) padded += "=";
	var raw = window.atob(padded);
	var bytes = new Uint8Array(raw.length);
	for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

function pushRegistration() {
	// getRegistration rather than navigator.serviceWorker.ready: ready never
	// settles when there is no registration at all, which is the case on
	// localhost (the app skips registering there) and whenever registration has
	// failed. A promise that never settles would leave a reader's reminder
	// half-turned-on.
	return navigator.serviceWorker
		.getRegistration()
		.then(function (registration) {
			return registration || null;
		})
		.catch(function () {
			return null;
		});
}

// Asks for permission and subscribes, returning the browser's push
// subscription or null. A refusal is not an error: the caller drops the
// setting so the bell shows off rather than promising a nudge that cannot
// arrive.
function pushSubscribe() {
	if (!pushSupported()) return Promise.resolve(null);
	return pushRegistration()
		.then(function (registration) {
			if (!registration) return null;
			return pushPublicKey().then(function (key) {
				return registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: pushKeyBytes(key),
				});
			});
		})
		.catch(function (error) {
			// Already subscribed is the normal case when the bell is turned on
			// for a second plan, so it is not worth reporting.
			if (error && error.name === "NotAllowedError") return null;
			console.warn("push subscribe failed:", error);
			return null;
		});
}

// The reader's own timezone, which is what decides when "08:00" is. Without it
// the server would send at its own idea of the reader's morning.
function pushTimeZone() {
	try {
		var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		// Some browsers answer "undefined" or "UTC" for a zone they cannot name.
		if (zone && zone !== "undefined") return zone;
	} catch (e) {}
	return "UTC";
}

// Every reminder this reader currently has: each subscription carrying a
// notifyTime, with the plan it points at. The plan goes with it so the server
// can work out what is being read - which is also how a reader's own plans,
// which exist only in this browser, can have reminders at all.
function pushReminders() {
	var reminders = [];
	planSubscriptions().forEach(function (subscription) {
		if (!notifyEnabled(subscription)) return;
		var plan = subscriptionPlan(subscription);
		if (!plan) return;
		reminders.push({
			subscriptionId: subscription.id,
			plan: plan,
			order: subscriptionOrder(subscription),
			start: subscription.start,
			notifyTime: notifyTime(subscription),
			timezone: pushTimeZone(),
			days: subscription.days || "",
		});
	});
	return reminders;
}

// Sends the whole list to the server.
//
// A sync happens whenever a reminder is turned on or off, and once at load so
// that a reader who has cleared their storage, or opened the app on another
// device, stops being reminded. It is debounced because plansUpdated also fires
// when a page re-reads the list, and that must not turn into a request each
// time.
var pushSyncTimer = null;
var pushSyncPending = false;

function pushSync() {
	pushSyncPending = true;
	if (pushSyncTimer) clearTimeout(pushSyncTimer);
	pushSyncTimer = setTimeout(function () {
		pushSyncTimer = null;
		pushSyncNow();
	}, 1500);
}

function pushSyncNow() {
	if (!pushSyncPending) return;
	pushSyncPending = false;
	if (!pushSupported()) return;

	// There is nothing to subscribe the server to until a push subscription
	// exists, and asking for one would raise the permission prompt at load,
	// which is not a thing to do to someone who never asked for a reminder.
	return pushRegistration()
		.then(function (registration) {
			return registration ? registration.pushManager.getSubscription() : null;
		})
		.then(function (subscription) {
			if (!subscription) {
				// No subscription but reminders on record: they have been turned
				// off somewhere, and the server should hear about it.
				if (pushReminders().length === 0) {
					try {
						localStorage.pushEverSynced = "1";
					} catch (e) {}
					return null;
				}
				return null;
			}
			var body = {
				reminders: pushReminders().map(function (reminder) {
					reminder.subscription = subscription.toJSON();
					return reminder;
				}),
			};
			try {
				localStorage.pushEverSynced = "1";
			} catch (e) {}
			return fetch(pushApi("sync"), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}).then(function (response) {
				if (!response.ok) {
					throw new Error("the push sync was refused: " + response.status);
				}
			});
		})
		.catch(function (error) {
			// A server that is down, or an app being served without it, must not
			// take the reading plans with it.
			console.warn("push sync failed:", error);
		});
}

// Whether this browser already has a push subscription, for the UI to say so.
function pushSubscribed() {
	if (!pushSupported()) return Promise.resolve(false);
	return pushRegistration()
		.then(function (registration) {
			return registration ? registration.pushManager.getSubscription() : null;
		})
		.then(function (subscription) {
			return !!subscription;
		})
		.catch(function () {
			return false;
		});
}
// Turns reminders off from this browser: the push subscription is dropped and
// the server is told to forget everything, in that order.
//
// The server is told with an empty snapshot rather than left to time out. A
// push service only reports a dead subscription when something is next sent to
// it, which for a reader who has quietly removed the app could be never - so
// without this they would keep being reminded at 8am by a browser that is no
// longer listening.
function pushForget() {
	if (!pushSupported()) return Promise.resolve();
	return pushRegistration()
		.then(function (registration) {
			if (!registration) return null;
			return registration.pushManager
				.getSubscription()
				.then(function (subscription) {
					if (!subscription) return null;
					return subscription.unsubscribe();
				})
				.catch(function () {
					return null;
				});
		})
		.then(function () {
			// The snapshot is empty, so everything is removed server-side. A
			// failure here is not worth reporting: the subscription is already
			// gone, so the next push service response will clean up anyway.
			return fetch(pushApi("sync"), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reminders: [] }),
			}).catch(function () {});
		});
}
