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
  description: "A calendar extension",
  developer: "Example",
  version: "1.0.0",
  api: "^0.4.0",
  permissions: [],
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
    path.join(artifacts, "manifest.json"),
    JSON.stringify(manifest),
  );
  await writeFile(path.join(artifacts, "main.js"), "extension source\n");
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
    expect(descriptor.script.resource).toBe(
      "application/javascript; charset=utf-8",
    );
    expect(descriptor.api).toBe("^0.4.0");
    expect(descriptor.runtime).toEqual({ kind: "iframe", protocol: 2 });
    expect(published.plugins[0]?.versions[0]?.runtime).toEqual({
      kind: "iframe",
      protocol: 2,
    });
    expect(published.plugins[0]?.versions[0]?.api).toBe("^0.4.0");
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

  test("updates the registry landing page deterministically", async () => {
    const value = await fixture();
    await mkdir(value.site, { recursive: true });
    await writeFile(
      path.join(value.site, "index.html"),
      "<h1>Lunaris plugin registry</h1>\n",
    );
    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });
    expect(await readFile(path.join(value.site, "index.html"), "utf8")).toBe(
      '<!doctype html><meta charset="utf-8"><title>Lunaris extension registry</title><h1>Lunaris extension registry</h1><p><a href="/catalog-v1.json">Open the catalog</a></p>\n',
    );
  });

  test("rejects legacy manifests", async () => {
    const value = await fixture();
    const staged = path.join(value.artifacts, "calendar");
    await writeFile(path.join(staged, "plugin.json"), JSON.stringify(manifest));
    await expect(
      publishRegistry({
        artifacts: value.artifacts,
        repositoryRoot: value.root,
        site: value.site,
      }),
    ).rejects.toThrow("Legacy plugin.json is not supported");
  });

  test("orders published versions by semantic version", async () => {
    const value = await fixture();
    const newer = path.join(value.artifacts, "calendar-newer");
    await mkdir(newer, { recursive: true });
    await writeFile(
      path.join(newer, "manifest.json"),
      JSON.stringify({ ...manifest, version: "1.10.0" }),
    );
    await writeFile(path.join(newer, "main.js"), "newer extension source\n");
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

  test("omits recognized immutable protocol-1 descriptors from the rebuilt catalog", async () => {
    const value = await fixture();
    const releaseDirectory = path.join(value.site, "releases/example.calendar");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "0.9.0.json"),
      `${JSON.stringify({
        manifest: {
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          developer: manifest.developer,
          api: "^0.3.0",
          conflicts: {},
          contributions: [
            {
              defaultPlacement: "primary",
              id: manifest.id,
              name: manifest.name,
              type: "view",
            },
          ],
          dependencies: {},
          permissions: [],
          version: "0.9.0",
        },
        api: "^0.3.0",
        repository: "example/calendar",
        runtime: { kind: "iframe", protocol: 1 },
        script: {
          bytes: 1,
          contentType: "application/javascript; charset=utf-8",
          sha256: "0".repeat(64),
          url: "https://plugins.lunaris.app/legacy.js",
        },
        status: "active",
      })}\n`,
    );

    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });

    expect(
      (await catalog(value.site)).plugins[0]?.versions.map(
        (version) => version.version,
      ),
    ).toEqual(["1.0.0"]);
    expect(
      await Bun.file(path.join(releaseDirectory, "0.9.0.json")).exists(),
    ).toBe(true);
  });

  test("omits recognized immutable SDK-era protocol-1 descriptors", async () => {
    const value = await fixture();
    const releaseDirectory = path.join(value.site, "releases/example.calendar");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "0.8.0.json"),
      `${JSON.stringify({
        manifest: {
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          developer: manifest.developer,
          modifications: [],
          sdk: "^0.0.5",
          version: "0.8.0",
        },
        repository: "example/calendar",
        runtime: { kind: "iframe", protocol: 1 },
        script: {
          bytes: 1,
          contentType: "application/javascript; charset=utf-8",
          sha256: "0".repeat(64),
          url: "https://plugins.lunaris.app/legacy-sdk.js",
        },
        sdk: "^0.0.5",
        status: "active",
      })}\n`,
    );

    await publishRegistry({
      artifacts: value.artifacts,
      repositoryRoot: value.root,
      site: value.site,
    });

    expect(
      (await catalog(value.site)).plugins[0]?.versions.map(
        (version) => version.version,
      ),
    ).toEqual(["1.0.0"]);
    expect(
      await Bun.file(path.join(releaseDirectory, "0.8.0.json")).exists(),
    ).toBe(true);
  });

  test("rejects invalid stored descriptors", async () => {
    const value = await fixture();
    const releaseDirectory = path.join(value.site, "releases/example.calendar");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "0.9.0.json"),
      `${JSON.stringify(
        {
          manifest: { ...manifest, version: "0.9.0" },
          repository: "example/calendar",
          script: {
            bytes: 1,
            resource: "",
            sha256: "0".repeat(64),
            url: "https://plugins.lunaris.app/invalid.js",
          },
          api: manifest.api,
          runtime: { kind: "iframe", protocol: 2 },
          status: "active",
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      publishRegistry({
        artifacts: value.artifacts,
        repositoryRoot: value.root,
        site: value.site,
      }),
    ).rejects.toThrow("resource");
  });

  test("does not exclude malformed protocol-1 descriptors", async () => {
    const value = await fixture();
    const releaseDirectory = path.join(value.site, "releases/example.calendar");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "0.9.0.json"),
      `${JSON.stringify({
        api: "^0.3.0",
        manifest: {
          api: "^0.3.0",
          description: manifest.description,
          developer: manifest.developer,
          id: manifest.id,
          name: manifest.name,
          permissions: [],
          version: "0.9.0",
        },
        repository: "example/calendar",
        runtime: { kind: "iframe", protocol: 1 },
        script: {
          bytes: 1,
          contentType: "application/javascript; charset=utf-8",
          sha256: "0".repeat(64),
          url: "https://plugins.lunaris.app/malformed-legacy.js",
        },
        status: "active",
      })}\n`,
    );

    await expect(
      publishRegistry({
        artifacts: value.artifacts,
        repositoryRoot: value.root,
        site: value.site,
      }),
    ).rejects.toThrow("protocol");
  });

  test("rejects unknown stored sandbox protocols", async () => {
    const value = await fixture();
    const releaseDirectory = path.join(value.site, "releases/example.calendar");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "0.9.0.json"),
      `${JSON.stringify({
        api: manifest.api,
        manifest: { ...manifest, version: "0.9.0" },
        repository: "example/calendar",
        runtime: { kind: "iframe", protocol: 3 },
        script: {
          bytes: 1,
          resource: "application/javascript; charset=utf-8",
          sha256: "0".repeat(64),
          url: "https://plugins.lunaris.app/unknown.js",
        },
        status: "active",
      })}\n`,
    );

    await expect(
      publishRegistry({
        artifacts: value.artifacts,
        repositoryRoot: value.root,
        site: value.site,
      }),
    ).rejects.toThrow("protocol");
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
      "different extension source\n",
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
