import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { copyTemplateFiles } from "../src/template-files.js";

const sourceDirectory = resolve(import.meta.dir, "../../template");
const destinationDirectory = resolve(import.meta.dir, "../dist/template");

await rm(destinationDirectory, { force: true, recursive: true });
await mkdir(destinationDirectory, { recursive: true });
await copyTemplateFiles(sourceDirectory, destinationDirectory);
