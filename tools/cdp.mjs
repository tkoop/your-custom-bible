// A small Chrome DevTools Protocol driver, for verifying browser behaviour when
// Cypress cannot run.
//
// AGENTS.md already notes that Xvfb is missing on this machine, so Cypress will
// not start and the browser checks have to happen another way. This is that way:
// it launches headless Chromium, connects, and lets a script navigate and ask
// the page questions.
//
// It uses Node's own WebSocket rather than a dependency, and speaks just enough
// CDP to open a page and evaluate an expression in it.
//
//   const browser = await launch();
//   try {
//     const page = await browser.page();
//     await page.goto("http://127.0.0.1:8000/");
//     console.log(await page.evaluate("document.title"));
//   } finally {
//     await browser.close();
//   }

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROMIUM_CANDIDATES = [
	process.env.CHROMIUM_PATH,
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
].filter(Boolean);

function findChromium() {
	for (const candidate of CHROMIUM_CANDIDATES) {
		if (existsSync(candidate)) return candidate;
	}
	throw new Error("no chromium found; set CHROMIUM_PATH");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({ port = 9222 + Math.floor(Math.random() * 400) } = {}) {
	const binary = findChromium();
	const profile = mkdtempSync(join(tmpdir(), "cdp-profile-"));

	const child = spawn(
		binary,
		[
			"--headless=new",
			"--disable-gpu",
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--remote-debugging-port=" + port,
			"--user-data-dir=" + profile,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	// Chromium needs a moment before it answers on the debugging port.
	let target = null;
	for (let attempt = 0; attempt < 100; attempt++) {
		await wait(100);
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/list`);
			const targets = await response.json();
			target = targets.find((t) => t.type === "page");
			if (target) break;
		} catch (e) {}
	}
	if (!target) {
		child.kill();
		throw new Error("chromium never offered a debugging target");
	}

	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", reject, { once: true });
	});

	let nextId = 1;
	const pending = new Map();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const { resolve, reject } = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result);
		}
	});

	function send(method, params = {}) {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			socket.send(JSON.stringify({ id, method, params }));
		});
	}

	await send("Page.enable");
	await send("Runtime.enable");

	const page = {
		async goto(url) {
			await send("Page.navigate", { url });
			// Wait for the document to be ready rather than guessing.
			for (let attempt = 0; attempt < 100; attempt++) {
				await wait(100);
				const state = await page.evaluate("document.readyState");
				if (state === "complete") return;
			}
			throw new Error("the page never finished loading: " + url);
		},

		async evaluate(expression) {
			const result = await send("Runtime.evaluate", {
				expression:
					typeof expression === "function"
						? `(${expression})()`
						: expression,
				awaitPromise: true,
				returnByValue: true,
			});
			if (result.exceptionDetails) {
				const description =
					result.exceptionDetails.exception?.description ||
					result.exceptionDetails.text;
				throw new Error("in the page: " + description);
			}
			return result.result.value;
		},

		/** Waits for an expression to become truthy. */
		async waitFor(expression, { timeout = 10000, label } = {}) {
			const started = Date.now();
			while (Date.now() - started < timeout) {
				if (await page.evaluate(expression)) return true;
				await wait(100);
			}
			throw new Error("timed out waiting for " + (label || expression));
		},
	};

	return {
		page,
		async close() {
			try {
				socket.close();
			} catch (e) {}
			child.kill();
			await wait(100);
			try {
				rmSync(profile, { recursive: true, force: true });
			} catch (e) {}
		},
	};
}