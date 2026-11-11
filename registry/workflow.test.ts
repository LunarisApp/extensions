import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workflow = Bun.YAML.parse(
  await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  ),
) as { jobs: { ci: { steps: Array<{ run: string }> } } };
const gate = workflow.jobs.ci.steps[0];
if (!gate) throw new Error("Missing aggregate CI gate");

test.each([
  ["success", "success", "success", "4", true],
  ["success", "success", "skipped", "0", true],
  ["failure", "success", "success", "4", false],
  ["success", "failure", "success", "4", false],
  ["success", "success", "failure", "4", false],
  ["success", "success", "cancelled", "4", false],
  ["success", "success", "skipped", "4", false],
  ["failure", "success", "skipped", "0", false],
] as const)(
  "CI gate: registry=%s creator=%s extensions=%s enabled=%s",
  async (registry, creator, extensions, enabled, allowed) => {
    const child = Bun.spawn(["bash", "-e", "-o", "pipefail", "-c", gate.run], {
      env: {
        ...Bun.env,
        REGISTRY: registry,
        CREATOR: creator,
        EXTENSIONS: extensions,
        ENABLED: enabled,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect((await child.exited) === 0).toBe(allowed);
  },
);
