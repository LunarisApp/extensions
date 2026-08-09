import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, resolvePluginOptions, scaffoldPlugin } from "./create-plugin.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lunaris-create-plugin-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("parseArgs", () => {
  test("parses positional directory and metadata", () => {
    expect(
      parseArgs(["notes", "--id=acme.notes", "--name", "Acme Notes", "--developer", "Acme"])
    ).toEqual({
      developer: "Acme",
      directory: "notes",
      help: false,
      id: "acme.notes",
      name: "Acme Notes",
      version: false,
    });
  });

  test("rejects unknown options", () => {
    expect(() => parseArgs(["notes", "--force"])).toThrow("Unknown option: --force");
  });
});

describe("resolvePluginOptions", () => {
  test("derives safe defaults from directory", () => {
    const options = resolvePluginOptions(parseArgs(["my-cool-plugin"]));
    expect(options.id).toBe("my-cool-plugin");
    expect(options.name).toBe("My Cool Plugin");
    expect(options.description).toBe("My Cool Plugin plugin for Lunaris");
  });

  test("rejects invalid plugin IDs", () => {
    expect(() => resolvePluginOptions(parseArgs(["notes", "--id", "Bad_ID"]))).toThrow(
      "Plugin ID must be"
    );
  });
});

describe("scaffoldPlugin", () => {
  test("copies and customizes template", async () => {
    const root = await temporaryDirectory();
    const target = join(root, "acme-notes");
    const options = resolvePluginOptions(
      parseArgs([target, "--id", "acme.notes", "--name", "Acme Notes", "--developer", "Acme"])
    );

    await scaffoldPlugin(options);

    const manifest = JSON.parse(await readFile(join(target, "plugin.json"), "utf8"));
    expect(manifest).toMatchObject({
      developer: "Acme",
      id: "acme.notes",
      name: "Acme Notes",
      modifications: [{ id: "acme.notes", type: "workspace-panel" }],
    });
    expect(await readFile(join(target, "src/index.tsx"), "utf8")).toContain('id: "acme.notes"');
    const packageJson = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    expect(packageJson.scripts.build).toBe("bunx --bun vite build");
    expect(await readFile(join(target, "README.md"), "utf8")).toStartWith("# Acme Notes");
  });

  test("escapes metadata inserted into TypeScript", async () => {
    const root = await temporaryDirectory();
    const target = join(root, "quoted-name");
    const options = resolvePluginOptions(
      parseArgs([target, "--id", "acme.quoted", "--name", 'Writer "Pro"'])
    );

    await scaffoldPlugin(options);

    expect(await readFile(join(target, "src/index.tsx"), "utf8")).toContain(
      'name: "Writer \\"Pro\\""'
    );
  });

  test("refuses a non-empty target", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "keep.txt"), "keep");
    const options = resolvePluginOptions(parseArgs([root, "--id", "acme.notes"]));

    await expect(scaffoldPlugin(options)).rejects.toThrow("Target directory is not empty");
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
  });
});
