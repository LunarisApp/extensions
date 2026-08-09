import {
  type PluginReleaseDescriptor,
  parsePluginReleaseDescriptor,
} from "@lunarisapp/plugin-sdk/catalog";

interface ReleaseIdentity {
  id: string;
  version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLegacyDescriptor(value: unknown): unknown {
  if (!isRecord(value) || value.sdk !== "^0.0.1") return value;
  const manifest = value.manifest;
  if (
    !isRecord(manifest) ||
    manifest.sdk !== "^0.0.1" ||
    !Array.isArray(manifest.modifications)
  ) {
    return value;
  }

  let changed = false;
  const modifications = manifest.modifications.map((modification) => {
    if (!isRecord(modification) || modification.type !== "workspace-panel") {
      return modification;
    }
    changed = true;
    return { ...modification, type: "view" };
  });
  if (!changed) return value;
  return { ...value, manifest: { ...manifest, modifications } };
}

export function parseStoredReleaseDescriptor(
  value: unknown,
  expected?: ReleaseIdentity,
): PluginReleaseDescriptor {
  try {
    return parsePluginReleaseDescriptor(value, expected);
  } catch (error) {
    const normalized = normalizeLegacyDescriptor(value);
    if (normalized === value) throw error;
    return parsePluginReleaseDescriptor(normalized, expected);
  }
}
