import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_ICON_BYTES,
  MAX_SCRIPT_BYTES,
  MAX_STYLE_BYTES,
} from "./constants.ts";
import { parseExtensionManifest } from "./manifest.ts";

const directory = path.resolve(process.env.EXTENSION_DIST ?? "dist");
const repository = process.env.GITHUB_REPOSITORY ?? "LunarisApp/extensions";
const manifest = parseExtensionManifest(
  JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
);
const tag = `${manifest.id}@${manifest.version}`;
const releaseBase = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;

async function asset(filename: string, resource: string, maximumBytes: number) {
  const filenamePath = path.join(directory, filename);
  try {
    const info = await stat(filenamePath);
    if (info.size > maximumBytes)
      throw new Error(`${filename} exceeds ${maximumBytes} bytes`);
    const value = await readFile(filenamePath);
    return {
      bytes: value.byteLength,
      resource,
      sha256: createHash("sha256").update(value).digest("hex"),
      url: `${releaseBase}/${filename}`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const script = await asset("main.js", "text/javascript", MAX_SCRIPT_BYTES);
if (!script) throw new Error("main.js is required");
const descriptor = {
  api: manifest.api,
  icon: await asset("icon.png", "image/png", MAX_ICON_BYTES),
  manifest,
  repository: `https://github.com/${repository}`,
  runtime: { kind: "iframe", protocol: 2 },
  script,
  status: "active",
  style: await asset("styles.css", "text/css", MAX_STYLE_BYTES),
};
await writeFile(
  path.join(directory, "release.json"),
  `${JSON.stringify(descriptor, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ id: manifest.id, tag, version: manifest.version })}\n`,
);
