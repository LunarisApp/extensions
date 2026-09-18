import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateManifest } from "@lunarisapp/plugin-sdk";

export async function readCuratedExtensions(root = process.cwd()) {
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(root, "extensions"), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }

  const ids = new Set<string>();
  const extensions: Array<{ id: string; root: string; version: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = `extensions/${entry.name}`;
    const manifest = validateManifest(
      JSON.parse(
        await readFile(path.join(root, sourceRoot, "manifest.json"), "utf8"),
      ),
    );
    if (ids.has(manifest.id)) {
      throw new Error(`Duplicate curated extension ID: ${manifest.id}`);
    }
    ids.add(manifest.id);
    extensions.push({
      id: manifest.id,
      root: sourceRoot,
      version: manifest.version,
    });
  }
  return extensions.sort((left, right) => left.id.localeCompare(right.id));
}
