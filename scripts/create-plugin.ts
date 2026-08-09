#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.1.0";
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
const MAX_PLUGIN_ID_LENGTH = 50;

const HELP = `Create a Lunaris plugin

Usage:
  create-plugin <directory> [options]

Options:
  --id <id>                    Plugin ID (default: directory slug)
  --name <name>                Display name (default: title-cased slug)
  --developer <developer>      Developer or organization (default: Your Name)
  --description <description>  Plugin description
  -h, --help                   Show help
  -v, --version                Show version

Example:
  npx @lunarisapp/create-plugin notes --id acme.notes --developer Acme
`;

interface CliOptions {
  description?: string;
  developer?: string;
  directory?: string;
  help: boolean;
  id?: string;
  name?: string;
  version: boolean;
}

interface PluginOptions {
  description: string;
  developer: string;
  directory: string;
  id: string;
  name: string;
  slug: string;
}

type JsonObject = Record<string, unknown>;

export function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { help: false, version: false };
  const positionals: string[] = [];
  const valueOptions = new Set(["--description", "--developer", "--id", "--name"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;

    if (argument === "-h" || argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument === "-v" || argument === "--version") {
      options.version = true;
      continue;
    }
    if (argument === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }

    const equalsIndex = argument.indexOf("=");
    const optionName = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (valueOptions.has(optionName)) {
      const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
      const value = inlineValue ?? args[index + 1];
      if (!value || (inlineValue === undefined && value.startsWith("-"))) {
        throw new Error(`${optionName} requires a value`);
      }
      if (inlineValue === undefined) index += 1;
      options[optionName.slice(2) as "description" | "developer" | "id" | "name"] = value;
      continue;
    }

    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positionals.push(argument);
  }

  if (positionals.length > 1) throw new Error("Provide exactly one target directory");
  options.directory = positionals[0];
  return options;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function quoteForShell(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function resolvePluginOptions(options: CliOptions): PluginOptions {
  if (!options.directory) throw new Error("Missing target directory");

  const directory = resolve(options.directory);
  const slug = slugify(basename(directory));
  if (!slug) throw new Error("Target directory must contain letters or numbers");

  const id = options.id?.trim() || slug;
  if (!PLUGIN_ID_PATTERN.test(id) || id.length > MAX_PLUGIN_ID_LENGTH) {
    throw new Error(
      `Plugin ID must be at most ${MAX_PLUGIN_ID_LENGTH} characters using lowercase dotted or kebab segments`
    );
  }

  const name = options.name?.trim() || titleCase(slug);
  const developer = options.developer?.trim() || "Your Name";
  const description = options.description?.trim() || `${name} plugin for Lunaris`;
  if (!name || !developer || !description) throw new Error("Plugin metadata must not be empty");

  return { description, developer, directory, id, name, slug };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function copyTemplate(templateDirectory: string, targetDirectory: string): Promise<void> {
  if (await pathExists(targetDirectory)) {
    const target = await lstat(targetDirectory);
    if (target.isSymbolicLink()) throw new Error("Target directory must not be a symbolic link");
    if (!target.isDirectory()) throw new Error("Target path must be a directory");
    if ((await readdir(targetDirectory)).length > 0) {
      throw new Error(`Target directory is not empty: ${targetDirectory}`);
    }
  } else {
    await mkdir(targetDirectory, { recursive: true });
  }

  for (const entry of await readdir(templateDirectory)) {
    await cp(join(templateDirectory, entry), join(targetDirectory, entry), {
      errorOnExist: true,
      force: false,
      recursive: true,
    });
  }
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

async function writeJson(path: string, value: JsonObject): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function scaffoldPlugin(
  options: PluginOptions,
  templateDirectory = fileURLToPath(new URL("../templates/plugin", import.meta.url))
): Promise<void> {
  if (!(await pathExists(templateDirectory))) {
    throw new Error(`Bundled plugin template not found: ${templateDirectory}`);
  }

  await mkdir(dirname(options.directory), { recursive: true });
  await copyTemplate(templateDirectory, options.directory);

  const manifestPath = join(options.directory, "plugin.json");
  const manifest = await readJson(manifestPath);
  manifest.id = options.id;
  manifest.name = options.name;
  manifest.description = options.description;
  manifest.developer = options.developer;
  manifest.modifications = [{ id: options.id, type: "workspace-panel" }];
  await writeJson(manifestPath, manifest);

  const packagePath = join(options.directory, "package.json");
  const packageJson = await readJson(packagePath);
  packageJson.name = `lunaris-plugin-${options.slug}`;
  await writeJson(packagePath, packageJson);

  const sourcePath = join(options.directory, "src/index.tsx");
  const source = await readFile(sourcePath, "utf8");
  await writeFile(
    sourcePath,
    source
      .replaceAll('"example.notes"', JSON.stringify(options.id))
      .replaceAll('"Example Notes"', JSON.stringify(options.name))
  );

  const readmePath = join(options.directory, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme
      .replace("# Example Lunaris plugin", `# ${options.name}`)
      .replace(
        "1. Replace example metadata and implementation.",
        `1. Edit \`src/index.tsx\` to implement ${options.name}.`
      )
  );
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const cliOptions = parseArgs(args);
  if (cliOptions.help) {
    process.stdout.write(HELP);
    return;
  }
  if (cliOptions.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const pluginOptions = resolvePluginOptions(cliOptions);
  await scaffoldPlugin(pluginOptions);
  process.stdout.write(`Created ${pluginOptions.name} in ${pluginOptions.directory}\n\n`);
  process.stdout.write(
    `Next:\n  cd ${quoteForShell(pluginOptions.directory)}\n  bun install\n  bun run build\n`
  );
}

const isEntryPoint = process.argv[1]
  ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  : false;

if (isEntryPoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
