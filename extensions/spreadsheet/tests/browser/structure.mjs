import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
	await page.goto("http://localhost:4382");
	await page.waitForFunction(() => window.ready >= 2, undefined, {
		timeout: 15000,
	});
	const f = page.frames()[1];
	await f
		.locator('canvas[id^="univer-sheet-main-canvas_"]')
		.click({ position: { x: 20, y: 32 }, button: "right" });
	await f
		.getByText(/rows above/)
		.locator("..")
		.click({ position: { x: 8, y: 10 } });
	await page.waitForFunction(
		() => window.book.list()[0].axis("rows").active.length === 101,
		undefined,
		{ timeout: 10000 },
	);
	assert.deepEqual(
		await page.evaluate(() => [
			window.getCell(0, 0),
			window.getCell(1, 0),
			window.getCell(1, 1),
		]),
		[undefined, 10, 20],
	);
	const second = page.frames()[2];
	await second.getByRole("button", { name: "File", exact: true }).click();
	await second.getByLabel("Export as").selectOption("csv");
	await second.getByRole("button", { name: "Export", exact: true }).click();
	await page.waitForFunction(() => window.downloads.length > 0, undefined, {
		timeout: 10000,
	});
	assert.equal(
		await page.evaluate(() =>
			window.downloads.map((b) => new TextDecoder().decode(b)).join(""),
		),
		",,\r\n10,20,30",
	);
	await f
		.locator('canvas[id^="univer-sheet-main-canvas_"]')
		.click({ position: { x: 90, y: 56 } });
	await page.keyboard.press("Meta+z");
	await page.waitForFunction(
		() => window.book.list()[0].axis("rows").active.length === 100,
		undefined,
		{ timeout: 10000 },
	);
	assert.deepEqual(errors, []);
	console.log(
		"UI row insertion, remote formula recalculation, and collaborative undo passed.",
	);
} finally {
	await browser.close();
}
