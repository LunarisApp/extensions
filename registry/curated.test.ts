import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readCuratedExtensions } from "./curated.ts";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "lunaris-curated-"));
  roots.push(root);
  return root;
}

async function extension(root: string, folder: string, id: string) {
  const directory = path.join(root, "extensions", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      api: "^0.9.0",
      description: "Test extension",
      developer: "Test Publisher",
      id,
      name: "Test Extension",
      permissions: [],
      version: "1.0.0",
    }),
  );
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("allows marketplaces without curated source", async () => {
  expect(await readCuratedExtensions(await fixture())).toEqual([]);
});

test("sorts by extension ID, preserves source folders, and ignores files", async () => {
  const root = await fixture();
  await extension(root, "first", "test.zebra");
  await extension(root, "second", "test.alpha");
  await writeFile(path.join(root, "extensions/README.md"), "Extensions");
  expect(await readCuratedExtensions(root)).toEqual([
    { id: "test.alpha", root: "extensions/second", version: "1.0.0" },
    { id: "test.zebra", root: "extensions/first", version: "1.0.0" },
  ]);
});

test("rejects duplicate IDs across source folders", async () => {
  const root = await fixture();
  await extension(root, "first", "test.duplicate");
  await extension(root, "second", "test.duplicate");
  await expect(readCuratedExtensions(root)).rejects.toThrow(
    "Duplicate curated extension ID: test.duplicate",
  );
});
