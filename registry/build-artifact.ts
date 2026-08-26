import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_ICON_BYTES,
  MAX_SCRIPT_BYTES,
  MAX_STYLE_BYTES,
  REPOSITORY_PATTERN,
} from "./constants.ts";
import { parseExtensionManifest } from "./manifest.ts";

const sourceDirectory = path.resolve(process.env.EXTENSION_DIST ?? "dist");
const artifactsRoot = path.resolve(
  process.env.EXTENSION_ARTIFACTS_ROOT ??
    path.join(import.meta.dir, "../artifacts"),
);
const repository = process.env.EXTENSION_REPOSITORY ?? "LunarisApp/extensions";
const expectedId = process.env.EXTENSION_EXPECTED_ID;
const expectedVersion = process.env.EXTENSION_EXPECTED_VERSION;
const checkOnly = process.argv.includes("--check");

if (!REPOSITORY_PATTERN.test(repository)) {
  throw new Error("EXTENSION_REPOSITORY must be an owner/repository pair");
}

const manifest = parseExtensionManifest(
  JSON.parse(
    await readFile(path.join(sourceDirectory, "manifest.json"), "utf8"),
  ),
);
if (expectedId && manifest.id !== expectedId) {
  throw new Error(`Extension ID "${manifest.id}" must match "${expectedId}"`);
}
if (expectedVersion && manifest.version !== expectedVersion) {
  throw new Error(
    `Extension version "${manifest.version}" must match "${expectedVersion}"`,
  );
}

interface ArtifactAsset {
  bytes: number;
  resource: string;
  sha256: string;
  url: string;
}

interface ArtifactFile {
  descriptor: ArtifactAsset;
  value: Uint8Array;
}

async function asset(
  filename: string,
  resource: string,
  maximumBytes: number,
  required = false,
): Promise<ArtifactFile | undefined> {
  try {
    const value = await readFile(path.join(sourceDirectory, filename));
    if (value.byteLength > maximumBytes) {
      throw new Error(`${filename} exceeds ${maximumBytes} bytes`);
    }
    return {
      descriptor: {
        bytes: value.byteLength,
        resource,
        sha256: createHash("sha256").update(value).digest("hex"),
        url: `./${filename}`,
      },
      value,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return undefined;
    }
    throw error;
  }
}

const script = await asset(
  "main.js",
  "text/javascript",
  MAX_SCRIPT_BYTES,
  true,
);
if (!script) throw new Error("main.js is required");
const style = await asset("styles.css", "text/css", MAX_STYLE_BYTES);
const icon = await asset("icon.png", "image/png", MAX_ICON_BYTES);
const descriptor = {
  api: manifest.api,
  ...(icon ? { icon: icon.descriptor } : {}),
  manifest,
  repository: `https://github.com/${repository}`,
  runtime: { kind: "iframe", protocol: 2 },
  script: script.descriptor,
  status: "active",
  ...(style ? { style: style.descriptor } : {}),
};
const files = new Map<string, Uint8Array>([
  ["main.js", script.value],
  ...(style ? ([["styles.css", style.value]] as const) : []),
  ...(icon ? ([["icon.png", icon.value]] as const) : []),
  ["release.json", Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`)],
]);
const destination = path.join(artifactsRoot, manifest.id, manifest.version);

if (checkOnly) {
  const existingFiles = await readdir(destination);
  const expectedFiles = [...files.keys()].sort();
  if (JSON.stringify(existingFiles.sort()) !== JSON.stringify(expectedFiles)) {
    throw new Error(`${manifest.id}@${manifest.version} artifact files differ`);
  }
  for (const [filename, expected] of files) {
    const actual = await readFile(path.join(destination, filename));
    if (!Buffer.from(actual).equals(Buffer.from(expected))) {
      throw new Error(`${manifest.id}@${manifest.version}/${filename} differs`);
    }
  }
  process.stdout.write(`${manifest.id}@${manifest.version} verified\n`);
} else {
  try {
    await stat(destination);
    throw new Error(
      `${manifest.id}@${manifest.version} already exists; bump the version`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(destination, { recursive: true });
  await Promise.all(
    [...files].map(([filename, value]) =>
      writeFile(path.join(destination, filename), value),
    ),
  );
  process.stdout.write(`${manifest.id}@${manifest.version} created\n`);
}
