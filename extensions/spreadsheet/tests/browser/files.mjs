import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
	await page.goto("http://localhost:4382/?frames=1&dark");
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 30000,
	});
	let frame = page.frames()[1];
	await frame.locator("input[type=file]").setInputFiles({
		name: "cancel.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(
			"id,value\n" + ("x".repeat(100) + ",42\n").repeat(99999),
		),
	});
	await frame.getByRole("button", { name: "Cancel", exact: true }).click();
	await frame
		.getByRole("button", { name: "Cancel", exact: true })
		.waitFor({ state: "hidden" });
	assert.equal(
		await frame
			.getByRole("button", { name: "Create workbook", exact: true })
			.count(),
		0,
	);
	await frame.locator("input[type=file]").setInputFiles({
		name: "identifiers.tsv",
		mimeType: "text/tab-separated-values",
		buffer: Buffer.from("ID\tAmount\n00123\t42\n=SUM(A1:A2)\t12"),
	});
	await frame
		.getByRole("button", { name: "Create workbook", exact: true })
		.waitFor({ timeout: 10000 })
		.catch(async (error) => {
			console.log(await frame.locator("body").innerText(), errors);
			throw error;
		});
	assert.equal(await frame.getByLabel("Delimiter").inputValue(), "\t");
	assert.equal(
		await frame
			.locator(".spreadsheet-preview")
			.getByText("00123", { exact: true })
			.count(),
		1,
	);
	await page.screenshot({
		path: "../../.context/spreadsheet-qa/import-dark.png",
	});
	await frame
		.getByRole("button", { name: "Create workbook", exact: true })
		.click();
	await page.waitForFunction(() => window.createdPayload);
	assert.equal(
		await page.evaluate(() => window.createdPayload.name),
		"identifiers",
	);
	assert.equal(await page.evaluate(() => window.getCell(0, 0)), 10);
	assert.equal(
		await page.evaluate(() => window.importedBook.list()[0].input(1, 0)),
		"00123",
	);
	await page.setViewportSize({ width: 480, height: 850 });
	await page.screenshot({ path: "../../.context/spreadsheet-qa/narrow.png" });
	await page.goto("http://localhost:4382/?frames=1&readonly&save-error");
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 30000,
	});
	frame = page.frames()[1];
	assert.equal(
		await frame
			.getByRole("button", { name: "Import file", exact: true })
			.isDisabled(),
		true,
	);
	await frame.getByText("Read-only", { exact: true }).waitFor();
	await frame
		.locator('canvas[id^="univer-sheet-main-canvas_"]')
		.click({ position: { x: 90, y: 32 } });
	await page.keyboard.type("77");
	await page.keyboard.press("Enter");
	assert.equal(await page.evaluate(() => window.getCell(0, 0)), 10);
	await page.goto("http://localhost:4382/?frames=1&save-error");
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 30000,
	});
	await page.frames()[1].getByText("Could not save", { exact: true }).waitFor();
	assert.deepEqual(errors, []);
	console.log(
		"TSV preview, identifier preservation, new-resource import, dark/narrow rendering, and read-only controls passed.",
	);
} finally {
	await browser.close();
}
