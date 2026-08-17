import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCommunityExtensions, readRegistryPolicy } from "../config.ts";
import {
  makeTemporaryDirectory,
  removeTemporaryDirectories,
} from "./helpers.ts";

afterEach(removeTemporaryDirectories);

async function writeJson(root: string, filename: string, value: unknown) {
  await mkdir(path.join(root, "registry"), { recursive: true });
  await writeFile(
    path.join(root, "registry", filename),
    `${JSON.stringify(value)}\n`,
  );
}

describe("registry configuration", () => {
  test("reads reviewed community repositories", async () => {
    const root = await makeTemporaryDirectory();
    await writeJson(root, "community-extensions.json", {
      extensions: [{ id: "example.calendar", repository: "example/calendar" }],
    });
    expect(await readCommunityExtensions(root)).toEqual([
      { id: "example.calendar", repository: "example/calendar" },
    ]);
  });

  test("rejects duplicate community IDs", async () => {
    const root = await makeTemporaryDirectory();
    await writeJson(root, "community-extensions.json", {
      extensions: [
        { id: "example.calendar", repository: "example/one" },
        { id: "example.calendar", repository: "example/two" },
      ],
    });
    await expect(readCommunityExtensions(root)).rejects.toThrow("Duplicate");
  });

  test("validates blocked extension versions", async () => {
    const root = await makeTemporaryDirectory();
    await writeJson(root, "policy.json", {
      enabled: false,
      blockedVersions: ["example.calendar@1.2.3"],
    });
    expect(await readRegistryPolicy(root)).toEqual({
      enabled: false,
      blockedVersions: ["example.calendar@1.2.3"],
    });
  });
});
