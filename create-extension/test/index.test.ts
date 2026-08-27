import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      api: "^0.7.0",
      developer: "Acme",
      id: "acme.notes",
      name: "Acme Notes",
      permissions: [],
    });
    expect(manifest).not.toHaveProperty("sdk");
    expect(manifest).not.toHaveProperty("modifications");
    expect(manifest).not.toHaveProperty("contributions");
    expect(manifestText).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    const source = await readFile(join(target, "src/index.tsx"), "utf8");
    expect(source).toContain('viewId: "acme.notes"');
    expect(source).toContain('target: { kind: "standalone"');
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

  test("omits generated template directories", async () => {
    const root = await temporaryDirectory();
    const template = join(root, "template");
    await mkdir(join(template, "src"), { recursive: true });
    await mkdir(join(template, "dist"), { recursive: true });
    await mkdir(join(template, "node_modules"), { recursive: true });
    await writeFile(join(template, "README.md"), "# Example Lunaris extension\n");
    await writeFile(
      join(template, "manifest.json"),
      `${JSON.stringify({
        description: "Example",
        developer: "Example Developer",
        id: "example.notes",
        name: "Example Notes",
      })}\n`
    );
    await writeFile(join(template, "package.json"), '{"name":"example"}\n');
    await writeFile(
      join(template, "src/index.tsx"),
      'const id = "example.notes"; const name = "Example Notes";\n'
    );
    await writeFile(join(template, "dist/main.js"), "generated");
    await writeFile(join(template, "node_modules/dependency.js"), "generated");

    const target = join(root, "generated");
    const options = resolveExtensionOptions(parseArgs([target, "--id", "acme.notes"]));
    await scaffoldExtension(options, template);

    expect(await Bun.file(join(target, "dist/main.js")).exists()).toBe(false);
    expect(await Bun.file(join(target, "node_modules/dependency.js")).exists()).toBe(false);
  });

  test("refuses a non-empty target", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "keep.txt"), "keep");
    const options = resolveExtensionOptions(parseArgs([root, "--id", "acme.notes"]));

    await expect(scaffoldExtension(options)).rejects.toThrow("Target directory is not empty");
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
  });
});
