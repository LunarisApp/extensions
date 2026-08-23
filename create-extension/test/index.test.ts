import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, resolveExtensionOptions, scaffoldExtension } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lunaris-create-extension-"));
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

describe("resolveExtensionOptions", () => {
  test("derives safe defaults from directory", () => {
    const options = resolveExtensionOptions(parseArgs(["my-cool-extension"]));
    expect(options.id).toBe("my-cool-extension");
    expect(options.name).toBe("My Cool Extension");
    expect(options.description).toBe("My Cool Extension extension for Lunaris");
  });

  test("rejects invalid extension IDs", () => {
    expect(() => resolveExtensionOptions(parseArgs(["notes", "--id", "Bad_ID"]))).toThrow(
      "Extension ID must be"
    );
  });
});

describe("scaffoldExtension", () => {
  test("copies and customizes template", async () => {
    const root = await temporaryDirectory();
    const target = join(root, "acme-notes");
    const options = resolveExtensionOptions(
      parseArgs([target, "--id", "acme.notes", "--name", "Acme Notes", "--developer", "Acme"])
    );

    await scaffoldExtension(options);

    const manifestText = await readFile(join(target, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestText);
    expect(manifest).toMatchObject({
      developer: "Acme",
      id: "acme.notes",
      name: "Acme Notes",
      contributions: [
        {
          defaultPlacement: "primary",
          id: "acme.notes",
          name: "Acme Notes",
          type: "view",
        },
      ],
    });
    expect(manifestText).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(await readFile(join(target, "src/index.tsx"), "utf8")).toContain('id: "acme.notes"');
    const packageJson = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    expect(packageJson.name).toBe("lunaris-extension-acme-notes");
    expect(packageJson.scripts.build).toBe("bunx --bun vite build");
    expect(await readFile(join(target, "README.md"), "utf8")).toStartWith("# Acme Notes");
    expect(await Bun.file(join(target, "plugin.json")).exists()).toBe(false);
  });

  test("escapes metadata inserted into TypeScript", async () => {
    const root = await temporaryDirectory();
    const target = join(root, "quoted-name");
    const options = resolveExtensionOptions(
      parseArgs([target, "--id", "acme.quoted", "--name", 'Writer "Pro"'])
    );

    await scaffoldExtension(options);

    expect(await readFile(join(target, "src/index.tsx"), "utf8")).toContain(
      'name: "Writer \\"Pro\\""'
    );
  });

  test("refuses a non-empty target", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "keep.txt"), "keep");
    const options = resolveExtensionOptions(parseArgs([root, "--id", "acme.notes"]));

    await expect(scaffoldExtension(options)).rejects.toThrow("Target directory is not empty");
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
  });
});
