import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PLUGIN_SANDBOX_PROTOCOL_VERSION } from "@lunarisapp/plugin-sdk";

const temporaryDirectories: string[] = [];
const script = path.join(import.meta.dir, "build-artifact.ts");
const webpIcon = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v0gUAA=",
  "base64",
);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lunaris-artifact-"));
  temporaryDirectories.push(root);
  const dist = path.join(root, "dist");
  const artifacts = path.join(root, "artifacts");
  await mkdir(dist);
  await writeFile(
    path.join(dist, "manifest.json"),
    `${JSON.stringify(
      {
        api: "^0.9.0",
        description: "A test extension",
        developer: "Test Publisher",
        id: "test.extension",
        name: "Test Extension",
        permissions: [],
        version: "1.0.0",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(path.join(dist, "main.js"), "export default true;\n");
  await writeFile(path.join(dist, "styles.css"), ":root {}\n");
  return { artifacts, dist };
}

async function build(
  dist: string,
  artifacts: string,
  checkOnly = false,
  overwrite = false,
): Promise<{ exitCode: number; stderr: string }> {
  const subprocess = Bun.spawn(
    [
      process.execPath,
      script,
      ...(checkOnly ? ["--check"] : []),
      ...(overwrite ? ["--overwrite"] : []),
    ],
    {
      env: {
        ...Bun.env,
        EXTENSION_ARTIFACTS_ROOT: artifacts,
        EXTENSION_DIST: dist,
        EXTENSION_EXPECTED_ID: "test.extension",
        EXTENSION_EXPECTED_VERSION: "1.0.0",
        EXTENSION_REPOSITORY: "example/extensions",
      },
      stderr: "pipe",
    },
  );
  return {
    exitCode: await subprocess.exited,
    stderr: await new Response(subprocess.stderr).text(),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("build-artifact", () => {
  it("writes relative, hash-pinned assets and verifies the build", async () => {
    const { artifacts, dist } = await fixture();
    await writeFile(path.join(dist, "icon.webp"), webpIcon);

    expect((await build(dist, artifacts)).exitCode).toBe(0);

    const destination = path.join(artifacts, "test.extension", "1.0.0");
    const descriptor = JSON.parse(
      await readFile(path.join(destination, "release.json"), "utf8"),
    );
    const script = await readFile(path.join(destination, "main.js"));
    expect(descriptor.script).toEqual({
      bytes: script.byteLength,
      resource: "text/javascript",
      sha256: createHash("sha256").update(script).digest("hex"),
      url: "./main.js",
    });
    expect(descriptor.style.url).toBe("./styles.css");
    expect(descriptor.icon).toEqual({
      bytes: webpIcon.byteLength,
      resource: "image/webp",
      sha256: createHash("sha256").update(webpIcon).digest("hex"),
      url: "./icon.webp",
    });
    expect(await readFile(path.join(destination, "icon.webp"))).toEqual(
      webpIcon,
    );
    expect(descriptor.api).toBe("^0.9.0");
    expect(descriptor.runtime).toEqual({
      kind: "iframe",
      protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
    });
    expect((await build(dist, artifacts, true)).exitCode).toBe(0);
  });

  it("refuses to overwrite an existing version", async () => {
    const { artifacts, dist } = await fixture();
    expect((await build(dist, artifacts)).exitCode).toBe(0);

    const second = await build(dist, artifacts);
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr).toContain("already exists; bump the version");
  });

  it("overwrites an existing version only when explicitly requested", async () => {
    const { artifacts, dist } = await fixture();
    expect((await build(dist, artifacts)).exitCode).toBe(0);
    await writeFile(path.join(dist, "main.js"), "export default false;\n");

    expect((await build(dist, artifacts, false, true)).exitCode).toBe(0);

    const destination = path.join(artifacts, "test.extension", "1.0.0");
    expect(await readFile(path.join(destination, "main.js"), "utf8")).toBe(
      "export default false;\n",
    );
    expect((await build(dist, artifacts, true)).exitCode).toBe(0);
  });
});
