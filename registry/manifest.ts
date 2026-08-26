import { valid } from "semver";
import { EXTENSION_ID_PATTERN } from "./constants.ts";

export interface ExtensionManifest extends Record<string, unknown> {
  api: string;
  description: string;
  developer: string;
  id: string;
  name: string;
  version: string;
}

export function parseExtensionManifest(value: unknown): ExtensionManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("manifest.json must contain an object");
  }
  const manifest = value as Record<string, unknown>;
  for (const field of [
    "api",
    "description",
    "developer",
    "id",
    "name",
    "version",
  ] as const) {
    if (typeof manifest[field] !== "string" || manifest[field].length === 0) {
      throw new Error(`manifest.json ${field} must be a non-empty string`);
    }
  }
  if (!EXTENSION_ID_PATTERN.test(manifest.id as string)) {
    throw new Error(`Invalid extension ID: ${String(manifest.id)}`);
  }
  if (valid(manifest.version as string) === null) {
    throw new Error(`Invalid extension version: ${String(manifest.version)}`);
  }
  return manifest as ExtensionManifest;
}
