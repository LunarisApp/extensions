import { PLUGIN_SANDBOX_RUNTIME } from "@lunarisapp/plugin-sdk";
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

function normalizeStoredDescriptor(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let normalized = value.runtime
    ? value
    : { ...value, runtime: PLUGIN_SANDBOX_RUNTIME };
  if (normalized.sdk !== "^0.0.1") return normalized;
  const manifest = normalized.manifest;
  if (
    !isRecord(manifest) ||
    manifest.sdk !== "^0.0.1" ||
    !Array.isArray(manifest.modifications)
  ) {
    return normalized;
  }

  let changed = false;
  const modifications = manifest.modifications.map((modification) => {
    if (!isRecord(modification) || modification.type !== "workspace-panel") {
      return modification;
    }
    changed = true;
    return { ...modification, type: "view" };
  });
  if (!changed) return normalized;
  normalized = { ...normalized, manifest: { ...manifest, modifications } };
  return normalized;
}

export function parseStoredReleaseDescriptor(
  value: unknown,
  expected?: ReleaseIdentity,
): PluginReleaseDescriptor {
  try {
    return parsePluginReleaseDescriptor(value, expected);
  } catch (error) {
    const normalized = normalizeStoredDescriptor(value);
    if (normalized === value) throw error;
    return parsePluginReleaseDescriptor(normalized, expected);
  }
}
