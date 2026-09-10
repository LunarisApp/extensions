import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const server = await chromium.launchServer({ headless: true });
const browser = await chromium.connect(server.wsEndpoint());
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
function memory() {
	const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], {
		encoding: "utf8",
	})
		.trim()
		.split("\n")
		.map((s) => s.trim().split(/\s+/).map(Number));
	const ids = new Set([server.process().pid]);
	for (let i = 0; i < 5; i++)
		for (const [id, parent] of rows) if (ids.has(parent)) ids.add(id);
	return (
		rows.filter(([id]) => ids.has(id)).reduce((sum, row) => sum + row[2], 0) /
		1024
	);
}
let timer;
try {
	const baseline = memory();
	let peak = baseline;
	timer = setInterval(() => {
		peak = Math.max(peak, memory());
	}, 200);
	await page.goto("http://localhost:4382/?frames=1");
	await page.waitForFunction(() => window.ready >= 1, undefined, {
		timeout: 30000,
	});
	const f = page.frames()[1];
	const start = Date.now();
	await f
		.locator("input[type=file]")
		.setInputFiles("../../.context/spreadsheet-qa/large.lunaris.json");
	await f
		.getByRole("button", { name: "Create workbook", exact: true })
		.waitFor({ timeout: 120000 });
	const previewMs = Date.now() - start;
	const previewPeakMiB = peak - baseline;
	await f.getByRole("button", { name: "Create workbook", exact: true }).click();
	await page.waitForFunction(() => window.createdPayload, undefined, {
		timeout: 120000,
	});
	clearInterval(timer);
	console.log(
		JSON.stringify(
			{
				previewMs,
				previewPeakMiB,
				totalImportMs: Date.now() - start,
				peakIncrementalBrowserRssMiB: peak - baseline,
				errors,
			},
			null,
			2,
		),
	);
} finally {
	clearInterval(timer);
	await browser.close();
	await server.close();
}
