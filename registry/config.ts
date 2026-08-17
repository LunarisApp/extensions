import { readFile } from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";
import { EXTENSION_ID_PATTERN, REPOSITORY_PATTERN } from "./constants.ts";

export interface CommunityExtension {
  id: string;
  repository: string;
}

export interface RegistryPolicy {
  blockedVersions: string[];
  enabled: boolean;
}

export async function readCommunityExtensions(
  root = process.cwd(),
): Promise<CommunityExtension[]> {
  const value = JSON.parse(
    await readFile(
      path.join(root, "registry/community-extensions.json"),
      "utf8",
    ),
  ) as { extensions?: unknown };
  if (!Array.isArray(value.extensions)) {
    throw new Error(
      "community-extensions.json must contain an extensions array",
    );
  }

  const ids = new Set<string>();
  return value.extensions.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Community extension entries must be objects");
    }
    const { id, repository } = candidate as Record<string, unknown>;
    if (typeof id !== "string" || !EXTENSION_ID_PATTERN.test(id)) {
      throw new Error(`Invalid community extension ID: ${String(id)}`);
    }
    if (
      typeof repository !== "string" ||
      !REPOSITORY_PATTERN.test(repository)
    ) {
      throw new Error(`Invalid GitHub repository: ${String(repository)}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate community extension ID: ${id}`);
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
    if (!EXTENSION_ID_PATTERN.test(id) || valid(version) === null) {
      throw new Error(`Invalid blocked extension version: ${candidate}`);
    }
    return candidate;
  });
  if (new Set(blockedVersions).size !== blockedVersions.length) {
    throw new Error("policy.json contains duplicate blocked versions");
  }
  return { blockedVersions, enabled: value.enabled };
}
