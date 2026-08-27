import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";

const EXCLUDED_TEMPLATE_ENTRIES = new Set(["dist", "node_modules"]);

export async function copyTemplateFiles(
  sourceDirectory: string,
  destinationDirectory: string
): Promise<void> {
  for (const entry of await readdir(sourceDirectory)) {
    if (EXCLUDED_TEMPLATE_ENTRIES.has(entry)) continue;
    await cp(join(sourceDirectory, entry), join(destinationDirectory, entry), {
      errorOnExist: true,
      force: false,
      recursive: true,
    });
  }
}
