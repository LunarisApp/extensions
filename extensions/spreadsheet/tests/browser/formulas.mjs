import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
	await page.goto("http://localhost:4382/?scenario=formulas&frames=1");
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 30000,
	});
	const frame = page.frames()[1];
	await frame.locator("select").first().selectOption("csv");
	await frame.getByRole("button", { name: "Export", exact: true }).click();
	await page.waitForFunction(() => window.downloads.length > 0, undefined, {
		timeout: 30000,
	});
	const csv = await page.evaluate(() =>
		window.downloads.map((b) => new TextDecoder().decode(b)).join(""),
	);
	console.log(csv);
	const values = csv.split("\r\n").map((line) => line.split(",")[3]);
	assert.deepEqual(values.slice(0, 7), [
		"6",
		"true",
		"Beta",
		"45351",
		"2024",
		"Al",
		"#DIV/0!",
	]);
	assert.match(values[7], /#/);
	assert.equal(values[8], "10");
	assert.equal(values[9], "#NAME?");
	assert.equal(values[10], "#CYCLE!");
	assert.deepEqual(errors, []);
	console.log(
		"Formula worker: aggregates, comparisons, logic, lookup, leap date, text, errors, cycle, cross-sheet and unsupported function passed.",
	);
} finally {
	await browser.close();
}
