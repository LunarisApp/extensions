import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// Allows integration testing before the coordinated SDK 0.11 release. Do not
// commit a lockfile containing a developer's local filesystem dependency.
const sdk = process.argv[2];
if (!sdk)
	throw new Error(
		"Usage: bun run install:local-sdk /path/to/lunaris/packages/plugin-sdk",
	);
const sdkPath = path.resolve(sdk);
const sdkPackage = JSON.parse(
	await readFile(path.join(sdkPath, "package.json"), "utf8"),
);
if (
	sdkPackage.name !== "@lunarisapp/plugin-sdk" ||
	sdkPackage.version !== "0.11.0"
)
	throw new Error("Expected the coordinated plugin-sdk 0.11.0 checkout");
const build = Bun.spawnSync(["bun", "run", "build"], {
	cwd: sdkPath,
	stdout: "inherit",
	stderr: "inherit",
});
if (build.exitCode !== 0) process.exit(build.exitCode);
const original = await readFile("package.json", "utf8");
const lock = await readFile("bun.lock").catch(() => undefined);
try {
	const manifest = JSON.parse(original);
	manifest.dependencies["@lunarisapp/plugin-sdk"] = `file:${sdkPath}`;
	await writeFile("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
	const install = Bun.spawnSync(["bun", "install", "--no-save"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	if (install.exitCode !== 0) process.exitCode = install.exitCode;
} finally {
	await writeFile("package.json", original);
	if (lock) await writeFile("bun.lock", lock);
	else await rm("bun.lock", { force: true });
}
