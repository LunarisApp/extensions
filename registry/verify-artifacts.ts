import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateManifest } from "@lunarisapp/plugin-sdk";
import { valid } from "semver";
import {
  EXTENSION_ID_PATTERN,
  MAX_ICON_BYTES,
  MAX_SCRIPT_BYTES,
  MAX_STYLE_BYTES,
  REPOSITORY_PATTERN,
} from "./constants.ts";

export function verifyDescriptorUrl(
  url: unknown,
  id: string,
  version: string,
  repository = process.env.MARKETPLACE_REPOSITORY ?? "LunarisApp/extensions",
) {
  const prefix = `https://raw.githubusercontent.com/${repository}/`;
  const suffix = `/artifacts/${encodeURIComponent(id)}/${encodeURIComponent(version)}/release.json`;
  if (
    !REPOSITORY_PATTERN.test(repository) ||
    typeof url !== "string" ||
    !url.startsWith(prefix) ||
    !url.endsWith(suffix) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(
      url.slice(prefix.length, -suffix.length),
    )
  ) {
    throw new Error(`Invalid commit-pinned descriptor URL: ${id}@${version}`);
  }
}

export function verifyBytes(
  bytes: Uint8Array,
  pin: { bytes: number; sha256: string },
  label: string,
) {
  if (
    bytes.byteLength !== pin.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== pin.sha256
  ) {
    throw new Error(`Integrity mismatch: ${label}`);
  }
}

export async function verifyArtifact(
  directory: string,
  id: string,
  version: string,
) {
  const bytes = await readFile(path.join(directory, "release.json"));
  const release = JSON.parse(bytes.toString());
  const manifest = validateManifest(release.manifest);
  if (
    manifest.id !== id ||
    manifest.version !== version ||
    release.api !== manifest.api
  ) {
    throw new Error(`Artifact identity mismatch: ${id}@${version}`);
  }
  if (
    release.runtime?.kind !== "iframe" ||
    ![6, 7].includes(release.runtime.protocol) ||
    release.status !== "active"
  ) {
    throw new Error(`Invalid artifact runtime or status: ${id}@${version}`);
  }
  const expected = ["release.json"];
  for (const [key, maximum] of [
    ["script", MAX_SCRIPT_BYTES],
    ["style", MAX_STYLE_BYTES],
    ["icon", MAX_ICON_BYTES],
  ] as const) {
    const asset = release[key];
    if (!asset && key !== "script") continue;
    if (
      !asset ||
      typeof asset.url !== "string" ||
      !/^\.\/[a-zA-Z0-9_.-]+$/.test(asset.url)
    ) {
      throw new Error(`Invalid ${key} asset: ${id}@${version}`);
    }
    const filename = asset.url.slice(2);
    if (expected.includes(filename))
      throw new Error(`Duplicate asset: ${filename}`);
    expected.push(filename);
    const value = await readFile(path.join(directory, filename));
    if (value.length > maximum) throw new Error(`Oversized asset: ${filename}`);
    verifyBytes(value, asset, `${id}@${version}/${filename}`);
  }
  const actual = await readdir(directory, { withFileTypes: true });
  if (
    actual.some((entry) => !entry.isFile()) ||
    JSON.stringify(actual.map((entry) => entry.name).sort()) !==
      JSON.stringify(expected.sort())
  ) {
    throw new Error(`Unexpected artifact files: ${id}@${version}`);
  }
  return bytes;
}

export async function verifyCatalog(root = process.cwd()) {
  const catalog = JSON.parse(
    await readFile(path.join(root, "marketplace.json"), "utf8"),
  );
  for (const entry of catalog.extensions) {
    for (const version of entry.versions) {
      if (!EXTENSION_ID_PATTERN.test(entry.id) || !valid(version.version)) {
        throw new Error("Invalid catalog extension ID or version");
      }
      verifyDescriptorUrl(version.descriptor.url, entry.id, version.version);
      const directory = path.join(root, "artifacts", entry.id, version.version);
      const bytes = await verifyArtifact(directory, entry.id, version.version);
      verifyBytes(
        bytes,
        version.descriptor,
        `${entry.id}@${version.version} descriptor`,
      );
    }
  }
}

if (import.meta.main) await verifyCatalog();
