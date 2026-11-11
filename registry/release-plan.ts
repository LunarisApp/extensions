import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gt, valid } from "semver";
import { readCuratedExtensions } from "./curated.ts";

export async function releasePlan(root = process.cwd()) {
  const extensions = await readCuratedExtensions(root);
  const { paused } = JSON.parse(
    await readFile(path.join(root, "registry/releases.json"), "utf8"),
  ) as { paused: Record<string, string> };
  if (!paused || typeof paused !== "object" || Array.isArray(paused)) {
    throw new Error("releases.json must contain a paused object");
  }
  for (const [id, reason] of Object.entries(paused)) {
    if (!extensions.some((extension) => extension.id === id)) {
      throw new Error(`Unknown paused extension: ${id}`);
    }
    if (typeof reason !== "string" || !reason.trim()) {
      throw new Error(`Pause requires a reason: ${id}`);
    }
  }
  const include = [];
  for (const extension of extensions) {
    if (Object.hasOwn(paused, extension.id)) continue;
    const directory = path.join(root, extension.root);
    await readFile(path.join(directory, "bun.lock"));
    const pkg = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
    if (pkg.version !== extension.version) {
      throw new Error(`Package and manifest versions differ: ${extension.id}`);
    }
    let versions: string[];
    try {
      versions = await readdir(path.join(root, "artifacts", extension.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      versions = [];
    }
    const publish = !versions.includes(extension.version);
    if (versions.some((version) => !valid(version))) {
      throw new Error(`Invalid artifact version directory: ${extension.id}`);
    }
    if (
      publish &&
      versions.some((version) => !gt(extension.version, version))
    ) {
      throw new Error(
        `New version must increase: ${extension.id}@${extension.version}`,
      );
    }
    include.push({ ...extension, publish });
  }
  return {
    include,
    paused,
    pending: include.filter((entry) => entry.publish).length,
  };
}

if (import.meta.main) {
  const plan = await releasePlan();
  process.stdout.write(JSON.stringify({ include: plan.include }));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `matrix=${JSON.stringify({ include: plan.include })}\npending=${plan.pending}\nenabled=${plan.include.length}\n`,
    );
  }
  for (const [id, reason] of Object.entries(plan.paused)) {
    console.error(`Paused ${id}: ${reason}`);
  }
}
