import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text().slice(0, 300));
});
await page.goto("http://localhost:4382");
await page.waitForFunction(() => window.ready >= 2, undefined, {
	timeout: 15000,
});
await page.waitForTimeout(1000);
const frames = page.frames().slice(1);
await frames[0]
	.locator('canvas[id^="univer-sheet-main-canvas_"]')
	.click({ position: { x: 90, y: 32 } });
await page.keyboard.type("55");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log(
	"after edit",
	await page.evaluate(() => ({
		value: window.getCell(0, 0),
		calls: window.calls,
		failures: window.failures,
	})),
	errors,
);
await frames[1]
	.locator('canvas[id^="univer-sheet-main-canvas_"]')
	.click({ position: { x: 190, y: 32 } });
await page.keyboard.type("7");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log(
	"second edit",
	await page.evaluate(() => ({
		a: window.getCell(0, 0),
		b: window.getCell(0, 1),
	})),
	errors,
);
await frames[0].locator("select").first().selectOption("csv");
await frames[0].getByRole("button", { name: "Export", exact: true }).click();
await page.waitForFunction(() => window.downloads.length > 0, undefined, {
	timeout: 10000,
});
assert.deepEqual(
	await page.evaluate(() => [window.getCell(0, 0), window.getCell(0, 1)]),
	[55, 7],
);
assert.equal(
	await page.evaluate(() => new TextDecoder().decode(window.downloads[0])),
	"55,7,62",
);
await frames[0]
	.locator('canvas[id^="univer-sheet-main-canvas_"]')
	.click({ position: { x: 390, y: 32 } });
await page.keyboard.type("TRUE");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.getCell(0, 3) === true);
await page.evaluate(() => (window.downloads.length = 0));
await frames[1].locator("select").first().selectOption("csv");
await frames[1].getByRole("button", { name: "Export", exact: true }).click();
await page.waitForFunction(() => window.downloads.length > 0);
assert.equal(
	await page.evaluate(() => new TextDecoder().decode(window.downloads[0])),
	"55,7,62,true",
);
assert.deepEqual(errors, []);
console.log(
	"export",
	await page.evaluate(() =>
		window.downloads.map((b) => new TextDecoder().decode(b)),
	),
	errors,
);
await page.screenshot({
	path: "../../.context/spreadsheet-qa/edited.png",
	fullPage: true,
});
await browser.close();
