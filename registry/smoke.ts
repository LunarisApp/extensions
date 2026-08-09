import { createHash } from "node:crypto";
import {
  type PluginAsset,
  parsePluginCatalog,
  parsePluginReleaseDescriptor,
} from "@lunarisapp/plugin-sdk/catalog";
import { DEFAULT_REGISTRY_BASE_URL } from "./constants.ts";

const baseUrl = (
  process.env.REGISTRY_SMOKE_URL ?? DEFAULT_REGISTRY_BASE_URL
).replace(/\/$/, "");
const overrideOrigin = process.env.REGISTRY_ASSET_ORIGIN_OVERRIDE?.replace(
  /\/$/,
  "",
);

function requestUrl(value: string): string {
  if (!overrideOrigin) return value;
  const source = new URL(value);
  return `${overrideOrigin}${source.pathname}`;
}

async function checkedFetch(url: string): Promise<Response> {
  const response = await fetch(requestUrl(url), {
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  if (response.headers.get("access-control-allow-origin") !== "*") {
    throw new Error(`${url} does not allow cross-origin reads`);
  }
  return response;
}

async function verifyAsset(asset: PluginAsset): Promise<void> {
  const response = await checkedFetch(asset.url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.bytes) {
    throw new Error(`${asset.url} has the wrong byte length`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== asset.sha256) {
    throw new Error(`${asset.url} has the wrong SHA-256 digest`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(asset.contentType.split(";")[0] ?? "")) {
    throw new Error(`${asset.url} has unexpected content type ${contentType}`);
  }
}

const catalogResponse = await checkedFetch(`${baseUrl}/catalog-v1.json`);
const catalog = parsePluginCatalog(await catalogResponse.json());
for (const plugin of catalog.plugins) {
  for (const version of plugin.versions) {
    const response = await checkedFetch(version.descriptorUrl);
    const descriptor = parsePluginReleaseDescriptor(await response.json(), {
      id: plugin.id,
      version: version.version,
    });
    await verifyAsset(descriptor.script);
    if (descriptor.style) await verifyAsset(descriptor.style);
    if (descriptor.icon) await verifyAsset(descriptor.icon);
  }
}
process.stdout.write(
  `Verified ${catalog.plugins.length} plugins from ${baseUrl}\n`,
);
