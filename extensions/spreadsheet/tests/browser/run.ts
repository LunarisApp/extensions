import { mkdir } from "node:fs/promises";
await mkdir("../../.context/spreadsheet-qa", { recursive: true });
const server = Bun.spawn(["bun", "tests/browser/serve.ts"], {
	stdout: "inherit",
	stderr: "inherit",
});
try {
	for (let n = 0; n < 100; n++) {
		if (server.exitCode !== null)
			throw new Error("Browser test server failed to start");
		if (
			await fetch("http://localhost:4382/host.js")
				.then((r) => r.ok)
				.catch(() => false)
		)
			break;
		await Bun.sleep(100);
	}
	const files = process.argv.includes("--scale")
		? ["scale.mjs", "import-scale.mjs"]
		: ["smoke.mjs", "formulas.mjs", "structure.mjs", "files.mjs", "import-read.mjs", "layout.mjs"];
	for (const file of files) {
		const test = Bun.spawn(["node", `tests/browser/${file}`], {
			stdout: "inherit",
			stderr: "inherit",
		});
		const result = await test.exited;
		if (result !== 0) {
			process.exitCode = result;
			break;
		}
	}
} finally {
	server.kill();
	await server.exited;
}
