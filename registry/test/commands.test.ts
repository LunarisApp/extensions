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
  description: "A calendar plugin",
  developer: "Example",
  version: "1.0.0",
  sdk: "^0.0.1",
  modifications: [{ id: "example.calendar", type: "workspace-panel" }],
};

afterEach(removeTemporaryDirectories);

describe("registry command validation", () => {
  test("rejects staged builds with no script", async () => {
    const root = await makeTemporaryDirectory();
    const dist = path.join(root, "dist");
    await mkdir(dist);
    await writeFile(path.join(dist, "plugin.json"), JSON.stringify(manifest));
    const result = await runScript(
      path.join(registryDirectory, "stage-build.ts"),
      root,
      {
        PLUGIN_DIST: dist,
        PLUGIN_EXPECTED_ID: manifest.id,
        PLUGIN_EXPECTED_VERSION: manifest.version,
        PLUGIN_REPOSITORY: "example/calendar",
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("main.js");
  });

  test("rejects duplicate curated and community IDs", async () => {
    const root = await makeTemporaryDirectory();
    await mkdir(path.join(root, "registry"), { recursive: true });
    await mkdir(path.join(root, "plugins/calendar"), { recursive: true });
    await writeFile(
      path.join(root, "registry/community-plugins.json"),
      JSON.stringify({
        plugins: [{ id: "example.calendar", repository: "community/calendar" }],
      }),
    );
    await writeFile(
      path.join(root, "plugins/calendar/plugin.json"),
      JSON.stringify(manifest),
    );
    const result = await runScript(
      path.join(registryDirectory, "discover-curated.ts"),
      root,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Duplicate curated/community plugin ID");
  });
});
