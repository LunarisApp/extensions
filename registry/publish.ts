import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PLUGIN_SANDBOX_RUNTIME,
  validateManifest,
} from "@lunarisapp/plugin-sdk";
import {
  type PluginAsset,
  type PluginCatalog,
  type PluginCatalogEntry,
  type PluginCatalogVersion,
  type PluginReleaseDescriptor,
  parsePluginCatalog,
  parsePluginReleaseDescriptor,
} from "@lunarisapp/plugin-sdk/catalog";
import { rcompare } from "semver";
import { readRegistryPolicy } from "./config.ts";
import {
  DEFAULT_REGISTRY_BASE_URL,
  SITE_MAXIMUM_BYTES,
  SITE_WARNING_BYTES,
} from "./constants.ts";

interface BuildMetadata {
  id: string;
  repository: string;
  version: string;
}

interface PublishOptions {
  allowFlagged?: boolean;
  artifacts: string;
  baseUrl?: string;
  repositoryRoot?: string;
  site: string;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function filesNamed(
  directory: string,
  filename: string,
): Promise<string[]> {
  if (!(await exists(directory))) return [];
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory())
      output.push(...(await filesNamed(candidate, filename)));
    else if (entry.isFile() && entry.name === filename) output.push(candidate);
  }
  return output;
}

async function writeImmutable(
  filename: string,
  value: Uint8Array,
): Promise<void> {
  if (await exists(filename)) {
    const current = await readFile(filename);
    if (!current.equals(value)) {
      throw new Error(`Immutable registry file changed: ${filename}`);
    }
    return;
  }
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, value);
}

async function publishAsset({
  baseUrl,
  resource,
  directory,
  filename,
  id,
  site,
  version,
}: {
  baseUrl: string;
  resource: string;
  directory: string;
  filename: string;
  id: string;
  site: string;
  version: string;
}): Promise<PluginAsset | undefined> {
  const source = path.join(directory, filename);
  if (!(await exists(source))) return undefined;
  const value = await readFile(source);
  const sha256 = createHash("sha256").update(value).digest("hex");
  const relative = `artifacts/${id}/${version}/${sha256}/${filename}`;
  await writeImmutable(path.join(site, relative), value);
  return {
    bytes: value.byteLength,
    resource,
    sha256,
    url: `${baseUrl}/${relative}`,
  };
}

async function publishBuild(
  metadataFile: string,
  {
    allowFlagged,
    baseUrl,
    site,
  }: Required<Pick<PublishOptions, "allowFlagged" | "baseUrl" | "site">>,
): Promise<void> {
  const directory = path.dirname(metadataFile);
  const metadata = JSON.parse(
    await readFile(metadataFile, "utf8"),
  ) as BuildMetadata;
  if (await exists(path.join(directory, "plugin.json"))) {
    throw new Error("Legacy plugin.json is not supported; use manifest.json");
  }
  const manifest = validateManifest(
    JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
  );
  if (manifest.id !== metadata.id || manifest.version !== metadata.version) {
    throw new Error(`Staged release identity mismatch for ${metadata.id}`);
  }
  if (
    (await exists(path.join(directory, "registry-audit-flagged"))) &&
    !allowFlagged
  ) {
    process.stderr.write(
      `Skipping audit-flagged release ${manifest.id}@${manifest.version}\n`,
    );
    return;
  }

  const script = await publishAsset({
    baseUrl,
    resource: "application/javascript; charset=utf-8",
    directory,
    filename: "main.js",
    id: manifest.id,
    site,
    version: manifest.version,
  });
  if (!script)
    throw new Error(`${manifest.id}@${manifest.version} has no main.js`);
  const style = await publishAsset({
    baseUrl,
    resource: "text/css; charset=utf-8",
    directory,
    filename: "styles.css",
    id: manifest.id,
    site,
    version: manifest.version,
  });
  const icon = await publishAsset({
    baseUrl,
    resource: "image/png",
    directory,
    filename: "icon.png",
    id: manifest.id,
    site,
    version: manifest.version,
  });
  const descriptor: PluginReleaseDescriptor = {
    api: manifest.api,
    ...(icon ? { icon } : {}),
    manifest,
    repository: metadata.repository,
    runtime: PLUGIN_SANDBOX_RUNTIME,
    script,
    status: "active",
    ...(style ? { style } : {}),
  };
  const relative = `releases/${manifest.id}/${manifest.version}.json`;
  await writeImmutable(
    path.join(site, relative),
    Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
  );
}

function isProtocolOneAsset(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.bytes === "number" &&
    Number.isInteger(asset.bytes) &&
    asset.bytes >= 0 &&
    typeof asset.contentType === "string" &&
    asset.contentType.length > 0 &&
    typeof asset.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(asset.sha256) &&
    typeof asset.url === "string" &&
    URL.canParse(asset.url)
  );
}

function isRecognizedProtocolOneReleaseDescriptor(
  value: unknown,
  expected: { id: string; version: string },
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptor = value as Record<string, unknown>;
  if (
    typeof descriptor.api !== "string" ||
    descriptor.repository === undefined ||
    typeof descriptor.repository !== "string" ||
    !descriptor.runtime ||
    typeof descriptor.runtime !== "object" ||
    Array.isArray(descriptor.runtime) ||
    !isProtocolOneAsset(descriptor.script) ||
    !["active", "blocked"].includes(String(descriptor.status)) ||
    !descriptor.manifest ||
    typeof descriptor.manifest !== "object" ||
    Array.isArray(descriptor.manifest)
  ) {
    return false;
  }
  const runtime = descriptor.runtime as Record<string, unknown>;
  if (runtime.kind !== "iframe" || runtime.protocol !== 1) return false;
  if (descriptor.icon !== undefined && !isProtocolOneAsset(descriptor.icon))
    return false;
  if (descriptor.style !== undefined && !isProtocolOneAsset(descriptor.style))
    return false;
  const manifest = descriptor.manifest as Record<string, unknown>;
  return (
    manifest.api === descriptor.api &&
    typeof manifest.name === "string" &&
    typeof manifest.description === "string" &&
    typeof manifest.developer === "string" &&
    Array.isArray(manifest.contributions) &&
    !!manifest.conflicts &&
    typeof manifest.conflicts === "object" &&
    !Array.isArray(manifest.conflicts) &&
    !!manifest.dependencies &&
    typeof manifest.dependencies === "object" &&
    !Array.isArray(manifest.dependencies) &&
    Array.isArray(manifest.permissions) &&
    manifest.id === expected.id &&
    manifest.version === expected.version
  );
}

async function readDescriptors(
  site: string,
): Promise<PluginReleaseDescriptor[]> {
  const releaseRoot = path.join(site, "releases");
  if (!(await exists(releaseRoot))) return [];
  const descriptors: PluginReleaseDescriptor[] = [];
  for (const id of await readdir(releaseRoot, { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    for (const entry of await readdir(path.join(releaseRoot, id.name), {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const version = entry.name.slice(0, -".json".length);
      const stored: unknown = JSON.parse(
        await readFile(path.join(releaseRoot, id.name, entry.name), "utf8"),
      );
      if (
        isRecognizedProtocolOneReleaseDescriptor(stored, {
          id: id.name,
          version,
        })
      ) {
        continue;
      }
      descriptors.push(
        parsePluginReleaseDescriptor(stored, { id: id.name, version }),
      );
    }
  }
  return descriptors;
}

function buildCatalog(
  descriptors: PluginReleaseDescriptor[],
  enabled: boolean,
  blockedVersions: Set<string>,
  baseUrl: string,
): PluginCatalog {
  const grouped = new Map<string, PluginReleaseDescriptor[]>();
  for (const descriptor of descriptors) {
    const releases = grouped.get(descriptor.manifest.id) ?? [];
    releases.push(descriptor);
    grouped.set(descriptor.manifest.id, releases);
  }

  const extensions: PluginCatalogEntry[] = [];
  const observedBlockedVersions = new Set<string>();
  for (const [id, releases] of grouped) {
    releases.sort((left, right) =>
      rcompare(left.manifest.version, right.manifest.version),
    );
    const versions: PluginCatalogVersion[] = releases.map((descriptor) => {
      const key = `${id}@${descriptor.manifest.version}`;
      const policyBlocked = blockedVersions.has(key);
      if (policyBlocked) observedBlockedVersions.add(key);
      return {
        api: descriptor.api,
        descriptorUrl: `${baseUrl}/releases/${id}/${descriptor.manifest.version}.json`,
        runtime: descriptor.runtime,
        status: policyBlocked ? "blocked" : "active",
        version: descriptor.manifest.version,
      };
    });
    const activeIndex = versions.findIndex(
      (version) => version.status === "active",
    );
    const current = releases[activeIndex < 0 ? 0 : activeIndex];
    if (!current) continue;
    extensions.push({
      description: current.manifest.description,
      developer: current.manifest.developer,
      id,
      ...(current.icon ? { iconUrl: current.icon.url } : {}),
      latestVersion:
        versions.find((version) => version.status === "active")?.version ??
        versions[0]?.version ??
        current.manifest.version,
      name: current.manifest.name,
      repository: current.repository,
      versions,
    });
  }
  const unknownBlockedVersions = [...blockedVersions].filter(
    (version) => !observedBlockedVersions.has(version),
  );
  if (unknownBlockedVersions.length > 0) {
    throw new Error(
      `Policy blocks unpublished versions: ${unknownBlockedVersions.join(", ")}`,
    );
  }
  extensions.sort((left, right) => left.name.localeCompare(right.name));
  return parsePluginCatalog({
    enabled,
    generatedAt: new Date().toISOString(),
    plugins: extensions,
    schemaVersion: 1,
  });
}

async function writeCatalog(
  site: string,
  catalog: PluginCatalog,
): Promise<void> {
  const filename = path.join(site, "catalog-v1.json");
  if (await exists(filename)) {
    const stored: unknown = JSON.parse(await readFile(filename, "utf8"));
    let current: PluginCatalog | undefined;
    try {
      current = parsePluginCatalog(stored);
    } catch {
      current = undefined;
    }
    const comparable = (value: PluginCatalog) => ({
      enabled: value.enabled,
      plugins: value.plugins,
      schemaVersion: value.schemaVersion,
    });
    if (
      current &&
      JSON.stringify(comparable(current)) ===
        JSON.stringify(comparable(catalog))
    ) {
      return;
    }
  }
  await writeFile(filename, `${JSON.stringify(catalog, null, 2)}\n`);
}

async function siteBytes(directory: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await siteBytes(filename);
    else if (entry.isFile()) bytes += (await stat(filename)).size;
  }
  return bytes;
}

export async function publishRegistry({
  allowFlagged = false,
  artifacts,
  baseUrl = DEFAULT_REGISTRY_BASE_URL,
  repositoryRoot = process.cwd(),
  site,
}: PublishOptions): Promise<void> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  await mkdir(site, { recursive: true });
  const metadataFiles = await filesNamed(artifacts, "registry-release.json");
  metadataFiles.sort();
  for (const metadataFile of metadataFiles) {
    await publishBuild(metadataFile, {
      allowFlagged,
      baseUrl: normalizedBaseUrl,
      site,
    });
  }

  const policy = await readRegistryPolicy(repositoryRoot);
  const catalog = buildCatalog(
    await readDescriptors(site),
    policy.enabled,
    new Set(policy.blockedVersions),
    normalizedBaseUrl,
  );
  await writeCatalog(site, catalog);
  await writeFile(
    path.join(site, "index.html"),
    '<!doctype html><meta charset="utf-8"><title>Lunaris extension registry</title><h1>Lunaris extension registry</h1><p><a href="/catalog-v1.json">Open the catalog</a></p>\n',
  );

  const bytes = await siteBytes(site);
  if (bytes >= SITE_MAXIMUM_BYTES) {
    throw new Error(
      `Registry site is ${bytes} bytes; maximum is ${SITE_MAXIMUM_BYTES}`,
    );
  }
  if (bytes >= SITE_WARNING_BYTES) {
    process.stderr.write(
      `Warning: registry site is ${bytes} bytes (warning threshold ${SITE_WARNING_BYTES})\n`,
    );
  }
}

if (import.meta.main) {
  await publishRegistry({
    allowFlagged: process.env.ALLOW_FLAGGED === "true",
    artifacts: path.resolve(
      process.env.EXTENSION_ARTIFACTS_DIR ?? "extension-artifacts",
    ),
    baseUrl: process.env.REGISTRY_BASE_URL,
    repositoryRoot: path.resolve(process.env.REGISTRY_REPOSITORY_ROOT ?? "."),
    site: path.resolve(process.env.REGISTRY_SITE_DIR ?? "registry-site"),
  });
}
