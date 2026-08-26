import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseExtensionManifest } from "./manifest.ts";

const root = process.cwd();
const extensionsDirectory = path.join(root, "extensions");
const ids = new Set<string>();
const include: Array<{
  id: string;
  repository: string;
  root: string;
  version: string;
}> = [];

for (const entry of await readdir(extensionsDirectory, {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const relativeRoot = `extensions/${entry.name}`;
  const manifest = parseExtensionManifest(
    JSON.parse(
      await readFile(path.join(root, relativeRoot, "manifest.json"), "utf8"),
    ),
  );
  if (ids.has(manifest.id)) {
    throw new Error(`Duplicate curated extension ID: ${manifest.id}`);
  }
  ids.add(manifest.id);
  include.push({
    id: manifest.id,
    repository: "LunarisApp/extensions",
    root: relativeRoot,
    version: manifest.version,
  });
}

include.sort((left, right) => left.id.localeCompare(right.id));
process.stdout.write(JSON.stringify({ include }));
