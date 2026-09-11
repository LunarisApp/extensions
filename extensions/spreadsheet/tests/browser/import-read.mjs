import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
	await page.goto("http://localhost:4382/?frames=1");
	await page.waitForFunction(() => window.ready === 1);
	const frame = page.frames()[1];
	await frame.evaluate(() => {
		const original = File.prototype.arrayBuffer;
		File.prototype.arrayBuffer = function () {
			if (this.name === "unreadable.csv")
				return Promise.reject(new Error("File could not be read"));
			if (this.name === "delayed.csv")
				return new Promise((resolve) => {
					window.finishRead = () => resolve(new TextEncoder().encode("Old\n999").buffer);
				});
			return original.call(this);
		};
	});
	const choose = (name, text) => frame.locator('input[type="file"]').setInputFiles({
		name, mimeType: "text/csv", buffer: Buffer.from(text),
	});
	await choose("unreadable.csv", "Value\n42");
	await frame.getByRole("alert").filter({ hasText: "File could not be read" }).waitFor();
	assert.equal(await frame.getByRole("button", { name: "Close", exact: true }).isEnabled(), true);
	await choose("delayed.csv", "Old\n999");
	await frame.getByText("Reading file…", { exact: false }).waitFor();
	assert.equal(await frame.getByRole("button", { name: "Close", exact: true }).isDisabled(), true);
	await frame.getByRole("button", { name: "Cancel", exact: true }).click();
	await frame.getByRole("button", { name: "Cancel", exact: true }).waitFor({ state: "hidden" });
	await choose("current.csv", "Current\n42");
	await frame.getByRole("button", { name: "Create workbook", exact: true }).waitFor();
	await frame.evaluate(async () => {
		window.finishRead();
		await new Promise((resolve) => setTimeout(resolve, 100));
	});
	assert.equal(await frame.locator(".spreadsheet-preview").getByText("Current", { exact: true }).count(), 1);
	assert.equal(await frame.locator(".spreadsheet-preview").getByText("999", { exact: true }).count(), 0);
	assert.deepEqual(errors, []);
	console.log("File-read errors recover; cancelled reads cannot overwrite a newer preview.");
} finally {
	await browser.close();
}
