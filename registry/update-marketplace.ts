import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rcompare } from "semver";
import { readRegistryPolicy } from "./config.ts";
import { parseExtensionManifest } from "./manifest.ts";

const root = process.cwd();
const marketplacePath = path.join(root, "marketplace.json");
interface MarketplaceFragment {
  descriptor: unknown;
  descriptorUrl: string;
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

  const extensionsDirectory = path.join(root, "extensions");
  const fragments: MarketplaceFragment[] = [];
  for (const entry of await readdir(extensionsDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const descriptor = JSON.parse(
      await readFile(
        path.join(extensionsDirectory, entry.name, "dist/release.json"),
        "utf8",
      ),
    ) as {
      manifest: unknown;
      repository: string;
    };
    const manifest = parseExtensionManifest(descriptor.manifest);
    fragments.push({
      descriptor,
      descriptorUrl: `${descriptor.repository}/releases/download/${manifest.id}@${manifest.version}/release.json`,
    });
  }
  return fragments;
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
const blockedVersions = new Set(policy.blockedVersions);
if (marketplace.enabled !== policy.enabled) {
  marketplace.enabled = policy.enabled;
  changed = true;
}

for (const fragment of await readFragments()) {
  const descriptorBytes = Buffer.from(
    `${JSON.stringify(fragment.descriptor, null, 2)}\n`,
  );
  const descriptor = fragment.descriptor as {
    api: string;
    icon?: { url: string };
    manifest: unknown;
    repository: string;
    runtime: { kind: "iframe"; protocol: 2 };
    status: "active" | "blocked";
  };
  const manifest = parseExtensionManifest(descriptor.manifest);
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
      ...(descriptor.icon ? { iconUrl: descriptor.icon.url } : {}),
      id: manifest.id,
      latestVersion: manifest.version,
      name: manifest.name,
      repository: descriptor.repository,
      versions: [],
    };
    marketplace.extensions.push(entry);
  }
  const existingVersion = entry.versions.find(
    (candidate) => candidate.version === manifest.version,
  );
  if (existingVersion) {
    if (
      JSON.stringify(existingVersion.descriptor) !==
      JSON.stringify(version.descriptor)
    ) {
      throw new Error(
        `Published descriptor changed: ${manifest.id}@${manifest.version}`,
      );
    }
    if (existingVersion.status !== version.status) {
      existingVersion.status = version.status;
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
      repository: descriptor.repository,
    };
    for (const [key, value] of Object.entries(metadata)) {
      if (entry[key] === value) continue;
      entry[key] = value;
      changed = true;
    }
    if (descriptor.icon && entry.iconUrl !== descriptor.icon.url) {
      entry.iconUrl = descriptor.icon.url;
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
