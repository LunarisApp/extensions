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
    api: "^0.7.0",
    icon: {
      bytes: 1,
      resource: "image/png",
      sha256: "b".repeat(64),
      url: "./icon.png",
    },
    manifest: {
      api: "^0.7.0",
      description: `Release ${version}`,
      developer: "Test Publisher",
      id: "test.extension",
      keywords: ["test", "extension"],
      name: "Test Extension",
      permissions: [],
      version,
      website: "https://example.com/extensions/test",
    },
    repository: "https://github.com/example/extensions",
    runtime: { kind: "iframe", protocol: 6 },
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

async function update(root: string, fragments?: string, overwrite = false) {
  const env = { ...Bun.env };
  if (fragments) {
    env.MARKETPLACE_FRAGMENTS_DIR = fragments;
  } else {
    delete env.MARKETPLACE_FRAGMENTS_DIR;
  }
  delete env.MARKETPLACE_ARTIFACT_REVISION;
  delete env.MARKETPLACE_REPOSITORY;
  const subprocess = Bun.spawn(
    [process.execPath, script, ...(overwrite ? ["--overwrite"] : [])],
    {
      cwd: root,
      env,
      stderr: "pipe",
    },
  );
  if ((await subprocess.exited) !== 0) {
    throw new Error(await new Response(subprocess.stderr).text());
  }
}

async function git(root: string, ...args: string[]): Promise<string> {
  const subprocess = Bun.spawn(
    [
      "git",
      "-c",
      "user.name=Lunaris Tests",
      "-c",
      "user.email=tests@lunaris.app",
      ...args,
    ],
    { cwd: root, stderr: "pipe", stdout: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr);
  return stdout.trim();
}

async function writeArtifact(root: string, version: string): Promise<void> {
  const directory = path.join(root, "artifacts/test.extension", version);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "release.json"),
    `${JSON.stringify(descriptor(version), null, 2)}\n`,
  );
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
    expect(entry.homepageUrl).toBe("https://example.com/extensions/test");
    expect(entry.keywords).toEqual(["test", "extension"]);
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

  it("links curated extensions to their source folders", async () => {
    const { fragments, root } = await fixture();
    const sourceRoot = path.join(root, "extensions/test-source");
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      path.join(sourceRoot, "manifest.json"),
      `${JSON.stringify(descriptor("1.0.0").manifest, null, 2)}\n`,
    );
    await writeFragment(fragments, "1.0.0");

    await update(root, fragments);

    const marketplace = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    expect(marketplace.extensions[0].repository).toBe(
      "https://github.com/example/extensions/tree/main/extensions/test-source",
    );
  });

  it("rejects policy entries for unpublished artifacts", async () => {
    const { fragments, root } = await fixture(["missing.extension@1.0.0"]);
    await writeFragment(fragments, "1.0.0");

    await expect(update(root, fragments)).rejects.toThrow(
      "Policy blocks unpublished versions",
    );
  });

  it("replaces descriptor pins only when explicitly requested", async () => {
    const { fragments, root } = await fixture();
    await writeFragment(fragments, "1.0.0");
    await update(root, fragments);
    const initial = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    const initialHash = initial.extensions[0].versions[0].descriptor.sha256;

    const replacement = descriptor("1.0.0");
    replacement.manifest.description = "Replacement release";
    await writeFile(
      path.join(fragments, "1.0.0.json"),
      JSON.stringify({
        descriptor: replacement,
        descriptorUrl:
          "https://cdn.example/test.extension/1.0.0/replacement.json",
      }),
    );

    await expect(update(root, fragments)).rejects.toThrow(
      "Published descriptor changed",
    );
    await update(root, fragments, true);

    const marketplace = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    const release = marketplace.extensions[0].versions[0];
    expect(release.descriptor.sha256).not.toBe(initialHash);
    expect(release.descriptor.url).toEndWith("replacement.json");
    expect(marketplace.extensions[0].description).toBe("Replacement release");
  });

  it("pins each artifact to the commit that introduced it", async () => {
    const { root } = await fixture();
    await git(root, "init");
    await writeArtifact(root, "1.0.0");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "publish 1.0.0");
    const firstRevision = await git(root, "rev-parse", "HEAD");

    await update(root);
    await git(root, "add", "marketplace.json");
    await git(root, "commit", "-m", "update marketplace");
    await writeArtifact(root, "1.1.0");
    await git(root, "add", "artifacts");
    await git(root, "commit", "-m", "publish 1.1.0");
    const secondRevision = await git(root, "rev-parse", "HEAD");

    await update(root);

    const marketplace = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    const versions = marketplace.extensions[0].versions;
    expect(versions[0].descriptor.url).toContain(secondRevision);
    expect(versions[1].descriptor.url).toContain(firstRevision);
  });

  it("pins an overwritten artifact to its replacement commit", async () => {
    const { root } = await fixture();
    await git(root, "init");
    await writeArtifact(root, "1.0.0");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "publish 1.0.0");

    await update(root);
    await git(root, "add", "marketplace.json");
    await git(root, "commit", "-m", "update marketplace");

    const replacement = descriptor("1.0.0");
    replacement.manifest.description = "Replacement release";
    await writeFile(
      path.join(root, "artifacts/test.extension/1.0.0/release.json"),
      `${JSON.stringify(replacement, null, 2)}\n`,
    );
    await git(root, "add", "artifacts");
    await git(root, "commit", "-m", "replace 1.0.0");
    const replacementRevision = await git(root, "rev-parse", "HEAD");

    await update(root, undefined, true);

    const marketplace = JSON.parse(
      await readFile(path.join(root, "marketplace.json"), "utf8"),
    );
    expect(marketplace.extensions[0].versions[0].descriptor.url).toContain(
      replacementRevision,
    );
  });
});
