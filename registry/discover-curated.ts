import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateManifest } from "@lunarisapp/plugin-sdk";
import { readCommunityExtensions } from "./config.ts";

const root = process.cwd();
const extensionsDirectory = path.join(root, "extensions");
const community = await readCommunityExtensions(root);
const ids = new Set(community.map((extension) => extension.id));
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
  const manifest = validateManifest(
    JSON.parse(
      await readFile(path.join(root, relativeRoot, "manifest.json"), "utf8"),
    ),
  );
  if (ids.has(manifest.id)) {
    throw new Error(`Duplicate curated/community extension ID: ${manifest.id}`);
  }
  ids.add(manifest.id);
  include.push({
    id: manifest.id,
    repository: "LunarisApp/plugins",
    root: relativeRoot,
    version: manifest.version,
  });
}

include.sort((left, right) => left.id.localeCompare(right.id));
process.stdout.write(JSON.stringify({ include }));
