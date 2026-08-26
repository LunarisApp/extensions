import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectories: string[] = [];
const script = path.join(import.meta.dir, "update-marketplace.ts");

async function fixture(blockedVersions: string[] = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lunaris-marketplace-"));
  temporaryDirectories.push(root);
  const fragments = path.join(root, "fragments");
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(fragments);
  await writeFile(
    path.join(root, "marketplace.json"),
    `${JSON.stringify(
      {
        displayName: "Test Extensions",
        enabled: true,
        extensions: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
        name: "test",
        schemaVersion: 1,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(root, "registry/policy.json"),
    `${JSON.stringify({ blockedVersions, enabled: true }, null, 2)}\n`,
  );
  return { fragments, root };
}

function descriptor(version: string) {
  return {
    api: "^0.4.0",
    icon: {
      bytes: 1,
      resource: "image/png",
      sha256: "b".repeat(64),
      url: "./icon.png",
    },
    manifest: {
      api: "^0.4.0",
      description: `Release ${version}`,
      developer: "Test Publisher",
      id: "test.extension",
      name: "Test Extension",
      permissions: [],
      version,
    },
    repository: "https://github.com/example/extensions",
    runtime: { kind: "iframe", protocol: 2 },
    status: "active",
  };
}

async function writeFragment(
  fragments: string,
  version: string,
): Promise<unknown> {
  const release = descriptor(version);
  await writeFile(
    path.join(fragments, `${version}.json`),
    JSON.stringify({
      descriptor: release,
      descriptorUrl: `https://cdn.example/test.extension/${version}/release.json`,
    }),
  );
  return release;
}

async function update(root: string, fragments: string) {
  const subprocess = Bun.spawn([process.execPath, script], {
    cwd: root,
    env: { ...Bun.env, MARKETPLACE_FRAGMENTS_DIR: fragments },
    stderr: "pipe",
  });
  if ((await subprocess.exited) !== 0) {
    throw new Error(await new Response(subprocess.stderr).text());
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("update-marketplace", () => {
  it("pins descriptor bytes, keeps newest metadata, and applies block policy", async () => {
    const { fragments, root } = await fixture(["test.extension@1.1.0"]);
    await writeFragment(fragments, "1.0.0");
    const newest = await writeFragment(fragments, "1.1.0");

    await update(root, fragments);

    const marketplace = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    const entry = marketplace.extensions[0];
    expect(entry.latestVersion).toBe("1.0.0");
    expect(entry.description).toBe("Release 1.1.0");
    expect(entry.iconUrl).toBe(
      "https://cdn.example/test.extension/1.1.0/icon.png",
    );
    expect(
      entry.versions.map((release: { version: string }) => release.version),
    ).toEqual(["1.1.0", "1.0.0"]);
    expect(entry.versions[0].status).toBe("blocked");
    const expectedBytes = Buffer.from(`${JSON.stringify(newest, null, 2)}\n`);
    expect(entry.versions[0].descriptor.bytes).toBe(expectedBytes.byteLength);
    expect(entry.versions[0].descriptor.sha256).toBe(
      createHash("sha256").update(expectedBytes).digest("hex"),
    );

    const generatedAt = marketplace.generatedAt;
    await update(root, fragments);
    const unchanged = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    expect(unchanged.generatedAt).toBe(generatedAt);
  });

  it("rejects policy entries for unpublished artifacts", async () => {
    const { fragments, root } = await fixture(["missing.extension@1.0.0"]);
    await writeFragment(fragments, "1.0.0");

    await expect(update(root, fragments)).rejects.toThrow(
      "Policy blocks unpublished versions",
    );
  });
});
