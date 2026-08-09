import { readFile } from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";
import { PLUGIN_ID_PATTERN, REPOSITORY_PATTERN } from "./constants.ts";

export interface CommunityPlugin {
  id: string;
  repository: string;
}

export interface RegistryPolicy {
  blockedVersions: string[];
  enabled: boolean;
}

export async function readCommunityPlugins(
  root = process.cwd(),
): Promise<CommunityPlugin[]> {
  const value = JSON.parse(
    await readFile(path.join(root, "registry/community-plugins.json"), "utf8"),
  ) as { plugins?: unknown };
  if (!Array.isArray(value.plugins)) {
    throw new Error("community-plugins.json must contain a plugins array");
  }

  const ids = new Set<string>();
  return value.plugins.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Community plugin entries must be objects");
    }
    const { id, repository } = candidate as Record<string, unknown>;
    if (typeof id !== "string" || !PLUGIN_ID_PATTERN.test(id)) {
      throw new Error(`Invalid community plugin ID: ${String(id)}`);
    }
    if (
      typeof repository !== "string" ||
      !REPOSITORY_PATTERN.test(repository)
    ) {
      throw new Error(`Invalid GitHub repository: ${String(repository)}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate community plugin ID: ${id}`);
    ids.add(id);
    return { id, repository };
  });
}

export async function readRegistryPolicy(
  root = process.cwd(),
): Promise<RegistryPolicy> {
  const value = JSON.parse(
    await readFile(path.join(root, "registry/policy.json"), "utf8"),
  ) as { blockedVersions?: unknown; enabled?: unknown };
  if (typeof value.enabled !== "boolean") {
    throw new Error("policy.json enabled must be a boolean");
  }
  if (!Array.isArray(value.blockedVersions)) {
    throw new Error("policy.json blockedVersions must be an array");
  }
  const blockedVersions = value.blockedVersions.map((candidate) => {
    if (typeof candidate !== "string") {
      throw new Error("Blocked versions must be strings");
    }
    const separator = candidate.lastIndexOf("@");
    const id = candidate.slice(0, separator);
    const version = candidate.slice(separator + 1);
    if (!PLUGIN_ID_PATTERN.test(id) || valid(version) === null) {
      throw new Error(`Invalid blocked plugin version: ${candidate}`);
    }
    return candidate;
  });
  if (new Set(blockedVersions).size !== blockedVersions.length) {
    throw new Error("policy.json contains duplicate blocked versions");
  }
  return { blockedVersions, enabled: value.enabled };
}
