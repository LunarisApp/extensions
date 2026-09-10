import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const server = await chromium.launchServer({ headless: true });
const browser = await chromium.connect(server.wsEndpoint());
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
function memory() {
	const processes = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], {
		encoding: "utf8",
	})
		.trim()
		.split("\n")
		.map((s) => s.trim().split(/\s+/).map(Number));
	const ids = new Set([server.process().pid]);
	for (let i = 0; i < 5; i++)
		for (const [pid, parent] of processes) if (ids.has(parent)) ids.add(pid);
	return (
		processes
			.filter(([id]) => ids.has(id))
			.reduce((sum, row) => sum + row[2], 0) / 1024
	);
}
try {
	const baseline = memory(),
		start = Date.now();
	await page.goto("http://localhost:4382/?rows=100000&frames=1", {
		timeout: 45000,
	});
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 45000,
	});
	const f = page.frames()[1];
	await f.waitForFunction(
		() => [...document.querySelectorAll("canvas")].some((c) => c.height > 400),
		undefined,
		{ timeout: 45000 },
	);
	const readyMs = Date.now() - start;
	console.log("ready", readyMs, "memoryMiB", memory() - baseline);
	await page.waitForTimeout(2000);
	await f.locator('[data-calculating="false"]').waitFor({ timeout: 45000 });
	const calculatedMs = Date.now() - start;
	const memoryMiB = memory() - baseline;
	await f.evaluate(() => {
		window.feedback = [];
		document.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Enter") {
					const start = performance.now();
					requestAnimationFrame(() =>
						requestAnimationFrame(() =>
							window.feedback.push(performance.now() - start),
						),
					);
				}
			},
			true,
		);
	});
	await f
		.locator('canvas[id^="univer-sheet-main-canvas_"]')
		.click({ position: { x: 90, y: 32 } });
	for (let i = 0; i < 20; i++) {
		await page.keyboard.type(String(55 + i));
		await page.keyboard.press("Enter");
		try {
			await page.waitForFunction(
				({ row, value }) => String(window.getCell(row, 0)) === String(value),
				{ row: i, value: 55 + i },
				{ timeout: 10000 },
			);
		} catch (error) {
			console.log(
				"failed edit",
				i,
				await page.evaluate(() => ({
					cells: Array.from({ length: 3 }, (_, r) =>
						Array.from({ length: 3 }, (_, c) => window.getCell(r, c)),
					),
					calls: window.calls.slice(-10),
				})),
				(await f.locator("body").innerText()).slice(0, 800),
				errors,
			);
			await page.screenshot({
				path: "../../.context/spreadsheet-qa/scale-failure.png",
			});
			throw error;
		}
	}
	await f.waitForFunction(() => window.feedback.length >= 20);
	const feedback = await f.evaluate(() =>
		window.feedback.sort((a, b) => a - b),
	);
	await page.mouse.move(700, 500);
	const frames = f.evaluate(
		() =>
			new Promise((resolve) => {
				const times = [],
					drawn = new Set();
				let frame = 0,
					previous = performance.now();
				const start = previous,
					until = start + 2000;
				const canvas = document.querySelector(
						'canvas[id^="univer-sheet-main-canvas_"]',
					),
					context = canvas.getContext("2d");
				const originals = {};
				for (const method of ["clearRect", "drawImage", "fillRect"]) {
					originals[method] = context[method];
					context[method] = function (...args) {
						drawn.add(frame);
						return originals[method].apply(this, args);
					};
				}
				function tick(now) {
					times.push(now - previous);
					previous = now;
					frame++;
					if (now < until) requestAnimationFrame(tick);
					else {
						for (const method in originals) context[method] = originals[method];
						resolve({ times, canvasFps: (drawn.size * 1000) / (now - start) });
					}
				}
				requestAnimationFrame(tick);
			}),
	);
	for (let i = 0; i < 150; i++) {
		await page.mouse.wheel(0, 120);
	}
	const { times: frameTimes, canvasFps } = await frames;
	const deltaSizes = await page.evaluate(() =>
		window.calls
			.filter((c) => c.method === "yjs.applyUpdate")
			.map((c) => c.size),
	);
	const editMs = feedback[18];
	console.log(
		JSON.stringify(
			{
				readyMs,
				calculatedMs,
				incrementalBrowserRssMiB: memoryMiB,
				maxOneCellUpdateBytes: Math.max(...deltaSizes),
				scope:
					"Actual sandbox plus host simulator; keydown to two animation frames, 20 edits; rAF during wheel scrolling",
				editFeedbackP95Ms: editMs,
				canvasScrollFps: canvasFps,
				scrollingAnimationFps:
					1000 / (frameTimes.reduce((a, b) => a + b) / frameTimes.length),
				errors,
			},
			null,
			2,
		),
	);
	await page.screenshot({ path: "../../.context/spreadsheet-qa/scale.png" });
} finally {
	await browser.close();
	await server.close();
}
