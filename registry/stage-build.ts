import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateManifest } from "@lunarisapp/plugin-sdk";
import {
  MAX_ICON_BYTES,
  MAX_SCRIPT_BYTES,
  MAX_STYLE_BYTES,
  REPOSITORY_PATTERN,
} from "./constants.ts";

const directory = path.resolve(process.env.PLUGIN_DIST ?? "dist");
const repository = process.env.PLUGIN_REPOSITORY;
const expectedId = process.env.PLUGIN_EXPECTED_ID;
const expectedVersion = process.env.PLUGIN_EXPECTED_VERSION;
if (!repository || !REPOSITORY_PATTERN.test(repository)) {
  throw new Error("PLUGIN_REPOSITORY must be an owner/repository pair");
}

const manifest = validateManifest(
  JSON.parse(await readFile(path.join(directory, "plugin.json"), "utf8")),
);
if (expectedId && manifest.id !== expectedId) {
  throw new Error(`Plugin ID "${manifest.id}" must match "${expectedId}"`);
}
if (expectedVersion && manifest.version !== expectedVersion) {
  throw new Error(
    `Plugin version "${manifest.version}" must match "${expectedVersion}"`,
  );
}

async function validateAsset(
  filename: string,
  maximumBytes: number,
  required = false,
): Promise<void> {
  try {
    const bytes = (await stat(path.join(directory, filename))).size;
    if (bytes > maximumBytes) {
      throw new Error(`${filename} exceeds ${maximumBytes} bytes`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) return;
    throw error;
  }
}

await validateAsset("main.js", MAX_SCRIPT_BYTES, true);
await validateAsset("styles.css", MAX_STYLE_BYTES);
await validateAsset("icon.png", MAX_ICON_BYTES);
await writeFile(
  path.join(directory, "registry-release.json"),
  `${JSON.stringify({
    id: manifest.id,
    repository,
    version: manifest.version,
  })}\n`,
);
