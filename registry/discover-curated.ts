import { readCuratedExtensions } from "./curated.ts";

const include = (await readCuratedExtensions()).map((extension) => ({
  ...extension,
  repository: "LunarisApp/extensions",
}));
process.stdout.write(JSON.stringify({ include }));
