import { type PluginManifest, validateManifest } from "@lunarisapp/plugin-sdk";

export type ExtensionManifest = PluginManifest;

export function parseExtensionManifest(value: unknown): ExtensionManifest {
  return validateManifest(value);
}
