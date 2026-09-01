import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { rcompare } from "semver";
import { readRegistryPolicy } from "./config.ts";
import { REPOSITORY_PATTERN } from "./constants.ts";
import { parseExtensionManifest } from "./manifest.ts";

const root = process.cwd();
const marketplacePath = path.join(root, "marketplace.json");
const overwrite = process.argv.includes("--overwrite");
interface MarketplaceFragment {
  descriptor: unknown;
  descriptorBytes?: Uint8Array;
  descriptorUrl: string;
}

const execFileAsync = promisify(execFile);

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

async function readFragments(): Promise<MarketplaceFragment[]> {
  if (process.env.MARKETPLACE_FRAGMENTS_DIR) {
    const directory = path.resolve(process.env.MARKETPLACE_FRAGMENTS_DIR);
    return Promise.all(
      (await readdir(directory))
        .filter((filename) => filename.endsWith(".json"))
        .map(
          async (filename) =>
            JSON.parse(
              await readFile(path.join(directory, filename), "utf8"),
            ) as MarketplaceFragment,
        ),
    );
  }

  const artifactStatus = await git("status", "--porcelain", "--", "artifacts");
  if (artifactStatus) {
    throw new Error("Commit artifact changes before updating marketplace.json");
  }
  const configuredRevision = process.env.MARKETPLACE_ARTIFACT_REVISION;
  if (configuredRevision && !/^[a-f0-9]{40,64}$/.test(configuredRevision)) {
    throw new Error(
      "MARKETPLACE_ARTIFACT_REVISION must be a full Git commit SHA",
    );
  }
  const repository =
    process.env.MARKETPLACE_REPOSITORY ?? "LunarisApp/extensions";
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new Error("MARKETPLACE_REPOSITORY must be an owner/repository pair");
  }
  const artifactsDirectory = path.join(root, "artifacts");
  const fragments: MarketplaceFragment[] = [];
  for (const extensionEntry of await readdir(artifactsDirectory, {
    withFileTypes: true,
  })) {
    if (!extensionEntry.isDirectory()) continue;
    const extensionDirectory = path.join(
      artifactsDirectory,
      extensionEntry.name,
    );
    for (const versionEntry of await readdir(extensionDirectory, {
      withFileTypes: true,
    })) {
      if (!versionEntry.isDirectory()) continue;
      const descriptorText = await readFile(
        path.join(extensionDirectory, versionEntry.name, "release.json"),
        "utf8",
      );
      const descriptor = JSON.parse(descriptorText) as { manifest: unknown };
      const manifest = parseExtensionManifest(descriptor.manifest);
      if (
        manifest.id !== extensionEntry.name ||
        manifest.version !== versionEntry.name
      ) {
        throw new Error(
          `Artifact path does not match ${manifest.id}@${manifest.version}`,
        );
      }
      const artifactPath = [
        "artifacts",
        manifest.id,
        manifest.version,
        "release.json",
      ].join("/");
      const revision =
        configuredRevision ??
        (await git(
          "log",
          "-1",
          ...(overwrite ? [] : ["--diff-filter=A"]),
          "--format=%H",
          "--",
          artifactPath,
        ));
      if (!/^[a-f0-9]{40,64}$/.test(revision)) {
        throw new Error(`No committed artifact revision for ${artifactPath}`);
      }
      const encodedArtifactPath = artifactPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      fragments.push({
        descriptor,
        descriptorBytes: Buffer.from(descriptorText),
        descriptorUrl: `https://raw.githubusercontent.com/${repository}/${revision}/${encodedArtifactPath}`,
      });
    }
  }
  return fragments;
}

async function readCuratedSourceRoots(): Promise<Map<string, string>> {
  const sourceRoots = new Map<string, string>();
  const extensionsDirectory = path.join(root, "extensions");
  let entries: Dirent[];
  try {
    entries = await readdir(extensionsDirectory, {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return sourceRoots;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = `extensions/${entry.name}`;
    const manifest = parseExtensionManifest(
      JSON.parse(
        await readFile(path.join(root, sourceRoot, "manifest.json"), "utf8"),
      ),
    );
    if (sourceRoots.has(manifest.id)) {
      throw new Error(`Duplicate curated extension ID: ${manifest.id}`);
    }
    sourceRoots.set(manifest.id, sourceRoot);
  }
  return sourceRoots;
}

function sourceRepository(repository: string, sourceRoot?: string): string {
  if (!sourceRoot) return repository;
  const encodedRoot = sourceRoot.split("/").map(encodeURIComponent).join("/");
  return `${repository.replace(/\/$/, "")}/tree/main/${encodedRoot}`;
}

const marketplace = JSON.parse(await readFile(marketplacePath, "utf8")) as {
  enabled: boolean;
  generatedAt: string;
  extensions: Array<
    Record<string, unknown> & {
      id: string;
      latestVersion: string;
      versions: Array<
        Record<string, unknown> & {
          descriptor: unknown;
          status: "active" | "blocked";
          version: string;
        }
      >;
    }
  >;
};
let changed = false;
const policy = await readRegistryPolicy(root);
const curatedSourceRoots = await readCuratedSourceRoots();
const blockedVersions = new Set(policy.blockedVersions);
if (marketplace.enabled !== policy.enabled) {
  marketplace.enabled = policy.enabled;
  changed = true;
}

for (const fragment of await readFragments()) {
  const descriptorBytes =
    fragment.descriptorBytes ??
    Buffer.from(`${JSON.stringify(fragment.descriptor, null, 2)}\n`);
  const descriptor = fragment.descriptor as {
    api: string;
    icon?: { url: string };
    manifest: unknown;
    repository: string;
    runtime: { kind: "iframe"; protocol: 6 };
    status: "active" | "blocked";
  };
  const manifest = parseExtensionManifest(descriptor.manifest);
  const repository = sourceRepository(
    descriptor.repository,
    curatedSourceRoots.get(manifest.id),
  );
  const releaseKey = `${manifest.id}@${manifest.version}`;
  const version = {
    api: descriptor.api,
    descriptor: {
      bytes: descriptorBytes.byteLength,
      sha256: createHash("sha256").update(descriptorBytes).digest("hex"),
      url: fragment.descriptorUrl,
    },
    runtime: descriptor.runtime,
    status: blockedVersions.has(releaseKey)
      ? ("blocked" as const)
      : descriptor.status,
    version: manifest.version,
  };
  let entry = marketplace.extensions.find(
    (candidate) => candidate.id === manifest.id,
  );
  if (!entry) {
    entry = {
      description: manifest.description,
      developer: manifest.developer,
      ...(descriptor.icon
        ? { iconUrl: new URL(descriptor.icon.url, fragment.descriptorUrl).href }
        : {}),
      id: manifest.id,
      latestVersion: manifest.version,
      name: manifest.name,
      repository,
      versions: [],
    };
    marketplace.extensions.push(entry);
  }
  const existingVersion = entry.versions.find(
    (candidate) => candidate.version === manifest.version,
  );
  if (existingVersion) {
    const descriptorChanged =
      JSON.stringify(existingVersion.descriptor) !==
      JSON.stringify(version.descriptor);
    if (descriptorChanged && !overwrite) {
      throw new Error(
        `Published descriptor changed: ${manifest.id}@${manifest.version}`,
      );
    }
    if (JSON.stringify(existingVersion) !== JSON.stringify(version)) {
      Object.assign(existingVersion, version);
      changed = true;
    }
  } else {
    entry.versions.push(version);
    changed = true;
  }
  entry.versions.sort((left, right) => rcompare(left.version, right.version));
  if (entry.versions[0]?.version === manifest.version) {
    const metadata = {
      description: manifest.description,
      developer: manifest.developer,
      name: manifest.name,
      repository,
    };
    for (const [key, value] of Object.entries(metadata)) {
      if (entry[key] === value) continue;
      entry[key] = value;
      changed = true;
    }
    const iconUrl = descriptor.icon
      ? new URL(descriptor.icon.url, fragment.descriptorUrl).href
      : undefined;
    if (iconUrl && entry.iconUrl !== iconUrl) {
      entry.iconUrl = iconUrl;
      changed = true;
    } else if (!descriptor.icon && "iconUrl" in entry) {
      delete entry.iconUrl;
      changed = true;
    }
  }
}

const publishedVersions = new Set<string>();
for (const entry of marketplace.extensions) {
  for (const version of entry.versions) {
    const key = `${entry.id}@${version.version}`;
    publishedVersions.add(key);
  }
  const latest =
    entry.versions.find((version) => version.status === "active") ??
    entry.versions[0];
  if (latest && entry.latestVersion !== latest.version) {
    entry.latestVersion = latest.version;
    changed = true;
  }
}
const unpublishedBlocks = policy.blockedVersions.filter(
  (version) => !publishedVersions.has(version),
);
if (unpublishedBlocks.length > 0) {
  throw new Error(
    `Policy blocks unpublished versions: ${unpublishedBlocks.join(", ")}`,
  );
}

if (changed) {
  marketplace.extensions.sort((left, right) => left.id.localeCompare(right.id));
  marketplace.generatedAt = new Date().toISOString();
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
}
