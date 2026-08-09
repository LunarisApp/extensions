import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePluginCatalog } from "@lunarisapp/plugin-sdk/catalog";
import { publishRegistry } from "../publish.ts";
import {
  makeTemporaryDirectory,
  removeTemporaryDirectories,
} from "./helpers.ts";

afterEach(removeTemporaryDirectories);

const manifest = {
  id: "example.calendar",
  name: "Calendar",
  description: "A calendar plugin",
  developer: "Example",
  version: "1.0.0",
  sdk: "^0.0.1",
  modifications: [{ id: "example.calendar", type: "workspace-panel" as const }],
};

async function fixture() {
  const root = await makeTemporaryDirectory();
  const artifacts = path.join(root, "artifacts", "calendar");
  const site = path.join(root, "site");
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    path.join(root, "registry/policy.json"),
    `${JSON.stringify({ enabled: true, blockedVersions: [] })}\n`,
  );
  await writeFile(
    path.join(artifacts, "plugin.json"),
    JSON.stringify(manifest),
  );
  await writeFile(path.join(artifacts, "main.js"), "plugin source\n");
  await writeFile(
    path.join(artifacts, "registry-release.json"),
    JSON.stringify({
      id: manifest.id,
      repository: "example/calendar",
      version: manifest.version,
    }),
  );
  return { artifacts: path.join(root, "artifacts"), root, site };
}

async function catalog(site: string) {
  return parsePluginCatalog(
    JSON.parse(await readFile(path.join(site, "catalog-v1.json"), "utf8")),
  );
}

describe("registry publication", () => {
  test("publishes content-addressed assets and custom-domain URLs", async () => {
    const value = await fixture();
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });

    const published = await catalog(value.site);
    expect(published.plugins).toHaveLength(1);
    expect(published.plugins[0]?.versions[0]?.descriptorUrl).toBe(
      "https://plugins.lunaris.app/releases/example.calendar/1.0.0.json",
    );
    const descriptor = JSON.parse(
      await readFile(
        path.join(value.site, "releases/example.calendar/1.0.0.json"),
        "utf8",
      ),
    );
    expect(descriptor.script.url).toMatch(
      /^https:\/\/plugins\.lunaris\.app\/artifacts\/example\.calendar\/1\.0\.0\/[a-f0-9]{64}\/main\.js$/,
    );
  });

  test("is idempotent for an identical build", async () => {
    const value = await fixture();
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    const before = await readFile(
      path.join(value.site, "catalog-v1.json"),
      "utf8",
    );
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    expect(
      await readFile(path.join(value.site, "catalog-v1.json"), "utf8"),
    ).toBe(before);
  });

  test("orders published versions by semantic version", async () => {
    const value = await fixture();
    const newer = path.join(value.artifacts, "calendar-newer");
    await mkdir(newer, { recursive: true });
    await writeFile(
      path.join(newer, "plugin.json"),
      JSON.stringify({ ...manifest, version: "1.10.0" }),
    );
    await writeFile(path.join(newer, "main.js"), "newer plugin source\n");
    await writeFile(
      path.join(newer, "registry-release.json"),
      JSON.stringify({
        id: manifest.id,
        repository: "example/calendar",
        version: "1.10.0",
      }),
    );
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    const published = await catalog(value.site);
    expect(
      published.plugins[0]?.versions.map((value) => value.version),
    ).toEqual(["1.10.0", "1.0.0"]);
    expect(published.plugins[0]?.latestVersion).toBe("1.10.0");
  });

  test("rejects changed bytes without a version bump", async () => {
    const value = await fixture();
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    await writeFile(
      path.join(value.artifacts, "calendar/main.js"),
      "different plugin source\n",
    );
    await expect(
      publishRegistry({
        artifacts: value.artifacts,
        repositoryRoot: value.root,
        site: value.site,
      }),
    ).rejects.toThrow("Immutable registry file changed");
  });

  test("blocks a published version through the mutable catalog", async () => {
    const value = await fixture();
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    await writeFile(
      path.join(value.root, "registry/policy.json"),
      `${JSON.stringify({
        enabled: true,
        blockedVersions: ["example.calendar@1.0.0"],
      })}\n`,
    );
    await publishRegistry({
      artifacts: path.join(value.root, "no-new-artifacts"),
      repositoryRoot: value.root,
      site: value.site,
    });
    expect((await catalog(value.site)).plugins[0]?.versions[0]?.status).toBe(
      "blocked",
    );
  });

  test("does not publish audit-flagged builds without approval", async () => {
    const value = await fixture();
    await writeFile(
      path.join(value.artifacts, "calendar/registry-audit-flagged"),
      "",
    );
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    expect((await catalog(value.site)).plugins).toEqual([]);
  });
});
