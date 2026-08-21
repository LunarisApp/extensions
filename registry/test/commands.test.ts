import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  makeTemporaryDirectory,
  removeTemporaryDirectories,
} from "./helpers.ts";

const registryDirectory = path.resolve(import.meta.dir, "..");

async function runScript(
  script: string,
  cwd: string,
  environment: Record<string, string> = {},
) {
  const process = Bun.spawn([Bun.which("bun") ?? "bun", script], {
    cwd,
    env: { ...Bun.env, ...environment },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

const manifest = {
  id: "example.calendar",
  name: "Calendar",
  description: "A calendar extension",
  developer: "Example",
  version: "1.0.0",
  sdk: "^0.0.5",
  modifications: [
    {
      defaultPlacement: "primary",
      id: "example.calendar",
      name: "Calendar",
      type: "view",
    },
  ],
};

afterEach(removeTemporaryDirectories);

describe("registry command validation", () => {
  test("stages an extension without rewriting its manifest", async () => {
    const root = await makeTemporaryDirectory();
    const dist = path.join(root, "dist");
    await mkdir(dist);
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(path.join(dist, "manifest.json"), manifestText);
    await writeFile(path.join(dist, "main.js"), "extension source\n");
    const result = await runScript(
      path.join(registryDirectory, "stage-build.ts"),
      root,
      {
        EXTENSION_DIST: dist,
        EXTENSION_EXPECTED_ID: manifest.id,
        EXTENSION_EXPECTED_VERSION: manifest.version,
        EXTENSION_REPOSITORY: "example/calendar",
      },
    );
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(path.join(dist, "manifest.json")).text()).toBe(
      manifestText,
    );
    expect(
      JSON.parse(
        await Bun.file(path.join(dist, "registry-release.json")).text(),
      ),
    ).toEqual({
      id: manifest.id,
      repository: "example/calendar",
      version: manifest.version,
    });
  });

  test("rejects staged builds with no script", async () => {
    const root = await makeTemporaryDirectory();
    const dist = path.join(root, "dist");
    await mkdir(dist);
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(path.join(dist, "manifest.json"), manifestText);
    const result = await runScript(
      path.join(registryDirectory, "stage-build.ts"),
      root,
      {
        EXTENSION_DIST: dist,
        EXTENSION_EXPECTED_ID: manifest.id,
        EXTENSION_EXPECTED_VERSION: manifest.version,
        EXTENSION_REPOSITORY: "example/calendar",
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("main.js");
    expect(await Bun.file(path.join(dist, "manifest.json")).text()).toBe(
      manifestText,
    );
  });

  test("rejects staged builds with a legacy manifest", async () => {
    const root = await makeTemporaryDirectory();
    const dist = path.join(root, "dist");
    await mkdir(dist);
    await writeFile(path.join(dist, "plugin.json"), JSON.stringify(manifest));
    await writeFile(path.join(dist, "main.js"), "extension source\n");
    const result = await runScript(
      path.join(registryDirectory, "stage-build.ts"),
      root,
      {
        EXTENSION_DIST: dist,
        EXTENSION_REPOSITORY: "example/calendar",
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Legacy plugin.json is not supported");
  });

  test("rejects duplicate curated and community IDs", async () => {
    const root = await makeTemporaryDirectory();
    await mkdir(path.join(root, "registry"), { recursive: true });
    await mkdir(path.join(root, "extensions/calendar"), { recursive: true });
    await writeFile(
      path.join(root, "registry/community-extensions.json"),
      JSON.stringify({
        extensions: [
          { id: "example.calendar", repository: "community/calendar" },
        ],
      }),
    );
    await writeFile(
      path.join(root, "extensions/calendar/manifest.json"),
      JSON.stringify(manifest),
    );
    const result = await runScript(
      path.join(registryDirectory, "discover-curated.ts"),
      root,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Duplicate curated/community extension ID");
  });

  test("discovers curated manifests from extensions", async () => {
    const root = await makeTemporaryDirectory();
    await mkdir(path.join(root, "registry"), { recursive: true });
    await mkdir(path.join(root, "extensions/calendar"), { recursive: true });
    await writeFile(
      path.join(root, "registry/community-extensions.json"),
      JSON.stringify({ extensions: [] }),
    );
    await writeFile(
      path.join(root, "extensions/calendar/manifest.json"),
      JSON.stringify(manifest),
    );
    const result = await runScript(
      path.join(registryDirectory, "discover-curated.ts"),
      root,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      include: [
        {
          id: manifest.id,
          repository: "LunarisApp/plugins",
          root: "extensions/calendar",
          version: manifest.version,
        },
      ],
    });
  });
});
