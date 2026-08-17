import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

const root = process.env.EXTENSION_ROOT;
const expectedId = process.env.EXTENSION_EXPECTED_ID;
const tag = process.env.EXTENSION_RELEASE_TAG;

if (!root || !expectedId || !tag) {
  throw new Error(
    "EXTENSION_ROOT, EXTENSION_EXPECTED_ID, and EXTENSION_RELEASE_TAG are required",
  );
}

export default defineLunarisPluginConfig({ expectedId, root, tag });
