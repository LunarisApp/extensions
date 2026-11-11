import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateManifest } from "@lunarisapp/plugin-sdk";
import { releasePlan } from "./release-plan.ts";
import { verifyArtifact, verifyCatalog } from "./verify-artifacts.ts";

async function command(root: string, ...args: string[]) {
  const child = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${stderr}`);
  return stdout.trim();
}

// This only prepares local commits. The workflow owns the single fast-forward push.
export async function preparePublication(
  root: string,
  input: string,
  revision: string,
) {
  const git = (...args: string[]) => command(root, "git", ...args);
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    (await git("rev-parse", "HEAD")) !== revision
  ) {
    throw new Error("Publication must start at the validated source commit");
  }
  if (await git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error(
      "Publication requires a clean checkout (keep inputs ignored or outside it)",
    );
  }
  await verifyCatalog(root);
  const plan = await releasePlan(root);
  const pending = plan.include.filter((entry) => entry.publish);
  // Check every candidate before changing the tree; reject missing or extra payloads.
  const expected = pending
    .map((entry) => `${entry.id}/${entry.version}`)
    .sort();
  const actual: string[] = [];
  if (pending.length) {
    for (const id of await readdir(input)) {
      for (const version of await readdir(path.join(input, id)))
        actual.push(`${id}/${version}`);
    }
  }
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) {
    throw new Error(
      "Release payload does not match the validated source versions",
    );
  }
  for (const entry of pending) {
    const directory = path.join(input, entry.id, entry.version);
    const bytes = await verifyArtifact(directory, entry.id, entry.version);
    const source = JSON.parse(
      await readFile(path.join(root, entry.root, "manifest.json"), "utf8"),
    );
    if (
      !isDeepStrictEqual(
        validateManifest(JSON.parse(bytes.toString()).manifest),
        validateManifest(source),
      )
    ) {
      throw new Error(`Release manifest differs from source: ${entry.id}`);
    }
  }
  for (const entry of pending) {
    const destination = path.join(root, "artifacts", entry.id, entry.version);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(input, entry.id, entry.version), destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  if (pending.length) {
    await git("add", "--", "artifacts");
    await git(
      "commit",
      "-m",
      `chore: publish extension artifacts\n\nSource: ${revision}`,
    );
  }
  await command(
    root,
    process.execPath,
    path.join(import.meta.dir, "update-marketplace.ts"),
  );
  await verifyCatalog(root);
  if (await git("diff", "--", "marketplace.json")) {
    await git("add", "--", "marketplace.json");
    await git(
      "commit",
      "-m",
      `chore: update marketplace\n\nSource: ${revision}`,
    );
  }
  return await git("rev-parse", "HEAD");
}

if (import.meta.main) {
  const [input, revision] = process.argv.slice(2);
  if (!input || !revision)
    throw new Error(
      "Usage: bun registry/publish.ts <artifact-input-directory> <source-sha>",
    );
  console.log(
    await preparePublication(process.cwd(), path.resolve(input), revision),
  );
}
