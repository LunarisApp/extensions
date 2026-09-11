import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
	await page.goto("http://localhost:4382/?frames=1");
	await page.waitForFunction(() => window.ready === 1);
	const frame = page.frames()[1];
	const fileButton = frame.getByRole("button", { name: "File", exact: true });

	// Large host text must keep the File control and overlay below the real ribbon.
	await frame.evaluate(() => {
		document.documentElement.style.fontSize = "24px";
	});
	await fileButton.click();
	const header = await frame.locator('[data-u-comp="headerbar"]').boundingBox();
	const toolbar = await frame.locator(".spreadsheet-toolbar").boundingBox();
	assert.equal(toolbar.height, header.height);
	await page.keyboard.press("Escape");
	await frame.locator('input[type="file"]').setInputFiles({
		name: "preview.csv",
		mimeType: "text/csv",
		buffer: Buffer.from("ID,Value\n001,42"),
	});
	await frame
		.getByRole("button", { name: "Create workbook", exact: true })
		.waitFor();
	const panel = await frame.locator(".spreadsheet-import").boundingBox();
	assert.ok(panel.y >= header.y + header.height);
	await page.screenshot({
		path: "../../.context/spreadsheet-qa/review-scaled.png",
	});

	// Shift+Tab used to land in Univer's invisible editor behind the mobile panel.
	await frame.evaluate(() => {
		document.documentElement.style.fontSize = "16px";
	});
	await page.setViewportSize({ width: 390, height: 800 });
	await frame.getByRole("button", { name: "Close", exact: true }).focus();
	await page.keyboard.press("Shift+Tab");
	assert.equal(
		await frame.evaluate(
			() => !!document.activeElement.closest(".spreadsheet-editor"),
		),
		false,
	);
	await page.keyboard.type("77");
	assert.equal(await page.evaluate(() => window.getCell(0, 0)), 10);
	await frame.getByRole("button", { name: "Close", exact: true }).click();
	await frame
		.locator('canvas[id^="univer-sheet-main-canvas_"]')
		.click({ position: { x: 90, y: 32 } });
	await page.keyboard.type("55");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => window.getCell(0, 0) === 55);

	// A short split pane must allow scrolling to Export inside the File popover.
	await page.locator("iframe").evaluate((element) => {
		element.style.height = "200px";
	});
	await fileButton.click();
	const menu = await frame
		.locator(".spreadsheet-file-menu")
		.evaluate((element) => ({
			bottom: element.getBoundingClientRect().bottom,
			height: innerHeight,
			scrollable: element.scrollHeight > element.clientHeight,
		}));
	assert.ok(menu.bottom <= menu.height);
	assert.ok(menu.scrollable);
	await frame.getByLabel("Export as").selectOption("csv");
	await frame.getByRole("button", { name: "Export", exact: true }).click();
	await page.waitForFunction(() => window.downloads.length > 0);
	await frame
		.getByRole("button", { name: "Cancel", exact: true })
		.waitFor({ state: "hidden" });

	// Exercise the notification container with an unusually long error payload.
	await frame.locator(".spreadsheet-notices").evaluate((element) => {
		const notice = document.createElement("div");
		notice.className = "spreadsheet-notice";
		notice.textContent = "A long conversion failure. ".repeat(500);
		element.append(notice);
	});
	const overflow = await frame.evaluate(() => {
		const notices = document.querySelector(".spreadsheet-notices");
		return {
			page: document.documentElement.scrollHeight > innerHeight,
			scrollable: notices.scrollHeight > notices.clientHeight,
		};
	});
	assert.equal(overflow.page, false);
	assert.equal(overflow.scrollable, true);
	assert.deepEqual(errors, []);
	console.log(
		"Large text, hidden-grid focus, short-pane export, and notification overflow passed.",
	);
} finally {
	await browser.close();
}
