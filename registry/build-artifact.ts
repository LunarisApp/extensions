import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { PLUGIN_SANDBOX_PROTOCOL_VERSION } from "@lunarisapp/plugin-sdk";
import { fileTypeFromBuffer } from "file-type";
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
const overwrite = process.argv.includes("--overwrite");

if (checkOnly && overwrite) {
  throw new Error("--check and --overwrite cannot be used together");
}

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
  filename: string;
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
      filename,
      value,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return undefined;
    }
    throw error;
  }
}

const ICON_EXTENSION_ALIASES = new Map([
  ["apng", "png"],
  ["dib", "bmp"],
  ["heif", "heic"],
  ["jpe", "jpg"],
  ["jpeg", "jpg"],
  ["jfif", "jpg"],
  ["tiff", "tif"],
]);

function normalizeIconExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return ICON_EXTENSION_ALIASES.get(normalized) ?? normalized;
}

async function rasterIcon(): Promise<ArtifactFile | undefined> {
  const candidates = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^icon\.[^.]+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) {
    throw new Error(
      `Extension build must contain at most one icon file: ${candidates.join(", ")}`,
    );
  }

  const filename = candidates[0];
  if (!filename) return undefined;
  const extension = path.extname(filename).slice(1).toLowerCase();
  const value = await readFile(path.join(sourceDirectory, filename));
  if (value.byteLength > MAX_ICON_BYTES) {
    throw new Error(`${filename} exceeds ${MAX_ICON_BYTES} bytes`);
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(value);
  } catch {
    detected = undefined;
  }
  if (
    !detected?.mime.startsWith("image/") ||
    normalizeIconExtension(extension) !== normalizeIconExtension(detected.ext)
  ) {
    throw new Error(
      `${filename} must be a valid raster image matching its file extension`,
    );
  }

  return {
    descriptor: {
      bytes: value.byteLength,
      resource: detected.mime,
      sha256: createHash("sha256").update(value).digest("hex"),
      url: `./${filename}`,
    },
    filename,
    value,
  };
}

const script = await asset(
  "main.js",
  "text/javascript",
  MAX_SCRIPT_BYTES,
  true,
);
if (!script) throw new Error("main.js is required");
const style = await asset("styles.css", "text/css", MAX_STYLE_BYTES);
const icon = await rasterIcon();
const descriptor = {
  api: manifest.api,
  ...(icon ? { icon: icon.descriptor } : {}),
  manifest,
  repository: `https://github.com/${repository}`,
  runtime: { kind: "iframe", protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION },
  script: script.descriptor,
  status: "active",
  ...(style ? { style: style.descriptor } : {}),
};
const files = new Map<string, Uint8Array>([
  ["main.js", script.value],
  ...(style ? ([["styles.css", style.value]] as const) : []),
  ...(icon ? ([[icon.filename, icon.value]] as const) : []),
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
} else if (!overwrite) {
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
} else {
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(
    [...files].map(([filename, value]) =>
      writeFile(path.join(destination, filename), value),
    ),
  );
  process.stdout.write(`${manifest.id}@${manifest.version} overwritten\n`);
}
