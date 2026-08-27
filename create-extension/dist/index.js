#!/usr/bin/env node

// src/index.ts
import { realpathSync } from "node:fs";
import { lstat, mkdir, readdir as readdir2, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/template-files.ts
import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";
var EXCLUDED_TEMPLATE_ENTRIES = new Set(["dist", "node_modules"]);
async function copyTemplateFiles(sourceDirectory, destinationDirectory) {
  for (const entry of await readdir(sourceDirectory)) {
    if (EXCLUDED_TEMPLATE_ENTRIES.has(entry))
      continue;
    await cp(join(sourceDirectory, entry), join(destinationDirectory, entry), {
      errorOnExist: true,
      force: false,
      recursive: true
    });
  }
}

// src/index.ts
var VERSION = "0.4.1";
var EXTENSION_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
var MAX_EXTENSION_ID_LENGTH = 50;
var HELP = `Create a Lunaris extension

Usage:
  create-extension <directory> [options]

Options:
  --id <id>                    Extension ID (default: directory slug)
  --name <name>                Display name (default: title-cased slug)
  --developer <developer>      Developer or organization (default: Your Name)
  --description <description>  Extension description
  -h, --help                   Show help
  -v, --version                Show version

Example:
  npx @lunarisapp/create-extension notes --id acme.notes --developer Acme
`;
function parseArgs(args) {
  const options = { help: false, version: false };
  const positionals = [];
  const valueOptions = new Set(["--description", "--developer", "--id", "--name"]);
  for (let index = 0;index < args.length; index += 1) {
    const argument = args[index];
    if (!argument)
      continue;
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
      if (!value || inlineValue === undefined && value.startsWith("-")) {
        throw new Error(`${optionName} requires a value`);
      }
      if (inlineValue === undefined)
        index += 1;
      options[optionName.slice(2)] = value;
      continue;
    }
    if (argument.startsWith("-"))
      throw new Error(`Unknown option: ${argument}`);
    positionals.push(argument);
  }
  if (positionals.length > 1)
    throw new Error("Provide exactly one target directory");
  options.directory = positionals[0];
  return options;
}
function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function titleCase(slug) {
  return slug.split("-").filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}
function quoteForShell(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function resolveExtensionOptions(options) {
  if (!options.directory)
    throw new Error("Missing target directory");
  const directory = resolve(options.directory);
  const slug = slugify(basename(directory));
  if (!slug)
    throw new Error("Target directory must contain letters or numbers");
  const id = options.id?.trim() || slug;
  if (!EXTENSION_ID_PATTERN.test(id) || id.length > MAX_EXTENSION_ID_LENGTH) {
    throw new Error(`Extension ID must be at most ${MAX_EXTENSION_ID_LENGTH} characters using lowercase dotted or kebab segments`);
  }
  const name = options.name?.trim() || titleCase(slug);
  const developer = options.developer?.trim() || "Your Name";
  const description = options.description?.trim() || `${name} extension for Lunaris`;
  if (!name || !developer || !description)
    throw new Error("Extension metadata must not be empty");
  return { description, developer, directory, id, name, slug };
}
async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT")
      return false;
    throw error;
  }
}
async function copyTemplate(templateDirectory, targetDirectory) {
  if (await pathExists(targetDirectory)) {
    const target = await lstat(targetDirectory);
    if (target.isSymbolicLink())
      throw new Error("Target directory must not be a symbolic link");
    if (!target.isDirectory())
      throw new Error("Target path must be a directory");
    if ((await readdir2(targetDirectory)).length > 0) {
      throw new Error(`Target directory is not empty: ${targetDirectory}`);
    }
  } else {
    await mkdir(targetDirectory, { recursive: true });
  }
  await copyTemplateFiles(templateDirectory, targetDirectory);
}
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}
`);
}
async function findTemplateDirectory() {
  const candidates = [
    fileURLToPath(new URL("./template", import.meta.url)),
    fileURLToPath(new URL("../../template", import.meta.url))
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate))
      return candidate;
  }
  throw new Error("Bundled extension template not found");
}
async function scaffoldExtension(options, templateDirectory) {
  const resolvedTemplateDirectory = templateDirectory ?? await findTemplateDirectory();
  if (!await pathExists(resolvedTemplateDirectory)) {
    throw new Error(`Bundled extension template not found: ${resolvedTemplateDirectory}`);
  }
  await mkdir(dirname(options.directory), { recursive: true });
  await copyTemplate(resolvedTemplateDirectory, options.directory);
  const manifestPath = join2(options.directory, "manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.id = options.id;
  manifest.name = options.name;
  manifest.description = options.description;
  manifest.developer = options.developer;
  await writeJson(manifestPath, manifest);
  const packagePath = join2(options.directory, "package.json");
  const packageJson = await readJson(packagePath);
  packageJson.name = `lunaris-extension-${options.slug}`;
  await writeJson(packagePath, packageJson);
  const sourcePath = join2(options.directory, "src/index.tsx");
  const source = await readFile(sourcePath, "utf8");
  await writeFile(sourcePath, source.replaceAll('"example.notes"', JSON.stringify(options.id)).replaceAll('"Example Notes"', JSON.stringify(options.name)));
  const readmePath = join2(options.directory, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readme.replace("# Example Lunaris extension", `# ${options.name}`).replace("1. Replace example metadata and implementation.", `1. Edit \`src/index.tsx\` to implement ${options.name}.`));
}
async function main(args = process.argv.slice(2)) {
  const cliOptions = parseArgs(args);
  if (cliOptions.help) {
    process.stdout.write(HELP);
    return;
  }
  if (cliOptions.version) {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  const extensionOptions = resolveExtensionOptions(cliOptions);
  await scaffoldExtension(extensionOptions);
  process.stdout.write(`Created ${extensionOptions.name} in ${extensionOptions.directory}

`);
  process.stdout.write(`Next:
  cd ${quoteForShell(extensionOptions.directory)}
  bun install
  bun run build
`);
}
var isEntryPoint = process.argv[1] ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) : false;
if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  });
}
export {
  scaffoldExtension,
  resolveExtensionOptions,
  parseArgs,
  main
};
