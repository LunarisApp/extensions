import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { preparePublication } from "./publish.ts";
import { releasePlan } from "./release-plan.ts";
import { verifyCatalog } from "./verify-artifacts.ts";

const roots: string[] = [];
const manifest = {
  id: "test.extension",
  name: "Test",
  version: "1.0.0",
  api: "^0.9.0",
  description: "Test extension",
  developer: "Test",
  permissions: [],
};
async function json(filename: string, value: unknown) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}
async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(stderr);
  return stdout.trim();
}
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "lunaris-publish-"));
  roots.push(directory);
  const root = path.join(directory, "repo");
  const input = path.join(directory, "input");
  await mkdir(root);
  await mkdir(path.join(root, "artifacts"));
  await json(path.join(root, "registry/policy.json"), {
    enabled: true,
    blockedVersions: [],
  });
  await json(path.join(root, "registry/releases.json"), { paused: {} });
  await json(path.join(root, "marketplace.json"), {
    schemaVersion: 1,
    enabled: true,
    extensions: [],
  });
  await json(path.join(root, "extensions/test/manifest.json"), manifest);
  await json(path.join(root, "extensions/test/package.json"), {
    version: manifest.version,
  });
  await writeFile(path.join(root, "extensions/test/bun.lock"), "fixture");
  const bytes = Buffer.from("console.log('extension');\n");
  const artifact = path.join(input, manifest.id, manifest.version);
  await json(path.join(artifact, "release.json"), {
    manifest,
    api: manifest.api,
    repository: "https://github.com/LunarisApp/extensions",
    runtime: { kind: "iframe", protocol: 7 },
    status: "active",
    script: {
      url: "./main.js",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      resource: "text/javascript",
    },
  });
  await writeFile(path.join(artifact, "main.js"), bytes);
  await git(root, "init", "-b", "main");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "config", "user.name", "Test");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "source");
  return {
    root,
    input,
    artifact,
    revision: await git(root, "rev-parse", "HEAD"),
  };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("publishes in two commits, verifies byte pins, retries without commits", async () => {
  const { root, input, revision } = await fixture();
  expect((await releasePlan(root)).pending).toBe(1);
  const published = await preparePublication(root, input, revision);
  expect(await git(root, "rev-list", "--count", `${revision}..HEAD`)).toBe("2");
  const artifactRevision = await git(root, "rev-parse", "HEAD^");
  const index = JSON.parse(
    await readFile(path.join(root, "marketplace.json"), "utf8"),
  );
  expect(index.extensions[0].versions[0].descriptor.url).toContain(
    `/${artifactRevision}/artifacts/`,
  );
  await verifyCatalog(root);
  expect((await releasePlan(root)).pending).toBe(0);
  expect(await preparePublication(root, input, published)).toBe(published);
  expect(await git(root, "status", "--porcelain")).toBe("");
});

test("policy-only deployment blocks a version without replacing its pin", async () => {
  const { root, input, revision } = await fixture();
  await preparePublication(root, input, revision);
  const before = JSON.parse(
    await readFile(path.join(root, "marketplace.json"), "utf8"),
  );
  await json(path.join(root, "registry/policy.json"), {
    enabled: true,
    blockedVersions: ["test.extension@1.0.0"],
  });
  await git(root, "add", ".");
  await git(root, "commit", "-m", "block bad release");
  const source = await git(root, "rev-parse", "HEAD");
  await preparePublication(root, input, source);
  const after = JSON.parse(
    await readFile(path.join(root, "marketplace.json"), "utf8"),
  );
  expect(after.extensions[0].versions[0].status).toBe("blocked");
  expect(after.extensions[0].versions[0].descriptor).toEqual(
    before.extensions[0].versions[0].descriptor,
  );
  expect(await git(root, "rev-list", "--count", `${source}..HEAD`)).toBe("1");
});

test("all sources can be paused while publishing an emergency policy change", async () => {
  const { root, input, revision } = await fixture();
  await preparePublication(root, input, revision);
  await json(path.join(root, "registry/releases.json"), {
    paused: { "test.extension": "Build dependency unavailable" },
  });
  await rm(path.join(root, "extensions/test/bun.lock"));
  await json(path.join(root, "registry/policy.json"), {
    enabled: false,
    blockedVersions: ["test.extension@1.0.0"],
  });
  expect((await releasePlan(root)).include).toEqual([]);
  expect((await releasePlan(root)).pending).toBe(0);
  await git(root, "add", ".");
  await git(root, "commit", "-m", "pause builds and disable marketplace");
  const source = await git(root, "rev-parse", "HEAD");
  await rm(input, { recursive: true });
  await preparePublication(root, input, source);
  const catalog = JSON.parse(
    await readFile(path.join(root, "marketplace.json"), "utf8"),
  );
  expect(catalog.enabled).toBe(false);
  expect(catalog.extensions[0].versions[0].status).toBe("blocked");
  expect(await git(root, "rev-list", "--count", `${source}..HEAD`)).toBe("1");
});

test("catalog verification rejects mutable and misdirected descriptor URLs", async () => {
  const { root, input, revision } = await fixture();
  await preparePublication(root, input, revision);
  const catalogPath = path.join(root, "marketplace.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const pin = catalog.extensions[0].versions[0].descriptor;
  const url: string = pin.url;
  const artifactRevision = await git(root, "rev-parse", "HEAD^");
  for (const invalid of [
    url.replace(artifactRevision, "main"),
    url.replace("LunarisApp/extensions", "other/extensions"),
    url.replace("/1.0.0/", "/2.0.0/"),
    url.replace("raw.githubusercontent.com", "example.com"),
    `${url}?ref=main`,
    `${url}#fragment`,
  ]) {
    pin.url = invalid;
    await json(catalogPath, catalog);
    await expect(verifyCatalog(root)).rejects.toThrow(
      "Invalid commit-pinned descriptor URL",
    );
  }
  pin.url = url;
  await json(catalogPath, catalog);
  await verifyCatalog(root);
});

test("rejects corrupted assets before writing artifacts or commits", async () => {
  const { root, input, artifact, revision } = await fixture();
  await writeFile(path.join(artifact, "main.js"), "corrupt");
  await expect(preparePublication(root, input, revision)).rejects.toThrow(
    "Integrity mismatch",
  );
  expect(await git(root, "rev-parse", "HEAD")).toBe(revision);
  expect(await git(root, "status", "--porcelain")).toBe("");
});

test("rejects missing payloads, wrong source, and dirty checkout", async () => {
  const { root, input, artifact, revision } = await fixture();
  await expect(preparePublication(root, input, "a".repeat(40))).rejects.toThrow(
    "validated source",
  );
  await writeFile(path.join(root, "unexpected"), "dirty");
  await expect(preparePublication(root, input, revision)).rejects.toThrow(
    "clean checkout",
  );
  await rm(path.join(root, "unexpected"));
  await rm(artifact, { recursive: true });
  await expect(preparePublication(root, input, revision)).rejects.toThrow(
    "payload does not match",
  );
});

test("requires matching package version and lockfile for enabled sources", async () => {
  const { root } = await fixture();
  await json(path.join(root, "extensions/test/package.json"), {
    version: "1.1.0",
  });
  await expect(releasePlan(root)).rejects.toThrow("versions differ");
  await json(path.join(root, "extensions/test/package.json"), {
    version: "1.0.0",
  });
  await rm(path.join(root, "extensions/test/bun.lock"));
  await expect(releasePlan(root)).rejects.toThrow("ENOENT");
});

test("explicit pause excludes candidates; typo and empty reasons fail", async () => {
  const { root } = await fixture();
  await json(path.join(root, "extensions/candidate/manifest.json"), {
    ...manifest,
    id: "test.candidate",
  });
  await json(path.join(root, "registry/releases.json"), {
    paused: { "test.candidate": "Awaiting SDK" },
  });
  expect((await releasePlan(root)).include.map((entry) => entry.id)).toEqual([
    "test.extension",
  ]);
  await json(path.join(root, "registry/releases.json"), {
    paused: { typo: "Awaiting SDK" },
  });
  await expect(releasePlan(root)).rejects.toThrow("Unknown paused");
  await json(path.join(root, "registry/releases.json"), {
    paused: { "test.candidate": "" },
  });
  await expect(releasePlan(root)).rejects.toThrow("requires a reason");
});

test("unpublished versions must be newer than every existing artifact", async () => {
  const { root, input, revision } = await fixture();
  await preparePublication(root, input, revision);
  await json(path.join(root, "extensions/test/manifest.json"), {
    ...manifest,
    version: "0.9.0",
  });
  await json(path.join(root, "extensions/test/package.json"), {
    version: "0.9.0",
  });
  await expect(releasePlan(root)).rejects.toThrow("must increase");
});

test("fast-forward push rejects a concurrent main update without losing it", async () => {
  const { root, input, revision } = await fixture();
  const remote = path.join(path.dirname(root), "remote.git");
  await git(root, "init", "--bare", remote);
  await git(root, "remote", "add", "origin", remote);
  await git(root, "push", "origin", "main");
  await preparePublication(root, input, revision);
  const concurrent = await git(
    root,
    "commit-tree",
    `${revision}^{tree}`,
    "-p",
    revision,
    "-m",
    "concurrent source",
  );
  await git(root, "push", "origin", `${concurrent}:refs/heads/main`);
  await expect(
    git(root, "push", "origin", "HEAD:refs/heads/main"),
  ).rejects.toThrow();
  expect(await git(remote, "rev-parse", "main")).toBe(concurrent);
});

test("accepts SDK-normalized manifest ordering and rejects different metadata", async () => {
  const { root, input, artifact, revision } = await fixture();
  const descriptorPath = path.join(artifact, "release.json");
  const release = JSON.parse(await readFile(descriptorPath, "utf8"));
  release.manifest = {
    optionalDependencies: {},
    ...manifest,
    name: "Wrong source",
  };
  await json(descriptorPath, release);
  await expect(preparePublication(root, input, revision)).rejects.toThrow(
    "differs from source",
  );
  release.manifest.name = manifest.name;
  await json(descriptorPath, release);
  await preparePublication(root, input, revision);
  await verifyCatalog(root);
});
